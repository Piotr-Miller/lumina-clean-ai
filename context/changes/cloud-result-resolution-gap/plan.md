# Fair before/after comparison on the Cloud path — Implementation Plan

## Overview

The Cloud AI result is delivered at roughly an eighth of the source's pixel count, and the
before/after slider then renders both panes into **one CSS box sized from the result**. The browser
therefore downsamples the 8–12 MP original hard (averaging its grain away, so it reads as crisp)
while showing the ~1.5 MP result at or near 1:1 (every noise pixel visible). That asymmetry is the
whole "the AFTER is noisier than the BEFORE" observation recorded against S-17's screenshot `02` —
**no pixel fault is required to produce it**.

This plan fixes the **presentation half only**. The delivery half (upscaling, requesting a larger
output, keeping PNG) interacts with S-17's model decision and is explicitly out of scope; S-18 stays
open after this plan lands.

## Current State Analysis

- `BeforeAfterSlider` sizes its container from the `width`/`height` props via
  `aspectRatio` + `maxWidth: calc(60vh * w/h)` and renders **both** `<img>` as
  `object-cover h-full w-full` (`src/components/enhance/BeforeAfterSlider.tsx:64-67, 86-100`).
- The component's own prop doc states the contract it relies on: _"Intrinsic pixel dimensions
  (**before === after**)"_ (`:10-13`). **The cloud path violates that contract.**
  `EnhanceWorkspace` passes `cloudWidth`/`cloudHeight` on the cloud branch
  (`src/components/enhance/EnhanceWorkspace.tsx:358-364`), which come from `useCloudJob`'s
  `loadCloudResult` decode of the **result** (`src/lib/services/cloud-result.client.ts:27-38`,
  `src/components/hooks/useCloudJob.ts:363-364, 441-442`). The local branch passes the local
  result's dimensions, which equal the source's (`src/lib/engines/local-engine.ts:31, 61`), so the
  local path satisfies the contract and **cannot exhibit this defect**.
- The source's dimensions are **already decoded** and thrown away.
  `EnhanceWorkspace.tsx:132` calls `decodeImage(sourceUrl)` for luma sampling and keeps only
  `stats`; the returned `HTMLImageElement` carries `naturalWidth`/`naturalHeight`
  (`EnhanceWorkspace.tsx:52`). Capturing them costs no extra decode and no network.
- **There is no component-test infrastructure at all.** `vitest.config.ts:8-11` sets
  `environment: "node"`; there is no `@testing-library` anywhere, and no test file references
  `BeforeAfterSlider` or `EnhanceWorkspace`. Any new decision logic must live in a **DOM-free
  module** to be testable — the same env-free-core split the repo already uses for
  `reset-password.handler.ts` and `supabase/functions/enhance/replicate-create.ts`.
- **The E2E fixture cannot exercise this change as it stands.**
  `tests/e2e/fixtures/night-rgb.jpg` is **128×128** and `serveFixture` serves **the same file** back
  as the stubbed Replicate output (`tests/e2e/north-star-cloud-result.spec.ts:57, 134, 172`;
  `tests/e2e/helpers/fixture-server.ts:47-54`). Source and result dimensions are therefore
  **identical** in E2E, so both the rescale and the caption are skipped. The existing specs prove
  the no-op path, not the new one.
- **Frozen E2E locators** (`src/lib/enhance-strings.ts:118-130`): `slider.ariaLabel` and the derived
  `"Your photo — enhanced"` name are asserted verbatim by
  `north-star-cloud-result.spec.ts:211-213` and `chroma-postpass-on.spec.ts:131-132`, and the latter
  also pins that `afterSrc` starts with `blob:` (`:139-146`). **No spec asserts the BEFORE pane's
  `src`, `alt`, or anything else about it** — so replacing `beforeSrc` with a canvas object URL
  breaks nothing. The specs hardcode the literals and do not import `STRINGS`, so a string change
  gives **no compile-time signal**, only a red E2E run.
- Prior art for main-thread canvas cost: the chroma post-pass already runs a full JS pass up to
  **12 MP** (`MAX_CHROMA_POSTPASS_PIXELS`, `src/lib/engines/chroma-denoise.ts:55`), benchmarked at
  **~0.4 s, 4.8× under its 2 s budget**. A single browser-native resize of the same image is
  strictly cheaper, so this plan introduces no new performance class.

### Origin of the guarantees this plan leans on

