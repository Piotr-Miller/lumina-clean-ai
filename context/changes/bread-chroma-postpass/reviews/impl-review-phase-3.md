<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bread chroma-denoise post-pass + pinned version resolution

- **Plan**: `context/changes/bread-chroma-postpass/plan.md`
- **Scope**: Phase 3 of 5
- **Date**: 2026-06-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Verification

- Reviewed Phase 3 commit `7dab1a2`; its source and test files match the planned file scope.
- `npm run test:unit` — PASS, 18 files and 193 tests, including 10 chroma-denoise tests.
- `npm run typecheck` — PASS.
- `npm run lint` — PASS with 0 errors and 51 pre-existing `no-console` warnings outside Phase 3.
- `npx eslint src/lib/engines/chroma-denoise.ts tests/chroma-denoise.test.ts` — PASS with no findings.
- Manual criteria — none for Phase 3.
- Mutation testing — skipped: Phase 3 does not touch a risk-critical module identified by `context/foundation/test-plan.md`.
- Adversarial probe — a black pixel beside saturated blue changed from `[0,0,0]` to `[0,0,60]`; BT.601 luma drifted from `0` to `6.84`.
- Invalid-parameter probe — `blurRadius: 0.5` changed uniform `[20,10,10]` to `[0,105,0]`; `shadowCurve: -1` changed white to black.

## Findings

### F1 — Unvalidated parameters can corrupt output or hang processing

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/engines/chroma-denoise.ts:148`
- **Detail**: `blurRadius`, `maxStrength`, and `shadowCurve` are used without runtime validation. A fractional radius breaks the sliding-window indexing and produced a severe green cast in a uniform-pixel probe. A negative shadow curve changed white to black. `blurRadius: Infinity` would make the kernel initialization loop non-terminating. The function is an exported reusable boundary and Phase 5 will tune these values, so TypeScript alone does not enforce the documented numeric domain at runtime.
- **Fix**: Validate parameters before full-frame allocation: require a finite integer radius within a conservative hard cap, finite `maxStrength` in `[0,1]`, and a finite positive `shadowCurve`; add adversarial rejection tests.
- **Decision**: FIXED — added fail-fast validation before full-frame allocation and adversarial tests for fractional, infinite, NaN, negative, and excessive values.

### F2 — RGB clamping breaks the original-luminance guarantee at gamut boundaries

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `src/lib/engines/chroma-denoise.ts:189`
- **Detail**: The implementation recombines with the original mathematical Y, but assigning out-of-gamut RGB values to `Uint8ClampedArray` clamps channels independently and can materially change final luminance. In an adversarial two-pixel `[black, saturated blue]` input, the black pixel became `[0,0,60]`, moving BT.601 luma from `0` to `6.84` and creating a visible blue halo. The existing luminance test uses moderate synthetic colors and does not cover gamut-boundary or sharp chroma-edge cases, so the planned per-pixel luminance invariant is not fully met.
- **Fix**: Before writing RGB, scale the chroma displacement toward the original chroma by the largest factor that keeps reconstructed RGB in gamut, then add black/saturated-color and sharp chroma-boundary luminance tests.
  - **Strength**: Preserves the phase's core promise without reducing denoise strength for pixels that already remain in gamut.
  - **Tradeoff**: Adds per-pixel arithmetic to a main-thread algorithm whose 12 MP performance budget must be measured in Phase 5.
  - **Confidence**: HIGH — the failure is reproducible and follows directly from independent channel clamping.
  - **Blind spot**: The performance cost and visual behavior on the representative photo set have not yet been measured.
- **Decision**: FIXED — gamut-bound chroma displacement is now scaled uniformly before writing RGB, preserving luminance at saturated boundaries; an adversarial black/blue edge test locks the behavior.

### F3 — Range and NaN assertion cannot detect numeric corruption

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `tests/chroma-denoise.test.ts:116`
- **Detail**: The test asserts that values read from a `Uint8ClampedArray` are within `[0,255]` and not NaN. That is guaranteed by the container itself: out-of-range writes are clamped and NaN writes become `0`. Both invalid-parameter corruptions from F1 still pass this test, so it does not prove meaningful algorithm correctness.
- **Fix**: Replace the tautological assertions with adversarial expected-output, invalid-parameter, and bounded-luminance-drift cases covered by F1 and F2.
- **Decision**: FIXED — removed the tautological typed-array range test; adversarial parameter validation and gamut-bound luminance tests now cover the meaningful failure modes.

## Triage Summary

- **Fixed**: F1, F2, F3
- **Skipped**: none
- **Accepted**: none
- **Pending**: none

## Post-triage Verification

- `npm run test:unit` — PASS, 18 files and 203 tests.
- `npm run typecheck` — PASS.
- `npx eslint src/lib/engines/chroma-denoise.ts tests/chroma-denoise.test.ts` — PASS.
- Prettier check and `git diff --check` — PASS.
