import { APICallError, type StepResult, type ToolSet } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_JUDGE_MODEL, DEFAULT_MODEL } from "./config.js";
import {
  BODY_CAP_CHARS,
  BODY_TRUNCATION_MARKER,
  capDiff,
  computeDiffStats,
  computeFileSegments,
  computeManifest,
  DEFAULT_FINDER_TIMEOUT_MS,
  DEFAULT_JUDGE_TIMEOUT_MS,
  describeFinderStep,
  capPlan,
  DIFF_CAP_BYTES,
  DIFF_TRUNCATION_MARKER,
  PLAN_CAP_CHARS,
  PLAN_TRUNCATION_MARKER,
  runReviewPipeline,
  truncationReport,
  type FinderStepInfo,
} from "./pipeline.js";
import { type JudgePromptInput } from "./prompts.js";
import { RATE_LIMIT_DELAY_MS, TRANSIENT_DELAY_MS } from "./retry.js";
import type { ReviewerOptions } from "./reviewer.js";
import { CRITERIA } from "./scorecard.js";
import type {
  Finding,
  ImplGrades,
  ImplReviewBlock,
  ImplReviewResult,
  JudgeResult,
  ReviewUnit,
  Scores,
} from "./schemas.js";

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_REVIEW_MODEL", undefined);
  vi.stubEnv("OPENROUTER_JUDGE_MODEL", undefined);
  vi.stubEnv("OPENROUTER_IMPL_REVIEW_MODEL", undefined);
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
  ) as unknown as Scores;

const judgeResult = (overrides: Partial<JudgeResult> = {}): JudgeResult => ({
  scores: scores(),
  verdict: "passed",
  verdictReason: "solid change",
  summary: "judge summary",
  droppedFindingIdRefs: 0,
  ...overrides,
});

const implGrades = (overrides: Partial<ImplGrades> = {}): ImplGrades => ({
  plan_adherence: "PASS",
  scope_discipline: "PASS",
  safety_quality: "PASS",
  architecture: "PASS",
  pattern_consistency: "PASS",
  test_coverage: "PASS",
  success_criteria: "PASS",
  ...overrides,
});

