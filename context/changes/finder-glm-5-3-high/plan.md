# finder-glm-5-3-high Implementation Plan

## Overview

Measure `z-ai/glm-5.3` as the ai-review finder at `reasoning: {enabled: true, effort: "high"}` under its own sealed
gate. The gate rules are the predecessor's. The only production change is the effort, `low` → `high`.

The predecessor, `finder-glm-5-3`, ended `NOT ADMITTED (hand-read)` at `effort: low`: D2 was found in 1 of 9 valid #269
runs. Before anything is sealed, a small paid screening at `high` checks the risks that `high` adds: the 16,384-token
cap, the 300 s finder budget and the cost gate. It also checks that D2 appears at all. Pre-stated stop rules
(owner, 2026-10-16) decide whether the change goes on to a pre-registration.

If the sealed gate admits glm-5.3 at `high`, this change merges the two-stage finder, which is still unmerged, and
removes the `false &&` guard from `.github/workflows/review.yml`. It then runs G5, the real `AI Code Review` workflow,
on its own PR. That restores AI review, which has been off since 2026-10-04 (R11).

## Current State Analysis

- **Branch.** `feat/finder-glm-5-3-high` is at `ac6bbb1`, pushed, with no PR. It carries the predecessor's whole
  branch:
  - the two-stage finder port and its finder-only routing;
  - glm-5.3 at `effort: low` (`packages/code-reviewer/src/config.ts:130`);
  - the gate tooling (`scripts/glm-gate*.mjs`, `promptfoo-gate-rows.mjs`);
  - the archived record (`context/archive/2026-10-11-finder-glm-5-3/`).
- **Master.** It still runs the single-stage finder on glm-4.6. `.github/workflows/review.yml:23-29` carries `false &&`.
- **Baseline at planning (2026-10-16, `ac6bbb1`).**
  - In `packages/code-reviewer`, `vitest run` passed 1,046/1,046; `tsc --noEmit` and `eslint .` exited 0.
  - Root `prettier --check .` exited 0.
- **`low` is pinned in 24 places in 14 files** (`git grep -nE '[Ee]ffort[^a-z]{0,4}low|reasoning=low'`):
  - production: `src/config.ts:130` (`FINDER_REASONING`);
  - the gate's expected shape and configuration line: `scripts/glm-gate-core.mjs:25`, `:29`;
  - comments: `src/reviewer.ts:303`, `.env.example:4`, `evals/promptfooconfig.yaml:65`,
    `scripts/promptfoo-gate-rows.mjs:7`;
  - 17 test pins in 8 test files.
- **The type accepts `high`.** `@openrouter/ai-sdk-provider` types `reasoning.effort` as
  `'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'` (`node_modules/@openrouter/ai-sdk-provider/dist/index.d.ts:394`).
- **The tooling is hard-wired to the archived change.**
  - `scripts/glm-gate.mjs:71` (`CHANGE`), `:159` (manifest `change`), `:270` (cache `~/.cache/finder-glm-5-3`);
  - `scripts/glm-gate-sheet.mjs:27` (`CHANGE_DIR`);
  - `.prettierignore:15-23` and `AGENTS.md:43` still name the predecessor's gate artifacts as those of "the active
    change".
- **What the tooling cannot do yet:**
  - no screening ledger;
  - no per-run D2 decision, and no pause after a #269 run;
  - the G3 checker's repeat count is a constant (`promptfoo-gate-rows.mjs:66`, `REPEATS = 3`);
  - `review.json` carries no finder-pass timing (keys checked on `pr269-03.review.json`), and the runner records
    only the whole run's `durationMs`, judge included.
- **Frozen inputs are intact (re-checked 2026-10-16).**
  - Under `~/.cache/finder-sonnet-gate/`: #247 `pr.diff` `21973af3…`, #269 `pr.diff` `1e4ec088…`, rules `34d5fcac…`,
    meta `ec66879c…` / `00b7b21b…`.
  - Worktrees `wt-247` at `dec09f8` and `wt-269` at `fca2778`, both clean.
- **What `high` is (spike, `research.md`, 2026-10-16).** It is a distinct level on Z.AI, not another name for `max`.
  On the finder's finalization request (react-migration fixture, 1,679 prompt tokens, pinned to Z.AI):

  | Effort | Reasoning tokens | Time         | Cost                                 |
  | ------ | ---------------- | ------------ | ------------------------------------ |
  | `low`  | 316 / 327        | 9.0–11.3 s   | $0.005061 / $0.005743                |
  | `high` | 842 / 1,238      | 16.0–20.7 s  | $0.008277 / $0.009914 (1.6–1.7× low) |
  | `max`  | 6,869 / 16,362   | 75.9–131.9 s | $0.035588 / $0.072543                |

  One `max` request hit the 16,384 cap. Two requests per level; Z.AI only.

- **The `low` series** (`context/archive/2026-10-11-finder-glm-5-3/gate/series.jsonl`, 2026-10-14/15):
  - **#269 runs** took 86–141 s each, judge included; the one invalid run took 211 s.
  - **Single loop steps on #269** used up to 4,978 reasoning tokens (pr269-10, step 1). The clean fixture used 0–98.
    At the spike's ≈ 3× ratio, #269 steps at `high` approach the 16,384 cap (`lessons.md` § "A per-step output cap
    hit…").
  - **Cost:** m247 $0.059289, m269 $0.102397. The finder share is ≈ $0.024 of a #247 run and ≈ $0.060 of a valid #269
    run; the rest is the judge, whose cost does not depend on the effort.
  - **Cost headroom.** The headroom on whole runs is (10 − 13·$0.199620) / (53·m247 + 8·m269) ≈ 1.87×. With the judge
    unchanged, the **finder** alone can cost ≈ 2.9× its `low` cost before 53·m247 + 8·m269 + 13·I exceeds $10.00.
- **D2 decided the predecessor.** 8 of 9 valid #269 runs had no owner-approved D2 match (`gate.md` § Hand-read). The
  bar is unchanged: D2 in **every** valid #269 run.
- **Credit (2026-10-16, after the spike).** Total credits $65; key usage $58.982082 at 17:52:43Z plus the spike's
  $0.204316, which the counter has not shown yet. That leaves ≈ $5.81. The series key's limit is $61.103079, which
  allows ≈ $1.92 more.
- **Repository variable.** `OPENROUTER_REVIEW_MODEL = z-ai/glm-4.6` is still set (`gh variable list`, 2026-10-16). It
  overrides the finder model in CI.
- **The G5 diff is far over the reviewer's cap.** The branch's diff against `master`, after `review.yml`'s `EXCLUDES`,
  is 524,034 B, against the 100 KB cap. Most of it is this branch's own code and tests: `cli.test.ts` 44 KB,
  `glm-gate.mjs` 41 KB, and so on.

### Carried from predecessor

`Predecessor: finder-glm-5-3` is added to `change.md` § Notes (assumption H12).

| Item                                                                                                                        | Source (path + finding)                                                    | Disposition                                                                                                                                                    | Addressed in |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Plan review F1–F5; impl reviews of phases 1–5 (all findings)                                                                | `context/archive/2026-10-11-finder-glm-5-3/reviews/*.md`                   | resolved (every Decision `FIXED`; phase-2 Re-review 2 `Closes: F1–F6`)                                                                                         | —            |
| Amendment 1: three operator checks (whitespace-only forbidden variable, path-override flags on paid steps, stale G3 export) | `…/reviews/impl-review-phase-4-593407e.md` F1–F3; `…/gate.md` § Amendments | carried forward: they become runner checks before this change's seal                                                                                           | Phase 2 § 4  |
| `[openrouter] Some reasoning_details entries were removed…` stderr warning, "not acted on"                                  | `temp_steps.md` (2026-10-14)                                               | resolved: absent from all 17 real-run logs in `~/.cache/finder-glm-5-3/runs/` (grep, 2026-10-16)                                                               | —            |
| A technical judge failure without a judge retry line is recorded only as `exit-<n>` (pr269-06)                              | `…/gate.md` § Run notes                                                    | carried forward, not fixed: validity is unaffected, because an artifact-less run is invalid whatever its reason; the limit is restated in the pre-registration | Phase 4      |
| `.prettierignore` / `AGENTS.md` pointers to the predecessor's gate artifacts                                                | `.prettierignore:15-23`, `AGENTS.md:43`                                    | resolved: replaced by this change's paths                                                                                                                      | Phase 1 § 3  |
| Predecessor Phase 7 not run (workflow flip, stale pointers, variable deletion, G5)                                          | `…/plan.md` Progress 7.1–7.9                                               | carried forward                                                                                                                                                | Phase 7      |

## Definitions

Terms the predecessor's sealed gate defines are restated **unchanged** by this change's pre-registration (owner,
`change.md`: "same gate rules"). The source is `context/archive/2026-10-11-finder-glm-5-3/gate.md` § Pre-registration
§2, and the restated terms are: finder request, reasoning text, truncation, attempt / run, valid run, auth/credit stop,
listed providers, accepted model, N, rejected, run passes hand-read, monthly cost, T, P vs cap and G5 green. Only new
or changed terms are below.

