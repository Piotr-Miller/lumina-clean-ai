/**
 * replicate-create.test.ts — the FIRST `deno test` suite in this repo.
 *
 * Why it exists: `supabase/functions/**` is excluded from the Astro tsc/eslint
 * graph, so until now `deno check` plus a stubbed E2E was the Edge Function's
 * entire coverage — and the E2E Replicate stub never returns 429, so the
 * burst-limit retry shipped (PR #168) with its behaviour unexercised. That gap
 * was recorded rather than papered over; this closes it.
 *
 * Run: deno test --config supabase/functions/enhance/deno.json supabase/functions/enhance/
 *
 * No network and no real waiting: `fetchImpl` and `sleep` are injected, so the
 * suite asserts the retry POLICY (how many attempts, on what, how long) rather
 * than Replicate's behaviour.
 */
import { assertEquals, assertNotEquals } from "jsr:@std/assert@^1.0.8";
import {
  createPredictionWithBurstRetry,
  PREDICTION_CREATE_MAX_ATTEMPTS,
  PREDICTION_CREATE_MAX_RETRY_AFTER_MS,
  PREDICTION_CREATE_RETRY_DELAYS_MS,
  REPLICATE_PREDICTIONS_URL,
  retryAfterMs,
} from "./replicate-create.ts";

const TIMEOUT_MS = 30_000;

/** A fetch stub yielding the given responses in order, recording each call. */
function stubFetch(...statuses: { status: number; retryAfter?: string }[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let i = 0;
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const spec = statuses[Math.min(i, statuses.length - 1)];
    i++;
    const headers = new Headers();
    if (spec.retryAfter !== undefined) headers.set("Retry-After", spec.retryAfter);
    return Promise.resolve(new Response("body", { status: spec.status, headers }));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, attempts: () => i };
}

/** Records requested sleeps without actually waiting. */
function recordingSleep() {
  const waits: number[] = [];
  return { waits, sleep: (ms: number) => (waits.push(ms), Promise.resolve()) };
}

const noopWarn = () => {};

const run = (fetchImpl: typeof fetch, sleep: (ms: number) => Promise<void>): Promise<Response> =>
  createPredictionWithBurstRetry(
    "test-token",
    { version: "v1" },
    {
      timeoutMs: TIMEOUT_MS,
      fetchImpl,
      sleep,
      warn: noopWarn,
    },
  );

Deno.test("success on the first attempt makes exactly one call and never sleeps", async () => {
  const f = stubFetch({ status: 201 });
  const s = recordingSleep();
  const res = await run(f.fetchImpl, s.sleep);
  assertEquals(res.status, 201);
  assertEquals(f.attempts(), 1);
  assertEquals(s.waits, []);
});

Deno.test("a 429 is retried and the succeeding response is returned", async () => {
  const f = stubFetch({ status: 429 }, { status: 201 });
  const s = recordingSleep();
  const res = await run(f.fetchImpl, s.sleep);
  assertEquals(res.status, 201);
  assertEquals(f.attempts(), 2);
  assertEquals(s.waits, [PREDICTION_CREATE_RETRY_DELAYS_MS[0]]);
});

// The blast-radius guarantee: this must smooth ONE transient and nothing else.
// A retried 500 would double-charge a request Replicate may have acted on.
Deno.test("non-429 failures are NOT retried", async () => {
  for (const status of [400, 401, 402, 422, 500, 502, 503]) {
    const f = stubFetch({ status });
    const s = recordingSleep();
    const res = await run(f.fetchImpl, s.sleep);
    assertEquals(res.status, status);
    assertEquals(f.attempts(), 1, `status ${status} must not be retried`);
    assertEquals(s.waits, []);
  }
});

