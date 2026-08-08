import { resolveModels } from "./config.js";
import { mergeFindings } from "./findings.js";
import { createJudge, type JudgeCallOptions } from "./judge.js";
import { type JudgePromptInput } from "./prompts.js";
import { withOneRetry } from "./retry.js";
import { createReviewer, type ReviewCallOptions } from "./reviewer.js";
import { assignFindingIds } from "./scorecard.js";
import type { DiffStats, JudgeResult, PipelineResult, ReviewResult, ReviewUnit } from "./schemas.js";

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
  const capped = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, DIFF_CAP_BYTES))
    .replace(/�+$/u, "");
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
  deps?: PipelineDeps;
}

export async function runReviewPipeline(input: PipelineInput): Promise<PipelineResult> {
  const models = resolveModels(input.overrides);
  const timeouts = resolveTimeouts(input.timeouts);
  const { diff, truncated: diffTruncated } = capDiff(input.diff);
  const { body: prBody, truncated: bodyTruncated } = capBody(input.prBody);
  // Stats describe the real PR, so they're computed on the un-capped diff.
  const diffStats = computeDiffStats(input.diff);

  const finder =
    input.deps?.finder ??
    createReviewer({
      apiKey: input.overrides?.apiKey,
      model: models.reviewModel,
      projectContext: capProjectContext(input.projectReviewContext),
    }).review;
  const judge =
    input.deps?.judge ??
    createJudge({ apiKey: input.overrides?.apiKey, model: models.judgeModel }).judge;

  const reviewResult = await withOneRetry(() =>
    finder({ kind: "diff", diff }, { timeoutMs: timeouts.finderTimeoutMs }),
  );
  // reviewer.review already normalized; mergeFindings adds the dedup +
  // deterministic file/line/category sort that makes F1..Fn stable per run.
  const findings = assignFindingIds(mergeFindings(reviewResult.findings));

  const judgeResult = await withOneRetry(() =>
    judge({ findings, prTitle: input.prTitle, prBody, diffStats }, { timeoutMs: timeouts.judgeTimeoutMs }),
  );

  return {
    summary: judgeResult.summary,
    findings,
    scores: judgeResult.scores,
    verdict: judgeResult.verdict,
    verdictReason: judgeResult.verdictReason,
    diffStats,
    diffTruncated,
    bodyTruncated,
    droppedFindingIdRefs: judgeResult.droppedFindingIdRefs,
    models: { finder: models.reviewModel, judge: models.judgeModel },
  };
}
