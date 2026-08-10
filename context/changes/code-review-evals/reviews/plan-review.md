<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Promptfoo Finder-Model Eval (First Configuration)

- **Plan**: `context/changes/code-review-evals/plan.md`
- **Mode**: Deep — Phase 1 focus
- **Date**: 2026-08-10
- **Verdict**: REVISE → SOUND (all 5 findings fixed in triage, 2026-08-10)
- **Findings**: 1 critical, 4 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

Grounding: 10/10 existing paths ✓, 6/6 symbols ✓, Progress contract ✓, brief↔plan ✗. The planned new fixture path is correctly absent before implementation. OpenRouter currently confirms the candidate IDs and Qwen's missing `structured_outputs` capability; the Promptfoo grader and CLI assumptions are otherwise supported by the official documentation.

## Findings

### F1 — The 2-of-3 recall gate actually requires 3-of-3

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — React test case
- **Detail**: The plan says `0.67 ⇒ ≥2 of 3` at `plan.md:89`. However, `scoreIssueRecall` computes the unrounded ratio and compares it to `0.67` at `assertions.mjs:31-34`, while `promptfooconfig.yaml:36` repeats that threshold. Since `2 / 3 = 0.666…`, detecting two flaws fails.
- **Fix**: Make integer hit-count logic authoritative—such as `hits >= Math.ceil(expectedIssues.length * 2 / 3)`—remove the rounded YAML threshold, and add a zero-cost self-check proving that 2/3 passes while 1/3 fails.
- **Decision**: FIXED — plan change #4 added in Phase 1 (integer hit-count in `scoreIssueRecall`, YAML threshold removed, `recall-selfcheck.mjs` + Progress 1.3)

### F2 — The retained loop case is not a reliable canary

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Existing JS-loop case
- **Detail**: Only the out-of-bounds access is unequivocally defective. The expected coercive-equality and function-scoped-`var` findings at `promptfooconfig.yaml:64-73` are debatable without a type contract or observable scope bug. A healthy model following “report only issues worth fixing” may therefore fail this supposed harness canary.
- **Fix**: Keep only the indisputable out-of-bounds issue as canary ground truth and require one hit.
- **Decision**: FIXED — plan change #5 added in Phase 1 (loop-case `expectedIssues` reduced to out-of-bounds only; integer gate makes 1 hit required)

### F3 — Lint and typecheck do not validate the changed harness surfaces

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phases 1–2 — Automated verification
- **Detail**: The plan claims all wiring is lint/typecheck-verified before paid execution at `plan.md:44`, but ESLint covers only TypeScript at `eslint.config.js:7`, and tsc likewise excludes `assertions.mjs` and YAML at `tsconfig.json:10`.
- **Fix**: Add `node --check evals/assertions.mjs` and `npx promptfoo validate config -c evals/promptfooconfig.yaml` to the automated criteria before any live call.
- **Decision**: FIXED — both checks added to Phase 1 and Phase 2 automated criteria (+ Progress 1.4/2.3); Implementation Approach claim reworded

### F4 — Expected provider errors cannot populate every metric

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State and Phase 3 verification
- **Detail**: The plan requires all metrics on every React row at `plan.md:21`, while also expecting schema-flake provider errors at `plan.md:214`. Promptfoo documents that error rows may have no `gradingResult` or component assertions, so those goals cannot both hold. The brief's “full matrix runs green” criterion has the same contradiction.
- **Fix**: Require all six metrics only on successful provider rows; require error rows to remain visible, attributed, and included in each model's failure-rate denominator.
- **Decision**: FIXED — Desired End State, Critical Implementation Details, Phase 3 manual criterion, testing step 2, and Progress 3.2 all rescoped to successful-rows-only + visible/counted error rows

### F5 — Results retention contradicts itself

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Scope and Phase 3 — Results snapshot
- **Detail**: `plan.md:40` says no results are committed, while `plan.md:177` explicitly commits the selected snapshot. The brief repeats both positions.
- **Fix**: State that SQLite history and exploratory outputs stay local, while selected decision snapshots are committed under the change folder; export without rerunning via `promptfoo export eval latest -o <path>` and inspect the export before committing because prompts and outputs may contain user data.
- **Decision**: FIXED — scope bullet + Phase 3 §2 contract reconciled (local-vs-committed split, `promptfoo export eval latest`, inspect-before-commit); plan-brief.md results-policy row + out-of-scope line aligned
