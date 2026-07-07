---
change_id: landing-content
title: Landing 2.0 — FAQ, how-to, article guides, panel tooltips, nav brand lockup
status: impl_reviewed
created: 2026-07-05
updated: 2026-07-07
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
- **Brand lockup in the nav** (added 2026-07-06): swap the plain-text
  `<span class="brand">` in `Nav.astro` for the LC lockup — beam-gradient LC
  monogram + Archivo 800 wordmark ("AI" picked out in beam) + Plex Mono
  tagline; size ladder down to mark-only ≤28px; optionally derive the favicon
  from the mark. ⚠️ `Nav.astro` is GLOBAL chrome (auth/dashboard too) and was
  explicitly out of scope of `enhance-ui-refresh` — this change deliberately
  names it as an in-scope touch. Kit rule amendment the card sanctions: the
  LOCKUP (mark tile + the wordmark's beam-clipped "AI", one unit) is the ONLY
  beam surface besides the primary CTA and the slider handle (F2 plan-review
  decision). The tagline stays a LITERAL in `Nav.astro` — `enhance-strings.ts`
  is screen-scoped to `/`; the i18n slice localizes global chrome at its
  component (F4 plan-review decision). Design: repo-local spec
  `design/brand-lockup-spec.md`; visual source `foundations/brand-lockup.html`
  in the Claude Design project (built from user-pasted logo PNGs in
  `uploads/`). At implementation time, also have
  the pane propagate the lockup into cards 01–10/boards so the kit stays
  truthful (not before — those cards document the shipped screen).

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
comments/social.

## Amendments (during implementation, 2026-07-06)

- **Third article added — plan amended 2 → 3 articles.** Alongside the two
  night-photo guides, a third camera-agnostic article "Shooting in difficult
  light: backlight, harsh sun, and everything between"
  (`src/content/guides/shooting-in-difficult-light.md`) is written in THIS
  change (user decision). It's the broadened-audience piece spun off from
  article #2's "any camera / any hard light" angle, cross-linked to the two
  night guides. Phase 3's teaser section grows from two cards to three; the
  no-`/guides`-index constraint still holds. Article #2 also keeps its
  phone-first frame but gains a few "works on any camera" touches (same
  broadening decision).
- **Localization deferred (reaffirmed).** Articles stay EN-only in this change;
  i18n (UI + article content) remains slice #7. Reopened during implementation;
  the answer is still defer. The `guides` content collection is designed so a
  later `locale` dimension (`guides/<lang>/*`) + `[lang]` routing drops in
  without a rewrite — nothing in Phase 2 blocks it.
- **Nav mark + favicon made transparent (Phase-1 artifact polish).** During the
  Phase 2 visual review the user flagged that the LC mark's near-black tile sat
  as a mismatched box on the charcoal nav. Fixed by keying the near-black fill
  to transparent (max-channel alpha ramp) on both `public/images/brand-mark.png`
  and `public/favicon.png`; `Layout.astro` favicon cache-buster bumped `?v=2 →
?v=3`. Also re-cropped the two portrait-sourced guide covers
  (`shoot-better-night-photos`, `shooting-in-difficult-light`) with explicit 16:9
  extract windows so the subject's head is no longer clipped.
- **Cloud AI single-job notice (added 2026-07-07, user request).** LuminaClean
  is a single-job app (no queue); switching photos mid-run abandons the in-flight
  Cloud AI job. Surfaced on two surfaces: (1) an inline faint hint in the Cloud
  AI processing state next to "Start over" (`EnhanceWorkspace.tsx`,
  `workspace.cloudSingleJobHint`); (2) a landing FAQ item "Can I process more
  than one photo at once?" (`landing.faq.items`, grows the FAQ 4 → 5, past the
  board's original "max 4"). Copy uses honest "leaves this run behind" framing —
  the switched-away Replicate prediction may still run server-side and count
  against the daily cap (no hard cancel is wired; a true cancel + cap-slot free
  is a separate future task). Touches the enhance island → re-ran the full local
  E2E gate (6/6 green). Scope note: the inline hint is app-tool copy, slightly
  outside landing-content's "landing/SEO content" scope, folded in here as a
  small related copy addition rather than a separate change.
