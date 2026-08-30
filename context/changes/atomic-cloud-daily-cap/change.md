---
change_id: atomic-cloud-daily-cap
title: Resolve the global Cloud AI daily-cap contract and operational backstop
status: impl_reviewed
created: 2026-08-26
updated: 2026-08-30
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

**The PRODUCTION schema change was applied on 2026-08-29, pre-merge.**
`supabase/migrations/20260828120000_atomic_cloud_daily_cap.sql` was created and
verified locally in Phase 1, then applied to `luminaclean-prod` in Phase 4 via
`npx supabase db push --linked` and verified there — deliberately **before** the
implementing PR merges, because CI deploys the Worker and Edge Function on merge
but not migrations. The function is additive and inert until the new Worker calls
it. Evidence: `context/foundation/production-config.md` §7.
_(Until 2026-08-29 this paragraph read "No PRODUCTION schema change has been
applied yet"; the phase-3 F2 triage cited it as the ground truth for keeping §7's
wording prod-neutral. That reasoning was correct on its date — the premise has
since changed.)_

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

**Phase 3 review (2026-08-29):** `reviews/impl-review-phase-3.md` — NEEDS
ATTENTION, 1 critical / 2 warnings / 4 observations. All seven contract items
matched and every factual claim in the new text verified against the migration,
the service, the route and the tests; the scope boundary held (nothing marked
done, no archive file touched, #191 still open). The critical finding is F1:
`context/mvp-check-report.md` still carries 26 stale `file:line` pointers —
20 of them broken by this change's own +47-line edit to `photo-job.service.ts`
and its new describe block — despite the plan explicitly requiring those refs be
re-derived. F2/F3 are gaps in the plan's own file list (`production-config.md`
and the upstream `prd.md` / `shape-notes.md` still carry claims this phase
disproved elsewhere). **All seven triaged and fixed in `e868bcd`** (2026-08-29);
none skipped, accepted-as-risk, or dismissed. Five were fixed differently than the
report proposed — in each case the report's own fix would have introduced a
second-order error — and two of the report's own claims were corrected in the
process. See the report's `## Triage outcome` section.

**Phase 4 note (2026-08-29):** the pre-merge production gate is closed. A dry run
confirmed exactly one pending migration, then `npx supabase db push --linked`
applied `20260828120000` to `luminaclean-prod`; prod migration history is 11/11 in
parity with `supabase/migrations/`, recorded under the file's own version. The 4.1
verification reproduced every designed property against prod — `prosecdef = false`,
`search_path = ""`, EXECUTE false for `PUBLIC`/`anon`/`authenticated` and true for
`service_role` (acl `{postgres=X/postgres,service_role=X/postgres}`), and the
partial index `jobs_billable_created_at_idx`. Applied date + verification recorded
in `production-config.md` §7. Phase 5 (post-merge smoke + archive) is outstanding
and cannot run until CI deploys the Worker.
