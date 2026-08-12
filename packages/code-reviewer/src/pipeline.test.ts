import { APICallError, type StepResult, type ToolSet } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_JUDGE_MODEL, DEFAULT_MODEL } from "./config.js";
import {
  BODY_CAP_CHARS,
  BODY_TRUNCATION_MARKER,
  computeDiffStats,
  DEFAULT_FINDER_TIMEOUT_MS,
  DEFAULT_JUDGE_TIMEOUT_MS,
  describeFinderStep,
  capPlan,
  DIFF_CAP_BYTES,
  DIFF_TRUNCATION_MARKER,
  PLAN_CAP_CHARS,
  PLAN_TRUNCATION_MARKER,
  runReviewPipeline,
  type FinderStepInfo,
} from "./pipeline.js";
import { type JudgePromptInput } from "./prompts.js";
import { RATE_LIMIT_DELAY_MS, TRANSIENT_DELAY_MS } from "./retry.js";
import type { ReviewerOptions } from "./reviewer.js";
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

// Direct assertions on the returned TEXT, not just the flag: nothing consumes
// the capped plan until phase 3, so a result-level test alone would stay green
// if the slice or the marker were dropped (impl-review-phase-1 F3).
describe("capPlan", () => {
  it("returns text at or under the cap byte-for-byte, with no marker", () => {
    const exact = "p".repeat(PLAN_CAP_CHARS);
    expect(capPlan(exact)).toEqual({ plan: exact, truncated: false });
    expect(capPlan("## Phase 1")).toEqual({ plan: "## Phase 1", truncated: false });
  });

  it("slices at exactly PLAN_CAP_CHARS and appends the marker once", () => {
    const over = `${"p".repeat(PLAN_CAP_CHARS)}TAIL`;
    const { plan, truncated } = capPlan(over);
    expect(truncated).toBe(true);
    expect(plan).toBe("p".repeat(PLAN_CAP_CHARS) + PLAN_TRUNCATION_MARKER);
    // The dropped tail is genuinely gone, and the marker is the last thing a
    // reader (or a model) sees — a partial plan must never look complete.
    expect(plan).not.toContain("TAIL");
    expect(plan.endsWith(PLAN_TRUNCATION_MARKER)).toBe(true);
  });

  it("handles an empty plan without marking it truncated", () => {
    expect(capPlan("")).toEqual({ plan: "", truncated: false });
  });

  // Regression pin for the live re-calibration: at the original 40,000 this
  // repo's own in-flight plan (47,217 chars, run 31631971640) truncated inside
  // its `## Progress` section, so the pass would have judged plan adherence
  // without ever seeing which steps were claimed done. Any future reduction
  // below the observed real-world size has to break this test first.
  it("accommodates a real in-flight plan of this repo's observed size", () => {
    const OBSERVED_LIVE_PLAN_CHARS = 47_217;
    expect(PLAN_CAP_CHARS).toBeGreaterThan(OBSERVED_LIVE_PLAN_CHARS);
    expect(capPlan("p".repeat(OBSERVED_LIVE_PLAN_CHARS)).truncated).toBe(false);
  });

  it("keeps the marker text consistent with the configured cap", () => {
    expect(PLAN_TRUNCATION_MARKER).toContain(PLAN_CAP_CHARS.toLocaleString("en-US"));
  });
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
    expect(result.preDedupFindingCount).toBe(3);
    expect(result.diffTruncated).toBe(false);
    expect(result.bodyTruncated).toBe(false);
    expect(result.models).toEqual({ finder: DEFAULT_MODEL, judge: DEFAULT_JUDGE_MODEL });
  });

  // The plan flows in and is capped here; nothing consumes it until the
  // implementation-review pass lands in phase 3.
  it("leaves a plan under the cap untouched and reports planTruncated: false", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: { text: "## Phase 1\n- do the thing", path: "context/changes/x/plan.md" },
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult()),
      },
    });
    expect(result.planTruncated).toBe(false);
  });

  it("caps an oversized plan at PLAN_CAP_CHARS and flags it", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: { text: "p".repeat(PLAN_CAP_CHARS + 1) },
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult()),
      },
    });
    expect(result.planTruncated).toBe(true);
  });

  // Key absent, not `false`: a plan-less review.json must stay byte-identical
  // to the shape that shipped before this feature existed.
  it("omits planTruncated entirely when the run carried no plan", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult()),
      },
    });
    expect("planTruncated" in result).toBe(false);
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
    const finder = vi.fn().mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce({ summary: "s", findings: [] });
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
    const finder = vi.fn().mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce({ summary: "s", findings: [] });
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
    await expect(runReviewPipeline({ diff: SMALL_DIFF, deps: { finder, judge } })).rejects.toBe(authError);
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
    await expect(runReviewPipeline({ diff: SMALL_DIFF, deps: { finder, judge, retrySleep: sleep } })).rejects.toThrow(
      "timed out",
    );
    expect(finder).toHaveBeenCalledTimes(2);
    expect(judge).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expectInJitterRange(calls.at(0), TRANSIENT_DELAY_MS);
  });

  it("omits finderTelemetry when the finder is injected via deps", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult()),
      },
    });
    expect("finderTelemetry" in result).toBe(false);
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

// Partial step shapes cast once: the pipeline only reads toolCalls and usage.
const finderStep = (over: {
  toolCalls?: { toolName: string; input: unknown }[];
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  providerMetadata?: unknown;
}): StepResult<ToolSet> =>
  ({
    toolCalls: over.toolCalls ?? [],
    usage: over.usage ?? {},
    providerMetadata: over.providerMetadata,
  }) as unknown as StepResult<ToolSet>;

