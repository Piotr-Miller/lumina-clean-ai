<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bread chroma post-pass — Phase 5 (Tune + GO/NO-GO)

- **Plan**: context/changes/bread-chroma-postpass/plan.md
- **Scope**: Phase 5 of 5
- **Date**: 2026-06-25
- **Verdict**: APPROVED (one CI-blocking lint finding fixed during review)
- **Findings**: 1 critical (fixed) · 0 warnings · 2 observations

## Verdicts

| Dimension           | Verdict                       |
| ------------------- | ----------------------------- |
| Plan Adherence      | PASS                          |
| Scope Discipline    | PASS                          |
| Safety & Quality    | PASS                          |
| Architecture        | PASS                          |
| Pattern Consistency | PASS (1 observation)          |
| Success Criteria    | PASS (after F1 fix; was FAIL) |

## Summary

Phase 5 changed exactly one production constant — `DEFAULT_CHROMA_PARAMS` →
`{ blurRadius: 3, maxStrength: 0.9, shadowCurve: 2.5 }` — left the algorithm
intact, and the gating flag `CHROMA_POSTPASS_ENABLED` is still `false`. The
`tuning-results.md` decision record contains all eight required elements with an
explicit ✅ GO and an explicit flag-stays-OFF statement; ~12 MP median ≈ 433 ms
(≪ 2 s gate). Unit tests (208) and typecheck pass. The one real defect was a
CI-blocking lint failure introduced by a committed generated bundle — fixed
during this review (F1).

Note on the plan note's param labels: the planning shorthand listed
`(radius=3, curve=0.9, maxStrength=2.5)`, but `maxStrength` is validated to
`[0,1]`, so `2.5` can only be `shadowCurve`. The implemented
`maxStrength=0.9, shadowCurve=2.5` is the internally-consistent, correct tuning
— the note's two values were transposed, the code is right.

## Findings

### F1 — `npm run lint` fails: generated IIFE harness bundle is linted

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/bread-chroma-postpass/ab-harness/chroma-denoise.iife.js (107 errors); eslint.config.js:100
- **Detail**: The phase-5 commit `ac94c04` committed `chroma-denoise.iife.js`, a
  machine-emitted esbuild IIFE build artifact for the static A/B harness. ESLint
  (which only ignored `supabase/functions/**`) linted it, producing 107 errors
  (`@typescript-eslint/no-unsafe-*`, `prettier/prettier`) → `npm run lint` exits
  1. Progress item 5.3 ("Linting passes") was marked `[x]` but lint was actually
     RED; a push would fail CI's `ci` lint job. (The Phase-5 push hook does not run
     lint — only typecheck + unit — so it was not caught locally; the background
     verification's `| tail` had also swallowed lint's non-zero exit.)
- **Fix**: Add `{ ignores: ["**/*.iife.js"] }` to `eslint.config.js` so generated
  IIFE bundles are excluded from lint.
- **Decision**: FIXED (eslint.config.js — `**/*.iife.js` ignore added; `npm run lint` → exit 0)

### F2 — Committed IIFE bundle is a build-artifact fork that can drift from source

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/changes/bread-chroma-postpass/ab-harness/chroma-denoise.iife.js
- **Detail**: Unlike `scripts/benchmarks/chroma-denoise-bench.ts` (which imports
  the real `src/lib/engines/chroma-denoise.ts` and cannot drift), the harness
  bundle is a checked-in copy of the algorithm. It is currently byte-consistent
  with source (same defaults `{3, 0.9, 2.5}`, same coefficients), but a future
  edit to the source that forgets to regenerate the bundle leaves a stale
  harness. Acceptable for throwaway tuning tooling.
- **Fix**: Note in `ab-harness/README.md` that the IIFE must be regenerated when
  `chroma-denoise.ts` changes (or generate it at harness-launch).
- **Decision**: PENDING

### F3 — A/B quality decision rests on synthetic ground-truth injection, not real Bread output

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/bread-chroma-postpass/tuning-results.md
- **Detail**: The real low-light samples lacked flat-shadow chroma noise, so the
  decisive quality test was a synthetic ground-truth injection (`maxΔY ≈ 0`, no
  bleeding). This is disclosed in the doc, not hidden, and the flag stays OFF —
  but real-Bread visual confirmation is deferred to the future enable change.
- **Fix**: When the production-enable follow-up is opened, gate it on a real-Bread
  before/after on genuinely noisy shadows.
- **Decision**: PENDING (tracked for the enable follow-up)
