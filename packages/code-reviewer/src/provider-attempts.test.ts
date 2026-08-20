import { APICallError } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createImplReviewer } from "./impl-reviewer.js";
import { createJudge } from "./judge.js";
import { PROJECT_CONTEXT_CAP_CHARS, runReviewPipeline } from "./pipeline.js";
import { createReviewer } from "./reviewer.js";
import { CRITERIA } from "./scorecard.js";
import type { IdentifiedFinding } from "./schemas.js";

// Pins the one-retry cost contract at the PROVIDER level (plan F2): both
// agents run with maxRetries: 0, so a failing call makes exactly ONE provider
// attempt — the AI SDK's internal default (2 retries) must never kick in.
// The single wrapper-level retry lives in retry.ts and is tested there and in
// pipeline.test.ts; total attempts per pass are therefore <= 2.
let currentModel: MockLanguageModelV3 | undefined;
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => () => {
    if (!currentModel) throw new Error("currentModel not set in this test");
    return currentModel;
  },
}));

beforeEach(() => {
  currentModel = undefined;
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_REVIEW_MODEL", undefined);
  vi.stubEnv("OPENROUTER_JUDGE_MODEL", undefined);
  vi.stubEnv("OPENROUTER_IMPL_REVIEW_MODEL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// A retryable-by-SDK-standards failure: 500 with isRetryable, the case the
// SDK WOULD retry internally if maxRetries were left at its default.
const retryableError = (): APICallError =>
  new APICallError({
    message: "HTTP 500",
    url: "https://openrouter.test/api",
    requestBodyValues: {},
    statusCode: 500,
    isRetryable: true,
  });

const findings: IdentifiedFinding[] = [
  {
    id: "F1",
    file: "src/a.ts",
    startLine: 5,
    severity: "major",
    category: "security",
    description: "d",
    suggestion: "s",
  },
];

// Minimal successful V3 generation carrying a schema-valid review result.
const successfulGeneration = () => ({
  content: [{ type: "text" as const, text: '{"summary":"s","findings":[]}' }],
  finishReason: { unified: "stop" as const },
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  warnings: [],
});

describe("finder tool surface (cost ceiling, impl-review-phase-1 F3)", () => {
  it("no SourceProvider: the request carries no tools and one review = one provider attempt", async () => {
    const doGenerate = vi.fn().mockResolvedValue(successfulGeneration());
    currentModel = new MockLanguageModelV3({ doGenerate });
    const reviewer = createReviewer({ apiKey: "test-key" });
    const result = await reviewer.review({ kind: "diff", diff: "--- a\n+++ b" });
    expect(result.findings).toEqual([]);
    expect(doGenerate).toHaveBeenCalledTimes(1);
    const request = doGenerate.mock.calls[0]?.[0] as { tools?: unknown[] };
    expect(request.tools ?? []).toEqual([]);
  });

  it("with a SourceProvider: the request carries the getFileContext tool", async () => {
    const doGenerate = vi.fn().mockResolvedValue(successfulGeneration());
    currentModel = new MockLanguageModelV3({ doGenerate });
    const reviewer = createReviewer({ apiKey: "test-key", source: () => "ctx" });
    await reviewer.review({ kind: "diff", diff: "--- a\n+++ b" });
    const request = doGenerate.mock.calls[0]?.[0] as { tools?: { name?: string }[] };
    expect(request.tools?.map((t) => t.name)).toEqual(["getFileContext"]);
  });
});

// A model that answers with another fetch whenever tools are offered — the
// fetch-happy behavior observed live in phase 3 (sonnet-5 burned all 5, then
// all 8 steps on getFileContext and the run died with "No output generated").
const toolCallGeneration = () => ({
  content: [
    {
      type: "tool-call" as const,
      toolCallId: "call-1",
      toolName: "getFileContext",
      input: JSON.stringify({ path: "src/a.ts" }),
    },
  ],
  finishReason: { unified: "tool-calls" as const },
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  warnings: [],
});

describe("final-step guard at the provider boundary (impl-review-phase-3 F2)", () => {
  it("a fetch-happy model still emits the review: the last allowed step carries no tools", async () => {
    const doGenerate = vi
      .fn()
      .mockImplementation((request: { tools?: unknown[] }) =>
        Promise.resolve(
          (request.tools ?? []).length > 0 ? toolCallGeneration() : successfulGeneration(),
        ),
      );
    currentModel = new MockLanguageModelV3({ doGenerate });
    const reviewer = createReviewer({ apiKey: "test-key", source: () => "ctx", maxSteps: 3 });
    const result = await reviewer.review({ kind: "diff", diff: "--- a\n+++ b" });
    expect(result.findings).toEqual([]);
    // Steps 1..2 offer the tool (and this model spends them on fetches); the
    // final allowed step must offer none, forcing the structured review out
    // within the maxSteps budget. Without prepareFinalStep wired into the
    // agent this loop ends tool-calling at the step cap with no output.
    expect(doGenerate).toHaveBeenCalledTimes(3);
    const toolCounts = doGenerate.mock.calls.map(
      (call) => ((call[0] as { tools?: unknown[] }).tools ?? []).length,
    );
    expect(toolCounts).toEqual([1, 1, 0]);
  });
});

// Schema-valid judge generation for full-pipeline wiring tests.
const judgeGeneration = () => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({
        scores: Object.fromEntries(
          CRITERIA.map(({ key }) => [key, { score: "8", justification: "j", findingIds: [] }]),
        ),
        verdict: "passed",
        verdictReason: "ok",
        summary: "s",
      }),
    },
  ],
  finishReason: { unified: "stop" as const },
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  warnings: [],
});

