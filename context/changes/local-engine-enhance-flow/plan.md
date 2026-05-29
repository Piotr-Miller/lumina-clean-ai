# Local Engine Enhance Flow (S-01) Implementation Plan

## Overview

LuminaClean AI's first user-visible slice and the **shared UI shell** that the cloud path (S-03/S-04) will reuse. An anonymous visitor uploads a low-light JPG/PNG, runs a deliberately-naive **client-side** Canvas enhancement (gamma correction + Gaussian blur), compares the result against the original with a before/after slider, and downloads it — entirely in-browser, no network round-trip after page load.

## Current State Analysis

- **Zero product UI.** `src/pages/index.astro` renders the starter `Welcome.astro` hero inside `Layout.astro`. `/dashboard` is the only product-ish page (auth-protected). React islands hydrate via `client:load` (`src/pages/auth/signin.astro:16`).
- **shadcn:** only `src/components/ui/button.tsx` and `LibBadge.astro` installed — **no Slider, Input, Card**. No `src/components/hooks/` directory yet.
- **`cn()` helper** exists (`src/lib/utils.ts`). **Styling idiom** is a dark cosmic theme: `bg-white/10` surfaces, white/purple accents, rounded-lg, lucide-react icons (see `FormField.tsx`, `SubmitButton.tsx`).
- **Pending-state pattern** already established in `SubmitButton.tsx:12` (`useFormStatus` + spinner) — reuse the spinner markup for the processing indicator.
- **F-01 (`photo-jobs-data-and-storage`) is shipped** and defines the constraints this slice mirrors for the *shared uploader*: accepted formats `image/jpeg | image/png | image/heic`, **25 MB** size limit (bucket-level). F-01 is server/cloud-only — the Local engine reuses none of its code, only its validation constants for consistency.
- **`src/types.ts`** holds only cloud job entities (`PhotoJob`, `CreatePhotoJobCommand`, …). The Local engine adds no DB entities.
- **Stack:** Astro 6 SSR, React 19 (`react-compiler` lint plugin active), Tailwind 4, Vitest 3 already wired (`npm run test`). `astro.config.mjs` `output: "server"`.

## Desired End State

Visiting `/` (the home page) shows a slim value-prop header above a working enhance tool. A visitor can: pick or drag-drop a JPG/PNG (≤25 MB, within a max-pixel-dimension guard) → click "Enhance" → see a spinner during a sub-2s pass → drag a before/after slider to compare → download the result in its source format. Unsupported/oversized files show an inline error. HEIC is detected and politely rejected with a "convert to JPG/PNG" message. The upload, slider, and download components are standalone and prop-driven so S-03 can reuse them by swapping the result source. Verify by running the dev server, processing a representative night photo on desktop and at mobile-portrait width, and confirming `npm run test`, `npm run build`, and lint on touched files pass.

### Key Discoveries

- React island hydration pattern: `client:load` (`src/pages/auth/signin.astro:16`).
- Reusable pending spinner markup: `src/components/auth/SubmitButton.tsx:20-23`.
- Validation constants to mirror from F-01: formats `image/jpeg|image/png`, max **25 MB** (`supabase/migrations/20260528120100_create_photos_storage.sql`).
- `Layout.astro` default title is `"10x Astro Starter"` — pass a real `title` prop for the home page.
- Canvas native blur (`ctx.filter = "blur(Npx)"`) is GPU-backed and fast; a 256-entry gamma LUT applied over `getImageData`/`putImageData` is a single linear pass (~hundreds of ms on 12MP) — full-res main-thread processing realistically meets the 2s NFR.
- The dark `bg-cosmic` theme is applied **per-page**, not on `body`; pages wrap content in `bg-cosmic min-h-screen` (`dashboard.astro:8`, `auth/signin.astro:9`). `body` is light (`bg-background`).

## What We're NOT Doing

