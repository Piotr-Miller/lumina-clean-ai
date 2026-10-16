<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: finder-glm-5-3 Implementation Plan

- **Plan**: context/changes/finder-glm-5-3/plan.md
- **Scope**: Phase 3 (phases 1–7)
- **Session**: fresh
- **Base**: 85776d450b6c87da39f7ae3e948b468794eaa2ba (explicit)
- **Head**: 1b8622cd82e8d8b0c7019b57cfd5401ce4b833c4
- **Worktree**: excluded — temp_steps.md (owner's uncommitted edit)
- **Checks ran at**: 1b8622cd82e8d8b0c7019b57cfd5401ce4b833c4
- **Manual acceptance**: 0 of 1 confirmed — pending: 3.5
- **Date**: 2026-10-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — G3 can pass a failed finder row or absent response telemetry

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/promptfoo-gate-rows.mjs:334
- **Detail**: The global pass expression omits `finderErrorRows`. The cross-hunk case has no required metrics (line 58), so a finder parse failure or timeout after correctly reported requests only zeros its diagnostic counts; it does not make `g3.pass` false. With otherwise accepted model/provider and reasoning telemetry, the twelve-row batch can therefore pass despite that finder failure. This contradicts the checker's own row-failure contract and the planned production-pass measurement. Separately, `checkRow` turns absent response-request telemetry into `[]` (line 128), producing empty provider/model mismatch lists. A row retaining correct `requestReasoning` can pass without any reported response model or provider. The owner's 2026-10-13 decision requires reported accepted models, and the checker explicitly claims missing telemetry fails closed. The lesson about guards counting attempts rather than successful metrics applies directly.
- **Fix**: Require zero finder-error rows and nonempty response-request telemetry for every original row; add regressions for a failed cross-hunk finder and empty `requests`. Keep cross-hunk recall diagnostic, and preserve failed HTTP requests being recorded separately in `requestReasoning`.
- **Decision**: FIXED — proposed fix; siblings: packages/code-reviewer/scripts/glm-gate-core.mjs n/a (already rejects empty finder-request telemetry), packages/code-reviewer/scripts/glm-gate.mjs fixed (both G3 modes use the shared checker), packages/code-reviewer/scripts/promptfoo-regrade-config.mjs n/a (re-grades stored output; mergeRegrade preserves original finder flags and telemetry); reopened: none.

### F2 — Reconciliation can count earlier telemetry-settled spend twice

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/glm-gate.mjs:683
- **Detail**: Complete runs settle immediately from telemetry (lines 519–526), allowing the next step to start while the key counter still lags. Reconciliation attributes `second.value - started.counterBefore` entirely to the incomplete step and appends that as its settled cost (lines 721–728). If an earlier run cost $0.10 but the next step's admission counter is still T0, and that next step costs $0.60, a later stable counter at T0 + $0.70 assigns $0.70 to the new step. The settled sum becomes $0.80 for $0.70 actual spend. `max(counterDelta, settledTotal)` cannot correct the inflated sum. The same overlap on an incomplete #247 or #269 run inflates its monthly mean and can falsely reject the cost gate. Counter lag is explicitly anticipated in Definitions; current tests cover individual unsettled steps, not this mixed settlement sequence.
- **Fix**: Attribute counter settlement cumulatively from T0, accounting for costs already settled and retaining a catch-up check before assigning the residual.
  - Strength: Preserves immediate settlement of complete telemetry while preventing earlier charges from being attributed twice.
  - Tradeoff: Requires explicit accounting for already attributed counter spend and external usage; the exclusive-key assumption must remain visible.
  - Confidence: HIGH — the arithmetic follows the current admission and reconciliation paths directly.
  - Blind spot: No live counter experiment was run; provider lag was simulated only by reasoning over the permitted local code.
- **Decision**: FIXED — proposed cumulative settlement; siblings: packages/code-reviewer/scripts/glm-gate.mjs run/G3/regrade fixed (share commandReconcile), packages/code-reviewer/scripts/glm-gate-core.mjs n/a (seriesSpend aggregates existing settlements; no per-step counter attribution), packages/code-reviewer/scripts/glm-gate-sheet.mjs n/a (no settlement logic); reopened: none.

### F3 — Outcome can admit the series before its final step settles

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/scripts/glm-gate-core.mjs:501
- **Detail**: `scheduleState` returns `measured` once ten G1 records exist (line 404), even when the final paid step is unsettled. This is reachable with a valid tenth run lacking complete cost telemetry or the one permitted invalid G1 run. `meanSettledCost` then returns null for m269, so the lower bound is null (line 447); the cost rejection branch is skipped and a passing hand-read yields `ADMITTED (pending G5)`. Phase 5 requires final reconciliation and settled spend; the monthly means include every executed run, including invalid runs. Admission without that last cost can hide a failed cost bound or budget overshoot.
- **Fix**: Keep outcome pending settlement while any paid step is unsettled, and require both final run means before `ADMITTED (pending G5)`; cover a tenth G1 run with incomplete or absent cost telemetry.
- **Decision**: FIXED — proposed settlement guard at the final schedule transition; siblings: packages/code-reviewer/scripts/glm-gate.mjs outcome fixed (uses computeOutcome and the shared schedule), packages/code-reviewer/scripts/glm-gate-core.mjs admit n/a (already refuses unsettled paid steps), packages/code-reviewer/scripts/glm-gate-sheet.mjs n/a (resolves hand-read only, never admits the series); reopened: none.

### F4 — Outcome trusts a hand-read boolean without checking coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/glm-gate.mjs:767
- **Detail**: `outcome --hand-read` reads arbitrary saved resolver JSON and `computeOutcome` checks only `handRead.pass` (core line 502). It verifies no case results, current run IDs or artifact hashes. The resolver itself legitimately produces `pass: true` for two empty sheets against an early series because `all.every` on zero runs is true (sheet line 283). Reusing that actual resolver output after measurement admits the series without any #247/#269 classifications or D2 approvals. A partial or dry-run resolver result creates the same problem. The existing core test even supplies bare `{pass: true}`. SHA-checking stored review.json copies in the resolver is useful, but its evidence is lost at the outcome boundary.
- **Fix**: Bind resolver output to the current valid run IDs and review.json hashes, and require exact case/run coverage and passing per-run results before admission.
  - Strength: Keeps resolution offline and independently reviewable while ensuring the hand-read belongs to the measured series.
  - Tradeoff: Adds a small evidence contract between resolver and outcome; empty, partial and stale results must produce a clear refusal or pending state.
  - Confidence: HIGH — both empty resolver success and boolean-only outcome consumption are explicit in the code.
  - Blind spot: The paid series has not run; no saved paid hand-read result exists to validate end to end.
- **Decision**: FIXED — proposed evidence binding; siblings: packages/code-reviewer/scripts/glm-gate-sheet.mjs resolve fixed (emits per-run reviewSha256), packages/code-reviewer/scripts/glm-gate.mjs outcome/write fixed (both use the checked computeOutcome), packages/code-reviewer/scripts/glm-gate-core.mjs renderOutcome fixed (prints evidence problems and regeneration guidance); reopened: none.

### F5 — No-artifact records use false instead of the promised null

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/scripts/glm-gate-core.mjs:242
- **Detail**: Phase 3's no-artifact contract and Testing Strategy explicitly prescribe `artifact: null`. Classification and the runner write `artifact: false` instead, and the new runner test pins that value. Current consumers consistently treat this field as a boolean, so no present runtime failure was identified; nevertheless the promised terminal-record schema differs from the instrument that will be sealed.
- **Fix**: Emit `artifact: null` on the no-artifact branch and update its assertions, preserving existing truthiness checks for artifact-bearing records.
- **Decision**: FIXED — proposed record-format correction; siblings: packages/code-reviewer/scripts/glm-gate.mjs interrupted branch fixed (also emits null), artifact consumers in packages/code-reviewer/scripts/glm-gate.mjs n/a (truthiness checks preserve behavior), packages/code-reviewer/scripts/glm-gate-sheet.mjs n/a (selects valid runs rather than comparing artifact to false); reopened: none.

## Verification

Commands ran at the recorded head, with stdout/stderr captured separately and exit statuses read directly. No paid command, key-counter read, network probe, grader call, push or commit was performed.

| Progress | Command                                                               | Exit | Evidence                                                                                         |
| -------- | --------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------ |
| 3.1      | `cd packages/code-reviewer && npx vitest run scripts/`                | 0    | `Test Files 7 passed (7)`; `Tests 222 passed (222)`                                              |
| 3.2      | `node scripts/glm-gate.mjs run --case clean --run-id dry-1 --dry-run` | 0    | `VALID RUN: dry-1-r3 (clean, exit 0, 2 finder request(s), settled from telemetry), 0 finding(s)` |
| 3.3      | `glm-gate-core.test.mjs`, included in 3.1                             | 0    | Test reproduces sonnet-effort low: total $6.628083; all three weighted terms asserted            |
| 3.4      | `cd packages/code-reviewer && npx tsc --noEmit`                       | 0    | No diagnostics                                                                                   |
| 3.4      | `cd packages/code-reviewer && npx eslint .`                           | 0    | No diagnostics                                                                                   |
| 3.4      | Root `npx prettier --check .`                                         | 0    | `All matched files use Prettier code style!`                                                     |
| Broader  | `cd packages/code-reviewer && npx vitest run`                         | 0    | `Test Files 27 passed (27)`; `Tests 960 passed (960)`                                            |

The successful existing suites do not exercise the defect scenarios in F1–F4. Those findings are supported by local code-path analysis and the concrete input/arithmetic examples above, not by a live reproduction or a newly added failing test. Temporary verification logs are outside the repository.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-glm-5-3/change.md, context/changes/finder-glm-5-3/plan.md, context/changes/finder-glm-5-3/reviews/impl-review-phase-2-64fad61.md.
- Reviewed commits: 965ae3d (tooling) and 1b8622c (re-runnable dry-run IDs). The follow-up correctly preserves refusal of reused paid IDs and stores repeated smoke runs under distinct suffixes.
- Selected and read 35 of 38 lessons: every entry naming impl-review or all, plus entries without an applicability declaration. No earlier Phase 3 report exists. Two read-only delegates independently reviewed plan drift and safety/patterns.
- Phase 3 Automated rows 3.1–3.4 carry ancestor commit 965ae3d; verification above rechecks their current Phase 3 implementation. No n/a or malformed rows occur in scope. The acceptance-state script exited 0: 3.5 pending, earlier 2.7 current at b6afeb193255ff875a53e0e9254d68942c3f5730. No acceptance or Progress mark was changed.
- Manual 3.5 remains the owner's decision. Inspected `~/.cache/finder-glm-5-3/dry-run/sheets/hand-read-269.md`: one canned file-level finding, separate verdict table, verbatim description/suggestion, run artifact hash, generated-sheet hash and D2 pre-flag. The sheet clearly labels the canned finding and leaves the verdict empty. A file-level finding appropriately has no line range.
- Mutation testing skipped: the change touches measurement tooling and the reviewer eval adapter, not behavior behind any of the six product risks in test-plan.md §2. No risk-to-module mapping justifies a scoped Stryker run here; it is also outside the user's permitted command list.
- OpenRouter 401/402 classification is a MATCH to the current plan. Definitions requires CLI exit 0 and an artifact; Phase 3 explicitly makes nonzero exits invalid. No auth/credit exemption exists in the stop rules. Therefore these failures count against G2, #247 reliability or G1 as implemented. If the owner wants a different experimental policy, decide and amend it before the seal. An uncharged failure also conservatively remains unsettled when the counter never advances, as already tested; this review does not invent a settlement exemption.
- The plain-Node runner, pure core and injected I/O fit existing script patterns. Stub preloading and its separate cache keep the permitted smoke test offline. Wider forbidden env checks protect unchanged models/routing/timeouts/step caps; they are a reasonable guard against contaminating the measurement. The manifest subcommand and sealing the stub support repeatability. The clean fixture invocation follows the predecessor's G2 setup. Fixed-order enforcement and explicit probe confirmation implement the planned owner pause. G3 grader-error waiting follows the inherited “not a gate result” protocol rather than treating grader failure as candidate failure. These are justified implementation choices, not additional owner approvals inferred by this review.
- Immediate settlement of complete telemetry is compatible with the plan's incomplete-telemetry rule; F2 concerns its interaction with a lagging counter. A timeout retry conservatively makes telemetry incomplete because an aborted request may still be billed. Reading findings from SHA-checked stored artifacts strengthens the sheet's evidence boundary, subject to F4 at outcome. The regrade scratch ignore and added runner/wire/regrade tests are supporting scope, with no substantive pattern violation found.
- No production workflow restoration, model/routing change outside the approved Phase 3 adapter behavior, raw screening publication or archive edit occurred in this phase. Later phases and paid gates were not executed or graded as missing Phase 3 implementation.
- Report and change.md date stamp are left uncommitted and entered in the workflow carry record. No implementation fix was applied; all five findings await triage.

## Triage verification — 2026-10-14

- **F1**: Owner selected Fix now. Added six regressions covering diagnostic cross-hunk finder parse/length/timeout errors and empty/absent/malformed response-request telemetry with correct reasoning capture. All six failed before the fix (exit 1; 53 existing cases passed). After adding the independent finder-error guard and rejecting zero response requests for model/provider validity, the full package suite passed (exit 0; 966 tests in 27 files). Package typecheck, lint and formatting of the two changed code/test files each exited 0. Existing regrade-success coverage remains green despite regrade-only rows having no finder telemetry; merged rows preserve the original finder evidence.
- **Acceptance after F1**: acceptance-state.sh exited 0; 2.7 remains current, 3.5 remains pending, no checked Manual row became stale. Progress was not edited. Report and both modified code/test files are carried uncommitted; temp_steps.md remains excluded. F2–F5 await decisions. The original review verdict continues to describe the recorded head, not an automatic approval of the uncommitted fix.
- **F2**: Owner selected Fix now. Reconciliation now computes the residual of cumulative key usage since T0 minus already settled spend, records both components in its reconciliation line, and retains an explicit lag guard before settlement. Unrelated usage on the key remains conservatively included; a code comment makes the no-concurrent-external-spending assumption visible. Three new regressions failed before the fix (exit 1; 30 existing runner tests passed): double attribution of a delayed earlier charge, cumulative usage below prior settlements, and cumulative usage insufficient for prior settlements plus the current step's known cost. After the fix, the full package suite passed (exit 0; 969 tests in 27 files). Package typecheck, lint and formatting of both modified runner files each exited 0. The regression checks the resulting per-step cost, settled series sum and mean, rather than only a successful exit.
- **Acceptance after F2**: acceptance-state.sh exited 0; 2.7 remains current and 3.5 pending, with no stale checked Manual row. No Progress or acceptance mark changed. Runner and runner tests are carried uncommitted alongside the F1 files and report; no counter endpoint or paid command was invoked. F3–F5 await decisions.
- **F3**: Owner selected Fix now. The final schedule transition now waits for every paid step to settle and for a final #269 cost mean; the existing #247 mean requirement remains. Six new regressions failed before the fix (exit 1; 73 existing core tests passed), covering valid/invalid tenth G1 runs without settlement, cost rejection after final settlement with budget-stop precedence while pending, absent final mean despite terminal records, and unsettled earlier clean/G3 steps. They also verify that settlement restores admission when gates pass and includes an invalid run's settled cost. After the fix, the full package suite passed (exit 0; 975 tests in 27 files). Package typecheck, lint and formatting of both modified core files each exited 0. No paid command or live API call ran.
- **Acceptance after F3**: acceptance-state.sh exited 0; 2.7 remains current, 3.5 remains pending, and no checked Manual row became stale. Progress and acceptance were not edited. The core and core tests are carried uncommitted alongside prior fixes and the report. F4–F5 await decisions.
- **F4**: Owner selected Fix now. Resolver results now carry each run's review.json sha256. Outcome requires exact coverage of the current valid #247/#269 run sets, matching artifact hashes and published finding counts, valid rejection/D2 counts, and consistent per-run and overall verdicts. Missing, duplicate, extra, stale or malformed evidence remains pending with concrete problems and `resolve` guidance; complete evidence with a failed hand-read remains NOT ADMITTED. Thirteen invalid-evidence regressions and two strengthened resolver-hash assertions failed before the fix (exit 1; 100 existing checks passed). New positive cases accept reordered complete coverage and nine valid G1 runs while retaining zero-finding #247 runs. The core fixtures use the actual resolver to produce evidence rather than bare booleans. After the fix, the full package suite passed (exit 0; 990 tests in 27 files). Package typecheck, lint and formatting of the four modified core/sheet files each exited 0. No paid command or live API call ran.
- **Acceptance after F4**: acceptance-state.sh exited 0; 2.7 remains current and 3.5 remains pending, with no stale checked Manual row. No acceptance or Progress mark changed. Sheet/resolver code and tests are carried uncommitted with the prior fixes and report. F5 alone awaits a decision.
- **F5**: Owner selected Fix now. The classifier's no-artifact branch and the runner's interruption branch now emit artifact:null, matching the plan. Existing classifier and persisted-record assertions were updated; artifact-bearing records and truthiness-based copying/cost handling remain unchanged. The final full package suite passed (exit 0; 990 tests in 27 files), package typecheck and lint each exited 0, and root `npx prettier --check .` exited 0. A sibling search found no remaining artifact:false output or strict false comparison in the active scripts. No paid command or live API call ran.
- **Acceptance after F5**: acceptance-state.sh exited 0; 2.7 remains current and 3.5 remains pending, with no stale checked Manual row. Progress and acceptance were not edited. All modified workflow/code/test files remain carried and uncommitted; temp_steps.md remains excluded and untouched.

## Triage complete — 2026-10-14

- **Fixed**: F1, F2, F3, F4, F5 (5).
- **Rule / skipped / accepted / pending findings**: none.
- **Final verification**: 990 package tests passed; typecheck, lint and repository-wide formatting passed. No spend, commit or push. Manual 3.5 remains pending owner acceptance.
- **Verdict boundary**: the original NEEDS ATTENTION verdict describes 1b8622c. The fixes and their validation above are uncommitted working-tree changes; triage does not rewrite that verdict or certify a newer reviewed revision.
