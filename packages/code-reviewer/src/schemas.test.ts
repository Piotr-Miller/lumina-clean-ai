import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  categorySchema,
  implReviewOutputSchema,
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

describe("implReviewOutputSchema", () => {
  const grades = {
    plan_adherence: "PASS",
    scope_discipline: "PASS",
    safety_quality: "PASS",
    architecture: "PASS",
    pattern_consistency: "PASS",
    test_coverage: "PASS",
    success_criteria: "PASS",
  };
  const valid = {
    grades,
    verdict: "APPROVED",
    verdictReason: "matches the plan",
    findings: [],
  };

  it("accepts a well-formed result", () => {
    expect(implReviewOutputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an out-of-vocabulary grade", () => {
    const bad = { ...valid, grades: { ...grades, architecture: "OKAY" } };
    expect(implReviewOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing dimension — all seven are graded every time", () => {
    const partial: Record<string, string> = { ...grades };
    delete partial.test_coverage;
    expect(implReviewOutputSchema.safeParse({ ...valid, grades: partial }).success).toBe(false);
  });

  it("rejects an out-of-vocabulary verdict", () => {
    expect(implReviewOutputSchema.safeParse({ ...valid, verdict: "LGTM" }).success).toBe(false);
  });

  it("rejects an empty verdictReason", () => {
    expect(implReviewOutputSchema.safeParse({ ...valid, verdictReason: "" }).success).toBe(false);
  });

  it("rejects an unknown dimension on a finding", () => {
    const bad = {
      ...valid,
      findings: [
        { dimension: "vibes", severity: "WARNING", impact: "LOW", title: "t", detail: "d", fix: "f" },
      ],
    };
    expect(implReviewOutputSchema.safeParse(bad).success).toBe(false);
  });

  // Line numbers go through the shared `lineNumber` helper: refine, never
  // .int()/.min(), because Anthropic's structured-output endpoint rejects the
  // JSON Schema minimum/maximum bounds those emit.
  it("rejects a zero or fractional startLine but accepts its absence", () => {
    const withLine = (startLine: unknown) => ({
      ...valid,
      // A WARNING finding forbids PASS on its own dimension, so the grade moves
      // with the fixture — otherwise this tests the consistency rule by accident.
      grades: { ...grades, plan_adherence: "WARNING" },
      findings: [
        {
          dimension: "plan_adherence",
          severity: "WARNING",
          impact: "LOW",
          title: "t",
          detail: "d",
          fix: "f",
          file: "src/a.ts",
          startLine,
        },
      ],
    });
    expect(implReviewOutputSchema.safeParse(withLine(0)).success).toBe(false);
    expect(implReviewOutputSchema.safeParse(withLine(2.5)).success).toBe(false);
    expect(implReviewOutputSchema.safeParse(withLine(12)).success).toBe(true);
    expect(implReviewOutputSchema.safeParse(withLine(undefined)).success).toBe(true);
  });

  // Vocabulary validation proves the model used our words, not that the words
  // agree. All-PASS grades beside a CRITICAL finding would render a scorecard
  // that argues against its own findings (impl-review-phase-2 F4).
  describe("consistency between grades, findings, and verdict", () => {
    const finding = (over: Record<string, unknown> = {}) => ({
      dimension: "safety_quality",
      severity: "CRITICAL",
      impact: "MEDIUM",
      title: "t",
      detail: "d",
      fix: "f",
      ...over,
    });

    it("accepts a coherent critical result", () => {
      const result = implReviewOutputSchema.safeParse({
        ...valid,
        grades: { ...grades, safety_quality: "FAIL" },
        verdict: "REJECTED",
        findings: [finding()],
      });
      expect(result.success).toBe(true);
    });

    it("rejects a CRITICAL finding whose dimension is not graded FAIL", () => {
      const result = implReviewOutputSchema.safeParse({
        ...valid,
        verdict: "REJECTED",
        findings: [finding()],
      });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain("graded FAIL");
    });

    it("rejects a CRITICAL finding without the REJECTED verdict", () => {
      const result = implReviewOutputSchema.safeParse({
        ...valid,
        grades: { ...grades, safety_quality: "FAIL" },
        verdict: "NEEDS_ATTENTION",
        findings: [finding()],
      });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain("requires the REJECTED verdict");
    });

    it("rejects a WARNING finding on a dimension graded PASS", () => {
      const result = implReviewOutputSchema.safeParse({
        ...valid,
        verdict: "NEEDS_ATTENTION",
        findings: [finding({ severity: "WARNING" })],
      });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain("contradicts a PASS grade");
    });

    // OBSERVATIONs are informational — a dimension can note one and still pass.
    it("leaves an OBSERVATION free to sit beside a PASS", () => {
      const result = implReviewOutputSchema.safeParse({
        ...valid,
        findings: [finding({ severity: "OBSERVATION" })],
      });
      expect(result.success).toBe(true);
    });

    it("rejects APPROVED alongside a FAIL grade", () => {
      const result = implReviewOutputSchema.safeParse({
        ...valid,
        grades: { ...grades, architecture: "FAIL" },
      });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain("APPROVED contradicts a FAIL grade");
    });

    it("rejects a startLine with no file to index into", () => {
      const result = implReviewOutputSchema.safeParse({
        ...valid,
        grades: { ...grades, safety_quality: "WARNING" },
        verdict: "NEEDS_ATTENTION",
        findings: [finding({ severity: "WARNING", startLine: 12 })],
      });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain("without the file it indexes into");
    });

    // Only ever in the understating direction: a run grading itself more
    // harshly than its findings demand is a judgment call, not a contradiction.
    it("does not second-guess a run that grades itself harshly", () => {
      const result = implReviewOutputSchema.safeParse({
        ...valid,
        grades: { ...grades, test_coverage: "FAIL" },
        verdict: "REJECTED",
        findings: [],
      });
      expect(result.success).toBe(true);
    });
  });

  it("emits no JSON Schema minimum/maximum bounds that Anthropic would reject", () => {
    const json = JSON.stringify(z.toJSONSchema(implReviewOutputSchema));
    expect(json).not.toContain('"minimum"');
    expect(json).not.toContain('"maximum"');
  });
});
