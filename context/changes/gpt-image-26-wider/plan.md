# GPT-Image-2.6 wider comparison (eight tuning photos) Implementation Plan

## Overview

This plan runs a blind, paid comparison of `gpt-image-2.6-sunburst` (`quality=high`, `complexity=low`,
`moderation=auto`) against real Local. It covers all eight tuning photos with two outputs each, 16
pairs in total.

Before any spend, it fixes the fidelity instrument the frame found wanting:

- a written size/visibility anchor for the per-side levels;
- a pairwise fidelity preference per pair, as in S-19, instead of comparing two coarse labels.

The gate, the rubric, the series and the $3.50 cap are committed before the first paid call. A PASS
opens nothing beyond a further decision; it never leads to a deployment, and Cloud stays paused.

## Current State Analysis

The frame (`frame.md`, Confidence HIGH) is the task definition.

- **Reported observation.** The screen `gpt-image-26-screen` (#359) ended PASS: 4 of 6 pairs were
  at least a tie. All six GPT outputs were rated `minor`, while the owner's own reasons describe
  redrawn faces, an invented neon sign, an invented flag and erased faint stars
  (`context/archive/2026-11-05-gpt-image-26-screen/evaluations/verdict.md:3,42-47`).
- **Reframed problem.** The fidelity instrument has no anchored level for what the reasons
  describe, so its labels and gate cannot show whether 2.6 is as faithful as Local. A wider run on
  the same instrument would measure the instrument as much as the model.
- **Hypothesis investigation (from the frame).**
  - "The model is as faithful as Local" was falsified: S-19 phase 5 rated the same defect classes
    "Local clearly" more faithful 8/8 (`context/archive/2026-09-28-cloud-model-comparison/evaluations/phase5-tuning.md:44-58`).
  - "The instrument cannot carry it" is STRONG:
    - the levels are only an order (`scripts/gpt26/configs/gpt26-low.json:117`);
    - evidence is required only at `significant`/`severe` (`scripts/gpt26/gate.py:328`);
    - the four ties were all `minor` vs a reasonless Local `minor`.
- **Narrowing signal.** The owner rated by "small area / at this size".

What exists and what this plan changes:

- **Tooling is hard-wired to the screen.**
  - `scripts/gpt26/blind.py:80-83` fixes `EVAL` and `VIEWER_REL` under
    `context/changes/gpt-image-26-screen/`.
  - `run.py:69` fixes `CHANGE_MD` there.
  - `state.py:39-55` lists that change's viewer among `RULE_FILES`, and the series and config as
    `REGISTRATION_FILES`.
  - `check_series.py:31-70` fixes the six slots, denominator 6 and `min_tie_pairs` 4.
  - `pointers.py:48-52` fixes `CHANGE_ID`.
  - That change is now archived, so these paths no longer exist on this branch. Origin: `code`.
- **The run binding pins a commit SHA.** `state.py:406-425` compares `registration_commit` for
  equality. The lesson `lessons.md:279` records that this broke the screen's offline gate after the
  rebase-merge, and that the screen's evidence is re-verified at the tag `gpt26-screen-evidence`
  (exists on origin), not on master.
- **The gate decides by labels.** `decide()` (`gate.py:381-408`) counts ties as
  `level(GPT) <= level(Local)`. The export schema is viewer `compare-s20` version 1 with per-side
  `fidelity` only (`gate.py:55`, `gate.py:342-345`).
- **S-19's pairwise instrument exists as a precedent, not as code here.** Its export stored
  `fidelity_preference` with values like `reference-clear`
  (`context/archive/2026-09-28-cloud-model-comparison/evaluations/phase5-core.json`).
- **Inputs and Local exist for all eight photos.**
  - `scripts/s19/series/phase5.json` registers `common` inputs for S17-01…07 and S17-21.
  - `scripts/s20/configs/local-baselines.json` pins a Local file for each.
  - The private files live on the owner's Fedora host only.
- **The runner and its accounting carry over unchanged in behaviour.** Ledger, reservation lock,
  moderation retry and the six-slot reconciler logic are reused with a 16-slot series.
- **On this Windows host** the GPT26 suite cannot run (no Pillow, no `fcntl`). All suites,
  the paid run and the rating run on Fedora, as for the screen.

### Carried from predecessor

`change.md` has no `Predecessor:` line. The screen is the direct origin of this change, so its
open items were checked by hand:

| Item                                                                  | Source (path + finding)                                   | Disposition                                               | Addressed in                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| Commit-SHA binding broke the offline gate after rebase                | `lessons.md:279`; screen `state.py:424`                   | carried forward                                           | Phase 1 §2                                       |
| Repeated Local recognition (two pairs per scene share one Local file) | screen `gate-sealed.md` § Human control; `verdict.md` Run | carried forward (stated, not removed)                     | Phase 3 config `blind_protocol`; Phase 5 verdict |
| "minor" ratings kept as rated by owner decision 2026-11-21            | `roadmap.md:412`                                          | resolved: the screen's verdict stays sealed and unchanged | What We're NOT Doing                             |

## Definitions

| Term                      | Decided meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Origin                                                                                                                                       | On degenerate data                                                                                        | Verified by                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| slot                      | One logical render (photo, slot 1 or 2), at most two attempts; the retry after `moderation_blocked` or a transient failure uses identical input, prompt and parameters and must fit the cap                                                                                                                                                                                                                                                                                                                         | user (screen 2026-11-05/16, carried)                                                                                                         | A second block, or no budget left for the retry → undelivered                                             | 2.1 (gate tests), 4.1              |
| denominator               | Always 16 (S17-01…07, S17-21 × slots 1, 2); an undelivered slot is never excluded or replaced                                                                                                                                                                                                                                                                                                                                                                                                                       | user (8 × 2, 2026-11-21)                                                                                                                     | 15 delivered + 1 blocked → denominator 16 → FAIL                                                          | 1.1, 2.1, 3.1                      |
| fidelity level (per side) | `none < minor < significant < severe`, judged against the original at comparison scale. **significant** = the change is noticeable with the whole frame fitted to the viewer, without zoom. **minor** = found only when zoomed in. The same rule applies to invented or altered content (identity, legible text, objects) and to removed real detail or a changed colour character, on both sides. **severe** = visible without zoom and changing the scene as a whole. `uncertain` blocks the gate until re-rated. | user (graded by size/visibility; "visible without zoom", 2026-11-21); severe's wording: plan (it has no gate consequence beyond significant) | A redrawn face visible only at zoom → `minor`; the same face visible at full frame → `significant` → FAIL | 2.1, 2.3 (viewer shows the anchor) |
| evidence                  | `significant`/`severe` need at least one crop and a reason; the reason states what is visible without zoom                                                                                                                                                                                                                                                                                                                                                                                                          | user (S-20 scale) + plan (reason wording)                                                                                                    | A `significant` without a crop → BLOCKED                                                                  | 2.1                                |
| fidelity preference       | Per pair, which side is more faithful to the original: `A-clear / A-slight / tie / B-slight / B-clear`, mapped through the sealed key to `local-clear … gpt-clear`; required for every pair, no `uncertain`                                                                                                                                                                                                                                                                                                         | user (pairwise like S-19, 2026-11-21)                                                                                                        | Missing on one pair → BLOCKED, not counted as a tie                                                       | 2.1                                |
| at least a tie            | The pair's mapped preference is `tie`, `gpt-slight` or `gpt-clear`                                                                                                                                                                                                                                                                                                                                                                                                                                                  | user (2026-11-21)                                                                                                                            | `local-slight` counts against GPT                                                                         | 2.1                                |
| majority                  | ≥ 8 of 16 pairs at least a tie                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | user ("≥ half", 2026-11-21)                                                                                                                  | 7 of 16 → FAIL                                                                                            | 2.1                                |
| gate verdict              | **PASS** iff all 16 slots are delivered, **and** no GPT side is `significant`/`severe`, **and** ≥ 8/16 pairs are at least a tie, **and** there is no cost-bound breach and conservative spend ≤ cap. Otherwise **FAIL**. Quality preference, per-side levels of Local and wall time are diagnostics.                                                                                                                                                                                                                | user                                                                                                                                         | A FAIL from undelivered slots is reported as "not delivered", not as a fidelity loss                      | 2.1, 5.3                           |
| wall time                 | p95 per call against the 30 s guardrail; diagnostic only                                                                                                                                                                                                                                                                                                                                                                                                                                                            | user (2026-11-21)                                                                                                                            | p95 31 s on a PASS → reported, verdict unchanged                                                          | 2.1                                |
| comparison scale          | The GPT output's exact size; original and Local are Lanczos-downscaled to it; crops are in that space                                                                                                                                                                                                                                                                                                                                                                                                               | user (screen 2026-11-16, carried)                                                                                                            | < 1 % aspect distortion from multiple-of-16 rounding is documented                                        | carried tests in 2.1               |
| real Local                | The pinned files in `scripts/s20/configs/local-baselines.json`, byte-identical                                                                                                                                                                                                                                                                                                                                                                                                                                      | product                                                                                                                                      | A hash mismatch → refused, nothing built                                                                  | carried tests in 2.1               |
| cap                       | $3.50, covering all 16 first attempts at their worst-case bounds                                                                                                                                                                                                                                                                                                                                                                                                                                                    | user (2026-11-21)                                                                                                                            | Σ first-attempt bounds > $3.50 → `check_series` exit 1                                                    | 3.1                                |

## Desired End State

`context/changes/gpt-image-26-wider/evaluations/verdict.md` exists and states PASS or FAIL. It is
computed by the gate from:

- reconciled 16-slot run evidence;
- a write-once seal;
- ratings of every delivered pair, committed after the seal, with a checkpoint for two-pass sets;
  the seal and terminal evidence suffice when zero slots are delivered.

all under a config, series and rubric committed before the first paid call. Undelivered slots,
fidelity disqualifications, the pairwise majority count, the budget and the diagnostics (quality,
Local levels, wall time p95) are reported separately.

The roadmap item at `roadmap.md:412`, `idea-notes.md` and `temp_steps.md` point to the verdict. The
evidence tag `gpt26-wider-evidence` is on origin before integration.

### Key Discoveries:

- All eight photos already have registered inputs (`scripts/s19/series/phase5.json`) and pinned
  Local files (`scripts/s20/configs/local-baselines.json`), so no new input material is needed.
- `check_series.py` already recomputes request sizes and cost bounds from the config. At up to
  3,686,400 px a slot's bound is about $0.20–0.21, so 16 slots need ≈ $3.20–3.36, below $3.50.
- The screen's prompt already forbids content changes ("Do not add, remove or change any content",
  `gpt26-low.json`), so the prompt is not the variable here. It stays byte-identical.

