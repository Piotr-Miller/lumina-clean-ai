# S-09 Source signed-URL TTL fix — Plan Brief

> Full plan: `context/changes/cloud-source-url-ttl-fix/plan.md`
> Research: `context/changes/cloud-source-url-ttl-fix/research.md`

## What & Why

A Cloud-AI job must survive a slow Replicate cold boot. Today the Edge Function signs the source READ URL with a 300s TTL, but Replicate fetches that URL at `predict()` start — *after* a cold boot that has been observed to exceed 300s under load — so the URL expires and the prediction dies at the source-fetch step (400). We raise the source-URL TTL generously and align the client watchdog so a slow-but-working job isn't false-failed.

## Starting Point

`SOURCE_URL_TTL_SECONDS = 300` (`enhance/index.ts:40`), fixed at prediction creation and un-re-mintable. The client `PROCESSING_WATCHDOG_MS = 180_000` is *shorter* than the cold-boot tail. Cold-start copy says "~2 minutes". Cloud ships OFF; S-09 is a flip-ON gate prerequisite (with S-05 ✓ + S-08).

## Desired End State

The signed source URL stays valid through the worst-case cold boot (so it's never the failure cause), and the client waits a sensible UX-patience window before failing to a retry. A slow cold boot completes and renders the result; the budgets are guarded by an invariant unit test so they don't silently regress.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Source-URL TTL | **3600s (1h)** | Covers queue + multi-minute cold boot + Replicate's 30-min run window; Supabase has no cap | Research + Plan |
| Processing watchdog | **300_000ms (5 min)** | UX-patience budget; clears typical ~135s cold boot + margin, still bails truly-stuck jobs | Plan |
| Source TTL vs watchdog | **Decoupled** (not equal) | TTL = "never the failure cause"; watchdog = "user patience" — different concerns | Research |
| Fix shape | **Raise TTL** (not lazy-sign) | Replicate fetches on its own schedule; can't sign just-in-time; URL un-re-mintable | Research |
| Result-URL TTL | **Unchanged (300s)** | Independent, post-success, re-minted on demand | Research |
| Cold-start copy | **Align to ~5 min** | Keep reassurance honest with the new budget | Plan |
| Validation | **Static + deferred live test** | `deno check` + invariant unit test now; live >300s cold-boot test is a flip-ON gate step | Plan |

## Scope

**In scope:** `SOURCE_URL_TTL_SECONDS` 300→3600 (Edge Function); `PROCESSING_WATCHDOG_MS` 180_000→300_000 + export the budgets (client); cold-start copy alignment; an invariant regression test; rationale-comment updates.

**Out of scope:** lazy-signing; keep-warm; `RESULT_URL_TTL` change; F9 (`markJobSucceeded` status-guard); flipping cloud ON / live test now; the source-signing retry budget.

## Architecture / Approach

Two decoupled levers in two small phases. **Server (Phase 1):** raise the source signed-URL TTL in the Deno Edge Function (validated by `deno check` — it's outside the vitest graph). **Client (Phase 2):** raise the processing watchdog, align the cold-start copy, export the budgets, and lock the design invariants (`SLOW_HINT_MS < PROCESSING_WATCHDOG_MS`, `QUEUED_WATCHDOG_MS < PROCESSING_WATCHDOG_MS`) with a vitest unit test.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Edge Function source TTL | `SOURCE_URL_TTL_SECONDS = 3600` + rationale comment | Deno-only — no vitest coverage; rely on `deno check` + review |
| 2. Client watchdog + UX + guard | Watchdog 300s, copy ~5 min, exported budgets + invariant test | Low — module-local constants need exporting; behavior otherwise unchanged |

**Prerequisites:** none for the change itself (S-04 done). Live re-validation needs Replicate creds + a controlled flip-ON (deferred).
**Estimated effort:** ~1 short session (surgical: 2 constants + 1 copy line + 1 small test).

## Open Risks & Assumptions

- Live cold-boot behavior is **unverified until flip-ON** (cloud OFF now); the fix rests on the research's external-doc evidence (Replicate fetches at `predict()`; Supabase TTL uncapped).
- A genuinely stuck job now spins up to 5 min before the retry affordance — accepted UX tradeoff; SLOW_HINT reassures meanwhile.
- The longer source TTL widens the private-source exposure window slightly — mitigated by retention-on-terminal (and S-08).

## Success Criteria (Summary)

- `deno check` green on the Edge Function with the new TTL; `npm run test:unit` (incl. the new invariant test) + lint + build green.
- Cold-start copy reflects the new wait.
- Recorded flip-ON re-validation step: a real >300s cold boot succeeds (no source-fetch 400, no client false-fail) — to be run at flip-ON.
