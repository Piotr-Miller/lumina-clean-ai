import { APICallError, NoObjectGeneratedError } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  isRetryableError,
  MAX_RETRY_DELAY_MS,
  RATE_LIMIT_DELAY_MS,
  retryDelayMs,
  TRANSIENT_DELAY_MS,
  withOneRetry,
} from "./retry.js";

const apiError = (statusCode?: number, responseHeaders?: Record<string, string>): APICallError =>
  new APICallError({
    message: `HTTP ${String(statusCode ?? "none")}`,
    url: "https://openrouter.test/api",
    requestBodyValues: {},
    statusCode,
    responseHeaders,
  });

// Real constructor on purpose: the SDK brands instances with a private symbol
// set in the constructor and isInstance checks that marker, not the prototype
// chain — an Object.create fixture would silently fail classification.
const schemaMismatchError = (): NoObjectGeneratedError =>
  new NoObjectGeneratedError({
    message: "No object generated: response did not match schema.",
    text: "{",
    response: { id: "resp-1", timestamp: new Date(0), modelId: "test-model" },
    usage: {
      inputTokens: 1,
      inputTokenDetails: {
        noCacheTokens: 1,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: 1,
      outputTokenDetails: { textTokens: 1, reasoningTokens: undefined },
      totalTokens: 2,
    },
    finishReason: "stop",
  });

// Deterministic seams: a recording no-op sleep and a fixed jitter source.
const recordingSleep = () => {
  const calls: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    calls.push(ms);
    return Promise.resolve();
  };
  return { calls, sleep };
};
const noJitter = () => 0;

