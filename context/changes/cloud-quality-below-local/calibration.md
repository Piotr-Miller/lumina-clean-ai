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

| Run                               | Photo  | Gamma / strength | Output (px) | Output sha256   | V ≥ 0.90 | Any = 255 | Mean RGB          | Maintainer rating             |
| --------------------------------- | ------ | ---------------- | ----------- | --------------- | -------: | --------: | ----------------- | ----------------------------- |
| R1 `gtgcyj2jvhrgc0d0wjst5eygmw`   | S17-01 | 1.5 / 0.1216     | 1536 × 1024 | `32df5342bd76…` |   77.1 % |    55.7 % | 0.727 0.879 0.615 | harm: washed out              |
| R1 `67nd84tvrnrgc0d0wjtvaqx2c8`   | S17-02 | 1.0504 / 0.0588  | 1536 × 888  | `0736b27796cc…` |    3.6 % |     0.0 % | 0.629 0.646 0.599 | harm: washed out              |
| R1 `m2pqem43pdrgc0d0wjtt27zv3m`   | S17-03 | 1.1881 / 0.0804  | 1536 × 1024 | `0de383cdadeb…` |    2.4 % |     0.0 % | 0.548 0.576 0.425 | harm: washed out              |
| R1 `573pb9njdsrgc0d0wjtt8m4dhc`   | S17-04 | 1.1 / 0.1        | 1536 × 1152 | `cb4dac062e29…` |    9.2 % |     0.9 % | 0.503 0.487 0.457 | harm: washed out              |
| R1 `n4q8teq03nrge0d0wjts7sdds0`   | S17-07 | 1.5 / 0.1824     | 1536 × 1024 | `795aee82def0…` |   66.6 % |    20.4 % | 0.865 0.825 0.706 | harm: washed out, lost detail |
| R1 `v4skbbrkjxrga0d0wjv8kjh90c`   | S17-21 | 1.5 / 0.1510     | 1528 × 1016 | `f62d81862ce6…` |   83.4 % |    26.8 % | 0.872 0.865 0.894 | harm: washed out, lost detail |
| R3 `55r485b78nrga0d0wjvaaw9rrg`   | S17-01 | 0.9 / 0.05       | 1536 × 1024 | `1cd590253d0f…` |    7.0 % |     2.2 % | 0.262 0.513 0.261 | —                             |
| R3 `fs4wfw4m8srg80d0wjvadn47v8`   | S17-01 | 1.0 / 0.05       | 1536 × 1024 | `edec53305010…` |   15.2 % |     2.8 % | 0.323 0.584 0.306 | —                             |
| P3-γ `7gdwtxqtfdrge0d0wkesg4w3ew` | S17-01 | 1.1 / 0.05       | 1536 × 1024 | `3d995cf0aac6…` |   31.1 % |     8.1 % | 0.398 0.659 0.357 | harm: washed out              |
| P3-γ `f1qz149695rg80d0wkh9b2nhtr` | S17-01 | 1.2 / 0.05       | 1536 × 1024 | `9867e7caa639…` |   44.2 % |    18.4 % | 0.481 0.729 0.415 | harm: washed out              |
| P3-γ `y359x6vmd1rg80d0wkh9cavk58` | S17-01 | 1.3 / 0.05       | 1536 × 1024 | `a460a64cf3be…` |   57.0 % |    32.0 % | 0.569 0.787 0.476 | harm: washed out              |
| P3-γ `9d904wp0j5rge0d0wkhbmwan98` | S17-01 | 1.5 / 0.05       | 1536 × 1024 | `20fa39c38111…` |   76.8 % |    54.3 % | 0.716 0.877 0.595 | harm: washed out              |
| P3-γ `4h8wvk0aj5rgc0d0wkhr5eg0fg` | S17-02 | 0.9 / 0.05       | 1536 × 888  | `3efd3aa1dfb1…` |    2.2 % |     0.0 % | 0.545 0.563 0.516 | harm: washed out              |
| P3-γ `vwmq8etjnnrga0d0wkhvmhntew` | S17-02 | 1 / 0.05         | 1536 × 888  | `7310f6114d6c…` |    3.0 % |     0.0 % | 0.599 0.616 0.570 | harm: washed out              |
| P3-γ `9xvxy1csj1rgc0d0wkhrh9z92m` | S17-02 | 1.1 / 0.05       | 1536 × 888  | `4cfe9186dcb9…` |    4.5 % |     0.0 % | 0.657 0.673 0.626 | harm: washed out              |
| P3-γ `b31n6bq0csrgc0d0wkhv2q8p1m` | S17-02 | 1.2 / 0.05       | 1536 × 888  | `ae9d894a388d…` |   17.0 % |     0.0 % | 0.706 0.721 0.672 | harm: washed out              |
| P3-γ `s0x4ae997srgc0d0wkjbachtvw` | S17-02 | 1.3 / 0.05       | 1536 × 888  | `4aef29e39fc7…` |   30.5 % |     0.0 % | 0.741 0.755 0.704 | harm: washed out              |
| P3-γ `qy63sz3hanrgc0d0wkjam7jh3m` | S17-02 | 1.5 / 0.05       | 1536 × 888  | `07c50a8911ee…` |   51.7 % |     0.0 % | 0.794 0.806 0.754 | harm: washed out              |
| P3-γ `7ywaz5dsjdrge0d0wkja66n0cg` | S17-03 | 0.9 / 0.05       | 1536 × 1024 | `0f221b0a157d…` |    0.2 % |     0.0 % | 0.388 0.418 0.280 | harm: washed out              |
| P3-γ `mxv380g209rge0d0wkjsnqyfjc` | S17-03 | 1 / 0.05         | 1536 × 1024 | `b56f56052a83…` |    0.4 % |     0.0 % | 0.435 0.466 0.321 | harm: washed out              |
| P3-γ `wqk7v9tehhrgc0d0wkjvdymds4` | S17-03 | 1.1 / 0.05       | 1536 × 1024 | `a3bc45f6bd82…` |    0.5 % |     0.0 % | 0.491 0.521 0.371 | harm: washed out              |
| P3-γ `7kw54wcq3srga0d0wkjtm86qt8` | S17-03 | 1.2 / 0.05       | 1536 × 1024 | `ef3f1a714e9e…` |    2.5 % |     0.0 % | 0.554 0.582 0.430 | harm: washed out              |
| P3-γ `ryvz0eq17drga0d0wkjvkr44xg` | S17-03 | 1.3 / 0.05       | 1536 × 1024 | `4b51d1059683…` |    9.9 % |     0.0 % | 0.620 0.644 0.492 | harm: washed out              |
| P3-γ `20769cscgdrga0d0wkk8taea3m` | S17-03 | 1.5 / 0.05       | 1536 × 1024 | `ea3a3f653a3d…` |   34.9 % |     0.0 % | 0.734 0.757 0.606 | harm: washed out              |
| P3-γ `g45qwxbms5rgc0d0wkk869cmbc` | S17-04 | 0.9 / 0.05       | 1536 × 1152 | `a84f66a5e5b5…` |    8.4 % |     0.8 % | 0.394 0.379 0.353 | harm: washed out              |
| P3-γ `rpc63sdv4xrge0d0wkkan2jrjr` | S17-04 | 1 / 0.05         | 1536 × 1152 | `37dfe7bec649…` |    8.7 % |     0.8 % | 0.442 0.427 0.398 | harm: washed out              |
| P3-γ `vnjzw7r0qhrgc0d0wkkt67st5c` | S17-04 | 1.1 / 0.05       | 1536 × 1152 | `f003db8d7909…` |    9.0 % |     0.8 % | 0.499 0.483 0.453 | harm: washed out              |
| P3-γ `pq18qyt96hrge0d0wkkszryy7w` | S17-04 | 1.2 / 0.05       | 1536 × 1152 | `9b726967ed7f…` |   10.2 % |     0.9 % | 0.567 0.551 0.518 | harm: washed out              |
| P3-γ `hh2s0f4pcdrgc0d0wkkvkpcmmg` | S17-04 | 1.3 / 0.05       | 1536 × 1152 | `4f286735a2c8…` |   37.5 % |     0.9 % | 0.632 0.615 0.582 | harm: washed out              |
| P3-γ `jhg1ehyzy9rgc0d0wkksfmkacw` | S17-04 | 1.5 / 0.05       | 1536 × 1152 | `96f38ddf84fc…` |   50.5 % |     1.0 % | 0.704 0.688 0.653 | harm: washed out              |
| P3-γ `x5jw1p975hrge0d0wkm897fy58` | S17-07 | 0.9 / 0.05       | 1536 × 1024 | `ab2118ce7729…` |    7.1 % |     4.7 % | 0.398 0.318 0.236 | improvement                   |
| P3-γ `601y1mbkehrga0d0wkm93b1a9m` | S17-07 | 1 / 0.05         | 1536 × 1024 | `a7d81ea9be7d…` |    8.6 % |     5.3 % | 0.462 0.382 0.294 | harm: washed out              |
| P3-γ `efc85axvk9rga0d0wkmbttn6bw` | S17-07 | 1.1 / 0.05       | 1536 × 1024 | `d38f2a407233…` |   11.5 % |     5.9 % | 0.536 0.457 0.363 | harm: washed out              |
| P3-γ `wntpd68469rgc0d0wkmshc9d00` | S17-07 | 1.2 / 0.05       | 1536 × 1024 | `d877f4cfa3d4…` |   19.7 % |     7.3 % | 0.620 0.544 0.444 | harm: washed out              |
| P3-γ `eydtbq2h1nrg80d0wkmsmtwzd4` | S17-07 | 1.3 / 0.05       | 1536 × 1024 | `96bb9fe9159e…` |   35.9 % |     9.3 % | 0.711 0.641 0.523 | harm: washed out              |
| P3-γ `vxb0cwwqr5rg80d0wkmrpjfvwg` | S17-07 | 1.5 / 0.05       | 1536 × 1024 | `d15555d4498b…` |   65.2 % |    16.0 % | 0.858 0.814 0.672 | harm: washed out              |
| P3-γ `ke92maf6z5rga0d0wkmtd0tjmm` | S17-21 | 0.9 / 0.05       | 1528 × 1016 | `13137e0ec6a0…` |    0.8 % |     0.1 % | 0.409 0.403 0.577 | harm: washed out              |
| P3-γ `kysppe247hrg80d0wkn91xbt64` | S17-21 | 1 / 0.05         | 1528 × 1016 | `08dbac8af2be…` |    0.8 % |     0.1 % | 0.489 0.491 0.634 | harm: washed out              |
| P3-γ `8qbdwacj99rga0d0wkn8m67ssm` | S17-21 | 1.1 / 0.05       | 1528 × 1016 | `6777cff0dbab…` |   21.0 % |     0.1 % | 0.592 0.593 0.701 | harm: washed out              |
| P3-γ `hcgpa4q4w5rgc0d0wknb3xz3hr` | S17-21 | 1.2 / 0.05       | 1528 × 1016 | `9546923a99d0…` |   52.8 % |     0.3 % | 0.704 0.696 0.771 | harm: washed out              |
| P3-γ `mg73y7hs5xrgc0d0wknt8ssy1g` | S17-21 | 1.3 / 0.05       | 1528 × 1016 | `3401831de8e6…` |   66.4 % |     0.6 % | 0.777 0.766 0.820 | harm: washed out              |
| P3-γ `ttrfv8ccahrg80d0wknskg7anm` | S17-21 | 1.5 / 0.05       | 1528 × 1016 | `05a421c413b3…` |   83.1 % |    21.3 % | 0.865 0.858 0.890 | harm: washed out              |

