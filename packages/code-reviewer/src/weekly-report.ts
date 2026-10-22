import { z } from "zod";

import {
  implVerdictSchema,
  severitySchema,
  verdictSchema,
  type ImplVerdict,
  type PipelineResult,
  type Severity,
  type Verdict,
} from "./schemas.js";

// Pure core of the weekly ai-review report (change ai-review-weekly-report):
// raw run, artifact and reaction facts in, one typed WeeklyReport out. No IO —
// weekly-report-github.ts collects the facts, weekly-report-render.ts turns the
// report into markdown. Every rule here implements a row of the plan's
// Definitions table; the names below follow that table.

// --- Week windows ---

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/u;

export interface WeekWindow {
  week: string;
  /** Monday 00:00:00Z, inclusive. */
  start: Date;
  /** The next Monday 00:00:00Z, exclusive. */
  end: Date;
}

/** Monday of ISO week 1: the week that contains 4 January. */
const mondayOfWeekOne = (year: number): number => {
  const jan4 = Date.UTC(year, 0, 4);
  const weekday = (new Date(jan4).getUTCDay() + 6) % 7;
  return jan4 - weekday * DAY_MS;
};

/** The ISO year and week of a UTC instant; the week's Thursday decides the year. */
const isoWeekOf = (date: Date): { year: number; week: number } => {
  const weekday = (date.getUTCDay() + 6) % 7;
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const thursday = midnight + (3 - weekday) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  return { year, week: Math.floor((thursday - mondayOfWeekOne(year)) / WEEK_MS) + 1 };
};

/** 52 or 53: 28 December always falls in the year's last ISO week. */
const weeksInYear = (year: number): number => isoWeekOf(new Date(Date.UTC(year, 11, 28))).week;

const formatWeek = (year: number, week: number): string => `${String(year)}-W${String(week).padStart(2, "0")}`;

/**
 * `[Mon 00:00:00Z, next Mon 00:00:00Z)` for an ISO week. Throws on anything
 * that is not `YYYY-Www` and on a week the year does not have (W00, a W53 in a
 * 52-week year). Years before 1970 are refused: `Date.UTC` maps 0-99 onto the
 * 1900s, and no workflow run predates the epoch anyway.
 */
export function isoWeekWindow(week: string): WeekWindow {
  const match = WEEK_PATTERN.exec(week);
  if (match === null) throw new Error(`week must be an ISO week like 2026-W43, got: ${JSON.stringify(week)}`);
  const year = Number(match[1]);
  const number = Number(match[2]);
  if (year < 1970) throw new Error(`week ${week} is before 1970; no workflow run can belong to it`);
  const weeks = weeksInYear(year);
  if (number < 1 || number > weeks) {
    throw new Error(`week ${week} does not exist: ISO year ${String(year)} has weeks W01-W${String(weeks)}`);
  }
  const start = mondayOfWeekOne(year) + (number - 1) * WEEK_MS;
  return { week, start: new Date(start), end: new Date(start + WEEK_MS) };
}

/** The last complete ISO week before `now` — the scheduled run's default. */
export function previousCompleteWeek(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new Error("previousCompleteWeek needs a valid date");
  const { year, week } = isoWeekOf(new Date(now.getTime() - WEEK_MS));
  return formatWeek(year, week);
}

// --- review.json subset ---

/**
 * One pass's cost above this is not a plausible observed figure (a full run costs about $0.33), and an
 * unbounded value can sum to Infinity — a forged artifact is unreadable rather than a false alarm.
 */
export const MAX_PASS_COST_USD = 1000;

const telemetrySubset = z.object({ cost: z.number().nonnegative().max(MAX_PASS_COST_USD).optional() });

/**
 * The narrow slice of `PipelineResult` the report reads. review.json comes
 * from a run over PR-controlled content, so everything else — summary, finding
 * text, planPath — is stripped at parse time and can never reach the report.
 * Unknown keys are dropped, not rejected, so additive schema changes upstream
 * keep old and new artifacts readable.
 */
