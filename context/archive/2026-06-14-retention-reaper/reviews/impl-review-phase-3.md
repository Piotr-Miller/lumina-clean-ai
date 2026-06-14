<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Scheduled Retention Reaper for Lingering Source Objects (Risk #5)

- **Plan**: context/changes/retention-reaper/plan.md
- **Scope**: Phase 3 of 3 — pg_cron scheduling migration + docs-sync
- **Date**: 2026-06-14
- **Verdict**: NEEDS ATTENTION → fixed during triage (F1 resolved)
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Success criteria

db reset ✓ · unit 139 + full suite 151 ✓ · doc references resolve ✓ · `cron.job` `reaper-hourly` scheduled `0 * * * *` ✓ · tick inert-when-Vault-unset + issues-request-when-set ✓. Mutation gate: N/A (SQL migration, not a TS/vitest-graph module). Plan Adherence: the migration matches the Phase 3 contract exactly, including the F3 (`timeout_milliseconds := 30000`) and F5 (guarded `cron.unschedule`) plan-review fixes.

## Findings

### F1 — handle_reaper_tick is anon-callable via PostgREST RPC (no execute revoke)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (+ Pattern Consistency)
- **Location**: supabase/migrations/20260614130000_reaper_schedule.sql (handle_reaper_tick)
- **Detail**: `handle_reaper_tick` is SECURITY DEFINER, `returns void`, and was created with Postgres' default PUBLIC execute grant — so PostgREST exposed it as an anon/authenticated-callable RPC. Verified live: `POST /rest/v1/rpc/handle_reaper_tick` with the anon key → **HTTP 204** (executed). Its sibling in the same change, `stale_source_object_paths`, correctly revokes execute (anon → 401), and `lessons.md:5-10` codifies the revoke-from-anon/authenticated rule — so the tick was both a security miss and inconsistent with its own change. Blast radius is bounded (secret never returned, no caller-controlled params, idempotent sweep) so not a data breach, but any anonymous user could trigger the global reaper (it reads Vault secrets and fires a real-bearer `/reap` POST). A Vault-reading SECURITY DEFINER function must not be anon-invocable.
- **Fix**: Added `revoke all on function public.handle_reaper_tick() from public; revoke all on function public.handle_reaper_tick() from anon, authenticated;` to the migration (mirrors the RPC migration's grant model). Re-verified after `db reset`: anon → **HTTP 401**; cron `reaper-hourly` still scheduled; owner (pg_cron) can still execute it. Migration amended in place (branch unmerged / not yet deployed).
- **Decision**: FIXED (revoke execute from public/anon/authenticated; anon → 401 confirmed)