const implReviewResult = (overrides: Partial<ImplReviewResult> = {}): ImplReviewResult => ({
  grades: implGrades(),
  verdict: "APPROVED",
  verdictReason: "matches the plan",
  findings: [],
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

  // A plan present means the third pass runs, so these two cap tests inject it
  // — they are about capPlan, not about the pass.
  it("leaves a plan under the cap untouched and reports planTruncated: false", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: { text: "## Phase 1\n- do the thing", path: "context/changes/x/plan.md" },
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult()),
        implReviewer: () => Promise.resolve(implReviewResult()),
      },
    });
    expect(result.planTruncated).toBe(false);
  });

  it("caps an oversized plan at PLAN_CAP_CHARS and flags it", async () => {
    const seen: string[] = [];
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: { text: "p".repeat(PLAN_CAP_CHARS + 1) },
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult()),
        implReviewer: (input) => {
          seen.push(input.plan);
          return Promise.resolve(implReviewResult());
        },
      },
    });
    expect(result.planTruncated).toBe(true);
    // The pass must receive the CAPPED text, not the original — otherwise the
    // cap protects the boolean and nothing else (impl-review-phase-1 F3).
    expect(seen.at(0)?.length).toBe(PLAN_CAP_CHARS + PLAN_TRUNCATION_MARKER.length);
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
    const events: { pass: "finder" | "judge" | "impl-review"; error: unknown; delayMs: number }[] = [];
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

  // The per-step cost was computed from the start but never accumulated, so
  // review.json carried finder tokens and no finder cost — the gap that made
  // criterion 4.8's ratio uncomputable (numerator instrumented, denominator not).
  it("accumulates the finder's provider cost across steps", async () => {
    const withCostStep = (cost?: number): StepResult<ToolSet> =>
      ({
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
        providerMetadata: cost === undefined ? undefined : { openrouter: { usage: { cost } } },
      }) as unknown as StepResult<ToolSet>;
    const createFinder = vi.fn().mockImplementation((options: ReviewerOptions) => ({
      review: () => {
        options.onStepEnd?.(withCostStep(0.004));
        options.onStepEnd?.(withCostStep(0.006));
        return Promise.resolve({ summary: "s", findings: [] });
      },
    }));
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      source: () => "ctx",
      deps: { createFinder, judge: () => Promise.resolve(judgeResult()) },
    });
    expect(result.finderTelemetry?.cost).toBeCloseTo(0.01, 10);
  });

  it("omits the finder cost key entirely when the provider reported none", async () => {
    const bareStep = {
      toolCalls: [],
      usage: { inputTokens: 10 },
    } as unknown as StepResult<ToolSet>;
    const createFinder = vi.fn().mockImplementation((options: ReviewerOptions) => ({
      review: () => {
        options.onStepEnd?.(bareStep);
        return Promise.resolve({ summary: "s", findings: [] });
      },
    }));
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      source: () => "ctx",
      deps: { createFinder, judge: () => Promise.resolve(judgeResult()) },
    });
    expect("cost" in (result.finderTelemetry ?? {})).toBe(false);
  });

  // The judge had NO telemetry at all until criterion 4.8 needed it, and it is
  // the pass that reaches for the expensive model.
  it("accumulates judgeTelemetry across BOTH attempts of a retried run", async () => {
    const judgeStep = (cost: number): StepResult<ToolSet> =>
      ({
        toolCalls: [],
        usage: { inputTokens: 40, outputTokens: 8, totalTokens: 48 },
        providerMetadata: { openrouter: { usage: { cost } } },
      }) as unknown as StepResult<ToolSet>;
    let attempt = 0;
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        createJudge: (options) => ({
          judge: () => {
            options.onStepEnd?.(judgeStep(0.015));
            attempt += 1;
            return attempt === 1 ? Promise.reject(apiError(503)) : Promise.resolve(judgeResult());
          },
        }),
        retrySleep: () => Promise.resolve(),
      },
    });
    expect(result.judgeTelemetry).toEqual({
      attempts: 2,
      inputTokens: 80,
      outputTokens: 16,
      totalTokens: 96,
      cost: 0.03,
    });
  });

  it("omits judgeTelemetry entirely for an injected judge that never constructs", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult()),
      },
    });
    expect("judgeTelemetry" in result).toBe(false);
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

