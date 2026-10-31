# S-19 Cloud Model Comparison Implementation Plan

## Overview

Decide whether a Cloud AI pipeline clearly beats the real Local engine on the `s17-v2` holdout:
at least 8 clear wins of 12, at most one moderate loss, zero severe regressions. Two candidates
remain: **GPT Image 2.5 as a direct edit**, and **NAFNet denoising plus a deterministic exposure
step**. The plan is an experiment, not a product change. It builds a fair, logged harness, spends
money only in small capped stages on tuning photos, freezes one automatic process, and opens the
holdout once. Production stays paused (`CLOUD_DAILY_CAP=0`). Shipping a winner is a separate
change.

## Current State Analysis

Settled by the frame (`frame.md`) and confirmed since:

- Production Cloud (Bread) fails because the gamma floor of 1.0 sits above every acceptable Bread
  setting (frame, hypothesis 2). At its best unreachable setting Bread still gets **0 clear wins,
  5 ties, 1 moderate loss, 1 severe regression** against Local in the owner's blind rating
  (`change.md` § Owner decisions after the frame). Bread is out (owner, 2026-10-31).
- Validation controls (S17-10, S17-18, S17-24) may be clear wins; the threshold stays 8/12
  (owner, 2026-10-29).
- Bread ignores the input ICC profile (`research.md` § Empirical half). Any candidate must get a
  colour-managed sRGB input.

Spike facts (`research.md` § Empirical half, `test-photos/private/s19-spike/*/meta.json`):

- **GPT Image 2.5** (`gpt-image-2.5-sunburst`, snapshot `2026-09-08`, `/v1/images/edits`, quality
  high): S17-04 → 2048 × 1536, S17-07 → 2304 × 1536, ≈ $0.08 and ≈ 40 s per call, no ICC profile in
  the PNG output. The edit prompt already asks to preserve every detail
  (`scripts/s19/feasibility.py:46-50`). There is no fidelity or exposure parameter. The size
  limits (edge ≤ 3840 px, 655,360–8,294,400 px, above 2560 × 1440 "experimental", `research.md`
  class B) apply to the **generated output** (`size`), not to the input file: the edit reference
  lists input formats and a < 50 MB limit
  (https://developers.openai.com/api/reference/go/resources/images/methods/edit, cited by the
  Codex plan review 2026-10-31), and the spike sent the 4032 px S17-04 and 5145 px S17-07
  originals without error. Owner's look: S17-04 "best version of this photo made", S17-07 "very
  good, a touch too bright".
- **NAFNet** (`fal-ai/nafnet/denoise`): denoise only, keeps size, the **fal service** rejects inputs
  over 3981 px a side, ≈ $0.0225 per MP (≈ $0.27 at 12 MP), 19 s. S17-04 was run at 3968 × 2976.
  The 3981 px cap is a property of the fal endpoint (its error names `max_width`/`max_height`);
  NAFNet itself is a fully convolutional network with no fixed input size (MIT code), so the cap
  is a hosting limit, not an architectural one. Self-hosting is out of scope here.