Parameters above are rounded for display; the exact values sent are in § R1 and in each run
record. The full sha256 of every output is in its run record.

**Unexplained, recorded as observed:** S17-21's output is 1528 × 1016, not 1536 on the long edge
like the others. Its input is 6016 × 4000. Not investigated; it does not affect the premise
reading.

**Maintainer ratings (2026-09-27).** The maintainer reviewed all six pairs personally on the
private sheet `test-photos/private/s17/sheets/phase2-baseline/index.html`, at matched size. They
adopted the wording an agent had drafted as their own rating. The agent's draft alone was not
accepted as a rating.

| Photo  | Rating                        | Visible problem                                                         |
| ------ | ----------------------------- | ----------------------------------------------------------------------- |
| S17-01 | harm: washed out              | Sky and aurora lose structure; the night landscape turns almost white.  |
| S17-02 | harm: washed out              | The dark sky turns light grey; the aurora loses contrast.               |
| S17-03 | harm: washed out              | Sky and shore are too bright; the night character of the scene is gone. |
| S17-04 | harm: washed out              | The black sky turns grey, though the building was already legible.      |
| S17-07 | harm: washed out, lost detail | Faces, neon signs and the pavement are burnt out.                       |
| S17-21 | harm: washed out, lost detail | The sky is almost white; mountains and lights lose legibility.          |

