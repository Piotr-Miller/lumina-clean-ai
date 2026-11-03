---
change_id: local-jev-gate
title: 'TypeSafe Jev as an "already good, leave it" gate and Auto chooser for the Local engine'
status: new
created: 2026-11-03
updated: 2026-11-03
archived_at: null
issue: 348
---

## Notes

**Registered 2026-11-03 as a stub, deliberately NOT started.** Owner decision: this is a separate
change from `cloud-classical-denoise`, and it is sequenced **after** that change's step 1
(denoising gate), because the result of that step decides which parameters a chooser has to
choose. No plan, no harness code, no vendor call has been made for this change.

### Origin

Recorded by the owner on closing S-19 as a follow-up candidate
(`context/archive/2026-09-28-cloud-model-comparison/evaluations/outcome.md:45-55`). The idea was
first raised during S-19's framing (`frame.md:39-40, 75-78`) in two roles:

1. **Gate** — answer "is this photo already well exposed, or should it still be corrected?", so
   Local leaves already-good photos untouched (the owner's own label for S17-04 in S-17's
   `calibration.md`: "needed no correction").
2. **Auto chooser** — pick Local's parameters (today gamma + blur; after
   `cloud-classical-denoise`, possibly a denoise strength too) as a `choice` among presets or a
   `score`, instead of, or on top of, the deterministic heuristic in
   `src/lib/engines/auto-params.ts`.

It fits the central S-19 finding: real Local was the most faithful result in every blind
comparison, so a gate that keeps the image Local's own plus a better parameter choice improves
the free path without any pixel-generating model.

### What Jev is (vendor facts, read 2026-10-29 — re-verify before planning)

- A **decision model** (S-19 class D), not an image model: typed answers (`noul`, `choice`,
  `score`, `box`), never pixels. Every question type accepts images
  (https://docs.typesafe.ai/images).
- **Cost ≈ $0.0003 per photo** at 1568 px (`research.md:599, 619-621`); 0.7 s wall time on the
  one spike call.
- **Spike result on S17-04 (one call, one photo):** brightening needed: score 0.33 of 2, 74 %
  "None: already well exposed"; noise 1.31 of 2; preset choice "gentle" 0.44 vs "medium" 0.42,
  confidence 0.25. The two scores leaned to "leave the exposure alone" — the owner's own label —
  while the preset choice was nearly a tie. One photo shows the answer shape, cost and speed, not
  whether the choices are good.

### Blocker: sieve S1 (production API) fails today

- Images require the `TypeSafe-Danger-Zone-Images: true` header; the vendor states "Images and
  Box questions aren't yet up to our standards to call ready for production" and "the request
  format, the answers, and the limits on this page can change between releases"
  (`research.md:517-521`).
- **Precondition for any app change:** TypeSafe's own documentation lists image input as
  production-ready, without the danger-zone header. Until then this change may only produce an
  offline finding.

### Pipeline facts this change has to handle (not the denoise change's problem)

- Input cap **1568 px** per side and 2,458,624 total pixels: every phone photo is downscaled
  before the call.
- The API **strips EXIF and ICC and does not apply EXIF orientation**: an orientation-6 photo
  (S17-06, S17-24) must be rotated before sending — the same fault class `cloud-exif-orientation`
  fixed for Bread (`context/archive/2026-09-27-cloud-exif-orientation/`).
- `{gamma, strength}` as a free-form object is not a documented answer type; parameters come back
  as a `choice` among presets or a `score` that the app maps to values. The preset list is a
  design decision of this change.
- Data terms: TypeSafe documents no per-account fine-tuning; retention and training on inputs
  are only reported third-hand (`research.md:546-553`). Must be read from the vendor's own terms
  before a user photo is ever sent; until then only CC-licensed benchmark photos go out.

### Proposed test (from `outcome.md`, unchanged; $0.003 for all eight photos)

1. One request with the three typed questions (exposure score, noise score, preset choice) per
   `s17-v2` **tuning** photo, prepared at 1568 px, EXIF-rotated, sRGB. Log `usage.input_tokens`,
   answers with probabilities, wall time.
2. Compare the gate answer with the owner's existing per-photo labels in S-17's
   `calibration.md` and S-19's `references/compare.html` ratings (which photos needed nothing).
   This step needs no new owner rating.
3. Only if (2) agrees on most photos: render Local + Jev-chosen parameters versus Local + Auto
   through the S-19 harness (`scripts/s19/local-arms.ts` writes arms from a
   `local/<id>.auto.json` record; a Jev chooser writes that same record) and rate blind, two
   axes, with the real Local download as the reference.
4. Hold the holdout closed; a production decision needs the S1 precondition above plus a
   measured answer-consistency check on repeated calls (the spike's "gentle" vs "medium" at
   0.44/0.42 suggests the preset answer may not be stable).

### Interface with `cloud-classical-denoise`

Both changes meet at one artifact: the Auto record `local/<id>.auto.json`
(`scripts/s19/baseline.ts`, read and hash-checked by `local-arms.ts:36-38`). The denoise change's
step 3 treats the chooser as a plug-in writing that record; this change supplies one candidate
chooser. Neither change needs the other to finish, but the **question** this change answers
("which parameters?") is only well-defined once the denoise change says whether a denoise
strength is among them — hence the sequencing.

### Not in scope

- No change to the Cloud path, Bread, or `CLOUD_DAILY_CAP`.
- No app code, no new runtime dependency, before the S1 precondition is met.
- No holdout access; no user photo sent to TypeSafe.
- No edit to anything under `context/archive/`.

### Related

- `context/archive/2026-09-28-cloud-model-comparison/research.md` § Spike: TypeSafe Jev — the
  only vendor read so far; its figures are dated 2026-10-29.
- `context/changes/cloud-classical-denoise/` — goes first; its step 3 defines the chooser
  interface.
- `context/archive/2026-06-18-adaptive-enhancement-parameters/plan.md:36` — the original
  "no vision model / ML for Auto" scope decision this change would revisit; a scope decision,
  not a vendor fact.
