import type { StepResult, ToolSet } from "ai";

import { resolveModels } from "./config.js";
import { mergeFindings, offDiffFindingPaths } from "./findings.js";
import {
  createImplReviewer,
  type ImplReviewCallOptions,
  type ImplReviewer,
  type ImplReviewerOptions,
} from "./impl-reviewer.js";
import { createJudge, type Judge, type JudgeCallOptions, type JudgeOptions } from "./judge.js";
import { planExcerpts } from "./excerpts.js";
import { type ImplReviewPromptInput, type JudgePromptInput, type VerifierPromptInput } from "./prompts.js";
import { asStepCost, asStepProvider } from "./provider-metadata.js";
import { withOneRetry, type RetryOptions } from "./retry.js";
import {
  createReviewer,
  type ReviewCallOptions,
  type Reviewer,
  type ReviewerOptions,
  type SourceProvider,
} from "./reviewer.js";
import { assignFindingIds } from "./scorecard.js";
import type { DiffScopedReader } from "./source-provider.js";
import {
  applyVerdicts,
  createVerifier,
  type Verifier,
  type VerifierCallOptions,
  type VerifierOptions,
} from "./verifier.js";
import type {
  DiffStats,
  FinderTelemetry,
  IdentifiedFinding,
  ImplReviewBlock,
  ImplReviewResult,
  ImplReviewTelemetry,
  JudgeResult,
  JudgeTelemetry,
  PipelineResult,
  ReviewResult,
  ReviewUnit,
  VerificationBlock,
  VerificationOutput,
  VerifierTelemetry,
} from "./schemas.js";

// Two-pass orchestration in plain code: finder (full diff) → normalize +
// merge + assign F1..Fn → verification (excerpts → verifier → only confirmed,
// quote-checked findings survive) → judge (published findings + rubric + PR
// metadata) → result.
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
// Was 120_000 on the reasoning that a single structured call is quick. Measured
// on PR #127's finding set: the judge exceeded even 300s once in 5 calls, and
// failed 1 in 4 at 120s. The load is not the input (7.4k chars) but the output —
// six justifications referencing ten findings. Same reference class as the
// finder, and REVIEW_JUDGE_TIMEOUT_MS already exists to tune it per-run.
export const DEFAULT_JUDGE_TIMEOUT_MS = 300_000;
// Calibrated on LIVE evidence, not on the judge analogy this started with.
//
// The first figure was 120_000, "mirroring the judge's single-structured-call
// budget". That reasoning was wrong and the first real run proved it: BOTH
// attempts timed out on PR #127 (run 31703938953), burning ~4 minutes and
// producing a failed pass with no telemetry at all. The judge sees findings plus
// PR metadata — tiny in, small out. This pass sees a full plan (47,896 chars
// there) plus the capped diff, and emits up to 10 findings each carrying detail
// and fix prose; the phase-2 local probe needed 13,327 output tokens, which
// takes minutes regardless of how fast the input is read.
//
// The right reference class is therefore the finder's budget, not the judge's.
// Overridable per-run via REVIEW_IMPL_REVIEW_TIMEOUT_MS so a recalibration does
// not need a release.
export const DEFAULT_IMPL_REVIEW_TIMEOUT_MS = 300_000;
// One tool-less call over findings plus excerpts (≤ 60,000 rendered chars), at
// most one format repair inside the same budget. Sealed with the gate
// (Pre-registration §2); REVIEW_VERIFIER_TIMEOUT_MS overrides it per run.
export const DEFAULT_VERIFIER_TIMEOUT_MS = 120_000;

// Re-exported so the package surface stays where it was: the two narrowers
// moved to provider-metadata.ts because reviewer.ts needs asStepProvider too,
// and reviewer.ts importing pipeline.ts would be an import cycle.
export { asStepCost, asStepProvider };

export interface PipelineTimeouts {
  finderTimeoutMs?: number;
  judgeTimeoutMs?: number;
  implReviewTimeoutMs?: number;
  verifierTimeoutMs?: number;
}

