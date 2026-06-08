# Local Cloud-Pipeline Run Runbook (D.1 harness)

How to stand up the full cloud pipeline locally for the D.1 re-validation (and any future local cloud work). Closes the previously-undocumented local-run gap. Promotable to `docs/` later.

> **Secrets never go in git.** `supabase/functions/.env` and `.dev.vars` are gitignored. The Replicate webhook signing secret is already present in `supabase/functions/.env`; you supply `REPLICATE_API_TOKEN`.

## Prerequisites

- **Docker Desktop running** (Supabase local stack needs it).
- Node via fnm (`.nvmrc`, 22.x); `npx supabase` (CLI is a devDependency).
- For Phase 3 (live Replicate): `cloudflared` installed + your `REPLICATE_API_TOKEN`.

## Phase 1 — local stack + Edge Function (token-free)

This much exercises the webhook→`/start` wiring without a Replicate token.

1. **Start the stack** (boots Postgres, API:54321, Studio:54323, storage):
   ```
   npx supabase start
   npx supabase status          # confirm API URL + service_role key
   ```
2. **Apply migrations** (creates the `photos` bucket + the `jobs_enqueue_webhook` trigger):
   ```
   npx supabase db reset
   ```
3. **Set the local DB-webhook GUCs** (local `postgres` IS superuser — the hosted block does not apply). Connect to the local DB (`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres` or Studio SQL editor) and run:
   ```sql
   alter database postgres set "app.settings.edge_function_url" = 'http://host.docker.internal:54321/functions/v1/enhance';
   alter database postgres set "app.settings.db_webhook_secret" = '<DB_WEBHOOK_SECRET>';
   ```
   The GUC value MUST equal the `DB_WEBHOOK_SECRET` you put in the function env (step 4). `ALTER DATABASE` settings apply on new connections — they take effect for the webhook trigger immediately (the trigger opens its own connection via pg_net).
   **Verify:**
   ```sql
   select current_setting('app.settings.edge_function_url', true) as edge_url,
          (current_setting('app.settings.db_webhook_secret', true) is not null) as secret_set;
   ```
   Expect the local URL + `secret_set = true`.
4. **Populate `supabase/functions/.env`** (gitignored). Already contains `REPLICATE_WEBHOOK_SIGNING_SECRET`. Add:
   ```
   CLOUD_PIPELINE_ENABLED=true
   DB_WEBHOOK_SECRET=<same value as the GUC above>
   # REPLICATE_API_TOKEN=...   # Phase 3 only
   # EDGE_FUNCTION_URL=...      # Phase 3 only (tunnel)
   ```
5. **Serve the Edge Function** (separate terminal; long-running):
   ```
   npx supabase functions serve enhance --env-file supabase/functions/.env
   ```
6. **Run the app** with cloud ON + a local cap. In `.dev.vars` (gitignored, used by `wrangler dev` / `npm run dev`):
   ```
   CLOUD_PIPELINE_ENABLED=true
   CLOUD_DAILY_CAP=5
   ```
   Then `npm run dev`, sign in, toggle Cloud AI, submit a JPG.

   **Expected token-less outcome (Phase 1):** the row INSERTs `queued` → the webhook fires `/start` (visible in the `functions serve` logs) → `/start` signs the source and calls Replicate `predictions.create`, which **fails** (no `REPLICATE_API_TOKEN`) → `markJobFailed` flips the row to `failed` and **deletes the source**. So the row ends **`failed`, not stuck `queued`** — this is correct, and it incidentally previews the failed-source-delete retention path. Full `queued→processing→succeeded` needs the token (Phase 3).

## Phase 3 additions — live Replicate via tunnel

Replicate must reach the local function over public HTTPS (for the `/callback`) AND fetch the source over the same tunnel.

1. **Start a tunnel** to the local API port:
   ```
   cloudflared tunnel --url http://127.0.0.1:54321
   ```
   Note the assigned `https://<random>.trycloudflare.com` URL.
2. **Point the function + DB at the tunnel** (cloudflared mints a NEW URL each run — re-sync both every session):
   - In `supabase/functions/.env`: `EDGE_FUNCTION_URL=https://<tunnel>/functions/v1/enhance` and `REPLICATE_API_TOKEN=<your token>`. Re-serve the function.
   - Update the DB GUC to match: `alter database postgres set "app.settings.edge_function_url" = 'https://<tunnel>/functions/v1/enhance';`
   The Edge Function rewrites both the callback URL and the signed source URL to the `EDGE_FUNCTION_URL` origin (`toPublicStorageUrl`), so one tunnel covers source-fetch + callback.
3. **Submit via the UI** and observe `queued→processing→succeeded` via Realtime.

   **Test WARM, not just cold.** The first submit of a session is cold (function + tunnel boot mask the webhook-vs-upload race). Submit a **second** time while warm — `/start` runs in ~80ms and can beat the client's source PUT; the bounded source-sign retry must absorb it. A cold-only pass hides this (lesson: insert-webhook-outraces-upload).

## Teardown

```
# stop the tunnel (Ctrl-C), stop functions serve (Ctrl-C)
npx supabase stop          # add --no-backup to discard local data
```

## Gotchas

- **No token → `failed` row** is expected in Phase 1 (see above), not a bug.
- **cloudflared URL changes per run** — re-sync `EDGE_FUNCTION_URL` AND the DB GUC together, or the callback/source-fetch will 404.
- **GUC unset → silent no-op**: the trigger reads `current_setting(..., true)` (missing_ok) — if unset, the job stays `queued` and nothing fires. The verify query in step 3 catches this.
- **DB_WEBHOOK_SECRET mismatch** between the GUC and the function env → `/start` returns 401 (`invalid webhook bearer`); the row stays `queued`.
