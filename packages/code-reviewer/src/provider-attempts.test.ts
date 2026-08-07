import { APICallError } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createJudge } from "./judge.js";
import { createReviewer } from "./reviewer.js";
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
});
