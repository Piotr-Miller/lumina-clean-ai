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

### Run A — the aurora

The same photo behind `references/02-aurora-water-green-to-magenta.png`. Its prior
runs are `239a4631…` (2026-06-08), `55550cf1…` (06-13), `42520013…` (06-18) — all
`706.3 KB`, byte-identical, all magenta — and `190832de…` (08-31, gamma 1.16 /
strength 0.08, `799.69 KB`). Any of those is the baseline to compare against.

### Run B — the control

A night photo with **no strong green**. This is the control the project has never
had: all 18 stored results are the same saturated aurora, so nothing in production
distinguishes "Bread is broken" from "Bread is broken on saturated green".

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
