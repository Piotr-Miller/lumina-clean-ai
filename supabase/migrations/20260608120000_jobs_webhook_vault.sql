-- Migration: move the `jobs_enqueue_webhook` trigger off custom GUCs.
--
-- The original `handle_queued_job()` read its target URL + bearer secret from
-- `current_setting('app.settings.edge_function_url' / 'db_webhook_secret')`
-- (set via `ALTER DATABASE postgres SET ...`). Hosted Supabase DENIES setting
-- custom `app.settings.*` GUCs for the `postgres`/migration roles (not just the
-- SQL editor) — `postgres` isn't superuser there — so the cloud flip-ON could
-- never wire the prod webhook. (See context/archive/2026-06-04-production-
-- deployment/deferred-2.4-db-webhook-settings.md.)
--
-- Fix: read both values from **Supabase Vault** instead (the documented pattern
-- for Database-Webhook secrets). Both are per-environment, so they are NOT in
-- this migration — set them once per environment with the Vault API:
--   select vault.create_secret(
--     'http://host.docker.internal:54321/functions/v1/enhance', 'edge_function_url');   -- LOCAL
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/enhance',  'edge_function_url');   -- PROD
--   select vault.create_secret('<DB_WEBHOOK_SECRET>', 'db_webhook_secret');              -- both envs
-- (Re-set a value with vault.update_secret; names are unique.)
--
-- Behavior is otherwise identical, including the inert fallback: if either Vault
-- secret is absent the trigger no-ops (job stays `queued`, no request) — same as
-- the old missing-GUC path, so job INSERTs keep working in any unwired env.
-- SECURITY DEFINER + empty search_path retained (everything schema-qualified).

create or replace function public.handle_queued_job()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  fn_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'db_webhook_secret');
begin
  if fn_url is null or fn_url = '' or secret is null or secret = '' then
    -- Pipeline not wired in this environment; leave the job queued.
    return new;
  end if;

  perform net.http_post(
    url     := fn_url || '/start',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || secret,
                 'Content-Type', 'application/json'),
    body    := jsonb_build_object('jobId', new.id));

  return new;
end;
$$;
