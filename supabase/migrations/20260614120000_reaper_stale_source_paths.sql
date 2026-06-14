-- Migration: read-only helper that lists stale private `source.*` objects for the
-- scheduled retention reaper (Risk #5 — see context/changes/retention-reaper).
--
-- The reaper deletes these objects through the Storage API (`.remove()`), NOT via
-- SQL: deleting a `storage.objects` row in SQL orphans the underlying S3 file (you
-- keep paying) and is now rejected outright by the storage statement-level guard.
-- PostgREST also does not expose the `storage` schema, so the service function
-- cannot query `storage.objects` directly. This SECURITY DEFINER RPC is the seam:
-- it SELECTS (read-only) the stale source paths and hands them back; deletion stays
-- in the application layer.
--
-- Returns the object NAMEs (paths) of `photos`-bucket source objects whose age
-- exceeds `older_than_seconds`, oldest first, capped at `max_rows`. A `source.*`
-- object older than the retention window is an orphan by definition (every
-- success/fail/abandon path deletes the source on its terminal flip), so the
-- predicate is status-agnostic — it catches legacy already-terminal orphans,
-- abandon-and-never-return, and best-effort-delete failures alike.
--
-- pg_catalog functions (now, make_interval) resolve under `search_path = ''`
-- because pg_catalog is always implicitly searched; only `storage.objects` needs
-- qualifying. Grant model follows the jobs-table migration: revoke from
-- anon/authenticated/public, leave service_role (the reaper's client) able to run it.

create or replace function public.stale_source_object_paths(
  older_than_seconds integer,
  max_rows integer
)
  returns table (name text)
  language sql
  security definer
  set search_path = ''
  stable
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'photos'
    and o.name like '%/source.%'
    and o.created_at < now() - make_interval(secs => older_than_seconds)
  order by o.created_at asc
  limit max_rows;
$$;

revoke all on function public.stale_source_object_paths(integer, integer) from public;
revoke all on function public.stale_source_object_paths(integer, integer) from anon, authenticated;
grant execute on function public.stale_source_object_paths(integer, integer) to service_role;
