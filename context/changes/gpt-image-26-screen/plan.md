# GPT-Image-2.6 Sunburst screening test — Implementation Plan

## Overview

A small, pre-registered, paid screen: does `gpt-image-2.6-sunburst` at `quality=high`,
`complexity=low`, `moderation=auto` give a Cloud AI output that is at least as faithful as real
Local? The screen renders 6 outputs (S17-03 / S17-04 / S17-07 × 2 slots) with the S-19 phase-5
prompt. The owner then rates them blind on two axes (quality, fidelity) against the original and
real Local, using the S-20 viewer and fidelity scale. The verdict comes from a gate fixed before
any render. A PASS only opens a wider comparison on all eight tuning photos and never leads to a
deployment. The budget cap is **$1.50**.

## Current State Analysis

- **S-19 runner** `scripts/s19/run-candidate.py`:
  - **Ledger:** reservation under an exclusive lock before any network access (`admit`, :229-236),
    the slot lock (:148-166), and a cost bound per call from the config (:99-113).
  - **Retry:** `moderation_blocked` is retried with identical input via `retry.retry_error_codes`
    (:436-438), and `retried_error_summary` (:441-463) counts first-attempt blocks, recoveries and
    final failures.
  - **Not reusable as is:**
    - `--phase` is restricted to `3/5/7` (:550).
    - `call_provider` sends only `model/prompt/size/quality/output_format/n` (:281-284), so it
      cannot send `complexity` or `moderation`.
    - Approvals come from `protocol.CHANGE_DIR` = `context/changes/cloud-model-comparison`
      (`protocol.py:58`). That folder is archived (`context/archive/2026-09-28-cloud-model-comparison/`)
      and no skill may write there.
    - `fcntl` is imported at module top (:49), so the runner works on Unix only.
- **Phase-5 config** `scripts/s19/configs/phase5-gpt.json`:
  - Contents: the restrained prompt, size rule (≤ 3,686,400 px, multiple of 16), retry
    (1 retry, timeout 900 s), and a cost bound that gives **$0.20 per call** for these three
    scenes (`scripts/s19/series/phase5.json`: request sizes 2336×1552, 2192×1648, 2320×1552).
  - Implication: six first attempts reserve $1.20; one extra attempt fits under worst-case
    $0.20 bounds ($1.40), while eight unknown attempts require $1.60. This is not a global
    one-retry limit: `phase_committed` replaces a successful reservation with its known actual
    cost, while blocked/unknown attempts retain their full bound. More retries can fit after
    actual costs release headroom, still at most one retry per slot. Earlier retries can also
    leave later first attempts unaffordable; every such slot must resolve as undelivered.
  - Prepared inputs, pinned by hash in `phase5.json`: S17-03 `3fdc9647…`, S17-04 `9d5eb8cd…`,
    S17-07 `6902afd1…`, all under `test-photos/private/s19/inputs/` on the Linux host.
- **S-19 phase-5 result** (`context/archive/2026-09-28-cloud-model-comparison/evaluations/phase5-tuning.md`):
  - GPT 2.5 was better-looking but **Local was clearly more faithful in 8 of 8 pairs**.
  - S17-07 was blocked by moderation in **3 of 7** attempts across phases, always on slot 1, and
    the retry never recovered it.
- **S-20 blind tooling** (`scripts/s20/`; viewer at
  `context/archive/2026-11-03-cloud-classical-denoise/references/compare-s20.html`):
  - **Viewer:** two questions per pair. Quality is `A-clear…B-clear`. Fidelity is per side, rated
    against the original, as `none | minor | significant | severe | uncertain`.
  - **Rules enforced** (viewer:565-578, `gate.py:165-168`): crop and reason are mandatory for
    `significant`/`severe`, and `uncertain` blocks the gate.
  - **Seal protocol:** a `S20-SEAL` line pasted before images show; `evidence.py` checks that the
    seal commit precedes the ratings commit.
  - **Anti-leak builder** (`blind.py:87-89, 412, 434`): PNG compress level 0, one shared mtime,
    side-order writes. `common.py` provides the sanitised error boundary.
  - **Not reusable as is:** the builder and the gate rule are hard-wired to S-20's design
    (`gate.py:72-73`: 8 photos, 6 wins vs control-full, and a pilot and freeze before the gate;
    `blind.py:386-405`). `trials.py:17` points at the archived change folder. The viewer loads
    from `test-photos/private/s20/<set>/` (viewer:369).
- **Real Local** for S17-03/04/07: Auto-ON app downloads stored as
  `test-photos/private/s19/local/<id>.jpg`. Their sha256 is pinned in
  `scripts/s20/configs/local-baselines.json`, and copies sit in
  `context/archive/2026-09-28-cloud-model-comparison/references/s19-local/`.
- **This Windows host** holds no private corpus (`test-photos/private/` is `.gitkeep` only).
  The review's WSL run found six S-19 discovery errors, all missing Pillow; S-20 ran 50 tests
  with nine errors: four missing Pillow, two missing NumPy and three legacy archive-path
  errors. Native Windows additionally encountered encoding and symlink-permission failures.
  Installing Pillow alone does not establish a green baseline. The owner's Linux host holds
  the inputs, Local files and S-19 ledger (origin: `user`, answer 2026-11-16); the exact revision
  transferred there must pass the reproducible regression recipe in Phase 2 before spend.
- **Compatibility pins:** the four model configs' `implementation` maps pin only
  `scripts/s19/inputs.py`; series pin config bytes, not the runner or protocol. Leave all
  historical configs, series, `inputs.py`, frozen renderers and archived evidence byte-identical.
  Guarding `fcntl` permits import on Windows, not full regression execution: the S-19 suite
  also uses Unix `fork`. Full regressions run on Linux.

### Carried from predecessor

none — no Predecessor line

## Definitions

