<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-08 — cloud-job-retention-cleanup

- **Plan**: context/changes/cloud-job-retention-cleanup/plan.md
- **Scope**: Phase 1 of 3 (Service layer — deletion primitives + guarded transitions)
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation
- **Commit reviewed**: ee88ada

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING (F1 — fixed) |

Both sub-agents independently confirmed: zero plan drift (all 4 service changes + test/doc updates MATCH), no Phase 2/3 leakage, delete-on-flip is atomic and correct (delete fires iff a real flip; no double-delete, no wrong-object risk). The F9 `.eq("status","processing")` guard re-verified sound against the live Edge Function (a `queued` row can't pass `/callback`'s fail-closed prediction-id cross-check, so it's unreachable). Success criteria re-run on the committed code: `npm run build` green; `npm run test:unit` 95 passed.

## Findings

### F1 — No negative integration test proving the F9 guard blocks a non-processing row

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: tests/photo-job-helpers.test.ts:171-176 / tests/jobs.rls.test.ts
- **Detail**: The unit "lost race" test feeds the mock `data: []` and asserts flipped===false + no delete, but the stub returns `[]` regardless of the guard — so it would still pass if `.eq("status","processing")` were removed. The guard's blocking behavior was only proven by a mock that can't enforce a filter; the positive path is covered end-to-end but there was no real-DB negative case.
- **Fix**: Added a Docker-gated `jobs.rls.test.ts` case — seed a row already `failed` (watchdog won), call markJobSucceeded, assert `flipped===false`, status stays `failed`, `result_path` null, source object still present. Runs under full `npm test`, not `test:unit`/CI.
- **Decision**: FIXED

### F2 — Load-bearing `as { data: …[] | null }` casts discard supabase-js typing

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: photo-job.service.ts:154-157, 227-230, 269-272
- **Detail**: The three guarded UPDATEs hand-cast the result shape, so a future `source_path` column rename wouldn't be caught by tsc here. Consistent with the file's existing convention (`getJobById` casts identically) — not a regression.
- **Fix**: None — accepted as the file's established pattern.
- **Decision**: SKIPPED
