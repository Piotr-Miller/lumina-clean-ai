/**
 * worker-restart-retry.test.ts — hermetic coverage of the workerd-restart
 * retry helper (tests/e2e/helpers/worker-restart-retry.ts).
 *
 * The helper's deliverable is its NARROWNESS: it must replay exactly the
 * restart 503 the evidence captured (master run 32665508438) and nothing
 * else — a green e2e run never exercises any of these paths. Same structural
 * fake-response approach as expect-response-format.test.ts: no Playwright
 * runtime, no network.
 */
import { describe, expect, it } from "vitest";
import type { APIResponse } from "@playwright/test";
import { retryOnceOnWorkerRestart, WORKER_RESTART_BODY_SNIPPET } from "./e2e/helpers/worker-restart-retry";

const RESTART_BODY =
  "Your worker restarted mid-request. Please try sending the request again. " +
  "Only GET or HEAD requests are retried automatically.";

/** Structural fake carrying only what the helper reads, with call counters. */
function fakeResponse(opts: { status: number; body?: string; textRejects?: boolean }): {
  response: APIResponse;
  textCalls: () => number;
} {
  let calls = 0;
  const response = {
    status: () => opts.status,
    text: () => {
      calls += 1;
      return opts.textRejects ? Promise.reject(new Error("stream torn down")) : Promise.resolve(opts.body ?? "");
    },
  } as unknown as APIResponse;
  return { response, textCalls: () => calls };
}

/** A send() that yields the given responses in order and counts invocations. */
function sender(...responses: APIResponse[]): { send: () => Promise<APIResponse>; sends: () => number } {
  let calls = 0;
  return {
    send: () => {
      const next = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      return Promise.resolve(next);
    },
    sends: () => calls,
  };
}

describe("retryOnceOnWorkerRestart", () => {
  it("returns a non-503 response untouched, without reading its body", async () => {
    // Success bodies carry signed URLs (the expectOkResponse lazy-read rule);
    // the helper must not read them either.
    const ok = fakeResponse({ status: 200 });
    const { send, sends } = sender(ok.response);
    expect(await retryOnceOnWorkerRestart(send)).toBe(ok.response);
    expect(sends()).toBe(1);
    expect(ok.textCalls()).toBe(0);
  });

  it("retries exactly once on the restart-signature 503 and returns the second response", async () => {
    const restart = fakeResponse({ status: 503, body: RESTART_BODY });
    const ok = fakeResponse({ status: 200 });
    const { send, sends } = sender(restart.response, ok.response);
    expect(await retryOnceOnWorkerRestart(send)).toBe(ok.response);
    expect(sends()).toBe(2);
  });

  it("returns a 503 with a different body untouched — the retry is signature-matched, not status-matched", async () => {
    const other = fakeResponse({ status: 503, body: "Service Unavailable" });
    const { send, sends } = sender(other.response);
    expect(await retryOnceOnWorkerRestart(send)).toBe(other.response);
    expect(sends()).toBe(1);
  });

  it("returns a 503 whose body is unreadable untouched — no signature proof, no retry", async () => {
    const torn = fakeResponse({ status: 503, textRejects: true });
    const { send, sends } = sender(torn.response);
    expect(await retryOnceOnWorkerRestart(send)).toBe(torn.response);
    expect(sends()).toBe(1);
  });

  it("retries ONCE only: a second restart 503 is returned, never re-retried", async () => {
    const first = fakeResponse({ status: 503, body: RESTART_BODY });
    const second = fakeResponse({ status: 503, body: RESTART_BODY });
    const { send, sends } = sender(first.response, second.response);
    expect(await retryOnceOnWorkerRestart(send)).toBe(second.response);
    expect(sends()).toBe(2);
    // The returned second response keeps its body unread by the helper, so
    // expectOkResponse can still report it with full evidence.
    expect(second.textCalls()).toBe(0);
  });

  it("matches on the snippet the captured evidence pinned", () => {
    expect(RESTART_BODY).toContain(WORKER_RESTART_BODY_SNIPPET);
  });
});