**Premise gate outcome (R1): PROCEED.** All six outputs are rated as washed-out harm, so the
calibration premise holds at full resolution and Phase 3 may start once its entry gate is met.
These ratings judge the **raw** Bread output. The downloaded app result (post-pass ON, see § Post-pass
flag state) is still checked in Phase 3's app-path check.

**Observation, not a reading.** The harm is not confined to the photos where Auto reached gamma
1.5. S17-02 (gamma 1.05) and S17-04 (gamma 1.1) were also washed out, although their V ≥ 0.90
shares stayed low (3.6 % and 9.2 %): the grey-sky harm shows in the mean, not in clipping. R3's
S17-01 run at gamma 1.0 still reached 15.2 % V ≥ 0.90. This is why the gamma-0.9 arm and the
strength sweep matter in Phase 3. No reading is changed by this note.

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

## Phase 3 — pre-registered procedure

Committed **before the first Phase 3 sweep output exists** (plan row 3.1). Entry gate, checked
2026-09-27: 2.3 premise gate **proceed**, 2.4 EXIF outcome recorded, 2.5 gamma-0.9 **accepted**,
2.6 flag state **ON**. Tuning photos only: S17-01, 02, 03, 04, 07, 21. Every Phase 3 run is
appended to the tuning run log above (§ Baseline (R1)), labelled `P3-γ`, `P3-s` or `P3-final`.

