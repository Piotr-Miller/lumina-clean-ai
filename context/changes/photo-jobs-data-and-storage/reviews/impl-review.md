<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Photo Jobs Data and Storage (F-01)

- **Plan**: context/changes/photo-jobs-data-and-storage/plan.md
- **Scope**: Full plan (Phases 1–5)
- **Date**: 2026-05-28
- **Verdict**: APPROVED
- **Findings**: 0 critical · 2 warnings · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

### Dimension notes

- **Plan Adherence**: all 21 planned artifacts present and conform. Two deviations were explicitly accepted in `change.md` and now codified in `lessons.md`: (a) admin client lives in `src/lib/supabase-admin.ts` not `src/lib/supabase.ts`; (b) `REPLICA IDENTITY FULL` and `realtime.setAuth(jwt)` added during Phase 5 debugging.
- **Scope Discipline**: no `/api/jobs` route, no upload UI, no rate-limit enforcement, no pg_cron, no Edge Function, no `cloud_usage` table — all "not doing" guardrails respected.
- **Architecture**: admin client correctly isolated from `astro:env/server` (lesson #4), RLS granular per operation/role on both `jobs` and `storage.objects`, `service_role` grants preserved per lesson #1, REPLICA IDENTITY FULL per lesson #2.
- **Success Criteria**: Progress section fully checked across all 25 sub-items with commit SHAs. Re-verified locally for this review: `npx astro check` → 0 errors, `npm run build` → green. `npm run lint` and Supabase-dependent checks (`db reset`, `npm test`, `tsx scripts/f01-smoke.ts`) were validated at commit time per the Progress checkmarks; Windows CRLF baseline (lesson #5) makes `npm run lint` noisy and is not re-litigated here.

## Findings

### F1 — Smoke script silently passes if Storage list() errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: scripts/f01-smoke.ts:159-163
- **Detail**: The retention-contract assertion only destructures `data`:
  ```ts
  const { data: files } = await admin.storage.from(...).list(...);
  const sourceStillThere = files?.some((f) => f.name === "source.jpg") ?? false;
  ```
  If `list()` returns an error (transient Storage failure), `files` is undefined, `sourceStillThere` coerces to `false`, and the script prints "source object gone ✓" — masking a real retention regression. The smoke is the only end-to-end gate on the 24h source-retention NFR.
- **Fix**: Destructure `error` from `list()`, throw if present, and assert against a defined array before calling `.some()`.
- **Decision**: FIXED

### F2 — Daily-cap partial index is not user-scoped; likely redundant

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Performance)
- **Location**: supabase/migrations/20260528120000_create_jobs_table.sql:54-56
- **Detail**: The S-05 daily-cap query will be `COUNT(*) WHERE user_id = $1 AND created_at >= today AND status <> 'failed'`. The partial index `jobs_daily_cap_idx (created_at desc) where status <> 'failed'` is global (not leading on `user_id`), so it scans every non-failed row in the time range across all users and filters by `user_id` post-hoc. The sibling `jobs_user_id_created_at_idx (user_id, created_at desc)` already serves the per-user range-scan well. At MVP scale this is invisible, but the index is doing the wrong job at the cost of write amplification on every insert/update. The plan called for exactly this shape — so the plan got it wrong; not implementation drift.
- **Fix A ⭐ Recommended**: Drop `jobs_daily_cap_idx` and rely on `jobs_user_id_created_at_idx` for the daily-cap query.
  - Strength: Removes write-amplification on every insert; the user-scoped composite is already optimal for the cap-query pattern.
  - Tradeoff: None at MVP scale; a future global-aggregate dashboard ("ops/day across all users") would need its own index.
  - Confidence: HIGH — the cap query is per-user; per-user index covers it.
  - Blind spot: Haven't seen S-05's exact COUNT pattern in code yet.
- **Fix B**: Change the partial index to `(user_id, created_at desc) where status <> 'failed'`.
  - Strength: Tightens the partial index to the exact query shape; keeps documented intent visible in the schema.
  - Tradeoff: Marginal benefit over Fix A for this workload; doubles insert overhead for a payoff only the cap query sees.
  - Confidence: MEDIUM — depends on the growth rate of failed-row share.
  - Blind spot: How often will rows transition to/from 'failed'?
- **Decision**: FIXED via Fix A

### F3 — Misleading SELECT-first comment in markJobSucceeded

- **Severity**: · OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/photo-job.service.ts:67-68
- **Detail**: Comment reads "SELECT the source_path before the UPDATE so we know what to delete even if the row's mutated state would lose that information." But the UPDATE never clears `source_path` — the SELECT is functionally unnecessary as a safeguard. It exists because the caller doesn't know `source_path`; that's the real reason. Behavior matches the plan exactly; only the comment misleads.
- **Fix**: Rewrite the comment to state the real reason ("the caller supplies `jobId` only; `source_path` lives on the row"), or have S-04 pass `sourcePath` in and drop the SELECT entirely later.
- **Decision**: FIXED

### F4 — Dead "401" branch in anon-INSERT assertion

- **Severity**: · OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/jobs.rls.test.ts:91
- **Detail**: `expect(error?.code === "42501" || error?.code === "401").toBe(true);` — Postgres/PostgREST `error.code` is a SQLSTATE (5-char), never `"401"` (an HTTP status). After the explicit `revoke from anon` in the migration, the actual code returned is `"42501"`. The OR branch is dead code that suggests confusion about the error shape.
- **Fix**: Drop the `"401"` branch — assert `error?.code === "42501"` only.
- **Decision**: FIXED

### F5 — deleteTestUser swallows list() errors; can leak Storage objects

- **Severity**: · OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: tests/helpers/test-users.ts:62-84
- **Detail**: The two-level Storage walk in `deleteTestUser` destructures only `data` from `.list()`. If a `list()` call errors, the loop runs zero times and source/result objects accumulate under `photos/{userId}/` across test runs — no warning, no failure signal.
- **Fix**: Destructure `error` from both `list()` calls and log a warning on failure so leaks become visible during local runs.
- **Decision**: FIXED
