# Idle Session Logout Implementation Plan

## Overview

Add an app-level idle session logout: any authenticated session with no server-visible activity for **30 minutes** is signed out on the next request. Enforcement lives in `src/middleware.ts` (the one seam every request passes through), driven by a plain httpOnly last-activity cookie and a pure, unit-tested decision helper. The Supabase-dashboard equivalent (Auth → Sessions → inactivity timeout) is a Pro-plan feature and the org is on Free — this middleware check is the Free-plan path (see `change.md` Notes for the full option analysis).

## Current State Analysis

- **Nothing expires an idle session today.** `supabase/config.toml:263-267` has `[auth.sessions]` (`timebox`, `inactivity_timeout`) commented out; `jwt_expiry = 3600` only rotates the access token — `@supabase/ssr` silently renews it via the refresh-token cookie, so sessions last until explicit sign-out.
- `src/middleware.ts:16-39` resolves the user per request (`getUser()` → `locals.user`), redirects anon users off `PROTECTED_ROUTES` (`/dashboard`) and authed users off `REDIRECT_WHEN_AUTHED` pages. No idle logic.
- **The app is anonymous-usable by design**: landing, guides, and the Local engine all work signed out; only Cloud AI is auth-gated (`CloudSignInPrompt`). An expired session therefore does not need to eject the user — clearing it downgrades them to a working anon experience.
- **Message plumbing exists**: `src/pages/auth/signin.astro:5` reads `?error=` → `SignInForm` → `ServerError` renders it. The repo convention (signin.ts, signup.ts, reset-password) is a human-readable, URL-encoded message in the `error` query param.
- `src/pages/api/auth/signout.ts:9` calls `supabase.auth.signOut()` — note supabase-js's default scope is `global` (revokes every device's session).
- Testing precedent: pure decision helpers get exhaustive unit suites (`src/components/hooks/cloud-job-decisions.ts` ↔ `tests/cloud-job-decisions.test.ts`); the middleware itself has no test harness; the E2E gate is a deliberately lean 5-spec set with a frozen locator contract and exercises signin + the dashboard redirect (`anon-dashboard-redirects-to-signin.spec.ts`).

## Desired End State

A signed-in user who makes no request for 30+ minutes is signed out on their next request:

- On a **protected route** (`/dashboard`): redirected to `/auth/signin?error=…` with a clear "signed out due to inactivity" notice rendered by the existing `ServerError`.
- On **any other page**: the page renders anonymously (nav shows Sign in; Local engine works; a cloud submit hits the existing sign-in gate). No interruption, no notice.
- Activity is any request that reaches the middleware while authenticated; each one slides the 30-minute window forward.
- Other devices' sessions are untouched (`scope: "local"`).