export const reviewJsonSubset = z.object({
  verdict: verdictSchema,
  findings: z.array(z.object({ severity: severitySchema })),
  preDedupFindingCount: z.number().int().nonnegative(),
  models: z.object({ finder: z.string(), judge: z.string() }),
  finderTelemetry: telemetrySubset.optional(),
  judgeTelemetry: telemetrySubset.optional(),
  implReviewTelemetry: telemetrySubset.optional(),
  implReview: z
    .discriminatedUnion("status", [
      z.object({ status: z.literal("reviewed"), verdict: implVerdictSchema, findings: z.array(z.unknown()) }),
      z.object({ status: z.literal("failed") }),
      z.object({ status: z.literal("skipped") }),
    ])
    .optional(),
});
export type ReviewJson = z.infer<typeof reviewJsonSubset>;

// Compile-time pin: what the pipeline writes must stay readable as the subset.
// A renamed or retyped field in PipelineResult breaks `typecheck` here instead
// of silently turning every run into "artifact unreadable".
type ReviewJsonSource = Pick<
  PipelineResult,
  | "verdict"
  | "findings"
  | "preDedupFindingCount"
  | "models"
  | "finderTelemetry"
  | "judgeTelemetry"
  | "implReviewTelemetry"
  | "implReview"
>;
type AssertAssignable<Source extends Target, Target> = Source extends Target ? true : never;
export type ReviewJsonSubsetPinned = AssertAssignable<ReviewJsonSource, ReviewJson>;

/** `undefined` for anything that is not JSON matching the subset. */
export function parseReviewJson(text: string): ReviewJson | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = reviewJsonSubset.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

// --- Raw facts (what the collector hands the core) ---

/**
 * What the collector learned about a run's `ai-review-output` artifact.
 * `absent` proves nothing: expired, deleted and never-uploaded artifacts all
 * look the same in the API.
 */
export type RawArtifact =
  /** One unambiguous artifact, downloaded; `text` is its review.json. */
  | { kind: "downloaded"; text: string }
  /** Listed, but the download failed, review.json was missing, or several snapshots made the choice ambiguous. */
  | { kind: "unreadable" }
  | { kind: "absent" };

/**
 * The docs-only skip predicate, evaluated on the SAME attempt's job steps.
 * `confirmed`: one successful ai-review job whose diff step succeeded and whose
 * AI review step was skipped. `not-skipped`: readable steps without that
 * predicate. `unavailable`: anything that could not be read or interpreted.
 */
export type SkipEvidence = "confirmed" | "not-skipped" | "unavailable";

export type AssociationFailure = "missing" | "ambiguous" | "lookup failed";
export type PrAssociation = { kind: "mapped"; pr: number } | { kind: "unavailable"; reason: AssociationFailure };

export interface RawRun {
  /** Workflow run ID — the accounting unit. */
  id: number;
  /** Original `created_at`; decides the cohort week for every attempt. */
  createdAt: string;
  /** As reported; anything but a positive integer is unknown attempt coverage. */
  runAttempt: number | null;
  status: string;
  conclusion: string | null;
  artifact: RawArtifact;
  /** Read only for a completed `success` with an absent artifact; missing means unavailable. */
  skipEvidence?: SkipEvidence;
  prAssociation: PrAssociation;
}

export interface RawReaction {
  /** Login of the reacting account; null for a deleted ("ghost") user. */
  user: string | null;
  content: string;
  createdAt: string;
}

/** Per mapped PR, as it stands at report time. */
export interface PrFacts {
  number: number;
  /** The PR's label names; null when the lookup failed. */
  labels: readonly string[] | null;
  sticky:
    | { kind: "found"; updatedAt: string; reactions: readonly RawReaction[] }
    | { kind: "none" }
    | { kind: "unavailable" };
}

// --- Run class ---

