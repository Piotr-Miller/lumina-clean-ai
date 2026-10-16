import { AISDKError, APICallError, NoObjectGeneratedError } from "ai";

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
 * we match by name; the finder's whole-review budget aborts with the same
 * name), APICallError with HTTP 429 or 5xx, and structured-output schema
 * mismatches (`NoObjectGeneratedError` — matched via the SDK's typed
 * `isInstance`, never by message). External cancellations (plain
 * `AbortError`) and config/auth errors are never retryable.
 *
 * `NoObjectGeneratedError` now comes only from the JUDGE (and the
 * implementation review), which still use provider-side structured output. The
 * finder parses its own output since change `finder-serialization-outage` and
 * fails with `FinderOutputError`, which is deliberately NOT retryable: its one
 * format repair took over the re-roll's role, and the frame saw both attempts of
 * the old re-roll fail identically on every post-break run. It fails every
 * condition below as written, so the classifier needs no case for it — the
 * test pins that.
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

/**
 * The HTTP status of the provider call behind a failure: the first
 * APICallError carrying a numeric `statusCode`, found by walking the error,
 * its `cause` chain and a RetryError's `lastError` (change `finder-glm-5-3`,
 * owner decision 2026-10-14). Only the typed status counts — never message
 * text, which can mention "401" for any reason. Undefined when no
 * APICallError carries one. Cycles and deep chains are cut off.
 */
export function apiErrorStatus(error: unknown): number | undefined {
  const seen = new Set<object>();
  const queue: unknown[] = [error];
  while (queue.length > 0 && seen.size < 16) {
    const current = queue.shift();
    if (typeof current !== "object" || current === null || seen.has(current)) continue;
    seen.add(current);
    if (APICallError.isInstance(current) && typeof current.statusCode === "number") return current.statusCode;
    if ("cause" in current) queue.push(current.cause);
    if ("lastError" in current) queue.push(current.lastError);
  }
  return undefined;
}

/**
 * Whether an SDK error sits anywhere in the failure's chain — the same walk
 * as `apiErrorStatus`. An SDK message can quote model output with no HTTP
 * status attached (TypeValidationError's `Value:`, JSONParseError's `Text:`,
 * RetryError repeating its last error), so public surfaces treat any SDK
 * error as unsafe to quote rather than listing the classes that are.
 */
function hasSdkError(error: unknown): boolean {
  const seen = new Set<object>();
  const queue: unknown[] = [error];
  while (queue.length > 0 && seen.size < 16) {
    const current = queue.shift();
    if (typeof current !== "object" || current === null || seen.has(current)) continue;
    seen.add(current);
    if (AISDKError.isInstance(current)) return true;
    if ("cause" in current) queue.push(current.cause);
    if ("lastError" in current) queue.push(current.lastError);
  }
  return false;
}

export const errorLabel = (error: unknown): string => {
  const name = errorName(error);
  return name === undefined || name === "" ? String(error) : name;
};

/**
 * What a public surface — the step summary, the PR comment — may say about a
 * failure. An APICallError's message is the provider's response body text and
 * any other SDK error may quote model output, so either shows only its label
 * and status; the message stays in the job log. A non-SDK error keeps its
 * message, which never quotes the response (change `finder-glm-5-3`, owner
 * decisions 2026-10-14). `label` lets a caller escape the name for its surface.
 */
export function publicErrorSummary(error: unknown, label = errorLabel(error)): string {
  const status = apiErrorStatus(error);
  if (status !== undefined)
    return `${label}: api error: status=${String(status)} (provider message only in the job log)`;
  if (hasSdkError(error)) return `${label}: SDK error (message only in the job log)`;
  return error instanceof Error ? error.message : String(error);
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
