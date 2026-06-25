---
change_id: chroma-postpass-enable
title: Enable the Bread chroma-denoise post-pass in production (flag ON)
status: preparing
created: 2026-06-25
updated: 2026-06-25
archived_at: null
---

## Notes

Production enable of the chroma-denoise post-pass shipped (dark) in S-11 `bread-chroma-postpass`: flip `CHROMA_POSTPASS_ENABLED` (`src/lib/engines/chroma-denoise.ts`) from `false` → `true`. Deliberately separate from S-11, which merged the code flag-OFF.

Gate the flip on the S-11 review's **observation F3**: the Phase-5 GO rested on a synthetic ground-truth A/B because the real samples lacked flat-shadow chroma noise. Before enabling, validate with a **real Bread before/after** on genuinely noisy low-light shadows — not another synthetic test. See `context/archive/2026-06-18-bread-chroma-postpass/` (tuning-results.md, reviews/impl-review.md F3) and the lesson "synthetic-ground-truth A/B GO is a GO-to-merge-OFF, not a GO-to-enable".

Scope to settle in planning: where the real A/B runs (live prod cloud path is auth-gated + globally capped `CLOUD_DAILY_CAP`), rollback (flip back to `false`), and whether any user-facing toggle/telemetry is needed. Tuned defaults already in: `DEFAULT_CHROMA_PARAMS = { blurRadius: 3, maxStrength: 0.9, shadowCurve: 2.5 }`, bounded ≤12 MP with raw-Bread fail-open fallback.
