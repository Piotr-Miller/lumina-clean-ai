**Roadmap ID:** S-12
**Change ID:** `adaptive-enhancement-parameters`
**Type:** post-MVP vertical slice
**Status:** ready for research
**Phase:** `phase:post-mvp`

## Outcome

After selecting a photo, a user sees a responsive parameter panel to the right
of the image (below it on narrow screens), can adjust parameters supported by
the active engine, and can start from Auto-recommended values while retaining
the ability to override any recommendation manually.

## Scope

### Local

- `gamma`
- blur intensity

### Cloud AI

- Keep Bread as the only Cloud model in this slice.
- Expose Bread `gamma`.
- Expose Bread `strength`.

### Auto and manual override

- Auto analyzes the selected image and populates the same visible sliders used
  for manual control.
- Moving a slider overrides that parameter without discarding untouched
  Auto-selected values.
- The panel provides a visible way to restore the Auto recommendation.

## Out of scope

- Model selection or model fallback
- Retinexformer/Cog
- Additional synthetic Bread parameters
- Advanced Local processing algorithms
- Training or fine-tuning a model

## Dependencies

- **Prerequisites:** S-01 (Local engine + shared image UI), S-04 (Bread pipeline
  - Cloud result flow)
- **Related slice:** S-11 `bread-chroma-postpass`. Avoid parallel implementation
  until the Bread input contract and ownership boundary are reconciled. S-12
  exposes only Bread `gamma`/`strength`; S-11's chroma post-pass remains
  internal.

## Research decisions before planning

1. Auto analyzer: deterministic image metrics, vision model, or hybrid.
2. Safe ranges and defaults for each engine.
3. Local preview/reprocessing behavior.
4. Cost-safe Cloud interaction: dragging sliders must not create an unbounded
   stream of paid Bread jobs; use an intentional Apply action or equivalent
   bounded behavior.
5. Responsive panel behavior on mobile.
6. Representative low-light image set for validating over-brightening.

## Risk

Auto can look authoritative while choosing poor values; frequent Cloud slider
changes can multiply paid jobs; and a desktop right-side panel can crowd mobile
layouts. Recommendations must stay visible and editable, values must be
bounded, and Cloud processing must use a cost-safe interaction.

## Next

Run:

```text
/10x-research adaptive-enhancement-parameters
```