| Term                            | Decided meaning                                                                                                                                                                                                                                                                                   | Origin                        | On degenerate data                                                                                                     | Verified by                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **slot**                        | One logical render (scene, slot 1 or 2), with **at most two attempts**. The retry after `moderation_blocked` (or a transient HTTP/timeout failure) uses identical input, prompt and parameters and must fit the $1.50 cap.                                                                        | user (2026-11-05, 2026-11-16) | A second block, or a cap that leaves no room for the retry, makes the slot **undelivered**.                            | Phase 2 tests `retry_then_ok`, `block_block`, `block_no_budget`                       |
| **delivered output**            | A slot whose valid PNG (exact requested size) is in the ledger.                                                                                                                                                                                                                                   | user                          | An invalid PNG or a technical failure counts as undelivered, not as a fidelity loss.                                   | Phase 2 test `invalid_png_is_undelivered`                                             |
| **all 6 outputs** (denominator) | Always 6. An undelivered slot is **never** excluded or replaced by an extra slot.                                                                                                                                                                                                                 | user (2026-11-16)             | 5 delivered + 1 blocked → denominator 6 → FAIL.                                                                        | Phase 3 test `blocked_slot_fails_gate`                                                |
| **fidelity loss**               | The S-20 per-side level against the original: `none < minor < significant < severe`; `uncertain` blocks the gate until re-rated. `significant`/`severe` need a crop and a reason.                                                                                                                 | user (S-20 scale, 2026-11-05) | An undelivered slot's fidelity is recorded as **"nieoceniona"** (not rated), never as `severe`.                        | Phase 3 tests `uncertain_blocks`, `missing_evidence_blocks`, `undelivered_is_unrated` |
| **pair**                        | One delivered GPT output vs real Local of the same scene. Two pairs per scene share the same Local file.                                                                                                                                                                                          | user                          | Two near-identical GPT slots on one scene remain two pairs.                                                            | Phase 3 builder test `six_pairs_two_per_scene`                                        |
| **at least a tie (fidelity)**   | In a pair, the GPT side's fidelity level ≤ Local's level (e.g. `minor`/`minor` passes, `minor`/`none` fails).                                                                                                                                                                                     | user (2026-11-16)             | Both `none` → tie → passes.                                                                                            | Phase 3 test `tie_rule_table`                                                         |
| **majority of pairs**           | ≥ 4 of 6 pairs at least a tie.                                                                                                                                                                                                                                                                    | user (majority of 6)          | 3 of 6 → FAIL.                                                                                                         | Phase 3 test `three_of_six_fails`                                                     |
| **gate verdict**                | **PASS** iff all 6 slots are delivered, **and** no GPT side is `significant`/`severe`, **and** ≥ 4/6 pairs are at least a tie. Otherwise **FAIL**. Diagnostic ratings of the delivered outputs are recorded even on FAIL but never change the verdict. Quality and wall time are diagnostic only. | user                          | A FAIL from undelivered slots is reported as "not delivered", not as a fidelity loss.                                  | Phase 3 test `fail_reasons_distinguished`                                             |
| **real Local**                  | The pinned Auto-ON downloads in `scripts/s20/configs/local-baselines.json`, byte-identical.                                                                                                                                                                                                       | product (S-19/S-20 practice)  | A hash mismatch → refused, nothing built.                                                                              | Phase 3 test `local_hash_mismatch_refused`                                            |
| **comparison scale**            | The GPT output's exact size. Original and Local are downscaled to it (Lanczos), and crops are in that space.                                                                                                                                                                                      | user (2026-11-16)             | GPT and Local aspect differ by multiple-of-16 rounding → resize to exact GPT size; the < 1 % distortion is documented. | Phase 3 test `resized_to_gpt_size`                                                    |

## Desired End State

- The gate, config, series and pre-registration are committed **before** any paid call, and the
  runner refuses to send if the config file is not committed and clean.
- 6 slots are rendered, or recorded as undelivered, within $1.50. The ledger lives at
  `test-photos/private/gpt26/attempts.jsonl`.
- The owner rates a sealed blind set in the reused viewer, and the ratings file is committed after
  the seal.
- `context/changes/gpt-image-26-screen/evaluations/verdict.md` states PASS/FAIL with:
  - reasons, with undelivered slots kept separate from fidelity losses;
  - a per-pair table;
  - the block summary (first-attempt blocks / recovered by retry / final undelivered);
  - spend, and wall time per call with p95 vs the 30 s guardrail as a diagnostic.
- The live pointers (roadmap parked entry, `github-issues.md`, issue #359 after consent) record the
  outcome.

### Key Discoveries:

- `run-candidate.py:281-284` — the request fields are fixed, so `complexity` and `moderation`
  need a config-driven passthrough.
- `run-candidate.py:191-203` — the phase budget is summed per `phase` over a ledger. A separate
  ledger dir keeps this screen's cap independent of S-19's history.
- `protocol.py:91,95` — `change_md_path()` and `private_dir()` already read `S19_CHANGE_MD` /
  `S19_PRIVATE`, which today are documented as test-only.
- `gate.py:265-292` — S-20's `decide` cannot express this rule (no pairs vs Local-only, no
  undelivered slots), so a new rule is needed. `SEVERITY` (gate.py:70) gives the level order.
- `blind.py:87-89, 412, 434` — the anti-leak measures to copy. The viewer needs only its base path
  changed.
- Lesson "A guard metric that only exists on success cannot detect failure": the gate counts
  **slots attempted**, not rated rows. That is why the denominator is fixed at 6.
- Lesson "A check that cannot say what it found…": every refusal names the slot, the state and the
  way out.

## What We're NOT Doing

- No change to production code, the Edge Function or `CLOUD_DAILY_CAP`; Cloud stays paused.
- No use of the `s17-v2` holdout; tuning photos S17-03/04/07 only.
- No prompt change, no other `complexity` value, no 2.5-vs-2.6 attribution (both variables change
  together; the question is only "is 2.6 at `low` usable").
- No extra or replacement slots, and no regeneration for quality.
- The wider eight-photo comparison is not part of this change; a PASS only records that it may be
  opened.
- No edits to archived S-19/S-20 folders. Archived tools are not repointed; only the generic
  `scripts/s19` and `scripts/s20` code gets a backward-compatible extension.
- Quality preference and wall time do not affect the verdict.

## Implementation Approach

The plan builds a thin new package `scripts/gpt26/` that imports the S-19 runner's ledger, budget
and provider code and compatible S-20 evidence helpers. Only small generic hooks go into S-19:

- validated additional scalar request fields, rejecting reserved-key collisions before reservation;
- independent caller-supplied ledger/output destinations, keeping the original S-19 input root;
- a caller-supplied approval check, with GPT26 parsing owned by the wrapper;
- an `fcntl` import guarded so tests can at least import on non-Unix.

Their defaults stay unchanged, with no lasting global mutation. The approval record lives in this
change's `change.md`, under `## GPT26 approvals`, and only the owner writes it. A GPT26 parser
reads that record; S-19's parser does not acquire a new approval grammar. The seal lives in its
own write-once `evaluations/gate-sealed.md`, separate from lifecycle edits to `change.md`.
The config hash pins the gate. A shared offline reconciler derives run state from all six
committed series slots and every attempt, independently of delivered images or ratings.

