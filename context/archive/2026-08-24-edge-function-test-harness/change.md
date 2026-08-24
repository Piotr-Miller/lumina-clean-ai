---
change_id: edge-function-test-harness
title: "Deno test harness for the enhance Edge Function"
status: archived
archived_at: 2026-08-24T09:20:00Z
created: 2026-08-24
updated: 2026-08-24
---

## Notes

Closes the coverage gap recorded — deliberately, rather than papered over —
when the Replicate 429 burst-limit backoff shipped (PR #168, change
`replicate-burst-backoff`).

`supabase/functions/**` is excluded from the Astro tsc/eslint/Vitest graphs, so
the Edge Function's entire coverage was `deno check` plus a stubbed E2E. The
E2E Replicate stub never returns 429, so the retry shipped with its behaviour
**unexercised** — as did the neighbouring `signSourceWithRetry`. This file
holds the cloud pipeline's most consequential logic (retention deletes, cancel,
prediction kickoff), which is a poor place for zero behavioural tests.

## The obstacle, and the shape it forced

`index.ts` cannot be imported by a test: it runs `Sentry.init()` and
`Deno.serve()` at module top level and **exports nothing**. Importing it would
boot a server and an SDK, not exercise a function.

So the harness uses the pattern this repo already proved for the app
(`reset-password.handler.ts`): extract the logic into a side-effect-free
sibling module that both `index.ts` and the test import.

## What changed

- **`supabase/functions/enhance/replicate-create.ts`** (new): the burst-retry
  and its constants, moved verbatim in behaviour. `fetch`, `sleep` and `warn`
  are injectable — without that, testing a retry means real network calls and
  really waiting out the backoff. Production passes none of them and gets the
  globals. `retryAfterMs` also takes an injectable `now`, so the HTTP-date
  branch is testable without wall-clock flake.
- **`index.ts`**: imports both `createPredictionWithBurstRetry` and
  `REPLICATE_PREDICTIONS_URL` (the cancel path uses the URL too — `deno check`
  caught that, which is precisely the argument for checking the whole
  directory). Local copies deleted; the per-attempt timeout is now passed in.
- **`supabase/functions/enhance/replicate-create.test.ts`** (new): 12 tests —
  the repo's first `deno test` suite.
- **CI (`ci` job)**: `deno check` widened from `index.ts` to the whole
  directory, and a new `deno test` step over the same directory. Hermetic (no
  network, no secrets, no real waiting) so it stays fork-PR-safe and fast.
- **`AGENTS.md`**: documents the command and — load-bearing for the next agent
  — that `index.ts` is not importable, so testable logic must be extracted.

## What the tests actually pin

Retry POLICY, not Replicate's behaviour: one call on success with no sleep;
a 429 retried and the succeeding response returned; **non-429 failures (400,
401, 402, 422, 500, 502, 503) never retried** — the blast-radius guarantee,
since a retried 500 could double-charge a request Replicate may have acted on;
bounded attempts on a persistent 429; `Retry-After` honoured and capped;
the body left unread so the caller can still build its error detail; a
**distinct timeout signal per attempt** (a shared one would let the first
attempt's clock bound the retry); and the `retryAfterMs` edge cases
(absent/empty/unparseable/zero/negative/past-date/cap).

## Verification

- `deno test` — **12 passed, 0 failed**; `deno check` clean over the whole
  directory (both in the exact directory form CI runs).
- App gates unaffected: `npm run typecheck` clean, `npm run lint` 0 errors,
  `npm run test:unit` 341 passed.

## Scope guard

Only the burst-retry was extracted — the logic whose missing coverage motivated
this change. `signSourceWithRetry`, the Sentry scrub, and the `/callback`
handlers remain untested; extracting them is now a small, mechanical follow-up
because the harness exists, but bundling a broad refactor of a live Edge
Function into the change that introduces its first test would risk exactly the
production surface this is meant to protect.