export type UnreportedReason =
  | "failure"
  | "cancelled"
  | "timed_out"
  | "other conclusion"
  | "artifact missing"
  | "artifact unreadable"
  | "skip evidence unavailable"
  | "still running";

export type RunClass =
  | { kind: "reviewed"; review: ReviewJson }
  | { kind: "no-review" }
  | { kind: "unreported"; reason: UnreportedReason }
  | { kind: "not-run" };

/**
 * One class per observed workflow snapshot (Definitions: Run class). A
 * readable review.json makes a run `reviewed` whatever its conclusion; $0 for
 * a success without an artifact needs positive skip evidence, never absence.
 */
export function classifyRun(run: RawRun): RunClass {
  if (run.status === "completed" && run.conclusion === "skipped") return { kind: "not-run" };
  if (run.artifact.kind === "downloaded") {
    const review = parseReviewJson(run.artifact.text);
    return review === undefined ? { kind: "unreported", reason: "artifact unreadable" } : { kind: "reviewed", review };
  }
  if (run.status !== "completed") return { kind: "unreported", reason: "still running" };
  if (run.artifact.kind === "unreadable") return { kind: "unreported", reason: "artifact unreadable" };
  switch (run.conclusion) {
    case "success":
      if (run.skipEvidence === "confirmed") return { kind: "no-review" };
      if (run.skipEvidence === "not-skipped") return { kind: "unreported", reason: "artifact missing" };
      return { kind: "unreported", reason: "skip evidence unavailable" };
    case "failure":
    case "cancelled":
    case "timed_out":
      return { kind: "unreported", reason: run.conclusion };
    default:
      return { kind: "unreported", reason: "other conclusion" };
  }
}

// --- Run cost ---

export type PassCost = { state: "reported"; cost: number } | { state: "unknown" } | { state: "not-run" };

export interface RunCost {
  /** Sum of the reported pass costs — observed provider-reported spend. */
  known: number;
  /**
   * A detected gap: an expected pass without cost, or contradictory pass and
   * telemetry facts. `false` means no DETECTED gap — never that every
   * provider request reported its cost.
   */
  partial: boolean;
  /** Telemetry for an impl pass that, by its own block, did not run. */
  contradictory: boolean;
  byPass: { finder: PassCost; judge: PassCost; impl: PassCost };
}

const expectedPass = (telemetry: { cost?: number } | undefined): PassCost =>
  telemetry?.cost === undefined ? { state: "unknown" } : { state: "reported", cost: telemetry.cost };

/**
 * Finder and judge always run for a reviewed artifact. Impl runs only when
 * implReview is `reviewed` or `failed`; absent (no plan) and `skipped` (gated
 * off) are not-run, and missing impl telemetry there is no gap. A reported 0
 * stays a known 0; a missing executed-pass cost is never substituted with 0.
 */
export function runCost(review: ReviewJson): RunCost {
  const finder = expectedPass(review.finderTelemetry);
  const judge = expectedPass(review.judgeTelemetry);
  const implRan = review.implReview !== undefined && review.implReview.status !== "skipped";
  const implTelemetry = review.implReviewTelemetry;
  const contradictory = !implRan && implTelemetry !== undefined;
  const impl: PassCost = implRan || contradictory ? expectedPass(implTelemetry) : { state: "not-run" };
  const passes = [finder, judge, impl];
  const known = passes.reduce((sum, pass) => (pass.state === "reported" ? sum + pass.cost : sum), 0);
  const partial = contradictory || passes.some((pass) => pass.state === "unknown");
  return { known, partial, contradictory, byPass: { finder, judge, impl } };
}

// --- Attempt coverage ---

export type AttemptCoverage =
  { kind: "complete" } | { kind: "gap"; runAttempt: number; unobserved: number } | { kind: "unknown" };

