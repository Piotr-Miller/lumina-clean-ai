-- Migration: create public.jobs table for the LuminaClean Cloud AI path (F-01).
-- Owns: the schema, status enum, indexes, updated_at trigger, granular RLS
-- policies (user SELECT/INSERT own; service-role bypasses for UPDATE/DELETE),
-- grants, and supabase_realtime publication membership.
--
-- Privacy invariants this migration is responsible for:
--   * No anon role can SELECT or INSERT into public.jobs.
--   * An authenticated user can only SELECT / INSERT rows where
--     user_id = auth.uid(); they have no UPDATE or DELETE policy.
--   * Status / result_path / completed_at transitions land via the
--     service-role-backed photo-job.service.ts helper (S-04 caller).
--
-- See: context/changes/photo-jobs-data-and-storage/plan.md (Phase 1).

-- ---------------------------------------------------------------------------
-- Status enum
-- ---------------------------------------------------------------------------

create type public.photo_job_status as enum (
  'queued',
  'processing',
  'succeeded',
  'failed'
);

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.jobs (
  id                       uuid                       primary key default gen_random_uuid(),
  user_id                  uuid                       not null references auth.users (id) on delete cascade,
  status                   public.photo_job_status    not null default 'queued',
  source_path              text                       not null,
  result_path              text,
  replicate_prediction_id  text,
  error_code               text,
  error_message            text,
  created_at               timestamptz                not null default now(),
  updated_at               timestamptz                not null default now(),
  completed_at             timestamptz
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Owner queries (history, current job lookup) hit (user_id, created_at desc).
create index jobs_user_id_created_at_idx
  on public.jobs (user_id, created_at desc);

-- S-05 daily-cap query: COUNT(*) WHERE created_at >= today AND status <> 'failed'.
-- Partial index keeps the count cheap (failed rows do not count toward the cap).
create index jobs_daily_cap_idx
  on public.jobs (created_at desc)
  where status <> 'failed';

-- ---------------------------------------------------------------------------
-- updated_at auto-touch trigger
-- ---------------------------------------------------------------------------
-- Scoped to this migration; lives in the public schema so a future table that
-- needs the same touch behavior can reuse it without re-declaring.

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;

-- Authenticated users can read only their own rows.
create policy jobs_select_own
  on public.jobs
  for select
  to authenticated
  using (user_id = auth.uid());

-- Authenticated users can insert only rows they own.
create policy jobs_insert_own
  on public.jobs
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Deliberately NO update or delete policy for authenticated or anon.
-- All status / result_path / completed_at mutations land via the service-role
-- key from the photo-job.service.ts helpers (called by S-04's Edge Function).

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Defense in depth: Supabase applies blanket SELECT/INSERT/UPDATE/DELETE/...
-- grants to anon, authenticated, and service_role on public tables by default
-- (via default privileges seeded by the auth/postgrest bootstrap). Revoke them
-- so privileges are explicit: anon has nothing, authenticated has the minimum
-- the RLS policies above can act on, service_role bypasses RLS anyway.

revoke all on public.jobs from anon, authenticated, service_role;

grant select, insert on public.jobs to authenticated;
-- service_role intentionally has no grants here; it relies on bypass-RLS.
-- anon intentionally has no grants here; combined with no anon RLS policies,
-- there is no path from an anon JWT to a row in this table.

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
-- S-04 subscribes to row updates over Supabase Realtime under a user JWT.
-- The SELECT policy above scopes the published rows per subscriber.

alter publication supabase_realtime add table public.jobs;
