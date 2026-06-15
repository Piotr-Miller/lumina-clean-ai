<!-- PLAN-REVIEW-REPORT -->

# Plan Review: API Authorization Test Gaps (Risk #2 + Risk #4)

- **Plan**: context/changes/testing-api-authz-gaps/plan.md
- **Mode**: Deep
- **Date**: 2026-06-15
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | WARNING |

## Grounding

8/8 paths ✓, 4/4 symbols ✓, brief↔plan ✓, blast-radius ✓.
Confirmed: `markPendingJobFailedForOwner` (photo-job.service.ts:273-300) sets
status/error_code/error_message/completed_at, owner-scoped filter, returns boolean,
calls `deleteJobSource` on flip; `bestEffortRemove` (:42-48) never throws on an
absent object; the `timeout` route is not imported by any module (only HTTP
callers: useCloudJob fetch + e2e spec), so the extract-core refactor's blast radius
is contained.

## Findings

### F1 — New describe block can't reuse the existing afterEach cleanup

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — change #3 (cross-user IDOR integration cases)
- **Detail**: The plan said add "a new describe(...)" AND "reuse the existing created/deleteTestUser afterEach", but that teardown + `makeUser` live inside `describe("public.jobs RLS + photo-job service")` (jobs.rls.test.ts:45-56). A sibling top-level describe wouldn't share teardown → test users + storage objects leak across runs.
- **Fix**: Nest the IDOR describe inside the existing describe so it reuses makeUser / created / afterEach.
- **Decision**: FIXED (Fix in plan — Phase 2 change #3 now specifies nesting inside the existing describe)

### F2 — json helper: prefer local define+export over cross-handler import

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — change #1 (extract timeout.handler.ts)
- **Detail**: The plan offered "import json from cloud-create-job.handler.ts OR define locally." Importing couples two unrelated handlers. The true mirror of the create-job split: each handler defines+exports its own json; the wrapper imports from its OWN handler.
- **Fix**: Define+export json in timeout.handler.ts; wrapper imports from there.
- **Decision**: FIXED (Fix in plan — Phase 2 change #1 now mandates a local define+export, no cross-handler import)

### F3 — Positive-control flip fires deleteJobSource on an unseeded object

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — change #3 (positive control)
- **Detail**: When user A flips their own job, `markPendingJobFailedForOwner` calls `deleteJobSource(source_path)`. The positive control's job has a fake source_path with no uploaded object. Verified non-fatal: `bestEffortRemove` (photo-job.service.ts:42-48) swallows the error with a console.warn and never throws — the test passes, emitting one benign warn line.
- **Fix**: Add a note in the plan that the benign console.warn is expected (deleteJobSource no-op), so the implementer doesn't mistake it for a failure.
- **Decision**: FIXED (Fix in plan — explanatory note added under Phase 2 change #3)

## Triage Summary

- Fixed: F1 (Fix in plan), F2 (Fix in plan), F3 (note added) — 3
- Skipped: none
- Accepted: none
- Dismissed: none

► Verdict after fixes: SOUND
