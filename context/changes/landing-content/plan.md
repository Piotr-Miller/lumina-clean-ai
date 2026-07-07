# Landing 2.0 — Content, Guides, Tooltips, Brand Lockup — Implementation Plan

## Overview

Grow the shipped Nocturne × Darkroom Enhance landing (`/`) below the fold with content surfaces (How-it-works, FAQ, guide teasers), publish two full English photography guides as the product's SEO surface, add tooltips to the parameter panel, swap the plain-text nav brand for the LC lockup (retuning the whole nav strip to kit tokens), and wire the SEO basics that make any of it indexable. Visual/content layer only — no engine, pipeline, or auth logic changes; the E2E locator contract stays frozen.

> **Amendment (2026-07-06, during Phase 2 implementation):** Scope grew from
> **two** guide articles to **three** — a third, camera-agnostic article
> "Shooting in difficult light: backlight, harsh sun, and everything between"
> (`src/content/guides/shooting-in-difficult-light.md`) is added in this change
> (user decision; the broadened-audience piece spun off from article #2's "any
> camera / any hard light" angle, cross-linked to the two night guides).
> Consequences: Phase 3's teaser section carries **three** cards (still no
> `/guides` index); Phase 2 checks read "all three" where they said "both".
> Localization stays deferred to slice #7 (EN-only here); the `guides` collection
> leaves room for a later `locale` dimension without a rewrite.

## Current State Analysis

- **Landing** (`src/pages/index.astro`) ends at the enhance island — nothing below the fold. Copy lives in `src/lib/enhance-strings.ts` (i18n-ready module from `enhance-ui-refresh`).
- **Nav** (`src/components/Nav.astro:8-13`) is pre-restyle "cosmic glass": `bg-white/10 backdrop-blur-xl border-white/10`, purple links, brand = plain text `<a>`. Global (every page via Layout).
- **No article surface**: `src/pages/` holds only index/auth/dashboard; no content collections (`src/content/` absent).
- **SEO is dead on arrival**: `@astrojs/sitemap` is installed (`astro.config.mjs:25`) but skipped at build — no `site` option; `Layout.astro` head has title+favicon only (no meta description, OG, canonical).
- **Panel** (`src/components/enhance/ParameterPanel.tsx`) carries E2E-frozen aria-labels (`Brightness (gamma)`, `Smoothing (blur)`, `Denoise strength`) — tooltips must not alter them.
- **Kit tokens live**: `--lc-*` vars + `bg-beam`/`font-lc-*`/`shadow-bloom` utilities in `src/styles/global.css`; Archivo 800 + IBM Plex Mono 500 self-hosted in `public/fonts/`.
- **Design record**: Claude Design project `db969341-ba46-4ca0-a64c-1477dae83137` — `proposals/landing2-hybrid.html` (chosen, slim; local copy in `context/changes/landing-content/design/`) and `foundations/brand-lockup.html` (visual source for the lockup; repo-local spec: `design/brand-lockup-spec.md`).

## Desired End State

The landing scrolls past the tool into three restrained kit-styled sections; three real guides live at `/guides/<slug>` with license-safe imagery; hovering/focusing a panel option explains it in place; the nav carries the LC lockup on a kit-toned strip on every page; the favicon is the LC mark; Google can index all of it (sitemap alive, meta/OG present). Verified by the full existing E2E gate (green, unchanged specs), freeze-grep, and a manual desktop+375px walkthrough against the proposal board.

### Key Discoveries:

- `Nav.astro:8-13` — the whole strip needs retuning, not just the brand swap; nav renders on `bg-cosmic` pages (auth/dashboard) too, so kit tones must sit on both backgrounds.
- `astro.config.mjs` has `sitemap()` but no `site` — one config line revives it; with `output: "server"`, **only prerendered pages** enter the sitemap, so `/` must be added via `customPages`.
- Article pages can prerender inside the SSR app (`export const prerender = true` on pages is allowed; the hard rule about `prerender = false` applies to API routes only).
- The kit's Fraunces asset is a **600-weight subset** (design-kit archive) — right for article headings, wrong for body copy; article bodies stay system sans.
- `foundations/brand-lockup.html` builds the mark in pure HTML/CSS (beam tile + "LC") — no raster asset needed for the nav; only the favicon needs a file.
- Kit discipline amendment (sanctioned by the lockup card): the LOCKUP — mark tile plus the beam-clipped "AI" in the wordmark, treated as one unit — is the ONLY beam surface besides the primary CTA and the slider handle.

