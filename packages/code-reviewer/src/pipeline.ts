import type { ProviderMetadata, StepResult, ToolSet } from "ai";

import { resolveModels } from "./config.js";
import { mergeFindings } from "./findings.js";
import { createJudge, type JudgeCallOptions } from "./judge.js";
import { type JudgePromptInput } from "./prompts.js";
import { withOneRetry } from "./retry.js";
import {
  createReviewer,
  type ReviewCallOptions,
  type Reviewer,
  type ReviewerOptions,
  type SourceProvider,
} from "./reviewer.js";
import { assignFindingIds } from "./scorecard.js";
import type { DiffStats, FinderTelemetry, JudgeResult, PipelineResult, ReviewResult, ReviewUnit } from "./schemas.js";

// Two-pass orchestration in plain code: finder (full diff) → normalize +
// merge + assign F1..Fn → judge (findings + rubric + PR metadata) → result.
// Truncation caps live here so they're testable; each pass is wrapped in
// withOneRetry (the single retry authority — both agents run maxRetries: 0).

export const DIFF_CAP_BYTES = 100_000;
export const BODY_CAP_CHARS = 2_000;
export const DIFF_TRUNCATION_MARKER = "\n[...diff truncated at 100 KB]";
export const BODY_TRUNCATION_MARKER = "\n[...body truncated at 2,000 chars]";

// Operational timeouts (impl-review-phase-1 F2): every provider call gets a
// wall-clock budget so a stalled provider fails locally (activating the
// TimeoutError retry path) instead of hanging until an external job limit.
// Per attempt, so worst case = 2×finder + 2×judge with withOneRetry.
export const DEFAULT_FINDER_TIMEOUT_MS = 300_000; // up to 8 tool-loop steps
export const DEFAULT_JUDGE_TIMEOUT_MS = 120_000; // single structured call

export interface PipelineTimeouts {
  finderTimeoutMs?: number;
  judgeTimeoutMs?: number;
}

