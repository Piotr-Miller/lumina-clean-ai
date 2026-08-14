import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  categorySchema,
  implReviewOutputSchema,
  judgeOutputSchema,
  normalizeImplFinding,
  normalizeJudgeOutput,
  reviewUnitSchema,
  scoresWireSchema,
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

// WIRE fixture: score is a string, because that is what the model returns and
// what the enum constrains. The numeric score is produced by
// normalizeJudgeOutput, exercised separately below.
const criterion = { score: "8", justification: "j", findingIds: ["F1"] };
const validScores = Object.fromEntries(
  Object.keys(scoresWireSchema.shape).map((key) => [key, criterion]),
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
    // These were the live failure: a model returning any of them produces valid
    // JSON that then fails validation. They used to be caught by an invisible
    // refine; the enum now states the constraint in the schema itself.
    ["an out-of-range score", { ...validJudgeOutput, scores: { ...validScores, complexity: { ...criterion, score: "11" } } }],
    ["a zero score", { ...validJudgeOutput, scores: { ...validScores, complexity: { ...criterion, score: "0" } } }],
    ["a fractional score", { ...validJudgeOutput, scores: { ...validScores, complexity: { ...criterion, score: "6.5" } } }],
    ["a 0-100 scale score", { ...validJudgeOutput, scores: { ...validScores, complexity: { ...criterion, score: "85" } } }],
    ["a numeric score", { ...validJudgeOutput, scores: { ...validScores, complexity: { ...criterion, score: 8 } } }],
    ["an empty summary", { ...validJudgeOutput, summary: "" }],
  ])("rejects %s", (_name, invalid) => {
    expect(judgeOutputSchema.safeParse(invalid).success).toBe(false);
  });

  // The constraint must be VISIBLE to the model — that is the whole point of
  // moving it out of a refine. `minimum`/`maximum` stay absent because the
  // provider rejects them (Phase 1 live finding).
  it("emits the score range as a schema enum, with no numeric bounds", () => {
    const json = z.toJSONSchema(judgeOutputSchema);
    // The emitted schema is deliberately untyped here — the assertion is about
    // what the PROVIDER receives, not about zod's TS surface.
    const walk = (node: unknown, ...keys: string[]): unknown =>
      keys.reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], node);
    const score = walk(json, "properties", "scores", "properties", "complexity", "properties", "score");
    expect((score as { enum?: unknown }).enum).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    const asText = JSON.stringify(json);
    expect(asText).not.toContain('"minimum"');
    expect(asText).not.toContain('"maximum"');
    expect(asText).not.toContain('"anyOf"');
  });
});