/** A valid run_attempt n hides n-1 earlier attempts; anything else is unknown, never 1. */
export function attemptCoverage(runAttempt: number | null): AttemptCoverage {
  if (runAttempt === null || !Number.isSafeInteger(runAttempt) || runAttempt < 1) return { kind: "unknown" };
  return runAttempt === 1 ? { kind: "complete" } : { kind: "gap", runAttempt, unobserved: runAttempt - 1 };
}

// --- Owner reaction ---

export interface ReactionState {
  state: "up" | "down" | "mixed" | "unrated";
  /** Every counted owner reaction predates the comment's last rewrite. */
  stale: boolean;
}

/**
 * The owner's 👍/👎 on one sticky comment as it stands now. Logins compare
 * case-insensitively, as GitHub's do. A reaction whose timestamp cannot be
 * read cannot prove it judged the current text, so it counts as stale.
 */
export function reactionState(
  reactions: readonly RawReaction[],
  owner: string,
  commentUpdatedAt: string,
): ReactionState {
  const ownerLogin = owner.toLowerCase();
  const counted = reactions.filter(
    (reaction) =>
      reaction.user !== null &&
      reaction.user.toLowerCase() === ownerLogin &&
      (reaction.content === "+1" || reaction.content === "-1"),
  );
  const up = counted.some((reaction) => reaction.content === "+1");
  const down = counted.some((reaction) => reaction.content === "-1");
  const state = up && down ? "mixed" : up ? "up" : down ? "down" : "unrated";
  const updatedAt = Date.parse(commentUpdatedAt);
  const stale =
    counted.length > 0 &&
    counted.every((reaction) => {
      const givenAt = Date.parse(reaction.createdAt);
      return Number.isNaN(givenAt) || Number.isNaN(updatedAt) || givenAt < updatedAt;
    });
  return { state, stale };
}

// --- Thresholds ---

export const ALARM_USD_VARIABLE = "AI_REVIEW_WEEKLY_ALARM_USD";
export const ALARM_UNREPORTED_VARIABLE = "AI_REVIEW_WEEKLY_ALARM_UNREPORTED";
export const DEFAULT_ALARM_USD = 10;
export const DEFAULT_ALARM_UNREPORTED = 5;

export interface ThresholdWarning {
  variable: string;
  rejected: string;
  fallback: number;
}

export interface Thresholds {
  /** Fires when known spend is strictly greater. */
  usd: number;
  /** Fires when distinct coverage-gap workflow IDs reach it. */
  unreported: number;
  warnings: ThresholdWarning[];
}

/**
 * Unset or empty means the default, silently — an undefined repo variable
 * reaches the job as "". Anything else that is not a non-negative decimal
 * (USD) or a positive integer (count) falls back to the default with a
 * warning naming the variable and the rejected value. A count of 0 would
 * fire on every week, gap or not, so it is rejected; 1 means "any gap".
 */
export function parseThresholds(env: Record<string, string | undefined>): Thresholds {
  const warnings: ThresholdWarning[] = [];
  const read = (variable: string, pattern: RegExp, fallback: number, min: number): number => {
    const raw = env[variable];
    if (raw === undefined || raw.trim() === "") return fallback;
    const value = Number(raw.trim());
    if (pattern.test(raw.trim()) && Number.isFinite(value) && value >= min && value <= Number.MAX_SAFE_INTEGER) {
      return value;
    }
    warnings.push({ variable, rejected: raw, fallback });
    return fallback;
  };
  const usd = read(ALARM_USD_VARIABLE, /^\d+(\.\d+)?$/u, DEFAULT_ALARM_USD, 0);
  const unreported = read(ALARM_UNREPORTED_VARIABLE, /^\d+$/u, DEFAULT_ALARM_UNREPORTED, 1);
  return { usd, unreported, warnings };
}

// --- Alarm ---

export type AlarmTrigger =
  | { kind: "spend"; knownSpend: number; threshold: number }
  | { kind: "coverage"; coverageGapWorkflows: number; unreportedWorkflows: number; threshold: number };

