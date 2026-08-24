/**
 * Side-effect-free core of the Replicate `predictions.create` call.
 *
 * WHY IT IS ITS OWN MODULE: `index.ts` runs `Sentry.init()` and `Deno.serve()`
 * at module top level and exports nothing, so importing it from a test would
 * boot a server and an SDK rather than exercise a function. This module holds
 * the logic, imports nothing with side effects, and is imported by BOTH
 * `index.ts` and `replicate-create.test.ts` — the same env-free-core split the
 * app uses for `reset-password.handler.ts` (see `context/foundation/lessons.md`).
 *
 * `fetch` and `sleep` are injectable for exactly one reason: without them the
 * only way to test a retry is to make real network calls and really wait out
 * the backoff. Production passes neither and gets the globals.
 */

/** Replicate's prediction-creation endpoint. */
export const REPLICATE_PREDICTIONS_URL = "https://api.replicate.com/v1/predictions";

/**
 * Burst-limit backoff (change `replicate-burst-backoff`, PR #168).
 *
 * `predictions.create` can answer 429 when the per-account burst limit is hit
 * by rapid resubmits; without a retry that transient surfaces to the user as a
 * terminal `start_failed` on a job that would have succeeded a second later.
 * SMOOTHING, not a cost bound — S-05's global daily cap is the structural spend
 * guard and is unaffected.
 */
export const PREDICTION_CREATE_MAX_ATTEMPTS = 3;
export const PREDICTION_CREATE_RETRY_DELAYS_MS = [500, 1_500];
/** Cap on an upstream-supplied wait, so a header we do not control cannot stall the function. */
export const PREDICTION_CREATE_MAX_RETRY_AFTER_MS = 5_000;

/**
 * Retry-After in ms, or null when the header is absent or unusable.
 * Replicate sends the delta-seconds form; the HTTP-date form is accepted too
 * because the spec allows it. Anything non-finite, negative, or past the cap
 * degrades to the caller's own backoff rather than a surprise long sleep.
 *
 * `now` is injectable so the HTTP-date branch is testable without wall-clock
 * flake — a date-based expectation computed against a moving `Date.now()` is
 * exactly the kind of assertion that passes locally and fails at 00:00:00.
 */
export function retryAfterMs(header: string | null, now: number = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed === "") return null;
  const seconds = Number(trimmed);
  const ms = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(trimmed) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, PREDICTION_CREATE_MAX_RETRY_AFTER_MS);
}

export interface CreatePredictionOptions {
  /** Wall-clock budget applied per attempt (not per call). */
  timeoutMs: number;
  /** Injected in tests; production uses the global. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so a retry does not really wait out the backoff. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected in tests to keep retry warnings out of the test output. */
  warn?: (message: string) => void;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST predictions.create, retrying ONLY a 429 burst-limit rejection.
 *
 * Safe to replay: a 429 means Replicate created nothing, so no attempt can
 * double-spend or orphan a prediction. Every other outcome — success, 4xx,
 * 5xx, timeout — is returned or thrown on the first attempt exactly as
 * before, so this narrows to the one transient it is meant to smooth.
 *
 * The response body is never read here: returning it unread is what lets the
 * caller build its own bounded error detail unchanged.
 */
export async function createPredictionWithBurstRetry(
  token: string,
  body: Record<string, unknown>,
  options: CreatePredictionOptions,
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const warn = options.warn ?? ((message: string) => console.warn(message));

  let res!: Response;
  for (let attempt = 1; attempt <= PREDICTION_CREATE_MAX_ATTEMPTS; attempt++) {
    res = await doFetch(REPLICATE_PREDICTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      // Bounds the kickoff POST so a hung Replicate API call can't stall the
      // invocation with the row stuck `processing`. Applied per attempt.
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (res.status !== 429 || attempt === PREDICTION_CREATE_MAX_ATTEMPTS) return res;
    const wait = retryAfterMs(res.headers.get("Retry-After")) ?? PREDICTION_CREATE_RETRY_DELAYS_MS[attempt - 1];
    warn(
      `enhance/start: Replicate predictions.create returned 429 (burst limit) on attempt ${attempt}/` +
        `${PREDICTION_CREATE_MAX_ATTEMPTS}; retrying in ${wait}ms`,
    );
    await sleep(wait);
  }
  return res;
}