describe("isRetryableError", () => {
  it.each([429, 500, 502, 503])("retries APICallError with status %s", (status) => {
    expect(isRetryableError(apiError(status))).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])("never retries APICallError with status %s", (status) => {
    expect(isRetryableError(apiError(status))).toBe(false);
  });

  it("never retries an APICallError without a status code", () => {
    expect(isRetryableError(apiError(undefined))).toBe(false);
  });

  it("retries timeout aborts (DOMException named TimeoutError)", () => {
    expect(isRetryableError(new DOMException("timed out", "TimeoutError"))).toBe(true);
  });

  it("never retries an external cancellation (plain AbortError)", () => {
    expect(isRetryableError(new DOMException("aborted", "AbortError"))).toBe(false);
  });

  it("retries a structured-output schema mismatch (NoObjectGeneratedError)", () => {
    expect(isRetryableError(schemaMismatchError())).toBe(true);
  });

  it.each([
    ["a config error", new Error("OPENROUTER_API_KEY is missing")],
    ["a schema mismatch", new TypeError("response did not match schema")],
    ["a thrown string", "boom"],
    ["undefined", undefined],
  ])("never retries %s", (_name, error) => {
    // The TypeError case pins the classification boundary: only the SDK's
    // typed NoObjectGeneratedError is retryable, never message lookalikes.
    expect(isRetryableError(error)).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("returns 0 for a schema mismatch (fresh sample is the fix)", () => {
    expect(retryDelayMs(schemaMismatchError(), () => 1)).toBe(0);
  });

  it("uses the rate-limit default for a 429 without a Retry-After header", () => {
    expect(retryDelayMs(apiError(429), noJitter)).toBe(RATE_LIMIT_DELAY_MS);
  });

  it.each([500, 502, 503])("uses the transient default for a %s", (status) => {
    expect(retryDelayMs(apiError(status), noJitter)).toBe(TRANSIENT_DELAY_MS);
  });

  it("uses the transient default for a timeout abort", () => {
    expect(retryDelayMs(new DOMException("timed out", "TimeoutError"), noJitter)).toBe(
      TRANSIENT_DELAY_MS,
    );
  });

  it("honors a usable numeric Retry-After header (seconds → ms)", () => {
    expect(retryDelayMs(apiError(429, { "retry-after": "7" }), noJitter)).toBe(7_000);
  });

  it("honors Retry-After on a 5xx too", () => {
    expect(retryDelayMs(apiError(503, { "retry-after": "3" }), noJitter)).toBe(3_000);
  });

  it("treats Retry-After: 0 as an immediate retry", () => {
    expect(retryDelayMs(apiError(429, { "retry-after": "0" }), () => 1)).toBe(0);
  });

  it.each([
    ["negative", "-5"],
    ["partially numeric", "7s"],
    ["HTTP-date", "Fri, 07 Aug 2026 12:00:00 GMT"],
    ["empty", ""],
    ["whitespace", "  "],
    ["non-finite", "Infinity"],
  ])("falls back to the class default on a %s Retry-After (never immediate)", (_name, value) => {
    expect(retryDelayMs(apiError(429, { "retry-after": value }), noJitter)).toBe(
      RATE_LIMIT_DELAY_MS,
    );
  });

  it("clamps an oversized Retry-After to the cap, jitter included", () => {
    expect(retryDelayMs(apiError(429, { "retry-after": "9999" }), () => 1)).toBe(
      MAX_RETRY_DELAY_MS,
    );
  });

  it("adds bounded jitter to nonzero delays", () => {
    expect(retryDelayMs(apiError(500), () => 1)).toBe(TRANSIENT_DELAY_MS + 1_000);
    const sampled = retryDelayMs(apiError(500));
    expect(sampled).toBeGreaterThanOrEqual(TRANSIENT_DELAY_MS);
    expect(sampled).toBeLessThanOrEqual(TRANSIENT_DELAY_MS + 1_000);
  });
});

describe("withOneRetry", () => {
  it("returns the first success without a second invocation", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withOneRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on a retryable failure and returns the second result", async () => {
    const { calls, sleep } = recordingSleep();
    const fn = vi.fn().mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce("recovered");
    await expect(withOneRetry(fn, { sleep, random: noJitter })).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([TRANSIENT_DELAY_MS]);
  });

  it("rethrows the second failure without a third attempt", async () => {
    const { calls, sleep } = recordingSleep();
    const second = apiError(500);
    const fn = vi.fn().mockRejectedValueOnce(apiError(429)).mockRejectedValueOnce(second);
    await expect(withOneRetry(fn, { sleep, random: noJitter })).rejects.toBe(second);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([RATE_LIMIT_DELAY_MS]);
  });

  it("rethrows a non-retryable failure immediately without sleeping", async () => {
    const { calls, sleep } = recordingSleep();
    const authError = apiError(401);
    const fn = vi.fn().mockRejectedValue(authError);
    await expect(withOneRetry(fn, { sleep })).rejects.toBe(authError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("retries a schema mismatch immediately: no sleep call at all", async () => {
    const { calls, sleep } = recordingSleep();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(schemaMismatchError())
      .mockResolvedValueOnce("recovered");
    await expect(withOneRetry(fn, { sleep })).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([]);
  });

  it("fires onRetry exactly once, before the sleep, with the error and delay", async () => {
    const order: string[] = [];
    const error = apiError(429);
    const onRetry = vi.fn(() => order.push("onRetry"));
    const sleep = (): Promise<void> => {
      order.push("sleep");
      return Promise.resolve();
    };
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce("recovered");
    await expect(withOneRetry(fn, { sleep, random: noJitter, onRetry })).resolves.toBe(
      "recovered",
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(error, RATE_LIMIT_DELAY_MS);
    expect(order).toEqual(["onRetry", "sleep"]);
  });

  it("never fires onRetry on a first-try success", async () => {
    const onRetry = vi.fn();
    await expect(withOneRetry(() => Promise.resolve("ok"), { onRetry })).resolves.toBe("ok");
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("never fires onRetry on a non-retryable failure", async () => {
    const onRetry = vi.fn();
    await expect(
      withOneRetry(() => Promise.reject(apiError(401)), { onRetry }),
    ).rejects.toBeInstanceOf(APICallError);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
