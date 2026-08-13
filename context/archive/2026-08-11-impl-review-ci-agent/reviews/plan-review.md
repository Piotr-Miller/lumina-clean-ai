<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Plan-Aware Implementation Review in the CI Review Agent

- **Plan**: `context/changes/impl-review-ci-agent/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-12
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

Grounding: 11/11 existing paths ✓, 8/8 symbols ✓, brief↔plan ✓, Progress 43/43 ✓

## Findings

### F1 — Plan-path validation permits symlink escapes

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Plan resolution
- **Detail**: The plan rejects `..` segments and non-regular files, but a regular-file check follows symlinks. A PR-controlled `context/changes/x/plan.md` symlink could resolve outside the checkout before the CLI reads it. The repository's existing hardened reader explicitly documents that regular-file checks are insufficient and enforces canonical-path equality in `packages/code-reviewer/src/source-provider.ts:146`; the weaker proposed contract is in `plan.md:87`.
- **Fix A ⭐ Recommended**: Stage the plan from the Git object after verifying that `git ls-tree` reports a regular blob mode.
  - Strength: Avoids checkout symlinks entirely and binds the content to `HEAD_SHA`.
  - Tradeoff: Adds more shell validation and fixture coverage.
  - Confidence: HIGH — Git exposes blob versus symlink modes deterministically.
  - Blind spot: The accepted filename character set still needs to be explicit.
- **Fix B**: Apply the same realpath-containment and no-symlink checks used by `source-provider.ts`.
  - Strength: Reuses an established repository security pattern.
  - Tradeoff: Duplicates containment logic in workflow shell and retains a small check/read race.
  - Confidence: HIGH — the pattern is already tested locally.
  - Blind spot: Intermediate path components must also be checked.
- **Decision**: PENDING

### F2 — The probe rewards violating “What We're NOT Doing”

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 4 — Pre-registered probe
- **Detail**: The desired state explicitly promises to detect implementation that contradicts “What We're NOT Doing” (`plan.md:15`). Phase 4 instead requires an implemented EXTRA listed there to not be flagged (`plan.md:321`). The vendored reference is itself inconsistent: it first exempts exclusions from scope creep, then says substantive changes contradicting exclusions fail Scope Discipline. Porting it “faithfully” leaves the model and implementer to guess.
- **Fix**: Define exclusions as work that is not required to be present, but which becomes a scope violation if implemented unless explicitly permitted as incidental work. Update both the vendored instructions and probe: test a prohibited change that must be flagged and a benign unplanned helper that may remain unflagged.
  - Strength: Aligns the rubric, probe, and stated product goal.
  - Tradeoff: The port becomes an intentional clarification rather than a literal copy.
  - Confidence: HIGH — the plan's desired behavior is explicit.
  - Blind spot: None significant.
- **Decision**: PENDING

### F3 — Phase 4 cost verification has no telemetry implementation

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phases 2–4 — Reviewer factory and rollout
- **Detail**: Phase 4 requires exact per-run cost and acknowledges that the third pass needs `usage: { include: true }` (`plan.md:329`), but Phase 4 lists only documentation files. The existing finder also needs an `onStepEnd` callback, provider-cost extraction, retry-aware accumulation, and `review.json` telemetry—not merely the provider option (`packages/code-reviewer/src/reviewer.ts:136`). None of those mechanics appears in the proposed implementation-review factory contract.
- **Fix A ⭐ Recommended**: Add implementation-review usage telemetry in Phases 2–3, accumulate it across retry attempts, and expose it in `review.json` and the run log.
  - Strength: Produces a durable, run-specific cost record alongside the existing finder telemetry.
  - Tradeoff: Expands the schema, pipeline, CLI logging, and tests.
  - Confidence: HIGH — the finder already supplies the pattern.
  - Blind spot: Exact OpenRouter metadata fields should be pinned with a provider-attempt test.
- **Fix B**: Explicitly make Phase 4 a manual OpenRouter-dashboard lookup keyed by run time/model.
  - Strength: Less implementation work.
  - Tradeoff: Weak traceability and harder post-hoc auditing.
  - Confidence: MEDIUM — dashboard lookup behavior was not verified during this review.
  - Blind spot: Correlating retries and concurrent runs may be ambiguous.
- **Decision**: PENDING

### F4 — Plan-only PRs can fail before implementation review runs

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 1 — Diff exclusions and CLI seam
- **Detail**: The brief calls the near-empty diff for plan-only PRs expected behavior. If the plan and review documents are the only changes, filtering produces an exactly empty diff. The current CLI immediately throws `Empty diff — nothing to review` (`packages/code-reviewer/src/cli.ts:136`), so no implementation-review section or artifact is produced.
- **Fix A ⭐ Recommended**: Define an explicit plan-present/empty-diff path that still runs implementation review, with a documented neutral code-review verdict and label behavior.
  - Strength: Fulfils the promised behavior for every plan-bearing PR.
  - Tradeoff: Requires a deliberate decision about what `ai-cr:passed` means when no code-review judge ran.
  - Confidence: HIGH — the current failure occurs before pipeline invocation.
  - Blind spot: Provider behavior on a truly empty prompt should not be relied upon.
- **Fix B**: Declare plan-only PRs unsupported and skip them visibly in the workflow.
  - Strength: Preserves the existing code-review verdict contract.
  - Tradeoff: Narrows the Desired End State and loses plan-conformance feedback for this PR class.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: PENDING

### F5 — “No plan” has two incompatible result representations

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Pipeline result contract
- **Detail**: `ImplReviewBlock` includes a `skipped` variant, but the same paragraph and success criterion require `implReview` to be absent when no plan exists (`plan.md:249`). Both cannot be the canonical representation.
- **Fix**: Keep `implReview` absent to preserve the stated JSON contract, remove the unreachable `skipped` variant, and have the renderer interpret absence as the neutral no-plan section.
- **Decision**: PENDING
