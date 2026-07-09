# Idle Session Logout — Plan Brief

> Full plan: `context/changes/session-idle-timeout/plan.md`
> Decision context: `context/changes/session-idle-timeout/change.md` (Notes)

## What & Why

Sign users out after **30 minutes of inactivity**. Today nothing expires an idle session — `@supabase/ssr` silently renews tokens forever, so a session on a shared or unattended device stays live until an explicit sign-out. The Supabase-dashboard fix (Auth → Sessions → inactivity timeout) is a **Pro-plan feature and the org is on Free**, so enforcement moves into the app's middleware. Post-MVP hardening — defense-in-depth, not a gap in the cost/privacy model.

## Starting Point

`src/middleware.ts` already resolves the user on every request and redirects anon users off `/dashboard`. The app is anonymous-usable by design (Local engine works signed out; only Cloud AI is auth-gated), and the signin page already renders `?error=` messages via `ServerError`. No idle logic exists anywhere; `[auth.sessions]` in `config.toml` is commented out.

## Desired End State

A user idle for 30+ minutes is signed out on their next request: on `/dashboard` they land on signin with a "signed out due to inactivity" notice; everywhere else the page simply renders anonymously and the Local engine keeps working. Every authenticated request slides the window forward. Other devices' sessions are untouched.

## Key Decisions Made

| Decision           | Choice                                             | Why (1 sentence)                                                                                             | Source |
| ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| Enforcement layer  | App middleware (not Supabase dashboard)            | Dashboard toggle is Pro-only; org is on Free.                                                                | Notes  |
| Idle threshold     | **30 minutes (strict)**                            | User chose the strict window over the 8h default — strongest shared-device protection.                       | Plan   |
| Expiry UX          | Silent anon downgrade; notice only on `/dashboard` | Matches the anon-first design — ejecting users off pages that work signed-out would be hostile.              | Plan   |
| Activity tracking  | Plain httpOnly timestamp cookie                    | Tampering only extends your own window; HMAC/DB tracking is real cost for no real threat.                    | Plan   |
| Sign-out scope     | `{ scope: "local" }`                               | supabase-js default is `global` — would kill the user's other devices.                                       | Plan   |
| signOut failure    | Fallback purge of all `sb-*` request cookies       | auth-js returns before session removal on unexpected errors — cookies would survive and re-auth (review F1). | Review |
| Testing depth      | Unit-tested pure decision helper; no new E2E spec  | Matches the repo's decision-helper pattern; the existing 5-spec gate already covers the middleware.          | Plan   |
| config.toml parity | Do NOT enable `[auth.sessions]` locally            | Local-only server enforcement would fork behavior between environments; middleware is the single path.       | Plan   |

## Scope

**In scope:**

- New pure helper `src/lib/idle-session.ts` (threshold, cookie name, notice copy, 5-action decision function) + exhaustive unit suite
- `src/middleware.ts` wiring: slide window when authed, clean up when anon, sign out + notice on expiry

**Out of scope:**

- Pro upgrade, HMAC/DB tracking, client-side idle timer or warning UI, env-configurable threshold, new E2E specs, global refresh-token revocation, any signin/signup/signout handler changes

## Architecture / Approach

A five-action decision table (`noop | cleanup | start | refresh | expire`) computed by a pure function from `(hasUser, cookieValue, nowMs)`; the middleware is a thin mechanical `switch` over it. The **cleanup-on-anon** rule is the load-bearing trick: deleting the cookie on any anonymous request (including the signin POST itself) makes it structurally impossible for a stale cookie to insta-expire a fresh session — which is why no auth-handler changes are needed.

## Phases at a Glance

| Phase                           | What it delivers                                            | Key risk                                                                 |
| ------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Idle-decision helper + units | The whole policy as a tested pure module; no runtime change | Boundary/malformed-input semantics wrong → caught by the unit table      |
| 2. Middleware wiring + notice   | Enforcement live on every request + signin notice           | Middleware sits on every request — regression guard is the full E2E gate |

**Prerequisites:** none (no secrets, no migrations, no deploy config)
**Estimated effort:** ~1 session across both phases

## Open Risks & Assumptions

- **Accepted consequence of 30 min**: an island-heavy enhance session (sliders only, no navigations/API calls) produces no middleware traffic — a >30-min editing pause expires the session silently mid-page; the next cloud submit lands on the existing sign-in gate. Cloud cold-boot (~5 min ceiling) stays well inside the window.
- Idle logout is per-browser: `scope: "local"` revokes only this session's refresh token; on the F1 fallback path (auth API unhealthy) even that revocation is skipped — the browser session still dies, which is the contract. Scope-local behavior is now explicitly verified by a two-browser manual step (review F2).
- A deliberate user can defeat their own idle logout by editing the cookie — accepted; the threat is casual shared-device access.

## Success Criteria (Summary)

- Backdated activity cookie → `/dashboard` redirects to signin with the inactivity notice; `/` renders anonymously with a working Local engine
- New unit suite covers the full decision table (both boundary sides, all malformed classes); existing 277 tests + the 5-spec E2E gate stay green
- Explicit signout and other-device sessions behave exactly as before
