<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Local Engine Enhance Flow (S-01)

- **Plan**: `context/changes/local-engine-enhance-flow/plan.md`
- **Scope**: Phase 1 of 3 (Engine seam & processing logic)
- **Date**: 2026-05-29
- **Verdict**: APPROVED
- **Findings**: 0 critical · 0 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success Criteria (re-verified)

- 1.1 Unit tests — `npx vitest run tests/image-helpers.test.ts` → 12/12 pass.
- 1.2 Type checking — `npx astro check` → 0 errors (4 pre-existing hints in `eslint.config.js`, unrelated).
- 1.3 Lint — `npx eslint` on the four touched files → clean (exit 0) after prettier-write.
- No Manual items in Phase 1.

## Files reviewed

- `src/lib/engines/types.ts` — MATCH (`ImageEngine` seam; `id` widened to `EngineId = "local"|"cloud"` per the approved S-03 adaptation).
- `src/lib/engines/image-helpers.ts` — MATCH (constants, `validateImageFile` type+size only with friendly HEIC reject, `buildGammaLut`, `deriveDownloadName`; DOM-free → node-test-safe).
- `src/lib/engines/local-engine.ts` — MATCH (native blur + gamma LUT full-res, source-mime blob, GAMMA/BLUR_PX commented, no dimension check by design).
- `tests/image-helpers.test.ts` — MATCH (12 tests across all three helpers).

Both review agents confirmed: no DRIFT / MISSING / problematic EXTRA; image math correct (gamma>1 brightens, RGBA stride correct, alpha untouched); canvas boundaries handled (`getContext` null, `toBlob` null); pattern compliance strong (module/JSDoc/const/test idioms match `photo-job.service.ts` + `jobs.rls.test.ts`).

## Findings

### F1 — MAX_IMAGE_DIMENSION defined but enforced only by the (future) hook

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture (cross-phase)
- **Location**: `src/lib/engines/image-helpers.ts:23`, `src/lib/engines/local-engine.ts:45`
- **Detail**: The `MAX_IMAGE_DIMENSION` OOM guard is defined and documented but not enforced yet — by design, the Phase 3 `useLocalEnhance` hook performs the post-decode check. `localEngine.enhance` is the public engine contract and allocates a full-res canvas for any source, so a future caller bypassing the hook could OOM. This is the plan's intended design (engine assumes a validated source); flagged only as a cross-phase tracking item.
- **Fix**: No Phase-1 change required — verify in Phase 3 that the hook performs the `MAX_IMAGE_DIMENSION` check before calling `enhance`. Optionally add a one-line defensive clamp/throw at the top of `enhance`.
- **Decision**: TRACKED — carry into Phase 3 hook implementation.

## Note

Status left at `implementing` (not `impl_reviewed`) — this is a mid-implementation phase checkpoint; implementation continues with Phase 2.
