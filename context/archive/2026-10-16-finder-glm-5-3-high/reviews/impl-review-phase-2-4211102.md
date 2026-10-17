<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: finder-glm-5-3-high Implementation Plan

- **Plan**: context/changes/finder-glm-5-3-high/plan.md
- **Scope**: Phase 2 (phases 1–7)
- **Session**: fresh
- **Base**: 40217a6c07d3cef418cedcaebeb3720db1df6fdf (Progress — the previous phase's commit)
- **Head**: 4211102d9bc71fffeb48bc61048f9b163611a447
- **Worktree**: included(context/changes/finder-glm-5-3-high/plan.md, context/changes/finder-glm-5-3-high/change.md)
- **Checks ran at**: 4211102d9bc71fffeb48bc61048f9b163611a447
- **Manual acceptance**: 1 of 1 confirmed
- **Date**: 2026-10-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

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

### F1 — A missing fixtures export writes an absolute local path into committed screening files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/glm-gate.mjs:1003
- **Detail**: When promptfoo leaves no export, `commandFixtures` records
  ``problems: [`no usable export: ${errorLine(error)}`]``. Node's ENOENT message carries the absolute export path:
  `<cache>/screening/sfix.export.json`, with the default cache under the home directory
  (`~/.cache/finder-glm-5-3-high`). That text lands in three committed files:
  - `screening/results/sfix.fixture-rows.json`;
  - the `fixtures` line in `screening/series.jsonl`;
  - `screening.md`, through `screeningPauseOf` ("failed export: …", `glm-gate-core.mjs:1042-1043`) and
    `fixturesInWords` ("not a result: …").

  The plan's Desired End State says "nothing committed carries an absolute local path". The rows file is pinned by
  sha256 in the ledger, and the screened tree freezes at the first paid step, so this cannot be corrected after the fact.
  The only test of this path (`promptfoo-gate-rows.test.mjs:646`) uses the shortened text `"no usable export: ENOENT"`.
  The gate's G3 twin (`glm-gate.mjs:921`, `gate/g3-rows.json` and the gate ledger) has the same defect. It predates
  this phase but is a manifest file, so it can still be fixed before the seal.

- **Fix**: In both catch blocks, record `error.code ?? error.name` plus `shown(context, exportPath)` instead of the
  message. Add a runner test with a real missing export that asserts no absolute path in the rows file, the ledger or
  `screening.md`. This must land before the baseline `preflight --screening`.
- **Decision**: FIXED — `readExport` / `unusableExport` in `glm-gate.mjs` record `<shown path> (<code or name>)`; new
  tests in `glm-gate-screening.test.mjs` (rows file, ledger, `screening.md`) and `glm-gate.test.mjs` (G3 rows file,
  gate ledger), both failing against the old message (negative control); siblings: `glm-gate.mjs` G3 catch fixed,
  `inputMismatches` n/a (refusal text, never written to a ledger), adapter finder-error text n/a (no local path; Review
  Notes, inherited); reopened: 2.6

### F2 — A budget overshoot ends the screening before the D2 line is asked for, and the outcome then reads STOP (d)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/glm-gate-core.mjs:1111
- **Detail**: `screeningState` returns `INCOMPLETE (budget)` when `settledTotal > $0.75` (`:1111-1115`). That check
  runs before the loop that waits for a #269 run's `d2` line (`:1121-1124`). Probe: a valid `s269-01` settles at $0.65,
  taking T_s to $0.80. The state is then `{ended: "INCOMPLETE (budget)", waitingFor: null}`, and the runner prints
  "SCREENING ENDED … record it with `outcome --screening --write`" without asking for D2. `computeScreeningOutcome`
  counts the undecided D2 as no match, so the verdict is `STOP (d: no D2 in s269-01)`. With an owner `match` it would
  have been `INCOMPLETE (budget)`, which the owner decides; the probe confirms that. Owner decision 3(a) requires the
  D2 decision for every valid #269 run. The plan's own precedence case ("a valid `no-match` that also takes T_s above
  $0.75 gives `STOP (d …)`") assumes the decision is still taken.
- **Fix**: In `screeningState`, check the started-without-record block and a pending `d2` line before the overshoot
  branch; recording `d2` is free. Add a test: an overshooting valid `s269-01` first waits for its d2 line, `--match`
  then gives `INCOMPLETE (budget)`, and `--none` gives `STOP (d)`.
- **Decision**: FIXED — `screeningState` now checks the started-without-record block and a pending `d2` line before
  the budget end; new test "a valid #269 run that takes T_s above $0.75 waits for its D2 line before the screening
  ends" in `glm-gate-screening.test.mjs`; siblings: gate `scheduleState` n/a (`computeOutcome` puts
  `INCOMPLETE (budget)` ahead of `FAIL (D2)` by the predecessor's sealed precedence, so the gate verdict does not
  depend on that run's D2); reopened: 1.8

### F3 — The screening's P is taken from a run stopped by a confirmed 401/402

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/glm-gate-core.mjs:926
- **Detail**: `screeningEstimate` sets P to the largest settled cost of the kind over every started step, including
  one stopped by a confirmed 401/402. § Definitions says such a run "is not a sample". Probe: `s269-01` is stopped by
  a 402 and settles at $0.001, with T_s at $0.60. `admitScreening(…, "pr269")` returns `{p: 0.001, admit: true}`,
  while the $0.30 first estimate would have refused `s269-02` (0.60 + 0.30 > 0.75). The same applies to `sfix-02` and
  `s247-02` after a 401/402. The result is spend past the $0.75 cap that admission exists to prevent, unless the
  optional key limit (Phase 3 §2.1) catches it. H3 is a plan-chosen term that the owner confirms in `screening.md` §
  Rules, so the chosen reading must be written there.
- **Fix A ⭐ Recommended**: Count only sample runs in P. Leave out a run stopped by a confirmed 401/402 (the existing
  `authCreditStopped`), fall back to the first estimate when no sample of the kind has settled, and restate H3 to say
  so.
  - Strength: Consistent with "not a sample" in § Definitions; `meanSettledCost` already filters the same way; keeps
    H3's adaptive P for real samples.
  - Tradeoff: A cheap sample that failed early (for example a 5xx before any finder step) still lowers P.
  - Confidence: HIGH — one filter, with an existing predicate.
  - Blind spot: The gate's `stepEstimate` (`:454-460`) has the same pattern. Changing it is a gate-rule change, which
    § What We're NOT Doing rules out without an owner amendment.
- **Fix B**: P = max(first estimate, largest settled sample cost).
  - Strength: Also covers a cheap invalid sample; P never falls below the plan's first estimates.
  - Tradeoff: Refuses `s269-02` whenever T_s > $0.45, which H3 was written to avoid ("the gate's 2 × P would refuse
    the second #269 run at plausible costs").
  - Confidence: MED — whether it bites depends on the unknown `high` costs.
  - Blind spot: Actual #269 cost at `high` is unmeasured until the screening runs.
- **Decision**: FIXED — Fix A: `screeningEstimate` leaves out runs stopped by a confirmed 401/402; H3 and Testing
  Strategy "Budget" restated in `plan.md`, owner decision noted in `change.md`; new test "P counts sample runs only"
  (fails against the old filter); siblings: gate `stepEstimate` n/a (a sealed predecessor rule; § What We're NOT Doing
  rules out a gate-rule change without an owner amendment, and the gate's 2 × P plus the $3.00 pause bound it);
  reopened: none (1.8 and 2.6 already reopened)

### F4 — A fixture row whose finder failed before any request pauses as `mismatch`, not `invalid-run`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/scripts/glm-gate-core.mjs:1028
- **Detail**: Take a row that fails before any step ends, for example a 5xx on both attempts. `checkRow` marks it
  `invalidated` and `modelInvalid` because `requests.length === 0` (`promptfoo-gate-rows.mjs:156`, `:159`).
  `screeningPauseOf` ranks `mismatch` above `invalid-run`, so the pause reads
  `mismatch: … providers []; … models []`, and the owner must run `continue --for mismatch`. The finder error appears
  only with the suffix `(invalid-run)`. Phase 2 §1 classes "any other finder error" as an invalid row. A CLI run with
  zero requests is classed `no-finder-request-telemetry` → `invalid-run`, so the two screening paths disagree. The
  pinning case (`glm-gate-screening.test.mjs:348-357`) builds a finder-error row without `invalidatedRows`, so it
  misses this.
- **Fix**: In `screeningPauseOf`, attribute a row that has a finder error and no request to `invalid-run`. Keep
  `mismatch` for rows whose requests name an unlisted provider or model. Add a test row that sets both
  `invalidatedRows` and `finderErrorRows`.
- **Decision**: FIXED — `screeningPauseOf` drops the empty provider and model lists of a row whose finder error
  explains them, so such a row pauses `invalid-run`. Two new tests: the early-failure case, and a row that reported an
  unlisted provider, which stays `mismatch`. The early-failure test fails without the fix. Siblings: CLI runs n/a
  (already `no-finder-request-telemetry` → `invalid-run`); the gate's G3 summary n/a (a zero-request row is a provider
  mismatch under the predecessor's sealed G3 rule). Reopened: none (1.8 and 2.6 already reopened).

### F5 — Reruns after a confirmed 401/402 have no limit, while the plan says "once more"

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/scripts/glm-gate-core.mjs:1138
- **Detail**: The plan (Phase 2 §1, "401/402 on a one-step kind") says that kind "runs once more", and the owner note
  says it "gives one rerun". `screeningState` drops every 401/402-stopped fixtures or #247 step from the sample count,
  and `screeningStepId` numbers the next one. A second 402 on `sfix-02`, followed by `continue`, therefore admits
  `sfix-03`, and so on. Each rerun still needs the owner's `continue --screening --for auth-credit` and passes
  admission, so the owner keeps control. But the rule the code applies is "one rerun per confirmed 401/402", which no
  document states.
- **Fix A ⭐ Recommended**: Write the implemented reading into plan § Definitions (m247 / m269 (screening)) and
  Phase 2 §1, for owner confirmation in `screening.md` § Rules: one rerun per confirmed 401/402, each after its own
  `continue`.
  - Strength: No code change before the screened-tree baseline. `screeningContinued` is per step and admission runs
    per step, so every rerun stays an owner decision.
  - Tradeoff: Extends the 2026-10-16 owner wording beyond its literal scope.
  - Confidence: HIGH — the code already behaves this way, and the tests pin the first rerun.
  - Blind spot: None significant.
- **Fix B**: Cap reruns at one per kind in `screeningState`, and end the screening on a second confirmed 401/402 of
  that kind.
  - Strength: Literal to the owner text.
  - Tradeoff: Needs a terminal label that the plan's `ended` list does not define, which is itself a rule change.
  - Confidence: MED — the label and its precedence would need owner approval.
  - Blind spot: How the owner wants a mid-screening credit top-up handled.
- **Decision**: FIXED — Fix A. "One rerun per stop, each after its own `continue`" is written into `plan.md` §
  Definitions (m247 / m269 (screening)) and into Phase 2 § 1 (Run ids; "401/402 on a one-step kind"), and the owner
  decision is noted in `change.md`. No code change. Siblings: none (searched the plan for "once more" and for
  `sfix-02` / `s247-02`). Reopened: none.

### F6 — Three implemented rules differ from the plan text the owner will confirm in Phases 3–4

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/scripts/glm-gate.mjs:1006, packages/code-reviewer/scripts/glm-gate-core.mjs:842,
  packages/code-reviewer/scripts/glm-gate-core.mjs:989
- **Detail**: Each of the three is a sound implementation choice, but none was written back into the plan. Phase 3 §1
  restates "the outcome rules of Phase 2 § 1" for term-by-term owner confirmation, and Phase 4 restates the gate.
  1. **Fixture rows file.** The plan names `screening/results/fixture-rows.json` (plan:414). The code writes
     `screening/results/<stepId>.fixture-rows.json`, which is needed once `sfix-02` can exist.
  2. **G5 cell.** The plan says "`G5: not measured`" after the D2 early stop and "A series without an early stop shows
     `G5: pending (Phase 7)`" (plan:505-512). The code shows `not measured` for every `NOT ADMITTED …` and
     `INCOMPLETE (budget)` verdict, a measured series failing its hand-read included. That is more truthful, since
     Phase 7 runs only on ADMITTED.
  3. **Rule (b) on CLI runs.** It also requires that no reason starts with `finder-output:`, and the terminal scan drops
     the configuration, step, `rejected output (` and `Finder output rejected (` lines, not only the `retrying …`
     lines (plan:457-460). These narrow (b) and route an ambiguous run to an H5 pause; they are pinned at
     `glm-gate-core.test.mjs:337-344`.
- **Fix**: Amend plan Phase 2 §1 (ledger paths, rule (b)) and §2 (G5 cell) to the implemented rules, so that
  `screening.md` § Rules and the pre-registration restate what the code does.
- **Decision**: FIXED — `plan.md` Phase 2 § 1 now names `screening/results/<stepId>.fixture-rows.json` and states rule
  (b)'s extra conditions; § 2 states the G5 cell rule. Siblings: none (the plan was searched for `fixture-rows.json`,
  "every `retrying …` line" and "pending (Phase 7)"; § Definitions keeps the owner's wording of (b) verbatim, by
  design). Reopened: none.

### F7 — Stop rule (b)'s runner wiring and `spawnCommand`'s line edges are unpinned

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/glm-gate.mjs:683
- **Detail**:
  - **Rule (b) wiring.** The screening tests inject `terminalTimeout: true` into records
    (`glm-gate-screening.test.mjs:181`, `:204`, `:217`). The only runner-level record test uses timeout-free stderr
    (`glm-gate.test.mjs:610`). Wiring `classification.log.timeout`, which matches the retry line itself, instead of
    `log.terminalTimeout` at `:683` would pass the whole suite. That is the exact confusion the plan warns about
    (Phase 2 §1, "Rule (b)").
  - **`spawnCommand` edges.** Deleting the CRLF strip (`:1503`) or the close-time note of an unterminated last line
    (`:1526`) also passes.
  - **Separation test.** It (`glm-gate-screening.test.mjs:1007`) is refused for a missing manifest, so it cannot show
    "a gate step ignores screening records".
- **Fix**: Add three runner tests:
  - a `retrying finder after TimeoutError` line followed by a non-timeout terminal error, which records
    `terminalTimeout: false` and gives no STOP (b);
  - a terminal "exceeded its 300000 ms budget", which gives STOP (b);
  - a `spawnCommand` child that writes CRLF lines and a final line without a newline.
- **Decision**: FIXED. Two runner tests for rule (b) are in `glm-gate-screening.test.mjs` ("stop rule (b) through the
  runner"), and the CRLF / final-line `spawnCommand` test is in `glm-gate.test.mjs`. Three negative controls each fail
  a new test: wiring `log.timeout`, deleting the `\r` strip, and deleting the close-time partial note. Siblings: the
  separation test is fixed. It now seals a gate manifest and runs `preflight` and `clean-01` next to the screening
  ledger, then asserts the gate ledger holds only its own steps and admits at T = 0. Reopened: none (1.8 and 2.6 were
  already reopened).

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-glm-5-3-high/change.md,
  context/changes/finder-glm-5-3-high/plan.md, context/changes/finder-glm-5-3-high/reviews/impl-review-phase-1-40217a6.md
- **Boundary.** Phase 2 spans two commits: `4b6fca3` (feat) and `4211102` (the one-run cost-line fix). The base is
  `40217a6`, Phase 1's commit. Head = `HEAD`, so no temporary checkout was needed.
- **Worktree.** Included: the uncommitted bookkeeping in `plan.md` (Progress: 2.1–2.5 suffixed `4211102`, 1.8
  re-confirmed and 2.6 accepted at `4211102…`) and `change.md` (the 1.8 re-confirm note). Excluded: `temp_steps.md`,
  the owner's notes, which is outside the reviewed scope.
- **Plan drift.** All five sections of Phase 2 are implemented in the 13 planned package files, with no unplanned file.
  `isD2Candidate` moved into core and the sheet imports it. The screening reuses `executeRun`, `classifyRun`,
  `runCost` and `reconcile` (H1). Admission refusals all fire before `started` and the spawn, and the exit codes match
  the gate's (2 refusal, 4 budget, 5 confirmed 401/402). Stop rule (c) compares with EPSILON 1e-9, and equality does
  not stop. One unplanned fix is stated in the `4b6fca3` body: `describeSummary` threw on the minimal summary of an
  unusable export. The "What We're NOT Doing" list is respected: no change under `src/`, no change to `COST_WEIGHTS`,
  `BUDGET` or `FIRST_STEP_ESTIMATE`, nothing under `context/archive/`. Phase 1's `high` configuration and paths are
  intact.
- **Automated checks** (at `4211102`):
  - 2.1 `npx vitest run scripts/glm-gate-screening.test.mjs`: exit 0, 61 tests.
  - 2.2 `npx vitest run scripts/glm-gate-d2.test.mjs`: exit 0, 22 tests.
  - 2.3 `npx vitest run`: exit 0, 29 files, 1,180 tests (1,047 after Phase 1).
  - 2.4 `npx tsc --noEmit` exit 0; `npx eslint .` exit 0; root `npx prettier --check .` exit 0.
  - 2.5 Fresh `mktemp -d` cache. `preflight --screening --dry-run`, `run --screening --case pr247 --run-id s247-01`,
    `run --screening --case pr269 --run-id s269-01` and `d2 --screening --run s269-01 --list`: each exit 0. The
    listing shows `F1 · scripts/spikes/bread-spike.ts · minor` as the one candidate. The dry run skips the screening's
    order check (the gate's dry run does the same, via `stepIdFor`); the order and the pauses are pinned by the unit
    tests.
- **Manual acceptance.** 2.6 is `current` at `4211102…`, and 1.8 is `current` too (`acceptance-state.sh` exit 0).
- **Inherited from the gate, not findings for this phase.** All three were present at `40217a6`:
  - No lock across concurrent runner invocations: two terminals can both pass admission and spawn. A duplicate `d2`
    line fails safe, because `checkHandRead` rejects the core/sheet disagreement.
  - A `started` line without a `record` blocks the ledger with no way out. `executeRun` parses `meta` after
    `started`, and `spawnCommand` has no `error` listener.
  - The adapter's finder error text reaches the ledger. The screening also shows its first 120 characters in
    `screening.md` pause causes.
- **Plan-literal behaviours worth knowing:**
  - `outcome --screening` during a D2 pause prints `STOP (d: …)`. This is pinned at
    `glm-gate-screening.test.mjs:265-275`, and the "Waiting for" line is printed with it. Write only after
    `reconcile`, per Phase 3 §2.4.
  - `run --screening` exits 0 for a valid run that ends the screening by (c), while `fixtures --screening` exits 1. The
    next step is refused by `screeningOrder` either way.
- **Mutation check skipped.** No risk in `context/foundation/test-plan.md` § 2 covers `packages/code-reviewer`.
- **Lessons.** 35 of 38 entries apply to impl-review. These were used as priors:
  - "A check that cannot say what it found…" (F2, F4);
  - "A guard metric that only exists on success…" (F7);
  - "A per-step output cap hit…";
  - "An admission gate that counts a set…" (the lock note; the runner has a single owner-attended operator);
  - "Writing a fact into its canonical home…" (F6).
