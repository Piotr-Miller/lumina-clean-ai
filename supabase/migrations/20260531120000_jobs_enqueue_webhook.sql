-- Migration: Database Webhook that fires the `enhance` Edge Function `/start`
-- route when a `queued` job row is inserted (S-04 pipeline kickoff).
--
-- Uses pg_net (net.http_post) to POST asynchronously so it never blocks the
-- INSERT. Target URL + bearer secret are read from per-environment Postgres
-- settings (set via `ALTER DATABASE postgres SET ...`, or Supabase Vault), NOT
-- hardcoded:
--   app.settings.edge_function_url  -- http://host.docker.internal:54321/functions/v1/enhance (local)
--                                   -- https://<project-ref>.supabase.co/functions/v1/enhance (prod)
--   app.settings.db_webhook_secret  -- bearer the /start route checks (== DB_WEBHOOK_SECRET)
--
-- If either setting is unset (current_setting(..., true) → NULL), the trigger
-- no-ops: the job stays `queued` and no request is made. This keeps job INSERTs
-- working in any environment where the pipeline isn't wired yet, and mirrors the
-- CLOUD_PIPELINE_ENABLED-off behavior. Follows F-01's RLS/grant model; adds no
-- new table.
--
-- See: context/changes/cloud-ai-realtime-result/plan.md (Phase 2).

create extension if not exists pg_net;

-- security definer so the trigger can call net.http_post regardless of the
-- inserting role; empty search_path is the Supabase hardening recommendation
-- (everything below is schema-qualified or in pg_catalog).
create or replace function public.handle_queued_job()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  fn_url text := current_setting('app.settings.edge_function_url', true);
  secret text := current_setting('app.settings.db_webhook_secret', true);
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

create trigger jobs_enqueue_webhook
  after insert on public.jobs
  for each row
  when (new.status = 'queued')
  execute function public.handle_queued_job();
