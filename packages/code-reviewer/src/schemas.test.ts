import { describe, expect, it } from "vitest";

import { findingSchema, reviewResultSchema, reviewUnitSchema } from "./schemas.js";

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
