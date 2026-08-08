import { APICallError } from "ai";

// The user's retry rule as pure code: retry exactly once, per pass, and only
// for transient failures. Both passes run their agents with `maxRetries: 0`
// (SDK-internal retries disabled), so raw provider errors — not RetryError
// wrappers — reach this classifier and `withOneRetry` is the single retry
// authority: total provider attempts per pass are exactly <= 2.

const errorName = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
    ? error.name
    : undefined;

/**
 * Transient-failure classifier: timeout aborts (the AI SDK aborts timed-out
 * calls with a DOMException named `TimeoutError` — NOT an Error subclass, so
 * we match by name) and APICallError with HTTP 429 or 5xx. External
 * cancellations (plain `AbortError`) and config/auth/schema-mismatch errors
 * are never retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (errorName(error) === "TimeoutError") return true;
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    return status === 429 || (status !== undefined && status >= 500);
  }
  return false;
}

/** Re-invoke `fn` at most once, only on a retryable failure; rethrow otherwise/after. */
export async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isRetryableError(error)) throw error;
    return await fn();
  }
}