## Critical Implementation Details

- **Ordering of evidence:** the commits must happen in this order:
  1. config + gate + series (pre-registration), then executable rules committed before spend;
  2. owner's `GPT26-SPEND` line committed in `change.md`;
  3. paid run;
  4. `GPT26-SEAL` line committed once in `evaluations/gate-sealed.md`;
  5. ratings;
  6. verdict.

  The executing Linux checkout checks config, series, approval and executable rules are tracked,
  committed and clean before any reservation. Record HEAD and the blob/hash identities of those
  files with the run; resume must match the original registration and executable-rule identity.
  `state.py` owns an explicit `RULE_FILES` inventory: all runtime GPT26 Python modules, the
  config/series checker and copied viewer, plus the imported S-19 runner/protocol/input helpers
  and imported S-20 common/evidence/digest dependencies. Tests require the inventory to cover
  the actual imported runtime files. The pre-registration snapshot binds that list and hashes;
  adding/changing an executable dependency after a run starts is a refusal, not a new baseline.
  Derive the Git root from the executing code, never a test-only environment override. Transfer
  the branch with all relevant history from Windows to Linux; verify these checks again there.
  The gate requires a clean write-once seal and clean ratings, and every seal commit must be a
  strict ancestor of every ratings commit, using `scripts/s20/evidence.py` file-history checks.
  Rebase or fast-forward integration must retain distinct seal/ratings commits: never squash
  them together. Re-verify after integration. Later `change.md` bookkeeping cannot affect the seal.
  Git proves commitment order, not when a person first saw an image: the owner explicitly agrees
  not to open outputs or reveal the key before the seal commit.

- **Blind leaks:**
  - Use the S-20 measures (compress level 0, shared mtime, side-order writes, names = item id +
    side), and the sanitised CLI boundary for errors.
  - Draw pair order and A/B independently per pair (`secrets.SystemRandom`), but do not claim
    this hides the repeated Local identity: its two resized copies are pixel-identical. Record
    that residual recognition risk in the pre-registration and verdict, preserving the six slots.
  - Rate in two passes, one slot per scene per pass. The viewer reveals pass 2 only after all
    pass-1 answers have been saved and locked, and prevents revisiting/changing pass 1 after
    that transition. Export the locked first-pass checkpoint privately, then one combined final
    export for the gate. No cross-pair file/hash inspection or revealing the sealed key while
    rating. These controls reduce immediate comparison; they cannot eliminate recognition or
    prove human compliance. Retain the S-20 questions and scale unchanged.
  - Distinguish source hashes from transformed pixel hashes. Record exact target dimensions,
    RGB conversion/ICC handling and Lanczos operation; gate verification recomputes the transform.
    S-20 helpers requiring source and copy pixel equality cannot validate these resized copies.
  - The builder never prints file sizes or source paths. Sanitise stdout/stderr and decoder or
    subprocess exceptions at the public CLI boundary; private diagnostics may identify sources.
- **Undelivered slots in the set:** they are not shown in the viewer, so no empty pair can reveal
  which side is GPT. They appear only in the verdict, as "nieoceniona". With zero delivered slots,
  seal the reconciled six-slot terminal record and compute FAIL without a viewer or ratings export.
- **Failure accounting:** known costs plus full outstanding/unknown reservations determine
  conservative spend under the budget lock. A bound breach persistently forbids further sends,
  even if its result row says `ok`. Report budget/protocol failures separately; a rating cannot
  certify a compliant screen after a breach. The per-call bound is an admission estimate, not a
  promise that billing cannot exceed it. Incomplete/corrupt evidence stays BLOCKED until resolved.

## Phase 1: Vendor facts and pre-registration

### Overview

Confirm the live vendor facts, then freeze config, gate and series in a commit before any code can
spend.

### Changes Required:

#### 1. Vendor facts

**File**: `context/changes/gpt-image-26-screen/evaluations/vendor-facts.md`

**Intent**: Record, with URL and read date, the live facts the change notes say come only from a
summary:

- model id `gpt-image-2.6-sunburst` on `v1/images/edits`;
- the exact `complexity` parameter name and its allowed values;
- the `moderation` values;
- size limits (max pixels, multiple, max edge, aspect);
- per-token rates.

If `complexity=low` or `moderation=auto` is not accepted by the edits endpoint, stop and return to
the owner. The screen's premise would then be gone.

**Contract**: one table, each row giving fact / value / source URL / read 2026-MM-DD / matches the
change notes (yes/no).

#### 2. Config with embedded gate

**File**: `scripts/gpt26/configs/gpt26-low.json`

**Intent**: A copy of `phase5-gpt.json`:

- `model: gpt-image-2.6-sunburst`;
- prompt byte-identical;
- size rule, retry (1 retry, `retry_error_codes: ["moderation_blocked"]`) and cost bound
  unchanged, with the rates re-checked against vendor-facts;
- a new `request_fields: {"complexity": "low", "moderation": "auto"}`;
- a `gate` block that states the Definitions rules verbatim (denominator 6, two attempts, levels,
  tie rule, ≥ 4/6, undelivered ≠ loss, diagnostics never change the verdict).

**Contract**: the config sha256 is the identity the series, ledger and verdict bind to. A test
asserts that the prompt equals `phase5-gpt.json`'s prompt byte-for-byte.

#### 3. Series

**File**: `scripts/gpt26/series/screen.json`

**Intent**: 6 slots (S17-03/04/07 × 1, 2), with input hashes and request sizes copied from
`scripts/s19/series/phase5.json` and `cost_bound_usd` recomputed from the new config. Fixed before
any call.

**Contract**: same schema as `scripts/s19/series/phase5.json`, with `series_id: "gpt26-screen"`,
`configs` keyed by the new config sha, and no prerequisites.

#### 4. Offline series checker

**File**: `scripts/gpt26/check_series.py`

**Intent**: Build the Phase 1 verification before freezing the series. Read only repository JSON;
no Pillow, private corpus, key, network or Phase 2 runner is needed. Require exactly S17-03/04/07
× slots 1/2, no duplicates or prerequisites, config hash agreement, phase-5 input hashes and
source/request dimensions, recomputed per-call bounds and denominator six. Keep the bound formula
local to this checker or a side-effect-free helper created in this phase; do not import the
Pillow/Unix-dependent runner. Phase 2 tests check parity with the real runner's formula.

