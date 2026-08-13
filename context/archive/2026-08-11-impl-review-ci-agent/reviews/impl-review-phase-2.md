<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Plan-Aware Implementation Review in the CI Review Agent

- **Plan**: `context/changes/impl-review-ci-agent/plan.md`
- **Scope**: Phase 2 of 4
- **Date**: 2026-08-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Vendored review criteria are incomplete

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `packages/code-reviewer/src/prompts.ts:150`
- **Detail**: The plan requires each planned change to be evaluated through `MATCH / DRIFT / MISSING / EXTRA`, with only deviations emitted as findings. The prompt does not specify that exhaustive comparison. It also omits the rubric's Safety & Quality warning rule, `SHALLOW TEST → WARNING`, and suspicious checked-manual-claim rule. Tests largely assert vocabulary presence, so the omissions remain green despite Progress item 2.13 being checked.
- **Fix**: Complete the comparison algorithm and missing grading rules, then add semantic prompt assertions.
  - Strength: Restores the promised faithful port and the core omitted-work detection behavior.
  - Tradeoff: Slightly increases prompt size and maintenance surface.
  - Confidence: HIGH — direct comparison with the canonical criteria identifies the missing clauses.
  - Blind spot: Manual live criterion 2.15 is still pending, so model compliance has not been probed.
- **Decision**: FIXED

### F2 — Telemetry tests do not prove the checked criterion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `packages/code-reviewer/src/impl-reviewer.test.ts:155`
- **Detail**: The test verifies that `onStepEnd` fires once, but never asserts token values, provider-reported cost, or `undefined` when cost is absent. The usage-setting test checks construction settings, not the promised provider-attempt behavior. Progress items 2.11–2.12 are marked complete despite this missing evidence.
- **Fix**: Assert tokens and present/absent cost from the emitted step, and add a provider-attempt test proving `maxRetries: 0` permits one attempt per call.
- **Decision**: FIXED

### F3 — Untrusted plan-path metadata is outside the prompt fence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `packages/code-reviewer/src/prompts.ts:198`
- **Detail**: `planPath` is documented as untrusted but interpolated outside `<plan>` and `<diff>`. The current workflow restricts override characters, reducing its immediate exposure, but the exported builder accepts arbitrary strings from embedders.
- **Fix**: Put the path in a delimiter-safe `<plan-metadata>` fence explicitly declared untrusted, and add a hostile newline/tag-closure test.
- **Decision**: FIXED

### F4 — Contradictory grades, findings, and verdicts are accepted

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `packages/code-reviewer/src/schemas.ts:231`
- **Detail**: Vocabulary is validated, but semantic consistency is not. The existing factory test accepts all-PASS grades alongside a CRITICAL finding and `NEEDS_ATTENTION`, although the rubric requires a critical failure to produce `REJECTED`. A line number is also accepted without a file.
- **Fix A ⭐ Recommended**: Add post-parse consistency validation and throw on contradictions.
  - Strength: Preserves model ownership while preventing misleading output from reaching Phase 3 rendering.
  - Tradeoff: Invalid semantic output can consume the pipeline's retry.
  - Confidence: HIGH — the contradictory fixture demonstrates the gap.
  - Blind spot: The exact minimum consistency rules should be documented to avoid over-constraining legitimate judgments.
- **Fix B**: Derive grades and verdict deterministically from findings.
  - Strength: Makes contradictions structurally impossible.
  - Tradeoff: Larger architectural change from the planned model-owned judgment.
  - Confidence: MEDIUM — deterministic thresholds are clear, but not every nuanced grade maps cleanly from findings.
  - Blind spot: Could discard legitimate model reasoning not represented by a finding.
- **Decision**: FIXED via Fix A

### F5 — Internal helpers were added to the public barrel

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `packages/code-reviewer/src/index.ts:13`
- **Detail**: `identifyImplFindings` and `MAX_IMPL_FINDINGS` are exported publicly although the plan only specifies the factory, its types, schemas, prompt builders, and default model. This unnecessarily widens the embedder-facing API.
- **Fix**: Remove those two barrel exports unless an external consumer is identified and documented.
- **Decision**: FIXED

## Verification

- `cd packages/code-reviewer && npm run lint` — PASS
- `cd packages/code-reviewer && npm run typecheck` — PASS
- `cd packages/code-reviewer && npm test` — PASS (18 files, 412 tests)
- Mutation testing — skipped; Phase 2 touches no risk-critical module identified by `context/foundation/test-plan.md`.
- Manual criterion 2.15 — pending and correctly unchecked.

## Triage (2026-08-12)

All five findings fixed. Re-verified after the last edit: `npm run lint` PASS, `npm run typecheck` PASS, `npx vitest run` PASS (18 files, 427 tests — up from 412).

| ID  | Decision        | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | FIXED           | `prompts.ts`: new `IMPL_REVIEW_COMPARISON_RULE` (MATCH / DRIFT / MISSING / EXTRA over every planned change, deviations only); restored the three omitted grading rules — `safety_quality` warning-level, `SHALLOW TEST`, suspicious checked-manual claim. Three new tests, one of them structural (every dimension clause must carry a FAIL/WARNING trigger).                                                                                             |
| F2  | FIXED           | `impl-reviewer.test.ts`: the step's `inputTokens`/`outputTokens` are now asserted, plus cost present (`0.0123`) and cost absent via the same `providerMetadata.openrouter.usage.cost` path `asStepCost` reads. `provider-attempts.test.ts`: the impl reviewer joins the finder and judge in the one-attempt contract.                                                                                                                                     |
| F3  | FIXED           | `prompts.ts`: the plan path moved out of the lead sentence into a `<plan-metadata>` fence; newlines collapsed and `<` neutralised first, since `fence()` only defuses its own closing tag. Hostile test proves no forged sibling `<plan>` block.                                                                                                                                                                                                          |
| F4  | FIXED via Fix A | `schemas.ts`: `checkImplReviewConsistency` superRefine — CRITICAL finding ⇒ dimension FAIL ⇒ REJECTED; WARNING finding ⇒ dimension not PASS; APPROVED ⇒ no FAIL; `startLine` ⇒ `file`. Rules run in the understating direction only, and each restates a threshold the prompt now states explicitly (one sentence added to `IMPL_REVIEW_FINDINGS_RULE`) — the validator never enforces what the model was not told. Two contradictory fixtures corrected. |
| F5  | FIXED           | `index.ts`: `identifyImplFindings` and `MAX_IMPL_FINDINGS` dropped from the barrel; `createImplReviewer` applies both on the way out, and the tests import them from `./impl-reviewer.js` directly.                                                                                                                                                                                                                                                       |

Manual criterion 2.15 (live model compliance) remains pending and correctly unchecked — F1's blind spot still stands: these are prompt and validation changes, not evidence of model behavior.

## Scope Notes

- Reviewed the nine Phase 2 source and test files in `packages/code-reviewer/src/`.
- Excluded unrelated working-tree changes in `.claude/settings.local.json` and `scratchpad/`.
- Treated `plan.md` checkbox edits as review metadata rather than implementation scope.
