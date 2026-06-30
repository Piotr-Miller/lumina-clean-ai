# Enhance-flow UX fixes — Plan Brief

> Full plan: `context/changes/enhance-ux-fixes/plan.md`

## What & Why

Four small post-MVP UX fixes on the enhance flow (separate from S-12): friendlier cloud error messages, a one-click recovery for alpha-PNG failures, a sticky nav, and a refresh guard. Today users see raw model/provider errors, lose the nav on scroll, and can drop work with an accidental refresh.

## Starting Point

The cloud failure path records `error_code` + `error_message` but **only `error_message` reaches the browser**; the single place that renders failure copy is `deriveDisplayError` (`cloud-job-decisions.ts:79`), which shows the raw string verbatim. The global nav (`Nav.astro`) is in normal flow (no sticky). `EnhanceWorkspace` is the single enhance island and holds all the in-progress state.

## Desired End State

A Replicate 429 shows "Cloud AI is busy — try again shortly / use Local". An alpha PNG that fails Bread shows a friendly explanation **and** a "Convert to RGB and try again" button that flattens to RGB JPEG and re-submits (job then succeeds). The top nav stays pinned on scroll. Refresh/close with work in progress triggers the browser's native leave-confirmation.

## Key Decisions Made

| Decision          | Choice                                                                          | Why                                                                   | Source   |
| ----------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| #3 detect/map 429 | Edge sets `provider_rate_limited` → thread `error_code` to client → map by code | Clean semantics + telemetry; user chose it over string-match          | Plan     |
| #5 RGBA recovery  | Friendly message **+** "Convert to RGB and retry" button (flatten→resubmit)     | Reactive recovery, not silent prevention                              | Plan     |
| #5 detect         | String-match torch signature in `error_message`                                 | `error_code` is generic `replicate_failed`; signature only in message | Research |
| #2 guard scope    | `beforeunload` when a photo is loaded OR cloud job processing                   | Simplest; catches the common "lose my upload/result" case             | Plan     |
| #4 nav            | `sticky top-0 z-50` on `Nav.astro` `<header>` (global)                          | One-liner, stays in flow → no offset; standard sticky nav             | Research |

## Scope

**In scope:** provider-429 friendly copy (Edge `error_code` + client thread + map); RGBA detection + friendly copy + flatten helper + convert-and-retry button; sticky global nav; `beforeunload` guard.

**Out of scope:** state persistence across refresh; proactive RGBA flattening; daily-cap 429 (already friendly); DE/PL i18n (separate slice); any redesign of nav/failed-state UI.

## Architecture / Approach

`deriveDisplayError` stays the one chokepoint for failure copy — Phase 1 threads `error_code` through `useCloudJob` (watchdog-sensitive: passthrough only) and maps `provider_rate_limited`; Phase 2 adds an `isRgbaAlphaError` string-match + a `canvas-helpers` flatten util + a re-submit button in the failed block. The converted file must go through the SAME accept seam as a normal upload (`enhancer.onAccepted(...)` plus `setSourceFile(...)`) before the pending-flag re-submit, so preview/local/cloud stay aligned. Phase 3 is two isolated client tweaks.

## Phases at a Glance

| Phase                         | What it delivers                                     | Key risk                                                                                   |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Provider-429 message       | Edge `error_code` + client threading + friendly copy | Touching the watchdog-sensitive `useCloudJob` (keep to passthrough); `deno check --config` |
| 2. RGBA flatten + retry       | Friendly copy + flatten helper + convert-and-retry   | Re-submit sequencing (`submit` memoized on `[file]`); DOM-only flatten = manual test       |
| 3. Sticky nav + refresh guard | Sticky `Nav.astro`; `beforeunload` warning           | Lowest risk; mostly build + manual                                                         |

**Prerequisites:** local Supabase stack for Phase-1/2 manual cloud testing; the live cloud pipeline (token/tunnel) only if you want to drive a real 429/RGBA end-to-end (otherwise the unit tests pin the mappings).
**Estimated effort:** ~1–2 sessions across 3 phases (most weight in Phase 2).

## Open Risks & Assumptions

- Forcing a real provider **429** locally is impractical — Phase-1 manual is "verify the rendered copy" (unit test is the contract).
- RGBA `error_message` is truncated to 300 chars — detection matches an early substring to stay robust.
- The re-submit-after-flatten effect must avoid the `react-hooks/set-state-in-effect` pitfall (same class as S-12 Phase 2).

## Success Criteria (Summary)

- A 429 and an alpha-PNG failure both show friendly, actionable copy (the PNG one with a working convert-and-retry).
- The nav stays pinned on scroll across pages.
- An accidental refresh with work in progress is caught by the native leave-prompt; an empty workspace isn't.
