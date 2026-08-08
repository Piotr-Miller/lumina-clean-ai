<!-- PLAN-REVIEW-REPORT -->

# Plan Review: CI/CD PR Code Review Workflow — Phase 1

- **Plan**: `context/changes/ci-cd-code-review/plan.md`
- **Mode**: Deep (scope: Phase 1)
- **Date**: 2026-08-07
- **Verdict**: RETHINK
- **Findings**: 4 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | FAIL    |
| Plan Completeness     | FAIL    |

## Grounding

Grounding: 6/6 existing paths ✓, 5/5 symbols ✓, brief↔plan ✓, Q&A↔plan ✗. All current Phase-1 base files exist (`schemas.ts`, `prompts.ts`, `config.ts`, `reviewer.ts`, `findings.ts`, `index.ts`, `package.json`); files declared as new are absent as expected.

## Findings

### F1 — Plan ignores the model-owned verdict decision

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Overview; Phase 1 §§1–4, 7, 9
- **Detail**: The Q&A decision was “the model decides,” but the plan still declares a code-derived verdict, `judgeOutputSchema = { scores }`, and `deriveVerdict(scores)`. Implementing the plan would not deliver the selected behavior. The stale decision also appears in `requirements.md` and `plan-brief.md`.
- **Fix A ⭐ Recommended**: Move `verdict`, `verdictReason`, and `summary` into `judgeOutputSchema`; make the judge result authoritative and update the pipeline, renderer, tests, requirements, and brief.
  - Strength: Matches the explicit user decision and the purpose of the second pass.
  - Tradeoff: The verdict becomes nondeterministic and needs later evaluation.
  - Confidence: HIGH — the choice was stated directly in the Q&A.
  - Blind spot: Promptfoo is deliberately deferred to the next change.
- **Fix B**: Explicitly revert the decision to a code-derived verdict and retain `deriveVerdict` as the authority.
  - Strength: Deterministic and straightforward to unit-test.
  - Tradeoff: Reverses the selected model-judge semantics.
  - Confidence: HIGH — this is the architecture currently described by the plan.
  - Blind spot: None significant.
