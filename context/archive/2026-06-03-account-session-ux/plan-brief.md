# Account / Session UX Completion (S-06) — Plan Brief

> Full plan: `context/changes/account-session-ux/plan.md`
> Research: `context/changes/account-session-ux/research.md`

## What & Why

Make account/session UX coherent before the app is shown to users. Two fixes: a signed-in user can **sign out from anywhere** (today it's only reachable on `/dashboard`), and a signed-in user is **redirected off the login form** instead of being shown it while already authenticated. Closes the "I'm logged in but staring at a login screen" confusion and the "where's the sign-out button" gap (FR-004).

## Starting Point

Sign-out renders in exactly one live place — the inline form on `/dashboard`. The only other Sign-out carrier (`Topbar.astro`) lives solely in `Welcome.astro`, the unused old starter landing page imported nowhere, so it renders in no route (dead code). `Layout.astro` is boilerplate + a config-error banner + `<slot/>`, with no nav. Middleware (`src/middleware.ts`) only redirects *unauthenticated* users off `/dashboard`; it does nothing for authenticated users on `/auth/*`.

## Desired End State

Every page rendered through `Layout` shows a context-aware nav: authed → email + Dashboard + Sign out; anon → Sign in + Sign up. Visiting `/auth/signin|signup|forgot-password` while signed in lands you on `/`. The password-recovery flow and post-signup page are untouched. `Welcome.astro`/`Topbar.astro` are gone, and `/dashboard` has one Sign-out, not two.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Cross-device password reset (sub-item 4) | Defer to the SMTP/infra slice | `generateLink` fixes it but doesn't send email, coupling to custom-SMTP — keep S-06 dependency-free. | Plan |
| Global sign-out approach | Fold a nav into `Layout` + retire `Welcome`/`Topbar` | One global shell makes Sign-out reachable everywhere and removes dead code. | Plan |
| Idle-timeout (sub-item 3) | Defer (don't configure in v1) | Pro-plan-gated when hosted, no product-chosen window, not a launch requirement. | Plan |
| Redirect target for authed-on-`/auth/*` | Home `/` | `/` is the real product entry (the enhance workspace) for both anon + authed. | Plan |
| Nav content | Context-aware (authed + anon) | Also fixes that `/` has no auth affordance today; reuses Topbar's existing conditional. | Plan |
| Redirect scope | Explicit list: signin/signup/forgot-password only | Excludes `/auth/confirm` + `/auth/reset-password` (recovery) + `/auth/confirm-email` so those flows keep working. | Research |

## Scope

**In scope:**
- Middleware redirect of authenticated users off the credential-entry auth pages → `/`.
- A global, context-aware nav in `Layout.astro` (reusing Topbar's logic, restyled as a header).
- Delete `Welcome.astro` + `Topbar.astro`; remove the redundant inline Sign-out from `dashboard.astro`.

**Out of scope:**
- Idle-timeout config (sub-item 3) — deferred, tracked in roadmap Parked.
- Cross-device password reset (sub-item 4) — deferred to the SMTP/infra slice; fix path documented in research.
- Any Cloud-path code, new account pages, or auth-cookie mechanics.

## Architecture / Approach

Two small, independent phases reusing existing patterns. Phase 1 adds one guard to `src/middleware.ts` (an explicit `REDIRECT_WHEN_AUTHED` allow-list, mirroring the existing `PROTECTED_ROUTES.some(startsWith)` style) — pure logic, no visual surface. Phase 2 moves the context-aware auth conditional from `Topbar.astro` into a `Layout`-owned header nav (its own dark background so it reads as chrome on every full-bleed page), then deletes the dead components. Auth state comes from `Astro.locals.user` (set by middleware), so the nav is a server-rendered `.astro` component with no prop threading. Using middleware (not a per-page `.astro` frontmatter guard) sidesteps the typed-ESLint `.astro` top-level-return crash noted in `lessons.md`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Middleware redirect | Authed users no longer land on login/signup/forgot-password | Over-broad match breaking the recovery flow — mitigated by the explicit allow-list excluding confirm/reset-password/confirm-email |
| 2. Global nav + retire dead code | Sign-out reachable everywhere; `Welcome`/`Topbar` removed; single dashboard Sign-out | Nav styling on full-bleed pages (unstyled strip / content collision) — mitigated by giving the nav its own background; verified manually + mobile |

**Prerequisites:** none beyond S-02 (done). Local Supabase running for the reset-flow manual check.
**Estimated effort:** ~1 session across 2 phases (small, low-risk).

## Open Risks & Assumptions

- The new redirect must not catch the recovery pages — guarded by an explicit path list, and the Phase 1 manual check runs a full reset end-to-end to confirm.
- A recovery-session user viewing `/auth/reset-password` will see the global nav (with Sign-out) — harmless and accepted; not worth a per-page carve-out.
- Nav appearance across the cosmic-themed and auth pages is a visual judgment — covered by manual + mobile-portrait verification, not automated.

## Success Criteria (Summary)

- Signed in, Sign-out is visible and works on `/`, `/dashboard`, and reachable `/auth/*` pages; signing out lands on `/`.
- Visiting `/auth/signin|signup|forgot-password` while signed in redirects to `/`; signed out, they still render.
- A full password reset still completes end-to-end (recovery pages not bounced by the new redirect).
