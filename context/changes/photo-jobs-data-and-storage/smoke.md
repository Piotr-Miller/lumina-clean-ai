# F-01 end-to-end smoke walkthrough

Reproduces the foundation's load-bearing contract in a real runtime:
`createPhotoJob` → signed-URL PUT from a real fetch client → Supabase
Realtime delivers `markJobSucceeded`'s UPDATE under the user's JWT →
source object is gone from Storage. This is what `npm test` doesn't
cover (the test suite asserts state, not the Realtime push channel).

## Prerequisites

Identical to `tests/README.md`:

1. Docker Desktop running.
2. `npx supabase start` (first run pulls images; ~1–2 minutes).
3. `npx supabase db reset` (applies the F-01 migrations).
4. Export the three env vars from `npx supabase status`:
   - `SUPABASE_URL=http://127.0.0.1:54321`
   - `SUPABASE_KEY=sb_publishable_...` (the Publishable / anon key)
   - `SUPABASE_SERVICE_ROLE_KEY=sb_secret_...` (the Secret / service-role key)

## Run

```bash
npx tsx scripts/f01-smoke.ts
```

## Expected output

```
→ creating test user
  user.id=<uuid>
→ createPhotoJob
  job.id=<uuid> sourcePath=<uuid>/<uuid>/source.jpg
→ PUT source via signed URL
  upload HTTP 200
→ subscribing Realtime under user JWT
  SUBSCRIBED
→ markJobSucceeded (admin) — should trigger a Realtime UPDATE
  Realtime event received in ~50–800ms; status=succeeded
→ verifying source object was deleted
  source object gone ✓

OK ✓ end-to-end smoke passed (Realtime latency ~50–800ms)
```

Exit code 0 on success, 1 on any failure (with `FAIL ✗ <reason>` line).

## What to eyeball

- **`SUBSCRIBED`** appears before `markJobSucceeded` is called — proves
  the channel is live ahead of the trigger.
- **Realtime latency** is well under the 10s timeout the script sets. A
  typical local-Supabase run shows ~50–800ms; anything sustained above
  that under load would warrant investigation in S-04.
- **`source object gone ✓`** proves the on-success retention contract
  (`markJobSucceeded` deletes the source in the same call) holds
  end-to-end, not just at the supabase-js method level.
- Open Supabase Studio at <http://127.0.0.1:54323> and confirm:
  - The `jobs` table is empty after the script finishes (the test user
    is torn down, which cascade-deletes their rows).
  - The `photos` bucket has no leftover objects under the test user's
    UUID prefix.

## Failure modes

- **`Realtime SUBSCRIBE timed out`** — the Realtime container (port 54321
  WebSocket upgrade) may not be running. `npx supabase status` and look
  for an unhealthy `realtime` service.
- **`Realtime UPDATE event not received within 10000ms`** — RLS may not
  be configured on `public.jobs`, or the table isn't in the
  `supabase_realtime` publication. Run the psql checks from the Phase 1
  verification:
  ```bash
  docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -c \
    "select * from pg_publication_tables where pubname='supabase_realtime' and tablename='jobs';"
  ```
- **`signed-URL PUT failed`** — the bucket may be missing or the file
  size/mime constraints may have changed. Verify the bucket config from
  the Phase 2 verification.
- **`expected status=succeeded`** — the Realtime payload arrived but
  carried the wrong status. Inspect the `jobs` row directly via Studio
  and check `markJobSucceeded`'s update path.

## Re-running

The script tears down the test user (and their Storage objects) in a
`finally` block, so it's safe to re-run repeatedly without accumulating
state. Each run uses a fresh UUID-suffixed test email.
