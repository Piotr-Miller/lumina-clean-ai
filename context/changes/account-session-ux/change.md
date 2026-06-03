---
change_id: account-session-ux
title: "Account/session UX: global sign-out + redirect authed off /auth/*"
status: implementing
created: 2026-06-03
updated: 2026-06-03
---

## Notes

Roadmap entry **S-06** (`context/foundation/roadmap.md:152-164`). Prerequisite **S-02** (account-access-and-password-reset) done + archived. Parallel with S-04 (done), S-05, S-07 — touches no Cloud-path code (no `jobs`, no Edge Function, no cap logic).

**Outcome:** a signed-in user can sign out from anywhere in the app (not only `/dashboard`), is redirected to home instead of being shown the login form while already authenticated, is — optionally — signed out after a configured idle period, and can complete a password reset from a different device/browser than the one that requested it. Delivers PRD **FR-004** (sign out reachable); **FR-015** (cross-device reset); session-hygiene NFR (idle timeout, optional).

Four bundled sub-items of differing maturity:
1. **Global, always-reachable Sign-out control** (Topbar → shared Layout or global nav).
2. **Redirect already-authenticated users off `/auth/*`** (middleware).
3. **Idle-timeout** (optional; `supabase/config.toml` `[auth.sessions]`) — product hasn't committed to v1.
4. **Cross-device password reset** (PKCE same-browser-only → non-PKCE emitted token).

Internal research: `research.md` (2026-06-03). The cross-device reset *fix* additionally needs an external Context7 Supabase-Auth pass — internal research only maps the current code.