- **Decision**: FIXED — Fix A applied 2026-08-07. The planning-session Q&A log confirms the user explicitly chose "model sam orzeka" (option 2, overriding the reviewer's recommendation), with the agreed follow-through: judge emits `verdict` + `verdictReason` (+ `summary`), thresholds become rubric guidance, code only validates. `plan.md` (Overview, Critical Implementation Details, §§1–4, 7–10, Testing Strategy, Manual Verification), `requirements.md` (verdict rule), and `plan-brief.md` (decision table + architecture) all updated; `deriveVerdict` removed from the plan.

### F2 — SDK retries break the “exactly one retry” contract

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details; Phase 1 §§4, 6–7
- **Detail**: The plan wraps each pass in `withOneRetry`, but the current `ToolLoopAgent` does not set `maxRetries`. AI SDK defaults to two internal retries. After those retries it can throw `RetryError`, which the proposed `APICallError` classifier does not cover. Therefore the intended cost and failure contract is not achieved.
- **Fix**: Set `maxRetries: 0` for both finder and judge, then own the complete policy in one outer `withOneRetry`. Retry `TimeoutError`, HTTP 429, and 5xx; do not retry an ordinary external-cancellation `AbortError`.
  - Strength: Produces one explicit, testable retry policy and predictable cost.
  - Tradeoff: Requires changing `reviewer.ts`, despite the plan claiming the finder needs no loop changes.
  - Confidence: HIGH — verified against the installed AI SDK implementation.
  - Blind spot: Tests must count provider attempts, not only wrapper invocations.
- **Decision**: FIXED — applied 2026-08-07. Verified against installed `ai@7.0.52` (default `maxRetries = 2`, `RetryError` wrapper after exhaustion; `maxRetries` is a `CallSettings` member so `ToolLoopAgent` accepts it). Plan now sets `maxRetries: 0` on both passes (`reviewer.ts` one-liner + judge), makes `withOneRetry` the single policy, distinguishes timeout-abort (`TimeoutError` DOMException) from external `AbortError`, and requires the provider-attempt-counting test.

### F3 — Judge, pipeline, renderer, and CLI contracts do not close the data flow

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §§1, 2, 4, 7–9
- **Detail**: `validateJudgeReferences` returns a dropped-reference count, but `judge()` returns only `scores`, so the pipeline cannot produce `droppedFindingIdRefs`. Manual verification requires model metadata, but the pipeline result has no `models`. `renderStickyComment` requires `runUrl`, but the CLI has no source for it. The documented `Output.object(judgeOutputSchema)` call also does not match the installed API, which requires `Output.object({ schema: judgeOutputSchema })`.
- **Fix**: Define `JudgeResult = { scores, droppedFindingIdRefs, verdict, verdictReason }`; add `models: { finder, judge }` to the pipeline result; make `runUrl` optional or define its CLI/env source; use the correct `Output.object({ schema })` signature.
  - Strength: Makes the entire Phase-1 data flow implementable without local guesses.
  - Tradeoff: Slightly increases the shared result schema.
  - Confidence: HIGH — the gaps are direct signature contradictions.
  - Blind spot: The source and local fallback behavior of `runUrl` still need a decision.
- **Decision**: FIXED — applied 2026-08-07. `JudgeResult = { scores, verdict, verdictReason, summary, droppedFindingIdRefs }` (merged with F1's Fix A); pipeline result gains `models: { finder, judge }`; `runUrl` is optional, derived in the CLI from `GITHUB_SERVER_URL`+`GITHUB_REPOSITORY`+`GITHUB_RUN_ID` when present, omitted locally (renderer skips the link line); `Output.object({ schema: judgeOutputSchema })` per the installed API.

### F4 — Progress does not represent every Phase-1 success criterion

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Manual Verification; Progress Phase 1
- **Detail**: Phase 1 contains two manual-verification bullets: artifact/verdict integrity and model-resolution metadata. Progress collapses them into one `1.5` checkbox, violating the mechanical one-row-per-success-criterion contract.
- **Fix**: Keep `1.5` for the live artifact/verdict check and add `1.6 Judge model resolution confirmed in output metadata`.
- **Decision**: FIXED — applied 2026-08-07. Progress row `1.6` added; the model-resolution parenthetical moved from 1.5 to 1.6.

### F5 — “Deterministic” finding IDs preserve model-output order

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Critical Implementation Details; Phase 1 §2
- **Detail**: `normalizeFindings` maps and repairs findings but preserves their input order. Deterministic sorting exists only in `mergeFindings`, which the planned pipeline does not call. In-run references work, but the claimed deterministic ordering and stable IDs do not.
- **Fix**: Apply an explicit stable sort/dedup before `assignFindingIds` (for example, `assignFindingIds(mergeFindings(findings))`) and test identical findings supplied in different orders.
- **Decision**: FIXED — applied 2026-08-07. Verified in `findings.ts`: only `mergeFindings` sorts. Plan now routes the pipeline through `mergeFindings(normalizeFindings(...))` before `assignFindingIds` and adds the order-invariance test.

### F6 — PR title and body remain unfenced judge inputs

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3 — `buildJudgePrompt`
- **Detail**: The plan fences `<findings>`, but the judge also receives author-controlled `prTitle` and `prBody` without a separate data boundary. The judge has no tools, limiting secret risk, but injected metadata can still manipulate scores and the verdict.
- **Fix**: Put PR metadata in a separate `<pr-metadata>` fence, explicitly classify both blocks as untrusted data, and add a prompt-injection test.
  - Strength: Extends the finder’s existing trust-boundary discipline to the judge.
  - Tradeoff: Adds a small amount of prompt and test complexity.
  - Confidence: HIGH — the plan names a fence only for findings.
  - Blind spot: Fencing mitigates but cannot guarantee model compliance.
- **Decision**: FIXED — applied 2026-08-07. `buildJudgePrompt` now fences PR metadata in `<pr-metadata>` alongside `<findings>`, both classified as untrusted; a prompt-injection fixture test added to the Phase-1 test contract.

## Triage — 2026-08-07

All six findings verified against sources and **accepted**; fixes applied to
`plan.md`, `requirements.md`, and `plan-brief.md` (no dismissals, no skips).

- F1 grounding: the Codex planning-session log (`rollout-2026-08-07T16-40-34…`)
  records the Q&A "Kto wyznacza werdykt passed/failed?" → user picked
  **2. Model sam orzeka** against the ⭐ recommendation; the on-disk docs had
  kept the stale code-derived rule. Fix A implements the user's decision.
- F2 grounding: installed `ai@7.0.52` — `maxRetries` defaults to 2,
  `RetryError` after exhaustion, `CallSettings.maxRetries` accepted by
  `ToolLoopAgent` ("Set to 0 to disable retries").
- F3 grounding: `reviewer.ts:94` uses `Output.object({ schema })`.
- F5 grounding: `findings.ts` — `normalizeFindings` is order-preserving;
  the deterministic sort lives only in `mergeFindings`.

**Verdict after fixes: RETHINK → SOUND** — all FAIL-dimension findings are
resolved in the plan text; remaining risk (judge verdict quality) is
explicitly deferred to `code-review-evals` per the user's decision.
