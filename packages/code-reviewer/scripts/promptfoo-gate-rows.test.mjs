// Hermetic tests for the promptfoo → gate-rows script (change
// `finder-model-swap`, Phase 1 §3; impl-review-phase-1 F2–F5): a synthetic
// export shaped like promptfoo 0.122's `-o` JSON, no network.
import { describe, expect, it } from "vitest";

import {
  CASES,
  G4_CEILING,
  checkRow,
  exportRows,
  finderErrorOf,
  graderErrorsOf,
  mergeRegrade,
  summarizeRows,
} from "./promptfoo-gate-rows.mjs";

const DESCRIPTIONS = {
  "js-loop": "Finds the material defects in a small JavaScript loop",
  react: "React 16->19 class-to-function migration with three planted flaws",
  "cross-hunk": "Cross-hunk contract violation, knowable only by reading outside the hunk",
  clean: "Defect-free mechanical rename, tool-enabled — measures manufactured findings, not recall",
};

const component = (metric, pass = true, extra = {}) => ({ pass, score: pass ? 1 : 0, assertion: { metric }, ...extra });
// promptfoo's `graderFail`: the grader provider errored or answered
// unparsably; the component fails and is tagged graderError.
const graderErrorComponent = (metric, reason = "API call error: HTTP 503") =>
  component(metric, false, { reason, metadata: { graderError: true } });

