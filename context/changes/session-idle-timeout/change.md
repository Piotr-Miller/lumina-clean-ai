---
change_id: session-idle-timeout
title: Idle session logout — post-MVP security hardening
status: implementing
created: 2026-07-08
updated: 2026-07-08
archived_at: null
---

## Notes

**Post-MVP** (user decision, 2026-07-08): parked hardening, not part of the current
scope — planned/implemented only when picked up explicitly.

Origin (session 2026-07-08): the app currently has **no idle logout** anywhere.
Findings from the investigation:

- `supabase/config.toml:263-267` — `[auth.sessions]` (`timebox`, `inactivity_timeout`)
  is commented out; local defaults = sessions never expire on idle.
- `jwt_expiry = 3600` is NOT a logout — `@supabase/ssr` silently renews the access
  token via the refresh-token cookie (rotation enabled), so sessions last until
  explicit sign-out.
- No app-level idle logic: `src/middleware.ts` only calls `getUser()` per request;
  no client-side idle timer.
- **Prod blocker: the Supabase org is on the FREE plan** (verified via MCP,
  org `cqbfrshdnawpivbapygc`). Inactivity timeout / time-boxed sessions in
  Dashboard → Authentication → Sessions are **Pro-plan features ($25/mo)** — not
  clickable on Free.

Options (from the discussion):

1. **App-level middleware idle logout** — the only real path on Free: track
   last-activity (signed timestamp cookie refreshed per authenticated request);
   past threshold → `supabase.auth.signOut()` + redirect to signin. ~30 lines in
   `src/middleware.ts` + tests. Caveat: guards this app's session cookie only;
   the Supabase refresh token stays technically valid until rotation.
2. **Upgrade to Pro** and click it out in the dashboard (+ mirror by uncommenting
   `[auth.sessions]` in `config.toml` for local parity).
3. Client-only idle timer — rejected (trivially bypassed, weakest).

Risk context (why post-MVP is fine): photos purge ≤24h (retention reaper), cloud
spend bounded by the global daily cap, no billing/PII surface beyond email —
idle logout is defense-in-depth, not a gap in the cost/privacy model.
