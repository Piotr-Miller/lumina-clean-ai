# Bread-at-its-own-defaults experiment

> Decided 2026-09-20 after `research.md`. Two real cloud runs, ~$0.0006 total,
> 2 of the 3 daily cap slots. **No code change is needed** — both parameter values
> are reachable from the production slider with Auto off.
>
> **Do not plan the SCI migration until this returns** (user decision, 2026-09-20).
> Whatever the outcome, the next change is the deterministic quality gate
> (`research.md` Open Question 6), independent of which engine is finally chosen.

## What this settles

| Outcome                                          | Reading                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Aurora improves at `gamma 1.0` / `strength 0.05` | We were **mis-driving the model**. Fix is ours: widen/retune `PARAM_RANGES.cloud` and the Auto branch. |
| Aurora still wrong, control photo fine           | The fault is **saturation/chroma-dependent**. Options: gate or warn on that input class, or swap.      |
| Both wrong                                       | Bread is unfit generally → the **SCI migration plan is justified**.                                    |

⚠️ **Superseded as a reading of Run A (2026-09-26).** This table assumes each run moves one variable.
Run A moved three — source size, parameters and the scene itself — so its clean result lands in the
first row's cell without licensing that row's conclusion. It does **not** show that we were
mis-driving the model. See § Run A — measured.

## Why these values

Replicate's schema for `mingcv/bread` (verified 2026-09-20): `gamma` **default 1.0**,
max 1.5; `strength` **default 0.05**, max 0.2. Ours are `BREAD_GAMMA = 1.2` and
`BREAD_STRENGTH = 0.2` — the latter is 4× the model default and exactly its ceiling.
Auto pins gamma to **1.50** on any photo with `p50 < 0.164`, i.e. every night photo. _(Overstated —
the p95 and clipping guards lower or cap it; exact conditions in § Direct runs, Reading 2.)_
`gamma` scales the illumination map, which is also the weight deciding how much of
the **original** colour survives the colour net — so the setting we have been
shipping maximises both blow-out and colour-net authority. The model has never been
run from this app at its documented operating point.

## Protocol

For **each** of the two runs, on <https://luminacleanai.com>, signed in:

1. Keep the **source file** on disk before uploading — `source.*` is reaped at 24 h
   (`20260614120000_reaper_stale_source_paths.sql:37`), so the input is **not**
   recoverable afterwards. Results are never reaped.
2. Select Cloud AI, upload, then **turn Auto OFF** and set the sliders by hand:
   **gamma `1.00`** (leftmost) and **strength `0.05`** (one step from the left).
3. Screenshot the panel before submitting, so the parameters are on the record.
4. Submit. Note the time.
5. Afterwards, record the job row and download the **raw** stored result — the
   before/after pane is post-passed; the stored object is the model's own bytes:

   ```sql
   select id, gamma, strength, result_path, model_version, created_at
   from public.jobs
   where created_at >= current_date
   order by created_at desc;
   ```

   Then Supabase Dashboard → Storage → `photos` → the `result_path`.

### ⚠️ Redesigned 2026-09-22 — the two runs now complete a 2×2, they are not two samples

The colour check on the three large-source production results
(`result-dimensions-census.md`) filled in half the square and exposed a confound in the original
design. Two variables were moving together the whole time: **scene saturation** and **source size**.

|                           | **saturated green**                                                                                  | **low chroma**                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **small source (≤ 1536)** | **FAILS** — the aurora, all three S-17 screenshots                                                   | **Run B**                                                                                                                                 |
| **large source (> 1536)** | **Run A** `7ea011bd` — clean, but a different scene at different parameters (see § Run A — measured) | **EMPTY, not clean** — `bcff4e39`/`c560b9d4` are byte-identical and carry **no colour at all**; `3f219e67` is a sunset with **0 % green** |

