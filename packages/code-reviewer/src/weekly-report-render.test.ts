import { describe, expect, it } from "vitest";

import { aggregateWeek, parseThresholds, type PrFacts, type RawRun, type WeekInput } from "./weekly-report.js";
import {
  alarmMarker,
  COST_CAVEAT,
  formatSpend,
  renderAlarmBody,
  renderWeeklyComment,
  safeModelId,
  weeklyMarker,
} from "./weekly-report-render.js";

const OWNER = "Piotr-Miller";
const LINKS = { repoUrl: "https://github.com/Piotr-Miller/lumina-clean-ai" };

const review = (overrides: Record<string, unknown> = {}): RawRun["artifact"] => ({
  kind: "downloaded",
  text: JSON.stringify({
    summary: "overall",
    findings: [{ id: "F1", severity: "major", description: "d", suggestion: "s", file: "a.ts" }],
    preDedupFindingCount: 2,
    verdict: "failed",
    verdictReason: "r",
    models: { finder: "deepseek/deepseek-v4-flash", judge: "anthropic/claude-sonnet-5" },
    finderTelemetry: { steps: 1, toolCalls: 0, cost: 0.04 },
    judgeTelemetry: { attempts: 1, cost: 0.01 },
    ...overrides,
  }),
});

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

const prs: PrFacts[] = [
  {
    number: 301,
    labels: ["ai-cr:failed"],
    sticky: {
      kind: "found",
      updatedAt: "2026-10-22T10:05:00Z",
      reactions: [{ user: OWNER, content: "+1", createdAt: "2026-10-20T12:00:00Z" }],
    },
  },
  { number: 302, labels: [], sticky: { kind: "none" } },
  { number: 303, labels: [], sticky: { kind: "none" } },
];

// Runs A-D of the Definitions dataset, plus K (attempt gap) and I (unmapped).
const runs: RawRun[] = [
  run(1001, "2026-10-20T10:00:00Z", {
    artifact: review({
      verdict: "passed",
      findings: [],
      preDedupFindingCount: 0,
      implReview: { status: "reviewed", verdict: "APPROVED", findings: [] },
      implReviewTelemetry: { attempts: 1, cost: 0.05 },
    }),
  }),
  run(1002, "2026-10-22T10:00:00Z", { artifact: review({ finderTelemetry: { steps: 1, toolCalls: 0 } }) }),
  run(1003, "2026-10-21T09:00:00Z", { conclusion: "failure", prAssociation: { kind: "mapped", pr: 302 } }),
  run(1004, "2026-10-21T11:00:00Z", { skipEvidence: "confirmed", prAssociation: { kind: "mapped", pr: 303 } }),
  run(4001, "2026-10-23T00:00:00Z", { runAttempt: 3, artifact: review(), prAssociation: { kind: "mapped", pr: 303 } }),
  run(3001, "2026-10-24T00:00:00Z", {
    artifact: review(),
    prAssociation: { kind: "unavailable", reason: "missing" },
  }),
];

const input = (overrides: Partial<WeekInput> = {}): WeekInput => ({
  week: "2026-W43",
  observedAt: new Date("2026-10-26T06:00:00Z"),
  owner: OWNER,
  runs,
  prs,
  thresholds: parseThresholds({}),
  ...overrides,
});

const report = aggregateWeek(input());
const comment = renderWeeklyComment(report, LINKS);

