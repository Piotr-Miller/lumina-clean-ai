---
date: 2026-06-15T14:25:48+0200
researcher: Piotr Miller
git_commit: 74ba28ef76a58fcb1c6900bfbc8676d9f6614943
branch: change/testing-api-authz-gaps
repository: LuminaClean_AI
topic: "API authorization test gaps — Risk #2 (cloud gate-bypass) & Risk #4 (IDOR via client-supplied jobId)"
tags: [research, codebase, api-authz, gate-bypass, idor, testing, phase-2]
status: complete
last_updated: 2026-06-15
last_updated_by: Piotr Miller
---

# Research: API authorization test gaps — Risk #2 (cloud gate-bypass) & Risk #4 (IDOR)

**Date**: 2026-06-15T14:25:48+0200
**Researcher**: Piotr Miller
**Git Commit**: 74ba28e (`74ba28ef76a58fcb1c6900bfbc8676d9f6614943`)
**Branch**: change/testing-api-authz-gaps
**Repository**: LuminaClean_AI

## Research Question

Phase 2 of the frozen test plan (`context/foundation/test-plan.md` §3) — close the two
remaining top-risk coverage gaps:

- **Risk #2** — an anonymous / unauthorized request reaches Cloud AI processing because
  the gate is enforced only in the UI toggle, not in the API.
- **Risk #4** — IDOR: a user reads or advances another user's job by supplying that
  jobId to a route that routes through an id-only service-role helper (bypassing RLS).

Ground exactly where each failure lives in the live code, what coverage already exists,
and the cheapest real-signal layer to close each gap.

## Summary

Both risks are **regression-lock** risks on a live MVP, not open production bugs — the
production code currently behaves correctly for both. The work is to pin that behavior
with the cheapest test that has real teeth, and to lock the invariant against future
drift.

- **Risk #2** — The cloud entry point is a single route, `POST
/api/enhance/cloud/create-job`, backed by an already-extracted **env-free core**
  (`cloud-create-job.handler.ts`). The auth gate is the **first statement** in the core,
  before body parse, cap check, signed-URL mint, and DB insert. The hermetic harness for
  this core already exists (`tests/cloud-create-job.handler.test.ts`) but only exercises
  the **cap (429)** reject-before-insert path — **no case drives `user: null`**. E2E
  (`tests/e2e/seed.spec.ts`) covers the 401 full-stack but expensively. **Gap = one
  hermetic case** asserting `user: null` → 401 `unauthorized` with `insert` and
  `createSignedUploadUrl` spies `not.toHaveBeenCalled()`. **Cheapest layer: hermetic**
  (research overrides the plan's §4 "integration" guess — the env-free core already
  isolates the gate; see "Layer-choice tension" below).

- **Risk #4** — Only **one** user-facing route accepts a client-supplied jobId: `POST
/api/enhance/cloud/timeout`. It correctly routes through the **owner-scoped**
  `markPendingJobFailedForOwner` (`.eq("user_id", userId)` in the same atomic UPDATE,
  `userId` taken from the session, never the body). A foreign jobId no-ops (`flipped:
