<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Scheduled Retention Reaper for Lingering Source Objects (Risk #5)

- **Plan**: context/changes/retention-reaper/plan.md
- **Mode**: Deep
- **Date**: 2026-06-14
- **Verdict**: REVISE → SOUND after triage (all 5 findings resolved 2026-06-14)
- **Findings**: 1 critical, 2 warnings, 2 observations
- **Triage**: F1 Fixed (Fix A — opts-driven test), F2 Fixed (`npm test`), F3 Fixed (30s pg_net timeout), F4 Accepted (sanity-check `.rpc()` in Phase 1), F5 Fixed (guarded `cron.unschedule`)

## Verdicts

| Dimension             | Verdict                            |
| --------------------- | ---------------------------------- |
| End-State Alignment   | PASS                               |
| Lean Execution        | PASS                               |
| Architectural Fitness | PASS (1 observation)               |
| Blind Spots           | WARNING (1 critical, 1 warning)    |
| Plan Completeness     | WARNING (1 warning, 1 observation) |

## Grounding

8/8 paths ✓, symbols ✓ (`sweepStalePendingJobsForOwner`, `STALE_PENDING_JOB_MS`, `SWEEP_MAX`, `digestEquals`, `buildAdminClient`, router), brief↔plan ✓ except the `test:integration` command mismatch (→ F2). Sub-agent verification confirmed: the Deno function imports the shared service module by relative path (`enhance/index.ts:31`) and a new export imports the same way (all `photo-job.service.ts` imports are type-only/Deno-safe); `pg_net` + `vault.decrypted_secrets` are applied by existing migrations and survive `db reset`; the reused constants are module-private but the new fn lives in the same file so it can use them directly (no export needed); blast radius of `sweepStalePendingJobsForOwner` is clean (no overlap with the new owner-agnostic fn).

## Findings

### F1 — Integration test setup is infeasible: harness can't backdate storage.objects.created_at

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness / Blind Spots
- **Location**: Phase 1 — Change #4 (integration test)
- **Detail**: Phase 1 #4 instructs "backdate it past the retention window (set created_at on the storage.objects row via service-role SQL)". The harness has NO SQL client — `supabaseAdmin` (tests/env.ts:21) is REST/Storage-only supabase-js; nothing in tests/\*\* touches `storage.objects` via SQL, and `storage.objects.created_at` is server-set on upload and not writable through any pattern the suite has. As written, the implementer stalls on the very test that closes Risk #5. (`jobs.created_at` IS backdatable via the existing `seedJob()` at jobs.rls.test.ts:287, but storage-object age is not.)
- **Fix A ⭐ Recommended**: Drive staleness via the fn's opts, not real object age
  - Strength: `sweepAbandonedSourcesGlobally` already takes `{retentionMs, staleMs}`. Test deletion with `retentionMs:0` (every uploaded source qualifies → RPC returns it → removed) and the boundary with `retentionMs:3_600_000` (fresh object NOT removed); backdate `jobs.created_at` via `seedJob()` for the flip half. Zero new deps; deterministic; proves both directions of the RPC predicate.
  - Tradeoff: `retentionMs:0` doesn't exercise a literal 23h interval — the boundary case covers the predicate instead.
  - Confidence: HIGH — the fn signature already exposes these opts.
  - Blind spot: None significant.
- **Fix B**: Add a raw service-role Postgres client to the test harness
  - Strength: Tests literal age semantics end-to-end against real `storage.objects.created_at`.
  - Tradeoff: New `postgres`/`pg` dev dependency + harness surface; first SQL client in the suite.
  - Confidence: MED — service_role can likely UPDATE storage.objects, but unverified in the local stack.
  - Blind spot: Whether the local stack permits that UPDATE at all.
- **Decision**: FIXED (Fix A — opts-driven staleness)

### F2 — Success criteria reference a non-existent npm script

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 (1.3), Phase 3 (3.2), plan-brief
- **Detail**: Plan says `npm run test:integration` — no such script exists. The integration suite (incl. jobs.rls.test.ts) runs via bare `npm test` ("vitest run", package.json:15); CI's integration job runs `npm test` (ci.yml:139). `test:unit` explicitly EXCLUDES jobs.rls.test.ts.
- **Fix**: Replace `npm run test:integration` with `npm test` (full suite incl. jobs.rls.test.ts) in 1.3, 3.2, and plan-brief.
- **Decision**: FIXED (npm test)

### F3 — pg_net 2s default timeout may truncate the synchronous /reap work

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Change #1 (tick fn)
- **Detail**: Unlike /start (kicks off Replicate async, returns fast), /reap does the work synchronously: RPC select + flip UPDATE + batched remove(≤100) before responding. `net.http_post`'s default `timeout_milliseconds` is 2000; the plan notes this in Performance but the Phase 3 contract doesn't set it. A run exceeding 2s risks a client-side timeout (and possibly a truncated function run) — silently, since pg_net is fire-and-forget.
- **Fix**: Pin `timeout_milliseconds := 30000` in the tick fn's net.http_post call (matches the OUTPUT_FETCH_TIMEOUT_MS budget the function already uses).
- **Decision**: FIXED (timeout_milliseconds := 30000)

### F4 — First use of admin.rpc() in the codebase

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — Change #1/#2
- **Detail**: Every existing DB access uses query-builder (.from().select/update) or admin.storage.\*; .rpc() would be the first in the repo. Well-supported in Node + Deno supabase-js; the plan already grants the function to service_role only. Just confirm the RPC resolves against local PostgREST (public schema is exposed) during Phase 1, not at cron time.
- **Fix**: No change needed; sanity-check .rpc() resolution in the Phase 1 integration test.
- **Decision**: ACCEPTED (sanity-check .rpc() in Phase 1)

### F5 — cron.unschedule throws when the job doesn't exist

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Change #1 (idempotent re-schedule)
- **Detail**: The plan says "use cron.unschedule defensively before re-scheduling" — but `cron.unschedule('reaper-hourly')` RAISES if no such job exists (e.g. first apply), which would abort the migration.
- **Fix**: Guard it: `if exists (select 1 from cron.job where jobname='reaper-hourly') then perform cron.unschedule('reaper-hourly'); end if;` inside the same `pg_available_extensions` DO block.
- **Decision**: FIXED (guarded cron.unschedule)