| Term                    | Decided meaning                                                                                                                                                                                                                                                                                                                                          | Origin                                                                  | On degenerate data                                                                                                                                                                                                                                                                                                                                                                                | Verified by                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| reasoning shape         | Every finder request carries exactly `reasoning: {enabled: true, effort: "high"}`; judge and impl-review requests carry none. Configuration line: `finder configuration: model=z-ai/glm-5.3 reasoning=high providers=z-ai,fireworks,together`                                                                                                            | user (`change.md`)                                                      | Repair request included                                                                                                                                                                                                                                                                                                                                                                           | 1.1 (wire tests), 1.5 (dry run)                         |
| screening               | Before any pre-registration: G3's four fixture cases × 1 (promptfoo) + #247 × 1 + #269 × 2 through the production CLI, on the frozen inputs                                                                                                                                                                                                              | user (2026-10-16)                                                       | Screening runs are **not** gate samples and never enter m247 / m269 of the gate                                                                                                                                                                                                                                                                                                                   | `glm-gate-screening.test.mjs`                           |
| screening stop          | Any of: **(a)** a finder request ends `length`; **(b)** a screening run is invalid because the finder timed out after its retry; **(c)** 53·m247 + 8·m269 + 13·$0.199620 > $10.00, i.e. 53·m247 + 8·m269 > $7.404940, from settled costs (finder + judge, retries included); **(d)** a valid screening #269 run has no owner-approved D2 match           | user (2026-10-16) + plan (H4, H6, review F2)                            | A first-attempt timeout the retry recovers is a **warning**, not a stop; its cost counts. Equality in (c) does not stop. An undecided D2 counts as no match. (a) and (b) also apply to fixture rows (H6). (c) can already stop after #247 if 53·m247 alone > $7.404940 (H4). With no valid #269 run, (d) is untested: the screening ends `INCONCLUSIVE (no valid #269 run)`, not `GO` (review F2) | `glm-gate-screening.test.mjs`                           |
| screening pause         | A confirmed 401/402, a provider or model mismatch, or a grader error pauses the screening for an owner decision, as in the gate. Any other invalid screening run pauses too (H5)                                                                                                                                                                         | user (2026-10-16) + plan (H5)                                           | A pause is not a stop; the owner's `continue --screening --for <reason>` resumes; cost counts. The reason must be the one `waitingFor` names; after an invalid #269 run its `d2 --not-applicable` line comes first; the paused step settles first (owner decision 2026-10-16; Phase 2 § 1 "Pauses")                                                                                               | `glm-gate-screening.test.mjs`                           |
| m247 / m269 (screening) | m247 = the settled cost of the one #247 screening run; m269 = the mean settled cost of the two #269 screening runs, valid and invalid; finder + judge, retries included                                                                                                                                                                                  | user (2026-10-16) + plan (review F2)                                    | An unsettled run blocks (c) until `reconcile --screening` settles it. A run stopped by a confirmed 401/402 is not a sample and stays out, as in the gate; a #269 run is not replaced (review F2). A stopped `s247-01` (or `sfix`) runs once more after the owner's `continue`, one rerun per stop (impl-review F5); an invalid run is still a sample (owner decision 2026-10-16)                  | `glm-gate-screening.test.mjs`                           |
| D2 match                | Unchanged from `context/archive/2026-10-11-finder-glm-5-3/plan.md:76`: a finding cites `bread-spike.ts` within `localInput`'s upload path or `main`'s cleanup **and** claims the uploaded file is not deleted (or leaks) on the missing-URL exit. Cleanup only in `finally` is not a match                                                               | user (2026-10-16)                                                       | A run with no finding citing `bread-spike.ts` has no match                                                                                                                                                                                                                                                                                                                                        | owner, per run                                          |
| D2 candidates           | Every finding of the run whose `file` contains `bread-spike.ts`, or whose description or suggestion mentions `bread-spike.ts`, `localInput`, `deleteUpload`, `urls.get` or `uploadedFileId`. The agent lists **all** of them, including those it judges not to match, each with a recommendation; it filters nothing                                     | user (2026-10-16, b) + plan (term set from the predecessor's run notes) | The owner may approve a finding outside the list; it is recorded as `listed: false`                                                                                                                                                                                                                                                                                                               | `glm-gate-d2.test.mjs`                                  |
| D2 decision             | The owner's decision for one valid #269 run (screening or gate): `match` with the approved finding ids, or `no-match`. It is recorded in the ledger before the next run starts, and it is final: the full hand-read does not revisit it                                                                                                                  | user (2026-10-16, a)                                                    | An invalid #269 run gets the owner's `not-applicable` (`d2 --not-applicable`), which is not a D2 decision and counts for nothing (H7)                                                                                                                                                                                                                                                             | `glm-gate-d2.test.mjs`                                  |
| D2 pause / early stop   | The runner refuses every paid step after any #269 run until its `d2` line is recorded: a D2 decision for a valid run, `not-applicable` for an invalid one. In the gate, the first `no-match` ends the series `FAIL (D2)` → verdict `NOT ADMITTED (hand-read)`; the rest of G1, cost, the full hand-read and G5 are recorded `not measured`, never passed | user (2026-10-16, c, d)                                                 | A `no-match` on the 10th run still stops: no full hand-read follows                                                                                                                                                                                                                                                                                                                               | `glm-gate-d2.test.mjs`                                  |
| budget                  | Screening ≤ $0.75 (its own ledger and T0). Series: pause at T ≥ $3.00, hard stop $3.50; G5 reserve $1.00. Total $5.25                                                                                                                                                                                                                                    | user (2026-10-16) + plan (H3, review F2)                                | A refused step, or a step that ends above $0.75 (overshoot recorded): screening `INCOMPLETE (budget)` → owner decides; series as sealed                                                                                                                                                                                                                                                           | `glm-gate-screening.test.mjs`, `glm-gate-core.test.mjs` |

## Desired End State

**If the gate admits glm-5.3 at `high`:**

- master runs the two-stage finder with `z-ai/glm-5.3` at `effort: high`, routed only to Z.AI / Fireworks / Together.
- `review.json` records each finder request's provider, model, finish reason and reasoning tokens, and never
  reasoning text.
- `OPENROUTER_REVIEW_MODEL` is deleted.
- `review.yml` no longer carries `false &&`, and its comment names this change's sealed gate.
- G5 ran green on this change's PR, and AI review runs on every eligible PR again.

**If the screening stops it, or the gate does not admit it:**

- The screening record (`screening.md`, `screening/`) or the gate record (`gate.md`, `gate/`, hand-read sheets) is
  committed in this change folder.
- AI review stays disabled. The PR closes unmerged, and the change is archived with its outcome.

Either way, nothing committed carries an absolute local path or a secret.

### Key Discoveries:

- The runner's classification, settlement and reconcile are pure and reusable (`scripts/glm-gate-core.mjs:240-308`,
  `scripts/glm-gate.mjs:675-773`). A screening ledger can share them unchanged, with its own paths and budget.
- `scheduleState` (`glm-gate-core.mjs:414-482`) is the single place the order and the stops live. The D2 pause and
  `FAIL (D2)` belong there, so `admit`, `outcome` and the CLI refusals all inherit them.
- The hand-read resolver already binds results to the ledger by sha256 and finding counts
  (`glm-gate-core.mjs:510-576`, `glm-gate-sheet.mjs:157-188`). D2 moves from the sheet into the ledger without
  weakening that binding.
- `spawnCommand` (`glm-gate.mjs:900-924`) streams stderr chunk by chunk. That is the one place a finder step line's
  arrival time can be taken, and the only finder-pass timing available, since `review.json` has none.
- The G3 command filters by provider label and case prefix (`glm-gate-core.mjs:56-80`). The screening's fixture step
  is the same command with `--repeat 1`.

## What We're NOT Doing

- Changing the 300 s finder budget, the 16,384-token output cap, `REVIEW_FINDER_MAX_STEPS`, the routing, the judge,
  the impl-review or the 53 / 8 / 13 weights. The screening measures `high` under them.
- Changing any gate rule beyond the owner's 2026-10-16 decisions (D2 per run, budget). G1–G5, validity, hand-read
  and cost stay as sealed before.
- Reopening the predecessor's sealed gate, or editing anything under `context/archive/`.
- Fixing the `exit-<n>` record of a technical judge failure. It is carried as a known limit.
- Trying `max`, or a mixed effort per request kind.
- Excluding large committed artifacts from the reviewed diff for G5 (a `review.yml` `EXCLUDES` change). This is
  recorded as a G5 risk only.
- More live probes than G5.

## Implementation Approach

Seven phases.

- **Phases 1–2 are free and local.** Configure `high`, retarget the tooling, add the screening ledger and the D2
  instrument. All of it is tested hermetically.
- **Phase 3 is the screening.** It is paid, capped at $0.75, and runs under rules committed before its first paid step.
  It ends GO or STOP, or `INCONCLUSIVE` / `INCOMPLETE (budget)`, which the owner turns into GO or STOP.
