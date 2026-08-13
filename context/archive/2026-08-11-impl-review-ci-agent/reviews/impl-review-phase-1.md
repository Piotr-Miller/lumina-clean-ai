<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Plan-Aware CI Implementation Review

- **Plan**: `context/changes/impl-review-ci-agent/plan.md`
- **Scope**: Phase 1 of 4
- **Reviewed commit**: `368672f`
- **Date**: 2026-08-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — PR-body plan override is not anchored

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `.github/workflows/review.yml:82`
- **Detail**: The regex matches `Plan:` anywhere and permits prefixes before the context root. Local reproductions confirmed that both `NotAPlan: context/changes/x/plan.md` and `Plan: docs/context/changes/x/plan.md` select an override. The Phase 1 contract requires an anchored `Plan:` line whose value starts at `context/changes/` or `context/archive/`, so an unintended head blob can replace the conventionally resolved plan.
- **Fix**: Parse a complete, line-anchored `Plan:` value beginning exactly at `context/(changes|archive)/`, and escape the value before logging it.
  - Strength: Restores the explicit trust-boundary contract and prevents accidental or misleading plan selection.
  - Tradeoff: Narrows tolerated PR-body syntax; add shell fixtures for the accepted format.
  - Confidence: HIGH — both false matches were reproduced locally.
  - Blind spot: The plan does not specify whether trailing prose is allowed.
- **Decision**: PENDING

### F2 — Failed Git-object read aborts instead of degrading

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/review.yml:118`
- **Detail**: The regular-blob mode gate is sound, but `git show` is unguarded. A read failure makes the Actions step red under fail-fast behavior, contradicting the contract that failed reads become "no plan". The existing base-rules staging already handles this failure explicitly.
- **Fix**: Stage through `if git show ...`; on failure remove any partial file and export an empty `PLAN_PATH`.
- **Decision**: PENDING

### F3 — Plan-cap tests verify only the boolean flag

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `packages/code-reviewer/src/pipeline.test.ts:155`
- **Detail**: The tests assert `planTruncated` true/false but never observe the returned plan text. Removing the slice or truncation marker would leave them green, although Progress item 1.5 claims the full cap behavior is verified.
- **Fix**: Expose `capPlan` internally to this module's tests and assert unchanged under-cap text plus exact over-cap slicing and marker placement.
- **Decision**: PENDING

### F4 — Two hosted-Actions checks remain pending

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/impl-review-ci-agent/plan.md:489`
- **Detail**: Progress items 1.11 and 1.12 are correctly unchecked. The plan-only no-op behavior, unchanged labels/comment, green run, and hosted log output have not yet been verified in their real Actions environment.
- **Fix**: Exercise a plan-only scratch PR, record its run URL and observations, then mark 1.11–1.12 complete.
  - Strength: Tests the exact environment local package tests cannot model.
  - Tradeoff: Requires a hosted Actions run and provider/repository access.
  - Confidence: HIGH — these are explicitly manual hosted-runtime criteria.
  - Blind spot: This local review cannot inspect a run that has not occurred.
- **Decision**: PENDING

## Verification

- `cd packages/code-reviewer && npm run lint` — PASS
- `cd packages/code-reviewer && npm run typecheck` — PASS
- `cd packages/code-reviewer && npm test` — PASS (17 files, 368 tests)
- Mutation testing — skipped; Phase 1 touches no risk-critical module identified by `context/foundation/test-plan.md` §4.
- Scope guardrails — no prohibited addition found.

## Notes

- Progress items 1.11 and 1.12 remain pending; this review did not change the plan's Progress section.
- A suspected no-override pipeline failure was excluded: the workflow uses GitHub's unspecified Linux shell rather than explicit `shell: bash`, so `pipefail` is not enabled for that step and the final `sed` succeeds when `grep` has no match.
