-- Migration: atomic admission for the S-05 global Cloud AI daily cap (PRD FR-014,
-- change `atomic-cloud-daily-cap`, issue #191).
--
-- WHAT THIS REPLACES. Admission used to be two operations in the Worker:
-- `countCloudJobsToday()` followed by an unguarded INSERT into public.jobs
-- (`cloud-create-job.handler.ts` -> `photo-job.service.ts`). Nothing serialized
-- them, so N simultaneous submissions at `count = cap - 1` all read the same
-- count and all inserted — an overshoot of N-1, bounded only by demand
-- concurrency, which is exactly the burst the cap exists to defend against.
-- This function makes count-and-insert ONE guarded write.
--
-- (a) WHY A CONDITIONAL INSERT IS NOT ENOUGH. The obvious fix —
--     `insert ... select ... where (select count(*) ...) < cap` — does NOT close
--     the race under READ COMMITTED. Each concurrent statement takes a snapshot
--     that excludes the other's uncommitted row, so both see `cap - 1` and both
--     insert. The `claimJobForProcessing` precedent (a guarded UPDATE) works only
--     because it guards on a row that ALREADY EXISTS, where the row lock does the
--     serializing. A count over a SET has no such row, so it needs explicit
--     serialization. Do not "simplify" this function back into that form.
--
-- (b) WHY THE LOCK IS TRANSACTION-SCOPED. `pg_advisory_xact_lock` releases at
--     commit; `pg_advisory_lock` (session-scoped) would not. PostgREST pools
--     connections, so a session-scoped lock would outlive the request, leak into
--     an unrelated later request on the same connection, and eventually deadlock
--     the pool. The xact-scoped variant is also what makes this safe under
--     Supavisor transaction pooling. Never switch it.
--
-- (c) WHY THE NULL-CAP GUARD IS FIRST. `count >= NULL` evaluates to NULL, and a
--     plpgsql `IF NULL THEN` does not branch — a null `p_cap` would therefore fall
--     straight through to the insert and admit EVERY request. The cap value stays
--     owned by the application (`CLOUD_DAILY_CAP`), but a SECURITY DEFINER function
--     that admits paid work must not depend on its caller getting the argument
--     right, so a null or negative cap is rejected explicitly, before the count.
--
-- The cap VALUE is deliberately not moved into the database: `CLOUD_DAILY_CAP`
-- remains the single source of truth for policy; the database owns atomicity only.
--
-- `search_path = ''` (per the 20260614120000 reaper precedent) means every object
-- must be qualified: `public.jobs` and the enum literal cast as
-- `public.photo_job_status`. `now()` / `date_trunc` resolve from pg_catalog, which
-- is always implicitly searched. Grant model follows that same migration:
-- revoke from PUBLIC (the load-bearing one — anon/authenticated inherit PUBLIC),
-- revoke from anon/authenticated explicitly, grant execute to service_role only.

create or replace function public.admit_cloud_job(
  p_job_id      uuid,
  p_user_id     uuid,
  p_source_path text,
  p_gamma       double precision,
  p_strength    double precision,
  p_cap         integer
)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
  volatile
as $$
declare
  v_billable_today bigint;
begin
  -- (c) Fail closed on a bad cap, BEFORE anything else. Never compare against NULL.
  if p_cap is null or p_cap < 0 then
    return false;
  end if;

  -- (b) Serialize all admissions on one global, transaction-scoped advisory lock.
  -- The key is a hardcoded literal (never hashtext('...')) so it cannot shift under
  -- a schema, search_path, or hashing change; it encodes this migration's date plus
  -- FR-014 / issue #191. One global key is intentional: at a cap of 3 the point IS
  -- to serialize every admission. If volume ever makes this a bottleneck the shard
  -- is obvious (key per UTC day), but that is not a speculative change to make.
  perform pg_advisory_xact_lock(20260828140191);

  -- SQL twin of countCloudJobsToday(): today's *billable* jobs across ALL users.
  -- "Today" is the current UTC calendar day, derived from the DATABASE clock —
  -- the authoritative one. A job counts unless it is a pre-model failure
  -- (`failed` AND no prediction id), i.e. one that never reached Replicate and so
  -- cost nothing. De Morgan form of NOT (failed AND id IS NULL).
  select count(*)
    into v_billable_today
  from public.jobs
  where created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
    and (status <> 'failed'::public.photo_job_status or replicate_prediction_id is not null);

  -- `>=` so p_cap = 0 rejects the first request (operator kill-switch) and
  -- `cap - 1` is the last allowed slot — identical to isOverDailyCap().
  if v_billable_today >= p_cap then
    return false;
  end if;

  insert into public.jobs (id, user_id, status, source_path, gamma, strength)
  values (
    p_job_id,
    p_user_id,
    'queued'::public.photo_job_status,
    p_source_path,
    p_gamma,
    p_strength
  );

  return true;
end;
$$;

revoke all on function public.admit_cloud_job(uuid, uuid, text, double precision, double precision, integer) from public;
revoke all on function public.admit_cloud_job(uuid, uuid, text, double precision, double precision, integer) from anon, authenticated;
grant execute on function public.admit_cloud_job(uuid, uuid, text, double precision, double precision, integer) to service_role;

-- The cap count is now inside the serialized section of every admission, so it is
-- on the critical path rather than a latency footnote. `jobs_user_id_created_at_idx`
-- is user_id-leading and does NOT serve a global, user-agnostic count (the
-- create-table migration says so and defers a cap index to "v2" — this is that
-- index). The partial predicate mirrors the billable predicate above so the
-- planner can match it and scan only the rows the count actually considers.
create index if not exists jobs_billable_created_at_idx
  on public.jobs (created_at)
  where (status <> 'failed'::public.photo_job_status or replicate_prediction_id is not null);