## What We're NOT Doing

- Re-rating, editing or re-deciding the screen. Its verdict stays sealed, and it is re-verified at
  `gpt26-screen-evidence`, not on master.
- A $0 re-rating of the six screen outputs under the new rubric. Owner choice: go straight to the
  eight-photo run.
- Changing the model, prompt, `complexity`, `quality` or size rule; attributing results to 2.5 vs
  2.6.
- Opening the `s17-v2` holdout; extra or replacement slots.
- Making wall time a gate criterion (diagnostic by owner decision).
- Requiring evidence for `minor`, or for a non-tie preference (not chosen; the pairwise question
  carries the comparison).
- Any production code, un-pausing Cloud, or a deployment, whatever the verdict.

## Implementation Approach

1. **Make the GPT26 tools study-driven.** The config names its change folder, series and viewer, so
   the same code serves this study without the screen's archived paths. Replace the commit-SHA
   binding with content hashes.
2. **Add the pairwise fidelity question and the visible anchor** to a viewer copy in this change,
   and move the gate to a version-2 export whose majority counts preferences.
3. **Pre-register** the config, series and gate, and check them offline.
4. **Pay and rate on Fedora**: run → build → seal commit → rate delivered pairs → ratings commit →
   push the evidence tag before integration → gate → pointers. With zero delivered slots, push the
   tag at the empty-set seal commit and compute the terminal FAIL without ratings.