export interface AlarmDecision {
  fired: boolean;
  triggers: AlarmTrigger[];
}

/** Rounded to the micro-dollar the report displays, so float noise cannot fire an alarm the text contradicts. */
export const roundUsd = (value: number): number => Math.round(value * 1e6) / 1e6;

export function decideAlarm(
  report: Pick<WeeklyReport, "spend" | "coverageGapWorkflows" | "counts">,
  thresholds: Pick<Thresholds, "usd" | "unreported">,
): AlarmDecision {
  const triggers: AlarmTrigger[] = [];
  const knownSpend = roundUsd(report.spend.known);
  const usdThreshold = roundUsd(thresholds.usd);
  if (knownSpend > usdThreshold) triggers.push({ kind: "spend", knownSpend, threshold: usdThreshold });
  if (report.coverageGapWorkflows >= thresholds.unreported) {
    triggers.push({
      kind: "coverage",
      coverageGapWorkflows: report.coverageGapWorkflows,
      unreportedWorkflows: report.counts.unreported,
      threshold: thresholds.unreported,
    });
  }
  return { fired: triggers.length > 0, triggers };
}

// --- Aggregation ---

export type ImplOutcome = ImplVerdict | "failed" | "skipped" | "no plan";
export type LabelState = "passed" | "failed" | "none" | "both" | "unavailable";
export type ReactionCell = ({ kind: "rated" } & ReactionState) | { kind: "no comment" } | { kind: "lookup failed" };

export interface SpendSummary {
  known: number;
  /** Something counted is unreported, partial, or has incomplete/unknown attempt coverage. */
  incomplete: boolean;
  /** At least one observed figure exists (a reported pass cost, or an observed $0 attempt). */
  hasKnown: boolean;
}

export interface FindingTotals {
  critical: number;
  major: number;
  minor: number;
  nit: number;
  preDedup: number;
  impl: number;
}

export interface PassTotal {
  known: number;
  reported: number;
  unknown: number;
  notRun: number;
}

export interface ReportRun {
  id: number;
  createdAt: string;
  runAttempt: number | null;
  status: string;
  conclusion: string | null;
  runClass: RunClass;
  /** Present for reviewed runs only. */
  cost?: RunCost;
  attempts: AttemptCoverage;
  association: PrAssociation;
  spend: SpendSummary;
  /** Unreported, or incomplete/unknown attempt coverage — one alarm contributor at most. */
  coverageGap: boolean;
}

export interface LatestSnapshot {
  runId: number;
  verdict: Verdict;
  impl: ImplOutcome;
  findings: FindingTotals;
}

export interface PrRow {
  pr: number;
  /** Non-not-run workflow IDs mapped to this PR. */
  runs: number;
  spend: SpendSummary;
  latest?: LatestSnapshot;
  label: LabelState;
  /** Absent when the PR had no reviewed run in the cohort. */
  reaction?: ReactionCell;
}

export interface WeeklyReport {
  week: string;
  window: { start: Date; end: Date };
  observedAt: Date;
  /** Observed before the week ended: figures are a cut-off, not final. */
  partialWeek: boolean;
  runs: ReportRun[];
  counts: {
    workflows: number;
    reviewed: number;
    noReview: number;
    unreported: number;
    notRun: number;
    partial: number;
  };
  spend: SpendSummary;
  byPass: { finder: PassTotal; judge: PassTotal; impl: PassTotal };
  verdictMix: Record<Verdict, number>;
  implMix: Record<ImplOutcome, number>;
  labelMix: Record<LabelState, number>;
  findings: FindingTotals;
  prs: PrRow[];
  unreportedRuns: ReportRun[];
  /** Runs with earlier unobserved attempts or unknown attempt metadata. */
  attemptGapRuns: ReportRun[];
  unobservedAttempts: number;
  /** |{unreported} ∪ {incomplete/unknown attempt coverage}| — the alarm's count. */
  coverageGapWorkflows: number;
  unmappedRuns: ReportRun[];
  /** An eligible (non-not-run) run could not be mapped, so labels and reactions miss it. */
  prCoverageIncomplete: boolean;
  models: { finder: string[]; judge: string[] };
  /** Run IDs whose created_at could not be read, so no week could own them. */
  invalidCreatedAt: number[];
  /** Rows whose run ID is not a positive safe integer: they cannot be linked or deduplicated, so none is counted. */
  invalidRunIds: number;
  thresholds: Thresholds;
  alarm: AlarmDecision;
}

