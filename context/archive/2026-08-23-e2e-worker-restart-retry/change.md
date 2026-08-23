---
change_id: e2e-worker-restart-retry
title: "E2E sig 3 resolved: signature-matched retry for wrangler dev's workerd-restart 503"
status: archived
created: 2026-08-23
updated: 2026-08-23
archived_at: 2026-08-23T21:20:00Z
---

## Notes

Signature 3 of the archived `e2e-webserver-boot-flake` change (its standing
wait-state #1) FIRED and is now diagnosed. Master run **32665508438** (PR
#164's post-merge run) went flaky-GREEN and uploaded the
`playwright-flaky-evidence` artifact the closure installed. The enriched
failure message — the exact deliverable of PR #160's `expectOkResponse` —
named the layer on the first occurrence:

> `signin: expected a 2xx response, got 503 from
http://localhost:4321/api/auth/signin — body: Your worker restarted
mid-request. Please try sending the request again. Only GET or HEAD
requests are retried automatically.`

**Diagnosis:** Miniflare restarted workerd mid-run under `wrangler dev`; the
proxy refuses to replay in-flight non-GET/HEAD requests, so the seed sign-in
POST got a 503. This is the same underlying event family as signature 1
(upstream `cloudflare/workers-sdk#14926`, checked 2026-08-23: **still open**,
`awaiting-response:cloudflare`): the pinned wrangler 4.113.0 survives the
workerd restart where 4.118+ died with the blank `[WebServer] ✘ [ERROR]` —
and this 503 is what surviving it looks like from an in-flight POST. The
evidence-capture protocol worked exactly as designed: blank `false` in the
original occurrence (run 32341863646), full layer-naming message now.

## What changed

- `tests/e2e/helpers/worker-restart-retry.ts` — `retryOnceOnWorkerRestart`:
  wraps a request-context send; retries ONCE, and only on 503 **plus** the
  verbatim restart body snippet (the body itself instructs the retry). Any
  other response returns the first attempt untouched, so `expectOkResponse`
  keeps reporting it with full evidence. Not a blind retry — the protocol's
  "no retries before evidence" rule is satisfied: the evidence came first.
- Call sites wrapped (the four request-context POSTs against the Worker):
  seed.spec.ts sign-in + anon create-job probe, auth.setup.ts sign-in,
  anon-dashboard-redirects-to-signin.spec.ts sign-in. Browser-driven POSTs
  (`waitForResponse` after a click) are NOT wrapped — the harness cannot
  replay them; if a restart ever hits one, the enriched message will say so.
  The `/callback` POSTs target the Supabase functions server, not workerd —
  out of scope.
- `tests/worker-restart-retry.test.ts` — hermetic suite (6 tests) pinning the
  narrowness: no body read on success, retry only on the exact signature,
  one retry maximum, unreadable-body and other-503 passthrough.

## Verification

- `npm run typecheck` clean; `tests/worker-restart-retry.test.ts` +
  `tests/expect-response-format.test.ts` green (14 tests).
- The e2e gate itself validates on this change's PR (CI boots the full local
  stack).