## Critical Implementation Details

**Commit order and integration.** Each of these is its own commit, in this order:

1. registration (config, series, gate);
2. `GPT26-SPEND`;
3. the paid run's records;
4. the seal (`evaluations/gate-sealed.md`, write-once);
5. ratings, when there are delivered pairs.

Never squash them. The gate proves seal-before-ratings by ancestry within the verified history and
binds every record to blob/SHA-256 hashes, never to a branch commit SHA (`lessons.md:279`). Push the
tag `gpt26-wider-evidence` at the ratings commit (or the empty-set seal commit if zero delivered)
before any update-branch rebase or merge, so the original history stays verifiable.

**Rule files are pinned at the first reservation.** `state.RULE_FILES` for this study includes this
change's viewer copy. Any edit to a rule file after the first paid call blocks resume and the gate,
by design. Finish Phases 1–3 completely before Phase 4.

## Phase 1: Study-driven GPT26 tooling

### Overview

Remove the screen's hard-wired paths and the commit-SHA binding, keeping the runner's behaviour
identical for a given config.

### Changes Required:

#### 1. Study descriptor in the config

**Files**:

- `scripts/gpt26/run.py`, `scripts/gpt26/state.py`, `scripts/gpt26/check_series.py`,
  `scripts/gpt26/blind.py`, `scripts/gpt26/gate.py`, `scripts/gpt26/pointers.py`: read the study
  from the config instead of module constants.

**Intent**: let one code base drive this study and a fixture with the screen's six-slot schema.

**Contract**:

- **The config gains a `study` object:**
  - `change_dir` (repo-relative, under `context/changes/`);
  - `series` (path);
  - `viewer` (path, under `change_dir/references/`);
  - `private_root` (repo-relative, under `test-photos/private/`), set to
    `test-photos/private/gpt26-wider` for this study;
  - `series_id`;
  - `expected_slots` derives from `gate.expected_slots`.
- **The study CLIs take `--config <path>`** (default: none; refuse without it). `state.py`
  receives the resolved study from its callers. The study-independent regression harness retains
  `--suite` and `--revision`.
- **Derived paths:**
  - `EVAL`, `SEAL_REL`, `RATINGS_REL`, `VIEWER_REL`, `CHANGE_MD` and the pointers' `CHANGE_ID`
    derive from the study;
  - `REGISTRATION_FILES` = (config, series);
  - `RULE_FILES` retains the existing runtime dependency inventory and substitutes the study's
    viewer. Include any new runtime helper that can change run, seal or verdict behavior;
  - the runner's ledger, lock, outputs and sidecar, the builder's sealed set, and the gate's set
    and checkpoint lookup share `private_root`. Keep the S-19 prepared inputs and pinned Local
    downloads at their existing roots. Validate study paths before any tool writes, including
    containment after resolving symlinks. Keep frozen paths repo-relative for files inside the
    checkout so a detached worktree can verify the same bytes.