// Same guard style as reviewer.ts's maxSteps: a zero, negative, fractional,
// or non-finite budget would silently disable the bound. Exported for the gate
// runner's G2 path, which must resolve the finder's timeout exactly as the
// pipeline does (finder-verification impl-review phase 2 F9).
export function resolveTimeouts(overrides: PipelineTimeouts = {}): Required<PipelineTimeouts> {
  const finderTimeoutMs = overrides.finderTimeoutMs ?? DEFAULT_FINDER_TIMEOUT_MS;
  const judgeTimeoutMs = overrides.judgeTimeoutMs ?? DEFAULT_JUDGE_TIMEOUT_MS;
  const implReviewTimeoutMs = overrides.implReviewTimeoutMs ?? DEFAULT_IMPL_REVIEW_TIMEOUT_MS;
  const verifierTimeoutMs = overrides.verifierTimeoutMs ?? DEFAULT_VERIFIER_TIMEOUT_MS;
  for (const [name, value] of Object.entries({
    finderTimeoutMs,
    judgeTimeoutMs,
    implReviewTimeoutMs,
    verifierTimeoutMs,
  })) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer (ms), got: ${String(value)}`);
    }
  }
  return { finderTimeoutMs, judgeTimeoutMs, implReviewTimeoutMs, verifierTimeoutMs };
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

/**
 * Byte-accurate diff cap (UTF-8), with a visible marker and no split surrogates.
 * Exported (behavior unchanged) so campaign tooling imports the real function
 * instead of maintaining a copy — the copy in finder-distribution.mjs is the
 * cautionary tale (change `finder-fabrication-triggers`, review F5).
 */
export function capDiff(diff: string): { diff: string; truncated: boolean } {
  const bytes = new TextEncoder().encode(diff);
  if (bytes.length <= DIFF_CAP_BYTES) return { diff, truncated: false };
  const capped = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, DIFF_CAP_BYTES)).replace(/�+$/u, "");
  return { diff: capped + DIFF_TRUNCATION_MARKER, truncated: true };
}

/** Byte-offset segment of one file's hunks inside unified-diff text. */
export interface FileSegment {
  path: string;
  startByte: number;
  endByte: number;
}

/**
 * Splits unified-diff text into per-file segments with UTF-8 byte offsets.
 * Ported verbatim from the fabrication campaign's probe (change
 * r5-finder-truncation-note) so production and the measurement instrument
 * share ONE implementation — the probe imports this copy.
 */
export function computeFileSegments(diffText: string): FileSegment[] {
  const encoder = new TextEncoder();
  const segments: FileSegment[] = [];
  let current: FileSegment | null = null;
  // Iterate over `diff --git ` headers by LINE START so in-hunk content
  // (e.g. a quoted diff inside prose) can't open a phantom segment.
  let byteOffset = 0;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (current) {
        current.endByte = byteOffset;
        segments.push(current);
      }
      const bPath = / b\/(.+)$/.exec(line)?.[1] ?? line.slice("diff --git ".length);
      current = { path: bPath, startByte: byteOffset, endByte: -1 };
    }
    byteOffset += encoder.encode(line).length + 1; // +1 for the split-off "\n"
  }
  if (current) {
    // Last segment ends at the true byte length (no trailing phantom newline).
    current.endByte = encoder.encode(diffText).length;
    segments.push(current);
  }
  return segments;
}

/** In-window entry of a WindowManifest: a file segment plus completeness. */
export type WindowEntry = FileSegment & { complete: boolean };

export interface WindowManifest {
  totalBytes: number;
  capBytes: number | null;
  truncated: boolean;
  window: WindowEntry[];
  cutFile: string | null;
  cutOffsetInFile: number | null;
  overCap: string[];
}

/**
 * Window manifest: which files are (partially) inside the first `capBytes`
 * bytes, where the cut lands, and what falls outside. `capBytes: null` means
 * the cap is lifted — everything is in-window. Probe semantics, verbatim.
 */
export function computeManifest(diffText: string, capBytes: number | null): WindowManifest {
  const segments = computeFileSegments(diffText);
  const totalBytes = new TextEncoder().encode(diffText).length;
  if (capBytes === null || totalBytes <= capBytes) {
    return {
      totalBytes,
      capBytes,
      truncated: false,
      window: segments.map((s) => ({ ...s, complete: true })),
      cutFile: null,
      cutOffsetInFile: null,
      overCap: [],
    };
  }
  const window: WindowEntry[] = [];
  const overCap: string[] = [];
  let cutFile: string | null = null;
  let cutOffsetInFile: number | null = null;
  for (const s of segments) {
    if (s.endByte <= capBytes) {
      window.push({ ...s, complete: true });
    } else if (s.startByte < capBytes) {
      window.push({ ...s, complete: false });
      cutFile = s.path;
      cutOffsetInFile = capBytes - s.startByte;
    } else {
      overCap.push(s.path);
    }
  }
  return { totalBytes, capBytes, truncated: true, window, cutFile, cutOffsetInFile, overCap };
}

// Prose classification for the cap ordering below. The trailing-quote
// tolerance matters: git-quoted paths parse with the closing quote attached
// (see computeFileSegments' verbatim contract), and quoting a path must not
// smuggle its prose back in front of source.
//
// SHARP EDGE: this is a binary test, so "not prose" means "source" — including
// generated payload that is neither. A committed ground-truth/fixture.diff is
// hundreds of KB of synthetic content and sorts to the FRONT of the window,
// starving the source this ordering exists to protect; on PRs #175/#176/#177
// it consumed all three reviews (change `review-generated-artifact-exclusion`).
// Generated artifacts are excluded upstream in review.yml's EXCLUDES rather
// than classified here, because that is also where the getFileContext
// allowlist is derived. If a future generated artifact crowds the window
// again, add it there first; a third "generated" tier here needs evidence
// about which extensions actually matter, which nothing has produced yet.
const PROSE_PATH_PATTERN = /\.(?:md|mdx)"?$/i;

/**
 * Path-order bias fix for the diff cap — the follow-up registered in
 * review-diff-truncation ("Not fixing path-order bias") and carried unfixed
 * through finder-fabrication-triggers and r5-finder-truncation-note: git
 * sorts `context/` before `packages/`/`src/`, so on an over-cap diff the
 * byte-prefix cap systematically kept prose and cut source — the finder
 * reviewed documentation while the code fell over the cap, and (since the
 * truncation note) the note named the change's own source files as invisible.
 *
 * Moves Markdown segments after everything else, each group keeping its
 * original relative order, and ONLY when the diff exceeds the cap: an in-cap
 * diff returns the same string, so every review the cap never touched keeps
 * its pre-feature prompt byte-identical (the truncation note's spread-empty
 * discipline). Headerless text and single-class diffs also pass through
 * unchanged. Callers cap and report on THIS function's output, never the raw
 * diff, so cutFile/overCapFiles always describe what the finder actually saw.
 */
export function orderDiffForCap(diff: string): string {
  const bytes = new TextEncoder().encode(diff);
  if (bytes.length <= DIFF_CAP_BYTES) return diff;
  const segments = computeFileSegments(diff);
  const source = segments.filter((s) => !PROSE_PATH_PATTERN.test(s.path));
  const prose = segments.filter((s) => PROSE_PATH_PATTERN.test(s.path));
  if (source.length === 0 || prose.length === 0) return diff;
  // Byte-level reassembly: segments carry UTF-8 byte offsets, and slicing the
  // string by them instead would desync on any multi-byte character.
  const parts: Uint8Array[] = [bytes.subarray(0, segments[0].startByte)];
  const ordered = [...source, ...prose];
  for (const [index, segment] of ordered.entries()) {
    const part = bytes.subarray(segment.startByte, segment.endByte);
    parts.push(part);
    // Only the diff's final segment can lack a trailing newline; relocated
    // ahead of another segment it would fuse with that segment's header line.
    if (index < ordered.length - 1 && part.length > 0 && part[part.length - 1] !== 0x0a) {
      parts.push(new Uint8Array([0x0a]));
    }
  }
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder().decode(out);
}

// `truncationReport` lived here — it derived the cut file and over-cap list
// for the finder's truncation note. Removed with the note (change
// `r5-note-revert`); `computeFileSegments` / `computeManifest` above stay,
// because `orderDiffForCap` and the fabrication probe both use them.

function capBody(body: string | undefined): { body: string | undefined; truncated: boolean } {
  if (body === undefined || body.length <= BODY_CAP_CHARS) return { body, truncated: false };
  return { body: body.slice(0, BODY_CAP_CHARS) + BODY_TRUNCATION_MARKER, truncated: true };
}

// Trusted project rules still get a cap (impl-review-phase-1 F4): they spend
// finder prompt tokens on every run, so an unbounded rules file must not
// silently dominate the context window.
export const PROJECT_CONTEXT_CAP_CHARS = 10_000;
export const PROJECT_CONTEXT_TRUNCATION_MARKER = "\n[...project context truncated at 10,000 chars]";

export function capProjectContext(text: string | undefined): string | undefined {
  if (text === undefined || text.length <= PROJECT_CONTEXT_CAP_CHARS) return text;
  return text.slice(0, PROJECT_CONTEXT_CAP_CHARS) + PROJECT_CONTEXT_TRUNCATION_MARKER;
}

// The plan is the implementation-review pass's ground truth and arrives from
// the PR head, so it gets the same treatment as every other unbounded input:
// an unbounded plan would dominate the context window and dilute attention
// exactly as the diff cap prevents. Unlike capProjectContext this reports
// truncation, because a partial plan review must never render as a complete
// one.
//
// 80,000 is calibrated on LIVE evidence, not on archived plans. The first
// figure (40,000) came from the four largest plans in context/archive/
// (20,784-30,874 chars) and looked generous — then the first real run of this
// very feature reported planTruncated: true against its own plan at 47,217
// chars (run 31631971640). An in-flight plan is much bigger than an archived
// one: it carries a full Progress ledger and grows through review cycles. At
// 40k the cut fell inside `## Progress`, so a pass would have judged adherence
// without ever seeing which steps were claimed done. ~80k is roughly 20k
// tokens, comfortable beside the 100KB diff cap.
export const PLAN_CAP_CHARS = 80_000;
export const PLAN_TRUNCATION_MARKER = "\n[...plan truncated at 80,000 chars]";

// Exported for direct assertion: until the implementation-review pass lands
// in phase 3 nothing consumes the capped text, so a result-level test can only
// observe the boolean — and removing the slice or the marker would leave such
// a test green (impl-review-phase-1 F3).
export function capPlan(text: string): { plan: string; truncated: boolean } {
  if (text.length <= PLAN_CAP_CHARS) return { plan: text, truncated: false };
  return { plan: text.slice(0, PLAN_CAP_CHARS) + PLAN_TRUNCATION_MARKER, truncated: true };
}

export interface PipelineOverrides {
  apiKey?: string;
  reviewModel?: string;
  judgeModel?: string;
  implReviewModel?: string;
  verifierModel?: string;
}

/** Injection seam for hermetic tests: swap any pass for a pure function. */
export interface PipelineDeps {
  finder?: (unit: ReviewUnit, callOptions?: ReviewCallOptions) => Promise<ReviewResult>;
  judge?: (input: JudgePromptInput, callOptions?: JudgeCallOptions) => Promise<JudgeResult>;
  implReviewer?: (input: ImplReviewPromptInput, callOptions?: ImplReviewCallOptions) => Promise<ImplReviewResult>;
  /**
   * Replaces createReviewer for the finder pass so the source/maxSteps/step-
   * telemetry wiring is hermetically testable; `finder` (above) bypasses
   * construction entirely and therefore produces no finderTelemetry.
   */
  createFinder?: (options: ReviewerOptions) => Pick<Reviewer, "review">;
  /**
   * The same construction seam for the third pass. `implReviewer` above
   * bypasses construction and therefore produces no implReviewTelemetry, so
   * accumulation across a retried run is only observable through this one.
   */
  createImplReviewer?: (options: ImplReviewerOptions) => Pick<ImplReviewer, "implReview">;
  /**
   * The same construction seam for the judge. `judge` above bypasses
   * construction and therefore produces no judgeTelemetry, so accumulation
   * across a retried run is only observable through this one.
   */
  createJudge?: (options: JudgeOptions) => Pick<Judge, "judge">;
  /** Replaces the verifier call; bypasses construction, so no verifierTelemetry. */
  verifier?: VerifyFn;
  /** The construction seam for the verifier; its telemetry is observable through this one. */
  createVerifier?: (options: VerifierOptions) => Pick<Verifier, "verify">;
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
  /**
   * The upstream OpenRouter routed the step to (e.g. `novita`, `venice`).
   * Present only when the provider reported it: the 2026-09-20 outage could
   * not be attributed to an endpoint from the run log because nothing
   * recorded which one served each step (change `finder-serialization-outage`).
   */
  provider?: string;
  /** How the step's generation ended, as the SDK reports it (`stop`, `tool-calls`, `length`, …). */
  finishReason: string;
}

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
  const provider = asStepProvider(step.providerMetadata);
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
    // Keys absent rather than undefined-valued when the provider reported
    // nothing, matching the finderTelemetry convention below.
    ...(cost === undefined ? {} : { cost }),
    ...(provider === undefined ? {} : { provider }),
    finishReason: step.finishReason,
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
   * The plan this PR claims to implement, resolved deterministically by the
   * caller (never by a model — a declined tool call is indistinguishable from
   * "no plan found"). UNTRUSTED: it looks like a repo file, but it arrives on
   * the attacker-controlled PR head, and that mismatch between appearance and
   * provenance is exactly what makes it dangerous. Capped at PLAN_CAP_CHARS.
   *
   * Absent means "this PR has no plan" — a known state with its own rendered
   * output, not an ambiguous silence. `path` is repo-relative and is display
   * metadata only; it is equally untrusted (the PR body can name it).
   *
   * Present → the implementation-review pass runs; absent → it does not, and
   * `implReview` is absent from the result.
   */
  plan?: { text: string; path?: string };
  /**
   * Production observability: fires when a pass is about to be retried, with
   * the pass name, the swallowed first failure, and the pre-retry delay.
   * Without it a recovered flake leaves zero trace in the run's output.
   */
  onRetry?: (pass: RetryPass, error: unknown, delayMs: number) => void;
  /**
   * File-context provider for the finder's getFileContext tool. Absent (all
   * legacy callers) → the finder stays tool-less and single-generation — the
   * documented cost ceiling (impl-review-phase-1 F3).
   */
  source?: SourceProvider;
  /** Finder loop cap, forwarded to createReviewer as maxSteps — only when `source` is set. */
  finderMaxSteps?: number;
  /**
   * Observes each finder request (across both retry attempts) for per-step
   * telemetry: every gathering-loop step, the finalization and the format
   * repair.
   */
  onFinderStep?: (info: FinderStepInfo) => void;
  /**
   * Fires when the finder's finalization failed the strict parse and its one
   * format repair request is about to be sent (see reviewer.ts); `reason` is
   * the validation error. Without it a repaired run looks identical to a clean
   * one, hiding model drift worth acting on.
   */
  onOutputRepair?: (detail: { reason: string }) => void;
  /**
   * Observes each judge request as it completes: the upstream that served it,
   * where OpenRouter reported one, and how it ended. The CLI keeps the last
   * one so a judge `NoObjectGeneratedError` — which carries no provider of its
   * own — can still be attributed to an endpoint in the log.
   */
  onJudgeStep?: (info: { provider?: string; finishReason: string }) => void;
  /**
   * The same signal for the JUDGE's response. Separate from onOutputRepair so a
   * log line names which pass drifted — they are different models and the
   * remedies differ.
   */
  onJudgeOutputRepair?: (detail: { reason: string }) => void;
  /**
   * The structured diff-scoped reader the verification pass takes its code
   * excerpts from — the same checkout the finder's `source` reads. Absent →
   * there is no source root, and `requireVerification` decides what happens
   * (R8).
   */
  reader?: DiffScopedReader;
  /**
   * CI policy (R8): with findings and no reader, abort instead of publishing
   * them unverified. Local runs leave it unset: the findings then publish with
   * `verification.status: "skipped-no-source"` and the comment says so.
   */
  requireVerification?: boolean;
  /** Observes each verifier request as it completes, for logs and the gate's provider check. */
  onVerifierStep?: (info: VerifierStepInfo) => void;
  /** Fires before the verifier's one format repair request. */
  onVerifierOutputRepair?: (detail: { reason: string }) => void;
  /**
   * When the implementation review is allowed to run, given a plan resolved.
   *
   * `"always"` (default) preserves the library's original behavior. The CI
   * pipeline sets `"code-review-passed"`: the pass costs ~9.47x the code review
   * it rides alongside (measured, run 31735830016), and a PR whose code review
   * already failed is going back for changes and will be reviewed again — so
   * that spend buys a verdict on a diff that is about to change.
   *
   * The gate NEVER hides the pass silently: a gated run emits the `skipped`
   * block with its reason, which the renderer states plainly.
   */
  implReviewGate?: "always" | "code-review-passed";
  deps?: PipelineDeps;
}

