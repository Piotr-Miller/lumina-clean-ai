# Follow-ups — cloud-daily-cap

Tracked items from the implementation review (2026-06-04). Not blocking; deferred out of S-05 scope.

## F1 — Add an index for the global daily-cap count (if cloud volume grows)

- **Source**: full-plan impl-review, finding F1 (OBSERVATION).
- **Where**: `src/lib/services/photo-job.service.ts` `countCloudJobsToday` — filters on `created_at` + `status`/`replicate_prediction_id` with no `user_id` predicate, so the only index (`jobs_user_id_created_at_idx`, leads on `user_id`) can't serve it; the query seq-scans the day's rows.
- **Action**: add a global `jobs.created_at` (or partial daily-cap) index if cloud volume grows. Current S-05 accepts the small-scale seq scan; revisit after measuring table growth / query latency.
- **Why deferred**: the plan's "Performance Considerations" + "What We're NOT Doing" explicitly accept the seq-scan at the PRD's `small/low` scale and defer any index to its own change (needs a migration). No inline fix appropriate here.
- **Status**: open.
