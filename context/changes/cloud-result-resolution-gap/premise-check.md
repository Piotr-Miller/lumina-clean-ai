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

## Wider consequence, worth carrying to S-17

`frame.md` established that this aurora image has been the **de-facto cloud test photo since
launch**, and that three jobs sampled from 2026-06-08, 06-13 and 06-18 are the same photo with
byte-identical results. If those uploads were this same ~0.5 MP file — likely, but **sampled, not
proven across all 18 stored jobs** — then the production corpus contains little or no evidence of
Bread's behaviour on a real 8–12 MP phone upload: its resolution, its noise, or its colour at that
size. **Checking the stored sources is no longer possible** (they are reaped at 24 h), but the
stored `result.png` dimensions are still readable and would settle it for every job at zero cost.
That is a cheap, high-value check for whoever next touches S-17.
