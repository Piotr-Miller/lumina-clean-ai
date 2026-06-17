# Review follow-ups: sentry-integration

Deferred items from the impl review (`reviews/impl-review.md`, 2026-06-17).

## F4 — Regenerate the Edge function deno.lock

- **Source**: impl-review F4 (OBSERVATION, reliability).
- **Why deferred**: standalone Deno is not installed on the dev machine, so a complete
  integrity-pinned lock can't be generated this session.
- **Action when Deno is available**:
  ```bash
  cd supabase/functions/enhance && deno cache index.ts
  git add supabase/functions/enhance/deno.lock && git commit
  ```
  This re-pins `npm:@sentry/deno@^10.58.0` (currently caret-only, no lockfile) with
  integrity hashes so a future 10.x minor can't silently drift into the build.
- **Guard**: CI runs `deno check --config supabase/functions/enhance/deno.json …`. If a
  regenerated lock is committed, confirm CI's deno check still passes (a stale/partial
  lock re-breaks it — see lessons.md / memory deno-check-needs-config-flag).
