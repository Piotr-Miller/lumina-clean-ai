import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
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

export function resolveFixtureRoot(raw: string): string {
  return isAbsolute(raw) ? raw : resolve(EVALS_DIR, raw);
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

/**
 * Records, per tool call, whether real context reached the model.
 *
 * A tool CALL is not evidence: `createDiffScopedSource` answers an unlisted
 * path, a symlinked component, an unreadable file, an empty file, or an
 * out-of-range slice with a message rather than content, and the model is free
 * to guess the finding anyway. Every one of those answers opens with the
 * requested path in quotes (`"x" is not part of the reviewed diff…`), while a
 * real answer is a slice of the file — so that prefix is the discriminator.
 * Empty and out-of-range reads count as REFUSED on purpose: no evidence
 * reached the model either way.
 */
export function instrumentSource(
  source: SourceProvider,
  onResult: (path: string, delivered: boolean) => void,
): SourceProvider {
  return async (request) => {
    const result = await source(request);
    onResult(request.path, !result.startsWith(`"${request.path}"`));
    return result;
  };
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
      const root = resolveFixtureRoot(fixtureRoot);
      // The shipped CI assembly — same allowlist derivation and the same
      // symlink containment that guards the real checkout.
      const scoped = createDiffScopedSourceForDiff({
        diff,
        root,
        readFile: (path) => readFileSync(path, "utf8"),
        realpath: (path) => realpathSync(path),
        isRegularFile: (path) => statSync(path).isFile(),
      });
      if (scoped === undefined) {
        return {
          error: `fixtureRoot "${fixtureRoot}" is set, but the diff declares no post-change paths, so the tool could never serve anything.`,
        };
      }
      source = instrumentSource(scoped, (path, delivered) => {
        telemetry.requestedPaths.push(path);
        (delivered ? telemetry.deliveredPaths : telemetry.refusedPaths).push(path);
      });
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