const promptOfCall = (doGenerate: ReturnType<typeof vi.fn>, index: number): string =>
  JSON.stringify((doGenerate.mock.calls[index]?.[0] as { prompt?: unknown }).prompt);

describe("project review context wiring (impl-review-phase-1 F4)", () => {
  const RULES = "Always merge Tailwind classes with cn().";

  it("delivers trusted rules to the finder's system instructions and never to the judge", async () => {
    const doGenerate = vi
      .fn()
      .mockResolvedValueOnce(successfulGeneration())
      .mockResolvedValueOnce(judgeGeneration());
    currentModel = new MockLanguageModelV3({ doGenerate });
    const result = await runReviewPipeline({
      diff: "diff --git a/a b/a\n+x",
      projectReviewContext: RULES,
      overrides: { apiKey: "test-key" },
    });
    expect(result.verdict).toBe("passed");
    expect(doGenerate).toHaveBeenCalledTimes(2);
    expect(promptOfCall(doGenerate, 0)).toContain(RULES);
    expect(promptOfCall(doGenerate, 1)).not.toContain(RULES);
  });

  it("caps an oversized rules text with a visible marker before it reaches the finder", async () => {
    const doGenerate = vi
      .fn()
      .mockResolvedValueOnce(successfulGeneration())
      .mockResolvedValueOnce(judgeGeneration());
    currentModel = new MockLanguageModelV3({ doGenerate });
    await runReviewPipeline({
      diff: "diff --git a/a b/a\n+x",
      projectReviewContext: "r".repeat(PROJECT_CONTEXT_CAP_CHARS + 500),
      overrides: { apiKey: "test-key" },
    });
    const finderPrompt = promptOfCall(doGenerate, 0);
    expect(finderPrompt).toContain("project context truncated");
    expect(finderPrompt).not.toContain("r".repeat(PROJECT_CONTEXT_CAP_CHARS + 1));
  });
});

describe("provider attempts with maxRetries: 0", () => {
  it("finder: a failing review call makes exactly one provider attempt", async () => {
    const error = retryableError();
    const doGenerate = vi.fn().mockRejectedValue(error);
    currentModel = new MockLanguageModelV3({ doGenerate });
    const reviewer = createReviewer({ apiKey: "test-key" });
    await expect(reviewer.review({ kind: "diff", diff: "--- a\n+++ b" })).rejects.toBe(error);
    expect(doGenerate).toHaveBeenCalledTimes(1);
  });

  it("judge: a failing judge call makes exactly one provider attempt", async () => {
    const error = retryableError();
    const doGenerate = vi.fn().mockRejectedValue(error);
    currentModel = new MockLanguageModelV3({ doGenerate });
    const { judge } = createJudge({ apiKey: "test-key" });
    await expect(
      judge({ findings, diffStats: { files: 1, additions: 1, deletions: 0 } }),
    ).rejects.toBe(error);
    expect(doGenerate).toHaveBeenCalledTimes(1);
  });

  it("impl reviewer: a failing implementation-review call makes exactly one provider attempt", async () => {
    const error = retryableError();
    const doGenerate = vi.fn().mockRejectedValue(error);
    currentModel = new MockLanguageModelV3({ doGenerate });
    const { implReview } = createImplReviewer({ apiKey: "test-key" });
    await expect(implReview({ plan: "p", diff: "d" })).rejects.toBe(error);
    expect(doGenerate).toHaveBeenCalledTimes(1);
  });
});
