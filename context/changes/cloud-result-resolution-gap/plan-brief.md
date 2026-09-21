# Disclose the delivered resolution on the Cloud path — Plan Brief

> Full plan: `context/changes/cloud-result-resolution-gap/plan.md`
> Phase 0 measurement and re-scope rationale: `context/changes/cloud-result-resolution-gap/premise-check.md`
> Frame brief: `context/changes/cloud-quality-below-local/frame.md` (parent change S-17)

> **Re-scoped 2026-09-21.** The original plan led with rescaling the BEFORE pane so the two
> comparison panes matched. Phase 0 measured that idea and dropped it. What follows is what survived.

## What & Why

On the Cloud path the user receives roughly **a sixth of the pixels** the free Local engine returns,
and the interface gives them no way to find that out. Measured on a real 9.83 MP night frame, Bread
returns 1536 × 1024 — pixel ratio **0.160**. The paid engine quietly delivers less than the free one.
This plan makes that a visible fact.

## Starting Point

`BeforeAfterSlider` takes `width`/`height` and sizes its box from them. `EnhanceWorkspace` already
holds both numbers the disclosure needs: the result's dimensions on the cloud branch, and the
source's from a decode it already performs for luma sampling and then discards.

## Desired End State

A signed-in user whose cloud result came back smaller than their upload sees, beside the Download
control, what they uploaded and what they are downloading. On the Local path, and on any cloud job
Bread passed through, nothing changes at all.

## Key Decisions Made

| Decision                  | Choice                                                       | Why (1 sentence)                                                                                                                                        | Source   |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Scope                     | Presentation half only                                       | Delivery interacts with S-17's model decision; the roadmap already records that sequencing and S-18 stays open.                                         | Plan     |
| **Rescale the BEFORE**    | **Dropped**                                                  | Measured: the asymmetry is 1–3 % at a typical box and runs the _opposite_ way at high pixel ratios, and it risked regression through resampler quality. | Phase 0  |
| Primary deliverable       | Disclose both resolutions beside Download                    | Equalising the panes would have _hidden_ the deficit; the user currently has no way to learn they got a sixth of the pixels.                            | Plan     |
| "Differ" threshold        | `resultPixels < 0.9 × sourcePixels`                          | Catches a real pixel drop, never fires on Bread's /8 flooring, which costs ≲1 % at realistic sizes.                                                     | Plan     |
| Crop fix                  | Kept, but as a bounded tidy-up                               | The /8 flooring shifts the ratio by at most ~0.8 %, so this is correctness, not a visible bug.                                                          | Phase 0  |
| Where the logic lives     | A pure DOM-free predicate + Vitest `node` tests              | There is **no component-test harness**; this matches the repo's existing env-free-core split.                                                           | Plan     |
| Cause of the S-17 symptom | Bread's own output, not presentation                         | Phase 0 measured 1.05× luma and 0.82× chroma between the panes, and the cited job had no size mismatch at all.                                          | Phase 0  |
| Bread's output rule       | 1536 px long edge, both dims floored to /8, not configurable | Measured on the model's own demo pairs; "~1.5 MP" is an average, not a constant.                                                                        | Research |

## Scope

**In scope:** a pure disclosure predicate with unit tests; a caption beside Download stating both
resolutions; a bounded correction to the silent `object-cover` crop; a smaller E2E output fixture so
the new path is genuinely exercised.

**Out of scope:** rescaling the BEFORE pane; upscaling the result; requesting a larger output;
PNG-vs-JPEG or `JPEG_QUALITY` changes; any change to downloaded bytes or the uploaded source; the
chroma pass and its 12 MP contract; any frozen E2E string; adding a component-test framework.

## Architecture / Approach

One pure predicate answers "did the result lose enough pixels to be worth saying so?" and is fully
unit-testable under the existing Vitest `node` environment. The workspace captures the source
dimensions from a decode it already performs, and renders a caption beside Download when the
predicate says so. Every path degrades to today's behaviour when a number is missing.

## Phases at a Glance

| Phase                       | What it delivers                                        | Key risk                                                                        |
| --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 0. Premise check **(done)** | The measurement that re-scoped this plan                | Already paid off — it removed a phase before any code was written               |
| 1. Disclosure predicate     | DOM-free module + unit tests on every degenerate case   | A wrong threshold fires the caption on /8 rounding noise                        |
| 2. Disclose the resolution  | Caption beside Download, cloud-only, conditional        | New string lands in an E2E-load-bearing module (new key only, none edited)      |
| 3. Correct the silent crop  | Box sized from the source; bounded ≤0.8 % trim moves    | Touching a component whose accessible names are frozen                          |
| 4. Real E2E coverage        | Smaller output fixture so the path is genuinely covered | Today's fixture is 128×128 echoed back, so a green run currently proves nothing |

**Prerequisites:** none. Phase 0 is complete.
**Estimated effort:** ~1 session; Phase 4 carries the slowest gate (`npm run test:e2e`).

## Open Risks & Assumptions

- The disclosure's value rests on the delivery gap being real for **actual users**, which follows
  from Bread's 1536 cap plus ordinary phone photo sizes. It has **never been observed in this
  project**, because every stored cloud job used the same ~0.5 MP web image.
- The slider's `role="slider"` + aria-label and the `"Your photo — enhanced"` image name are frozen
  and asserted by specs that hardcode the literals and do **not** import `STRINGS` — a string change
  produces no compile error, only a red E2E run. This plan edits none of them.
- Bread's /8 flooring bound (~0.8 %) is derived from the documented rule, not measured across many
  real outputs.

## Success Criteria (Summary)

- A user whose cloud result came back smaller can see, beside Download, exactly what they uploaded
  and what they are getting.
- The Local path and pass-through cloud jobs are unchanged.
- The full E2E gate is green **while genuinely exercising the new path**.
