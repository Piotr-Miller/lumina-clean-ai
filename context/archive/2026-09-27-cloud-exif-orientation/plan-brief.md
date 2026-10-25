# Cloud EXIF Orientation — Plan Brief

> Full plan: `context/changes/cloud-exif-orientation/plan.md`
> Frame brief: `context/changes/cloud-exif-orientation/frame.md`

## What & Why

> **The actual problem to plan around is**: the Cloud path hands the model stored-orientation pixels
> and shows the result next to a display-orientation BEFORE. Nothing in our pipeline reconciles the
> two, so any orientation-5–8 photo comes back sideways (or mirrored) in the slider and in Download.

The defect belongs to our Cloud-path orientation contract, not to Bread alone. A model swap (S-19)
would keep it unless the new model happens to honour EXIF.

## Starting Point

The browser PUTs the picked file's original bytes, and Bread ignores the tag. This was observed on
S17-06: stored 5712 × 4284 with tag 6, it came back as a 1536 × 1152 landscape image lying on its
side. The BEFORE pane and the Local engine go through the browser, which applies the tag, so the
defect is Cloud-only. `flattenToRgbJpeg` already performs the decode → canvas → JPEG step that the
fix needs.

## Desired End State

An orientation-2–8 JPEG is redrawn upright in the browser and re-encoded without a tag **before**
the create-job POST. Model input, BEFORE, AFTER and Download agree. Every other file uploads
byte-identical. If the redraw fails, submit stops with a clear message, and no job, cap slot or
upload is spent. S-19's prerequisite reads "satisfied", with a link to a recorded production run.

## Key Decisions Made

| Decision                                      | Choice                                                                                                                    | Why (1 sentence)                                                                                                                    | Source            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Where orientation is normalised               | Browser, before create-job                                                                                                | The browser already rotates and mirrors correctly on canvas, and running first means a failure costs nothing.                       | Plan              |
| What counts as oriented                       | IFD0 tag 2–8 in a JPEG; 0, 9+, no tag, IFD1-only and PNG are not                                                          | The BEFORE (the browser's display) is the reference, and the browser shows those unrotated.                                         | Frame + Plan      |
| Redraw failure (canvas limit, decode, encode) | Block before create-job: "Couldn't prepare this photo for Cloud AI. Try a lower-resolution photo or a different browser." | A fallback brings the bug back and spends a cap slot; Local is not a safe suggestion because it also uses a full-resolution canvas. | Plan (user)       |
| Downscale to fit a canvas limit               | Not in this change                                                                                                        | It needs its own scaling policy and quality check.                                                                                  | Plan (user)       |
| Unreadable Exif                               | Upload as stored and `console.warn` the consequence; no Exif means no log                                                 | Silent degradation must be visible, but only when it matters.                                                                       | Plan (lessons)    |
| Automated coverage                            | Node unit tests (detector, ordering) + one E2E reading the real PUT body for tags 6 and 2                                 | Only a browser proves the pixels; tag 2 needs a marker check because its dimensions do not change.                                  | Plan (user)       |
| Acceptance                                    | Production, after deploy: S17-06 + orientation-1 control (`05-phone-walgreens-pixel7.jpg`)                                | This is the "fix is live" fact S-19 waits on.                                                                                       | Plan (user)       |
| Re-encode quality / metadata                  | Shared `JPEG_QUALITY` 0.92; EXIF dropped                                                                                  | Bread downsizes to 1536 px anyway, and the source is deleted after processing.                                                      | Plan (assumption) |

## Scope

**In scope:** JPEG orientation detector; browser redraw that shares the `flattenToRgbJpeg` core;
pre-POST wiring with re-validation; failure copy; unit tests; PUT-body E2E with two synthetic
fixtures; production acceptance record; corrected S-19 / change pointers.

**Out of scope:** downscaling; a fallback to original bytes; PNG `eXIf`; server-side or post-model
rotation; Local engine changes; EXIF preservation; a new test-plan risk row; committed screenshots.

## Architecture / Approach

`submitCloudJob(file, params, prepare = realPrepare)` first runs `prepare`. It walks JPEG segment
headers with bounded file slices until Exif, SOS or EOI, skipping unrelated payloads and reading
the matching Exif segment fully for the pure detector. There is no fixed prefix cutoff. For
2–8 only, it redraws through the canvas into a tagless JPEG `File`. It then re-validates the
size and type, and only after all that do the
create-job POST and the PUT happen. Everything downstream (Edge Function, Bread, result decode,
slider) is untouched and simply receives upright pixels.

## Phases at a Glance

| Phase                                      | What it delivers                                                    | Key risk                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. Detect and normalise before create-job  | Detector, redraw, wiring, copy, Node tests                          | Detector misses an Exif layout the browser does read (false negative → still sideways) |
| 2. Prove the model input in a real browser | PUT-body E2E for tags 6 and 2 + a deliberate-break check            | A fixture marker too small to survive JPEG subsampling                                 |
| 3. Ship and accept in production           | Deploy, paid S17-06 + control run, acceptance record, pointer fixes | The daily cap (3) runs out before both runs; then acceptance waits for the reset       |

**Prerequisites:** local Supabase stack + served `enhance` function for Phase 2; production
`CLOUD_PIPELINE_ENABLED=true` with ≥ 2 cap slots left for Phase 3.
**Estimated effort:** about 2 sessions across 3 phases, plus one production run.

## Open Risks & Assumptions

- Exif the browser can read but the detector cannot parse leaves the photo sideways. The unreadable
  branch warns. Late Exif is covered by a file-reader test beyond 256 KiB; malformed or truncated
  traversal is unreadable rather than confirmed absence.
- An oriented photo above the device's canvas limit (iOS Safari, around 16.7 MP) is blocked from
  Cloud AI until a separate downscale change exists.
- Re-encoding can grow a file. Re-validation catches anything over 25 MB before any cost.

## Success Criteria (Summary)

- S17-06 on production: BEFORE, AFTER and the downloaded file are all upright portrait, with the
  full frame checked.
- A tag-1 photo, a PNG and an untagged photo upload byte-identical, and the orientation-1 control
  is unchanged in production.
- The E2E fails without the fix and passes with it, for both a rotated and a mirrored orientation.
