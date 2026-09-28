---
change_id: cloud-quality-below-local
title: Calibrate Cloud Auto exposure and verify quality against Local
status: implementing
created: 2026-08-31
updated: 2026-09-28
archived_at: null
---

## Notes

### Decision — 2026-09-26

**Keep Bread for now. Reframe S-17 around Auto overexposure and a representative
Cloud/Local quality check.** Do not start a model migration from the three
2026-08-31 screenshots. The success criterion (Cloud noticeably better than Local)
remains unverified; keeping the current model is a decision about the next work,
not proof that the criterion passes.

The original observations and diagnosis below are preserved as a history of the
investigation, **not current findings**. `defaults-experiment.md` § The baseline's
own input shows that 98.1% of magenta pixels in the byte-reproduced aurora result
were already magenta in its source; none were green. The other two source images
also contain violet/magenta shadows, and a Python approximation of the Local
engine shows comparable magenta on them. Only the aurora source is byte-proven as
the submitted input, and Local was approximated rather than run in a browser.
These limits rule out a claim that all colour behaviour is solved, but the
green→magenta model-fault diagnosis does not survive the available evidence.

The reproducible quality defect is **overexposure at Auto's setting** on a
licensed aurora photo. At the same 896 px input, direct Bread runs changed from
`gamma 1.00` / `strength 0.05` to Auto's `1.50` / `0.12156862745098`: pixels with
V ≥ 0.90 rose from 21.3% to 77.6%, and pixels with any channel clipped rose
from 4.9% to 49.7%. Both controls changed, so the evidence incriminates that
Auto setting as a whole, not gamma alone. The next implementation should
calibrate the recommendation using photos whose provenance and publication
rights are recorded, then compare Bread and Local on the same representative
inputs at matched display scale. Define acceptance criteria before tuning. _(Done 2026-09-26: `quality-bar.md`.)_

The model decision is **retain, subject to that quality check**. A swap or drop
needs new evidence that the calibrated Bread path cannot meet the product bar.
The Cloud resolution/delivery gap remains a separate parked item after S-18.

Reported by the user 2026-08-31 after hands-on trials on production: the Bread
(Cloud AI) results came out **markedly worse than the local Canvas engine**. This
inverts the product's central promise. `idea-notes.md` § Success Criteria states
it as a shipped criterion:

> ✅ Toggle switches between engines seamlessly — **cloud result is noticeably
> better than local**

That criterion is currently false in production.

### Evidence

Three before/after screenshots taken on prod, saved under `references/`:

| File                                    | Scene                   | Observed AFTER                                                               |
| --------------------------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `01-wolf-night-overbright-magenta.png`  | wolf on a road at night | blown out to near-white, violet cast; the wolf turns yellow-green            |
| `02-aurora-water-green-to-magenta.png`  | green aurora over water | lower half shifts to **magenta**; visible noise ADDED relative to the source |
| `03-waterfall-aurora-grass-magenta.png` | waterfall under aurora  | green grass turns **magenta**, sky turns cyan                                |

Parameters in each run (Auto ON): gamma `1.50` / strength `0.12`; gamma `1.16` /
`0.08`; gamma `1.24` / `0.09`.

### Original reading of the evidence — superseded 2026-09-26

The shared signature is a **hue shift to the complement — green → magenta** —
present in all three, across three different gamma values and three different
strengths. So this is **not** a parameter-tuning problem; parameters vary while
the artifact stays.

Two secondary observations worth keeping:

- In `01`, Auto recommended gamma `1.50`, which is the slider **maximum**. An
  Auto recommendation pinned to the top of the range is suspicious on its own,
  independent of the colour fault.
- In `02`, the AFTER image is **noisier** than the BEFORE. A denoise pass that
  increases noise is failing at its stated job, not merely tuning it badly.

### Candidate causes — 2026-09-20 diagnosis superseded 2026-09-26

