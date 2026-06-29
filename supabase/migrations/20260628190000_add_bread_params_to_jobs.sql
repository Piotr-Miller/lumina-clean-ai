-- Migration: add public.jobs.gamma + public.jobs.strength (S-12 adaptive-enhancement-parameters, Phase 3).
--
-- Persists the per-job Bread params chosen in the parameter panel. Written ONCE
-- at create-job insert time (service-role only — see 20260621185226), then read
-- by the Edge Function `/start` (getJobById select("*")) to override the locked
-- BREAD_GAMMA/BREAD_STRENGTH defaults. NULL → the Edge Function falls back to the
-- locked defaults, so in-flight/legacy rows are unaffected.
--
-- Additive + nullable: existing rows stay null (no backfill). A new column
-- inherits the table's existing RLS policies and grants (RLS is row-level, not
-- column-level), so no policy/grant change is needed. The jobs table is
-- REPLICA IDENTITY FULL, so Realtime payloads carry the new columns automatically.
-- Mirrors the 20260621120000_add_model_version_to_jobs.sql pattern.

alter table public.jobs add column gamma double precision;
alter table public.jobs add column strength double precision;
