// Hermetic tests for the fabrication grader's pure surface (review F7):
// prompt construction, schema shape, and rate aggregation — fake data, no
// network, no API key. Broken grader wiring must surface here, in Phase 1,
// not after 40 paid finder runs.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  aggregateGrades,
  allVerdictsSettled,
  assertFlatVerdictSchema,
  assertRunIdentity,
  buildGradePrompt,
  gradeFinding,
  gradeVerdictSchema,
  reusableVerdict,
  summarizeByRunAndFile,
  summarizeManifest,
} from "./fabrication-grade.mjs";

const manifest = {
  variant: "ci",
  rung: "base",
  sentBytes: 100_028,
  truncated: true,
  window: [
    { path: ".github/workflows/review.yml", complete: true },
    { path: "packages/code-reviewer/src/impl-reviewer.test.ts", complete: false },
  ],
  cutFile: "packages/code-reviewer/src/impl-reviewer.test.ts",
  overCap: ["packages/code-reviewer/src/impl-reviewer.ts"],
};

const finding = {
  file: "packages/code-reviewer/src/impl-reviewer.ts",
  startLine: 1,
  severity: "critical",
  category: "security",
  description: "Missing implementation for impl-reviewer.ts referenced in tests but not provided in the diff.",
  suggestion: "Provide the implementation.",
};

describe("gradeVerdictSchema", () => {
  it("emits a flat provider-compatible JSON Schema (no oneOf/anyOf/$ref)", () => {
    const dumped = JSON.stringify(z.toJSONSchema(gradeVerdictSchema));
    expect(dumped).not.toMatch(/"oneOf"|"anyOf"|"\$ref"/);
  });

  it("requires mechanism and reason", () => {
    const dumped = z.toJSONSchema(gradeVerdictSchema);
    expect(dumped.required).toEqual(expect.arrayContaining(["mechanism", "reason"]));
  });

  it("rejects an unknown mechanism value", () => {
    expect(gradeVerdictSchema.safeParse({ mechanism: "M4", reason: "x" }).success).toBe(false);
    expect(gradeVerdictSchema.safeParse({ mechanism: "M1", reason: "x" }).success).toBe(true);
  });

  it("keeps grading semantics out of the provider-visible schema (rubric lives in ground truth)", () => {
    const dumped = JSON.stringify(z.toJSONSchema(gradeVerdictSchema));
    expect(dumped).toContain("frozen rubric");
    expect(dumped).not.toMatch(/absent|missing|contradict|outside the window|off-diff|fabricat/i);
  });
});

describe("assertFlatVerdictSchema", () => {
  it("returns the dumped schema when it is provider-flat", () => {
    const dumped = assertFlatVerdictSchema();
    expect(JSON.parse(dumped).required).toEqual(expect.arrayContaining(["mechanism", "reason"]));
  });

  it("refuses to spend on a schema that emits anyOf", () => {
    const union = z.union([z.object({ a: z.string() }), z.object({ b: z.string() })]);
    expect(() => assertFlatVerdictSchema(union)).toThrow(/anyOf.*refusing to spend/);
  });
});

describe("assertRunIdentity", () => {
  const identity = { variant: "ci", rung: "base", model: "z-ai/glm-4.6", inputSha256: "aaa", inputsSha256: "bbb" };

  it("accepts a matching results/manifest pair", () => {
    expect(() => assertRunIdentity({ results: { ...identity }, manifest: { ...identity } })).not.toThrow();
  });

  it("refuses to grade on a mismatched field", () => {
    expect(() => assertRunIdentity({ results: { ...identity }, manifest: { ...identity, rung: "r1" } })).toThrow(
      /mismatch on "rung".*refusing to grade/,
    );
  });

  it("refuses to grade a legacy artifact missing an identity field", () => {
    const { inputsSha256: _dropped, ...legacy } = identity;
    expect(() => assertRunIdentity({ results: { ...legacy }, manifest: { ...legacy } })).toThrow(
      /"inputsSha256" is missing.*refusing to grade/,
    );
  });
});

