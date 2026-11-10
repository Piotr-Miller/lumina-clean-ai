# S-20 Step 1 (1a: NLM) — Classical Denoise vs No-Denoise Control Implementation Plan

> Revised 2026-11-05 after the plan review
> (`context/changes/cloud-classical-denoise/reviews/plan-review.md`, verdict RETHINK, F1–F10).
> All ten findings were accepted by the owner and are fixed below. Re-review 2 (REVISE) added
> F11–F14, fixed within the same owner choices. The F-numbers in brackets mark where each one
> lands.

## Overview

Step 1a of `cloud-classical-denoise` (S-20, #347): find out offline whether OpenCV's
`fastNlMeansDenoisingColored`, run at full resolution before Local's Auto gamma, is a visible
improvement over the same image with Auto gamma alone, on the eight `s17-v2` tuning photos, without
losing scene information.

The plan builds:

- one shared decode of each input;
- two matched free arms;
- the NLM tool, with a grid fixed before any render;
- a blind pilot that picks one global strength;
- a blind 16-pair rating with separate quality and fidelity questions;
- a gate that answers PASS, FAIL or BLOCKED.

Each step refuses to run until the step before it is committed.

## Current State Analysis

- **The S-19 harness is reusable** for prepared inputs, Auto records and the holdout guard.
  - `scripts/s19/inputs.py` writes `test-photos/private/s19/inputs/<id>.json`.
  - `baseline.ts` wrote `local/<id>.auto.json`.
  - `local-arms.ts` re-checks every Auto record against its prepared input
    (`scripts/s19/local-arms.ts:122-140`).
  - `protocol.py check-access` passes for all eight tuning ids (exit 0; review, 2026-11-05).
- **The common input is a JPEG with an embedded ICC profile.** Example:
  `inputs/S17-03-common.jpg`, Pillow reports `JPEG RGB icc` (checked at planning). Sharp
  (libvips/libjpeg-turbo) and OpenCV each decode JPEG with their own library. Equal file hashes
  therefore do not guarantee equal decoded pixels. This plan decodes once and shares the pixels
  [F9].
- **The existing `control` arm is not a matched control (origin: `code`).**
  - It starts from the NAFNet input (`local-arms.ts:226-231`).
  - That input is downscaled on 5 of 8 tuning photos.
  - Hence the new `control-full` arm, and a correction in `change.md` (§ Owner decisions
    2026-11-05, item 1).
- **Real Local matches the common dimensions on 8/8 photos.** It is a JPEG, while the new arms
  are PNG. Byte copies would therefore reveal which side is which [F2].
- **Archived baselines cover 7 of 8 photos.** `references/s19-local/S17-01.jpg` was deliberately
  not published: the author/uploader rights gap is unresolved
  (`context/archive/2026-09-28-cloud-model-comparison/references/README.md:80-100`). Only its Auto
  record was published. The other seven private Local files are byte-identical to their archived
  copies (review, 2026-11-05) [F4].
- **`tally.py` cannot score this gate without relaxing its invariants (origin: `code`).** It
  requires paid ledger slots (`tally.py:113-147`). It accepts a control reference only for NAFNet
  (`:246-247`). It reads no fidelity field. Owner decision 2026-11-05: `tally.py` stays unchanged
  and S-20 gets a separate gate.
- **No committed blind-rating path exists.**
  - `compare-arms.html` (archived) uses `Math.random()` for sides, keeps identity-bearing state in
    localStorage (`:349-364`, `:647-693`) and asks one preference.
  - Phases 2–5 were rated on blind folders built with session code.
  - Kept from that page: side-by-side and flip modes, the synced 1:1 zoom and the brightened
    original (`:137-139`).
- **OpenCV's colour NLM works in Lab built from encoded values.**
  - `fastNlMeansDenoisingColored` converts 8-bit BGR with `COLOR_LBGR2Lab`.
  - It filters L with `h` and a/b with `hColor`, then converts back with `COLOR_Lab2LBGR`
    (OpenCV 4.13.0 `modules/photo/src/denoising.cpp:168-207`).
  - The prepared input is encoded sRGB (`inputs.py:6-9`). A noise estimate meant to scale `h`
    must therefore live in that same Lab space [F8].
- **`protocol.py`'s `CHANGE_DIR` is stale (`:58`).** The approval, freeze and validation paths
  fail loudly, and `close` crashes. Step 1 uses none of them. #359's paid runs will need a fix;
  this plan does not include one.
- **`protocol.require_access` checks ids, not files (`protocol.py:317-330`).**
  `check_paths` (`:353-382`) resolves symlinks and must guard every concrete path. That is the
  pattern of `viewer-inputs.py:86-100` [F3].
- **Environment.**
  - `/usr/bin/python3` is 3.15 with Pillow 12.3, and has no numpy, no pip and no `cv2`. Fedora
    offers `python3-opencv` 4.13.0.
  - Tests: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s19/tests` passes 85 tests
    (review, exit 0). tsx-driven tests need a short `TMPDIR`.

### Carried from predecessor

none — no Predecessor line

## Definitions

| Term                  | Decided meaning                                                                                                                                                                       | Origin                     | On degenerate data                                                                                                                                                                                                                    | Verified by                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Photo                 | One of the eight tuning ids S17-01…07, S17-21; one gate unit each                                                                                                                     | user (2026-11-03)          | A validation id, or a tuning id whose resolved path or symlink points into the holdout, is refused before any byte is read                                                                                                            | `test_*` read-trap tests [F3]                                             |
| Win                   | In the NLM vs `control-full` pair, NLM preferred slightly or clearly                                                                                                                  | user                       | `tie` is not a win. 6 wins + 1 loss + 1 tie = PASS on quality. 5 wins + 3 ties = FAIL. 8 ties = FAIL                                                                                                                                  | `test_gate.py` "6+1+1", "5+3", "8 ties"                                   |
| Quality vs real Local | The NLM vs Local pair's preference                                                                                                                                                    | user (diagnostic)          | Never counted. Eight Local wins cannot make up for a missing sixth control win                                                                                                                                                        | `test_gate.py` "Local cannot supply a win"                                |
| Fidelity loss         | Per side: `none`/`minor`/`significant`/`severe`/`uncertain`, judged against the original                                                                                              | user                       | No implicit default. A null, unknown or missing side is BLOCKED. `significant`/`severe` without a reason or a valid crop is BLOCKED                                                                                                   | `test_gate.py` schema and crop cases                                      |
| Crop                  | Integer source-pixel rectangle, half-open `[x, x+w) × [y, y+h)`, w, h ≥ 1, inside the image                                                                                           | plan (routine)             | `x=W−1, y=H−1, w=h=1` is valid. Zero or negative size, non-integer, non-finite or overflowing values are BLOCKED                                                                                                                      | `test_gate.py` crop boundary cases                                        |
| Photo's fidelity      | Worst substantiated rating of the NLM side across both pairs                                                                                                                          | user (2026-11-05)          | `minor` vs control + substantiated `significant` vs Local → FAIL. A severe loss on the reference side with `none` on every NLM side has no effect                                                                                     | `test_gate.py` "loss only in the Local pair", "reference loss diagnostic" |
| Uncertain             | Unresolved doubt about a loss or its severity                                                                                                                                         | user                       | **Any** side `uncertain` → BLOCKED. Output then names anonymous pair ids only: no counts, sides, arm names, `k` or paths                                                                                                              | `test_gate.py` leak test on stdout, stderr and files [F7]                 |
| Complete evidence     | Exactly 8 photos × {control-full, local}, each derived independently of the export and the key, each rated once, every binding verified                                               | user (2026-11-05)          | Missing, duplicated or unknown pair → BLOCKED. A key mapping two ids to one comparison → BLOCKED. No silent deduplication                                                                                                             | `test_gate.py` coverage cases                                             |
| Pilot vote            | Per photo, one blind choice among three anonymous strengths or `none improves on control`                                                                                             | user (2026-11-05)          | `none` counts for no strength. 2/2/1/3 → the weakest of the tied leaders. 0/0/1/7 → that `k`. 8×`none` → STOP. A duplicate or invalid label → BLOCKED                                                                                 | `test_pilot.py`                                                           |
| Committed seal        | A seal is **write-once**: exactly one commit ever touches its path, the file is clean at HEAD, and that commit is a strict ancestor of **every** commit touching the dependent record | user (2026-11-05, F1; F11) | Uncommitted, modified, replaced after rating (a second commit on the seal) or same-commit seal + ratings are refused. A freeze whose `k` differs from the recomputed current pilot, or any freeze when that pilot is STOP, is refused | `test_evidence.py` out-of-order cases [F1]                                |

## Desired End State

- `context/changes/cloud-classical-denoise/evaluations/` contains:
  - the premise and calibration records;
  - the pilot and gate seals, each committed before its rating;
  - both rating exports;
  - the pilot result and the frozen configuration;
  - `step1-gate.json` and `step1-gate.md` with a **PASS**, **FAIL** or **BLOCKED** verdict.
- After a terminal verdict, `evaluations/step1-audit/` adds the two keys, both manifests and every
  arm, NLM and decode record. These are JSON only; no image bytes are published [F10].
- `change.md`, `roadmap.md`, `temp_steps.md` and `github-issues.md` carry the verdict as a link
  to `step1-gate.md`.
- **Reproduction claim, narrowed [F10]:**
  - From a checkout alone, `gate.py --audit` re-derives the verdict from the committed export,
    published keys and records (metadata only).
    - **Holds only before the archive (impl review full, F1).** The tools hard-code
      `context/changes/cloud-classical-denoise/`, and the write-once check follows an exact
      `git mv`, so once the folder is archived the audit no longer runs on current master. Run it
      in a checkout of the commit before the archive commit:
      `git worktree add <dir> "$(git rev-parse <archive-commit>^)"`.
  - Full verification also re-hashes the presentation and source images. That needs the private
    workspace inventory listed in `step1-audit/README.md`: `test-photos/private/s19/{inputs,local,arms}`
    and `test-photos/private/s20/`.

### Key Discoveries:

- Arms built from an external output follow `local-arms.ts:140-216`: verify the source against
  its record, name it in `<id>.json` and apply `buildGammaLut`.
- `fixtures.World` (`scripts/s19/tests/fixtures.py:91-136`) gives synthetic manifests,
  `private/` and `change.md` behind the `S19_*` overrides. Scope tests already build temporary
  Git repositories (`test_protocol.py:308-364`). The new tests reuse both.
- The gamma is never re-implemented in Python (`local-arms.ts:2-4`).
- Rebase-merge rewrites commit SHAs. Seals therefore record content hashes, never commit SHAs.
  Ancestry is computed from history at check time.

## What We're NOT Doing

- No BM3D (1b). A FAIL or STOP leads to the open licence decision, not to a run.
- No change to `tally.py`, `compare-arms.html` or anything under `context/archive/`. No
  publication of S17-01's JPEG or of any image bytes.
- No repair of `protocol.py`'s stale `CHANGE_DIR` (#359's concern). No validation-release
  option in S-20 tools.
- No generic viewer framework and no #359 features.
- No step 2, 3 or 4 work: no tone mapping, chooser, timing guardrail or hosting. No holdout access
  and no paid call. No app or Local change.
- No per-photo tuning and no retuning after the gate.
- No claim that blinding resists recognition of identical visible content. The NLM output appears
  in both pairs of its photo, and the control appeared, labelled, in the pilot. This is an
  accepted limit of the owner's design [F2].

## Implementation Approach

Rules first, renders second, ratings last, each transition enforced by a committed seal [F1]:

| Order | Step                                                                                    | Refuses unless                                                                                                                                                                                           |
| ----- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Phase 1–4 code, the grid config and the calibration record are committed                | —                                                                                                                                                                                                        |
| 2     | `nlm.py` renders the grid (`--calibrate` is exempt: it produces the calibration record) | every file in `RULE_FILES` committed and clean: `scripts/s20/**/*.py` (tools, not tests), `scripts/s20/configs/nlm-grid.json`, `scripts/s19/local-arms.ts`, `scripts/s19/s19.ts`, the calibration record |
| 3     | `blind.py pilot` builds the pilot set                                                   | all 24 NLM and 32 arm records exist and verify; each NLM record's `implementation_sha256`, `config_sha256` and `opencv_version` equal the committed calibration bind line                                |
| 4     | Owner commits `pilot-sealed.md` (set digest + key sha256), **then** opens the viewer    | human control                                                                                                                                                                                            |
| 5     | Owner rates; `pilot-ratings.json` is committed                                          | —                                                                                                                                                                                                        |
| 6     | `pilot.py` decides                                                                      | `RULE_FILES` clean; the pilot seal is write-once and strictly precedes every commit of the ratings; the ratings are clean                                                                                |
| 7     | `pilot-result.json` + `nlm-frozen.json` are committed                                   | —                                                                                                                                                                                                        |
| 8     | `blind.py gate` builds the gate set                                                     | step 6 still holds; the freeze is write-once and clean; `k` recomputed from the current sealed pilot equals it, and a STOP pilot refuses any freeze                                                      |
| 9–11  | `gate-sealed.md` committed → rate → `gate-ratings.json` committed                       | same rule as 4–5                                                                                                                                                                                         |
| 12    | `gate.py` rules; on PASS/FAIL it writes the audit bundle                                | the whole chain: `RULE_FILES` clean; pilot seal ≺ pilot ratings ≺ freeze ≺ gate seal ≺ every gate-ratings commit, each seal and the freeze write-once; plus every binding                                |

"≺" means a strict ancestor commit. **Merge rule:** a PR carrying seals or ratings is merged by
rebase, never squash. Squash would fold a seal and its ratings into one commit, and the strict
order would then (correctly) refuse. Git history cannot prove that nobody opened a file early. "Open the viewer only after its seal
is committed, and only through the viewer" is an explicit human control, recorded in each seal
file.

New Python tools live in `scripts/s20/` and import `scripts/s19/protocol.py`. The decode and
both arms extend `scripts/s19/local-arms.ts`.

## Critical Implementation Details

- **Guard order [F3].** Before any open, stat, hash, copy, metadata read or decode of an image or
  image-bearing record:
  - `protocol.require_access(ids)`;
  - then `protocol.check_paths(paths, validation=False)` on every concrete resolved path,
    including nested record paths, originals, key paths and the Phase 0 probe input.
  - TypeScript uses `guard` + `guardPaths`.
- **BLOCKED leaks nothing [F7, F12].** `blind.py`, `pilot.py` and `gate.py` each have **one CLI
  boundary** in `main()`. It catches every exception, prints a sanitized line
  (`pair <id>: <reason class>`, or `set: <reason class>` before a trusted pair mapping exists)
  and exits 3. It **never re-raises**: no traceback and no chained context reach stderr.
  - Subprocess and native output (guards, tsx, OpenCV) is captured, never inherited, and is
    discarded on the BLOCKED path.
  - Rich internal diagnostics go only to a private log under `test-photos/private/s20/logs/`.
  - Ids echoed in output come only from the trusted manifest, never from the input being
    rejected.
  - No decoded report, audit file or temporary artifact is written before the verdict is
    terminal.
- **Short `TMPDIR`** (`TMPDIR=/tmp`) for tsx-driven tests.
- **Render time.** NLM at 21×21 search on 15–25 MP inputs takes minutes on CPU. Phase 0 times
  one render. This is not the step-4 guardrail measurement.

## Phase 0: Premise and environment

### Overview

Measure what the plan assumes, with no harness code. Each check's "if this fails" consequence is
written before it runs.

### Changes Required:

#### 1. Premise record

**File**: `context/changes/cloud-classical-denoise/evaluations/step1-premise.md`

**Intent**: a table of checks, each with its command, result and consequence if failed:

1. OpenCV and numpy import, with versions recorded. If missing, Phase 2 is blocked.
2. Common-input and real-Local dimensions agree on 8/8. On a mismatch, stop and write it into
   `change.md`.
3. Local baselines [F4]:
   - the seven published `local/<id>.jpg` equal `references/s19-local/<id>.jpg`;
   - S17-01 is bound to its private sha256, and its `local/S17-01.auto.json` to the archived
     `S17-01.auto.json`;
   - the absence of `S17-01.jpg` from the archive is recorded as expected.

   On a mismatch, stop.

4. **Declared exception to "no render before the rules":** one timed
   `fastNlMeansDenoisingColored` on S17-06's common input at h = hColor = 10, windows 7/21.
   - Path guards run first [F3].
   - The output goes to a temporary file, is deleted unopened and is never shown.
   - Only the wall time is kept.

   More than 10 min per render is reported, and the plan continues.

**Contract**: a Markdown table. The exception is stated in the record itself.

### Success Criteria:

#### Automated Verification:

- OpenCV is importable: `python3 -I -c "import cv2, numpy; print(cv2.__version__)"` — at planning: exit 1 — expected until the owner installs `python3-opencv`
- Holdout guard allows the eight tuning ids: `python3 -B scripts/s19/protocol.py check-access --ids S17-01 S17-02 S17-03 S17-04 S17-05 S17-06 S17-07 S17-21` — at review: exit 0, all eight allowed

#### Manual Verification:

- Owner installs OpenCV: `sudo dnf install python3-opencv`
- Owner reads the premise record and accepts it — surface: context/changes/cloud-classical-denoise/evaluations/step1-premise.md

---

## Phase 1: Shared decode and matched arms

### Overview

One decode, then two arms that provably differ only by the denoiser [F9].

### Changes Required:

#### 1. Decode and arms

**Files**: `scripts/s19/local-arms.ts`, `scripts/s19/s19.ts`

**Intent**: three new arms, with the existing arms unchanged.

- **`decoded`:** sharp decodes the common input into raw sRGB RGB and writes a lossless PNG with
  no ICC and no metadata to `test-photos/private/s20/decoded/<id>.png`. Its record holds
  `common_sha256`, `pixels_sha256` (sha256 of the raw RGB bytes), `dimensions` and the sharp
  version.
- **`control-full`:** the decoded PNG, verified against `pixels_sha256`, → Auto gamma, σ = 0.
- **`nlm-gamma --nlm-k <k>`:** the NLM record's output → Auto gamma. It verifies that the
  record's `decoded_pixels_sha256` equals the decoded record's, along with the output hash and
  the dimensions.

`--nlm-k` joins the valued flags in `s19.ts`. Every resolved path passes `guardPaths` before it
is read [F3].

**Contract**:

- Outputs: `arms/control-full/<id>.png` and `arms/nlm-gamma/k<k>/<id>.png`.
- Both arm records add `decoded_pixels_sha256`, `auto_file_sha256` (the Auto record file) and
  `lut_sha256` (the 256-byte LUT).
- `nlm-gamma` records `source: {kind: "nlm", record, record_sha256, output_sha256,
config_sha256, k}`.

#### 2. Tests

**File**: `scripts/s20/tests/test_arms.py`

**Intent**: drive tsx in the fixtures world. The cases:

- **Identity denoiser:** a fake NLM record whose output equals the decoded PNG makes `nlm-gamma`
  byte-identical to `control-full`.
- **Auto record changed between the two arm runs:** the records' `auto_file_sha256` differ, and
  the pair check (Phase 4) refuses.
- **Tampered input:** a tampered decoded PNG or NLM output is refused, and so is a pixels-hash
  mismatch.
- **Size mismatch** is refused.
- **Holdout read trap:** a tuning id whose sidecar path symlinks to a synthetic holdout file is
  refused before the read [F3].
- **Old arms** still render.

### Success Criteria:

#### Automated Verification:

- Arm tests pass: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests -p 'test_arms.py'` — not run: needs Phase 1 output
- S-19 harness tests still pass: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s19/tests` — at review: exit 0, 85 tests
- Typecheck passes: `npm run typecheck` — at planning: exit 0
- Lint passes: `npx eslint scripts/s19/local-arms.ts scripts/s19/s19.ts` — at planning: exit 0 (4 existing `no-console` warnings)

---

## Phase 2: NLM tool, grid and calibration

### Overview

The NLM renderer, with an estimator defined in the filter's own space [F8] and its whole
parameter space committed before any real render.

### Changes Required:

#### 1. Grid config

**File**: `scripts/s20/configs/nlm-grid.json`

**Intent**: freeze every parameter of 1a.

**Contract**:

- Input: the decoded PNG read with `cv2.imread(…, IMREAD_COLOR)`. That gives 8-bit BGR, and its
  RGB view must hash to `decoded_pixels_sha256`.
- Space: `cv2.cvtColor(bgr, COLOR_LBGR2Lab)` on 8-bit data, the conversion the filter itself
  applies.
- Estimator: Immerkær 1996 per channel. The kernel is `[[1,-2,1],[-2,4,-2],[1,-2,1]]`, computed
  in float64 on L, a and b. σ̂ = √(π/2)·Σ|I∗N| / (6(W−2)(H−2)). σ̂_L comes from L, and
  σ̂_ab = (σ̂_a + σ̂_b)/2.
- Mapping: `h = round(k·σ̂_L, 2)`, `hColor = round(k·σ̂_ab, 2)`. A non-finite or ≤ 0 value is a
  technical refusal: it is not a vote, and no ε is introduced afterwards.
- `k`: `[1.0, 1.5, 2.0]`, in that order.
- Windows: `templateWindowSize` 7, `searchWindowSize` 21.
- The grid is a **bounded hypothesis**, calibrated before freezing (item 3).
- The pinned OpenCV version, and a `decided` line citing this plan and the 2026-11-05 owner
  decision (F8).

#### 2. NLM renderer

**File**: `scripts/s20/nlm.py`

**Intent**:

- A real render refuses unless every `RULE_FILES` entry is committed and clean (order step 2)
  [F1, F11]. `--calibrate` and `--estimate-only` render nothing real and are exempt.
- For each id: `require_access` and `check_paths` first [F3]. Then it reads the decoded record
  and PNG, verifies the pixel hash, estimates σ̂ and renders every `k`.
- Writes `test-photos/private/s20/nlm/k<k>/<id>.png` plus a record.
- `--estimate-only` and `--calibrate` modes render nothing real.

**Contract**:

- Record fields: `id`, `k`, `sigma_hat_L`, `sigma_hat_ab`, `h`, `h_color`, the windows,
  `decoded_record`, `decoded_pixels_sha256`, `output_sha256`, `dimensions`, `config_sha256`,
  `opencv_version`, `implementation_sha256`, `rendered_at`.
- Output is RGB PNG with no metadata.
- Exit codes: 0 rendered, 1 refused, 2 usage. Each refusal names the subject and the way out.

#### 3. Calibration record

**File**: `context/changes/cloud-classical-denoise/evaluations/step1-calibration.md`

**Intent**: `nlm.py --calibrate` runs the estimator through the real 8-bit OpenCV path on seeded
synthetic fixtures (seed 20261105, 1024×1024). The fixtures and tolerances below are fixed now,
before anyone sees a calibration result [F14].

- **Noise injection space:** additive Gaussian noise N(0, σ²) is added in float to the 8-bit
  Lab L channel (and separately to a and b), then rounded and clipped to 0–255. σ ∈ {3, 8, 15}.
  The expected value is σ_eff = √(σ² + 1/12), which accounts for the rounding.
- **Flat fixture:** L = 128, a = b = 128. Tolerance: |σ̂ − σ_eff| / σ_eff ≤ 0.10.
- **Texture fixture:** L = 128 + 40·sin(2πx/16)·sin(2πy/24), with a = b = 128. Immerkær is known
  to over-read texture as noise, so the bias is recorded and tolerated up to
  (σ̂ − σ_eff) / σ_eff ≤ 0.35. A larger bias fails the calibration.
- **Conversion quantisation, measured, not bounded:** the 8-bit `COLOR_LBGR2Lab` →
  `COLOR_Lab2LBGR` round trip is run on the full grid `range(0, 256, 7)`³. The record keeps the
  maximum and the count of channels with |Δ| > 1, and pins the known counterexample BGR
  (35, 98, 238) → (35, 98, 234). These are facts of the treatment. They are never "fixed" by
  swapping in another conversion.
- **Dark ramps and clipping:** L from 0 to 40, and values near 0 and 255.
- **Recorded, not gated:** the idealised reference weight exp(−2σ²/h²) for each `k`. It is not
  the measured weight of any real patch.

If the flat or texture tolerance fails, the grid or the estimator is revised **here**, before item
1 is committed, never after a real render. The conversion measurement cannot fail the
calibration.

**Gated quantities and fixture path (owner decision 2026-11-05).** Each tolerance applies to
σ̂_L, σ̂_a and σ̂_b separately; σ̂_ab is recorded, and is implied by a and b. Each noisy 8-bit
Lab fixture is converted with `COLOR_Lab2LBGR` to 8-bit BGR, and the gated σ̂ comes from the
estimator's full path from there (`COLOR_LBGR2Lab` + Immerkær), as on a photo. The estimator on
the noisy Lab fixture itself, with no conversion, is recorded as an ungated diagnostic.

**Calibration binds the render (owner decision 2026-11-05).** The record carries one
machine-readable bind line naming the PASS, `nlm.py`'s sha256, `nlm-grid.json`'s sha256 and the
OpenCV version. A real render (item 2) is refused unless the committed record's bind line is a
PASS and all three match the current values.

Known limit: synthetic white noise does not reproduce correlated camera or JPEG noise. If the
calibration contradicts the grid, the grid is revised **here**, before item 1 is committed. Never
after a real render.

#### 4. Tests

**File**: `scripts/s20/tests/test_nlm.py`

**Intent**:

- estimator tolerance on synthetic noise;
- channel order: an asymmetric colour survives a pass with a no-op denoiser;
- mapping and refusals (σ̂ = 0 is refused and is not a vote);
- record fields;
- a tampered decoded PNG is refused;
- the read trap [F3];
- uncommitted or modified grid → refused;
- determinism: two renders give identical bytes.

### Success Criteria:

#### Automated Verification:

- NLM tests pass: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests -p 'test_nlm.py'` — not run: needs Phase 2 output
- Grid config holds the pre-registered values: `python3 -I -c "import json;c=json.load(open('scripts/s20/configs/nlm-grid.json'));assert c['k']==[1.0,1.5,2.0] and c['templateWindowSize']==7 and c['searchWindowSize']==21, c"` — not run: needs Phase 2 output
- Calibration runs on synthetic data only: `python3 scripts/s20/nlm.py --calibrate` — not run: needs Phase 2 output

#### Manual Verification:

- Owner confirms the grid and the calibration record before Phase 5 renders — surface: scripts/s20/configs/nlm-grid.json, context/changes/cloud-classical-denoise/evaluations/step1-calibration.md

---

## Phase 3: Blind sets, sealed keys and the viewer

### Overview

Presentation copies that carry no identity channel the plan can remove [F2], a set digest that
does not hash itself [F6], and an experiment-specific viewer with identity-free state [F7].

### Changes Required:

#### 1. Blind set builder

**File**: `scripts/s20/blind.py`

**Intent**:

- **Pilot mode:** per photo, the original, `control-full` labelled "kontrola", and the three
  `nlm-gamma` strengths as `X`/`Y`/`Z`. Labels are drawn with `secrets`.
- **Gate mode:** the 16 pairs, derived independently as 8 ids × {control-full, local}. The NLM
  side and the global pair order are drawn with `secrets`, and the ids are `p01`…`p16`. Phase 3
  builds the set construction only (owner decision 2026-11-05): gate mode reads `k` from
  `scripts/s20/configs/nlm-frozen.json` and checks only its shape. Phase 4 wires the step-8
  precondition of the order table into gate mode [F1].
- **Presentation copies [F2]:** every rater-facing image is re-encoded from decoded pixels,
  including the original and the JPEG Local. It is written with Pillow as RGB PNG, with no
  metadata, a fixed `compress_level` (0, stored, so that size depends on dimensions only; impl
  review phase 3, F2), one shared mtime, and a name built only from the item id and the side. The
  key records, per file: the source path and sha256, the presentation sha256, and a
  decoded-pixel sha256 equal for source and copy.
- **Set digest [F6]:**
  - `set_digest` = sha256 of the canonical manifest payload: UTF-8 JSON, sorted keys, separators
    `(",", ":")`, **excluding** the `set_digest` field.
  - The manifest file `manifest.js` (`window.S20_SET = …`) carries the payload plus `set_digest`.
    That is the only hash it carries.
  - The key carries the same digest, and the builder prints both the digest and the key's
    sha256.
- Every path passes the guards [F3].
- **Render provenance (impl review phase 2, F1):** both modes refuse an NLM record whose
  `implementation_sha256`, `config_sha256` or `opencv_version` differs from the bind line of the
  calibration record committed in this repository. `nlm.py`'s rule check runs against the
  test-only `S20_REPO` tree, so this is the first check that a render came from the committed
  rules, and it runs before any rating.

**Contract**:

- Payload: `{set_id, kind, items: [{id, photo, original: {src, dimensions}, images: {<label>:
{src}}}]}`.
- Key: `{set_id, kind, set_digest, built_at, items: {<id>: {photo, sides | labels, sources}}}`,
  in `test-photos/private/s20/<set_id>/.key-do-not-open.json`.
- A `set_id` is never reused. The builder refuses an existing directory.

#### 2. Viewer

**File**: `context/changes/cloud-classical-denoise/references/compare-s20.html`

**Intent**: an adaptation of the archived page's interaction code.

- **Kept:** side-by-side and flip modes, the synced 1:1 zoom and the brightened original.
- **Removed:** `Math.random()`, `candIs`, arm reveal, arm-derived ids and candidate/reference
  translation [F7].
- **Loading:** `?set=<set_id>` loads `test-photos/private/s20/<set_id>/manifest.js`.
- **Pilot mode:** one question per photo: `X`/`Y`/`Z`/`none improves on control`.
- **Gate mode:** per pair, quality (`A-clear`/`A-slight`/`tie`/`B-slight`/`B-clear`) and,
  separately, fidelity for A and for B. `significant`/`severe` requires at least one crop drawn
  on any pane, mapped to integer source pixels, plus a reason. A checklist shows what is
  missing.
- **State [F7]:**
  - The localStorage key is `s20:<kind>:<set_digest>`.
  - It stores only anonymous ids and answers, under a version number.
  - On load, it validates the schema and that every id is in the manifest. Corrupt or foreign
    state is discarded with a visible message, never merged.
- **Export:** a download that echoes `set_digest`.

**Contract**:

- Gate export: `{viewer: "compare-s20", version: 1, kind: "gate", set_id, set_digest, rated_on,
ratings: [{pair_id, quality, fidelity: {A: {level, crops: [{x, y, w, h}], reason}, B: {…}}}]}`.
- Pilot export: `{…, kind: "pilot", choices: [{item_id, photo, choice}]}`.
- No identity, `k`, path or source hash appears in either the state or the export.

#### 3. Tests

**File**: `scripts/s20/tests/test_blind.py`

**Intent**:

- **Manifest:** contains no arm name, `k`, record path or source hash.
- **Presentation files:** all PNG, metadata-free and decoded-pixel-equal to their sources. The
  JPEG Local leaves no JPEG signature.
- **Set digest:** it recomputes. A tampered payload fails, and a different key order gives the
  same digest.
- **Draws:** they come from `secrets` (patched).
- **Synthetic sets:** the test fixture builds a synthetic set in both modes; manual check 3.3 runs
  the viewer on them. The gate-build refusals moved to Phase 4 with the step-8 precondition (owner
  decision 2026-11-05).
- **Provenance refusals (F1):** in both modes, an NLM record whose `implementation_sha256`,
  `config_sha256` or `opencv_version` differs from the committed calibration bind.
- **Reuse:** an existing `set_id` is refused.
- **Holdout:** the read trap [F3].

### Success Criteria:

#### Automated Verification:

- Blind-set tests pass: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests -p 'test_blind.py'` — not run: needs Phase 3 output
- Viewer is formatted: `npx prettier --check context/changes/cloud-classical-denoise/references/compare-s20.html` — not run: needs Phase 3 output

#### Manual Verification:

- Owner checks the viewer on a synthetic set built by the tests' fixture, in both modes:
  - zoom, flip and the brightened original;
  - crop drawing, and the required fields for `significant`/`severe`;
  - export works.
    — surface: context/changes/cloud-classical-denoise/references/compare-s20.html

The round trip on a synthetic gate set moved to Phase 4's manual checks, because its step 2 needs
`gate.py` (owner decision 2026-11-05).

---

## Phase 4: Evidence state, pilot rule and gate rule

### Overview

Order enforcement [F1], both decision rules, the cross-arm binding check [F9] and the audit
bundle [F10], tested on synthetic data and committed before any real render.

### Changes Required:

#### 1. Evidence-state helper

**File**: `scripts/s20/evidence.py`

**Intent**: give every transition its preconditions.

- `RULE_FILES`: the explicit list from order step 2. `require_committed_clean(paths)`: the path
  is tracked, there is no diff against HEAD, and it is not untracked.
- `require_write_once(path)`: `git log --format=%H --follow -- <path>` lists exactly one commit.
  A seal or freeze touched a second time is refused, so a replaced seal cannot borrow its
  original's date [F11].
- `require_strictly_before(seal, dependent)`: the seal's only commit is a strict ancestor
  (`git merge-base --is-ancestor`, and not equal) of **every** commit in
  `git log --format=%H -- <dependent>`. Re-exported ratings after BLOCKED therefore stay legal,
  and an equal commit is refused.
- All results are computed at check time, so rebase-merged history still verifies.
- Each refusal names the file, the state found and the commit command that fixes it.

#### 2. Pilot tally

**File**: `scripts/s20/pilot.py`

**Intent**:

- Requires step 6 of the order table.
- Validates the export: the `set_digest` matches the seal and the manifest, every photo appears
  exactly once, and every label is valid. Duplicates are never deduplicated.
- Re-checks the provenance of every NLM record behind the key (`implementation_sha256`,
  `config_sha256`, `opencv_version` against the committed calibration bind; impl review phase 2,
  F1). A mismatch is BLOCKED.
- Decodes the export and applies the vote rule.
- Writes `evaluations/pilot-result.json`, and on a selection also
  `scripts/s20/configs/nlm-frozen.json`.

**Contract**:

- The freeze: `{k, grid_config_sha256, pilot_set_digest, pilot_key_sha256, pilot_export_sha256,
decided}`.
- Exit codes: 0 selected, 1 STOP, 3 BLOCKED (anonymous ids only), 2 usage.

#### 3. Gate

**File**: `scripts/s20/gate.py`

**Intent**: rule in a fixed order.

1. **BLOCKED** first [F7]. Any of:
   - an order or seal violation [F1];
   - a schema error, including a missing side, a null level, an unknown level or a legacy S-19
     export;
   - coverage that is not exactly the independently derived 16 comparisons;
   - a set digest or key hash mismatch;
   - any failed binding: presentation pixels against source; the source against its arm record,
     the NLM record, the decoded record and the frozen config; for `control-full` vs `nlm-gamma`
     of each photo, equal `decoded_pixels_sha256`, `auto_file_sha256` and `lut_sha256` [F9];
     each NLM record's `implementation_sha256`, `config_sha256` and `opencv_version` equal to the
     committed calibration bind (impl review phase 2, F1);
     Local against its private baseline hash;
   - an `uncertain` on any side;
   - a `significant`/`severe` level without a reason or a valid crop.

   The output then holds anonymous ids and reason classes only.

2. **FAIL**: fewer than 6 of 8 wins against `control-full`, or any photo's worst NLM fidelity is
   `significant` or `severe`.
3. **PASS** otherwise.

After PASS or FAIL it writes the decoded per-photo report:

- quality vs control and vs Local;
- NLM fidelity in each pair and the worst of the two;
- reference-side fidelity (diagnostic);
- crops and reasons;
- the audit bundle `evaluations/step1-audit/` with keys, manifests, records and a `README.md`
  listing the private inventory needed for full verification [F10].

`--audit` re-derives the verdict from the committed metadata without opening any image.

**Contract**:

- Outputs: `evaluations/step1-gate.json` and `step1-gate.md`.
- Exit codes: 0 PASS, 1 FAIL, 3 BLOCKED, 2 usage. The exit code is the signal; the report states
  the verdict, its subject and the way out.

#### 4. Pointer check

**File**: `scripts/s20/pointers.py`

**Intent**: check the S-20 status pointers block by block, not line by line [F13]. It selects
exactly these blocks and fails if any of them is missing:

- the `### S-20` section of `roadmap.md`, up to the next heading of the same **or higher** level
  (`#`, `##` or `###`) or EOF. S-20 is the last H3 before `## Backlog Handoff` [F15];
- its Backlog Handoff row (`| S-20 `);
- the `## Teraz` section of `temp_steps.md`;
- `change.md` § Sequence step 1.

In each block it requires a link to `evaluations/step1-gate.md` and none of the old wordings
(`not started`, `NIE rozpoczęte`, `proposed`, `on hold`, `planning`).

**Contract**: exit 0 when all pointers are current, 1 when one is stale (naming the file, the
block and the wording found), 2 on a read or parse error. Tests cover a stale status line that sits
apart from its heading and change id. A positive fixture mirrors the real layout, where the last H3
is followed by an H2: S-20 updated with its verdict link passes while S-15 keeps its `on hold` [F15].

#### 5. Gate-mode precondition (owner decision 2026-11-05)

**File**: `scripts/s20/blind.py`

**Intent**: wire order step 8 into the gate mode Phase 3 built. `blind.py gate` refuses unless
step 6 still holds, the freeze is write-once and clean, and `k` recomputed from the current sealed
pilot (`pilot.py`'s export validation, key decode and vote rule) equals the freeze's `k`; a STOP
pilot refuses any freeze [F1].

#### 6. Seal format, viewer seal check and Local baselines (owner decision 2026-11-06)

**Files**: `scripts/s20/blind.py`, `context/changes/cloud-classical-denoise/references/compare-s20.html`, `scripts/s20/configs/local-baselines.json`

**Intent**:

- **Seal files.** `blind.py` prints the whole seal file for the set it built: exactly one machine
  line `S20-SEAL kind=<kind> set_id=<set_id> set_digest=<hex> key_sha256=<hex>` plus the
  human-control statement. It never writes into the repository; the owner saves and commits it.
  `pilot.py`, `blind.py gate` and `gate.py` require exactly one valid `S20-SEAL` line; a missing,
  duplicated or malformed line is refused. The statement is a procedural commitment, not technical
  proof that nothing was opened earlier, and the seal file says so.
- **Viewer seal check.** Before showing any image, `compare-s20.html` asks for the committed
  `S20-SEAL` line and refuses unless its kind, `set_id` and `set_digest` equal the manifest's.
- **Local baselines.** `scripts/s20/configs/local-baselines.json` maps exactly the eight tuning ids
  to the sha256 of the exact bytes of the expected Local download: seven from the committed
  archive copies (`references/s19-local/<id>.jpg`), S17-01's from `evaluations/step1-premise.md`.
  It is written once from those sources, never from the downloads being checked. `gate.py` reads
  only this file, requires it committed and clean, and a missing entry or malformed sha256 is
  BLOCKED. A test compares exactly the eight ids and hashes with both sources.

#### 7. Tests

**Files**: `scripts/s20/tests/test_pointers.py`, `scripts/s20/tests/test_evidence.py`, `scripts/s20/tests/test_pilot.py`, `scripts/s20/tests/test_gate.py`, `scripts/s20/tests/test_blind.py`

**Intent**: one named case per Definitions row and per walkthrough row in the review
(`reviews/plan-review.md` § Independent degenerate walkthrough).

- **Evidence:** on temporary Git repositories:
  - an uncommitted seal, a dirty seal and a dirty freeze are each refused;
  - the reproduced bypass is refused: seal added, then ratings committed, then the seal replaced
    and committed [F11];
  - a seal and its ratings in the same commit are refused;
  - an uncommitted rule file blocks a real render, while `--calibrate` still runs;
  - a stale freeze from an earlier attempt is refused when the current pilot is STOP;
  - a re-exported ratings commit after the seal is accepted;
  - a rebase-style rewritten history still verifies.
- **Gate build refusals** (`test_blind.py`, moved from Phase 3, owner decision 2026-11-05): a
  missing freeze, an uncommitted freeze, or a freeze whose `k` differs from the recomputed pilot.
- **Pilot:**
  - 2/2/1/3 selects the weaker of the tied leaders, and 0/0/1/7 selects that `k`;
  - 8×`none` gives STOP;
  - a duplicate photo, an invalid label or a missing photo gives BLOCKED.
- **Gate quality:** 6+1+1 is PASS; 5+3 with eight Local wins is FAIL; 8 ties is FAIL.
- **Gate fidelity:**
  - a loss only in the Local pair is FAIL;
  - a severe loss on the reference side alone is PASS;
  - `significant` without a crop is BLOCKED;
  - crop boundaries: a valid 1×1 at the corner; zero, negative and overflowing sizes BLOCKED.
- **Gate coverage:** a duplicate plus a missing pair, a key mapping two ids to one comparison, a
  tampered presentation file, and an Auto record changed between arms are each BLOCKED.
- **Provenance (F1):** in `pilot.py` and `gate.py`, an NLM record whose `implementation_sha256`,
  `config_sha256` or `opencv_version` differs from the committed calibration bind is BLOCKED.
- **Leaks [F12]:** real CLI subprocesses of `blind.py`, `pilot.py` and `gate.py`, one per
  BLOCKED branch:
  - order or seal violation, schema error, key or hash mismatch, missing file, path-guard
    refusal, `uncertain`;
  - a malformed key that carries a path and an untrusted id.

  For each, scan stdout, stderr and every file created outside the private log for arm names,
  `k` values, private paths, untrusted ids and `Traceback`.
  - The promised sanitized BLOCKED reports (`step1-gate.json` and `step1-gate.md`, or
    `pilot-result.json`) **must exist**, and they hold only the verdict, trusted anonymous ids,
    reason classes and the way out.
  - **No** decoded report, key copy, audit bundle or identity-bearing temporary file may exist
    after a BLOCKED run [F16].

#### 8. Synthetic world for the manual checks (owner decision 2026-11-07)

**File**: `scripts/s20/tests/blind_fixture.py`

**Intent**: `publish` builds an eight-photo world, so the gate set has the 16 pairs `gate.py`
requires, and copies a pilot set, a gate set and the same pairs under a second `set_id` (round-trip
step 4) into `test-photos/private/s20/`, printing each viewer URL with its seal line. `publish --keep
<empty dir>` keeps the whole world (Git repository with rules, seals, pilot ratings and freeze;
manifest; sources; sets) and prints the exact commands for the round trip of manual check 4.3,
with every environment variable `gate.py` needs. `test_gate.PublishKeepTest` runs those printed
commands. Order: `--keep`, then the Phase 4 completion commit with its review fixes (they are rule
files, so they must be committed before any real render), then the owner's confirmations and 4.3,
then Phase 5.

### Success Criteria:

#### Automated Verification:

- Evidence, pilot and gate tests pass: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests` — not run: needs Phase 4 output

#### Manual Verification:

- Owner reads the two rules as coded and confirms they match the 2026-11-03/11-05 decisions before any render — surface: scripts/s20/pilot.py, scripts/s20/gate.py
- Owner runs the round trip on a synthetic gate set [F7] (moved from Phase 3, owner decision 2026-11-05): 1. rate, reload, and confirm the state is restored; 2. mark one pair `uncertain`, export, and confirm `gate.py` reports BLOCKED with only that pair's id; 3. resolve the pair, re-export, and confirm the other ratings are preserved and nothing is re-paired; 4. rebuild the set under a new `set_id` and confirm the old state is not offered — surface: context/changes/cloud-classical-denoise/references/compare-s20.html, scripts/s20/gate.py

---

## Phase 5: Pilot run and freeze

### Overview

Render the grid, run the blind pilot, freeze one `k` or STOP. Each step follows the order table.

### Changes Required:

#### 1. Renders and pilot evidence

**Files**:

- `context/changes/cloud-classical-denoise/evaluations/pilot-sealed.md`: the set digest, the key
  sha256 and the human-control statement.
- `context/changes/cloud-classical-denoise/evaluations/pilot-ratings.json`
- `context/changes/cloud-classical-denoise/evaluations/pilot-result.json`
- `scripts/s20/configs/nlm-frozen.json`

**Intent**:

1. Decode the 8 photos.
2. Render `control-full` (×8), NLM (×24) and `nlm-gamma` (×24).
3. Build `pilot-1`.
4. Commit the seal, rate, commit the ratings.
5. Run `pilot.py`, then commit the result and the freeze.

On STOP: write it into `change.md` (1a failed: no strength preferred over the control), publish
the pilot audit (key, manifest, records) and end the plan.

### Success Criteria:

#### Automated Verification:

- Inputs decode: `npx tsx scripts/s19/local-arms.ts decoded --all` — not run: writes
- Grid renders: `python3 scripts/s20/nlm.py --all` — not run: writes
- Arms render: `npx tsx scripts/s19/local-arms.ts control-full --all`, and `npx tsx scripts/s19/local-arms.ts nlm-gamma --all --nlm-k <k>` for each `k` — not run: writes
- Pilot set builds and prints its digest and key hash: `python3 scripts/s20/blind.py pilot --set pilot-1` — not run: writes
- Pilot rule decides: `python3 scripts/s20/pilot.py --set pilot-1 --export context/changes/cloud-classical-denoise/evaluations/pilot-ratings.json` — not run: needs Phase 5 rating

#### Manual Verification:

- Owner commits the pilot seal before opening the viewer, then rates the 8 photos and exports — surface: context/changes/cloud-classical-denoise/evaluations/pilot-sealed.md, context/changes/cloud-classical-denoise/evaluations/pilot-ratings.json
- Owner accepts the pilot result (selected `k`, or STOP) — surface: context/changes/cloud-classical-denoise/evaluations/pilot-result.json, scripts/s20/configs/nlm-frozen.json

---

## Phase 6: Gate run and verdict

### Overview

The 16-pair blind gate on the frozen configuration, then the verdict, the audit bundle and every
pointer.

### Changes Required:

#### 1. Gate evidence

**Files**:

- `context/changes/cloud-classical-denoise/evaluations/gate-sealed.md`
- `context/changes/cloud-classical-denoise/evaluations/gate-ratings.json`
- `context/changes/cloud-classical-denoise/evaluations/step1-gate.json`
- `context/changes/cloud-classical-denoise/evaluations/step1-gate.md`
- `context/changes/cloud-classical-denoise/evaluations/step1-audit/`

**Intent**:

1. Build `gate-1` from the frozen `k`'s existing renders. Nothing is re-rendered.
2. Commit the seal, rate, commit the ratings.
3. Run `gate.py`.

On BLOCKED, the owner resolves the listed ids in the same set: against the original, with
identities still hidden. The owner then re-exports, commits the export and re-runs the gate.
After PASS or FAIL, commit the report and the audit bundle.

#### 2. Pointer set (lesson "Writing a fact into its canonical home leaves every pointer stale")

**Files**: `context/changes/cloud-classical-denoise/change.md`, `context/foundation/roadmap.md`, `temp_steps.md`, `context/foundation/github-issues.md`

**Intent**: the pointers are:

- `change.md` § Sequence step 1;
- the S-20 body Status line and the Backlog Handoff row;
- `temp_steps.md` "Teraz";
- a `github-issues.md` Status-updates row.

Each links `step1-gate.md` and does not restate its numbers. Grep the old wording first.

**Contract**: a comment or label change on #347 is proposed to the owner, never posted unasked.

### Success Criteria:

#### Automated Verification:

- Gate set builds from the frozen config: `python3 scripts/s20/blind.py gate --set gate-1` — not run: needs Phase 5 output
- Gate verdict reproduces from committed evidence: `python3 scripts/s20/gate.py --set gate-1 --export context/changes/cloud-classical-denoise/evaluations/gate-ratings.json` — not run: needs Phase 6 rating
- Verdict re-derives from published metadata alone: `python3 scripts/s20/gate.py --audit context/changes/cloud-classical-denoise/evaluations/step1-audit` — not run: needs Phase 6 output
- No stale S-20 status pointer remains, each designated block linking the verdict: `python3 scripts/s20/pointers.py` — not run: needs Phase 4 output

#### Manual Verification:

- Owner commits the gate seal before opening the viewer, then rates the 16 pairs (quality and fidelity for both sides, crops and reasons where required) — surface: context/changes/cloud-classical-denoise/evaluations/gate-sealed.md, context/changes/cloud-classical-denoise/evaluations/gate-ratings.json
- Owner accepts the verdict and its decoded table — surface: context/changes/cloud-classical-denoise/evaluations/step1-gate.md
- Owner decides on the #347 comment and label change — surface: context/foundation/github-issues.md

---

---

# Step 1b — shift-invariant wavelet BayesShrink (extension, planned 2026-11-09)

> Owner decision: `change.md` § Owner decisions (2026-11-09, step 1b candidate). Phases 0–6 above
> are step 1a and stay as they are, Progress included; step 1b continues the numbering.

## 1b Overview

Step 1a's NLM failed its gate: 3 of 8 wins against `control-full` (6 required), five ties, and a
significant fidelity loss on S17-03 ([`evaluations/step1-gate.md`](evaluations/step1-gate.md)).
Step 1b replaces BM3D with one permissively licensed candidate and asks the same question with the
same rules: is shift-invariant wavelet BayesShrink, run at full resolution before Local's Auto
gamma, a visible improvement over Auto gamma alone on the eight `s17-v2` tuning photos, without
losing scene information? It is the last trial of step 1: a FAIL or a STOP closes step 1 as FAIL.

The plan reuses 1a's machinery as is: shared decode, `control-full`, sealed pilot, freeze, sealed
16-pair gate, audit. The new pieces are the renderer, its arm, and one seam that lets the tools
serve two trials without changing a byte of 1a's evidence.

## 1b Current State Analysis

- **The 1a harness is single-trial (origin: `code`).** Paths, arm names, record fields and the
  calibration bind are module constants: `scripts/s20/common.py:32-38`, `blind.py:71,83,164-176`,
  `gate.py:82-86`, `evidence.py:311-314`, `scripts/s19/local-arms.ts:94-99,387-390,513,538`.
- **1a's reproducibility rests on literal bytes (origin: `code`).**
  - The committed freeze embeds `pilot.py`'s `DECIDED` text; the audit compares the freeze with
    `freeze_doc(p)` (`gate.py:457`).
  - `step1-gate.json` holds keys such as `nlm_fidelity` and `worst_nlm_fidelity`, and the reason
    "significant or severe NLM fidelity loss" (`gate.py:262-278`); the audit requires an exact
    match (`gate.py:473`).
  - `gate.py` deletes its audit directory before writing (`:369-370, 407-408`), so a 1b run
    pointed at `step1-audit/` would destroy 1a's bundle.
  - `nlm.py`, `nlm-grid.json` and `step1-calibration.md` are bound by sha256; editing any of them
    breaks the 1a bind.
- **The viewer is trial-independent.** `compare-s20.html` contains no NLM reference; it checks
  `kind`, `set_id` and `set_digest`, and the digest is unique per set.
- **skimage, measured at planning (v0.26.0 source, read as data):**
  - `denoise_wavelet` thresholds each detail subband of each level with
    `var / sqrt(max(mean(c²) − var, eps))` (`src/skimage/restoration/_denoise.py:611-617, 763-768`),
    leaves the approximation untouched (`:793`) and defaults to `wavelet_levels = max_level − 3`
    (`:737-742`).
  - Its `convert2ycbcr=True` path treats a given σ as RGB noise (`:830-849, 993-997`); 1b does not
    use it (owner decision 2026-11-09).
  - `cycle_spin(max_shifts=3)` on a 2-D plane averages 16 shifts `(dy, dx) ∈ {0..3}²` with
    `np.roll`, which wraps around at the borders; it uses dask when dask is installed unless
    `workers` is pinned (`_cycle_spin.py:14-47, 147-171`).
- **Environment.** skimage and PyWavelets are not installed (Fedora offers
  `python3-scikit-image` 0.26.0 and `python3-pywt` 1.8.0). 1a's NLM took 13.31 s per photo on
  S17-06 at 24.5 MP with 8 threads (`evaluations/step1-premise.md`); 1b's time is unmeasured.

### 1b Carried from predecessor

none — no Predecessor line

## 1b Definitions

| Term                     | Decided meaning                                                                                                                                                                                                     | Origin                                    | On degenerate data                                                                                                                                        | Verified by                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Trial                    | `1a` or `1b`, one row of `scripts/s20/trials.py`; every S-20 CLI except the frozen `nlm.py` takes `--trial`, default `1a`                                                                                           | plan (owner choice of seam, 2026-11-09)   | An unknown trial is a usage error (exit 2). Omitting `--trial` behaves as before 1b, except that existing 1b rule files are also checked (F35)            | `test_trials.py` "1a defaults are literal", "unknown trial" |
| Strength `k`             | One global value from `[1.0, 1.5, 2.0]`; per non-constant plane the filter receives σ = k·σ̂_norm, σ̂_norm measured on the normalised plane                                                                           | user (2026-11-09)                         | A non-finite or ≤ 0 σ̂ on a **non-constant** plane is a technical refusal, never a vote (as 1a); a constant plane never reaches the estimator (row Plane)  | `test_wavelet.py` mapping and refusal cases                 |
| Plane                    | Y, Cb, Cr of `skimage.color.rgb2ycbcr` on the decoded PNG as float, each min–max normalised before filtering                                                                                                        | user (2026-11-09)                         | The constant-plane check runs **first**: a plane with max = min is copied unfiltered, with no normalisation and no σ̂, and its diagnostic cells are `null` | `test_wavelet.py` "constant plane"                          |
| Level                    | Wavelet decomposition level, **1 = finest** (PyWavelets lists details coarsest first); the count is skimage's default, `max(max_level − 3, 1)`                                                                      | plan (routine)                            | The record states the number of levels used                                                                                                               | `test_wavelet.py` "checkerboard lands in level 1"           |
| Orientation              | The three 2-D detail subbands of a level, by PyWavelets' keys `ad`, `da`, `dd`                                                                                                                                      | user (2026-11-09)                         | —                                                                                                                                                         | `test_wavelet.py` record fields                             |
| Set to 0 by thresholding | A detail coefficient that was nonzero before thresholding and is 0 after                                                                                                                                            | user (2026-11-09)                         | A coefficient already exactly 0 before (clipped black, flat areas) is counted in `already_zero` and never in the numerator                                | `test_wavelet.py` "already-zero corner"                     |
| Zeroed ratio             | Per plane × level × orientation: Σ set-to-0 / Σ nonzero-before, each summed over the 16 shifts                                                                                                                      | user (2026-11-09)                         | Σ nonzero-before = 0 → ratio `null`, never 0 or NaN                                                                                                       | `test_wavelet.py` "all-zero subband"                        |
| Shift                    | One of 16 `(dy, dx) ∈ {0..3}²`, applied with `np.roll` (wrap-around), as `cycle_spin` does                                                                                                                          | user (2026-11-09)                         | The 3 px at each border mix with the opposite edge; stated, not corrected                                                                                 | `test_wavelet.py` "observing pass reproduces skimage"       |
| 1b gate                  | Identical to 1a's rows _Win_, _Quality vs real Local_, _Fidelity loss_, _Crop_, _Photo's fidelity_, _Uncertain_, _Complete evidence_, _Pilot vote_ and _Committed seal_ above, with the wavelet arm in place of NLM | user (2026-11-03, 2026-11-05, 2026-11-09) | As in 1a. A 1b FAIL or STOP closes step 1 as FAIL; there is no third trial                                                                                | `test_gate.py`, `test_pilot.py` run for both trials         |

## 1b Desired End State

- `evaluations/step1b/` holds the premise and calibration records, the pilot and gate seals (each
  committed before its rating), both rating exports, the pilot result, `gate.json` and `gate.md`
  with a PASS, FAIL or BLOCKED verdict, and after a terminal verdict `audit/` (keys, manifests,
  records, no image bytes). `scripts/s20/configs/wavelet-grid.json` and `wavelet-frozen.json`
  hold the grid and the freeze.
- On PASS or FAIL, `gate.py --trial 1b --audit
context/changes/cloud-classical-denoise/evaluations/step1b/audit` re-derives the 1b verdict from
  metadata alone; on STOP, `pilot.py --trial 1b --audit` re-derives the STOP from the same folder
  (F30). It holds only before the archive, as for 1a (impl
  review full, F1).
- 1a still re-derives FAIL from `evaluations/step1-audit/`, and no 1a evidence file has changed.
- On a 1b FAIL: `change.md` § Sequence step 1 says step 1 closed as FAIL, and the four S-20
  pointers link `evaluations/step1b/gate.md`. On a 1b STOP: the same, linking
  `evaluations/step1b/pilot-stop.md`, with a pilot-only bundle in `step1b/audit/` (impl of
  plan review F22).

## 1b What We're NOT Doing

- No BM3D, no third denoiser, no retune after a 1b result and no per-photo strength.
- No TypeSafe Jev, no extended `auto-params.ts`, no write to the existing `local/<id>.auto.json`
  files, and no work in `local-jev-gate` (#348).
- No change to `nlm.py`, `nlm-grid.json`, `nlm-frozen.json`, `step1-calibration.md` or anything in
  `evaluations/` that 1a wrote; no change to `compare-s20.html`.
- No correction of the border wrap-around and no use of skimage's `convert2ycbcr=True` path.
- No new renders of `decoded` or `control-full`: 1b reuses 1a's, verified against their records.
  If an S-19 input or Auto record has changed so that they no longer verify, 1b stops for an owner
  decision; nothing is re-rendered silently.
- No step 2–4 work, no holdout access, no paid call, no app or Local change, no patent search.

## 1b Implementation Approach

The order is 1a's order table with the trial named: rules first, renders second, ratings last,
each transition enforced by a committed seal.

| Order | Step                                                                                                         | Refuses unless                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Phases 7–10 committed: trial seam, arm, renderer, grid, calibration record                                   | —                                                                                                                                                                                                                                    |
| 2     | `wavelet.py` renders the grid (`--calibrate` exempt)                                                         | every rule file committed and clean (all `scripts/s20/**/*.py` outside `tests/`, both grids, both calibration records, `local-arms.ts`, `s19.ts`); the 1b calibration bind is a PASS for the current `wavelet.py`, grid and versions |
| 3     | `blind.py pilot --trial 1b`                                                                                  | all 24 wavelet and 24 `wavelet-gamma` records exist and verify, and 1a's 8 `decoded` and 8 `control-full` records still verify; each wavelet record's bind fields equal the committed 1b bind                                        |
| 4–7   | pilot seal committed → owner rates → ratings committed → `pilot.py --trial 1b` → result and freeze committed | as 1a steps 4–7                                                                                                                                                                                                                      |
| 8–11  | `blind.py gate --trial 1b` → gate seal committed → owner rates → ratings committed                           | as 1a steps 8–11                                                                                                                                                                                                                     |
| 12    | `gate.py --trial 1b` rules; on PASS or FAIL it writes `step1b/audit/`                                        | the whole 1b chain, as 1a step 12                                                                                                                                                                                                    |

The merge rule stands: a PR carrying seals or ratings is rebase-merged, never squashed.

## 1b Critical Implementation Details

- **1a literals.** Every string or key that 1a's committed files contain stays in the 1a row of
  `trials.py`, byte-identical. The 1a audit (`gate.py --audit …/step1-audit`, exit 1 = FAIL) is a
  success criterion of every 1b phase that touches a rule file, and it runs **after** that phase's
  commit: the audit refuses while any rule file is uncommitted, by design.
- **Rule files that do not exist yet** (plan review F17). A trial's grid and calibration record
  join `evidence.rule_files` only when they exist on disk or in the index, the rule the tools glob
  already follows (`evidence.py:53-71`). Before Phase 10 they are absent and no offence; once
  tracked, a deletion or edit blocks every tool as today.
- **Determinism.** `cycle_spin(..., workers=1)` on each 2-D plane (`channel_axis=None`), so the
  path never depends on whether dask is installed. Two renders give identical bytes.
- **Memory.** One float64 plane of 24.5 MP is ~196 MB; the 16-shift accumulation plus the
  wavelet coefficients put the peak at a few GB (estimate). Phase 7 measures it.

## Phase 7: Premise and environment for 1b

### Overview

Measure what the 1b plan assumes, with no harness code, and write each check's "if this fails"
consequence before it runs (lesson "A change's own cited evidence can be defective").

### Changes Required:

#### 1. Premise record

**File**: `context/changes/cloud-classical-denoise/evaluations/step1b/premise.md`

**Intent**: a table of checks, each with its command, result and consequence if failed.

1. scikit-image 0.26.0 and PyWavelets 1.8.0 import at exactly those versions; numpy and scipy
   versions recorded; whether dask is importable recorded. A version mismatch stops 1b until the
   owner decides.
2. The installed `skimage/restoration/_denoise.py` and `_cycle_spin.py` behave as the decision
   record cites: the BayesShrink threshold, untouched approximation, default level count,
   `_rescale_sigma_rgb2ycbcr` and the 16-shift `np.roll` enumeration. Checked by reading the
   installed files against the v0.26.0 tag sources. A difference (for example a Fedora patch)
   stops 1b and is written into `change.md`.
3. The 1a audit re-derives FAIL before any 1b change (the baseline for Phases 8–12).
4. **Declared exception to "no render before the rules":** one timed run on S17-06's decoded PNG
   at k = 1.0 with σ̂ computed as decided, the render and the observing pass timed separately,
   peak memory recorded.
   - Path guards run first.
   - The output goes to a temporary file and is deleted unopened; it is never shown.
   - Only times and peak memory are kept.

   More than 15 min per photo (render + observing pass) is reported, and the plan continues.

**Contract**: a Markdown table; the exception is stated in the record itself.

### Success Criteria:

#### Automated Verification:

- scikit-image and PyWavelets import at the pinned versions: `python3 -I -c "import skimage, pywt; assert (skimage.__version__, pywt.__version__) == ('0.26.0', '1.8.0'), (skimage.__version__, pywt.__version__)"` — at planning: exit 1 — expected until the owner installs the packages
- The 1a audit re-derives FAIL (exit 1 is the FAIL verdict): `python3 scripts/s20/gate.py --audit context/changes/cloud-classical-denoise/evaluations/step1-audit` — at planning: exit 1, "audit re-derives FAIL: 3 of 8 wins, k 1.0"
- Holdout guard allows the eight tuning ids: `python3 -B scripts/s19/protocol.py check-access --ids S17-01 S17-02 S17-03 S17-04 S17-05 S17-06 S17-07 S17-21` — at planning: exit 0

#### Manual Verification:

- Owner installs the packages: `sudo dnf install python3-scikit-image python3-pywt`
- Owner reads the 1b premise record and accepts it — surface: context/changes/cloud-classical-denoise/evaluations/step1b/premise.md

---

## Phase 8: Trial seam with 1a kept literal

### Overview

One table of per-trial values, threaded through every S-20 tool, so 1b reuses all of 1a's evidence
rules while every 1a output stays byte-identical.

### Changes Required:

#### 1. Trial descriptor

**File**: `scripts/s20/trials.py`

**Intent**: `TRIALS = {"1a": …, "1b": …}`. Each row holds the evidence paths (seals, ratings,
pilot result, gate JSON and Markdown, audit directory), the freeze, grid and calibration paths,
the treatment arm and raw-render directory, the record's source kind and key name, the bind tag
and bind fields, the report key prefix and reason wording, the `DECIDED` text, the seal statement
and the pointer target.

**Contract**:

- 1a: today's literals exactly — `EVAL` paths, `nlm-frozen.json`, raw dir `nlm`, arm
  `nlm-gamma` (matched in `gate.pairs_of`, `gate.py:79-86`), key fields `nlm_record` /
  `nlm_record_sha256`, quality values `nlm-slight` / `nlm-clear` (tested for a win,
  `gate.py:257,270`), bind fields `implementation_sha256` / `config_sha256` / `opencv_version`
  and no `trial=` token, `nlm_*` report keys, the current reason strings, `DECIDED`
  (`pilot.py:44`, embedded in the committed freeze) and the seal statement (impl of plan review
  F20).
- 1b: everything under `evaluations/step1b/`, `wavelet-grid.json`, `wavelet-frozen.json`, raw dir
  `wavelet`, arm `wavelet-gamma`, key fields `wavelet_record` / `wavelet_record_sha256`, quality
  values `wavelet-slight` / `wavelet-clear`, bind fields `implementation_sha256`,
  `config_sha256`, `skimage_version`, `pywt_version`, `numpy_version`, with `bind_trial` `1b`
  (F24); report keys `wavelet_*`.
- `bind_trial` must match exactly: absent for 1a, `trial=1b` for 1b; a bind line carrying another
  trial is refused (F24).
- `evidence.GRID_REL` and `evidence.CALIBRATION_REL` keep their names and 1a values, and
  `evidence.rule_files(root)` keeps its name and signature, because the frozen `nlm.py` reads all
  three (`nlm.py:98,221,536,545`; F18). Its result grows by the 1b files once they exist (F17,
  F27).

#### 2. Tools take `--trial`

**Files**: `scripts/s20/common.py`, `scripts/s20/evidence.py`, `scripts/s20/blind.py`, `scripts/s20/pilot.py`, `scripts/s20/gate.py`, `scripts/s20/pointers.py`, `scripts/s20/tests/blind_fixture.py`

**Intent**: replace the module constants with lookups in the selected trial row; `--trial`
defaults to `1a`.

- `evidence.rule_files` covers both trials' grids and calibration records **that exist on disk or
  in the index** (F17); a dirty 1b file then blocks 1a tools, as any dirty rule file does today.
- `blind.py`'s key `calibration_bind` uses the row's bind fields, not a hard-coded
  `opencv_version` (`blind.py:408`; F20).
- `blind_fixture.init_repo` copies only rule files that exist (F17); `test_nlm.py`'s copy list is
  left as it is, since the temporary repo's `rule_files` omits absent files (F28).
- **STOP path (F22):** `pilot.py --trial 1b` on STOP writes `evaluations/step1b/pilot-stop.md`
  (verdict STOP, counts, no identities beyond trusted ids) and a pilot-only bundle in
  `step1b/audit/` (pilot key, manifest, records; no images). 1a's pilot keeps today's behaviour.
- **`pilot.py --trial 1b --audit <bundle>` (F31):** `--set` and `--export` are not required in
  this mode; it runs `require_pilot_order` first, re-derives the decision from the bundle and the
  committed seal and ratings without opening an image, and compares it with the committed
  `pilot-result.json`. Exit 1 = re-derived STOP, 0 = re-derived SELECTED, 3 = BLOCKED, 2 = usage.
- **STOP files are current or absent (F32):** a 1b pilot run that does not end in STOP removes
  `pilot-stop.md` and the STOP bundle before writing, as the gate's BLOCKED writer does.
- **The gate never runs over a STOP (F29):** `gate.py --trial 1b` refuses without writing anything
  when `step1b/pilot-stop.md` is tracked, so it cannot delete the STOP bundle or leave a BLOCKED
  `gate.md`.
- `pointers.py --trial 1b` requires, in the four blocks and in addition to 1a's link, a link to
  `evaluations/step1b/pilot-stop.md` when the committed `pilot-result.json` says STOP, and to
  `evaluations/step1b/gate.md` carrying a PASS or FAIL verdict otherwise; the old wordings add
  "BM3D licence decision" (F22, F29).
- `nlm.py` is not edited (its sha256 is 1a's `implementation_sha256`).

**Contract**: exit codes, BLOCKED sanitising and the single CLI boundary are unchanged. A 1b run
never reads, writes or deletes a 1a path, and the reverse.

#### 3. Tests

**Files**: `scripts/s20/tests/test_trials.py`, `scripts/s20/tests/test_gate.py`, `scripts/s20/tests/test_pilot.py`, `scripts/s20/tests/test_blind.py`, `scripts/s20/tests/test_pointers.py`

**Intent**:

- the 1a row equals today's literals, field by field, each listed 1a value pinned (F20);
- `nlm` imports; `evidence.GRID_REL` and `evidence.CALIBRATION_REL` keep their 1a values;
  `rule_files` contains 1a's list and a 1b file only when it exists (F18, F27);
- after a synthetic STOP, `gate.py --trial 1b` refuses and writes nothing; `pointers.py --trial
1b` fails on a BLOCKED `gate.md` and on a missing `pilot-stop.md`; `pilot.py --audit` exits as
  its contract says; a later SELECTED or BLOCKED pilot removes the STOP files (F29, F31, F32);
- with the 1b grid and calibration absent, the 1a audit and the synthetic world still run; once
  they exist, an uncommitted one blocks (F17);
- a bind line with the wrong `trial=` (or a `trial=` on 1a's) is refused (F24);
- a synthetic 1b STOP writes `pilot-stop.md` and the pilot-only bundle, `--audit` re-derives it,
  and nothing in `step1-audit/` changes (F22);
- an unknown `--trial` exits 2;
- the existing pilot, gate and blind cases run for both trials on the synthetic world;
- a 1b BLOCKED run leaves `evaluations/step1-audit/` untouched, and a 1a run never touches
  `step1b/`;
- `pointers.py --trial 1b` fails on a block without the 1b link and passes when it is present.

### Success Criteria:

#### Automated Verification:

- S-20 suite passes, trial cases included: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests` — at planning: exit 0 (156 tests; the trial cases arrive in Phase 8)
- The 1a audit still re-derives FAIL after the seam, run after the phase commit: `python3 scripts/s20/gate.py --audit context/changes/cloud-classical-denoise/evaluations/step1-audit` — at planning: exit 1 (FAIL)
- No 1a evidence or 1a renderer file changed: `git diff --exit-code 3a3f491122ec7400a759842b8fd1667dff55f3c2 HEAD -- context/changes/cloud-classical-denoise/evaluations/step1-audit context/changes/cloud-classical-denoise/evaluations/step1-gate.json context/changes/cloud-classical-denoise/evaluations/step1-gate.md context/changes/cloud-classical-denoise/evaluations/step1-calibration.md scripts/s20/nlm.py scripts/s20/configs/nlm-grid.json scripts/s20/configs/nlm-frozen.json` (base: master after #365, the last commit carrying 1a evidence) — at planning: exit 0
- 1a pointers still current: `python3 scripts/s20/pointers.py` — at planning: exit 0

---

## Phase 9: Wavelet arm

### Overview

The `wavelet-gamma` arm, matched to `control-full` exactly as `nlm-gamma` is.

### Changes Required:

#### 1. Arm

**Files**: `scripts/s19/local-arms.ts`, `scripts/s19/s19.ts`

**Intent**: `wavelet-gamma --wavelet-k <k>` reads `test-photos/private/s20/wavelet/k<k>/<id>.png`
and its record, verifies the decoded-pixel hash, output hash and dimensions, and applies Local's
Auto gamma. Existing arms are unchanged. Every resolved path passes `guardPaths` first.

**Contract**:

- Output: `test-photos/private/s19/arms/wavelet-gamma/k<k>/<id>.png`.
- The record carries `decoded_pixels_sha256`, `auto_file_sha256`, `lut_sha256` and
  `source: {kind: "wavelet", record, record_sha256, output_sha256, config_sha256, k}`.
- `--wavelet-k` joins the valued flags in `s19.ts`, with `formatK`'s one-decimal rule.

#### 2. Tests

**File**: `scripts/s20/tests/test_arms.py`

**Intent**: the 1a cases, repeated for the wavelet arm: an identity denoiser gives a byte-identical
`control-full`; a changed Auto record makes the pair check refuse; a tampered render or
pixels-hash mismatch is refused; a size mismatch is refused; the holdout read trap; `nlm-gamma`
and the old arms still render.

### Success Criteria:

#### Automated Verification:

- Arm tests pass: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests -p 'test_arms.py'` — at planning: exit 0 (1a cases; the wavelet cases arrive in Phase 9)
- S-19 harness tests still pass: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s19/tests` — at planning: exit 0, 85 tests
- Typecheck passes: `npm run typecheck` — at planning: exit 0
- Lint passes: `npx eslint scripts/s19/local-arms.ts scripts/s19/s19.ts` — at planning: exit 0 (6 `no-console` warnings)
- The 1a audit still re-derives FAIL, run after the phase commit: `python3 scripts/s20/gate.py --audit context/changes/cloud-classical-denoise/evaluations/step1-audit` — at planning: exit 1 (FAIL)

---

## Phase 10: Wavelet renderer, grid, calibration and diagnostic

### Overview

The renderer, its estimator in its own space, the observing pass, and the whole parameter space
committed before any real render.

### Changes Required:

#### 1. Grid config

**File**: `scripts/s20/configs/wavelet-grid.json`

**Intent**: freeze every parameter of 1b, citing `change.md` § Owner decisions (2026-11-09, step
1b candidate).

**Contract**: input (the decoded PNG; its RGB bytes hash to `decoded_pixels_sha256`), space
(`rgb2ycbcr` on `img_as_float`, per-plane min–max normalisation), estimator (1a's Immerkær kernel
and formula, on each normalised plane), mapping σ = k·σ̂_norm (the normalised value the filter receives) with the same refusal rule as
1a, `k` `[1.0, 1.5, 2.0]`, filter (`denoise_wavelet`, `BayesShrink`, `soft`, `db1`,
`wavelet_levels` null, `rescale_sigma` false), spin (`cycle_spin`, `max_shifts` 3, `workers` 1,
`channel_axis` null), output (denormalise, `ycbcr2rgb`, clip to [0, 1], `rint(x·255)` to uint8 RGB
PNG without metadata), and the pinned skimage and PyWavelets versions.

#### 2. Renderer

**File**: `scripts/s20/wavelet.py`

**Intent**: `nlm.py`'s structure for the new filter.

- A real render refuses unless every rule file is committed and clean and the 1b calibration bind
  is a PASS for the current `wavelet.py`, grid and versions; `--calibrate` and `--estimate-only`
  render nothing real and are exempt.
- Per id: `require_access` and `check_paths` first; read and verify the decoded PNG; estimate;
  render every `k`; run the observing pass; write the PNG and the record.
- **Observing pass:** for each plane and each of the 16 shifts, roll the plane as `cycle_spin`
  does, take the same `wavedecn`, compute the same BayesShrink thresholds from the same σ, and
  count per level and orientation the coefficients set to 0, nonzero before, and already zero.
  It never feeds the output. Exactness rules (F25): it repeats skimage's own calls in order
  (`wavedecn` default mode and `max(dwtn_max_level − 3, 1)` levels, `mean(d·d)` with eps of the
  coefficients' dtype, `pywt.threshold(…, "soft")`, `_denoise.py:611-617,737-797`); "set to 0" is
  counted from `pywt.threshold`'s output, never from |c| ≤ T; the reconstruction is
  `waverecn(…)[original_extent].astype(dtype)` (`_denoise.py:794-795`), and any comparison with a
  shifted skimage result is made on the rolled plane, before the roll-back (F33).
- **Constant plane first (F21):** a plane with max = min is copied through before normalisation
  or estimation; only then does the σ̂ refusal apply.

**Contract**:

- Record fields: `id`, `k`, `sigma_hat` per plane (in `rgb2ycbcr` units) and `sigma` per plane (the normalised value passed to the filter; F34), `plane_range` per plane, `wavelet`,
  `levels`, `shifts`, `decoded_record`, `decoded_pixels_sha256`, `output_sha256`, `dimensions`,
  `config_sha256`, `skimage_version`, `pywt_version`, `numpy_version`, `implementation_sha256`,
  `rendered_at`, and `zeroed: {Y|Cb|Cr: {"<level>": {ad|da|dd: {set_to_zero, nonzero_before,
already_zero, ratio}}}}` with level `"1"` the finest.
- Exit codes: 0 rendered, 1 refused, 2 usage; each refusal names the subject and the way out.

#### 3. Calibration record

**File**: `context/changes/cloud-classical-denoise/evaluations/step1b/calibration.md`

**Intent**: `wavelet.py --calibrate` runs 1a's fixtures and tolerances, pre-registered here before
any result: seed 20261105, 1024×1024, σ ∈ {3, 8, 15}, σ_eff = √(σ² + r²), where r² is each
plane's own variance from rounding to 8-bit **RGB** (about 0.027–0.028 per YCbCr plane, computed
in the record, not 1/12; F34).

- Noise is added in float to the fixture's Y, Cb and Cr in `rgb2ycbcr` units, then the fixture is
  converted with `ycbcr2rgb`, rounded and clipped to 8-bit RGB, and the estimator runs its full
  path from there, as on a photo. `rgb2ycbcr` on float input already returns 8-bit units (Y
  16–235, `colorconv.py:482-484`), so σ̂ is reported as σ̂_norm × (plane max − min) in those
  units; the filter itself receives σ = k·σ̂_norm (F19).
- Flat fixture Y = Cb = Cr = 128: |σ̂ − σ_eff| / σ_eff ≤ 0.10. Texture fixture
  Y = 128 + 40·sin(2πx/16)·sin(2πy/24): (σ̂ − σ_eff) / σ_eff ≤ 0.35, one-sided. Each tolerance
  applies to Y, Cb and Cr separately.
- Dark ramp (Y 16 → 56) and near-clipping rows (Y 18, Y 233) are recorded, not gated; the
  estimator on the noisy YCbCr itself, with no conversion, is an ungated diagnostic.
- One bind line `S20-CALIBRATION trial=1b result=… implementation_sha256=… config_sha256=…
skimage_version=… pywt_version=… numpy_version=…`. A real render is refused unless it is a PASS
  for trial 1b and all five values match.

If a gated tolerance fails, the grid or the estimator is revised here, before the grid is
committed, never after a real render. Known limit: synthetic white noise does not reproduce
correlated camera or JPEG noise.

#### 4. Tests

**File**: `scripts/s20/tests/test_wavelet.py`

**Intent**:

- estimator tolerance on synthetic noise; mapping and refusals (σ̂ = 0 on a non-constant plane is
  refused);
- the render is deterministic (two runs, identical bytes) and changes a noisy fixture at k = 1.0
  (output ≠ input) (F25);
- the observing pass reproduces skimage: for one shift, reconstructing its thresholded
  coefficients equals `denoise_wavelet` on that rolled plane, compared before the roll-back
  (`_cycle_spin.py:147-151`; F25);
- a ±1 checkerboard fixture puts its detail in level `"1"` (F23);
- the diagnostic's degenerate cases: an already-zero corner is counted in `already_zero` only; an
  all-zero subband gives ratio `null`; a constant plane is copied unchanged with `null` cells and
  is not refused (F21);
- record fields; a tampered decoded PNG is refused; the read trap; an uncommitted or modified grid
  refuses a real render while `--calibrate` still runs; two renders give identical bytes;
- `pilot.py` and `gate.py` never read `zeroed` (a record with the field removed gives the same
  verdict on the synthetic world).

### Success Criteria:

#### Automated Verification:

- Wavelet tests pass: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests -p 'test_wavelet.py'` — not run: needs Phase 10 output
- Grid config holds the pre-registered values: `python3 -I -c "import json;c=json.load(open('scripts/s20/configs/wavelet-grid.json'));assert c['k']==[1.0,1.5,2.0] and c['filter']['method']=='BayesShrink' and c['spin']['max_shifts']==3, c"` — not run: needs Phase 10 output
- Calibration runs on synthetic data only: `python3 scripts/s20/wavelet.py --calibrate` — not run: writes
- The 1a audit still re-derives FAIL, run after the phase commit: `python3 scripts/s20/gate.py --audit context/changes/cloud-classical-denoise/evaluations/step1-audit` — at planning: exit 1 (FAIL)

#### Manual Verification:

- Owner confirms the 1b grid and calibration record before Phase 11 renders — surface: scripts/s20/configs/wavelet-grid.json, context/changes/cloud-classical-denoise/evaluations/step1b/calibration.md

---

## Phase 11: 1b pilot run and freeze

### Overview

Render the grid, run the blind pilot, freeze one `k` or STOP, following order steps 2–7.

### Changes Required:

#### 1. Renders and pilot evidence

**Files**:

- `context/changes/cloud-classical-denoise/evaluations/step1b/pilot-sealed.md`
- `context/changes/cloud-classical-denoise/evaluations/step1b/pilot-ratings.json`
- `context/changes/cloud-classical-denoise/evaluations/step1b/pilot-result.json`
- `scripts/s20/configs/wavelet-frozen.json`

**Intent**:

1. Render the wavelet grid (×24) and `wavelet-gamma` (×24). `decoded` and `control-full` are
   reused from 1a and verified, never re-rendered.
2. Build `pilot-1b`. The owner commits its seal, then opens it, rates the 8 photos and exports;
   the export is committed.
3. Run `pilot.py --trial 1b`; commit the result and the freeze.

On STOP: `pilot.py --trial 1b` writes `step1b/pilot-stop.md` and the pilot-only bundle (Phase
8, F22); commit both; write into `change.md` that 1b failed with no strength preferred over the
control and that step 1 closes as FAIL; update the pointer set as in Phase 12 item 2, linking
`pilot-stop.md`; end the plan.

### Success Criteria:

#### Automated Verification:

- Grid renders: `python3 scripts/s20/wavelet.py --all` — not run: writes
- Arms render: `npx tsx scripts/s19/local-arms.ts wavelet-gamma --all --wavelet-k <k>` for each `k` — not run: writes
- Pilot set builds and prints its digest and key hash: `python3 scripts/s20/blind.py pilot --trial 1b --set pilot-1b` — not run: writes
- Pilot rule decides: `python3 scripts/s20/pilot.py --trial 1b --set pilot-1b --export context/changes/cloud-classical-denoise/evaluations/step1b/pilot-ratings.json` — not run: needs Phase 11 rating
- Only on STOP, the STOP re-derives from published metadata alone (exit 1 = STOP): `python3 scripts/s20/pilot.py --trial 1b --audit context/changes/cloud-classical-denoise/evaluations/step1b/audit` — not run: needs Phase 11 output; `[-] — n/a: pilot selected` when a strength is frozen
- Only on STOP, every S-20 pointer links `pilot-stop.md`: `python3 scripts/s20/pointers.py --trial 1b` — not run: needs Phase 8 output; `[-] — n/a: pilot selected` when a strength is frozen

#### Manual Verification:

- Owner commits the 1b pilot seal before opening the viewer, then rates and exports — surface: context/changes/cloud-classical-denoise/evaluations/step1b/pilot-sealed.md, context/changes/cloud-classical-denoise/evaluations/step1b/pilot-ratings.json
- Owner accepts the 1b pilot result — surface: context/changes/cloud-classical-denoise/evaluations/step1b/pilot-result.json, scripts/s20/configs/wavelet-frozen.json

---

## Phase 12: 1b gate run, verdict and step 1 outcome

### Overview

Runs only when Phase 11 froze a strength. On a 1b STOP every Phase 12 row is marked
`[-] — n/a: 1b pilot STOP` (F30).

The 16-pair blind gate on the frozen strength, the verdict, its audit bundle, and the step 1
outcome in every pointer.

### Changes Required:

#### 1. Gate evidence

**Files**:

- `context/changes/cloud-classical-denoise/evaluations/step1b/gate-sealed.md`
- `context/changes/cloud-classical-denoise/evaluations/step1b/gate-ratings.json`
- `context/changes/cloud-classical-denoise/evaluations/step1b/gate.json`
- `context/changes/cloud-classical-denoise/evaluations/step1b/gate.md`
- `context/changes/cloud-classical-denoise/evaluations/step1b/audit/`

**Intent**: build `gate-1b` from the frozen `k`'s existing renders (nothing re-rendered); the owner
commits the seal, rates and the export is committed; run `gate.py --trial 1b`. On BLOCKED the owner
resolves the listed ids in the same set, re-exports, the export is committed and the gate re-runs.
After PASS or FAIL the report and the audit bundle are committed.

#### 2. Pointer set

**Files**: `context/changes/cloud-classical-denoise/change.md`, `context/foundation/roadmap.md`, `temp_steps.md`, `context/foundation/github-issues.md`

**Intent**: `change.md` § Sequence step 1, the S-20 Status line and Backlog Handoff row, and
`temp_steps.md` "Teraz" link `evaluations/step1b/gate.md` and state the step 1 outcome without
restating its numbers: on FAIL, step 1 closed as FAIL after 1a and 1b; on PASS, the free/paid
conversation and step 2. A `github-issues.md` Status-updates row records the verdict. That row
edits Progress 6.7's surface, so 6.7 goes stale by construction and is re-confirmed with 12.8.

**Contract**: a comment or label change on #347 is proposed to the owner, never posted unasked.

### Success Criteria:

#### Automated Verification:

- Gate set builds from the frozen config: `python3 scripts/s20/blind.py gate --trial 1b --set gate-1b` — not run: needs Phase 11 output
- Gate verdict reproduces from committed evidence: `python3 scripts/s20/gate.py --trial 1b --set gate-1b --export context/changes/cloud-classical-denoise/evaluations/step1b/gate-ratings.json` — not run: needs Phase 12 rating
- 1b verdict re-derives from published metadata alone: `python3 scripts/s20/gate.py --trial 1b --audit context/changes/cloud-classical-denoise/evaluations/step1b/audit` — not run: needs Phase 12 output
- The 1a audit still re-derives FAIL, run after the phase commit: `python3 scripts/s20/gate.py --audit context/changes/cloud-classical-denoise/evaluations/step1-audit` — at planning: exit 1 (FAIL)
- No stale S-20 pointer remains, each block linking the 1b verdict: `python3 scripts/s20/pointers.py --trial 1b` — not run: needs Phase 8 output

#### Manual Verification:

- Owner commits the 1b gate seal before opening the viewer, then rates the 16 pairs — surface: context/changes/cloud-classical-denoise/evaluations/step1b/gate-sealed.md, context/changes/cloud-classical-denoise/evaluations/step1b/gate-ratings.json
- Owner accepts the 1b verdict, its decoded table and the step 1 outcome — surface: context/changes/cloud-classical-denoise/evaluations/step1b/gate.md
- Owner decides on the #347 comment and label change, and re-confirms 6.7 — surface: context/foundation/github-issues.md

---

## Testing Strategy

### Unit Tests:

- `test_nlm.py`: the estimator in Lab, channel order, mapping and refusals, determinism, guards.
- `test_evidence.py`: transition order on temporary Git repositories, including rewritten history.
- `test_pilot.py` and `test_gate.py`: every Definitions row and every review walkthrough row as a
  named case; leak scans of every output channel.
- `test_blind.py`: no identity channel in the manifest or the presentation files, canonical
  digest, `secrets` source, refusals.

### Integration Tests:

- `test_arms.py` drives `local-arms.ts` through tsx: the identity denoiser gives a byte-identical
  control; the cross-arm Auto/LUT binding; the read traps.
- The S-19 suite (85 tests) re-runs to show the existing arms and parsing are unchanged.

### E2E Tests:

- None automated. The viewer is an offline rating tool outside the app. Its persistence round
  trip is a Phase 3 manual check against a synthetic set.

### Manual Testing Steps:

1. Viewer on a synthetic set: modes, zoom, the brightened original, crops, required fields,
   export.
2. Round trip: rate → reload → BLOCKED → resolve → re-export → a new `set_id` leaves no stale
   state.

## Performance Considerations

There are 24 NLM renders on 15–25 MP inputs on CPU, timed in Phase 0, plus one decode per photo.
That is acceptable offline. Product timing is step 4's question.

## References

- Change: `context/changes/cloud-classical-denoise/change.md` (§ Sequence; § Owner decisions 2026-11-03 and 2026-11-05)
- Review: `context/changes/cloud-classical-denoise/reviews/plan-review.md` (F1–F10, walkthrough)
- Predecessor harness: `scripts/s19/`; archive `context/archive/2026-09-28-cloud-model-comparison/` (`references/compare-arms.html`, `references/README.md:80-100`, `evaluations/phase4-curve.md`, `phase5-tuning.md`)
- OpenCV 4.13.0 `modules/photo/src/denoising.cpp:168-207`; Immerkær, "Fast Noise Variance Estimation", CVIU 1996, doi:10.1006/cviu.1996.0060

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append ` — <commit sha>` when a step lands. A Manual row takes ` — accepted at <full sha>` when a human confirms it. Do not rename step titles. See `references/progress-format.md`.

### Phase 0: Premise and environment

#### Automated

- [x] 0.1 OpenCV is importable — 7ad9b1e
- [x] 0.2 Holdout guard allows the eight tuning ids — 7ad9b1e

#### Manual

- [x] 0.3 Owner installs OpenCV — accepted at f8cdf6ec7c426ad1e5895908836834c967db1b40
- [x] 0.4 Owner reads the premise record and accepts it — accepted at f8cdf6ec7c426ad1e5895908836834c967db1b40

### Phase 1: Shared decode and matched arms

#### Automated

- [x] 1.1 Arm tests pass — 227a269
- [x] 1.2 S-19 harness tests still pass — 227a269
- [x] 1.3 Typecheck passes — 227a269
- [x] 1.4 Lint passes — 227a269

### Phase 2: NLM tool, grid and calibration

#### Automated

- [x] 2.1 NLM tests pass — f4e880b
- [x] 2.2 Grid config holds the pre-registered values — f4e880b
- [x] 2.3 Calibration runs on synthetic data only — f4e880b

#### Manual

- [x] 2.4 Owner confirms the grid and the calibration record before Phase 5 renders — accepted at c85c5bba8f80575979ed872d9d0a804af1fbd130

### Phase 3: Blind sets, sealed keys and the viewer

#### Automated

- [x] 3.1 Blind-set tests pass — 2fe96a5
- [x] 3.2 Viewer is formatted — 2fe96a5

#### Manual

- [x] 3.3 Owner checks the viewer on a synthetic set in both modes — accepted at c85c5bba8f80575979ed872d9d0a804af1fbd130

### Phase 4: Evidence state, pilot rule and gate rule

#### Automated

- [x] 4.1 Evidence, pilot and gate tests pass — 234db78

#### Manual

- [x] 4.2 Owner confirms the coded rules match the decisions before any render — accepted at c85c5bba8f80575979ed872d9d0a804af1fbd130
- [x] 4.3 Owner runs the round trip on a synthetic gate set — accepted at c85c5bba8f80575979ed872d9d0a804af1fbd130

### Phase 5: Pilot run and freeze

#### Automated

- [x] 5.1 Inputs decode — f311a66
- [x] 5.2 Grid renders — f311a66
- [x] 5.3 Arms render — f311a66
- [x] 5.4 Pilot set builds and prints its digest and key hash — f311a66
- [x] 5.5 Pilot rule decides — f311a66

#### Manual

- [x] 5.6 Owner commits the pilot seal before opening the viewer, then rates and exports — accepted at c85c5bba8f80575979ed872d9d0a804af1fbd130
- [x] 5.7 Owner accepts the pilot result — accepted at c85c5bba8f80575979ed872d9d0a804af1fbd130

### Phase 6: Gate run and verdict

#### Automated

- [x] 6.1 Gate set builds from the frozen config — 37bfd3f
- [x] 6.2 Gate verdict reproduces from committed evidence — 37bfd3f
- [x] 6.3 Verdict re-derives from published metadata alone — 37bfd3f
- [x] 6.4 No stale S-20 status pointer remains — 37bfd3f

#### Manual

- [x] 6.5 Owner commits the gate seal before opening the viewer, then rates the 16 pairs — accepted at c85c5bba8f80575979ed872d9d0a804af1fbd130
- [x] 6.6 Owner accepts the verdict and its decoded table — accepted at c85c5bba8f80575979ed872d9d0a804af1fbd130
- [x] 6.7 Owner decides on the #347 comment and label change — accepted at c85c5bba8f80575979ed872d9d0a804af1fbd130

### Phase 7: Premise and environment for 1b

#### Automated

- [x] 7.1 scikit-image and PyWavelets import at the pinned versions
- [x] 7.2 The 1a audit re-derives FAIL
- [x] 7.3 Holdout guard allows the eight tuning ids

#### Manual

- [ ] 7.4 Owner installs the packages
- [ ] 7.5 Owner reads the 1b premise record and accepts it

### Phase 8: Trial seam with 1a kept literal

#### Automated

- [ ] 8.1 S-20 suite passes, trial cases included
- [ ] 8.2 The 1a audit still re-derives FAIL after the seam
- [ ] 8.3 No 1a evidence or 1a renderer file changed
- [ ] 8.4 1a pointers still current

### Phase 9: Wavelet arm

#### Automated

- [ ] 9.1 Arm tests pass
- [ ] 9.2 S-19 harness tests still pass
- [ ] 9.3 Typecheck passes
- [ ] 9.4 Lint passes
- [ ] 9.5 The 1a audit still re-derives FAIL

### Phase 10: Wavelet renderer, grid, calibration and diagnostic

#### Automated

- [ ] 10.1 Wavelet tests pass
- [ ] 10.2 Grid config holds the pre-registered values
- [ ] 10.3 Calibration runs on synthetic data only
- [ ] 10.4 The 1a audit still re-derives FAIL

#### Manual

- [ ] 10.5 Owner confirms the 1b grid and calibration record before Phase 11 renders

### Phase 11: 1b pilot run and freeze

#### Automated

- [ ] 11.1 Grid renders
- [ ] 11.2 Arms render
- [ ] 11.3 Pilot set builds and prints its digest and key hash
- [ ] 11.4 Pilot rule decides
- [ ] 11.5 Only on STOP, the STOP re-derives from published metadata alone
- [ ] 11.6 Only on STOP, every S-20 pointer links `pilot-stop.md`

#### Manual

- [ ] 11.7 Owner commits the 1b pilot seal before opening the viewer, then rates and exports
- [ ] 11.8 Owner accepts the 1b pilot result

### Phase 12: 1b gate run, verdict and step 1 outcome

#### Automated

- [ ] 12.1 Gate set builds from the frozen config
- [ ] 12.2 Gate verdict reproduces from committed evidence
- [ ] 12.3 1b verdict re-derives from published metadata alone
- [ ] 12.4 The 1a audit still re-derives FAIL
- [ ] 12.5 No stale S-20 pointer remains, each block linking the 1b verdict

#### Manual

- [ ] 12.6 Owner commits the 1b gate seal before opening the viewer, then rates the 16 pairs
- [ ] 12.7 Owner accepts the 1b verdict, its decoded table and the step 1 outcome
- [ ] 12.8 Owner decides on the #347 comment and label change, and re-confirms 6.7
