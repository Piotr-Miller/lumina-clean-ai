import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ApiProvider, CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";

import {
  assignFindingIds,
  buildInstructions,
  buildPrompt,
  createDiffScopedReaderForDiff,
  createDiffScopedSourceForDiff,
  createReviewer,
  createVerifier,
  DEFAULT_FINDER_MAX_STEPS,
  DEFAULT_FINDER_TIMEOUT_MS,
  DEFAULT_VERIFIER_TIMEOUT_MS,
  describeFinderStep,
  lensSchema,
  mergeFindings,
  runVerificationPass,
  type DiffScopedReader,
  type Finding,
  type IdentifiedFinding,
  type Lens,
  type ReviewResult,
  type ReviewUnit,
  type SourceProvider,
  type VerificationBlock,
  withOneRetry,
} from "../src/index.js";

interface FinderProviderConfig {
  lens?: unknown;
  model?: unknown;
  verifier?: unknown;
}

/**
 * The verification arm a provider runs after the finder (change
 * `finder-verification`, plan.md Phase 2 §2): the verifier model and the
 * endpoints it is pinned to, as `OPENROUTER_VERIFIER_PROVIDERS` would pin them.
 */
export interface VerifierArmConfig {
  model: string;
  providers: string[];
}

const parseVerifierConfig = (raw: unknown): VerifierArmConfig | undefined => {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null) throw new Error("finder-provider config.verifier must be an object");
  const model: unknown = "model" in raw ? raw.model : undefined;
  const providers: unknown = "providers" in raw ? raw.providers : undefined;
  if (typeof model !== "string" || model.length === 0) {
    throw new Error("finder-provider config.verifier.model must be a non-empty string");
  }
  if (
    !Array.isArray(providers) ||
    providers.length === 0 ||
    !providers.every((p): p is string => typeof p === "string" && p.length > 0)
  ) {
    throw new Error("finder-provider config.verifier.providers must be a non-empty list of endpoint slugs");
  }
  return { model, providers };
};

/** One verifier request, as the rows script checks it (provider, cost, A3 on both channels). */
export interface VerifierRequestTelemetry {
  provider: string | null;
  cost: number | null;
  reasoningTokens: number | null;
  openRouterReasoningTokens: number | null;
  reasoningTextChars: number;
}

/** What a verifier row reports about the verifier's own requests (metadata, never graded). */
export interface VerifierRowTelemetry {
  model: string;
  /** Whether the verifier was called at all; false when nothing could be sent. */
  called: boolean;
  requests: VerifierRequestTelemetry[];
  reasoningLeak: boolean;
  retries: FinderRetry[];
  cost?: number;
}

/**
 * The fixed summary of a verifier row's graded output. The finder writes its
 * summary BEFORE verification, and `issue_recall` and the `flaw_*` rubrics read
 * the whole output, so the finder's text would let a withheld finding pass
 * through its summary (plan-review re-run F1). The finder's own summary is kept
 * in `metadata.verification.finderSummary`.
 */
/** A published finding as the finder's schema has it: the code-assigned `id` dropped. */
const withoutId = ({ id, ...finding }: IdentifiedFinding): Finding => {
  void id;
  return finding;
};

export const verifiedSummary = (published: number): string =>
  `${String(published)} findings published after verification`;

/** Test seams for the production retry's wait; promptfoo passes none, so the real delay applies. */
export interface FinderProviderDeps {
  retrySleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/** One production retry that happened inside a row (see `FinderTelemetry.retries`). */
export interface FinderRetry {
  /** `APICallError-<status>`, `timeout`, or the error's name — never its message. */
  error: string;
  delayMs: number;
}

const retryClass = (error: unknown): string => {
  if (typeof error !== "object" || error === null) return typeof error;
  if ("statusCode" in error && typeof error.statusCode === "number") return `APICallError-${String(error.statusCode)}`;
  if ("name" in error && error.name === "TimeoutError") return "timeout";
  return "name" in error && typeof error.name === "string" ? error.name : "unknown";
};

/** The HTTP status of a failed call — its own, or its cause's — or `undefined`. Same rule as the gate runner's. */
const httpStatusOf = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const own = "statusCode" in error ? error.statusCode : undefined;
  if (typeof own === "number") return own;
  const cause = "cause" in error ? error.cause : undefined;
  const nested = typeof cause === "object" && cause !== null && "statusCode" in cause ? cause.statusCode : undefined;
  return typeof nested === "number" ? nested : undefined;
};

