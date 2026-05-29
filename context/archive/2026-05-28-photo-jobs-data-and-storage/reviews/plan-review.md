<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Photo Jobs Data and Storage (round 3)

- **Plan**: `context/changes/photo-jobs-data-and-storage/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-28
- **Verdict**: REVISE → SOUND (after triage)
- **Findings (round 3)**: 0 critical, 1 warning, 1 observation (both fixed)
- **Cumulative findings (3 rounds)**: 11 total, all fixed

## Verdicts (after round-3 triage)

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING → PASS (F1 fixed) |

## Grounding

tsconfig.json verified — has `"@/*": ["./src/*"]` paths mapping (canonical source for the alias). All 6 plan paths still ✓. Progress↔Phase consistency ✓ — the round-2 renumbering in Phase 5 / Change #1 only affected the procedural Contract steps, not the Success Criteria, so the Progress section still matches.

## Findings (this round)

### F1 — Vitest alias `'@': '/src'` is the filesystem root, not the project src

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — Change #1 contract, vitest.config.ts spec
- **Detail**: `alias: { '@': '/src' }` is an absolute filesystem path (Windows `C:\src` / Unix `/src`), not the project's `src/`. The first `@/lib/supabase` import from tests/env.ts would fail with ERR_MODULE_NOT_FOUND.
- **Fix B (chosen)**: Drop the explicit alias; add `vite-tsconfig-paths` as a devDependency and as a Vitest plugin so the `@/*` mapping is inherited directly from `tsconfig.json`. Eliminates the duplicate-alias drift surface.
- **Decision**: Fixed via Fix B

### F2 — Smoke script reads process.env directly; tests now have a shared admin client

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 — Change #1 contract, step 1
- **Detail**: Round 2 added a shared `supabaseAdmin` to `tests/env.ts`; the smoke script's step 1 still constructed its own via createAdminClient + process.env. The script already imports `deleteTestUser` from tests/helpers, so importing `supabaseAdmin` from the same fixtures is the consistent choice.
- **Fix**: Replaced step 1 with `import { supabaseAdmin as admin } from '../tests/env'`.
- **Decision**: Fixed

## Prior rounds (summary)

**Round 1 (6 findings, all fixed)**:
- F1 (CRITICAL, HIGH) — astro:env/server import blocked Vitest → env-as-parameter factory
- F2 (CRITICAL, LOW) — Vitest 2 vs Vite 7 → pinned vitest@^3
- F3 (WARNING, LOW) — tsx not declared → added tsx@^4
- F4 (WARNING, LOW) — updated_at trigger unspecified → inlined SQL
- F5 (OBSERVATION, LOW) — wrong auth API → auth.admin.createUser
- F6 (OBSERVATION, LOW) — Storage objects leak in tests → list+remove in deleteTestUser

**Round 2 (3 findings, all fixed)**:
- F1 (WARNING, LOW) — Phase 5 contract drift on service signatures → updated calls + added admin construction step
- F2 (OBSERVATION, LOW) — createAdminClient vs createClient asymmetry unstated → added rationale sentence
- F3 (OBSERVATION, LOW) — tests re-build admin client per file → pre-built supabaseAdmin export in tests/env.ts
