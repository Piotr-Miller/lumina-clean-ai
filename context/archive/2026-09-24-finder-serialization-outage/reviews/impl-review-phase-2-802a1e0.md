<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder output without `response_format`

- **Plan**: context/changes/finder-serialization-outage/plan.md
- **Scope**: Phase 2 of 6
- **Base**: 2e2ae1925e4dee46ef53d434ea115bfaf69742c4 (previous phase commit)
- **Head**: 802a1e0ca0d59ccc73b7578c44032d74e466bf3b
- **Worktree**: included(packages/code-reviewer/src/reviewer.ts); excluded(.claude/settings.local.json, context/changes/finder-serialization-outage/follow-ups/review-fixes.md, context/changes/finder-serialization-outage/plan.md, temp_steps.md, context/changes/cloud-exif-orientation/change.md)
- **Checks ran at**: 802a1e0ca0d59ccc73b7578c44032d74e466bf3b with the included worktree edit
- **Manual acceptance**: 1 of 1 confirmed
- **Date**: 2026-09-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

## Findings

### F1 — Gathering notes lose the untrusted-content boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/prompts.ts:399
- **Detail**: `transcriptFromSteps` carries stage-one assistant text into finalization as a `note`. Stage one has read untrusted PR content, but `buildFinalizationPrompt` emits the note as raw text under “Your note from the context-gathering stage”. The finalization instructions name `<review-unit>` and `<file-context>` as untrusted, not these notes. An echoed instruction from reviewed code can therefore be presented as an apparent prior assistant note. Tests cover carrying notes, but not this boundary.
- **Fix**: Fence gathering notes as untrusted data, name that fence in the finalization instructions, and assert the boundary with a hostile-note test.
  - Strength: Preserves the useful transcript while keeping the same trust boundary as fetched file content.
  - Tradeoff: Changes the measured finalization prompt; Phase 4 must evaluate the resulting behavior.
  - Confidence: HIGH — the current prompt and system text show the boundary mismatch directly.
  - Blind spot: No live attack probe was run; influence on the model is inferred from the prompt structure.
- **Decision**: FIX — fixed now in Phase 2, because the Phase 4 gate must measure the final finalization prompt and runs 5/8 on PR #269 showed finalization mostly copies stage-one notes, so whoever steers a note steers the result.

### F2 — Local capture hook expands the phase and fails lint

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: packages/code-reviewer/src/reviewer.ts:364
- **Detail**: The included uncommitted edit adds `FINDER_269_CAPTURE_FILE` instrumentation that appends raw model text and tool results to a path from the environment. This hook is absent from Phase 2's plan. `npm run lint` fails at line 364 (`@typescript-eslint/no-confusing-void-expression`), so the package gate does not pass for the reviewed worktree. The committed head's hook-free content is distinct from this local state.
- **Fix**: Remove the temporary capture hook after the local probe, then rerun package lint.
- **Decision**: FIX — the temporary `FINDER_269_CAPTURE_FILE` hook is reverted; its captures are already saved under `/tmp/finder-269-BSnvQ4/finder-captures/`, and permanent logging is tracked as T2 in the follow-ups.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-serialization-outage/change.md, context/changes/finder-serialization-outage/follow-ups/review-fixes.md, context/changes/finder-serialization-outage/plan.md, context/changes/finder-serialization-outage/reviews/impl-review-2e2ae19.md
- **Verification**: `npm test -- reviewer` passed (52 tests); `npm test -- output-repair` passed (30); `npm test -- retry pipeline` passed (142); `npm test -- finder-provider` passed (12); package `npm test` passed (673); `npm run typecheck` passed; root `npm run format:check` passed. Package `npm run lint` failed with one error at `reviewer.ts:364`. Output logs: `/tmp/finder-p2-review-*.log`.
- **Manual evidence**: Progress marks 2.10 confirmed; `/tmp/finder-269-BSnvQ4/out/review.json` and two `finder-captures/run-*/summary.json` files show the reported 0/5/8 finding counts. This confirms the local smoke outcomes, not Phase 4 quality thresholds.
- **Mutation check**: skipped. `context/foundation/test-plan.md` §2 risks #1–#6 concern the app's Cloud AI pipeline, auth, cap, retention and watchdog; this phase changes `packages/code-reviewer` and maps to none of them.
- **Lessons**: 34 of 37 ledger entries apply to `impl-review` (or omit `Applies to`).
- **Other local edits excluded**: `.claude/settings.local.json`, `context/changes/finder-serialization-outage/follow-ups/review-fixes.md`, `context/changes/finder-serialization-outage/plan.md`, `temp_steps.md`, `context/changes/cloud-exif-orientation/change.md`.