export async function runReviewPipeline(input: PipelineInput): Promise<PipelineResult> {
  const models = resolveModels(input.overrides);
  const timeouts = resolveTimeouts(input.timeouts);
  // Ordered BEFORE capping so the byte-prefix cap keeps source and cuts prose
  // (path-order bias fix); identity for every in-cap diff, so the common case
  // stays byte-identical to the pre-ordering pipeline.
  const orderedDiff = orderDiffForCap(input.diff);
  const { diff, truncated: diffTruncated } = capDiff(orderedDiff);
  const { body: prBody, truncated: bodyTruncated } = capBody(input.prBody);
  // Capped here rather than at the CLI boundary so every embedder (promptfoo,
  // a future orchestrator) gets the same bound without re-deriving it.
  const plan = input.plan === undefined ? undefined : capPlan(input.plan.text);
  // Stats describe the real PR, so they're computed on the un-capped diff.
  const diffStats = computeDiffStats(input.diff);

  // Accumulated across BOTH finder attempts of a retried run — it measures
  // real spend for the run, not the last attempt's shape, so `steps` MAY
  // exceed the per-attempt maxSteps cap (the SDK's stepNumber resets to 0 on
  // the retry attempt; each event is simply counted). One attempt alone can
  // exceed it too: the finalization and the format repair are requests of
  // their own, counted here so `cost` covers them (up to maxSteps + 2).
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
    // Assigned only when the provider reported it: `= undefined` would still
    // CREATE the key, and an un-instrumented run would then read as an
    // instrumented one that cost nothing.
    if (info.cost !== undefined) telemetry.cost = (telemetry.cost ?? 0) + info.cost;
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
  // Same accumulate-across-both-attempts contract as the finder's.
  const judgeTelemetry: JudgeTelemetry = { attempts: 0 };
  const observeJudgeStep = (step: StepResult<ToolSet>): void => {
    judgeTelemetry.attempts += 1;
    judgeTelemetry.inputTokens = addTokens(judgeTelemetry.inputTokens, step.usage.inputTokens);
    judgeTelemetry.outputTokens = addTokens(judgeTelemetry.outputTokens, step.usage.outputTokens);
    judgeTelemetry.totalTokens = addTokens(judgeTelemetry.totalTokens, step.usage.totalTokens);
    const cost = asStepCost(step.providerMetadata);
    if (cost !== undefined) judgeTelemetry.cost = (judgeTelemetry.cost ?? 0) + cost;
    const provider = asStepProvider(step.providerMetadata);
    input.onJudgeStep?.({ ...(provider === undefined ? {} : { provider }), finishReason: step.finishReason });
  };

  const judgeFactory = input.deps?.createJudge ?? createJudge;
  const judge =
    input.deps?.judge ??
    judgeFactory({
      apiKey: input.overrides?.apiKey,
      model: models.judgeModel,
      onOutputRepair: input.onJudgeOutputRepair,
      onStepEnd: observeJudgeStep,
    }).judge;

  const retryOptions = (pass: RetryPass) => ({
    sleep: input.deps?.retrySleep,
    onRetry: (error: unknown, delayMs: number) => input.onRetry?.(pass, error, delayMs),
  });

  const reviewResult = await withOneRetry(
    () => finder({ kind: "diff", diff }, { timeoutMs: timeouts.finderTimeoutMs }),
    retryOptions("finder"),
  );
  // reviewer.review already normalized; mergeFindings adds the dedup +
  // deterministic file/line/category sort that makes F1..Fn stable per run.
  // These ids are FINAL: verification only removes findings, it never
  // renumbers the survivors.
  const preVerification = assignFindingIds(mergeFindings(reviewResult.findings));

  const { published, verification, verifierTelemetry } = await runVerificationPass({
    findings: preVerification,
    reader: input.reader,
    requireVerification: input.requireVerification,
    model: models.verifierModel,
    apiKey: input.overrides?.apiKey,
    verifier: input.deps?.verifier,
    createVerifier: input.deps?.createVerifier,
    timeoutMs: timeouts.verifierTimeoutMs,
    onRetry: (error, delayMs) => input.onRetry?.("verifier", error, delayMs),
    sleep: input.deps?.retrySleep,
    onVerifierStep: input.onVerifierStep,
    onOutputRepair: input.onVerifierOutputRepair,
  });

  // R13: the judge's latency, timed here around the call (retry included) so
  // the judge's own code stays untouched.
  const judgeStarted = performance.now();
  const judgeResult = await withOneRetry(
    () =>
      judge({ findings: published, prTitle: input.prTitle, prBody, diffStats }, { timeoutMs: timeouts.judgeTimeoutMs }),
    retryOptions("judge"),
  );
  judgeTelemetry.latencyMs = Math.round(performance.now() - judgeStarted);

  const { implReview, implReviewTelemetry } = await runImplReviewPass({
    input,
    plan,
    codeReviewVerdict: judgeResult.verdict,
    diff,
    diffTruncated,
    apiKey: input.overrides?.apiKey,
    model: models.implReviewModel,
    timeoutMs: timeouts.implReviewTimeoutMs,
    retryOptions: retryOptions("impl-review"),
  });

  return {
    summary: judgeResult.summary,
    findings: published,
    preDedupFindingCount: reviewResult.findings.length,
    preVerificationFindingCount: preVerification.length,
    verification,
    scores: judgeResult.scores,
    verdict: judgeResult.verdict,
    verdictReason: judgeResult.verdictReason,
    diffStats,
    diffTruncated,
    // Against the FULL diff, not the capped one: an over-cap file is invisible
    // to the finder but still genuinely part of the PR, and flagging it as
    // off-diff would bury the real signal (a path in no version of the diff).
    // On the PRE-verification set (R8): an off-diff finding is exactly one the
    // source refuses, so it never publishes — and the warning must survive that.
    offDiffFindingPaths: offDiffFindingPaths(
      computeFileSegments(input.diff).map((segment) => segment.path),
      preVerification,
    ),
    bodyTruncated,
    // Key absent (not `false`) when the run had no plan, so a plan-less
    // review.json stays byte-identical to what shipped before this feature.
    ...(plan === undefined ? {} : { planTruncated: plan.truncated }),
    droppedFindingIdRefs: judgeResult.droppedFindingIdRefs,
    models: { finder: models.reviewModel, judge: models.judgeModel },
    // Key absent (not undefined-valued) when nothing was observed, so
    // review.json and `in` checks stay clean for injected-finder runs.
    ...(telemetry.steps > 0 ? { finderTelemetry: telemetry } : {}),
    ...(verifierTelemetry === undefined ? {} : { verifierTelemetry }),
    ...(judgeTelemetry.attempts > 0 ? { judgeTelemetry } : {}),
    ...(implReview === undefined ? {} : { implReview }),
    ...(implReviewTelemetry === undefined ? {} : { implReviewTelemetry }),
  };
}

