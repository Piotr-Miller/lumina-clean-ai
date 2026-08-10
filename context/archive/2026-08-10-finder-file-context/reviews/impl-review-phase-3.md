<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder File Context

- **Plan**: context/changes/finder-file-context/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-08-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Findings

### F1 — Cost gate is not proven by a controlled comparison

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/finder-file-context/verification.md:72
- **Detail**: The tool-loop proof consumed 77,341 tokens versus 18,836 for the same-diff tool-less baseline: approximately 4.1×, above the planned ~3× threshold. The claimed 2.8× result compares against a different, larger feature diff. Both comparisons also change model and step budget, so neither isolates the file-context loop's cost. Progress item 3.5 is marked complete.
- **Fix A ⭐ Recommended**: Run one controlled comparison using the same diff, model, and five-step budget, then update the evidence.
  - Strength: Directly verifies the stated cost guardrail.
  - Tradeoff: Requires another paid scratch run.
  - Confidence: HIGH — it removes the documented confounders.
  - Blind spot: Provider output length remains nondeterministic.
- **Fix B**: Explicitly accept the observed variance in a Phase 3 addendum and document that the ~3× threshold was waived.
  - Strength: Makes the recorded decision honest without more spend.
  - Tradeoff: Loosens the original cost guardrail.
  - Confidence: HIGH — the existing measurements support this wording.
  - Blind spot: Actual tool overhead remains unisolated.
- **Decision**: FIXED via Fix B — addendum in verification.md §3: ~3× threshold explicitly waived (confounders documented); isolated same-diff/same-model/fixed-budget measurement deferred to `finder-tool-loop-evals`. plan.md 3.5 annotated.

### F2 — Final-step guard is tested below the SDK boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/reviewer.test.ts:77
- **Detail**: The test calls `prepareFinalStep` directly. It would remain green if `createReviewer` stopped wiring the helper into `ToolLoopAgent`. The live probe proves today's implementation works, but the repeatable suite would not catch that regression.
- **Fix**: Add a `MockLanguageModelV3` provider-level test asserting that the final request exposes no tools, emits structured output, and never exceeds `maxSteps`.
  - Strength: Matches the package's existing provider-attempt tests.
  - Tradeoff: Requires a more involved mocked tool-call sequence.
  - Confidence: HIGH — the same test infrastructure already exists.
  - Blind spot: Mock serialization may not reproduce every provider quirk.
- **Decision**: FIXED — provider-level test in provider-attempts.test.ts: fetch-happy MockLanguageModelV3 (always tool-calls when tools offered), asserts tool offering sequence [1,1,0] across maxSteps=3 and that the structured review is emitted within the budget.

### F3 — Cross-hunk prompt behavior is not regression-pinned

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/src/prompts.ts:43
- **Detail**: The probe-born function-signature/constant/module-contract guidance is not asserted by `prompts.test.ts`; only generic `getFileContext` presence and absence is tested.
- **Fix**: Add semantic assertions that the cross-hunk guidance appears only when the file-context tool is enabled.
- **Decision**: FIXED — prompts.test.ts asserts the trigger-class phrases ("defined in the unchanged part of a changed file", "documented module contract") appear with the tool and are absent without it.

## Verification

- `verification.md` exists: PASS.
- Feature run `31425307805`: PASS — successful artifact contains `finderTelemetry`.
- Scratch run `31428446096`: PASS — two context calls, cross-context finding confirmed, both requested files were in the PR diff.
- PR #121: closed, unmerged; scratch branch deleted.
- Package tests: PASS — 14 files, 267 tests.
- Package typecheck: PASS.
- Targeted ESLint on Phase 3 package files: PASS.
- Mutation testing: skipped; Phase 3 touched no mapped risk-critical application module.
