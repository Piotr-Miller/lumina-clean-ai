---
change_id: gpt-image-26-wider
title: "Wider blind comparison of GPT-Image-2.6 Sunburst (complexity=low) on all eight tuning photos"
status: implementing
created: 2026-11-21
updated: 2026-11-25
archived_at: null
---

## Notes

This is a follow-up of `gpt-image-26-screen` (#359, archived
`context/archive/2026-11-05-gpt-image-26-screen/`). The screen ended PASS, but its fidelity labels
contradict its own reasons (`frame.md`). This change fixes the instrument first, then runs a blind,
paid comparison on S17-01…07 and S17-21, with 2 slots each.

### Owner decisions (2026-11-21, /rune-plan)

- **Fidelity level:** graded by size/visibility, the same rule for invented or altered content
  (identity, legible text, objects) and for removed detail or a changed colour character.
  **significant** = visible with the whole frame fitted to the viewer, without zoom.
  **minor** = found only when zoomed in.
- **Majority:** a pairwise fidelity preference per pair, as in S-19. PASS needs ≥ 8 of 16 pairs to
  be a tie or GPT-favoured, no GPT side `significant`/`severe`, all 16 delivered, and spend within
  the cap.
- **Sequence:** write the anchor, then the paid 8-photo run, with no $0 re-rate of the screen's
  outputs.
- **Slots and cap:** 8 × 2 = 16 slots, with a cap of **$3.50**. Σ worst-case bounds are
  ≈ $3.20–3.36, and the expected spend is ≈ $1.30.
- **Wall time:** diagnostic only (p95 vs 30 s).

### Owner decisions (2026-11-24, /rune-implement phase 1)

- 2026-11-24: owner decision — NumPy 2.5.5 on the Fedora host instead of the 2.5.4 recorded in
  the screen's regression baseline
  (`context/archive/2026-11-05-gpt-image-26-screen/evaluations/regression-baseline.md`) is
  acceptable. Every other pinned dependency and the `package-lock.json` sha256 match; recorded in
  `evaluations/regression-baseline.md` of this change. No plan text changes.

## GPT26 approvals

<!--
Owner-only record. Only the owner writes an approval line here, and commits it before any paid call.
scripts/gpt26/run.py strictly parses exactly one line of this grammar and refuses when it is absent,
malformed, duplicated, uncommitted, or when cap_usd differs from the runner's --cap:

- GPT26-SPEND cap_usd=3.50 decision=approved date=YYYY-MM-DD

The blind-set seal is NOT stored in this mutable lifecycle file. It goes, once, into the write-once
evaluations/gate-sealed.md (plan.md Phase 5).
-->