Every observed failure is saturated green **and** small. ⚠️ **Corrected 2026-09-24:** the large-source runs were first read as "clean", but measuring their raw outputs (`references/README.md`) shows none of them can exhibit the fault — two are near-black frames with no colour whatsoever, the third is a sunset with zero green. A green→magenta flip needs green. As of 2026-09-24 no large-source run had carried a saturated green scene, so that cell was untested rather than clean. ⚠️ **Updated 2026-09-26:** Run A (`7ea011bd`) has since filled it — a saturated green aurora at 3840×2560, clean. It is a different scene at different parameters from the failing baselines, so it still does not eliminate either hypothesis; see § Run A — measured.

Size is not the implausible one it first appears. Bread resizes internally to ≤ 1536, so a ~900 px
source arrives at roughly its native scale while a 4000 px source is downscaled ~2.6× first — and
that downscale **averages shadow chroma noise before the model ever sees it**. The network's input is
materially different in the two cases.

### Run A — the aurora at a FULL-RESOLUTION source (planned as the decisive cell)

⚠️ **Corrected 2026-09-26 — the premise of this section did not hold.** It was written expecting the
same aurora scene as the baselines at full resolution. The input actually used,
`test-photos/licensed/01-aurora-fjord-kirkjufell.jpg`, is a **different photograph**: Kirkjufell, not
the Lofoten beach in `references/07`. It is also run at gamma 1.00 / strength 0.05, not the baseline's
1.16 / 0.08. So Run A does **not** separate saturation from size, and the two readings below do not
apply to it as written. The original text is kept for the record:

> The same aurora scene as `references/02-aurora-water-green-to-magenta.png`, but **a full-resolution
> original, not the 0.54 MP web copy** that every prior trial used. This is the single run that
> separates saturation from size.
>
> - **Clean** → size, or the interaction, is doing the work. The fault may not reach real users at
>   all, which changes the model decision completely.
> - **Magenta** → saturation, confirming the frame's hypothesis on evidence that is finally
>   representative.

_Superseded 2026-09-26: the two readings above assumed a same-scene, same-parameter run and are **not**
the current conclusion. For what Run A's clean result does and does not show, see § Run A — measured._

Baselines to compare against, all the **same small** aurora and all magenta: `239a4631` (2026-06-08),
`55550cf1` (06-13), `42520013` (06-18), and `190832de` (08-31, gamma 1.16 / strength 0.08). Their
results are 896×600; note that a full-resolution run returns ~1536 px on the long edge, so compare
at matched scale.

### Run B — a low-chroma night photo at a SMALL source (completes the square)

A night photo with no strong green, **downsized to under 1536 px on the long edge** so it matches the
failing cell on size while differing on saturation.

⚠️ **The original rationale for this run was wrong and is corrected here.** It read: "all 18 stored
results are the same saturated aurora, so nothing in production distinguishes 'Bread is broken' from
'Bread is broken on saturated green'." The census disproved that — **three** of the 18 came from
large sources (though what they show is untested rather than clean — see above), and the small ones are at least two distinct images
(896×600 and 768×512). The large + low-chroma cell is therefore already answered, and what Run B
still adds is the **small + low-chroma** cell.

**Run A is the one that matters. If only one run can be afforded, spend it there.** _(Written before
Run A. It has now run and, for the reasons in § Run A — measured, the next slot is better spent on the
size control proposed there than on Run B.)_

## Results

Fill in as the runs complete. Attach the downloaded `result.png` for each under
`references/` with a name that states the parameters.

| Run | Source                                                   | gamma | strength         | Job id                 | Result size | Verdict on hue                                    | Verdict on exposure/noise                                                         |
| --- | -------------------------------------------------------- | ----- | ---------------- | ---------------------- | ----------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| A   | aurora, **Kirkjufell** — not the baseline scene          | 1.00  | 0.05             | `7ea011bd`             | 1536×1024   | **clean — 0.0 % magenta** in every luminance band | brightened (mean 0.12 → 0.40); painterly texture in the sky, dark corner vignette |
| C   | Kirkjufell **downsized to 896×597** (size control for A) | 1.00  | 0.05             | `04e57d16`             | 896×592     | **clean — 0.0 % magenta** in every luminance band | brightened (mean 0.12 → 0.44); same texture as A at smaller scale                 |
| D   | Kirkjufell 896×597, **direct call** (see § Direct runs)  | 1.50  | 0.12156862745098 | `n2cbsk05` (Replicate) | 896×592     | **clean — 0.0 % magenta**, bright pixels included | **blown out** — mean 0.76, 77.6 % of pixels V ≥ 0.90, half with a clipped channel |
| B   | night, non-green                                         | 1.00  | 0.05             |                        |             |                                                   |                                                                                   |

