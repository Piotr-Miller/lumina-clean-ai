# Phase 0 premise check — measured 2026-09-21

> Plan: `plan.md` Phase 0. **Verdict: the premise this change was registered on does NOT hold
> for the evidence it cites.** S-18 survives, but on different grounds, and the justification in
> `change.md`, the roadmap, `plan.md`, `plan-brief.md` and issue #238 is wrong as written.

## What was checked

S-17's screenshot `02` (`references/02-aurora-water-green-to-magenta.png`) is the sole cited
evidence for the sentence that justifies this change:

> "This is the whole 'the AFTER is noisier than the BEFORE' observation … **no pixel fault is
> required to produce it**."

That sentence needs two things to be true on that job: the source had to be **much larger** than
Bread's output (otherwise there is no scaling asymmetry), and the AFTER pane has to be **measurably
noisier** than the BEFORE. Both were checked.

The maintainer supplied the photograph on 2026-09-21. Identity confirmed against the screenshot's
BEFORE pane by normalized cross-correlation: **+0.9921**, against **+0.3930** for a
mirrored-image control. Same photograph, beyond doubt.

## Finding 1 — the uploaded source was small, so there was no downscale at all

The supplied file is **899 × 600 (0.54 MP), 90 KB, with no EXIF at all** — no ISO, no exposure, no
camera make or model. It is a web-sized derivative, not a camera original.

Bread caps the long edge at **1536 px**. 899 is below that, so Bread would have **passed the image
through**, returning ~896 × 600 after the /8 flooring. **Pixel ratio 0.997 — no downscale.**

That is not inferred from the supplied file alone, which could be a later re-download. It is
measured on the screenshot itself. High-frequency luma grain, mean |pixel − 3×3 box blur|, on the
BEFORE pane versus two simulations of the same crop:

| Source of the BEFORE pane                      | grain energy |
| ---------------------------------------------- | -----------: |
| **The screenshot itself (ground truth)**       |    **2.787** |
| A ~899 px file drawn at ~1:1                   |        3.476 |
| A multi-MP original downsampled ~5× to the box |        0.195 |

A heavy downsample averages grain away, which is the entire mechanism this change was registered
on. The screenshot shows grain **14× higher** than that mechanism would leave. The BEFORE pane was
rendered from a small source at close to 1:1.

This holds regardless of display density: any uniform capture scaling affects both panes equally,
and the discrimination between the two hypotheses is an order of magnitude.

## Finding 2 — the AFTER is not measurably noisier

Both panes are drawn into the **same CSS box at the same scale**, so their statistics are directly
comparable with no resampling correction.

| Metric                    | BEFORE | AFTER | ratio     |
| ------------------------- | -----: | ----: | --------- |
| High-frequency luma grain |  2.787 | 2.923 | **1.05×** |
| High-frequency Cb         |  0.266 | 0.219 | **0.82×** |
| High-frequency Cr         |  0.336 | 0.276 | **0.82×** |

Luma grain is essentially unchanged. Chroma grain is **lower** after processing, which is the
chroma post-pass doing exactly its stated job.

**Limitation, stated so nobody over-reads this.** These are 3×3-neighbourhood metrics. They capture
grain, not large-scale blotching. The magenta mottling visible in the AFTER pane is a
**low-frequency colour** artifact and would not register here. So this does not say the AFTER looks
fine — it plainly does not. It says the AFTER is not **noisier** in the sense the record claims, and
that what makes it look worse is the hue flip and the cast, which is S-17's confirmed model fault.

## What this means

- **The mechanism in `change.md` defect #2 did not operate on the cited job.** No size mismatch
  existed, so no scaling asymmetry could have been produced. The sentence "this is the whole
  observation" is false, and so is the implied "no pixel fault is required".
- **It is evidence for S-17, not against this change** — exactly the outcome anticipated when Phase 0
  was written as a gate rather than an assumption. The AFTER's problem on that job is the model's
  output, consistent with the frame's confirmed finding that the raw `result.png` is already magenta.
- **The delivery gap itself is untouched and still real.** Bread's 1536 px cap is measured
  independently three times in the archives, and an 8–12 MP phone photo genuinely returns at
  ~1.5 MP. "The paid engine hands back a fraction of the pixels the free one does" stands on its own
  evidence and needs no help from screenshot `02`.