false`, **HTTP 200** — not 403/404) and never touches the victim's row. The id-only
  helpers (`getJobById`, `markJobProcessing`, `markJobFailed`, `markJobSucceeded`) are
  called **only** from the trusted Edge Function (`supabase/functions/enhance`), which
  authenticates by webhook bearer secret — acceptable. Coverage exists at the **helper
  level** (`photo-job-helpers.test.ts`, mocked) and the **RLS level**
  (`jobs.rls.test.ts`, user-scoped client) — but **neither exercises the route boundary**.
  **Gap = a route-boundary test** where user B submits user A's jobId to `timeout` and
  A's row is provably unmutated. **Cheapest layer: integration** (the §4-prescribed layer;
  proves the owner filter has teeth against a real row).

## Detailed Findings

### Risk #2 — Cloud gate-bypass

**Entry point (the only one).** `src/pages/api/enhance/cloud/create-job.ts` — the single
route that mints a signed upload URL + inserts the `queued` job row. `prerender = false`
(`create-job.ts:6`), `POST` export (`create-job.ts:17`). The async pipeline's `/start`
lives in the Edge Function driven by a DB webhook, **not** an API route; the browser PUTs
bytes directly to the signed URL. Sibling `src/pages/api/enhance/cloud/timeout.ts` is a
watchdog backstop (auth-gated identically at `timeout.ts:34-37`), not a job creator.

**Session resolution.** Route reads `context.locals.user` (`create-job.ts:27`), populated
by middleware `supabase.auth.getUser()` (`src/middleware.ts:19-26`). The authoritative
`userId` is taken from the session, never the body (`cloud-create-job.handler.ts:119`,
`userId: user.id`).

**Auth-gate ordering (gate is first).** In `src/lib/services/cloud-create-job.handler.ts`:

- `cloud-create-job.handler.ts:63-65` — `if (!user) return json({ error: { code:
"unauthorized", ... } }, 401)` — first statement.
- Body parse / zod: `:69-82`. Sweep: `:92`. **Cap reject-before-insert (429)**: `:106-116`.
- **Side-effects only at** `:118` `createPhotoJob(...)`, which internally does
  `createSignedUploadUrl` (`photo-job.service.ts:80`) **then** `insert` into `jobs`
  (`photo-job.service.ts:85`).
- Chain: **auth(401) → parse(400) → zod(400) → sweep → cap(429) → signed-URL → insert.**
  No storage/model work is reachable for an anonymous caller. (An env-presence 500 guard
  runs in the wrapper at `create-job.ts:18-22` before the core — documented divergence at
  handler `:22-29`.)

**Env-free core exists.** `createCloudJobResponse(input: CreateCloudJobInput):
Promise<Response>` (`cloud-create-job.handler.ts:60`). `CreateCloudJobInput` (`:40-49`) =
`{ user: { id: string } | null; request: Request; admin: SupabaseClient; cap: number }`.
Imports no `astro:env/server` (Lesson #4). Thin wrapper `create-job.ts` reads env (`:2`),
builds the admin client (`createAdminClient`, `:24`), delegates (`:26-31`).

**Middleware vs self-guarding.** `PROTECTED_ROUTES = ["/dashboard"]` (`middleware.ts:4`) —
the API route is **not** listed, so middleware does not block it; it only populates
`locals.user`. The route is **self-guarding** at the API boundary
(`cloud-create-job.handler.ts:63-65`) — the correct posture.

**Existing coverage + the gap.**

- E2E: `tests/e2e/seed.spec.ts:57` (`Risk #2: anon request must not reach Cloud AI
processing`) starts signed-out, POSTs a valid body to the route, asserts `401` +
  `error.code === "unauthorized"` (`:108-113`). Full-stack, slow, needs the live stack.
- Hermetic: `tests/cloud-create-job.handler.test.ts` drives the core with stub admin +
  `insert`/`createSignedUploadUrl` spies — but **every case passes `user: USER`** (`:77`,
  used `:84/:102/:113/:130`). Asserts reject-before-insert only for the **cap (429)** path
  (`:94-95`, `:105-106`, `:135-136`).
- **GAP:** no hermetic case asserts `user: null` → **401 `unauthorized` before any
  side-effect** (both spies `not.toHaveBeenCalled()`). The only proof of the API auth gate
  today is the expensive E2E.

### Risk #4 — IDOR via client-supplied jobId

**Service helpers** (`src/lib/services/photo-job.service.ts`; all take the service-role
`admin` client → **bypass RLS**):

| Helper                          | id-only / owner-scoped               | Filter (file:line)                                                       |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `getJobById`                    | **id-only** (read)                   | `.eq("id", jobId)` — `:195`                                              |
| `markJobProcessing`             | **id-only**                          | `.eq("id", cmd.jobId)` — `:219`                                          |
| `markJobSucceeded`              | id-only, status-guarded              | `.eq("id", …).eq("status","processing")` — `:171-172`                    |
| `markJobFailed`                 | id-only, status-guarded              | `.eq("id", …).in("status",[…])` — `:244-245`                             |
| `markPendingJobFailedForOwner`  | **owner-scoped**                     | `.eq("id", …).eq("user_id", cmd.userId).in("status",[…])` — `:285-287`   |
| `sweepStalePendingJobsForOwner` | **owner-scoped**                     | both select+flip carry `.eq("user_id", userId)` — `:333-337`, `:364-366` |
| `sweepAbandonedSourcesGlobally` | cross-user by design (cron reaper)   | no `user_id` — `:457-458`                                                |
| `createPhotoJob`                | N/A insert; `user_id` server-derived | `:85-90`                                                                 |
| `countCloudJobsToday`           | N/A global count (intentional)       | `:124-128`                                                               |

**jobId-accepting routes → helper called:**

| Route                                            | jobId source                                                             | Helper (file:line)                                                              | Safe?                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/enhance/cloud/timeout` (`timeout.ts`) | **body** `{ jobId: z.uuid() }` (`:18`)                                   | `markPendingJobFailedForOwner(admin, { jobId, userId: user.id, … })` (`:61-69`) | **SAFE** — `userId` from session (`:34`), owner filter in the same UPDATE; foreign jobId → `flipped:false`, **200**, no mutation |
| `POST /api/enhance/cloud/create-job`             | no jobId (server mints `crypto.randomUUID()`, `photo-job.service.ts:77`) | `createPhotoJob` / `sweepStalePendingJobsForOwner`                              | **SAFE** (not jobId-accepting)                                                                                                   |

