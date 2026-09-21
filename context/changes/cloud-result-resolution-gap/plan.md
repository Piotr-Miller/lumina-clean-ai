# Disclose the delivered resolution on the Cloud path — Implementation Plan

> **Re-scoped 2026-09-21 after Phase 0 measured its own premise and failed it.** The original plan
> led with rescaling the BEFORE pane to equalise the comparison. That is now **out of scope**:
> measurement showed the asymmetry it removes is 1–3 % at a typical box and runs the _opposite_ way
> at high device-pixel ratios. What survives is the part that was always true and is now better
> evidenced. Full measurement: `premise-check.md`.

## Overview

On the Cloud path the user receives roughly **a sixth of the pixels** the free Local engine returns,
and the interface gives them no way to find that out. Measured on a real 9.83 MP night frame, Bread
returns 1536 × 1024 — **pixel ratio 0.160**. This plan makes that a visible fact, and corrects one
small rendering defect while in the same component.

The **delivery** half (upscaling, requesting a larger output, keeping PNG) interacts with S-17's
model decision and stays out of scope. S-18 remains open after this plan lands.

## Current State Analysis

- **Bread's output rule**: long edge capped at **1536 px**, both dimensions floored to a multiple of
  8, not configurable (`context/changes/cloud-quality-below-local/research.md:154-159`). A source
  whose long edge is already ≤ 1536 **passes through unchanged**. "~1.5 MP" is an average, not a
  constant.
- The Local engine returns the source's own dimensions (`src/lib/engines/local-engine.ts:31, 61`),
  so the free engine delivers more pixels than the paid one on any real phone photo.
- `EnhanceWorkspace` already has both numbers it needs: the result's dimensions arrive on the cloud
  branch as `cloudWidth`/`cloudHeight` (`:358-364`), and the source's are available from the decode
  the component already performs for luma sampling (`:132`, via `decodeImage` at `:52`). Capturing
  them costs no extra decode and no network.
- `BeforeAfterSlider` sizes its box from the `width`/`height` props and renders both panes
  `object-cover h-full w-full` (`:64-67, 86-100`). Its prop doc claims `before === after`; the cloud
  branch has always violated that.
- **There is no component-test infrastructure.** `vitest.config.ts:8-11` is `environment: "node"`,
  there is no `@testing-library`, and no test references `BeforeAfterSlider` or `EnhanceWorkspace`.
  New decision logic must be **DOM-free** to be testable — the env-free-core split the repo already
  uses for `reset-password.handler.ts` and `replicate-create.ts`.
- **The E2E fixture cannot exercise this change as it stands.** `tests/e2e/fixtures/night-rgb.jpg`
  is **128 × 128** and `serveFixture` serves the **same file** back as the stubbed Replicate output
  (`north-star-cloud-result.spec.ts:57, 134, 172`; `helpers/fixture-server.ts:47-54`). Source and
  result dimensions are identical, so the disclosure never fires. The existing specs prove the
  no-op path, not the new one.
- **Frozen E2E locators** (`src/lib/enhance-strings.ts:118-130`): `slider.ariaLabel` and the derived
  `"Your photo — enhanced"` name are asserted verbatim, and the chroma spec additionally pins that
  `afterSrc` starts with `blob:`. The specs hardcode the literals and do **not** import `STRINGS`,
  so a string change gives no compile-time signal, only a red E2E run. **No spec constrains the
  BEFORE pane.**

## Definitions

| Term                     | Decided meaning                                                                             | Origin | On degenerate data                                                                                                                                                                                   | Verified by |
| ------------------------ | ------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **"Resolutions differ"** | `resultPixels < 0.9 × sourcePixels` — a real pixel-count drop, not any dimension difference | user   | /8 flooring alone costs ≲1 % at realistic result sizes, so the threshold has ~9× headroom and never fires on it. Below ~200 px a floored dimension can approach 10 %; accepted and pinned by a test. | 1.1         |
| **Disclosed numbers**    | The source's and the result's intrinsic pixel dimensions, as decoded                        | user   | Either missing → no caption, never a partial or guessed one.                                                                                                                                         | 1.1, 2.3    |
| **Silent crop**          | `object-cover` trimming a pane when the two ratios differ                                   | code   | Bounded: Bread's /8 flooring shifts the ratio by at most ~0.8 %, i.e. ~4 px in an 800 px box. A correctness tidy-up, not a visible bug.                                                              | 3.3         |

## Desired End State

A signed-in user whose cloud result came back smaller than their upload sees, beside the Download
control, what they uploaded and what they are downloading. On the Local path, and on any cloud job
Bread passed through, nothing changes at all.

## What We're NOT Doing

