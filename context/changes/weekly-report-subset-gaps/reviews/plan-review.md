<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Weekly Report Subset Gaps

- **Plan**: context/changes/weekly-report-subset-gaps/plan.md
- **Mode**: Deep
- **Date**: 2026-10-23
- **Plan sha256**: 0177e28ba108f5997e5b80d31c62ad3eb8ad7fb5f4cea38e06cd201cac8461cc
- **Plan sha256 after triage**: 3038d5cd877158301222e6b29f0421f468596d3eaa5a2dea15f18dd18fbd9a2b
- **Verdict**: REVISE
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | PASS    |
| End-State Alignment    | PASS    |
| Lean Execution         | PASS    |
| Architectural Fitness  | FAIL    |
| Blind Spots            | PASS    |
| Plan Completeness      | PASS    |

## Grounding

Named paths and symbols verified; brief and plan agree on scope and phases. Both phase headings and all 11 Automated criteria match Progress; no Manual rows exist. Read 29 of 39 lesson entries applicable to plan review. Definitions cover the retained impl finding count, invalid-row accounting and unchanged coverage alarm; the user confirmations recorded in the plan establish the latter two decisions.

All six distinct local commands matched their recorded exit 0: core and CLI tests (64 tests), collector tests (58 tests), package typecheck, package lint, full package suite (26 files, 880 tests), and package-source Prettier check. Repeated command declarations were checked once per distinct command. The live GitHub dry run was not executed because it is recorded as external.

An independent read-only analysis verified the collector and parser consumers and found no additional production callers needing changes. Impl aggregation reads only `.length` at `packages/code-reviewer/src/weekly-report.ts:533`; the complete report is serialized at `packages/code-reviewer/src/weekly-report-cli.ts:147`.

Independent degenerate walkthrough: IDs 71 and 72 with equal timestamps at the exact week start, duplicate 71, a `Number.MAX_SAFE_INTEGER` singleton, two `Number.MAX_SAFE_INTEGER + 1` rows, two missing-ID rows with missing attempt metadata, and a missing-ID row at the next week's start. The current collector retained three valid IDs and only two invalid rows. An in-memory version of the proposed guard retained the same valid IDs and all four in-window invalid rows, excluded the end-boundary row and performed no lookups for invalid rows. Empty input produced zero workflows, invalid rows and coverage gaps; the safe-boundary singleton produced one workflow and no coverage gap. These outcomes follow the plan's definitions while preserving existing valid-ID behavior.

Runtime probes confirmed that the proposed empty-object schema strips nested finding text, preserves the count and rejects non-object elements. A separate compiler-host probe exposed F1: runtime correctness alone does not establish compatibility with the subset pin. The suggested typed-output transform produced zero package compiler diagnostics and retained the runtime behavior, without modifying repository source.

## Findings

### F1 — Empty-object schema breaks the compile-time pin

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Current State Analysis; Phase 1 — Subset schema contract
- **Detail**: The plan assumes `z.object({})` infers `{}` and that `ImplFinding[]` therefore remains assignable to the parsed findings type. Installed Zod instead infers `Record<string, never>` for an empty object (`packages/code-reviewer/node_modules/zod/v4/core/schemas.d.ts:582`). Replacing the exact schema in memory produces TS2344 at `packages/code-reviewer/src/weekly-report.ts:131`: `IdentifiedImplFinding[]` cannot satisfy `Record<string, never>[]`. Phase 1 cannot pass its required typecheck as written.
- **Fix**: Use `z.array(z.object({}).transform((value): object => value))`, correct the inferred-type claim to `object[]`, and retain `ReviewJsonSubsetPinned`. The transform widens the static output type after Zod has stripped all keys; a read-only compiler probe produced zero diagnostics and runtime probes preserved `[{}, {}]`, its count and non-object rejection. Update the matching schema decision in `plan-brief.md`.
- **Decision**: FIXED — Fix; edited: Current State Analysis, Phase 1 — Subset schema contract; matching schema decision updated in plan-brief.md; reopened: none

## Triage summary (2026-10-24)

- **Fixed**: F1 (owner selected Fix in plan).
- **Skipped / accepted / dismissed**: None.
- **Verdict after fixes**: SOUND (REVISE → SOUND).
- **Verification**: The plan and brief now specify the typed-output transform verified by the read-only compiler and runtime probes recorded above. `acceptance-state.sh` exited 0 with no Manual rows to reopen. Progress remains unchanged. Application source was not modified; implementation and regression tests remain pending.
