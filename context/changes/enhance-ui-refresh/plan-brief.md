# Enhance Screen UI Refresh — Plan Brief

> Full plan: `context/changes/enhance-ui-refresh/plan.md`

## What & Why

A visual-only, premium restyle of the Enhance screen (`/`) — the product's main flow — plus i18n-readiness (all copy extracted to one strings module so the later DE/PL slice is mechanical). Design decisions are made **in Claude Design (claude.ai/design)** on preview boards/cards via the `DesignSync` tool, not in code: cheap iteration for the user, and the kit remains as a durable record.

## Starting Point

The screen works (S-12 parameter panel, PR #83 UX fixes) but looks templated: a dead stock-shadcn token layer under a hand-painted "cosmic dark" (white/NN glass panels, purple accents), system fonts only, ~77 hardcoded strings. Four E2E specs pin exact strings/roles on this screen.

## Desired End State

A distinctive premium-dark Enhance screen implemented from a user-approved Claude Design screen kit; one strings module with byte-identical copy; all E2E green; zero logic changes.

## Key Decisions Made

| Decision         | Choice                                                                                                                    | Why (1 sentence)                                                                                    | Source             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ |
| Design vehicle   | Claude Design **screen kit** (boards → state cards), not a full design system                                             | User decision: iterate visually on one screen without design-system ceremony                        | User               |
| Artifact type    | Change, not roadmap slice; Enhance screen only                                                                            | Restyle of existing UI, no new end-to-end capability                                                | change.md          |
| Theming depth    | Local `--lc-*` CSS vars, no global token system                                                                           | "Coś pośrodku" locked in change.md                                                                  | change.md          |
| i18n prep        | Extract copy now, no translations/framework                                                                               | Avoid double-editing the same JSX in the DE/PL slice                                                | change.md          |
| Brand anchor     | User-provided key visual `LCAI.jpg` (night city before/after, violet→cyan divider) anchors palette + motif for all boards | Real brand asset beats an invented palette; divider motif mirrors the product's before/after slider | User               |
| Key-visual usage | Text-free crops / idle-state banner / palette extraction — never full-frame behind live UI                                | Marketing copy is baked into the pixels; full-frame duplicates messaging and hurts contrast         | Plan               |
| Board palette    | **Dark-first ×3 boards** ⚠️ provisional (now also asset-confirmed)                                                        | Out-of-scope dark Nav/chrome adjacency + photos read best on dark + the key visual is dark          | Plan (AFK default) |
| Web fonts        | **Allowed, max 1–2 self-hosted families** ⚠️ provisional                                                                  | Typography is the strongest "not-a-template" lever; bounded cost                                    | Plan (AFK default) |
| State cards      | **Full ~8-state set** ⚠️ provisional                                                                                      | Every E2E-visible state gets a reference — implementation is paint-by-numbers                       | Plan (AFK default) |
| Strings scope    | **Whole Enhance surface incl. `src/lib` error copy**, re-exported under existing names ⚠️ provisional                     | DE/PL edits one file; zero test churn via re-exports                                                | Plan (AFK default) |
| Verification     | **Full gate incl. local E2E run** ⚠️ provisional                                                                          | E2E string/role deps verified before PR, not at PR                                                  | Plan (AFK default) |

| Winning direction (Phase 1 gate) | Hybrid: **C — Nocturne + B's Darkroom panel** | Gallery-black stage sells the photo; instrument panel sells precision | User |

⚠️ = decided from recommendations while the user was AFK — confirmed implicitly by "Ruszamy" (2026-07-03).

## Scope

**In scope:** `src/pages/index.astro` shell; all `src/components/enhance/*`; visual layer only (hierarchy, layout, spacing, typography, color, affordances); strings module covering components + hooks + lib error copy; Claude Design project (boards, state cards, foundations card); optimized key-visual derivatives in `public/images/` (≤ 250 KB budget, only the crops the approved kit uses).

**Out of scope:** `/dashboard`, `/auth/*`, `Nav.astro`, `Layout.astro` (except a possible one-line additive head slot for font preload — flagged), global token system, translations/i18n framework, any logic/behavior change, chroma exposure.

## Architecture / Approach

DesignSync round-trip: author self-contained HTML boards locally → push to a new claude.ai/design project → user picks winner → push ~8 state cards + foundations card → user approves → implement in Tailwind 4 + shadcn + `--lc-*` vars behind a frozen E2E contract (exact strings/roles listed in the plan). String extraction runs independently during the board-review window.

## Phases at a Glance

| Phase                | What it delivers                                        | Key risk                                                          |
| -------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Direction boards  | 2–3 premium-dark boards in Claude Design; winner chosen | Boards too similar / design authorization prompt blocks push      |
| 2. String extraction | `src/lib/enhance-strings.ts`, all copy verbatim         | Accidental value drift breaking E2E (mitigated: freeze-list grep) |
| 3. State cards       | ~8 approved state cards + foundations card              | Review latency; card-level iteration loops                        |
| 4. Implementation    | Restyled screen matching the kit                        | Regressing E2E roles/strings or the cost-safety invariant         |
| 5. Verification      | Local E2E green + final acceptance                      | Local stack availability (Docker) for the gate                    |

**Prerequisites:** claude.ai login with design scopes (first DesignSync call may prompt); Docker for Phase 5's local E2E.
**Estimated effort:** ~3–4 sessions; Phases 1 & 3 gated by user review in claude.ai/design.

## Open Risks & Assumptions

- Five ⚠️ provisional decisions above await user confirmation — any flip reshapes Phases 1/3 (cheap) but not the structure.
- Assumes DesignSync write access works from this session (Claude Code with claude.ai login); fallback is `/design-login`.
- If the winning direction needs a font preload, `Layout.astro` gets a minimal additive `<slot name="head">` — a flagged, one-line out-of-scope touch.
- The always-dark chrome (Nav/body gradient) stays as-is; a clashing winner would create follow-up scope (accepted trade-off of dark-first: low risk).

## Success Criteria (Summary)

- User approves the implemented screen as matching the approved kit (desktop + mobile).
- `npm run test:e2e` fully green locally; typecheck/unit/lint clean; zero new network paths.
- Future DE/PL slice can localize the Enhance surface by editing exactly one module.