describe("runReviewPipeline implementation-review pass", () => {
  const twoPasses = {
    finder: () => Promise.resolve({ summary: "s", findings: [] }),
    judge: () => Promise.resolve(judgeResult()),
  };
  const PLAN = { text: "## Phase 1\n- do the thing", path: "context/changes/x/plan.md" };

  // Absence of the key IS the no-plan signal (plan-review F5). A `skipped`
  // variant would be a second way to say the same thing, and the renderer
  // would then have two states to keep in sync instead of one.
  it("makes no third call and emits no implReview key when there is no plan", async () => {
    const implReviewer = vi.fn();
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      deps: { ...twoPasses, implReviewer },
    });
    expect(implReviewer).not.toHaveBeenCalled();
    expect("implReview" in result).toBe(false);
    expect("implReviewTelemetry" in result).toBe(false);
  });

  it("has exactly three block shapes, and absence still means no plan", () => {
    // Compile-time guarantee: a Record over the union stops type-checking the
    // moment a status is added or removed. It did exactly that when the cost
    // gate introduced `skipped`, which is the point — the contract cannot drift
    // without someone deciding to change this line.
    //
    // `skipped` does NOT reopen plan-review F5. F5 forbade a second way to say
    // "no plan"; this says something different — "not run because the code
    // review failed". Absence of the whole key remains the only no-plan signal.
    const shapes: Record<ImplReviewBlock["status"], true> = { reviewed: true, failed: true, skipped: true };
    expect(Object.keys(shapes).sort()).toEqual(["failed", "reviewed", "skipped"]);
  });

  it("skips the pass when gated and the code review did not pass", async () => {
    const implReviewer = vi.fn();
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      implReviewGate: "code-review-passed",
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult({ verdict: "failed" })),
        implReviewer,
      },
    });
    // No provider call at all — the gate exists to not spend the money.
    expect(implReviewer).not.toHaveBeenCalled();
    expect(result.implReview).toMatchObject({ status: "skipped" });
    expect("implReviewTelemetry" in result).toBe(false);
  });

  it("still runs the pass when gated and the code review passed", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      implReviewGate: "code-review-passed",
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult({ verdict: "passed" })),
        implReviewer: () => Promise.resolve(implReviewResult()),
      },
    });
    expect(result.implReview).toMatchObject({ status: "reviewed" });
  });

  // The gate is CI policy, not a library default — embedders and evals that do
  // not opt in keep the original behavior.
  it("runs on a failed code review when ungated (the default)", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      deps: {
        finder: () => Promise.resolve({ summary: "s", findings: [] }),
        judge: () => Promise.resolve(judgeResult({ verdict: "failed" })),
        implReviewer: () => Promise.resolve(implReviewResult()),
      },
    });
    expect(result.implReview).toMatchObject({ status: "reviewed" });
  });

  it("populates implReview with the reviewed shape and the plan path", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      deps: {
        ...twoPasses,
        implReviewer: () =>
          Promise.resolve(
            implReviewResult({
              verdict: "NEEDS_ATTENTION",
              grades: implGrades({ scope_discipline: "WARNING" }),
            }),
          ),
      },
    });
    expect(result.implReview).toMatchObject({
      status: "reviewed",
      planPath: "context/changes/x/plan.md",
      verdict: "NEEDS_ATTENTION",
    });
  });

  it("hands the pass the capped diff and the plan-truncation flag", async () => {
    const seen: { diff: string; planPath?: string; planTruncated?: boolean; diffTruncated?: boolean }[] = [];
    await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: { text: "p".repeat(PLAN_CAP_CHARS + 1), path: "plan.md" },
      deps: {
        ...twoPasses,
        implReviewer: (input) => {
          seen.push({
            diff: input.diff,
            planPath: input.planPath,
            planTruncated: input.planTruncated,
            diffTruncated: input.diffTruncated,
          });
          return Promise.resolve(implReviewResult());
        },
      },
    });
    expect(seen.at(0)?.planTruncated).toBe(true);
    expect(seen.at(0)?.planPath).toBe("plan.md");
    expect(seen.at(0)?.diff).toBe(SMALL_DIFF);
    // A truncated plan must not imply a truncated diff — this one fits.
    expect(seen.at(0)?.diffTruncated).toBeUndefined();
  });

  // The two flags are independent, and only this one governs whether MISSING
  // findings can be trusted. The pass has always received the capped diff
  // (asserted above); until it was told, it read our cap as deleted work.
  it("tells the pass when the diff was cut, independently of the plan", async () => {
    const seen: { planTruncated?: boolean; diffTruncated?: boolean }[] = [];
    await runReviewPipeline({
      diff: "+".repeat(DIFF_CAP_BYTES + 1),
      plan: { text: "a short plan", path: "plan.md" },
      deps: {
        ...twoPasses,
        implReviewer: (input) => {
          seen.push({ planTruncated: input.planTruncated, diffTruncated: input.diffTruncated });
          return Promise.resolve(implReviewResult());
        },
      },
    });
    expect(seen.at(0)?.diffTruncated).toBe(true);
    expect(seen.at(0)?.planTruncated).toBeUndefined();
  });

  // The pass runs AFTER the judge, so a throw here would discard a complete,
  // already-paid-for code review over an advisory extra.
  it("degrades a throwing pass to the failed block, leaving the code review intact", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      deps: {
        ...twoPasses,
        implReviewer: () => Promise.reject(new Error("provider exploded")),
        retrySleep: () => Promise.resolve(),
      },
    });
    expect(result.implReview).toEqual({ status: "failed", error: "provider exploded" });
    // The code review survived whole.
    expect(result.verdict).toBe("passed");
    expect(result.summary).toBe("judge summary");
    expect(result.scores).toBeDefined();
  });

  // Construction throws on an unresolvable API key — that is a failure of this
  // pass like any other and must not become the run's failure.
  it("degrades a throwing CONSTRUCTION to the failed block", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      deps: {
        ...twoPasses,
        createImplReviewer: () => {
          throw new Error("OPENROUTER_API_KEY is missing");
        },
      },
    });
    expect(result.implReview).toMatchObject({ status: "failed" });
    expect(result.verdict).toBe("passed");
  });

  it('reports a retried third pass through onRetry as "impl-review"', async () => {
    const events: string[] = [];
    let attempt = 0;
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      onRetry: (pass) => events.push(pass),
      deps: {
        ...twoPasses,
        implReviewer: () => {
          attempt += 1;
          return attempt === 1 ? Promise.reject(apiError(503)) : Promise.resolve(implReviewResult());
        },
        retrySleep: () => Promise.resolve(),
      },
    });
    expect(events).toEqual(["impl-review"]);
    expect(result.implReview).toMatchObject({ status: "reviewed" });
  });

  const implStep = (inputTokens: number, cost?: number): StepResult<ToolSet> =>
    ({
      toolCalls: [],
      usage: { inputTokens, outputTokens: 10, totalTokens: inputTokens + 10 },
      providerMetadata: cost === undefined ? undefined : { openrouter: { usage: { cost } } },
    }) as unknown as StepResult<ToolSet>;

  it("accumulates implReviewTelemetry across BOTH attempts of a retried run", async () => {
    let attempt = 0;
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      deps: {
        ...twoPasses,
        createImplReviewer: (options) => ({
          implReview: () => {
            options.onStepEnd?.(implStep(100, 0.01));
            attempt += 1;
            return attempt === 1 ? Promise.reject(apiError(503)) : Promise.resolve(implReviewResult());
          },
        }),
        retrySleep: () => Promise.resolve(),
      },
    });
    // Real spend for the run, not the surviving attempt's.
    expect(result.implReviewTelemetry).toEqual({
      attempts: 2,
      inputTokens: 200,
      outputTokens: 20,
      totalTokens: 220,
      cost: 0.02,
    });
  });

  // A failed pass still spent money; dropping its telemetry would understate
  // the run's cost exactly when someone is investigating the failure.
  it("keeps the telemetry of a pass that ultimately failed", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      deps: {
        ...twoPasses,
        createImplReviewer: (options) => ({
          implReview: () => {
            options.onStepEnd?.(implStep(100, 0.01));
            return Promise.reject(new Error("nope"));
          },
        }),
        retrySleep: () => Promise.resolve(),
      },
    });
    expect(result.implReview).toMatchObject({ status: "failed" });
    expect(result.implReviewTelemetry).toMatchObject({ attempts: 1, cost: 0.01 });
  });

  it("omits cost (never 0) when the provider reported none", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      deps: {
        ...twoPasses,
        createImplReviewer: (options) => ({
          implReview: () => {
            options.onStepEnd?.(implStep(100));
            return Promise.resolve(implReviewResult());
          },
        }),
      },
    });
    expect("cost" in (result.implReviewTelemetry ?? {})).toBe(false);
  });

  it("omits implReviewTelemetry entirely for an injected pass that never constructs", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      deps: { ...twoPasses, implReviewer: () => Promise.resolve(implReviewResult()) },
    });
    expect("implReview" in result).toBe(true);
    expect("implReviewTelemetry" in result).toBe(false);
  });

  it("forwards the resolved model and timeout to the constructed reviewer", async () => {
    vi.stubEnv("OPENROUTER_IMPL_REVIEW_MODEL", "env/impl-model");
    const seen: { model?: string; timeoutMs?: number } = {};
    await runReviewPipeline({
      diff: SMALL_DIFF,
      plan: PLAN,
      timeouts: { implReviewTimeoutMs: 4_242 },
      deps: {
        ...twoPasses,
        createImplReviewer: (options) => {
          seen.model = options.model;
          return {
            implReview: (_input, callOptions) => {
              seen.timeoutMs = callOptions?.timeoutMs;
              return Promise.resolve(implReviewResult());
            },
          };
        },
      },
    });
    expect(seen.model).toBe("env/impl-model");
    expect(seen.timeoutMs).toBe(4_242);
  });

  it("rejects a non-positive implReviewTimeoutMs like the other budgets", async () => {
    await expect(
      runReviewPipeline({ diff: SMALL_DIFF, timeouts: { implReviewTimeoutMs: 0 }, deps: twoPasses }),
    ).rejects.toThrow(/implReviewTimeoutMs must be a positive integer/);
  });
});