- **Phase 4 writes and seals the pre-registration**, only on GO.
- **Phases 5–6** are the paid series and the hand-read.
- **Phase 7 runs only on `ADMITTED (pending G5)`.**

**Assumptions made without asking.** H1–H7 are restated in `screening.md` § Rules and H7–H9 in the pre-registration,
where the owner confirms them term by term before any spend: Manual 3.5 for the screening, Manual 4.4 for the seal.
H10–H12 are procedural or informational and decide no outcome, so they need no confirmation.

- **H1. Screening tooling.** The runner gains a `--screening` mode with its own ledger, results, cache and budget.
  It uses the same CLI invocation, `classifyRun`, `runCost` and `reconcile` as the gate, so screening numbers are
  comparable with gate numbers. Manual commands would not classify runs the way the stop rules need.
- **H2. Screening order.** Fixtures → #247 → #269 → #269. The cheapest step that can trip (a) or (b) runs first; a
  D2 decision follows each valid #269 run.
- **H3. Screening admission.** A step starts only when no step is unsettled and T_s + P ≤ $0.75. P is the largest
  settled cost of that kind's sample runs so far, else a first estimate: fixtures $0.10, pr247 $0.15, pr269 $0.30. A
  run stopped by a confirmed 401/402 is not a sample and never sets P (owner decision 2026-10-16, impl-review F3). A
  refused step ends the screening `INCOMPLETE (budget)` with nothing spent. The gate's 2 × P would refuse the second
  #269 run at plausible costs.
- **H4. Early cost stop.** After #247 settles, the screening stops (c) if 53·m247 alone > $7.404940. No later run
  can lower that bound.
- **H5. Other invalid screening runs pause.** A run invalid for a reason other than (a), (b) or the owner's named
  pauses (for example a technical judge failure or a parse failure) pauses the screening for an owner decision. Its
  cost counts.
- **H6. Fixture rows count for (a) and (b).** A fixture row's finder request ending `length`, or a fixture row whose
  finder timed out after the adapter's single retry, stops the screening. Fixture **quality** is informational only.
- **H7. D2 mechanics.**
  - Candidates are the term superset in § Definitions.
  - The runner prints them after a valid #269 run (`d2 --list`). The agent writes a proposal file with a
    recommendation per candidate; the owner decides with `d2 --match … | --none`.
  - The runner pauses after an invalid #269 run too, as owner decision 3(d) says ("after every #269 run"). The owner
    records `d2 --not-applicable --note <text>`; `--match` and `--none` are refused for that run, because D2 counts
    only for valid runs (decision 3(a)). An invalid run may still carry findings in its review.json (a model or
    configuration mismatch), but they never count.
- **H8. Amendment 1 becomes code.**
  - A forbidden variable that is present at all, in the shell or in `.env`, is refused, whatever its value (empty and
    whitespace-only included). That is sealed § 1 ("may be set") as Amendment 1's operator greps enforced it.
  - Path-override flags work only with `--dry-run`. The sheet gains a `--dry-run` of its own: it unlocks the sheet's
    path flags, and the sheet then refuses any write path inside the change folder.
  - A G3 or fixtures step refuses to start while its export file already exists.
- **H9. Series first-step P** = max(the predecessor's estimate, 2 × the screening's largest settled cost of that kind).
  For G3 that is 2 × 3 × the fixtures step, since G3 runs three repeats. Clean $0.05 and regrade $0.10 are
  unchanged. This is confirmed by the owner at the seal as a plan-chosen term.
- **H10. Screening rules are fixed before spending.** `screening.md` holds the owner's stop rules verbatim and H1–H7.
  It is committed and pushed before the screening's first paid step; there is no hash or tag (it is not a gate).
- **H11. Finder-pass timing and output size.** The runner records the arrival offset of each finder step line.
  Attempt 1 is measured from the arrival of the run's configuration line. A retried attempt is measured from its
  `retrying finder` line's arrival plus that line's `delayMs`, because the retry sleeps before it starts. An attempt
  ends at the next `retrying finder` line if it was retried; else at its last step line if it reached a
  `finalization` step; else at the process exit. A retried attempt, and a last attempt without a `finalization` step,
  is marked failed. Each attempt's end offset is that attempt's finder elapsed time, for comparison with its own
  300 s budget. Each step's `out=` count is kept as its output tokens, for comparison with the 16,384-token output cap (reasoning tokens are
  only part of it). Both are informational: the code's own 300 s abort, stop rule (a) and stop rule (b) decide.
- **H12. Predecessor line.** `change.md` § Notes gains `Predecessor: finder-glm-5-3`. The change note already calls
  this change its follow-up.

## Critical Implementation Details

**Screening before the seal, then nothing in between.** The screening runs on the Phase 2 code with Phase 1's `high`
configuration. Between the screening and the seal only two kinds of file may change:

- `FIRST_STEP_ESTIMATE` in `scripts/glm-gate-core.mjs` (H9);
- this change folder.

The screening's preflight records the sha256 of `describeManifest` for its tree. The pre-registration states which
sealed files differ from the screened tree; the expected answer is `glm-gate-core.mjs` only.

**Sealing order.** As in the predecessor: every edit to a manifest file, comments included, lands before the seal.
Phase 7 touches only `.github/workflows/review.yml`, `AGENTS.md`, `packages/code-reviewer/evals/README.md` and this
change folder.

**Commit pointers.** This repo rebase-merges, which rewrites SHAs. The seal is identified by its sha256, the GitHub
push time and the tag `finder-glm-5-3-high/seal`. Evidence pointers to branch commits are written after the merge
(memory: `rebase-merge-rewrites-shas-twice`).

**Byte-stable artifacts.** The runner writes `review.json` copies and row files with `JSON.stringify`, and the ledger
pins their sha256. `.prettierignore` must cover `gate/results/`, `gate/g3-rows.json` and `screening/results/` of this
change before any of them exists.

**G5 diff.** At 524 KB after excludes, G5's review sees a truncated 100 KB window. The finder then runs at `high` on
a diff about 1.5 × #269. That makes a timeout or a `length` cutoff in G5 a real possibility. G5 "not green" blocks
the merge until the owner decides (as sealed before); nothing here pre-decides it.

