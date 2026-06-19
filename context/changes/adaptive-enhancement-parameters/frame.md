# Frame Brief: Adaptive enhancement parameters

> Framing step before `/10x-plan`. This document separates the observed quality
> problem from the proposed manual controls and image-analysis implementation.

## Reported Observation

Generated photos can look too strongly brightened. Representative examples can
be generated again for verification.

## Initial Framing (preserved)

- **User's stated cause or approach**: Fixed enhancement parameters do not fit
  every image; Local and Cloud AI need different available parameter ranges.
- **User's proposed direction**: Expose manual parameter controls and an Auto
  switch where an image-capable model scans the source and chooses parameters.
- **Pre-dispatch narrowing**: The scope is both Local and Cloud AI. The concrete
  observed symptom is excessive brightening, while the exact affected image
  classes still need to be reproduced.

## Locked Scope Decision

The slice is intentionally limited to the existing engines and UI:

- Add a parameter panel to the right of the photo.
- Local exposes `gamma` and blur intensity.
- Cloud remains on Bread and exposes only `gamma` and `strength`.
- Auto analyzes the selected image and writes its recommendation into the same
  sliders used by Manual mode.
- A user can override Auto by moving any slider. Other recommended values remain
  unchanged until the user edits them or restores Auto.

Out of scope: choosing or integrating another Cloud model, model fallback,
Retinexformer/Cog, additional synthetic Bread parameters, advanced Local
algorithms, and training or fine-tuning a model.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Baseline calibration** — the fixed defaults may simply be too aggressive
   for typical source photos.
2. **Per-image variability** — one fixed setting cannot handle already-exposed,
   very dark, high-contrast, and mixed-light scenes equally well. ← initial
   framing
3. **Engine capability mismatch** — Local gamma/blur and Cloud model parameters
   have different meanings and safe ranges, so a shared generic setting could
   produce misleading or unsafe behavior.
4. **Model suitability** — Bread may still produce undesirable results with
   better parameters, but replacing it is deliberately outside this slice.
5. **Evaluation gap** — quality was not locked against a representative,
   repeatable low-light photo set, so “better” currently has no stable
   acceptance baseline.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Fixed defaults are too aggressive | Local always applies `GAMMA = 1.5`; Cloud always applies `gamma = 1.2` and maximum configured `strength = 0.2`. The user reports over-brightened outputs. | STRONG |
| Settings need to vary per image | Neither engine accepts enhancement parameters from the caller; both use unconditional constants. Different source exposure therefore cannot influence intensity. | STRONG |
| Engines need distinct parameter contracts | Local supports gamma plus Canvas blur, while Bread supports gamma plus denoise strength with model-defined limits. | STRONG |
| The Cloud model itself may be unsuitable | The Bread spike called subjective quality inconclusive and used a noise chart rather than a real low-light color photo. This remains a later model-selection concern, not work for this slice. | WEAK but material |
| Evaluation is under-specified | The spike explicitly records real-photo quality as unproven; current tests assert fixed constants and LUT math, not perceptual quality. | STRONG |

## Narrowing Signals

- The desired scope includes both engines but not a falsely unified set of
  controls.
- The concrete failure mode is excessive brightening rather than only a desire
  for an advanced editor.
- Bread is retained for Cloud AI and exposes exactly `gamma` and `strength`.
- Auto is not a separate opaque processing path: it supplies slider values that
  remain visible and manually editable.
- Representative failing images are reproducible, but a small benchmark set has
  not yet been captured.

## Cross-System Convention

The current product was intentionally designed as one-click enhancement: fixed
Local constants and fixed Bread defaults, with tunable parameters explicitly
excluded from the original Local slice. The Strategy boundary only identifies
the engine; it does not currently carry an engine-specific parameter profile.

The earlier Cloud spike also left real-photo quality unresolved. That makes
parameter adaptation a quality-control concern first and a settings-panel
feature second.

## Reframed Problem Statement

> **The actual problem to plan around is**: LuminaClean has no visible,
> engine-specific way to inspect and adjust enhancement intensity, so fixed
> defaults can over-brighten photos and Auto recommendations cannot be reviewed
> or corrected by the user.

The solution boundary is now confirmed: one right-side panel, different controls
for Local and Bread, and one shared slider state that Auto can populate and the
user can override. The one-click path remains available through Auto.

## Confidence

- **MEDIUM** — code and prior spike evidence strongly confirm fixed,
  non-adaptive parameters and an evaluation gap. Confidence is not HIGH until
  the over-brightening is reproduced separately for Local and Cloud on a small
  representative image set.

Before `/10x-plan`, capture at least three sources: very dark, moderately dark,
and mixed/highlight-heavy. Record Local and Cloud outputs with current defaults
and identify where highlights, faces, or midtones become unnaturally bright.

## What Changes for `/10x-plan`

Plan a responsive right-side parameter panel and an engine-specific parameter
profile:

- Local: `gamma` and blur intensity.
- Bread: `gamma` and `strength`.
- Auto: derive recommended values for the active engine and populate the
  sliders.
- Override: moving a slider immediately uses the edited value without erasing
  untouched Auto values; restoring Auto recomputes or reapplies the
  recommendation.

Define safe ranges, defaults, value formatting, preview/reprocessing behavior,
responsive placement on narrow screens, and the Auto/manual state transition.
Do not include model selection or fallback implementation.

## References

- `src/lib/engines/local-engine.ts:14`
- `src/lib/engines/local-engine.ts:45`
- `src/lib/engines/types.ts:26`
- `src/components/hooks/useLocalEnhance.ts:82`
- `src/lib/services/bread.ts:17`
- `src/lib/services/bread.ts:35`
- `tests/bread.test.ts:10`
- `context/archive/2026-05-31-cloud-ai-realtime-result/spike-findings.md:12`
- `context/archive/2026-05-31-cloud-ai-realtime-result/spike-findings.md:34`
- `context/archive/2026-05-28-local-engine-enhance-flow/plan.md:36`
- Investigation tasks: performed in the main thread; sub-agents were not
  requested.