> **Superseded. Kept verbatim below as the original framing** (what was assumed,
> vs what was found) — see `frame.md` for the investigation.
>
> **Historical diagnosis, now withdrawn:** The stored raw `result.png` for jobs
> `190832de…` and `3d19146a…` — the pre-post-pass bytes Replicate returned,
> opened straight from Supabase Storage outside the app — is **already magenta**
> and **already blown out**, matching screenshots `02` and `01`. This established
> where the result appeared, but did not compare it to the source. The later
> source comparison above invalidates the green→magenta inference; the Auto
> exposure finding remains separate.

Recorded as hypotheses to test, deliberately not as findings. This repository has
a documented history of writing unverified causes into records
(`context/archive/2026-06-10-cap-doc-drift/`, and see `lessons.md` on stale
pointers), so the cause belongs to this change's research/framing phase, not to
this note.

1. **The client-side chroma post-pass** (`src/lib/engines/chroma-denoise.ts`,
   `src/lib/services/cloud-result-postprocess.client.ts`, flag
   `CHROMA_POSTPASS_ENABLED`, shipped S-11, flipped ON 2026-06-27). It operates
   in YCbCr, and green↔magenta is what a sign, offset or Cb/Cr-swap error looks
   like. **However**: a first read of the conversion math (BT.601 coefficients,
   `CHROMA_BIAS = 128`, byte planes) showed nothing obviously wrong, and a blur
   does not by itself invert hue. Suspect, not culprit.
2. **Bread itself** — the model output may genuinely be this bad on these inputs.
   Not yet checked against the raw Replicate output.
3. **The Auto parameter recommendation** — a bad gamma cannot explain the hue
   flip, but it can explain `01`'s blow-out.
4. **The encode / colour-management path** — the result is written as
   `result.png`; an ICC or colour-space mismatch between the model output, the
   post-pass canvas and the stored file could shift colour without any maths
   error in the pass itself.

~~**The cheapest discriminator is a flag flip**: `CHROMA_POSTPASS_ENABLED=false`
on one real job.~~ **Not used, and it was neither cheapest nor a discriminator.**
The flag gates the chroma maths _and_ the canvas/JPEG round-trip together, so a
negative result would not have separated them. And it was not needed: result
objects are never reaped (the reaper matches `'%/source.%'` only), so the raw
`result.png` for all three failing jobs was still in storage — free to open, no
prediction, no cap slot. The hoped-for consequence is also gone: **no flag of
ours rolls this back**, because the fault is in the model output.

### ⚠️ Every trial this change rests on used a SMALL source (added 2026-09-21)

Measured while running S-18's Phase 0 gate, and **confirmed by the maintainer**: the aurora photo was
downloaded from the web at the outset and is the same file the project has worked with from the
beginning. It is **899 × 600 (0.54 MP), no EXIF**. Bread caps the long edge at 1536, so it passed
the image through untouched.

The same holds for all three screenshots. High-frequency grain in each BEFORE pane — `01` 2.159,
`02` 2.786, `03` 2.817 — sits an order of magnitude above the ~0.2 a multi-MP original downsampled
into that box would leave.

⚠️ **Corrected 2026-09-22 — the generalisation that followed was wrong.** This section originally
concluded "so **no production job has ever exercised Bread at a real phone's resolution**". A census
of all 18 stored results (`result-dimensions-census.md`) shows **three did**: `bcff4e39` and
`c560b9d4` (1536×1024, 2026-06-27) and `3f219e67` (1536×1152, 2026-08-10). Fifteen passed through.
The claim was inferred from three screenshots and generalised to eighteen jobs without checking —
the exact move `lessons.md` warns against. **The per-screenshot findings above are unaffected and are
now confirmed from a second direction**: `3d19146a`, `190832de` and `06ce207c` measure 896×600,
896×600 and 768×512, all under the cap.

**Those three downscaled results are still in storage and cost nothing to open.** They are the only
production evidence of Bread's output on a genuinely large source, and they should be looked at
before any cap slot is spent.

What this does and does not touch:

- **Corrected 2026-09-26:** magenta in Bread's raw output did not establish a hue flip; the
  byte-proven input already contains the cast. The earlier saturation-dependence claim is
  unsupported. Source resolution remains a separate test dimension.
- **The "AFTER is noisier" secondary observation does not.** On screenshot `02` the panes measure
  1.05× on luma grain and **0.82×** on chroma — the AFTER is not noisier. What makes it look worse
  is the cast, not noise.
