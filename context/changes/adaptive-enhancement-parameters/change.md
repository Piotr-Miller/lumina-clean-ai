---
change_id: adaptive-enhancement-parameters
title: Add manual and Auto parameter controls for Local and Bread
status: preparing
created: 2026-06-18
updated: 2026-06-28
archived_at: null
issue: 52
---

## Notes

Post-MVP quality/UX slice (`phase:post-mvp`).

User-reported quality problem: generated results can look over-brightened.

Locked scope covers both existing enhancement strategies, with engine-specific
parameter sets shown in a panel to the right of the photo:

- Local Canvas engine: gamma and blur intensity.
- Cloud AI engine: Bread `gamma` and `strength`.

The panel provides:

- Manual sliders with values and safe engine-specific ranges.
- An Auto mode that analyzes the selected image and populates the sliders.
- Manual override at any time: moving a slider keeps the other Auto-selected
  values but marks that parameter as user-controlled.
- A visible way to restore the Auto recommendation.

Bread remains the only Cloud model in this slice. Model selection, model
fallback, Retinexformer/Cog, additional Cloud parameters, and advanced Local
processing are explicitly out of scope.
