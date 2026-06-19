## Summary

Add a new post-MVP `Premium Max` application tier above Standard and Premium.

## Proposed composition

- Base premium path:
  `Retinexformer self-hosted -> chroma-pass[retinexformer]`
- Optional heavy denoise second pass for the hardest photos only, such as
  `NAFNet` or an equivalent stronger cleanup stage
- Premium Max-only quality presets for extreme low-light scenes
- Higher limits, longer timeout budget, and priority scheduling
- Batch workflow for small photo sets
- Saved presets or reusable profile defaults

## Why this is a separate slice

This is not just a model swap. It is a higher product tier that combines:

- a heavier quality pipeline,
- different cost and entitlement policy,
- queue and timeout isolation,
- and additional workflow value for power users.

## Prerequisites

- `S-12` `adaptive-enhancement-parameters`
- `S-13` `premium-retinexformer-enhancement`

## Open questions

- Is `Premium Max` a standalone tier, an add-on, or a per-job mode?
- Which heavy second-pass model survives benchmark review?
- How do we keep Max jobs from degrading Standard and Premium latency?

## Labels

- `roadmap`
- `slice`
- `status:proposed`
- `phase:post-mvp`