let nextId = 0;
function rawRow(caseKey, overrides = {}) {
  const c = CASES.find((x) => x.key === caseKey);
  const metrics = [...c.required, ...(c.diagnostic ?? [])];
  nextId += 1;
  return {
    id: `row-${String(nextId)}`,
    testIdx: nextId,
    provider: { id: "file://./finder-provider.ts", label: "candidate-gpt-6-luna" },
    testCase: { description: DESCRIPTIONS[caseKey] },
    success: true,
    failureReason: 0,
    error: null,
    latencyMs: 1000,
    gradingResult: { pass: true, componentResults: metrics.map((m) => component(m)) },
    response: {
      output: '{"summary":"s","findings":[]}',
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

// Ids and testIdx restart at 1 for every synthetic run, as a real export's do.
const fullRun = () => {
  nextId = 0;
  return CASES.flatMap((c) => [rawRow(c.key), rawRow(c.key), rawRow(c.key)]);
};
const check = (raws) => raws.map((raw) => checkRow(raw, "OpenAI"));
const withMetadata = (row, metadata) => ({
  ...row,
  response: { ...row.response, metadata: { ...row.response.metadata, ...metadata } },
});
const withGrading = (row, componentResults, rowFields = {}) => ({
  ...row,
  success: false,
  failureReason: 1,
  error: "grader text",
  gradingResult: { pass: false, componentResults },
  ...rowFields,
});

// The archived export's real shape of an assertion failure: `success: false`,
// `failureReason: 1`, the grader's reason in `error`, every component present
// (impl-review-phase-1 F2). Verified on 2026-08-11-tool-loop-matrix.json.
const realAssertionFailure = (row) =>
  withGrading(row, [
    component("schema_validity"),
    component("issue_recall"),
    component("issue_recall"),
    component("issue_recall", false),
    component("issue_recall"),
    component("flaw_stale_closure"),
    component("flaw_lost_cleanup", false),
    component("flaw_unsafe_html"),
    component("review_fails"),
  ]);
// ...and of a provider error: `failureReason: 2`, the error in response.error,
// no gradingResult at all.
const realProviderError = (row) => ({
  ...row,
  success: false,
  failureReason: 2,
  error: "No object generated: response did not match schema.",
  gradingResult: undefined,
  response: { error: "No object generated: response did not match schema.", metadata: row.response.metadata },
});

describe("checkRow — what fails a row (F2)", () => {
  it("a row that failed ONE rubric keeps its other metrics: success/error are promptfoo's grader verdict, not a dead row", () => {
    const row = checkRow(realAssertionFailure(rawRow("react")), "OpenAI");
    expect(row.finderError).toBeNull();
    expect(row.rowError).toBe("grader text");
    expect(row.graderError).toBe(false);
    expect(row.metrics).toMatchObject({
      issue_recall: false,
      flaw_stale_closure: true,
      flaw_lost_cleanup: false,
      flaw_unsafe_html: true,
      review_fails: true,
    });
  });

  it("a provider error is a finder error, read from response.error", () => {
    const row = checkRow(realProviderError(rawRow("react")), "OpenAI");
    expect(row.finderError).toMatch(/No object generated/u);
    expect(row.graderError).toBe(false);
    expect(row.metrics).toEqual({});
  });

  it("a row with no output and no error is a finder error too, never a free pass", () => {
    expect(finderErrorOf({ response: { metadata: {} } })).toBe("no finder output recorded");
    expect(finderErrorOf(undefined)).toBe("no finder output recorded");
  });

  it("a metric that appears twice in a case passes only when every component passes", () => {
    const row = checkRow(
      withGrading(rawRow("js-loop"), [component("issue_recall"), component("issue_recall", false)]),
      "OpenAI",
    );
    expect(row.metrics.issue_recall).toBe(false);
  });

  it("a row without the reasoningLeak field fails closed, and says the state was not reported", () => {
    const { reasoningLeak: _dropped, ...metadata } = rawRow("js-loop").response.metadata;
    const row = checkRow({ ...rawRow("js-loop"), response: { output: "{}", metadata } }, "OpenAI");
    expect(row.reasoningLeak).toBe(true);
    expect(row.reasoningReported).toBe(false);
  });
});

describe("grader errors (F3, Amendment A1)", () => {
  it("a graderError-tagged component marks the row, names the metric, and leaves that metric ungraded", () => {
    const raw = withGrading(rawRow("react"), [
      component("issue_recall"),
      component("review_fails"),
      component("flaw_stale_closure"),
      graderErrorComponent("flaw_lost_cleanup"),
      component("flaw_unsafe_html"),
    ]);
    expect(graderErrorsOf(raw)).toEqual([{ metric: "flaw_lost_cleanup", reason: "API call error: HTTP 503" }]);
    const row = checkRow(raw, "OpenAI");
    expect(row.graderError).toBe(true);
    expect(row.graderErrorMetrics).toEqual(["flaw_lost_cleanup"]);
    expect(row.metrics).not.toHaveProperty("flaw_lost_cleanup");
    expect(row.metrics.flaw_stale_closure).toBe(true);
  });

  it("a finder success with no component results at all is a grader error", () => {
    const raw = { ...rawRow("clean"), gradingResult: undefined };
    expect(graderErrorsOf(raw)).toEqual([{ metric: null, reason: "no component results" }]);
    expect(checkRow(raw, "OpenAI")).toMatchObject({ graderError: true, graderErrorMetrics: [] });
  });

  it("an aborted grading (promptfoo failureReason 2 with no finder error) is a grader error with the reason", () => {
    const raw = {
      ...rawRow("clean"),
      success: false,
      failureReason: 2,
      error: "Error: grader crashed",
      gradingResult: undefined,
    };
    expect(graderErrorsOf(raw)).toEqual([{ metric: null, reason: "grading aborted: Error: grader crashed" }]);
  });

  it("a finder error is never also a grader error", () => {
    expect(graderErrorsOf(realProviderError(rawRow("react")))).toEqual([]);
  });

  it("one grader-error row makes the run a failed run — not a G3 FAIL — and still reports what the finder cost", () => {
    const rows = fullRun();
    rows[4] = withGrading(rows[4], [component("issue_recall"), graderErrorComponent("flaw_unsafe_html")]);
    const summary = summarizeRows(check(rows));
    expect(summary.failedRun).toBe(true);
    expect(summary.graderError).toBe(true);
    expect(summary.problems[0]).toMatch(/1 grader-error row\(s\) \(testIdx 5\) — not a candidate failure/u);
    expect(summary.g3).toBeUndefined();
    expect(summary.g4).toMatchObject({ pass: true, median: 0.0006 });
    expect(summary.graderErrorRows).toEqual([
      {
        testIdx: 5,
        case: "react",
        id: rows[4].id,
        errors: [{ metric: "flaw_unsafe_html", reason: "API call error: HTTP 503" }],
      },
    ]);
  });

  it("a grader-error row keeps its provider and A3 checks", () => {
    const rows = fullRun();
    rows[7] = withMetadata(withGrading(rows[7], []), { stepProviders: ["OpenAI", "Azure"], reasoningLeak: true });
    const summary = summarizeRows(check(rows));
    expect(summary.failedRun).toBe(true);
    expect(summary.invalidatedRows).toEqual([{ testIdx: 8, case: "cross-hunk", providers: ["OpenAI", "Azure"] }]);
    expect(summary.leakRows).toEqual([{ testIdx: 8, case: "cross-hunk", reported: true }]);
  });
});

describe("mergeRegrade — re-grading once (Amendment A1)", () => {
  const regradeRaw = (original, componentResults) => ({
    id: `regrade-of-${original.id}`,
    testIdx: 0,
    provider: { id: "echo" },
    testCase: { description: original.testCase.description, metadata: { regradeOf: original.id } },
    success: true,
    failureReason: 0,
    error: null,
    gradingResult: { pass: true, componentResults },
    response: { output: original.response.output, metadata: {} },
  });

  const runWithGraderError = () => {
    const rows = fullRun();
    rows[4] = withGrading(rows[4], [
      component("issue_recall"),
      component("review_fails"),
      component("flaw_stale_closure"),
      graderErrorComponent("flaw_lost_cleanup"),
      component("flaw_unsafe_html"),
    ]);
    return rows;
  };

  it("takes only the errored metric from the re-grade and keeps everything the finder produced", () => {
    const rows = runWithGraderError();
    const regrade = [regradeRaw(rows[4], [component("schema_validity"), component("flaw_lost_cleanup")])];
    const { rows: merged, problems } = mergeRegrade(check(rows), check(regrade));
    expect(problems).toEqual([]);
    expect(merged[4]).toMatchObject({
      regraded: true,
      regradeOf: rows[4].id,
      graderError: false,
      finderCost: 0.0006,
      stepProviders: ["OpenAI", "OpenAI"],
      metrics: { flaw_lost_cleanup: true, flaw_stale_closure: true, issue_recall: true },
    });
    const summary = summarizeRows(merged, problems);
    expect(summary.failedRun).toBe(false);
    expect(summary.g3.pass).toBe(true);
    expect(summary.regradedRows).toEqual([{ testIdx: 5, case: "react", id: rows[4].id }]);
  });

  it("a re-grade that fails the metric is a real G3 result", () => {
    const rows = runWithGraderError();
    const regrade = [regradeRaw(rows[4], [component("flaw_lost_cleanup", false)])];
    const { rows: merged, problems } = mergeRegrade(check(rows), check(regrade));
    const summary = summarizeRows(merged, problems);
    expect(summary.failedRun).toBe(false);
    expect(summary.g3.cases.react.failed).toEqual(["flaw_lost_cleanup"]);
  });

  it("a grader error AGAIN is a failed run for an owner decision, never a candidate failure", () => {
    const rows = runWithGraderError();
    const regrade = [regradeRaw(rows[4], [graderErrorComponent("flaw_lost_cleanup", "HTTP 502")])];
    const { problems } = mergeRegrade(check(rows), check(regrade));
    expect(problems).toEqual([`grader error again on ${rows[4].id}: HTTP 502`]);
    expect(summarizeRows(check(rows), problems).failedRun).toBe(true);
  });

  it.each([
    [
      "a row that was not a grader error",
      (rows) => [regradeRaw(rows[0], [component("issue_recall")])],
      /not a grader-error row/u,
    ],
    [
      "the same row twice",
      (rows) => [
        regradeRaw(rows[4], [component("flaw_lost_cleanup")]),
        regradeRaw(rows[4], [component("flaw_lost_cleanup")]),
      ],
      /re-graded more than once/u,
    ],
    [
      "a re-grade that did not grade the errored metric",
      (rows) => [regradeRaw(rows[4], [component("review_fails")])],
      /did not grade flaw_lost_cleanup/u,
    ],
    [
      "a re-grade row of another case",
      (rows) => [
        {
          ...regradeRaw(rows[4], [component("flaw_lost_cleanup")]),
          testCase: { description: DESCRIPTIONS.clean, metadata: { regradeOf: rows[4].id } },
        },
      ],
      /belongs to another case/u,
    ],
    [
      "a re-grade row with no regradeOf",
      (rows) => [
        { ...regradeRaw(rows[4], [component("flaw_lost_cleanup")]), testCase: { description: DESCRIPTIONS.react } },
      ],
      /names no original row/u,
    ],
  ])("refuses %s", (_label, regradeOf, pattern) => {
    const rows = runWithGraderError();
    const { problems } = mergeRegrade(check(rows), check(regradeOf(rows)));
    expect(problems.join("\n")).toMatch(pattern);
  });

  it("a grader-error row left un-re-graded keeps the run failed", () => {
    const rows = runWithGraderError();
    const { problems } = mergeRegrade(check(rows), []);
    expect(problems).toEqual([`grader-error row ${rows[4].id} (testIdx 5) was not re-graded`]);
  });

  it("a whole-grading error (no components) takes every metric from the re-grade", () => {
    const rows = fullRun();
    rows[9] = { ...rows[9], gradingResult: undefined };
    const regrade = [
      regradeRaw(rows[9], [component("schema_validity"), component("no_false_alarms"), component("tool_calls")]),
    ];
    const { rows: merged, problems } = mergeRegrade(check(rows), check(regrade));
    expect(problems).toEqual([]);
    expect(merged[9].metrics).toEqual({ schema_validity: true, no_false_alarms: true, tool_calls: true });
  });
});

describe("summarizeRows", () => {
  it("passes G3 and G4 on a clean 12-row run, with the median over all 12 rows", () => {
    const summary = summarizeRows(check(fullRun()));
    expect(summary.failedRun).toBe(false);
    expect(summary.pass).toBe(true);
    expect(summary.g3.pass).toBe(true);
    expect(summary.g3.cases.react.counts.flaw_unsafe_html).toBe(3);
    expect(summary.g4).toMatchObject({ pass: true, median: 0.0006, incompleteCost: 0, timeoutRetries: 0 });
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

  // F4: a provider mismatch or an A3 leak fails on its own, on ANY row, apart
  // from G3 and G4 — a cross-hunk row has no required metric, so before this
  // an invalidated one read as "G4 only" and a leaking one failed nothing.
  it("one mismatched provider invalidates its row: listed on its own, its case's metrics fail, G4 (cost) is untouched", () => {
    const rows = fullRun();
    rows[0] = withMetadata(rows[0], { stepProviders: ["OpenAI", "Azure"] });
    const summary = summarizeRows(check(rows));
    expect(summary.invalidatedRows).toEqual([{ testIdx: 1, case: "js-loop", providers: ["OpenAI", "Azure"] }]);
    expect(summary.g3.cases["js-loop"].failed).toEqual(["issue_recall"]);
    expect(summary.g3.pass).toBe(false);
    expect(summary.g4.pass).toBe(true);
    expect(summary.pass).toBe(false);
  });

  it("an invalidated CROSS-HUNK row fails the result on its own, although G3 and G4 both pass", () => {
    const rows = fullRun();
    rows[6] = withMetadata(rows[6], { stepProviders: ["OpenAI", null] });
    const summary = summarizeRows(check(rows));
    expect(summary.g3.pass).toBe(true);
    expect(summary.g4.pass).toBe(true);
    expect(summary.invalidatedRows).toEqual([{ testIdx: 7, case: "cross-hunk", providers: ["OpenAI", null] }]);
    expect(summary.pass).toBe(false);
  });

  it("an A3 leak on a CROSS-HUNK row fails the result on its own — it no longer exits 0", () => {
    const rows = fullRun();
    rows[8] = withMetadata(rows[8], { reasoningLeak: true });
    const summary = summarizeRows(check(rows));
    expect(summary.g3.pass).toBe(true);
    expect(summary.g4.pass).toBe(true);
    expect(summary.leakRows).toEqual([{ testIdx: 9, case: "cross-hunk", reported: true }]);
    expect(summary.pass).toBe(false);
  });

  it("one reasoning leak fails its row, even with every assertion green", () => {
    const rows = fullRun();
    rows[3] = withMetadata(rows[3], { reasoningLeak: true });
    const summary = summarizeRows(check(rows));
    expect(summary.leakRows).toHaveLength(1);
    expect(summary.g3.cases.react.failed).toContain("review_fails");
    expect(summary.g3.pass).toBe(false);
  });

  it("one missing cost fails G4 — the row is never omitted or counted as free", () => {
    const rows = fullRun();
    rows[11] = withMetadata(rows[11], { stepCostReported: [true, false] });
    const summary = summarizeRows(check(rows));
    expect(summary.g4.incompleteCost).toBe(1);
    expect(summary.g4.pass).toBe(false);
    expect(summary.g3.pass).toBe(true);
  });

  it("a G3 metric at 2/3 fails G3, with the real assertion-failure row shape", () => {
    const rows = fullRun();
    rows[9] = withGrading(rows[9], [
      component("schema_validity"),
      component("no_false_alarms", false),
      component("tool_calls"),
    ]);
    const summary = summarizeRows(check(rows));
    expect(summary.g3.cases.clean.counts.no_false_alarms).toBe(2);
    expect(summary.g3.cases.clean.failed).toEqual(["no_false_alarms"]);
    expect(summary.g3.pass).toBe(false);
  });

  it("a React row failing only flaw_lost_cleanup keeps 3/3 on its other metrics (the archived shape)", () => {
    const rows = fullRun();
    rows[3] = realAssertionFailure(rows[3]);
    const summary = summarizeRows(check(rows));
    expect(summary.g3.cases.react.counts).toEqual({
      issue_recall: 2,
      review_fails: 3,
      flaw_stale_closure: 3,
      flaw_lost_cleanup: 2,
      flaw_unsafe_html: 3,
    });
    expect(summary.g3.cases.react.failed).toEqual(["issue_recall", "flaw_lost_cleanup"]);
  });

  it("a finder-error row fails its case's required metrics and is listed", () => {
    const rows = fullRun();
    rows[0] = realProviderError(rows[0]);
    const summary = summarizeRows(check(rows));
    expect(summary.g3.pass).toBe(false);
    expect(summary.finderErrorRows).toEqual([
      { testIdx: 1, case: "js-loop", error: "No object generated: response did not match schema." },
    ]);
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
    expect(summary.pass).toBe(true);
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

  // F5: a timeout-triggered retry may have been billed without emitting a
  // step. Counted next to G4 as possibly under-costed telemetry; not a G4 fail.
  it("counts timeout-triggered retries next to G4 without failing it", () => {
    const rows = fullRun();
    rows[2] = withMetadata(rows[2], { retries: [{ error: "timeout", delayMs: 1000 }] });
    rows[5] = withMetadata(rows[5], { retries: [{ error: "APICallError-429", delayMs: 10_000 }] });
    const summary = summarizeRows(check(rows));
    expect(summary.retryCount).toBe(2);
    expect(summary.timeoutRetries).toBe(1);
    expect(summary.g4).toMatchObject({ pass: true, timeoutRetries: 1 });
  });

  it("counts production retries across rows, and flags rows without the field", () => {
    const rows = fullRun();
    rows[2] = withMetadata(rows[2], { retries: [{ error: "APICallError-429", delayMs: 10_000 }] });
    const { retries: _dropped, ...metadata } = rows[4].response.metadata;
    rows[4] = { ...rows[4], response: { ...rows[4].response, metadata } };
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