**Contract**: `python3 scripts/gpt26/check_series.py` exits 0 for the complete registration and
1 with a specific discrepancy for missing/invalid/duplicate data. It writes nothing. The config
also records repeated-Local recognition risk and the two-pass rating procedure before spend.

#### 5. Change record

**File**: `context/changes/gpt-image-26-screen/change.md`

**Intent**: Add an empty `## GPT26 approvals` section, with the record grammar in a comment.
Only the owner writes the approval line. Point to the future write-once
`evaluations/gate-sealed.md`; do not store a seal in this mutable lifecycle file.

**Contract**: grammar `- GPT26-SPEND cap_usd=1.50 decision=approved date=YYYY-MM-DD`.

### Success Criteria:

#### Automated Verification:

- Config parses and prompt matches phase5: `python3 -c "import json;a=json.load(open('scripts/gpt26/configs/gpt26-low.json'));b=json.load(open('scripts/s19/configs/phase5-gpt.json'));assert a['prompt']==b['prompt'] and a['request_fields']=={'complexity':'low','moderation':'auto'}"` — at planning: exit 1 — expected until Phase 1 (file absent)
- Series names exactly the six slots with phase-5 input hashes: `python3 scripts/gpt26/check_series.py` — not run: needs Phase 1 output
- Prettier is clean on the new files: `npx prettier --check context/changes/gpt-image-26-screen scripts/gpt26` — not run: needs Phase 1 output

#### Manual Verification:

- The owner reads vendor-facts and confirms the parameters match the 2026-11-05 decision — surface: context/changes/gpt-image-26-screen/evaluations/vendor-facts.md
- The owner reads the `gate` block and confirms it states their rules — surface: scripts/gpt26/configs/gpt26-low.json

---

## Phase 2: Runner for this screen

### Overview

A runner that spends only under this change's approval, on its own ledger, and sends the two new
request fields. It is tested offline with a fake provider.

### Changes Required:

#### 1. Generic hooks in the S-19 runner

**Files**: `scripts/s19/run-candidate.py`, `scripts/s19/protocol.py`

**Intent**: Backward-compatible extensions:

- `call_provider` appends optional scalar `request_fields` only after validating them; reject
  collisions with every runner-owned field (`model`, `prompt`, `size`, `quality`, `output_format`,
  `n`, upload/image fields and any other field assembled by the provider), before reservation;
- optional caller context separates ledger directory, output directory and approval callback
  from the input root; GPT26 retains `private/s19/inputs` while writing only under `private/gpt26`;
- the default approval callback and paths preserve S-19 behaviour; the GPT26 wrapper strictly
  parses its own single owner `GPT26-SPEND` record, with no change to S-19 sections/tags/phases;
- no temporary or lasting mutation of module globals; defaults and context are explicit;
- the `fcntl` import is guarded so the module imports on non-Unix and the locks refuse with a
  clear message there.

**Contract**: a config without `request_fields` sends byte-identical fields to today. The existing
S-19 suite stays green using the regression recipe below. Historical config/series pins and
`scripts/s19/inputs.py` are unchanged; compare their byte hashes before/after the hook edits.

#### 2. Screen runner

**File**: `scripts/gpt26/run.py`

**Intent**:

- **CLI:** `run.py [--dry-run] [--resume] --cap 1.50`. It drives the six series slots through the
  S-19 slot logic with ledger `test-photos/private/gpt26/attempts.jsonl` and a fixed phase id.
- **Refuses before any reservation:**
  - config, series, approval or executable rule files are untracked, staged-only, dirty or not
    committed in the executing Linux checkout; record HEAD, their blob hashes and the
    registration commit, and require the same registration/rule identities on resume;
  - the `GPT26-SPEND` cap ≠ `--cap`;
  - `OPENAI_API_KEY` is absent.
- **Retry:** one retry, only within the cap. A retry the cap cannot admit marks the slot
  undelivered (`not_attempted_budget`, then the terminal state); apply the same accounting to an
  unaffordable first attempt. Multiple slots may retry if actual costs release headroom.
- **Reconciliation:** use the shared validator below before send/resume, within the budget lock
  for admission. An existing `ok` row never bypasses cost/protocol checks. Dry-run reports state
  without sending, reserving, marking terminal states or changing files.
- **Summary:** prints delivered/undelivered per slot, first-attempt blocks / recovered / final
  undelivered, spend, and wall time per call with p95.

**Contract**: exit 0 only when all six slots are resolved and cost/protocol checks pass; exit 1
on refusal, unresolved state or a persistent budget/protocol stop, with an offline diagnostic
summary still available. Exit 0 does not imply a visual PASS. Preserve the S-19 attempt schema;
write GPT26 terminal records and run bindings to a versioned private run-state sidecar rather
than teaching old S-19 readers new row semantics.

#### 3. Shared run-state reconciliation

**File**: `scripts/gpt26/state.py`

**Intent**: Side-effect-free offline validation shared by runner, builder and gate. The expected
set comes from the committed six-slot series, never the count of images, ratings or key entries.
Reconcile every reserve/result row and the versioned terminal sidecar by unique scene/slot and
attempt identity, matching config/input/series hashes and registration/rule identities. Reject
duplicates, foreign or missing slots, results without reservations and more than two reservations
per slot. A pending slot is legal before running but cannot be sealed as a completed run.

Check delivered files by hash, full PNG decoding and exact requested dimensions, not extension or
header alone. A newly returned invalid PNG resolves as undelivered; later corruption of a sealed
file is evidence tampering and BLOCKED, never a silent reclassification. Explicit terminal
undelivered records carry reasons independently of fidelity values. A reserve-only crash retains
the full cost bound and consumes its attempt; resume may use only the remaining allowed attempt
and admitted budget, or record terminal undelivered after exhaustion. Never infer zero cost or
success from an absent result, and never resend an exhausted slot under a new identity.

Conservative committed spend sums known actual costs plus full bounds for outstanding/unknown
attempts. Any `bound_exceeded` row or recomputed bound breach persistently stops further sends,
including after resume and after a successful PNG response. Freeze a private ledger/state snapshot
and its digest in the sealed key; builder/gate revalidate it and its bindings. Record a distinct
budget/protocol failure and do not certify a compliant PASS. Incomplete or inconsistent evidence
is BLOCKED; a consistent terminal record can yield FAIL, including zero delivered slots.

**Contract**: normalized six-slot state, conservative spend, integrity/protocol status and failure
reasons. Validity does not depend on whether any image or rating exists. No network or writes
from this validator; the runner owns locked durable reservations and terminal-state persistence.

#### 4. Tests

**File**: `scripts/gpt26/tests/test_run.py`