- **The presentation asymmetry is still real in principle**, for any upload whose long edge exceeds 1536. It simply was never demonstrated, and the one artifact cited as demonstrating it does not.

## What must change

1. Strike the "this is the whole 'AFTER is noisier'" claim from `change.md`, the roadmap S-18
   section, `plan.md`, `plan-brief.md` and issue #238, and replace it with the delivery-gap
   justification, which survives.
2. Re-derive Phase 2's priority. Its benefit is now unquantified: **no artifact in this repository
   demonstrates the asymmetry**, because the one job examined here had no size mismatch to produce
   it. Whether that is true of every stored job is untested (see the last section).
3. Note for whoever measures it properly: the asymmetry needs a genuinely large upload. The repo
   already has a suitable file in `context/archive/2026-06-18-bread-chroma-postpass/ab-harness/samples/01-very-dark-iso160000.jpg`
   (3840 × 2560, ISO 160000), and measuring the presentation effect needs **no cloud job at all** —
   render it into the box at full resolution versus pre-downscaled to 1536, and compare.

## Corroboration from the stored result sizes

`frame.md` records three stored `result.png` files at **706.3 KB, byte-identical**, and the
screenshot-`02` job at **799.69 KB**. Against a ~896 × 600 result (0.54 MP) that is ≈1.3 bytes per
pixel, which is normal for noisy content. Against a 1536 × 1024 result (1.57 MP) it would be
≈0.45 bytes per pixel, implausibly low for a frame this grainy. The byte sizes point the same way as
the grain measurement.

## Wider consequence, carried to S-17 — confirmed by the maintainer

**The maintainer confirmed on 2026-09-21 that this aurora image was downloaded from the web at the
outset and is the same file the project has worked with from the beginning.** So this is no longer
an inference from sampling: the cloud pipeline's own test photo was a ~0.5 MP web JPEG, already
compressed and already processed by whoever published it.

And it is not only the aurora. The same grain measurement over the BEFORE pane of **all three** of
S-17's evidence screenshots:

| Screenshot                                                       | BEFORE grain |
| ---------------------------------------------------------------- | -----------: |
| `01` wolf                                                        |        2.159 |
| `02` aurora                                                      |        2.786 |
| `03` waterfall                                                   |        2.817 |
| _a multi-MP original downsampled ~5× into the box would measure_ |       _~0.2_ |

All three are an order of magnitude above the downsample reference. **Every failing trial S-17 rests
on used a small source rendered near 1:1**, so Bread passed all three through and no production job
has ever exercised it at a real phone's resolution.

### What that does and does not undermine

- **The colour finding survives.** The hue flip was confirmed by opening Bread's stored raw
  `result.png` outside the app; a magenta cast is a magenta cast whatever the input size. Bread also
  resizes internally to ≤1536 before the network sees the image, so a 12 MP upload and a 0.9 MP
  upload reach the model at comparable scale. The saturation-dependence hypothesis is unaffected.
- **Every resolution, delivery and noise conclusion does not survive.** "The AFTER is noisier",
  "the cloud result is ~1.5 MP against the source's 8–12 MP as experienced by our users" and the
  scaling asymmetry were all read off trials where no downscale occurred. They describe what would
  happen to a real user's phone photo, which is a genuine latent defect, but **nothing in this
  project has ever observed it**.
- **`defaults-experiment.md` inherits the same caveat.** Re-running the aurora at Bread's own
  defaults measures the model on a small web JPEG. That is still worth doing for the colour
  question, but the run should use a real camera-resolution night photo as well, or the result
  carries the same blind spot.

### The free check that settles the rest

Source files are reaped at 24 h, but **every stored `result.png` is still there and its dimensions
are readable at zero cost**. Reading them for all 18 succeeded jobs establishes, for the whole
production history, which uploads Bread downscaled and which it passed through. That is the cheapest
remaining evidence in this project and it needs no prediction, no cap slot and no new photo.

## Second measurement — does the proposed Phase 2 fix actually change anything?

