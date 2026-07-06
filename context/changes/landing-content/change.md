---
change_id: landing-content
title: Landing 2.0 — FAQ, how-to, article guides, panel tooltips
status: idea
created: 2026-07-05
updated: 2026-07-05
archived_at: null
---

## Notes

Grow the Enhance landing (`/`) below the fold with content surfaces, on top of
the shipped Nocturne × Darkroom skin (change `enhance-ui-refresh`):

- **How it works** — three explainer cards max (Engines · Sliders + Auto ·
  What's free); every deeper detail lives in tooltips at the control, not on
  the page.
- **Tooltip pattern** for the parameter panel options (hover/focus, hairline
  surface, mono micro-label). ⚠️ Touches the Enhance panel → plan against the
  frozen E2E locator contract; tooltip copy goes into `enhance-strings.ts`.
- **FAQ accordion** — max 4 items, closed by default (photo privacy, why an
  account, formats, cold-start).
- **Two article guides** (also the landing's SEO surface): "What actually
  ruins night photos — and what's fixable" and "Shooting better night photos
  with the phone you have". Long-form pages may use Fraunces for body copy
  (sans UI + serif editorial); the landing itself stays Archivo.

Direction decisions (user, 2026-07-05, "modern & uncluttered"):

- Base = **Proposal A (slim)** on the existing hybrid skin — one visual
  language across the product; Proposal B (Editorial Afterglow) kept as an
  alternative/inspiration for article pages only.
- Discipline rules: beam only on primary actions; content sections tone-step
  surfaces with no borders; ~104px between sections; progressive disclosure
  (teasers + closed accordion); hierarchy via typography, not ornaments.

Design input: `design/landing2-hybrid.html` (chosen, slim) and
`design/landing2-editorial.html` (alternative) — authored with the
`enhance-ui-refresh` design-kit tooling (`{{CSS:hybrid.css}}` / `{{IMG:*}}` /
`{{FONT:*}}` tokens resolve via that kit's `tools/build-boards.mjs`). Built
self-contained copies live in the Claude Design project
"LuminaClean — Enhance screen kit" (`db969341-ba46-4ca0-a64c-1477dae83137`),
group **Proposals**.

Out of scope (for later slices): translations (PL/DE i18n slice #7), CMS,
comments/social, more than two articles.
