---
date: 2026-06-09T23:45:00+02:00
researcher: Claude (Opus 4.8)
git_commit: 0839849a75e8e37efcdfa6a605ed2d46b49608cd
branch: master
repository: Piotr-Miller/lumina-clean-ai
topic: "Risk #3 — global cloud daily-cap rejection: oracle grounding for the over-cap test"
tags: [research, codebase, daily-cap, FR-014, rate-limit, create-job, photo-job-service, risk-3]
status: complete
last_updated: 2026-06-09
last_updated_by: Claude (Opus 4.8)
---

# Research: Risk #3 — global cloud daily-cap rejection (oracle grounding)

**Date**: 2026-06-09T23:45:00+02:00
**Researcher**: Claude (Opus 4.8)
**Git Commit**: 0839849a75e8e37efcdfa6a605ed2d46b49608cd
**Branch**: master
**Repository**: Piotr-Miller/lumina-clean-ai

## Research Question

Ground the oracle for Risk #3 (test-plan.md:53, High): *"The global daily cap fails to reject the
over-cap job (off-by-one, race, or wrong row scope) → unbounded Replicate spend."* Surfaced by
Stryker (zero coverage on `countCloudJobsToday` and `createPhotoJob`). Establish from sources — not
from the implementation — **which rows count**, the **time scope**, **global vs per-user**, and the
**route-boundary rejection contract**, so the test asserts behaviour (route rejects over-cap) and
not a mirror of the count helper.

## Summary

The oracle is **fully resolved from sources** (PRD FR-014 + the archived S-05 design). No
ambiguity remains on *expected behaviour*:

- **Scope: global, cross-user.** PRD FR-014 is explicit ("global daily cap"); per-user is v2.
  The code's cross-user count (service-role, no `user_id` filter) is **correct**.
- **Time: the current UTC calendar day.** `created_at >= UTC-midnight-of-now`. The "resets at
  00:00 UTC" is the implicit query boundary, **not** a scheduled job (no pg_cron exists).
- **Which rows count (billable):** everything **except** a pre-model failure —
  excluded **only** when `status = 'failed' AND replicate_prediction_id IS NULL`. De Morgan form
  in code: `status <> 'failed' OR replicate_prediction_id IS NOT NULL`. Schema-validated.
- **Off-by-one:** `count >= cap`. `cap = N` allows exactly N jobs/day and rejects the (N+1)th;
  `cap = 0` is an operator kill-switch (rejects the first). Default 50; **prod is 3**.
- **Rejection contract:** the route rejects the over-cap submission **before any insert / storage /
  Replicate work** with **HTTP 429**, `error.code = "daily_cap_reached"`, message
  *"The daily Cloud AI limit has been reached. Please try again tomorrow."*

**Two findings change the test's shape vs. the naive read:**

1. **The concurrent-insert RACE is OUT of scope** — it is a *deliberately accepted* overrun at v1
   scale (archived plan), not a bug. The test must assert the **deterministic boundary** (cap
   reached → reject) and **row-scope correctness**, **not** strict concurrent atomicity. Asserting
   strict atomicity would contradict the locked design.
