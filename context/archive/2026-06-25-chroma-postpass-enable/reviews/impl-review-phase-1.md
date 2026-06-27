<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Enable chroma post-pass — Phase 1 (F3 gate)

- **Plan**: context/changes/chroma-postpass-enable/plan.md
- **Scope**: Phase 1 of 5 (manual real-Bread A/B validation — no src/ code; produced the decision doc + A/B rig)
- **Date**: 2026-06-26
- **Verdict**: APPROVED AFTER TRIAGE (initial review: NEEDS ATTENTION — safety half solid; sufficiency half over-claimed)
- **Findings**: 0 critical, 4 warnings, 1 observation — all triaged

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Grounding

Independent adversarial audit (sub-agent) of `real-ab-results.md`, `bread-ab.ts`, `run-ab.sh`, `local-ab-sync.sh`, `chroma-denoise.ts`, `plan.md` Phase 1. Safety evidence (maxΔY≈0.48–0.50 ×4–5, hiLeak≈0), rig correctness (real `denoiseChroma`/`DEFAULT_CHROMA_PARAMS`, correct clamping, no secret leak, `set -euo pipefail`, secret via stdin not argv), and plan-adherence all confirmed SOUND. Sufficiency-half claims found over-stated.

## Findings

### F1 — Qualifying sample below the rig's own threshold; metric window contradicts the excuse

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Success Criteria
- **Location**: real-ab-results.md (tree1 shadowPx 10.2%) vs run-ab.sh:17–18 (≥15–20% floor)
- **Detail**: tree1's post-Bread shadowPx(Y<64)=10.2% is below the rig's own stated qualifying floor (≥15–20%). The doc explains it away ("noise sits in mid-shadows Y 64–128"), but the headline 22–29% reduction is measured _over Y<64_ — the very window it calls unrepresentative. Either the window is right (sample sub-qualifies) or wrong (headline measured on wrong pixels); the doc keeps both.
- **Fix A ⭐ Recommended**: Soften to a conditional GO + re-measure reduction over Y 64–128 (the claimed noise band) for an honest number.
  - Strength: Resolves the contradiction with one free metric run (cached output).
  - Tradeoff: A few minutes; may reveal an even more modest effect.
  - Confidence: HIGH — bread-ab.ts already has the machinery; change the window only.
  - Blind spot: None significant.
- **Fix B**: Accept the sample as-is but explicitly record it is sub-threshold in the decision.
  - Strength: No rework. Tradeoff: leaves the contradiction on record. Confidence: MED.
- **Decision**: FIXED — applied Fix A. `bread-ab.ts` now reports both `Y<64` and `Y 64–128`; cached Round 2 outputs re-measured `tree1` mid-shadow reduction at 12.9% / 15.2% over 51.1% px and `nightsky` near-null at 1.2% / 1.4%. `real-ab-results.md`, `plan.md`, and `change.md` now frame Phase 1 as a conditional GO rather than firm sufficiency proof.

### F2 — "Visible" gate criterion met only as "measurable"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: real-ab-results.md Status/Decision vs body ("indistinguishable at normal zoom")
- **Detail**: The bar says "visible shadow-chroma reduction"; the effect was indistinguishable at normal zoom, visible only at 10× diff. Disclosed honestly in the body, but the Status/Decision headline asserts "gate met" without flagging the visible→measurable substitution.
- **Fix**: Reword Status/Decision headline to "sufficiency: measurable, not visibly obvious."
- **Decision**: FIXED — F1's doc updates reworded the Status/Decision from a firm visible-benefit claim to "CONDITIONAL GO — F3 safety closed; sufficiency is measurable but modest" and explicitly note the effect is "not visibly obvious at normal zoom."

### F3 — stddev metric can't separate noise removal from chroma-signal loss

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: bread-ab.ts:142–143 (reduction metric); nightsky control
- **Detail**: A box blur lowers chroma stddev whether the variance is noise or real color gradient. The nightsky null (0.2%) only proves no fabricated change on already-flat chroma; it does NOT rule out attenuating real color detail (no control with genuine chroma detail in shadow exists).
- **Fix**: Note the metric limitation in the doc; treat Phase-3 real-world telemetry as the actual sufficiency arbiter rather than this proxy.
- **Decision**: FIXED — `real-ab-results.md` now states that Cb/Cr stddev reduction is only a proxy and cannot by itself prove noise removal vs chroma-detail attenuation; Phase 3 telemetry plus Phase 5 real-world verification are named as the actual sufficiency arbiter.

### F4 — GO over-confident on one sub-threshold, wrong-provenance sample

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: real-ab-results.md Decision; change.md Status
- **Detail**: F3 closed on ONE sample that (a) sub-qualifies (F1), (b) is a NIND/Wikimedia dataset frame, not the "real handheld phone night shot" the recipe demands, (c) shows a subtle effect on a soft metric (F3). "GO" reads symmetric across both halves; the halves are asymmetric (safety strong, sufficiency weak).
- **Fix**: Reframe as conditional GO (safety confirmed; sufficiency weak). Phase 5 prod flip must NOT lean on this as firmly-proven sufficiency — gate it on telemetry / a real phone night shot.
- **Decision**: FIXED — F1/F2/F3 updates reframed the Phase 1 outcome as a conditional GO: safety is confirmed, sufficiency is weak/measurable-not-visible, the dataset/provenance limitation remains explicit, and Phase 5 is gated on telemetry / real-world verification rather than this sample alone.

### F5 — Rig measures the algorithm, not the production JPEG re-encode round-trip

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: bread-ab.ts (pngjs/jpeg-js decode, no q0.92 re-encode) vs cloud-result-postprocess.client.ts
- **Detail**: Production decodes via Canvas and re-encodes JPEG @0.92; the rig measures pre-encode chroma deltas. Correct thing to measure for the algorithm, but the every-result re-encode quality cost isn't in the A/B numbers (already partly noted as a caveat).
- **Fix**: Note it; no action needed for Phase 1.
- **Decision**: FIXED/ACCEPTED — documented as a caveat in `real-ab-results.md`; no Phase 1 code action needed because the rig intentionally measures the algorithm before the production q0.92 re-encode.

## Triage Summary

- **Fixed**: F1, F2, F3, F4
- **Fixed/accepted as documented**: F5
- **Remaining pending findings**: none

## Note on change.md status

Left `status: implementing` (this is a phase-1-of-5 review; the change is mid-implementation, not fully reviewed). The skill's default `impl_reviewed` flip is for full-plan reviews and would misrepresent the in-progress state.
