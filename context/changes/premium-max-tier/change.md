---
change_id: premium-max-tier
title: Add a Premium Max application tier
status: new
created: 2026-06-19
updated: 2026-06-19
archived_at: null
issue: 61
---

## Notes

Planned roadmap slice **S-14**, classified as `phase:post-mvp`.

Add a higher application tier above Standard and Premium, tentatively named
`Premium Max`.

Intent:

- `Standard` remains `Bread/Replicate -> chroma-pass[bread]`
- `Premium` remains `Retinexformer self-hosted -> chroma-pass[retinexformer]`
- `Premium Max` becomes the explicit best-quality tier for the hardest
  low-light photos, combining a heavier processing path with product-tier
  benefits

### Proposed Premium Max composition

- Premium image path as the base:
  `Retinexformer self-hosted -> chroma-pass[retinexformer]`
- Optional heavy denoise post-pass for the hardest images only, such as
  `NAFNet` or an equivalent stronger cleanup stage, gated by an explicit mode
  or a tightly controlled Auto-Max policy
- More conservative artifact prevention than "make it brighter at any cost":
  protect skin tones, color fidelity, and detail before applying the heavy pass
- Premium Max-specific quality presets for scenes like:
  `extreme_noise`, `night_portrait`, `dark_interior`, `street_night`
- Higher product limits than lower tiers:
  larger image-size allowance, higher daily or monthly quota, and longer
  timeout budget for heavyweight processing
- Priority job scheduling so Premium Max work does not wait behind Standard jobs
- Batch workflow for small photo sets instead of only one-off single-image use
- Saved presets or reusable profile defaults for repeat users

### What this slice is not

- Not RAW support; RAW remains a separate parked direction
- Not silent auto-escalation from Standard into a paid heavier path
- Not a rename of the Retinexformer slice; it builds on top of Premium rather
  than replacing it

### Prerequisites

- **S-12** `adaptive-enhancement-parameters`
- **S-13** `premium-retinexformer-enhancement`

### Main blockers

- entitlement and pricing design for a tier above Premium
- cost-safe policy for heavyweight second-pass processing
- queue isolation and timeout budgeting so Max jobs do not degrade the standard
  path
- benchmark evidence that the heavy pass meaningfully improves the hardest
  photos without too much over-smoothing or hallucination

### Research gate

Before implementation, validate whether `Premium Max` is better expressed as:

- a separate paid tier,
- a premium add-on pack,
- or a per-job "Max quality" mode inside Premium.

The answer changes billing, UI, queueing, and entitlement design.
