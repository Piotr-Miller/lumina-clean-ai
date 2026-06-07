<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-09 Source signed-URL TTL fix (cold-boot reliability)

- **Plan**: context/changes/cloud-source-url-ttl-fix/plan.md
- **Scope**: Full plan (Phase 1 + Phase 2 of 2)
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria re-verified at review time: `npm run test:unit` → 90 passed (incl. `tests/cloud-timings.test.ts`); `npm run lint` (touched-file scope) clean; `npm run build` green (run during Phase 2 implementation, no `src/` changes since until triage comment-only edits). Manual checks 2.4/2.5 confirmed by diff inspection.

## Findings

### F1 — Edge Function TTL comment overstates the privacy mitigation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/functions/enhance/index.ts:~47 (comment)
- **Detail**: The Phase-1 rationale comment claimed privacy is "bounded by the source being deleted on terminal state (24h retention)." That holds only for the SUCCESS path — `markJobSucceeded` deletes the source (photo-job.service.ts:141), but `markJobFailed` deliberately does not ("No source cleanup in v1", :110-112). For a failed/abandoned job the source persists until the 24h sweep, and this change widened its signed-read window 300s→3600s. The underlying retention gap is pre-existing and tracked by S-08; plan.md:145 documents it correctly. The only issue was the new comment overstating the mitigation. Bounded risk: path-scoped URL held only by Replicate, ≤1h on an object already living ≤24h on failure, cloud ships OFF.
- **Fix**: Scoped the comment to the success path and credited S-08 with the failed/abandoned gap.
- **Decision**: FIXED

### F2 — Stale "~2 min" comments now contradict the 5-min copy/budget

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/hooks/useCloudJob.ts:18 (JSDoc) and :223 (inline)
- **Detail**: Phase 2 updated the budget-rationale block and the user-facing copy to ~5 min, but two non-user-facing comments still said "≈ 2 min" / "~2 min": the `coldStartHint` JSDoc and the inline reassurance comment. Outside the plan's named edits, so not drift — but they lagged the new reality. Comments only, no behavior impact.
- **Fix**: JSDoc → "(Phase-0: ~2 min typical, >300s under load)"; inline → "a few minutes" to match the copy.
- **Decision**: FIXED

### F3 — Watchdog floor test has zero margin above the worst-case tail

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/cloud-timings.test.ts:23 + src/components/hooks/useCloudJob.ts:78
- **Detail**: `PROCESSING_WATCHDOG_MS` is exactly 300_000 and the test asserts `>= 300_000`, while the comment says "above that tail with margin" and the observed cold-boot tail was ">300s" — zero headroom over an outlier. Value chosen deliberately this session; live adequacy is explicitly a deferred flip-ON re-validation (D.1).
- **Fix**: None now — covered by deferred D.1. (Optionally bump to 360_000 for true margin, but that's a value decision, not a bug.)
- **Decision**: SKIPPED — owned by deferred D.1