The window also holds none of the code being merged. Measured on 2026-10-16 at `ac6bbb1` with `review.yml`'s
EXCLUDES: Markdown, JSONL and `results/*.json` are excluded, so `orderDiffForCap` keeps git's path order, and the
100,000 B cap (`pipeline.ts:44`) cuts inside `scripts/glm-gate-core.test.mjs`, from byte 91,079. No `src/` file is in
the window. This change's `gate-manifest.json` and `gate/g3-rows.json` sort ahead of `packages/` and move the cut
earlier. G5 is therefore a liveness and telemetry probe of `high` on a 100 KB input, not a review of the merged
`src/` code. Findings that call source files missing are expected truncation artifacts (`lessons.md` § "A large
committed artifact silently blinds the AI review"), and the owner reads G5's verdict that way.

## Phase 1: Configure effort high and retarget the tooling

### Overview

Flip the finder's effort to `high` everywhere it is pinned. Point the tooling at this change's folder, cache and tag.
Fix the stale `.prettierignore` / `AGENTS.md` pointers. Open a draft PR so CI runs.

### Changes Required:

#### 1. Production effort and its pointers

**Files**:

- `packages/code-reviewer/src/config.ts`
- `packages/code-reviewer/src/reviewer.ts`
- `packages/code-reviewer/.env.example`
- `packages/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: `FINDER_REASONING = { enabled: true, effort: "high" }`, with the comments updated to say so and to name
this change's gate (the owner decision of change `finder-glm-5-3-high`).

**Contract**: `FINDER_REASONING.effort === "high"`. `formatFinderConfigurationLine` (`src/cli.ts:141-144`) then prints
`reasoning=high` with no code change. No other production behaviour changes.

#### 2. Gate constants and test pins

**Files**:

- `packages/code-reviewer/scripts/glm-gate-core.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.test.mjs`
- `packages/code-reviewer/scripts/promptfoo-gate-rows.mjs`
- `packages/code-reviewer/scripts/promptfoo-gate-rows.test.mjs`
- `packages/code-reviewer/evals/finder-provider.wire.test.ts`
- `packages/code-reviewer/src/cli.test.ts`
- `packages/code-reviewer/src/config.test.ts`
- `packages/code-reviewer/src/pipeline.test.ts`
- `packages/code-reviewer/src/provider-routing.test.ts`
- `packages/code-reviewer/src/reviewer.test.ts`

**Intent**:

- `DECIDED_REASONING` and `EXPECTED_CONFIGURATION_LINE` say `high`.
- Every test pin of `low` becomes `high`, including the wire test that asserts the request body's `reasoning`.

**Contract**: Of the 24 matches of `git grep -nE '[Ee]ffort[^a-z]{0,4}low|reasoning=low' -- packages/code-reviewer
.github AGENTS.md`, none is left outside test files. In test files, a match stays only as a deliberate wrong value or
as history, and each one is listed in the commit body. Expected at planning:

- `scripts/glm-gate-core.test.mjs:551`, finder-sonnet's `low` cost record (history);
- `scripts/glm-gate-core.test.mjs:143`, the configuration-mismatch case (after the flip it uses `low` as the wrong
  value);
- the new G3 row case that rejects a `low` shape (Testing Strategy).

#### 3. This change's paths

**Files**:

- `packages/code-reviewer/scripts/glm-gate.mjs`
- `packages/code-reviewer/scripts/glm-gate.test.mjs`
- `packages/code-reviewer/scripts/glm-gate-sheet.mjs`
- `packages/code-reviewer/scripts/glm-gate-dry-run-stub.mjs`
- `packages/code-reviewer/scripts/promptfoo-regrade-config.mjs`
- `.prettierignore`
- `AGENTS.md`

**Intent**: Point the runner and the sheet at this change folder.

**Contract**:

- **Runner and sheet.**
  - `CHANGE` = `context/changes/finder-glm-5-3-high`; the manifest `change` field = `finder-glm-5-3-high`.
  - Default cache `~/.cache/finder-glm-5-3-high`; `CHANGE_DIR` follows `CHANGE`.
  - The headers name this change; references to the predecessor's decisions stay as provenance. That covers
    `glm-gate.mjs` (including its `Paths:` lines, `:28-29`), `glm-gate-sheet.mjs`, `glm-gate-core.mjs`,
    `promptfoo-gate-rows.mjs`, and two manifest files no other step touches: `glm-gate-dry-run-stub.mjs:5` and
    `promptfoo-regrade-config.mjs:4`. All of these are manifest files, so the edits land before the seal.
- **`.prettierignore`.** The predecessor's two entries are replaced by this change's `gate/results/`,
  `gate/g3-rows.json` and `screening/results/`, and the comment at `:15` names this change.
- **`AGENTS.md:43`.** It names the active change `finder-glm-5-3-high` and those three paths.

#### 4. PR

**Intent**: A draft PR from `feat/finder-glm-5-3-high`, so CI (`ci`, `integration`, `e2e`, `code-reviewer`) runs on
every push. AI review cannot fire while the PR is a draft, and `false &&` keeps it off anyway.

### Success Criteria:

#### Automated Verification:

- Package tests pass: `cd packages/code-reviewer && npx vitest run` — at planning: exit 0 (1,046 tests)
- Typecheck and lint: `cd packages/code-reviewer && npx tsc --noEmit && npx eslint .` — at planning: exit 0
- Repo formatting: `npx prettier --check .` — at planning: exit 0
- No `low` pin left:
  `git grep -nE '[Ee]ffort[^a-z]{0,4}low|reasoning=low' -- packages/code-reviewer .github AGENTS.md ':!*.test.*'`
  prints nothing, and every remaining test-file match is one listed in the commit body — at planning: exit 0 with 7
  matches outside test files — expected until Phase 1
- No path to the archived change in the tooling or the ignore list:
  `git grep -nE 'finder-glm-5-3[/"]' -- packages/code-reviewer/scripts` and
  `git grep -nE 'changes/finder-glm-5-3/|change .?finder-glm-5-3([^-]|$)' -- .prettierignore AGENTS.md` both print
  nothing — at planning: exit 0 with 7 and 4 matches — expected until Phase 1
- Stubbed dry run prints the `high` configuration line, through the real CLI and no key:
  `cd packages/code-reviewer && C="$(mktemp -d)" && node scripts/glm-gate.mjs run --case clean --run-id dry-high --dry-run --cache "$C" && grep -q "reasoning=high" "$C/dry-run/runs/dry-high/stderr.log"`
  (a fresh cache every time: a reused one records the run as `dry-high-r2` and the grep would read an old log)
  — at planning: exit 1 (the dry run exits 0, prints `reasoning=low`, grep finds nothing) — expected until Phase 1
- (paid) Branch pushed, draft PR open, PR CI `ci`, `integration`, `e2e`, `code-reviewer` green:
  `git push origin feat/finder-glm-5-3-high && gh pr create --draft` — artifact: the PR's checks page — not run:
  external

#### Manual Verification:

- The owner reads the configuration line and one step line of the stubbed dry run and agrees they show
  `reasoning=high`, the provider, the model and the reasoning volume without model text — surface:
  packages/code-reviewer/src/config.ts, packages/code-reviewer/scripts/glm-gate-core.mjs

---

## Phase 2: Screening ledger and the D2 instrument

### Overview

Add everything the screening and the D2-per-run procedure need:

- a `--screening` ledger;
- the `d2` command and the pause after each #269 run;
- D2 taken from the ledger at hand-read;
- Amendment 1 as code;
- finder-pass timing.

All of it is hermetic and stubbed. Nothing paid exists yet.

### Changes Required:

#### 1. Screening mode

**Files**:

- `packages/code-reviewer/scripts/glm-gate.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.mjs`
- `packages/code-reviewer/scripts/promptfoo-gate-rows.mjs`
- `packages/code-reviewer/scripts/glm-gate-screening.test.mjs`
- `packages/code-reviewer/scripts/promptfoo-gate-rows.test.mjs`
- `packages/code-reviewer/evals/finder-provider.ts`
- `packages/code-reviewer/evals/finder-provider.test.ts`

**File notes**: New test file `glm-gate-screening.test.mjs`. `finder-provider.ts` is a manifest file: it gains the
terminal error class for rule (b) on fixture rows, before the screening.

**Intent**: Run the screening under the owner's stop rules (§ Definitions), with the gate's classification and
settlement, without a manifest or the sealed order (H1–H6).

**Contract**:

- **Ledger and paths.**
  - `--screening` switches the ledger to `context/changes/finder-glm-5-3-high/screening/series.jsonl`, results to
    `screening/results/`, fixture rows to `screening/results/<stepId>.fixture-rows.json` (one file per fixtures
    step, since `sfix-02` can exist; impl-review F6), and console logs and exports to
    `<cache>/screening/`.
  - Run ids are `s247-01`, `s269-01`, `s269-02`; the fixtures step is `sfix`. After a confirmed 401/402 stops `sfix`
    or `s247-01`, the owner's `continue` admits `sfix-02` / `s247-02` (owner decision 2026-10-16), and so on, one
    rerun per stop.
- **Subcommands** (all with `--screening`):
  - `preflight`: T0_s, endpoint status, the input fingerprints of `pr247` and `pr269`, the sha256 of
    `describeManifest`, the git `HEAD`, forbidden environment refused. No manifest required.
  - `fixtures`: the G3 command with `--repeat 1`, checked with `repeats: 1`.
  - `run --case pr247|pr269 --run-id <id>`.
  - `reconcile`, `continue --for <reason>`, `d2` (§ 2), and `outcome [--write]`, which writes into `screening.md`
    between `<!-- glm-screen:outcome:start -->` and `<!-- glm-screen:outcome:end -->`.
- **`screeningState(series)`** (pure, in core) returns `{next, ended, fired, waitingFor, warnings}`.
  - `next` follows H2.
  - `ended` is one of `STOP (a: length)`, `STOP (b: finder timeout after retry)`, `STOP (c: cost)`,
    `STOP (d: no D2 in <id>)`, `INCOMPLETE (budget)`, `INCONCLUSIVE (no valid #269 run)` or `GO`.
  - `fired` lists every stop rule that holds, so one label never hides another; `outcome` prints them all.
  - **Precedence.** When several outcomes hold, `ended` is, in this order: a STOP label if any stop rule fired (the
    first to fire; `fired` lists the rest); else `INCOMPLETE (budget)`; else `INCONCLUSIVE (no valid #269 run)`; else
    `GO`. A fired stop is never handed to the owner as an open GO/STOP question.
  - `GO` requires no stop and at least one valid #269 run checked for (d). With none, and no stop fired, the screening
    ends `INCONCLUSIVE (no valid #269 run)`. That is not a stop: the owner decides.
  - A run stopped by a confirmed 401/402 is not a sample and stays out of m269, as in the gate. It is not replaced;
    the run ids stay `s269-01` and `s269-02`.
  - **401/402 on a one-step kind (owner decision 2026-10-16).** A confirmed 401/402 on `sfix` or `s247-01` is not a
    sample either, but the screening needs one sample of each: after the owner's `continue`, that kind runs once
    more, under admission. The rule is per stop: a confirmed 401/402 on that rerun gives another, after its own
    `continue` (`sfix-03`, `s247-03`, …; owner decision 2026-10-16, impl-review F5). Only a confirmed 401/402 gives a
    rerun. An invalid fixture row or an invalid run is still a sample (as an invalid #269 run is in m269): after the
    owner's `continue`, the screening goes on, with no `sfix-02`.
  - A step that ends with T_s above $0.75 records its overshoot and ends the screening `INCOMPLETE (budget)`. The
    owner decides.
  - `waitingFor` names a pause (401/402 confirmed, provider or model mismatch, grader error, other invalid run) or a
    D2 decision.
  - **Pauses (owner decision 2026-10-16).**
    - A fixtures step pauses on a confirmed 401/402, a provider or model mismatch, a grader error, and, as H5 treats
      CLI runs, on an invalid row: a failed export (wrong row count or label), a wrong reasoning shape, inline
      reasoning, or any other finder error. A missed metric alone is informational. `waitingFor` names each row
      and its cause.
    - `continue --screening --for <reason>` takes the reason `waitingFor` reports for that step (`auth-credit`,
      `mismatch`, `grader-error` or `invalid-run`) and refuses any other.
    - After an invalid #269 run, the D2 line comes first: `continue --screening` refuses while that run's
      `d2 --not-applicable` line is missing. Both are recorded.
    - `continue --screening` refuses while the paused step is unsettled (the owner decision for a failed export,
      applied to every pause by the plan, since admission refuses an unsettled step anyway).
- **Rule (b)** is decided on metadata only:
  - **CLI run:** artifact-less; at least one `retrying finder after <any class>` line; no `retrying judge` line; no
    `finder-output:` reason (a finder output refusal is that refusal's H5 pause, not (b)); and the timeout pattern
    matches stderr once every `retrying …` line is removed, together with the lines that name or carry model output:
    the configuration line, the step lines, `rejected output (` and `Finder output rejected (` (impl-review F6).
    `parseCliStderr`'s `timeout` flag is not the signal: it matches the retry line itself (`glm-gate-core.mjs:157`,
    `:204`).
  - **Fixture row (H6):** at least one adapter retry, and a terminal finder error of class `timeout`. The adapter
    records that class (`finderErrorClass`, from `retryClass`) next to `finderErrorStatus`.
  - A timeout retry followed by a valid artifact is a `warning`. A recovered finder timeout followed by another
    failure (for example a technical judge failure) is that failure's pause (H5), with the warning recorded.
- **Admission** is H3; a refusal writes `budget_stop` and exits 4, with nothing spent.
- **Screened tree (owner decision 2026-10-16).**
  - The baseline is the `describeManifest` sha256 of the last screening preflight before the first paid step. From
    that step on it is frozen. A fix made before any spending needs only a new preflight.
  - Every paid step writes the sha256 it ran on into the ledger, and refuses before spending when it differs from
    the baseline, naming the files and inputs that differ.
  - A stubbed test runs the whole sequence (`sfix`, `s247-01`, `s269-01`, `s269-02`) and finds the same sha256 at
    every step, including the frozen worktrees' `clean` flag: the screening does not move the hash itself.
- **Row checker.** `checkExport` takes `{repeats}` (default `REPEATS`, 3). The fixture step uses 1; the sealed G3
  path is unchanged.

#### 2. D2 decision, pause and early stop

**Files**:

- `packages/code-reviewer/scripts/glm-gate.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.mjs`
- `packages/code-reviewer/scripts/glm-gate-d2.test.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.test.mjs`

**File notes**: New test file `glm-gate-d2.test.mjs`.

**Intent**: The owner's D2 decisions of 2026-10-16 (a)–(d), the same in the screening and in the gate.

**Contract**:

- **`d2 [--screening] --run <id> --list`** (free) prints the D2 candidates of that run's stored `review.json` (the
  term set of § Definitions): id, file:lines, severity and the first line of the description. It writes nothing.
- **One candidate predicate.** `isD2Candidate` moves from `glm-gate-sheet.mjs:42` into core and is extended from
  "`file` contains `bread-spike.ts`" to the term set. `d2 --list` and the sheet's `D2?` flag both use it, so they
  never disagree.
- **`d2 [--screening] --run <id> (--match <F-id>[,<F-id>…] | --none) --note <text>`** appends
  `{type: "d2", stepId, decision: "match"|"no-match", matches, candidates, unlisted, note, by: "owner", at}`.
  - It refuses a run that is not a valid #269 run.
  - It refuses a second decision for the same run, and a finding id that is not a published finding of that run.
- **Invalid runs.** **`d2 [--screening] --run <id> --not-applicable --note <text>`** appends
  `{type: "d2", stepId, decision: "not-applicable", note, by: "owner", at}`. It accepts only an invalid #269 run and
  refuses a second line for the same run (H7).
- **Pause.** `scheduleState` and `screeningState` return `waitingFor: "the owner's d2 line for <id>"` after any #269
  record without a `d2` line. Every paid step is refused until it exists.
- **Early stop.** A `no-match` in the gate ledger ends the series `FAIL (D2)`. `computeOutcome` gives the verdict
  `NOT ADMITTED (hand-read)`, and its gates table shows:
  - `G1`: `<k>/<n> valid — stopped by D2`;
  - `hand-read`: `FAIL (no D2 match in <id>)`;
  - `cost`: `not measured`;
  - `G5`: `not measured`.

  `G5` is `not measured` whenever the verdict rules G5 out — every `NOT ADMITTED …` and `INCOMPLETE (budget)`, the D2
  early stop included — because Phase 7 runs only after `ADMITTED (pending G5)`; otherwise it shows
  `G5: pending (Phase 7)` (impl-review F6).

#### 3. Hand-read takes D2 from the ledger

**Files**:

- `packages/code-reviewer/scripts/glm-gate-sheet.mjs`
- `packages/code-reviewer/scripts/glm-gate-sheet.test.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.mjs`

**Intent**: Decision (a): the full hand-read does not revisit D2.

**Contract**:

- **`sheet`** pre-fills `D2` in the Verdict cell of every finding the ledger approved, and states in the header that
  those rows are decided.
- **`resolve`** takes each #269 run's D2 count from the ledger's `d2` lines. A sheet verdict `D2` on a row the ledger
  did not approve, or a ledger-approved row whose sheet verdict is not `D2`, is a problem.
- Every other row is `accept` / `reject` as before.
- `checkHandRead` in core cross-checks `d2` against the ledger.

#### 4. Amendment 1 as code

**Files**:

- `packages/code-reviewer/scripts/glm-gate.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.mjs`
- `packages/code-reviewer/scripts/glm-gate-sheet.mjs`
- `packages/code-reviewer/scripts/glm-gate.test.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.test.mjs`
- `packages/code-reviewer/scripts/glm-gate-sheet.test.mjs`

**Intent**: H8. Turn the predecessor's three operator checks into refusals.

**Contract**:

- `forbiddenEnvSet` refuses any of the ten names that is present, whatever its value, empty and whitespace-only
  included.
- `--manifest`, `--series`, `--results`, `--g3-rows` and `--gate` (runner), and `--series`, `--results`,
  `--out-dir` and `--sheets-dir` (sheet), are refused unless `--dry-run` is given.
- The sheet gains `--dry-run`. It only unlocks the sheet's path flags; with it, the sheet refuses any write path
  (`--out-dir`, `--series`) inside the change folder. The sheet tests use it (`glm-gate-sheet.test.mjs:190-221`).
- `g3`, `g3 --regrade` and `fixtures --screening` refuse while their export file exists, naming it and the way out.
- `--inputs`, `--cache`, `GLM_GATE_INPUTS` and `GLM_GATE_CACHE` stay allowed, because the inputs are checked by
  sha256.

#### 5. Finder-pass timing

**Files**:

- `packages/code-reviewer/scripts/glm-gate.mjs`
- `packages/code-reviewer/scripts/glm-gate.test.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.test.mjs`

**Intent**: H11.

**Contract**:

- `spawnCommand` notes the arrival time of each complete stderr line that is the configuration line, a finder step
  line or a `retrying finder` line, and the time the process exits.
- The run record gains, one entry per attempt and per H11 (start, end, failed):
  - `finderStepOffsetsMs: number[][]`, each attempt's step-line offsets from that attempt's start;
  - `finderElapsedMs: (number | null)[]`, each attempt's end offset (`null` when the run printed no configuration
    line);
  - `finderAttemptFailed: boolean[]`.
- `parseCliStderr` keeps each step line's `out=` count as `outputTokens` (`null` when absent).
- No line text is stored.

### Success Criteria:

#### Automated Verification:

- New screening tests pass: `cd packages/code-reviewer && npx vitest run scripts/glm-gate-screening.test.mjs` — at
  planning: exit 1 (no test file) — expected until Phase 2
- New D2 tests pass: `cd packages/code-reviewer && npx vitest run scripts/glm-gate-d2.test.mjs` — at planning: exit 1
  (no test file) — expected until Phase 2
- Whole package passes: `cd packages/code-reviewer && npx vitest run` — at planning: exit 0 (1,046 tests)
- Typecheck, lint, format: `cd packages/code-reviewer && npx tsc --noEmit && npx eslint .` and `npx prettier --check .`
  — at planning: exit 0
- Stubbed screening end to end through the real CLI, no key, into a fresh cache (`C="$(mktemp -d)"`):
  `node scripts/glm-gate.mjs preflight --screening --dry-run --cache "$C"`, then
  `run --screening --case pr247 --run-id s247-01 --dry-run --cache "$C"`, a stubbed `s269-01`, and
  `d2 --screening --run s269-01 --list --dry-run --cache "$C"`. Every step exits 0, and `d2 --list` prints the stub's
  canned `bread-spike.ts` finding as a candidate — not run: needs Phase 2 output

#### Manual Verification:

- The owner reads a stubbed `d2 --list` output, a stubbed D2 proposal file and a stubbed screening outcome block, and
  accepts them as the instruments for the D2 decisions and the go/no-go — surface:
  packages/code-reviewer/scripts/glm-gate.mjs, packages/code-reviewer/scripts/glm-gate-core.mjs

---

## Phase 3: The screening

### Overview

Run the screening at `high` under the owner's pre-stated rules, within $0.75. It ends `GO` (Phase 4) or `STOP`
(archive); `INCONCLUSIVE (no valid #269 run)` and `INCOMPLETE (budget)` go to the owner, who records GO or STOP.
Screening runs are not gate samples.

### Changes Required:

#### 1. Rules before spending

**Files**:

- `context/changes/finder-glm-5-3-high/screening.md`

**File notes**: New. Section headings: Rules, Order, Budget, D2, Results.

**Intent**: H10. The stop rules, pauses and D2 procedure are on record before the first paid step.

**Contract**:

- **Contents:** the owner's 2026-10-16 stop rules (a)–(d) and the non-stops, verbatim; H1–H7; the order; the budget;
  the D2 procedure; the outcome markers.
- **Owner confirmation.** § Rules carries one dated owner confirmation line per plan-chosen term (H1–H7, and the
  outcome rules of Phase 2 § 1), written before the push.
- **Push before spending.** It is committed and pushed before `preflight --screening`; the GitHub push time is
  recorded.

#### 2. Run

**Files**:

- `context/changes/finder-glm-5-3-high/screening/series.jsonl`
- `context/changes/finder-glm-5-3-high/screening/results`
- `context/changes/finder-glm-5-3-high/screening/d2`
- `context/changes/finder-glm-5-3-high/screening.md`

**File notes**: Generated by the runner; `screening/d2/<runId>.md` are the agent's D2 proposal files; screening.md
section Results.

**Intent**: Measure.

**Contract**:

1. Run `preflight --screening` (free). The owner reads it, optionally sets the key's limit at usage(T0_s) + $0.75, and
   authorizes the spend.
2. Run `fixtures`, `s247-01`, `s269-01` → D2 decision → `s269-02` → D2 decision. Each step honours every stop and
   pause.
3. For each valid #269 run, the agent writes `screening/d2/<runId>.md`: every candidate from `d2 --list` with a
   recommendation, filtering nothing. The owner decides with `d2 --screening`.
4. Run `reconcile --screening` until every step is settled, then `outcome --screening --write`.
5. The agent adds run notes under the outcome block, from the ledger only:
   - per request: kind, provider, model, finish, reasoning tokens and output tokens; the largest output against
     16,384;
   - per run: each attempt's `finderElapsedMs` against 300,000, failed attempts marked, and whole-run `durationMs`;
   - settled costs, m247, m269 and 53·m247 + 8·m269 against $7.404940;
   - the fixture metrics (informational);
   - warnings.

#### 3. Decision

**Files**:

- `context/changes/finder-glm-5-3-high/change.md`

**File notes**: Section: Notes.

**Intent**: The owner records `GO` or `STOP`. On `STOP` the next step is `/rune-archive` (outcome: not admitted
(screening)), and the draft PR closes unmerged.

### Success Criteria:

#### Automated Verification:

- (paid) Screening rules pushed before any screening spend: `git push origin feat/finder-glm-5-3-high` — artifact:
  `screening.md` § Rules push time — not run: external
- (paid) The screening steps, in order, under admission: `node scripts/glm-gate.mjs preflight --screening`, then
  `fixtures --screening`, `run --screening …` — artifact: `context/changes/finder-glm-5-3-high/screening/series.jsonl`
  — not run: paid
- Every screening step settled and T_s ≤ $0.75: `node scripts/glm-gate.mjs reconcile --screening` exits 0 (settled),
  and `node scripts/glm-gate.mjs outcome --screening` prints T_s ≤ $0.75 (`reconcile` checks no cap) — not run:
  external
- Screening outcome recorded: `node scripts/glm-gate.mjs outcome --screening --write` — not run: needs Phase 3 output

#### Manual Verification:

- The owner confirms H1–H7 and the outcome rules of Phase 2 § 1 one by one as restated in `screening.md` § Rules, then
  authorizes the screening spend after reading `preflight --screening` — surface: context/changes/finder-glm-5-3-high/screening.md,
  context/changes/finder-glm-5-3-high/screening/series.jsonl
- The owner records a D2 decision for each valid screening #269 run — surface:
  context/changes/finder-glm-5-3-high/screening/d2, context/changes/finder-glm-5-3-high/screening/series.jsonl
- The owner decides at any screening pause — surface: context/changes/finder-glm-5-3-high/screening/series.jsonl
- The owner records GO or STOP in `change.md` — surface: context/changes/finder-glm-5-3-high/screening.md

---

## Phase 4: Pre-registration and seal

### Overview

**Only after GO.** Write this change's gate as a pre-registration. The owner approves it, then it is sealed. Nothing
paid of the series happens before the seal.

### Changes Required:

#### 1. Series first-step estimates

**Files**:

- `packages/code-reviewer/scripts/glm-gate-core.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.test.mjs`

**Intent**: H9, from the settled screening costs.

**Contract**: `FIRST_STEP_ESTIMATE` values per H9. A test pins them.

#### 2. Pre-registration

**Files**:

- `context/changes/finder-glm-5-3-high/gate.md`
- `context/changes/finder-glm-5-3-high/gate-manifest.json`

**File notes**: New pre-registration and manifest.

**Intent**: Restate the predecessor's sealed gate with this change's deltas, and freeze it before the series.

**Contract**: `## Inputs freeze` (re-hashed on the day) and `## Pre-registration` … `_End of Pre-registration._`,
§§ 1–13 in the predecessor's structure (`context/archive/2026-10-11-finder-glm-5-3/gate.md:98-452`). The deltas:

- **§1:**
  - effort `high`, and the `reasoning=high` configuration line;
  - the code under test is this manifest;
  - the screened tree's `describeManifest` sha256, and which sealed files differ from it.
- **§2:**
  - the reasoning shape at `high`;
  - D2 candidates, D2 decision, D2 pause and early stop (§ Definitions);
  - Amendment 1's rules as runner checks.
- **§3:** gates unchanged. Hand-read notes that D2 is decided per run in the ledger.
- **§4:** the order is unchanged, plus the D2 pause after each #269 run.
- **§5:**
  - budget $3.00 pause, $3.50 hard stop, G5 reserve $1.00;
  - the screening's spend is outside T, with its own ledger and T0, and the series T0 is read after the screening
    settles;
  - first-step P from H9.
- **§6:** adds `FAIL (D2)`.
- **§7:** adds the D2 early stop → `NOT ADMITTED (hand-read)`, with the remaining gates `not measured`.
- **§8:** D2 comes from the ledger, and the sheet is pre-filled.
- **§9:** this change's tag and names, and how G5 is read: a liveness and telemetry probe on a truncated window
  that holds no `src/` file (Critical Implementation Details, "G5 diff").
- **§11:**
  - the predecessor's A1–A8 verbatim, as already amended there;
  - this plan's H7–H9;
  - the known limit carried from the predecessor (a technical judge failure without a retry line is recorded as
    `exit-<n>`).
- **§13:** tag `finder-glm-5-3-high/seal`.

#### 3. Seal

**Files**:

- `context/changes/finder-glm-5-3-high/gate.md`

**File notes**: Section: Pre-registration seal.

**Intent**: The predecessor's seal procedure, unchanged (`…/gate.md` §13).

**Contract**:

1. `npx prettier --check gate.md`.
2. `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum` and its UTC time.
3. Commit and push.
4. The GitHub push time, from
   `GET /repos/Piotr-Miller/lumina-clean-ai/activity?ref=refs/heads/feat/finder-glm-5-3-high`.
5. The annotated tag `finder-glm-5-3-high/seal`, pushed.

### Success Criteria:

#### Automated Verification:

- Pre-registration formatted: `npx prettier --check context/changes/finder-glm-5-3-high/gate.md` — not run: needs
  Phase 4 output
- Manifest matches the tree: `cd packages/code-reviewer && node scripts/glm-gate.mjs preflight --manifest-only` — not
  run: needs Phase 4 output
- (paid) Seal commit, push and tag: `git push origin feat/finder-glm-5-3-high finder-glm-5-3-high/seal` — artifact:
  `gate.md` § Pre-registration seal — not run: external

#### Manual Verification:

- The owner confirms each plan-chosen term (including H7–H9 and the first-step P values) and approves the
  pre-registration **before** the seal — surface: context/changes/finder-glm-5-3-high/gate.md,
  context/changes/finder-glm-5-3-high/gate-manifest.json
- The owner confirms that the seal does not by itself authorize Phase 5 — surface:
  context/changes/finder-glm-5-3-high/gate.md

---

## Phase 5: The paid series

### Overview

Run the sealed series under the owner's authorization, at the sealed commit, in the sealed order, with a D2 decision
after every #269 run.

### Changes Required:

#### 1. Series

**Files**:

- `context/changes/finder-glm-5-3-high/gate/series.jsonl`
- `context/changes/finder-glm-5-3-high/gate/results`
- `context/changes/finder-glm-5-3-high/gate/d2`
- `context/changes/finder-glm-5-3-high/gate.md`

**File notes**: Generated by the runner; gate/d2/<runId>.md are the agent's D2 proposals; gate.md section Results.

**Intent**: Measure. Nothing in a sealed file changes during this phase.

**Contract**:

1. `preflight` (free). The owner sets the key's limit at usage(T0) + $3.50 and authorizes the spend.
2. G2-01, the probe. The owner confirms it (`continue --for probe`).
3. The rest in the sealed order.
4. After each valid #269 run: `d2 --list`, the agent's proposal file, the owner's `d2`.
5. `reconcile` after the last step, then `outcome --write`.
6. Run notes under the outcome block, from the ledger, as in the predecessor (`…/gate.md` § Run notes).

### Success Criteria:

#### Automated Verification:

- (paid) Preflight and the series: `node scripts/glm-gate.mjs preflight`, then `run …` per the sealed order —
  artifact: `context/changes/finder-glm-5-3-high/gate/series.jsonl` — not run: paid
- (paid) G3 rows through admission: `node scripts/glm-gate.mjs g3` (and `g3 --regrade` only for grader errors) —
  artifact: `context/changes/finder-glm-5-3-high/gate/g3-rows.json` — not run: paid
- Automatic outcome recorded: `node scripts/glm-gate.mjs outcome --write` — not run: needs Phase 5 output
- Settled spend within the cap: `node scripts/glm-gate.mjs reconcile` shows T ≤ $3.50 — not run: external

#### Manual Verification:

- The owner authorizes the paid series after reading `preflight`, with the key limit set at usage(T0) + $3.50 —
  surface: context/changes/finder-glm-5-3-high/gate.md, context/changes/finder-glm-5-3-high/gate/series.jsonl
- The owner confirms the G2-01 probe before G2-02 — surface: context/changes/finder-glm-5-3-high/gate/results,
  context/changes/finder-glm-5-3-high/gate/series.jsonl
- The owner decides at the $3.00 pause, if it is reached — surface:
  context/changes/finder-glm-5-3-high/gate/series.jsonl
- The owner records a D2 decision for every valid #269 run before the next run — surface:
  context/changes/finder-glm-5-3-high/gate/d2, context/changes/finder-glm-5-3-high/gate/series.jsonl

---

## Phase 6: Hand-read and outcome

### Overview

**Only when the series measured every step without a stop.** Produce the sheets with D2 pre-filled from the ledger,
collect the owner's accept/reject verdicts, resolve, and record the pre-G5 outcome. After an early stop (`FAIL (D2)`
or any other), this phase records the outcome and the next decision only.

