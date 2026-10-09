<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder model swap — pre-registered gate and measurement

- **Plan**: context/changes/finder-model-swap/plan.md
- **Scope**: Phase 1 of 5
- **Base**: adffc688bf5140d4e3bf9499494f0df0ef4a9ee6 (Progress — the sealed Phase 0 commit)
- **Head**: 7b49836
- **Worktree**: excluded (`plan.md` SHA write-back only; unrelated `.claude/settings.local.json`, `temp_steps.md`,
  `context/changes/cloud-exif-orientation/` not reviewed)
- **Checks ran at**: 7b49836 (current HEAD)
- **Manual acceptance**: 0 of 1 confirmed — pending: 1.5
- **Date**: 2026-10-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Plan drift: §1 Gate core MATCH, §2 Runner MATCH, §3 promptfoo rows MATCH (defects below), §4 Hand-read sample MATCH.
Additions not in the plan, both protective: `parseGateArgs` and `assertSeriesWritable` (refuses to overwrite a
recorded series). Success criteria at 7b49836: `npm test` 785/785, `typecheck`, `lint`, root `format:check` all
exit 0; `node scripts/finder-gate.mjs --endpoint openai --case x` exits 2 with `finder-gate: missing --model`.
Mutation check: skipped — no `test-plan.md` §2 risk maps to the code-reviewer gate tooling.

## Findings

