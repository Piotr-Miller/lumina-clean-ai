# Cloud EXIF Orientation Implementation Plan

## Overview

Cloud AI shows phone photos stored with EXIF orientation 2–8 sideways or mirrored, because the Cloud
path hands Bread stored-orientation pixels and Bread ignores the tag. This plan normalises
orientation **once, in the browser, before the create-job POST**: a JPEG whose IFD0 orientation is
2–8 is redrawn through a canvas (the browser applies the tag on `drawImage`) and re-encoded as a
JPEG with no tag; every other file uploads byte-identical. The model input, the BEFORE pane, the
AFTER pane and the Download then agree, whatever model sits behind the pipeline (S-19).

## Current State Analysis

Lifted from the frame (`frame.md`, confidence HIGH, all three links STRONG):

- **Model input keeps stored orientation.** `useCloudSubmit.ts:53` passes the picked `File` to
  `submitCloudJob`, which PUTs it unchanged (`cloud-upload.client.ts:87-91`). The Edge Function
  signs the raw object with no transform. No `exif`/`orientation` handling exists in `src/` or
  `supabase/functions/`.
- **Bread ignores the tag** — observed: run `ebme649xrsrgc0d0wjv857kkrw` on S17-06 returned a
  1536 × 1152 landscape PNG with content on its side (`context/archive/2026-08-31-cloud-quality-below-local/calibration.md:244-260`).
- **Nothing downstream corrects it.** The result is decoded as-is (`cloud-result.client.ts:29-35`,
  `cloud-result-postprocess.client.ts:48`); the slider box takes the result's dimensions
  (`EnhanceWorkspace.tsx:366-372`); both panes are `object-cover` (`BeforeAfterSlider.tsx:101,109`);
  the BEFORE is the original file's object URL, which the browser shows with the tag applied.
- **Local is unaffected**: it decodes through `new Image()` → `drawImage` (`useLocalEnhance.ts:94`,
  `local-engine.ts:46`), which applies the tag. Auto params sample the browser-decoded image.

Verified in this session:

- `exiftool` on `test-photos/licensed/06-phone-rain-galaxys24ultra.jpg`: 5712 × 4284, Orientation 6 —
  the premise holds. `18-staircase.jpg` carries Orientation **0** (invalid); `01`–`03`, `17`, `19`,
  `20`, `22` carry no orientation tag; the rest are 1.
- `flattenToRgbJpeg` (`src/lib/engines/canvas-helpers.ts:59-74`) already does decode → canvas →
  JPEG for the RGBA recovery path, so a flattened file is already upright and tagless. The new step
  is the same operation, applied pre-upload and only when needed.
- The create-job POST inserts the job row through `admit_cloud_job` and so **spends a cap slot**
  before the PUT (`cloud-upload.client.ts:76-85`). Anything that can fail must run before it.
- The browser applying EXIF on canvas `drawImage` of an `<img>` is platform behaviour (origin:
  browser, CSS `image-orientation: from-image` default), which the Local engine already relies on.
  A browser that does not apply it also shows the BEFORE unrotated, so the panes still agree there.

### Carried from predecessor

none — no Predecessor line

## Definitions

