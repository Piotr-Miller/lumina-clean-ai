<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Cloud flip-ON re-validation (D.1)

- **Plan**: context/changes/cloud-flip-on-revalidation/plan.md
- **Scope**: Phase 3 of 4 (Live happy-path + cold-boot)
- **Date**: 2026-06-08
- **Verdict**: APPROVED
- **Findings**: 0 critical  0 warnings  3 observations
- **Phase commit**: 1e66c48

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS (n/a — spike script only) |
| Pattern Consistency | PASS |
| Success Criteria | PASS (3.2/3.3 deferred to prod, documented) |

## Evidence

- **Plan Adherence** — Phase 3 #2 (per the F2 plan-review fix) allowed driving the live submit via a `createPhotoJob`+PUT script; `d1-live-submit.ts` does exactly that (createPhotoJob → uploadToSignedUrl racing `/start` → poll). #1 tunnel+env done via gitignored env wiring. MATCH.
- **Scope** — only a `scripts/spikes/` harness + plan Progress changed; `enhance/index.ts` untouched (verified zero-diff for this change). No app code, no migration.
- **Safety & Quality** — no hardcoded secrets (SERVICE_ROLE_KEY/token from env); external fetch is picsum (sample input); self-cleans. Local manual harness, not shipped code.
- **Pattern** — mirrors `phase3-callback-test.ts` / `d1-retention-check.ts` conventions.
- **Success Criteria** — 3.1 no-drift ✓; 3.4 cold-boot ✓ (live prediction succeeded after a 132s cold boot → 3600s source URL survived, confirmed via the Replicate API); 3.2 (full happy-path) + 3.3 (cap-reject) deferred to prod 4.3/4.4 — local `functions serve` killed the `/callback` isolate (early-termination) before `markJobSucceeded`; a local edge-runtime limit, not a code defect (the callback success path passes in the Phase-2 deterministic harness + `phase3-callback-test`).

## Findings

### F1 — Harness cleans up unconditionally, destroying diagnostic state on failure

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (harness quality)
- **Location**: scripts/spikes/d1-live-submit.ts (end of main())
- **Detail**: cleanup (delete job/user/objects) runs even on FAIL/timeout. This session it deleted the stuck-`processing` row, so the Replicate API had to be queried instead of inspecting the row; a late callback then no-ops.
- **Fix**: Skip cleanup on non-success (leave the row + print jobId/predictionId), or query the Replicate prediction status before cleaning up.
- **Decision**: SKIPPED (harness did its job; noted for future use)

### F2 — secs_to_terminal mislabels a poll-timeout as a cold-boot time

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/spikes/d1-live-submit.ts (RESULT print)
- **Detail**: On timeout the row never reached terminal, but it prints `secs_to_terminal: 360 (COLD boot)` — 360 is the poll window, not a boot time. Slightly misleading in the log.
- **Fix**: Distinguish "timed out, still processing" from an actual terminal time.
- **Decision**: SKIPPED

### F3 — Phase 3 carries 3.2 + 3.3 forward to prod

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: Progress 3.2 / 3.3
- **Detail**: Full happy-path + cap-reject deferred to prod 4.3/4.4 (local edge-runtime + dev-server limits). Documented, user-approved — not a defect; noted for the record.
- **Fix**: None — intended; close in Phase 4.
- **Decision**: ACCEPTED (deferred to prod by design)