## What We're NOT Doing

- No PL/DE translations, no i18n framework (slice #7); article markdown is EN-only content, not strings-module material.
- No CMS, comments, social features, or more than three articles; no `/guides` index page (teasers link directly).
- No new E2E specs (decision: static content carries no §2 risk-map row); the existing gate is the regression net.
- No engine/pipeline/auth logic changes; no changes to dashboard/auth page bodies (nav strip is the only global touch besides Layout head).
- No restyle of the archived kit cards beyond the sanctioned lockup propagation (design-side, via the pane agent).

## Implementation Approach

Five phases ordered to keep risk isolated and links honest: brand first (small, global, unblocks kit propagation), then guides (so landing teasers have live targets), then the landing sections, then the one phase that touches the frozen panel (tooltips, gated by the full E2E run), then SEO + close-out across all new pages. All new copy goes through `enhance-strings.ts` except article bodies (content collection markdown). Every image shipped is license-safe (CC0/permissive stock), user-approved before download, optimized, and credited.

## Critical Implementation Details

- **Image licensing gate**: only CC0 / Pexels-license / Unsplash-license sources; I propose candidates (source URL + license + size) and the user approves each BEFORE download; every article ends with a credits block naming source + license even where attribution isn't required. Before/after pairs are produced by running the product's own Local engine on an approved source photo — no third-party edited imagery.
- **Prerender + sitemap interplay**: `/guides/*` pages get `export const prerender = true` + `getStaticPaths`; sitemap then includes them automatically but NOT the SSR `/` — set `sitemap({ customPages: ["https://luminacleanai.com/"] })`.
- **Tooltip vs frozen contract**: Radix `Tooltip.Trigger asChild` wraps the existing `<label>` content; the `Slider`'s `aria-label` and the label text stay byte-identical. `TooltipProvider` lives at the panel root (panel-local; the workspace island is untouched).
- **Fonts**: reuse shipped Archivo/Plex Mono; copy `fraunces-600.woff2` from the archived design-kit into `public/fonts/` ONLY for article headings (`@font-face` weight 600). Body copy: system sans (the 600-only subset can't set body text).

## Phase 1: Nav Brand Lockup + Favicon

### Overview

Swap the text brand for the LC lockup, retune the nav strip to kit tokens (both on `--lc-void` and `bg-cosmic` grounds), ship the mark as favicon. After the phase lands, have the pane agent propagate the lockup into kit cards 01–10/boards so the design record stays truthful.

### Changes Required:

#### 1. Nav strip + lockup

**File**: `src/components/Nav.astro`

**Intent**: Replace the brand `<a>` content with the lockup (mark + wordmark "LuminaClean AI" with "AI" beam-clipped + Plex Mono tagline); retune strip classes to kit tones (step-2 surface, dim→ink links, hairline separation) replacing white-glass + purple. Tagline hidden on narrow viewports per the size ladder. _(Amended 2026-07-06 per impl-review F1 — user decision during implementation: the mark is the ORIGINAL brand asset `public/images/brand-mark.png` (from `Icon.png`, 32px mobile / 44px desktop), not the card's CSS beam tile; see `design/brand-lockup-spec.md` "As shipped".)_

**Contract**: Pure markup/class change; auth-aware link structure, hrefs, and the sign-out form stay identical. The lockup (mark tile + the wordmark's beam-clipped "AI") is the strip's only beam element — per the F2 review decision, matching the approved card.

#### 2. Tagline copy

**File**: `src/components/Nav.astro` (same file as change 1)

**Intent**: The tagline ("AI Photo Editing. Perfected.") stays a LITERAL in `Nav.astro` — per the F4 review decision, `enhance-strings.ts` remains screen-scoped to `/` and is not widened into an app-wide copy bucket for one global string.

**Contract**: The future i18n slice localizes global chrome copy at its component (noted in `change.md`); `enhance-strings.ts` is untouched in this phase.

#### 3. Favicon

**File**: `public/favicon.png` (replaced), `src/layouts/Layout.astro`

**Intent**: The favicon is the original brand mark (`Icon.png`) composed to 64×64 PNG; Layout links it with a version query (`?v=2`) to bust the browser favicon cache. _(Amended 2026-07-06 per impl-review F1 — the interim hand-authored beam SVG was dropped by user decision; PNG-only.)_

**Contract**: Layout change is head-only (link tags); the existing `<slot name="head" />` seam stays.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run build` succeeds
- Lint clean on touched files (prettier + eslint, Windows baseline)

#### Manual Verification:

- Nav looks right on `/`, `/auth/signin`, `/dashboard` — desktop + 375px; lockup legible on both grounds
- New favicon visible in the browser tab
- Lockup propagated to kit cards in Claude Design (pane agent run, cards re-approved at a glance)

**Implementation Note**: pause for manual confirmation before Phase 2.

---

## Phase 2: Guides — Content Collection + Three Articles

### Overview

Stand up the `guides` content collection and publish three full EN articles as prerendered pages with license-safe imagery.

### Changes Required:

#### 1. Content collection

**File**: `src/content.config.ts` (new), `src/content/guides/what-ruins-night-photos.md` (new), `src/content/guides/shoot-better-night-photos.md` (new), `src/content/guides/shooting-in-difficult-light.md` (new — 3-article amendment)

**Intent**: `guides` collection (glob loader) with schema: `title`, `description`, `readingMinutes`, `publishedAt`, `cover`, `coverAlt`, `credits[] {source, license, url}`. Three complete articles: "What actually ruins night photos — and what's fixable" (noise vs underexposure vs motion blur; what an editor can and can't rescue; before/after demo), "Shooting better night photos with the phone you have" (brace, expose for highlights, skip digital zoom, let night mode finish, RAW caveat; phone-first with any-camera touches), and "Shooting in difficult light: backlight, harsh sun, and everything between" (camera-agnostic taxonomy — backlight, harsh sun, mixed/artificial light, high contrast, low light — added per the 3-article amendment).

**Contract**: Schema is the typed source for teasers (Phase 3) and meta (Phase 5). Article voice matches the product (plain, concrete, no hype).

#### 2. Article imagery

**File**: `public/images/guides/*` (new)

**Intent**: Lean, editorial per-article imagery — a cover always, plus illustrative / before-after shots only where they earn their place (as shipped: #1 cover + before/after pair, #2 cover + one in-body shot, #3 cover only; amended from the original "3–5 per article" to the lighter count actually shipped, per Phase-2 impl-review F1). All CC0/permissive stock, user-approved pre-download; at least one before/after pair across the set, produced with the product's Local engine from an approved source. Optimized (≤~120 KB each, correct render size, `loading="lazy"`), meaningful alt text, credits recorded in frontmatter.

**Contract**: Total added weight per article ≤ ~400 KB; every file traceable to a source+license in frontmatter `credits`.

#### 3. Article pages

**File**: `src/pages/guides/[slug].astro` (new)

**Intent**: Prerendered (`export const prerender = true` + `getStaticPaths`) kit-styled article layout: void ground, `max-w-prose`, Fraunces 600 headings (new `@font-face`, font copied to `public/fonts/`), system-sans body, reading-time + published line, credits footer, back-to-home link. Uses Layout (nav/footer chrome comes free).

**Contract**: URL shape `/guides/<slug>`; slugs are the three above and become link targets for Phase 3 teasers and sitemap entries in Phase 5.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run build` succeeds and emits all three prerendered guide pages
- Lint clean on touched files

#### Manual Verification:

- User approves the image set + licenses (pre-download gate)
- User copy-review of all three articles
- All three pages read well desktop + 375px (typography, images, credits)

**Implementation Note**: pause for manual confirmation before Phase 3.

---

## Phase 3: Landing Content Sections

### Overview

Add the three below-the-fold sections to `index.astro` per the slim Proposal A board: How-it-works (3 cards), FAQ (4 items), guide teasers (3 cards linking to Phase 2 pages — 3-article amendment).

### Changes Required:

#### 1. Sections markup

**File**: `src/pages/index.astro`

**Intent**: Static Astro markup below the island wrapper: `How it works` (3 tone-step cards: Engines / Sliders + Auto / What's free), `FAQ` (native `<details>/<summary>` styled to kit, ALL items closed by default — F1 review decision; no island), `Learn the craft` (3 teaser cards reusing guide covers, reading-time kicker, beam-text "Read the guide →" links — 3-article amendment). Section rhythm ~104px, no borders, content sections colorless except teaser links (kit discipline).

**Contract**: The island markup and props are untouched; sections are pure SSR HTML below it.

#### 2. Section copy

**File**: `src/lib/enhance-strings.ts`

**Intent**: New `landing.*` group with all section copy (from the slim board, adjusted to final article titles/slugs).

**Contract**: New entries only; freeze list byte-identical.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run build` succeeds
- Lint clean on touched files
- Freeze-list strings byte-identical (grep)

#### Manual Verification:

- Visual parity with `proposals/landing2-hybrid.html` (desktop + 375px)
- Teaser links land on the Phase 2 guide pages; FAQ opens/closes correctly

**Implementation Note**: pause for manual confirmation before Phase 4.

---

## Phase 4: Parameter Panel Tooltips

### Overview

The one phase touching the frozen surface: add Radix tooltips to the panel's option labels and the Auto chip. Gate: full local E2E run.

### Changes Required:

#### 1. Tooltip primitive

**File**: `src/components/ui/tooltip.tsx` (new, via `npx shadcn@latest add tooltip`)

**Intent**: Stock shadcn/Radix tooltip, content re-skinned to the instrument language (step-2 surface, hairline border, 12px, mono kicker optional).

**Contract**: New dependency `@radix-ui/react-tooltip` (via shadcn); no other primitive touched.

#### 2. Panel wiring

**File**: `src/components/enhance/ParameterPanel.tsx`

**Intent**: `TooltipProvider` at panel root; per-param label content wrapped in `Tooltip.Trigger asChild` (dotted-underline affordance), tooltip copy per key + one for the Auto chip. Hover + keyboard focus + touch tap all show content.

**Contract**: Frozen strings and aria-labels byte-identical; `label htmlFor` / Slider ids unchanged; no layout shift (underline replaces nothing).

#### 3. Tooltip copy

**File**: `src/lib/enhance-strings.ts`

**Intent**: `panel.tooltips.{gamma, blur, strength, auto}` — one-sentence explanations matching the landing How-it-works voice.

**Contract**: New entries only.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run test:unit` passes untouched (277)
- `npm run build` succeeds
- Lint clean on touched files
- Freeze-list strings byte-identical (grep)
- Full `npm run test:e2e` green locally (stack + served function per test-plan §6.3)

#### Manual Verification:

- Tooltips show on hover, keyboard focus, and touch tap; content readable on 375px; no layout shift

**Implementation Note**: pause for manual confirmation before Phase 5.

---

## Phase 5: SEO Basics + Close-out

### Overview

Make the new surface indexable and finish with a full manual walkthrough.

### Changes Required:

#### 1. Site + sitemap

**File**: `astro.config.mjs`

**Intent**: Add `site: "https://luminacleanai.com"`; configure `sitemap({ customPages: ["https://luminacleanai.com/"] })` so the SSR landing joins the prerendered guides.

**Contract**: Build must emit `dist/client/sitemap-index.xml` (+ parts) and stop printing the "Sitemap integration requires site" warning.

#### 2. Meta/OG in Layout

**File**: `src/layouts/Layout.astro`, `src/pages/index.astro`, `src/pages/guides/[slug].astro`, `public/images/og-card.jpg` (new), `public/robots.txt` (new)

**Intent**: Layout accepts optional `description` / `ogImage` / `canonical` props and renders meta description, OG/Twitter tags, and canonical with sensible defaults; landing and guides pass real values (guides from frontmatter); one 1200×630 OG card derived from the LCAI key visual (archived design-kit assets); robots.txt allow-all + sitemap pointer.

**Contract**: Head-only Layout change; pages that pass nothing render today's output plus safe defaults.

### Success Criteria:

#### Automated Verification:

- `npm run build` succeeds, emits sitemap including all three guide URLs, no sitemap warning
- Meta description + OG tags present in built landing and guide HTML (grep dist or curl on wrangler dev)

#### Manual Verification:

- Full walkthrough on `npm run build && npx wrangler dev`: landing sections → guides → tooltips → nav/favicon, desktop + 375px
- Final user acceptance

---

## Testing Strategy

### Unit Tests:

- No new unit tests (no logic changes). Existing 277 must stay green untouched (Phase 4 gate).

### Integration Tests:

- Not affected (no API/DB surface).

### Manual Testing Steps:

1. `npm run build && npx wrangler dev` → walk `/` top to bottom: hero/tool untouched, sections match the slim board, FAQ toggles, teasers navigate.
2. Both `/guides/<slug>` pages: typography, images (lazy-load, alts), credits footer, back link.
3. Panel: hover + Tab-focus + touch each option label and Auto — tooltip appears, no layout shift; drag sliders with Network tab open → zero requests (cost-safety unchanged).
4. Nav + favicon on `/`, auth pages, dashboard — both grounds, desktop + 375px.
5. View-source: meta description/OG/canonical on `/` and one guide; fetch `/sitemap-index.xml`.

## Performance Considerations

New payload: guide images (lazy, ≤~400 KB/article), Fraunces 600 subset (~35 KB, guides-only pages), Radix tooltip (~ a few KB in the existing island bundle), OG card (fetched by scrapers, not users). Landing sections are static HTML — no new islands.

## Migration Notes

None — content and presentation only. Rollback = revert the PR.

## References

- Change definition + decisions: `context/changes/landing-content/change.md`
- Design: `context/changes/landing-content/design/landing2-hybrid.html` (chosen, slim), `design/landing2-editorial.html` (article-page inspiration)
- Brand lockup: repo-local spec `context/changes/landing-content/design/brand-lockup-spec.md`; visual source `foundations/brand-lockup.html` in Claude Design project `db969341-ba46-4ca0-a64c-1477dae83137`
- Shipped skin/tokens: `src/styles/global.css` (`--lc-*`), archived kit `context/archive/2026-06-30-enhance-ui-refresh/`
- E2E freeze list: `context/archive/2026-06-30-enhance-ui-refresh/plan.md` (Critical Implementation Details)
- E2E run recipe: `context/foundation/test-plan.md` §6.3

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Nav Brand Lockup + Favicon

#### Automated

- [x] 1.1 `npm run typecheck` passes — 9b49060
- [x] 1.2 `npm run build` succeeds — 9b49060
- [x] 1.3 Lint clean on touched files — 9b49060

#### Manual

- [x] 1.4 Nav + lockup verified on all pages (desktop + 375px, both grounds) — 9b49060
- [x] 1.5 New favicon visible — 9b49060
- [x] 1.6 Lockup propagated to kit cards in Claude Design — 9b49060

### Phase 2: Guides — Content Collection + Three Articles

#### Automated

- [x] 2.1 `npm run typecheck` passes — e4b92ab
- [x] 2.2 `npm run build` emits all three prerendered guide pages — e4b92ab
- [x] 2.3 Lint clean on touched files — e4b92ab

#### Manual

- [x] 2.4 User approves image set + licenses (pre-download gate) — e4b92ab
- [x] 2.5 User copy-review of all three articles — e4b92ab
- [x] 2.6 Guide pages verified desktop + 375px — e4b92ab

### Phase 3: Landing Content Sections

#### Automated

- [ ] 3.1 `npm run typecheck` passes
- [ ] 3.2 `npm run build` succeeds
- [ ] 3.3 Lint clean on touched files
- [ ] 3.4 Freeze-list strings byte-identical (grep)

#### Manual

- [ ] 3.5 Visual parity with the slim proposal board (desktop + 375px)
- [ ] 3.6 Teaser links + FAQ behavior verified

### Phase 4: Parameter Panel Tooltips

#### Automated

- [ ] 4.1 `npm run typecheck` passes
- [ ] 4.2 `npm run test:unit` passes untouched (277)
- [ ] 4.3 `npm run build` succeeds
- [ ] 4.4 Lint clean on touched files
- [ ] 4.5 Freeze-list strings byte-identical (grep)
- [ ] 4.6 Full `npm run test:e2e` green locally

#### Manual

- [ ] 4.7 Tooltips verified: hover, keyboard focus, touch; no layout shift

### Phase 5: SEO Basics + Close-out

#### Automated

- [ ] 5.1 Build emits sitemap incl. all three guides; no sitemap warning
- [ ] 5.2 Meta description + OG + canonical present on `/` and guides (grep/curl)

#### Manual

- [ ] 5.3 Full manual walkthrough (desktop + 375px)
- [ ] 5.4 Final user acceptance
