<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Code Reviewer ToolLoopAgent Refactor

- **Plan**: context/changes/tool-loop-agent/plan.md
- **Scope**: Phase 2 of 4
- **Date**: 2026-08-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Context tool lacks a capability boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/reviewer.ts:14
- **Detail**: The model chooses path, startLine, and endLine, which are forwarded unchanged to the injected provider. The demo safely rejects unknown paths, but a future filesystem provider could expose .env, credentials, or unrelated repository files following prompt injection from reviewed code. Ranges and response size are also unbounded.
- **Fix**: Derive an allowed-path capability from each ReviewUnit, reject paths outside it, and bound requested ranges and returned context.
  - Strength: Makes the library''s promised hermetic boundary enforceable rather than dependent on every adapter.
  - Tradeoff: Requires canonical handling for multi-file, rename, and binary diffs.
  - Confidence: HIGH — the unrestricted model-to-provider flow is explicit.
  - Blind spot: The project has not yet selected a canonical diff parser.
- **Decision**: FIXED (partial, cheap guardrails) — range clamp (MAX_CONTEXT_LINES=400) + response cap (MAX_CONTEXT_CHARS=20k) in the tool, SECURITY trust contract documented on SourceProvider; full diff-derived path allowlist recorded as future direction in change.md.

### F2 — Invalid maxSteps values can remove the cost guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/reviewer.ts:30
- **Detail**: maxSteps accepts any JavaScript number. With AI SDK v7''s equality-based isStepCount, zero, negative, fractional, NaN, or infinite values never trigger the stop condition. review() also exposes no cancellation or timeout signal.
- **Fix**: Require a bounded positive safe integer and allow review() to pass an AbortSignal or timeout into agent.generate().
  - Strength: Restores predictable token, cost, and wall-clock limits.
  - Tradeoff: Slightly expands validation and the review-call signature.
  - Confidence: HIGH — confirmed against the bundled AI SDK v7 implementation.
  - Blind spot: The appropriate maximum step count remains a product decision.
- **Decision**: FIXED — maxSteps validated as positive safe integer (throws otherwise); review(unit, {abortSignal, timeoutMs}) passes through to agent.generate().

### F3 — Finding locations are shape-valid but not semantically valid

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/schemas.ts:17
- **Detail**: The schema permits endLine without startLine, endLine before startLine, and file paths not present in the reviewed unit. AI SDK structured output guarantees only this Zod shape, so invalid identities can poison stable keys, later deduplication, and eval assertions.
- **Fix**: Add range invariants to the schema and a ReviewUnit-aware validation or normalization pass before returning findings.
  - Strength: Protects the mergeable finding contract at its source.
  - Tradeoff: Accurate path and line-bound validation needs diff-aware context.
  - Confidence: HIGH — the missing invariants are directly observable.
  - Blind spot: Deleted-line and rename semantics need an explicit policy.
- **Decision**: FIXED — normalizeFindings(unit, findings) in findings.ts (file coerced to unit path for file/hunk units; incoherent endLine dropped), applied in review(); exported for Phase 3 tests.

### F4 — Factory and barrel exceed the locked public contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/index.ts:4; packages/code-reviewer/src/reviewer.ts:70
- **Detail**: The detailed plan restricted the factory result to { review, agent } and specified the barrel exports. The implementation additionally returns lens and model and exports DEFAULT_MODEL, configuration types, and Reviewer.
- **Fix**: Remove the unplanned return properties and barrel exports, or explicitly approve them through a plan addendum.
- **Decision**: ACCEPTED via plan addendum — extras documented in plan.md ## Addenda (factory lens/model; barrel DEFAULT_MODEL, config types, Reviewer).

### F5 — The demo crossed the explicit No CLI boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: packages/code-reviewer/src/demo.ts:52
- **Detail**: Phase 2 explicitly excludes an argv-driven CLI, but the demo accepts a lens argument and prints CLI usage.
- **Fix**: Remove argv parsing and keep the demo on the default general lens; exercise alternate lenses through library calls or a separate verification script.
- **Decision**: ACCEPTED via plan addendum — single positional lens arg sanctioned as the 2.5 affordance in plan.md ## Addenda.

### F6 — Completed live checks lack durable evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/tool-loop-agent/plan.md:499
- **Detail**: Progress marks the live schema-output and security-lens checks complete, but no transcript or verification artifact records the observed fields or focus shift. The implementation review did not repeat the paid external calls.
- **Fix**: Preserve a short redacted verification record containing the model, lens, required fields observed, and behavioral difference.
- **Decision**: FIXED — durable record written to reviews/phase-2-live-evidence.md (model, both lens transcripts, fields, keys, behavior notes).

### F7 — Sorting depends on the host locale

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/findings.ts:30
- **Detail**: localeCompare() without a fixed locale can order paths differently across environments, conflicting with the deterministic merge contract.
- **Fix**: Use a locale-independent code-point comparator for file and category ordering.
- **Decision**: FIXED — localeCompare replaced with code-point comparator in findings.ts.

## Verification

- npm run typecheck — PASS
- Pure barrel import — PASS (printed ok)
- No-key demo path — PASS (exited 1 with actionable OpenRouter setup guidance)
- npx eslint src — PASS
- Mutation testing — skipped; no context/foundation/test-plan.md §4 risk module changed
- Live paid checks — recorded complete in Progress; not independently repeated