- **`defaults-experiment.md` inherits the caveat**: re-running the aurora measures the model on a
  small web JPEG. Pair it with a real camera-resolution night photo or the result keeps the blind
  spot.
- **Free check available:** sources are reaped, but every stored `result.png` dimension is readable
  at zero cost and would settle, for all 18 jobs, which uploads Bread downscaled.

Full measurement: `context/changes/cloud-result-resolution-gap/premise-check.md`.

### Phase 2 finding — Bread ignores EXIF orientation (2026-09-27)

The pre-registered EXIF probe (`calibration.md` § EXIF probe) found that Bread ignores EXIF
orientation. S17-06 (EXIF 6, displays portrait) came back landscape with its content sideways. As
pre-registered, this is a separate change: **`cloud-exif-orientation`**
(`context/changes/cloud-exif-orientation/`, registered 2026-09-27). **S-17 Phase 5 waits until that
fix is in production.** Production is very likely affected today (the Cloud upload sends the
original bytes), but this has not yet been observed in the app.

### Phase 3 stop — no Cloud Auto setting in range avoids wash-out (2026-09-28)

The Phase 3 gamma sweep (`calibration.md` § Phase 3 — results) ran gamma 0.9–1.5 at strength 0.05
on the six tuning photos. The maintainer rated **every** value harm (washed out) on **five of six**
photos, 0.9 included; only S17-07 was improved, at 0.9. That empty acceptable range is the
pre-registered **stop condition**. No strength sweep was run, no rule was fitted, and Phases 4–6
do not start from this state. Not measured: gamma below 0.9, other strengths, and the post-passed
download. **Next step is the maintainer's decision.**

### Decision — 2026-09-28

**Option A.** Maintainer's wording: _Wybieram wariant A: dodatkową próbę gamma 0.5 i 0.7 przy
strength 0.05 na sześciu zdjęciach tuningowych, z zasadami oceny zapisanymi przed uruchomieniami.
Fazy 4–6 pozostają wstrzymane do oceny wyników._

Why: across the sweep every step up in gamma brightened every photo, and nothing below 0.9 has
been run. That makes a lower value the obvious next test. It does not promise an improvement.

The evaluation rules are pre-registered in `calibration.md` § Phase 3 amendment. A result must be
acceptable against the original, not just less washed out than 0.9. If **any** tuning photo still
has no acceptable value, calibration stops and the decision returns to B/C. If all six do, the
strength sweep resumes. That still does not show that gamma can be set automatically.

- **B** (the stop as evidence against Bread; reopens S-13) comes next if A fails.
- **C** (exposure compensation after Bread) needs its own check first. Darkening may fix the
  brightness, but it cannot recover detail or colour Bread already lost.
- `cloud-exif-orientation` is planned in parallel. It does not depend on A/B/C and gates Phase 5.

### Phase 3 amendment — stop again (2026-09-28)

The pre-registered probe at gamma 0.5 and 0.7 (strength 0.05) ran on all six tuning photos, and the
model accepted both values. By the maintainer's ratings, **S17-02, S17-04 and S17-21 have no
acceptable value**, 0.9 included (`calibration.md` § Phase 3 amendment — results). Under A3 that
is the stop. **Calibration of Cloud Auto within Bread's gamma ends here**, with no strength sweep
and no fitted rule. Phases 4–6 remain on hold.

A lower gamma helps some photos (S17-01, S17-03 at 0.5; S17-07 across 0.5–0.9). On others, even
0.5 veils or smooths the scene. Photos that need little brightening (S17-02, S17-04) gain nothing
from any tested setting. Leaving such photos untouched is a hypothesis for a later stage, not a
result. **Next step is the maintainer's B/C decision.**

### Decision — strength-0 probe (2026-09-28)

Before B: one probe at gamma 0.5 and strength 0.0 on S17-02 and S17-21 (2 runs). It tests one
specific hypothesis: the smoothing harm comes from the denoise weight. Its rules are pre-registered
in `calibration.md` § Strength-0 probe. Texture and overall gain are rated separately. The
disappearance of smoothing alone is not an improvement.

