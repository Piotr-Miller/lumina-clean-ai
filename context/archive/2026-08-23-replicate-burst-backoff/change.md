---
change_id: replicate-burst-backoff
title: Bounded retry for Replicate's 429 burst limit on predictions.create
status: archived
archived_at: 2026-08-23T22:15:00Z
created: 2026-08-23
updated: 2026-08-23
---

## Notes

Closes the roadmap **Parked** item "Replicate burst-limit backoff (S-04)":
`predictions.create` can answer **429** when the per-account burst limit is hit
by rapid resubmits. Without a retry that transient surfaces to the user as a
terminal `start_failed` on a job that would have succeeded a second later.

Explicitly **smoothing, not a cost bound** — S-05's global daily cap remains
the structural spend guard and is untouched by this change.

## What changed

`supabase/functions/enhance/index.ts`:

- `createPredictionWithBurstRetry(token, body)` — wraps the kickoff POST.
  Retries **only** a 429; every other outcome (success, other 4xx, 5xx,
  timeout) returns or throws on the first attempt exactly as before, so the
  blast radius is the one transient it targets. Same narrow-by-construction
  discipline as the existing `signSourceWithRetry` in this file.
- `retryAfterMs(header)` — honours `Retry-After` (delta-seconds or HTTP-date),
  capped at 5s so an upstream header cannot make the function sleep
  unboundedly; falls back to the local backoff when absent or unusable.
- Bounds: 3 attempts total, backoff `[500ms, 1500ms]` → ~2s worst case (~10s
  if Replicate asks for longer), well inside the /start invocation budget and
  pg_net's fire-and-forget window. Each attempt keeps the existing 30s
  `AbortSignal.timeout`.
- A retry logs a `console.warn` naming attempt and wait, so a burst event is
  visible in the function logs rather than silent.

**Replay safety:** a 429 means Replicate accepted nothing and created no
prediction, so no attempt can double-spend or orphan a prediction. (The
existing `unattachedPredictionId` cleanup path is unaffected — it only ever
sees an id from a 2xx response.)

## Verification

- `deno check --config supabase/functions/enhance/deno.json` — clean.
- Root gates green: `npm run typecheck`, `npm run lint` (0 errors),
  `npm run test:unit` (341 passed), `npm run build` → Complete.

**Coverage gap, stated honestly:** the repo has no Deno test harness for the
Edge Function — `deno check` plus the E2E gate is its entire coverage, and the
analogous `signSourceWithRetry` has no unit test either. This ships at that
same level. The E2E Replicate stub never returns 429, so the retry path itself
is unexercised by automated tests; building an edge-function test harness is a
separate change, not smuggled in here.