export interface WeekInput {
  week: string;
  observedAt: Date;
  owner: string;
  runs: readonly RawRun[];
  prs: readonly PrFacts[];
  thresholds: Thresholds;
}

const emptyFindings = (): FindingTotals => ({ critical: 0, major: 0, minor: 0, nit: 0, preDedup: 0, impl: 0 });

const addFindings = (into: FindingTotals, review: ReviewJson): void => {
  for (const finding of review.findings) into[finding.severity satisfies Severity] += 1;
  into.preDedup += review.preDedupFindingCount;
  if (review.implReview?.status === "reviewed") into.impl += review.implReview.findings.length;
};

const findingsOf = (review: ReviewJson): FindingTotals => {
  const totals = emptyFindings();
  addFindings(totals, review);
  return totals;
};

const implOutcome = (review: ReviewJson): ImplOutcome => {
  const block = review.implReview;
  if (block === undefined) return "no plan";
  return block.status === "reviewed" ? block.verdict : block.status;
};

const labelState = (labels: readonly string[] | null): LabelState => {
  if (labels === null) return "unavailable";
  const passed = labels.includes("ai-cr:passed");
  const failed = labels.includes("ai-cr:failed");
  return passed && failed ? "both" : passed ? "passed" : failed ? "failed" : "none";
};

const sumSpend = (parts: readonly SpendSummary[]): SpendSummary => ({
  known: parts.reduce((sum, part) => sum + part.known, 0),
  incomplete: parts.some((part) => part.incomplete),
  hasKnown: parts.some((part) => part.hasKnown),
});

const runSpend = (runClass: RunClass, cost: RunCost | undefined, attempts: AttemptCoverage): SpendSummary => {
  const attemptGap = attempts.kind !== "complete";
  switch (runClass.kind) {
    case "reviewed":
      return {
        known: cost?.known ?? 0,
        incomplete: (cost?.partial ?? true) || attemptGap,
        hasKnown: cost !== undefined && Object.values(cost.byPass).some((pass) => pass.state === "reported"),
      };
    case "no-review":
    case "not-run":
      // $0 for the observed attempt only; earlier unobserved attempts keep it a lower bound.
      return { known: 0, incomplete: attemptGap, hasKnown: true };
    case "unreported":
      return { known: 0, incomplete: true, hasKnown: false };
  }
};

/** Greatest original created_at wins; a tie goes to the greatest numeric run ID. Input order never matters. */
const isLater = (candidate: ReportRun, current: ReportRun): boolean => {
  const byTime = Date.parse(candidate.createdAt) - Date.parse(current.createdAt);
  return byTime === 0 ? candidate.id > current.id : byTime > 0;
};

/**
 * One entry per workflow ID: the highest observed attempt, then a downloaded artifact, then input order.
 * An unknown run_attempt on any row for the ID keeps the entry's coverage unknown — a duplicate row that
 * claims attempt 1 never turns missing metadata into complete coverage.
 */