Other API routes are `src/pages/api/auth/{signin,signup,signout,update-password,reset-password}.ts`
— none touch jobs.

**Trusted vs user-facing boundary.** The id-only helpers are called **only** from
`supabase/functions/enhance/index.ts` — `/start` + `/callback`, authenticated by a webhook
bearer secret (`digestEquals`, `index.ts:180`): `getJobById` (`:204`, `:383`),
`markJobProcessing` (`:266`), `markJobFailed` (`:274`, `:413`, `:473`), `markJobSucceeded`
(`:456`). Machine-to-machine, no end-user session — id-only is by design there.

**Frontend reads don't use an API route.** `src/components/hooks/useCloudJob.ts:203-208`
reads `jobs` via the **user-scoped** client (`.eq("id", jobId)`), protected by RLS
`jobs_select_own` — cross-user read blocked by RLS at the client layer, not a service-role
path.

**Existing coverage + the gap.**

- Helper level (mocked): `tests/photo-job-helpers.test.ts` pins filters —
  `markPendingJobFailedForOwner` carries `["user_id","u-1"]` (`:216`); id-only helpers
  carry only `["id", …]` (`:81/:100/:134/:167`). No real RLS, no route.
- RLS level (user-scoped client): `tests/jobs.rls.test.ts:64-85` — "user A cannot SELECT
  user B's rows". This is exactly the layer §2's anti-pattern warns is insufficient for
  #4 (proves RLS, not the service-role route path).
