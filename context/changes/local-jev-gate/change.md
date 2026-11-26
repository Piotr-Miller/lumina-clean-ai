---
change_id: local-jev-gate
title: 'TypeSafe Jev as an "already good, leave it" gate and Auto chooser for the Local engine'
status: new
created: 2026-11-03
updated: 2026-11-26
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

### Vendor re-check 2026-11-25 (Jev 1.14)

Read on 2026-11-25 from https://docs.typesafe.ai/images, https://docs.typesafe.ai/primitives/box
and https://typesafe.ai/blog/jev-1-14 (the post shows "Oct 14, 2026" while its metadata says
published Nov 16, 2026). No API call was made. Re-read the live docs before planning; the vendor
says the request format, the answers and the limits can change between releases.

- **S1 still fails.** Images and Box are labelled "Dreamer-ready": "Images and Box questions
  aren't yet up to our standards to call ready for production". The blog adds "all models (Jev
  included) perform worse on multimodality over pure text". The header
  `TypeSafe-Danger-Zone-Images: true` is still required on every request with an image or a Box
  question; without it the API answers `400`.
- **Models.** `jev-1.13.0` and `jev-1.14.0` accept images; **Box needs `jev-1.14.0`**. The blog
  released 1.14 as `jev-preview` and said `jev-latest` would follow a week later, so name the
  version explicitly. Deprecation is announced as an intention only (60 days' warning for 1.13,
  30 for 1.14).
- **Box** (new): one box per question, the four edges as fractions 0–1 of width and height from
  the top-left corner, plus `confidence`. There is no "not found" answer, so pair it with a Noul
  ("Is there a … in `photo`?"). Small targets in large images can be missed; the docs recommend
  tiling. No recommended confidence threshold yet.
- **Limits unchanged from the 2026-10-29 read:** PNG/JPEG stills only (animated PNG rejected);
  each side 280–1568 px; 78,400–2,458,624 px total; 16 MiB per file, 32 MiB per request. An
  image outside the limits is rejected, never resized, and one rejected image fails the whole
  request (no partial answers). Metadata is stripped and EXIF orientation is not applied.
- **Cost.** Images count as input tokens at the text price; no separate image charge. The vendor
  promises image-token estimation guidance "soon", so measure `usage.input_tokens` per call.
- **Data terms.** The blog adds opt-in query sharing and says "We will still not train on your
  queries". Retention is still not read from the vendor's own terms, so the rule below stands:
  only licensed benchmark photos go out unless the owner explicitly consents for a test.
- **Long context** is a separate opt-in header, `TypeSafe-Danger-Zone-Long-Context: true`; not
  needed here.
- **Agent skill.** TypeSafe publishes an agent skill, `typesafe-ai` in
  https://github.com/typesafe-ai/skills (v0.6.2, commit `302eea6`). Its rules fit this change:
  Jev makes judgments and code makes the decision (a truth table), pair Box/Choice with a Noul
  for the null case, start Noul thresholds at 0.7 / 0.3, don't gate on `confidence`, and ask the
  owner for permission and a budget before live probes.

### Candidate uses beyond this change (recorded 2026-11-25, not started)

- **Altered-content guard for a GPT-Image-2.6 delivery.** The owner decided on 2026-11-25 to take
  GPT-Image-2.6 Sunburst to production through a separate change
  (`context/archive/2026-11-21-gpt-image-26-wider/change.md` § Outcome). That study and the screen
  found invented or changed content: redrawn faces, invented lettering and flags, removed faint
  stars. Jev can compare the original with the GPT result using typed questions, for example a
  Noul "Does `after` show lettering that is not in `before`?" or "Is the face in `after` the same
  person as in `before`?", with a Box to locate the change. Offline first: the owner's 16 blind
  ratings with crop notes (`context/archive/2026-11-21-gpt-image-26-wider/evaluations/ratings.json`)
  are ready-made labels. _Corrected 2026-11-26:_ an earlier wording here called these the owner's
  private photos. They are not: all eight inputs (S17-01…07, S17-21) are licensed CC/CC0 photos in
  `test-photos/licensed/`, each matching its `s17-benchmark-v2.json` hash, and only the derived
  inputs and GPT renders are kept in `test-photos/private/gpt26-wider/`. In the app, this waits
  for S1 like everything else here.