/** Fixture roots are authored relative to THIS directory, not the cwd promptfoo happens to run in. */
const EVALS_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(EVALS_DIR, "fixtures");

/**
 * Resolves a case's `fixtureRoot` and confines it to `evals/fixtures`.
 *
 * The root is what the diff-scoped allowlist is joined against, so it decides
 * which files can be handed to an external model. Left unconstrained, an
 * absolute path or a `../` walk (`"../../.."` reaches the repository root)
 * plus a crafted diff would authorize arbitrary repository files for delivery
 * — impl-review-phase-1 F2. Containment is checked on the REALPATH of both
 * sides, so a fixture root that is itself a symlink out of the tree cannot
 * slip past (`createDiffScopedSource` deliberately tolerates a symlinked root,
 * which is exactly why this check cannot be lexical).
 */
export function resolveFixtureRoot(raw: string): string {
  const requested = isAbsolute(raw) ? raw : resolve(EVALS_DIR, raw);
  let root: string;
  let fixtures: string;
  try {
    root = realpathSync(requested);
    fixtures = realpathSync(FIXTURES_DIR);
  } catch {
    throw new Error(`fixtureRoot "${raw}" does not exist under evals/fixtures.`);
  }
  const rel = relative(fixtures, root);
  // "" means the fixtures directory itself — a root that broad would expose
  // every other case's tree to whatever the diff happens to name.
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`fixtureRoot "${raw}" must name a directory INSIDE evals/fixtures.`);
  }
  return root;
}

/** What a tool-enabled row reports back to promptfoo, on success AND on error. */
export interface FinderTelemetry {
  steps: number;
  toolCalls: number;
  /** Paths the model ASKED for — includes the ones the source refused. */
  requestedPaths: string[];
  /** Paths whose call actually returned file content. This is the evidence. */
  deliveredPaths: string[];
  /** Paths whose call came back as a refusal / empty / out-of-range answer. */
  refusedPaths: string[];
  /**
   * Format-repair REQUESTS (see reviewer.ts): the finalization failed the strict
   * parse and one repair call was sent, whether or not it then succeeded — a
   * per-run model-drift signal. Before change `finder-serialization-outage` this
   * counted envelope repairs done in code, so values from before and after it
   * are not comparable.
   */
  repairs: number;
  /**
   * The upstream that served each observed request, in order — every
   * gathering-loop step, the finalization and the repair. `null` where
   * OpenRouter reported none: a missing slug must stay visibly missing, never
   * become the endpoint the run was pinned to. A pinned gate compares every
   * entry with its pin, so a silent fallback cannot pass as the pinned endpoint.
   */
  stepProviders: (string | null)[];
  /**
   * Whether each observed request carried a provider-reported cost, in the same
   * order. G4 rejects an attempt with any `false` here: a partially priced
   * attempt would understate its cost rather than fail visibly.
   */
  stepCostReported: boolean[];
  /**
   * Reasoning tokens each observed request reported through the SDK's usage,
   * in the same order; `null` where the request reported none. Every finder
   * request is sent with reasoning disabled (Amendment A3), so any positive
   * entry means the parameter did not take effect on that request.
   */
  stepReasoningTokens: (number | null)[];
  /**
   * The same count as OpenRouter reported it in its own usage block
   * (`completion_tokens_details.reasoning_tokens`), in the same order; `null`
   * where absent or malformed. A second channel, not a duplicate: the gate
   * runner (`scripts/finder-gate.mjs`) reads both, and so does this adapter.
   */
  stepOpenRouterReasoningTokens: (number | null)[];
  /**
   * Length of the reasoning TEXT each request returned, in the same order; 0
   * when none. A3 rejects reasoning tokens OR reasoning text, and a response
   * can carry text while reporting zero or no reasoning tokens — a token-only
   * check would record it as clean (impl-review-phase-4 F1).
   */
  stepReasoningTextChars: number[];
  /**
   * True when ANY request reported reasoning on ANY channel above. The gate
   * fails such an attempt: it did not run the measured request shape.
   */
  reasoningLeak: boolean;
  /**
   * Production's single transient retry, when it fired (gate.md §4, change
   * `finder-model-swap`): one entry with the error class and the wait. The
   * per-step arrays above then cover the requests of BOTH tries, so cost and
   * the provider/A3 checks include the retry.
   */
  retries: FinderRetry[];
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Provider-reported spend, summed across steps; absent when unreported. */
  cost?: number;
}