**Intent**: Offline, against a fake `call_provider` in a temporary dir. Cases:

- `retry_then_ok`;
- `block_block` (undelivered);
- `block_no_budget` (retry refused by cap → undelivered, never sent);
- `invalid_png_is_undelivered`;
- `request_fields_sent`;
- `no_request_fields_unchanged`;
- `uncommitted_config_refused`;
- `cap_mismatch_refused`;
- `missing_key_refused_before_reserve`;
- `summary_counts_blocks`.

Also cover: distinct input/ledger/output roots; strict GPT26 approval grammar; every reserved-key
collision refused before reserve; unchanged S-19 approvals and request body; Windows import and
clear lock refusal; staged/untracked/dirty config, series, approval and executable rules; executing
Git-root resolution immune to test-only overrides; resumed rule/config identity mismatch;
checker/runner bound-formula parity; several retries fitting after known-cost releases; later
first attempt unaffordable; duplicate/missing/foreign slots; unmatched results; reserve-only
crashes at both attempt ordinals; zero terminal delivered outputs; over-bound first and last
responses followed by resume (including `ok` rows); full unknown-cost retention. Use fake provider
and synthetic PNGs only.

**Contract**: run with `python3 -B -m unittest discover -s scripts/gpt26/tests`.

#### 5. Reproducible Linux regression baseline

**Files**: `scripts/gpt26/regression.py`, `context/changes/gpt-image-26-screen/evaluations/regression-baseline.md`

**Intent**: Add an offline test harness, not a production or historical-tool path migration.
`regression.py --suite s19|s20 --revision <commit>` materializes a detached disposable Git
worktree of that local revision outside the live checkout, with no network, private corpus or
photographs. For S-20 only, restore these four exact metadata files to their legacy
`context/changes/cloud-classical-denoise/` paths in that disposable worktree: `change.md`,
`evaluations/pilot-result.json`, `evaluations/step1-gate.json`, `evaluations/step1-calibration.md`.
Read their bytes from the matching `context/archive/2026-11-03-cloud-classical-denoise/` Git
blobs at that revision, verify SHA-256 source/copy identity and log the mapping. Do not copy
images, modify the archive, stage fixture copies or change frozen rule/config identities.

Execute `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/<suite>/tests` there and propagate
its real exit status. Report every fixture, revision, command and dependency version. Use one
Linux environment with Pillow, NumPy, OpenCV, scikit-image and PyWavelets for both revisions.
Capture the pre-hook commit before editing and run it before the hook commit, then the final
committed candidate after edits; both must pass before spend. The harness itself may execute
from the candidate tree while targeting an earlier revision. Its temporary fixture restoration
must be identical for both, and its cleanup must be limited to its own worktree. If four files
are insufficient, stop and report the additional baseline failure; never suppress tests or claim
Pillow was the only blocker. Baseline report contains exact commit IDs, versions, fixture hashes,
test counts and exits. No previously green host checkout substitutes for these actual results.

Node dependencies (owner decision 2026-11-17): the S-19 suite calls `npx --no-install tsx` and
prettier, and a fresh worktree has no `node_modules`, so 12 tests fail for that reason alone. The
harness links the live checkout's `node_modules` into the disposable worktree only when that
revision's `package-lock.json` is byte-identical to the live one, refuses otherwise, and reports
the lockfile hash. No `npm ci`, no network. S-20 overlay (owner decision 2026-11-17): the four
files proved insufficient at 1a8ae56 (`blind.py` reads `step1-calibration.md` with
`git show HEAD:`, and one test needs `step1-premise.md`); the S-20 baseline is recorded red with
that cause, and the remedy is decided in Phase 3 before criterion 3.2 runs.

S-20 overlay remedy (owner decision 2026-11-18): `regression.py` makes ONE disposable overlay
commit in the detached temporary worktree, its parent the tested revision. It restores exactly
five metadata files to the legacy `context/changes/cloud-classical-denoise/` paths: the four
above plus `evaluations/step1-premise.md`, with bytes from the archive blobs of that same
revision and verified hashes. The commit changes only those five paths, never code, config or
tests. The same procedure runs for the baseline (`1a8ae56…`) and the candidate; criterion 3.2
requires the FULL S-20 suite to pass for both. The report records the tested revision, the
overlay commit and its parent, fixture paths and hashes, dependency versions, the command, the
test count and the real result. The overlay commit is never merged or pushed, and neither the
working branch nor the archive changes. If the suite still fails, report the cause; never
replace the criterion with a comparison of failure sets or with skipped tests. Phase 3 is
implemented and gated on the Linux (Fedora) host; rows 3.1 and 3.2 are checked only after the
checks actually pass there.

**Contract**: exit 0 only when the selected full suite passes on the exact revision. Baseline and
candidate runs are required before spend; until Linux execution, they remain explicitly not run.
Raw discovery remains useful diagnostically but has known archive-path failures without this
fixture overlay. Test harness fixture hash mismatch, missing blob and failed test propagation.

### Success Criteria:

#### Automated Verification:

