<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder Tool-Loop Evals + Model Decision

- **Plan**: context/changes/finder-tool-loop-evals/plan.md
- **Scope**: Phase 1 of 4
- **Date**: 2026-08-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Planned shared filesystem adapter remains duplicated

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/source-provider.ts:165
- **Detail**: The plan required `createFsDiffScopedSource({ diff, root })` to centralize the complete Node filesystem adapter. The implemented `createDiffScopedSourceForDiff` still requires `readFile`, `realpath`, and `isRegularFile` from each caller. CLI and eval therefore duplicate that wiring at `cli.ts:151` and `finder-provider.ts:125`. Core allowlist logic is shared, but future filesystem-layer hardening can still drift.
- **Fix A ⭐ Recommended**: Add a Node-backed `createFsDiffScopedSource` wrapper used by both runtime consumers, retaining the pure injected helper underneath for hermetic tests.
  - Strength: Fulfils the plan while preserving the testable core.
  - Tradeoff: The CLI needs a small source-factory injection seam so its existing fake-I/O tests remain hermetic.
  - Confidence: HIGH — the current helper is already the correct core.
  - Blind spot: Exact CLI injection shape has not been implemented.
- **Fix B**: Accept the pure dependency-injection design and document the deviation, backed by adapter-conformance tests.
  - Strength: Preserves the current CLI testing architecture.
  - Tradeoff: Node adapter hardening remains duplicated and relies on tests to prevent drift.
  - Confidence: MED — behavior is sound today, but it weakens the plan's stated future-hardening guarantee.
  - Blind spot: Future adapter changes may bypass the conformance suite.
- **Decision**: ACCEPTED via Fix B — deviation documented in `verification.md` §"Deviations from the plan" (1). The planned `{ diff, root }` signature is unimplementable: `cli.ts` builds its source from an injected `CliIo` and `cli.test.ts` pins that seam, so a node:fs-reaching helper cannot be called from the CLI without breaking hermeticity. Fix A was offered and declined at plan-review triage (F10) and again here; the shared part is the allowlist derivation and containment, the duplicated part is the three-line fs binding.

### F2 — fixtureRoot can escape the fixture directory

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/finder-provider.ts:29
- **Detail**: Absolute paths and `../` traversal are accepted. A reproduction with `fixtureRoot: "../../.."` resolved to the repository root; a crafted diff can consequently authorize files outside `evals/fixtures` for delivery to the external model. Current cases are trusted/manual, limiting the severity, but the boundary is unsafe.
- **Fix**: Canonically constrain `fixtureRoot` to descendants of `evals/fixtures`, reject absolute/traversal/symlink escapes, and cover those cases with tests.
- **Decision**: FIXED — `resolveFixtureRoot` now realpaths both the requested root and `evals/fixtures` and requires the former to be a strict descendant of the latter; the fixtures directory itself and non-existent roots are rejected too. Containment is checked on the REALPATH because `createDiffScopedSource` deliberately tolerates a symlinked root, so a lexical check would miss a symlinked escape. Covered by `evals/finder-provider.test.ts` (8 cases, incl. the reported `../../..` repro). The provider returns a structured error row instead of throwing.

### F3 — Viewer verification remains pending

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/finder-tool-loop-evals/plan.md:510
- **Detail**: Phase 1 item 1.7 is correctly unchecked. The code selects the tool-enabled prompt, but no recorded viewer observation confirms that Promptfoo displays that prompt for the tool-enabled case.
- **Fix**: Inspect the saved smoke row in Promptfoo's viewer and check 1.7 only after confirming the displayed instruction variant.
- **Decision**: ACKNOWLEDGED — not a defect but a status. 1.7 stays `- [ ]` by the operator's decision (the persisted record shows both tool-enabled instruction sentences for the cross-hunk case and their absence from the tool-less cases; only the visual confirmation is outstanding, blocked on a browser surface). It will surface in the final-phase manual rollup and in `/10x-archive`'s missing-check warning.

### F4 — Delivery telemetry infers status from response text

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/finder-provider.ts:70
- **Detail**: `instrumentSource` classifies any response beginning with the quoted requested path as a refusal. A targeted reproduction returned `delivered=false` for genuine content beginning with `"src/x.ts"`. Conversely, changing refusal wording could classify a refusal as delivered. This can corrupt the model-selection signal.
- **Fix A ⭐ Recommended**: Add an optional result callback inside `createDiffScopedSource` so it reports the content/refusal decision structurally while retaining the existing model-facing string.
  - Strength: Removes content parsing without changing tool output.
  - Tradeoff: Expands the shared source-provider API and its tests.
  - Confidence: HIGH — the provider already knows the status exactly.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — `DiffScopedSourceOptions` gained an optional `onResult({ path, delivered })`, reported from the source itself where the outcome is known exactly; every return path routes through one of two helpers so a future branch cannot skip it. `instrumentSource` and its string sniffing are deleted. The reported collision (content whose first line is the quoted requested path) is now a regression test asserting `delivered: true`; empty and out-of-range reads are pinned as refusals. Model-facing output unchanged.
- **Fix B**: Introduce a centralized refusal marker/classifier and test all refusal variants plus genuine-content collisions.
  - Strength: Smaller implementation change.
  - Tradeoff: Telemetry remains coupled to a string sentinel.
  - Confidence: MED — safe while the marker contract is maintained.
  - Blind spot: Later formatting changes can reintroduce coupling.
- **Decision**: PENDING

## Verification Evidence

- `npm run typecheck` — passed.
- `npx eslint evals/finder-provider.ts` — passed.
- `npm test` — 15 files and 300 tests passed.
- `npx promptfoo validate config -c evals/promptfooconfig.yaml` — printed `Configuration is valid`; the plain invocation retained a background handle, while the CI/telemetry-disabled rerun exited successfully.
- Mutation testing skipped: Phase 1 does not touch a project risk module.
- Manual smoke and fixture delivery have evidence in `edf3982`; viewer verification remains pending.
