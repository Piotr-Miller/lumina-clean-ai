# Enhance Screen UI Refresh — Implementation Plan

## Overview

A visual-only, premium restyle of the Enhance screen (`/`) driven through a **Claude Design screen kit**: 2–3 full-view direction boards are pushed to a claude.ai/design project via the `DesignSync` tool, the user picks a winner there, state cards are produced for the winning direction, and only then is the design translated into code (Tailwind 4 + shadcn/ui + a few local CSS variables). Bundled in: **i18n-readiness** — all user-facing copy of the Enhance surface is extracted into a single strings module (values preserved verbatim) so the later DE/PL localization slice edits one file. No auth/cloud logic, no upload/enhance behavior changes — we restyle, we don't rewire.

## Current State Analysis

- **Two parallel visual systems** coexist: (1) the stock shadcn "new-york" token layer in `src/styles/global.css` — a light-default neutral OKLCH palette whose `.dark` block is **never activated** (dead code); (2) a hand-painted "cosmic dark" look — `bg-cosmic` gradient (`linear-gradient(to bottom, #0a0e1a, #0f1529, #0a0e1a)`, `global.css:113–115`), `white/NN` translucency utilities, `purple-300` accents. A stock `<Button>` default renders near-black (`--primary: oklch(0.205 0 0)`) on the gradient — that's today's CTA look.
- **No fonts**: pure system stack, zero `@font-face`, no web-font links. No `tailwind.config.*` (Tailwind 4 CSS-first via `@tailwindcss/vite`).
- **Component tree** (all in scope): `src/pages/index.astro` (hero shell, island boundary `<EnhanceWorkspace client:load>` at `:46`) → `src/components/enhance/EnhanceWorkspace.tsx` (549 lines, owns all state) composing `EngineToggle.tsx`, `ImageUploader.tsx`, `BeforeAfterSlider.tsx`, `CloudSignInPrompt.tsx`, `DownloadButton.tsx`, `ParameterPanel.tsx` (+ `param-panel-helpers.ts`), with hooks `useLocalEnhance`, `useCloudSubmit`, `useCloudJob` (+ `cloud-job-decisions.ts`), `useDebouncedValue`, `useBeforeUnloadWarning`. Only two shadcn primitives in play: `ui/button.tsx`, `ui/slider.tsx` (both stock).
- **Strings**: ~65 hardcoded user-visible strings across the component tree + ~12 error messages in `src/lib/engines/image-helpers.ts`, `src/lib/services/cloud-upload.client.ts`, and `src/components/hooks/cloud-job-decisions.ts`. No strings module exists; the nearest pattern is per-file message consts.
- **Recurring hardcoded style tokens**: glass panel `rounded-xl border border-white/15 bg-white/5`, the `SECONDARY_BUTTON` recipe duplicated in `EnhanceWorkspace.tsx:34` and `ParameterPanel.tsx:38` (and inline in `CloudSignInPrompt.tsx:26`), spinner `border-white/30 border-t-white`, errors `text-red-300`, slider dark-theming via `[&_[data-slot=slider-range]]:bg-white` (`ParameterPanel.tsx:100–102`).

## Desired End State

The Enhance screen has a distinctive, premium dark look implemented from an approved Claude Design screen kit; the kit (boards + state cards) lives in a claude.ai/design project as the durable record of the direction. All user-facing copy of the Enhance surface lives in one strings module with byte-identical values. All E2E specs pass unchanged; no network/logic behavior differs.

Verification: local Playwright gate green (`npm run test:e2e` per `context/foundation/test-plan.md` §6.3), visual parity with the approved cards confirmed on `npm run build && npx wrangler dev`, desktop and mobile widths.

### Key Discoveries:

