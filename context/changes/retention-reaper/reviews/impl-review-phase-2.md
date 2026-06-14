<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Scheduled Retention Reaper for Lingering Source Objects (Risk #5)

- **Plan**: context/changes/retention-reaper/plan.md
- **Scope**: Phase 2 of 3 — `/reap` Edge Function route
- **Date**: 2026-06-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success criteria

deno check ✓ (exit 0, deno 2.8.3, the exact CI command) · unit+integration ✓ (151 tests) · manual 2.3/2.4 confirmed live (200 with bearer / 401 without; end-to-end seeded 2h job → `/reap` → `{swept:1}`, row flipped to failed/abandoned). Mutation gate: N/A — Phase 2 touches only the Deno `enhance/index.ts`, which is excluded from the vitest/Stryker graph; the business logic (`sweepAbandonedSourcesGlobally`) was mutation-tested in the Phase 1 review.

## Plan Adherence note

`handleReap` matches the Phase 2 contract exactly: `DB_WEBHOOK_SECRET` presence → 500; `digestEquals` bearer → 401; `buildAdminClient()`; `sweepAbandonedSourcesGlobally(admin)`; `jsonResponse(200, { swept: flipped + deleted })` (never leaks paths); router branch on `pathname.endsWith("/reap")`; import added. The auth block is byte-identical to `handleStart`'s; `buildAdminClient()` is called outside try/catch exactly as `handleStart` does (env always injected by the Edge runtime) — consistent, not a finding. The sweep never throws (Phase 1), so `/reap` always acks with a count.

## Findings

### F1 — /reap intentionally omits the CLOUD_PIPELINE_ENABLED gate that /start has

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/functions/enhance/index.ts:486 (handleReap)
- **Detail**: `handleStart` short-circuits when `CLOUD_PIPELINE_ENABLED !== "true"` (index.ts:196); `handleReap` deliberately does not. This is correct — retention cleanup is a privacy/cost obligation that must run even when the cloud pipeline is kill-switched off (`CLOUD_DAILY_CAP=0`) or disabled, since lingering sources still need reaping. Recorded so a future reader doesn't "fix" it by adding the gate (which would silently stop retention enforcement whenever cloud is paused).
- **Fix**: None — intentional. Optional: a one-line comment on `handleReap` noting the gate omission is deliberate.
- **Decision**: FIXED (added explicit "do not add the gate" comment on handleReap)