### Stop condition

_If no single rule over the existing `LumaStats` fields lands inside every tuning photo's
acceptable range, stop and report — do not add per-photo constants to make it fit._ Reaching it is
a finding, not a failure: it is recorded here and in `change.md`, and the maintainer decides what
follows. It is also reached when any photo's acceptable range is **empty** (P2, P3).

### P1 — Gamma sweep

Strength `0.05`; gamma ∈ {`0.9`, `1.0`, `1.1`, `1.2`, `1.3`, `1.5`} on the six photos. S17-01's
`0.9` and `1.0` are **reused** from R3 (the `1.0` output is byte-reproducible, R3), so 34 new runs.
Outputs: `test-photos/private/s17/direct/phase3/gamma/`.

### P2 — Preferred gamma and acceptable range

The maintainer rates every output against its original on the contact sheet
(`scripts/s17/contact-sheet.py`, original and outputs at the output's size, each labelled with its
parameters and diagnostics), with the R1 categories: _improvement_ / _no harm_ / _harm_ (kind named).
As in Phase 2, an agent's draft is not a rating until the maintainer adopts it as their own.

- **Acceptable range** = the swept values rated improvement or no harm. A value **between** two
  adjacent acceptable swept values counts as acceptable; P5 checks the actual pair.
- **Preferred** = one swept value the maintainer names.
- **Non-contiguous** (e.g. 0.9 and 1.2 acceptable, 1.1 harm) → not read; back to the maintainer
  before fitting.
