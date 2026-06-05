# Deferred: 2.4 DB-webhook settings (hosted-Supabase GUC limitation)

**Status:** Deferred from S-07 Phase 2 to the **cloud flip-ON runbook** (gated on S-05 done + S-08 + S-09). Not a go-live blocker — see below.

## What happened

Phase 2 Step 2 prescribed:

```sql
alter database postgres set app.settings.edge_function_url = 'https://tebdkqpgjjypdethpezo.supabase.co/functions/v1/enhance';
alter database postgres set app.settings.db_webhook_secret  = '<DB_WEBHOOK_SECRET>';
```

On the hosted prod project (`tebdkqpgjjypdethpezo`) the SQL Editor returns:

```
ERROR: 42501: permission denied to set parameter "app.settings.edge_function_url"
```

## Why (researched via Context7 / Supabase docs, 2026-06-05)

- Hosted Supabase's `postgres` role is **not** superuser/owner enough to `ALTER DATABASE … SET` a **custom** GUC. Known GUCs (e.g. `statement_timeout`) are settable; arbitrary `app.settings.*` placeholders are not.
- Supabase's **native** Database-Webhook pattern does not use custom GUCs at all — `supabase_functions.http_request()` receives the target URL via **trigger arguments** (`TG_ARGV[0]`), and secrets are stored in **Supabase Vault**.
- Our migration `supabase/migrations/20260531120000_jobs_enqueue_webhook.sql` reads `current_setting('app.settings.edge_function_url'/'db_webhook_secret', true)` — the `true` (missing_ok) makes it **silently no-op** when unset.

## Why it's safe to defer (not a go-live blocker)

Cloud ships **OFF** in S-07 (`CLOUD_PIPELINE_ENABLED=false`, `CLOUD_DAILY_CAP=0`):
- With the GUCs unset, the INSERT trigger reads NULL → no enqueue (silent no-op). 
- Even if it did enqueue, the Edge Function `/start` no-ops on the OFF flag.
So the DB-webhook wiring is inert during the cloud-OFF launch by design.

## Resolution options for the flip-ON runbook (pick one then)

1. **Direct connection as postgres** (port 5432, not the pooler/SQL-editor) — test whether `ALTER DATABASE … SET app.settings.*` is permitted there; if so, set both and reconnect.
2. **Supabase Vault** for `db_webhook_secret` + a small config table (or Vault) for the URL; adjust the trigger to read from Vault/table instead of `current_setting`. (Migration change.)
3. **Supabase native Database Webhooks** (`TG_ARGV` URL + Vault secret) — replace the custom-GUC trigger with the platform pattern. (Migration change.)

Whichever is chosen, verify with:
```sql
select current_setting('app.settings.edge_function_url', true) as edge_url,
       (current_setting('app.settings.db_webhook_secret', true) is not null) as secret_set;
```

This is also a good `/10x-lesson` candidate (hosted-Supabase custom-GUC restriction).