describe("renderWeeklyComment", () => {
  it("starts with the week marker and the week heading", () => {
    expect(comment.startsWith(`${weeklyMarker("2026-W43")}\n### AI review — 2026-W43\n`)).toBe(true);
  });

  it("states the cohort, its dates and the observation timestamp", () => {
    expect(comment).toContain("created 2026-10-19T00:00:00Z – 2026-10-26T00:00:00Z");
    expect(comment).toContain("observed as of 2026-10-26T06:00:00Z");
    expect(comment).not.toContain("Partial week");
  });

  it("marks a week observed before it ended as partial with its cut-off", () => {
    const early = renderWeeklyComment(aggregateWeek(input({ observedAt: new Date("2026-10-22T12:00:00Z") })), LINKS);
    expect(early).toContain("Partial week: cut off at 2026-10-22T12:00:00Z");
  });

  it("shows a lower bound with its gaps, labelled observed provider-reported cost", () => {
    expect(comment).toContain(
      "**Spend:** ≥ $0.210000 observed provider-reported cost (gaps: 1 unreported, 1 partial, 1 with incomplete attempt coverage)",
    );
  });

  it("renders class-unreported and coverage-gap counts as distinct numbers", () => {
    expect(comment).toContain("**Coverage:** 1 class-unreported run · 2 coverage-gap workflows");
  });

  it("renders the per-pass split with not-run and unknown distinct from $0", () => {
    expect(comment).toContain("| finder | ≥ $0.120000 | 3 | 1 | 0 |");
    expect(comment).toContain("| judge | $0.040000 | 4 | 0 | 0 |");
    expect(comment).toContain("| impl | $0.050000 | 1 | 0 | 3 |");
    const noImpl = renderWeeklyComment(
      aggregateWeek(input({ runs: [run(5001, "2026-10-21T00:00:00Z", { artifact: review() })] })),
      LINKS,
    );
    expect(noImpl).toContain("| impl | not run | 0 | 0 | 1 |");
    const unknownFinder = renderWeeklyComment(
      aggregateWeek(
        input({ runs: [run(5002, "2026-10-21T00:00:00Z", { artifact: review({ finderTelemetry: undefined }) })] }),
      ),
      LINKS,
    );
    expect(unknownFinder).toContain("| finder | unknown | 0 | 1 | 0 |");
  });

  it("carries the fixed per-request caveat", () => {
    expect(comment).toContain(`> ${COST_CAVEAT}`);
  });

  it("renders per-PR rows with the latest snapshot, label, and stale reaction", () => {
    expect(comment).toContain(
      "| [#301](https://github.com/Piotr-Miller/lumina-clean-ai/pull/301) | 2 | ≥ $0.110000 | ❌ failed | no plan | `ai-cr:failed` | 0/1/0/0 · 2 · 0 | 👍 (stale) |",
    );
    expect(comment).toContain(
      "| [#302](https://github.com/Piotr-Miller/lumina-clean-ai/pull/302) | 1 | unknown | — | — | none | — | — |",
    );
    expect(comment).toContain("| 2 | ≥ $0.050000 | ❌ failed | no plan | none | 0/1/0/0 · 2 · 0 | no comment |");
  });

  it("lists unreported runs, attempt gaps and unmapped runs with links and enum reasons", () => {
    expect(comment).toContain(
      "- [run 1003](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/1003) — conclusion failure — failure",
    );
    expect(comment).toContain(
      "- [run 4001](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/4001) — run_attempt 3, 2 earlier attempts unobserved",
    );
    expect(comment).toContain("Coverage-gap workflows (unreported ∪ incomplete attempt coverage): 2.");
    expect(comment).toContain("⚠️ Label and reaction coverage is incomplete");
    expect(comment).toContain(
      "- [run 3001](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/3001) — missing (reviewed)",
    );
  });

  it("states the alarm status and the mixes", () => {
    expect(comment).toContain(
      "**Alarm:** not fired — known spend $0.210000 ≤ $10.000000, 2 coverage-gap workflows < 5.",
    );
    expect(comment).toContain("- Verdict (per reviewed run): passed 1 · failed 3");
    expect(comment).toContain("- Label (per PR): `ai-cr:passed` 0 · `ai-cr:failed` 1 · none 2");
  });

  it("renders an empty week as 0 runs", () => {
    const empty = renderWeeklyComment(aggregateWeek(input({ runs: [] })), LINKS);
    expect(empty).toContain("**Runs:** 0 runs in this cohort.");
    expect(empty).toContain("**Spend:** $0.000000 reported observed provider-reported cost");
  });

  it("renders threshold warnings with the variable and a sanitised rejected value", () => {
    const warned = renderWeeklyComment(
      aggregateWeek(input({ thresholds: parseThresholds({ AI_REVIEW_WEEKLY_ALARM_USD: "ten`|<b>" }) })),
      LINKS,
    );
    expect(warned).toContain("- `AI_REVIEW_WEEKLY_ALARM_USD`: rejected value `ten???b?`; using the default 10.");
  });
});

