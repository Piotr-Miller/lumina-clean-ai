# Fair before/after comparison on the Cloud path — Plan Brief

> Full plan: `context/changes/cloud-result-resolution-gap/plan.md`
> Frame brief: `context/changes/cloud-quality-below-local/frame.md` (parent change S-17)
> Research: `context/changes/cloud-quality-below-local/research.md` (parent change S-17)

## What & Why

The before/after slider renders both panes into **one CSS box sized from the result**, so the
browser downsamples the 8–12 MP original hard (averaging its grain away, reading as crisp) while
showing the ~1.5 MP cloud result at or near 1:1 with every noise pixel visible. That asymmetry is
the whole "the AFTER is noisier than the BEFORE" observation against S-17's screenshot `02` — **no
pixel fault is required to produce it**, and the Local path cannot exhibit it. Fixing it also cleans
the evidence S-17's model decision will rest on: Bread is currently judged through a slider that
flatters the original.

## Starting Point

`BeforeAfterSlider` takes `width`/`height` and sizes its box from them, rendering both images
`object-cover h-full w-full`. Its own prop doc states the contract it assumes — _"before === after"_
— which the cloud branch has violated since launch by passing the **result's** dimensions. The
source's dimensions are already decoded for luma sampling and thrown away.

## Desired End State

On a cloud job with a downscaled result, both panes are shown at the same effective resolution, so a
noise comparison is honest in both directions; nothing is silently cropped; and a caption beside the
Download action states both pixel dimensions, so the resolution actually delivered is a visible fact.
On the local path, and on any cloud job Bread passed through unchanged, nothing changes at all.

## Key Decisions Made

| Decision               | Choice                                                        | Why (1 sentence)                                                                                                     | Source   |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------- |
| Scope                  | Presentation half only                                        | Delivery interacts with S-17's model decision; the roadmap already records this sequencing and S-18 stays open.      | Plan     |
| Fairness mechanism     | Downscale the BEFORE pane to match the result                 | Only option giving both panes an identical scaling path regardless of device pixel ratio or viewport width.          | Plan     |
| Scale target           | By **factor**, not to the result's exact dimensions           | Bread floors both dimensions to a multiple of 8; scaling to exact dimensions would stretch the original by a few px. | Plan     |
| Resampler              | Quality resize (`resizeQuality: "high"`), verified in Firefox | Default bilinear at 3× **aliases** noise and sharpens it, which would make the comparison worse than it is today.    | Plan     |
| Verify before building | Phase 0 empirical side-by-side, as a gate                     | Browsers already area-average on downscale, so the real gain may be smaller than the frame assumes.                  | Plan     |
| Disclosure             | Caption when resolutions differ, beside Download              | Equalising the panes also **hides** the deficit; the caption is the other half of the same honesty.                  | Plan     |
| "Differ" threshold     | `resultPixels < 0.9 × sourcePixels`                           | Catches a real pixel-count drop while never firing on /8 flooring, which costs ≲1 % at realistic sizes.              | Plan     |
| Where the logic lives  | A pure, DOM-free module + Vitest `node` tests                 | There is **no component-test harness** in the repo; this matches the existing env-free-core split pattern.           | Plan     |
| Cause of the symptom   | Presentation, not a pixel fault                               | Established by the parent frame at confidence STRONG (dimension 2b).                                                 | Frame    |
| Bread's output rule    | 1536 px long edge, both dims floored to /8, not configurable  | Measured on the model's own demo pairs; "~1.5 MP" is an average, not a constant.                                     | Research |

## Scope

**In scope:** rescaling the BEFORE pane for display; removing the silent `object-cover` crop when
Bread's /8 flooring shifts the aspect ratio; a resolution caption beside Download; a pure decision
module with unit tests; a smaller E2E output fixture so the new path is actually covered.

**Out of scope:** upscaling the result, requesting a larger output from the model, PNG-vs-JPEG or
`JPEG_QUALITY` changes, any change to downloaded bytes or the uploaded source, the chroma pass and
its 12 MP contract, any frozen E2E string, and adding a component-test framework.

## Architecture / Approach

Split the decision from the pixels. A DOM-free module answers two questions from four integers —
_rescale the original, and to what?_ and _do the resolutions differ enough to say so?_ — and is fully
unit-testable under the existing Vitest `node` environment. A thin browser adapter performs the
resample with a quality resizer and returns `null` on any failure. The workspace captures the source
dimensions from a decode it already performs, feeds both answers into the slider and the caption, and
falls back to today's exact behaviour whenever anything returns `null`.

## Phases at a Glance

| Phase                       | What it delivers                                          | Key risk                                                                             |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 0. Verify the premise       | A recorded side-by-side settling how much is presentation | Needs the maintainer's own copy of the photo — the stored source was reaped at 24 h  |
| 1. Pure scaling core        | DOM-free module + unit tests on every degenerate case     | Threshold picked wrong would fire the caption on /8 rounding noise                   |
| 2. Wire the fair comparison | Rescaled BEFORE pane, shared box, crop gone               | A poor resampler makes the original grainier — the one way this becomes a regression |
| 3. Disclose the resolution  | Caption beside Download, cloud-only, conditional          | New string lands in an E2E-load-bearing module (new key only, nothing edited)        |
| 4. Real E2E coverage        | Smaller output fixture so the path is genuinely exercised | Today's fixture is 128×128 echoed back, so a green run currently proves nothing      |

**Prerequisites:** the maintainer's original aurora photo for Phase 0 (the stored `source.jpg` for
job `190832de…` is reaped; the `result.png` is still in storage). Nothing else.
**Estimated effort:** ~1–2 sessions across 5 phases; Phase 0 is minutes, Phase 4 carries the slowest
gate (`npm run test:e2e`).

## Open Risks & Assumptions

- **Phase 0 may shrink the payoff.** Browsers already area-average when downscaling, so part of the
  symptom may be residual model noise after a gamma 1.5 lift. If so, that is **evidence for S-17**,
  not a failure here — the crop fix and the caption stand on their own.
- **Firefox ignores `imageSmoothingQuality`**, so a fallback resampler relying on it would silently
  degrade there. Both browsers are in the manual criteria.
- The slider's `role="slider"` + aria-label and the `"Your photo — enhanced"` image name are frozen
  and asserted verbatim by specs that **hardcode the literals and do not import `STRINGS`** — a
  string change produces no compile error, only a red E2E run. This plan edits none of them.
- No spec constrains the BEFORE pane, so swapping its `src` for a canvas object URL is free. That is
  a current fact about the specs, re-check it if they change.

## Success Criteria (Summary)

- On a downscaled cloud result the two panes show noise at the same scale, and the original is no
  grainier than the OS photo viewer renders it — in Chromium and Firefox.
- The user can see, beside Download, the resolution they are actually getting.
- The local path and pass-through cloud jobs are byte-for-byte unchanged, and the full E2E gate is
  green **while genuinely exercising the new path**.
