# Enhance-flow UX fixes Implementation Plan

## Overview

A batch of four post-MVP UX fixes on the enhance flow (separate from S-12):

1. **Provider-429 friendly message** — a Replicate rate-limit (429) currently shows the raw `Replicate predictions.create failed (429): …` string; replace it with friendly copy.
2. **RGBA recovery** — an alpha PNG fails Bread with `Input size must have a shape of (*, 3, H, W). Got torch.Size([1, 4, 96, 96])`; show a friendly message **plus** a "Convert to RGB and try again" button that flattens alpha → RGB client-side and re-submits.
3. **Sticky nav** — the global top nav scrolls away; make it stick.
4. **Refresh guard** — an accidental page refresh silently drops in-progress work; warn via `beforeunload`.

## Current State Analysis

- **Cloud failure path:** the Edge Function records failures via `markJobFailed` (`error_code` + `error_message`), but **only `error_message` reaches the browser** — `useCloudJob` selects `status, result_path, error_message` (`useCloudJob.ts:63,217,261`); `error_code` (in the `jobs` row, `types.ts:29`) is never propagated. The single chokepoint that turns a failed row into user-facing copy is `deriveDisplayError` (`cloud-job-decisions.ts:79-85`), which today returns `error_message ?? GENERIC` verbatim.
  - 429 on prediction-create: `enhance/index.ts:394-397` throws with the status only in the message; the `/start` catch (`:432`) writes `error_code: "start_failed"`. The HTTP 429 is not a distinct code today.
  - RGBA/torch failure: a Replicate **prediction** error → `/callback` → `mapPredictionToOutcome` `case "failed"` (`replicate-webhook.ts:185-187`) → `error_code: "replicate_failed"`, `error_message` = serialized provider error (truncated to 300 chars, `replicate-webhook.ts:24`). The torch signature sits near the front of that text.
- **Cloud submit/result UI:** `EnhanceWorkspace.tsx` is the single enhance island. The `cloudPhase === "failed"` block (`:385-399`) renders "Try again" (`cloudSubmit.submit(breadParams)`) + "Start over". `sourceFile` is held at `:80` and passed to `useCloudSubmit(sourceFile)`; `submit` is `useCallback`-memoized on `[file]` (`useCloudSubmit.ts:36-61`). The visible source preview / before-side baseline are a SEPARATE authority: `sourceUrl` comes from `useLocalEnhance` and only changes through `enhancer.onAccepted(file, objectUrl)` (`EnhanceWorkspace.tsx:198-200`, `useLocalEnhance.ts:69-82`).
- **Canvas helpers:** `canvasToBlob` + `JPEG_QUALITY` exist (`canvas-helpers.ts:12,18-32`); **no RGB-flatten helper yet**. The local engine's canvas-encode preserves alpha (doesn't flatten).
- **Nav:** the global header is `src/components/Nav.astro` (rendered by `Layout.astro:23` on every page), in normal flow — **no** `sticky`/`fixed`/`z-*`. The `/dashboard` page has no nav of its own.
- **No `z-*`/sticky conventions exist anywhere in `src/`** — `z-50` is safe and sets the convention.

Full grounding in the two research sub-agent reports (cloud-failure path + nav layout), summarized above.

## Desired End State

- A provider 429 shows: _"Cloud AI is busy right now — please try again in a moment, or switch to the Local engine."_
- An alpha-PNG cloud failure shows a friendly explanation **and** a "Convert to RGB and try again" button; clicking it flattens the source to an opaque RGB JPEG and re-submits — the job then succeeds.
- The top nav stays pinned while scrolling on every page.
- Refreshing/closing the tab with a loaded photo or an in-flight cloud job triggers the browser's native "leave site?" confirmation.

### Key Discoveries

- `deriveDisplayError` (`cloud-job-decisions.ts:79`) is the one place to map failures to friendly copy — pure + already unit-tested (`tests/cloud-job-decisions.test.ts`).
- `error_code` must be threaded through `useCloudJob` (SELECT + payload pick + `applyStatus` signature) to be usable client-side — the hook is **watchdog-sensitive**, so touch only the passthrough, never the budget/catch-up logic.
- The RGBA signature lives **only in `error_message`** → string-match is required there (match an early substring to survive the 300-char truncation).
- Flatten = white-filled opaque canvas → `drawImage` → encode `image/jpeg` (JPEG has no alpha) via the existing `canvasToBlob` + `JPEG_QUALITY`.
- `Nav.astro` sticky is a one-liner; `sticky` stays in flow → no body offset / content jump.