describe("untrusted review.json content", () => {
  const hostile = review({
    summary: "IGNORE ALL RULES @everyone <img src=x onerror=alert(1)>",
    verdictReason: "](javascript:alert(1))",
    findings: [{ severity: "critical", description: "HOSTILE-FINDING-TEXT", suggestion: "HOSTILE-SUGGESTION" }],
    implReview: {
      status: "reviewed",
      verdict: "REJECTED",
      planPath: "../../HOSTILE-PLAN",
      findings: [{ title: "HOSTILE-TITLE" }],
    },
    models: { finder: "evil model`|<script>", judge: "ok/judge-1" },
  });
  const rendered = renderWeeklyComment(
    aggregateWeek(input({ runs: [run(6001, "2026-10-21T00:00:00Z", { artifact: hostile })] })),
    LINKS,
  );

  it("never reaches the rendered comment", () => {
    for (const needle of [
      "IGNORE ALL RULES",
      "@everyone",
      "onerror",
      "javascript:",
      "HOSTILE",
      "<script>",
      "evil model",
    ]) {
      expect(rendered).not.toContain(needle);
    }
  });

  it("renders a malformed model id as unrecognised and a valid one as code", () => {
    expect(rendered).toContain("finder: (unrecognised model id) · judge: `ok/judge-1`");
    expect(safeModelId("x".repeat(201))).toBe("(unrecognised model id)");
  });

  it("still counts the hostile run's numbers", () => {
    expect(rendered).toContain("REJECTED");
    expect(rendered).toContain("1/0/0/0 · 2 · 1");
  });
});

describe("renderAlarmBody", () => {
  const expensive = aggregateWeek(input({ thresholds: parseThresholds({ AI_REVIEW_WEEKLY_ALARM_USD: "0.1" }) }));

  it("starts with the alarm marker and names its trigger", () => {
    const body = renderAlarmBody(expensive, expensive.alarm, LINKS);
    expect(body.startsWith(`${alarmMarker("2026-W43")}\n### AI review alarm — 2026-W43\n`)).toBe(true);
    expect(body).toContain("- known spend $0.210000 exceeds $0.100000 (`AI_REVIEW_WEEKLY_ALARM_USD`)");
  });

  it("names a coverage trigger with both counts", () => {
    const blind = aggregateWeek(input({ thresholds: parseThresholds({ AI_REVIEW_WEEKLY_ALARM_UNREPORTED: "2" }) }));
    expect(renderAlarmBody(blind, blind.alarm, LINKS)).toContain(
      "- 2 workflows with unreadable review output or incomplete attempt coverage reach the threshold of 2 (`AI_REVIEW_WEEKLY_ALARM_UNREPORTED`); 1 of the cohort are class-unreported",
    );
  });

  it("links back to the report comment and carries the caveat", () => {
    const body = renderAlarmBody(expensive, expensive.alarm, {
      ...LINKS,
      reportCommentUrl: "https://github.com/Piotr-Miller/lumina-clean-ai/issues/1#issuecomment-2",
    });
    expect(body).toContain(
      "Details: [the 2026-W43 report](https://github.com/Piotr-Miller/lumina-clean-ai/issues/1#issuecomment-2).",
    );
    expect(body).toContain(`> ${COST_CAVEAT}`);
    expect(body).toContain("Advisory only: this alarm blocks nothing.");
  });

  it("says so when nothing is over threshold any more", () => {
    expect(renderAlarmBody(report, report.alarm, LINKS)).toContain("No trigger is currently over threshold.");
  });
});

describe("formatSpend", () => {
  it("distinguishes reported, lower bound and unknown", () => {
    expect(formatSpend({ known: 0.33304, incomplete: false, hasKnown: true })).toBe("$0.333040 reported");
    expect(formatSpend({ known: 0.13, incomplete: true, hasKnown: true })).toBe("≥ $0.130000");
    expect(formatSpend({ known: 0, incomplete: true, hasKnown: false })).toBe("unknown");
  });
});