- **`pointers.py`:** implement and test the exact local block selectors and optional issue
  mapping in Phase 5 §2 here. Phase 5 supplies the outcome text and runs the check.
- **`check_series.py`:**
  - takes the slots, denominator and gate values from the config's `gate` block instead of
    constants;
  - keeps the phase-5 input/size source and bound recomputation, and rejects a first-attempt sum
    above the registered `gate.cap_usd`;
  - checks that the registered viewer's manifest base points to `study.private_root`;
  - refuses a config whose `study.change_dir` resolves under `context/archive/`.

#### 2. Content-hash binding

**Files**: `scripts/gpt26/state.py`, `scripts/gpt26/gate.py`

**Intent**: a rebase that preserves the evidence commit order can still pass the offline gate
(`lessons.md:279`).

**Contract**:

- `bindings` keeps `head` as provenance. Remove `registration_commit` equality from both
  `state.check_bindings()` (runner/resume) and `gate.run_record()` (sealed key vs checkout).
  Require the registration and rule-file blob identities at both points.
- Seal-before-ratings is proven by `git merge-base --is-ancestor` within the checked history.
- Build, seal and rate a synthetic set, then rewrite history **including** the registration
  commit while preserving file bytes and strict seal/ratings order. Run the complete offline gate
  against that rewritten history and require the same verdict. A changed rule blob must still
  block resume and gate verification.

#### 3. Tests

**File**: `scripts/gpt26/tests/`

**Intent**: the existing suites keep passing against a fixture config of the screen's shape, plus
tests for the study descriptor and the rewrite.

**Contract**:

- Fixtures stop referencing `context/changes/gpt-image-26-screen/`.
- Put a Phase 1 viewer fixture in `scripts/gpt26/tests/fixtures/compare-gpt26.html`, copied from
  the archived screen viewer with the old schema and controller intact. Use it for the existing
  viewer tests and diff allowlist. Phase 2 tests exercise the actual wider viewer, including a
  bounded diff against this reference fixture.
- Add tests:
  - a missing `--config` → usage exit 2;
  - an archived `change_dir` → refused;
  - a 16-slot fixture study → denominator 16 reconciled;
  - two studies' private roots are distinct and the runner, builder and gate agree on paths;
  - wider pointer checks pass with no issue and refuse missing, duplicate or stale live blocks;
  - the rewrite test above.

#### 4. Offline run report

**Files**: `scripts/gpt26/run.py`, `scripts/gpt26/tests/test_run.py`

Add `run.py --report`, mutually exclusive with `--dry-run` and `--resume`. Read the committed
study, approval and existing private run record, and write the reconciled summary to
`<study.change_dir>/evaluations/run.md`. Report every slot's status and terminal reason, known
billed and conservative spend, unknown reservations, blocks and recoveries, and per-call wall time
and p95. Report an unresolved or breached state explicitly if present. Report mode never calls the
provider, requires no API key, and makes no reservations or writes to the ledger or sidecar. Test it
with a synthetic record, including an undelivered slot and an unknown reservation. Its exit status
indicates whether the report was produced. The paid invocation retains its existing exit status.

### Success Criteria:

#### Automated Verification:

- GPT26 suite passes on Fedora: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests` — at planning (Windows, no Pillow): exit 1 — the suite runs on the Fedora host; there it must exit 0 after this phase
- No tool path names the screen's change folder: `git grep -n "gpt-image-26-screen" -- scripts/gpt26/*.py` — at planning: exit 0 (matches found) — expected until Phase 1; after it, exit 1 (no match)
- S-19 regression suite still passes at the candidate: `python3 scripts/gpt26/regression.py --suite s19 --rev HEAD` — not run: writes (disposable worktree)

#### Manual Verification:

- The owner checks the study descriptor and confirms that each paid call needs a committed owner approval for the matching cap, that admission counts known costs or the full reservation under the ledger lock, that each slot gets at most one eligible retry within the cap, and that a cost-bound breach stops further calls. Resume may cross a history rewrite when the pinned file blobs match — surface: scripts/gpt26/study.py, scripts/gpt26/run.py, scripts/gpt26/state.py, scripts/s19/run-candidate.py

---

## Phase 2: Pairwise fidelity and the visible anchor

### Overview

Add a per-pair fidelity preference and show the level anchor in the viewer. Move the gate to a
version-2 export and decide the majority from the preferences.

### Changes Required:

#### 1. Viewer copy

**File**: `context/changes/gpt-image-26-wider/references/compare-gpt26.html`

**Intent**: rate with the rubric on screen, so "minor" and "significant" mean the same thing on
every pair.

**Contract**:

- Copy the Phase 1 viewer fixture. Resolve its static manifest base relative to this viewer as
  `../../../../test-photos/private/gpt26-wider/` and update both checkpoint-placement messages for
  that root. In Phase 3 `check_series.py` verifies the registered viewer's base agrees with
  `study.private_root` before spend. Keep quality, per-side levels and crop controls.
- Added:
  - a required question "Który wynik wierniejszy oryginałowi?" with `A wyraźnie / A nieco / remis /
B nieco / B wyraźnie`, stored as `fidelity_preference` ∈ `A-clear, A-slight, tie, B-slight,
B-clear`;
  - the anchor text under the level buttons, using the Definitions wording: "istotna = widoczna
    przy całym kadrze bez powiększenia; drobna = tylko po powiększeniu; dotyczy też treści
    dodanej lub zmienionej (twarze, napisy, obiekty) i usuniętego detalu lub koloru".
- The evidence prompt asks what changed, appeared or disappeared and what is visible without zoom.
- Treat `fidelity_preference` as unanswered until explicitly selected. Validate it in saved state
  (`validAnswer()`), check it in `missing()` before pass 1 locks, include it in `gpt26Row()` and
  `gpt26ValidRow()`, and restore it from the locked row after reload. The final export, embedded
  `locked_pass1` and private checkpoint all preserve the same first-pass value.
- Export and checkpoint become `version: 2`. Reject legacy or invalid locks without revealing
  pass 2, and keep the existing stale-tab guard. An incomplete export may be downloaded with a
  warning, and the gate blocks it.
- The viewer, manifest, checkpoint and export use anonymous IDs and A/B labels. GPT/Local
  mapping stays in the private sealed key and is applied by the gate. Keep one shared mtime, PNG
  compress level 0, side-order writes, and the sanitized CLI boundary.

#### 2. Gate version 2

**File**: `scripts/gpt26/gate.py`

**Intent**: majority by preference, with the disqualifying levels and evidence rules kept.

**Contract**:

- `ratings_of()` checks both document versions and compares every locked first-pass row with
  its final row and private checkpoint, including the preference. For the registered
  `preference` rule, accept only v2. `check_rows()` requires exactly one valid preference per
  delivered pair. Omitted, null or invalid preferences give BLOCKED.
- In `evaluate()`, map the A/B preference through the sealed key's `gpt_side` before passing the
  record to `decide()`. `decide()`:
  - counts `tie`/`gpt-slight`/`gpt-clear` against `gate.min_tie_pairs`;
  - keeps disqualification on GPT `significant`/`severe`, undelivered → FAIL, and the
    budget/protocol rules.
- The verdict table gains a "Fidelity preference" column, and Local levels are shown as a
  diagnostic.
- Select the rule and schema using `gate.tie_rule_kind`. Keep `level` with v1 for the screen-shaped
  fixture tests. Reject unknown kinds or mismatched versions.
- Add `gate.py --check` here, before rule pinning. Run the same full offline evaluation and
  emit the canonical verdict Markdown to stdout without writing verdict files or private logs.
  Print sanitized refusal details to stderr. Exit 0 for a verified PASS or FAIL, 1 for BLOCKED,
  and 2 for usage errors. The mode reads the same sealed and live evidence and optional ratings
  as the normal gate. It can run at the ratings or empty-seal tag before a verdict file exists.

#### 3. Tests

**File**: `scripts/gpt26/tests/test_gate.py`

**Intent**: pin the new rule and its degenerate cases.

**Contract**: named cases:

- 8/16 at least a tie → PASS;
- 7/16 → FAIL;
- `local-slight` counts against GPT;
- all five choices map correctly with GPT on either side, and the viewer artifacts contain only
  the anonymous IDs and A/B preference;
- a missing, null or invalid preference → BLOCKED and never a tie;
- a version-1 export or checkpoint → BLOCKED for the preference rule;
- viewer cannot lock pass 1 with an unanswered preference, can restore a valid v2 lock on reload,
  and refuses a legacy lock. A changed first-pass preference in the final export or private
  checkpoint → BLOCKED;
- one GPT `significant` with 16/16 ties → FAIL;
- 15 delivered → FAIL with denominator 16;
- p95 above 30 s does not change the verdict;
- `--check` recomputes the same Markdown as the normal gate without verdict files at the checked
  revision, and leaves files unchanged on success and on a blocked check.

### Success Criteria:

#### Automated Verification:

- GPT26 suite passes on Fedora: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests` — not run: needs Phase 2 output (runs on Fedora)
- S-20 regression suite still passes at the candidate: `python3 scripts/gpt26/regression.py --suite s20 --rev HEAD` — not run: writes (disposable worktree)

#### Manual Verification:

- The owner opens the viewer copy on a fixture set and sees the anchor text and required preference. Leaving a preference blank prevents the lock. After locking and reloading, pass 2 is visible and the final export retains the first-pass choice — surface: context/changes/gpt-image-26-wider/references/compare-gpt26.html

---

## Phase 3: Pre-registration

### Overview

Commit the config with its gate and rubric, the 16-slot series and the approval section before any
paid call.

### Changes Required:

#### 1. Config

**File**: `scripts/gpt26/configs/gpt26-wider.json`

**Intent**: the study, the gate and the rubric pinned by the config's hash.

**Contract**:

- Copy of `gpt26-low.json`. Model, prompt, `request_fields`, size rule, retry and cost bound are
  unchanged byte-for-byte; `check_series` verifies this.
- `study` block pointing at this change, including `private_root: "test-photos/private/gpt26-wider"`.
- `gate`:
  - `id: gpt26-wider-v1`;
  - `denominator: 16`;
  - `expected_slots` S17-01…07, S17-21 × 1, 2;
  - `tie_rule_kind: "preference"`;
  - `min_tie_pairs: 8`;
  - `cap_usd: 3.50` for pre-registration validation. Paid admission still uses the committed
    `GPT26-SPEND` approval and matching `--cap 3.50`;
  - levels, evidence and disqualifying levels as before;
  - the Definitions table above as `definitions`, with the anchor wording verbatim;
  - diagnostics, including wall time p95 vs 30 s;
  - `pass_opens`: "a further decision only; never a deployment".
- `blind_protocol` restates the repeated-Local recognition risk and the two-pass procedure.

#### 2. Series

**File**: `scripts/gpt26/series/wider.json`

**Intent**: the 16 registered slots.

**Contract**: `series_id: gpt26-wider`. Inputs, hashes and sizes come from
`scripts/s19/series/phase5.json`, and cost bounds are recomputed from the config. No prerequisites.

#### 3. Approval section and pointers

**Files**:

- `context/changes/gpt-image-26-wider/change.md`: § GPT26 approvals with the grammar comment
  (`cap_usd=3.50`), filled only by the owner.
- `context/foundation/roadmap.md`: line 412, "Not yet a change" → the change id and its status.

**Intent**: the spend gate the runner reads, and no stale "not yet a change" pointer
(`lessons.md:244`).

**Contract**: the runner's `SPEND_LINE` grammar is unchanged. The cap equals `--cap 3.50`.

### Success Criteria:

#### Automated Verification:

- Registration is complete: `python3 scripts/gpt26/check_series.py --config scripts/gpt26/configs/gpt26-wider.json` — not run: needs Phase 1 and 3 output; must report 16 slots and first-attempt bounds ≤ $3.50
- Dry run on Fedora resolves all 16 inputs within the cap: `python3 scripts/gpt26/run.py --config scripts/gpt26/configs/gpt26-wider.json --cap 3.50 --dry-run` — not run: needs Phase 3 output and the private corpus (Fedora)

#### Manual Verification:

- The owner confirms that the config's `gate` block and `definitions` (anchor wording, majority 8/16, wall time diagnostic, cap $3.50) state their rules — surface: scripts/gpt26/configs/gpt26-wider.json
- The owner confirms the 16 slots and inputs — surface: scripts/gpt26/series/wider.json

---

## Phase 4: Paid run (Fedora)

### Overview

Render the 16 slots within $3.50 under the committed approval.

### Changes Required:

#### 1. Approval and run

**Files**:

- `context/changes/gpt-image-26-wider/change.md`: the owner writes and commits
  `- GPT26-SPEND cap_usd=3.50 decision=approved date=YYYY-MM-DD`.
- `context/changes/gpt-image-26-wider/evaluations/run.md`: the run summary written by the tools.

**Intent**: spend only under the owner's committed line, on a clean checkout whose registration and
rule files match.

**Contract**:

- Outputs, ledger and sidecar go to the registered private root. Run from the Fedora checkout
  with the committed pre-registration, rule files and owner approval in its history.
- Capture the paid invocation's status and run the Phase 1 offline report command below. If the
  paid invocation is interrupted, use the report to inspect state. Resume only unresolved slots
  under the existing `--resume` contract. Record a breach or unresolved state as such.
- `run.md` records:
  - known cost, conservative cost and unknown reservations;
  - first-attempt blocks, recovered slots and final undelivered slots;
  - wall time per call and p95.

### Success Criteria:

#### Automated Verification:

- (paid) All 16 slots resolved within the cap: `(run_status=0; report_status=0; python3 -B scripts/gpt26/run.py --config scripts/gpt26/configs/gpt26-wider.json --cap 3.50 || run_status=$?; python3 -B scripts/gpt26/run.py --config scripts/gpt26/configs/gpt26-wider.json --cap 3.50 --report || report_status=$?; if test "$run_status" -ne 0; then exit "$run_status"; fi; exit "$report_status")` — artifact: `context/changes/gpt-image-26-wider/evaluations/run.md` — not run: paid

#### Manual Verification:

- The owner checks `run.md`: spend ≤ $3.50, no bound breach, and every slot's terminal state named — surface: context/changes/gpt-image-26-wider/evaluations/run.md

---

## Phase 5: Seal, rating, verdict, pointers

### Overview

Build the sealed blind set, rate its delivered pairs, compute the verdict and update every live
pointer.

### Changes Required:

#### 1. Seal and rating

**Files**:

- `context/changes/gpt-image-26-wider/evaluations/gate-sealed.md`: write-once; its own commit before
  any output is opened.
- `context/changes/gpt-image-26-wider/evaluations/ratings.json`: the final export when any slots
  delivered, in its own commit after the seal.

**Intent**: blind ratings provably after the seal.

**Contract**:

- Use `python3 -B scripts/gpt26/blind.py --config scripts/gpt26/configs/gpt26-wider.json --set gpt26-wider`
  on the reconciled terminal record. Seal up to 16 delivered pairs in at most two passes, with
  at most one slot per photo per pass. Leave undelivered slots in the denominator of 16 and out of
  the viewer, with their terminal reasons reported separately. Reconcile the terminal record before
  any rating. A consistent terminal budget breach can produce FAIL with its budget/protocol reason
  even when the paid verification row did not pass. Unresolved or inconsistent evidence is BLOCKED.
- For a two-pass set, save the first-pass checkpoint in the registered private root before rating
  pass 2.
  A single-pass set needs no checkpoint. Commit the export after the seal.
- At zero delivery, commit only the empty-set seal after the run record. Skip the viewer and
  ratings export, compute the terminal FAIL with no `--export`, and mark 5.4 n/a with the terminal
  run evidence cited.
- From the ratings commit, or the empty-set seal commit for zero delivery, create
  `git tag -a gpt26-wider-evidence -m "GPT26 wider sealed evidence"` and push
  `git push origin refs/tags/gpt26-wider-evidence` before any update-branch rebase or merge.

#### 2. Verdict and pointers

**Files**:

- `context/changes/gpt-image-26-wider/evaluations/verdict.md`,
  `context/changes/gpt-image-26-wider/evaluations/verdict.json`: written by the gate.
- `context/foundation/roadmap.md`, `idea-notes.md`, `temp_steps.md`,
  `context/changes/gpt-image-26-wider/change.md` (`## Outcome`): pointers to the verdict.

**Intent**: one canonical outcome, with no stale "screen PASS opens a wider comparison" wording left
as a current claim (`lessons.md:244`).

**Contract**:

- Phase 1's checker selects exactly one of each: the `## Parked` bullet in `roadmap.md` naming
  `gpt-image-26-wider`, the `**Still not demonstrated` clause in `idea-notes.md`, the numbered
  item in `temp_steps.md` under `## Teraz` and the bullet under `## Kolejka` naming
  `gpt-image-26-wider`, and this change's `## Outcome` section. Update those blocks in Phase 5.
  Each must state the same PASS/FAIL as the canonical verdict and link to that file.
- In those blocks reject stale current claims (case-insensitive): "only opens a wider comparison",
  "only opens this wider comparison", "Not yet a change", and "otworzyć to porównanie jako nową
  zmianę". Normalize whitespace so line wrapping cannot mask the last phrase. Keep the screen's
  result as a dated historical statement in the relevant prose.
- Validate an issue status cell only when `github-issues.md` has a final-mapping row naming this
  change and an issue number. In that case, require a dated outcome row for that same issue
  linking this verdict. The local check works without an issue. Neither the issue lookup nor the
  `## Teraz` selector keys on #359 or its historical opening date.

#### 3. Evidence-tag verification on Fedora

Run this recipe from the branch with the generated verdict before the Phase 5 commit. Repeat from
the integrated checkout after merge to fulfill the post-integration check in row 5.3. The Fedora
checkout must have the local evidence tag and the original private files. The detached worktree
receives copies at their repo-relative locations. Copy only the registered tuning inputs and Local
baselines, and keep all evidence private. The candidate or integrated verdict is the comparison
target because the tag predates the generated verdict.

```bash
(
  set -euo pipefail
  repo=$(git rev-parse --show-toplevel)
  scratch=$(mktemp -d)
  tagged="$scratch/evidence"
  cleanup() {
    cd "$repo" || return
    if test -d "$tagged"; then git -C "$repo" worktree remove --force "$tagged" || return; fi
    rmdir "$scratch"
  }
  trap cleanup EXIT
  git -C "$repo" worktree add --detach "$tagged" refs/tags/gpt26-wider-evidence
  cd "$tagged"
  mkdir -p test-photos/private
  cp -a "$repo/test-photos/private/gpt26-wider" test-photos/private/
  ratings=context/changes/gpt-image-26-wider/evaluations/ratings.json
  verdict=context/changes/gpt-image-26-wider/evaluations/verdict.md
  set --
  if test -f "$ratings"; then
    mkdir -p test-photos/private/s19/inputs test-photos/private/s19/local
    for photo in S17-01 S17-02 S17-03 S17-04 S17-05 S17-06 S17-07 S17-21; do
      cp "$repo/test-photos/private/s19/inputs/$photo.json" \
        "$repo/test-photos/private/s19/inputs/$photo-common.jpg" test-photos/private/s19/inputs/
      cp "$repo/test-photos/private/s19/local/$photo.jpg" test-photos/private/s19/local/
    done
    set -- --export "$ratings"
  fi
  python3 -B scripts/gpt26/gate.py --config scripts/gpt26/configs/gpt26-wider.json \
    --set gpt26-wider --check "$@" | cmp - "$repo/$verdict"
  printf '%s\n' 'Evidence tag reproduces the verdict.'
)
```

### Success Criteria:

#### Automated Verification:

- Gate computes a verdict from sealed evidence: `(ratings=context/changes/gpt-image-26-wider/evaluations/ratings.json; set --; if test -f "$ratings"; then set -- --export "$ratings"; fi; python3 -B scripts/gpt26/gate.py --config scripts/gpt26/configs/gpt26-wider.json --set gpt26-wider "$@")` — artifact: `context/changes/gpt-image-26-wider/evaluations/verdict.md` — not run: needs Phase 4 output and the private set. This is offline and free. The reviewed Progress title retains its historical `(paid)` label.
- No stale pointer: `python3 scripts/gpt26/pointers.py --config scripts/gpt26/configs/gpt26-wider.json` — not run: needs Phase 5 output
- Verdict re-verifies at the evidence tag: run the complete Fedora command in Phase 5 §3. Exit 0 with the byte-identical verdict before the Phase 5 commit, then repeat after integration — not run: needs Phase 2 `--check`, Phase 5 evidence tag and the private set

#### Manual Verification:

- The owner rates every delivered pair in sealed order, saves the private checkpoint before pass 2 when there are two passes, and commits the export after the seal. At zero delivery, record n/a against the terminal run evidence — surface: context/changes/gpt-image-26-wider/evaluations/ratings.json
- The owner reads `verdict.md` and confirms that undelivered slots, disqualifications, the 8/16 count and the diagnostics are stated separately — surface: context/changes/gpt-image-26-wider/evaluations/verdict.md
- The owner decides whether to open or close a GitHub issue for this change (outward-facing; asked once)

---

## Testing Strategy

### Unit Tests:

- **Study descriptor:**
  - a missing `--config` → usage error;
  - an archived `change_dir` → refused;
  - derived paths;
  - a 16-slot reconcile.
- **Binding:** a rewrite including the registration commit still verifies; a changed rule-file
  blob → BLOCKED.
- **Gate v2:**
  - 8/16 → PASS;
  - 7/16 → FAIL;
  - `local-slight` counts against GPT;
  - a missing preference → BLOCKED;
  - a v1 export → BLOCKED;
  - a GPT `significant` → FAIL;
  - 15 delivered → FAIL (denominator 16);
  - wall time p95 never changes the verdict.

### Integration Tests:

- Before/after regression runs of the S-19 and S-20 suites in disposable worktrees
  (`scripts/gpt26/regression.py`), as for the screen.
- A dry run on Fedora resolves all 16 inputs and bounds.

### Manual Testing Steps:

1. Open the viewer on a fixture set: the anchor is visible and the preference is required.
2. Lock pass 1 and confirm that pass 2 appears only then.
3. Export, and confirm the gate accepts version 2 and refuses version 1.

## Performance Considerations

Sixteen calls at ~30 s each are run sequentially, as in the screen. There is no concurrency
change.

## Migration Notes

The screen's config, series and verdict are untouched. Its evidence remains verifiable only at the
tag `gpt26-screen-evidence`.

## References

- Frame: `context/changes/gpt-image-26-wider/frame.md`
- Screen (archived): `context/archive/2026-11-05-gpt-image-26-screen/` (plan, verdict, ratings,
  viewer)
- S-19 phase 5: `context/archive/2026-09-28-cloud-model-comparison/evaluations/phase5-tuning.md`,
  `phase5-core.json`
- Lessons applied: `lessons.md:244`, `:251`, `:258`, `:279` (35 of 40 entries apply to `plan`; most
  concern the app stack and do not touch this offline study; these four shaped the plan)

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append ` — <commit sha>` when a step lands. A Manual row takes ` — accepted at <full sha>` when a human confirms it. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Study-driven GPT26 tooling

#### Automated

- [x] 1.1 GPT26 suite passes on Fedora — 3bce55e
- [x] 1.2 No tool path names the screen's change folder — 3bce55e
- [x] 1.3 S-19 regression suite still passes at the candidate — 3bce55e

#### Manual

- [ ] 1.4 The owner confirms only paths moved and spend behaviour is unchanged

### Phase 2: Pairwise fidelity and the visible anchor

#### Automated

- [x] 2.1 GPT26 suite passes on Fedora — ad9584b
- [x] 2.2 S-20 regression suite still passes at the candidate — ad9584b

#### Manual

- [ ] 2.3 The owner sees the anchor text and the required fidelity-preference question in the viewer copy

### Phase 3: Pre-registration

#### Automated

- [x] 3.1 Registration is complete
- [x] 3.2 Dry run on Fedora resolves all 16 inputs within the cap

#### Manual

- [ ] 3.3 The owner confirms the gate block and definitions state their rules
- [ ] 3.4 The owner confirms the 16 slots and inputs

### Phase 4: Paid run (Fedora)

#### Automated

- [ ] 4.1 (paid) All 16 slots resolved within the cap

#### Manual

- [ ] 4.2 The owner checks run.md

### Phase 5: Seal, rating, verdict, pointers

#### Automated

- [ ] 5.1 (paid) Gate computes a verdict from the sealed set and committed ratings
- [ ] 5.2 No stale pointer
- [ ] 5.3 Verdict re-verifies at the evidence tag after integration

#### Manual

- [ ] 5.4 The owner rates all 16 pairs in the sealed two-pass order
- [ ] 5.5 The owner confirms the verdict states each result class separately
- [ ] 5.6 The owner decides on the GitHub issue
