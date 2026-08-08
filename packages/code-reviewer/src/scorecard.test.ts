import { describe, expect, it } from "vitest";

import { mergeFindings } from "./findings.js";
import { assignFindingIds, CRITERIA, validateJudgeReferences } from "./scorecard.js";
import { scoresSchema, type Finding, type JudgeOutput, type Scores } from "./schemas.js";

const finding = (overrides: Partial<Finding>): Finding => ({
  file: "src/a.ts",
  severity: "minor",
  category: "correctness",
  description: "d",
  suggestion: "s",
  ...overrides,
});

const scores = (findingIds: Partial<Record<keyof Scores, string[]>> = {}): Scores =>
  Object.fromEntries(
    CRITERIA.map(({ key }) => [
      key,
      { score: 8, justification: "j", findingIds: findingIds[key] ?? [] },
    ]),
  ) as Scores;

const judgeOutput = (findingIds: Partial<Record<keyof Scores, string[]>> = {}): JudgeOutput => ({
  scores: scores(findingIds),
  verdict: "passed",
  verdictReason: "r",
  summary: "s",
});

describe("CRITERIA", () => {
  it("carries exactly the six scoresSchema keys, labelled", () => {
    expect(CRITERIA.map(({ key }) => key).sort()).toEqual(Object.keys(scoresSchema.shape).sort());
    for (const { label } of CRITERIA) expect(label.length).toBeGreaterThan(0);
  });
});

describe("assignFindingIds", () => {
  it("returns an empty list untouched", () => {
    expect(assignFindingIds([])).toEqual([]);
  });

  it("assigns F1..Fn in input order, preserving finding fields", () => {
    const input = [finding({ startLine: 1 }), finding({ startLine: 2 }), finding({ startLine: 3 })];
    const identified = assignFindingIds(input);
    expect(identified.map((f) => f.id)).toEqual(["F1", "F2", "F3"]);
    expect(identified[1]).toEqual({ ...input[1], id: "F2" });
  });

  it("yields identical IDs for identical findings supplied in different orders (via mergeFindings)", () => {
    const a = finding({ file: "src/a.ts", startLine: 9 });
    const b = finding({ file: "src/b.ts", startLine: 1 });
    const c = finding({ file: "src/a.ts", startLine: 2, category: "security" });
    const first = assignFindingIds(mergeFindings([a, b, c]));
    const second = assignFindingIds(mergeFindings([c, a, b]));
    expect(first).toEqual(second);
  });
});

describe("validateJudgeReferences", () => {
  it("keeps known references and strips unknown ones, counting drops across criteria", () => {
    const output = judgeOutput({
      implementation_correctness: ["F1", "F9"],
      security_safety: ["BOGUS"],
      documentation: ["F2"],
    });
    const { output: cleaned, droppedFindingIdRefs } = validateJudgeReferences(output, ["F1", "F2"]);
    expect(droppedFindingIdRefs).toBe(2);
    expect(cleaned.scores.implementation_correctness.findingIds).toEqual(["F1"]);
    expect(cleaned.scores.security_safety.findingIds).toEqual([]);
    expect(cleaned.scores.documentation.findingIds).toEqual(["F2"]);
  });

  it("reports zero drops when every reference is known", () => {
    const output = judgeOutput({ complexity: ["F1"] });
    expect(validateJudgeReferences(output, ["F1"]).droppedFindingIdRefs).toBe(0);
  });

  it("treats empty findingIds as valid", () => {
    const { output: cleaned, droppedFindingIdRefs } = validateJudgeReferences(judgeOutput(), []);
    expect(droppedFindingIdRefs).toBe(0);
    for (const { key } of CRITERIA) expect(cleaned.scores[key].findingIds).toEqual([]);
  });

  it("does not mutate the input output object", () => {
    const output = judgeOutput({ idiomaticity: ["GHOST"] });
    validateJudgeReferences(output, []);
    expect(output.scores.idiomaticity.findingIds).toEqual(["GHOST"]);
  });
});
