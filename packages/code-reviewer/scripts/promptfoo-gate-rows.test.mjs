// Hermetic tests for the promptfoo → gate-rows script (change
// `finder-model-swap`, Phase 1 §3): a synthetic export shaped like promptfoo's
// `-o` JSON, no network.
import { describe, expect, it } from "vitest";

import { CASES, G4_CEILING, checkRow, exportRows, summarizeRows } from "./promptfoo-gate-rows.mjs";

const DESCRIPTIONS = {
  "js-loop": "Finds the material defects in a small JavaScript loop",
  react: "React 16->19 class-to-function migration with three planted flaws",
  "cross-hunk": "Cross-hunk contract violation, knowable only by reading outside the hunk",
  clean: "Defect-free mechanical rename, tool-enabled — measures manufactured findings, not recall",
};

const component = (metric, pass = true) => ({ pass, assertion: { metric } });

function rawRow(caseKey, overrides = {}) {
  const c = CASES.find((x) => x.key === caseKey);
  const metrics = [...c.required, ...(c.diagnostic ?? [])];
  return {
    provider: { id: "file://./finder-provider.ts", label: "candidate-gpt-6-luna" },
    testCase: { description: DESCRIPTIONS[caseKey] },
    success: true,
    error: null,
    latencyMs: 1000,
    gradingResult: { pass: true, componentResults: metrics.map((m) => component(m)) },
    response: {
      metadata: {
        stepProviders: ["OpenAI", "OpenAI"],
        stepCostReported: [true, true],
        reasoningLeak: false,
        retries: [],
        steps: 2,
        toolCalls: 1,
        repairs: 0,
        cost: 0.0006,
      },
    },
    ...overrides,
  };
}

const fullRun = () => CASES.flatMap((c) => [rawRow(c.key), rawRow(c.key), rawRow(c.key)]);
const check = (raws) => raws.map((raw) => checkRow(raw, "OpenAI"));
const withMetadata = (row, metadata) => ({ ...row, response: { metadata: { ...row.response.metadata, ...metadata } } });

