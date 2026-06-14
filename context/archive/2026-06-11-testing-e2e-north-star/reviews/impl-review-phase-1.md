<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: E2E North-Star — Phase 1 (Pipeline harness)

- **Plan**: context/changes/testing-e2e-north-star/plan.md
- **Scope**: Phase 1 of 4
- **Date**: 2026-06-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success criteria (re-verified)

- 1.1 `npx vitest run tests/replicate-stub.helpers.test.ts tests/replicate-webhook.test.ts` → 38 passed
- 1.2 `deno check --config supabase/functions/enhance/deno.json …/index.ts` → exit 0
- 1.3 eslint → 0 errors (1 expected ignore-warning: the Deno function file is excluded from the Astro graph per lessons.md); `tsc --noEmit` → exit 0
- 1.4 / 1.5 live seam ON/OFF round-trip on the local stack → PASS (succeeded+retention / 200+failed+callback_failed+source-gone)

## Findings

### F1 — Redundant relative import path in the hermetic test

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/replicate-stub.helpers.test.ts:3
- **Detail**: Imported `../tests/e2e/helpers/replicate-stub` (up to repo root and back down). Resolved fine but read oddly; sibling-relative is clearer.
- **Fix**: Change to `./e2e/helpers/replicate-stub`.
- **Decision**: FIXED (applied during triage; vitest re-run green — lands in the Phase 2 commit)

### F2 — Prod must never set E2E_ALLOWED_OUTPUT_ORIGIN — only documented in a code comment

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/functions/enhance/index.ts (seam call site)
- **Detail**: The seam is default-off and verified so (1.5: env unset → disallowed → failed). The only residual risk is setting the env in prod, which would widen the SSRF allowlist. Documented inline but not in any operational doc.
- **Fix**: Add a "never set in prod" note to the seam's operational docs in Phase 4 (cloud-live-smoke.md / CLAUDE.md).
- **Decision**: DEFERRED → Phase 4 (queued in follow-ups/review-fixes.md)
