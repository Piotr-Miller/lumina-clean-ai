<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bread chroma-denoise post-pass + pinned version resolution

- **Plan**: context/changes/bread-chroma-postpass/plan.md
- **Scope**: Phase 4 of 5 (Wire into the cloud result, flag default-OFF)
- **Date**: 2026-06-22
- **Verdict**: APPROVED
- **Findings**: 0 critical · 1 warning · 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Success criteria evidence: `npm run test:unit` 208/208 pass; `npm run typecheck` clean; targeted ESLint on the 4 touched files clean (Windows CRLF lesson — Prettier-normalized + scoped lint); `npm run test:e2e` 5/5 pass (verified pre-commit against the exact committed flag-OFF state). Manual 4.5/4.6/4.7 verified live in-browser via a local stub pipeline (processed `blob:` preview + matching download; forced-failure and >12 MP both fall back to raw with exact scrub-safe warnings; flag-OFF signed storage URL unchanged). Mutation gate skipped — Phase 4 touches no test-plan.md §4 risk module.

## Findings

### F1 — Duplicated canvasToBlob + JPEG_QUALITY=0.92

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/cloud-result-postprocess.client.ts:27,43-57 (dup of src/lib/engines/local-engine.ts:19,29-43)
- **Detail**: The new adapter re-implements `canvasToJpegBlob` and a second `JPEG_QUALITY = 0.92` constant that already exist in local-engine.ts (`canvasToBlob` + `JPEG_QUALITY = 0.92`). Two independent 0.92 constants can silently drift — a future quality tweak in one path wouldn't track the other.
- **Fix**: Extract a shared `canvasToBlob(canvas, mime, quality?)` + `JPEG_QUALITY` into src/lib/engines/image-helpers.ts (the DOM-free-import-safe home of buildGammaLut/deriveDownloadName) and have both call sites use it.
  - Strength: Single source of truth for the JPEG re-encode quality; image-helpers.ts is already the shared home and safe to import from both the engine and the service.
  - Tradeoff: Small refactor touching local-engine.ts (out of this phase's scope) + the new adapter; a follow-up rather than a Phase-4 change.
  - Confidence: HIGH — the duplication is exact and image-helpers.ts is the established pattern.
  - Blind spot: None significant.
- **Decision**: FIXED (differently) — the report's "move into image-helpers.ts" was rejected because that module is deliberately DOM-free (Node-unit-tested); moving `canvas.toBlob` there would break its contract. Instead created a new DOM helper `src/lib/engines/canvas-helpers.ts` exporting a shared `canvasToBlob(canvas, mime, quality?)` + `JPEG_QUALITY`; both `local-engine.ts` and `cloud-result-postprocess.client.ts` now import it (single source of truth, no DOM in the pure module).

### F2 — Object-URL revoke relies on effect-cleanup ordering

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Reliability
- **Location**: src/components/hooks/useCloudJob.ts:307,345,355-359
- **Detail**: The generated object URL is revoked in the effect cleanup, which is sound today: every new result arrives via a dep change that runs cleanup first, and there's no `await` between createObjectURL (345) and setResult (348), so no interleaving leak. But unlike `useLocalEnhance` (which uses a `urlsRef` to revoke a prior URL on replace), this relies on cleanup ordering — more fragile under a future refactor. No leak exists now.
- **Fix**: Add a one-line comment noting the reliance on effect-cleanup ordering (or adopt the urlsRef revoke-prior pattern). Optional hardening.
- **Decision**: FIXED — added an explanatory comment at the sole revoke site (useCloudJob.ts cleanup) documenting why cleanup-ordering is correct (no same-job replace window) and pointing future refactors at the `urlsRef` revoke-prior pattern. No behavior change.
