<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Cloud flip-ON re-validation (D.1)

- **Plan**: context/changes/cloud-flip-on-revalidation/plan.md
- **Mode**: Deep
- **Date**: 2026-06-08
- **Verdict**: REVISE → SOUND (all 5 findings fixed in triage 2026-06-08)
- **Findings**: 1 critical  2 warnings  2 observations (all FIXED)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

6/6 paths ✓, 3/3 symbols ✓ (sweepStalePendingJobsForOwner, markPendingJobFailedForOwner, STALE_PENDING_JOB_MS), photos-bucket migration ✓ (20260528120100_create_photos_storage.sql), brief↔plan ✓. Callback ordering confirmed: already_terminal guard at enhance/index.ts:403-404 precedes upload (436) + markJobSucceeded (448) + the line-451 cleanup branch.

## Findings

### F1 — 2c recipe can't reproduce the F5/F9 result-orphan cleanup

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 → Changes #1 (2c) + Progress 2.1
- **Detail**: The handler has two distinct 200-ignored branches: enhance/index.ts:403-404 `{ignored:"already_terminal"}` fires BEFORE download/upload when the row is already terminal at read-time; enhance/index.ts:449-451 `{status:"ignored", reason:"row_already_terminal"}` fires AFTER upload when markJobSucceeded returns false (the real F5/F9 cleanup + deleteJobResult). The 2c recipe (flip to `failed` first, then POST a success callback, assert result deleted) triggers the FIRST branch — the callback never uploads or cleans, so the pre-uploaded result is untouched and the "result deleted" assertion fails (or passes for the wrong reason). The genuine cleanup only fires when the row is `processing` at read but `failed` by markJobSucceeded-time — a mid-handler flip a black-box POST can't deterministically interleave.
- **Fix A ⭐ Recommended**: Reframe 2c — split idempotency from the cleanup proof. 2c-i (deterministic, black-box): callback to an already-`failed` row → assert `already_terminal` 200 + row untouched + no resurrection. 2c-ii (true F5/F9 cleanup): cite existing coverage — the S-08 unit test asserting markJobSucceeded returns false off-`processing` + the impl-reviewed deleteJobResult branch — and mark a live mid-handler race as best-effort/non-blocking.
  - Strength: Deterministic and honest; matches the "deterministic blocking, live best-effort" bar; no app-code seam.
  - Tradeoff: The exact handler cleanup line isn't re-proven live — relies on existing unit + review evidence.
  - Confidence: HIGH — already_terminal ordering confirmed at enhance/index.ts:403 vs 448.
  - Blind spot: None significant.
- **Fix B**: Induce the real race with a slow-output timing window — point OUTPUT_IMAGE_URL at a slow/large resource to widen the download window and flip the row to `failed` mid-window via a concurrent timer so markJobSucceeded sees `failed`.
  - Strength: Actually exercises the line-451 cleanup end-to-end.
  - Tradeoff: Inherently racy/flaky; can't be a reliable exit-0 gate; contradicts "deterministic."
  - Confidence: MED — repro depends on machine/network timing.
  - Blind spot: Flake rate unmeasured; may need retries.
- **Decision**: FIXED (Fix A — 2c reframed to 2c-i idempotency + 2c-ii cited coverage)

### F2 — Phase 3 live submit references the wrong template (f01-smoke)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3 → Changes #2 ("reuse f01-smoke.ts shape")
- **Detail**: f01-smoke.ts calls markJobSucceeded directly (createPhotoJob → PUT → markJobSucceeded), bypassing the webhook → /start → Replicate → /callback pipeline. Using its shape for a LIVE submit would not exercise the real cloud path, defeating Phase 3's purpose. The live happy-path must go through the app UI (cloud toggle) or a script that does createPhotoJob + a real source PUT and then lets the DB webhook fire /start.
- **Fix**: Re-word Phase 3 #2 to drive the live submit via the UI or a createPhotoJob+PUT script that triggers the real webhook — explicitly NOT f01-smoke's direct-markJobSucceeded shape. Keep f01-smoke only as a Realtime-observation reference.
- **Decision**: FIXED (reworded Phase 3 #2)

### F3 — 2b cap-slot-release asserted against a global cross-user count

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 → Changes #1 (2b)
- **Detail**: countCloudJobsToday is a GLOBAL, whole-UTC-day, cross-user count (photo-job.service.ts:100-114). Asserting it "drops by one" is fragile — other seeded jobs in the same run and a day boundary shift the absolute number.
- **Fix**: Assert the DELTA tightly around the single sweep call (count immediately before vs after), not an absolute value, and seed the 2b row as the only pre-model-failable row in that window.
- **Decision**: FIXED (2b now asserts before/after delta)

### F4 — Prod "deliberately-failed/abandoned" job induction unspecified

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 → Manual 4.5
- **Detail**: 4.5 doesn't say HOW to fail a prod job; options differ in time/cost (watchdog timeout vs bad input vs cancel prediction).
- **Fix**: Name the induction — simplest is submit then let the client processing watchdog (300s) time out → markPendingJobFailedForOwner → source delete; spot-check the object is gone.
- **Decision**: FIXED (4.5 specifies watchdog-timeout induction)

### F5 — Phase 1 token-less smoke ends `failed`, not `queued` (unstated)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 → Manual 1.3
- **Detail**: With CLOUD_PIPELINE_ENABLED=true but no REPLICATE_API_TOKEN, /start fires, attempts predictions.create, fails, calls markJobFailed → the row ends `failed` (source deleted), not stuck `queued`. The criterion "/start is invoked" is still met but a `failed` row may read as a problem.
- **Fix**: Note in 1.3 / the runbook that the token-less Phase-1 smoke is expected to end `failed` at predictions.create — which itself demonstrates the failed-source-delete path.
- **Decision**: FIXED (1.3 notes expected token-less `failed` outcome)
