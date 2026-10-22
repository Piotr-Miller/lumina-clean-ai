import { describe, expect, it } from "vitest";

import type { Severity } from "./schemas.js";
import {
  aggregateWeek,
  attemptCoverage,
  classifyRun,
  decideAlarm,
  DEFAULT_ALARM_UNREPORTED,
  DEFAULT_ALARM_USD,
  isoWeekWindow,
  MAX_PASS_COST_USD,
  parseReviewJson,
  parseThresholds,
  previousCompleteWeek,
  reactionState,
  runCost,
  type PrFacts,
  type RawRun,
  type ReviewJson,
  type WeekInput,
} from "./weekly-report.js";

// Fixtures follow the plan's Definitions walk-through: week 2026-W43
// (Mon 2026-10-19 .. Mon 2026-10-26), runs A-H on PRs #301-#304, and the
// independent PR-resolution (I, J), attempt (K, L, M) and latest-selection
// (N, O) fixtures.

const W43 = "2026-W43";
const OWNER = "Piotr-Miller";
const AFTER_W43 = new Date("2026-10-26T06:00:00Z");

interface ReviewSpec {
  verdict?: "passed" | "failed";
  findings?: Severity[];
  preDedup?: number;
  /** undefined → telemetry object absent; null → telemetry present without cost. */
  finder?: number | null;
  judge?: number | null;
  impl?: number | null;
  implReview?: "none" | "reviewed" | "failed" | "skipped";
  implVerdict?: "APPROVED" | "NEEDS_ATTENTION" | "REJECTED";
  implFindings?: number;
  models?: { finder: string; judge: string };
  extra?: Record<string, unknown>;
}

const telemetry = (cost: number | null | undefined): Record<string, unknown> | undefined =>
  cost === undefined ? undefined : cost === null ? { attempts: 1 } : { attempts: 1, cost };

const reviewText = (spec: ReviewSpec): string => {
  const implStatus = spec.implReview ?? "none";
  const implReview =
    implStatus === "none"
      ? undefined
      : implStatus === "reviewed"
        ? {
            status: "reviewed",
            verdict: spec.implVerdict ?? "APPROVED",
            verdictReason: "ok",
            grades: {},
            findings: Array.from({ length: spec.implFindings ?? 0 }, (_, i) => ({ id: `P${String(i + 1)}` })),
          }
        : implStatus === "failed"
          ? { status: "failed", error: "boom" }
          : { status: "skipped", reason: "gated" };
  const findings = spec.findings ?? [];
  return JSON.stringify({
    summary: "overall",
    findings: findings.map((severity, i) => ({ id: `F${String(i + 1)}`, severity, description: "d" })),
    preDedupFindingCount: spec.preDedup ?? findings.length,
    verdict: spec.verdict ?? "passed",
    verdictReason: "reason",
    models: spec.models ?? { finder: "deepseek/deepseek-v4-flash", judge: "anthropic/claude-sonnet-5" },
    finderTelemetry: telemetry(spec.finder),
    judgeTelemetry: telemetry(spec.judge),
    implReviewTelemetry: telemetry(spec.impl),
    implReview,
    ...spec.extra,
  });
};

const reviewed = (spec: ReviewSpec): RawRun["artifact"] => ({ kind: "downloaded", text: reviewText(spec) });

const run = (id: number, createdAt: string, overrides: Partial<RawRun> = {}): RawRun => ({
  id,
  createdAt,
  runAttempt: 1,
  status: "completed",
  conclusion: "success",
  artifact: { kind: "absent" },
  prAssociation: { kind: "mapped", pr: 301 },
  ...overrides,
});

const parsed = (spec: ReviewSpec): ReviewJson => {
  const review = parseReviewJson(reviewText(spec));
  if (review === undefined) throw new Error("fixture review did not parse");
  return review;
};

// --- The Definitions dataset ---