The first two findings only said the cited evidence was wrong. This one asks whether the fix is
worth building at all, and it needs no cloud job: take a genuine 9.83 MP night frame
(`ab-harness/samples/01-very-dark-iso160000.jpg`, 3840 × 2560, ISO 160000), produce the size Bread
would return (1536 × 1024, **pixel ratio 0.160** — the paid engine really does hand back a sixth of
the pixels), and render all three panes into the same box.

| Box (device px) | AFTER | BEFORE today | BEFORE after the fix | Gap today |
| --------------: | ----: | -----------: | -------------------: | --------- |
|             800 | 3.006 |        2.979 |                3.006 | **0.9 %** |
|            1200 | 4.248 |        4.383 |                4.248 | **3.2 %** |
|            1600 | 4.711 |        5.684 |                4.711 | 20.7 %    |
|            2000 | 3.856 |        6.853 |                3.856 | 77.7 %    |

The fix closes the gap to **0.0 % at every size**, which is expected: afterwards both panes go
through literally the same pipeline. The question is what it is closing.

**The asymmetry does not run in the direction the record claims.** At no tested box size is the
AFTER noisier than the BEFORE. At small boxes they are within 1–3 %, which is invisible. At large
boxes the **BEFORE** is the noisier one, by up to 78 %, because once the box exceeds 1536 px the
result is being _upscaled_ (and softened) while the original is still only mildly downsampled.

Practical range: the box is `w-full` capped by `calc(60vh * ratio)`. On a 1080p screen at device
pixel ratio 1 that is ≈970 device px, where the gap is ~1–3 %. At ratio 2 it is ≈1940, where the gap
is large but points the other way.

**Limitation.** The AFTER here is a clean resample of the source, not real Bread output, so this
isolates the _geometry_ and says nothing about Bread's own noise. That is the right separation: the
fix only ever removes the scaling difference, and it would not hide intrinsic model noise — nor
should it.

### What this implies for the plan

- **Phase 2 (rescale the BEFORE) does not earn its diff on the stated justification.** The
  inequality it removes is negligible at ratio 1 and runs opposite to the reported complaint at
  ratio 2. It remains defensible as a principle — make the comparison exactly fair in both
  directions — but that is a design preference, not a bug fix, and it carries the resampler risk
  recorded in the plan.
- **The crop fix survives** unchanged. It is structural, cheap, and independent of any of this.
- **The disclosure becomes the primary deliverable**, and it is now better evidenced than when it
  was written: the measured pixel ratio is **0.160**. Telling the user that the paid engine returned
  a sixth of the pixels is a plain fact they currently have no way to learn.
- **The delivery half still sequences after S-17**, unchanged.

## Third measurement — is there a silent crop to fix at all?

`change.md` flagged a related risk: if Bread's /8 flooring shifts the aspect ratio, `object-cover`
silently trims the BEFORE pane. Measured across ten common camera geometries:

| Source      | Result      | Source AR | Result AR |   Drift |
| ----------- | ----------- | --------: | --------: | ------: |
| 4000 × 3000 | 1536 × 1152 |    1.3333 |    1.3333 | 0.000 % |
| 4032 × 3024 | 1536 × 1152 |    1.3333 |    1.3333 | 0.000 % |
| 4500 × 3000 | 1536 × 1024 |    1.5000 |    1.5000 | 0.000 % |
| 3840 × 2560 | 1536 × 1024 |    1.5000 |    1.5000 | 0.000 % |
| 6000 × 4000 | 1536 × 1024 |    1.5000 |    1.5000 | 0.000 % |
| 5184 × 3888 | 1536 × 1152 |    1.3333 |    1.3333 | 0.000 % |
| 3024 × 4032 | 1152 × 1536 |    0.7500 |    0.7500 | 0.000 % |
| 4001 × 3000 | 1536 × 1152 |    1.3337 |    1.3333 | 0.025 % |

**Nine of ten drift by exactly zero**, because standard sensor dimensions scale onto multiples of 8
cleanly. The worst contrived case is 0.025 %, which is **0.2 px in an 800 px box**.

So there is no crop to fix. Phase 3 was narrowed to what is genuinely wrong: the slider's prop doc
claims `before === after`, a contract the Cloud path has violated since launch, and a future reader
would trust it. That is a comment correction with no render change.
