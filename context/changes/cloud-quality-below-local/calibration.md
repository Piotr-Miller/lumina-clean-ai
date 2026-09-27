# S-17 calibration log

Phase 2 (premise check and probes) and Phase 3 (tuning) of `plan.md` record their evidence here.

**Pre-registration rule.** Every reading below — what a result will mean — is committed **before**
the run it governs. The first commit that adds this file is the pre-registration. A result table
filled in by an earlier commit than its reading would make that reading worthless, and plan row 2.1
checks the order in `git log`. Readings are not edited after their run; a correction is appended
with its date and reason.

## Fixed inputs

| Item                        | Value                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Benchmark                   | `test-photos/s17-benchmark.json` `s17-v1`, checked with `sha256sum -c test-photos/s17-benchmark.sha256` before each batch                  |
| Tuning source (`LumaStats`) | `test-photos/private/s17/harness/desktop-chrome-154.stats.json`, sha256 `088fc3f14df2b3662d1c739bf646a4160510ad85472738b65e63bbad3c7d5a40` |
| Auto formula                | `recommendParams(stats, "cloud")` from `src/lib/engines/auto-params.ts` as of `fa5334f` (unchanged since before S-17)                      |
| Model                       | Bread, pinned version `057a4e073829a8c50f2622206f71a8ed25331cd07a520bc264469389c7c11e54`, called by `scripts/spikes/bread-spike.ts`        |
| Parameters sent             | Unrounded values, as the app persists them (e.g. strength `0.12156862745098039`, not `0.12`)                                               |
| Outputs                     | `test-photos/private/s17/direct/phase2/` (gitignored); each output has a `.json` run record                                                |
| Diagnostics                 | `python3 scripts/measure-hue-shares.py <S17-id>=<file>`: V ≥ 0.90, any channel = 255, mean RGB, over frame and manifest ROI                |

## Post-pass flag state (plan 2.6)

**ON** — `chromaEnabled":[0,true]` in the HTML served by `https://luminacleanai.com/`, observed
**2026-09-27 20:37 UTC** (`curl`, response sha256 `5393335c…`). Consistent with the plan's
13:54 UTC observation the same day. Consequence, per the plan: **Phase 3 includes the app-path
check**, because with the flag ON the Download is a post-passed JPEG, not the raw PNG these direct
runs return. This line records the flag, not any file type. A change of this state before Phase 5
is a change of experimental conditions.

## Pre-registered readings

Committed before any Phase 2 model run.

### R1 — Premise gate (baseline)

**Run.** Current Cloud Auto on each of the six tuning photos, one direct run per photo, at the
parameters below (computed from the tuning source):

| Photo  | Auto gamma           | Auto strength          |
| ------ | -------------------- | ---------------------- |
| S17-01 | `1.5`                | `0.12156862745098039`  |
| S17-02 | `1.0503538133075825` | `0.058823529411764705` |
| S17-03 | `1.1880581320820962` | `0.08039215686274509`  |
| S17-04 | `1.1`                | `0.1`                  |
| S17-07 | `1.5`                | `0.1823529411764706`   |
| S17-21 | `1.5`                | `0.15098039215686276`  |

**Rating.** The maintainer rates each output against its original, viewed side by side at matched
size, as one of:

- _improvement_ — more legible significant detail, with the night character kept. Brightening
  alone is not an improvement;
- _no harm_;
- _harm_ — washed out, unnatural cast, excessive smoothing, or lost detail. A harm names its kind.

The exposure diagnostics are recorded next to each rating as support, **not** as a threshold. No
exposure limit shared across scenes is set here or later.

**Reading.** _If no output is rated harm of the kind "washed out", the calibration premise does not
hold at full resolution. Stop, record the finding here and in `change.md`, and return to the
maintainer before Phase 3._ At least one "washed out" harm means the premise holds and Phase 3 may
start once its entry gate is met. A harm of another kind (cast, smoothing, lost detail) is recorded
but does not by itself establish the premise, because Auto exposure calibration cannot fix it.

### R2 — EXIF probe (S17-06)

**Run.** S17-06 is stored as 5712 × 4284 with EXIF orientation 6, so it displays as a
**portrait** 4284 × 5712. It is sent to Bread as its original bytes, as the app uploads them, at
gamma `1` / strength `0.05`. Those parameters come from the offline harness, because the desktop
tuning source covers only the six tuning photos. Orientation does not depend on them.

**Reading.** With Bread's 1536 px long-edge cap, an output that honours EXIF is portrait
(≈ 1152 × 1536) with upright content.

- _Output landscape (width > height), or upright dimensions with sideways content in the
  thumbnail → Bread ignores EXIF. Register a separate change via `/rune-new`, record it in
  `change.md`, and Phase 5 waits until that fix is in production._
- _Portrait dimensions and upright content → Bread honours EXIF; the Phase 5 EXIF gate is clear._
- Anything else goes back to the maintainer before it is read.

