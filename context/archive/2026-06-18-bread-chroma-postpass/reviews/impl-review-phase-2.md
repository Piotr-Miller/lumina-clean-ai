<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bread chroma-denoise post-pass + pinned version resolution

- **Plan**: `context/changes/bread-chroma-postpass/plan.md`
- **Scope**: Phase 2 of 5
- **Date**: 2026-06-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Verification

- `npm run test:unit` — PASS, 17 files and 180 tests
- Full `npm test` with local Supabase — PASS, 18 files and 194 tests, including 14 RLS integration tests
- `npm run typecheck` — PASS
- `deno check --config supabase/functions/enhance/deno.json supabase/functions/enhance/index.ts` — PASS
- `npx supabase db reset` — PASS
- Scoped mutation testing on `src/lib/services/photo-job.service.ts:230-241` — PASS, all 8 targeted mutants killed
- Manual processing pin check — PASS; the configured Bread version was stored
- Manual terminal transition check — PASS; `model_version` survived the success transition
- Manual legacy-row check — PASS; an existing-style row retained `model_version = null`
- Authenticated insert probe — an authenticated user could insert and read back an arbitrary `model_version`
- Triage verification after F1/F2 — PASS: 183 unit tests, 16 RLS integration tests, TypeScript typecheck, Deno check, scoped ESLint, and Prettier
- F2 scoped mutation testing on `src/lib/services/photo-job.service.ts:230-279` — PASS, all 10 targeted mutants killed
- F3 focused helper test — PASS, 33 tests; Prettier and `git diff --check` PASS

## Findings

### F1 — Audit `model_version` is forgeable through authenticated INSERT

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260621120000_add_model_version_to_jobs.sql:14`
- **Detail**: The migration describes `model_version` as service-role-written audit telemetry, but it inherits the existing `authenticated` table-wide INSERT grant and owner-only INSERT policy from `20260528120000_create_jobs_table.sql:93-117`. An authenticated user can therefore supply any `model_version` while creating their own row and read it back. This was reproduced against the local database with `authenticated_forgery_accepted=true`, so the field is not trustworthy as server-owned audit data.
- **Fix A ⭐ Recommended**: Add a migration that revokes direct `authenticated` INSERT access to `public.jobs` and removes the corresponding INSERT policy; keep job creation behind the existing server/service-role path.
  - **Strength**: Makes all job and audit fields server-owned and also closes the direct database enqueue path; repository call-site search found application job creation using the service-role-backed route.
  - **Tradeoff**: Changes the original F-01 database contract and can break external clients that insert jobs directly.
  - **Confidence**: HIGH — the grant, policy, application path, and exploit were verified locally.
  - **Blind spot**: External consumers outside this repository have not been inventoried.
- **Fix B**: Preserve direct authenticated creation but replace the table-wide INSERT grant with explicit column-level grants that exclude server-owned fields, including `model_version`, status, provider IDs, result/error fields, and completion timestamps.
  - **Strength**: Retains the original direct-insert capability while preventing clients from supplying audit and lifecycle state.
  - **Tradeoff**: Requires careful grant maintenance whenever columns are added and verification of the resulting PostgREST behavior.
  - **Confidence**: MEDIUM — PostgreSQL supports the control, but this exact column set and client behavior have not been exercised in the project.
  - **Blind spot**: Other server-owned fields may need to be included after a complete table-contract audit.
- **Decision**: FIXED — applied Fix A via migration `20260621185226_restrict_jobs_insert_to_service_role.sql`; authenticated INSERT is revoked, the INSERT policy is removed, and the RLS integration suite passes with 15 tests.

### F2 — Written-once provenance is not enforced

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: `src/lib/services/photo-job.service.ts:230`
- **Detail**: `markJobProcessing` documents `model_version` as written once, but its UPDATE is guarded only by job ID. A replayed or concurrent `/start` call can overwrite both `model_version` and `replicate_prediction_id`. The Edge Function currently creates the external Replicate prediction before this update, so adding only an after-the-fact row guard can still create duplicate paid predictions and leave the losing invocation without a safe ownership path.
- **Fix A ⭐ Recommended**: Redesign `/start` to atomically claim the job through a guarded `queued → processing` transition before creating the external prediction, then persist the prediction ID and pinned version only for the claimant; move a provider-create failure to a controlled terminal state.
  - **Strength**: Prevents duplicate provider work and makes provenance ownership explicit at the database boundary.
  - **Tradeoff**: Changes the request sequencing and requires careful handling of provider-create failures and fast callback timing.
  - **Confidence**: HIGH — current ordering and unguarded update were verified in the implementation.
  - **Blind spot**: Replicate cancellation semantics and the earliest possible callback timing have not been tested.
- **Fix B**: Add database-level immutability for non-null `model_version` and guard `markJobProcessing` with `status = queued` plus `model_version IS NULL`.
  - **Strength**: Smaller change that prevents provenance from being overwritten in the database.
  - **Tradeoff**: A duplicate Replicate prediction may already have been created before the losing update is rejected, so cost and cleanup races remain.
  - **Confidence**: HIGH — it directly closes the overwrite demonstrated by the current query.
  - **Blind spot**: The correct cleanup behavior for a prediction created by a losing invocation is unresolved.
- **Decision**: FIXED — applied Fix A. `/start` now claims `queued → processing` before creating provider work; prediction ID and `model_version` are attached through guarded write-once NULL checks. A fast callback receives retryable HTTP 409 while metadata is pending, and an unattached prediction is canceled best-effort. Real Postgres concurrency tests prove exactly one claim and one metadata writer.

### F3 — Unit test does not prove `markJobSucceeded` omits `model_version`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `tests/photo-job-helpers.test.ts:161`
- **Detail**: Phase 2 requires a unit assertion that the success transition does not overwrite `model_version`, and Progress 2.3 records that assertion as complete. The current test checks the other success payload fields but never asserts that `model_version` is absent. The integration test proves the stored value survives, but it would also pass if `markJobSucceeded` wrote the same pinned value again.
- **Fix**: Add `expect(payload).not.toHaveProperty("model_version")` to the successful `markJobSucceeded` unit test.
- **Decision**: FIXED — added an explicit negative assertion proving `markJobSucceeded` does not include `model_version` in its update payload.

## Triage Summary

- **Fixed**: F1 (Fix A), F2 (Fix A), F3
- **Skipped**: none
- **Accepted**: none
- **Pending**: none
