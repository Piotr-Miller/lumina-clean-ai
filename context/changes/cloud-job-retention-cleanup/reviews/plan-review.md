<!-- PLAN-REVIEW-REPORT -->
# Plan Review: S-08 — 24h-retention cleanup for failed/abandoned cloud jobs

- **Plan**: context/changes/cloud-job-retention-cleanup/plan.md
- **Mode**: Deep (re-review after F1–F3 fixes)
- **Date**: 2026-06-07
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 0 observations (this pass) — prior F1–F3 fixed below

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

5/5 paths ✓, 7/7 symbols ✓, brief↔plan ✓.

## Re-review notes

Second pass after the first review's F1–F3 edits. All three landed correctly with no new inconsistency:
- **F1** — Phase 3 #2 now states the cap interaction (sweeping a pre-model abandoned row releases its daily-cap slot) as intended, consistent with `countCloudJobsToday`'s exclusion of pre-model failures.
- **F2** — the sweep issues a single batched `storage.remove(paths)`; Performance Considerations rewritten to "3 round-trips".
- **F3** — Testing Strategy enumerates the existing tests to update (`photo-job-helpers.test.ts`, `jobs.rls.test.ts`).

Specifically verified this pass (no defect found):
- **F9 guard `.eq("status","processing")` is correct, not a regression.** `/start` creates the Replicate prediction (`index.ts:240`) before `markJobProcessing` (`:260`), but a callback can only reach `markJobSucceeded` after passing the fail-closed prediction-id cross-check (`payload.id === job.replicate_prediction_id`, non-null). A non-null prediction-id is set only by `markJobProcessing`, which flips the row to `processing`; a `queued` row therefore can't match and is rejected upstream. The only non-terminal state reachable at `markJobSucceeded` is `processing`.
- `/callback` catch double-handling, sweep concurrency (idempotent guarded UPDATE + no-op batched remove), per-phase revertibility, and the `deleteJobResult` import — all sound.

## Findings

(prior review)

### F1 — "cap semantics unchanged" claim was false; sweep moves the daily-cap count
- **Severity**: ⚠️ WARNING · **Impact**: 🔎 MEDIUM · **Dimension**: Blind Spots · **Location**: Phase 3 #2
- **Detail**: `countCloudJobsToday` counts a row unless `status='failed' AND replicate_prediction_id IS NULL`; sweeping a pre-model abandoned row releases its global cap slot.
- **Fix**: Corrected wording to state the interaction is intended/consistent. No code change.
- **Decision**: FIXED

### F2 — Sweep did up to 100 sequential storage deletes awaited in create-job
- **Severity**: ⚠️ WARNING · **Impact**: 🔎 MEDIUM · **Dimension**: Blind Spots · **Location**: Phase 3 #1 + Performance
- **Detail**: Per-row `deleteJobSource` loop → up to `SWEEP_MAX` serial `.remove()` calls in the request path; `.remove(paths[])` batches.
- **Fix**: Single batched `storage.remove(sourcePaths)`; Performance rewritten.
- **Decision**: FIXED

### F3 — Existing tests will break on the signature/guard changes
- **Severity**: 🔭 OBSERVATION · **Impact**: 🏃 LOW · **Dimension**: Plan Completeness · **Location**: Phase 1 Testing Strategy
- **Detail**: `photo-job-helpers.test.ts:99-116` asserts `markJobFailed`'s exact eqs; `jobs.rls.test.ts:174-218` covers `markJobSucceeded`.
- **Fix**: Added a Testing-Strategy line enumerating the existing tests to update.
- **Decision**: FIXED
