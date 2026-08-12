<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder Tool-Loop Evals + Model Decision

- **Plan**: context/changes/finder-tool-loop-evals/plan.md
- **Scope**: Phase 2 of 4
- **Date**: 2026-08-11
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

## Findings

### F1 — Contradictory telemetry passes `tool_required`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/evals/assertions.mjs:100
- **Detail**: `requireToolContext` computes whether the tool was invoked, but its top-level verdict only checks whether the required path appears in `deliveredPaths`. A reproduction with `toolCalls: 0` and the required path marked delivered returns `pass: true`, contradicting the Phase 2 contract that zero-call and unreadable telemetry fail closed. `readToolTelemetry` also accepts non-finite and negative call counts.
- **Fix**: Validate a finite, non-negative integer count; require invocation, request, and delivery together; add contradictory and non-finite telemetry regressions to both free gates.
- **Decision**: ACCEPTED — fixed as prescribed. `readToolTelemetry` now requires
  `Number.isInteger(toolCalls) && toolCalls >= 0`; `requireToolContext` passes only on
  `delivered && invoked && requested` and reports a distinct "Telemetry contradicts itself" reason
  rather than a generic miss, so a broken instrument reads as broken rather than as a zero-call
  model. Regressions in both free gates (2 unit cases + 5 parameterized count cases + 2 self-check
  cases).

### F2 — Generic wording falsely earns cross-hunk recall

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/promptfooconfig.yaml:193
- **Detail**: The broad expected-issue pattern `hardcod` awards full `issue_recall` to a generic observation such as “the hardcoded 0.5 should be configurable.” The adjacent rubric explicitly says that observation must fail unless it connects the literal to the out-of-hunk shared-constant contract. The full row remains protected by `tool_required` and the rubric, but Phase 3's named recall metric can misrepresent model quality.
- **Fix**: Replace `hardcod` with contract-specific matching and add a regression proving generic literal criticism misses while shared-constant reasoning hits.
- **Decision**: ACCEPTED — fixed as prescribed. `hardcod` is gone; the four remaining patterns each
  require contract reasoning (`JPEG_QUALITY`, `single[- ]source`,
  `shared (jpeg )?(re-?encode )?(quality )?constant`, `documented (module )?(invariant|contract)`).
  The regression is a new hermetic gate, `evals/promptfooconfig.test.ts`, which parses the ACTUAL
  config (`js-yaml` promoted from a transitive promptfoo dep to an explicit devDependency, so the
  test does not silently rely on hoisting) and asserts 3 generic wordings miss while 4 contract
  wordings hit. It also pins two structural invariants the plan calls out: `scoreIssueRecall` stays
  off `defaultTest`, and every case's graders match its vars (recall iff `expectedIssues`,
  `tool_required` iff `requiredContextPath`, tool graders only with a `fixtureRoot`).

## Verification Evidence

- `npm test` — passed: 16 files, 337 tests.
- `node evals/recall-selfcheck.mjs` — passed: 16 self-check cases.
- `node --check evals/assertions.mjs` — passed.
- `npx promptfoo validate config -c evals/promptfooconfig.yaml` — passed: `Configuration is valid.`
- Manual criterion 2.5 is reproducible through the committed unit tests and bare-node self-check.
- Manual criterion 2.6 is recorded in `verification.md` as eval `eval-1YY-2026-08-11T18:15:38`; it was not rerun during review because it is paid/manual.
- Mutation testing skipped: Phase 2 touches no risk-critical application module.