const A = run(1001, "2026-10-20T10:00:00Z", {
  artifact: reviewed({ finder: 0.04, judge: 0.01, impl: 0.05, implReview: "reviewed", findings: ["minor"] }),
});
const B = run(1002, "2026-10-22T10:00:00Z", {
  artifact: reviewed({ verdict: "failed", finder: null, judge: 0.03, findings: ["major", "minor"], preDedup: 3 }),
});
const C = run(1003, "2026-10-21T09:00:00Z", { conclusion: "failure", prAssociation: { kind: "mapped", pr: 302 } });
const D = run(1004, "2026-10-21T11:00:00Z", { skipEvidence: "confirmed", prAssociation: { kind: "mapped", pr: 303 } });
const E = run(1005, "2026-10-21T12:00:00Z", {
  skipEvidence: "not-skipped",
  prAssociation: { kind: "mapped", pr: 304 },
});
const F = run(1006, "2026-10-22T10:01:00Z", { conclusion: "skipped" });
const G = run(1007, "2026-10-25T23:59:59Z", { artifact: reviewed({ finder: 0.01, judge: 0.01 }) });
const H = run(1008, "2026-10-26T00:00:00Z", { artifact: reviewed({ finder: 0.01, judge: 0.01 }) });

const prFacts: PrFacts[] = [
  {
    number: 301,
    labels: ["ai-cr:failed", "status:ready"],
    sticky: {
      kind: "found",
      updatedAt: "2026-10-22T10:05:00Z",
      reactions: [
        { user: OWNER, content: "+1", createdAt: "2026-10-20T12:00:00Z" },
        { user: "someone-else", content: "-1", createdAt: "2026-10-22T11:00:00Z" },
      ],
    },
  },
  { number: 302, labels: [], sticky: { kind: "none" } },
  { number: 303, labels: [], sticky: { kind: "none" } },
  {
    number: 304,
    labels: ["ai-cr:passed"],
    sticky: { kind: "found", updatedAt: "2026-10-21T12:05:00Z", reactions: [] },
  },
];

const input = (runs: RawRun[], overrides: Partial<WeekInput> = {}): WeekInput => ({
  week: W43,
  observedAt: AFTER_W43,
  owner: OWNER,
  runs,
  prs: prFacts,
  thresholds: parseThresholds({}),
  ...overrides,
});

const dataset = [A, B, C, D, E, F];

