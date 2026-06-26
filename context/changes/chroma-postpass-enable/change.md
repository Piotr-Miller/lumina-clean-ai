---
change_id: chroma-postpass-enable
title: Enable the Bread chroma-denoise post-pass in production (flag ON)
status: implementing
created: 2026-06-25
updated: 2026-06-25
archived_at: null
---

## Notes

Production enable of the chroma-denoise post-pass shipped (dark) in S-11 `bread-chroma-postpass`: flip `CHROMA_POSTPASS_ENABLED` (`src/lib/engines/chroma-denoise.ts`) from `false` → `true`. Deliberately separate from S-11, which merged the code flag-OFF.

Gate the flip on the S-11 review's **observation F3**: the Phase-5 GO rested on a synthetic ground-truth A/B because the real samples lacked flat-shadow chroma noise. Before enabling, validate with a **real Bread before/after** on genuinely noisy low-light shadows — not another synthetic test. See `context/archive/2026-06-18-bread-chroma-postpass/` (tuning-results.md, reviews/impl-review.md F3) and the lesson "synthetic-ground-truth A/B GO is a GO-to-merge-OFF, not a GO-to-enable".

Scope to settle in planning: where the real A/B runs (live prod cloud path is auth-gated + globally capped `CLOUD_DAILY_CAP`), rollback (flip back to `false`), and whether any user-facing toggle/telemetry is needed. Tuned defaults already in: `DEFAULT_CHROMA_PARAMS = { blurRadius: 3, maxStrength: 0.9, shadowCurve: 2.5 }`, bounded ≤12 MP with raw-Bread fail-open fallback.

## Status — ✅ Phase 1 CONDITIONAL GO (F3 safety closed, 2026-06-26) → Phase 2 next

Phase 1 (F3 gate) is **CONDITIONAL GO**. Round 1 (3 NIND ISO6400 scenes) proved **safety** on real Bread output (maxΔY ≈ 0 rounding floor, no highlight leak) but couldn't test sufficiency (Bread lifted them clean, `Y<64` = 1.5–6%). **Round 2** added `tree1`: a real high-ISO noisy Bread output whose deep-shadow population is below the rig's original floor (`Y<64` = 10.2%) but whose claimed noise band is mostly mid-shadow (`Y 64–128` = 51.1%). Re-measuring that band shows **12.9% / 15.2% Cb/Cr stddev reduction** vs **1.2% / 1.4%** on the clean `nightsky` control — clean (chroma-only, no halos/bleeding/softening, confirmed at 100% + 10× diff) but subtle at normal zoom. Params unchanged `(3, 0.9, 2.5)`. Flag stays OFF until Phase 5; **Phases 2–4 unblocked** to add the runtime flag, telemetry, and ON-path test. ✅ **Phase-1 impl-review triage complete (2026-06-26)**: all findings fixed or accepted as documented. The Phase-5 prod flip remains gated on telemetry / real-world verification, not treated as firmly-proven sufficiency from this sample alone. See `reviews/impl-review-phase-1.md`. Next: `/10x-implement chroma-postpass-enable phase 2`.
