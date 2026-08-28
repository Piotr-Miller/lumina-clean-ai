---
change_id: atomic-cloud-daily-cap
title: Resolve the global Cloud AI daily-cap contract and operational backstop
status: implementing
created: 2026-08-26
updated: 2026-08-28
archived_at: null
issue: 191
---

## Notes

The framing brief is `frame.md`. **The authoritative contract is selected:
FR-014 stands as a hard invariant** (decided 2026-08-26; grounds and accepted
costs in `frame.md` § Contract Decision).

**The implementation approach is selected**: admission becomes one guarded write —
a `SECURITY INVOKER` RPC (`public.admit_cloud_job`) holding a transaction-scoped
advisory lock across count-and-insert, with the cap value still supplied from
`CLOUD_DAILY_CAP` and the handler's count demoted to a non-authoritative fast path
(`plan.md`; revised 2026-08-28 after `reviews/plan-review.md`). It was `SECURITY
DEFINER` until `reviews/impl-review-phase-1.md` F1; see `plan.md` § Review Response
— Phase 1 for the measured reason it is not.

**No PRODUCTION schema change has been applied yet.** The migration itself exists
and was created and verified locally in Phase 1
(`supabase/migrations/20260828120000_atomic_cloud_daily_cap.sql`); Phase 4 is where
it is applied to `luminaclean-prod` and verified, deliberately before the
implementing PR merges.
