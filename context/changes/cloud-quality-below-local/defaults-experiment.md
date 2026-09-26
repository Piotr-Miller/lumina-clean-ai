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
Auto pins gamma to **1.50** on any photo with `p50 < 0.164`, i.e. every night photo.
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

| Run | Source                                                   | gamma | strength | Job id     | Result size | Verdict on hue                                    | Verdict on exposure/noise                                                         |
| --- | -------------------------------------------------------- | ----- | -------- | ---------- | ----------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| A   | aurora, **Kirkjufell** — not the baseline scene          | 1.00  | 0.05     | `7ea011bd` | 1536×1024   | **clean — 0.0 % magenta** in every luminance band | brightened (mean 0.12 → 0.40); painterly texture in the sky, dark corner vignette |
| C   | Kirkjufell **downsized to 896×597** (size control for A) | 1.00  | 0.05     | `04e57d16` | 896×592     | **clean — 0.0 % magenta** in every luminance band | brightened (mean 0.12 → 0.44); same texture as A at smaller scale                 |
| B   | night, non-green                                         | 1.00  | 0.05     |            |             |                                                   |                                                                                   |

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
parameters are enough to trigger the flip on this scene; **clean** → parameters are not it here
either, which leaves scene composition as the remaining suspect — still a hypothesis until a scene
like the baseline's (neutral foreground beside saturated green) is run.

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
on this file (the panel shows `0.12`). Re-run after 00:00 UTC with Auto on and those values.

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
