---
change_id: cloud-job-retention-cleanup
title: 24h-retention cleanup for failed/abandoned cloud jobs
status: archived
created: 2026-06-07
updated: 2026-06-07
archived_at: 2026-06-07T21:05:39Z
plan_reviewed_pass: 2
---

## Notes

Roadmap **S-08** (issue #9). The last cloud-path prerequisite for the `CLOUD_PIPELINE_ENABLED` flip-ON (gate: S-05 ✓ + S-08 + S-09 ✓).

**Outcome:** an uploaded source object is removed within the 24h privacy window even when the job does NOT succeed — on a `failed` job (pipeline error / timeout) and on an abandoned `queued` job whose client upload never completed — closing the gap where today only the success path (`markJobSucceeded`) deletes the source.

**Scope guard (from roadmap):** inline approach only — delete the source in `markJobFailed` + the timeout route, and delete the orphaned result on late-failure — **NOT** a `pg_cron` reaper (explicit MVP non-goal).

**Residuals this slice now owns** (from the 2026-06-07 abandoned-findings audit):
- Result-object orphan if the `/callback` row UPDATE fails after the result upload (S-04 phase-3 review F5; prod-deployment F8 covers the source side).
- `/start` `predictions.create` fetch has no `AbortSignal.timeout` — residual of the S-07 hardening cluster (output fetch got it, create fetch missed). Bind it while touching `enhance/index.ts`.
- (Benign, no action) `SUPABASE_KEY` declared `access:"secret"` yet is the publishable anon key — RLS-safe naming nit.

**Open design questions for research:**
- Abandoned-`queued` rows have no terminal event — decide the trigger (reuse the client timeout/watchdog path vs a bounded lightweight sweep).
- Interaction with deferred **F9** (`markJobSucceeded` TOCTOU resurrection race) — same `markJobSucceeded` path S-08 edits; reconcile rather than touch blindly.
- Collision surface with **S-05** (shares `photo-job.service.ts`, different function).

Lesson prior: a watchdog's status filter must cover EVERY non-terminal stall point (`queued` AND `processing`).