const dedupeRuns = (runs: readonly RawRun[]): RawRun[] => {
  const byId = new Map<number, RawRun>();
  const unknownAttempt = new Set<number>();
  const rank = (run: RawRun): number => {
    const attempt = attemptCoverage(run.runAttempt);
    return attempt.kind === "gap" ? attempt.runAttempt : attempt.kind === "complete" ? 1 : 0;
  };
  for (const run of runs) {
    if (attemptCoverage(run.runAttempt).kind === "unknown") unknownAttempt.add(run.id);
    const current = byId.get(run.id);
    if (
      current === undefined ||
      rank(run) > rank(current) ||
      (rank(run) === rank(current) && run.artifact.kind === "downloaded" && current.artifact.kind !== "downloaded")
    ) {
      byId.set(run.id, run);
    }
  }
  return [...byId.values()].map((run) => (unknownAttempt.has(run.id) ? { ...run, runAttempt: null } : run));
};

const normalizeAssociation = (association: PrAssociation): PrAssociation =>
  association.kind === "mapped" && !(Number.isSafeInteger(association.pr) && association.pr > 0)
    ? { kind: "unavailable", reason: "lookup failed" }
    : association;

const passTotal = (runs: readonly ReportRun[], pass: "finder" | "judge" | "impl"): PassTotal => {
  const total: PassTotal = { known: 0, reported: 0, unknown: 0, notRun: 0 };
  for (const run of runs) {
    if (run.cost === undefined) continue;
    const cost = run.cost.byPass[pass];
    if (cost.state === "reported") {
      total.known += cost.cost;
      total.reported += 1;
    } else if (cost.state === "unknown") {
      total.unknown += 1;
    } else {
      total.notRun += 1;
    }
  }
  return total;
};

/**
 * The cohort is every distinct workflow ID created inside the week, whenever
 * its attempts ran; at most one observed snapshot per ID is counted, and
 * nothing is summed across attempts.
 */
