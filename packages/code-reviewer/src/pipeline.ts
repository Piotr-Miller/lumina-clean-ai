import type { ProviderMetadata, StepResult, ToolSet } from "ai";

import { resolveModels } from "./config.js";
import { mergeFindings } from "./findings.js";
import {
  createImplReviewer,
  type ImplReviewCallOptions,
  type ImplReviewer,
  type ImplReviewerOptions,
} from "./impl-reviewer.js";
import { createJudge, type Judge, type JudgeCallOptions, type JudgeOptions } from "./judge.js";
import { truncationMetadataPayload, type ImplReviewPromptInput, type JudgePromptInput } from "./prompts.js";
import { withOneRetry } from "./retry.js";
import {
  createReviewer,
  type ReviewCallOptions,
  type Reviewer,
  type ReviewerOptions,
  type SourceProvider,
} from "./reviewer.js";
import { assignFindingIds } from "./scorecard.js";
import type {
  DiffStats,
  FinderTelemetry,
  ImplReviewBlock,
  ImplReviewResult,
  ImplReviewTelemetry,
  JudgeResult,
  JudgeTelemetry,
  PipelineResult,
  ReviewResult,
  ReviewUnit,
} from "./schemas.js";

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

export interface PipelineTimeouts {
  finderTimeoutMs?: number;
  judgeTimeoutMs?: number;
  implReviewTimeoutMs?: number;
}

// Same guard style as reviewer.ts's maxSteps: a zero, negative, fractional,
// or non-finite budget would silently disable the bound.
function resolveTimeouts(overrides: PipelineTimeouts = {}): Required<PipelineTimeouts> {
  const finderTimeoutMs = overrides.finderTimeoutMs ?? DEFAULT_FINDER_TIMEOUT_MS;
  const judgeTimeoutMs = overrides.judgeTimeoutMs ?? DEFAULT_JUDGE_TIMEOUT_MS;
  const implReviewTimeoutMs = overrides.implReviewTimeoutMs ?? DEFAULT_IMPL_REVIEW_TIMEOUT_MS;
  for (const [name, value] of Object.entries({ finderTimeoutMs, judgeTimeoutMs, implReviewTimeoutMs })) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer (ms), got: ${String(value)}`);
    }
  }
  return { finderTimeoutMs, judgeTimeoutMs, implReviewTimeoutMs };
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

/**
 * Truncation facts for the finder's note (change r5-finder-truncation-note),
 * computed on the RAW diff against the production cap. `cutFile` is OMITTED —
 * never null — when the cut lands exactly between files or the text has no
 * parseable headers, matching ReviewUnit's optional-not-nullable field.
 * Git-quoted paths are reported verbatim as parsed, never decoded; the
 * prompt layer JSON-encodes them, which makes the quoting safe.
 */
export function truncationReport(rawDiff: string): {
  truncated: boolean;
  cutFile?: string;
  overCapFiles: string[];
} {
  const { truncated } = capDiff(rawDiff);
  const manifest = computeManifest(rawDiff, DIFF_CAP_BYTES);
  return {
    truncated,
    ...(manifest.cutFile === null ? {} : { cutFile: manifest.cutFile }),
    overCapFiles: manifest.overCap,
  };
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
export const asStepCost = (metadata: ProviderMetadata | undefined): number | undefined => {
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
  onRetry?: (pass: "finder" | "judge" | "impl-review", error: unknown, delayMs: number) => void;
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
  /**
   * The same signal for the JUDGE's response. Separate from onOutputRepair so a
   * log line names which pass drifted — they are different models and the
   * remedies differ.
   */
  onJudgeOutputRepair?: (detail: { reason: string }) => void;
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
  // Truncation facts for the finder's note (change r5-finder-truncation-note):
  // computed on the full ORDERED diff — the text the cap actually cut, so
  // cutFile/overCapFiles name what the finder cannot see — and only when the
  // cap fired, keyed off capDiff's own decision, never re-detected from the
  // capped text.
  const truncation = diffTruncated ? truncationReport(orderedDiff) : undefined;
  const { body: prBody, truncated: bodyTruncated } = capBody(input.prBody);
  // Capped here rather than at the CLI boundary so every embedder (promptfoo,
  // a future orchestrator) gets the same bound without re-deriving it.
  const plan = input.plan === undefined ? undefined : capPlan(input.plan.text);
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

  const retryOptions = (pass: "finder" | "judge" | "impl-review") => ({
    sleep: input.deps?.retrySleep,
    onRetry: (error: unknown, delayMs: number) => input.onRetry?.(pass, error, delayMs),
  });

  const reviewResult = await withOneRetry(
    () => finder({ kind: "diff", diff, ...(truncation ?? {}) }, { timeoutMs: timeouts.finderTimeoutMs }),
    retryOptions("finder"),
  );
  // reviewer.review already normalized; mergeFindings adds the dedup +
  // deterministic file/line/category sort that makes F1..Fn stable per run.
  const findings = assignFindingIds(mergeFindings(reviewResult.findings));

  const judgeResult = await withOneRetry(
    () => judge({ findings, prTitle: input.prTitle, prBody, diffStats }, { timeoutMs: timeouts.judgeTimeoutMs }),
    retryOptions("judge"),
  );

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
    findings,
    preDedupFindingCount: reviewResult.findings.length,
    scores: judgeResult.scores,
    verdict: judgeResult.verdict,
    verdictReason: judgeResult.verdictReason,
    diffStats,
    diffTruncated,
    // The exact fence payload the finder saw — truncation provenance for the
    // passive live check (r5-finder-truncation-note decision.md Disposition
    // #2, impl-review F1). Key absent when the cap did not fire, so an
    // untruncated review.json keeps its pre-feature shape.
    ...(truncation === undefined ? {} : { truncationMetadata: truncationMetadataPayload(truncation) }),
    bodyTruncated,
    // Key absent (not `false`) when the run had no plan, so a plan-less
    // review.json stays byte-identical to what shipped before this feature.
    ...(plan === undefined ? {} : { planTruncated: plan.truncated }),
    droppedFindingIdRefs: judgeResult.droppedFindingIdRefs,
    models: { finder: models.reviewModel, judge: models.judgeModel },
    // Key absent (not undefined-valued) when nothing was observed, so
    // review.json and `in` checks stay clean for injected-finder runs.
    ...(telemetry.steps > 0 ? { finderTelemetry: telemetry } : {}),
    ...(judgeTelemetry.attempts > 0 ? { judgeTelemetry } : {}),
    ...(implReview === undefined ? {} : { implReview }),
    ...(implReviewTelemetry === undefined ? {} : { implReviewTelemetry }),
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
