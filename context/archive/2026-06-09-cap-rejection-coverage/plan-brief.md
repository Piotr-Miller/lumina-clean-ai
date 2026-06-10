# Risk #3 — Cloud Daily-Cap Route Rejection Coverage — Plan Brief

> Full plan: `context/changes/cap-rejection-coverage/plan.md`
> Research: `context/changes/cap-rejection-coverage/research.md`

## What & Why

Prove the cloud create-job route **rejects an over-cap submission at the route boundary** — HTTP 429,
`daily_cap_reached`, the exact cap message, **before any insert / signed-URL / Replicate work**. This
is PRD FR-014's cost guardrail (`CLOUD_DAILY_CAP=3` live in prod) and Risk #3 of the test plan —
"unbounded Replicate spend." Today it is verified **manually only**, because the route imports
`astro:env/server` and won't load under Vitest.

## Starting Point

`create-job.ts:84` checks `isOverDailyCap(await countCloudJobsToday(admin), CLOUD_DAILY_CAP)` and
returns 429 *before* the `createPhotoJob` insert at `:96`. The cap decision (`isOverDailyCap`, unit)
and the count predicate (`countCloudJobsToday`, integration in `jobs.rls.test.ts`) are already
tested — but **nothing loads the route or asserts the 429 wiring**. The cap is app-level (no DB
trigger enforces it).

## Desired End State

An env-free handler core owns the request→response logic and is exercised by a hermetic Vitest test
that fails if the over-cap 429 contract, the reject-**before**-insert ordering, the route-level
off-by-one, or the `cap=0` kill-switch regress. `create-job.ts` becomes a thin `astro:env/server`
wrapper with identical behavior; `npm run test:unit` covers it with no Docker.

## Key Decisions Made

| Decision                  | Choice                                  | Why (1 sentence)                                                                                              | Source   |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| Load-constraint fix       | Extract env-free handler core (opt. a)  | Converts the manual-only boundary into a real test at the cheapest layer; mirrors the `supabase-admin.ts` precedent. | Research |
| Test layer                | Hermetic (stub admin client)            | The new signal is route wiring; the count predicate is already integration-covered, and the cap isn't DB-enforced so a stub can't lie. | Plan     |
| Assertion set             | Boundary set                            | Catches route-level off-by-one + always-429 bugs + the kill-switch, not just a single over-cap case.         | Plan     |
| Doc-drift fix             | Out of scope (test-only)                | Keep one concern per change; the stale "per-user/20 ops" phrasing is a separate follow-up.                    | Plan     |
| Race / atomicity          | Not asserted                            | The concurrent overrun is a deliberately accepted v1 behavior (archived design), not a bug.                  | Research |

## Scope

**In scope:**
- Extract `createCloudJobResponse({ user, request, admin, cap })` into a new env-free `src/lib/services/` module.
- Reduce `create-job.ts` to a thin env-reading wrapper (identical behavior).
- Hermetic test: over-cap 429 + reject-before-insert; above-cap; last-slot proceeds; `cap=0` kill-switch.
- Cookbook (`test-plan.md §6.4/§6.6`) + `change.md` status.

**Out of scope:**
- Integration/e2e tests for this slice; concurrent-atomicity assertions; cap/contract behavior changes; stale-doc fixes.

## Architecture / Approach

Move the `astro:env/server`-coupled bits (read `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
`CLOUD_DAILY_CAP`, build the admin client, env-presence 500 guard) to a thin route wrapper; move the
auth → parse → zod → sweep → cap → insert sequence into an env-free core returning a `Response`. A
stub admin (count query → controlled `N`; `insert` and `createSignedUploadUrl` as spies) drives the
hermetic test, which asserts both the contract and the **absence** of side-effects on the over-cap path.

## Phases at a Glance

| Phase                         | What it delivers                                      | Key risk                                                           |
| ----------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Extract env-free core      | Thin wrapper + `createCloudJobResponse` (no behavior change) | A subtle behavioral drift during the refactor — guarded by the existing suite + manual route smoke |
| 2. Hermetic boundary tests    | The Risk #3 regression coverage                       | Stub query-builder chain not matching supabase-js call shape      |
| 3. Cookbook + status sync     | `test-plan.md §6` recipe + `change.md` status         | Low — docs only                                                   |

**Prerequisites:** none beyond the working tree (Node Vitest; no Docker needed for the new test).
**Estimated effort:** ~1 session across 3 phases (small refactor + one test file + docs).

## Open Risks & Assumptions

- The stub admin must match the supabase-js builder chain (`.from().select().gte().or()` thenable;
  `.storage.from().createSignedUploadUrl()`); if the call shape drifts the stub may need adjustment.
- Assumes the refactor preserves behavior exactly — Phase 1's manual route smoke is the backstop.

## Success Criteria (Summary)

- An over-cap submit through `createCloudJobResponse` returns 429 with the exact `daily_cap_reached`
  contract and performs **no** insert / signed-URL mint.
- The route-level boundary is pinned: at-cap rejects, `cap-1` proceeds, `cap=0` rejects the first request.
- `create-job.ts` behaves identically post-refactor; full suite + build stay green with no Docker dependency for the new test.