describe("summarizeRows", () => {
  it("passes G3 and G4 on a clean 12-row run, with the median over all 12 rows", () => {
    const summary = summarizeRows(check(fullRun()));
    expect(summary.failedRun).toBe(false);
    expect(summary.g3.pass).toBe(true);
    expect(summary.g3.cases.react.counts.flaw_unsafe_html).toBe(3);
    expect(summary.g4).toMatchObject({ pass: true, median: 0.0006, incompleteCost: 0 });
    expect(summary.retryCount).toBe(0);
  });

  it("11 rows is a failed run, not a gate result", () => {
    const summary = summarizeRows(check(fullRun().slice(1)));
    expect(summary.failedRun).toBe(true);
    expect(summary.problems.join(" ")).toMatch(/11 rows, expected 12/u);
    expect(summary.g3).toBeUndefined();
  });

  it("a row from a case outside the four archived ones makes the run a failed run", () => {
    const rows = fullRun();
    rows[0] = { ...rows[0], testCase: { description: "Hardening diff whose defences are present" } };
    expect(summarizeRows(check(rows)).failedRun).toBe(true);
  });

  it("one mismatched provider invalidates its row: G3 fails its case and G4 fails", () => {
    const rows = fullRun();
    rows[0] = withMetadata(rows[0], { stepProviders: ["OpenAI", "Azure"] });
    const summary = summarizeRows(check(rows));
    expect(summary.invalidated).toEqual([{ case: "js-loop", providers: ["OpenAI", "Azure"] }]);
    expect(summary.g3.cases["js-loop"].failed).toEqual(["issue_recall"]);
    expect(summary.g3.pass).toBe(false);
    expect(summary.g4.pass).toBe(false);
  });

  it("one reasoning leak fails its row, even with every assertion green", () => {
    const rows = fullRun();
    rows[3] = withMetadata(rows[3], { reasoningLeak: true });
    const summary = summarizeRows(check(rows));
    expect(summary.reasoningLeaks).toBe(1);
    expect(summary.g3.cases.react.failed).toContain("review_fails");
    expect(summary.g3.pass).toBe(false);
  });

  it("a row without the reasoningLeak field fails closed", () => {
    const rows = fullRun();
    const { reasoningLeak: _dropped, ...metadata } = rows[0].response.metadata;
    rows[0] = { ...rows[0], response: { metadata } };
    expect(checkRow(rows[0], "OpenAI").reasoningLeak).toBe(true);
  });

  it("one missing cost fails G4 — the row is never omitted or counted as free", () => {
    const rows = fullRun();
    rows[11] = withMetadata(rows[11], { stepCostReported: [true, false] });
    const summary = summarizeRows(check(rows));
    expect(summary.g4.incompleteCost).toBe(1);
    expect(summary.g4.pass).toBe(false);
    expect(summary.g3.pass).toBe(true);
  });

  it("a G3 metric at 2/3 fails G3", () => {
    const rows = fullRun();
    rows[9] = {
      ...rows[9],
      gradingResult: { pass: false, componentResults: [component("no_false_alarms", false)] },
    };
    const summary = summarizeRows(check(rows));
    expect(summary.g3.cases.clean.counts.no_false_alarms).toBe(2);
    expect(summary.g3.cases.clean.failed).toEqual(["no_false_alarms"]);
    expect(summary.g3.pass).toBe(false);
  });

  it("a metric that appears twice in a case passes only when every component passes", () => {
    const rows = fullRun();
    rows[0] = {
      ...rows[0],
      gradingResult: { componentResults: [component("issue_recall"), component("issue_recall", false)] },
    };
    expect(summarizeRows(check(rows)).g3.cases["js-loop"].counts.issue_recall).toBe(2);
  });

  it("an errored row fails its case's required metrics", () => {
    const rows = fullRun();
    rows[0] = { ...rows[0], success: false, error: "HTTP 429", gradingResult: undefined };
    expect(summarizeRows(check(rows)).g3.pass).toBe(false);
  });

  it("cross-hunk metrics are diagnostic: failing them never fails G3", () => {
    const rows = fullRun().map((row) =>
      row.testCase.description.startsWith("Cross-hunk")
        ? { ...row, gradingResult: { componentResults: [component("tool_required", false)] } }
        : row,
    );
    const summary = summarizeRows(check(rows));
    expect(summary.g3.cases["cross-hunk"].counts.tool_required).toBe(0);
    expect(summary.g3.pass).toBe(true);
  });

  it("G4 fails when the median is above the ceiling", () => {
    const rows = fullRun().map((row) => withMetadata(row, { cost: G4_CEILING * 1.01 }));
    const summary = summarizeRows(check(rows));
    expect(summary.g4.pass).toBe(false);
    expect(summary.g4.ratio).toBeGreaterThan(1);
  });

  it("G4's median of 12 is the mean of the 6th and 7th costs (as the archived baseline)", () => {
    const costs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((x) => x / 10_000);
    const rows = fullRun().map((row, i) => withMetadata(row, { cost: costs[i] }));
    expect(summarizeRows(check(rows)).g4.median).toBeCloseTo(0.00065, 10);
  });

  it("counts production retries across rows, and flags rows without the field", () => {
    const rows = fullRun();
    rows[2] = withMetadata(rows[2], { retries: [{ error: "APICallError-429", delayMs: 10_000 }] });
    const { retries: _dropped, ...metadata } = rows[4].response.metadata;
    rows[4] = { ...rows[4], response: { metadata } };
    const summary = summarizeRows(check(rows));
    expect(summary.retryCount).toBe(1);
    expect(summary.missingRetryField).toBe(1);
  });
});

describe("exportRows", () => {
  it("reads promptfoo's results.results", () => {
    expect(exportRows({ results: { results: [1, 2] } })).toEqual([1, 2]);
  });

  it("refuses something that is not an export", () => {
    expect(() => exportRows({ results: [] })).toThrow(/not a promptfoo export/u);
  });
});
