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
a `SECURITY DEFINER` RPC (`public.admit_cloud_job`) holding a transaction-scoped
advisory lock across count-and-insert, with the cap value still supplied from
`CLOUD_DAILY_CAP` and the handler's count demoted to a non-authoritative fast path
(`plan.md`; revised 2026-08-28 after `reviews/plan-review.md`).

No production or schema change has been made yet — the migration is Phase 4 and is
deliberately applied and verified before the implementing PR merges.