- Screen runner tests pass: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests` — not run: needs Phase 2 output
- S-19 suite still passes: `python3 scripts/gpt26/regression.py --suite s19 --revision HEAD` — not run: needs Phase 2 harness and committed Linux candidate; run also against the recorded pre-hook baseline. Original raw discovery at planning/review exited 1 with six missing-Pillow import errors; Windows import is not a full regression claim.
- Dry run on the Linux host lists 6 pending slots bounded ≤ $1.50: `python3 scripts/gpt26/run.py --dry-run --cap 1.50` — not run: needs Phase 2 output and the private inputs

#### Manual Verification:

- The owner confirms the dry-run output on the Linux host shows the six slots, sizes and bounds from the series — surface: scripts/gpt26/run.py

---

## Phase 3: Blind set builder and gate rule

### Overview

Build the sealed blind set at GPT scale and compute the verdict mechanically. Both are tested on
synthetic data.

### Changes Required:

#### 1. Builder

**File**: `scripts/gpt26/blind.py`

**Intent**:

- **Inputs:** each delivered slot from the ledger, with the output's hash checked; the original;
  real Local, hash-checked against `local-baselines.json`.
- **Precondition:** `state.py` reconciles all six expected slots, attempt limits, bindings, PNGs,
  costs and terminal records. Freeze the reconciled private ledger/state snapshot into the key.
  After the seal, a live ledger or run-state sidecar that differs from that frozen copy is
  evidence that the record changed: the gate is BLOCKED until it is restored (owner decision
  2026-11-20).
- **Scale:** original and Local are resized with Lanczos to the GPT output's exact size. Record
  separate source SHA-256 and transformed RGB pixel SHA-256, exact dimensions and the transform
  recipe (including ICC conversion and RGB handling). Gate verification recomputes it. Do not
  reuse `write_copy`/`file_bindings` source-equals-copy checks on intentionally resized sources.
- **Output:** `kind:"gate"` items with A/B sides, written with the S-20 anti-leak measures to
  `test-photos/private/gpt26/<set>/`, plus a sealed key and a printed `GPT26-SEAL` line.
- **Exclusions:** undelivered slots are left out of the set but listed in the key.
- **Presentation:** RGB-only PNGs with controlled chunks/ICC, compress level 0, equal A/B byte
  lengths at equal dimensions, one mtime and side-order writes. Anonymous item/side filenames
  and manifest/export contain no arm names, source paths or hashes that reveal the mapping.
  Source/output hashes remain in the private key. Partition delivered pairs into two passes
  with at most one slot of each scene per pass, independently shuffling pair order and sides.
- **Seal:** write `evaluations/gate-sealed.md` once, with an unbulleted line
  `GPT26-SEAL kind=gate set_id=<id> set_digest=<64hex> key_sha256=<64hex>` and the owner's
  commitment not to view outputs before its commit or inspect the key while rating. The private
  key binds the six-slot registration, run snapshot, transformed images, pass order and controls.
  Refuse to overwrite an existing seal or silently regenerate a sealed mapping.

**Contract**: the manifest schema is the S-20 viewer's (`window.S20_SET`), so the viewer runs
with the limited adaptations below; its questions and scale remain unchanged. The digest is
computed as in `blind.set_digest`, without a self-referential embedded final-file hash. A sealed
empty manifest/key is valid only when reconciliation proves all six slots terminally undelivered;
it follows the no-ratings route rather than opening the viewer.

#### 2. Viewer copy

**File**: `context/changes/gpt-image-26-screen/references/compare-gpt26.html`

**Intent**: Copy `compare-s20.html` with the base path changed to
`../../../../test-photos/private/gpt26/` and the seal prefix changed to `GPT26-SEAL`. Add the
two-pass control: initially show only pass 1; after all its answers are complete, save a private
checkpoint and lock them before revealing pass 2. Disable earlier-pass navigation and edits
after reveal, including on reload/resume; export the original locked answers plus pass 2 as one
complete ratings file. A single nonempty pass needs no transition; zero images bypass the viewer.
Bind checkpoint/final export to the same seal digest and anonymous item IDs; reject mismatched
or changed first-pass answers. These are procedural recognition controls, not proof against
developer-tool inspection or recognition. State the residual repeated-Local risk in instructions.
The quality questions, fidelity questions and scale wording stay unchanged.

**Contract**: permitted changes are base path, seal prefix, pass visibility/answer locking and
checkpoint export/resume, plus the control instructions; a diff test enforces that allowlist
and unchanged questions/scale. Any added export fields are validated explicitly by the GPT26
gate and do not change the archived S-20 viewer or its export schema.

#### 3. Gate

**File**: `scripts/gpt26/gate.py`

**Intent**:

- **CLI:** `gate.py --set <id> [--export <ratings.json>]`. It verifies:
  - the dedicated seal and ratings are tracked, committed and clean; the seal has exactly one
    touching commit, strictly before every ratings commit (`scripts/s20/evidence.py`);
  - a GPT26-specific parser accepts exactly one unbulleted, well-formed `GPT26-SEAL` line;
    the default S-20 `read_seal` parser is unchanged and is not used for this new prefix;
  - the digest and key hash match the seal;
  - `state.py` independently reconciles all six series slots and all attempts/terminal states,
    recomputes conservative spend, detects persistent bound breaches and verifies the frozen
    ledger/state bindings, PNG validity and resized source-to-presentation transformations;
  - expected slot identities and key pairs form an exact, duplicate-free mapping, so six rows
    cannot hide a missing slot or a repeated comparison;
  - any locked first-pass checkpoint matches the final export and sealed pass partition;
    with two sealed passes the private checkpoint is required, and its absence is BLOCKED
    (owner decision 2026-11-20);
  - every delivered pair is rated, with no `uncertain` and no missing crop/reason.
- **Verdict:** applies the gate block from the config and writes `evaluations/verdict.md` and
  `evaluations/verdict.json`.
- **Verdict content:**
  - reasons, kept separate: "not delivered: S17-07/1" vs "fidelity: significant on S17-04/2";
  - a per-pair table, with undelivered slots marked "nieoceniona";
  - separate visual and budget/protocol failure reasons, conservative reserved spend versus
    known billed cost, unknown attempts and any bound breach; never claim ≤ $1.50 if unproven;
  - quality, as a diagnostic;
  - the block summary, spend and wall-time p95, plus residual repeated-Local recognition risk.

**Contract**: `BLOCKED` (exit 1) for unresolved slots or incomplete/corrupt evidence, including
invalid ratings or later PNG tampering; no compliant PASS can be inferred from image ratings
alone. A consistent resolved record yields PASS/FAIL, with any budget/protocol breach forcing
FAIL separately from fidelity. With zero delivered slots, require the write-once committed seal
and complete terminal evidence, accept no ratings export, and produce FAIL with empty diagnostics
and all six fidelity entries "nieoceniona"; no ratings-history check applies when no ratings exist.
Errors pass through the S-20-style sanitised boundary and never print an arm name or source path;
post-rating verdict tables may identify scenes as required by the owner.

#### 4. Tests

**File**: `scripts/gpt26/tests/test_gate.py`

**Intent**: Synthetic sets. Cases:

- `six_pairs_two_per_scene`;
- `resized_to_gpt_size`;
- `local_hash_mismatch_refused`;
- `tie_rule_table` (all 16 level combinations);
- `three_of_six_fails`;
- `four_of_six_passes`;
- `significant_fails`;
- `blocked_slot_fails_gate`;
- `undelivered_is_unrated`;
- `fail_reasons_distinguished`;
- `diagnostics_do_not_change_verdict`;
- `uncertain_blocks`;
- `missing_evidence_blocks`;
- `ratings_before_seal_blocked`;
- `no_leak_in_output`;
- `viewer_diff_limited` (the explicit adaptation allowlist above).

Also test: six duplicate-free expected slot bindings; a duplicated slot hiding a missing slot;
PNG corruption/incorrect dimensions at gate time; zero-delivery sealed FAIL without export;
unresolved evidence BLOCKED; bound breach on first/last response and resume; frozen snapshot
tampering; source/transform hash and Lanczos tampering; controlled PNG chunks/ICC, equal A/B
lengths, mtimes and side-order writes; anonymous manifest/export; sanitised decoder/subprocess
exceptions on both stdout/stderr; malformed/duplicate GPT26 seals; same-commit seal/ratings;
seal replacement; later `change.md` lifecycle edits do not invalidate the dedicated seal;
incomplete history refusal; re-verification after a rebase preserving order. Synthetic viewer
checks cover hidden pass 2, lock-before-reveal, forbidden back-navigation/editing, checkpoint
integrity and reload/resume without unlocking. No real images or paid calls are used in tests.

**Contract**: the same unittest command as in Phase 2.

### Success Criteria:

#### Automated Verification:

- Gate and builder tests pass: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests` — not run: needs Phase 3 output
- S-20 suite still passes: `python3 scripts/gpt26/regression.py --suite s20 --revision HEAD` — not run: needs Phase 2 harness and committed Linux candidate; run also against the recorded pre-hook baseline. Original raw discovery at review: WSL exit 1, 50 tests/nine errors (four PIL, two NumPy, three legacy archive paths); native Windows adds encoding/symlink issues. Do not waive failures beyond the documented metadata overlay.
- Format check: `npm run format:check` — not run: needs Phase 3 output

