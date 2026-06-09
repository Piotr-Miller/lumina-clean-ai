<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Gate the floor — wire the existing Vitest suite (incl. Docker/RLS) into CI

- **Plan**: context/changes/testing-ci-gate/plan.md
- **Scope**: Phase 1 + 2 of 2 (full plan)
- **Date**: 2026-06-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (1 observation) |

## Findings

### F1 — Uncommitted `timeout-minutes: 15` on the integration job

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .github/workflows/ci.yml:48-53 (working tree, HEAD vs WT)
- **Detail**: The working tree carries a `timeout-minutes: 15` hunk on the `integration` job (with a rationale comment) that is in NO commit — not 7bf7ebb, not a7086aa — and not in the plan. It's sound hardening that complements the F1 boot-retry tradeoff, but it sits dirty: it never landed as part of this change's Phase-1 work, so it's at risk of being lost or later swept into an unrelated commit. Phase 1 was reported complete and committed, yet ci.yml is still modified.
- **Fix**: Commit the hunk to ci.yml as a small Phase-1 follow-up (e.g. `ci(testing-ci-gate): bound integration job runtime`), or revert it if unintended. Don't leave it dangling in the tree.
- **Decision**: FIXED — committed e648933 (`ci(testing-ci-gate): bound integration job runtime`)

### F2 — Phase 2 edited test-plan.md §1 beyond the listed Contract

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:33-37 (§1 Strategy)
- **Detail**: The plan's Phase-2 Contract for test-plan.md listed §5, §6.2, §3, §8. I additionally rewrote §1's "not yet wired into CI" claim, which was now factually false. This is benign, in-spirit ("sync docs") drift — flagged only so the EXTRA edit is on record, not hidden.
- **Fix**: No fix needed — consistency improvement, in scope of "sync stale docs".
- **Decision**: PENDING

### F3 — Phase 1 manual 1.5 marked complete via reasoning, not an observed run

- **Severity**: 📝 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-ci-gate/plan.md:213 (Progress 1.5)
- **Detail**: 1.5 ("PR shows ci+integration green; deploy doesn't run on PR") is checked with an "accepted structurally" note — proven from the `if: github.event_name == 'push'` guard rather than an observed PR run. The plan's Phase-1 Implementation Note explicitly asked to "pause for human confirmation that a real PR/push run was observed green." The a7086aa quote-strip fix is strong evidence a real CI run *did* happen (the integration job booted and exposed the URL-quoting bug), so the structural acceptance is defensible — but the final all-green state (all 11 files + deploy gated) is worth confirming you actually saw.
- **Fix**: Confirm a real green ci+integration run was observed on the Actions tab (or note the run URL); otherwise leave 1.5–1.8 as the structural acceptance already recorded.
- **Decision**: PENDING