- "Bread caps the long edge at 1536 px and floors both dimensions to a multiple of 8, **not
  configurable**" — origin `product` (measured on the model's own demo pairs and its published
  schema, `context/changes/cloud-quality-below-local/research.md:154-159`). **"~1.5 MP" is an
  average, not a constant**, and a source whose long edge is already ≤ 1536 **passes through
  unchanged**.
- "before === after" in the slider's prop doc — origin `code`. It is an implementation assumption
  that the local path happens to satisfy, never a stated requirement. This plan does **not** restore
  it; it makes the component tolerate a mismatch deliberately.

## Definitions

| Term                     | Decided meaning                                                                                                                      | Origin | On degenerate data                                                                                                                                                                        | Verified by                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **BEFORE pane**          | The user's uploaded file, decoded — resampled for display only. The uploaded bytes are never modified and the download is untouched. | user   | Source unavailable/undecodable → keep today's behaviour (raw `sourceUrl`), never an error.                                                                                                | 1.1, 2.4                        |
| **AFTER pane**           | The bytes already displayed today: the post-passed JPEG, or the raw Bread PNG when the pass is off or fell back.                     | code   | Unchanged by this plan.                                                                                                                                                                   | 4.2 (existing specs stay green) |
| **Fair comparison**      | Both panes carry a comparable pixel budget into the same CSS box, so noise is visible at the same scale on both sides.               | user   | Equal dimensions → **skip entirely** (the Local path, and any cloud job whose source passed through Bread).                                                                               | 1.2, 2.3, 0.1                   |
| **Downscale factor**     | `resultLongEdge / sourceLongEdge`, applied to **both** source dimensions and rounded.                                                | user   | Scaling to the result's _exact_ dimensions is **wrong** — Bread's /8 flooring would stretch the original by a few px. Factor ≥ 1 → skip.                                                  | 1.2                             |
| **"Resolutions differ"** | `resultPixels < 0.9 × sourcePixels` — a real pixel-count drop, not any dimension difference.                                         | user   | /8 flooring alone costs ≲ 1 % at realistic result sizes, so the threshold has ~9× headroom and never fires on it. Below ~200 px a floored dimension can approach 10 %; accepted, see 1.3. | 1.3                             |
| **Quality downscale**    | An area-averaging resample, not default bilinear.                                                                                    | user   | A poor resampler at 3× **aliases** noise and sharpens it, making the BEFORE look worse than the user's own gallery — the failure mode that would make this change a regression.           | 0.1, 2.5                        |

## Desired End State

On the cloud path with a downscaled result, the slider shows the original and the enhanced result at
the same effective resolution, so a noise comparison is honest in both directions; nothing is
silently cropped; and a caption beside the Download action states both pixel dimensions, so the
resolution the user actually receives is a visible fact rather than a hidden one. On the local path,
and on any cloud job Bread passed through unchanged, **nothing changes at all**.

### Key Discoveries

- Source dimensions are one line away in an existing decode (`EnhanceWorkspace.tsx:130-150`).
- No E2E spec constrains the BEFORE pane, so its `src` can become a canvas blob freely.
- The E2E fixture is 128×128 and is echoed back as the output, so the new path needs a **second,
  smaller output fixture** to be covered at all.
- No component-test harness exists → the decision logic must be pure and DOM-free.

## What We're NOT Doing

- **The delivery half.** No upscaling of the result, no request for a larger output, no PNG-vs-JPEG
  change, no touching `JPEG_QUALITY`. Those interact with S-17's model decision; S-18 stays open.
- **Not changing the downloaded bytes.** The download remains exactly what it is today.
- **Not modifying the uploaded source.** The rescale is display-only.
- **Not touching `MAX_CHROMA_POSTPASS_PIXELS`, the chroma pass, or its 12 MP contract** — a
  plan-review-mandated safety contract from S-11.
- **Not changing any frozen string** (`slider.ariaLabel`, `workspace.photoAlt`, `slider.enhancedAlt`).
  Only **new** strings are added.
- **Not adding a component-test framework.** Coverage comes from a pure module plus E2E.
- **Not converting the slider to a native `<input type="range">`** — it would keep the role but
  change how the layers compose, for no benefit here.

## Implementation Approach

Split the decision from the pixels. A DOM-free module answers two questions from four integers —
_should the original be rescaled, and to what?_ and _do the resolutions differ enough to say so?_ —
and is fully unit-tested under the existing Vitest `node` environment. A thin browser adapter does
the actual resample with a quality resizer, and both the slider's box and the caption are driven by
the module's answers. Every path degrades to today's behaviour: if the rescale fails, the raw source
URL is used; if dimensions match, nothing runs.