#### Manual Verification:

- The owner opens the viewer on a synthetic set and confirms that the questions, the scale and the seal prompt match S-20 — surface: context/changes/gpt-image-26-screen/references/compare-gpt26.html

---

## Phase 4: Paid run (Linux host)

### Overview

The owner approves the spend; then the six slots are rendered once.

### Changes Required:

#### 1. Approval and run

**Files**: `context/changes/gpt-image-26-screen/change.md`, `context/changes/gpt-image-26-screen/evaluations/run.md`

**Intent**:

- The owner adds `- GPT26-SPEND cap_usd=1.50 decision=approved date=…` and commits it.
- Transfer committed code and full evidence history to Linux. Verify exact registration/rule
  identities, clean tracked files, the four metadata fixture hashes and passing before/after
  regression results on that host. Verify pinned input/Local bytes there; Windows checks alone
  cannot authorize this checkout. Then dry run, then the paid run.
- `run.md` records the runner summary verbatim: slots, attempts, block summary, spend, wall time
  per call and p95 vs 30 s, plus the request ids of any blocks.

**Contract**: no slot regenerated; `--resume` is used only to finish slots still unresolved after
an interruption, under the reconciler's attempt/cost limits. Unknown reservations remain charged
at their bound; a persistent bound breach stops all further sends. On crash or refusal, record
the observed state honestly and reconcile offline; do not mark the paid criterion passed or say
the cap held until evidence proves it. No subsequent retry may erase the failure.

### Success Criteria:

#### Automated Verification:

- (paid) Six slots resolved within the cap: `python3 scripts/gpt26/run.py --cap 1.50` — artifact: `context/changes/gpt-image-26-screen/evaluations/run.md` — not run: paid

#### Manual Verification:

- The owner confirms that `run.md` matches the runner output, and that spend is ≤ $1.50 — surface: context/changes/gpt-image-26-screen/evaluations/run.md

---

## Phase 5: Blind rating, verdict and record

### Overview

Seal, rate, compute the verdict, and update every live pointer.

### Changes Required:

#### 1. Seal, rating and verdict

**Files**: `context/changes/gpt-image-26-screen/evaluations/gate-sealed.md`, `context/changes/gpt-image-26-screen/evaluations/ratings.json`, `context/changes/gpt-image-26-screen/evaluations/verdict.md`, `context/changes/gpt-image-26-screen/evaluations/verdict.json`

**Intent**:

- Build the set from complete reconciled state; commit the dedicated write-once
  `gate-sealed.md` before opening any outputs. The owner rates in the pre-registered two-pass
  sequence, saving/locking pass 1 before pass 2. Keep the checkpoint under `private/gpt26`;
  commit the complete anonymous ratings export strictly after the seal. Do not reveal the key.
- Run `gate.py` and commit the verdict.
- If any slot is undelivered, the delivered outputs are still rated as diagnostics, and the
  verdict stays FAIL.

- With zero delivered slots, commit the empty set's seal, omit the viewer and ratings file and
  run `python3 scripts/gpt26/gate.py --set gpt26-screen` to record FAIL from terminal evidence.
  The Manual rating row is then n/a with the zero-delivery evidence cited, never falsely checked.

**Contract**: `gate.py` checks file-history order. Preserve separate seal/ratings commits across
transfer and integration (no squash); run the offline gate again after integration. Future
`change.md` outcome/status edits do not touch the dedicated seal. The existing Progress 5.1
title retains its historical `(paid)` text because reviewed step titles are immutable; the
computation itself is offline/free and its Automated criterion below has no paid label.

#### 2. Pointers

**Files**: `context/foundation/roadmap.md`, `context/foundation/github-issues.md`, `idea-notes.md`, `temp_steps.md`, `context/changes/gpt-image-26-screen/change.md`, `scripts/gpt26/pointers.py`, `scripts/gpt26/tests/test_pointers.py`

**Intent**: Inventory live mentions with
`git grep -n -E 'gpt-image-26-screen|#359|Still not demonstrated' -- context/foundation idea-notes.md temp_steps.md`.
This is discovery, not a freshness assertion. Update only current status blocks in the same
outcome commit; leave dated historical status-log entries and unrelated proposals intact:

- the roadmap parked entry (l. 412) and the S-20/S-19 sequencing notes that mention this screen;
- the `github-issues.md` mapping row (l. 139) and a status-log row;
- the `idea-notes.md` success-criteria "Still not demonstrated" sentence.
- both `temp_steps.md` passages: the `## Teraz` numbered decision about doing #359 and the
  `## Kolejka` GPT26 entry ending with the now-stale planning instruction;
- this change's lifecycle status and outcome note, linked to the canonical verdict.