- **Local** (`src/lib/engines/local-engine.ts`): a CSS Gaussian blur, then a gamma LUT
  (`buildGammaLut`), with Auto values from `recommendParams` (`src/lib/engines/auto-params.ts`).
  Real Local downloads exist for seven tuning photos (`references/`); **S17-21 has none** (17 MB
  exceeds the browser tool's 10 MB upload, `references/README.md`).
  Those downloads used the source files and remain Phase 2 diagnostics. New gate baselines must
  be produced in the app from the same full-resolution prepared sRGB files as the candidates.
- The S-17 harness reads the v1 manifest (`scripts/s17/harness.ts:13`); S-19 code reads
  `test-photos/s17-benchmark-v2.json` instead.
- GPT inputs are not downscaled (largest tuning file: S17-21, 17 MB, under 50 MB). NAFNet inputs
  over 3981 px a side need a downscale: S17-04 (4032 × 3024), S17-05 (3072 × 4080), S17-06
  (5712 × 4284, EXIF orientation 6), S17-07 (5145 × 3431), S17-21 (6016 × 4000).

Origins: the 3981 px input cap and the GPT output-size limits are `product` (vendor documentation or error); "first valid
result" and the fidelity rules are `user`; the reproduction of Local's blur in node is a `code`
approximation used only for control arms, never as the reference Local.

### Carried from predecessor

none — no Predecessor line (S-17 decisions are already in `change.md` and `frame.md`).

## Definitions

| Term                                                | Decided meaning                                                                                                                                                                                                                        | Origin            | On degenerate data                                                                                                              | Verified by                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Content change                                      | Change of shape, geometry or layout of a recognisable element; added or removed object; changed lettering. Brightening, denoising, sharpening, clearer faces or texture are not. Counts only with a concrete crop "original → result". | user (2026-10-31) | New sharpness without a crop → not a content change. A sky lifted from overcast → judged on crops, not on tone.                 | Phase 2 viewer flag + crop note; Phase 3/5/7 ratings                         |
| Star change                                         | Adding, moving or removing an unambiguously recognisable star is a content change. Faintest points indistinguishable from noise vanishing: not automatically severe. A brightened existing star is not added.                          | user              | Point present only in the brightened original preview → existing, not added. Single bright-pixel differences ignored.           | Viewer's brightened-original toggle; Phase 5 aurora photos (S17-01/02/03/21) |
| Lettering change                                    | Changed letters, digits or essential stroke layout → severe regression. Unverifiable reconstruction → "unverified reconstruction": not severe by itself, never grounds for a clear win.                                                | user              | Original illegible at 100% and after brightening → "unverified reconstruction". Plausible word ≠ confirmed.                     | Viewer flag; S17-04, S17-05 crops                                            |
| Clear win / moderate loss / severe regression / tie | As `quality-bar.md`; severe now also includes a confirmed content change. A clear win cannot rest on an "unverified reconstruction".                                                                                                   | product + user    | Clear preference for Cloud but only via unverified text → not a clear win (tie at best).                                        | `scripts/s19/tally.py` mapping                                               |
| First technically valid result                      | The first API response for a photo whose file decodes and meets the frozen format and size requirements. Quality, content or exposure never justify regenerating.                                                                      | user              | API 5xx/timeout → retry within the frozen limit; persistent error → reported as a failure for that photo, counted, not dropped. | `attempts.jsonl` audit in Phase 7                                            |
| Frozen process                                      | One config (model snapshot, prompt, size, quality, input preparation, retry limit, or NAFNet endpoint, downscale and exposure curve parameters) hashed and recorded before validation; no per-photo choice.                            | user              | Two configs both promising → only one goes to validation.                                                                       | Phase 6 freeze record + hash check in Phase 7                                |
| Fair input                                          | EXIF orientation applied, embedded ICC converted to sRGB, downscaled only as far as the candidate's service requires, same preparation for every arm of one comparison.                                                                | frame + user      | Orientation-6 photo (S17-06, S17-24); ProPhoto/Adobe RGB photos (S17-03, S17-07, S17-21).                                       | Phase 1 input check                                                          |

The common input is a full-resolution oriented sRGB JPEG (quality 95, 4:4:4). The app's
unchanged Local engine and GPT receive that exact file; a required NAFNet downscale is part of
the candidate pipeline, shared byte-for-byte by its no-NAFNet control. Historical spike and Local
files do not satisfy this gate-input contract and remain diagnostics only.

**Auto source:** full-precision `LumaStats`, gamma and blur from the app's own
`sampleImageLuma` (canvas, longest edge ≤ 512 px) and `recommendParams`, sampled on the common
full-resolution input before any NAFNet downscale. `scripts/s17/auto-values.ts` is a cross-check,
not a replacement sampler. An unverified reconstruction flag alone does not prevent a clear
win: only its unverified legibility is excluded as a reason; an independent confirmed gain may
still qualify.

**Technical outcomes:** each planned replicate is a logical slot with bounded technical retries.
A slot without a valid image after its retry limit is `technical_failure`; one never sent because
of the budget is `not_attempted_budget`. Neither is dropped, relabelled a visual tie or called a
severe content regression. A complete gate needs a gradeable first result for every required
slot (including all nine GPT core slots); otherwise it returns STOP with an incomplete-data
reason. Denominators stay 8 for tuning and 12 for validation. This completeness prerequisite does
not change the agreed visual thresholds.

## Desired End State

A recorded decision, in `change.md` and `evaluations/`, of one of:

- **Pass:** the frozen finalist meets 8/12, ≤ 1 moderate, 0 severe on the holdout. Cloud stays
  paused; a separate change plans the production switch (Edge Function contract, ZDR decision,
  privacy policy, latency, retries).
- **Fail:** the finalist misses the bar; the result is recorded with its tally; Cloud stays paused.
- **Stopped before validation:** no candidate passed the tuning gate; the holdout stays unopened
  for a later attempt. This also covers missing/declined owner consent or a budget stop before
  opening the holdout; record which condition stopped it.
- **Inconclusive validation:** the holdout was opened, but budget exhaustion, technical failures
  or missing ratings prevent a complete assessment. Record all 12 slots, the partial tally and
  the cause; the exposed set is not available for another independent validation.

Every paid attempt is logged, every rating is exported from the blind viewer, and the holdout is
opened at most once.

### Key Discoveries:

- The spike already holds GPT on S17-04 and S17-07 and NAFNet on S17-04: three paid outputs that
  Phase 2 rates before any new money is spent.
- `scripts/s17/auto-values.ts` imports the app's own `recommendParams`; S-19 local arms reuse that
  pattern rather than re-implementing Auto.
- `references/compare-bread.html` is a working blind viewer (random A/B per photo, reveal after
  rating, display at the smallest arm's pixel size, Markdown export); the new viewer generalises
  it to N arms and fidelity flags.

## What We're NOT Doing

- No production change, no deploy, no change to `CLOUD_DAILY_CAP` (stays 0), no Edge Function
  work.
- No Bread tuning, no class C, no SCI / control-light / Nano Banana, no class-D chooser.
- No self-hosted NAFNet (would remove the 3981 px cap; separate decision if NAFNet wins).
- No tone-transfer fallback unless Phases 3/5 document fidelity violations (then it is planned as
  an amendment, not improvised).
- No best-of-N selection, no automatic judge, no regenerating for quality.
- No sending validation photos to any vendor and no viewing of their outputs before Phase 7, and
  Phase 7 only after the owner's explicit decision.
- No population-level claim: one rater, 12 photos, an internal gate (`quality-bar.md`).

## Implementation Approach

Cheapest evidence first: rate what is already paid for, then small paid batches on three tuning
photos with repeats, then extend only surviving arms to all eight tuning photos. Every arm of a
comparison gets the same input preparation. NAFNet's value is isolated by a free control (same
downscale, same gamma, no NAFNet). GPT's stability is measured on 3 × 3 repeats rated in full.
The finalist is frozen as a hashed config before the holdout is touched.

**Execution is separate from the quality verdict.** A valid report may contain PASS or STOP;
both are successful execution of the experiment. `tally.py` exits 0 for a structurally valid,
auditable report and 2 for invalid evidence (duplicates, mixed configs, absent required records).
Its JSON carries `verdict: PASS|STOP` and reasons. Consumers must inspect that field before
advancing; exit 0 alone never authorises another phase. Final visual STOP means Fail; incomplete
validation means Inconclusive. Missing records must be reconciled, never silently accepted as a
negative quality result.

**Closing on every branch.** Record the terminal outcome in
`context/changes/cloud-model-comparison/evaluations/outcome.md` and `change.md`, and update the
roadmap At-a-glance row and item body plus `temp_steps.md`, even when Phase 7 never runs. Record
the last completed phase, gate report, counts of attempts/technical failures/unattempted slots,
spend and unresolved cost reservations, consent status and whether the holdout was opened.
Remaining conditional Progress rows become `[-]` with ` — n/a: <condition and evidence>`; a
started or failed check is never hidden as n/a. Reaching a terminal scientific outcome completes
the experiment without turning STOP into PASS. This documentation edit grants no spending or
holdout consent.

### Budget (proposal; each paid phase needs its own owner consent)

| Phase          | Paid content                                                                                                                                                                  |                                                                    Estimate |                                         Cap |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------: | ------------------------------------------: |
| 1, 2, 4, 6     | harness, rating existing outputs, curve work, freeze                                                                                                                          |                                                                          $0 |                                          $0 |
| 3              | GPT: 3 new calls each on S17-03, S17-04, S17-07 at the standard size; one larger-size probe each on S17-04 and S17-07; NAFNet on S17-03, S17-04, S17-07 (new prepared inputs) |                                               ≈ $0.75 + $0.4 + $0.75 = $1.9 |                                          $3 |
| 5, standard    | carried standard GPT once on S17-01/02/05/06/21; NAFNet on those five                                                                                                         |                                                        ≈ $0.4 + $1.2 = $1.6 |                                          $3 |
| 5, large       | complete the selected large config's core (7 missing slots after the 2 probes), then the 5 remaining photos; NAFNet on those five                                             |                                  ≈ 12 × $0.20 + $1.2 = $3.6, before retries |                      **Amendment required** |
| 5, new prompt  | a fresh config: its own 9 core slots and 5 remaining photos; plus surviving NAFNet and any Phase 5 work already paid                                                          | ≈ 14 × $0.20 + $1.2 = $4 for large output, plus prior Phase 5 spend/retries | **Amendment if the $3 cap cannot cover it** |
| 7              | frozen finalist on 12 validation photos, retries included                                                                                                                     |                                GPT ≈ $1–2.4 (size-dependent); NAFNet ≈ $2.5 |                                          $5 |
| **Base total** | standard continuation, on top of the $0.56 already spent                                                                                                                      |                                                                      ≈ $4–6 |                      **$11 = $3 + $3 + $5** |

The alternative Phase 5 rows are branches, not additions to the standard row. An amendment must
state a numeric replacement Phase 5 cap `C5`, the exact config and remaining slots, prior Phase 5
spend/reservations, retry allowance, and the revised total `$3 + C5 + $5`. For illustration,
`C5 = $5` makes the total $13; it is not an approved budget or a guarantee that every retry fits.
A prompt change after spending on another config includes that earlier spend. No alternative
inherits approval merely because the plan describes it.

Per-call reference: GPT ≈ $0.08 at 2048 × 1536 high, output tokens scale with pixels (≈ 2.5× at
≈ 8 MP); NAFNet $0.0225/MP after downscaling to ≤ 3968 px.

**Hard cap.** The runner refuses to send a call when spent cost + calls of unknown status + the
estimated maximum cost of this call would exceed the phase cap. A timeout or a lost response is
logged as **unknown result, potential cost** (counted at the estimated maximum) before any retry is
considered; it never silently becomes a free retry.

All configs in a phase use one locked, persistent ledger, keyed by `--phase 3|5|7`, in
`test-photos/private/s19/attempts.jsonl`. `--cap` must match that phase's explicit owner-approved
numeric cap in `change.md`; restarting or switching config cannot reset it. Reserve the call's
maximum cost and write its attempt id before network access; reconcile by attempt id, so repeated
log events do not double-count. An interrupted in-flight attempt remains fully reserved.
Configs record the conservative per-call bound and its basis (input and output billing, size,
rounding); a measured average alone is insufficient. If a defensible bound cannot be established,
do not call the provider. The dollar figures in the table are planning estimates, not these bounds.
Dry runs require the intended cap and phase but do not spend, reserve or imply owner consent.
Before releasing the holdout, the sum of bounds for all 12 initial calls must fit within $5;
retries are additionally bounded by the frozen retry limit and remaining phase budget. A cap stop
is reported explicitly; it cannot trigger an unapproved top-up.

## Critical Implementation Details

- **Holdout guard.** Input preparation, the paid runner, local arms, baseline sampling and viewer
  manifest generation share `scripts/s19/protocol.py`'s metadata-only access check. Before reading,
  decoding, copying, displaying or uploading a validation photo or derivative they require the
  frozen config hash, a positive dated owner approval naming that hash, the vendor and terms,
  and a Phase 7 release record created by `protocol.py open-validation`. The release binds the
  manifest hash, config hash and one validation run id; `--validation --access <release.json>`
  is mandatory thereafter. A hash and flag alone never suffice. `--all` always means tuning;
  validation requires `--all-validation`. Absent or declined consent fails closed. Test this on
  synthetic photos, not the real holdout. Raw manual access outside the harness is prohibited by
  the protocol; a local file flag is not a security boundary against a person bypassing it.
- **Attempts, not successes.** The failure mode to catch is a call that never returns a gradeable
  image (Nano Banana's three 503s). Logs count attempts per photo in `attempts.jsonl`; a report
  built only from successful outputs would hide it (lessons: "A guard metric that only exists on
  success").
- **Presentation size, per pair.** Every gate decision compares one candidate with Local (or a
  NAFNet arm with its control) at the **smaller resolution of that pair**, never enlarging Cloud.
  Adding a ~3 MP GPT arm must not shrink the NAFNet comparison. A multi-arm overview view may
  exist as an aid, but it does not feed any gate. The native export (full-size file the user
  would download) is inspected separately and its resolution recorded (`quality-bar.md`).
- **One configuration per gate.** A gate counts results of a single config only. For every photo
  it counts the **first technically valid result** of that config; further repeats only measure
  stability and never replace it. A changed prompt or size is a new config that needs its own
  core series and all eight tuning photos.
  A core probe counts only as its original slot under the identical immutable config and input
  hashes. `--repeat 3 --resume` fills missing logical slots up to three per photo; it does not
  generate three more and cannot replace an earlier valid result. Only GPT needs the 3 × 3
  stability series; deterministic NAFNet arms reuse the same logged denoised outputs.

## Phase 1: Fair-input harness and blind viewer

### Overview

Build the free tooling every later phase uses: prepared inputs, local (non-paid) arms, a
paid-call runner with logging and a holdout guard, an N-arm blind viewer with fidelity flags, and
a tally script.

### Changes Required:

#### 1. Input preparation

**File**: `scripts/s19/inputs.py`

**Intent**: Produce, per tuning photo and target, the exact bytes a candidate receives: EXIF
orientation applied, ICC → sRGB, and a downscale only for NAFNet (≤ 3968 px, multiples of 16;
fal input cap 3981 px). GPT gets the full-resolution oriented sRGB file (output size is a request
parameter, not an input constraint; check the file is under 50 MB). Reads
`s17-benchmark-v2.json`.

**Contract**: writes `test-photos/private/s19/inputs/<id>-common.jpg` (quality 95, 4:4:4,
sRGB profile embedded) for both real Local and GPT; `<id>-nafnet.jpg` derives only from that
common file, with the downscale shared by NAFNet and its control. Sidecars record source and
prepared hashes, orientation, source profile, conversion and dimensions. `--check` re-derives
and compares hashes and checks expected oriented dimensions and the sRGB profile. Synthetic
orientation/ICC fixtures with independently specified expected pixels test correctness, rather
than treating reproducibility as proof of conversion. All modes call the common access guard;
`--all`/`--check` default to tuning. Only released Phase 7 access permits
`--validation --access <release.json> --config <finalist.json> --all-validation`.

#### 2. Local arms (free)

**File**: `scripts/s19/local-arms.ts`

**Intent**: Produce the non-paid arms by importing the app's `recommendParams` and
`buildGammaLut` (never re-implemented): (a) Local-equivalent at a given size (blur + Local gamma),
(b) downscale + Local gamma, no denoise — the NAFNet control, (c) NAFNet output + Local gamma,
(d) later the new exposure curve on NAFNet output and on Local's blur. Every arm reads the
full-precision app Auto record for the common full-resolution input, never a resampled NAFNet
output. It verifies the input hash and recomputes `recommendParams` from the saved `LumaStats`
to assert gamma/blur equality; missing or mismatched records stop rendering.

**Contract**: `npx tsx scripts/s19/local-arms.ts <arm> <id>…` → PNG files under
`test-photos/private/s19/arms/<arm>/<id>.png` plus a JSON with parameters. The blur reproduction
uses a Gaussian with σ = Local's `blur` px; `--compare-local` reports its mean absolute difference
against the new real Local downloads under `test-photos/private/s19/local/`, after the Auto
equality check, so the approximation is measured, not assumed. Local-equivalent and blur+curve
remain controls and can never occupy the real-Local reference slot. Validation modes use the
same access check and release arguments before touching photo bytes.

#### 3. Paid runner

**File**: `scripts/s19/run-candidate.py` (generalises `scripts/s19/feasibility.py`, which stays as
the spike record)

**Intent**: Run a named config (GPT or NAFNet) on named photos, `--repeat N`, writing every
attempt (phase, series id, immutable config hash, input hash, photo id, logical replicate slot,
attempt id/ordinal, request time, status, error, cost reservation, usage, output hash and size)
to the shared `test-photos/private/s19/attempts.jsonl`, retrying only
technical errors up to the config's limit, and enforcing the hard budget cap before each call
(Implementation Approach § Budget).

**Contract**: config files in `scripts/s19/configs/*.json` (model/snapshot, prompt, deterministic
aspect-to-size rule, quality/format requirements, input target, numeric retry limit/back-off,
per-call cost bound and basis). Create the initial GPT standard, GPT large and NAFNet configs
in Phase 1 so dry runs have actual configs; Phase 3 uses their recorded immutable hashes.
Series manifests in `scripts/s19/series/phase3.json`, `phase5.json` and `validation.json` list
the expected config hashes, photo ids and replicate slots; add the latter two before their runs
and fix their contents before looking at that series' results. Outputs under
`test-photos/private/s19/runs/<config>/<id>/<n>/`. Holdout guard as in Critical Implementation
Details. `--dry-run` prints planned/missing slots and bounded cost without network access.
`--phase`, `--series` and `--cap` are mandatory, including dry runs. Paid mode additionally
requires the phase's positive spending approval. `--resume` reuses completed slots by immutable
config/input hash, including probes from Phase 3, and never regenerates for quality. A completed
series with explicitly recorded terminal technical failures is a valid execution, not a successful
quality result; malformed config/ledger/access is an execution error. Bound retries and costs as
specified above; never inherit the spike runner's assumption that every error costs zero.
**Sizes, bounds and retries (owner decision 2026-10-31):** GPT standard ≤ 3,686,400 px and
large ≤ 8,294,400 px, each edge ≤ 3840 and divisible by 16, aspect kept as closely as rounding
permits, no cropping; each input's requested size is frozen in the series manifest before calls
and the returned size is recorded. Cost bounds are documented in each config and cover all
input/output charges and billing rounding; a response above its bound stops the runner, and no
call is made without a defensible bound. `max_retries = 1` per logical slot (two attempts),
transient technical failures only, no hidden client retries; timeout/unknown attempts stay
fully reserved, and a retry is admitted only within the remaining phase budget.
Each manifest also names prerequisite gate reports by path/hash and required PASS verdict;
the runner checks them before paid work (Phase 3 has no prior core prerequisite). Remaining
Phase 5 photos require the selected config's passing core report, and validation requires its
passing tuning report plus the separate access release. A valid STOP report with exit 0 never
satisfies these prerequisites. Dependencies are per stage/slot: completing the selected core
does not depend on that core's own future verdict.

#### 4. N-arm blind viewer

**File**: `context/changes/cloud-model-comparison/references/compare-arms.html`, `context/changes/cloud-model-comparison/references/README.md`, `scripts/s19/viewer-inputs.py`

**Intent**: Generalise `compare-bread.html` to the original plus N arms in a random order drawn
once per photo, revealed after rating. Per arm: preference against Local, a severe flag, a
content-change flag with a mandatory crop note "original → result", an "unverified
reconstruction" flag for lettering, and a mandatory reason for a clear preference, distinguishing
unverified lettering from an independent confirmed gain. A brightened-original toggle helps the star and lettering
checks. Gate ratings are pairwise: candidate vs Local (or NAFNet arm vs control), shown at the
smaller resolution of the pair; an optional overview of all arms does not feed the tally. A
separate "native export" tab shows each arm's own file at 100%.

**Contract**: `viewer-inputs.py` generates `arms.json` with split, series/config/input hashes,
attempt/slot/output ids, paths and release metadata (no embedded photos). It guards access before
reading any image and refuses validation without the Phase 7 release. HTML refuses a validation
manifest without matching release metadata before loading image URLs. Ratings/export retain
those ids, flags, reasons and crop notes. Images and generated manifests stay gitignored; README
describes the viewer and baseline provenance. Generated manifests must not enumerate validation
image paths in tuning mode. A record for a failed slot contains status, not a fake image.

#### 5. Tally and gate

**File**: `scripts/s19/tally.py`

**Intent**: Join the expected series manifest, all attempt records and viewer ratings before
computing a gate. A confirmed content change is severe. Unverified lettering cannot justify a
clear win, but the same flagged photo may win for an independent confirmed improvement.

**Contract**: `python3 scripts/s19/tally.py <export.json> --series <series.json> --attempts
test-photos/private/s19/attempts.jsonl --gate core|tuning|validation --out <report.json>` prints
counts/reasons and writes an auditable report. `--diagnostic` replaces `--gate` for the historical
Phase 2 material (its own manifest/log index; no eligibility to advance). Gates are calculated
separately per immutable config; a combined export does not pool candidates. Reject duplicate
ratings/slot ids, unknown ids, mismatched input/output hashes, mixed configs within a gate, wrong
split, missing expected records and substitution of a later result. Explicit terminal failure
records stay in the denominator and produce STOP/incomplete; missing records are invalid evidence.
For each GPT photo select slot 1's first technically valid result; every core slot's first valid
result is separately rated for stability, never best-of-N. Further attempts after a slot's valid
result are invalid evidence. NAFNet controls must use the same prepared hash and Auto values.
The gate's stage/role selects its expected slots: `core` requires core slots only, not the five
future extension photos. Diagnostic probes are excluded from core eligibility until their
config's full core is completed. `tuning` checks first results for all eight plus the linked full
core evidence; `validation` checks its 12 frozen slots. This prevents a pre-extension core check
from requiring results that are deliberately not yet authorised.

Core rules: all nine GPT slots must be accounted for and rated; any confirmed content change
in them, or a photo's range from clear win to moderate loss/severe, produces STOP for that
config. NAFNet requires three complete matched comparisons and preference over its control on
at least two; otherwise STOP. The large two-photo probe is diagnostic until completed to 3 × 3.
Tuning requires all eight photos, the selected GPT config's passing core report when applicable,
≥ 6 clear wins, ≤ 1 moderate loss, 0 severe and 0 confirmed content changes. Validation requires
all 12 photos, the frozen hash and ≥ 8 clear wins, ≤ 1 moderate loss, 0 severe. Report technical
failures/unattempted slots separately. Exit 0 means valid report (PASS or STOP); exit 2 means
invalid evidence. Fixture tests assert exact counts, reasons and both exit cases.

#### 6. Real Local baselines and exact Auto records

**File**: `context/changes/cloud-model-comparison/references/README.md`, `scripts/s19/baseline.ts`

**Intent**: The owner runs all eight common prepared tuning inputs through unchanged Local in
the app (Auto ON), including S17-21, and saves the downloads. `baseline.ts` follows the existing
`scripts/s17/browser-stats.ts` browser-bundle pattern, importing the app's `sampleImageLuma`
and `recommendParams`, to capture full-precision stats/parameters in the same browser/session
on the identical common input. Check those parameters against what the app actually applied;
rounded UI labels alone are not an exact record. No product source change is needed.
**Recorded, not observed (owner decision 2026-10-31):** the helper serves a local page that the
owner opens in the same desktop Chrome as the app; it records full-precision stats and
parameters, the input SHA-256, the app source revision and the browser version. Unless read
from the app at processing time, the parameters are labelled "recomputed", not "observed
applied". Rounded-label checks and headless output comparisons are diagnostics, never proof of
exact applied-value parity.

**Contract**: downloads and sidecars under `test-photos/private/s19/local/`, with common-input
hash, browser/version, full stats and applied gamma/blur. Record all eight in README, including
S17-21 (CC BY 4.0), and distinguish them from historical downloads. New photos remain private
unless individually admitted under AGENTS.md's evidence rule. The helper checks the common
access guard before any validation decode; validation baselines/stats are created only in Phase 7
under `test-photos/private/s19/validation-local/`.

#### 7. Shared access, freeze and outcome protocol

**File**: `scripts/s19/protocol.py`, `scripts/s19/tests/test_protocol.py`, `scripts/s19/tests/test_inputs.py`, `scripts/s19/tests/test_tally.py`, `scripts/s19/tests/test_budget.py`

**Intent**: One guard used by every harness path; free synthetic tests exercise actual CLI entry
points without provider credentials, networking or real holdout files.

**Contract**: `protocol.py check-freeze --config <file>` compares the config hash with the
record in `change.md`, checks required fields and referenced implementation/input-preparation
hashes, and exits non-zero with a reason on mismatch (never merely prints a hash).
`open-validation` additionally checks the passing tuning report, explicit positive owner
approval for that hash/vendor/terms, Phase 7 spending consent and 12-call preflight budget; only
then creates `test-photos/private/s19/validation-access.json`, marking Phase 7 started before
any image is touched. Missing/declined consent cannot create it. An existing release resumes
only the same run and cannot reset slots or expose a second finalist.
`protocol.py close --outcome <outcome.md>` checks the outcome's mandatory fields and all status
pointers listed above; the implementer records the terminal outcome on any branch.
`protocol.py check-scope` compares every tracked/untracked worktree change with the explicit
documentation/harness allowlist (this change folder, `scripts/s19/`, roadmap and `temp_steps.md`)
and fails on any product/deploy/config/secret mutation. This is scope evidence, not a runtime
assertion about the production secret. All these commands operate on metadata only unless
explicitly released Phase 7 tooling performs the photo work.
**Approval records (owner decision 2026-10-31):** only explicitly marked one-line records under
`## S-19 approvals` in `change.md` are parsed (`- S19-SPEND …`, `- S19-VALIDATION …`), with a
strict `key=value` grammar that supports double-quoted values. Malformed records, duplicate keys
and conflicting approvals are rejected; `decision=approved` and every mandatory field are
required, and a missing or invalid approval blocks execution. Phase 7 needs both the spending
approval and a validation approval matching the exact config hash, manifest hash, vendor, terms
and run id. The agent never creates or modifies approval records.

### Success Criteria:

#### Automated Verification:

- Inputs are prepared and reproducible: `python3 scripts/s19/inputs.py --all && python3 scripts/s19/inputs.py --check` — not run: needs Phase 1 output
- Holdout guard refuses a validation photo: `python3 -B -m unittest discover -s scripts/s19/tests -p test_protocol.py -v` asserts refusal before photo reads/network for every CLI, even with a matching hash and validation flag but absent/declined consent; also tests a synthetic approved Phase 7 path — not run: needs Phase 1 output
- Dry run plans the Phase 3 calls with a cost under the cap: `python3 scripts/s19/run-candidate.py --config scripts/s19/configs/gpt-std.json --phase 3 --series scripts/s19/series/phase3.json --cap 3 --dry-run --repeat 3 S17-03 S17-04 S17-07` reports all nine standard GPT slots and their cost bounds; the manifest also accounts for two size probes and three NAFNet calls under the same $3 ledger — not run: needs Phase 1 output
- Local blur reproduction is measured against real Local: `npx tsx scripts/s19/local-arms.ts local-equiv --compare-local S17-01 S17-02 S17-03 S17-04 S17-05 S17-06 S17-07 S17-21` requires the new baseline and exact Auto records first — not run: needs Phase 1 output
- Tally maps a fixture export correctly, including an unverified-reconstruction case: `python3 -B -m unittest discover -s scripts/s19/tests -p test_tally.py -v` asserts exact category counts/reasons and process exits for valid PASS, valid STOP and invalid evidence, including both unverified-lettering cases — not run: needs Phase 1 output
- Typecheck passes with the new TS script: `npm run typecheck` — not run: needs Phase 1 output
- Formatting of the change docs: `npx prettier --check context/changes/cloud-model-comparison/` — at planning: exit 0
- Input correctness is checked independently of reproducibility: `python3 -B -m unittest discover -s scripts/s19/tests -p test_inputs.py -v` checks independently expected orientation and colour conversion on synthetic fixtures — not run: needs Phase 1 output
- Phase budget cannot reset or overshoot: `python3 -B -m unittest discover -s scripts/s19/tests -p test_budget.py -v` checks refusal before a mocked network call, exact-boundary admission, timeout/crash reservations, restart, concurrent admission and config switching on one phase ledger — not run: needs Phase 1 output
- Exact Auto records match the app: `npx tsx scripts/s19/baseline.ts --check-auto --all` validates common-input hashes and full-precision parameters for all eight tuning photos, with metadata-only refusal for validation — not run: needs Phase 1 output

#### Manual Verification:

- The owner saves the S17-21 Local download from the app using its prepared common sRGB input and records its exact Auto values — surface: test-photos/private/s19/local/, context/changes/cloud-model-comparison/references/README.md
- The owner opens `compare-arms.html` on the existing spike outputs and confirms the flags, the brightened-original toggle and the reveal work — surface: context/changes/cloud-model-comparison/references/compare-arms.html
- The owner saves new real Local baselines for all eight prepared tuning inputs and confirms the baseline helper records the same browser/session and applied Auto values — surface: test-photos/private/s19/local/, context/changes/cloud-model-comparison/references/README.md

---

## Phase 2: Rate what is already paid for

### Overview

Before any new spending: the owner rates, blind, the existing GPT outputs (S17-04, S17-07) and
NAFNet + Local gamma (S17-04) against the real Local, with the NAFNet control (downscale + Local
gamma) as an extra arm on S17-04.
This is historical diagnostic evidence: keep the old Local downloads and label the spike's
unprepared inputs/ICC limitation. Its control reproduces that spike input, not the new gate
input. No Phase 2 result counts towards a core or tuning gate.

### Changes Required:

#### 1. Rating record

**File**: `context/changes/cloud-model-comparison/evaluations/phase2-existing.md`, `context/changes/cloud-model-comparison/evaluations/phase2-existing.json`, `context/changes/cloud-model-comparison/evaluations/phase2-series.json`, `context/changes/cloud-model-comparison/evaluations/phase2-attempts.jsonl`

**Intent**: Store the viewer export and the tally for the three existing outputs, with any
content-change crops.

**Contract**: Markdown table per photo: arms, preference, flags, crop notes, bar category.
The historical series manifest and attempt index point at the spike `meta.json` files, recording
their actual input/output hashes and known errors; unknown historical fields are labelled, not
invented. This diagnostic dataset is isolated from the new shared gate ledger.

### Success Criteria:

#### Automated Verification:

- Tally of the export: `python3 scripts/s19/tally.py context/changes/cloud-model-comparison/evaluations/phase2-existing.json --series context/changes/cloud-model-comparison/evaluations/phase2-series.json --attempts context/changes/cloud-model-comparison/evaluations/phase2-attempts.jsonl --diagnostic --out context/changes/cloud-model-comparison/evaluations/phase2-report.json` validates diagnostic records only — not run: needs Phase 2 output

#### Manual Verification:

- The owner rates S17-04 (GPT, NAFNet+gamma, control) and S17-07 (GPT) against Local, blind — surface: context/changes/cloud-model-comparison/evaluations/
- Stop rule reviewed: GPT is a moderate loss or worse against Local on both photos → the owner decides whether Phase 3 still runs for GPT — surface: context/changes/cloud-model-comparison/evaluations/phase2-existing.md

---

## Phase 3: First paid series on the core tuning photos

### Overview

GPT stability: three new independent calls each on S17-03, S17-04 and S17-07 on the prepared
inputs, all rated. The spike outputs are not counted: they were made from unprepared files (S17-07
is Adobe RGB) and stay Phase 2 material only. The first valid result per photo is the one the gate
counts; the other two measure stability. One larger-size GPT probe on S17-04 and S17-07 to decide the
output size to investigate next. NAFNet on S17-03, S17-04 and S17-07 with Local gamma and the free control. Needs the
owner's consent for a cap of $3.

### Changes Required:

#### 1. Configs and runs

**File**: `scripts/s19/configs/gpt-std.json`, `scripts/s19/configs/gpt-large.json`, `scripts/s19/configs/nafnet.json`

**Intent**: The existing edit prompt at 2048-class standard sizes (aspect-matched, e.g. 2048 × 1536,
2304 × 1536); the large variant uses an explicit preselected size rule within the documented
output limits (≤ 8.29 MP and ≤ 3840 px per side), fixed before calls; NAFNet
via fal with `X-Fal-Store-IO: 0` on ≤ 3968 px inputs.

**Contract**: config fields as in Phase 1, item 3. No `quality` lower than `high` is tried: a lower
quality setting is not assumed to mean less intervention.
Before these runs, the Phase 3 manifest fixes the numeric sizes/rule for each config (no
"largest non-rejected" search on results), cost bounds, retry counts and config hashes. Standard
GPT and NAFNet have core roles; the two large GPT slots have a diagnostic probe role, never a
passing core verdict. Technical size rejection is logged within the cap; another size is another
config, not an unlogged automatic search.

#### 2. Rating record

**File**: `context/changes/cloud-model-comparison/evaluations/phase3-core.md`

**Intent**: All 9 GPT standard outputs, 2 large outputs, 3 NAFNet+gamma outputs with controls,
rated blind against Local; a note per photo on spread across the 3 GPT repeats; a separate native
export note on resolution.

**Contract**: one section per photo; tally per arm; attempts summary from `attempts.jsonl`.

### Success Criteria:

#### Automated Verification:

- (paid) GPT core series: `python3 scripts/s19/run-candidate.py --config scripts/s19/configs/gpt-std.json --phase 3 --series scripts/s19/series/phase3.json --cap 3 --repeat 3 --resume S17-03 S17-04 S17-07` — artifact: `test-photos/private/s19/attempts.jsonl` — not run: paid
- (paid) GPT size probe: `python3 scripts/s19/run-candidate.py --config scripts/s19/configs/gpt-large.json --phase 3 --series scripts/s19/series/phase3.json --cap 3 --resume S17-04 S17-07` — artifact: `test-photos/private/s19/attempts.jsonl` — not run: paid
- (paid) NAFNet core: `python3 scripts/s19/run-candidate.py --config scripts/s19/configs/nafnet.json --phase 3 --series scripts/s19/series/phase3.json --cap 3 --resume S17-03 S17-04 S17-07` — artifact: `test-photos/private/s19/attempts.jsonl` — not run: paid
- Tally and core gate: `python3 scripts/s19/tally.py context/changes/cloud-model-comparison/evaluations/phase3-core.json --series scripts/s19/series/phase3.json --attempts test-photos/private/s19/attempts.jsonl --gate core --out context/changes/cloud-model-comparison/evaluations/phase3-report.json` validates the evidence and records each eligible config's PASS/STOP; the large probe remains diagnostic — not run: needs Phase 3 output

#### Manual Verification:

- The owner rates all outputs blind against Local, with content-change crops where suspected — surface: context/changes/cloud-model-comparison/evaluations/phase3-core.md
- Core gate decision recorded. The GPT config stops if a content change is confirmed in **any** of its 9 calls (it rejects this configuration, not the model), or if the 3 repeats of one photo span from a clear win to a moderate loss or worse. NAFNet stops if NAFNet + gamma is not preferred over the control (same downscale + gamma) on at least 2 of 3 photos — surface: context/changes/cloud-model-comparison/evaluations/phase3-core.md
- The owner chooses the GPT output size to carry forward (standard or large) from the probe and the native export check; a large choice is conditional on its own full core series and any numeric Phase 5 budget amendment, not a core pass — surface: context/changes/cloud-model-comparison/evaluations/phase3-core.md

---

## Phase 4: Deterministic exposure curve (only if needed)

### Overview

Run only if Phase 3 shows that exposure, not noise, costs the NAFNet arm its wins (e.g. too
bright skies, as Local on S17-05 and S17-21). Define one deterministic curve that protects
highlights and limits lifting a dark sky; apply it to NAFNet output and, as the owner required, to
Local's own denoising without NAFNet. Free: it reuses existing NAFNet outputs.

### Changes Required:

#### 1. Curve

**File**: `scripts/s19/local-arms.ts`, `scripts/s19/configs/curve.json`, `context/changes/cloud-model-comparison/evaluations/phase4-curve.md`

**Intent**: Add the curve as arms (d) "NAFNet + curve" and (e) "Local blur + curve"; parameters
chosen on tuning photos only and recorded in the config.

**Contract**: the curve is a pure function of the saved full-resolution common input's app luma
statistics (`LumaStats`) and fixed constants; no per-photo manual choice. Fix and hash one
NAFNet+curve config before extending it; its free paired control uses the identical prepared
NAFNet input, Auto record and curve. Record whether it improves exposure on the core without
introducing content/severe regressions. No gain or a regression means stop that curve arm; an
optional phase cannot silently waive the NAFNet core gate.

### Success Criteria:

#### Automated Verification:

- Curve arms render for every rated tuning photo: `npx tsx scripts/s19/local-arms.ts nafnet-curve S17-03 S17-04 S17-07 && npx tsx scripts/s19/local-arms.ts blur-curve S17-03 S17-04 S17-07` — not run: needs Phase 3 output

#### Manual Verification:

- The owner rates NAFNet+curve, blur+curve and NAFNet+gamma against Local, blind, and the record names which of exposure, NAFNet or both carried the gain — surface: context/changes/cloud-model-comparison/evaluations/phase4-curve.md

---

## Phase 5: Extend surviving arms to all eight tuning photos

### Overview

Only arms with a passing complete core gate (and Phase 4's exposure decision, if applicable)
run on S17-01, 02, 05, 06 and 21. Choose one GPT config before its tuning gate: carry standard,
complete large, or define a prompt variant with a recorded tuning-only rationale. Copy its exact
bytes to `phase5-gpt.json`; a renamed unchanged config keeps its hash and slot history. A changed
prompt or size gets a new hash and no inherited slots/ratings from a different hash.

For large with unchanged probe config/inputs, resume its 3 × 3 core: 3 slots on S17-03 and 2
missing slots each on S17-04/07 (7 new calls). For a fresh prompt config, all 9 core slots are
new. Rate all nine and apply the identical core gate before the 5 remaining photos; any STOP
prevents their paid run. A surviving standard config reuses its full Phase 3 core and needs no
new core calls. Never choose a preferred repeat or mix standard/large to assemble eight wins.
This phase needs its own spending consent: $3 for the base branch, or a numeric amended cap
covering prior phase spend, all remaining bounded calls and the agreed retry allowance. If that
approval is absent, stop before further spending, record the outcome and keep the holdout closed.

### Changes Required:

#### 1. Runs and rating

**File**: `context/changes/cloud-model-comparison/evaluations/phase5-tuning.md`, `context/changes/cloud-model-comparison/evaluations/phase5-tuning.json`, `context/changes/cloud-model-comparison/evaluations/phase5-core.json`, `scripts/s19/configs/phase5-gpt.json`, `scripts/s19/series/phase5.json`

**Intent**: Full tuning picture per surviving arm against Local on all 8 photos, with the star
check on S17-01/02/03/21 and the lettering check on S17-04/05.

**Contract**: tally per immutable arm config over 8 photos plus the attempts summary and the
passing core report. Reused Phase 3 slots/ratings keep their original ids and hashes. Before the
commands below, set `S19_PHASE5_CAP` to the exact owner-approved numeric cap in `change.md`
(3 for the base branch); never default it on a larger branch. The manifest distinguishes core
slots, probes and remaining tuning slots, and enumerates any surviving NAFNet exposure config
and its paired controls. NAFNet's already denoised core outputs may be reused for the frozen
deterministic curve; do not pay to denoise them again.

### Success Criteria:

#### Automated Verification:

- (paid) Selected GPT core is completed without replacing earlier slots: `python3 scripts/s19/run-candidate.py --config scripts/s19/configs/phase5-gpt.json --phase 5 --series scripts/s19/series/phase5.json --cap "$S19_PHASE5_CAP" --repeat 3 --resume S17-03 S17-04 S17-07` fills 7 missing large slots or 9 fresh prompt slots, before the remaining photos; unchanged standard needs no new calls — artifact: `test-photos/private/s19/attempts.jsonl` — not run: paid
- Selected GPT full core verdict is recorded before extension: `python3 scripts/s19/tally.py context/changes/cloud-model-comparison/evaluations/phase5-core.json --series scripts/s19/series/phase5.json --attempts test-photos/private/s19/attempts.jsonl --gate core --out context/changes/cloud-model-comparison/evaluations/phase5-core-report.json` applies the same 9-slot gate to the selected hash, including the retained probes when eligible — not run: needs Phase 5 core ratings
- (paid) Surviving arms on the remaining tuning photos: `python3 scripts/s19/run-candidate.py --config scripts/s19/configs/phase5-gpt.json --phase 5 --series scripts/s19/series/phase5.json --cap "$S19_PHASE5_CAP" --resume S17-01 S17-02 S17-05 S17-06 S17-21`; for surviving NAFNet also run `python3 scripts/s19/run-candidate.py --config scripts/s19/configs/nafnet.json --phase 5 --series scripts/s19/series/phase5.json --cap "$S19_PHASE5_CAP" --resume S17-01 S17-02 S17-05 S17-06 S17-21`, then render its selected deterministic exposure/control arms — artifact: `test-photos/private/s19/attempts.jsonl` — not run: paid
- Tuning gate per arm: `python3 scripts/s19/tally.py context/changes/cloud-model-comparison/evaluations/phase5-tuning.json --series scripts/s19/series/phase5.json --attempts test-photos/private/s19/attempts.jsonl --gate tuning --out context/changes/cloud-model-comparison/evaluations/phase5-report.json` checks one config at a time, its passing full core evidence, all eight photos and the fixed visual thresholds — not run: needs Phase 5 output

#### Manual Verification:

- The owner rates all 8 tuning photos blind for each surviving arm — surface: context/changes/cloud-model-comparison/evaluations/phase5-tuning.md
- Tuning gate recorded. An arm may go forward only with at least 6 clear wins of 8, at most 1 moderate loss, 0 severe regressions and 0 confirmed content changes. The margin over 8/12 allows for the optimism of tuning — surface: context/changes/cloud-model-comparison/evaluations/phase5-tuning.md
- The owner rates every new selected-config core output before extension and records that the exact selected hash passed the full core gate; unchanged standard may reuse its Phase 3 ratings/report — surface: context/changes/cloud-model-comparison/evaluations/phase5-core.json, context/changes/cloud-model-comparison/evaluations/phase5-tuning.md

---

## Phase 6: Choose and freeze one finalist

### Overview

Pick one arm that passed the tuning gate (the owner decides if two did), write its frozen config,
record its hash, and take the owner's decision on sending validation photos to the vendor.

### Changes Required:

#### 1. Freeze record

**File**: `scripts/s19/configs/finalist.json`, `context/changes/cloud-model-comparison/change.md`

**Intent**: One config that fully determines the process (model snapshot, prompt, size, quality,
input preparation, retry limit and back-off, or NAFNet endpoint, downscale and curve constants),
plus a `change.md` section with its sha256, the owner's choice and the date. Include the exact
input-preparation/sampling/exposure implementation hashes and constants, format/size rule,
numeric retry count and back-off and cost bounds in the config before its tuning runs. The
validation series manifest is a separate Phase 6 freeze-record hash, not a new config field:
the series references the config hash, so embedding its hash back into that config would be
circular. The frozen process
must be the identical hash/implementation that passed tuning; copying a config to `finalist.json`
does not authorise changing it. Any change invalidates its gate evidence and requires new tuning,
before the holdout is opened.

**Contract**: `protocol.py check-freeze` performs a real comparison against the recorded hash,
referenced file hashes and passing tuning evidence, failing on mismatch or missing data. The
freeze alone does not release validation photos.

#### 2. Holdout-sending decision

**File**: `context/changes/cloud-model-comparison/change.md`

**Intent**: The earlier rule says the twelve validation photos stay unopened and only tuning
photos go to vendors. A Cloud API cannot be tested on the holdout without sending it. The owner
decides explicitly whether the 12 CC-licensed validation photos may be sent to the finalist's
vendor, once, under that vendor's terms (OpenAI: 30-day abuse retention, no training; fal: 90-day
storage unless `X-Fal-Store-IO: 0`).

**Contract**: a labelled `S-19 validation approval` record in `change.md` with the owner's dated
explicit `approved` or `declined` decision, exact finalist SHA-256, vendor and data terms, allowed
12-photo split/manifest hash and one validation run id. Phase 7 also needs its separate $5
spending approval. Only an explicit positive decision for that exact record can authorise
`open-validation`; missing, ambiguous or declined decisions stop and close the experiment before
validation. A status update, freeze approval, acceptance of this plan or this triage is not
permission to send the holdout. Do not write `approved` on the owner's behalf.

### Success Criteria:

#### Automated Verification:

- The recorded hash matches the config: `python3 scripts/s19/protocol.py check-freeze --config scripts/s19/configs/finalist.json` asserts exact config/implementation/series hashes and passing tuning evidence without reading validation images — not run: needs Phase 6 output

#### Manual Verification:

- The owner chooses the finalist and approves the freeze record — surface: scripts/s19/configs/finalist.json, context/changes/cloud-model-comparison/change.md
- The owner records the decision on sending validation photos to the vendor — surface: context/changes/cloud-model-comparison/change.md

---

## Phase 7: One-shot validation

### Overview

Run the frozen finalist once on the 12 validation photos, produce Local for the same 12 in the
app, rate blind, tally against the bar, and record the result. Nothing is tuned after the outputs
are seen; the same set is never presented again as independent validation. Needs the owner's
consent for a cap of $5.

Start by running `python3 scripts/s19/protocol.py open-validation --config scripts/s19/configs/finalist.json --phase 7 --series scripts/s19/series/validation.json --cap 5`.
It creates the release only after all approval/hash/gate/budget checks succeed. Then run
`python3 scripts/s19/inputs.py --config scripts/s19/configs/finalist.json --validation --access test-photos/private/s19/validation-access.json --all-validation`.
Use that same release/config on `baseline.ts`, `local-arms.ts` and `viewer-inputs.py`; produce
real Local in the app from these common prepared inputs and capture exact Auto records in this
phase only. No validation fixture, preview, contact sheet or baseline is prepared earlier.

### Changes Required:

#### 1. Runs

**File**: `test-photos/private/s19/runs/finalist/`, `test-photos/private/s19/validation-local/`, `context/changes/cloud-model-comparison/evaluations/validation.md`, `context/changes/cloud-model-comparison/evaluations/validation.json`

**Intent**: First technically valid result per photo, retries only for technical errors within
the frozen limit, every attempt logged; real Local (Auto ON) downloads for the 12 photos from the
app.

**Contract**: `validation.md` holds the attempts table, the viewer export, the tally and the
verdict. A persistent technical failure or a budget-unattempted photo stays among the 12, with
its explicit status; incomplete evidence cannot PASS and closes as Inconclusive, never as a
visual severe regression or a reduced-denominator test. Resume only missing technical slots of
this released run within its frozen retry/cap limits, without replacing a valid result; never
re-open the holdout for another independent validation.

#### 2. Record

**File**: `context/changes/cloud-model-comparison/change.md`, `context/foundation/roadmap.md`, `temp_steps.md`, `context/changes/cloud-model-comparison/evaluations/outcome.md`

**Intent**: Record pass, fail or inconclusive; on pass, name the follow-up change (production switch, ZDR
decision, privacy policy); Cloud stays paused either way until that change ships. Update every
pointer to S-19 status (roadmap At-a-glance row and item body, `temp_steps.md`, `change.md`
Notes).

**Contract**: grep for the old status words (`planning`, `pending`, `not yet`) in those files
before closing. The same record/update action is mandatory at an earlier terminal STOP or
declined consent, as specified in Implementation Approach; it does not depend on reaching this
phase. `protocol.py close` validates that record and its pointers; a report's STOP never invites
tuning on validation to make a command green.

### Success Criteria:

#### Automated Verification:

- Validation access is released and inputs prepared only in Phase 7: the two `open-validation` and `inputs.py` commands in this phase's Overview must succeed before any photo work — not run: writes a release record and prepared validation files; needs explicit Phase 6 owner approval and Phase 7 spending consent
- (paid) Validation run: `python3 scripts/s19/run-candidate.py --config scripts/s19/configs/finalist.json --phase 7 --series scripts/s19/series/validation.json --cap 5 --validation --access test-photos/private/s19/validation-access.json --resume --all-validation` — artifact: `test-photos/private/s19/attempts.jsonl` — not run: paid
- Bar verdict: `python3 scripts/s19/tally.py context/changes/cloud-model-comparison/evaluations/validation.json --series scripts/s19/series/validation.json --attempts test-photos/private/s19/attempts.jsonl --gate validation --out context/changes/cloud-model-comparison/evaluations/validation-report.json` validates 12-photo evidence and records PASS or STOP without requiring a positive quality result for execution success — not run: needs Phase 7 output
- `CLOUD_DAILY_CAP` unchanged: `python3 scripts/s19/protocol.py check-scope` verifies the documented scope contains no product, runtime-config, deploy or secret changes; this is not a read of the production secret and makes no fresh runtime claim — not run: needs Phase 1 output
- Terminal outcome and status pointers are recorded: `python3 scripts/s19/protocol.py close --outcome context/changes/cloud-model-comparison/evaluations/outcome.md` also runs on earlier terminal branches without waiting for Phase 7; retain this step pending until closure instead of marking it n/a — not run: needs a terminal experiment outcome

#### Manual Verification:

- Local is produced in the app for all 12 validation photos and saved — surface: test-photos/private/s19/validation-local/
- The owner rates all 12 blind against Local, with fidelity flags — surface: context/changes/cloud-model-comparison/evaluations/validation.md
- The owner accepts the recorded verdict and the next step — surface: context/changes/cloud-model-comparison/change.md

---

## Testing Strategy

### Unit Tests:

- `tally.py` fixtures assert exact categories/counts/reasons: confirmed content change → severe;
  unverified lettering as the only claimed gain → no clear win; the same flag with an independent
  confirmed noise/detail gain → eligible for clear win. Include fixed 6/8 and 8/12 boundaries,
  ≤ 1 moderate loss, any severe/content change, incomplete core repeats, missing records,
  duplicate ids/ratings, mixed configs and a later-repeat substitution.
- A complete technical-failure record produces STOP/incomplete while keeping the fixed
  denominator; an absent record produces execution error. Assert valid STOP exits 0 and
  malformed evidence exits 2; a STOP report never satisfies a next-phase PASS prerequisite.
- Synthetic ICC/orientation fixtures specify expected dimensions, profile and converted pixels
  independently. `inputs.py --check` on tuning S17-06/S17-03 then checks reproducibility and
  metadata invariants; re-deriving a hash alone is not proof of a correct transform.
- Budget fixtures cover shared-phase accounting across configs and process restarts, locked
  concurrent admission, equality at the cap, pre-call refusal, timeout/crash reservation, retry
  limits and refusal when a defensible cost bound or the approved numeric cap is absent.

### Integration Tests:

- Free CLI tests use synthetic validation ids/files and a mocked network to verify no reads or
  uploads before approval/release on every input, runner, baseline, local-arm and viewer path.
  Matching config hash plus `--validation` with absent/declined consent must still fail; approved
  synthetic Phase 7 preparation must work. Never use real validation photos to test this.
- Local arms first assert exact app Auto records for their common inputs, then measure the blur
  approximation against the new real Local downloads (`--compare-local`).
- Freeze tests mutate the config or a referenced implementation hash and require a non-zero
  diagnostic. Scope checking is explicitly about changes, not the live production secret.

### Manual Testing Steps:

1. Open `compare-arms.html` on the existing spike outputs, rate one photo, reveal, export.
2. Toggle the brightened original on S17-03 and confirm faint stars are visible for the star rule.
3. Check one GPT native export at 100% and record its resolution next to Local's.

## Performance Considerations

GPT ≈ 40 s and NAFNet ≈ 19 s per call: the 12 first calls are estimated at under 15 minutes,
excluding Local capture, ratings, retries, back-off and provider queues. Nano
Banana's 503 pattern shows vendor availability can fail; the retry limit in the frozen config must
be finite and logged.

## Migration Notes

None: no production data or schema changes.

## References

- Frame: `context/changes/cloud-model-comparison/frame.md`
- Research and spike results: `context/changes/cloud-model-comparison/research.md`
- Decisions: `context/changes/cloud-model-comparison/change.md`
- Quality bar: `context/archive/2026-08-31-cloud-quality-below-local/quality-bar.md`
- Revision 2026-10-31 after the Codex plan review: GPT input not downscaled (limits are output-only), spike outputs not counted in the 3 × 3 series, one config per gate with the first valid result, pairwise presentation size, hard pre-call budget cap, any confirmed content change stops a GPT config.
- Triage 2026-10-31: the owner requested all ten recommended fixes. F1–F10 are incorporated in the plan/brief: shared positive-consent holdout release; manifest/attempt/rating joins; complete selected-config GPT core; cumulative phase caps and numeric amendments; new NAFNet S17-04; common sRGB app baselines; exact browser Auto; lettering reasons; valid STOP/terminal closure; asserting hash/fixture/scope checks. This accepts the plan edits only, not spending, holdout access, implementation completion or manual acceptance.
- Spike runner: `scripts/s19/feasibility.py`; Local engine: `src/lib/engines/local-engine.ts`,
  `src/lib/engines/auto-params.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append ` — <commit sha>` when a step lands. A Manual row takes ` — accepted at <full sha>` when a human confirms it. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fair-input harness and blind viewer

#### Automated

- [x] 1.1 Inputs are prepared and reproducible
- [x] 1.2 Holdout guard refuses a validation photo
- [x] 1.3 Dry run plans the Phase 3 calls with a cost under the cap
- [x] 1.4 Local blur reproduction is measured against real Local
- [x] 1.5 Tally maps a fixture export correctly, including an unverified-reconstruction case
- [x] 1.6 Typecheck passes with the new TS script
- [x] 1.7 Formatting of the change docs
- [x] 1.10 Input correctness is checked independently of reproducibility
- [x] 1.11 Phase budget cannot reset or overshoot
- [x] 1.12 Exact Auto records match the app

#### Manual

- [ ] 1.8 The owner saves the S17-21 Local download from the app
- [ ] 1.9 The owner opens `compare-arms.html` on the existing spike outputs and confirms the flags, the brightened-original toggle and the reveal work
- [ ] 1.13 The owner saves new real Local baselines for all eight prepared tuning inputs and confirms the baseline helper records the same browser/session and applied Auto values

### Phase 2: Rate what is already paid for

#### Automated

- [ ] 2.1 Tally of the export

#### Manual

- [ ] 2.2 The owner rates S17-04 (GPT, NAFNet+gamma, control) and S17-07 (GPT) against Local, blind
- [ ] 2.3 Stop rule reviewed

### Phase 3: First paid series on the core tuning photos

#### Automated

- [ ] 3.1 (paid) GPT core series
- [ ] 3.2 (paid) GPT size probe
- [ ] 3.3 (paid) NAFNet core
- [ ] 3.4 Tally and core gate

#### Manual

- [ ] 3.5 The owner rates all outputs blind against Local, with content-change crops where suspected
- [ ] 3.6 Core gate decision recorded
- [ ] 3.7 The owner chooses the GPT output size to carry forward

### Phase 4: Deterministic exposure curve (only if needed)

#### Automated

- [ ] 4.1 Curve arms render for every rated tuning photo

#### Manual

- [ ] 4.2 The owner rates NAFNet+curve, blur+curve and NAFNet+gamma against Local, blind

### Phase 5: Extend surviving arms to all eight tuning photos

#### Automated

- [ ] 5.5 (paid) Selected GPT core is completed without replacing earlier slots
- [ ] 5.6 Selected GPT full core verdict is recorded before extension
- [ ] 5.1 (paid) Surviving arms on the remaining tuning photos
- [ ] 5.2 Tuning gate per arm

#### Manual

- [ ] 5.3 The owner rates all 8 tuning photos blind for each surviving arm
- [ ] 5.4 Tuning gate recorded
- [ ] 5.7 The owner rates every new selected-config core output before extension and records that the exact selected hash passed the full core gate

### Phase 6: Choose and freeze one finalist

#### Automated

- [ ] 6.1 The recorded hash matches the config

#### Manual

- [ ] 6.2 The owner chooses the finalist and approves the freeze record
- [ ] 6.3 The owner records the decision on sending validation photos to the vendor

### Phase 7: One-shot validation

#### Automated

- [ ] 7.7 Validation access is released and inputs prepared only in Phase 7
- [ ] 7.1 (paid) Validation run
- [ ] 7.2 Bar verdict
- [ ] 7.3 `CLOUD_DAILY_CAP` unchanged
- [ ] 7.8 Terminal outcome and status pointers are recorded

#### Manual

- [ ] 7.4 Local is produced in the app for all 12 validation photos and saved
- [ ] 7.5 The owner rates all 12 blind against Local, with fidelity flags
- [ ] 7.6 The owner accepts the recorded verdict and the next step
