import { describe, expect, it } from "vitest";

import {
  categorySchema,
  judgeOutputSchema,
  reviewUnitSchema,
  scoresSchema,
  findingSchema,
  reviewResultSchema,
} from "./schemas.js";

const fileLevelFinding = {
  file: "src/a.ts",
  severity: "major",
  category: "security",
  description: "d",
  suggestion: "s",
};
const validFinding = { ...fileLevelFinding, startLine: 3, endLine: 5 };

describe("findingSchema", () => {
  it("parses a valid finding", () => {
    expect(findingSchema.parse(validFinding)).toEqual(validFinding);
  });

  it("parses a file-level finding without lines", () => {
    expect(findingSchema.parse(fileLevelFinding)).toEqual(fileLevelFinding);
  });

  it.each([
    ["unknown severity", { ...validFinding, severity: "blocker" }],
    ["unknown category", { ...validFinding, category: "general" }],
    ["zero startLine", { ...validFinding, startLine: 0 }],
    ["negative startLine", { ...validFinding, startLine: -4 }],
    ["fractional startLine", { ...validFinding, startLine: 1.5 }],
    ["empty file", { ...validFinding, file: "" }],
  ])("rejects %s", (_name, invalid) => {
    expect(findingSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("reviewResultSchema", () => {
  it("parses a valid result", () => {
    const result = { summary: "ok", findings: [validFinding] };
    expect(reviewResultSchema.parse(result)).toEqual(result);
  });

  it("rejects a result without summary", () => {
    expect(reviewResultSchema.safeParse({ findings: [] }).success).toBe(false);
  });
});

describe("categorySchema (rubric-signal categories)", () => {
  it.each(["testing", "documentation"])("accepts the additive %s category", (category) => {
    expect(categorySchema.safeParse(category).success).toBe(true);
  });
});

const criterion = { score: 8, justification: "j", findingIds: ["F1"] };
const validScores = Object.fromEntries(
  Object.keys(scoresSchema.shape).map((key) => [key, criterion]),
);
const validJudgeOutput = {
  scores: validScores,
  verdict: "passed",
  verdictReason: "well supported",
  summary: "overall fine",
};

describe("judgeOutputSchema", () => {
  it("parses a valid judge output", () => {
    expect(judgeOutputSchema.parse(validJudgeOutput)).toEqual(validJudgeOutput);
  });

  it.each([
    ["a missing criterion", { ...validJudgeOutput, scores: { implementation_correctness: criterion } }],
    ["an unknown verdict", { ...validJudgeOutput, verdict: "maybe" }],
    ["an empty verdictReason", { ...validJudgeOutput, verdictReason: "" }],
    ["a missing summary", { scores: validScores, verdict: "passed", verdictReason: "r" }],
    [
      "an out-of-range score",
      { ...validJudgeOutput, scores: { ...validScores, complexity: { ...criterion, score: 11 } } },
    ],
    [
      "a zero score",
      { ...validJudgeOutput, scores: { ...validScores, complexity: { ...criterion, score: 0 } } },
    ],
    [
      "a fractional score",
      { ...validJudgeOutput, scores: { ...validScores, complexity: { ...criterion, score: 6.5 } } },
    ],
  ])("rejects %s", (_name, invalid) => {
    expect(judgeOutputSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("reviewUnitSchema", () => {
  it.each([
    ["diff", { kind: "diff", diff: "--- a\n+++ b" }],
    ["file", { kind: "file", path: "src/a.ts", content: "x" }],
    ["hunk", { kind: "hunk", path: "src/a.ts", content: "x", startLine: 10 }],
  ])("parses a %s unit", (_name, unit) => {
    expect(reviewUnitSchema.parse(unit)).toEqual(unit);
  });

  it.each([
    ["unknown kind", { kind: "repo", path: "." }],
    ["empty diff", { kind: "diff", diff: "" }],
    ["hunk without startLine", { kind: "hunk", path: "src/a.ts", content: "x" }],
    ["hunk with zero startLine", { kind: "hunk", path: "src/a.ts", content: "x", startLine: 0 }],
  ])("rejects %s", (_name, invalid) => {
    expect(reviewUnitSchema.safeParse(invalid).success).toBe(false);
  });
});