- E2E locator contract — exact strings/roles the specs assert (see Critical Implementation Details); sources: `index.astro:40`, `ImageUploader.tsx:69`, `EnhanceWorkspace.tsx:356,411,496,542`, `EngineToggle.tsx:22,51`, `BeforeAfterSlider.tsx:58,87`, `CloudSignInPrompt.tsx:14`, `DownloadButton.tsx:33`, `cloud-job-decisions.ts:8`.
- Cost-safety HARD invariant (S-12 plan): no slider drag / Auto toggle / recalculate may issue a network request; the only paid path is the explicit "Process with Cloud AI" / "Try again" submit (`EnhanceWorkspace.tsx:399,476`).
- S-12 layout contract: two-column `md:grid-cols-[minmax(0,1fr)_320px]` (`EnhanceWorkspace.tsx:312`), panel stacks below image `< md`; container `max-w-5xl` (`:304`). Panel values stay visible and editable on mobile.
- PR #83 additions to preserve: provider-429 friendly copy, RGBA "Convert to RGB and try again" button + "Converting…" state (`EnhanceWorkspace.tsx:449–469`), `useBeforeUnloadWarning` guard.
- `index.astro:24–34` carries the local/CI-only `?chroma=1` seam — the `chromaEnabled` prop threading must survive the shell restyle.
- Astro island CSS: new design tokens are most reliably added in `src/styles/global.css` (the island is a separate client bundle; scoped `<style>` in `index.astro` won't reach island DOM unless vars sit on a wrapping element).
- `LibBadge.astro`, `card`/`input`/`dialog` shadcn components: not installed/used on this screen.
- **Brand key visual available**: `context/changes/enhance-ui-refresh/design-kit/assets/LCAI.jpg` (1024×1024, ~196 KB) — night cityscape split before/after by a violet→cyan divider, with the LC logo, "FROM NOISE TO PERFECTION." headline, and feature icons **baked into the pixels**. It anchors the palette (near-black / violet / cyan / neon-pink) and the before-after divider motif; the baked-in text constrains how it can be placed (see Critical Implementation Details).

## What We're NOT Doing

- No changes to `/dashboard`, `/auth/*`, `Nav.astro`, `Layout.astro` (except, if the winning direction requires font preload, a minimal additive head seam — see Phase 4, flagged).
- No global design-token system / theme layer — local CSS variables only (per change.md).
- No actual DE/PL translations, no i18n framework/library — extraction only.
- No logic changes: state machine, hooks, watchdogs, cost paths, validation, chroma post-pass exposure — untouched.
- No new screens, no light-mode toggle, no dark-mode `.dark` activation work.
- No pixel-snapshot test infrastructure (deliberate: one screen, deterministic tools disproportionate here).

## Implementation Approach

Design decisions are made **on previews in claude.ai/design, not in code**. Phase 1 pushes 2–3 dark-first direction boards (self-contained HTML, each with its own typography proposal) to a new Claude Design project via `DesignSync`; the user picks a winner in the claude.ai/design UI. Phase 2 (independent — can proceed while the user reviews) extracts all strings. Phase 3 expands the winner into ~8 state cards covering every E2E-visible state. Phase 4 translates the approved kit into code behind the frozen E2E/UX contract. Phase 5 runs the full local gate.

> **Provisional decisions (user was AFK at question time — confirm before Phase 1):** dark-first for all 3 boards; web fonts allowed (max 1–2 self-hosted families); full ~8-state card set; strings module covers the whole Enhance surface incl. `src/lib` error copy; full verification gate incl. local E2E. The 5-phase structure itself is also unconfirmed.

## Critical Implementation Details

- **E2E locator contract (freeze list)** — these exact accessible names/roles/texts must be byte-identical after the restyle and after string extraction: heading `"Fix your night photos"`; label `"Upload an image"`; buttons `"Enhance"`, `"Process with Cloud AI"`, `"Download"`, `"Try again"`, `"Start over"`, `"Cloud AI"` inside group `"Processing engine"`; text `"Enhancing in the cloud…"`; `role="alert"` with `"Cloud processing took too long. Please try again."`; slider `aria-label` `"Before and after comparison — drag or use arrow keys to compare"`; img name `"Your photo — enhanced"` whose `src` stays a `blob:` URL; heading `"Sign in to use Cloud AI"` (anon gate).
- **DesignSync contract**: required ordering is list/read → `finalize_plan` (locks paths + localDir) → `write_files`/`delete_files`. Cards are self-contained HTML with a first-line `<!-- @dsCard group="…" -->` marker; no external fetches (embed the proposed font as a base64 data-URI `@font-face` inside each board). The first call may prompt to add design scopes to the claude.ai login (`/design-login` fallback).
- **Preview runtime, not dev server**: verify island rendering against `npm run build && npx wrangler dev` — `npm run dev` has the known dev-only "more than one copy of React" crash on this page (lessons.md; issue #15).
- **Windows lint baseline**: treat lint as "no NEW errors from touched files" — `npx prettier --write <touched>` then `npx eslint <touched>`; never repo-wide `lint:fix` (lessons.md).
- **String extraction must not churn tests**: `tests/cloud-job-decisions.test.ts` (and E2E) import/assert existing message consts. `cloud-job-decisions.ts`, `image-helpers.ts`, `cloud-upload.client.ts` should import values from the strings module and **re-export under their existing names**, so no test or consumer import changes.
- **Key-visual usage rules**: the JPG has marketing copy, logo, and icons baked in — never use it full-frame as a page/app background behind live UI (duplicated messaging, visual noise, contrast hazards for `role="alert"` text). Allowed treatments: (a) text-free crops (right-side cityscape, bottom reflections) as hero/idle-state backdrop under a ≥60% dark gradient overlay; (b) the full graphic as the marketing visual of the **pre-upload (landing/idle) state only**; (c) palette extraction — the violet→cyan divider gradient as the accent thread (`--lc-accent-*`). Shipped derivatives are optimized crops (WebP/AVIF + JPG fallback) generated into `public/images/` in Phase 4 — never the raw 1024² JPG as-is if only a crop is shown. Foreground text must not sit on busy neon regions without an overlay.

## Phase 1: Direction Boards → Claude Design

### Overview

Author 2–3 dark-first, full-view direction boards for the Enhance screen and push them to a new Claude Design project. The user picks the winning direction in claude.ai/design. Load the `frontend-design` skill before authoring — boards must read as intentional design, not template output.

### Changes Required:

#### 1. Direction boards (local bundle, then push)

**File**: `context/changes/enhance-ui-refresh/design-kit/boards/direction-{a,b,c}.html` (repo-local working copies; pushed to the Claude Design project as `boards/direction-*.html`)

**Intent**: Three self-contained HTML boards, each rendering the same representative Enhance state (photo loaded, parameter panel, before/after result, CTA row) in a distinct premium-dark direction with its own typography proposal. Suggested axes — A: evolved cosmic (deeper near-black, refined glass, restrained violet, editorial display type); B: photographic darkroom (neutral charcoal, warm amber accent, hairline precision, technical labels); C: high-contrast nocturne (pure blacks, single electric accent, strong grotesk, flat surfaces). Real copy from the strings inventory, real layout proportions (max-w-5xl, 320px panel), a mobile-width strip on each board.

**Contract**: Each file is fully self-contained (inline CSS, data-URI font subsets, imagery embedded as base64 — no external requests) and starts with `<!-- @dsCard group="Boards" -->`. All three boards anchor to the LCAI.jpg brand palette (near-black base, violet→cyan accent thread, neon-pink tertiary) and each demonstrates a treatment of the key visual per the usage rules (crop-as-backdrop, idle-state banner, or palette-only) — the axes differentiate on typography, surface treatment, and depth, not on divergent palettes.

#### 2. Claude Design project

**File**: n/a (remote project via `DesignSync`)

**Intent**: Create project "LuminaClean — Enhance screen kit" (`create_project`), then `finalize_plan` (writes: `boards/**`, localDir: the design-kit folder) and `write_files` from the local bundle.

**Contract**: Project is `PROJECT_TYPE_DESIGN_SYSTEM`; record the `projectId` in this plan file (append under References) for Phases 3.

### Success Criteria:

#### Automated Verification:

- Boards exist locally and are valid self-contained HTML (no external `http` references): grep check
- `DesignSync list_files` on the project shows all pushed `boards/*` paths

#### Manual Verification:

- User reviews the boards in claude.ai/design and names the winning direction (may request a hybrid)

**Implementation Note**: PAUSE after pushing — the winner decision is the user's. Phase 2 may proceed during the review window.

---

## Phase 2: i18n String Extraction (independent of design)

### Overview

Extract every user-facing string of the Enhance surface (~77) into one module with byte-identical values. Pure refactor; zero visual or behavioral change. Can run while the user reviews boards.

### Changes Required:

#### 1. Strings module

**File**: `src/lib/enhance-strings.ts` (new)

**Intent**: Single flat, typed module of named string constants (grouped by component/domain in comments), covering: `index.astro` hero copy, all JSX literals + aria-labels + alt texts in `src/components/enhance/*`, message consts in `useLocalEnhance.ts`, `useCloudSubmit.ts`, `useCloudJob.ts`, `cloud-job-decisions.ts`, `image-helpers.ts`, `cloud-upload.client.ts`. Template-style strings (e.g. the too-large message with max dimensions) become small functions taking their parameters.

**Contract**: Every value byte-identical to today's literal. Plain TS module — no `astro:env` imports, importable from Astro frontmatter, React islands, lib services, and Vitest alike.

#### 2. Consumers switched to the module

**File**: `src/pages/index.astro`, `src/components/enhance/*.tsx`, `src/components/hooks/{useLocalEnhance,useCloudSubmit,useCloudJob}.ts`, `src/components/hooks/cloud-job-decisions.ts`, `src/lib/engines/image-helpers.ts`, `src/lib/services/cloud-upload.client.ts`

**Intent**: Replace inline literals with imports. Modules whose message consts are imported elsewhere (`cloud-job-decisions.ts`, `image-helpers.ts`, `cloud-upload.client.ts`) re-export the values under their existing names so tests and consumers keep their imports.

**Contract**: No public export renamed or removed; no test file edited.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run test:unit` passes untouched (277 tests)
- Freeze-list strings unchanged: grep each E2E-contract string, value identical
- Lint clean on touched files (prettier + eslint per Windows lesson)

#### Manual Verification:

- Quick smoke on `wrangler dev`: screen renders identically (spot-check uploader, toggle, error copy)

---

## Phase 3: State Cards for the Winning Direction

### Overview

Expand the chosen direction into a full screen kit: ~8 state cards + one foundations card, pushed to the same project. The user approves the kit before implementation.

### Changes Required:

#### 1. State cards

**File**: `context/changes/enhance-ui-refresh/design-kit/states/*.html` → project `states/*.html`

**Intent**: Cards (group `"States"`): uploader idle, uploader drag-over, uploader validation error, local result + parameter panel, cloud sign-in gate (anon), cloud processing (+ cold-start hint line), cloud failed + RGBA convert variant, cloud result with before/after slider. Plus one `foundations/tokens.html` card (group `"Foundations"`): palette, type scale, radii, spacing, the local CSS variable names the implementation will use.

**Contract**: Same self-containment + `@dsCard` marker rules as Phase 1; every card uses the real copy from `enhance-strings.ts` and reflects the S-12 layout contract (desktop two-column + mobile stack shown where relevant).

#### 2. Push to project

**File**: n/a (remote)

**Intent**: New `finalize_plan` (writes: `states/**`, `foundations/**`) + `write_files`; delete losing boards only if the user asks.

**Contract**: Same project as Phase 1 (recorded projectId).

### Success Criteria:

#### Automated Verification:

- `DesignSync list_files` shows all `states/*` + `foundations/*` paths

#### Manual Verification:

- User approves the kit in claude.ai/design (or requests card-level tweaks — iterate here, not in code)

**Implementation Note**: PAUSE for approval — Phase 4 implements only an approved kit.

---

## Phase 4: Implementation — Restyle to the Approved Kit

### Overview

Translate the approved kit into code. Visual layer only: hierarchy, layout, spacing, typography, color, affordances — via Tailwind utilities, shadcn variants, and a small set of local CSS variables. The E2E freeze list and all UX invariants hold.

### Changes Required:

#### 1. Local design variables + font

**File**: `src/styles/global.css` (namespaced additions), `public/fonts/*` (if the winner uses a web font)

**Intent**: Add a clearly-commented, `--lc-*`-namespaced block of CSS variables for the Enhance screen (surface, border, accent, text tiers, radius — only what the kit needs; explicitly NOT a global token system). If the winning direction carries a font: self-hosted woff2 subset(s) in `public/fonts/`, `@font-face` with `font-display: swap` in `global.css`.

**Contract**: Variables defined at `:root` in `global.css` (reachable by the island bundle); existing shadcn tokens and `bg-cosmic` untouched unless the kit replaces the page gradient — replacement happens by re-defining what `index.astro`/components reference, not by editing the `.dark` block. If preload proves necessary for the display font, add a minimal additive `<slot name="head" />` seam to `Layout.astro` — smallest possible out-of-scope touch, surface it in the PR description.

#### 1b. Key-visual derivatives

**File**: `public/images/` (new assets derived from `design-kit/assets/LCAI.jpg`)

**Intent**: Generate only the crops the approved kit actually uses (per the key-visual usage rules): e.g. a text-free backdrop crop and/or the idle-state banner, as WebP/AVIF with JPG fallback, sized to real render dimensions (plus @2x). Skip entirely if the winner is palette-only.

**Contract**: Loaded via `<img>`/`<picture>` or CSS `image-set()` with explicit dimensions (no CLS); total added image weight budget ≤ 250 KB across formats actually fetched by one client.

#### 2. Page shell

**File**: `src/pages/index.astro`

**Intent**: Restyle hero/landing shell (spacing, type scale, background treatment) per the kit. Copy comes from `enhance-strings.ts` (already wired in Phase 2).

**Contract**: `<EnhanceWorkspace client:load>` props and the `?chroma=1` seam (`:24–34`) unchanged; h1 text remains the freeze-list value.

#### 3. Enhance components

**File**: `src/components/enhance/EnhanceWorkspace.tsx`, `EngineToggle.tsx`, `ImageUploader.tsx`, `BeforeAfterSlider.tsx`, `CloudSignInPrompt.tsx`, `DownloadButton.tsx`, `ParameterPanel.tsx`

**Intent**: Restyle each component to its state card. Consolidate the thrice-duplicated `SECONDARY_BUTTON` recipe into one shared const (or a `buttonVariants` extension) as part of the repaint. Keep all roles, aria-labels, alt patterns, `role="alert"` placements, and DOM/hydration structure of the uploader (E2E retries until the island hydrates — don't restructure the island boundary).

**Contract**: Class-level changes only; `cn()` for conditional merges; grid contract `md:grid-cols-[minmax(0,1fr)_320px]` + `max-w-5xl` preserved (kit may restyle the panel's skin, not its placement/stacking); slider `data-slot` overrides may be re-skinned but the Radix structure stays; zero new network calls, zero handler changes.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run test:unit` passes
- `npm run build` succeeds
- Lint clean on touched files
- Freeze-list grep: all E2E-contract strings still byte-identical

#### Manual Verification:

- Visual parity with approved cards on `npm run build && npx wrangler dev` — desktop and ~375px mobile width
- All 8 kit states reachable and matching (uploader idle/drag/error, local result, gate, processing, failed+RGBA, result)
- Cost-safety spot check: dragging sliders / toggling Auto issues no network requests (DevTools network tab)

**Implementation Note**: Pause for the user's visual review before Phase 5's full gate.

---

## Phase 5: Verification & Close-out

### Overview

Full local gate + final review; refresh kit cards only if implementation intentionally drifted.

### Changes Required:

#### 1. Full E2E gate

**File**: n/a (run only)

**Intent**: Run the local Playwright gate per `context/foundation/test-plan.md` §6.3 (local Supabase + served `enhance` function with the seam env; browser-warm first run per memory — cold-start false-REDs the upload).

**Contract**: All specs green: north-star, stall→timeout, chroma-ON, seed.

#### 2. Kit sync-back (optional)

**File**: `context/changes/enhance-ui-refresh/design-kit/**` → project

**Intent**: If code diverged from cards during review, update the affected cards so the project remains a truthful record. Skip if parity held.

**Contract**: Incremental `write_files` on changed cards only.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e` — all specs pass locally

#### Manual Verification:

- Final user acceptance of the live screen (desktop + mobile)
- Adjacency check: restyled screen coexists with the out-of-scope sticky Nav without visual clash

---

## Testing Strategy

### Unit Tests:

- No new unit tests (no logic changes). Existing 277 must stay green untouched — Phase 2's re-export contract guarantees `cloud-job-decisions.test.ts` et al. keep passing.

### Integration Tests:

- Not affected (no API/DB surface).

### Manual Testing Steps:

1. `npm run build && npx wrangler dev` → load `/`, walk all 8 states (use a JPG + an alpha PNG for the RGBA path).
2. Mobile width (~375px): panel stacks below image; values visible and editable.
3. DevTools network tab: slider drags and Auto toggle produce zero requests.
4. Reload mid-cloud-job: beforeunload prompt still fires.

## Performance Considerations

Only new payload is the optional font (~30–80 KB woff2, `font-display: swap`, subset to Latin + Polish diacritics for future DE/PL). CSS remains build-time Tailwind output. No runtime JS added.

## Migration Notes

None — no data, schema, or API changes. Rollback = revert the PR.

## References

- Change definition: `context/changes/enhance-ui-refresh/change.md`
- Brand key visual: `context/changes/enhance-ui-refresh/design-kit/assets/LCAI.jpg` (source: user-provided, 1024×1024)
- S-12 layout/UX contract: `context/archive/2026-06-18-adaptive-enhancement-parameters/plan.md`
- E2E run recipe: `context/foundation/test-plan.md` §6.3
- Lessons applied: dev-server React-dup (#15), Windows lint baseline, generated-bundle lint exclusion (`lessons.md`)
- Claude Design project: "LuminaClean — Enhance screen kit", projectId `db969341-ba46-4ca0-a64c-1477dae83137`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Direction Boards → Claude Design

#### Automated

- [x] 1.1 Boards valid + self-contained (no external refs) — 7dc961c
- [x] 1.2 `list_files` shows all pushed `boards/*` — 7dc961c

#### Manual

- [x] 1.3 User picks the winning direction in claude.ai/design — 7dc961c

### Phase 2: i18n String Extraction

#### Automated

- [x] 2.1 `npm run typecheck` passes
- [x] 2.2 `npm run test:unit` passes untouched (277)
- [x] 2.3 Freeze-list strings byte-identical (grep)
- [x] 2.4 Lint clean on touched files

#### Manual

- [x] 2.5 Smoke on wrangler dev: screen renders identically

### Phase 3: State Cards for the Winning Direction

#### Automated

- [ ] 3.1 `list_files` shows all `states/*` + `foundations/*`

#### Manual

- [ ] 3.2 User approves the kit

### Phase 4: Implementation — Restyle to the Approved Kit

#### Automated

- [ ] 4.1 `npm run typecheck` passes
- [ ] 4.2 `npm run test:unit` passes
- [ ] 4.3 `npm run build` succeeds
- [ ] 4.4 Lint clean on touched files
- [ ] 4.5 Freeze-list strings byte-identical (grep)

#### Manual

- [ ] 4.6 Visual parity with cards on wrangler dev (desktop + mobile)
- [ ] 4.7 All 8 states reachable and matching
- [ ] 4.8 Cost-safety: sliders/Auto → zero network requests

### Phase 5: Verification & Close-out

#### Automated

- [ ] 5.1 `npm run test:e2e` — all specs green locally

#### Manual

- [ ] 5.2 Final user acceptance (desktop + mobile)
- [ ] 5.3 Adjacency check vs sticky Nav