export type RetryPass = "finder" | "verifier" | "judge" | "impl-review";

/** The verifier call as the pipeline uses it — `createVerifier(...).verify`, or an injected double. */
export type VerifyFn = (input: VerifierPromptInput, callOptions?: VerifierCallOptions) => Promise<VerificationOutput>;

/** SDK-independent view of one verifier request. */
export interface VerifierStepInfo {
  provider?: string;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** SDK-reported reasoning tokens; R7 expects none. */
  reasoningTokens?: number;
  finishReason: string;
}

export interface VerificationPassInput {
  /** Pre-verification findings, ids assigned. */
  findings: IdentifiedFinding[];
  reader?: DiffScopedReader;
  requireVerification?: boolean;
  /** The verifier model id, recorded in `verification.model`. */
  model: string;
  apiKey?: string;
  /** An injected verifier call; bypasses construction (no telemetry). */
  verifier?: VerifyFn;
  createVerifier?: (options: VerifierOptions) => Pick<Verifier, "verify">;
  timeoutMs?: number;
  onRetry?: RetryOptions["onRetry"];
  sleep?: RetryOptions["sleep"];
  onVerifierStep?: (info: VerifierStepInfo) => void;
  onOutputRepair?: (detail: { reason: string }) => void;
}

export interface VerificationPassResult {
  /** The findings that may be published: confirmed with a checked quote, or all of them when skipped. */
  published: IdentifiedFinding[];
  verification: VerificationBlock;
  verifierTelemetry?: VerifierTelemetry;
}