Deno.test("retries are bounded: a persistent 429 returns the last response, never loops", async () => {
  const f = stubFetch({ status: 429 });
  const s = recordingSleep();
  const res = await run(f.fetchImpl, s.sleep);
  assertEquals(res.status, 429);
  assertEquals(f.attempts(), PREDICTION_CREATE_MAX_ATTEMPTS);
  // One sleep fewer than attempts — the final failure returns immediately.
  assertEquals(s.waits.length, PREDICTION_CREATE_MAX_ATTEMPTS - 1);
  assertEquals(s.waits, PREDICTION_CREATE_RETRY_DELAYS_MS);
});

Deno.test("Retry-After overrides the local backoff", async () => {
  const f = stubFetch({ status: 429, retryAfter: "2" }, { status: 201 });
  const s = recordingSleep();
  await run(f.fetchImpl, s.sleep);
  assertEquals(s.waits, [2_000]);
  assertNotEquals(s.waits[0], PREDICTION_CREATE_RETRY_DELAYS_MS[0]);
});

// An upstream header must never be able to stall the function: the /start
// invocation has a budget, and Retry-After is not a value we control.
Deno.test("an oversized Retry-After is capped", async () => {
  const f = stubFetch({ status: 429, retryAfter: "3600" }, { status: 201 });
  const s = recordingSleep();
  await run(f.fetchImpl, s.sleep);
  assertEquals(s.waits, [PREDICTION_CREATE_MAX_RETRY_AFTER_MS]);
});

Deno.test("the response body is never consumed, so the caller can still read it", async () => {
  const f = stubFetch({ status: 429 }, { status: 500 });
  const s = recordingSleep();
  const res = await run(f.fetchImpl, s.sleep);
  assertEquals(res.bodyUsed, false);
  assertEquals(await res.text(), "body");
});

Deno.test("every attempt carries the auth header, JSON body, and a per-attempt timeout signal", async () => {
  const f = stubFetch({ status: 429 }, { status: 201 });
  const s = recordingSleep();
  await run(f.fetchImpl, s.sleep);
  assertEquals(f.calls.length, 2);
  for (const call of f.calls) {
    assertEquals(call.url, REPLICATE_PREDICTIONS_URL);
    assertEquals(call.init?.method, "POST");
    const headers = call.init?.headers as Record<string, string>;
    assertEquals(headers.Authorization, "Bearer test-token");
    assertEquals(headers["Content-Type"], "application/json");
    assertEquals(call.init?.body, JSON.stringify({ version: "v1" }));
    // A shared signal would mean the FIRST attempt's clock bounds the retry too.
    assertNotEquals(call.init?.signal, undefined);
  }
  assertNotEquals(f.calls[0].init?.signal, f.calls[1].init?.signal);
});

Deno.test("retryAfterMs: delta-seconds form", () => {
  assertEquals(retryAfterMs("2"), 2_000);
  assertEquals(retryAfterMs(" 3 "), 3_000);
});

Deno.test("retryAfterMs: HTTP-date form, measured against an injected now", () => {
  const now = Date.parse("2026-08-24T00:00:00Z");
  assertEquals(retryAfterMs("Mon, 24 Aug 2026 00:00:02 GMT", now), 2_000);
});

Deno.test("retryAfterMs: absent, empty, unparseable, zero and past values fall back to null", () => {
  const now = Date.parse("2026-08-24T00:00:00Z");
  assertEquals(retryAfterMs(null), null);
  assertEquals(retryAfterMs(""), null);
  assertEquals(retryAfterMs("   "), null);
  assertEquals(retryAfterMs("soon"), null);
  assertEquals(retryAfterMs("0"), null);
  assertEquals(retryAfterMs("-5"), null);
  // A date already in the past must not produce a negative wait.
  assertEquals(retryAfterMs("Mon, 24 Aug 2026 00:00:00 GMT", now), null);
  assertEquals(retryAfterMs("Sun, 23 Aug 2026 23:59:58 GMT", now), null);
});

Deno.test("retryAfterMs: caps at the maximum", () => {
  assertEquals(retryAfterMs("99999"), PREDICTION_CREATE_MAX_RETRY_AFTER_MS);
});