## Critical Implementation Details

**Resampler quality is the whole risk.** A plain `drawImage` into a smaller canvas uses default
bilinear filtering, which at a 3× reduction **aliases** noise rather than averaging it — the BEFORE
pane would come out grainier than the user's own phone gallery renders it, and this change would
then make the comparison worse than it is today. Use
`createImageBitmap(source, { resizeWidth, resizeHeight, resizeQuality: "high" })`, and if a stepwise
fallback is needed, halve repeatedly until within 2× of the target before the final draw. **Verify
visually in Firefox as well as Chromium** — Firefox ignores `imageSmoothingQuality`, so a fallback
that relies on it would silently degrade there.

---

## Phase 0: Verify the premise before building anything

### Overview

The hypothesis is that browser-side scaling asymmetry accounts for the "AFTER is noisier" symptom.
Browsers already area-average the BEFORE when downscaling it, so the visible gain from this change
may be smaller than the framing assumes, and part of the symptom may be **residual model noise after
a gamma 1.5 lift**. Settling that first costs minutes and decides whether the rest of the plan is
worth its diff. **If the symptom barely moves, that is a finding for S-17, not a failure of this
plan** — record it and continue, because the crop fix and the disclosure stand on their own.

### Changes Required

#### 1. A recorded side-by-side comparison

**File**: `context/changes/cloud-result-resolution-gap/premise-check.md` (new)

**Intent**: Take the aurora job behind S-17's screenshot `02` (`190832de…`), whose `result.png` is
still in storage, downscale the **original** with a quality resampler by the factor Bread applied,
and view both at the same scale. Record what changed and by how much.

**Contract**: The stored `source.jpg` for that job is **reaped** (24 h retention), so this needs the
maintainer's own copy of that photo. The document records: source dimensions, result dimensions, the
computed factor, the resampler used, and a plain-language verdict on whether the noise gap narrows,
closes, or stays.

### Success Criteria

#### Manual Verification

- The comparison is recorded with both dimension pairs and the computed factor
- A verdict is stated: how much of the symptom is presentation and how much survives
- If the gap does not narrow, the finding is cross-referenced into S-17's change folder

---

## Phase 1: Pure scaling + disclosure core

### Overview

All decision logic, DOM-free and unit-tested under Vitest `node`.

### Changes Required

#### 1. The decision module

**File**: `src/lib/engines/result-scaling.ts` (new)

**Intent**: Answer, from four integers, whether the BEFORE pane should be resampled and to what
dimensions, and whether the two resolutions differ enough to tell the user.

**Contract**: Two pure exports.

- `computeBeforeScale({ sourceWidth, sourceHeight, resultWidth, resultHeight })` →
  `{ width: number; height: number } | null`. Returns `null` when no rescale applies: equal
  dimensions, a result at least as large as the source, or any non-finite/non-positive input. When
  it applies, the factor is `resultLongEdge / sourceLongEdge` applied to **both** source dimensions
  and rounded, floored at 1 px — **never the result's exact dimensions**, which would stretch the
  original by Bread's /8 remainder.
- `shouldDiscloseResolution(dims)` → `boolean`. True only when
  `resultWidth × resultHeight < 0.9 × sourceWidth × sourceHeight`.

**File**: `tests/result-scaling.test.ts` (new)

**Intent**: Pin every row of the Definitions table, including the degenerate cases.