- **Harm** → stronger grounds for B.
- **No harm** → no Cloud advantage shown.
- **Improvement** → grounds to consider new scope. It does not resume calibration or settle
  S17-04.

The probe is **not a precondition for B**. B, a renewed model comparison, can be chosen as a
product decision without proving that Bread fails at every setting. C stays deferred: brightness
correction does not restore lost texture. Both stops stand, and Phases 4–6 remain on hold.

### Strength-0 probe — result (2026-09-28)

Gamma 0.5 with strength 0.0 (`calibration.md` § Strength-0 probe — results), by the maintainer's
ratings:

- **S17-02: harm.** Mild smoothing remains, with no useful gain. This strengthens B.
- **S17-21: improvement, small.** Texture is kept, and terrain lost in shadow becomes legible.
  This is a basis for considering a lower-denoise Cloud setting as new scope.

The result supports the view that strength 0.05 contributes to the texture loss. It does not show
that strength 0 turns denoising off. S17-04 is unresolved, both stops stand, and Phases 4–6 remain
on hold. **Next step: the maintainer's decision — B, the new scope, or both.**

### Decision — B (2026-09-28)

Maintainer's wording: _Decyzja: B. Zamykamy serię eksperymentów kalibracyjnych S-17 i wybieramy
porównanie modeli na s17-v1. Bread z niską gammą i słabym odszumianiem pozostaje kandydatem;
osobnego zakresu Cloud nie wdrażamy. Fazy 4–6 obecnego planu pozostają wstrzymane. Wyniki
tuningowe służą do przygotowania kandydatów, a ocena ich uogólnienia wymaga zachowania oddzielnego
holdoutu._

This decides the direction of further work. It does **not** claim that another model has already
proven better.

Why:

- Across the three probes, Bread gave a gain on **four of six** tuning photos, two of them small:
  S17-01 and S17-03 at 0.5 / 0.05, S17-07 at 0.5–0.9, and S17-21 at 0.5 / 0.0. That is enough to
  keep Bread in the comparison.
- There is still no basis for a reliable Auto rule. The best setting differs from photo to photo,
  S17-04 needed no correction, and S17-02 is harmed even at strength 0.

What follows from it:

- The calibration experiments are closed. Cloud Auto is not recalibrated, and the lower-denoise
  Cloud setting is **not** shipped as separate scope. It stays a hypothesis, tested as one
  candidate in the comparison.
- Phases 4–6 of `plan.md` remain on hold.
- **Holdout.** Every result so far comes from the six tuning photos and is used only to prepare
  candidates. The twelve validation photos of `s17-v1` stay unopened for every model. Judging how
  well a candidate generalises requires that separate holdout.
- Still needed before the comparison is planned: which change carries it (S-17 reframed, or a new
  change tied to S-13), the candidate models, and the roadmap and issue #203 updates. All are
  open, and none has been decided here.

### Closure — 2026-09-28

**Result:** The Bread calibration series has ended. Within the range tested, it produced no basis
for a reliable Cloud Auto rule. Option B was chosen: a model comparison on `s17-v1`, with Bread at
low gamma and weak denoise as one candidate. Phases 4–6 will not be carried out in this change.

The range tested was gamma 0.5–1.5 at strength 0.05, plus gamma 0.5 at strength 0.0 on two
photos, all on the six tuning photos. The trials show the limits of that range. They do not show
that every future calibration is impossible.

The comparison continues as the new change **`cloud-model-comparison`**, on the basic Cloud path.
It keeps the `s17-v1` benchmark and its twelve unopened validation photos as the holdout. The
candidate models and the comparison protocol are decided in that change. S-13 stays a separate
Premium proposal. `cloud-exif-orientation` stays a separate change.

### Scope note

~~the evidence points at a colour transform somewhere in our own pipeline~~ —
**disproven 2026-09-20, then revised again 2026-09-26.** The 2026-09-20
conclusion that Bread caused a green→magenta flip was wrong because the source
was not compared. S-17 now addresses the Auto overexposure and quality check
described in the decision above. Bread stays; S-13 remains a separate,
benchmark-gated Premium proposal. The Cloud resolution/delivery gap is separate.