2. **The "mirror" pieces are already covered.** `isOverDailyCap` (unit) and the `countCloudJobsToday`
   row/date predicate (integration) already have tests. The **only** real new signal is the
   **route-level over-cap rejection** (429 + message + no side-effect row) — which today is verified
   **manually only**, because the route imports `astro:env/server` and cannot load under Vitest
   (Lesson #4). **That loading constraint is the central open question for `/10x-plan`.**

## Detailed Findings

### The route rejection boundary — `create-job.ts`

The handler is the `POST` export ([create-job.ts:31–107](https://github.com/Piotr-Miller/lumina-clean-ai/blob/0839849a75e8e37efcdfa6a605ed2d46b49608cd/src/pages/api/enhance/cloud/create-job.ts#L31-L107)). Exact order, request → response:

1. **Auth** — `create-job.ts:32–35`: reads `context.locals.user` (resolved by `src/middleware.ts:16–26`); `!user` → **401** `{ error: { code: "unauthorized", message: "Sign in to use Cloud AI." } }`. First thing in the handler.
2. **Body parse** — `create-job.ts:39–44`: non-JSON → 400 `invalid_body`.
3. **Zod validation** — `create-job.ts:46–52`: `createPhotoJobRequestSchema.safeParse`; failure → 400 `invalid_body`.
4. **Env presence** — `create-job.ts:54–58`: missing `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` → 500 `internal_error`.
5. **Admin client** — `create-job.ts:60–61`.
6. **`sweepStalePendingJobsForOwner(admin, user.id)`** — `create-job.ts:69–77` (own try/catch, non-fatal). Runs **before** the count — it can release abandoned pre-model slots, making the tally *more* accurate.
7. **Cap count + decision** — `create-job.ts:84`: `if (isOverDailyCap(await countCloudJobsToday(admin), CLOUD_DAILY_CAP)) {`
8. **Over-cap reject** — `create-job.ts:85–93`: **429** (see contract below).
9. **`createPhotoJob` insert** — `create-job.ts:96–100`: only if not over cap.
10. **Success** — `create-job.ts:101`: **200**, body `CreatePhotoJobResponse` `{ jobId, uploadUrl, uploadToken, sourcePath }` (`src/types.ts:52–57`).

**Cap check precedes the insert and all model work** — route comment at `create-job.ts:79–83` ("reject before any signed URL / storage / Replicate work"). No re-check, transaction, or lock between the count (line 84) and the insert (line 96).

### The over-cap rejection contract (assert this verbatim)

`create-job.ts:84–94`:
- HTTP **429**
- `error.code` = **`daily_cap_reached`**
- `error.message` = **`"The daily Cloud AI limit has been reached. Please try again tomorrow."`**
- Body envelope `{ error: { code, message } }`; **no `status` field** in the body (per CLAUDE.md).

> ⚠️ **Intentional 429.** CLAUDE.md's generic rule says "400 for validation, 500 for unexpected"; the cap path is a documented **429** exception (`astro.config.mjs:26–27`, route comment `create-job.ts:79–94`). Pin the test to 429, not 400.

### CLOUD_DAILY_CAP & the off-by-one

- Read from `astro:env/server` (`create-job.ts:2`), declared at [astro.config.mjs:28](https://github.com/Piotr-Miller/lumina-clean-ai/blob/0839849a75e8e37efcdfa6a605ed2d46b49608cd/astro.config.mjs#L28): `envField.number({ context: "server", access: "secret", default: 50 })` → **default 50**; **prod = 3** (MEMORY / test-plan.md:31).
- `isOverDailyCap(count, cap) => count >= cap` (`photo-job.service.ts:135–137`). `cap=0 → 0>=0 → reject first` (kill-switch). `cap-1` is the last allowed slot. Off-by-one rationale documented in the archived plan: `context/archive/2026-06-03-cloud-daily-cap/plan.md:57,107`.

### The count helper — predicate matches the schema

[`countCloudJobsToday`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/0839849a75e8e37efcdfa6a605ed2d46b49608cd/src/lib/services/photo-job.service.ts#L113-L127) (`photo-job.service.ts:113–127`):
```
.select("id", { count: "exact", head: true })
.gte("created_at", utcDayStartIso)
.or("status.neq.failed,replicate_prediction_id.not.is.null")
```
Validated against `supabase/migrations/20260528120000_create_jobs_table.sql`:
- `status` is enum `public.photo_job_status` with exactly `queued | processing | succeeded | failed` (migration `:19–24`). So `status.neq.failed` excludes only `failed`.
- `replicate_prediction_id text` **nullable** (`:36`); stamped by `markJobProcessing` (`photo-job.service.ts:206–217`) and never cleared on failure (`markJobFailed:229–252`) — so a `failed`-with-id row stays counted (it reached Replicate, it cost money).
- `created_at timestamptz NOT NULL DEFAULT now()` (`:39`). `timestamptz` is an absolute UTC instant; comparing it to `Date.UTC(...).toISOString()` is timezone-independent → the UTC-day boundary is correct.
- Global scope requires the **service-role** client: RLS `jobs_select_own` (`:84–95`) scopes authenticated reads to `user_id = auth.uid()`; a user-JWT client would silently under-count. The helper's `admin` param enforces this.

### No SQL-level cap enforcement → the race is app-only (and accepted)

There is **no** DB-side cap guard — no trigger, RPC, CHECK, or counting policy (exhaustive grep of `supabase/migrations/`). The only triggers are `jobs_set_updated_at` and `jobs_enqueue_webhook` (neither counts/blocks). The cap is a **non-atomic check-then-insert in app code**, so a concurrent-insert overrun is structurally possible — and was **explicitly accepted**:

- `context/archive/2026-06-03-cloud-daily-cap/change.md:21` — *"TOCTOU overrun bounded by concurrency, accepted at v1 scale; provider billing alert is the backstop."*
- `…/plan.md:33–34` — *"No advisory locks, no transactional count-and-insert… accepted at v1 scale."*

**Implication for the test:** assert the deterministic boundary and row-scope, **not** strict concurrent atomicity.

### Existing coverage — what NOT to duplicate

| File:line | Asserts | Layer |
| --- | --- | --- |
| `tests/photo-job.service.test.ts:10–26` | `isOverDailyCap`: `(0,0)→true`, `(49,50)→false`, `(50,50)→true`, `(51,50)→true` | unit (the decision) |
| `tests/jobs.rls.test.ts:268–332` | `countCloudJobsToday`: status×prediction_id matrix + yesterday row → billable delta `=4`; pre-model-failures only → delta `0` | integration (the predicate) |
| `tests/cloud-create-job-schema.test.ts:4–39` | `createPhotoJobRequestSchema` only (jpg/png accept, HEIC/mime-mismatch reject) | unit (schema) |
| `tests/cloud-upload.client.test.ts` | client maps a 429 `daily_cap_reached` body → user copy | unit (client mapping) |

**No test loads `create-job.ts` or asserts the 429 rejection at the route.** That is the gap. The decision + predicate tests above are exactly the "implementation mirror" pieces the plan warns not to re-assert.

## Code References

- `src/pages/api/enhance/cloud/create-job.ts:31–107` — handler; cap guard at `:84–94`, insert at `:96`.
- `src/lib/services/photo-job.service.ts:113–127` — `countCloudJobsToday` (count predicate).
- `src/lib/services/photo-job.service.ts:135–137` — `isOverDailyCap` (`count >= cap`).
- `src/lib/services/photo-job.service.ts:67–95` — `createPhotoJob` (the insert; `status: "queued"`).
- `astro.config.mjs:26–28` — `CLOUD_DAILY_CAP` declaration + default 50 + 429/kill-switch docs.
- `supabase/migrations/20260528120000_create_jobs_table.sql:19–24,30–42,84–95` — enum, DDL, RLS.
- `context/foundation/prd.md:43,62,129–130,158,173` — FR-014 + guardrail + global-only/v2 deferral.
- `context/foundation/test-plan.md:53,77` — Risk #3 row + Risk Response Guidance.

## Architecture Insights

- **The cap is a soft, app-level guardrail, not a hard invariant.** Determinism holds for the
  single-request boundary (the only thing a test should pin); strict global atomicity is explicitly
  not provided and is backstopped by the provider billing alert.
- **The count's correctness rests on lifecycle invariants elsewhere:** `replicate_prediction_id`
  must be stamped on `processing` and never cleared on `failed`. A regression in `markJobProcessing`
  / `markJobFailed` would silently corrupt the cap tally — worth noting as an adjacent risk, though
  the predicate's row matrix is already covered by `jobs.rls.test.ts`.
- **`sweepStalePendingJobsForOwner` runs before the count by design** — it releases pre-model
  abandoned slots so the tally doesn't over-count browser-closed stalls.

## Historical Context (from prior changes)

- `context/archive/2026-06-03-cloud-daily-cap/` (S-05, change_id `cloud-daily-cap`, archived
  2026-06-04) — the cap's origin. `change.md:17` resolves global-vs-per-user: *"Global cap, not
  per-user… The '20 ops/user/24h' phrasing in idea-notes.md, CLAUDE.md, and the F-01 migration index
  comment is **stale** vs the PRD."* `plan.md:157,175` records the Lesson #4 obstacle: *"create-job.ts
  imports astro:env/server, so it can't be loaded in Vitest"* — the route's 429 wiring was verified
  **manually** (`plan.md:230–232`).
- `context/changes/testing-ci-gate/` (Phase 1, complete) — wired the existing suite (incl. the
  `jobs.rls` integration tests that cover the count predicate) into CI.

## Related Research

- `context/foundation/test-plan.md` §2 (Risk Map) / §3 (Phased Rollout, Phase 2) — this change is the
  Risk #3 slice of Phase 2.
- Lessons: `context/foundation/lessons.md` — "Server-only service-role clients live in their own
  module, not next to `astro:env/server` importers" (the root of the route-loading constraint) and
  "Client-supplied jobId must route through owner-scoped mutations" (adjacent Risk #4).

## Open Questions

1. **(BLOCKING for `/10x-plan`) How to exercise the route's 429 under test, given `create-job.ts`
   imports `astro:env/server` and cannot load in Vitest (Lesson #4)?** Options to weigh in the plan:
   - **(a) Extract an env-free handler core** that takes `cap` (and the admin client) as parameters —
     unit/integration-testable in Vitest against real local Supabase; the thin `astro:env/server`
     wrapper stays manually verified. Mirrors the existing "pass env in as a parameter" lesson and
     the already-env-free `isOverDailyCap`. Cheapest real signal; small refactor.
   - **(b) Drive the built route over HTTP** (`astro build` + `wrangler dev`, or Astro's test
     adapter) and assert 429 — true end-to-end but heavier; overlaps test-plan Phase 4 (e2e).
   - **(c) Leave the route manual** and integration-test only the seam — risks staying a mirror test
     (what the plan explicitly warns against).
   Recommendation to carry into planning: **(a)** — it converts the manual-only boundary into a real
   regression test at the cheapest layer without an e2e harness. Needs a one-line confirmation that a
   small refactor of `create-job.ts` is acceptable.
2. **Doc hygiene (non-blocking):** `CLAUDE.md` ("20 ops/user/24h"), `idea-notes.md:15` (per-user
   phrasing / "50/day"), and the migration index comment (`20260528120000:49–50`, per-user
   `WHERE user_id`) are **stale** vs PRD FR-014's global cap. Confirmed stale by
   `archive/2026-06-03-cloud-daily-cap/change.md:17`. Worth a follow-up doc fix so future agents
   aren't misled (out of scope for this test change).
