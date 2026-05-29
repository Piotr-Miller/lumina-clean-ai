<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Local Engine Enhance Flow (S-01)

- **Plan**: `context/changes/local-engine-enhance-flow/plan.md`
- **Mode**: Deep (re-review after first-round F1–F5 triage)
- **Date**: 2026-05-29
- **Verdict**: SOUND
- **Findings**: 0 critical · 1 warning · 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

Paths ✓ (unchanged since first review — `index.astro`, `utils.ts`, `button.tsx`, `SubmitButton.tsx`, `FormField.tsx` exist; new dirs absent). `tests/env.ts` (throws at module-init on missing env, line 8) + `tests/jobs.rls.test.ts` (imports `./env`, line 4) confirmed. Symbols ✓, brief↔plan ✓. Progress↔Phase consistency ✓ (phase blocks now plain `- ` bullets; Progress 1.1–1.3 / 2.1–2.4 / 3.1–3.9 all match). Prior first-round fixes F1–F4 verified in place; F5 intentionally skipped.

## Findings

### F1 — `npm run test` gate pulls in Supabase-dependent integration tests

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 (Automated 1.1) & Phase 3 (Automated 3.1)
- **Detail**: The phase gates said "Unit tests ... pass: `npm run test`" / "All unit tests pass: `npm run test`". But `npm run test` = `vitest run` with `include: tests/**/*.test.ts` — it loads the existing `tests/jobs.rls.test.ts`, which imports `./env` (`tests/env.ts:4→8`) that throws at module init if `SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` aren't exported. So the new pure-helper test (`tests/image-helpers.test.ts`, no Supabase needed) can't be verified via `npm run test` unless the implementer also starts local Supabase — pure busywork for a client-side phase, and a confusing red run otherwise.
- **Fix**: Scope the pure-logic gate to the new file — `npx vitest run tests/image-helpers.test.ts` — for Phase 1 (1.1) and Phase 3 (3.1), with a note that the full `npm run test` (incl. jobs RLS integration tests) needs local Supabase per `tests/README.md`.
- **Decision**: FIXED (Fix in plan) — Phase 1 and Phase 3 automated test gates rescoped to `npx vitest run tests/image-helpers.test.ts` with the full-suite Supabase caveat noted inline.

---

## First-round findings (resolved in prior triage, retained for history)

- **F1 (first round)** — Phase-block `- [ ]` checkboxes broke Progress parsing → **FIXED** (converted to plain bullets).
- **F2 (first round)** — Dimension-guard timing/error surfacing → **FIXED (Fix A + refinement)**: check moved to the hook post-decode; mapped to a specific user-visible message.
- **F3 (first round)** — `bg-cosmic` per-page theme → **FIXED**: index.astro wraps in `bg-cosmic min-h-screen text-white`.
- **F4 (first round)** — Unit-test path/env unpinned → **FIXED**: named `tests/image-helpers.test.ts` + node-env isolation noted.
- **F5 (first round)** — react-compiler imperative-work guidance → **SKIPPED**.
