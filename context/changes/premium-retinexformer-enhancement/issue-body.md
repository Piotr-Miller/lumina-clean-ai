## Summary

Add a Premium Retinexformer enhancement path as a post-MVP slice.

- Standard path stays `Bread/Replicate -> chroma-pass[bread]`.
- Premium path becomes `Retinexformer self-hosted -> chroma-pass[retinexformer]`.
- Retinexformer is explicitly user-selected, slower, and not an automatic fallback.

## Why this is parked post-MVP

This is optional quality upside after the Standard cloud path, not an MVP
success criterion.

## Prerequisites

- `S-11` `bread-chroma-postpass`

## Requirements

- Benchmark `Bread + chroma-pass[bread]` against
  `Retinexformer + chroma-pass[retinexformer]` on 20-50 representative
  low-light photos before implementation.
- Persist `engine_requested`, `engine_used`, and the resolved model version.
- Keep Premium timeout and cost or entitlement policy separate from Standard.
- Do not add automatic cross-engine retry.
- Treat RGB or RGBA output handling as an explicit contract decision.
- Do not call the user-facing mode `HD`; this slice does not imply upscaling or
  higher resolution.

## Labels

- `roadmap`
- `slice`
- `status:ready`
- `phase:post-mvp`
