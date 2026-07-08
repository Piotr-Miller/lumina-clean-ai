# Landing 2.0 — Content, Guides, Tooltips, Brand Lockup — Plan Brief

> Full plan: `context/changes/landing-content/plan.md`

## What & Why

The shipped Enhance landing ends at the tool — no explanation, no trust signals, no SEO surface, and a plain-text brand in a pre-restyle nav. This change grows the page below the fold (How-it-works, FAQ, guide teasers), publishes two real photography guides, explains panel options in place via tooltips, ships the LC brand lockup in a kit-toned nav, and turns on the SEO basics (sitemap, meta/OG) that make the content findable.

## Starting Point

The Nocturne × Darkroom restyle is live (change `enhance-ui-refresh`, archived): kit tokens, fonts, and the strings module exist. Nav is still cosmic-glass with a text brand; there are no article pages or content collections; the sitemap integration is installed but dead (no `site` config); Layout has no meta description/OG.

## Desired End State

Scrolling past the tool tells the product story in three restrained sections; two guides live at `/guides/<slug>` with license-safe imagery; hovering/focusing a panel option explains it; every page carries the LC lockup and mark-favicon; Google can index all of it.

## Key Decisions Made

| Decision           | Choice                                                                                                                   | Why (1 sentence)                                                                    | Source          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------- |
| Design base        | Proposal A "slim" on the shipped hybrid skin                                                                             | One visual language across the product; editorial B = article-page inspiration only | change.md       |
| Content discipline | Tooltips carry details; 3 explainer cards, 4 closed FAQ items, 2 teasers                                                 | "Modern & uncluttered" — progressive disclosure over page text                      | change.md       |
| Nav scope          | Lockup + full strip retune to kit tokens                                                                                 | Beam lockup on white glass would clash; ~5 class edits buy coherent chrome          | Plan            |
| Articles           | Two full EN articles now (not skeletons)                                                                                 | Teasers and SEO are honest only with real content                                   | Plan            |
| Article imagery    | CC0/permissive stock only, user-approved pre-download, credits footer; before/after pairs made with our own Local engine | Copyright safety by construction                                                    | Plan (user req) |
| Article tech       | Content collections + prerendered `/guides/<slug>`                                                                       | Astro-idiomatic, typed frontmatter, static speed, free sitemap entries              | Plan            |
| Tooltips           | shadcn/Radix Tooltip, panel-local provider                                                                               | A11y (hover/focus/touch) for free; frozen aria-labels stay byte-identical           | Plan            |
| FAQ mechanics      | Native `<details>` styled to kit                                                                                         | Zero JS, no island, solid a11y                                                      | Plan            |
| Favicon            | LC mark as SVG + 64px PNG fallback                                                                                       | Completes the rebrand; mark is pure vector                                          | Plan            |
| SEO                | Minimum in-scope: `site` config, sitemap, meta/OG/canonical, robots.txt                                                  | An SEO surface that can't be indexed is fiction                                     | Plan            |
| Testing depth      | Existing E2E gate (full run gates the tooltip phase) + manual; no new specs                                              | Static content adds no §2 risk row; avoid pinning marketing copy                    | Plan            |

## Scope

**In scope:** `Nav.astro` (named global touch) + favicon; `index.astro` below-fold sections; `src/content/guides/*` + `/guides/[slug]` pages + imagery; `ParameterPanel.tsx` tooltips + `ui/tooltip.tsx`; `enhance-strings.ts` new entries; `astro.config.mjs` site/sitemap; `Layout.astro` head meta; OG card + robots.txt.

**Out of scope:** translations/i18n framework (slice #7), CMS, comments/social, >2 articles, `/guides` index page, new E2E specs, any engine/pipeline/auth logic, auth/dashboard page bodies.

## Architecture / Approach

Static-first: sections and articles are SSR/prerendered HTML on the shipped kit tokens — the only new client JS is the Radix tooltip inside the existing island. Copy flows through `enhance-strings.ts` (except article markdown). Phases ordered so the risky bit (frozen panel) is isolated and gated by the full E2E run.

## Phases at a Glance

| Phase               | What it delivers                                     | Key risk                                              |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| 1. Nav lockup       | LC lockup + kit-toned nav + favicon; kit propagation | Global chrome touch — must look right on both grounds |
| 2. Guides           | Content collection + 2 full articles + imagery       | Image licensing diligence; content review latency     |
| 3. Landing sections | How-it-works / FAQ / teasers below the fold          | Board parity; scope creep into "more content"         |
| 4. Panel tooltips   | Radix tooltips on options + Auto                     | The one frozen-contract touch — full E2E gate         |
| 5. SEO + close-out  | Live sitemap, meta/OG/canonical, robots, OG card     | SSR/prerender sitemap interplay                       |

**Prerequisites:** shipped `enhance-ui-refresh` (done); Docker for the Phase 4 E2E gate; user availability for image approval + article review.
**Estimated effort:** ~3 sessions; Phases 2 (content) and 4 (E2E gate) are the heavy ones.

## Open Risks & Assumptions

- Assumes CC0/permissive stock with suitable night shots is findable; fallback is producing our own shots or trimming image count.
- Fraunces subset is 600-weight only → article headings only; body stays system sans (accepted).
- Nav retune is visible on auth/dashboard which otherwise keep the old look — accepted adjacency (as with the always-dark chrome decision last change).
- Radix tooltip inside the island adds a small JS cost; if it measurably bloats the bundle, fallback is CSS-only tooltips at reduced a11y.

## Success Criteria (Summary)

- User accepts the landing (sections + guides + tooltips + nav) against the slim board, desktop + 375px.
- Full existing E2E gate green locally; freeze-grep clean; 277 unit tests untouched.
- `sitemap-index.xml` served with both guides; meta/OG present on landing and guides.