// Export-only parity (change finder-fabrication-triggers, review F5): capDiff
// became importable so campaign tooling stops maintaining byte-cap copies.
// These pin the exported function's contract directly.
describe("capDiff (exported)", () => {
  it("returns diffs at or under the cap unchanged", () => {
    const diff = "x".repeat(1_000);
    expect(capDiff(diff)).toEqual({ diff, truncated: false });
  });

  it("caps over-limit diffs at DIFF_CAP_BYTES and appends the marker", () => {
    const diff = "x".repeat(DIFF_CAP_BYTES + 500);
    const result = capDiff(diff);
    expect(result.truncated).toBe(true);
    expect(result.diff.endsWith(DIFF_TRUNCATION_MARKER)).toBe(true);
    const body = result.diff.slice(0, -DIFF_TRUNCATION_MARKER.length);
    expect(new TextEncoder().encode(body).length).toBe(DIFF_CAP_BYTES);
  });

  it("never leaves a split multi-byte character at the cut", () => {
    // 4-byte code points positioned so the byte cap lands mid-character.
    const diff = "🙂".repeat(Math.ceil(DIFF_CAP_BYTES / 4) + 10);
    const result = capDiff(diff);
    expect(result.truncated).toBe(true);
    expect(result.diff).not.toContain("�");
  });
});