Create `pointers.py` as a block-scoped offline checker, patterned after S-20's selectors but
owned by GPT26. Select the exact current roadmap parked item, issue #359 mapping row,
`idea-notes.md` current quality-status clause, both GPT26 paragraphs in `temp_steps.md` and the
change's outcome note. Require each to link `evaluations/verdict.md` (resolved repo-relative),
state the same PASS/FAIL and reject that block's old current-status wording (`proposed`,
`Why parked`, `Draft`, the undecided Polish `zdecyduj, czy robimy`, `Potem /rune-plan` and the
obsolete wait-for-viewer instruction). Allow those words in historical logs and unrelated
blocks. Require a new dated issue-file status-log row linking this outcome, without rewriting
the 2026-11-05 opened record. A six-output PASS still opens only wider testing: the
`idea-notes.md` clause must retain that production quality remains unproven and Cloud stays paused.
Tests cover missing/renamed blocks, absent/wrong verdict links, contradictory status, each stale
phrase in its own block, and unrelated/historical proposals remaining valid.

Then **ask the owner** before commenting on issue #359.

**Contract**: `python3 scripts/gpt26/pointers.py` exits 0 only if every enumerated live pointer
and the appended log row agree with the canonical verdict, 1 for stale/missing outcome text and
2 for an unreadable file or missing/ambiguous selector. A grep match alone cannot pass it.

### Success Criteria:

#### Automated Verification:

- Verdict computed from committed, sealed ratings: `python3 scripts/gpt26/gate.py --set gpt26-screen --export context/changes/gpt-image-26-screen/evaluations/ratings.json` — artifact: `context/changes/gpt-image-26-screen/evaluations/verdict.md` — not run: needs Phase 4 terminal evidence and the owner's committed ratings; for zero delivered slots use the no-export command above. This is offline, not a paid operation.
- No stale status pointer: `python3 scripts/gpt26/pointers.py` followed by `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests` — not run: needs Phase 5 output; both must exit 0, including the pointer tests

#### Manual Verification:

- The owner rates all delivered pairs in the viewer (zero delivered: n/a under the explicit branch above) — surface: context/changes/gpt-image-26-screen/evaluations/ratings.json
- The owner reads the verdict and confirms that its reasons and the block summary are stated correctly — surface: context/changes/gpt-image-26-screen/evaluations/verdict.md
- The owner approves (or declines) the comment on issue #359

---

## Testing Strategy

### Unit Tests:

- Runner: retry/undelivered paths, cap refusal of the retry, request-field passthrough, and
  refusals before reservation; state reconciliation, crash/resume, cost-stop persistence and
  default S-19 compatibility (Phase 2).
- Gate: every Definitions row with degenerate data, i.e. the tie table, the 3/4-of-6 boundary,
  blocked slots, `uncertain`, missing evidence, seal order, zero delivered, transform integrity,
  two-pass controls and no metadata/error leaks (Phase 3). Pointer block selectors and honest
  status validation are covered in Phase 5.

### Integration Tests:

- The full S-19 and S-20 suites pass before/after on the recorded committed revisions in the
  same Linux environment, using the Phase 2 disposable-worktree fixture recipe. Record actual
  results; this host's missing packages and legacy-path failures are not a passing baseline.

### Manual Testing Steps:

1. Dry run on the Linux host, checking sizes and bounds.
2. Synthetic set in the viewer, checking the questions and the seal.
3. The real run, then the real rating, then the verdict.

## Performance Considerations

None beyond recording wall time per call (diagnostic, vs the ≤ 30 s p95 guardrail,
`context/foundation/roadmap.md:383`).

## Migration Notes

Not applicable. Nothing in production changes.

## References

- Change notes: `context/changes/gpt-image-26-screen/change.md`
- S-19 phase 5: `context/archive/2026-09-28-cloud-model-comparison/evaluations/phase5-tuning.md`
- S-20 gate: `context/archive/2026-11-03-cloud-classical-denoise/evaluations/step1-gate.md`, `scripts/s20/gate.py:265-292`
- Runner: `scripts/s19/run-candidate.py`

### Pointer checklist (Phase 5)

- `context/foundation/roadmap.md` GPT26 parked entry (currently line 412) and any other live
  S-19/S-20 sequencing text that actually mentions this screen; link the canonical verdict
- `context/foundation/github-issues.md` #359 mapping row (currently line 139), plus a new
  `## Status updates` row; retain the dated opened-on-2026-11-05 history
- `idea-notes.md` Success Criteria, current "Still not demonstrated (…)" clause; preserve the
  distinction between screening PASS and unproven production quality
- `temp_steps.md` `## Teraz` #359 decision paragraph and `## Kolejka` GPT26 parked/planning entry
- `context/changes/gpt-image-26-screen/change.md` status and outcome note, linking the verdict
- Issue #359 comment (after the owner's consent)

Every selected live block links the canonical verdict and agrees on its outcome; the offline
checker validates all of them. GitHub mutation remains outside that local check and needs the
owner's separate explicit consent. No archive status or dated historical entry is rewritten.

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append ` — <commit sha>` when a step lands. A Manual row takes ` — accepted at <full sha>` when a human confirms it. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vendor facts and pre-registration

#### Automated

- [x] 1.1 Config parses and prompt matches phase5 — 9d47635
- [x] 1.2 Series names exactly the six slots with phase-5 input hashes — 9d47635
- [x] 1.3 Prettier is clean on the new files — 9d47635

#### Manual

- [ ] 1.4 The owner reads vendor-facts and confirms the parameters match the 2026-11-05 decision
- [ ] 1.5 The owner reads the gate block and confirms it states their rules

### Phase 2: Runner for this screen

#### Automated

- [x] 2.1 Screen runner tests pass — d69ec55
- [x] 2.2 S-19 suite still passes — d69ec55
- [x] 2.3 Dry run on the Linux host lists 6 pending slots bounded ≤ $1.50 — d69ec55

#### Manual

- [ ] 2.4 The owner confirms the dry-run output on the Linux host

### Phase 3: Blind set builder and gate rule

#### Automated

- [x] 3.1 Gate and builder tests pass — 624ed60
- [x] 3.2 S-20 suite still passes — 624ed60
- [x] 3.3 Format check — 624ed60

#### Manual

- [ ] 3.4 The owner opens the viewer on a synthetic set and confirms it matches S-20

### Phase 4: Paid run (Linux host)

#### Automated

- [x] 4.1 (paid) Six slots resolved within the cap

#### Manual

- [ ] 4.2 The owner confirms run.md matches the runner output and spend ≤ $1.50

### Phase 5: Blind rating, verdict and record

#### Automated

- [ ] 5.1 (paid) Verdict computed from committed, sealed ratings
- [ ] 5.2 No stale status pointer

#### Manual

- [ ] 5.3 The owner rates all delivered pairs in the viewer
- [ ] 5.4 The owner reads the verdict and confirms reasons and block summary
- [ ] 5.5 The owner approves (or declines) the comment on issue #359