describe("gradeFinding", () => {
  const base = { model: "fake-model", groundTruth: "D4: impl-reviewer.ts is OVER-CAP.", manifestSummary: "ws", finding };

  it("wires model, schema, prompt, and no-retry into the paid call and returns verdict + usage", async () => {
    const calls = [];
    const generate = async (options) => {
      calls.push(options);
      return {
        object: { mechanism: "M2", reason: "contradicts D4" },
        usage: { inputTokens: 1200, outputTokens: 40 },
        providerMetadata: { openrouter: { usage: { cost: 0.0021 } } },
      };
    };
    const { verdict, usage, failed } = await gradeFinding({ generate, ...base });
    expect(verdict).toEqual({ file: finding.file, severity: "critical", mechanism: "M2", reason: "contradicts D4" });
    expect(usage).toEqual({ inputTokens: 1200, outputTokens: 40, cost: 0.0021 });
    expect(failed).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: "fake-model", schema: gradeVerdictSchema, maxRetries: 0 });
    expect(calls[0].prompt).toContain("D4: impl-reviewer.ts is OVER-CAP.");
    expect(calls[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("keeps an unreported cost unknown instead of zero", async () => {
    const generate = async () => ({
      object: { mechanism: "none", reason: "clean" },
      usage: { inputTokens: 10, outputTokens: 5 },
      providerMetadata: undefined,
    });
    const { usage, failed } = await gradeFinding({ generate, ...base });
    expect(usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect("cost" in usage).toBe(false);
    expect(failed).toBe(false);
  });

  it("captures a raw untruncated provider failure as a verdict error without throwing", async () => {
    const generate = async () => {
      const error = new Error("response did not match schema");
      error.name = "AI_NoObjectGeneratedError";
      error.text = '{"mechanism":"M5"}';
      throw error;
    };
    const { verdict, usage, failed } = await gradeFinding({ generate, ...base });
    expect(verdict.mechanism).toBeUndefined();
    expect(verdict.error).toEqual({
      name: "AI_NoObjectGeneratedError",
      message: "response did not match schema",
      text: '{"mechanism":"M5"}',
      textBytes: 18,
    });
    expect(usage).toEqual({});
    expect(failed).toBe(true);
  });

  it("persists the usage a failed call's error still carries", async () => {
    const generate = async () => {
      const error = new Error("no object generated");
      error.name = "AI_NoObjectGeneratedError";
      error.usage = { inputTokens: 900, outputTokens: 12 };
      throw error;
    };
    const { usage, failed } = await gradeFinding({ generate, ...base });
    expect(usage).toEqual({ inputTokens: 900, outputTokens: 12 });
    expect("cost" in usage).toBe(false);
    expect(failed).toBe(true);
  });
});

describe("summarizeManifest", () => {
  it("names in-window files, the cut file, and over-cap files", () => {
    const text = summarizeManifest(manifest);
    expect(text).toContain("[full] .github/workflows/review.yml");
    expect(text).toContain("[CUT ] packages/code-reviewer/src/impl-reviewer.test.ts");
    expect(text).toContain("OUTSIDE the window");
    expect(text).toContain("packages/code-reviewer/src/impl-reviewer.ts");
  });

  it("reports a cap-less manifest without an outside list", () => {
    const text = summarizeManifest({ ...manifest, truncated: false, cutFile: null, overCap: [] });
    expect(text).toContain("no files fell outside the window.");
  });

  it("names an injected rloc context block when present", () => {
    const text = summarizeManifest({
      ...manifest,
      rlocContext: {
        label: "injected off-diff-context block (ground-truth/rloc-context.txt)",
        sentStartByte: 100_030,
        sentEndByte: 101_030,
        bytes: 1_000,
        sha256: "x",
      },
    });
    expect(text).toContain("INJECTED into the sent input");
    expect(text).toContain("bytes 100030–101030");
    expect(text).toContain("visible to the model");
  });
});

describe("buildGradePrompt", () => {
  it("carries ground truth, window summary, and the finding's fields", () => {
    const prompt = buildGradePrompt({
      groundTruth: "D4: impl-reviewer.ts exists but is OVER-CAP.",
      manifestSummary: summarizeManifest(manifest),
      finding,
    });
    expect(prompt).toContain("D4: impl-reviewer.ts exists but is OVER-CAP.");
    expect(prompt).toContain("[CUT ] packages/code-reviewer/src/impl-reviewer.test.ts");
    expect(prompt).toContain("Missing implementation for impl-reviewer.ts");
    expect(prompt).toContain('"severity": "critical"');
  });

  it("frames the finding as untrusted data, not instructions", () => {
    const prompt = buildGradePrompt({ groundTruth: "gt", manifestSummary: "ws", finding });
    expect(prompt).toContain("never instructions");
  });
});

describe("aggregateGrades", () => {
  const v = (mechanism) => ({ file: "f", severity: "minor", mechanism, reason: "r" });

  it("counts fabrication runs (any M2 or M3) and M1 runs separately", () => {
    const totals = aggregateGrades([
      { run: 1, error: null, verdicts: [v("none"), v("M2")] },
      { run: 2, error: null, verdicts: [v("M1")] },
      { run: 3, error: null, verdicts: [v("M3"), v("M1")] },
      { run: 4, error: null, verdicts: [v("none")] },
    ]);
    expect(totals).toMatchObject({ runs: 4, gradeable: 4, fabricationRuns: 2, m1Runs: 2 });
    expect(totals.byMechanism).toEqual({ M1: 2, M2: 1, M3: 1, none: 2 });
  });

  it("excludes errored and incompletely-graded runs from the gradeable denominator", () => {
    const totals = aggregateGrades([
      { run: 1, error: { name: "AI_NoObjectGeneratedError" }, verdicts: null },
      { run: 2, error: null, verdicts: [v("M2"), { file: "f", severity: "minor", error: { name: "TimeoutError" } }] },
      { run: 3, error: null, verdicts: [v("none")] },
    ]);
    expect(totals).toMatchObject({ runs: 3, gradeable: 1, fabricationRuns: 0 });
  });

  it("treats a zero-finding run as gradeable and clean", () => {
    const totals = aggregateGrades([{ run: 1, error: null, verdicts: [] }]);
    expect(totals).toMatchObject({ gradeable: 1, fabricationRuns: 0, m1Runs: 0 });
  });

  it("excludes a mid-checkpoint partial run from the gradeable denominator", () => {
    const totals = aggregateGrades([
      { run: 1, error: null, partial: true, verdicts: [v("M2")] },
      { run: 2, error: null, verdicts: [v("none")] },
    ]);
    expect(totals).toMatchObject({ runs: 2, gradeable: 1, fabricationRuns: 0 });
  });
});

describe("allVerdictsSettled", () => {
  const settled = { file: "f", severity: "minor", mechanism: "none", reason: "r" };
  const errored = { file: "f", severity: "minor", error: { name: "TimeoutError" } };

  it("treats finder-errored runs as terminal but errored verdicts as unsettled", () => {
    expect(allVerdictsSettled([{ run: 1, error: { name: "NoFindings" }, verdicts: null }])).toBe(true);
    expect(allVerdictsSettled([{ run: 1, error: null, verdicts: [settled] }])).toBe(true);
    expect(allVerdictsSettled([{ run: 1, error: null, verdicts: [settled, errored] }])).toBe(false);
  });
});

describe("summarizeByRunAndFile", () => {
  it("emits per-run flags and per-file mechanism counts over gradeable runs only", () => {
    const v = (file, mechanism) => ({ file, severity: "minor", mechanism, reason: "r" });
    const { perRun, perFile } = summarizeByRunAndFile([
      { run: 1, error: null, verdicts: [v("a.ts", "M2"), v("b.ts", "none")] },
      { run: 2, error: null, verdicts: [v("a.ts", "M1")] },
      { run: 3, error: { name: "X" }, verdicts: null },
      { run: 4, error: null, partial: true, verdicts: [v("a.ts", "M3")] },
    ]);
    expect(perRun).toEqual([
      { run: 1, findings: 2, byMechanism: { M1: 0, M2: 1, M3: 0, none: 1 }, fabrication: true, m1: false },
      { run: 2, findings: 1, byMechanism: { M1: 1, M2: 0, M3: 0, none: 0 }, fabrication: false, m1: true },
    ]);
    expect(perFile).toEqual({
      "a.ts": { findings: 2, byMechanism: { M1: 1, M2: 1, M3: 0, none: 0 } },
      "b.ts": { findings: 1, byMechanism: { M1: 0, M2: 0, M3: 0, none: 1 } },
    });
  });
});

describe("reusableVerdict", () => {
  const settled = { file: "a.ts", severity: "minor", mechanism: "none", reason: "r" };
  const errored = { file: "a.ts", severity: "minor", error: { name: "TimeoutError" } };

  it("reuses a settled verdict from the checkpoint", () => {
    const checkpointRun = { run: 1, verdicts: [settled] };
    expect(reusableVerdict(checkpointRun, 0, { file: "a.ts" })).toBe(settled);
  });

  it("re-grades when there is no checkpoint or the prior verdict errored", () => {
    expect(reusableVerdict(undefined, 0, { file: "a.ts" })).toBeNull();
    expect(reusableVerdict({ run: 1, verdicts: [errored] }, 0, { file: "a.ts" })).toBeNull();
    expect(reusableVerdict({ run: 1, verdicts: [settled] }, 1, { file: "b.ts" })).toBeNull();
  });

  it("refuses to resume from a misaligned checkpoint", () => {
    const checkpointRun = { run: 1, verdicts: [settled] };
    expect(() => reusableVerdict(checkpointRun, 0, { file: "OTHER.ts" })).toThrow(/refusing to resume/);
  });
});