S17-06 is a **validation** photo. Its output is checked for orientation only (dimensions and a
thumbnail), is not rated, is not measured for tuning, and is recorded only in § EXIF probe, never
in the tuning run log.

### R3 — Gamma-0.9 probe (S17-01)

**Run.** S17-01 at gamma `0.9` / strength `0.05`, and at gamma `1.0` / strength `0.05`.

**Reading — gamma 0.9.**

- _Accepted (the prediction succeeds with an image) → the Phase 3 gamma sweep includes 0.9._
  The Auto and slider floor is then chosen in Phase 3 on result quality, not on acceptance.
- _Rejected as invalid input (HTTP 422, or a create-time validation error naming `gamma`) → the
  floor stays 1.0 and the sweep starts at 1.0._
- An infrastructure failure (network, 5xx, timeout) is not a reading: retry up to twice and log it.

**Reading — gamma 1.0 (reproducibility, added as free evidence).** Plan row 1.7 already ran
S17-01 at exactly these parameters, with output sha256
`edec533050106489b96ea503980ed557149d53e3ea7eda50f5752b53d69a097c`.

- _Same sha256 → byte reproducibility holds for this photo at full resolution._ The Phase 3
  regression reference can rely on its sha-first check.
- _Different sha256 → reproducibility is not byte-exact at full resolution._ This is not a
  failure. Record it and compare the diagnostics; Phase 3 must then set numeric tolerances for the
  S17-01 reference before freezing it, per the plan's Definitions.

Both outputs are measured and kept for Phase 3; S17-01 is a tuning photo.

## Commands

For the maintainer's shell, from the repository root, with their own token. Total cost is about
9 × $0.0006. The first call after idle can take over two minutes (cold start).

```bash
export REPLICATE_API_TOKEN=r8_…            # your token; never committed
export OUT_DIR=test-photos/private/s17/direct/phase2
sha256sum -c test-photos/s17-benchmark.sha256

# R1 — baseline: current Cloud Auto on the six tuning photos
GAMMA=1.5                STRENGTH=0.12156862745098039  npx tsx scripts/spikes/bread-spike.ts test-photos/licensed/01-aurora-fjord-kirkjufell.jpg
GAMMA=1.0503538133075825 STRENGTH=0.058823529411764705 npx tsx scripts/spikes/bread-spike.ts test-photos/licensed/02-aurora-frozen-lake-norway.jpg
GAMMA=1.1880581320820962 STRENGTH=0.08039215686274509  npx tsx scripts/spikes/bread-spike.ts test-photos/licensed/03-aurora-reykjanes-snow-lava.jpg
GAMMA=1.1                STRENGTH=0.1                  npx tsx scripts/spikes/bread-spike.ts test-photos/licensed/04-phone-whitehouse-iphone13pro.jpg
GAMMA=1.5                STRENGTH=0.1823529411764706   npx tsx scripts/spikes/bread-spike.ts test-photos/licensed/07-night-portrait.jpg
GAMMA=1.5                STRENGTH=0.15098039215686276  npx tsx scripts/spikes/bread-spike.ts test-photos/licensed/21-kangchenjunga.jpg

# R2 — EXIF probe (validation photo: orientation only)
GAMMA=1 STRENGTH=0.05 npx tsx scripts/spikes/bread-spike.ts test-photos/licensed/06-phone-rain-galaxys24ultra.jpg

# R3 — gamma-0.9 probe and the gamma-1.0 reproducibility arm
GAMMA=0.9 STRENGTH=0.05 npx tsx scripts/spikes/bread-spike.ts test-photos/licensed/01-aurora-fjord-kirkjufell.jpg
GAMMA=1.0 STRENGTH=0.05 npx tsx scripts/spikes/bread-spike.ts test-photos/licensed/01-aurora-fjord-kirkjufell.jpg
```

## Results

Filled in after the runs, by later commits than the one that adds this file.

**Run batch (2026-09-27, 21:11–21:13 UTC).** All nine runs went through the upload path on the
pinned version and succeeded. The maintainer checked every output's sha256 against its run
record. Seven runs needed a retry after a transient HTTP 429 (rate limit); none exceeded the limit
of two retries. Outputs and run records are in `test-photos/private/s17/direct/phase2/`.

### Baseline (R1) — tuning run log

The tuning run log lists tuning ids only (plan row 3.3). Phase 3 sweeps append here. Diagnostics
are over the whole frame; for these six photos the manifest ROI is the whole frame, so both regions
give the same numbers. Originals, for reference: V ≥ 0.90 is 2.3 % (S17-01), 0.4 % (02), 0.9 %
(03), 7.7 % (04), 4.7 % (07) and 0.3 % (21).