describe("week window", () => {
  it("places G (Sun 23:59:59Z) in W43 and H (Mon 00:00:00Z) in W44", () => {
    const w43 = aggregateWeek(input([G, H]));
    const w44 = aggregateWeek(input([G, H], { week: "2026-W44", observedAt: new Date("2026-11-02T06:00:00Z") }));
    expect(w43.runs.map((r) => r.id)).toEqual([G.id]);
    expect(w44.runs.map((r) => r.id)).toEqual([H.id]);
  });

  it("spans exactly [Mon 00:00:00Z, next Mon 00:00:00Z)", () => {
    const window = isoWeekWindow(W43);
    expect(window.start.toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("handles the ISO year rollover", () => {
    // 2026-W01 starts in December 2025; 2026 has 53 weeks and 2027-01-01 is in 2026-W53.
    expect(isoWeekWindow("2026-W01").start.toISOString()).toBe("2025-12-29T00:00:00.000Z");
    expect(isoWeekWindow("2026-W53").end.toISOString()).toBe("2027-01-04T00:00:00.000Z");
    expect(previousCompleteWeek(new Date("2026-01-04T12:00:00Z"))).toBe("2025-W52");
    expect(previousCompleteWeek(new Date("2027-01-04T06:00:00Z"))).toBe("2026-W53");
    expect(previousCompleteWeek(new Date("2027-01-03T23:59:59Z"))).toBe("2026-W52");
  });

  it("defaults to the last complete week", () => {
    expect(previousCompleteWeek(new Date("2026-10-26T06:00:00Z"))).toBe("2026-W43");
    expect(previousCompleteWeek(new Date("2026-10-25T23:59:59Z"))).toBe("2026-W42");
  });

  it("throws on malformed or non-existent weeks", () => {
    expect(() => isoWeekWindow("2026-43")).toThrow(/ISO week/u);
    expect(() => isoWeekWindow("2026-W00")).toThrow(/does not exist/u);
    expect(() => isoWeekWindow("2025-W53")).toThrow(/does not exist/u);
    expect(() => isoWeekWindow("2026-W43; rm -rf")).toThrow(/ISO week/u);
    expect(isoWeekWindow("2020-W53").week).toBe("2020-W53");
  });

  it("marks an unfinished week partial and carries the observation timestamp", () => {
    const early = aggregateWeek(input(dataset, { observedAt: new Date("2026-10-22T12:00:00Z") }));
    const later = aggregateWeek(input(dataset, { observedAt: new Date("2026-10-27T08:00:00Z") }));
    expect(early.partialWeek).toBe(true);
    expect(later.partialWeek).toBe(false);
    expect(later.observedAt.getTime()).toBeGreaterThan(early.observedAt.getTime());
  });
});

describe("classifyRun", () => {
  it("classifies runs A-F per the Definitions", () => {
    expect(classifyRun(A).kind).toBe("reviewed");
    expect(classifyRun(B).kind).toBe("reviewed");
    expect(classifyRun(C)).toEqual({ kind: "unreported", reason: "failure" });
    expect(classifyRun(D)).toEqual({ kind: "no-review" });
    expect(classifyRun(E)).toEqual({ kind: "unreported", reason: "artifact missing" });
    expect(classifyRun(F)).toEqual({ kind: "not-run" });
  });

  it("never treats a success without an artifact as $0 unless the skip is positively confirmed", () => {
    const absent = run(2001, "2026-10-21T00:00:00Z");
    expect(classifyRun(absent)).toEqual({ kind: "unreported", reason: "skip evidence unavailable" });
    expect(classifyRun({ ...absent, skipEvidence: "unavailable" })).toEqual({
      kind: "unreported",
      reason: "skip evidence unavailable",
    });
  });

  it("reports a listed-but-unreadable or ambiguous artifact as unreadable, even on success", () => {
    expect(classifyRun(run(2002, "2026-10-21T00:00:00Z", { artifact: { kind: "unreadable" } }))).toEqual({
      kind: "unreported",
      reason: "artifact unreadable",
    });
  });

  it("makes a malformed review.json unreported with reason artifact unreadable", () => {
    const notJson = run(2003, "2026-10-21T00:00:00Z", { artifact: { kind: "downloaded", text: "{not json" } });
    const wrongShape = run(2004, "2026-10-21T00:00:00Z", {
      artifact: { kind: "downloaded", text: JSON.stringify({ verdict: "maybe", findings: [] }) },
    });
    expect(classifyRun(notJson)).toEqual({ kind: "unreported", reason: "artifact unreadable" });
    expect(classifyRun(wrongShape)).toEqual({ kind: "unreported", reason: "artifact unreadable" });
  });

  it("counts a failed run with a readable review.json as reviewed", () => {
    expect(classifyRun({ ...A, conclusion: "failure" }).kind).toBe("reviewed");
  });

  it("names cancelled, timed-out, other and in-flight runs without an artifact", () => {
    const base = run(2005, "2026-10-21T00:00:00Z");
    expect(classifyRun({ ...base, conclusion: "cancelled" })).toEqual({ kind: "unreported", reason: "cancelled" });
    expect(classifyRun({ ...base, conclusion: "timed_out" })).toEqual({ kind: "unreported", reason: "timed_out" });
    expect(classifyRun({ ...base, conclusion: "startup_failure" })).toEqual({
      kind: "unreported",
      reason: "other conclusion",
    });
    expect(classifyRun({ ...base, status: "in_progress", conclusion: null })).toEqual({
      kind: "unreported",
      reason: "still running",
    });
  });
});

describe("runCost", () => {
  it("keeps B's observed $0.03 and marks it partial; the absent finder cost is not 0", () => {
    const cost = runCost(parsed({ finder: null, judge: 0.03 }));
    expect(cost.known).toBeCloseTo(0.03, 9);
    expect(cost.partial).toBe(true);
    expect(cost.byPass.finder).toEqual({ state: "unknown" });
  });

  it("does not mark a no-plan or skipped impl partial for missing impl telemetry", () => {
    for (const implReview of ["none", "skipped"] as const) {
      const cost = runCost(parsed({ finder: 0.02, judge: 0.01, implReview }));
      expect(cost.byPass.impl).toEqual({ state: "not-run" });
      expect(cost.partial).toBe(false);
      expect(cost.known).toBeCloseTo(0.03, 9);
    }
  });

  it("marks a reviewed or failed impl without telemetry or cost unknown and partial", () => {
    for (const implReview of ["reviewed", "failed"] as const) {
      for (const impl of [undefined, null]) {
        const cost = runCost(parsed({ finder: 0.02, judge: 0.01, implReview, impl }));
        expect(cost.byPass.impl).toEqual({ state: "unknown" });
        expect(cost.partial).toBe(true);
      }
    }
  });

  it("keeps an explicitly reported zero as a known value", () => {
    const cost = runCost(parsed({ finder: 0, judge: 0, implReview: "reviewed", impl: 0 }));
    expect(cost.byPass.finder).toEqual({ state: "reported", cost: 0 });
    expect(cost.partial).toBe(false);
    expect(cost.known).toBe(0);
  });

  it("keeps a legacy artifact with no telemetry at all partial", () => {
    const cost = runCost(parsed({}));
    expect(cost.partial).toBe(true);
    expect(cost.known).toBe(0);
    expect(cost.byPass.finder.state).toBe("unknown");
    expect(cost.byPass.judge.state).toBe("unknown");
  });

  it("retains numeric cost from contradictory impl telemetry and marks the run partial", () => {
    const noPlan = runCost(parsed({ finder: 0.01, judge: 0.01, impl: 0.2 }));
    expect(noPlan.contradictory).toBe(true);
    expect(noPlan.partial).toBe(true);
    expect(noPlan.known).toBeCloseTo(0.22, 9);
    const skippedNoCost = runCost(parsed({ finder: 0.01, judge: 0.01, implReview: "skipped", impl: null }));
    expect(skippedNoCost.byPass.impl).toEqual({ state: "unknown" });
    expect(skippedNoCost.partial).toBe(true);
    const skippedWithCost = runCost(parsed({ finder: 0.01, judge: 0.01, implReview: "skipped", impl: 0.3 }));
    expect(skippedWithCost.contradictory).toBe(true);
    expect(skippedWithCost.partial).toBe(true);
    expect(skippedWithCost.byPass.impl).toEqual({ state: "reported", cost: 0.3 });
    expect(skippedWithCost.known).toBeCloseTo(0.32, 9);
  });

  it("rejects a negative cost as unreadable rather than letting it reduce the sum", () => {
    expect(parseReviewJson(reviewText({ finder: -1, judge: 0.01 }))).toBeUndefined();
  });

  it("rejects an implausibly large pass cost as unreadable rather than summing it to Infinity", () => {
    expect(parseReviewJson(reviewText({ finder: 1e308, judge: 1e308 }))).toBeUndefined();
    expect(parseReviewJson(reviewText({ finder: MAX_PASS_COST_USD + 0.000001, judge: 0.01 }))).toBeUndefined();
    expect(parseReviewJson(reviewText({ finder: MAX_PASS_COST_USD, judge: 0.01 }))).toBeDefined();
  });
});

describe("reactionState", () => {
  it("shows #301's owner 👍 as stale when the comment was rewritten after it", () => {
    expect(
      reactionState([{ user: OWNER, content: "+1", createdAt: "2026-10-20T12:00:00Z" }], OWNER, "2026-10-22T10:05:00Z"),
    ).toEqual({ state: "up", stale: true });
  });

  it("is fresh when the reaction followed the last rewrite", () => {
    expect(
      reactionState([{ user: OWNER, content: "-1", createdAt: "2026-10-22T11:00:00Z" }], OWNER, "2026-10-22T10:05:00Z"),
    ).toEqual({ state: "down", stale: false });
  });

  it("reports mixed and unrated, and ignores other accounts and other emoji", () => {
    expect(
      reactionState(
        [
          { user: "piotr-miller", content: "+1", createdAt: "2026-10-23T00:00:00Z" },
          { user: OWNER, content: "-1", createdAt: "2026-10-23T00:00:00Z" },
        ],
        OWNER,
        "2026-10-22T00:00:00Z",
      ),
    ).toEqual({ state: "mixed", stale: false });
    expect(
      reactionState(
        [
          { user: "someone-else", content: "+1", createdAt: "2026-10-23T00:00:00Z" },
          { user: null, content: "-1", createdAt: "2026-10-23T00:00:00Z" },
          { user: OWNER, content: "heart", createdAt: "2026-10-23T00:00:00Z" },
        ],
        OWNER,
        "2026-10-22T00:00:00Z",
      ),
    ).toEqual({ state: "unrated", stale: false });
  });

  it("counts an unreadable reaction timestamp as stale", () => {
    expect(
      reactionState([{ user: OWNER, content: "+1", createdAt: "garbage" }], OWNER, "2026-10-22T00:00:00Z"),
    ).toEqual({ state: "up", stale: true });
  });
});

describe("thresholds and alarm", () => {
  const report = (known: number, coverageGapWorkflows: number) => ({
    spend: { known, incomplete: false, hasKnown: true },
    coverageGapWorkflows,
    counts: { workflows: 0, reviewed: 0, noReview: 0, unreported: 0, notRun: 0, partial: 0 },
  });
  const defaults = parseThresholds({});

  it("defaults silently when unset or empty", () => {
    expect(defaults).toEqual({ usd: DEFAULT_ALARM_USD, unreported: DEFAULT_ALARM_UNREPORTED, warnings: [] });
    expect(
      parseThresholds({ AI_REVIEW_WEEKLY_ALARM_USD: "", AI_REVIEW_WEEKLY_ALARM_UNREPORTED: " " }).warnings,
    ).toEqual([]);
  });

  it("fires on spend strictly above the threshold", () => {
    expect(decideAlarm(report(10, 0), defaults).fired).toBe(false);
    expect(decideAlarm(report(10.01, 0), defaults)).toEqual({
      fired: true,
      triggers: [{ kind: "spend", knownSpend: 10.01, threshold: 10 }],
    });
    // Float noise below the displayed micro-dollar cannot fire it.
    expect(decideAlarm(report(10.0000001, 0), defaults).fired).toBe(false);
    // A threshold finer than the micro-dollar is compared as displayed, so "exceeds" never reads $10 > $10.
    expect(decideAlarm(report(9.9999999, 0), { usd: 9.9999996, unreported: 5 }).fired).toBe(false);
  });

  it("fires at 5 distinct coverage-gap workflows, not at 4", () => {
    expect(decideAlarm(report(0, 4), defaults).fired).toBe(false);
    expect(decideAlarm(report(0, 5), defaults).triggers.map((t) => t.kind)).toEqual(["coverage"]);
  });

  it("falls back to the default with a warning on a non-numeric or negative value", () => {
    const parsedThresholds = parseThresholds({
      AI_REVIEW_WEEKLY_ALARM_USD: "ten",
      AI_REVIEW_WEEKLY_ALARM_UNREPORTED: "-1",
    });
    expect(parsedThresholds.usd).toBe(10);
    expect(parsedThresholds.unreported).toBe(5);
    expect(parsedThresholds.warnings).toEqual([
      { variable: "AI_REVIEW_WEEKLY_ALARM_USD", rejected: "ten", fallback: 10 },
      { variable: "AI_REVIEW_WEEKLY_ALARM_UNREPORTED", rejected: "-1", fallback: 5 },
    ]);
    expect(parseThresholds({ AI_REVIEW_WEEKLY_ALARM_UNREPORTED: "2.5" }).warnings).toHaveLength(1);
    // 0 would fire on every week, even an empty one; 1 already means "any gap".
    expect(parseThresholds({ AI_REVIEW_WEEKLY_ALARM_UNREPORTED: "0" })).toEqual({
      usd: 10,
      unreported: 5,
      warnings: [{ variable: "AI_REVIEW_WEEKLY_ALARM_UNREPORTED", rejected: "0", fallback: 5 }],
    });
    expect(parseThresholds({ AI_REVIEW_WEEKLY_ALARM_USD: "0" })).toEqual({ usd: 0, unreported: 5, warnings: [] });
    expect(parseThresholds({ AI_REVIEW_WEEKLY_ALARM_USD: "0x10" }).usd).toBe(10);
    expect(parseThresholds({ AI_REVIEW_WEEKLY_ALARM_USD: "12.5", AI_REVIEW_WEEKLY_ALARM_UNREPORTED: "3" })).toEqual({
      usd: 12.5,
      unreported: 3,
      warnings: [],
    });
  });
});

describe("aggregateWeek on the Definitions dataset", () => {
  const report = aggregateWeek(input(dataset));

  it("counts one class per workflow and the cohort's known spend as a lower bound", () => {
    expect(report.counts).toEqual({ workflows: 6, reviewed: 2, noReview: 1, unreported: 2, notRun: 1, partial: 1 });
    expect(report.spend.known).toBeCloseTo(0.13, 9);
    expect(report.spend.incomplete).toBe(true);
    expect(report.coverageGapWorkflows).toBe(2);
    expect(report.alarm.fired).toBe(false);
  });

  it("splits observed spend by pass", () => {
    expect(report.byPass.finder).toMatchObject({ reported: 1, unknown: 1, notRun: 0 });
    expect(report.byPass.finder.known).toBeCloseTo(0.04, 9);
    expect(report.byPass.judge).toMatchObject({ reported: 2, unknown: 0 });
    expect(report.byPass.impl).toMatchObject({ reported: 1, unknown: 0, notRun: 1 });
  });

  it("builds per-PR rows: #301 ≥ $0.13 with B's snapshot and a stale 👍, #302 unknown", () => {
    const byPr = new Map(report.prs.map((row) => [row.pr, row]));
    expect([...byPr.keys()]).toEqual([301, 302, 303, 304]);
    const pr301 = byPr.get(301);
    expect(pr301?.runs).toBe(2);
    expect(pr301?.spend.known).toBeCloseTo(0.13, 9);
    expect(pr301?.spend.incomplete).toBe(true);
    expect(pr301?.latest).toEqual({
      runId: B.id,
      verdict: "failed",
      impl: "no plan",
      findings: { critical: 0, major: 1, minor: 1, nit: 0, preDedup: 3, impl: 0 },
    });
    expect(pr301?.reaction).toEqual({ kind: "rated", state: "up", stale: true });
    expect(byPr.get(302)?.spend).toEqual({ known: 0, incomplete: true, hasKnown: false });
    expect(byPr.get(302)?.reaction).toBeUndefined();
    expect(byPr.get(303)?.spend).toEqual({ known: 0, incomplete: false, hasKnown: true });
  });

  it("counts the verdict mix per reviewed run and the label mix per PR", () => {
    expect(report.verdictMix).toEqual({ passed: 1, failed: 1 });
    expect(report.implMix).toMatchObject({ APPROVED: 1, "no plan": 1 });
    expect(report.labelMix).toEqual({ passed: 1, failed: 1, none: 2, both: 0, unavailable: 0 });
    expect(report.findings).toEqual({ critical: 0, major: 1, minor: 2, nit: 0, preDedup: 4, impl: 0 });
  });

  it("lists the unreported runs with their reasons", () => {
    expect(report.unreportedRuns.map((r) => [r.id, r.runClass])).toEqual([
      [C.id, { kind: "unreported", reason: "failure" }],
      [E.id, { kind: "unreported", reason: "artifact missing" }],
    ]);
  });

  it("renders an empty week as 0 runs with no gaps", () => {
    const empty = aggregateWeek(input([]));
    expect(empty.counts.workflows).toBe(0);
    expect(empty.spend).toEqual({ known: 0, incomplete: false, hasKnown: false });
    expect(empty.alarm.fired).toBe(false);
  });
});

describe("PR association", () => {
  const I = run(3001, "2026-10-21T08:00:00Z", {
    artifact: reviewed({ finder: 0.03, judge: 0.01, findings: ["critical"] }),
    prAssociation: { kind: "unavailable", reason: "missing" },
  });
  const J = run(3002, "2026-10-21T08:30:00Z", {
    conclusion: "failure",
    prAssociation: { kind: "unavailable", reason: "ambiguous" },
  });

  it("keeps an unmapped run's spend, verdict and findings, lists it, and invents no PR row", () => {
    const report = aggregateWeek(input([I, J]));
    expect(report.spend.known).toBeCloseTo(0.04, 9);
    expect(report.verdictMix.passed).toBe(1);
    expect(report.findings.critical).toBe(1);
    expect(report.prs).toEqual([]);
    expect(report.labelMix).toEqual({ passed: 0, failed: 0, none: 0, both: 0, unavailable: 0 });
    expect(report.unmappedRuns.map((r) => [r.id, r.association])).toEqual([
      [I.id, { kind: "unavailable", reason: "missing" }],
      [J.id, { kind: "unavailable", reason: "ambiguous" }],
    ]);
    expect(report.prCoverageIncomplete).toBe(true);
    // J keeps its class and its alarm treatment; the association failure adds nothing.
    expect(report.coverageGapWorkflows).toBe(1);
  });

  it("maps several runs of one PR to one row", () => {
    const report = aggregateWeek(input([A, B]));
    expect(report.prs.map((row) => row.pr)).toEqual([301]);
    expect(report.labelMix.failed).toBe(1);
  });

  it("shows lookup failures as such rather than as no comment or unrated", () => {
    const report = aggregateWeek(input([A], { prs: [{ number: 301, labels: null, sticky: { kind: "unavailable" } }] }));
    expect(report.prs[0]?.label).toBe("unavailable");
    expect(report.prs[0]?.reaction).toEqual({ kind: "lookup failed" });
  });
});

describe("attempt accounting", () => {
  it("K: one observed artifact, two unobserved attempts, a lower bound and one coverage contributor", () => {
    const K = run(4001, "2026-10-21T00:00:00Z", { runAttempt: 3, artifact: reviewed({ finder: 0.15, judge: 0.05 }) });
    const report = aggregateWeek(input([K]));
    expect(report.counts.reviewed).toBe(1);
    expect(report.spend).toEqual({ known: 0.2, incomplete: true, hasKnown: true });
    expect(report.unobservedAttempts).toBe(2);
    expect(report.coverageGapWorkflows).toBe(1);
    expect(report.attemptGapRuns[0]?.attempts).toEqual({ kind: "gap", runAttempt: 3, unobserved: 2 });
  });

  it("L: counts once despite being both unreported and attempt-incomplete", () => {
    const L = run(4002, "2026-10-21T00:00:00Z", { runAttempt: 2, conclusion: "failure" });
    const report = aggregateWeek(input([L]));
    expect(report.counts.unreported).toBe(1);
    expect(report.coverageGapWorkflows).toBe(1);
  });

  it("fires the default coverage alarm on five readable reviewed workflows with attempt gaps, not four", () => {
    const gapped = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        run(4100 + i, "2026-10-21T00:00:00Z", { runAttempt: 2, artifact: reviewed({ finder: 0.01, judge: 0.01 }) }),
      );
    expect(aggregateWeek(input(gapped(4))).alarm.fired).toBe(false);
    const five = aggregateWeek(input(gapped(5)));
    expect(five.counts.unreported).toBe(0);
    expect(five.alarm.triggers).toEqual([
      { kind: "coverage", coverageGapWorkflows: 5, unreportedWorkflows: 0, threshold: 5 },
    ]);
  });

  it("keeps a no-review or not-run attempt with earlier unobserved attempts incomplete", () => {
    const noReview = run(4201, "2026-10-21T00:00:00Z", { runAttempt: 2, skipEvidence: "confirmed" });
    const notRun = run(4202, "2026-10-21T00:00:00Z", { runAttempt: 2, conclusion: "skipped" });
    const report = aggregateWeek(input([noReview, notRun]));
    expect(report.spend).toEqual({ known: 0, incomplete: true, hasKnown: true });
    expect(report.coverageGapWorkflows).toBe(2);
  });

  it("never turns a missing or invalid run_attempt into 1", () => {
    expect(attemptCoverage(null)).toEqual({ kind: "unknown" });
    expect(attemptCoverage(0)).toEqual({ kind: "unknown" });
    expect(attemptCoverage(1.5)).toEqual({ kind: "unknown" });
    expect(attemptCoverage(-2)).toEqual({ kind: "unknown" });
    expect(attemptCoverage(1)).toEqual({ kind: "complete" });
    const unknown = run(4301, "2026-10-21T00:00:00Z", {
      runAttempt: null,
      artifact: reviewed({ finder: 0.01, judge: 0.01 }),
    });
    const report = aggregateWeek(input([unknown]));
    expect(report.spend.incomplete).toBe(true);
    expect(report.coverageGapWorkflows).toBe(1);
    expect(report.unobservedAttempts).toBe(0);
  });

  it("never double-counts a workflow ID listed twice", () => {
    const report = aggregateWeek(input([A, { ...A, runAttempt: 1 }, A]));
    expect(report.counts.workflows).toBe(1);
    expect(report.spend.known).toBeCloseTo(0.1, 9);
  });

  it("keeps one snapshot per workflow, preferring the highest observed attempt", () => {
    const first = run(4401, "2026-10-21T00:00:00Z", { artifact: reviewed({ finder: 0.5, judge: 0.5 }) });
    const rerun = { ...first, runAttempt: 2, artifact: reviewed({ finder: 0.1, judge: 0.1 }) };
    const report = aggregateWeek(input([first, rerun]));
    expect(report.spend.known).toBeCloseTo(0.2, 9);
    expect(report.unobservedAttempts).toBe(1);
  });

  it("never lets a duplicate row claiming attempt 1 hide an unknown run_attempt", () => {
    const unknown = run(4402, "2026-10-21T00:00:00Z", {
      runAttempt: null,
      artifact: reviewed({ finder: 0.01, judge: 0.01 }),
    });
    for (const order of [
      [unknown, { ...unknown, runAttempt: 1 }],
      [{ ...unknown, runAttempt: 1 }, unknown],
    ]) {
      const report = aggregateWeek(input(order));
      expect(report.counts.workflows).toBe(1);
      expect(report.spend.incomplete).toBe(true);
      expect(report.coverageGapWorkflows).toBe(1);
    }
  });

  it("M: stays in W43 after a Monday re-run in W44", () => {
    const M = run(4501, "2026-10-25T23:59:59Z", { runAttempt: 2, artifact: reviewed({ finder: 0.01, judge: 0.01 }) });
    expect(aggregateWeek(input([M])).runs.map((r) => r.id)).toEqual([M.id]);
    expect(aggregateWeek(input([M], { week: "2026-W44", observedAt: new Date("2026-11-02T06:00:00Z") })).runs).toEqual(
      [],
    );
  });

  it("reports runs whose created_at cannot be read instead of dropping them silently", () => {
    const report = aggregateWeek(input([run(4601, "not a date")]));
    expect(report.invalidCreatedAt).toEqual([4601]);
  });

  it("counts rows with an invalid run ID instead of merging or linking them", () => {
    const valid = run(4602, "2026-10-21T00:00:00Z", { artifact: reviewed({ finder: 0.01, judge: 0.01 }) });
    const invalid = [Number.NaN, Number.NaN, -5, 1.5, 0].map((id) => ({ ...valid, id }));
    const report = aggregateWeek(input([valid, ...invalid]));
    expect(report.invalidRunIds).toBe(5);
    expect(report.runs.map((r) => r.id)).toEqual([4602]);
    expect(report.spend.known).toBeCloseTo(0.02, 9);
  });
});

describe("latest snapshot selection", () => {
  const prN = { number: 305, labels: [], sticky: { kind: "none" } } satisfies PrFacts;
  const N = run(9, "2026-10-21T12:00:00Z", {
    artifact: reviewed({ verdict: "passed", findings: ["minor"], finder: 0.01, judge: 0.01 }),
    prAssociation: { kind: "mapped", pr: 305 },
  });
  const O = run(10, "2026-10-21T12:00:00Z", {
    artifact: reviewed({ verdict: "failed", findings: ["major", "nit"], finder: 0.01, judge: 0.01 }),
    prAssociation: { kind: "mapped", pr: 305 },
  });

  it("picks the greatest numeric run ID on a created_at tie, in either input order", () => {
    for (const runs of [
      [N, O],
      [O, N],
    ]) {
      const latest = aggregateWeek(input(runs, { prs: [prN] })).prs[0]?.latest;
      expect(latest?.runId).toBe(10);
      expect(latest?.verdict).toBe("failed");
      expect(latest?.findings).toMatchObject({ major: 1, nit: 1, minor: 0 });
    }
  });

  it("lets a later created_at outrank a greater ID", () => {
    const later = { ...N, createdAt: "2026-10-21T12:00:01Z" };
    expect(aggregateWeek(input([O, later], { prs: [prN] })).prs[0]?.latest?.runId).toBe(9);
  });

  it("orders run IDs numerically, not lexically", () => {
    const nine = { ...N, id: 9 };
    const hundred = { ...O, id: 100 };
    expect(aggregateWeek(input([hundred, nine], { prs: [prN] })).prs[0]?.latest?.runId).toBe(100);
  });
});