// --- Window computation port + finder truncation wiring (r5-finder-truncation-note) ---

describe("computeFileSegments / computeManifest (library port)", () => {
  const twoFiles = ["diff --git a/src/a.ts b/src/a.ts", "+aaaa", "diff --git a/src/b.ts b/src/b.ts", "+bbb"].join("\n");

  it("segments per file with contiguous UTF-8 byte offsets", () => {
    const segments = computeFileSegments(twoFiles);
    expect(segments.map((s) => s.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(segments[0].startByte).toBe(0);
    expect(segments[0].endByte).toBe(segments[1].startByte);
    expect(segments[1].endByte).toBe(new TextEncoder().encode(twoFiles).length);
  });

  it("ignores in-hunk lines that merely contain a diff header (phantom-segment guard)", () => {
    const quoted = ["diff --git a/doc.md b/doc.md", "+quoted header below:", "+diff --git a/fake b/fake"].join("\n");
    expect(computeFileSegments(quoted).map((s) => s.path)).toEqual(["doc.md"]);
  });

  it("reports git-quoted paths verbatim as parsed, never decoded", () => {
    const line = 'diff --git "a/we ird.txt" "b/we ird.txt"';
    expect(computeFileSegments(`${line}\n+x`)[0].path).toBe('"a/we ird.txt" "b/we ird.txt"');
  });

  it("keeps everything in-window when the cap is lifted (null)", () => {
    const manifest = computeManifest(twoFiles, null);
    expect(manifest.truncated).toBe(false);
    expect(manifest.window.every((w) => w.complete)).toBe(true);
    expect(manifest.overCap).toEqual([]);
    expect(manifest.cutFile).toBeNull();
  });

  it("names the cut file, its cut offset, and the over-cap files", () => {
    const segments = computeFileSegments(twoFiles);
    const capBytes = segments[1].startByte - 2; // cut lands inside src/a.ts
    const manifest = computeManifest(twoFiles, capBytes);
    expect(manifest.truncated).toBe(true);
    expect(manifest.cutFile).toBe("src/a.ts");
    expect(manifest.cutOffsetInFile).toBe(capBytes);
    expect(manifest.overCap).toEqual(["src/b.ts"]);
  });
});

describe("truncationReport", () => {
  it("reports an in-cap diff as untruncated with no cutFile key", () => {
    const report = truncationReport(SMALL_DIFF);
    expect(report).toEqual({ truncated: false, overCapFiles: [] });
    expect("cutFile" in report).toBe(false);
  });

  it("omits cutFile when the cap lands exactly on a file boundary", () => {
    const h1 = "diff --git a/a.txt b/a.txt\n";
    const pad = `+${"x".repeat(DIFF_CAP_BYTES - h1.length - 2)}\n`;
    const diff = `${h1}${pad}diff --git a/b.txt b/b.txt\n+y`;
    expect(computeFileSegments(diff)[1].startByte).toBe(DIFF_CAP_BYTES);
    const report = truncationReport(diff);
    expect(report.truncated).toBe(true);
    expect("cutFile" in report).toBe(false);
    expect(report.overCapFiles).toEqual(["b.txt"]);
  });

  it("reports oversized headerless text as truncated with no files", () => {
    const report = truncationReport("x".repeat(DIFF_CAP_BYTES + 10));
    expect(report).toEqual({ truncated: true, overCapFiles: [] });
    expect("cutFile" in report).toBe(false);
  });
});

describe("finder truncation wiring", () => {
  const captureFinder = (sink: { unit?: ReviewUnit }) => (unit: ReviewUnit) => {
    sink.unit = unit;
    return Promise.resolve({ summary: "s", findings: [] });
  };

  it("passes truncated/cutFile/overCapFiles into the finder unit for an oversized diff", async () => {
    const big = [
      "diff --git a/src/big.ts b/src/big.ts",
      `+${"x".repeat(DIFF_CAP_BYTES)}`,
      "diff --git a/src/beyond.ts b/src/beyond.ts",
      "+y",
    ].join("\n");
    const sink: { unit?: ReviewUnit } = {};
    await runReviewPipeline({
      diff: big,
      deps: { finder: captureFinder(sink), judge: () => Promise.resolve(judgeResult()) },
    });
    if (sink.unit?.kind !== "diff") throw new Error("finder unit missing");
    expect(sink.unit.truncated).toBe(true);
    expect(sink.unit.cutFile).toBe("src/big.ts");
    expect(sink.unit.overCapFiles).toEqual(["src/beyond.ts"]);
    expect(sink.unit.diff.endsWith(DIFF_TRUNCATION_MARKER)).toBe(true);
  });

  it("persists the fence payload as truncationMetadata in the result for an oversized diff", async () => {
    const big = [
      "diff --git a/src/big.ts b/src/big.ts",
      `+${"x".repeat(DIFF_CAP_BYTES)}`,
      "diff --git a/src/beyond.ts b/src/beyond.ts",
      "+y",
    ].join("\n");
    const result = await runReviewPipeline({
      diff: big,
      deps: { finder: captureFinder({}), judge: () => Promise.resolve(judgeResult()) },
    });
    // Byte-for-byte the object the <truncation-metadata> fence carried — the
    // passive live check reads it from review.json instead of the Actions log
    // (r5-finder-truncation-note decision.md Disposition #2, impl-review F1).
    expect(result.truncationMetadata).toEqual({ cutFile: "src/big.ts", overCapFiles: ["src/beyond.ts"] });
  });

  it("adds no truncationMetadata key for an in-cap diff (review.json shape unchanged)", async () => {
    const result = await runReviewPipeline({
      diff: SMALL_DIFF,
      deps: { finder: captureFinder({}), judge: () => Promise.resolve(judgeResult()) },
    });
    expect("truncationMetadata" in result).toBe(false);
  });

  it("adds no truncation fields for an in-cap diff (unit unchanged byte-for-byte)", async () => {
    const sink: { unit?: ReviewUnit } = {};
    await runReviewPipeline({
      diff: SMALL_DIFF,
      deps: { finder: captureFinder(sink), judge: () => Promise.resolve(judgeResult()) },
    });
    expect(sink.unit).toEqual({ kind: "diff", diff: SMALL_DIFF });
  });
});
