import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_JUDGE_MODEL, DEFAULT_MODEL } from "./config.js";
import {
  BODY_CAP_CHARS,
  BODY_TRUNCATION_MARKER,
  computeDiffStats,
  DIFF_CAP_BYTES,
  DIFF_TRUNCATION_MARKER,
  runReviewPipeline,
} from "./pipeline.js";
import { type JudgePromptInput } from "./prompts.js";
import { CRITERIA } from "./scorecard.js";
import type { Finding, JudgeResult, ReviewUnit, Scores } from "./schemas.js";

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_REVIEW_MODEL", undefined);
  vi.stubEnv("OPENROUTER_JUDGE_MODEL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const finding = (overrides: Partial<Finding>): Finding => ({
  file: "src/a.ts",
  severity: "minor",
  category: "correctness",
  description: "d",
  suggestion: "s",
  ...overrides,
});

const scores = (): Scores =>
  Object.fromEntries(
    CRITERIA.map(({ key }) => [key, { score: 8, justification: "j", findingIds: [] as string[] }]),
  ) as Scores;

const judgeResult = (overrides: Partial<JudgeResult> = {}): JudgeResult => ({
  scores: scores(),
  verdict: "passed",
  verdictReason: "solid change",
  summary: "judge summary",
  droppedFindingIdRefs: 0,
  ...overrides,
});

const SMALL_DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,3 @@",
  " context",
  "+added line",
  "-removed line",
].join("\n");

const apiError = (statusCode: number): APICallError =>
  new APICallError({
    message: `HTTP ${String(statusCode)}`,
    url: "https://openrouter.test/api",
    requestBodyValues: {},
    statusCode,
  });

describe("computeDiffStats", () => {
  it("counts files, additions, and deletions, excluding +++/--- headers", () => {
    expect(computeDiffStats(SMALL_DIFF)).toEqual({ files: 1, additions: 1, deletions: 1 });
  });

  it("counts multiple files", () => {
    const diff = `${SMALL_DIFF}\ndiff --git a/src/b.ts b/src/b.ts\n+++ b/src/b.ts\n+x\n+y`;
    expect(computeDiffStats(diff)).toEqual({ files: 2, additions: 3, deletions: 1 });
  });

  it("returns zeros for empty input", () => {
    expect(computeDiffStats("")).toEqual({ files: 0, additions: 0, deletions: 0 });
  });
});

describe("runReviewPipeline (hermetic, deps-injected)", () => {
  it("assembles the full result: merged+identified findings, judge verdict fields, models", async () => {
    const finderFindings = [
      finding({ file: "src/b.ts", startLine: 1, severity: "critical" }),
      finding({ file: "src/a.ts", startLine: 9 }),
      finding({ file: "src/a.ts", startLine: 9 }), // dup — merged away
    ];
    let judgeInput: JudgePromptInput | undefined;
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      prTitle: "feat: x",
      prBody: "body",
      deps: {
        finder: (unit: ReviewUnit) => {
          expect(unit).toEqual({ kind: "diff", diff: SMALL_DIFF });
          return Promise.resolve({ summary: "finder summary", findings: finderFindings });
        },
        judge: (input) => {
          judgeInput = input;
          return Promise.resolve(judgeResult({ droppedFindingIdRefs: 1 }));
        },
      },
    });

    // Deterministic order (file, line) with per-run IDs; dup deduplicated.
    expect(result.findings.map((f) => `${f.id}:${f.file}:${String(f.startLine ?? 0)}`)).toEqual([
      "F1:src/a.ts:9",
      "F2:src/b.ts:1",
    ]);
    // Judge saw exactly the identified findings + metadata.
    expect(judgeInput?.findings).toEqual(result.findings);
    expect(judgeInput?.prTitle).toBe("feat: x");
    expect(judgeInput?.prBody).toBe("body");
    expect(judgeInput?.diffStats).toEqual(computeDiffStats(SMALL_DIFF));
    // Judge-authored verdict fields + summary; finder summary is not surfaced.
    expect(result.summary).toBe("judge summary");
    expect(result.verdict).toBe("passed");
    expect(result.verdictReason).toBe("solid change");
    expect(result.droppedFindingIdRefs).toBe(1);
    expect(result.diffTruncated).toBe(false);
    expect(result.bodyTruncated).toBe(false);
    expect(result.models).toEqual({ finder: DEFAULT_MODEL, judge: DEFAULT_JUDGE_MODEL });
  });

  it("reports override models in the result metadata", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      overrides: { reviewModel: "cheap/finder", judgeModel: "big/judge" },
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult()),
      },
    });
    expect(result.models).toEqual({ finder: "cheap/finder", judge: "big/judge" });
  });

  it("caps an oversized diff at DIFF_CAP_BYTES with a visible marker and flag", async () => {
    const bigDiff = `${SMALL_DIFF}\n${"+x".repeat(DIFF_CAP_BYTES)}`;
    let seenDiff = "";
    const result = await runReviewPipeline({
      diff: bigDiff,
      deps: {
        finder: (unit: ReviewUnit) => {
          if (unit.kind === "diff") seenDiff = unit.diff;
          return Promise.resolve({ summary: "s", findings: [] });
        },
        judge: (input) => {
          // Stats still describe the real (un-capped) diff.
          expect(input.diffStats).toEqual(computeDiffStats(bigDiff));
          return Promise.resolve(judgeResult());
        },
      },
    });
    expect(result.diffTruncated).toBe(true);
    expect(seenDiff.endsWith(DIFF_TRUNCATION_MARKER)).toBe(true);
    expect(new TextEncoder().encode(seenDiff).length).toBeLessThanOrEqual(
      DIFF_CAP_BYTES + DIFF_TRUNCATION_MARKER.length,
    );
  });

  it("caps an oversized PR body at BODY_CAP_CHARS with a visible marker and flag", async () => {
    let seenBody: string | undefined;
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      prBody: "b".repeat(BODY_CAP_CHARS + 500),
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: (input) => {
          seenBody = input.prBody;
          return Promise.resolve(judgeResult());
        },
      },
    });
    expect(result.bodyTruncated).toBe(true);
    expect(seenBody?.endsWith(BODY_TRUNCATION_MARKER)).toBe(true);
    expect(seenBody?.length).toBe(BODY_CAP_CHARS + BODY_TRUNCATION_MARKER.length);
  });

  it("retries a retryable finder failure exactly once and recovers", async () => {
    const finder = vi
      .fn()
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce({ summary: "s", findings: [] });
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      deps: { finder, judge: () => Promise.resolve(judgeResult()) },
    });
    expect(finder).toHaveBeenCalledTimes(2);
    expect(result.verdict).toBe("passed");
  });

  it("fails fast on a non-retryable finder error (single attempt)", async () => {
    const authError = apiError(401);
    const finder = vi.fn().mockRejectedValue(authError);
    const judge = vi.fn();
    await expect(runReviewPipeline({ diff: SMALL_DIFF, deps: { finder, judge } })).rejects.toBe(
      authError,
    );
    expect(finder).toHaveBeenCalledTimes(1);
    expect(judge).not.toHaveBeenCalled();
  });

  it("gives the judge its own single retry and rethrows the second failure", async () => {
    const second = apiError(500);
    const judge = vi.fn().mockRejectedValueOnce(apiError(429)).mockRejectedValueOnce(second);
    await expect(
      runReviewPipeline({
        diff: SMALL_DIFF,
        deps: { finder: () => Promise.resolve({ summary: "s", findings: [] }), judge },
      }),
    ).rejects.toBe(second);
    expect(judge).toHaveBeenCalledTimes(2);
  });
});