- **No engine toggle UI and no Cloud option** — FR-006/FR-007 (the toggle + sign-in gating) are **S-03's** PRD refs, not S-01's. We build only the seam an engine plugs into.
- **No Supabase, no API routes, no `types.ts` job entities, no auth** — fully client-side.
- **No Web Worker / WASM / OffscreenCanvas / advanced denoise** — explicit MVP non-goals (idea-notes). Main-thread Canvas only.
- **No HEIC decoding** — detect-and-reject (PRD OQ#1 safe default).
- **No user-tunable parameters** — gamma/blur are fixed constants; PRD mandates one-click, no settings panel (FR-008).
- **No history/persistence** — nothing is stored; result lives in memory until download.
- **No jsdom/canvas mocking** — full testing strategy is a Module-3 topic.

## Implementation Approach

Three layers, bottom-up: (1) a pure/processing logic layer behind a light `ImageEngine` seam; (2) standalone reusable UI shell components; (3) an orchestration hook + container that wires them and replaces the home page. The seam keeps the Local engine as one concrete implementation so S-03 plugs Cloud in without reworking orchestration; the standalone components are what the roadmap means by "build the shell once."

## Critical Implementation Details

- **Spinner must paint before the blocking pass.** The gamma LUT `putImageData` pass blocks the main thread. Set the processing flag, then `await` a macrotask yield (e.g. `await new Promise(r => setTimeout(r, 0))`) **before** the synchronous pixel work, or the spinner never renders. This mirrors why `SubmitButton` works (the browser owns the form-submit boundary).
- **Output resolution = source resolution.** Process at full res so the download preserves quality (FR-012). The dimension guard rejects pathological inputs up front; it does not downscale accepted ones.
- **Object URL lifecycle.** `URL.createObjectURL` for the source preview and the result blob must be `revokeObjectURL`'d on replace/unmount to avoid leaks across repeated enhancements.
- **Dimension guard is post-decode, with a mapped message.** `validateImageFile` only sees type + byte size; the `MAX_IMAGE_DIMENSION` check happens in the hook after decode, before `enhance`. Surface it as a specific user-visible error ("too large … max N×N px"), and map every other decode/engine failure to a concrete message too — the user must never see a generic "something went wrong" after clicking Enhance.

## Phase 1: Engine seam & processing logic

### Overview

Establish the `ImageEngine` seam, the Local engine's Canvas pipeline, and the pure helpers — with unit tests on the deterministic logic.

### Changes Required

#### 1. Engine seam

**File**: `src/lib/engines/types.ts`

**Intent**: Define the minimal contract every engine satisfies, so S-03's Cloud engine drops in behind the same interface.

**Contract**: Export an `ImageEngine` interface with an async `enhance` method and an engine id/label. Shape (signature contract other phases depend on):
```ts
export interface EnhanceResult { blob: Blob; width: number; height: number; mimeType: string; }
export interface ImageEngine {
  id: "local";
  enhance(source: HTMLImageElement | ImageBitmap, opts: { mimeType: string }): Promise<EnhanceResult>;
}
```

#### 2. Pure helpers

**File**: `src/lib/engines/image-helpers.ts`

**Intent**: House the side-effect-free logic that's cheap to unit-test: file validation, gamma LUT construction, and output filename derivation.

**Contract**: Export (a) `ACCEPTED_MIME_TYPES` / `MAX_FILE_BYTES` (25 MB) / `MAX_IMAGE_DIMENSION` constants mirroring F-01; (b) `validateImageFile(file): { ok: true } | { ok: false; code; message }` covering wrong-type (incl. friendly HEIC message) and oversize — **type + byte-size only**; pixel dimensions aren't knowable from a `File` here, so the `MAX_IMAGE_DIMENSION` check happens post-decode in the Phase 3 hook; (c) `buildGammaLut(gamma): Uint8ClampedArray` (256 entries); (d) `deriveDownloadName(originalName, mimeType): string` → `luminaclean-<base>.<ext>`. No DOM imports. Unit-tested in `tests/image-helpers.test.ts`.

#### 3. Local engine pipeline

**File**: `src/lib/engines/local-engine.ts`

**Intent**: Implement `ImageEngine` for the client-side Canvas pass — fixed gamma LUT + native Gaussian blur, full resolution.

**Contract**: `localEngine: ImageEngine`. `enhance` draws source to a canvas at native dimensions, applies `ctx.filter = "blur(<const>px)"` on draw, then applies the gamma LUT via `getImageData`/`putImageData`, and returns `canvas.toBlob` in the source mime (`deriveDownloadName` lives in the caller). Tunable constants (`GAMMA`, `BLUR_PX`) defined and commented as the deliberately-naive defaults. Assumes an already-validated, within-`MAX_IMAGE_DIMENSION` source — the hook enforces the dimension guard before calling `enhance`.

### Success Criteria

#### Automated Verification

- Pure-helper unit tests pass: `npx vitest run tests/image-helpers.test.ts` (scoped to this file — the full `npm run test` also runs the existing Supabase-dependent `jobs.rls.test.ts`, which needs `npx supabase start` + env per `tests/README.md`; not required for these pure helpers)
- Type checking passes: `npx astro check` (or `npm run build`)
- Lint passes on touched files: `npx prettier --write <touched> && npx eslint <touched>`

**Implementation Note**: After automated verification passes, proceed to Phase 2 (no manual step needed here).

---

## Phase 2: Reusable UI shell components

### Overview

Build the three standalone, prop-driven components S-03/S-04 will reuse. No engine logic inside them.

### Changes Required

#### 1. Image uploader

**File**: `src/components/enhance/ImageUploader.tsx`

**Intent**: File selection via click + drag-drop, running `validateImageFile`, surfacing inline errors in the codebase's dark theme.

**Contract**: Props `{ onAccepted(file, objectUrl): void; disabled?: boolean }`. Renders a drop zone + hidden `<input type="file" accept="image/jpeg,image/png">`. On select, validates and either calls `onAccepted` or shows the inline error (reuse `CircleAlert` error styling from `FormField.tsx`). Owns no enhancement state.

#### 2. Before/after slider

**File**: `src/components/enhance/BeforeAfterSlider.tsx`

**Intent**: The "wow moment" drag-reveal comparison (FR-011) — a custom component (shadcn slider is a range input, not an image comparator).

**Contract**: Props `{ beforeSrc: string; afterSrc: string; alt?: string }`. Two stacked images with a clip/position controlled by a draggable handle; pointer + keyboard accessible (arrow keys move the divider, `role="slider"`, `aria-valuenow`). Responsive to container width; usable at ≤400px portrait.

#### 3. Download button

**File**: `src/components/enhance/DownloadButton.tsx`

**Intent**: Trigger a browser download of the result blob with a derived filename.

**Contract**: Props `{ blob: Blob; filename: string; disabled?: boolean }`. Uses an object URL + temporary anchor; revokes the URL after click. Styled with the existing `Button` (`@/components/ui/button`).

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check` (or `npm run build`)
- Lint passes on touched files: `npx prettier --write <touched> && npx eslint <touched>`

#### Manual Verification

- Each component renders without console errors when integrated in Phase 3 (verified there).
- Slider handle is draggable by pointer and movable by keyboard arrows.

**Implementation Note**: Components are exercised end-to-end in Phase 3; pause for manual confirmation after Phase 3.

---

## Phase 3: Orchestration & page integration

### Overview

Wire engine + components via a hook and container, add the loading UX, and replace the home page so the tool is the landing experience.

### Changes Required

#### 1. Enhance hook

**File**: `src/components/hooks/useLocalEnhance.ts`

**Intent**: Own the flow state (source file/url, result, status, error) and orchestrate the engine with the spinner-paint yield. Extracted to `hooks/` per CLAUDE.md.

**Contract**: Returns `{ status: "idle"|"processing"|"done"|"error", sourceUrl, resultUrl, resultBlob, downloadName, error, onAccepted(file,url), enhance(), reset() }`. `enhance()` sets `processing`, yields a macrotask, decodes the source into an image, then — **before** calling `localEngine.enhance` — checks the decoded `width`/`height` against `MAX_IMAGE_DIMENSION`; if exceeded, sets `status: "error"` with a **specific, user-visible** `error` message (e.g. "This photo is too large to process in your browser (max N×N px) — try a smaller copy."). On success, calls `localEngine.enhance`, builds the result object URL + `deriveDownloadName`. Every decode/engine failure is caught and mapped to a concrete user-facing `error` string — never a raw exception or a generic "something went wrong". Revokes prior object URLs on replace/reset.

#### 2. Workspace container

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: The single React island composing uploader → enhance action (with spinner) → slider → download from the hook.

**Contract**: Default-exported component using `useLocalEnhance`. Before a source is loaded: show `<ImageUploader>`. After: show source preview + an "Enhance" button (disabled while processing, spinner reusing `SubmitButton`'s markup). After done: show `<BeforeAfterSlider>` + `<DownloadButton>` + a "Start over" reset. Errors surfaced inline.

#### 3. Home page replacement

**File**: `src/pages/index.astro`

**Intent**: Make the tool the landing page with a slim value-prop header, retiring the starter `Welcome` hero from `/`.

**Contract**: Render `<Layout title="LuminaClean AI — fix your night photos">` with all content wrapped in a `bg-cosmic min-h-screen text-white` container — the dark theme is applied **per-page**, not on `body` (which is light `bg-background`), so the reused `bg-white/10` component surfaces need this backdrop to be legible (mirrors `dashboard.astro:8`, `auth/signin.astro:9`). Inside the wrapper: a compact heading/subhead and `<EnhanceWorkspace client:load />`. `Welcome.astro` is left in the repo (not deleted) but no longer referenced by `/`.

### Success Criteria

#### Automated Verification

- Pure-helper unit tests pass: `npx vitest run tests/image-helpers.test.ts` (this change adds no Supabase-dependent tests; the full `npm run test` still needs local Supabase for `jobs.rls.test.ts`)
- Production build succeeds: `npm run build`
- Lint passes on touched files: `npx prettier --write <touched> && npx eslint <touched>`

#### Manual Verification

- Upload a representative night JPG on desktop → Enhance → result is visibly brighter & less noisy, appears within ~2s.
- Before/after slider drag reveals the comparison; keyboard arrows move the divider.
- Download produces a file in the source format that opens correctly at full resolution.
- PNG upload works; HEIC upload shows the friendly convert message; >25 MB and wrong-type files show inline errors.
- Usable at mobile-portrait width (≤400px): controls reachable, slider works, no horizontal scroll.
- Spinner is visible during processing (does not appear frozen).

**Implementation Note**: After automated verification passes, pause for human manual-testing confirmation before considering the slice done.

---

## Testing Strategy

### Unit Tests (Vitest)

Tests live in `tests/image-helpers.test.ts` (vitest `environment: node`, `include: tests/**/*.test.ts`). Only the **pure** helpers are unit-tested — deliberately isolated from the canvas pipeline so they need no DOM (`File`/`Blob`/`Uint8ClampedArray` are Node 22 globals); the Canvas render path is verified manually.

- `validateImageFile`: accepts JPG/PNG within limits; rejects HEIC (friendly message), oversize, and wrong types with correct `code`s.
- `buildGammaLut`: monotonic, clamped 0–255, endpoints correct, length 256.
- `deriveDownloadName`: correct base + extension per source mime; sanitizes odd original names.

### Manual Testing Steps

1. `npm run dev`, open `/`, upload a night photo, click Enhance, confirm visible improvement within ~2s.
2. Drag the slider and use arrow keys; confirm reveal works both ways.
3. Download; open the file; confirm full-resolution, source format.
4. Try a PNG, a HEIC (expect reject message), a >25 MB file, and a `.txt` renamed to `.jpg` mime mismatch.
5. Resize to ~390px width (devtools mobile) and repeat the core flow.

## Performance Considerations

Full-res main-thread processing: native `ctx.filter` blur is GPU-backed; the gamma LUT is one linear pass. The `MAX_IMAGE_DIMENSION` guard rejects pathological inputs that would blow the budget or OOM mobile tabs. The pre-pass macrotask yield keeps the spinner responsive. No downscaling of accepted images (preserves download quality).

## Migration Notes

None — no data, no schema. `Welcome.astro` is retained but unreferenced from `/`.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (US-02; FR-001/005/008/011/012)
- Validation constants source: `supabase/migrations/20260528120100_create_photos_storage.sql`
- Pending-spinner pattern: `src/components/auth/SubmitButton.tsx:20-23`
- Island hydration pattern: `src/pages/auth/signin.astro:16`
- Lesson (Windows lint baseline): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine seam & processing logic

#### Automated

- [x] 1.1 Unit tests for validateImageFile / buildGammaLut / deriveDownloadName pass
- [x] 1.2 Type checking passes (astro check / build)
- [x] 1.3 Lint passes on touched files

### Phase 2: Reusable UI shell components

#### Automated

- [x] 2.1 Type checking passes
- [x] 2.2 Lint passes on touched files

#### Manual

- [x] 2.3 Components render without console errors (verified in Phase 3)
- [x] 2.4 Slider draggable by pointer and movable by keyboard

### Phase 3: Orchestration & page integration

#### Automated

- [x] 3.1 All unit tests pass
- [x] 3.2 Production build succeeds
- [x] 3.3 Lint passes on touched files

#### Manual

- [x] 3.4 Night JPG enhances with visible improvement within ~2s
- [x] 3.5 Before/after slider reveal works (pointer + keyboard)
- [x] 3.6 Download is full-res in source format
- [x] 3.7 PNG works; HEIC rejected with message; oversize/wrong-type show inline errors
- [x] 3.8 Usable at ≤400px mobile portrait
- [x] 3.9 Spinner visible during processing
