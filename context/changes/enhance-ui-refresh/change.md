---
change_id: enhance-ui-refresh
title: Enhance screen UI refresh — restyle the main flow
status: implemented
created: 2026-06-30
updated: 2026-07-05
archived_at: null
---

## Notes

A visual-only refresh of the **Enhance screen (`/`)** — make the main flow look
more premium and read more clearly on desktop and mobile. **No** changes to
auth/cloud logic or to the upload/enhance behavior; we restyle, we don't rewire.

In scope (the single enhance island + its page shell):

- `src/pages/index.astro` (hero/landing shell, ~`:37`)
- `src/components/enhance/EnhanceWorkspace.tsx` (`:73`) and the child enhance
  components it composes: uploader, engine toggle, parameter panel, before/after
  slider, cloud submit/processing/failed/result states.
- Work the visual layer: hierarchy, layout, spacing, typography, color,
  interaction affordances/legibility — via existing Tailwind 4 + shadcn/ui
  variants and, if needed, a few **local** CSS variables. No global token system.
- **i18n-readiness (prep only)**: while we're already rewriting this screen's
  markup, externalize its user-facing copy into one place (a local strings
  module/constants for the Enhance components) so the later DE/PL localization
  slice (#7) is mechanical and doesn't re-touch the same JSX. **No** actual
  translations and **no** i18n framework/library here — just stop hardcoding copy
  inline. Rationale: restyle + localize-later would otherwise touch the same
  strings twice; this avoids the double-edit at near-zero cost.

Decisions (locked with the user):

- **It's a CHANGE, not a roadmap slice** — restyle of existing UI, no new
  end-to-end capability. (Codex floated "narrow slice"; the artifact is a change.)
- **Narrow cut first**: Enhance screen only. Highest product value after S-12,
  lowest risk, doesn't spread scope across the service.
- **Depth = "coś pośrodku" but kept local**: light theming via local CSS vars is
  OK; a shared design-token/theme layer is explicitly deferred.

Out of scope (deliberately, follow-up changes later): `/dashboard`, `/auth/*`,
the global `Nav.astro` / `Layout.astro`, and any shared design-token/design-system.
Also out: **actual DE/PL translations and any i18n framework/library** — that's the
separate cross-cutting localization slice (#7); this change only makes the Enhance
copy _extraction-ready_ (see the i18n-readiness item above).

Design direction: **"Claude design"** — driven with the `frontend-design` skill
during plan + implementation. Goal is a distinctive, intentional look (typography,
palette, spacing, "not-a-template" feel), not default shadcn styling. (If the user
meant a narrower target — e.g. the claude.ai visual language specifically — refine
here at plan time.)

**Winning direction (picked 2026-07-03, Phase 1 gate):** hybrid **"C — Nocturne" + the
parameter panel from "B — Darkroom"** — pure-black gallery base (tone steps, Archivo 800,
beam gradient only on the primary CTA and slider handle, full LCAI key visual as the
idle-state banner) with the Darkroom panel skin (hairline borders, IBM Plex Mono readout
chips, tick-marked sliders). Claude Design project `db969341-ba46-4ca0-a64c-1477dae83137`.

Branch: `feat/enhance-ui-refresh`, created off `master` **after** `enhance-ux-fixes`
merged (PR #83, `9cd7f8a`). That merge already carries the `EnhanceWorkspace.tsx` +
`index.astro` changes, so the earlier merge-conflict concern is resolved — this
branch builds on top of them. master is PR-only.