### F1 — A continuation can add a sixth G2 attempt, skip one, or mix series

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/finder-gate-core.mjs:94-119
- **Detail**: `--append` checks only for recorded attempts `>= start`. `n` is not stored in the records, so after a
  `--n 5 --through 1` probe, `--start 2 --append --n 6` runs attempts 2..6 (a sixth G2 attempt — exactly what the
  plan's Critical Implementation Details forbid). `--start 3 --append` after attempt 1 leaves attempt 2 unrecorded
  forever (a later `--start 2` is refused because 3 exists). Model, endpoint and case are not checked against the
  existing records. A process killed mid-attempt leaves a paid attempt with no record, which a continuation would run
  again.
- **Fix**: store `n` in every record; on `--append` require `start === max(recorded) + 1` and the same `n`, `model`,
  `endpoint`, `case`; write a `started` line before each call so a killed attempt is visible and counted as failed.
- **Decision**: FIX — the owner, 2026-10-03, as proposed: every line of a series file carries `n`, `model`,
  `endpoint` and `case`; `--append` requires `start === max(recorded) + 1` and the same four values; a `started`
  line is written before each paid call, and an attempt without a record counts as failed and is never re-run.
  Tests cover the sixth G2 attempt, a gap in numbering, mixing series and an interrupted attempt
  (`finder-gate-core.mjs`, `finder-gate-core.test.mjs`, `finder-gate.mjs`).

### F2 — promptfoo rows: per-metric k/3 is wrong on real exports

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/promptfoo-gate-rows.mjs:119,125
- **Detail**: a row counts only when `success && error === null`. Verified on the archived export
  (`2026-08-11-tool-loop-matrix.json`): an assertion failure sets `success: false`, `failureReason: 1` and puts the
  grader's reason in `error` (e.g. a deepseek React row failing only `flaw_lost_cleanup`), while a provider error has
  `failureReason: 2` and `response.error`. The script would therefore count every other metric of that row as failed
  too. The G3 verdict happens to be the same, but the k/3 figures written to Results would be false. The synthetic
  tests keep `success: true` while a metric fails, which hides it.
- **Fix**: gate the row on `response.error` (provider error), invalidation and A3 leak only; take metrics from
  `componentResults`; add a test row with the real shape (`success: false`, `failureReason: 1`, grader text in
  `error`).
- **Decision**: FIX — the owner, 2026-10-03, as proposed: a row is rejected only by `response.error` (a finder
  error), a provider mismatch or an A3 leak; metrics come from `componentResults`; the test suite carries rows
  of the real shape (`success: false`, `failureReason: 1`, the grader's text in `error`, every component present)
  verified on the archived export (`promptfoo-gate-rows.mjs`, `promptfoo-gate-rows.test.mjs`).

### F3 — A grader failure would be recorded as the candidate's decisive G3 FAIL

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/promptfoo-gate-rows.mjs:119-136; gate.md §4–§5
- **Detail**: an API error of the `gemini-3.1-pro-preview` grader also yields a failing row. Under the sealed stop rule
  that becomes `FAIL (G3)` and ends the candidate, although the candidate did nothing wrong. gate.md does not cover a
  grader failure; whether it is a "failed run" is a protocol question, not a code one. Not verified on data: the
  archive has no grader-error row, so the exact shape is unknown.
- **Fix A ⭐ Recommended**: the script flags rows whose finder succeeded but whose grading has no component results
  or a grader-error reason as `grader error`, and the run as "failed run, not a gate result"; the owner records how a
  failed run is handled as a dated amendment before Phase 2.
  - Strength: keeps a third-party failure from deciding a candidate; same treatment the gate already gives ≠ 12 rows.
  - Tradeoff: needs an amendment (sealed protocol) and a re-run rule for a failed run.
  - Confidence: MEDIUM — the grader-error shape is inferred, not observed.
  - Blind spot: whether promptfoo reports a grader API error as a failed component or as a row error.
- **Fix B**: leave the code; any failing row counts, and the owner decides case by case if it happens.
  - Strength: no amendment now.
  - Tradeoff: the decision would be made after seeing a result.
  - Confidence: HIGH — it is the current behaviour.
  - Blind spot: none significant.
- **Decision**: FIX A, plus Amendment A1 before Phase 2 — the owner, 2026-10-03: a row whose finder succeeded
  but whose grading has no component results, was aborted, or carries a component tagged `metadata.graderError`
  (promptfoo 0.122's `graderFail`, read in its source: a grader transport or parse failure) is `graderError`,
  never a candidate failure; the run is a failed run, not a gate result. Re-grading the stored output without a
  finder call turned out possible at small cost — promptfoo skips the provider for a test carrying
  `providerOutput` — so `promptfoo-regrade-config.mjs` generates that config (errored assertions only) and
  `promptfoo-gate-rows.mjs --regrade` merges the result, refusing a second grader error, a non-grader-error row
  or a row re-graded twice. Verified offline against the real promptfoo CLI (echo provider, no network).

### F4 — An invalidation or A3 leak on a cross-hunk row is mislabelled or silent

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/promptfoo-gate-rows.mjs:132-136
- **Detail**: cross-hunk has no required metric, so an invalidated cross-hunk row fails only G4 (the verdict path
  becomes `paused (G4 only) — owner` instead of an invalidation), and a reasoning leak there fails nothing — the
  script can exit 0 with `reasoningLeaks > 0`. gate.md §4 says A3 and the provider check apply to every row.
- **Fix**: a provider mismatch or A3 leak on **any** row fails the result in its own right (`invalidatedRows`,
  `leakRows`), printed separately from G3/G4, with tests on a cross-hunk row.
- **Decision**: FIX — the owner, 2026-10-03, as proposed: a provider mismatch or an A3 leak on ANY row,
  cross-hunk included, is its own failing result (`invalidatedRows`, `leakRows`), printed apart from G3 and G4;
  G4 is cost only. Tests cover an invalidated and a leaking cross-hunk row.

### F5 — A request aborted by a timeout leaves no telemetry

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/finder-gate-core.mjs `runAttempt`; evals/finder-provider.ts retry
- **Detail**: when a timeout aborts a request and production's retry follows, the aborted request emits no step, so
  `costComplete` can be true while OpenRouter billed it. The key's usage counter governs the budget (gate.md §7),
  but a G4 row could understate.
- **Fix**: mark an attempt with a `timeout` retry as cost-incomplete for G4, or report it next to G4; no code change
  needed if the owner accepts the counter as the authority.
- **Decision**: NO CODE CHANGE to the gate — the owner, 2026-10-03: the key's usage counter governs the budget
  (gate.md §7). Amendment A1 adds: a timeout-triggered retry is reported next to G4 and in the ledger as possibly
  under-costed telemetry and does not by itself fail G4; the G4 line now prints the count of such retries.

### F6 — Every eval provider now retries, not only the candidates

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: packages/code-reviewer/evals/finder-provider.ts:340-344
- **Detail**: planned and intended (the adapter mirrors production), but ordinary matrix runs now wait up to 30 s on
  a 429/5xx and may include a retry's cost; the archived `glm-4.6` G4 baseline had no retries. The gate accepts this
  as the stricter direction.
- **Fix**: none needed; noted for anyone comparing new eval costs with archived ones.
- **Decision**: NO CHANGE — the owner, 2026-10-03: noted; any comparison of new eval costs with archived ones must
  account for the retry.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-model-swap/plan.md, context/changes/finder-model-swap/gate.md
- The retry matches production exactly: the same `withOneRetry` and delay, one retry, the same reviewer instance,
  `FinderOutputError` not retried; requests of both tries are collected through the shared `onStepEnd` with no
  double counting (`repairs` sums across tries, reported only).
- Export-shape assumptions (`results.results`, `testCase.description`, `componentResults[].assertion.metric`,
  `response.metadata`) hold on the archived export; the four case prefixes match `promptfooconfig.yaml` and do not
  collide with the hardening cases. On the archived `baseline-glm-4.6` rows the script reproduces the G4 median
  $0.00100551 exactly.