/**
 * The verification pass — and nothing else — so the production pipeline, the
 * gate runner and the promptfoo provider all measure ONE code path
 * (plan-review F4):
 *
 * 1. zero findings → no call (`no-findings`);
 * 2. no reader, or a reader that refuses every finding → R8:
 *    `requireVerification` throws (CI must not publish unverified findings),
 *    otherwise the findings pass through as `skipped-no-source` and the caller
 *    says so;
 * 3. otherwise plan the excerpts, call the verifier (one transient retry, as
 *    every pass), and let `applyVerdicts` decide publication in code.
 *
 * Construction happens only in step 3, so a run with nothing to verify needs no
 * API key. A verifier failure after its retry propagates: a technical failure,
 * never a silent pass-through.
 */
export async function runVerificationPass(input: VerificationPassInput): Promise<VerificationPassResult> {
  const { findings } = input;
  if (findings.length === 0) {
    return { published: [], verification: { status: "no-findings", verdicts: [], unknownVerdictIds: [] } };
  }
  if (input.reader === undefined) {
    if (input.requireVerification === true) {
      throw new Error(
        `Verification is required (--require-verification) but no source is available: the diff declares no ` +
          `post-change path the verifier could read, so the ${String(findings.length)} finding(s) cannot be ` +
          `verified. Aborting instead of publishing them unverified.`,
      );
    }
    return {
      published: findings,
      verification: { status: "skipped-no-source", verdicts: [], unknownVerdictIds: [] },
    };
  }

  const plan = planExcerpts({ findings, read: input.reader, diffPaths: input.reader.paths });
  // A root that refuses every finding it should serve — missing, unreadable,
  // not the PR's checkout — is no source either (impl-review phase 1 F1):
  // treating it as `verified` would withhold everything and let the judge pass
  // an empty list. Only findings citing a file of the diff count. An off-diff
  // finding is refused by the allowlist by design, stays a per-finding
  // `source-refused`, and is reported through `offDiffFindingPaths`.
  const diffPaths = input.reader.paths;
  const allowlisted = findings.filter((finding) => diffPaths.includes(finding.file));
  const refusalOf = (id: string): string | undefined => {
    const entry = Object.hasOwn(plan.perFinding, id) ? plan.perFinding[id] : undefined;
    return entry !== undefined && "unverifiable" in entry && entry.unverifiable === "source-refused"
      ? entry.detail
      : undefined;
  };
  const refusals = allowlisted.map((finding) => refusalOf(finding.id));
  if (refusals.length > 0 && refusals.every((reason) => reason !== undefined)) {
    const detail =
      `the source root refused all ${String(allowlisted.length)} finding(s) citing a file of the diff ` +
      `(first refusal: ${refusals[0]})`;
    if (input.requireVerification === true) {
      throw new Error(
        `Verification is required (--require-verification) but the source is unusable: ${detail}. The root is ` +
          `missing, unreadable, or not the PR's checkout. Aborting instead of publishing the findings unverified ` +
          `or withholding them all.`,
      );
    }
    return {
      published: findings,
      verification: { status: "skipped-no-source", verdicts: [], unknownVerdictIds: [], detail },
    };
  }
  const sent = findings.filter((finding) => "blockIds" in (plan.perFinding[finding.id] ?? {}));

  const requests: VerifierTelemetry["requests"] = [];
  const telemetry: VerifierTelemetry = { attempts: 0, latencyMs: 0, requests };
  const addTokens = (sum: number | undefined, next: number | undefined): number | undefined =>
    next === undefined ? sum : (sum ?? 0) + next;
  const observe = (step: StepResult<ToolSet>): void => {
    const info: VerifierStepInfo = {
      ...(asStepProvider(step.providerMetadata) === undefined
        ? {}
        : { provider: asStepProvider(step.providerMetadata) }),
      ...(asStepCost(step.providerMetadata) === undefined ? {} : { cost: asStepCost(step.providerMetadata) }),
      ...(step.usage.inputTokens === undefined ? {} : { inputTokens: step.usage.inputTokens }),
      ...(step.usage.outputTokens === undefined ? {} : { outputTokens: step.usage.outputTokens }),
      ...(step.usage.outputTokenDetails.reasoningTokens === undefined
        ? {}
        : { reasoningTokens: step.usage.outputTokenDetails.reasoningTokens }),
      finishReason: step.finishReason,
    };
    telemetry.attempts += 1;
    telemetry.inputTokens = addTokens(telemetry.inputTokens, info.inputTokens);
    telemetry.outputTokens = addTokens(telemetry.outputTokens, info.outputTokens);
    // Assigned only when reported: a fabricated 0 would read as "free".
    if (info.cost !== undefined) telemetry.cost = (telemetry.cost ?? 0) + info.cost;
    requests.push({
      ...(info.provider === undefined ? {} : { provider: info.provider }),
      ...(info.cost === undefined ? {} : { cost: info.cost }),
      ...(info.reasoningTokens === undefined ? {} : { reasoningTokens: info.reasoningTokens }),
      finishReason: info.finishReason,
    });
    input.onVerifierStep?.(info);
  };

  let output: VerificationOutput = { verdicts: [] };
  const started = performance.now();
  if (sent.length > 0) {
    const verify =
      input.verifier ??
      (input.createVerifier ?? createVerifier)({
        apiKey: input.apiKey,
        model: input.model,
        onStepEnd: observe,
        onOutputRepair: input.onOutputRepair,
      }).verify;
    output = await withOneRetry(
      () =>
        verify(
          { findings: sent, blocks: plan.blocks, perFinding: plan.perFinding },
          { timeoutMs: input.timeoutMs ?? DEFAULT_VERIFIER_TIMEOUT_MS },
        ),
      { sleep: input.sleep, onRetry: input.onRetry },
    );
  }
  telemetry.latencyMs = Math.round(performance.now() - started);

  const applied = applyVerdicts({ findings, plan, output });
  return {
    published: applied.published,
    verification: {
      status: "verified",
      ...(sent.length > 0 ? { model: input.model } : {}),
      verdicts: applied.records,
      unknownVerdictIds: applied.unknownVerdictIds,
      excerpts: plan.telemetry,
    },
    ...(telemetry.attempts > 0 ? { verifierTelemetry: telemetry } : {}),
  };
}

