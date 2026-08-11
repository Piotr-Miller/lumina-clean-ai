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
} from "../src/index.js";

interface FinderProviderConfig {
  lens?: unknown;
  model?: unknown;
}

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
  /** Envelope repairs (see output-repair.ts) — a per-run model-drift signal. */
  repairs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Provider-reported spend, summed across steps; absent when unreported. */
  cost?: number;
}

const sum = (a: number | undefined, b: number | undefined): number | undefined => (b === undefined ? a : (a ?? 0) + b);

export default class FinderProvider implements ApiProvider {
  private readonly providerId: string;
  private readonly model: string;
  private readonly lens: Lens;

  constructor(options: ProviderOptions) {
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

    // Must mirror what createReviewer will actually send: with a source active
    // the system prompt carries the tool instructions, and a viewer showing
    // the tool-less variant would be reporting a prompt that never ran.
    const actualPrompt = JSON.stringify([
      {
        role: "system",
        content: buildInstructions(this.lens, {
          fileContextTool: source !== undefined,
          projectContext,
        }),
      },
      { role: "user", content: buildPrompt(unit) },
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
      // Deliberately one provider attempt: repeated --no-cache runs should
      // expose schema flakes instead of hiding them behind pipeline retries.
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
        },
        onOutputRepair: () => {
          telemetry.repairs += 1;
        },
      });
      const result = await reviewer.review(unit, { timeoutMs: DEFAULT_FINDER_TIMEOUT_MS });
      return { output: JSON.stringify(result), prompt: actualPrompt, ...report() };
    } catch (error) {
      // Telemetry rides the error path too: a row that died after burning four
      // tool-loop steps cost real money, and "how far did it get" is the whole
      // question for a model that fails structured output.
      return {
        error: error instanceof Error ? error.message : String(error),
        prompt: actualPrompt,
        ...report(),
      };
    }
  }
}
