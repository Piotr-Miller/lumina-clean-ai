// Hermetic tests for the re-grade config generator (gate.md Amendment A1):
// builds from the REAL matrix config, so a case renamed or an assertion moved
// surfaces here, not in a paid re-grade run.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

import { buildRegradeConfig, selectGraderErrorRows } from "./promptfoo-regrade-config.mjs";

const matrix = load(readFileSync(resolve(import.meta.dirname, "..", "evals", "promptfooconfig.yaml"), "utf8"));
const REACT = matrix.tests.find((t) => t.description.startsWith("React 16->19")).description;
const CLEAN = matrix.tests.find((t) => t.description.startsWith("Defect-free mechanical rename")).description;

const component = (metric, pass = true) => ({ pass, assertion: { metric } });
const graderError = (metric) => ({
  pass: false,
  reason: "HTTP 503",
  assertion: { metric },
  metadata: { graderError: true },
});

const row = (description, componentResults, overrides = {}) => ({
  id: "row-a",
  testIdx: 4,
  testCase: { description },
  success: componentResults.every((c) => c.pass),
  failureReason: 0,
  response: { output: '{"summary":"s","findings":[]}', metadata: { cost: 0.0006 } },
  gradingResult: { componentResults },
  ...overrides,
});

describe("selectGraderErrorRows", () => {
  it("keeps only rows whose finder succeeded and whose grading errored", () => {
    const rows = [
      row(REACT, [component("issue_recall"), graderError("flaw_lost_cleanup")]),
      row(REACT, [component("issue_recall", false)]),
      row(REACT, [], { response: { error: "HTTP 429" }, gradingResult: undefined }),
    ];
    expect(selectGraderErrorRows(rows)).toEqual([rows[0]]);
  });
});

describe("buildRegradeConfig", () => {
  const errored = row(REACT, [
    component("issue_recall"),
    graderError("flaw_lost_cleanup"),
    component("flaw_unsafe_html"),
  ]);

  it("makes one test per row with the stored output as providerOutput, keeping only the errored rubric", () => {
    const config = buildRegradeConfig(matrix, [errored], { exportPath: "orig.json" });
    expect(config.providers).toEqual(["echo"]);
    expect(config.defaultTest).toEqual(matrix.defaultTest);
    expect(config.env).toEqual(matrix.env);
    expect(config.tests).toHaveLength(1);
    const [test] = config.tests;
    expect(test.providerOutput).toBe('{"summary":"s","findings":[]}');
    expect(test.metadata).toEqual({ regradeOf: "row-a", regradeOfTestIdx: 4 });
    expect(test.description).toBe(REACT);
    expect(test.assert.map((a) => a.metric)).toEqual(["flaw_lost_cleanup"]);
    expect(test.assert[0].type).toBe("llm-rubric");
    // The case's own vars travel with it: the rubric's expectedIssues etc.
    expect(test.vars).toEqual(matrix.tests.find((t) => t.description === REACT).vars);
  });

  it("a whole-grading error re-grades every assertion of the case except the telemetry readers, and names them", () => {
    const whole = row(CLEAN, [], { gradingResult: undefined });
    const [test] = buildRegradeConfig(matrix, [whole], { exportPath: "o" }).tests;
    // A providerOutput row has no provider metadata, so tool_calls would fail
    // closed in the re-grade rather than measure anything.
    expect(test.assert.map((a) => a.metric)).toEqual(["no_false_alarms"]);
    expect(test.metadata.notRegradable).toEqual(["tool_calls"]);
  });

  it("refuses a row of a case the matrix does not have", () => {
    const foreign = row("Some other case", [graderError("x")]);
    expect(() => buildRegradeConfig(matrix, [foreign], { exportPath: "o" })).toThrow(/not in the matrix config/u);
  });

  it("refuses a row without a stored finder output", () => {
    const noOutput = { ...errored, response: { metadata: {} } };
    expect(() => buildRegradeConfig(matrix, [noOutput], { exportPath: "o" })).toThrow(/no stored finder output/u);
  });

  it("refuses when no assertion of the case carries the errored metric", () => {
    const unknownMetric = row(REACT, [graderError("not_a_metric")]);
    expect(() => buildRegradeConfig(matrix, [unknownMetric], { exportPath: "o" })).toThrow(/no assertion of the case/u);
  });
});