describe("normalizeJudgeOutput", () => {
  it("turns every wire score into its exact number", () => {
    const out = normalizeJudgeOutput(judgeOutputSchema.parse(validJudgeOutput));
    for (const key of Object.keys(scoresWireSchema.shape)) {
      expect(out.scores[key as keyof typeof out.scores].score).toBe(8);
    }
    expect(out.verdict).toBe("passed");
    expect(out.summary).toBe("overall fine");
  });

  it("preserves each criterion's own justification and findingIds", () => {
    const wire = judgeOutputSchema.parse({
      ...validJudgeOutput,
      scores: {
        ...validScores,
        idiomaticity: { score: "3", justification: "idiom-specific", findingIds: ["F2", "F3"] },
      },
    });
    const out = normalizeJudgeOutput(wire);
    expect(out.scores.idiomaticity).toEqual({ score: 3, justification: "idiom-specific", findingIds: ["F2", "F3"] });
    // Not cross-contaminated by the explicit per-field construction.
    expect(out.scores.complexity.score).toBe(8);
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
  // FULL COMBINATION MATRIX. The whole reason the locus field exists is that
  // anchoring rotted to 0/10 while two optional fields quietly accepted every
  // shape. Enumerating all of them here is what keeps that from recurring
  // silently — a relaxed rule shows up as a flipped expectation, not as drift.
  describe("locus / file / startLine combinations", () => {
    const withFinding = (finding: Record<string, unknown>) => ({
      ...valid,
      // A WARNING finding forbids PASS on its own dimension, so the grade moves
      // with the fixture — otherwise this tests the consistency rule by accident.
      grades: { ...grades, plan_adherence: "WARNING" },
      findings: [
        { dimension: "plan_adherence", severity: "WARNING", impact: "LOW", title: "t", detail: "d", fix: "f", ...finding },
      ],
    });
    const parse = (finding: Record<string, unknown>) => implReviewOutputSchema.safeParse(withFinding(finding));

    it.each([
      ["code + file + line", { locus: "code", file: "src/a.ts", startLine: 12 }],
      ["file + file only", { locus: "file", file: "src/a.ts" }],
      ["absent, nothing else", { locus: "absent" }],
    ])("accepts %s", (_label, finding) => {
      expect(parse(finding).success).toBe(true);
    });

    it.each([
      // Each row is a way the old optional-field shape silently passed.
      ["code without line", { locus: "code", file: "src/a.ts" }],
      ["code without file", { locus: "code", startLine: 12 }],
      ["code with neither", { locus: "code" }],
      ["file carrying a line", { locus: "file", file: "src/a.ts", startLine: 12 }],
      ["file without a path", { locus: "file" }],
      ["absent carrying a path", { locus: "absent", file: "src/a.ts" }],
      ["absent carrying a line", { locus: "absent", startLine: 12 }],
      ["no locus at all", { file: "src/a.ts", startLine: 12 }],
      ["an unknown locus", { locus: "elsewhere", file: "src/a.ts", startLine: 12 }],
      ["code with a zero line", { locus: "code", file: "src/a.ts", startLine: 0 }],
      ["code with a fractional line", { locus: "code", file: "src/a.ts", startLine: 2.5 }],
      ["code with an empty path", { locus: "code", file: "", startLine: 12 }],
    ])("rejects %s", (_label, finding) => {
      expect(parse(finding).success).toBe(false);
    });
  });

  // The wire shape is flat so the emitted JSON Schema stays a single object; the
  // discriminated union that consumers use is produced by normalizeImplFinding
  // AFTER validation. This is the seam that keeps oneOf out of the schema.
  describe("normalizeImplFinding", () => {
    const base = { dimension: "plan_adherence", severity: "WARNING", impact: "LOW", title: "t", detail: "d", fix: "f" } as const;

    it("constructs each variant with exactly its own fields", () => {
      expect(normalizeImplFinding({ ...base, locus: "code", file: "src/a.ts", startLine: 12 })).toEqual({
        ...base,
        locus: "code",
        file: "src/a.ts",
        startLine: 12,
      });
      const fileLevel = normalizeImplFinding({ ...base, locus: "file", file: "src/a.ts" });
      expect(fileLevel).toEqual({ ...base, locus: "file", file: "src/a.ts" });
      expect(fileLevel).not.toHaveProperty("startLine");
      const absent = normalizeImplFinding({ ...base, locus: "absent" });
      expect(absent).toEqual({ ...base, locus: "absent" });
      expect(absent).not.toHaveProperty("file");
      expect(absent).not.toHaveProperty("startLine");
    });

    // Unreachable via the schema, but normalizeImplFinding must be sound on its
    // own terms rather than trusting that a caller validated first.
    it("throws rather than emitting a half-built variant", () => {
      expect(() => normalizeImplFinding({ ...base, locus: "code", file: "src/a.ts" })).toThrow(/missing file or startLine/);
      expect(() => normalizeImplFinding({ ...base, locus: "file" })).toThrow(/missing file/);
    });
  });

  it("emits no JSON Schema minimum/maximum bounds that Anthropic would reject", () => {
    const json = JSON.stringify(z.toJSONSchema(implReviewOutputSchema));
    expect(json).not.toContain('"minimum"');
    expect(json).not.toContain('"maximum"');
  });
});