/**
 * OpenRouter's own reasoning-token count out of the provider metadata bag,
 * narrowed hop by hop with the same discipline as `asStepCost`: the bag is
 * typed `Record<string, JSONObject>` and promises no shape. Absent or
 * non-finite → `null`, never a fabricated 0.
 */
export const asOpenRouterReasoningTokens = (metadata: unknown): number | null => {
  if (typeof metadata !== "object" || metadata === null || !("openrouter" in metadata)) return null;
  const openrouter: unknown = metadata.openrouter;
  if (typeof openrouter !== "object" || openrouter === null || !("usage" in openrouter)) return null;
  const usage: unknown = openrouter.usage;
  if (typeof usage !== "object" || usage === null || !("completionTokensDetails" in usage)) return null;
  const details: unknown = usage.completionTokensDetails;
  if (typeof details !== "object" || details === null || !("reasoningTokens" in details)) return null;
  const tokens: unknown = details.reasoningTokens;
  return typeof tokens === "number" && Number.isFinite(tokens) ? tokens : null;
};

const sum = (a: number | undefined, b: number | undefined): number | undefined => (b === undefined ? a : (a ?? 0) + b);

export default class FinderProvider implements ApiProvider {
  private readonly providerId: string;
  private readonly model: string;
  private readonly lens: Lens;
  private readonly verifier: VerifierArmConfig | undefined;
  private readonly deps: FinderProviderDeps;

