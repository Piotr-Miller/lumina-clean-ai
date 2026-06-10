---
change_id: cap-doc-drift
title: Fix stale daily-cap phrasing in docs to match the live global CLOUD_DAILY_CAP
status: archived
created: 2026-06-10
updated: 2026-06-10
archived_at: 2026-06-10T19:46:45Z
---

## Notes

Doc-drift follow-up deferred by `cap-rejection-coverage` (see its plan §"What We're
NOT Doing"). The cloud daily cap is **global, cross-user**, default `50`, configurable
via `CLOUD_DAILY_CAP` (live prod = 3), resetting at 00:00 UTC — but some docs still
describe it as a per-user 24h limit.

Confirmed drift (live, non-archive) as of 2026-06-10:

- **`CLAUDE.md:31`** — "auth-gated and rate-limited (20 ops/user/24h via SQL on
  RLS-gated tables)". Wrong on three counts: per-user (it's global), 20 (default is
  50), 24h rolling (it's a UTC-day reset, configurable via `CLOUD_DAILY_CAP`). This is
  the primary target.
- **`supabase/migrations/20260528120000_create_jobs_table.sql:49-52`** — the
  `jobs_user_id_created_at_idx` comment says it "Also serves the S-05 daily-cap query:
  COUNT(*) WHERE user_id = \$1 AND created_at >= today AND status <> 'failed'." The live
  `countCloudJobsToday` is a **global** count with no `user_id` predicate
  (`.gte(created_at, utcDayStart).or("status.neq.failed,replicate_prediction_id.not.is.null")`),
  so this index (user_id-leading) does not actually serve the global cap query. JUDGMENT
  CALL for the plan: editing an already-applied migration's *comment* (no DDL change) vs.
  recording the correction elsewhere — migrations are immutable-by-convention once run.

Verified accurate (NOT a target):

- **`idea-notes.md:15`** — already correct: "global cap of 50 cloud AI ops / day across
  all users, resetting at 00:00 UTC; configurable via `CLOUD_DAILY_CAP`".

Source of truth: `astro.config.mjs:28` (`CLOUD_DAILY_CAP` default 50), `countCloudJobsToday`
in `src/lib/services/photo-job.service.ts`, PRD FR-014 (global cap). Scope: docs/comments
only — no behavior, schema, or cap-value change.