interface ImplReviewPassInput {
  input: PipelineInput;
  plan: { plan: string; truncated: boolean } | undefined;
  /** The code review's own verdict — the gate's input, never the pass's. */
  codeReviewVerdict: JudgeResult["verdict"];
  /** The already-capped diff — the pass judges exactly what the finder saw. */
  diff: string;
  /** Whether that capping actually cut anything, so the pass can be told. */
  diffTruncated: boolean;
  apiKey: string | undefined;
  model: string;
  timeoutMs: number;
  retryOptions: { sleep?: (ms: number) => Promise<void>; onRetry: (error: unknown, delayMs: number) => void };
}

/**
 * The third pass, fully isolated.
 *
 * Two guarantees hold here and are worth stating because both are easy to
 * lose in a refactor:
 *
 * 1. No plan → no call, and no `implReview` key at all. Absence IS the no-plan
 *    signal; there is no `skipped` shape to accidentally render as reviewed.
 * 2. A terminal failure NEVER propagates. This pass is advisory and lands
 *    after the judge, so throwing here would discard a complete, paid-for code
 *    review over an advisory extra. The failure becomes a rendered block
 *    instead — visible, but never fatal.
 */
async function runImplReviewPass(
  args: ImplReviewPassInput,
): Promise<{ implReview?: ImplReviewBlock; implReviewTelemetry?: ImplReviewTelemetry }> {
  const { input, plan } = args;
  if (plan === undefined || input.plan === undefined) return {};

  // Cost gate. Stated, never silent: rendering this as the no-plan section
  // would tell the reader something false about their own PR.
  if ((input.implReviewGate ?? "always") === "code-review-passed" && args.codeReviewVerdict !== "passed") {
    return {
      implReview: {
        status: "skipped",
        reason: "the code review did not pass, so the implementation review was not run",
      },
    };
  }

  // Accumulated across BOTH attempts of a retried run, same reasoning as the
  // finder's: it measures the run's real spend, not the surviving attempt's.
  const telemetry: ImplReviewTelemetry = { attempts: 0 };
  // Assigns only what the provider actually reported: `telemetry.cost =
  // undefined` would still CREATE the key, and an `"cost" in telemetry` check
  // downstream would then read an un-instrumented run as an instrumented one
  // that cost nothing.
  const accumulate = (key: "inputTokens" | "outputTokens" | "totalTokens" | "cost", next: number | undefined): void => {
    if (next === undefined) return;
    telemetry[key] = (telemetry[key] ?? 0) + next;
  };
  const observeStep = (step: StepResult<ToolSet>): void => {
    telemetry.attempts += 1;
    accumulate("inputTokens", step.usage.inputTokens);
    accumulate("outputTokens", step.usage.outputTokens);
    accumulate("totalTokens", step.usage.totalTokens);
    accumulate("cost", asStepCost(step.providerMetadata));
  };

  // Telemetry survives the catch: a failed pass still spent provider money on
  // the attempts it made, and dropping that would understate the run's cost
  // exactly when someone is investigating why it failed.
  const withTelemetry = <T extends { implReview?: ImplReviewBlock }>(result: T) => ({
    ...result,
    ...(telemetry.attempts > 0 ? { implReviewTelemetry: telemetry } : {}),
  });

  try {
    // CONSTRUCTION IS INSIDE THE GUARD ON PURPOSE. createImplReviewer throws on
    // an unresolvable API key, and this pass runs after a completed, paid-for
    // code review — a throw here would discard that review over an advisory
    // extra. Every way this pass can fail has to degrade to the failed block.
    const factory = input.deps?.createImplReviewer ?? createImplReviewer;
    const implReview =
      input.deps?.implReviewer ??
      factory({ apiKey: args.apiKey, model: args.model, onStepEnd: observeStep }).implReview;

    const result = await withOneRetry(
      () =>
        implReview(
          {
            plan: plan.plan,
            diff: args.diff,
            ...(input.plan?.path === undefined ? {} : { planPath: input.plan.path }),
            ...(plan.truncated ? { planTruncated: true } : {}),
            // args.diff above is already the CAPPED diff, so this pass has always
            // been reading a truncated view — it just was not told. The flag is
            // what separates "the plan's work is absent" from "absent from the
            // 100 KB we showed you".
            ...(args.diffTruncated ? { diffTruncated: true } : {}),
          },
          { timeoutMs: args.timeoutMs },
        ),
      args.retryOptions,
    );
    return withTelemetry({
      implReview: {
        status: "reviewed",
        ...(input.plan.path === undefined ? {} : { planPath: input.plan.path }),
        ...result,
      },
    });
  } catch (error) {
    return withTelemetry({
      implReview: { status: "failed", error: error instanceof Error ? error.message : String(error) },
    });
  }
}