### Changes Required:

#### 1. Hand-read

**Files**:

- `context/changes/finder-glm-5-3-high/hand-read-247.md`
- `context/changes/finder-glm-5-3-high/hand-read-269.md`
- `context/changes/finder-glm-5-3-high/gate.md`

**File notes**: gate.md section: Results › Hand-read.

**Intent**: Every published finding of every valid #247 and #269 run is classified. D2 is not revisited.

**Contract**: The predecessor's Phase 6 procedure:

1. `sheet`, then Prettier before any verdict is filled.
2. The owner fills every verdict.
3. `resolve --out <local>`.
4. `outcome --write --hand-read <local>`.

The pre-G5 outcome is `ADMITTED (pending G5)` or `NOT ADMITTED (<gate>)`, with cost provisional as sealed.

#### 2. Record

**Files**:

- `context/changes/finder-glm-5-3-high/change.md`

**File notes**: Section: Notes.

**Intent**: The owner's next decision. On `NOT ADMITTED` or an early stop: the PR closes unmerged, Phase 7 does not
run, and the next step is `/rune-archive`. On `ADMITTED (pending G5)`: Phase 7.

### Success Criteria:

#### Automated Verification:

- Sheets generated from the recorded series: `node scripts/glm-gate-sheet.mjs sheet` — not run: needs Phase 5 output
- Per-run results computed: `node scripts/glm-gate-sheet.mjs resolve --out <local>` — not run: needs owner verdicts

