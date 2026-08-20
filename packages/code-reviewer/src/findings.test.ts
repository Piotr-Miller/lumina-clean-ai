import { describe, expect, it } from "vitest";

import { findingKey, mergeFindings, normalizeFindings } from "./findings.js";
import type { Finding, ReviewUnit } from "./schemas.js";

const finding = (overrides: Partial<Finding>): Finding => ({
  file: "src/a.ts",
  severity: "minor",
  crossUserAccess: false,
  category: "correctness",
  description: "d",
  suggestion: "s",
  ...overrides,
});

describe("findingKey", () => {
  it("derives file:startLine", () => {
    expect(findingKey(finding({ file: "src/a.ts", startLine: 12 }))).toBe("src/a.ts:12");
  });

  it("keys file-level findings (no startLine) to line 0", () => {
    expect(findingKey(finding({ file: "src/a.ts" }))).toBe("src/a.ts:0");
  });
});

describe("mergeFindings", () => {
  it("dedups same key+category keeping the higher severity", () => {
    const merged = mergeFindings(
      [finding({ startLine: 5, severity: "minor", description: "first" })],
      [finding({ startLine: 5, severity: "critical", description: "second" })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.severity).toBe("critical");
    expect(merged[0]?.description).toBe("second");
  });

  it("keeps the first finding on a severity tie", () => {
    const merged = mergeFindings([
      finding({ startLine: 5, description: "first" }),
      finding({ startLine: 5, description: "second" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.description).toBe("first");
  });

  it("keeps different categories at the same key", () => {
    const merged = mergeFindings([
      finding({ startLine: 5, category: "security" }),
      finding({ startLine: 5, category: "correctness" }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("orders deterministically by file, startLine, category (code points, not locale)", () => {
    const merged = mergeFindings([
      finding({ file: "src/b.ts", startLine: 1 }),
      finding({ file: "src/a.ts", startLine: 9 }),
      finding({ file: "src/a.ts", startLine: 2, category: "style" }),
      finding({ file: "src/a.ts", startLine: 2, category: "security" }),
      finding({ file: "src/a.ts" }),
    ]);
    expect(
      merged.map((f) => `${findingKey(f)}|${f.category}`),
    ).toEqual([
      "src/a.ts:0|correctness",
      "src/a.ts:2|security",
      "src/a.ts:2|style",
      "src/a.ts:9|correctness",
      "src/b.ts:1|correctness",
    ]);
  });
});

describe("normalizeFindings", () => {
  const fileUnit: ReviewUnit = { kind: "file", path: "src/real.ts", content: "x" };
  const hunkUnit: ReviewUnit = { kind: "hunk", path: "src/real.ts", content: "x", startLine: 10 };
  const diffUnit: ReviewUnit = { kind: "diff", diff: "--- a\n+++ b" };

  it("coerces file to the unit path for file units", () => {
    const [f] = normalizeFindings(fileUnit, [finding({ file: "hallucinated.ts" })]);
    expect(f.file).toBe("src/real.ts");
  });

  it("coerces file to the unit path for hunk units", () => {
    const [f] = normalizeFindings(hunkUnit, [finding({ file: "hallucinated.ts" })]);
    expect(f.file).toBe("src/real.ts");
  });

  it("leaves file untouched for diff units (multi-file)", () => {
    const [f] = normalizeFindings(diffUnit, [finding({ file: "src/other.ts" })]);
    expect(f.file).toBe("src/other.ts");
  });

  it("drops endLine when startLine is missing", () => {
    const [f] = normalizeFindings(diffUnit, [finding({ endLine: 7 })]);
    expect(f.endLine).toBeUndefined();
  });

  it("drops endLine when it precedes startLine", () => {
    const [f] = normalizeFindings(diffUnit, [finding({ startLine: 9, endLine: 3 })]);
    expect(f.startLine).toBe(9);
    expect(f.endLine).toBeUndefined();
  });

  it("keeps a coherent range", () => {
    const [f] = normalizeFindings(diffUnit, [finding({ startLine: 3, endLine: 9 })]);
    expect(f.endLine).toBe(9);
  });
});
