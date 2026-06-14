-- Migration: schedule the hourly retention reaper (Risk #5 — see
-- context/changes/retention-reaper). A pg_cron job POSTs the `enhance` Edge
-- Function's `/reap` route once an hour; the route runs the owner-agnostic source
-- sweep (delete `source.*` objects older than the retention window + flip stale
-- non-terminal jobs). Hourly cadence + the route's 23h source-delete threshold
-- keeps worst-case object age within the ≤24h retention NFR.
--
-- Reuses the proven Vault + pg_net pattern from `20260608120000_jobs_webhook_vault.sql`
-- with ZERO new secrets: the tick reads the SAME `edge_function_url` +
-- `db_webhook_secret` Vault entries the DB webhook already uses. If either is
-- unset the tick no-ops (inert in any unwired environment, exactly like the
-- webhook trigger), so this migration is safe to apply everywhere.
--
-- net.http_post pins timeout_milliseconds := 30000: unlike /start (which kicks
-- Replicate off asynchronously and returns fast), /reap does its work
-- synchronously (RPC select + flip UPDATE + batched storage remove) before
-- responding, so the 2s pg_net default could otherwise truncate the response wait.
--
-- The schedule is wrapped in a guard on pg_available_extensions: where pg_cron is
-- not installable (e.g. a local CLI image without it) the migration logs a NOTICE
-- and skips rather than aborting `db reset`. On the hosted project pg_cron is
-- available; if it is not yet enabled, enable it once (Dashboard → Integrations →
-- Cron, or this migration's `create extension`) and verify the first tick lands
-- via `cron.job_run_details`.

create or replace function public.handle_reaper_tick()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  fn_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'db_webhook_secret');
begin
  if fn_url is null or fn_url = '' or secret is null or secret = '' then
    -- Reaper not wired in this environment; no-op (no request issued).
    return;
  end if;

  perform net.http_post(
    url     := fn_url || '/reap',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || secret,
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- Idempotent on re-reset: unschedule only if the job already exists
    -- (cron.unschedule raises when the job is absent, which would abort first apply).
    if exists (select 1 from cron.job where jobname = 'reaper-hourly') then
      perform cron.unschedule('reaper-hourly');
    end if;
    perform cron.schedule('reaper-hourly', '0 * * * *', 'select public.handle_reaper_tick();');
  else
    raise notice 'pg_cron unavailable — reaper schedule skipped; set it up manually on the hosted project';
  end if;
end;
$$;