#### Manual Verification:

- The owner classifies every non-D2 finding in both sheets — surface:
  context/changes/finder-glm-5-3-high/hand-read-247.md, context/changes/finder-glm-5-3-high/hand-read-269.md,
  context/changes/finder-glm-5-3-high/gate/results
- The owner records the outcome and the next decision in `change.md` — surface:
  context/changes/finder-glm-5-3-high/gate.md, context/changes/finder-glm-5-3-high/hand-read-247.md,
  context/changes/finder-glm-5-3-high/hand-read-269.md

---

## Phase 7: Restore AI review and run G5

### Overview

**Only after `ADMITTED (pending G5)`.** This is the predecessor's Phase 7 with this change's names
(`context/archive/2026-10-11-finder-glm-5-3/plan.md:930-1029`):

- remove `false &&`;
- correct the stale pointers outside the manifest;
- delete the variable;
- run G5 on this PR.

No manifest file changes.

### Changes Required:

#### 1. Workflow

**Files**:

- `.github/workflows/review.yml`

**Intent**: R11.

**Contract**:

- Delete only the `false &&` line.
- Rewrite the comment at `:23-27` to name change `finder-glm-5-3-high` and its tag `finder-glm-5-3-high/seal`.
- Update `:220`'s model note.

#### 2. Stale pointers

