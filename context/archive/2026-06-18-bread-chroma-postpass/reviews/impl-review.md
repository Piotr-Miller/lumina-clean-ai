<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bread chroma-denoise post-pass + pinned version resolution

- **Plan**: context/changes/bread-chroma-postpass/plan.md
- **Scope**: Phases 1–5 of 5 (full plan)
- **Date**: 2026-06-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

All five cross-phase safety invariants verified MATCH:

- `model_version` written once (NULL-guarded), never in `markJobSucceeded`
- `bread.ts` stays pure across the Deno boundary
- alpha forced opaque before JPEG export
- object URL revoked on cancel/change/unmount; signed URL never revoked
- fail-open: post-pass failure → raw Bread result, not job failure

Automated verification:

- `npm run typecheck` — PASS (clean)
- `npm run test:unit` — PASS (208/208)
- `deno check --config supabase/functions/enhance/deno.json supabase/functions/enhance/index.ts` — PASS
- `npm run lint` — repo-wide gate RED, but all 45 errors originate from the stray untracked `count-loc.cjs`; the change's own 14 files lint clean (see F1)
- `npm test` integration (incl. `jobs.rls.test.ts`) and `npm run test:e2e` — not re-run here (need Docker/build); verified green in prior phase-2 (d6341a1) and phase-4 (eb8c8a2) reviews

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — `npm run lint` gate fails on a stray untracked file

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: count-loc.cjs (repo root, untracked)
- **Detail**: The plan's automated criterion `npm run lint` reports 45 errors — all 45 originate from `count-loc.cjs` (require()-style imports, no-unsafe-\* on Get-Content output, no-undef console). This file is NOT part of the change; it's an untracked working-tree artifact (git status: `?? count-loc.cjs`), alongside `loc-output.txt` and a stray `nul` file. Linting only the change's 14 source/test files returns zero problems — the change itself is lint-clean. The documented repo-wide gate is currently red solely because of this stray.
- **Fix**: Delete the stray working-tree files (`count-loc.cjs`, `loc-output.txt`, `nul`) so `npm run lint` is green again. They are not tracked and not part of this change.
- **Decision**: FIXED — deleted all three strays; `npm run lint` now reports 0 errors (51 pre-existing `no-console` warnings in `scripts/spikes/*` remain, non-blocking).

### F2 — Plan/code function-name drift (markJobProcessing → recordJobPrediction)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/photo-job.service.ts:255
- **Detail**: The plan's Phase-2 contract repeatedly names the writer `markJobProcessing`; the actual function is `recordJobPrediction`. Behavior fully matches intent: `model_version` is written once with a `.is("model_version", null)` write-once guard, and `markJobSucceeded` (178-201) never touches it. Pure naming mismatch between the plan prose and the established codebase API — not a defect.
- **Fix**: None required (optionally note the real name in the plan).
- **Decision**: FIXED — added a note under Phase-2 "Changes Required" in plan.md clarifying the implemented API is `recordJobPrediction` / `RecordJobPredictionCommand`.

### F3 — Resolver schema compatibility check is heuristic

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/lib/bread-version-resolver.ts:80-92
- **Detail**: `assertNumericPropertyAccepts` only rejects when the configured gamma/strength value falls outside an explicitly-present minimum/maximum. If a future Bread schema drops the bounds (or keeps `type: number` but changes the field's meaning), the check passes. Acceptable for an on-demand, PR-reviewed pin bump (not a runtime path), but weaker than "the field still means what we expect."
- **Fix**: None required; consider tightening only if Bread's schema churns.
- **Decision**: ACCEPTED — acknowledged; no action. Heuristic is acceptable for this on-demand, PR-reviewed, non-runtime pin-bump path.

### F4 — 12 MP guard trusts caller-supplied dimensions at the orchestration layer

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/cloud-result-postprocess.client.ts:111
- **Detail**: `maybePostprocessCloudResult` checks the width/height passed alongside the Blob, while `denoiseChroma` validates against the decoded ImageData. If those ever disagreed, the orchestrator pre-check could be bypassed — but `denoiseChroma`'s own guard (chroma-denoise.ts:181) still fails closed and is caught by the fail-open try/catch. Defense-in-depth is intact; noted only for completeness.
- **Fix**: None required.
- **Decision**: ACCEPTED — acknowledged; no action. Defense-in-depth intact (`denoiseChroma` guard fails closed inside the fail-open try/catch).