- **GAP:** no test where authenticated **user B POSTs user A's jobId to a route** and is
  rejected/no-op'd with A's row provably unmutated. `jobs.rls.test.ts` never invokes route
  handlers; `cloud-create-job.handler.test.ts` covers create-job (no jobId). Confirmed
  open by `test-plan.md:91` (#4 → this change) and `:246` (IDOR endpoint pattern "TBD").

## Layer-choice tension (research is ground truth — §1 principle #3)

The plan's §2 Risk Response "Likely cheapest layer" column guesses **integration** for
both #2 and #4. Research refines this:

- **Risk #2 → hermetic, not integration.** The env-free core already isolates the auth
  gate (`cloud-create-job.handler.ts:63-65`); the new signal is **route wiring** (the gate
  precedes side-effects), not a DB constraint. The existing hermetic harness with
  `insert`/`createSignedUploadUrl` spies is the cheapest test with real teeth and exactly
  mirrors the already-shipped cap-path proof (Risk #3 precedent, §6.6 note 2026-06-10).
  Per §6.4: hermetic is right when the signal is route wiring and the predicate isn't a
  real DB constraint — auth resolution happens in middleware/handler, not in SQL. The
  full-stack 401 is already E2E-covered (`seed.spec.ts`), so integration would be
  redundant.

- **Risk #4 → integration, as the plan prescribes.** `timeout.ts`'s safety is an
  owner-scoped `.eq("user_id", …)` UPDATE through the **service-role** client (RLS is
  bypassed), so the route boundary's teeth can only be proven against a **real row**:
  user B's call must leave user A's row genuinely unmutated. Helper-in-isolation is
  already covered (`photo-job-helpers.test.ts`) — the §4 anti-pattern explicitly warns
  against stopping there. **Assertion nuance:** the route returns **200 `{flipped:false}`**
  on a foreign/non-matching jobId, NOT 403/404 — so assert "no mutation of A's row" + the
  no-op response shape, not an HTTP rejection code. (The plan's "→ 403/404" phrasing in §2
  is a guess; the live route's contract is a silent no-op.)

## Code References

- `src/pages/api/enhance/cloud/create-job.ts:6,17,18-22,24,26-31` — Risk #2 thin route wrapper (env, admin client, delegate).
- `src/lib/services/cloud-create-job.handler.ts:40-49,60,63-65,106-116,118-119` — env-free core; auth gate first; cap reject-before-insert; side-effect call.
- `src/lib/services/photo-job.service.ts:77,80,85-90,171-172,195,219,244-245,285-287,333-337,364-366,457-458` — job helpers (id-only vs owner-scoped) + signed-URL/insert side-effects.
- `src/pages/api/enhance/cloud/timeout.ts:18,33,34-37,61-69` — only user-facing jobId-accepting route; owner-scoped call.
- `src/middleware.ts:4,17,19-26` — `PROTECTED_ROUTES`, session resolution.
- `src/components/hooks/useCloudJob.ts:200-208` — user-scoped (RLS) job read, not an API route.
- `supabase/functions/enhance/index.ts:180,204,266,274,383,413,456,473` — trusted Edge Function calling id-only helpers behind a webhook bearer secret.
- `tests/cloud-create-job.handler.test.ts:54-75,77,80-96,109-124,126-137` — hermetic stub-admin harness + cap-path assertions (the harness to extend for #2).
- `tests/jobs.rls.test.ts:64-85,340-456` — RLS cross-user isolation + retention reaper integration (the integration harness to extend for #4).
- `tests/photo-job-helpers.test.ts:81,100,134,167,216` — helper-level filter pins (already covered; do not stop here for #4).
- `tests/e2e/seed.spec.ts:57,108-113` — E2E Risk #2 anon-401 (expensive; hermetic gap remains).
- `tests/env.ts:1-24`, `tests/helpers/test-users.ts:19-54` — integration env vars + user-scoped/admin client construction.

## Architecture Insights

- **Env-free-core + thin-wrapper** is the established pattern for hermetic route tests
  here (`cloud-create-job.handler.ts` ← `create-job.ts`). Risk #2 needs **no new core** —
  the gate is already in the core; only a `user: null` test case is missing.
- **Authorization is enforced in the write, not RLS, on the service-role path.** Every
  helper takes the RLS-bypassing admin client; ownership safety is an explicit
  `.eq("user_id", …)` predicate in the same atomic UPDATE (`markPendingJobFailedForOwner`).
  This is the live encoding of the lessons.md rule "client-supplied jobId must route
  through owner-scoped mutations."
- **Two distinct authorization boundaries:** (1) user-facing API routes
  (`src/pages/api/**`) — session-resolved, owner-scoped/self-guarding; (2) the trusted
  Edge Function (`supabase/functions/enhance`) — webhook-bearer-authenticated, id-only by
  design. The IDOR risk is precisely a future route crossing that boundary by calling an
  id-only helper with a client jobId.
- **`countCloudJobsToday` is intentionally global/cross-user** (the daily cap is global) —
  not an IDOR. Don't "fix" its missing `user_id` filter.

## Historical Context (from prior changes)

- **Risk #3 (cloud daily cap)** — `context/archive/2026-06-03-cloud-daily-cap/`. Chose
  **hermetic** (stub admin) because the cap is app-level, not DB-enforced; load-bearing
  assertion was `insert.not.toHaveBeenCalled()` on over-cap, proven to have teeth by a
  one-off reorder mutation. Reference test `tests/cloud-create-job.handler.test.ts`. See
  `test-plan.md` §6.6 note 2026-06-10. **Direct precedent for the Risk #2 hermetic case.**
- **Risk #5 (failure/abandon source deletion)** — `context/archive/2026-06-14-retention-reaper/`
  (has `research.md`, `plan.md`). Chose **integration** (real Supabase storage) — a real
  delete against a real bucket is the whole signal. Coverage in
  `tests/jobs.rls.test.ts:340-456` (`sweepAbandonedSourcesGlobally`): old source deleted,
  fresh spared, stale non-terminal flips to `failed('abandoned')` while a fresh in-flight
  job is SPARED (don't-reap-live-jobs invariant, added after a survived mutant). Prompted
  by a live prod breach (two sources lingered ~7.7 days). **Direct precedent for the Risk
  #4 integration harness.**

## Related Research

- `context/foundation/test-plan.md` §2 (Risk Map + Risk Response rows #2/#4), §3 Phase 2,
  §6.4 (endpoint layer-choice), §6.6 (phase notes for #3 and #5).
- `context/foundation/lessons.md` — "Client-supplied jobId must route through owner-scoped
  mutations" (the #4 invariant); "Server-only service-role clients live in their own
  module" (Lesson #4, why the env-free core exists).
- `context/archive/2026-06-03-cloud-daily-cap/research.md`, `context/archive/2026-06-14-retention-reaper/research.md`.

## Open Questions

1. **Test config wiring for #4.** A new route-level integration test that imports
   `timeout.ts` would pull `astro:env/server` (Lesson #4 load failure). Does the plan
   extract a `timeout.handler.ts` env-free core (mirroring create-job), or drive the
   owner-scoped helper through a real two-user DB setup in `jobs.rls.test.ts` without
   importing the route? The §4 anti-pattern forbids "helper in isolation" — the chosen
   shape must still exercise the **route's wiring** (session `user.id` → helper), so a
   `timeout.handler.ts` core driven against a real Supabase (or a hermetic core test
   asserting the wiring + a thin integration row check) is the likely answer. **Decide in
   `/10x-plan`.**
2. **Assertion contract for #4.** Confirm the no-op-on-foreign-jobId response is the
   intended contract (200 `{flipped:false}`) vs. a deliberate 403/404 — the test should
   assert the live contract + no mutation, and a one-off reorder/owner-filter-removal
   mutation should prove the guard has teeth (mirror the #3 reorder-to-red proof).
3. **Mutation-testing scope.** `photo-job.service.ts` is a §4 risk module — confirm a
   scoped `stryker run --mutate src/lib/services/photo-job.service.ts` (and/or
   `cloud-create-job.handler.ts`) is part of the success criteria per CLAUDE.md "Mutation
   testing."
