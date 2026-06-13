<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: useCloudJob #6 decision unit test — Phase 1 (extract pure decision module + rewire hook)

- **Plan**: context/changes/usecloudjob-watchdog-unit/plan.md
- **Scope**: Phase 1 of 2
- **Date**: 2026-06-13
- **Commit**: 50ad3ca
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success criteria (re-verified post-commit)

- 1.1 `npx tsc --noEmit` → exit 0, clean.
- 1.2 `npx eslint src/components/hooks/cloud-job-decisions.ts src/components/hooks/useCloudJob.ts` → clean (also enforced by the pre-commit hook on 50ad3ca).
- 1.3 `npm run test:unit` → 12 files / 113 tests passed, incl. `cloud-timings.test.ts`.
- 1.4 Hook still exports `QUEUED_WATCHDOG_MS` / `PROCESSING_WATCHDOG_MS` / `SLOW_HINT_MS` (cloud-timings imports resolved + passed) and `CloudJobPhase` (re-exported).
- 1.5 Manual diff review confirmed by the human against the displayed diff (observable evidence: the 7-hunk diff — five 1:1 decision swaps + the import/re-export + constant move).
- Mutation check: **correctly deferred to Phase 2** — `cloud-job-decisions.ts` has no test yet (Phase 2 adds `tests/cloud-job-decisions.test.ts` + scoped Stryker, criterion 2.4). Running Stryker now would survive every mutant by construction.

## Drift summary

Every planned Phase-1 change MATCHES:

- `cloud-job-decisions.ts` (new): the exact 5 predicates (`isTerminalStatus`, `shouldArmProcessingBudget`, `shouldFailAfterQueuedReRead`, `deriveCloudPhase`, `deriveDisplayError`) + `CloudJobPhase` + `TIMEOUT_MESSAGE` / `GENERIC_FAILED_MESSAGE`. Bodies are verbatim lifts of the cited hook expressions (semantics verified 1:1).
- `useCloudJob.ts`: the 5 decision sites delegate; `CloudJobPhase` re-exported; the local type def + `TIMEOUT_MESSAGE` / `GENERIC_FAILED_MESSAGE` removed; `RESULT_LOAD_MESSAGE` kept; timing-constant exports intact. No surrounding logic moved (the `sawProcessing`/`clearTimeout`/timer-arm, `terminal` + `clearTimers`, the `onQueuedDeadline` double-guard around the `await`, the `setAuth → subscribe` sequence, teardown — all byte-identical).

No "What We're NOT Doing" boundary crossed: no reducer extraction, no renderHook/RTL/jsdom, no behavior change, no new E2E.

## Findings

### F1 — `deriveCloudPhase`/`deriveDisplayError` use inline object-type params, not a named interface

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/hooks/cloud-job-decisions.ts:46, :66
- **Detail**: The repo's pure-decision precedent `cloud-create-job.handler.ts` declares a named input interface (`CreateCloudJobInput`); the two derive-functions here take an inline `input: { … }` object type. This is a deliberate match to the plan's own signature sketch (plan §Phase 1 contract uses inline object types), the params are local (not a passed-around route boundary), and the functions are small — so it is not a substantive inconsistency. Recorded for awareness only.
- **Fix**: None — accept as-is (matches the plan contract; named interfaces would be over-engineering for two small local predicates).
- **Decision**: ACCEPTED 2026-06-13 — no action.

## Notes

Phase 1 is a behavior-preserving refactor; its protective value is realized in Phase 2 (the deterministic unit suite that pins the #6 decisions + the scoped mutation pass). The plan.md SHA write-back (1.1–1.4 → 50ad3ca) and this review report sit uncommitted in the working tree; they land with Phase 2's phase-end commit (or the epilogue).
