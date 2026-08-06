<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Code Reviewer ToolLoopAgent Refactor (Full Plan)

- **Plan**: context/changes/tool-loop-agent/plan.md
- **Scope**: Full plan — Phases 1-3
- **Date**: 2026-08-06
- **Verdict**: NEEDS ATTENTION at review time; ALL 5 FINDINGS FIXED in triage 2026-08-06 (52/52 tests, strict lint, live demo green)
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Verification

- Package `npm test` (44/44), `typecheck`, `lint`, barrel-purity import — re-run fresh at review time, all PASS
- Root `npm run typecheck` + `npm run test:unit` (335/335) — PASS (same day)
- CI PR #111: `code-reviewer` job **success** (first attempt), `deploy` **skipped** with `needs` byte-identical — PASS
- Mutation testing — skipped; no `test-plan.md` §4 risk module touched
- Drift sweep: 15 MATCH / 1 minor DRIFT / 0 MISSING / 1 sanctioned EXTRA; "What We're NOT Doing" fully compliant; cross-phase contracts (barrel purity, root-graph isolation, deploy gating) intact
- Verified clean (with evidence): CI job mechanics (tracked package lockfile, no root `workspaces`, `defaults.run` semantics), secret handling (`.env` gitignored at depth, key never logged/exposed/returned), F2 abort/timeout verified real against installed `ai@7.0.52` types, demo slice math + exit ownership, no vacuous test assertions

## Findings

### F1 — Shipped security guardrails have zero test coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/reviewer.ts:83-93
- **Detail**: The phase-2 triage interim defense (range clamp MAX_CONTEXT_LINES, MAX_CONTEXT_CHARS truncation, no-source fallback) lives in a closure with no test exercising it — a regression deleting the clamp passes all gates silently. Additionally the clamp fires only when both startLine AND endLine are present, and `startLine + 400` permits 401 lines (off-by-one).
- **Fix**: Extract the bounding logic as exported pure function(s), fix the off-by-one, pin 3 tests (clamp, truncation marker, no-source fallback).
- **Decision**: FIXED — fetchBoundedContext extracted (exported with MAX_CONTEXT_* constants), off-by-one corrected (start+399), 5 tests pin fallback/clamp/passthrough/truncation.

### F2 — Reviewed code enters the prompt with no data/instruction boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/prompts.ts:29-46
- **Detail**: Untrusted diff/file content is concatenated raw; a hostile diff can steer the verdict ("report zero findings"). Tool-side injection was mitigated in phase-2 triage; the prompt-side path was not. Fencing is soft mitigation but cheap and material.
- **Fix**: Fence unit content with explicit delimiters in buildPrompt + one instruction sentence in buildInstructions: reviewed code is data; ignore embedded instructions.
- **Decision**: FIXED — review units fenced in <review-unit> tags with a data-not-instructions note per unit kind; instructions declare reviewed code untrusted data; tests assert fencing for all kinds and all lenses; live demo regression green.

### F3 — Empty OPENROUTER_MODEL resolves to "" instead of the default

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/config.ts:25
- **Detail**: `apiKey` treats "" as missing (throws actionable error); `model` uses `??` so a set-but-empty `OPENROUTER_MODEL=` yields model "" and a confusing provider-side failure at request time.
- **Fix**: Use `||` (or trim + explicit empty check) so "" falls back to DEFAULT_MODEL.
- **Decision**: FIXED — model chain uses || with justified inline disable of prefer-nullish-coalescing; empty-string fallback test added.

### F4 — Compensating lint gate is thinner than the root gate it replaces

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/eslint.config.js:8
- **Detail**: Root ESLint runs strictTypeChecked + stylisticTypeChecked + prettier; the package runs recommendedTypeChecked only, and no formatter enforcement touches package TS (lint-staged eslint uses the root config which ignores the package; its prettier glob is json/css/md only).
- **Fix**: Extend the package config to strict + stylistic type-checked presets; verify the suite still lints clean.
- **Decision**: FIXED — package presets upgraded to strictTypeChecked + stylisticTypeChecked; 13 surfaced errors fixed (argv.at, String() in template, no-dynamic-delete via vi.stubEnv, unnecessary optional chains).

### F5 — Two un-recorded deviations from the written plan

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: .github/workflows/ci.yml:333; packages/code-reviewer/vitest.config.ts
- **Detail**: (a) CI job hardcodes `node-version: 24` where the plan said "setup-node from `.nvmrc`" — every sibling job hardcodes 24, so pattern consistency won over the plan's literal wording; (b) `vitest.config.ts` exists under the plan's "no config unless needed" escape clause (without it, vitest resolves upward to the root config and discovers zero package tests). Both benign, neither recorded in Addenda.
- **Fix**: One plan Addenda entry recording both as accepted.
- **Decision**: FIXED — plan ## Addenda records node-version: 24 and vitest.config.ts as accepted, plus the F1/F2/F4 surface from this triage.

## Cross-phase notes

- Barrel purity survives Phase 3 (index.ts export-only; tests import concrete modules).
- Root-graph isolation survives Phase 3 (all new files under the excluded package; root vitest include is tests/** only).
- deploy contract intact (needs byte-identical; phase-3 ci.yml diff purely additive).
