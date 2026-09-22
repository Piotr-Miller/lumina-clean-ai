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

|                           | **saturated green**                                | **low chroma**                                 |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| **small source (≤ 1536)** | **FAILS** — the aurora, all three S-17 screenshots | **Run B**                                      |
| **large source (> 1536)** | **Run A** — the decisive cell                      | **CLEAN** — `bcff4e39`, `c560b9d4`, `3f219e67` |

Every observed failure is saturated green **and** small. Every clean run is low-chroma **or** large.
Nothing in production separates the two, so neither hypothesis can be eliminated from what exists.

Size is not the implausible one it first appears. Bread resizes internally to ≤ 1536, so a ~900 px
source arrives at roughly its native scale while a 4000 px source is downscaled ~2.6× first — and
that downscale **averages shadow chroma noise before the model ever sees it**. The network's input is
materially different in the two cases.

### Run A — the aurora at a FULL-RESOLUTION source (the decisive cell)

A saturated green aurora over dark water, at a **genuinely large source** rather than the 0.54 MP web
copy every prior trial used. This is the single run that separates saturation from size.

⚠️ **Not the same photo — and deliberately so.** The original aurora was traced on 2026-09-22 to
<https://capturetheatlas.com/noise-in-photography/>, which is `ALL RIGHTS RESERVED` and serves only
responsive renditions, so no full-resolution original is offered or ours to take. Use a CC-licensed
frame instead, following `ab-harness/fetch-samples.sh`'s existing pattern. Recommended:
`Northern Lights over Kirkjufell seen from Grundarfjörður.jpg` (3840×2560, CC BY-SA 4.0) — same
geometry as the repo's existing night sample, fjord-side aurora with water in the foreground.
Candidates and fetch URL: `result-dimensions-census.md` § Provenance.

The cost of the swap is stated there too: a different scene weakens a clean result slightly, to
"this aurora is fine at full size" rather than "that aurora is fine at full size". Both candidates
are saturated green with dark water — the class that fails — so it remains by far the strongest run
available.

- **Clean** → size, or the interaction, is doing the work. The fault may not reach real users at all,
  which changes the model decision completely.
- **Magenta** → saturation, confirming the frame's hypothesis on evidence that is finally
  representative.

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
large sources and are low-chroma and clean, and the small ones are at least two distinct images
(896×600 and 768×512). The large + low-chroma cell is therefore already answered, and what Run B
still adds is the **small + low-chroma** cell.

**Run A is the one that matters. If only one run can be afforded, spend it there.**

## Results

Fill in as the runs complete. Attach the downloaded `result.png` for each under
`references/` with a name that states the parameters.

| Run | Source            | gamma | strength | Job id | Result size | Verdict on hue | Verdict on exposure/noise |
| --- | ----------------- | ----- | -------- | ------ | ----------- | -------------- | ------------------------- |
| A   | aurora (as above) | 1.00  | 0.05     |        |             |                |                           |
| B   | night, non-green  | 1.00  | 0.05     |        |             |                |                           |

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