- **Acceptable at 0.9, the lowest swept value** → recorded as _open below 0.9_. S-17 does not go
  below 0.9: the pinned version was probed only there, and there is no output evidence lower. If
  the preferred value is 0.9, that is a stated limit of the calibration.
- **Empty range** (every swept gamma is harm) → the stop condition.

### P3 — Strength sweep

At each photo's preferred gamma: strength ∈ {`0.05`, `0.10`, `0.20`} plus the photo's current Auto
strength (§ R1). `0.05` is reused from P1. An Auto strength equal to a grid value (S17-04: `0.1`) is
not run twice, so at most 18 new runs. Outputs: `test-photos/private/s17/direct/phase3/strength/`.
The maintainer marks preferred and acceptable strength with the P2 rules; the range is bounded by
`0.0`–`0.2` (`PARAM_RANGES.cloud.strength`, the model's contract).

### P4 — Fit

- **Inputs.** The `LumaStats` fields of the tuning source (§ Fixed inputs), and `baseGamma(stats)`,
  which is an existing function of them and stays unchanged. Nothing else.
- **Families, simplest first, per output (gamma and strength separately).** F0 a constant;
  F1 `clamp(a + b·x, lo, hi)` for one input `x`. The simplest family that lands inside every
  photo's range wins. Nothing beyond F1 is tried without a recorded maintainer decision — that is
  the stop condition, not an invitation to add terms.
- **Guards.** The existing highlight guard (`p95 > 0.85`) and clip guard (`clipRatio > 0.005`) may
  be kept or dropped. **No new threshold** may be introduced whose only effect on the six photos is
  to change one photo's output: that is a per-photo constant in disguise.
- **Monotone in darkness.** Darker input never gives a lower gamma or strength: non-increasing in
  every brightness statistic the rule reads (`mean`, percentiles), non-decreasing in `shadowRatio`
  and in `baseGamma`.
- **Choice among fits.** Minimise Σ over the six photos of `((γ − γ_pref) / 0.1)² + ((s − s_pref) / 0.05)²`
  (the sweep steps). Ties → fewer inputs, then `p50` over other fields.
- **Bounds.** Gamma ≥ `0.9` (P2), ≤ `1.5`; strength within `0.0`–`0.2`.
- The fit's arithmetic and each photo's resulting pair are written here, so the choice can be
  recomputed from the ranges and the tuning source.

### P5 — Final-pair check

The fitted rule's own unrounded (gamma, strength) on each of the six photos: 6 direct runs, no
further grid. Outputs: `test-photos/private/s17/direct/phase3/final/`. The maintainer rates each
against its original. **Any harm → not frozen.** The harmful pair is recorded; a refit must exclude
it and stays under the stop condition.

### P6 — App-path check (post-pass ON)

The flag is ON (§ Post-pass flag state), so users download a post-passed JPEG. Each tuning photo
is run in the production app, the **downloaded** file rated against its original, and per run are
recorded: job id, persisted gamma/strength, downloaded file name, format, and whether the post-pass
was applied (a PNG with the flag ON means a fallback). Any harm → not frozen. The cap stays at 3
(global, 00:00 UTC reset); six jobs take about two days. The cap is **not** raised for this.

Before Phase 4 the candidate is not deployed, so Auto is switched off and the sliders are set by
hand. The sliders move in `0.05` steps: each fitted value is set to its nearest slider step, and
the rounded values are recorded next to the exact ones.

**Fitted gamma below 1.0** (maintainer decision, 2026-09-27). Production rejects gamma < 1.0
(`photo-job.schema.ts:31` → HTTP 400; slider minimum 1.0), so such a photo cannot be checked in the
app before Phase 4 ships the lower floor. For those photos only:

- the rule is frozen (P8) on their direct final-pair result plus the app-path check of the photos
  whose fitted gamma is ≥ 1.0, and the freeze record names the photos still owed an app-path check;
- their app-path check runs right after the Phase 4 deploy, on the shipped Auto, as an **extra
  gate before Phase 5** — no validation run starts until it is recorded;
- any harm there **unfreezes** the rule: the refit returns to P4, and the shipped Auto is reverted
  or replaced before Phase 5.

### P7 — Floor

If the rule produces gamma < 1.0 on any photo, `PARAM_RANGES.cloud.gamma.min` and the zod minimum
are set in Phase 4 to the rule's own lower bound, which is never below `0.9`. Otherwise both stay
`1.0`.

### P8 — Regression reference and freeze

- S17-01's P5 output is the candidate reference. The maintainer accepts it visually and sets its
  numeric tolerances at acceptance, **for this image only**; `regression-s17-01.json` records the
  input sha256, the exact parameters, the output sha256, mean RGB, V ≥ 0.90, any-channel-255, hue
  shares and the tolerances.
- The rule — formula and coefficients — is written here and committed. That commit's SHA is recorded
  as the frozen rule before Phase 4 starts. No validation output is opened before that commit.

### Readings fixed now

- A photo whose preferred gamma is the lowest swept value, **and** whose 0.9 output is still rated
  harm, has an empty range → the stop condition. The sweep is not extended below 0.9 in S-17.
- If the fitted rule is **F0 in gamma** (one constant for all six), Cloud Auto no longer adapts
  gamma to the photo. That is a legitimate outcome and is recorded as such, not as a failure to fit.
- The exposure diagnostics stay diagnostics. No threshold on V ≥ 0.90, any-channel-255 or mean is
  used to accept, reject or fit anything.

### P1 commands

For the maintainer's shell, from the repository root, with their own token. The first call after
idle can take over two minutes. A run is retried at most twice; each attempt's log goes to
`logs/`.

```bash
export REPLICATE_API_TOKEN=r8_…            # your token; never committed
sha256sum -c test-photos/s17-benchmark.sha256
export OUT_DIR=test-photos/private/s17/direct/phase3/gamma
mkdir -p "$OUT_DIR/logs"

run() {  # run <label> <photo path>  (GAMMA and STRENGTH from the environment)
  for attempt in 1 2 3; do
    npx tsx scripts/spikes/bread-spike.ts "$2" > "$OUT_DIR/logs/$1-attempt-$attempt.log" 2>&1 \
      && grep -q '^run record' "$OUT_DIR/logs/$1-attempt-$attempt.log" && return 0
    echo "$1: attempt $attempt failed — see $OUT_DIR/logs/$1-attempt-$attempt.log"; sleep 15
  done
  return 1
}

declare -A PHOTO=(
  [S17-01]=test-photos/licensed/01-aurora-fjord-kirkjufell.jpg
  [S17-02]=test-photos/licensed/02-aurora-frozen-lake-norway.jpg
  [S17-03]=test-photos/licensed/03-aurora-reykjanes-snow-lava.jpg
  [S17-04]=test-photos/licensed/04-phone-whitehouse-iphone13pro.jpg
  [S17-07]=test-photos/licensed/07-night-portrait.jpg
  [S17-21]=test-photos/licensed/21-kangchenjunga.jpg
)
for id in S17-01 S17-02 S17-03 S17-04 S17-07 S17-21; do
  for g in 0.9 1.0 1.1 1.2 1.3 1.5; do
    [ "$id" = S17-01 ] && { [ "$g" = 0.9 ] || [ "$g" = 1.0 ]; } && continue   # reused from R3
    GAMMA=$g STRENGTH=0.05 run "P3g-$id-g$g" "${PHOTO[$id]}" || echo "UNRESOLVED: $id gamma $g"
  done
done

# Contact sheets (S17-01's reused R3 runs come from phase2/; S17-06 there is skipped unopened)
python3 scripts/s17/contact-sheet.py --name phase3-gamma --markdown \
  --run test-photos/private/s17/direct/phase2 --run "$OUT_DIR"
```

The contact-sheet command above also picks up the six R1 baseline outputs in `phase2/` (at their
Auto strengths). They stay on the sheet as context; only the strength-`0.05` outputs are rated for
P2.

## Phase 3 — results

Filled in after the runs, by later commits than the pre-registration (`253eaff`).

### P1 — Gamma sweep (run 2026-09-27/28)

All 34 new runs succeeded on the first attempt, on the pinned version, through the upload path.
Their rows are labelled `P3-γ` in the tuning run log above. S17-01's `0.9` and `1.0` are the
reused R3 runs. The contact sheet `test-photos/private/s17/sheets/phase3-gamma/` holds six photos
and 42 outputs, the R1 baselines included. S17-06's EXIF-probe run in `phase2/` was skipped
without being opened. Every output's sha256 matched its run record when the sheet was built.

### P2 — Maintainer ratings at strength 0.05 (2026-09-28)

An agent drafted the ratings from the sheet. The maintainer then viewed the sheet themselves,
agreed with every rating and adopted them as their own, as in Phase 2. "Least harmful" is the value
that did the least damage. It is **not** a preferred value in the P2 sense, which exists only
inside a non-empty range.

| Photo  | Sweep result                                                         | Least harmful γ | Acceptable range |
| ------ | -------------------------------------------------------------------- | --------------- | ---------------- |
| S17-01 | Every value brightens the sky and weakens the aurora's structure     | 0.9             | empty            |
| S17-02 | Every value brightens the night sky and lowers the aurora's contrast | 0.9             | empty            |
| S17-03 | Every value washes out the sky and the aurora's colours              | 0.9             | empty            |
| S17-04 | Even 0.9 turns the black sky grey                                    | 0.9             | empty            |
| S17-07 | 0.9 makes the people more legible; from 1.0 the scene is too bright  | 0.9             | 0.9, open below  |
| S17-21 | Every value washes out the night sky; higher values also lose detail | 0.9             | empty            |

This covers S17-01's reused R3 outputs too: both `0.9` and `1.0` are rated harm (washed out).

### Outcome — stop condition reached (2026-09-28)

**Five of the six tuning photos have an empty acceptable range.** Every swept gamma, down to the
`0.9` floor of the sweep, is harm at strength `0.05`. By the pre-registered readings (§ Stop
condition, § Readings fixed now), this is the stop condition, reached at P2. Per the procedure,
none of the following happened:

- the P3 strength sweep was not run: it is defined at a preferred gamma, and five photos have none;
- no rule was fitted;
- the sweep was not extended below `0.9`.

**What this means, and what it does not.** Within the parameter space S-17 set out to calibrate,
Bread's gamma ≥ 0.9 at strength 0.05, **no Cloud Auto setting avoids washing out five of the six
tuning photos**. The defect is therefore not a badly chosen Auto recommendation that a better
formula over the existing statistics could fix. Three things are **not** established by it:

- **gamma below 0.9.** The pinned version accepted 0.9 (R3), but nothing lower was probed or run.
  The monotone trend on the sheet (brighter at every step up) makes a lower value the obvious next
  question, not a known answer.
- **Other strengths.** Strength was held at 0.05. Strength is Bread's denoise weight, not an
  exposure control in the plan's model, so it is not expected to undo the brightening. That is an
  expectation, not a measurement.
- **The downloaded app result.** These are raw outputs; the post-pass (ON) was not applied. It
  works on chroma, not exposure, so it is not expected to change a washed-out rating. Also not
  measured.

What follows is the maintainer's decision, recorded in `change.md` when made. Phases 4–6 of the
plan assume a fitted rule and do not start from this state.

## Phase 3 amendment — gamma below 0.9 (pre-registered 2026-09-28)

Maintainer decision A, 2026-09-28 (`change.md` § Decision — 2026-09-28). Committed **before any
output below 0.9 exists**. It supersedes, for exactly the two values below, the line in § Readings
fixed now that says the sweep is not extended below 0.9. Everything else in the Phase 3 procedure
stands.

### A1 — Runs

Strength `0.05`; gamma ∈ {`0.5`, `0.7`} on the six tuning photos (S17-01, 02, 03, 04, 07, 21):
12 new direct runs, appended to the tuning run log labelled `P3-γlow`. Outputs:
`test-photos/private/s17/direct/phase3/gamma-low/`. The existing ratings at `0.9`–`1.5` are not
re-rated.

**Acceptance of the value by the model** (as R3). The pinned version has output evidence only down
to `0.9`:

- _The prediction succeeds with an image_ → the output is rated (A2).
- _Rejected as invalid input (HTTP 422, or a create-time validation error naming `gamma`)_ → that
  value is not available; it is recorded, not rated, and the reading (A3) uses the values that
  remain.
- An infrastructure failure (network, 5xx, 429, timeout) is not a reading: retry up to twice and
  log it.

### A2 — Rating

The maintainer rates each output against its original on the contact sheet, in the R1 categories.
An agent's draft is not a rating until the maintainer adopts it. The basis is the original, **not**
the `0.9` output:

- the night character, the colours and the detail are kept, **and**
- the result gives a useful gain in legibility.

**Acceptable here means rated _improvement_ in the R1 sense.** "Less washed out than 0.9" is not
enough. A darker result that is merely not worse than 0.9, or _no harm_ without a useful gain, is
not acceptable for this amendment.

### A3 — Reading

For each photo, its acceptable values are the ones among {`0.5`, `0.7`, `0.9`} rated acceptable
(S17-07's `0.9` rating, _improvement_, stands).

- **Any photo with no acceptable value → stop.** Calibration ends here; the maintainer returns to
  the B/C decision (`change.md`). Nothing is fitted and no strength is swept.
- **All six photos have at least one acceptable value →** the P2 rules apply to the widened grid
  (preferred value named by the maintainer, non-contiguous → back to the maintainer, a value between
  two adjacent acceptable swept values counts as acceptable). Phase 3 resumes at **P3 (strength
  sweep)** at each photo's preferred gamma.
- **Acceptable at `0.5`, the lowest value** → recorded as _open below 0.5_. S-17 does not go lower.

Resuming P3 is **not** evidence that Auto can set gamma per photo. The P4 stop condition — one rule
over the existing `LumaStats` fields inside every photo's range — is untouched and still decides.

### A4 — Consequences for later rows if Phase 3 resumes

- **P4 bounds:** gamma ≥ the lowest value with output evidence that was run here (`0.5`, or `0.7`
  if `0.5` was rejected), instead of `0.9`.
- **P7 floor:** the Phase 4 floor (`PARAM_RANGES.cloud.gamma.min` and the zod minimum in
  `photo-job.schema.ts`) is the rule's own lower bound, never below that same value. The slider
  range widens with it (plan Phase 4 § 2).
- **P6:** photos whose fitted gamma is below 1.0 follow the existing sub-1.0 app-path rule.

### A5 — Commands

As § P1 commands (same `run()` helper and `PHOTO` map), with:

```bash
export OUT_DIR=test-photos/private/s17/direct/phase3/gamma-low
mkdir -p "$OUT_DIR/logs"
for id in S17-01 S17-02 S17-03 S17-04 S17-07 S17-21; do
  for g in 0.5 0.7; do
    GAMMA=$g STRENGTH=0.05 run "P3glow-$id-g$g" "${PHOTO[$id]}" || echo "UNRESOLVED: $id gamma $g"
  done
done

python3 scripts/s17/contact-sheet.py --name phase3-gamma-low --markdown \
  --run test-photos/private/s17/direct/phase3/gamma --run "$OUT_DIR"
```
