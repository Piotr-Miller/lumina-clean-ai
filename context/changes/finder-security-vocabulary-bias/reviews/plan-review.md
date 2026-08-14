<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Finder Precision on Hardening Diffs

- **Plan**: `context/changes/finder-security-vocabulary-bias/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-14
- **Verdict**: RETHINK
- **Findings**: 3 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | FAIL    |

## Grounding

Grounding: 15/15 paths ✓, 6/6 symbols ✓, brief↔plan ✓, Progress 41/42 ✗

Targeted verification: 105/105 tests passed ✓

## Findings

### F1 — Fabrication matcher misses ordinary and historically observed wording

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: `packages/code-reviewer/evals/assertions.mjs:272`, `packages/code-reviewer/evals/promptfooconfig.yaml:278`
- **Detail**: The shipping matcher returned `fabrication: false` for all six realistic defect descriptions tested:
  - “The code does not validate the object key before download.”
  - “The object key isn't checked before it reaches storage.”
  - “The function omits validation of rawKey.”
  - “This allows path traversal outside the user's folder.”
  - “parseObjectKey is never called before the path is built.”
  - “The regex allows arbitrary characters, including ../.”

  The last form closely matches the historical F2 language recorded in `research.md:366`. This can suppress `fabrication_runs` and falsely classify a genuinely vulnerable fixture as `INVALID-FIXTURE`.

- **Fix**: Expand the deterministic matcher and regression corpus before Phase 2. Cover direct negated verbs, contractions, omission wording, attack-enabling predicates, `parseObjectKey`, and permissive-regex/arbitrary-character language.
- **Strength**: Hermetic and directly protects the measurement.
- **Tradeoff**: Lexical matching will still require maintenance for future paraphrases.
- **Confidence**: HIGH — reproduced against the shipping matcher.
- **Blind spot**: Unseen semantic equivalents can still escape a finite vocabulary.

### F2 — The INVALID-FIXTURE branch cannot complete Phase 3 Progress

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: `plan.md:320`, `plan.md:360`, `plan.md:618`, `plan.md:663-679`
- **Detail**: The Phase 2 gate says fewer than four fabrication runs ends the experiment as `INVALID-FIXTURE` and Phase 3 does not start. Progress nevertheless requires every Phase 3 intervention, validation, rerun, and evidence-retention row to be completed. That contradicts the plan's claim that every terminal outcome is completable.
- **Recommended fix**: Replace those Phase 3 rows with newly numbered, branch-neutral criteria. Each row should accept either execution evidence on the valid-fixture branch or an explicit `INVALID-FIXTURE` N/A record.
- **Strength**: Preserves one change and makes completion truthful.
- **Tradeoff**: Conditional Progress criteria are more verbose.
- **Confidence**: HIGH — direct control-flow contradiction.
- **Blind spot**: The implementation workflow has no separate “skipped” checkbox state.
- **Alternative**: End this change after baseline classification and open a separate intervention change only when the fixture is valid. This is cleaner and linear, but introduces another handoff.

### F3 — Phase 4 has a success criterion with no Progress row

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `plan.md:545-549`, `plan.md:691-693`
- **Detail**: Phase 4 contains four manual-verification bullets, but Progress tracks only three. The missing row is the outcome-specific action: opening rollout, reverting intervention, or recording reproduction limits.
- **Fix**: Add a new `4.7` Progress row for the outcome-specific disposition. Do not renumber previously reviewed rows.

### F4 — `review.json` retention lacks an artifact-level regression test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `plan.md:442-452`, `packages/code-reviewer/src/cli.ts:301`, `packages/code-reviewer/src/cli.test.ts:71-78`
- **Detail**: The plan promises that evidence survives into `review.json`, but its Phase 3 test blast radius omits `src/cli.test.ts`. Pipeline assertions prove the in-memory DTO, not the serialized artifact.
- **Fix**: Include `packages/code-reviewer/src/cli.test.ts` and assert that a finding with evidence retains that evidence in emitted `review.json`.

### F5 — The 20-run fixture gate has material misclassification risk

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: `plan-brief.md:50`, `plan.md:320`
- **Detail**: With `n=20` and validity defined as at least four fabrication runs:
  - At a true 25% rate, the fixture is falsely rejected about 22.5% of the time.
  - At a true 20% rate, it is falsely rejected about 41.1% of the time.
  - At a true 10% rate, it is falsely accepted about 13.3% of the time.

  That is weaker discrimination than the brief currently implies.

- **Fix**: Pre-register acceptable error rates and select sample size/threshold accordingly, or add one bounded baseline confirmation run for ambiguous results before spending on intervention.

## Conclusion

The fixtures themselves now look sound: the defended fixture has no critical defect, and the vulnerable fixture contains one clear, isolated defect. The remaining blocker is that the measurement machinery still misses realistic reviewer language, and the plan's terminal branches cannot all satisfy Progress as written.

**Verdict: RETHINK.**
