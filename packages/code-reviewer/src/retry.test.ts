import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";

import { isRetryableError, withOneRetry } from "./retry.js";

const apiError = (statusCode?: number): APICallError =>
  new APICallError({
    message: `HTTP ${String(statusCode ?? "none")}`,
    url: "https://openrouter.test/api",
    requestBodyValues: {},
    statusCode,
  });

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

  it.each([
    ["a config error", new Error("OPENROUTER_API_KEY is missing")],
    ["a schema mismatch", new TypeError("response did not match schema")],
    ["a thrown string", "boom"],
    ["undefined", undefined],
  ])("never retries %s", (_name, error) => {
    expect(isRetryableError(error)).toBe(false);
  });
});

describe("withOneRetry", () => {
  it("returns the first success without a second invocation", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withOneRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on a retryable failure and returns the second result", async () => {
    const fn = vi.fn().mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce("recovered");
    await expect(withOneRetry(fn)).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rethrows the second failure without a third attempt", async () => {
    const second = apiError(500);
    const fn = vi.fn().mockRejectedValueOnce(apiError(429)).mockRejectedValueOnce(second);
    await expect(withOneRetry(fn)).rejects.toBe(second);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rethrows a non-retryable failure immediately", async () => {
    const authError = apiError(401);
    const fn = vi.fn().mockRejectedValue(authError);
    await expect(withOneRetry(fn)).rejects.toBe(authError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
