---
change_id: atomic-cloud-daily-cap
title: Resolve the global Cloud AI daily-cap contract and operational backstop
status: impl_reviewed
created: 2026-08-26
updated: 2026-08-29
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

**Phase 2 note (2026-08-29):** the admission path is wired — `createPhotoJob`
now calls the RPC and returns `null` on a decline, which the route maps onto the
unchanged 429. The plan's designated atomicity oracle (a service-layer fan-out)
was found NOT to detect a non-atomic function reliably and was replaced by an
RPC-layer fan-out; see `plan.md` § Implementation Note — Phase 2 for the
negative-control measurement behind that call.

**Phase 2 review (2026-08-29):** `reviews/impl-review-phase-2.md` — APPROVED,
0 critical / 2 warnings / 2 observations. All four triaged and addressed in a
follow-up commit; F3's "several measurement rounds" suggestion was the one part
declined, with the reason recorded next to the decision.

**Phase 3 note (2026-08-29):** the record is corrected across seven live files —
`AGENTS.md`, `idea-notes.md`, `roadmap.md` (S-05 slice row + S-05 body Unknowns
and Risk + two Parked bullets, plus a new S-16 slice row / body / Backlog Handoff
row), `test-plan.md` (Risk #3 response guidance + a dated §6.6 append that leaves
the 2026-06-10 note's account of what was true then intact + a new §6.6 entry),
`mvp-check-report.md` (EN and PL), `lessons.md` (a new standing rule that
explicitly supersedes the immutable archive's "soft, app-level guardrail"
insight), and `github-issues.md` (a Final-mapping row for S-16 / #191 at status
`implementing`, plus a `## Status updates` registration row). Nothing was marked
done: the `## Done` ledger, the Backlog Handoff `done` flip, and #191's closure
remain Phase 5 / `/10x-archive`'s. No file under `context/archive/` was touched.
