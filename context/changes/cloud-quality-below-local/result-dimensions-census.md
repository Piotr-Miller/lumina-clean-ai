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

---

## Follow-up: the colour fault on the three large-source runs (2026-09-22)

The maintainer opened all three in Storage, plus `190832de` (the aurora) as a **known-bad
reference** — judging a cast in isolation is unreliable, judging it against a confirmed instance is
not. Observations, verbatim:

| Job        | Source size | Observation                                                                             |
| ---------- | ----------- | --------------------------------------------------------------------------------------- |
| `190832de` | small       | **the fault pattern**: pink-violet cast in the water and foreground, aurora still green |
| `bcff4e39` | large       | no visible pink-violet cast in the dark areas                                           |
| `c560b9d4` | large       | no visible pink-violet cast in the dark areas                                           |
| `3f219e67` | large       | dark palms clean; the pink is in the **bright sky**                                     |

### What this establishes

**The fault is not universal.** Three production runs on genuinely large sources show no
shadow hue flip. "Bread is broken" is too strong as a statement about the model.

`3f219e67`'s pink sits in the **bright** region while its darks are clean — that is the **inverse**
of the documented signature, which is luminance-gated the other way (hue survives where the output is
bright and flips where it is dark or mid-tone, `frame.md` § Narrowing Signals). A pink sky at
twilight is most likely the real sky. It should not be counted as an instance of the fault.

### What this does NOT establish — the confound

**Size and scene content are not separated here.** The three large-source runs differ from the aurora
in **both** variables at once: they are bigger _and_ they are not saturated green-dominant night
scenes. So this cannot decide between:

- **saturation-dependence** — the fault needs a saturated green-dominant scene (the frame's
  hypothesis), or
- **size-dependence** — the fault needs a small source. This is not as implausible as it first
  looks. Bread resizes internally to ≤ 1536, so a ~900 px source reaches the network at roughly its
  native scale while a 4000 px source is downscaled ~2.6× first, and that downscale **averages
  shadow chroma noise before the model ever sees it**. The colour-adaptation network's input is
  materially different in the two cases.

Both remain live. The evidence so far only shows where failures **cluster**: every observed failure
is saturated green **and** small; every clean run is low-chroma **or** large.

### The one run that separates them

A **saturated green night scene at a genuinely large source**. That is a single experiment, and it is
the design `defaults-experiment.md` Run A should now carry: the same aurora scene, but a
full-resolution original rather than the 0.54 MP web copy that every prior trial used.

- Clean → **size**, or the interaction, is doing the work, and the fault may not reach real users at
  all, which would change the model decision completely.
- Magenta → **saturation**, confirming the frame's hypothesis on evidence that is finally
  representative.

Either outcome is decisive, and neither is available from anything already in storage.

---

## Provenance of the test corpus, established 2026-09-22

The maintainer identified the source of the aurora: **<https://capturetheatlas.com/noise-in-photography/>**,
an article about noise in photography. Fetching it confirms the article also carries **a wolf shot in
low light** — S-17's screenshot `01` — so at least two of the three evidence images, and plausibly
all three, come from that one page.

Three consequences, and the third is the operative one:

1. **It explains every property measured so far.** Web-sized, ~0.5 MP, no EXIF, 3:2, and visibly
   grainy — an article _about noise_ naturally illustrates itself with noisy frames.
2. **The images are chosen to show noise**, so they are not typical user photos. That is useful for a
   denoiser and misleading for "what will a user see".
3. **The site is `© CAPTURE THE ATLAS … ALL RIGHTS RESERVED`** and serves only responsive renditions.
   So a higher-resolution original of this exact photo is neither offered nor ours to take, and
   **Run A must not be built by scraping a larger copy from that page.**

`local-engine-ceiling/change.md` already rejected the archived `ab-harness/samples` on exactly this
reasoning — "fetched from third-party URLs by a script and their provenance cannot be asserted". The
objection applies here with more force, since these are all-rights-reserved rather than freely
licensed.

### Freely licensed replacements for Run A

The repo already has the clean pattern: `ab-harness/fetch-samples.sh` pulls CC-licensed frames from
Wikimedia Commons and records label, licence and author inline. Candidates matching the failing
scene class — saturated green aurora, dark water foreground, mountains — all verified present at
these sizes on 2026-09-22:

| Resolution | Licence      | File                                                                                 |
| ---------- | ------------ | ------------------------------------------------------------------------------------ |
| 6000×4000  | CC BY-SA 2.0 | `Northern Lights at Sermilik Fjord, East Greenland.jpg`                              |
| 3840×2560  | CC BY-SA 4.0 | `Northern Lights over Kirkjufell seen from Grundarfjörður.jpg`                       |
| 5580×1535  | CC BY-SA 3.0 | `Aurora borealis above Storfjorden and the Lyngen Alps in moonlight, 2012 March.jpg` |

**Recommended: the Kirkjufell frame.** At 3840×2560 it is the same geometry as the repo's existing
`01-very-dark-iso160000.jpg`, it sits well inside `MAX_FILE_BYTES`, and it is a fjord-side aurora
with water in the foreground — the closest available analogue to the failing scene.

Fetch it the way `fetch-samples.sh` already does, via the sized-rendition redirect:

```
https://commons.wikimedia.org/wiki/Special:FilePath/Northern_Lights_over_Kirkjufell_seen_from_Grundarfj%C3%B6r%C3%B0ur.jpg?width=4000
```

### The cost of the swap, stated honestly

Run A was designed as _the same scene at a larger size_, which isolates size perfectly. Using a
different aurora reintroduces scene variation, so a clean result would be slightly weaker evidence —
"this aurora is fine at full size" rather than "that aurora is fine at full size". It is still by far
the strongest run available, because both candidate scenes are saturated green with dark water, which
is the class that fails. The alternative — a provenance-unclear scrape — is not worth the marginal
rigour.
