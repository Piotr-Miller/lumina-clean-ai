import { APICallError, NoObjectGeneratedError } from "ai";

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
 * we match by name), APICallError with HTTP 429 or 5xx, and structured-output
 * schema mismatches (`NoObjectGeneratedError` — matched via the SDK's typed
 * `isInstance`, never by message; the finder flaked its schema on 2 of 7 live
 * runs and one re-roll is the designed recovery). External cancellations
 * (plain `AbortError`) and config/auth errors are never retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (errorName(error) === "TimeoutError") return true;
  if (NoObjectGeneratedError.isInstance(error)) return true;
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    return status === 429 || (status !== undefined && status >= 500);
  }
  return false;
}

// Pre-retry delay policy: an immediate 429 retry usually lands in the same
// rate-limit window, so the single retry waits a bounded, header-aware delay.
export const MAX_RETRY_DELAY_MS = 30_000;
export const RATE_LIMIT_DELAY_MS = 10_000;
export const TRANSIENT_DELAY_MS = 2_000;
const JITTER_MS = 1_000;

// A usable Retry-After is a non-empty, fully numeric, finite value >= 0
// (seconds). Negative, partially numeric, and HTTP-date forms are NOT usable
// and fall back to the class default — never to an immediate retry.
function retryAfterMs(error: APICallError): number | undefined {
  const raw = error.responseHeaders?.["retry-after"];
  if (raw === undefined || raw.trim() === "") return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

function baseDelayMs(error: unknown): number {
  // A schema mismatch is a stochastic decode failure — a fresh sample is the
  // fix; waiting gains nothing.
  if (NoObjectGeneratedError.isInstance(error)) return 0;
  if (APICallError.isInstance(error)) {
    const headerMs = retryAfterMs(error);
    if (headerMs !== undefined) return headerMs;
    return error.statusCode === 429 ? RATE_LIMIT_DELAY_MS : TRANSIENT_DELAY_MS;
  }
  // TimeoutError (and any future retryable class without richer signal).
  return TRANSIENT_DELAY_MS;
}

/**
 * How long to wait before the single retry: Retry-After when usable, else a
 * class default. Nonzero delays add up to 1s of jitter; everything clamps to
 * MAX_RETRY_DELAY_MS.
 */
export function retryDelayMs(error: unknown, random: () => number = Math.random): number {
  const base = baseDelayMs(error);
  if (base === 0) return 0;
  return Math.min(base + random() * JITTER_MS, MAX_RETRY_DELAY_MS);
}

export interface RetryOptions {
  /** Test seam for the pre-retry wait; defaults to a real setTimeout sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Jitter source for retryDelayMs; defaults to Math.random. */
  random?: () => number;
  /**
   * Observability hook: fires exactly once, before the sleep, only when a
   * retry will actually happen. Without it a recovered flake leaves no trace
   * — the first failure is swallowed by the retry. A throwing hook is
   * swallowed: telemetry must never turn a recoverable failure terminal.
   */
  onRetry?: (error: unknown, delayMs: number) => void;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Re-invoke `fn` at most once, only on a retryable failure and after the
 * policy delay (a computed delay of 0 skips the sleep call entirely);
 * rethrow otherwise/after.
 */
export async function withOneRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isRetryableError(error)) throw error;
    const delayMs = retryDelayMs(error, options.random);
    try {
      options.onRetry?.(error, delayMs);
    } catch {
      // Deliberately swallowed — see the onRetry doc comment.
    }
    if (delayMs > 0) await (options.sleep ?? realSleep)(delayMs);
    return await fn();
  }
}