**Files**:

- `AGENTS.md`
- `packages/code-reviewer/evals/README.md`

**Intent**: `lessons.md` § "Writing a fact into its canonical home…".

**Contract**:

- Run `git grep -nE "glm-4\.6|TEMPORARILY OFF|schema mismatches re-roll|enabled: false|OPENROUTER_REVIEW_MODEL|novita"`
  over `AGENTS.md`, `.github/` and `packages/code-reviewer/`, archives excluded.
- Each hit outside the manifest is updated or recorded in `gate.md` § G5 as historical. A hit inside the manifest is
  a follow-up.
- `AGENTS.md` describes:
  - the two-stage finder;
  - glm-5.3 at `effort: high`;
  - the finder-only routing;
  - one format repair instead of a retry on `FinderOutputError`.

#### 3. G5

**Files**:

- `context/changes/finder-glm-5-3-high/gate.md`

**File notes**: Section: G5.

**Intent**: The live probe (`lessons.md` § "An offline eval proves…").

**Contract**: The sealed §9:

1. The owner deletes `OPENROUTER_REVIEW_MODEL`.
2. Check that T + $1.00 ≤ $4.50.
3. Every push is made while the PR is a draft.
4. Before the PR is marked ready, the agent re-measures where the 100,000 B cap cuts the G5 head's diff (with
   `review.yml`'s EXCLUDES) and records it in `gate.md` § G5.
5. The owner marks the PR ready and adds `ai-cr:review`.
6. G5 is the first `AI Code Review` run after that, judged by the sealed criteria.
7. Then I and the final projection.

### Success Criteria:

#### Automated Verification:

- No `false &&` guard remains: `git grep -nE '^\s+false &&$' .github/workflows/review.yml` prints nothing — at
  planning: exit 0 with one match (`:29`) — expected until Phase 7
- Stale-pointer grep clean or justified:
  `git grep -nE "TEMPORARILY OFF|schema mismatches re-roll" -- AGENTS.md .github packages/code-reviewer` prints
  nothing — at planning: exit 0 with 2 matches — expected until Phase 7
- Sealed files unchanged since the seal: `cd packages/code-reviewer && node scripts/glm-gate.mjs preflight --manifest-only`
  — not run: needs Phase 4 output
- Variable deleted: `gh variable list` shows no `OPENROUTER_REVIEW_MODEL` — not run: external
- (paid) G5, the first `AI Code Review` run after `ai-cr:review` — artifact: the run's `ai-review-output`, recorded in
  `gate.md` § G5 — not run: paid
- PR CI `ci`, `integration`, `e2e`, `code-reviewer` green — not run: external

#### Manual Verification:

- The owner deletes `OPENROUTER_REVIEW_MODEL`, marks the PR ready and adds `ai-cr:review` — surface:
  .github/workflows/review.yml, context/changes/finder-glm-5-3-high/gate.md
- The owner reads G5's comment and verdict and decides whether to merge — surface:
  context/changes/finder-glm-5-3-high/gate.md
- After the merge, evidence pointers to commits are written with the master SHAs — surface:
  context/changes/finder-glm-5-3-high/gate.md

---

## Testing Strategy

### Unit Tests:

- **Effort (Phase 1).**
  - Every finder request body carries `reasoning: {enabled: true, effort: "high"}`, loop, finalization and repair
    included; judge and impl-review bodies carry none.
  - The configuration line says `reasoning=high`.
  - The G3 row checker accepts only the `high` shape and rejects a `low` one.