/** Shorthand for the provider bag OpenRouter fills under usage accounting. */
const withCost = (cost: unknown): unknown => ({ openrouter: { usage: { cost } } });

describe("describeFinderStep", () => {
  it("extracts getFileContext targets, counts every tool call, and maps usage", () => {
    const info = describeFinderStep(
      finderStep({
        toolCalls: [
          { toolName: "getFileContext", input: { path: "src/a.ts", startLine: 3, endLine: 9 } },
          { toolName: "getFileContext", input: { path: 42 } }, // malformed — skipped
          { toolName: "otherTool", input: { path: "src/b.ts" } }, // not a context call
        ],
        usage: { inputTokens: 7 },
      }),
    );
    expect(info.fileContextCalls).toEqual([{ path: "src/a.ts", startLine: 3, endLine: 9 }]);
    expect(info.toolCalls).toBe(3);
    expect(info.usage).toEqual({ inputTokens: 7, outputTokens: undefined, totalTokens: undefined });
  });

  it("reads the provider-reported cost out of the usage-accounting metadata", () => {
    expect(describeFinderStep(finderStep({ providerMetadata: withCost(0.0123) })).cost).toBe(0.0123);
  });

  it("keeps a zero cost — a free step is data, not a missing reading", () => {
    const info = describeFinderStep(finderStep({ providerMetadata: withCost(0) }));
    expect(info.cost).toBe(0);
    expect("cost" in info).toBe(true);
  });

  it("omits the cost key entirely when the provider reported no usage accounting", () => {
    // The absent case must stay distinguishable from a genuine 0, or an
    // un-instrumented run reads as "this model was free".
    expect("cost" in describeFinderStep(finderStep({}))).toBe(false);
  });

  it.each([
    ["metadata from another provider", { anthropic: { usage: { cost: 1 } } }],
    ["an openrouter bag with no usage", { openrouter: { provider: "x" } }],
    ["usage with no cost", { openrouter: { usage: { totalTokens: 10 } } }],
    ["a non-numeric cost", withCost("0.02")],
    ["a non-finite cost", withCost(Number.NaN)],
    ["a null usage bag", { openrouter: { usage: null } }],
  ])("degrades to no cost on %s", (_label, providerMetadata) => {
    expect("cost" in describeFinderStep(finderStep({ providerMetadata }))).toBe(false);
  });
});

describe("runReviewPipeline finder source + telemetry seam", () => {
  const reviewOk = () => Promise.resolve({ summary: "s", findings: [] });
  const finderOptionsOf = (createFinder: ReturnType<typeof vi.fn>): ReviewerOptions =>
    createFinder.mock.calls[0]?.[0] as ReviewerOptions;

  it("forwards source and finderMaxSteps to the finder factory together", async () => {
    const source = () => "ctx";
    const createFinder = vi.fn().mockReturnValue({ review: reviewOk });
    await runReviewPipeline({
      diff: SMALL_DIFF,
      source,
      finderMaxSteps: 5,
      deps: { createFinder, judge: () => Promise.resolve(judgeResult()) },
    });
    const options = finderOptionsOf(createFinder);
    expect(options.source).toBe(source);
    expect(options.maxSteps).toBe(5);
  });

  it("never forwards finderMaxSteps without a source (tool-less cost ceiling)", async () => {
    const createFinder = vi.fn().mockReturnValue({ review: reviewOk });
    await runReviewPipeline({
      diff: SMALL_DIFF,
      finderMaxSteps: 5,
      deps: { createFinder, judge: () => Promise.resolve(judgeResult()) },
    });
    const options = finderOptionsOf(createFinder);
    expect(options.source).toBeUndefined();
    expect(options.maxSteps).toBeUndefined();
  });

  it("accumulates finderTelemetry across both attempts of a retried finder and reports each step", async () => {
    const { sleep } = recordingSleep();
    const attemptSteps = [
      finderStep({
        toolCalls: [{ toolName: "getFileContext", input: { path: "src/a.ts", startLine: 1, endLine: 40 } }],
        usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      }),
      finderStep({ usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 } }),
    ];
    let attempt = 0;
    const createFinder = vi.fn().mockImplementation((options: ReviewerOptions) => ({
      review: () => {
        for (const step of attemptSteps) options.onStepEnd?.(step);
        attempt += 1;
        return attempt === 1 ? Promise.reject(apiError(503)) : Promise.resolve({ summary: "s", findings: [] });
      },
    }));
    const infos: FinderStepInfo[] = [];
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      source: () => "ctx",
      finderMaxSteps: 2,
      onFinderStep: (info) => infos.push(info),
      deps: { createFinder, judge: () => Promise.resolve(judgeResult()), retrySleep: sleep },
    });
    // 2 steps × 2 attempts: real spend — steps deliberately exceeds the
    // per-attempt cap of 2 (the SDK's stepNumber resets on the retry attempt).
    expect(result.finderTelemetry).toEqual({
      steps: 4,
      toolCalls: 2,
      inputTokens: 440,
      outputTokens: 80,
      totalTokens: 520,
    });
    expect(infos).toHaveLength(4);
    expect(infos.at(0)?.fileContextCalls).toEqual([{ path: "src/a.ts", startLine: 1, endLine: 40 }]);
    expect(infos.at(1)?.fileContextCalls).toEqual([]);
  });

  it("omits finderTelemetry when no steps were observed", async () => {
    const createFinder = vi.fn().mockReturnValue({ review: reviewOk });
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      source: () => "ctx",
      deps: { createFinder, judge: () => Promise.resolve(judgeResult()) },
    });
    expect("finderTelemetry" in result).toBe(false);
  });
});