export function aggregateWeek(input: WeekInput): WeeklyReport {
  const window = isoWeekWindow(input.week);
  const invalidCreatedAt: number[] = [];
  const validIds = input.runs.filter((run) => Number.isSafeInteger(run.id) && run.id > 0);
  const inWindow = dedupeRuns(validIds).filter((run) => {
    const created = Date.parse(run.createdAt);
    if (Number.isNaN(created)) {
      invalidCreatedAt.push(run.id);
      return false;
    }
    return created >= window.start.getTime() && created < window.end.getTime();
  });

  const runs: ReportRun[] = inWindow
    .map((raw) => {
      const runClass = classifyRun(raw);
      const cost = runClass.kind === "reviewed" ? runCost(runClass.review) : undefined;
      const attempts = attemptCoverage(raw.runAttempt);
      return {
        id: raw.id,
        createdAt: raw.createdAt,
        runAttempt: raw.runAttempt,
        status: raw.status,
        conclusion: raw.conclusion,
        runClass,
        ...(cost === undefined ? {} : { cost }),
        attempts,
        association: normalizeAssociation(raw.prAssociation),
        spend: runSpend(runClass, cost, attempts),
        coverageGap: runClass.kind === "unreported" || attempts.kind !== "complete",
      };
    })
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);

  const reviewed = runs.filter((run) => run.runClass.kind === "reviewed");
  const reviewOf = (run: ReportRun): ReviewJson | undefined =>
    run.runClass.kind === "reviewed" ? run.runClass.review : undefined;

  const findings = emptyFindings();
  const verdictMix: Record<Verdict, number> = { passed: 0, failed: 0 };
  const implMix: Record<ImplOutcome, number> = {
    APPROVED: 0,
    NEEDS_ATTENTION: 0,
    REJECTED: 0,
    failed: 0,
    skipped: 0,
    "no plan": 0,
  };
  const finderModels = new Set<string>();
  const judgeModels = new Set<string>();
  for (const run of reviewed) {
    const review = reviewOf(run);
    if (review === undefined) continue;
    addFindings(findings, review);
    verdictMix[review.verdict] += 1;
    implMix[implOutcome(review)] += 1;
    finderModels.add(review.models.finder);
    judgeModels.add(review.models.judge);
  }

  const factsByPr = new Map(input.prs.map((facts) => [facts.number, facts]));
  const runsByPr = new Map<number, ReportRun[]>();
  for (const run of runs) {
    if (run.association.kind !== "mapped") continue;
    const list = runsByPr.get(run.association.pr) ?? [];
    list.push(run);
    runsByPr.set(run.association.pr, list);
  }

  const labelMix: Record<LabelState, number> = { passed: 0, failed: 0, none: 0, both: 0, unavailable: 0 };
  const prs: PrRow[] = [];
  for (const [pr, prRuns] of runsByPr) {
    const eligible = prRuns.filter((run) => run.runClass.kind !== "not-run");
    if (eligible.length === 0) continue;
    const facts = factsByPr.get(pr);
    const label = labelState(facts?.labels ?? null);
    labelMix[label] += 1;

    let latest: ReportRun | undefined;
    for (const run of prRuns) {
      if (run.runClass.kind === "reviewed" && (latest === undefined || isLater(run, latest))) latest = run;
    }
    const latestReview = latest === undefined ? undefined : reviewOf(latest);

    let reaction: ReactionCell | undefined;
    if (latest !== undefined) {
      const sticky = facts?.sticky ?? { kind: "unavailable" };
      reaction =
        sticky.kind === "found"
          ? { kind: "rated", ...reactionState(sticky.reactions, input.owner, sticky.updatedAt) }
          : sticky.kind === "none"
            ? { kind: "no comment" }
            : { kind: "lookup failed" };
    }

    prs.push({
      pr,
      runs: eligible.length,
      spend: sumSpend(prRuns.map((run) => run.spend)),
      ...(latest === undefined || latestReview === undefined
        ? {}
        : {
            latest: {
              runId: latest.id,
              verdict: latestReview.verdict,
              impl: implOutcome(latestReview),
              findings: findingsOf(latestReview),
            },
          }),
      label,
      ...(reaction === undefined ? {} : { reaction }),
    });
  }
  prs.sort((a, b) => a.pr - b.pr);

  const unmappedRuns = runs.filter((run) => run.association.kind === "unavailable");
  const attemptGapRuns = runs.filter((run) => run.attempts.kind !== "complete");
  const counts = {
    workflows: runs.length,
    reviewed: reviewed.length,
    noReview: runs.filter((run) => run.runClass.kind === "no-review").length,
    unreported: runs.filter((run) => run.runClass.kind === "unreported").length,
    notRun: runs.filter((run) => run.runClass.kind === "not-run").length,
    partial: reviewed.filter((run) => run.cost?.partial === true).length,
  };
  const spend = sumSpend(runs.map((run) => run.spend));
  const coverageGapWorkflows = runs.filter((run) => run.coverageGap).length;

  return {
    week: window.week,
    window: { start: window.start, end: window.end },
    observedAt: input.observedAt,
    partialWeek: input.observedAt.getTime() < window.end.getTime(),
    runs,
    counts,
    spend,
    byPass: { finder: passTotal(runs, "finder"), judge: passTotal(runs, "judge"), impl: passTotal(runs, "impl") },
    verdictMix,
    implMix,
    labelMix,
    findings,
    prs,
    unreportedRuns: runs.filter((run) => run.runClass.kind === "unreported"),
    attemptGapRuns,
    unobservedAttempts: attemptGapRuns.reduce(
      (sum, run) => sum + (run.attempts.kind === "gap" ? run.attempts.unobserved : 0),
      0,
    ),
    coverageGapWorkflows,
    unmappedRuns,
    prCoverageIncomplete: unmappedRuns.some((run) => run.runClass.kind !== "not-run"),
    models: { finder: [...finderModels].sort(), judge: [...judgeModels].sort() },
    invalidCreatedAt: invalidCreatedAt.sort((a, b) => a - b),
    invalidRunIds: input.runs.length - validIds.length,
    thresholds: input.thresholds,
    alarm: decideAlarm({ spend, coverageGapWorkflows, counts }, input.thresholds),
  };
}
