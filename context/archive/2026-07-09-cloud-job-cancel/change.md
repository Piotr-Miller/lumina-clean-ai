---
change_id: cloud-job-cancel
title: Hard-cancel an in-flight Cloud AI job (button) + delete its orphaned source
status: archived
created: 2026-07-09
updated: 2026-07-09
archived_at: 2026-07-09T21:44:09Z
---

## Notes

**Phase:** post-mvp. Promotes the roadmap **Parked** item _"Cancel in-flight cloud
job on Start over (S-04)"_ (`context/foundation/roadmap.md`) into a change — **not a
new slice**; it increments S-04's existing flow rather than adding a user-visible
milestone.

Scope (user decision, 2026-07-09): a user-triggered **button** to kill a
long-running / switched-away Cloud AI job, with **source-cleanup folded in** —
deleting the job's orphaned `source.*` object as part of cancel (the parked item's
"deliberate source-cleanup decision" half). `retention-reaper`'s hourly sweep stays
the **backstop**, not the primary path.

Design carries (from the roadmap item + this discussion — for the plan to resolve):

- New owner-scoped `POST /api/enhance/cloud/cancel` route — only the service-role
  layer holds the Replicate token → Replicate `POST /v1/predictions/{id}/cancel`.
- Terminal state: `photo_job_status` enum has no `canceled` → decide **reuse
  `failed`** vs. **add a `canceled` value** via migration (RLS + realtime impact).
- Delete the orphaned `source.*` object on cancel; reaper backstops it.
- UI: the cancel button + the known **"no hard cancel on switched-away cloud job"**
  gap — today "Start over" mid-`processing` only tears down the client subscription;
  the backend prediction runs to completion as an orphan (self-cleans its source via
  `markJobSucceeded`).

Not doing: a separate manual "purge temp bucket" ops button — redundant with
`retention-reaper` (hourly sweep of lingering source objects).