**Contract**: Cases — equal dimensions → `null` and no disclosure; a 4032×3024 source against a
1536×1152 result → scaled pair on the same factor and disclosure true; a source that passed through
Bread (long edge ≤ 1536) → `null`; an /8-floored near-match (e.g. 1201×803 → 1200×800) → **no
disclosure** (≈0.5 % drop); a result larger than the source → `null`; zero, negative, `NaN` and
non-integer inputs → `null` and no disclosure; a portrait source so the long edge is the height.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test:unit`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

---

## Phase 2: Wire the fair comparison into the cloud path

### Overview

Capture the source dimensions, resample the BEFORE pane for display, and size the slider box from a
pair that both images actually share.

### Changes Required

#### 1. Capture the source dimensions

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: The existing decode effect already holds the decoded `HTMLImageElement`; keep its
intrinsic dimensions in state instead of discarding them.

**Contract**: New state alongside `stats`, set inside the same `decodeImage(sourceUrl).then(...)`
callback at `:132-147` and cleared on reset with it. No new decode, no new network request, and the
effect's dependency array is unchanged.

#### 2. The browser resampler

**File**: `src/lib/services/before-pane.client.ts` (new)

**Intent**: Produce a display-only object URL for the downscaled original, and never fail the render.

**Contract**: Takes the source URL plus the target from `computeBeforeScale`; returns an object URL
or `null`. Uses `createImageBitmap(..., { resizeWidth, resizeHeight, resizeQuality: "high" })`; any
throw returns `null`. The caller revokes the URL on change/unmount. Kept out of `image-helpers.ts`,
which is deliberately DOM-free and Node-unit-tested.

#### 3. Use the rescaled pane

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: On the cloud branch, pass the rescaled object URL as `beforeSrc` and the shared scaled
dimensions as the slider's `width`/`height`; fall back to today's values whenever the module
returned `null` or the resample failed.

**Contract**: The local branch (`:350-356`) is untouched. No spec constrains `beforeSrc`, so this is
free of the frozen-locator contract.

#### 4. State the real contract on the component

**File**: `src/components/enhance/BeforeAfterSlider.tsx`

**Intent**: The prop doc claims `before === after`, which the cloud path has always violated. Correct
it to say the props are the **shared display box** both panes are rendered into, and that the caller
guarantees both sources match that aspect ratio.

**Contract**: Comment-only — no behavioural change, no DOM change, no string change. `object-cover`
stays: once both panes share the box's ratio, it is a no-op and the silent BEFORE crop is gone.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test:unit`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification

- On a cloud job with a downscaled result, the BEFORE pane is **not** grainier than the same photo
  in the OS photo viewer — verified in **both Chromium and Firefox**
- Dragging the divider shows no seam or size jump between the panes
- A local-engine run is pixel-identical to before the change
- With the network throttled or the resample forced to fail, the slider still renders

---

## Phase 3: Disclose the delivered resolution

### Overview

Rescaling equalises the comparison, which also **hides** the resolution deficit. The caption is the
other half of the same honesty.

### Changes Required

#### 1. The copy

**File**: `src/lib/enhance-strings.ts`

**Intent**: Add a new entry stating both dimensions as a fact, not an apology.

**Contract**: A **new** key only; no existing string is edited, so no frozen locator moves. Follows
the S-15 externalization pattern already used by every other surface string.

#### 2. Render it beside the download action

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: Render the caption next to the Download control — it describes the downloaded file —
gated on `shouldDiscloseResolution`.

