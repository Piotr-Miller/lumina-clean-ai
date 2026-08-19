---
change_id: edge-function-url-hardening
title: Fail-fast guard for the Edge callback URL (no silent no-webhook branch in prod)
status: archived
created: 2026-06-08
updated: 2026-08-19
archived_at: 2026-08-19T20:28:33Z
---

## Notes

Surfaced as a follow-up during **D.1** (`cloud-flip-on-revalidation`, archived 2026-06-07). The Edge Function (`supabase/functions/enhance/index.ts`) derives the callback URL from the auto-injected `SUPABASE_URL` (`enhanceFunctionBaseUrl()`), assuming it equals `https://<ref>.supabase.co`. In the **hosted** Edge runtime that value is NOT the public https URL, so the derived callback URL isn't `https://` → `/start` silently takes the **no-webhook** branch (`enhance/index.ts:233`) → Replicate never calls back → jobs stall in `processing` with no error. This cost real debugging time at flip-ON until `EDGE_FUNCTION_URL` was set explicitly.

**Goal:** make the failure loud instead of silent. Either make `EDGE_FUNCTION_URL` **mandatory in prod** (fail-fast at `/start` with a clear error if the resolved callback URL is not `https://`), or fix the derivation so it can't silently fall through to no-webhook. The lesson is already recorded (`context/foundation/lessons.md` — "Hosted Supabase Edge Functions: the auto-injected `SUPABASE_URL` is NOT the public https URL"); this change adds the code-level guardrail the lesson asks for.

**Scope guard:** small, surgical hardening of `enhance/index.ts` only — not a pipeline redesign. Currently functional in prod (the secret IS set); this prevents a silent regression if it's ever unset.

---

## Re-scope + implementation, 2026-08-19

Re-opened after 2.5 months to decide **re-scope or close**. Both premises were re-verified against the
code before touching anything, and the draft turned out to be **still valid, plus one defect it did not
name**.

### What later work had already fixed — and what it had not

The silent-degradation family got attention in `cancel-degradation-visibility`, so two neighbouring paths
now log with the consequence named (`enhance/index.ts` no-webhook branch, `cancel.handler.ts:152`). That
is what made "close it" plausible. But a `console.warn` is not the guard the draft asked for:

- The job still gets created, still sits `processing`, and still ends at a watchdog timeout.
- The row carries **no error**, the caller gets **200**, and the only signal is a log line in a runtime
  nobody tails.
- So the observable behaviour in prod, if `EDGE_FUNCTION_URL` were ever unset, is byte-identical to the
  original incident.

**Verdict: re-scope, not close.**

### The second defect, not in the original draft

Two code comments asserted the opposite of what production proved:

- `enhanceFunctionBaseUrl()` — _"correct in prod: https://&lt;ref&gt;.supabase.co/functions/v1/enhance"_
- the `/start` webhook branch — _"In prod the derived URL is https://&lt;ref&gt;.supabase.co/... — set normally"_

Both are contradicted by `lessons.md` and by `production-config.md`, which marks `EDGE_FUNCTION_URL`
**REQUIRED** with the incident cited. A stale comment claiming a secret is unnecessary is not cosmetic:
it is an invitation to delete the secret and reproduce the outage. Fixed alongside the guard.

### What shipped

- **`assertHttpsCallback(callbackUrl)`** in `/start`, called **before** `claimJobForProcessing`. A
  non-HTTPS callback now throws. The existing `catch` already does the right thing with it — Sentry
  capture, `markJobFailed` on the row, HTTP 500 — so the fix reuses the failure path rather than adding
  one. A stalled job that says nothing becomes a failed job that says why.
- **`ALLOW_WEBHOOKLESS_PREDICTION`** — a default-OFF local/CI seam, deliberately the same shape as
  `E2E_ALLOWED_OUTPUT_ORIGIN`, because local dev without a public tunnel legitimately needs the old
  behaviour (Replicate 422s on `host.docker.internal`). **Never set it in production** — it restores the
  exact silent stall this guard removes. Warned in `AGENTS.md` and `production-config.md`.
- Both stale comments corrected to state what production actually showed.

### Why this is safe to deploy

The guard changes behaviour in **exactly one case**: a callback URL that is not HTTPS, which today
produces a webhook-less prediction and a stall. Prod has `EDGE_FUNCTION_URL` set (`production-config.md`,
set 2026-06-08), so the resolved URL is HTTPS and the guard is a no-op there. CI's `e2e` job never
reaches `/start` — the Replicate pipeline is stubbed via a self-signed `/callback`, with
`CLOUD_PIPELINE_ENABLED=false` and no token — so the gate is unaffected.

### Deliberately NOT done

- **Not fixing the derivation itself.** `enhanceFunctionBaseUrl()` still falls back to `SUPABASE_URL`.
  Removing the fallback would break local dev, and the guard makes the fallback's failure loud, which is
  what the draft asked for.
- **Not adding a startup/config check.** `EDGE_FUNCTION_URL` is legitimately absent locally, so a boot
  assertion would fire on every dev run. The check belongs where the URL is used.
- **Not touching the watchdog.** It remains the backstop for stalls from other causes.

---

## Archived 2026-08-19 — with the verification gap stated, not glossed

Shipped in PR #150 (`bb23ec9`), which deploys both the Worker and the `enhance` Edge Function on merge
to master. **That deploy is not evidence the guard works.**

### Why a green deploy proves nothing here

The guard fires only when the resolved callback URL is not HTTPS. Prod has `EDGE_FUNCTION_URL` set
(`production-config.md`, set 2026-06-08), so in production it is a **deliberate no-op**. A successful
deploy and a healthy cloud pipeline are exactly what you would see whether the guard worked perfectly or
was never wired at all.

Verifying it live would mean temporarily unsetting `EDGE_FUNCTION_URL` on prod to watch a job fail
loudly — i.e. deliberately breaking the cloud pipeline on a live product to test an error path. Not
worth it, and not something to do without an explicit decision.

### What IS verified

- `deno check` passes; 327 unit tests green; CI green across all six checks on #150.
- The throw is placed **before** `claimJobForProcessing`, so it reuses the existing `/start` catch —
  Sentry capture, `markJobFailed` on the row, HTTP 500. That path is exercised by other failure modes
  and is not new code.
- CI's `e2e` never reaches `/start` (stubbed pipeline, `CLOUD_PIPELINE_ENABLED=false`, no token), which
  was **predicted before the run and confirmed by it** — `e2e` passed on #150.

### What is NOT verified

The guard has never fired, in any environment. Its message text, and the assumption that a fail-fast at
this point produces a better operator experience than the silent stall, are both **untested in
practice**.

### How it would get verified, without breaking anything

The next `cloud-live-smoke` run (`context/foundation/cloud-live-smoke.md`) exercises the live cold-boot
path. A deliberate, temporary local run with `EDGE_FUNCTION_URL` unset and
`ALLOW_WEBHOOKLESS_PREDICTION` also unset would exercise the throw against a real stack in seconds — the
cheap check, if anyone wants it. Archiving does not block that; it just stops the change sitting open
waiting for a verification nobody scheduled.

Recorded here rather than in `review-pipeline-verification.md` because that log is scoped to the AI
review pipeline; this is an application-side guard.
