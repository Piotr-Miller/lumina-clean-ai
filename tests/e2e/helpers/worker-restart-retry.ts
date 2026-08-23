/**
 * worker-restart-retry.ts — single, signature-matched retry for wrangler dev's
 * workerd-restart 503.
 *
 * Diagnosis (signature 3 of change `e2e-webserver-boot-flake`, resolved
 * evidence-first per that change's protocol): master run 32665508438's
 * `playwright-flaky-evidence` artifact captured the seed sign-in POST failing
 * with 503 and the body "Your worker restarted mid-request. Please try
 * sending the request again. Only GET or HEAD requests are retried
 * automatically." — Miniflare restarted workerd mid-run, and wrangler's proxy
 * refuses to replay in-flight non-idempotent requests. Same underlying event
 * family as signature 1 (upstream cloudflare/workers-sdk#14926, still open):
 * the pinned wrangler 4.113.0 survives the restart where newer versions died,
 * and this 503 is what surviving it looks like from an in-flight POST.
 *
 * The retry is deliberately NARROW — 503 AND the exact restart body, one
 * attempt, request-context calls only. A browser-driven POST (page click →
 * waitForResponse) cannot be replayed by the harness, so those sites keep
 * their enriched failure via expectOkResponse instead. Anything that is not
 * this exact transient returns the FIRST response untouched, preserving the
 * evidence-first rule: no blind retries, no timeouts, no masked failures.
 */
import type { APIResponse } from "@playwright/test";

/** The workerd-restart 503 body marker, verbatim from the captured evidence. */
export const WORKER_RESTART_BODY_SNIPPET = "Your worker restarted mid-request";

/**
 * Send an API-context request; if the response is exactly the workerd-restart
 * 503, send it once more (as the body itself instructs) and return that.
 * Every other response — success, other failures, unreadable bodies — is
 * returned untouched from the first attempt.
 */
export async function retryOnceOnWorkerRestart(send: () => Promise<APIResponse>): Promise<APIResponse> {
  const first = await send();
  if (first.status() !== 503) return first;
  let body: string;
  try {
    body = await first.text();
  } catch {
    // Body unreadable → cannot prove the restart signature → no retry; the
    // caller's expectOkResponse reports the 503 with whatever evidence remains.
    return first;
  }
  if (!body.includes(WORKER_RESTART_BODY_SNIPPET)) return first;
  return send();
}