**Contract**: **Outside** the `BeforeAfterSlider` subtree, so the slider's accessible name and the
`"Your photo — enhanced"` image name are untouched. Not rendered on the local path, nor when the
resolutions do not differ.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test:unit`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- The caption appears on a downscaled cloud result and states both dimension pairs correctly
- It does **not** appear on a local result, nor on a cloud result Bread passed through
- It reads as a neutral statement of fact

---

## Phase 4: Make E2E actually cover the new path

### Overview

Today's fixture is 128×128 and is echoed back as the output, so source and result dimensions match
and **both new behaviours are skipped**. Without a smaller output fixture, a green E2E run says
nothing about this change.

### Changes Required

#### 1. A smaller output fixture

**File**: `tests/e2e/fixtures/night-rgb-small.jpg` (new)

**Intent**: A downscaled copy of the existing fixture so the stubbed result is genuinely smaller
than the upload, making the pixel drop exceed the 0.9 threshold.

**Contract**: Derived from `night-rgb.jpg`, 3-channel RGB JPEG, long edge 64 px — a 4× pixel-count
drop, comfortably past the threshold.

#### 2. Serve it as the stubbed output

**File**: `tests/e2e/north-star-cloud-result.spec.ts`

**Intent**: Keep uploading the 128×128 fixture, but serve the 64×64 one as the Replicate output, and
assert the caption appears.

**Contract**: `serveFixture({ filePath: SMALL_FIXTURE_PATH })` at `:172`; the upload at `:134` is
unchanged. The existing slider and Download assertions (`:211-214`) stay exactly as they are.

#### 3. Assert absence where it must not appear

**File**: `tests/e2e/seed.spec.ts` or the local-path spec

**Intent**: Pin that the caption does not appear when no cloud downscale happened.

**Contract**: A negative assertion only; no existing locator changes.

### Success Criteria

#### Automated Verification

- The full E2E gate passes: `npm run test:e2e`
- `north-star-cloud-result.spec.ts` asserts the caption is **visible** with the smaller output
- The local/anonymous spec asserts the caption is **not** present
- `chroma-postpass-on.spec.ts` still passes, including its `blob:` `afterSrc` assertion
- Unit tests, types, lint and build all pass

#### Manual Verification

- A full local run against the real stack reproduces the E2E result

---

## Testing Strategy

### Unit Tests

`tests/result-scaling.test.ts` carries every Definitions row: equal dimensions, a real downscale, a
pass-through source, an /8-floored near-match below the disclosure threshold, an upscale, a portrait
source, and the non-finite/zero/negative inputs.

### Integration / E2E

The north-star cloud spec exercises the rescale and the caption via the smaller output fixture; the
chroma spec proves the AFTER pane and its `blob:` source are unaffected; a local-path spec proves the
caption stays absent.

### Manual Testing Steps

1. Run a cloud job on a real 12 MP night photo; confirm the BEFORE pane is no grainier than the OS
   photo viewer shows it, in **Chromium and Firefox**.
2. Drag the divider end to end; confirm no seam, jump, or crop.
3. Confirm the caption beside Download states both dimension pairs.
4. Run the local engine on the same photo; confirm the render is unchanged and no caption appears.
5. Download from both engines; confirm the bytes are unchanged from before this plan.

## Performance Considerations

One browser-native resize of an image already bounded at 8000 px per side
(`MAX_IMAGE_DIMENSION`). The chroma post-pass already runs a full **JavaScript** pass over up to
12 MP in ~0.4 s, 4.8× under its 2 s budget; a native resize of the same image is strictly cheaper, so
this introduces no new performance class. It runs once per result, not per frame, and never on the
local path.

## Migration Notes

None. Display-only, no schema change, no stored-artifact change, no change to any downloaded byte.
Reverting the commit fully restores today's behaviour.

## References

- Frame that surfaced the gap: `context/changes/cloud-quality-below-local/frame.md:43` (dimension 2b,
  confidence STRONG)
- Bread's output rule: `context/changes/cloud-quality-below-local/research.md:154-159`
- Roadmap slice: `context/foundation/roadmap.md` § S-18 — issue #238
- Frozen E2E locator contract: `src/lib/enhance-strings.ts:8-12, 118-130`
- Main-thread canvas precedent: `context/archive/2026-06-18-bread-chroma-postpass/tuning-results.md:129-133`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 0: Verify the premise before building anything

#### Manual

- [ ] 0.1 The comparison is recorded with both dimension pairs and the computed factor
- [ ] 0.2 A verdict is stated: how much of the symptom is presentation and how much survives
- [ ] 0.3 If the gap does not narrow, the finding is cross-referenced into S-17's change folder

### Phase 1: Pure scaling + disclosure core

#### Automated

- [ ] 1.1 Unit tests pass: `npm run test:unit`
- [ ] 1.2 Type checking passes: `npm run typecheck`
- [ ] 1.3 Linting passes: `npm run lint`

### Phase 2: Wire the fair comparison into the cloud path

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test:unit`
- [ ] 2.2 Type checking passes: `npm run typecheck`
- [ ] 2.3 Linting passes: `npm run lint`
- [ ] 2.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.5 BEFORE pane is not grainier than the OS photo viewer, in Chromium and Firefox
- [ ] 2.6 Dragging the divider shows no seam or size jump
- [ ] 2.7 A local-engine run is pixel-identical to before the change
- [ ] 2.8 With the resample forced to fail, the slider still renders

### Phase 3: Disclose the delivered resolution

#### Automated

- [ ] 3.1 Unit tests pass: `npm run test:unit`
- [ ] 3.2 Type checking passes: `npm run typecheck`
- [ ] 3.3 Linting passes: `npm run lint`

#### Manual

- [ ] 3.4 The caption appears on a downscaled cloud result with correct dimension pairs
- [ ] 3.5 It does not appear on a local result, nor on a passed-through cloud result
- [ ] 3.6 It reads as a neutral statement of fact

### Phase 4: Make E2E actually cover the new path

#### Automated

- [ ] 4.1 The full E2E gate passes: `npm run test:e2e`
- [ ] 4.2 North-star spec asserts the caption is visible with the smaller output fixture
- [ ] 4.3 The local/anonymous spec asserts the caption is not present
- [ ] 4.4 `chroma-postpass-on.spec.ts` still passes, including its `blob:` assertion
- [ ] 4.5 Unit tests, types, lint and build all pass

#### Manual

- [ ] 4.6 A full local run against the real stack reproduces the E2E result
