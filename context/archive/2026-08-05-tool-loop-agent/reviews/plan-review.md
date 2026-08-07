<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Code Reviewer ToolLoopAgent Refactor

- **Plan**: `context/changes/tool-loop-agent/plan.md`
- **Mode**: Deep — Phase 1 focus
- **Date**: 2026-08-05
- **Verdict**: REVISE
- **Findings**: 1 critical, 1 warning, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

7/7 paths ✓, 5/5 symbols ✓, brief↔plan ✓, Progress 11/11 criteria ✓.

- Root `npm run typecheck` exited 0 while still including the package.
- Package-local `npm run typecheck` exited 0.
- Direct root ESLint of the package did not complete within the 125-second diagnostic timeout.
- No `docs/reference/contract-surfaces.md` exists, so the optional contract-surface scan was skipped.

## Findings

### F1 — Isolation removes every durable quality gate from the package

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Root-Graph Isolation
- **Detail**: Phase 1 excludes `packages/**` from root TypeScript and ESLint, but nothing replaces those checks. CI installs only the root lockfile and runs root lint/tests; it never enters `packages/code-reviewer`. Pre-push runs only root typecheck and root unit tests. Root Vitest includes only `tests/**/*.test.ts`, excluding the planned package tests. The package currently has typecheck but no lint script or configuration. The plan cites the Deno exclusion precedent but omits its essential second half: excluded code needs a compensating dedicated check. The blanket `packages/**` ignore also makes every future package opt out of root validation automatically.
- **Fix A ⭐ Recommended**: Keep the package standalone and add dedicated validation. Scope the ignores to `packages/code-reviewer`, add package-local linting, and add a CI job that runs package `npm ci`, lint, typecheck, and tests.
  - Strength: Preserves package isolation with a small, explicit validation boundary.
  - Tradeoff: Separate dependency installation and some duplicated tooling.
  - Confidence: HIGH — matches the existing Deno “exclude then compensate” convention.
  - Blind spot: Decide whether package checks should also join pre-push or remain CI-only.
- **Fix B**: Formalize npm workspaces and aggregate package checks through root scripts.
  - Strength: One dependency graph and one standard command surface.
  - Tradeoff: Much larger lockfile, installation, build, and deployment blast radius than this change needs.
  - Confidence: MEDIUM — viable, but monorepo integration has not been assessed.
  - Blind spot: Potential effects on Astro/Cloudflare installation and build behavior.
- **Decision**: PENDING

### F2 — Phase 1 verification does not prove isolation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria
- **Detail**: Root `npm run typecheck` already passes while compiling the package, so “exits 0” does not establish that the exclusion worked. “`npm run lint` output is unchanged versus before” has no captured baseline and is not a reproducible assertion. The criteria prove neither TypeScript isolation nor replacement package ownership.
- **Fix**: Add a mechanical assertion that the resolved root TypeScript file set contains no `packages/code-reviewer/src/**` entries, retain the explicit ESLint-ignore assertion, and add runnable criteria for the replacement package checks.
- **Decision**: PENDING