  constructor(options: ProviderOptions, deps: FinderProviderDeps = {}) {
    this.deps = deps;
    const config = (options.config ?? {}) as FinderProviderConfig;
    if (typeof config.model !== "string" || config.model.length === 0) {
      throw new Error("finder-provider requires a non-empty config.model");
    }

    this.providerId = options.id ?? "finder-provider";
    this.model = config.model;
    this.lens = lensSchema.parse(config.lens ?? "general");
    this.verifier = parseVerifierConfig(config.verifier);
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const diff = context?.vars.diff;
    if (typeof diff !== "string" || diff.length === 0) {
      return { error: "The eval case must provide a non-empty diff variable" };
    }
    const projectContext = context?.vars.projectContext;
    if (typeof projectContext !== "string") {
      return { error: "The eval case must provide projectContext as text" };
    }

    const unit: ReviewUnit = { kind: "diff", diff };
    const telemetry: FinderTelemetry = {
      steps: 0,
      toolCalls: 0,
      requestedPaths: [],
      deliveredPaths: [],
      refusedPaths: [],
      repairs: 0,
      stepProviders: [],
      stepCostReported: [],
      stepReasoningTokens: [],
      stepOpenRouterReasoningTokens: [],
      stepReasoningTextChars: [],
      reasoningLeak: false,
      retries: [],
    };

    // Tool-enablement is PER CASE (a var), not per model (provider config):
    // the same four models run both tool-less and tool-enabled cases.
    const fixtureRoot = context?.vars.fixtureRoot;
    let source: SourceProvider | undefined;
    if (typeof fixtureRoot === "string" && fixtureRoot.length > 0) {
      let root: string;
      try {
        root = resolveFixtureRoot(fixtureRoot);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
      // The shipped CI assembly — same allowlist derivation and the same
      // symlink containment that guards the real checkout. The delivered /
      // refused split is reported BY the source, which knows it exactly,
      // rather than inferred from its prose (impl-review-phase-1 F4).
      source = createDiffScopedSourceForDiff({
        diff,
        root,
        readFile: (path) => readFileSync(path, "utf8"),
        realpath: (path) => realpathSync(path),
        isRegularFile: (path) => statSync(path).isFile(),
        onResult: ({ path, delivered }) => {
          telemetry.requestedPaths.push(path);
          (delivered ? telemetry.deliveredPaths : telemetry.refusedPaths).push(path);
        },
      });
      if (source === undefined) {
        return {
          error: `fixtureRoot "${fixtureRoot}" is set, but the diff declares no post-change paths, so the tool could never serve anything.`,
        };
      }
    }

    // The verifier's root (plan-review F1): `verifierRoot` when the row sets one,
    // else the row's `fixtureRoot`. It feeds ONLY the verifier's reader and
    // never reaches createReviewer, so a row with a verifierRoot and no
    // fixtureRoot sends the finder exactly the tool-less request it always did.
    // Resolved before any model call, with fixtureRoot's containment rule.
    let reader: DiffScopedReader | undefined;
    if (this.verifier !== undefined) {
      const verifierRoot = context?.vars.verifierRoot;
      const raw =
        typeof verifierRoot === "string" && verifierRoot.length > 0
          ? verifierRoot
          : typeof fixtureRoot === "string" && fixtureRoot.length > 0
            ? fixtureRoot
            : undefined;
      if (raw !== undefined) {
        let root: string;
        try {
          root = resolveFixtureRoot(raw);
        } catch (error) {
          return {
            error: (error instanceof Error ? error.message : String(error)).replace("fixtureRoot", "verifierRoot"),
          };
        }
        reader = createDiffScopedReaderForDiff({
          diff,
          root,
          readFile: (path) => readFileSync(path, "utf8"),
          realpath: (path) => realpathSync(path),
          isRegularFile: (path) => statSync(path).isFile(),
        });
      }
    }
    const verifierTelemetry: VerifierRowTelemetry | undefined =
      this.verifier === undefined
        ? undefined
        : { model: this.verifier.model, called: false, requests: [], reasoningLeak: false, retries: [] };
    let verification: (VerificationBlock & { finderSummary: string; publishedIds: string[] }) | undefined;

    // The prompt the viewer shows is the one that FORMATS the JSON — the
    // finalization request, including the real gathering transcript — captured
    // from the reviewer as sent. The loop prompt must mirror what createReviewer
    // sends too: with a source active its system prompt carries the tool
    // instructions, and a viewer showing the tool-less variant would be
    // reporting a prompt that never ran.
    const loopPrompt = [
      {
        role: "system",
        content: buildInstructions(this.lens, {
          fileContextTool: source !== undefined,
          projectContext,
        }),
      },
      { role: "user", content: buildPrompt(unit) },
    ];
    let finalizationPrompt: { system: string; prompt: string } | undefined;
    // An attempt that died before finalization must not display the loop
    // prompt as if it had produced the JSON: it says so, and shows the loop
    // prompt under its own name. Tool-less reviews have no loop at all.
    const actualPrompt = (): string =>
      finalizationPrompt === undefined
        ? JSON.stringify({
            finalizationReached: false,
            note: "The review ended before the finalization request, so no JSON-formatting prompt was sent.",
            ...(source === undefined ? {} : { loopPrompt }),
          })
        : JSON.stringify([
            { role: "system", content: finalizationPrompt.system },
            { role: "user", content: finalizationPrompt.prompt },
          ]);

    // Promptfoo's own field names, which are NOT the AI SDK's: prompt /
    // completion / total, plus numRequests (one provider call per loop step).
    const report = (): Pick<ProviderResponse, "tokenUsage" | "cost" | "metadata"> => ({
      tokenUsage: {
        prompt: telemetry.inputTokens,
        completion: telemetry.outputTokens,
        total: telemetry.totalTokens,
        numRequests: telemetry.steps,
      },
      ...(telemetry.cost === undefined ? {} : { cost: telemetry.cost }),
      metadata: {
        lens: this.lens,
        model: this.model,
        toolEnabled: source !== undefined,
        ...telemetry,
        // Verifier rows only. Verdicts, quotes and withheld findings live HERE,
        // never in the graded output: issue_recall regex-tests the whole output,
        // so a quote carrying the planted line would satisfy it by construction.
        ...(verifierTelemetry === undefined ? {} : { verifier: verifierTelemetry }),
        ...(verification === undefined ? {} : { verification }),
        // The pass that failed, on the error path only (impl-review phase 2
        // F6): a verifier failure must not read as a finder error.
        ...(failedPass === undefined ? {} : { failedPass }),
        // The failure's HTTP status, when it had one (impl-review a8844a6 F1):
        // the rows script turns an OpenRouter 401/402 into a measurement error,
        // which a message alone could not tell apart from a model failure.
        ...(errorStatus === undefined ? {} : { errorStatus }),
      },
    });

    // Which pass is running, for `metadata.failedPass` on the error path.
    let stage: "finder" | "verifier" = "finder";
    let failedPass: "finder" | "verifier" | undefined;
    let errorStatus: number | undefined;
    try {
      // One row = one production pass, including the pipeline's single
      // transient retry (429, 5xx, timeout; owner decision 2026-10-03, gate.md
      // §4). Format failures stay exposed: FinderOutputError is never retried,
      // so repeated --no-cache runs still show them.
      const reviewer = createReviewer({
        model: this.model,
        lens: this.lens,
        projectContext,
        // The tool-less cost ceiling is a contract: a step cap only ever
        // accompanies a live source (mirrors the pipeline).
        ...(source === undefined ? {} : { source, maxSteps: DEFAULT_FINDER_MAX_STEPS }),
        onStepEnd: (step) => {
          const info = describeFinderStep(step);
          telemetry.steps += 1;
          telemetry.toolCalls += info.toolCalls;
          telemetry.inputTokens = sum(telemetry.inputTokens, info.usage.inputTokens);
          telemetry.outputTokens = sum(telemetry.outputTokens, info.usage.outputTokens);
          telemetry.totalTokens = sum(telemetry.totalTokens, info.usage.totalTokens);
          telemetry.cost = sum(telemetry.cost, info.cost);
          telemetry.stepProviders.push(info.provider ?? null);
          telemetry.stepCostReported.push(info.cost !== undefined);
          const sdkReasoning = step.usage.outputTokenDetails.reasoningTokens ?? null;
          const openRouterReasoning = asOpenRouterReasoningTokens(step.providerMetadata);
          const reasoningTextChars = step.reasoningText?.length ?? 0;
          telemetry.stepReasoningTokens.push(sdkReasoning);
          telemetry.stepOpenRouterReasoningTokens.push(openRouterReasoning);
          telemetry.stepReasoningTextChars.push(reasoningTextChars);
          if ((sdkReasoning ?? 0) > 0 || (openRouterReasoning ?? 0) > 0 || reasoningTextChars > 0) {
            telemetry.reasoningLeak = true;
          }
        },
        onOutputRepair: () => {
          telemetry.repairs += 1;
        },
        onFinalizationPrompt: (prompt) => {
          finalizationPrompt = prompt;
        },
      });
      const result = await withOneRetry(() => reviewer.review(unit, { timeoutMs: DEFAULT_FINDER_TIMEOUT_MS }), {
        sleep: this.deps.retrySleep,
        random: this.deps.random,
        onRetry: (error, delayMs) => telemetry.retries.push({ error: retryClass(error), delayMs }),
      });
      if (verifierTelemetry === undefined) {
        return { output: JSON.stringify(result), prompt: actualPrompt(), ...report() };
      }
      stage = "verifier";
      const published = await this.verify(
        result,
        reader,
        (block) => {
          verification = block;
        },
        verifierTelemetry,
      );
      // Graded output: exactly {summary, findings: published}. Ids are
      // code-assigned and not part of the finder's schema (schema_validity).
      const findings = published.map(withoutId);
      return {
        output: JSON.stringify({ summary: verifiedSummary(findings.length), findings }),
        prompt: actualPrompt(),
        ...report(),
      };
    } catch (error) {
      // Telemetry rides the error path too: a row that died after burning four
      // tool-loop steps cost real money, and "how far did it get" is the whole
      // question for a model that fails structured output.
      failedPass = stage;
      errorStatus = httpStatusOf(error);
      return {
        error: error instanceof Error ? error.message : String(error),
        prompt: actualPrompt(),
        ...report(),
      };
    }
  }

  /**
   * The verification pass exactly as production runs it (`runVerificationPass`,
   * plan-review F4), pinned to this arm's endpoints. `requireVerification` is
   * off so a missing or unusable source is RECORDED as `skipped-no-source`:
   * the rows script turns that into a failed run (a measurement error), never
   * a graded row.
   */
  private async verify(
    result: ReviewResult,
    reader: DiffScopedReader | undefined,
    record: (block: VerificationBlock & { finderSummary: string; publishedIds: string[] }) => void,
    telemetry: VerifierRowTelemetry,
  ): Promise<IdentifiedFinding[]> {
    const arm = this.verifier;
    if (arm === undefined) throw new Error("verify() needs a verifier arm");
    const findings = assignFindingIds(mergeFindings(result.findings));
    const pass = await runVerificationPass({
      findings,
      reader,
      requireVerification: false,
      model: arm.model,
      timeoutMs: DEFAULT_VERIFIER_TIMEOUT_MS,
      sleep: this.deps.retrySleep,
      onRetry: (error, delayMs) => telemetry.retries.push({ error: retryClass(error), delayMs }),
      createVerifier: (options) => {
        const built = createVerifier({
          ...options,
          providerRouting: {
            order: arm.providers,
            only: arm.providers,
            allow_fallbacks: true,
            require_parameters: true,
          },
          onStepEnd: (step) => {
            const sdk = step.usage.outputTokenDetails.reasoningTokens ?? null;
            const openRouter = asOpenRouterReasoningTokens(step.providerMetadata);
            const textChars = step.reasoningText?.length ?? 0;
            const info = describeFinderStep(step);
            telemetry.requests.push({
              provider: info.provider ?? null,
              cost: info.cost ?? null,
              reasoningTokens: sdk,
              openRouterReasoningTokens: openRouter,
              reasoningTextChars: textChars,
            });
            telemetry.cost = sum(telemetry.cost, info.cost);
            if ((sdk ?? 0) > 0 || (openRouter ?? 0) > 0 || textChars > 0) telemetry.reasoningLeak = true;
            options.onStepEnd?.(step);
          },
        });
        return {
          verify: (input, callOptions) => {
            telemetry.called = true;
            return built.verify(input, callOptions);
          },
        };
      },
    });
    record({
      ...pass.verification,
      finderSummary: result.summary,
      publishedIds: pass.published.map((finding) => finding.id),
    });
    return pass.published;
  }
}
