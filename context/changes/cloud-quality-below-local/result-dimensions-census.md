# Census: what resolution did Cloud AI actually return, for every stored job?

> Measured 2026-09-22 against `luminaclean-prod`, read-only, reading only the leading bytes of each
> stored `result.png`. **It overturns a claim written into this change on 2026-09-21.**

## Why this was checkable at all

Source files are reaped at 24 h, but results never are. Bread caps the long edge at **1536 px**, so
the result's own dimensions are a sufficient discriminator with no source needed:

- result long edge **≥ 1536** → the source was larger → a real downscale happened
- result long edge **< 1536** → the source was ≤ 1536 → Bread passed it through

## The census

| Created (UTC)           | Job            |        Result |       MP | Verdict        |
| ----------------------- | -------------- | ------------: | -------: | -------------- |
| 2026-06-08 19:42:05     | `239a4631`     |       896×600 |     0.54 | passed through |
| 2026-06-08 19:50:50     | `4427273e`     |       896×600 |     0.54 | passed through |
| 2026-06-08 19:59:03     | `b1915fe7`     |       896×600 |     0.54 | passed through |
| 2026-06-08 20:04:39     | `aae1efc6`     |       896×600 |     0.54 | passed through |
| 2026-06-08 20:07:22     | `207f64db`     |       896×600 |     0.54 | passed through |
| 2026-06-13 22:19:10     | `49afcec3`     |       896×600 |     0.54 | passed through |
| 2026-06-13 22:29:49     | `294780f8`     |       896×600 |     0.54 | passed through |
| 2026-06-13 22:32:28     | `55550cf1`     |       896×600 |     0.54 | passed through |
| 2026-06-14 12:24:47     | `b34519bb`     |       768×512 |     0.39 | passed through |
| 2026-06-18 10:21:22     | `1f54368c`     |       896×600 |     0.54 | passed through |
| 2026-06-18 10:24:54     | `8ee9d9d3`     |       896×600 |     0.54 | passed through |
| 2026-06-18 10:32:11     | `42520013`     |       896×600 |     0.54 | passed through |
| **2026-06-27 16:52:53** | **`bcff4e39`** | **1536×1024** | **1.57** | **DOWNSCALED** |
| **2026-06-27 17:14:06** | **`c560b9d4`** | **1536×1024** | **1.57** | **DOWNSCALED** |
| **2026-08-10 19:30:27** | **`3f219e67`** | **1536×1152** | **1.77** | **DOWNSCALED** |
| 2026-08-31 10:16:42     | `3d19146a`     |       896×600 |     0.54 | passed through |
| 2026-08-31 10:33:38     | `190832de`     |       896×600 |     0.54 | passed through |
| 2026-08-31 11:05:02     | `06ce207c`     |       768×512 |     0.39 | passed through |

**Downscaled 3 · passed through 15 · unreadable 0.**

## What this corrects

On 2026-09-21 this change's `change.md` gained the line:

> "So **no production job has ever exercised Bread at a real phone's resolution.**"

**That is false.** It was inferred from three screenshots and generalised to eighteen jobs. Three
jobs did exercise the cap, and their results are still in storage. The generalisation was exactly the
move the lesson written the same day warns against — asking whether the corpus varies the dimension
the claim is about, and then not actually checking.

## What still stands

Every claim about the **three S-17 evidence screenshots** survives intact, and is now confirmed from
a second direction. `3d19146a` (wolf, `01`), `190832de` (aurora, `02`) and `06ce207c` (waterfall,
`03`) are 896×600, 896×600 and 768×512 — all under the cap, all passed through. So on those jobs
there was no size mismatch, the scaling asymmetry could not have operated, and the measured grain
ratios (1.05× luma, 0.82× chroma) stand. The aurora file the maintainer supplied is 899×600, which
floors to exactly 896×600 — an exact match.

## What it opens, for free

The three downscaled results are **in storage right now**, cost nothing to open, and are the only
production evidence of Bread's output on a genuinely large source:

| Job        | Result    | Aspect | Note                                                        |
| ---------- | --------- | ------ | ----------------------------------------------------------- |
| `bcff4e39` | 1536×1024 | 3:2    | 2026-06-27, the day the chroma post-pass was flipped ON     |
| `c560b9d4` | 1536×1024 | 3:2    | 2026-06-27, 21 minutes after the previous one               |
| `3f219e67` | 1536×1152 | 4:3    | 2026-08-10, 4:3 is the native aspect of a phone/camera file |

**Open these three before spending a cap slot.** They answer, at zero cost, whether the green→magenta
fault appears on a large-source run: clean results would support the saturation-dependence
hypothesis, magenta results would generalise the fault. Either way it is evidence the model decision
currently lacks, and it is cheaper than the `defaults-experiment.md` runs.

## Method

`scratchpad/check-result-dimensions.py` (session-local, not committed): lists jobs with a
`result_path` via PostgREST, signs a short-lived URL per object, range-requests the leading bytes,
and parses the PNG `IHDR` / JPEG `SOF`. Read-only; it performs no writes and prints no secret. The
maintainer ran it, since production credentials deliberately never entered the agent session.

> ⚠️ `context/archive/2026-09-20-cloud-result-resolution-gap/premise-check.md` carries the same
> overstated sentence. The archive is immutable, so it is **not** edited; this document supersedes it
> on that one point. Everything else in it stands.
