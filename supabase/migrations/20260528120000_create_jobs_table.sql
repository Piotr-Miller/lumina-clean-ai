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
-- Also serves the S-05 daily-cap query:
--   COUNT(*) WHERE user_id = $1 AND created_at >= today AND status <> 'failed'.
-- The leading user_id makes this a tight range scan; a separate non-user-scoped
-- partial index would scan all users' rows in the time range before filtering.
create index jobs_user_id_created_at_idx
  on public.jobs (user_id, created_at desc);

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
-- grants to anon, authenticated, AND service_role on public tables by default
-- (via default privileges seeded by the auth/postgrest bootstrap). Revoke
-- them on the public-facing roles so their privileges are explicit and
-- minimal. service_role's blanket grants are intentionally LEFT INTACT — it
-- has BYPASSRLS but still needs table-level grants to read/write (grants and
-- RLS are orthogonal gates in Postgres), and revoking them breaks every
-- admin-client code path (createPhotoJob, markJobSucceeded, S-04 Edge Fn).

revoke all on public.jobs from anon, authenticated;

grant select, insert on public.jobs to authenticated;
-- anon intentionally has no grants here; combined with no anon RLS policies,
-- there is no path from an anon JWT to a row in this table.
-- service_role keeps its full blanket grants (not re-listed here; they are
-- the Supabase default).

-- ---------------------------------------------------------------------------
-- Realtime publication + replica identity
-- ---------------------------------------------------------------------------
-- S-04 subscribes to row updates over Supabase Realtime under a user JWT.
-- The SELECT policy above scopes the published rows per subscriber.
--
-- REPLICA IDENTITY FULL is required for Realtime to deliver UPDATE/DELETE
-- events to RLS-scoped subscribers: Supabase Realtime evaluates the RLS
-- SELECT policy against the OLD row to decide whether to push the event,
-- and the default replica identity (primary key only) doesn't carry enough
-- row data for that check. Without this line, UPDATE events fire in WAL
-- but never reach user-JWT subscribers (silent drop).

alter table public.jobs replica identity full;
alter publication supabase_realtime add table public.jobs;
