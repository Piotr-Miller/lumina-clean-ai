---
change_id: cloud-result-resolution-gap
title: "Cloud AI returns ~1.5 MP lossy JPEG where Local returns full resolution"
status: archived
outcome: completed
created: 2026-09-20
updated: 2026-09-21
archived_at: 2026-09-21T22:09:29Z
issue: 238
archive_commit: 7b4ad63
sync: done
---

## Notes

**Registered 2026-09-21 as roadmap slice S-18, issue [#238](https://github.com/Piotr-Miller/lumina-clean-ai/issues/238), Backlog Handoff `ready`.** The folder had existed since 2026-09-20 with no tracker entry anywhere — S-17's roadmap block twice said the delivery gap should be split out, the split happened, and nothing recorded it.

Split out of `cloud-quality-below-local` (S-17) on 2026-09-20, during that
change's framing step. It is **separable**: confirmed, entirely ours, and
independent of whatever is decided about the Bread model. See
`context/changes/cloud-quality-below-local/frame.md` for the investigation that
surfaced it.

Two coupled defects, both on the Cloud path only:

1. **Resolution.** Bread returns a downscaled ~1.5 MP PNG — recorded three times
   (`context/archive/2026-06-25-chroma-postpass-enable/real-ab-results.md:80`,
   `.../prod-flip-procedure.md:27`,
   `context/archive/2026-06-18-adaptive-enhancement-parameters/repro-findings.md:49`).
   A modern phone original is 8–12 MP. The Local engine, by contrast, returns
   the source's own dimensions (`src/lib/engines/local-engine.ts:31, 61`). So the
   paid engine hands the user roughly an eighth of the pixels the free one does.
   On top of that the cloud result is re-encoded to lossy JPEG at
   `JPEG_QUALITY = 0.92` (`src/lib/engines/canvas-helpers.ts:12`, applied at
   `src/lib/services/cloud-result-postprocess.client.ts:65`) whenever the chroma
   post-pass runs, while the stored artifact is a lossless PNG.

2. **The comparison is unfair, which makes it look worse than it is.**
   `BeforeAfterSlider` sizes its box from the **result's** dimensions
   (`src/components/enhance/BeforeAfterSlider.tsx:64-67`) and renders both panes
   `object-cover` at `h-full w-full` (`:86-100`). Both land in the same CSS box,
   so the 12 MP original is downsampled ~3× by the browser — which averages its
   grain away and reads as crisp — while the ~1.5 MP result is shown at or near
   1:1, every noise pixel visible.

   ⚠️ **Corrected 2026-09-21.** This was registered as **"the whole 'the AFTER
   is noisier than the BEFORE' observation … no pixel fault is required"**, and
   both halves are **measured false** (`premise-check.md`). The cited job had no
   size mismatch at all — its source was an 899 × 600 web file, which Bread passes
   through — and on a real 9.83 MP frame the scaling asymmetry never makes the
   AFTER the noisier pane: 1–3 % at a typical box, and the _opposite_ direction at
   high device-pixel ratios. The geometry described above is real; what is false
   is that it explains screenshot `02`. The Local path still cannot exhibit it,
   because its result dimensions equal the source's.

   Related risk to check while here: if Bread's downscale changes the aspect
   ratio at all, `object-cover` silently **crops** the BEFORE pane.

### Why this is its own change

S-17's outcome sentence is "a user who switches to Cloud AI gets a result that is
visibly better than the Local engine". This gap sits inside that sentence but has
a different cause, a different fix and a different risk profile, and it would be
quietly absorbed — and then quietly dropped — if it rode along with the model
decision. It is also the part that is **already confirmed**: no further
investigation is needed to know it is real.

### Not yet decided

Whether the answer is upscaling, requesting a larger output from the model,
keeping PNG on the cloud path, sizing the slider from the _source_ instead of the
result, showing both panes at matched effective resolution, or simply disclosing
the output size. That is what planning is for. Note that some options interact
with the model decision in S-17 — sequence accordingly.