- **Gate and chooser (this change).** S-20 closed on 2026-11-15 without a denoise strength, so the
  parameters to choose are still gamma + blur. The proposed test below can run as an offline
  finding.
- **Cloud advisor (recorded 2026-11-26, not started).** Before a signed-in user sends a photo to
  Cloud, Jev judges the photo and code shows a hint; the user decides, and the hint never changes
  the selected engine. It is **not a cost filter**: at `jev-1.14.0`'s $0.042 per million input
  tokens (price confirmed by the owner 2026-11-26) a ~5k-token photo costs about $0.00021 (the
  83-photo jev-photo-cull run gave a separate estimate of $0.00024). Against Bread (≈ $0.0006 a
  run, #192) that is about a third of the call it would save; against GPT-Image-2.6 (≈ $0.075 a
  call) the gross saving is capped at $0.225 a day by the prod cap of 3. A job declined before the
  model call already costs no cap slot in `admit_cloud_job`, so the advisor protects nothing there.
  - **Questions** (one request, `state.photo` only, never the image in criteria): Nouls
    `is_photo` (a camera photograph, not a screenshot, scan or graphic), `low_light`,
    `visible_noise` (grain or coloured speckle in the dark areas), `subject_too_dark` (the main
    part of the scene is too dark to see clearly) and `sharp`; `has_faces` only feeds the
    altered-content guard above. No "one clear subject" question: night-sky photos, the core of
    the S17 set, often have none. Prepare the image as jev-photo-cull's `prepare()` does (EXIF
    upright, ≤ 1568 px a side, baseline JPEG), since the API does not apply EXIF.
  - **Decision table** (Noul yes > 0.7, no < 0.3, between = unsettled):

    | Condition                                                                  | Hint                                          |
    | -------------------------------------------------------------------------- | --------------------------------------------- |
    | API error or timeout                                                       | none; logged as an error, never read as "no"  |
    | `is_photo` no                                                              | "this does not look like a photo"             |
    | `is_photo` yes and `low_light`, `visible_noise`, `subject_too_dark` all no | "Local is likely enough"                      |
    | `is_photo` yes and `visible_noise` or `subject_too_dark` yes               | "Cloud may help" (wording waits for the test) |
    | anything else, including `low_light` yes alone and any unsettled answer    | none                                          |
    | `sharp` no, added to any row above                                         | "denoising does not remove blur"              |

    Night alone is not evidence that Cloud helps (S-19: real Local was the most faithful result in
    every blind comparison), so `low_light` yes on its own gives no hint.

  - **Offline test first.** Licensed photos only (`test-photos/licensed/`), night sky and day
    scenes, hard cap $0.01; it still sends those images to TypeSafe. Before the run the owner
    labels each photo `local_enough`, `cloud_significant` or `ambiguous` — "needs processing" does
    not settle whether Cloud beats Local. Measure the hint against those labels; the worst error
    is "Local is likely enough" on a `cloud_significant` photo.
  - **Label sources (owner decision 2026-11-26).** The first batch is the eight night tuning
    photos of `gpt-image-26-wider`: their 16 existing GPT-Image-2.6 Sunburst renders and verified
    Local results, so no new GPT call is needed. A photo is `cloud_significant` when **both**
    renders are a clear improvement over Local and keep the original's essential content; when
    the two renders lead to different assessments it is `ambiguous`. Labels are fixed before any
    Jev call. Wider covers only night scenes; Cloud results for licensed day scenes come from the
    Sunburst delivery change's test at its production settings. The $0.01 cap covers only the Jev
    run.
  - **In the app** (waits for S1): the analysis runs only after the user clicks "Check whether
    Cloud will help", with a notice before the photo is sent; a server-side API route holds the
    key; model pinned to `jev-1.14.0`; privacy policy updated for a new processor. Per the
    owner's reading on 2026-11-26, TypeSafe processes data in the USA, states no fixed retention
    period and enables Zero Data Retention on request
    (https://help.typesafe.ai/articles/5974925716, https://help.typesafe.ai/articles/9520184411).

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
- `context/archive/2026-11-03-cloud-classical-denoise/` — went first; archived 2026-11-15 with step 1 FAIL, so its step 3 (the chooser
  interface) never ran and no denoise strength is among the parameters to choose.
- `context/archive/2026-06-18-adaptive-enhancement-parameters/plan.md:36` — the original
  "no vision model / ML for Auto" scope decision this change would revisit; a scope decision,
  not a vendor fact.
