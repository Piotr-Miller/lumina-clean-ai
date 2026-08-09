import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_JUDGE_MODEL, DEFAULT_MODEL } from "./config.js";
import {
  BODY_CAP_CHARS,
  BODY_TRUNCATION_MARKER,
  computeDiffStats,
  DEFAULT_FINDER_TIMEOUT_MS,
  DEFAULT_JUDGE_TIMEOUT_MS,
  DIFF_CAP_BYTES,
  DIFF_TRUNCATION_MARKER,
  runReviewPipeline,
} from "./pipeline.js";
import { type JudgePromptInput } from "./prompts.js";
import { RATE_LIMIT_DELAY_MS, TRANSIENT_DELAY_MS } from "./retry.js";
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

// Retry-path tests inject a recording sleep — the real pre-retry delay (up to
// 10s for a 429) would blow vitest's per-test timeout and add real wall-clock.
// Recorded delays are range-asserted: jitter's random source is not a pipeline
// seam (deliberate — only the sleep is), so exact values aren't reproducible.
const recordingSleep = () => {
  const calls: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    calls.push(ms);
    return Promise.resolve();
  };
  return { calls, sleep };
};
const expectInJitterRange = (value: number | undefined, base: number): void => {
  expect(value).toBeGreaterThanOrEqual(base);
  expect(value).toBeLessThanOrEqual(base + 1_000);
};

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
    expect(result.preDedupFindingCount).toBe(3);
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

  it("retries a retryable finder failure exactly once, after the transient delay", async () => {
    const { calls, sleep } = recordingSleep();
    const finder = vi
      .fn()
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce({ summary: "s", findings: [] });
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      deps: { finder, judge: () => Promise.resolve(judgeResult()), retrySleep: sleep },
    });
    expect(finder).toHaveBeenCalledTimes(2);
    expect(result.verdict).toBe("passed");
    expect(calls).toHaveLength(1);
    expectInJitterRange(calls.at(0), TRANSIENT_DELAY_MS);
  });

  it("records the pre-dedup finding count when the finder emits collapsing duplicates", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      deps: {
        finder: () =>
          Promise.resolve({
            summary: "s",
            findings: [
              finding({ startLine: 9 }),
              finding({ startLine: 9 }), // dup — merged away, but still counted
              finding({ file: "src/b.ts", startLine: 1 }),
            ],
          }),
        judge: () => Promise.resolve(judgeResult()),
      },
    });
    expect(result.findings).toHaveLength(2);
    expect(result.preDedupFindingCount).toBe(3);
  });

  it("reports retried passes through onRetry with the pass name and bounded delay", async () => {
    const events: { pass: "finder" | "judge"; error: unknown; delayMs: number }[] = [];
    const { sleep } = recordingSleep();
    const finder = vi
      .fn()
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce({ summary: "s", findings: [] });
    const judge = vi.fn().mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce(judgeResult());
    await runReviewPipeline({
      diff: SMALL_DIFF,
      onRetry: (pass, error, delayMs) => events.push({ pass, error, delayMs }),
      deps: { finder, judge, retrySleep: sleep },
    });
    expect(events.map((event) => event.pass)).toEqual(["finder", "judge"]);
    expect(events.at(0)?.error).toBeInstanceOf(APICallError);
    expectInJitterRange(events.at(0)?.delayMs, TRANSIENT_DELAY_MS);
    expectInJitterRange(events.at(1)?.delayMs, RATE_LIMIT_DELAY_MS);
  });

  it("keeps onRetry silent when both passes succeed first try", async () => {
    const onRetry = vi.fn();
    await runReviewPipeline({
      diff: SMALL_DIFF,
      onRetry,
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult()),
      },
    });
    expect(onRetry).not.toHaveBeenCalled();
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

  it("passes the default per-attempt timeout budgets to both passes", async () => {
    const finder = vi.fn().mockResolvedValue({ summary: "s", findings: [] });
    const judge = vi.fn().mockResolvedValue(judgeResult());
    await runReviewPipeline({ diff: SMALL_DIFF, deps: { finder, judge } });
    expect(finder).toHaveBeenCalledWith(expect.anything(), { timeoutMs: DEFAULT_FINDER_TIMEOUT_MS });
    expect(judge).toHaveBeenCalledWith(expect.anything(), { timeoutMs: DEFAULT_JUDGE_TIMEOUT_MS });
  });

  it("forwards timeout overrides to the matching pass", async () => {
    const finder = vi.fn().mockResolvedValue({ summary: "s", findings: [] });
    const judge = vi.fn().mockResolvedValue(judgeResult());
    await runReviewPipeline({
      diff: SMALL_DIFF,
      timeouts: { finderTimeoutMs: 10_000, judgeTimeoutMs: 5_000 },
      deps: { finder, judge },
    });
    expect(finder).toHaveBeenCalledWith(expect.anything(), { timeoutMs: 10_000 });
    expect(judge).toHaveBeenCalledWith(expect.anything(), { timeoutMs: 5_000 });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid timeout %s before any pass runs",
    async (bad) => {
      const finder = vi.fn();
      await expect(
        runReviewPipeline({
          diff: SMALL_DIFF,
          timeouts: { finderTimeoutMs: bad },
          deps: { finder, judge: vi.fn() },
        }),
      ).rejects.toThrow(/finderTimeoutMs must be a positive integer/);
      expect(finder).not.toHaveBeenCalled();
    },
  );

  it("treats a timeout as retryable: one retry, then the TimeoutError is rethrown", async () => {
    const { calls, sleep } = recordingSleep();
    const timeout = () => new DOMException("timed out", "TimeoutError");
    const finder = vi.fn().mockRejectedValueOnce(timeout()).mockRejectedValueOnce(timeout());
    const judge = vi.fn();
    await expect(
      runReviewPipeline({ diff: SMALL_DIFF, deps: { finder, judge, retrySleep: sleep } }),
    ).rejects.toThrow("timed out");
    expect(finder).toHaveBeenCalledTimes(2);
    expect(judge).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expectInJitterRange(calls.at(0), TRANSIENT_DELAY_MS);
  });

  it("gives the judge its own single retry (rate-limit delay) and rethrows the second failure", async () => {
    const { calls, sleep } = recordingSleep();
    const second = apiError(500);
    const judge = vi.fn().mockRejectedValueOnce(apiError(429)).mockRejectedValueOnce(second);
    await expect(
      runReviewPipeline({
        diff: SMALL_DIFF,
        deps: {
          finder: () => Promise.resolve({ summary: "s", findings: [] }),
          judge,
          retrySleep: sleep,
        },
      }),
    ).rejects.toBe(second);
    expect(judge).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(1);
    expectInJitterRange(calls.at(0), RATE_LIMIT_DELAY_MS);
  });
});
