---
change_id: cap-rejection-coverage
title: Risk #3 — prove the global cloud daily cap rejects the over-cap submission at the route boundary
status: impl_reviewed
created: 2026-06-09
updated: 2026-06-10
archived_at: null
---

## Notes

Rollout Phase 2 (partial) of context/foundation/test-plan.md — Risk #3 only: "The global daily
cap fails to reject the over-cap job (off-by-one, race, or wrong row scope) → unbounded Replicate
spend" (test-plan.md:53, High impact). Surfaced as a concrete coverage gap by Stryker mutation
testing on `src/lib/services/photo-job.service.ts` (30 no-coverage mutants in `countCloudJobsToday`
L113–126 and `createPhotoJob` L70–89).

Oracle root: PRD FR-014 (global cap, clear user-facing message, reject before invoking the cloud
model). Test layer per plan: Integration (create-job route + count helper). Anti-pattern to avoid
(test-plan.md:77): asserting the count helper returns N (implementation mirror) instead of asserting
the **route** rejects the over-cap submission.

See research.md for the grounded oracle and the central open question (route imports
`astro:env/server` → cannot load under Vitest; Lesson #4).