Verified by: the new unit suite (decision table incl. boundaries + malformed input), the full existing E2E gate (middleware is on every spec's critical path), and a manual cookie-backdating walkthrough.

### Key Discoveries:

- `src/middleware.ts:28-31` — the protected-route redirect is where the expiry notice attaches; the expiry decision must run **before** this check and must null `locals.user`.
- `src/pages/auth/signin.astro:5` + `src/components/auth/ServerError.tsx` — `?error=<encoded human message>` is the established notice channel; no new UI needed.
- **Deleting the activity cookie on any anonymous request structurally prevents the stale-cookie bug** (an old cookie surviving into a fresh session and insta-expiring it): the signin POST itself passes through the middleware as anon — cleanup is guaranteed before any new session's first authenticated request. No signin/signup handler changes needed.
- `supabase.auth.signOut()` default scope is `global` — an idle logout must pass `{ scope: "local" }` or it silently signs the user out of every device.
- Lesson `server-only-service-role-clients-live-in-their-own-module` — the helper must be a plain module with no `astro:*` imports so Vitest's Node environment can import it.

## What We're NOT Doing

- **No Supabase Pro upgrade** and no dashboard session settings — this change exists because that path is paywalled.
- **No `[auth.sessions]` in `supabase/config.toml`** — enabling it locally but not in prod (Free) would fork enforcement behavior between environments; the middleware is the single enforcement path everywhere.
- **No HMAC-signed cookie, no DB-backed `last_seen`** — decided in planning: tampering only extends the user's own idle window, and anyone who can edit cookies already owns that browser session.
- **No client-side idle timer, countdown, or pre-expiry warning UI.**
- **No env-configurable threshold** — a documented constant; flip to an env var later if operations ever need runtime tuning.
- **No new E2E spec** — the existing 5-spec gate guards the middleware path; expiry wiring is covered by units + manual verification.
- **No global refresh-token revocation** — idle logout is per-browser (`scope: "local"`); the Supabase server-side session record is not revoked.
- **No changes to `signin.ts` / `signup.ts` / `signout.ts`** — the cleanup-on-anon rule makes handler-side cookie resets unnecessary (see Key Discoveries).

## Implementation Approach

Two phases: first the pure policy module with exhaustive units (no runtime change), then the middleware wiring that consumes it. The decision function takes `(hasUser, cookieValue, nowMs)` and returns one of five actions — all branching is testable without Astro, and the middleware body stays a thin mechanical `switch`.

Decision table (the contract both phases share):

| `hasUser` | Cookie state                          | Action    | Middleware effect                                                                                        |
| --------- | ------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| no        | absent                                | `noop`    | nothing                                                                                                  |
| no        | present                               | `cleanup` | delete cookie (prevents stale-cookie carryover into a future session)                                    |
| yes       | absent / malformed / future-dated     | `start`   | set cookie to `nowMs` (fresh window)                                                                     |
| yes       | valid, `nowMs − ts < IDLE_TIMEOUT_MS` | `refresh` | set cookie to `nowMs` (slide window)                                                                     |
| yes       | valid, `nowMs − ts ≥ IDLE_TIMEOUT_MS` | `expire`  | `signOut({scope:"local"})` + delete cookie + `locals.user = null` (+ notice on protected-route redirect) |

## Critical Implementation Details

- **Ordering & lifecycle**: the idle check runs immediately after `getUser()` resolves `locals.user` and **before** the `PROTECTED_ROUTES` check, so an expired user hitting `/dashboard` falls through to the existing redirect — but with an `idleExpired` flag routing it to `/auth/signin?error=<notice>` instead of the bare `/auth/signin`.
- **signOut scope**: must be `{ scope: "local" }` — the supabase-js default is `global`. `scope: "local"` also revokes the current session's refresh token server-side (`admin.signOut` inside `_signOut`), which is why it stays the primary path.
- **signOut failure is NOT fail-closed by itself** (plan-review F1, verified in `@supabase/auth-js/src/GoTrueClient.ts` `_signOut`): on an unexpected error (anything other than 401/403/404/session-missing) the method returns **before** `_removeSession()`, so the `SIGNED_OUT` event never fires and `@supabase/ssr` never deletes the `sb-*` auth cookies — the next request would re-authenticate. The middleware must therefore add a **fallback purge**: when `signOut` returns or throws an unexpected error, delete every request cookie whose name starts with `sb-` (covers the base `sb-<ref>-auth-token`, its chunked `.0`/`.1`… variants, and the `-code-verifier` sibling — prefix matching is deliberately shape-agnostic), then proceed with the activity-cookie delete + `locals.user = null`. Residual (accepted): on this fallback path the refresh token is not revoked server-side — the browser session still dies, which is the contract; server-side revocation was already best-effort under `scope: "local"`.
- **Cookie persistence**: set an explicit `maxAge` well beyond the timeout (7 days), NOT a session cookie — a session cookie vanishes on browser restart while the `sb-*` auth cookies persist, which would silently _reset_ the idle window on every restart (a loophole in exactly the shared-device scenario this feature targets).
- **Future-dated timestamps** (clock edits, tampering) must map to `start`, not `refresh` — resetting to `nowMs` keeps the window honest without special-casing.

## Phase 1: Idle-Decision Helper + Unit Tests

### Overview

The pure policy module and its test suite. No runtime behavior changes in this phase.

### Changes Required:

#### 1. Decision helper

**File**: `src/lib/idle-session.ts` (new)

**Intent**: Own every policy decision — threshold, cookie name, notice copy, and the five-way action decision — as a plain module with zero Astro imports so Vitest Node can import it directly.

**Contract**: Exports:

- `IDLE_TIMEOUT_MS = 30 * 60 * 1000` (documented as the deliberate strict choice; tunable here only)
- `ACTIVITY_COOKIE = "lc-last-activity"` (value: last-activity epoch milliseconds as a decimal string)
- `IDLE_SIGNOUT_MESSAGE` — the human-readable notice for the signin `?error=` param (e.g. "You were signed out after 30 minutes of inactivity. Please sign in again.")
- `decideIdleAction(hasUser: boolean, cookieValue: string | undefined, nowMs: number): "noop" | "cleanup" | "start" | "refresh" | "expire"` — implements the decision table above. Malformed = non-numeric, empty, negative, or `> nowMs` (future-dated). Boundary: exactly `IDLE_TIMEOUT_MS` elapsed → `expire`.

#### 2. Unit suite

**File**: `tests/idle-session.test.ts` (new)

**Intent**: Exhaustive coverage of the decision table, following the `tests/cloud-job-decisions.test.ts` structure (one describe per input regime).

**Contract**: Must cover — anon×{no cookie, cookie} → `noop`/`cleanup`; authed×{missing, empty, non-numeric, negative, future-dated} → `start`; authed×{just-set, 1 ms before threshold} → `refresh`; authed×{exactly at threshold, past threshold} → `expire`; and the exported constants' basic sanity (timeout is 30 min, cookie name stable).

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run test:unit` passes — new `idle-session` suite green, existing 277 untouched
- Lint clean on touched files (`npx prettier --write` + `npx eslint` on the two new files — per the CRLF lesson, not repo-wide)

#### Manual Verification:

- (none — pure logic phase, no runtime surface)

**Implementation Note**: No pause needed after this phase (no manual items); proceed to Phase 2 once automated checks pass.

---

## Phase 2: Middleware Wiring + Expiry Notice

### Overview

Consume the helper in `onRequest`: slide the window on authed requests, clean up on anon requests, and on expiry sign out locally + surface the notice on protected-route redirects.

### Changes Required:

#### 1. Middleware

**File**: `src/middleware.ts`

**Intent**: Enforce the idle policy on every request. Mechanical `switch` on `decideIdleAction(...)` placed after `locals.user` resolution and before the `PROTECTED_ROUTES` check.

**Contract**:

- `cleanup` → `context.cookies.delete(ACTIVITY_COOKIE, { path: "/" })`
- `start` / `refresh` → `context.cookies.set(ACTIVITY_COOKIE, String(nowMs), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 })`
- `expire` → `await supabase.auth.signOut({ scope: "local" })`; if it returns or throws an unexpected error, `console.error` it (operator trace for repeated expiry failures — review F1 blind spot) and purge every request cookie with the `sb-` prefix (iterate `parseCookieHeader(requestHeaders.get("Cookie"))`, `context.cookies.delete(name, { path: "/" })` for each match — see Critical Implementation Details); in all cases delete the activity cookie + `locals.user = null`, and set an `idleExpired` flag
- The existing protected-route redirect becomes: `idleExpired ? "/auth/signin?error=" + encodeURIComponent(IDLE_SIGNOUT_MESSAGE) : "/auth/signin"`
- Everything else in the middleware (REDIRECT_WHEN_AUTHED narrow allow-list and its comment) stays byte-identical.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run test:unit` passes (full suite)
- Lint clean on touched files
- Full existing E2E gate green: `npm run test:e2e` (5 specs, no new ones — middleware sits on every spec's critical path; run per the test-plan §6.3 recipe / e2e-local-run notes)

#### Manual Verification:

- Signed in: `lc-last-activity` cookie appears and its value advances on each navigation (devtools → Application → Cookies)
- Backdate the cookie >30 min (devtools edit) → request `/dashboard` → redirected to signin with the inactivity notice rendered by `ServerError`
- Backdate again on a fresh session → request `/` (landing) → page renders anonymously (nav shows Sign in), Local engine still enhances a photo
- Explicit signout (button) still works; on the next anon request the activity cookie is deleted (cleanup path)
- Scope check (plan-review F2): sign the same user in from a second browser/profile, idle-expire session A (backdated cookie + request), confirm session B still reaches `/dashboard` — proves `{ scope: "local" }` is actually in effect

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- The full decision table in `tests/idle-session.test.ts` (see Phase 1 Contract) — every action, every malformed-input class, both boundary sides.
- Optional quality check: a scoped mutation run `npx stryker run --mutate "src/lib/idle-session.ts"` — the helper is a pure decision module (cheap per-mutant), though it is not a test-plan risk-module gate.

### Integration Tests:

- None new. The middleware has no harness (building one couples tests to `astro:middleware` internals — rejected in planning); the E2E gate provides the integration signal.

### Manual Testing Steps:

1. Sign in, navigate twice, confirm the cookie timestamp advances.
2. Edit the cookie to `Date.now() - 31*60*1000`, hit `/dashboard`, confirm the signin redirect + notice.
3. Repeat the edit, hit `/`, confirm anonymous render + working Local engine.
4. Confirm a cloud submit after silent expiry shows the existing `CloudSignInPrompt` (no crash, no stuck state).
5. Two-session scope check: sign in from a second browser/profile as the same user, idle-expire the first session, confirm the second still reaches `/dashboard` (F2).

## Performance Considerations

One string parse + one `Set-Cookie` header per authenticated request (and a one-time cookie delete per anon request that still carries the cookie). No DB reads/writes, no crypto. Pages are SSR-uncached, so the per-response `Set-Cookie` has no cache-poisoning surface.

## Migration Notes

No data, no schema, no secrets. Deploy = merge to master (CI deploys the Worker). Rollback = revert the middleware commit; lingering `lc-last-activity` cookies in browsers are inert (nothing reads them) and expire via `maxAge` within 7 days.

## References

- Decision context & option analysis: `context/changes/session-idle-timeout/change.md` (Notes)
- Middleware seam: `src/middleware.ts:16-39`
- Notice plumbing precedent: `src/pages/auth/signin.astro:5`, `src/components/auth/ServerError.tsx`
- Decision-helper test pattern: `tests/cloud-job-decisions.test.ts`
- Known consequence (accepted in planning): an island-heavy enhance session with no navigations/API calls for >30 min expires silently mid-page; the next cloud submit lands on the existing sign-in gate. Cloud cold-boot (~5 min ceiling) stays well inside the window.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Idle-Decision Helper + Unit Tests

#### Automated

- [x] 1.1 `npm run typecheck` passes
- [x] 1.2 `npm run test:unit` passes (new idle-session suite green, existing 277 untouched)
- [x] 1.3 Lint clean on touched files

### Phase 2: Middleware Wiring + Expiry Notice

#### Automated

- [ ] 2.1 `npm run typecheck` passes
- [ ] 2.2 `npm run test:unit` passes (full suite)
- [ ] 2.3 Lint clean on touched files
- [ ] 2.4 Full existing E2E gate green (`npm run test:e2e`, 5 specs)

#### Manual

- [ ] 2.5 Activity cookie set + advances per navigation (devtools)
- [ ] 2.6 Backdated cookie → `/dashboard` → signin redirect with inactivity notice
- [ ] 2.7 Backdated cookie → `/` renders anonymously, Local engine works
- [ ] 2.8 Explicit signout unaffected; cookie cleaned on next anon request
- [ ] 2.9 Second browser/profile session survives session A's idle expiry (scope: local proven)
