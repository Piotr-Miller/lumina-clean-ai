<!-- PLAN-REVIEW-REPORT -->

# Plan Review: finder-glm-5-3-high Implementation Plan

- **Plan**: `context/changes/finder-glm-5-3-high/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-16
- **Plan sha256**: 3330467a82fbc7a8658f09d40aa8d5da5382c4866b2be902aee7d658dc56413e
- **Plan sha256 after triage**: 682c8860917f8ed4fc990aeb0dbd98eef968b8597e6612981990e3132e16987c
- **Verdict**: REVISE
- **Findings**: 0 critical, 7 warnings, 3 observations

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | WARNING |
| End-State Alignment    | PASS    |
| Lean Execution         | PASS    |
| Architectural Fitness  | PASS    |
| Blind Spots            | WARNING |
| Plan Completeness      | WARNING |

## Grounding

Grounding: 22/22 modified paths ✓, no created path occupied ✓, every Manual surface exists or is created by the plan
✓, 15/15 symbols ✓ (`FINDER_REASONING`, `formatFinderConfigurationLine`, `DECIDED_REASONING`,
`EXPECTED_CONFIGURATION_LINE`, `classifyRun`, `runCost`, `scheduleState`, `checkHandRead`, `spawnCommand`,
`g3EvalArgs`, `REPEATS`, `checkExport`, `CHANGE`, `CHANGE_DIR`, `index.d.ts:394`), brief↔plan ✓ (the brief repeats
H7's rationale, F4), commands 12/12 match recorded status, Progress 7/7 phases and every criterion row ✓,
definitions 7/10 user-only and 3 user + plan (H5, H7, the D2 term set), 2 flagged (F1, F4). Lessons: 28 of 38 entries
apply to plan-review, plus § "Writing a fact into its canonical home…", which the request named. No
`docs/reference/contract-surfaces.md`, so that check was skipped.

Commands re-run on 2026-10-16 at `ac6bbb1`, all free and local:

- `vitest run` 1,046/1,046 exit 0; `tsc --noEmit` 0; `eslint .` 0; root `prettier --check .` 0.
- The `low`-pin grep: 24 matches in 14 files. The two path greps: 5 and 3 matches.
- Stubbed dry run into a fresh scratch cache: exit 0, `finder configuration: … reasoning=low …`, so the `grep -q
reasoning=high` exits 1, as recorded. The repository was unchanged afterwards.
- `vitest run scripts/glm-gate-screening.test.mjs` and `…/glm-gate-d2.test.mjs`: exit 1 (no test file).
- `git grep -nE '^\s+false &&$' .github/workflows/review.yml`: one match (`:29`). The stale-pointer grep: 2 matches
  (`review.yml:23`, `AGENTS.md:98`).

Degenerate walkthrough (own dataset, not the plan's example). Nine cases; six are undecided or mis-decided:

1. A recovered finder timeout, then a judge failure on s269-01 → false STOP (b) (F1).
2. 5xx on attempt 1, then a timeout on the retry → (b) missed (F1).
3. Both #269 screening runs invalid for other reasons → `GO`, with (d) never tested (F2).
4. A confirmed 402 on s269-01 → m269 membership and replacement undecided (F2).
5. s269-02 costs more than its P → T_s above $0.75, outcome undecided (F2).
6. s269-02 `no-match` and (c) exceeded together → one label hides the other (F2).
7. (c) at exactly $7.404940 → decided (no stop).
8. An invalid gate #269 run that kept review.json and its findings → H7's "no findings" is false (F4).
9. A `no-match` on pr269-10 → decided (`FAIL (D2)`).

## Findings

### F1 — Rule (b) reads a recovered timeout as a stop

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Requirement Definition
- **Location**: Phase 2 § 1 "Rule (b)"; § Definitions "screening stop"; H6
- **Detail**: The plan defines (b) as "an artifact-less run (or a fixture row) whose finder failed with a timeout after
  a `retrying finder after <TimeoutError…>` line" (`plan.md:396-397`). Two problems follow:
  - **A false stop.** The runner's only timeout signal, `parseCliStderr`'s `timeout`, tests the whole stderr
    (`glm-gate-core.mjs:157`, `:204`). The CLI's own retry line is `retrying finder after TimeoutError in <n>ms`
    (`cli.ts:407`; `errorLabel` is the error's name, `retry.ts:85-88`), so the retry line alone sets the flag. Take an
    s269-01 whose first finder attempt times out, whose retry recovers, and whose judge then fails without output, as
    pr269-06 did at `low` (`context/archive/2026-10-11-finder-glm-5-3/gate.md:633-643`). It exits 1 with no
    review.json and reads as STOP (b). The owner calls a recovered timeout a warning, and H5 makes a judge failure a
    pause. A false STOP ends the change.
  - **A missed stop.** If attempt 1 fails with 5xx or 429 and the retry times out, the owner's "timed out after its
    retry" applies. The retry line names `APICallError`, though, so the plan's definition misses it and H5 pauses
    instead.
  - **Fixture rows (H6).** The adapter records the retry's class (`evals/finder-provider.ts:47-50`, `:360`), but the
    terminal error only as message text and typed status (`:377-382`), so (b) has no metadata signal there.
    `finder-provider.ts` is a manifest file that Phase 2 § 1 does not list.

  Testing Strategy (`plan.md:933-934`) tests neither edge.

- **Fix**: Define (b) on the stderr lines:
  - an artifact-less run;
  - at least one `retrying finder after <any class>` line, and no `retrying judge` line;
  - the timeout pattern matches stderr once the `retrying …` lines are removed.

  For fixture rows, have the adapter record the terminal error's class (`retryClass`), and use `retries ≥ 1` with
  class `timeout`. Add `finder-provider.ts` to Phase 2 § 1, and test both edges: a recovered timeout followed by a
  judge failure gives a warning and an H5 pause; a 5xx followed by a timeout gives STOP (b).

- **Decision**: FIXED — Fix in plan; edited: Phase 2 § 1 (Files, Rule (b)), Testing Strategy (Screening, rule (b)); reopened: none

### F2 — The screening's degenerate cases are undecided

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Requirement Definition
- **Location**: Phase 2 § 1 `screeningState`; § Definitions "screening stop", "m247 / m269 (screening)", "budget"
- **Detail**: `ended` is `GO` unless a stop fires (`plan.md:392-393`). The plan decides none of these:
  1. **No valid #269 run.** Both #269 runs are invalid for reasons other than (a) or (b), for example two judge
     failures, and the owner continues past each H5 pause. The result is `GO` with (d) never tested, although the
     screening exists partly to check "that D2 appears at all" (`plan.md:10-11`).
  2. **A confirmed 402 on s269-01.** This is plausible if the owner sets the optional key limit at usage(T0_s) +
     $0.75 (`plan.md:560`). Is the run inside m269? The plan says "the two #269 runs, valid and invalid"
     (`plan.md:110`). The gate keeps such a run out (`meanSettledCost`, `glm-gate-core.mjs:395-402`; predecessor
     `gate.md:173`). Run ids are fixed at s269-01 and s269-02 (`plan.md:383`), so is there a replacement?
  3. **An overshoot.** H3 uses P = the largest settled cost, not 2 × it. With T_s $0.45 and P $0.25, s269-02 is
     admitted, costs $0.32, and T_s ends at $0.77 > $0.75. The gate ends such a step `INCOMPLETE (budget)`
     (predecessor `gate.md:294`); the screening has only the admission refusal.
  4. **Two rules at once.** s269-02 is `no-match` and (c) also exceeds. `ended` carries one label, so the record hides
     the other.
- **Fix**: Decide in `screening.md` and in Phase 2 § 1:
  - `GO` requires at least one valid #269 run checked for (d). Otherwise the outcome is
    `INCONCLUSIVE (no valid #269 run)` and the owner decides; it is not a stop.
  - A confirmed 401/402 run stays out of m269, as in the gate, with no replacement.
  - A step that ends above $0.75 records its overshoot and gives `INCOMPLETE (budget)`; the owner decides.
  - The outcome lists every rule that fired.
  - Strength: each choice mirrors an existing gate rule, so none adds a stop.
  - Tradeoff: four more terms for the owner to confirm (see F3).
  - Confidence: MED — choices 1 and 3 are the owner's judgement.
  - Blind spot: whether the owner wants a replacement #269 run after an invalid one; × 2 is their number.
- **Decision**: FIXED — Fix in plan; edited: § Definitions (screening stop, m247 / m269 (screening), budget), Implementation Approach (Phase 3 bullet), Phase 2 § 1 (`screeningState`), Phase 3 Overview, Testing Strategy (Screening: Budget, Outcome edges), plan-brief.md Success Criteria; reopened: none

### F3 — The plan-chosen screening terms are never confirmed by the owner

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Requirement Definition
- **Location**: Implementation Approach (`plan.md:175-176`); H10; Phase 3 Manual 3.5
- **Detail**: H3–H7 decide the screening's outcome:
  - H3: the admission formula;
  - H4: the early (c);
  - H5: the extra pauses;
  - H6: (b), which the owner worded as "a screening run", extended to promptfoo fixture rows;
  - H7: the D2 mechanics.

  The plan only says they are restated in `screening.md` "where the owner sees and can overturn it". No Manual row
  records a confirmation. 3.5 authorizes the spend after reading `preflight --screening` (`plan.md:600-601`), and 2.6
  accepts output formats only. The seal confirms term by term (Manual 4.4, `plan.md:701`; the predecessor's five
  confirmed terms, `gate.md:460-481`). If H6 stops the screening on a fixture row, that is a stop the owner never
  decided — the case the brief says pre-stated rules exist to prevent (`plan-brief.md:33`).

- **Fix**: Make Manual 3.5 read "The owner confirms H1–H7 one by one as restated in `screening.md` § Rules, then
  authorizes the spend after reading `preflight --screening`". Record a dated confirmation per term in `screening.md`
  before the push.
- **Decision**: FIXED — Fix in plan; edited: Implementation Approach (Assumptions), Phase 3 § 1 Contract (Owner confirmation), Phase 3 Manual 3.5; reopened: none

### F4 — H7 drops the pause after an invalid #269 run, on a reason that is not true

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Requirement Definition
- **Location**: H7 (`plan.md:198-199`); Phase 2 § 2 "Invalid runs" (`plan.md:423-424`); `plan-brief.md:40`
- **Detail**: Owner decision 3(d) says "the runner pauses after every #269 run until the owner's D2 decision is
  recorded" (`change.md:22`).
  - **What H7 does.** The runner writes `not-applicable` itself, so in the gate nothing pauses after an invalid #269
    run (Testing Strategy: "does not pause", `plan.md:951`). In the screening, H5 pauses every invalid run anyway, so
    H7 matters only in the paid series.
  - **Its reason is false.** H7 rests on "a run with no findings" (`plan.md:199`; brief: "Nothing to decide on a run
    without findings"). An invalid run that kept its review.json has findings: a model mismatch or a configuration
    mismatch is classified with the artifact, and its findings are recorded (`glm-gate-core.mjs:246-260`,
    `glm-gate.mjs:516`).
  - **The sound reason** is that D2 counts only for valid runs (decision 3(a)).
- **Fix A ⭐ Recommended**: Keep the pause literal. After an invalid #269 record, the runner refuses paid steps until
  the owner records `d2 --not-applicable --note …`, and `--match` / `--none` are refused for that run.
  - Strength: decision 3(d) verbatim, and a checkpoint at the first invalid G1 run, which is the main new risk at
    `high`.
  - Tradeoff: one more owner command per invalid #269 run; a series that can still pass G1 has at most one.
  - Confidence: HIGH — one branch in the pause predicate.
  - Blind spot: none significant.
- **Fix B**: Keep H7, replace its rationale with "D2 counts only for valid runs (3a), so no decision on an invalid run
  can change the gate", and name it as a narrowing of 3(d) for the owner to confirm (F3, Manual 4.4).
  - Strength: no extra owner step.
  - Tradeoff: a plan choice narrows a binding decision, and if the owner disagrees, that surfaces only at the seal.
  - Confidence: MED — it rests on reading 3(d) as tied to the decision rather than to the run.
  - Blind spot: whether the owner wanted the checkpoint for its own sake.
- **Decision**: FIXED — Fix A; edited: H7, § Definitions (D2 decision, D2 pause / early stop), Phase 2 § 2 (Invalid runs, Pause), Testing Strategy (D2: Recording and pause), plan-brief.md Key Decisions (Invalid #269 runs); reopened: none

### F5 — G5's 100 KB window closes before any `src/` file

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details "G5 diff" (`plan.md:238-240`); Phase 7 § 3
- **Detail**:
  - **Re-measured.** With `review.yml`'s EXCLUDES (`review.yml:252-260`) on `origin/master...HEAD` at `ac6bbb1`, the
    diff is 524,034 B in 42 files, as the plan says. Markdown, JSONL and `results/*.json` are excluded, so
    `orderDiffForCap` (`pipeline.ts:251-282`) keeps git's path order.
  - **Where it cuts.** `DIFF_CAP_BYTES` is 100,000 (`pipeline.ts:44`), and the cut falls inside
    `scripts/glm-gate-core.test.mjs`, which starts at byte 91,079. No `src/` file — `reviewer.ts`, `pipeline.ts`,
    `config.ts`, `cli.ts`, the code being merged — is in the window.
  - **It will move earlier.** The archive's `gate-manifest.json` and `gate/g3-rows.json` (24 KB) sit ahead of
    `packages/`. Phases 4–5 add this change's own pair in the same place, since `g3-rows.json` is not under
    `results/`, and Phase 2 grows the tooling.
  - **Not recorded.** The plan names only a timeout or `length` risk. G5's finder at `high` will review gate tooling,
    test code and ledger JSON. Per `lessons.md` § "A large committed artifact silently blinds the AI review", the
    impl-review will likely report the unseen source as missing — and Manual 7.8 has the owner read that verdict
    before merging.
- **Fix**: Record the measured window in Critical Implementation Details and in the pre-registration's § 9. G5 is a
  liveness and telemetry probe of `high` on a 100 KB input, not a review of the merged `src/` code, and findings about
  missing files are expected truncation artifacts. Re-measure the cut at the G5 head in Phase 7 § 3.
- **Decision**: FIXED — Fix in plan; edited: Critical Implementation Details (G5 diff), Phase 4 § 2 (§9 delta), Phase 7 § 3 Contract; reopened: none

### F6 — Criterion 1.4 cannot pass alongside the plan's own tests

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 § 2 Contract (`plan.md:286-288`); Automated 1.4
- **Detail**: The contract says all 24 matches become 0, and that no history pin was found at planning. Three test
  lines contradict it:
  - `glm-gate-core.test.mjs:551` ("reproduces the sonnet-effort `low` record: $6.628083") is finder-sonnet's history,
    not configuration.
  - `glm-gate-core.test.mjs:143`, the configuration-mismatch test, needs a value other than the decided one. After the
    flip, `low` is the natural choice.
  - Testing Strategy asks for a G3 row check that "rejects a `low` one" (`plan.md:929`), which must contain
    `effort: "low"`.

  So 1.4 either fails, or is met by renaming history and weakening negative tests.

- **Fix**: Scope 1.4 to non-test files: `git grep -nE '[Ee]ffort[^a-z]{0,4}low|reasoning=low' -- packages/code-reviewer
.github AGENTS.md ':!*.test.*'` prints nothing. Add a criterion that every remaining test match is a deliberate wrong
  value or history, listed in the commit body. The expected list is `:143`, `:551` and the new G3 negative case.
- **Decision**: FIXED — Fix in plan; edited: Phase 1 § 2 Contract, Phase 1 Automated 1.4; reopened: none

### F7 — Three Automated criteria cannot fail on what they name

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Automated 1.6, 2.5, 3.3
- **Detail**:
  - **1.6** reads a fixed `<scratch>/dry-run/runs/dry-high/stderr.log`. A dry run with a used id is recorded as
    `dry-high-r2` (`glm-gate.mjs:401-410`), so on a reused cache the grep reads the earlier log, which can be stale
    in either direction.
  - **2.5** names no expected output. The stub cites `bread-spike.ts` when the diff has it
    (`glm-gate-dry-run-stub.mjs:9-11`, `:38-39`), but an empty candidate list also exits 0.
  - **3.3** says `reconcile --screening` exiting 0 shows "T_s ≤ $0.75". With nothing unsettled, `reconcile` returns 0
    unless the counter moves, and it compares T with no cap (`glm-gate.mjs:690-707`).
- **Fix**:
  - 1.6: use `--cache "$(mktemp -d)"`.
  - 2.5: require `d2 --list` to print the canned `bread-spike.ts` finding.
  - 3.3: read T_s from `outcome --screening` and require it ≤ $0.75, or have `reconcile --screening` exit non-zero
    above the cap.
- **Decision**: FIXED — Fix in plan; edited: Phase 1 Automated 1.6, Phase 2 Automated 2.5, Phase 3 Automated 3.3; reopened: none

### F8 — The screening's margins are measured on the wrong quantities

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: H11; Phase 3 § 2 step 5
- **Detail**:
  - **Tokens.** The run notes compare the largest reasoning-token count with the 16,384 cap (`plan.md:568`), but the
    cap is on output tokens. The step line already prints `out=` (`cli.ts:122`), and `STEP_LINE` drops it
    (`glm-gate-core.mjs:140-141`). At `low` the two were close on loop steps: pr269-10 had out 5,042 against 4,978
    reasoning. On finalizations they were not: out up to 1,272 against at most 472 reasoning
    (`~/.cache/finder-glm-5-3/runs/pr269-*/stderr.log`).
  - **Time.** `finderElapsedMs` is measured from spawn, so it includes npm and tsx startup. After a retry it spans
    both attempts, while each attempt has its own 300 s budget (`pipeline.ts:635-638`). A recovered timeout would show
    more than 300,000 against "300 s" without any attempt exceeding it.
- **Fix**: Parse `out=` into the step record and compare it with 16,384. Take offsets from the configuration line's
  arrival, and restart them at a `retrying finder` line.
- **Decision**: FIXED — Fix in plan; edited: H11, Phase 2 § 5 (Files, Contract), Phase 3 § 2 step 5, Testing Strategy (Timing), Performance Considerations (Finder budget); reopened: none

### F9 — H8 narrows the sealed environment rule and leaves the sheet's `--dry-run` undefined

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Requirement Definition
- **Location**: H8 (`plan.md:200-203`); Phase 2 § 4
- **Detail**:
  - **The environment rule.** The predecessor's sealed § 1 says none of the ten names "may be set"
    (`gate.md:125-129`). Amendment 1 kept that rule, and its operator greps catch an empty `NAME=` as well
    (`gate.md:522-528`). H8 refuses "any non-empty value", so once the operator checks become code, an empty but set
    name passes. That is a silent change to § 1.
  - **The sheet.** It has no `--dry-run` (`glm-gate-sheet.mjs:7-8`, `:246`, `:270`), and its `CHANGE_DIR` is a module
    constant (`:27`). Its tests pass `--series`, `--results`, `--out-dir` and `--sheets-dir` without one
    (`glm-gate-sheet.test.mjs:190-221`). H8 therefore implies a new sheet flag the plan does not define.
- **Fix**: Have `forbiddenEnvSet` refuse any name that is present, empty included, or record the empty case as an H8
  term for the owner. Define the sheet's `--dry-run` as "path flags allowed; nothing written into the change folder".
- **Decision**: FIXED — Fix in plan; edited: H8, Phase 2 § 4 Contract, Testing Strategy (Amendment 1 as code); reopened: none

### F10 — Pointers that Phase 1's greps miss, and a second D2 predicate

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 § 3, Automated 1.5; Phase 2 §§ 2–3
- **Detail**:
  - **Header comments.** 1.5 matches only `finder-glm-5-3"` and `changes/finder-glm-5-3/`. It passes while
    `glm-gate.mjs:28-29` still says the ledger is in `context/changes/finder-glm-5-3/gate/` and the cache in
    `~/.cache/finder-glm-5-3/`, and while `.prettierignore:15` still names "the active change finder-glm-5-3".
  - **Manifest files outside the list.** The "runner for change `finder-glm-5-3`" headers of two manifest files that
    Phase 1 does not list, `glm-gate-dry-run-stub.mjs:5` and `promptfoo-regrade-config.mjs:4`, stay untouched. Comment
    edits to manifest files must land before the seal (`plan.md:226-227`).
  - **A second predicate.** The sheet already has a narrower D2 predicate, `isD2Candidate` (file contains
    `bread-spike.ts`, `glm-gate-sheet.mjs:42`), which drives its `D2?` flag (`:102`). If the term set becomes a second
    predicate, the sheet will flag rows differently from `d2 --list`.
- **Fix**:
  - Widen 1.5's first grep to `finder-glm-5-3[/"]`. It catches `glm-gate.mjs:28-29` and skips the backtick provenance
    lines.
  - Fix `.prettierignore:15` together with its entries.
  - Add the stub and regrade-config headers to Phase 1 § 3.
  - Extend `isD2Candidate` to the term set and use it for both `d2 --list` and the sheet.
- **Decision**: FIXED — Fix in plan; edited: Phase 1 § 3 (Files, Contract), Phase 1 Automated 1.5, Phase 2 § 2 Contract (One candidate predicate); reopened: none

## Re-review 2 (2026-10-16)

- **Mode**: Deep
- **Scope**: edited sections of round 1's FIXED decisions (F1–F10), plus `plan-brief.md` Success Criteria and Key
  Decisions; the plan's sha256 equals round 1's `Plan sha256 after triage`, so no hand edit since triage
- **Plan sha256**: 682c8860917f8ed4fc990aeb0dbd98eef968b8597e6612981990e3132e16987c
- **Plan sha256 after triage**: 850d901686d06cc07da0c673122dade780cb36f0802563ba4da674994970c787
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 1 observation
- **Closes**: F1, F2, F3, F4, F5, F6, F7, F8, F9, F10

### Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | WARNING |
| End-State Alignment    | PASS    |
| Lean Execution         | PASS    |
| Architectural Fitness  | PASS    |
| Blind Spots            | PASS    |
| Plan Completeness      | PASS    |

### Grounding

Grounding (edited sections): 8/8 modified paths ✓, 4/4 created paths absent with parents present ✓, 10/10 symbols ✓
(`retryClass`, `finderErrorStatus`, `isD2Candidate` `:42`/`:102`, `forbiddenEnvSet`, `effectiveEnv`, `STEP_LINE`,
`RETRY_LINE`, `TIMEOUT`, `GLM_GATE_DRY_RUN_FINDINGS` at `glm-gate.mjs:460`, `withOneRetry`), brief↔plan ✓, commands
3/3 match recorded status, Progress 7/7 phases and 48/48 rows ✓, definitions: 5 edited rows, 3 flagged (F11). Lessons:
28 of 38 entries apply to plan-review.

Commands re-run on 2026-10-16 at `ac6bbb1`, all free and local:

- 1.4: 7 matches outside test files (24 in 14 files in all).
- 1.5: 7 and 4 matches.
- 1.6 into a fresh scratch cache: the dry run exits 0 with `reasoning=low`, so the grep exits 1, as recorded.

Degenerate walkthrough (own dataset, scoped to the edited rules). Eight cases; three are undecided or mis-measured:

1. s269-01 ends `length`, so no #269 run is valid → STOP (a) or INCONCLUSIVE, undecided (F11).
2. s269-02 is a valid `no-match` and takes T_s from $0.55 to $0.80 → STOP (d) or INCOMPLETE (budget), undecided (F11).
3. pr269-06's real log: the finder finalized, then `No output generated.` with no judge retry line → a warning plus an
   H5 pause, never (b). F1's fix holds.
4. A 5xx, a `retrying finder after APICallError` line, then `exceeded its 300000 ms budget` → STOP (b), decided.
5. An invalid #269 run with findings (model mismatch) → d2 pause, `--not-applicable` only, decided.
6. A forbidden name set empty → refused. None of the ten is set in the shell or in `.env`, so there is no new
   friction.
7. Attempt 2 after a retry sleep, then a timeout → its recorded time is wrong (F12).
8. Criterion 2.5's stubbed `s269-01`: the runner sets `GLM_GATE_DRY_RUN_FINDINGS=1` for every case but clean
   (`glm-gate.mjs:460`), and the #269 diff has `bread-spike.ts`, so `d2 --list` can show the canned finding. F7's fix
   holds.

### F11 — Two outcome labels can hold at once, and none is said to win

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Requirement Definition
- **Location**: Phase 2 § 1 `screeningState` (edited by F2); § Definitions "screening stop", "m247 / m269
  (screening)", "budget"; Manual 3.5 (edited by F3)
- **Detail**:
  - `ended` holds one label. F2's fix added two that are not stops: `INCONCLUSIVE (no valid #269 run)` and
    `INCOMPLETE (budget)` after an overshoot. The plan never says which label wins when a stop also holds (walkthrough
    cases 1 and 2). Read literally, "With none, the screening ends `INCONCLUSIVE`" (`plan.md:426-427`) hands a fired
    (a) to the owner. Only Testing Strategy's "(neither (a) nor (b))" (`plan.md:1010`) hints otherwise.
  - If the non-stop label wins, a fired stop becomes an open GO/STOP question for the owner. That is the "argued away"
    case pre-stated rules exist to prevent (`plan-brief.md:33`). `fired` still lists the stop, so the owner would see
    it.
  - The outcome rules are plan-chosen (round 1, F2). The three Definitions rows that carry them give the origin as
    `user (2026-10-16)` only. Manual 3.5 confirms only "H1–H7", while Phase 3 § 1 also requires "the outcome rules of
    Phase 2 § 1" (`plan.md:598-599`). Signing 3.5 as worded leaves those rules unconfirmed.
- **Fix**: In Phase 2 § 1, state the order: any fired stop → its STOP label (the first to fire; all of them listed in
  `fired`); otherwise `INCOMPLETE (budget)`; otherwise `INCONCLUSIVE (no valid #269 run)`; otherwise `GO`. Add both
  pairs to Testing Strategy "Outcome edges". Set the three rows' origin to `user (2026-10-16) + plan (review F2)`.
  Make Manual 3.5 read "H1–H7 and the outcome rules of Phase 2 § 1".
- **Decision**: FIXED — Fix in plan; edited: § Definitions (screening stop, m247 / m269 (screening), budget: Origin), Phase 2 § 1 (`screeningState`: Precedence), Testing Strategy (Screening: Outcome edges), Phase 3 Manual 3.5; reopened: none

### F12 — Per-attempt finder time is wrong on the attempts that matter

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: H11; Phase 2 § 5 Contract; Phase 3 § 2 step 5 (edited by F8)
- **Detail**:
  - Only the configuration line, step lines and `retrying finder` lines are timed, and an attempt's time is its last
    timed line.
  - **The end of a failed attempt is never timed.** A timed-out attempt ends about 300 s after it starts, but its last
    timed line is its last finished step. So the notes show under 300 s for exactly the attempt that hit the limit.
  - **The retry wait counts as attempt time.** `onRetry` fires before the sleep (`retry.ts:174-179`), which is 2–3 s
    after a timeout and 10–30 s after a 429/5xx (`retry.ts:108-111`). Example: a 429 at 120 s, a 25,000 ms wait, then
    a timeout. Attempt 2's last step reads 270 s; it really took 245 s, and the attempt really ended at 300 s.
  - For information only: rule (b) and the code's own abort decide the outcome.
- **Fix**: Start a retried attempt at the retry line's arrival plus its `delayMs` (the line carries it). End a failed
  attempt at its retry line, or at the process exit for the last attempt, and mark which attempts failed.
- **Decision**: FIXED — Fix in plan; edited: H11, Phase 2 § 5 Contract, Phase 3 § 2 step 5, Testing Strategy (Timing); reopened: none