- **Screening (`glm-gate-screening.test.mjs`).**
  - **Order and stops.** The order is fixtures → pr247 → pr269 → pr269, and each stop rule fires on its own:
    - (a) a `length` finish in a run's telemetry, in a stderr-only run, and on a fixture row;
    - (b) a finder timeout after the retry (artifact-less run and fixture row), including a 5xx on the first attempt
      followed by a timeout on the retry. A timeout retry followed by a valid artifact is only a warning, and its cost
      still counts. A recovered finder timeout followed by a technical judge failure is a warning plus an H5 pause,
      never (b);
    - (c) at exactly $7.404940 there is no stop; above it there is. After #247 alone, 53·m247 = $7.41 stops (H4);
    - (d) `no-match`, and an undecided D2 at `outcome` treated as no match.
  - **Pauses.**
    - Each pauses and blocks the next step until `continue --screening`: a confirmed 401/402, a provider mismatch, a
      model mismatch, a fixture grader error, and a technical judge failure (H5).
    - A fixture row whose quality metrics fail is informational and does not stop.
  - **Budget.** H3: P = the largest settled cost of the kind's sample runs; a 401/402-stopped run never lowers it. The
    second #269 run is refused when T_s + P > $0.75, and that refusal spends nothing. A step that ends above $0.75
    gives `INCOMPLETE (budget)` with its overshoot.
  - **Outcome edges.** Two invalid #269 runs (neither (a) nor (b)) give `INCONCLUSIVE (no valid #269 run)`, never
    `GO`. A confirmed-402 #269 run stays out of m269 and is not replaced. A `no-match` with (c) exceeded lists both
    in `fired`. Precedence: a `length` on s269-01, leaving no valid #269 run, gives `STOP (a: length)`, never
    `INCONCLUSIVE`; a valid `no-match` that also takes T_s above $0.75 gives `STOP (d: no D2 in s269-02)` with the
    overshoot recorded, never `INCOMPLETE (budget)`.
  - **Separation.** The screening never reads or writes the gate ledger; a gate `run` ignores screening records.
- **D2 (`glm-gate-d2.test.mjs`).**
  - **Candidates.** `--list` returns every finding matching the term set. A finding citing `bread-spike.ts` only in
    its description is listed; a non-matching one is not.
  - **Recording and pause.**
    - `d2 --match` / `--none` refuse an invalid run, a second decision, and an unknown finding id. It records an
      unlisted approved finding as `unlisted`. `d2 --not-applicable` refuses a valid run and a second line.
    - After a valid pr269 record, every paid step is refused until `d2`.
    - After an invalid pr269 record, every paid step is refused until the owner's `d2 --not-applicable`.
  - **Early stop.** `no-match` in the gate gives `FAIL (D2)`, then `NOT ADMITTED (hand-read)`, with G1, cost and G5
    shown as `not measured` / `stopped by D2`, never as PASS.
  - **Sheet and resolver.** The sheet pre-fills `D2`. `resolve` flags a sheet `D2` not in the ledger, and a ledger D2
    row changed in the sheet.
- **Amendment 1 as code.**
  - A forbidden variable set to an empty or a whitespace-only value is refused.
  - `--series` and the other path flags are refused without `--dry-run`, before any spend. The sheet's `--dry-run`
    refuses a write path inside the change folder.
  - An existing export blocks `g3`, `g3 --regrade` and `fixtures`.
- **Timing.** Step-line offsets are recorded from stubbed, delayed stderr chunks. Attempt 1 is measured from the
  configuration line and attempt 2 from the `retrying finder` line plus its `delayMs`. A retried attempt ends at the
  retry line, and a last attempt without a `finalization` step ends at the process exit; both are marked failed.
  `out=` lands in `outputTokens`; no line text is stored.
- **Regression.** All of the predecessor's 1,046 tests still pass. The sealed G3 path still requires 12 rows and
  three repeats.

### Integration Tests:

- Stubbed end-to-end screening (`--screening --dry-run`) through the real CLI: preflight, a pr247 run, a pr269 run,
  `d2 --list`.
- The Phase 1 dry run (`run --case clean --dry-run`) prints `reasoning=high`.

### Manual Testing Steps:

1. Read the stubbed configuration and step lines (Phase 1).
2. Read the stubbed `d2 --list`, a proposal file and the screening outcome block (Phase 2).
3. The screening, the series and G5 are the owner-attended paid steps (Phases 3, 5, 7).

## Performance Considerations

- **Output cap.** `high` raises reasoning per request. On #269 a loop step may approach 16,384 tokens. A cutoff is
  stop rule (a) in the screening and an invalid run in the gate, never retried.
- **Finder budget.** The 300 s budget covers the whole finder pass, and `TimeoutError` is retried once, so a run can
  take 2 × 300 s plus the judge. `finderElapsedMs` (H11) shows each attempt's margin.
- **Re-sent `reasoning_details`.** They grow stage-1 input tokens at `high` too. They are measured as cost, not
  optimised.

## Migration Notes

- `OPENROUTER_REVIEW_MODEL` must be deleted before the merge (Phase 7), or CI would run glm-4.6 on the two-stage path.
- Rollback after a merge: re-add `false &&` (one line). Changing the effort back to `low` is not a rollback: `low`
  failed its gate.

## References

- Spike: `context/changes/finder-glm-5-3-high/research.md`
- Predecessor: `context/archive/2026-10-11-finder-glm-5-3/` — `plan.md`, `gate.md` (sealed pre-registration, results,
  hand-read), `glm-screening-results.md`, `screening-config.md`
- Gate precedents: `context/archive/2026-10-02-finder-model-swap/gate.md`, `context/archive/2026-10-05-finder-sonnet/gate.md`
- Lessons: `context/foundation/lessons.md` § "An offline eval proves…", § "A per-step output cap hit…", § "A change's
  own cited evidence can be defective…", § "Writing a fact into its canonical home…"

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append
> ` — <commit sha>` when a step lands. A Manual row takes ` — accepted at <full sha>` when a human confirms it. Do not
> rename step titles. See `references/progress-format.md`.

### Phase 1: Configure effort high and retarget the tooling

#### Automated

- [x] 1.1 Package tests pass — 40217a6
- [x] 1.2 Typecheck and lint — 40217a6
- [x] 1.3 Repo formatting — 40217a6
- [x] 1.4 No `low` pin left — 40217a6
- [x] 1.5 No path to the archived change in the tooling or the ignore list — 40217a6
- [x] 1.6 Stubbed dry run prints the `high` configuration line — 40217a6
- [x] 1.7 Branch pushed, draft PR open, PR CI green — 40217a6

#### Manual

- [ ] 1.8 Owner reads the stubbed configuration and step lines

### Phase 2: Screening ledger and the D2 instrument

#### Automated

- [x] 2.1 New screening tests pass — 4211102
- [x] 2.2 New D2 tests pass — 4211102
- [x] 2.3 Whole package passes — 4211102
- [x] 2.4 Typecheck, lint, format — 4211102
- [x] 2.5 Stubbed screening end to end — 4211102

#### Manual

- [ ] 2.6 Owner accepts the D2 listing, proposal and screening outcome formats

### Phase 3: The screening

#### Automated

- [ ] 3.1 Screening rules pushed before any screening spend
- [ ] 3.2 The screening steps, in order, under admission
- [ ] 3.3 Every screening step settled and T_s ≤ $0.75
- [ ] 3.4 Screening outcome recorded

#### Manual

- [ ] 3.5 Owner authorizes the screening spend
- [ ] 3.6 Owner records a D2 decision for each valid screening #269 run
- [ ] 3.7 Owner decides at any screening pause
- [ ] 3.8 Owner records GO or STOP

### Phase 4: Pre-registration and seal

#### Automated

- [ ] 4.1 Pre-registration formatted
- [ ] 4.2 Manifest matches the tree
- [ ] 4.3 Seal commit, push and tag

#### Manual

- [ ] 4.4 Owner approves the pre-registration including H7–H9 and the first-step P values
- [ ] 4.5 Owner confirms the seal does not authorize Phase 5

### Phase 5: The paid series

#### Automated

- [ ] 5.1 Preflight and the series
- [ ] 5.2 G3 rows
- [ ] 5.3 Automatic outcome recorded
- [ ] 5.4 Settled spend within the cap

#### Manual

- [ ] 5.5 Owner authorizes the paid series
- [ ] 5.6 Owner confirms the G2-01 probe
- [ ] 5.7 Owner decides at the $3.00 pause
- [ ] 5.8 Owner records a D2 decision for every valid #269 run

### Phase 6: Hand-read and outcome

#### Automated

- [ ] 6.1 Sheets generated from the recorded series
- [ ] 6.2 Per-run results computed

#### Manual

- [ ] 6.3 Owner classifies every non-D2 finding
- [ ] 6.4 Owner records the outcome and next decision

### Phase 7: Restore AI review and run G5

#### Automated

- [ ] 7.1 No `false &&` remains
- [ ] 7.2 Stale-pointer grep clean or justified
- [ ] 7.3 Sealed files unchanged since the seal
- [ ] 7.4 Variable deleted
- [ ] 7.5 G5 run recorded
- [ ] 7.6 PR CI green

#### Manual

- [ ] 7.7 Owner deletes the variable, marks ready, adds ai-cr:review
- [ ] 7.8 Owner reads G5 and decides on the merge
- [ ] 7.9 Evidence pointers written with master SHAs after the merge