- **Not rescaling the BEFORE pane.** Measured and dropped: the asymmetry is 1–3 % at a typical box
  and runs the opposite way at high pixel ratios (`premise-check.md`). It also carried a real
  regression risk through resampler quality.
- **Not the delivery half** — no upscaling, no larger requested output, no PNG-vs-JPEG change, no
  touching `JPEG_QUALITY`. Sequences after S-17.
- **Not changing the downloaded bytes or the uploaded source.**
- **Not touching `MAX_CHROMA_POSTPASS_PIXELS`, the chroma pass, or its 12 MP contract.**
- **Not changing any frozen string.** Only **new** strings are added.
- **Not adding a component-test framework.**

## Implementation Approach

One pure predicate decides whether to disclose, unit-tested under the existing Vitest `node`
environment. The workspace captures the source dimensions from a decode it already performs and
renders a caption beside Download when the predicate says so. Everything degrades to today's
behaviour when a number is missing.

---

## Phase 0: Premise check — **COMPLETE, 2026-09-21**

Recorded in `premise-check.md`. Verdict: the change's registered justification was measured false in
two independent ways, the plan was re-scoped accordingly, and the finding was cross-referenced into
S-17's change folder. No code was written on the strength of the false premise.

### Success Criteria

#### Manual Verification

- Measurement recorded with dimensions, factors and method
- Verdict stated and the plan re-scoped to match
- Finding carried to S-17 rather than left only in S-18

---

## Phase 1: The disclosure predicate

### Changes Required

#### 1. A pure, DOM-free module

**File**: `src/lib/engines/result-scaling.ts` (new)

**Intent**: Decide, from four integers, whether the cloud result lost enough pixels to be worth
telling the user about.

**Contract**: `shouldDiscloseResolution({ sourceWidth, sourceHeight, resultWidth, resultHeight })`
→ `boolean`. True only when all four are finite positive integers **and**
`resultWidth × resultHeight < 0.9 × sourceWidth × sourceHeight`. No DOM, no imports beyond types.

**File**: `tests/result-scaling.test.ts` (new)

**Contract**: Pins every Definitions row — a real downscale (3840 × 2560 against 1536 × 1024, ratio
0.160) → true; equal dimensions → false; a pass-through source (long edge ≤ 1536) → false; an
/8-floored near-match such as 1201 × 803 against 1200 × 800 (≈0.5 % drop) → false; a result larger
than the source → false; zero, negative, `NaN` and non-integer inputs → false; a portrait source.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test:unit`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

---

## Phase 2: Disclose the delivered resolution

### Changes Required

#### 1. Capture the source dimensions

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: The existing decode effect already holds the decoded `HTMLImageElement`; keep its
intrinsic dimensions in state instead of discarding them.

**Contract**: New state set inside the same `decodeImage(sourceUrl).then(...)` callback at
`:132-147` and cleared on reset with it. No new decode, no new network request, dependency array
unchanged.

#### 2. The copy

**File**: `src/lib/enhance-strings.ts`

**Intent**: A new entry stating both dimensions as a fact, not an apology.

**Contract**: A **new** key only; no existing string is edited, so no frozen locator moves. Follows
the S-15 externalization pattern.

#### 3. Render it beside the download action

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: Render the caption next to the Download control, since it describes the downloaded file,
gated on `shouldDiscloseResolution`.

**Contract**: **Outside** the `BeforeAfterSlider` subtree, so the slider's accessible name and the
`"Your photo — enhanced"` image name are untouched. Not on the local path, nor when the predicate is
false.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test:unit`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification

- The caption appears on a downscaled cloud result with both dimension pairs correct
- It does **not** appear on a local result, nor on a cloud result Bread passed through
- It reads as a neutral statement of fact

---

## Phase 3: Correct the misleading prop contract

### Overview

**Narrowed 2026-09-21 by measurement.** This phase was going to re-size the slider box from the
source so the BEFORE pane was never the trimmed one. Measuring the actual aspect drift across ten
common camera ratios killed that: it is **0.000 % in nine of them** and 0.025 % in the one contrived
case, i.e. **0.2 px in an 800 px box**. Cloud AI's /8 flooring lands on exact ratios for standard
sensor dimensions, so there is no crop to fix. Re-sizing the box would only move a sub-pixel trim
from one pane to the other while changing layout in a component with frozen E2E locators.

What remains is the part that is genuinely wrong: the prop doc claims a contract the Cloud path has
violated since launch, and a future reader would trust it.

### Changes Required

#### 1. State the real contract

**File**: `src/components/enhance/BeforeAfterSlider.tsx`