// Same guard style as reviewer.ts's maxSteps: a zero, negative, fractional,
// or non-finite budget would silently disable the bound.
function resolveTimeouts(overrides: PipelineTimeouts = {}): Required<PipelineTimeouts> {
  const finderTimeoutMs = overrides.finderTimeoutMs ?? DEFAULT_FINDER_TIMEOUT_MS;
  const judgeTimeoutMs = overrides.judgeTimeoutMs ?? DEFAULT_JUDGE_TIMEOUT_MS;
  for (const [name, value] of Object.entries({ finderTimeoutMs, judgeTimeoutMs })) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer (ms), got: ${String(value)}`);
    }
  }
  return { finderTimeoutMs, judgeTimeoutMs };
}

/** Files/additions/deletions from unified-diff text (headers excluded). */
export function computeDiffStats(diff: string): DiffStats {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) files += 1;
    else if (line.startsWith("+++") || line.startsWith("---")) continue;
    else if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { files, additions, deletions };
}

/** Byte-accurate diff cap (UTF-8), with a visible marker and no split surrogates. */
function capDiff(diff: string): { diff: string; truncated: boolean } {
  const bytes = new TextEncoder().encode(diff);
  if (bytes.length <= DIFF_CAP_BYTES) return { diff, truncated: false };
  const capped = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, DIFF_CAP_BYTES)).replace(/�+$/u, "");
  return { diff: capped + DIFF_TRUNCATION_MARKER, truncated: true };
}

function capBody(body: string | undefined): { body: string | undefined; truncated: boolean } {
  if (body === undefined || body.length <= BODY_CAP_CHARS) return { body, truncated: false };
  return { body: body.slice(0, BODY_CAP_CHARS) + BODY_TRUNCATION_MARKER, truncated: true };
}

// Trusted project rules still get a cap (impl-review-phase-1 F4): they spend
// finder prompt tokens on every run, so an unbounded rules file must not
// silently dominate the context window.
export const PROJECT_CONTEXT_CAP_CHARS = 10_000;
export const PROJECT_CONTEXT_TRUNCATION_MARKER = "\n[...project context truncated at 10,000 chars]";

function capProjectContext(text: string | undefined): string | undefined {
  if (text === undefined || text.length <= PROJECT_CONTEXT_CAP_CHARS) return text;
  return text.slice(0, PROJECT_CONTEXT_CAP_CHARS) + PROJECT_CONTEXT_TRUNCATION_MARKER;
}

export interface PipelineOverrides {
  apiKey?: string;
  reviewModel?: string;
  judgeModel?: string;
}

/** Injection seam for hermetic tests: swap either pass for a pure function. */
export interface PipelineDeps {
  finder?: (unit: ReviewUnit, callOptions?: ReviewCallOptions) => Promise<ReviewResult>;
  judge?: (input: JudgePromptInput, callOptions?: JudgeCallOptions) => Promise<JudgeResult>;
  /**
   * Replaces createReviewer for the finder pass so the source/maxSteps/step-
   * telemetry wiring is hermetically testable; `finder` (above) bypasses
   * construction entirely and therefore produces no finderTelemetry.
   */
  createFinder?: (options: ReviewerOptions) => Pick<Reviewer, "review">;
  /** Replaces the real pre-retry sleep so retry-path tests never wait. */
  retrySleep?: (ms: number) => Promise<void>;
}

/** SDK-independent view of one finder loop step, as `onFinderStep` receives it. */
export interface FinderStepInfo {
  /** The getFileContext calls in the step, with the model's requested targets. */
  fileContextCalls: { path: string; startLine?: number; endLine?: number }[];
  /** Total tool calls in the step — any tool, valid or not (it all costs). */
  toolCalls: number;
  /** Token usage of the step's generation, where the provider reported it. */
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  /**
   * Provider-reported cost of the step in USD. Present only when the provider
   * actually reported it — OpenRouter does so under usage accounting, which
   * `createReviewer` enables. Token counts are a proxy that needs a price
   * table and goes stale; this is the figure the provider billed.
   */
  cost?: number;
}

/**
 * Exact per-step cost out of the provider's metadata bag.
 *
 * `providerMetadata` is typed `Record<string, JSONObject>` — the SDK makes no
 * promise about the value shape, so narrow every hop instead of trusting it,
 * same discipline as `asFileContextTarget` above. Absent metadata, a provider
 * that reports no cost, or a non-finite value all degrade to `undefined`
 * rather than a fabricated 0, which would read as "this step was free".
 */
const asStepCost = (metadata: ProviderMetadata | undefined): number | undefined => {
  const openrouter: unknown = metadata?.openrouter;
  if (typeof openrouter !== "object" || openrouter === null) return undefined;
  if (!("usage" in openrouter)) return undefined;
  const usage: unknown = openrouter.usage;
  if (typeof usage !== "object" || usage === null) return undefined;
  if (!("cost" in usage)) return undefined;
  const cost: unknown = usage.cost;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : undefined;
};

// The tool input is model-chosen and reaches us untyped — narrow it instead
// of trusting the schema validated elsewhere.
const asFileContextTarget = (input: unknown): { path: string; startLine?: number; endLine?: number } | undefined => {
  if (typeof input !== "object" || input === null) return undefined;
  if (!("path" in input) || typeof input.path !== "string") return undefined;
  return {
    path: input.path,
    startLine: "startLine" in input && typeof input.startLine === "number" ? input.startLine : undefined,
    endLine: "endLine" in input && typeof input.endLine === "number" ? input.endLine : undefined,
  };
};

/** Extract the small per-step description from the SDK's step result. */
export function describeFinderStep(step: StepResult<ToolSet>): FinderStepInfo {
  const cost = asStepCost(step.providerMetadata);
  return {
    fileContextCalls: step.toolCalls.flatMap((call) => {
      if (call.toolName !== "getFileContext") return [];
      const target = asFileContextTarget(call.input);
      return target === undefined ? [] : [target];
    }),
    toolCalls: step.toolCalls.length,
    usage: {
      inputTokens: step.usage.inputTokens,
      outputTokens: step.usage.outputTokens,
      totalTokens: step.usage.totalTokens,
    },
    // Key absent rather than undefined-valued when the provider reported
    // nothing, matching the finderTelemetry convention below.
    ...(cost === undefined ? {} : { cost }),
  };
}

export interface PipelineInput {
  diff: string;
  prTitle?: string;
  prBody?: string;
  overrides?: PipelineOverrides;
  /** Per-pass, per-attempt wall-clock budgets; validated defaults apply when omitted. */
  timeouts?: PipelineTimeouts;
  /**
   * Trusted repository-maintainer review rules for the finder (the pass that
   * sees the code). Must be sourced from trusted ground (e.g. the base
   * branch, never the PR head); capped at PROJECT_CONTEXT_CAP_CHARS.
   */
  projectReviewContext?: string;
  /**
   * Production observability: fires when a pass is about to be retried, with
   * the pass name, the swallowed first failure, and the pre-retry delay.
   * Without it a recovered flake leaves zero trace in the run's output.
   */
  onRetry?: (pass: "finder" | "judge", error: unknown, delayMs: number) => void;
  /**
   * File-context provider for the finder's getFileContext tool. Absent (all
   * legacy callers) → the finder stays tool-less and single-generation — the
   * documented cost ceiling (impl-review-phase-1 F3).
   */
  source?: SourceProvider;
  /** Finder loop cap, forwarded to createReviewer as maxSteps — only when `source` is set. */
  finderMaxSteps?: number;
  /** Observes each finder loop step (across both retry attempts) for per-step telemetry. */
  onFinderStep?: (info: FinderStepInfo) => void;
  /**
   * Fires when the finder's response failed the strict parse and an envelope
   * repair rescued it (see output-repair.ts). Without it a repaired run looks
   * identical to a clean one, hiding model drift worth acting on.
   */
  onOutputRepair?: (detail: { reason: string }) => void;
  deps?: PipelineDeps;
}

export async function runReviewPipeline(input: PipelineInput): Promise<PipelineResult> {
  const models = resolveModels(input.overrides);
  const timeouts = resolveTimeouts(input.timeouts);
  const { diff, truncated: diffTruncated } = capDiff(input.diff);
  const { body: prBody, truncated: bodyTruncated } = capBody(input.prBody);
  // Stats describe the real PR, so they're computed on the un-capped diff.
  const diffStats = computeDiffStats(input.diff);

  // Accumulated across BOTH finder attempts of a retried run — it measures
  // real spend for the run, not the last attempt's shape, so `steps` MAY
  // exceed the per-attempt maxSteps cap (the SDK's stepNumber resets to 0 on
  // the retry attempt; each event is simply counted).
  const telemetry: FinderTelemetry = { steps: 0, toolCalls: 0 };
  const addTokens = (sum: number | undefined, next: number | undefined): number | undefined =>
    next === undefined ? sum : (sum ?? 0) + next;
  const observeFinderStep = (step: StepResult<ToolSet>): void => {
    const info = describeFinderStep(step);
    telemetry.steps += 1;
    telemetry.toolCalls += info.toolCalls;
    telemetry.inputTokens = addTokens(telemetry.inputTokens, info.usage.inputTokens);
    telemetry.outputTokens = addTokens(telemetry.outputTokens, info.usage.outputTokens);
    telemetry.totalTokens = addTokens(telemetry.totalTokens, info.usage.totalTokens);
    input.onFinderStep?.(info);
  };

  const createFinder = input.deps?.createFinder ?? createReviewer;
  const finder =
    input.deps?.finder ??
    createFinder({
      apiKey: input.overrides?.apiKey,
      model: models.reviewModel,
      projectContext: capProjectContext(input.projectReviewContext),
      source: input.source,
      // The tool-less cost ceiling is a contract: a step cap only accompanies
      // a live source (impl-review-phase-1 F3).
      maxSteps: input.source === undefined ? undefined : input.finderMaxSteps,
      onStepEnd: observeFinderStep,
      onOutputRepair: input.onOutputRepair,
    }).review;
  const judge = input.deps?.judge ?? createJudge({ apiKey: input.overrides?.apiKey, model: models.judgeModel }).judge;

  const retryOptions = (pass: "finder" | "judge") => ({
    sleep: input.deps?.retrySleep,
    onRetry: (error: unknown, delayMs: number) => input.onRetry?.(pass, error, delayMs),
  });

  const reviewResult = await withOneRetry(
    () => finder({ kind: "diff", diff }, { timeoutMs: timeouts.finderTimeoutMs }),
    retryOptions("finder"),
  );
  // reviewer.review already normalized; mergeFindings adds the dedup +
  // deterministic file/line/category sort that makes F1..Fn stable per run.
  const findings = assignFindingIds(mergeFindings(reviewResult.findings));

  const judgeResult = await withOneRetry(
    () => judge({ findings, prTitle: input.prTitle, prBody, diffStats }, { timeoutMs: timeouts.judgeTimeoutMs }),
    retryOptions("judge"),
  );

  return {
    summary: judgeResult.summary,
    findings,
    preDedupFindingCount: reviewResult.findings.length,
    scores: judgeResult.scores,
    verdict: judgeResult.verdict,
    verdictReason: judgeResult.verdictReason,
    diffStats,
    diffTruncated,
    bodyTruncated,
    droppedFindingIdRefs: judgeResult.droppedFindingIdRefs,
    models: { finder: models.reviewModel, judge: models.judgeModel },
    // Key absent (not undefined-valued) when nothing was observed, so
    // review.json and `in` checks stay clean for injected-finder runs.
    ...(telemetry.steps > 0 ? { finderTelemetry: telemetry } : {}),
  };
}
