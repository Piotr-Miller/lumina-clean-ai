<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder File Context

- **Plan**: context/changes/finder-file-context/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-08-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Verification

- Package tests: PASS — 14 files, 265 tests.
- Package typecheck: PASS.
- Targeted ESLint: PASS for `src/cli.ts`, `src/cli.test.ts`, and `src/review-pr.ts`.
- Manual action/workflow diff checks: PASS, with observable evidence matching both checked items.
- Mutation testing: skipped; no reviewed file is a §4 mutation-risk module.
- Progress: 9/14 complete; Phase 3 is the current phase.

## Findings

### F1 — CI step-budget knob is not connected

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `.github/actions/ai-review/action.yml:63`
- **Detail**: The action documents `REVIEW_FINDER_MAX_STEPS` as tunable, but neither the action nor `review.yml` maps a repository variable or input into the process environment. Live CI therefore always uses five steps unless workflow code is changed. GitHub configuration variables must be explicitly accessed through the `vars` context and assigned to `env`; they are not automatically exported. See [GitHub Actions variables documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables).
- **Fix A ⭐ Recommended**: Add a `finder-max-steps` action input, map it to `REVIEW_FINDER_MAX_STEPS`, and pass `${{ vars.REVIEW_FINDER_MAX_STEPS }}` from `review.yml`.
  - Strength: Matches the existing review/judge model input pattern and makes the action contract self-documenting.
  - Tradeoff: Touches both workflow and composite-action configuration.
  - Confidence: HIGH — this is the established configuration pattern in the same action.
  - Blind spot: The preferred operator surface—repository variable or workflow-only setting—has not been explicitly recorded.
- **Fix B**: Export `${{ vars.REVIEW_FINDER_MAX_STEPS }}` directly through the invoking workflow step's `env`.
  - Strength: Minimal one-file change.
  - Tradeoff: The composite action's advertised knob remains implicit and less reusable.
  - Confidence: HIGH — GitHub documents this mapping directly.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — `finder-max-steps` input added to the composite action (mapped to `REVIEW_FINDER_MAX_STEPS`), passed from `review.yml` as `${{ vars.REVIEW_FINDER_MAX_STEPS }}`.

### F2 — Deletion-only diffs validate an inactive knob

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `packages/code-reviewer/src/cli.ts:146`
- **Detail**: `REVIEW_FINDER_MAX_STEPS` is parsed before checking whether the diff contains any reviewable post-change paths. A deletion-only diff with an invalid override exits with code 1, although the plan requires an empty path set to remain tool-less and says the knob is honored only when a source is active.
- **Fix**: Move `parseMaxStepsEnv` inside `if (allowedPaths.size > 0)` and add a deletion-only plus invalid-environment regression test.
- **Decision**: FIXED — `parseMaxStepsEnv` moved inside the `allowedPaths.size > 0` branch; regression test added (deletion-only diff + invalid override → exit 0, no `finderMaxSteps`).