**Intent**: Replace "Intrinsic pixel dimensions (before === after)" with what the props actually
are — the shared display box — and record the measured bound on the `object-cover` trim.

**Contract**: Comment-only. No DOM change, no string change, no behavioural change, no render
difference.

### Success Criteria

#### Automated Verification

- Unit tests, types, lint and build all pass
- The rendered output is unchanged (comment-only diff)

## Phase 4: Make E2E actually cover the new path

### Changes Required

#### 1. A smaller output fixture

**File**: `tests/e2e/fixtures/night-rgb-small.jpg` (new)

**Contract**: Derived from `night-rgb.jpg`, 3-channel RGB JPEG, long edge 64 px — a 4× pixel-count
drop, comfortably past the 0.9 threshold.

#### 2. Serve it as the stubbed output

**File**: `tests/e2e/north-star-cloud-result.spec.ts`

**Contract**: `serveFixture({ filePath: SMALL_FIXTURE_PATH })` at `:172`; the upload at `:134`
unchanged; the existing slider and Download assertions at `:211-214` unchanged. Add an assertion
that the caption is visible.

#### 3. Assert absence where it must not appear

**File**: the local/anonymous spec

**Contract**: A negative assertion only; no existing locator changes.

### Success Criteria

#### Automated Verification

- The full E2E gate passes: `npm run test:e2e`
- North-star asserts the caption is **visible** with the smaller output
- The local/anonymous spec asserts it is **not** present
- `chroma-postpass-on.spec.ts` still passes, including its `blob:` assertion
- Unit tests, types, lint and build all pass

---

## Testing Strategy

`tests/result-scaling.test.ts` carries every Definitions row. The north-star cloud spec exercises the
caption via the smaller output fixture; the chroma spec proves the AFTER pane is unaffected; a
local-path spec proves the caption stays absent.

## Performance Considerations

None. No new image processing is introduced — the rescale that would have added a canvas pass was
dropped in the re-scope.

## Migration Notes

None. Display-only, no schema change, no stored-artifact change, no change to any downloaded byte.

## References

- Phase 0 measurement and the re-scope rationale: `premise-check.md`
- Frame that surfaced the gap: `context/changes/cloud-quality-below-local/frame.md:43`
- Bread's output rule: `context/changes/cloud-quality-below-local/research.md:154-159`
- Roadmap slice S-18 — issue #238

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 0: Premise check

#### Manual

- [x] 0.1 Measurement recorded with dimensions, factors and method
- [x] 0.2 Verdict stated and the plan re-scoped to match
- [x] 0.3 Finding carried to S-17 rather than left only in S-18

### Phase 1: The disclosure predicate

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:unit` — 9c18c89
- [x] 1.2 Type checking passes: `npm run typecheck` — 9c18c89
- [x] 1.3 Linting passes: `npm run lint` — 9c18c89

### Phase 2: Disclose the delivered resolution

#### Automated

- [x] 2.1 Unit tests pass: `npm run test:unit` — ac281bf
- [x] 2.2 Type checking passes: `npm run typecheck` — ac281bf
- [x] 2.3 Linting passes: `npm run lint` — ac281bf
- [x] 2.4 Production build succeeds: `npm run build` — ac281bf (verified by CONTENT: the new string is present in `dist/client/_astro/EnhanceWorkspace.*.js`, per AGENTS.md)

#### Manual

- [x] 2.5 The caption appears on a downscaled cloud result with correct dimension pairs — discharged automatically instead: the north-star E2E spec asserts the exact rendered text `Uploaded 128×128 · downloading 64×64` against the real stack (77901e9)
- [x] 2.6 It does not appear on a local result, nor on a passed-through cloud result — discharged automatically: the chroma E2E spec serves the upload back unchanged and asserts the caption is absent (77901e9)
- [ ] 2.7 It reads as a neutral statement of fact — human judgement, still open

### Phase 3: Correct the misleading prop contract

#### Automated

- [x] 3.1 Unit tests, types, lint and build all pass — 6ae287e
- [x] 3.2 The rendered output is unchanged (comment-only diff) — 6ae287e

### Phase 4: Make E2E actually cover the new path

#### Automated

- [x] 4.1 The full E2E gate passes: `npm run test:e2e` — 77901e9 (green on PR #240)
- [x] 4.2 North-star asserts the caption is visible with the smaller output fixture — 77901e9
- [x] 4.3 The local/anonymous spec asserts the caption is not present — 77901e9, placed in the chroma spec instead: it is the stronger control, since it exercises the same cloud path with matching dimensions
- [x] 4.4 `chroma-postpass-on.spec.ts` still passes, including its `blob:` assertion — 77901e9
- [x] 4.5 Unit tests, types, lint and build all pass — 77901e9
