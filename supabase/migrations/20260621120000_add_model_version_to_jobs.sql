-- Migration: add public.jobs.model_version (S-11 bread-chroma-postpass, Phase 2).
--
-- Records the pinned Bread model version a job ran. Written ONCE at
-- prediction-create time by markJobProcessing (alongside replicate_prediction_id);
-- markJobSucceeded does not touch it. Audit telemetry only — the build/deploy pin
-- is the drift safeguard, not this column.
--
-- Additive + nullable: existing rows stay null (no backfill). A new column
-- inherits the table's existing RLS policies and grants (service-role writes it;
-- the authenticated SELECT-own policy already governs reads — RLS is row-level,
-- not column-level), so no policy/grant change is needed. The jobs table is
-- REPLICA IDENTITY FULL, so Realtime payloads carry the new column automatically.

alter table public.jobs add column model_version text;