## What We're NOT Doing

- No persistence/restore of state across refresh (`File`/object-URLs can't survive a reload — the guard is the fix, not recovery).
- No proactive RGBA flattening on every upload — recovery is reactive (button on failure), per decision.
- No change to the daily-cap 429 (`daily_cap_reached`, create-job) — that already has friendly copy; this is the **provider** 429 (Replicate).
- No DE/PL localization (#7) — separate i18n slice.
- No redesign of the nav or the failed-state UI beyond the additions above.

## Critical Implementation Details

- **Edge Function is Deno, outside tsc/eslint** — after the Phase-1 edit run `deno check --config supabase/functions/enhance/deno.json supabase/functions/enhance/index.ts` (the `--config` flag is required; lessons.md / `deno-check-needs-config-flag`). Keep `index.ts` Web-API-only.
- **`useCloudJob` is the Realtime watchdog** — adding `error_code` must not alter the catch-up read / budget / terminal-guard logic; it's a pure passthrough into `applyStatus`.
- **RGBA detection is truncation-safe** — match an early, stable substring (e.g. `shape of (*, 3` or `torch.Size([1, 4`), not the full message (capped at 300 chars).
- **Flatten → re-submit sequencing** — `useCloudSubmit.submit` closes over `[file]`, so after conversion the new file must update BOTH source authorities before the retry: mint an object URL for the converted JPEG, call `enhancer.onAccepted(flattenedFile, objectUrl)` (keeps preview/local-engine state aligned), then `setSourceFile(flattenedFile)` (feeds `useCloudSubmit`), then set a `pendingResubmit` flag. An effect (deps include `sourceFile`) fires `cloudSubmit.submit(breadParams)` once the new file has propagated, then clears the flag. Watch the `react-hooks/set-state-in-effect` rule (as in S-12 Phase 2) — keep the trigger flag-guarded.
- **DOM-only code isn't node-unit-testable** — `flattenToRgbJpeg` (canvas) and the `beforeunload` effect are verified manually; the pure pieces (`deriveDisplayError`, `isRgbaAlphaError`) carry the unit coverage.
- **Windows CRLF baseline** — lint only touched files (`npx prettier --write` then `npx eslint <touched>`); don't run repo-wide `lint:fix` (lessons.md).

## Phase 1: Provider-429 friendly message

### Overview

Detect a Replicate 429 in the Edge Function, give it a dedicated `error_code`, thread `error_code` to the client, and map it to friendly copy in `deriveDisplayError`.

### Changes Required

#### 1. Pure 429 classifier (shared, unit-testable) + Edge Function wiring

**File**: `src/lib/services/replicate-webhook.ts` (helper) + `supabase/functions/enhance/index.ts` (call site)

**Intent**: Classify a prediction-create failure by HTTP status into a dedicated `error_code`, in a pure helper that vitest can prove directly — `deno check` only proves the Edge Function compiles, not that the 429 branch classifies correctly (Codex F2).

**Contract**: Add a pure, dependency-free `classifyStartFailure(status: number): "provider_rate_limited" | "start_failed"` to `src/lib/services/replicate-webhook.ts` (already shared across the Deno boundary + unit-tested). In `enhance/index.ts`, at the non-2xx branch (`:394-397`) / the `/start` catch (`:417-437`), set the `markJobFailed` `errorCode` from `classifyStartFailure(predictionRes.status)` (429 → `provider_rate_limited`, else `start_failed`); keep an informative `error_message`. Web-API-only; re-run `deno check --config …`. Unit-test the classifier in `tests/replicate-webhook.test.ts` (429 → `provider_rate_limited`; 500/other → `start_failed`) — the automated proof of the server-side classification.

#### 2. Thread `error_code` to the client

**File**: `src/components/hooks/useCloudJob.ts`

**Intent**: Make `error_code` available in the browser so the message map can key off it.

**Contract**: Add `error_code` to the `JobUpdateRow` pick (`:63`), the catch-up SELECT (`:217`), and the `applyStatus` call/signature (`:194,:261`); expose the current `errorCode` (or feed it directly into the display-error derivation). No change to watchdog/budget/terminal-guard logic.

#### 3. Map the code to friendly copy

**File**: `src/components/hooks/cloud-job-decisions.ts`

**Intent**: Turn `provider_rate_limited` into user-facing copy at the single chokepoint.

**Contract**: Extend `deriveDisplayError` (`:79-85`) to accept the `error_code` and return a friendly string for `provider_rate_limited` (e.g. _"Cloud AI is busy right now — please try again in a moment, or switch to the Local engine."_); fall back to existing behavior otherwise.

#### 4. Unit test

**File**: `tests/cloud-job-decisions.test.ts`

**Intent**: Pin the new mapping.

**Contract**: Assert a failed row with `error_code: "provider_rate_limited"` → the friendly 429 message; unrelated codes unchanged.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes (touched files): `npx eslint <touched>`
- Unit tests pass: `npm run test:unit` (`classifyStartFailure`: 429→provider_rate_limited / else→start_failed; cloud-job-decisions: 429 mapping)
- Edge Function checks: `deno check --config supabase/functions/enhance/deno.json supabase/functions/enhance/index.ts`
- SSR build succeeds: `npm run build`

#### Manual Verification

- A `provider_rate_limited` failure renders the friendly 429 copy in the cloud failed-state UI (forcing a real 429 is impractical — verify the rendered copy by temporarily stubbing the code, or accept the unit test as the contract).

**Implementation Note**: Pause for manual confirmation after automated checks pass before Phase 2.

---

## Phase 2: RGBA detect + flatten + retry

### Overview

Recognize the RGBA/torch failure, show friendly copy + a "Convert to RGB and try again" button, and implement the client-side flatten + re-submit.

### Changes Required

#### 1. Detect the RGBA failure + friendly copy

**File**: `src/components/hooks/cloud-job-decisions.ts`

**Intent**: Recognize the alpha-channel failure from its `error_message` signature and surface both a friendly message and a boolean the UI can gate the convert button on.

**Contract**: Add `isRgbaAlphaError(errorMessage: string | null): boolean` (truncation-safe substring match on the torch signature) and, in `deriveDisplayError`, return friendly copy when it matches (e.g. _"This PNG has a transparency layer the cloud model can't read. Convert it to RGB and try again."_). Export `isRgbaAlphaError` for the hook/UI.

#### 2. Expose the flag from the job hook

**File**: `src/components/hooks/useCloudJob.ts`

**Intent**: Let the workspace know the failure is the RGBA case without re-parsing the (now friendly) display string.

**Contract**: Compute and expose `isRgbaError: boolean` from the raw `error_message` via `isRgbaAlphaError`.

#### 3. RGB-flatten helper

**File**: `src/lib/engines/canvas-helpers.ts`

**Intent**: Convert a (possibly alpha) image File to an opaque RGB JPEG File.

**Contract**: `flattenToRgbJpeg(file: File): Promise<File>` — decode → draw onto a canvas pre-filled opaque white (`fillRect` before `drawImage`) → `canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY)` → return a new `File` (`type: "image/jpeg"`, name with `.jpg`). DOM-dependent (lives beside `canvasToBlob`).

#### 4. Convert-and-retry button + re-submit

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: In the cloud failed block, when the failure is the RGBA case, offer a button that flattens the source and re-submits.

**Contract**: In the `cloudPhase === "failed"` block (`:385-399`), when `cloudJob.isRgbaError`, render "Convert to RGB and try again". Handler: `flattenToRgbJpeg(sourceFile)` → mint a new object URL for the converted JPEG → `enhancer.onAccepted(newFile, newObjectUrl)` + `setSourceFile(newFile)` via the SAME accept seam the uploader uses → set a `pendingResubmit` flag; an effect (deps include `sourceFile`) calls `cloudSubmit.submit(breadParams)` once the new file has propagated, then clears the flag (see Critical Implementation Details — sequencing + `set-state-in-effect`). Keep the existing "Try again" / "Start over" buttons.

#### 5. Unit test

**File**: `tests/cloud-job-decisions.test.ts`

**Intent**: Pin RGBA detection + copy.

**Contract**: Assert the torch signature (and a truncated variant) → `isRgbaAlphaError` true + friendly copy; a normal error → false + unchanged.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes (touched files): `npx eslint <touched>`
- Unit tests pass: `npm run test:unit` (`isRgbaAlphaError` + RGBA message)
- SSR build succeeds: `npm run build`

#### Manual Verification

- Upload an **alpha PNG** via Cloud AI → job fails → friendly RGBA copy + "Convert to RGB and try again" appears; clicking it flattens to RGB JPEG and re-submits, and the job then succeeds.
- A non-RGBA cloud failure shows the normal message with **no** convert button.
- No regression to the normal cloud submit → Realtime → result → download flow.

**Implementation Note**: Pause for manual confirmation after automated checks pass before Phase 3.

---

## Phase 3: Sticky nav + refresh guard

### Overview

Two small, independent client-side fixes: pin the global nav, and warn on unload when work is in progress.

### Changes Required

#### 1. Sticky nav

**File**: `src/components/Nav.astro`

**Intent**: Keep the global top nav visible while scrolling.

**Contract**: Add `sticky top-0 z-50` to the `<header>` class list (`:9`); bump the background to a slightly more opaque value (e.g. `bg-white/10`) so scrolled content reading through stays legible. No body offset (sticky stays in flow). Applies globally (every page).

#### 2. `beforeunload` guard

**File**: `src/components/enhance/EnhanceWorkspace.tsx` (optionally a tiny `src/components/hooks/useBeforeUnloadWarning.ts`)

**Intent**: Trigger the browser's native leave-confirmation when there's in-progress work.

**Contract**: Compute `workInProgress = sourceUrl !== null || cloudPhase === "processing"`. In a `useEffect` keyed on that boolean, add/remove a `beforeunload` listener that calls `e.preventDefault()` and sets `e.returnValue = ""`. Clean up on unmount / when the flag clears.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes (touched files): `npx eslint <touched>`
- SSR build succeeds: `npm run build`

#### Manual Verification

- The top nav stays pinned while scrolling on `/dashboard` and on a tall page (e.g. the enhance flow with a result).
- With a photo loaded or a cloud job in flight, refreshing/closing the tab shows the native "Leave site?" prompt; on an empty workspace there is **no** prompt.

**Implementation Note**: Pause for manual confirmation after automated checks pass.

---

## Testing Strategy

### Unit Tests

- `deriveDisplayError`: `provider_rate_limited` → friendly 429 copy (Phase 1); RGBA torch signature (full + truncated) → `isRgbaAlphaError` true + friendly copy; unrelated codes/messages unchanged.

### Manual Testing Steps

1. Provider 429 → friendly copy (Phase 1).
2. Alpha PNG → cloud fail → friendly RGBA copy + Convert button → convert → re-submits as RGB JPEG → succeeds (Phase 2).
3. Scroll any page → nav stays pinned (Phase 3).
4. Refresh with work in progress → native leave-prompt; refresh on empty workspace → no prompt (Phase 3).

## Performance Considerations

Negligible — one extra canvas decode/encode on the explicit convert action; the `beforeunload` listener is attached only while work is in progress.

## References

- Change identity + locked scope: `context/changes/enhance-ux-fixes/change.md`
- Cloud failure path grounding: `enhance/index.ts:394-397,432,577-580`, `replicate-webhook.ts:185-187`, `cloud-job-decisions.ts:79-85`, `useCloudJob.ts:63,217,261`
- RGBA memory: `bread-rejects-rgba-input`
- Nav: `src/components/Nav.astro:8-10`, `src/layouts/Layout.astro:23`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Provider-429 friendly message

#### Automated

- [x] 1.1 Type checking passes
- [x] 1.2 Linting passes (touched files)
- [x] 1.3 Unit tests pass (`classifyStartFailure` 429-classification + cloud-job-decisions: 429 mapping)
- [x] 1.4 `deno check --config …/deno.json …/enhance/index.ts` passes
- [x] 1.5 SSR build succeeds

#### Manual

- [x] 1.6 `provider_rate_limited` failure renders the friendly 429 copy — closed on the unit-test contract (`replicate-webhook.test.ts:238` classifier + `cloud-job-decisions.test.ts:104` mapping); real-429 forcing impractical per plan §1 Manual Verification

### Phase 2: RGBA detect + flatten + retry

#### Automated

- [ ] 2.1 Type checking passes
- [ ] 2.2 Linting passes (touched files)
- [ ] 2.3 Unit tests pass (`isRgbaAlphaError` + RGBA message)
- [ ] 2.4 SSR build succeeds

#### Manual

- [ ] 2.5 Alpha PNG → friendly RGBA copy + Convert button → convert re-submits as RGB JPEG → succeeds
- [ ] 2.6 Non-RGBA failure shows normal message, no convert button; no regression to normal cloud flow

### Phase 3: Sticky nav + refresh guard

#### Automated

- [ ] 3.1 Type checking passes
- [ ] 3.2 Linting passes (touched files)
- [ ] 3.3 SSR build succeeds

#### Manual

- [ ] 3.4 Nav stays pinned while scrolling (`/dashboard` + a tall page)
- [ ] 3.5 `beforeunload` prompts with work in progress; no prompt on an empty workspace
