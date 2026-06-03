# Account / Session UX Completion (S-06) Implementation Plan

## Overview

Make account/session UX coherent before the app is shown to users. Two user-visible fixes: (1) a global, always-reachable **Sign-out** control via a nav in the shared `Layout`, and (2) **middleware that redirects already-authenticated users off the login/signup/forgot-password pages** so a signed-in user never stares at a login form. Two further S-06 sub-items — idle-timeout and cross-device password reset — are deliberately **deferred** (see What We're NOT Doing) and remain tracked in `roadmap.md` Parked.

## Current State Analysis

- **Sign-out is reachable in exactly one place**: the inline form on `/dashboard` (`src/pages/dashboard.astro:17-24`). The only other Sign-out carrier, `src/components/Topbar.astro`, is mounted solely in `src/components/Welcome.astro:2,28` — which is the **unused old starter landing page** (10x Astro Starter hero + feature cards) and is imported **nowhere** (`src/pages/index.astro` renders the `EnhanceWorkspace` island directly). So the Topbar renders in no live route; `Welcome.astro` + `Topbar.astro` are dead code.
- **`Layout.astro` is not a shell**: `src/layouts/Layout.astro:1-50` renders `<head>`, the config-error `Banner`, and `<slot/>` — no nav. Every page paints its own full-screen background (`bg-cosmic min-h-screen`).
- **Middleware only guards unauthenticated access**: `src/middleware.ts:1-25` resolves `context.locals.user` via `supabase.auth.getUser()` on every request and redirects *unauthenticated* users off `PROTECTED_ROUTES = ["/dashboard"]` to `/auth/signin`. It has **no logic for authenticated users on `/auth/*`** — the gap this plan closes.
- **`Topbar.astro` already encodes the desired nav logic**: authed → email + Dashboard link + Sign-out form; anon → Sign in + Sign up links (`src/components/Topbar.astro:8-36`). Only its styling (a `mb-4` rounded card meant to sit inside the hero) needs adapting for global-header use.
- **Auth route set** (`src/pages/auth/`): `signin.astro`, `signup.astro`, `forgot-password.astro`, `confirm-email.astro` (pages), `reset-password.astro` (self-guards on `locals.user`, `:7-11`), `confirm.ts` (API token exchange). `/api/auth/*` (incl. `signout`) is a separate prefix.

### Key Discoveries:

- `src/components/Topbar.astro:8-36` — reusable context-aware auth nav conditional (the content for the new global nav).
- `src/middleware.ts:4,18-22` — `PROTECTED_ROUTES` + the single guard block; the authed-redirect check slots in alongside it.
- `src/pages/auth/reset-password.astro:7-11` — in-repo precedent for a frontmatter `return Astro.redirect()` guard (relevant only if we ever guard per-page; this plan uses middleware instead, sidestepping the `.astro` top-level-return lint caveat in `lessons.md`).
- `src/layouts/Layout.astro:21-38` — body region where the nav mounts (above `<slot/>`); `Astro.locals.user` is available in any `.astro` component for free.
- The recovery flow requires `/auth/confirm` and `/auth/reset-password` to remain reachable while a (recovery) session is active — so they must be **excluded** from the authed-redirect.

## Desired End State

- A signed-in user sees a Sign-out control on **every** page rendered through `Layout` (home, dashboard, auth pages), and signing out works from anywhere.
- An anonymous visitor sees Sign in / Sign up entry points in the same nav (fixes that `/` has no auth affordance today).
- Navigating to `/auth/signin`, `/auth/signup`, or `/auth/forgot-password` while already authenticated lands the user on `/` instead of a login form.
- The password-recovery flow (`/auth/confirm` → `/auth/reset-password`) and the post-signup `/auth/confirm-email` page are unaffected.
- `Welcome.astro` and `Topbar.astro` are removed; `/dashboard` has a single Sign-out (from the global nav), not two.
- Verify by: signing in and confirming Sign-out is visible/working on `/`, `/dashboard`, `/auth/signin`; hitting `/auth/signin` while signed in and landing on `/`; completing a password reset end-to-end (recovery pages still reachable).

## What We're NOT Doing

- **Idle-timeout / session inactivity (sub-item 3)** — NOT configured. `[auth.sessions]` stays commented in `supabase/config.toml:262-267`. It is a Supabase Pro-plan feature when hosted and has no product-chosen window. Remains tracked in `roadmap.md` Parked.
- **Cross-device password reset (sub-item 4)** — NOT changed. The current `resetPasswordForEmail` PKCE flow (same-browser only) is kept; it was verified end-to-end in S-02. The proven fix (admin `generateLink` → plain token) requires the app to send its own email, which couples to the parked custom-SMTP infra slice — deferred there. Fix path is documented in `research.md` (Follow-up Research) and `roadmap.md` Parked.
- **No changes to the Cloud path** — no `jobs`, no Edge Function, no cap logic. Zero overlap with S-05/S-07/S-08.
- **No new account/profile pages** — `/dashboard` stays the thin stub it is.
- **No auth-provider or session-cookie mechanics changes** — `src/lib/supabase.ts` is untouched.

## Implementation Approach

Two small, independent phases. Phase 1 is pure middleware logic (no visual surface, easy to verify). Phase 2 is the nav/chrome change plus dead-code retirement. They can land in either order; middleware first de-risks the auth-routing behavior before touching shared layout. Both reuse existing patterns (the `PROTECTED_ROUTES.some(startsWith)` guard style; the Topbar conditional). Auth state flows from middleware via `Astro.locals.user`, so the nav stays a server-rendered `.astro` component with no prop threading.

## Critical Implementation Details

**Redirect exclusions (Phase 1).** The authed-redirect must target only the credential-entry pages and must NOT fire on `/auth/confirm`, `/auth/reset-password`, or `/auth/confirm-email`. Use an explicit allow-list of redirect-on-auth paths rather than a broad `/auth/*` match — a broad match would (a) break the recovery flow (a recovery session presents as `locals.user`, so the user would be bounced off `reset-password`) and (b) need a carve-out for `/api/auth/*`. An explicit list avoids both.

**Nav placement & background (Phase 2).** Pages render their own `min-h-screen` full-bleed backgrounds, and `Layout` currently has no global background. The nav must carry **its own background** (a dark, theme-matching header bar) so it never appears as unstyled content on the bare `<body>`. Render it as a normal-flow full-width header at the top of the body, above `<slot/>`; page content flows beneath (a small amount of extra scroll on `min-h-screen` pages is acceptable). Do not use a fixed/transparent overlay — the existing pages have no top padding reserved for it and content would collide.

## Phase 1: Middleware — redirect authenticated users off auth pages

### Overview

Stop showing login/signup/forgot-password forms to users who already have a session, sending them to `/` instead. Recovery and post-signup pages are excluded.

### Changes Required:

#### 1. Request middleware

**File**: `src/middleware.ts`

**Intent**: After `context.locals.user` is resolved, if the user is authenticated and the request targets one of the credential-entry auth pages, redirect to `/`. Leave the existing unauthenticated-`PROTECTED_ROUTES` guard as-is; the two checks target disjoint route sets.

**Contract**: Add a module-level `REDIRECT_WHEN_AUTHED = ["/auth/signin", "/auth/signup", "/auth/forgot-password"]`. New guard (placed near the existing `PROTECTED_ROUTES` block, after `locals.user` is set): if `context.locals.user` is truthy AND `REDIRECT_WHEN_AUTHED.some((route) => context.url.pathname.startsWith(route))`, `return context.redirect("/")`. Must NOT match `/auth/confirm`, `/auth/reset-password`, `/auth/confirm-email`, or any `/api/auth/*` path (the explicit list guarantees this). No change to `getUser()` resolution.

**Load-bearing note (must be in the code):** add a comment on `REDIRECT_WHEN_AUTHED` stating it is deliberately a narrow allow-list — **do NOT broaden to a blanket `/auth/*` `startsWith`**, because a recovery session presents as `locals.user`, so a broad match would bounce users off `/auth/confirm` + `/auth/reset-password` and silently break password reset (and would also need a `/api/auth/*` carve-out). This is the one correctness-critical property of the phase and has no automated regression guard (no middleware test harness in the repo).

### Success Criteria:

#### Automated Verification:

- Build passes (includes type check): `npm run build`
- Lint passes on the touched file (Windows CRLF baseline — scope to touched file per `lessons.md`): `npx prettier --write src/middleware.ts && npx eslint src/middleware.ts`

#### Manual Verification:

- Signed in, visiting `/auth/signin`, `/auth/signup`, and `/auth/forgot-password` each redirects to `/`.
- Signed out, those three pages still render their forms normally.
- A full password reset still works: request reset → open the emailed link → `/auth/confirm` exchanges the token → `/auth/reset-password` form is reachable and accepts a new password (NOT bounced by the new redirect).
- `/auth/confirm-email` is reachable after sign-up (not redirected).
- The existing `/dashboard` guard still redirects a signed-out user to `/auth/signin`.

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual testing before starting Phase 2.

---

## Phase 2: Global nav in Layout + retire dead components

### Overview

Add a context-aware nav to the shared `Layout` so Sign-out (and anon Sign in / Sign up) is reachable on every page, then delete the orphaned `Welcome.astro` and `Topbar.astro` and remove the redundant inline Sign-out from `/dashboard`.

### Changes Required:

#### 1. Shared layout gains a global nav

**File**: `src/layouts/Layout.astro`

**Intent**: Read the current user from `Astro.locals` and render a global header nav (the context-aware auth controls) above the page `<slot/>`. The nav carries its own dark, theme-matching background so it reads as intentional chrome on every page.

**Contract**: Add `const { user } = Astro.locals;` to the frontmatter. In the body, before `<slot/>` (and after/around the existing config-error `Banner` block), render a full-width `<header>`/`<nav>` with: brand/link to `/`; when `user` → user email + `Dashboard` link + Sign-out `<form method="POST" action="/api/auth/signout">`; when not `user` → `Sign in` (`/auth/signin`) + `Sign up` (`/auth/signup`) links. Port the conditional from `src/components/Topbar.astro:8-36`, restyled as a header bar (drop the `mb-4` rounded-card framing; give the bar its own background). Sign-out contract unchanged (`POST /api/auth/signout` → 302 `/`). May be implemented inline in `Layout.astro` or extracted to a new `src/components/Nav.astro` that `Layout` renders — either satisfies "nav owned by Layout".

#### 2. Remove the redundant dashboard Sign-out

**File**: `src/pages/dashboard.astro`

**Intent**: With the global nav providing Sign-out, the page-local Sign-out form is redundant and would double up. Remove it; keep the rest of the dashboard card.

**Contract**: Delete the `<form method="POST" action="/api/auth/signout">…</form>` block (`src/pages/dashboard.astro:17-24`). The `const { user } = Astro.locals;` and the welcome copy stay.

#### 3. Delete dead components

**File**: `src/components/Welcome.astro`, `src/components/Topbar.astro`

**Intent**: Both are now unused — `Welcome.astro` is the orphaned old starter landing page (imported nowhere), and `Topbar.astro` is only referenced by `Welcome.astro`; its logic has moved into the Layout nav.

**Contract**: Delete both files. Confirm no remaining importers (grep `Welcome` / `Topbar` across `src/` returns nothing after the Layout change). `src/pages/index.astro` is unaffected (never imported `Welcome`).

### Success Criteria:

#### Automated Verification:

- Build passes (and fails loudly if any deleted component is still imported): `npm run build`
- Lint passes on touched files (scope to touched files per `lessons.md`): `npx prettier --write src/layouts/Layout.astro src/pages/dashboard.astro && npx eslint src/layouts/Layout.astro src/pages/dashboard.astro`
- No dangling references: grep for `Welcome` and `Topbar` under `src/` returns no import statements.

#### Manual Verification:

- Signed in: the nav with a working Sign-out appears on `/`, `/dashboard`, and `/auth/*` pages (when reachable); clicking Sign-out logs out and lands on `/`.
- Signed out: the nav shows Sign in / Sign up on `/` and `/dashboard`→(redirect)→`/auth/signin`.
- `/dashboard` shows exactly one Sign-out control (from the nav), not two.
- The nav looks intentional (its own background) on the cosmic-themed pages and the auth pages — no unstyled white strip, no content collision.
- On `/` as an anonymous visitor, the header nav (Sign in / Sign up) and the contextual `CloudSignInPrompt` (shown on the Cloud-AI toggle, `src/components/enhance/EnhanceWorkspace.tsx:180`) coexist without reading as redundant or colliding.
- Mobile-portrait: the nav is usable (no overflow/overlap) on a narrow viewport.

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual testing. This is the final phase.

---

## Testing Strategy

### Unit Tests:

- None added. This change is auth-routing + server-rendered chrome; behavior is verified via build + manual click-through. (No existing middleware/layout unit tests to extend.)

### Integration Tests:

- Covered by the manual end-to-end reset flow check (Phase 1) — the highest-risk interaction (new redirect vs the recovery pages).

### Manual Testing Steps:

1. Signed out, load `/` → nav shows Sign in / Sign up; load `/auth/signin` → form renders.
2. Sign in → redirected to `/`; nav now shows email + Dashboard + Sign out on `/`.
3. Visit `/auth/signin`, `/auth/signup`, `/auth/forgot-password` while signed in → each redirects to `/`.
4. On `/dashboard` → exactly one Sign-out (nav); click it → signed out, on `/`.
5. Signed out, run a full password reset: forgot-password → emailed link → `/auth/confirm` → `/auth/reset-password` accepts new password → signed in. (Confirms the redirect didn't break recovery.)
6. Narrow viewport: nav usable, no overlap.

## Migration Notes

No data or schema changes. Pure code (middleware + layout) and file deletions. Rollback = revert the commit(s); deleting `Welcome.astro`/`Topbar.astro` is safe because they have no live importers.

## References

- Research (codebase + Context7): `context/changes/account-session-ux/research.md`
- Roadmap slice S-06: `context/foundation/roadmap.md:152-164`; parked sub-items: `:226-228`
- Reusable nav logic: `src/components/Topbar.astro:8-36`
- Middleware guard pattern: `src/middleware.ts:18-22`
- Frontmatter-redirect precedent: `src/pages/auth/reset-password.astro:7-11`
- Lint caveat (Windows CRLF; `.astro` top-level return): `context/foundation/lessons.md` (Prettier CRLF baseline; typed-ESLint `.astro` return-crash)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Middleware — redirect authenticated users off auth pages

#### Automated

- [x] 1.1 Build passes (`npm run build`)
- [x] 1.2 Lint passes on `src/middleware.ts` (prettier + eslint, scoped)

#### Manual

- [x] 1.3 Signed in, `/auth/signin|signup|forgot-password` each redirect to `/`
- [x] 1.4 Signed out, those three pages render forms normally
- [x] 1.5 Full password reset still works end-to-end (recovery pages not bounced)
- [x] 1.6 `/auth/confirm-email` reachable after sign-up (not redirected)
- [x] 1.7 `/dashboard` still redirects a signed-out user to `/auth/signin`

### Phase 2: Global nav in Layout + retire dead components

#### Automated

- [ ] 2.1 Build passes (`npm run build`)
- [ ] 2.2 Lint passes on `src/layouts/Layout.astro` + `src/pages/dashboard.astro` (scoped)
- [ ] 2.3 No dangling `Welcome`/`Topbar` imports under `src/`

#### Manual

- [ ] 2.4 Signed in: working Sign-out nav on `/`, `/dashboard`, `/auth/*`; Sign-out lands on `/`
- [ ] 2.5 Signed out: nav shows Sign in / Sign up
- [ ] 2.6 `/dashboard` shows exactly one Sign-out control
- [ ] 2.7 Nav looks intentional (own background) on cosmic + auth pages; no collision
- [ ] 2.8 Anon on `/`: header nav + CloudSignInPrompt coexist without redundancy/collision
- [ ] 2.9 Mobile-portrait: nav usable, no overflow/overlap