| Term                   | Decided meaning                                                                                                                                       | Origin                                                                                | On degenerate data (tie, duplicate, empty, boundary, legacy)                                                                                                                                                                                           | Verified by                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Upright                | How the browser displays the original file in the BEFORE pane. Model input, AFTER and Download must match it.                                         | product (frame: "make the model input, the BEFORE, the AFTER and the Download agree") | A browser that ignores EXIF shows BEFORE unrotated, and its canvas draw is unrotated too, so they still agree.                                                                                                                                         | 2.1 (E2E pixels), 3.5 (live S17-06) |
| Oriented photo         | A JPEG whose first APP1 `Exif` segment's **IFD0** tag `0x0112` holds an integer 2–8.                                                                  | product (frame: "cover orientations 2–8")                                             | Value 0 (`18-staircase.jpg`), 9+, a tag only in IFD1 (thumbnail), or no Exif: not oriented. A PNG is never oriented (an `eXIf` chunk is out of scope).                                                                                                 | 1.1 (parser tests)                  |
| Unaffected input       | A file that is not an oriented photo is PUT **byte-identical** (`body` is the original `File`).                                                       | product (frame: "without affecting orientation-1 inputs or the Local path")           | Includes tag 1, tag 0, no Exif, PNG, and an RGBA-flattened JPEG (which `flattenToRgbJpeg` already left tagless).                                                                                                                                       | 1.1 (ordering tests)                |
| Unreadable orientation | JPEG metadata traversal is malformed/truncated, or an Exif APP1 segment's TIFF header or IFD0 cannot be parsed (bad byte order, offset out of range). | user (silent-degradation lesson, applied)                                             | The file uploads as stored, with a `console.warn` naming the consequence (the result may come back rotated). A complete scan with **no** Exif logs nothing.                                                                                            | 1.1 (parser + reader + warn tests)  |
| Normalisation failure  | The oriented photo cannot be redrawn and encoded: decode error, no 2D context, `toBlob` → null, or the browser's canvas-size limit.                   | user                                                                                  | Submit stops **before** create-job: no job row, no cap slot, no PUT. It shows `Couldn't prepare this photo for Cloud AI. Try a lower-resolution photo or a different browser.` It does **not** suggest Local, which uses a full-resolution canvas too. | 1.1 (ordering tests)                |
| Download               | The Cloud result `Blob` the Download button saves (raw Bread result, or the chroma-post-passed JPEG).                                                 | code (`useCloudJob`) — unchanged by this plan                                         | Upright because its input was upright; no extra rotation is applied after the model.                                                                                                                                                                   | 3.5                                 |

## Desired End State

Picking an orientation-2–8 JPEG and sending it to Cloud AI uploads display-orientation pixels with
no orientation tag. Bread's result comes back in the same orientation and aspect as the BEFORE. The
slider box, both panes and the Download are upright, and the S-18 resolution note compares display
dimensions with result dimensions. Every other file uploads exactly as before. If the redraw
fails, submit stops with a clear message and nothing is spent. A Playwright spec proves the PUT
body for tags 6 and 2, and one paid production run on S17-06 (plus an orientation-1 control)
proves the deployed pipeline. The S-19 prerequisite then reads "satisfied".

### Key Discoveries:

- `flattenToRgbJpeg` (`src/lib/engines/canvas-helpers.ts:59-74`) is the decode → canvas → JPEG core
  to share, not duplicate. Its white pre-fill is harmless for an opaque JPEG.
- `submitCloudJob` is unit-tested with stubbed `fetch` (`tests/cloud-upload.client.test.ts`), and its
  module stays free of `astro:env`. An injectable prepare step keeps the ordering Node-testable.
- `useCloudSubmit` surfaces `err.message` from `submitCloudJob` verbatim (`useCloudSubmit.ts:56-58`),
  so the new copy goes into a thrown `Error`, just like the existing upload errors.
- The client-side degradation-log precedent is `console.warn` with the consequence
  (`useCloudJob.ts:376`).
- E2E rules (`tests/e2e/RULES.md`): only one spec may run the fixture server. A spec that stops after
  observing the PUT does not need it. Cleanup goes by the captured `jobId` and its storage prefix.
  `chroma-postpass-on.spec.ts` is the precedent for a spec headed by its change and phase rather
  than a §2 risk number.

## What We're NOT Doing

- **No downscaling** of oriented photos to fit a canvas limit. That needs a deliberate scaling policy
  and its own quality check (user decision; a smaller Bread output does not prove a smaller input is
  harmless).
- **No fallback to original bytes** when normalisation fails. That would bring back the known defect
  and spend the user's cap slot (user decision).
- **No PNG `eXIf` support.** Phones produce JPEG or HEIC, and HEIC is rejected upstream (assumption).
- **No server-side or post-model rotation**: no Edge Function image library, no Storage transforms,
  no rotating the result.
- **No change to the Local engine**, Auto sampling, the slider component or the result path.
- **No EXIF preservation.** A re-encoded upload drops all metadata, GPS included. The source is
  deleted after processing, and Bread never returns EXIF (assumption).
- **No new risk row** in `context/foundation/test-plan.md` §2. The E2E spec cites this change, as
  `chroma-postpass-on.spec.ts` does (assumption).
- **No committed screenshots** of the live run. The acceptance record is text: commit, job ids,
  dimensions and observations (assumption; it avoids the evidence-image rule for a CC BY derivative).

## Implementation Approach

Split into a pure detector and a browser redraw step, both wired into `submitCloudJob` ahead of
the create-job POST:

1. **Detect** (DOM-free, Node-tested): walk JPEG segment headers using bounded file slices until
   the first APP1 `Exif` segment, SOS or EOI. Skip unrelated segment payloads by their declared
   lengths, then read the matching Exif segment fully and parse its TIFF header and IFD0 tag
   `0x0112` with the pure byte parser. The detector returns a discriminated result: none,
   orientation `n`, or unreadable; there is no fixed prefix cutoff.
2. **Decide**: only orientation 2–8 triggers a redraw; unreadable warns and uploads as stored.
3. **Redraw** (browser-only): decode → canvas at the decoded (display) dimensions → JPEG at the shared
   `JPEG_QUALITY`. This shares its core with `flattenToRgbJpeg`.
4. **Re-validate** the redrawn file with `validateImageFile`, since re-encoding can grow it past
   25 MB. Then POST and PUT, deriving the MIME type and extension from the redrawn file.

The browser does the actual rotating and mirroring, so the plan writes no orientation matrices.

## Critical Implementation Details

**State sequencing** — detection, redraw and re-validation must all finish before the create-job
POST. The POST spends a cap slot and creates a queued row that triggers the pipeline, so a failure
after it would leave a cost and an orphaned job behind. The ordering test pins this: on a redraw
failure, `fetch` is never called.

**Detector traversal** — Exif APP1 is at most 64 KiB, but the preceding metadata can exceed
256 KiB. Read only bounded slices for marker headers and the APP1 identifier; skip unrelated
payloads by their declared lengths. On the first APP1 `Exif` match, read that segment fully for
the pure TIFF/IFD0 parser. Stop at SOS/EOI, not at a fixed byte offset, and do not read compressed
image data. Check lengths and offsets against the file size, require forward progress, and
report a malformed or truncated traversal as unreadable rather than confirmed absence. Ignore
IFD1, because its orientation belongs to the embedded thumbnail.

## Phase 1: Detect and normalise before create-job

### Overview

Add the orientation detector, the browser redraw, the new failure copy and the pre-POST wiring,
all covered by Node unit tests.

### Changes Required:

#### 1. Orientation detector

**File**: `src/lib/engines/exif-orientation.ts`

**Intent**: A pure byte parser for a JPEG's IFD0 orientation, plus the 2–8 decision, and a DOM-free
file reader that locates Exif with bounded slices. Both paths can be tested in Node.

**Contract**: one function from bytes (`ArrayBuffer` or `Uint8Array`) to a discriminated result —
`{ kind: "none" }` | `{ kind: "orientation"; value: number }` | `{ kind: "unreadable"; reason: string }` —
and a predicate that is true only for values 2–8. Add an async `(file: Blob) => Promise<Detection>`
reader returning that same discriminated result, sharing the pure Exif parsing logic. It walks
segment headers as described under Detector traversal and finds Exif even beyond 256 KiB.
A non-JPEG (no `FFD8` SOI) is `none`. The scan stops at SOS/EOI.

#### 2. Browser redraw

**File**: `src/lib/engines/canvas-helpers.ts`

**Intent**: Add a redraw that returns an upright, tagless JPEG `File` for an oriented photo. It
shares the decode → canvas → encode core with `flattenToRgbJpeg` instead of copying it.

**Contract**: `(file: File) => Promise<File>`, which throws on decode, context or encode failure.
The output name keeps the original base with a `.jpg` extension and `type: "image/jpeg"`.
`flattenToRgbJpeg` keeps its current signature and behaviour.

#### 3. Pre-POST preparation in the submit path

**File**: `src/lib/services/cloud-upload.client.ts`

**Intent**: Before `deriveRequest`, prepare the file. Detect its orientation with the bounded-slice
file reader and redraw it if it is oriented, warning (with the consequence) when the orientation
is unreadable. Then re-validate the result. A redraw failure throws the new copy, and a
re-validation failure throws that validation's
message. The POST and PUT then use the prepared file.

**Contract**: `submitCloudJob(file, params?, prepare?)`, where `prepare: (file: File) => Promise<File>`
defaults to the real preparation. The existing two-argument call in `useCloudSubmit.ts` is unchanged.
The module stays free of `astro:env` and touches the DOM only when the default `prepare` runs.

#### 4. Failure copy

**File**: `src/lib/enhance-strings.ts`

**Intent**: Add the normalisation-failure message under `uploadErrors`. This is the English
rendering of the user's wording. It does not point to Local.

**Contract**: `uploadErrors.prepareFailed` (or an equally named key) =
`"Couldn't prepare this photo for Cloud AI. Try a lower-resolution photo or a different browser."`

#### 5. Unit tests

**Files**:

- `tests/exif-orientation.test.ts`: the detector on synthetic byte arrays — every value 1–8,
  values 0 and 9, big-endian and little-endian TIFF, Exif after a JFIF APP0, an orientation tag only
  in IFD1, no APP1, a truncated APP1 (unreadable), a non-JPEG — plus the real header of
  `test-photos/licensed/06-phone-rain-galaxys24ultra.jpg` (→ 6) and of `18-staircase.jpg` (→ 0, not
  oriented). Test the async file reader too: orientation 6 after five maximum-length APP2
  segments (Exif beyond 256 KiB) is still detected; a long metadata chain without Exif reaches
  SOS/EOI and returns none; invalid lengths or truncated segments return unreadable. Assert that
  unrelated payloads and compressed image data are skipped rather than read into memory.
- `tests/cloud-upload.client.test.ts`: ordering with an injected `prepare`. The PUT body is the
  prepared file, and the MIME type and extension come from it. A throwing `prepare` surfaces the new
  copy with zero `fetch` calls (no create-job, no PUT). A prepared file over 25 MB is rejected
  before the POST. The default preparation PUTs an unoriented JPEG and a PNG as the identical
  `File` object. An unreadable Exif uploads as stored and calls `console.warn` once; a file with no
  Exif does not warn.

**Intent**: Pin every Definitions row that Node can reach. The browser redraw itself is covered in
Phase 2.

**Contract**: Vitest under the `node` environment, following the existing `tests/*.test.ts` style.
The licensed photos are read from disk without being copied.

### Success Criteria:

#### Automated Verification:

- New and changed unit tests pass: `npx vitest run tests/exif-orientation.test.ts tests/cloud-upload.client.test.ts` — not run: needs Phase 1 output
- Full unit suite passes: `npm run test:unit` — at planning: exit 0
- Type checking passes: `npm run typecheck` — at planning: exit 0
- Linting passes: `npm run lint` — at planning: exit 0
- Formatting passes: `npm run format:check` — not run: needs Phase 1 output

#### Manual Verification:

- The owner reads the failure copy and confirms its wording — surface: src/lib/enhance-strings.ts

**Implementation Note**: Manual checks are acceptance. `/rune-implement` commits a phase once its automated verification passes, then asks the human about these; a pending manual check is reported, not a blocker for the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Prove the model input in a real browser

### Overview

One Playwright spec observes the real PUT body for two synthetic oriented fixtures and checks
their pixels, dimensions and tag. This is the part Node cannot prove.

### Changes Required:

#### 1. Orientation fixtures

**Files**: `tests/e2e/fixtures/orient-6.jpg`, `tests/e2e/fixtures/orient-2.jpg`, `tests/e2e/fixtures/README.md`

**Intent**: Two small, synthetic, non-square RGB JPEGs (for example 96 × 64 stored) with one
distinct colour block in the stored top-left corner, tagged 6 and 2. Under tag 6 the display
becomes 64 × 96 with the block in the top-right. Under tag 2 the display stays 96 × 64 with the
block mirrored to the top-right. The README records how they were generated and that they are
synthetic and made in-repo, so the test-photograph rule does not apply.

**Contract**: The block is large enough (for example a 24 px square) to survive JPEG chroma
subsampling at a colour tolerance.

#### 2. PUT-body spec

**File**: `tests/e2e/cloud-upload-orientation.spec.ts`

**Intent**: For each fixture: as a signed-in user, upload → Cloud AI → Process with Cloud AI, then
capture the PUT to the signed upload URL with `page.waitForRequest` (observed, not mocked).
The body is read in a pass-through `page.route` that continues the request unmodified to the real
Storage, because Chromium exposes a `File`/`Blob` PUT body to request events only intermittently
(`postDataBuffer()` was `null` on both fixtures in the first run) (owner decision 2026-10-25). Track
that exact request through response and completion, and require a successful response with no
network failure before the test can pass. Arm request/response observation before clicking submit.
Decode the captured bytes in the page **ignoring metadata**, and assert:

- tag 6: display dimensions (swapped) and the block in the top-right;
- tag 2: the block mirrored to the top-right (dimensions alone cannot catch this one);
- for both, checked separately in the bytes: no orientation tag other than 1 remains, using the
  Phase 1 detector.

Without the fix, both assertions fail, because the raw bytes keep the stored layout. In `afterEach`,
wait for any captured PUT to settle (success or network failure) before cleaning up the captured
`jobId` row and its storage prefix, including when an assertion has failed. Keep upload tracking
available to cleanup; a rejected tracking promise must not bypass deletion. Bound the settlement
wait; if it expires, close the test page to stop the upload and wait for request termination before
deleting its storage prefix. A failed upload or timeout fails the test rather than being treated as
success. Do not start the fixture server.

**Contract**: Follows `tests/e2e/RULES.md` house style: a header naming this change's Phase 2, `seed:`
line, role/label locators, no `waitForTimeout`, admin client only via `helpers/env.ts` for cleanup,
unique run id.

### Success Criteria:

#### Automated Verification:

- The orientation spec passes against the local stack: `npx playwright test tests/e2e/cloud-upload-orientation.spec.ts` — not run: needs Phase 2 output
- The whole E2E suite stays green: `npm run test:e2e` — not run: writes (rebuilds `dist/`, needs the local stack and served `enhance` function)
- Deliberate-break check: with the Phase 1 `prepare` temporarily replaced by identity, the orientation spec fails on both fixtures — not run: needs Phase 2 output
- Formatting passes: `npm run format:check` — not run: needs Phase 2 output

#### Manual Verification:

- Running the app locally, the owner submits `06-phone-rain-galaxys24ultra.jpg` with Cloud AI and sees the "Enhancing in the cloud…" state reached with no error (the stubbed pipeline returns no real result) — surface: src/lib/services/cloud-upload.client.ts

---

## Phase 3: Ship and accept in production

### Overview

Merge and deploy. Then run the paid acceptance on S17-06 plus an orientation-1 control, record it,
and correct every pointer that names this fix as outstanding.

### Changes Required:

#### 1. Live acceptance record

**File**: `context/changes/cloud-exif-orientation/live-acceptance.md`

**Intent**: Record the production run: the deployed master commit (full SHA, taken after the merge,
because rebase-merge rewrites SHAs), the date of the check, both job ids, and for each photo the
BEFORE / AFTER / downloaded-file orientation and dimensions, with the result of the check.

**Contract**:

- **S17-06** (`06-phone-rain-galaxys24ultra.jpg`, tag 6): BEFORE, AFTER and the downloaded file are
  all upright portrait. The download is about 1152 × 1536. The full frame is checked in the
  downloaded file, so an `object-cover` crop cannot hide a rotation.
- **Control** (`05-phone-walgreens-pixel7.jpg`, tag 1, stored portrait 3072 × 4080): orientation and
  aspect are unchanged.

If the production cap runs out (3 a day), run the control after the 00:00 UTC reset. Until then
acceptance stays incomplete and is marked as such.

#### 2. Pointer corrections

**Files**: `context/changes/cloud-exif-orientation/change.md`, `context/foundation/roadmap.md`, `context/changes/cloud-model-comparison/change.md`

**Intent**: Replace every statement that this fix is outstanding with a reference to
`live-acceptance.md`. The pointer set, enumerated now:

- `change.md` Notes: "S-17 Phase 5 waits until the fix is live" (S-17 has closed; the dependants are
  S-19 and in-app phone-photo runs), plus its stale evidence path
  `context/changes/cloud-quality-below-local/calibration.md`, which now lives under
  `context/archive/2026-08-31-cloud-quality-below-local/`.
- `roadmap.md:339`: the S-19 Prerequisites line.
- `cloud-model-comparison/change.md:30-31`: "a precondition for any in-app run of phone photos".

`context/archive/` is not touched; the S-17 calibration log stays as written.

**Contract**: Only those passages change. The S-19 item's `Status` stays as it is.

### Success Criteria:

#### Automated Verification:

- (paid) PR checks `ci`, `integration`, `e2e`, `code-reviewer` green and the master `deploy` job succeeds: `gh pr checks <pr>` then `gh run list --workflow ci.yml --branch master --limit 1` — artifact: `context/changes/cloud-exif-orientation/live-acceptance.md` — not run: paid
- The deployed client bundle contains the new copy (verify by content, not by exit code): `curl -s https://luminacleanai.com/` and grep the referenced `/_astro/*.js` for `Couldn't prepare this photo for Cloud AI` — not run: external
- No stale "outstanding" pointer remains: ``grep -nF -e 'S-17 Phase 5 waits' -e 'need `cloud-exif-orientation` in production' -e 'precondition for any in-app run' context/foundation/roadmap.md context/changes/cloud-model-comparison/change.md context/changes/cloud-exif-orientation/change.md`` exits 1 — at planning: exit 0 — expected until Phase 3 (all three pointers still match; command corrected and rechecked during plan-review triage)
- Formatting passes: `npm run format:check` — not run: needs Phase 3 output

#### Manual Verification:

- (paid) The owner runs S17-06 on production and confirms BEFORE, AFTER and the downloaded file are upright portrait, with the full frame checked in the download — surface: context/changes/cloud-exif-orientation/live-acceptance.md
- (paid) The owner runs the orientation-1 control (`05-phone-walgreens-pixel7.jpg`) and confirms orientation and aspect are unchanged — surface: context/changes/cloud-exif-orientation/live-acceptance.md
- The owner confirms the acceptance record names the post-merge master SHA, the check date and both job ids — surface: context/changes/cloud-exif-orientation/live-acceptance.md

---

## Testing Strategy

### Unit Tests:

- Detector: values 1–8, 0, 9; both TIFF byte orders; Exif after APP0; IFD1-only tag; no APP1;
  truncated APP1 → unreadable; non-JPEG → none; real headers of S17-06 (6) and `18-staircase` (0).
  Bounded-slice file reader: Exif beyond 256 KiB after five maximum-length APP2 segments; no Exif
  after a long metadata chain; malformed/truncated traversal; no reads of skipped payloads or
  compressed image data.
- Submit ordering: prepared file is what gets PUT; redraw failure → new copy, zero `fetch`; oversized
  prepared file rejected pre-POST; unoriented JPEG and PNG PUT as the identical `File`; unreadable
  Exif warns once, missing Exif never warns.

### Integration Tests:

- None new. The create-job and storage contracts are unchanged.

### E2E:

- `cloud-upload-orientation.spec.ts`: the observed PUT body for the tag-6 and tag-2 fixtures,
  checking pixels, dimensions and tag absence.

### Manual Testing Steps:

1. Locally: submit S17-06 with Cloud AI and confirm the submit completes with no error.
2. Production: run S17-06 and confirm BEFORE, AFTER and the download are upright portrait, checking
   the full frame in the download.
3. Production: run the orientation-1 control and confirm it is unchanged.

## Performance Considerations

Only oriented photos pay for the redraw: one full-resolution decode, a canvas draw and a JPEG
encode, about 100 MB of canvas memory for a 24.5 MP photo. Detection reads bounded marker/header
slices and at most one complete Exif segment (under 64 KiB), skipping unrelated payloads and
stopping before compressed image data. The number of reads depends on the metadata chain; there
is no fixed prefix cutoff. The redraw happens during "Submitting…", whose spinner already covers
it. Retrying with "Try again" repeats the redraw, which is acceptable.

## Migration Notes

None. No schema, API or stored-data change. Jobs already created keep their sideways results.

## References

- Frame: `context/changes/cloud-exif-orientation/frame.md`
- Evidence: `context/archive/2026-08-31-cloud-quality-below-local/calibration.md:67-85,244-260`
- Shared core: `src/lib/engines/canvas-helpers.ts:59-74`
- E2E house rules: `tests/e2e/RULES.md`; precedent spec `tests/e2e/chroma-postpass-on.spec.ts`
- Live run mechanics: `context/foundation/cloud-live-smoke.md` § Against production
- Lessons applied (7 of the 35 plan-applicable entries, out of 39): silent-degradation logging; a
  check must say what it found; a guard must see the failure (the deliberate-break row); a fixture
  ablated from the reproducing artifact (S17-06 headers in unit tests); stale pointers enumerated
  up front; premise measured (S17-06 tag re-checked); verify under the production build.

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append ` — <commit sha>` when a step lands. A Manual row takes ` — accepted at <full sha>` when a human confirms it. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Detect and normalise before create-job

#### Automated

- [x] 1.1 New and changed unit tests pass — 65a8548
- [x] 1.2 Full unit suite passes — 65a8548
- [x] 1.3 Type checking passes — 65a8548
- [x] 1.4 Linting passes — 65a8548
- [x] 1.5 Formatting passes — 65a8548

#### Manual

- [x] 1.6 The owner reads the failure copy and confirms its wording — accepted at 65a8548fca099e4fa7bc80baddf94738247f45e4

### Phase 2: Prove the model input in a real browser

#### Automated

- [x] 2.1 The orientation spec passes against the local stack — d81db0d
- [x] 2.2 The whole E2E suite stays green — d81db0d
- [x] 2.3 Deliberate-break check: identity `prepare` makes the orientation spec fail on both fixtures — d81db0d
- [x] 2.4 Formatting passes — d81db0d

#### Manual

- [ ] 2.5 Local S17-06 Cloud submit reaches the processing state with no error

### Phase 3: Ship and accept in production

#### Automated

- [ ] 3.1 PR checks green and master deploy succeeds
- [ ] 3.2 The deployed client bundle contains the new copy
- [ ] 3.3 No stale "outstanding" pointer remains
- [ ] 3.4 Formatting passes

#### Manual

- [ ] 3.5 S17-06 upright in BEFORE, AFTER and download on production
- [ ] 3.6 Orientation-1 control unchanged on production
- [ ] 3.7 Acceptance record names the post-merge master SHA, check date and both job ids
