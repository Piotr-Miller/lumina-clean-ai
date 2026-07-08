# Brand lockup — repo-local spec

> Visual source of truth: `foundations/brand-lockup.html` in the Claude Design
> project "LuminaClean — Enhance screen kit" (`db969341-ba46-4ca0-a64c-1477dae83137`),
> built by the pane agent from user-pasted logo PNGs (`uploads/` in the project).
> This spec captures everything Phase 1 needs without leaving the repo.
> (Written to resolve plan-review F3.)

## Composition (full lockup — default)

Three elements, left to right:

1. **Mark**: rounded-square tile filled with the beam gradient
   (`--lc-beam`, 90°: `#8f7bf0 → #6fe3f2`), containing the monogram **LC**
   set in `--lc-display` (Archivo) 800, color `--lc-void` (#050507).
   Tile radius scales with size (~25% of tile edge).
2. **Wordmark**: `LuminaClean AI` in `--lc-display` 800, tight tracking;
   `LuminaClean` in `--lc-ink`; **`AI` beam-clipped** (gradient text via
   `background-clip: text`).
3. **Tagline**: `AI PHOTO EDITING. PERFECTED.` in `--lc-mono` (IBM Plex Mono)
   500, ~.16em letter-spacing, uppercase, `--lc-faint`; sits under the wordmark.

## Beam rule (F2 decision, 2026-07-06)

The **lockup as one unit** (mark tile + the wordmark's "AI") is the ONLY
sanctioned beam surface besides the primary CTA and the before/after
divider/handle. No other nav element may carry beam.

## Size ladder

| Variant          | When                        | Contents                       |
| ---------------- | --------------------------- | ------------------------------ |
| Full             | default (nav desktop)       | mark + wordmark + tagline      |
| Compact          | height-constrained contexts | mark + wordmark (no tagline)   |
| Mark only        | lockup height ≤ ~28px       | tile + LC only                 |
| Mark 52/36/24 px | standalone / favicon        | tile + LC; 24px is the favicon |

Hard rules from the card: below ~28px drop the wordmark and ship the mark
alone; the tagline is **never** shown under 13px.

## Nav drop-in (Phase 1 target)

Replaces the plain-text `<a>` brand in `src/components/Nav.astro:11-13`.
Card shows the strip on kit tones: `--lc-step-2`-family surface, links in
`--lc-dim` → `--lc-ink` on hover (no purple, no white glass). On mobile
widths hide the tagline first (compact variant), keep mark + wordmark.

## Grounds

Verified on the card against both `--lc-void` and `--lc-step-1` — tile
contrast holds on both; no outline needed.

## Implementation notes

- **As shipped (user decision during Phase 1, 2026-07-06):** the mark in the
  nav AND the favicon are the ORIGINAL brand asset (`Icon.png`, 54×51 — dark
  tile with gradient "LC⁺" and sparkle), served as
  `public/images/brand-mark.png` (nav, 32px mobile / 44px desktop) and
  `public/favicon.png` (composed 64×64, link versioned `?v=2` to bust the
  favicon cache). This supersedes the card's CSS beam-tile mark for the nav;
  the beam-clipped "AI" in the wordmark stays. **Kit synced 2026-07-06** (per
  impl-review F2): the pane agent replaced the beam-tile mark with the
  original mark image (data URI) on all 13 cards + `foundations/brand-lockup.html`;
  the extracted mark lives at `foundations/assets/lc-mark.png` in the project.
- The user-pasted PNGs in the project's `uploads/` are reference-only.
