import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ApiProvider, CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";

import {
  buildInstructions,
  buildPrompt,
  createDiffScopedSourceForDiff,
  createReviewer,
  DEFAULT_FINDER_MAX_STEPS,
  DEFAULT_FINDER_TIMEOUT_MS,
  describeFinderStep,
  lensSchema,
  type Lens,
  type ReviewUnit,
  type SourceProvider,
  withOneRetry,
} from "../src/index.js";

interface FinderProviderConfig {
  lens?: unknown;
  model?: unknown;
}

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
      metadata: { lens: this.lens, model: this.model, toolEnabled: source !== undefined, ...telemetry },
    });

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
      return { output: JSON.stringify(result), prompt: actualPrompt(), ...report() };
    } catch (error) {
      // Telemetry rides the error path too: a row that died after burning four
      // tool-loop steps cost real money, and "how far did it get" is the whole
      // question for a model that fails structured output.
      return {
        error: error instanceof Error ? error.message : String(error),
        prompt: actualPrompt(),
        ...report(),
      };
    }
  }
}