| Run                             | Photo  | Gamma / strength | Output (px) | Output sha256   | V ≥ 0.90 | Any = 255 | Mean RGB          | Maintainer rating |
| ------------------------------- | ------ | ---------------- | ----------- | --------------- | -------: | --------: | ----------------- | ----------------- |
| R1 `gtgcyj2jvhrgc0d0wjst5eygmw` | S17-01 | 1.5 / 0.1216     | 1536 × 1024 | `32df5342bd76…` |   77.1 % |    55.7 % | 0.727 0.879 0.615 | _pending_         |
| R1 `67nd84tvrnrgc0d0wjtvaqx2c8` | S17-02 | 1.0504 / 0.0588  | 1536 × 888  | `0736b27796cc…` |    3.6 % |     0.0 % | 0.629 0.646 0.599 | _pending_         |
| R1 `m2pqem43pdrgc0d0wjtt27zv3m` | S17-03 | 1.1881 / 0.0804  | 1536 × 1024 | `0de383cdadeb…` |    2.4 % |     0.0 % | 0.548 0.576 0.425 | _pending_         |
| R1 `573pb9njdsrgc0d0wjtt8m4dhc` | S17-04 | 1.1 / 0.1        | 1536 × 1152 | `cb4dac062e29…` |    9.2 % |     0.9 % | 0.503 0.487 0.457 | _pending_         |
| R1 `n4q8teq03nrge0d0wjts7sdds0` | S17-07 | 1.5 / 0.1824     | 1536 × 1024 | `795aee82def0…` |   66.6 % |    20.4 % | 0.865 0.825 0.706 | _pending_         |
| R1 `v4skbbrkjxrga0d0wjv8kjh90c` | S17-21 | 1.5 / 0.1510     | 1528 × 1016 | `f62d81862ce6…` |   83.4 % |    26.8 % | 0.872 0.865 0.894 | _pending_         |
| R3 `55r485b78nrga0d0wjvaaw9rrg` | S17-01 | 0.9 / 0.05       | 1536 × 1024 | `1cd590253d0f…` |    7.0 % |     2.2 % | 0.262 0.513 0.261 | —                 |
| R3 `fs4wfw4m8srg80d0wjvadn47v8` | S17-01 | 1.0 / 0.05       | 1536 × 1024 | `edec53305010…` |   15.2 % |     2.8 % | 0.323 0.584 0.306 | —                 |

Parameters above are rounded for display; the exact values sent are in § R1 and in each run
record. The full sha256 of every output is in its run record.

**Unexplained, recorded as observed:** S17-21's output is 1528 × 1016, not 1536 on the long edge
like the others. Its input is 6016 × 4000. Not investigated; it does not affect the premise
reading.

**Premise gate outcome:** _pending the maintainer's ratings._ They rate from the private sheet
`test-photos/private/s17/sheets/phase2-baseline/index.html`. The sheet shows the ICC-corrected
original, resized to the output's size (LANCZOS), beside the output. It shows no diagnostics.

### EXIF probe (R2)

Not part of the tuning run log. Orientation only; not rated, not measured for tuning.

Run `ebme649xrsrgc0d0wjv857kkrw`, S17-06 at gamma 1 / strength 0.05. The output is **1536 × 1152,
landscape**, while the photo displays as a portrait 4284 × 5712 (stored 5712 × 4284, EXIF
orientation 6). A thumbnail comparison shows that the output's content lies on its side, exactly
like the stored bytes, and not upright like the displayed photo.

**Reading (per R2): Bread ignores EXIF orientation.** As pre-registered, a separate change must be
registered via `/rune-new` and recorded in `change.md`, and Phase 5 waits until that fix is in
production. **Registered 2026-09-27 as `cloud-exif-orientation`**
(`context/changes/cloud-exif-orientation/`) and recorded in `change.md`.

Consequence outside S-17, inferred from the direct run and not yet observed in the app: the Cloud
upload `PUT`s the original bytes (`cloud-upload.client.ts:87-91`). A phone photo stored with
orientation 6 or 8 therefore very likely comes back from Cloud AI rotated 90° in production today.

### Gamma-0.9 probe (R3)

**Gamma 0.9: accepted.** Prediction `55r485b78nrga0d0wjvaaw9rrg` succeeded with a 1536 × 1024
image. **Reading (per R3): the Phase 3 gamma sweep includes 0.9.** The floor is chosen in Phase 3
on quality, not on acceptance. Diagnostics are in the tuning run log above.

**Gamma 1.0 reproducibility: byte-exact.** Prediction `fs4wfw4m8srg80d0wjvadn47v8` returned sha256
`edec533050106489b96ea503980ed557149d53e3ea7eda50f5752b53d69a097c`, identical to the 1.7 run
(`qdvmw9dvn5rga0d0wj2a074f18`). **Reading (per R3): byte reproducibility holds for S17-01 at full
resolution,** so the Phase 3 regression reference can rely on its sha-first check.