### Run A — measured 2026-09-26

Source `test-photos/licensed/01-aurora-fjord-kirkjufell.jpg` (3840×2560), Auto off, gamma `1.00`,
strength `0.05`, Replicate operational. Raw `result.png` pulled with `scripts/prod-fetch-results.py`
and kept as `references/08-7ea011bd-gamma1.00-strength0.05-raw.png` (sha256 `edec5330…`), never the
post-passed AFTER pane.

Hue shares, all three images measured in **one pass with one method** by
`scripts/measure-hue-shares.py`, which fixes the scaling (LANCZOS to 896 px long edge), the HSV
conversion, the thresholds, the tone bands and the denominators in its docstring. In short:
chromatic = HSV saturation > 0.18 and 0.10 < V < 0.90, as a share of **all** pixels; green 60–180°
and magenta 250–340° as shares of the **chromatic** pixels only; tone columns as shares of that
tone's chromatic pixels. Reproduce with:

```
python3 scripts/measure-hue-shares.py \
  source=test-photos/licensed/01-aurora-fjord-kirkjufell.jpg \
  run-a=context/changes/cloud-quality-below-local/references/08-7ea011bd-gamma1.00-strength0.05-raw.png \
  baseline=context/changes/cloud-quality-below-local/references/07-190832de-raw-model-output-magenta.png
```

| Image                    | Chromatic |  Green |   Magenta | Magenta in dark (V < 0.35) | Magenta in mid (0.35–0.65) |
| ------------------------ | --------: | -----: | --------: | -------------------------: | -------------------------: |
| Source (Kirkjufell)      |    66.6 % | 93.5 % |     0.0 % |                      0.0 % |                      0.0 % |
| **Run A `7ea011bd` raw** |    77.9 % | 85.8 % | **0.0 %** |                  **0.0 %** |                  **0.0 %** |
| Baseline `190832de` raw  |    86.8 % | 57.6 % |    39.8 % |                     69.7 % |                     44.2 % |

⚠️ **This method is not byte-identical to the one behind the 2026-09-24 table** (56.2 % / 43.2 % for
`190832de`), which was not recorded precisely enough to reproduce. It lands within ~3.4 pp of it on
the same file, so the two agree on the finding; compare new runs against the row above, not against
the older figure.

**What it shows.** The model returned a saturated green night scene with no magenta at all — not in
the darks, not in the mid-tones where `190832de` flips hardest. By the protocol's own reading, this
is the "clean" branch.

**What it does NOT establish — three variables moved at once, not one.** Run A was designed to change
only source size. It actually differs from `190832de` in:

1. **source size** — 3840×2560 vs 896×600 (the variable under test);
2. **parameters** — gamma 1.00 / strength 0.05 vs 1.16 / 0.08;
3. **the scene itself** — this is **not** "the same aurora scene" the protocol above assumed. The
   baseline is a Lofoten beach whose **snow, rocks and sand** are what turned magenta, while its
   aurora stayed green. _Visual observation, not a measurement:_ Kirkjufell's foreground reads as
   grass, water and a bench rather than snow or pale rock, so it appears to offer less of that
   neutral ground to flip. The 93.5 % green figure does **not** show this — it is a share of the
   chromatic pixels only and says nothing about how much of the frame is neutral.

So "clean" is consistent with size-dependence, with the parameter change, and with the flip needing
low-chroma regions beside saturated green. It eliminates none of them. The fault's recorded
signature — magenta where the scene was neutral — is suggestive of the third, but that is a
hypothesis from one image, not a finding.

**A control that removes two of the three** is the same Kirkjufell file **downsized below 1536 px**
(≈ 896 px long edge, to match the failing cell) at the same gamma `1.00` / strength `0.05`. Scene and
parameters then stay fixed and only size moves. Its reading is narrow — **for this photograph at
these parameters**:

- **magenta** → source size is enough to trigger the flip on this scene at gamma 1.00 / strength 0.05;
- **clean** → size alone does not trigger it on this scene at these parameters. That does not rule
  size out for other scenes or for the shipped parameters, and leaves the baseline's failure
  unexplained between parameters and scene composition.

### Run C — measured 2026-09-26

The size control proposed above. Source `test-photos/private/01-aurora-fjord-kirkjufell-896.jpg`: the
Run A file resized with LANCZOS to 896×597 (JPEG q95, no chroma subsampling; sha256 `72cb7590…`),
kept in the gitignored `private/` folder. Auto off, gamma `1.00`, strength `0.05` — confirmed on the
persisted job row (`gamma = 1`, `strength = 0.05`). Raw `result.png` pulled with
`scripts/prod-fetch-results.py` (sha256 `88dcf148…`); it is **not** added to `references/`, since it
adds nothing visual that `08` does not already show. The model returned 896×592, cropping five rows.

Same script, same command shape, measured together with the Run A and baseline rows above:

| Image                    | Chromatic |  Green |   Magenta | Magenta in dark (V < 0.35) | Magenta in mid (0.35–0.65) |
| ------------------------ | --------: | -----: | --------: | -------------------------: | -------------------------: |
| Source, 896 px           |    66.6 % | 93.6 % |     0.0 % |                      0.0 % |                      0.0 % |
| **Run C `04e57d16` raw** |    71.7 % | 86.0 % | **0.0 %** |                  **0.0 %** |                  **0.0 %** |
| Run A `7ea011bd` raw     |    77.9 % | 85.8 % |     0.0 % |                      0.0 % |                      0.0 % |
| Baseline `190832de` raw  |    86.8 % | 57.6 % |    39.8 % |                     69.7 % |                     44.2 % |

**Reading — for this photograph at gamma 1.00 / strength 0.05 only:** reducing the source to the
failing cell's size did **not** produce the flip. Size alone does not trigger it here. Run A and Run C
are near-identical on every band.

**What is left.** Between this pair and the failing baseline, two variables still differ: the
**parameters** (1.00/0.05 here vs 1.16/0.08, which came from Auto) and the **scene**. Neither is
eliminated, and size is not ruled out for other scenes or for the shipped parameters.

**The next control holds scene and size fixed and moves only the parameters:** the same 896 px
Kirkjufell file with the parameters production actually sends. The sliders step by 0.05, so the
baseline's 1.16 / 0.08 cannot be set by hand; the representative choice is **Auto on**, recording
the values the panel shows. For this photograph at those values: **magenta** → the shipped
parameters are enough to trigger the flip on this scene; **clean** → Auto's setting does not
trigger it on this scene. _(Run D came back clean. What that does and does not exclude — it does
**not** leave the scene as the only suspect — is in § Direct runs, Reading 1.)_

### Direct runs — calibration and Run D, 2026-09-26

Run D was refused by the daily cap (§ Attempt log). Rather than raise the global production cap,
the remaining runs call the model **directly** with `scripts/spikes/bread-spike.ts`, which uses the
same pinned version (`057a4e07…`) and `{image, gamma, strength}` input as `src/lib/services/bread.ts`,
sends a local file as a data URI and keeps the raw output with its sha256. No app, no job row, no cap.

**Calibration — the direct path is byte-equivalent to the app.** Run C repeated directly (Replicate
prediction `7fbt0ppt…`, gamma 1.0 / strength 0.05, same 896 px file) returned sha256
`88dcf148a9637fbe63e5c073d76c97f8b769aa695797b248654ba72308561f2a` — **byte-identical** to app job
`04e57d16` (`cmp` confirms). The model is deterministic and the app uploads the file's raw bytes, so
a direct result stands in for an app result at the same input and parameters.

