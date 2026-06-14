<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Scheduled Retention Reaper for Lingering Source Objects (Risk #5)

- **Plan**: context/changes/retention-reaper/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-06-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Success criteria re-run

db reset ✓ · unit (30 tests) ✓ · integration (12 tests, real storage) ✓ · tsc ✓ · eslint ✓.
Scoped mutation gate (`stryker --mutate "src/lib/services/photo-job.service.ts:435-510"`, §4 risk module):
in-function survived mutants are cosmetic (console.warn message/catch-block lines) except F1; the remaining
survived/no-cov mutants are pre-existing in other functions (bestEffortRemove, the `data?.[0]` optional chains,
sweepStalePendingJobsForOwner) and out of this phase's scope.

## Findings

### F1 — Flip threshold direction is unpinned: tests don't prove the reaper spares live jobs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/photo-job.service.ts:448 (mutant 448:31, ArithmeticOperator)
- **Detail**: Scoped Stryker leaves the flip-threshold arithmetic `Date.now() - staleMs` survived — mutating `-`→`+` is uncaught. Not cosmetic: with `+` the threshold moves into the future and the GLOBAL flip would reap every non-terminal job, including live in-flight ones. The mocked unit test only checks `lt[0]==='created_at'` (not the value); the integration flip test asserts the 2h-old row flips but never asserts a FRESH non-terminal row is SPARED. The "don't reap live jobs" invariant is unverified. (The twin `sweepStalePendingJobsForOwner` has the same survived mutant at 329:35, but it's owner-scoped + create-job-triggered; the reaper runs globally, so a regression here hits every user.)
- **Fix**: In the integration flip test (tests/jobs.rls.test.ts), also seed a FRESH (created-now) processing row and assert it is NOT flipped after the sweep — pins the threshold direction, documents the invariant, kills the mutant.
- **Decision**: FIXED (unit threshold direction+magnitude assertion + integration fresh-row-spared; mutant 448:31 killed)

### F2 — Per-pass try/catch instead of the plan's single outer try/catch

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/photo-job.service.ts:447,470
- **Detail**: The plan contract said "whole body in try/catch returning {flipped:0,deleted:0} on fault"; the impl wraps EACH pass in its own try/catch. Beneficial deviation — a flip-pass failure no longer blocks the NFR-critical storage-delete pass — and matches the docstring/Overview's "two independent best-effort passes". Covered by the unit test "delete pass still runs when the flip pass errors".
- **Fix**: None — intentional improvement over the literal contract.
- **Decision**: ACCEPTED (intentional improvement over the literal contract)

### F3 — Leading-wildcard LIKE scans storage.objects each run

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: supabase/migrations/20260614120000_reaper_stale_source_paths.sql
- **Detail**: `name like '%/source.%'` is a leading-wildcard match → can't use the (bucket_id, name) index, so the RPC scans the bucket's objects each run. Negligible now (global cap 3 + 24h retention → a handful of objects), but worth remembering if object volume grows.
- **Fix**: None now. If the bucket grows, narrow with a bucket_id-scoped partial index or a suffix predicate.
- **Decision**: ACCEPTED (no action at MVP scale; note for future growth)
