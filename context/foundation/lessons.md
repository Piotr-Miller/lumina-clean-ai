# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Revoke Supabase's blanket grants from anon + authenticated, but never from service_role

- **Context**: Any new table in `public.*` created via a Supabase migration where RLS will be the primary defense.
- **Problem**: Supabase's bootstrap applies default-privilege grants (SELECT/INSERT/UPDATE/DELETE/REFERENCES/TRIGGER/TRUNCATE) to `anon`, `authenticated`, **and** `service_role` on every new public table. Without an explicit REVOKE, anon has grant-layer access (only RLS stops it) — one stray RLS policy unlocks the data. But if the REVOKE also covers `service_role`, every admin-client code path breaks with `permission denied for table X`: service_role has BYPASSRLS, but Postgres grants and RLS are orthogonal gates.
- **Rule**: In every new-table migration, `revoke all on <table> from anon, authenticated;` then re-grant only the minimum the RLS policies act on (typically `select, insert` for owner-scoped tables). Do NOT revoke from `service_role` — leave its blanket grants intact so admin-client code paths keep working.
- **Applies to**: plan, plan-review, implement, impl-review

## Tables broadcasting RLS-scoped UPDATE/DELETE via Realtime need REPLICA IDENTITY FULL

- **Context**: Any table added to the `supabase_realtime` publication that has RLS AND will broadcast UPDATE or DELETE events to user-JWT-scoped subscribers.
- **Problem**: Supabase Realtime evaluates the RLS SELECT policy against BOTH the old and new row state before delivering an UPDATE/DELETE event. The default `REPLICA IDENTITY` carries only primary-key columns in the WAL, so Realtime can't reconstruct the old row's full state to run the RLS check — and silently drops the event. Subscribers see SUBSCRIBED, then nothing.
- **Rule**: In the same migration that adds a table to `supabase_realtime`, also run `alter table <table> replica identity full;` if user-JWT subscribers will ever receive UPDATE or DELETE events. INSERT-only broadcasts don't need it.
- **Applies to**: plan, implement, impl-review

## supabase-js HTTP-header auth alone does NOT authenticate the Realtime WebSocket

- **Context**: Any supabase-js client constructed with `global.headers.Authorization = Bearer <jwt>` (the common pattern for sharing a user JWT across REST calls) that will also subscribe to a Realtime channel.
- **Problem**: PostgREST reads the HTTP Authorization header on each request, so REST calls run as the user (RLS applies). But supabase-js maintains a SEPARATE auth channel for the Realtime WebSocket — without explicit auth, it connects as anon, RLS sees `auth.uid() = null`, and the SELECT policy excludes every row from delivery. Subscriptions appear to succeed (SUBSCRIBED status) but never receive events.
- **Rule**: After building a JWT-scoped supabase-js client, always `await client.realtime.setAuth(jwt)` before subscribing to channels. Alternatively, use `auth.setSession({access_token, refresh_token})` which propagates auth to both REST and Realtime in one step.
- **Applies to**: plan, implement, impl-review

## Server-only service-role clients live in their own module, not next to `astro:env/server` importers

- **Context**: Astro projects where some server modules import from `astro:env/server` and a server-only utility (e.g. service-role Supabase client) is added that needs to be callable from a Vitest Node environment.
- **Problem**: JS module loading is all-or-nothing. Co-locating the new utility with existing `astro:env/server` importers means any test importing the utility loads the whole module — and Vitest's Node environment can't resolve `astro:env/server` (it's an Astro build-time virtual module). The test suite fails at module load with "Cannot find package 'astro:env/server'", even when the utility itself doesn't depend on the virtual module.
- **Rule**: When adding a server-only utility that tests will import (admin clients, signing helpers, etc.), put it in its own file with NO `astro:env/server` imports. Pass env in as a parameter at the call site (production callers resolve from `astro:env/server`; tests resolve from `process.env`). Don't try to make a single module work for both contexts.
- **Applies to**: plan, plan-review, implement

## The Windows checkout has a pre-existing Prettier CRLF baseline — adapt phase-1.2 lint, don't bundle the fix

- **Context**: Any `/10x-implement` phase on a Windows checkout of this repo where `npm run lint` is a success criterion.
- **Problem**: The repo's existing files are CRLF (Windows default) but Prettier expects LF — `npm run lint` reports ~1022 pre-existing `Delete ␍` errors regardless of what the current phase touched. Treating this as a phase-blocking failure either stalls the phase or invites a 1000+ file CRLF-normalization commit unrelated to the phase's intent.
- **Rule**: On Windows, treat the lint success criterion as "no NEW errors from this phase's files". Verify by running `npx eslint <touched-files>` after a targeted `npx prettier --write <touched-files>` to normalize the new/modified files only. Do NOT run `npm run lint:fix` on the whole repo as part of a feature phase — it bundles unrelated normalization into the commit. Repo-wide CRLF cleanup is its own change, with its own plan.
- **Applies to**: implement