**Run D — Auto's parameters at fixed scene and size.** Prediction `n2cbsk05…`, gamma **1.50**,
strength **0.12156862745098** (Auto's exact values for this file, from job `9c88b99f`), same 896 px
file. Raw output kept as `references/09-n2cbsk05-direct-gamma1.50-strength0.1216-raw.png`
(sha256 `d5d91bad…`).

| Image                    | Chromatic |  Green |   Magenta | Magenta in dark | Magenta in mid | Mean RGB | V ≥ 0.90 | Any channel = 255 |
| ------------------------ | --------: | -----: | --------: | --------------: | -------------: | -------: | -------: | ----------------: |
| **Run D `n2cbsk05` raw** |    21.1 % | 88.4 % | **0.0 %** |       **0.0 %** |      **0.0 %** |    0.760 |   77.6 % |            49.7 % |
| Run C raw (app = direct) |    71.7 % | 86.0 % |     0.0 % |           0.0 % |          0.0 % |    0.438 |   21.3 % |             4.9 % |
| Baseline `190832de` raw  |    86.8 % | 57.6 % |    39.8 % |          69.7 % |         44.2 % |    0.446 |    1.5 % |             0.0 % |

Hue columns from `scripts/measure-hue-shares.py`; the last three columns are over **all** pixels at
native size (V = max channel). Run D's chromatic share collapses because most of the frame is now
brighter than the mask's V < 0.90 ceiling, not because colour turned: among the coloured pixels the
mask excludes as too bright (47.3 % of the frame), magenta is also **0.0 %** and green 91.6 %.

**Reading — for this photograph only.**

1. **No magenta at Auto's parameters for this file either.** On Kirkjufell, the flip appears
   neither at 1.00 / 0.05 at either size (A, C) nor at Auto's 1.50 / 0.1216 (D). That does **not**
   leave the scene as the only remaining cause:
   - the failing baseline ran at **1.16 / 0.08**, which no Kirkjufell run used, so an effect specific
     to those values is not excluded;
   - C → D moves gamma **and** strength together, so it tests Auto's setting as a whole, not either
     parameter alone;
   - an **interaction** between parameters and scene is not excluded either.

   What it does show: this frame does not flip at the settings tried. The scene remains a candidate,
   not an isolated cause. The test that bears on it is a scene like the baseline's — neutral ground
   (snow, pale rock, sand) beside saturated green — under a recorded licence, run through the direct
   path at **both** 1.00 / 0.05 and 1.16 / 0.08.

2. **A different defect instead: Auto blows this photo out.** At gamma 1.50 over three quarters of
   the frame sits at V ≥ 0.90, half the pixels clip a channel, and mean saturation halves
   (0.541 → 0.298). The sky reads as pale green-white. This matches the other half of the S-17
   complaint ("blows out highlights") and § Why these values' point that the shipped setting
   maximises blow-out. It is one photograph, and the comparison moves gamma and strength together, so
   it indicts Auto's setting as a whole rather than one parameter. How many night photos take the
   same path depends on `baseGamma` (`src/lib/engines/auto-params.ts:107`), which reaches the 1.50
   clamp only when all of these hold: the median luma `p50` is at or below ~0.164 (target median 0.3;
   ~0.133 when `shadowRatio > 0.65` and `p95 < 0.65` switch the target to 0.26); if `p95 > 0.85`, the
   ×0.8 guard lowers that threshold to ~0.105 (the 0.26 target cannot apply there, since it needs
   `p95 < 0.65`); and `clipRatio ≤ 0.005`, since any more
   clipping caps gamma at 1.1. A dark frame with a few clipped lights therefore does **not** get 1.50.

**Queue/start delay.** Both direct calls spent minutes between `created_at` and `started_at` before
a ~1.6 s prediction: 342 s for Run C and 123 s for Run D. That interval covers queueing **and** any
model start; Replicate's timestamps do not separate the two, so it is not a confirmed cold-boot time.
Recorded because the app's jobs pass through the same interval.

### Baseline-like scenes — direct runs, 2026-09-26

Tests the candidate left by Reading 1 above: does the flip need **neutral ground beside saturated
green**? Two licensed scenes added in `test-photos/` (#259), each resized to 896 px (LANCZOS, JPEG q95,
kept in `private/`), each run directly at Bread's default **1.00 / 0.05** and at the baseline's
**1.1612628 / 0.0764706** (rounded from `frame.md`; exact values not needed unless a result sat on
the boundary — none did). Raw outputs are not added to `references/`; their sha256 are recorded.

| Run | Scene                                | gamma / strength      | Prediction | sha256      |
| --- | ------------------------------------ | --------------------- | ---------- | ----------- |
| E   | `02` frozen lake, neutral foreground | 1.00 / 0.05           | `0w0ajdfn` | `03a33bb9…` |
| F   | `02`                                 | 1.1612628 / 0.0764706 | `zv6mafa4` | `e1754812…` |
| G   | `03` Reykjanes, yellow-green snow    | 1.00 / 0.05           | `k42azkwa` | `f59e51ea…` |
| H   | `03`                                 | 1.1612628 / 0.0764706 | `c6evr7dx` | `9dd6bbe6…` |

Whole frame, `scripts/measure-hue-shares.py`:

| Image         | Mean RGB | Chromatic |  Green |   Magenta | Magenta in dark | Magenta in mid |
| ------------- | -------: | --------: | -----: | --------: | --------------: | -------------: |
| `02` source   |    0.329 |    46.0 % | 42.0 % |     2.4 % |           3.9 % |          0.6 % |
| E             |    0.592 |    24.8 % | 55.2 % | **0.1 %** |           0.2 % |          0.3 % |
| F             |    0.683 |    17.9 % | 52.9 % | **0.1 %** |           0.0 % |          0.3 % |
| `03` source   |    0.199 |    65.6 % | 95.8 % |     0.0 % |           0.0 % |          0.0 % |
| G             |    0.419 |    71.9 % | 92.7 % | **0.0 %** |           0.0 % |          0.0 % |
| H             |    0.509 |    64.8 % | 92.6 % | **0.0 %** |           0.0 % |          0.0 % |
| Baseline `07` |    0.446 |    86.8 % | 57.6 % |    39.8 % |          69.7 % |         44.2 % |

The **foreground band** — the bottom 40 % of the frame, where the baseline's snow and sand flipped —
measured the same way (same mask and bands, restricted to those rows):

| Image         | Mean RGB (0–255) |  Green |    Magenta | Red/orange |
| ------------- | ---------------- | -----: | ---------: | ---------: |
| `02` source   | 93 / 92 / 82     | 20.5 % |      1.3 % |     75.1 % |
| E             | 128 / 127 / 113  | 23.2 % |  **0.2 %** |     75.2 % |
| F             | 141 / 140 / 125  | 24.4 % |  **0.2 %** |     74.3 % |
| `03` source   | 59 / 62 / 37     | 89.3 % |      0.0 % |     10.6 % |
| G             | 111 / 114 / 80   | 87.8 % |  **0.0 %** |     12.2 % |
| H             | 132 / 135 / 100  | 85.3 % |  **0.0 %** |     14.7 % |
| Baseline `07` | 114 / 95 / 121   | 31.1 % | **66.9 %** |      0.2 % |

**Reading — for these two scenes at these two parameter sets only.**

1. **No flip, including on neutral ground at the baseline's own parameters.** `02`'s near-neutral
   shore keeps its balance through the model (93/92/82 → 141/140/125); the baseline's equivalent band
   ends up green-deficient and magenta (114/95/121). `02`'s red/orange share is the brown grass bank,
   present at the same share in the source. `03` tests a tinted, not neutral, foreground and is clean
   too. So "neutral ground beside saturated green" is **not sufficient** to trigger the flip, at
   either parameter set, on these scenes. It is not ruled out as a **necessary** ingredient.
2. **The baseline parameters alone do not trigger it either** on any scene tried so far (F, H), which
   narrows the parameter explanation to an interaction with something these inputs lack.
3. **What every non-failing input has in common, and the baseline's does not: we made it small.**
   Every "small" source in this document — Runs C, D and E–H — is a LANCZOS reduction of a ≥ 3840 px
   original, and reducing ~4× averages away shadow chroma noise. That is the very mechanism § Redesigned
   2026-09-22 proposed for size-dependence. The baseline's input was a **natively** small (~0.5 MP),
   web-compressed JPEG that kept its noise. So **no run has yet reproduced the baseline's input
   condition**: C, D and E–H test "small after clean downsampling", not "small and noisy". Run C's
   "size alone does not trigger it" holds only in that narrower sense.

**What would test it.** Either (a) the baseline's own source — the ~0.5 MP web copy, `ALL RIGHTS
RESERVED`, so used from `test-photos/private/` only and never committed — run directly at 1.00 / 0.05
and at its production parameters (at the latter it should reproduce `190832de` byte-identically **if** the file is byte-for-byte the one
uploaded on 2026-08-31,
which would also re-confirm determinism), or (b) a licensed scene with **native** chroma noise, or
noise added back after downsampling. (a) is the more decisive: it holds the scene fixed and moves only
the parameters on the one input known to fail.

**Queue/start delay:** 207 s on the first call (E); the next three started immediately (0.0 s).

### The baseline's own input — the magenta is already in it, 2026-09-26

The test proposed above: the failing baseline's own source, run directly. Found on the maintainer's
machine as `~/Downloads/FOM_1794.jpg` (899×600, 90 KB, progressive JPEG, sha256 `63f8f951…`, file
date 2026-09-21), copied to `test-photos/private/00-baseline-lofoten-capturetheatlas-FOM_1794.jpg`.
It is the capturetheatlas image, `ALL RIGHTS RESERVED` — private only, never committed.

**It is exactly the input `190832de` received.** Run directly at `190832de`'s exact persisted
parameters (gamma `1.16126279077347`, strength `0.0764705882352941`, read from the job row), it
returned sha256 `4a7d6979c763f7abf4a663696f7da93a14fd135e5d7451396beb6b4d025206d5` — byte-identical to
`references/07` (`cmp` confirms). The 2026-09-21 file date does not matter: the bytes are the ones
uploaded on 2026-08-31.

| Image                                   | Mean RGB | Magenta |  Green | Magenta in dark | Magenta in mid | Bottom 40 %, RGB |
| --------------------------------------- | -------: | ------: | -----: | --------------: | -------------: | ---------------- |
| **Source** `FOM_1794.jpg`               |    0.259 |  39.2 % | 53.4 % |      **59.9 %** |          0.4 % | **46 / 42 / 52** |
| Bread 1.00 / 0.05 (`ty3xzkyw`)          |    0.394 |  39.1 % | 57.8 % |          75.2 % |         41.4 % | 96 / 79 / 102    |
| Bread 1.16 / 0.076 (= `190832de`)       |    0.446 |  39.8 % | 57.6 % |          69.7 % |         44.2 % | 114 / 95 / 121   |
| Plain gamma 2.0 on the source, no model |    0.492 |  43.8 % | 54.7 % |               — |              — | 107 / 98 / 114   |

Pixel correspondence (source cropped to the result's 896×600; a LANCZOS resize gives the same
answer): of the pixels that are magenta in `190832de`, **98.1 %** were already magenta in the
source, **0.0 %** were green and 0.6 % were near-neutral. The same holds at 1.00 / 0.05 (98.4 %).
Those pixels are dark in the source (median V 0.19), which is why the cast is hard to see there.

**Reading — for this image.**

1. **There is no green→magenta flip in `190832de`.** The source's dark regions — the wet beach and rocks of the foreground and the mountains'
   shadowed flanks — are already purple (bottom band 46 / 42 / 52, blue
   above green). The model brightens them, and the existing cast becomes obvious. Green stays green.
2. **The parameters change how visible it is, not whether it is there.** Magenta is 39.1 % at
   Bread's own defaults and 39.8 % at production's values; the higher gamma only lifts it further.
3. **A plain gamma curve does the same with no model at all** (43.8 % at gamma 2.0, foreground
   107 / 98 / 114). Any engine that brightens this frame — the Local engine included, which is also
   gamma-based — should reveal the same cast. That has not been run through the Local engine itself.
4. This is consistent with every clean run above: Kirkjufell, the frozen lake and Reykjanes have no
   purple in their dark regions, so there was nothing to reveal.

**What this does not establish.** It covers one of the three S-17 evidence images. The wolf (`01`)
and the waterfall (`03`) come from the same article, but their sources have not been measured, so
whether they carry the same input cast is open. It also says nothing about the separate
**blow-out** at Auto's gamma 1.50 (§ Direct runs, Reading 2), which is a real output defect. The
statement in `idea-notes.md` that Bread's own output flips green to magenta and "the fault is the
model's" is contradicted for `190832de` and is left for the maintainer to amend.

### Attempt log

**2026-09-26 — Run D (Auto on, 896 px Kirkjufell) refused by the daily cap. Not run.**

The cap was already full. The day's rows (UTC):

| Job        | Status      | `error_code` | Reached Replicate | gamma | strength           | Created (UTC) |
| ---------- | ----------- | ------------ | ----------------- | ----- | ------------------ | ------------- |
| `7ea011bd` | `succeeded` | —            | true              | `1`   | `0.05`             | 11:10:43      |
| `9c88b99f` | `failed`    | `canceled`   | **true**          | `1.5` | `0.12156862745098` | 12:06:13      |
| `04e57d16` | `succeeded` | —            | true              | `1`   | `0.05`             | 12:07:21      |

`9c88b99f` is an Auto-on submission of the 896 px file, cancelled with "Start over" a minute before
Run C. It had already reached Replicate, so it counts — correctly, by the cap's predicate — and it
was the third slot. `CLOUD_DAILY_CAP` in production is therefore 3, as documented. The refused Run D
created no row and cost nothing (the handler's fast path rejects before any storage or model work).

Run D's parameters are now known exactly: Auto sets gamma **1.50** and strength **0.12156862745098**
on this file (the panel shows `0.12`). ~~Re-run after 00:00 UTC with Auto on and those values.~~
_Superseded the same day: Run D was run through the direct path instead — § Direct runs._

**2026-09-24 — Run A attempted twice, blocked by a Replicate outage. No cap slot spent.**

| Job        | gamma | strength | Reached Replicate | `error_code`   | Outcome                                                 |
| ---------- | ----- | -------- | ----------------- | -------------- | ------------------------------------------------------- |
| `0b8bf6c1` | `1`   | `0.05`   | **false**         | `start_failed` | `Signal timed out.` (Deno abort)                        |
| _(retry)_  | `1`   | `0.05`   | **false**         | `start_failed` | `predictions.create failed (502)`, Cloudflare HTML page |

Three things this establishes, and they are worth keeping even though the run did not happen.

1. **The protocol works.** The persisted row shows `gamma = 1` and `strength = 0.05`, so Auto was
   genuinely off and the manual values reached the backend. That half of the setup needs no
   re-verification next time.
2. **Nothing was spent.** `replicate_prediction_id` is null on both, and the cap's count predicate
   excludes `failed` rows with a null prediction id — a job that never reached the model cost
   nothing. All three daily slots remain available.
3. **The cause is external and confirmed.** Cloudflare's service-status page listed **Replicate as
   `Degraded`** on 2026-09-24. The failure is at `predictions.create`, which already retries three
   times internally (`PREDICTION_CREATE_MAX_ATTEMPTS = 3`), so each click was nine attempts under the
   hood. Retrying during the outage buys nothing.

It also produced the evidence behind change `cloud-error-message-leak`: both failures rendered raw
internal text to the user, the second an entire Cloudflare HTML document.

**Re-run when Replicate is operational.** The input, the parameters and the judging method are all
unchanged.

**Judge against the raw stored `result.png`, not the in-app AFTER pane** — the pane
is post-passed and, per `frame.md`, also displayed at a different effective
resolution from the BEFORE pane.

## If gamma 1.0 is not enough

Values **below 1.0** are not reachable: `photo-job.schema.ts:31` is
`z.number().min(1.0)` and `auto-params.ts:25` sets the slider floor to 1.0. The
model's own minimum is not shown in Replicate's table view; the repo's resolver
fixture records `minimum: 0` (`tests/bread-version-resolver.test.ts:30`), unverified.
Testing gamma < 1.0 therefore needs either a temporary bound change or a direct
Replicate call with a token — a decision to take **after** these two runs, not
before.
