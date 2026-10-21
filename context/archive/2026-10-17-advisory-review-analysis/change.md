---
change_id: advisory-review-analysis
title: "Judge from recorded results whether advisory AI review is worth continuing"
status: archived
outcome: completed
created: 2026-10-17
updated: 2026-10-21
archived_at: 2026-10-21T16:28:15Z
---

## Notes

Analyse the finder results already recorded, with a $0 budget for new model calls, and decide whether advisory AI review is worth continuing. Count concrete bugs worth fixing, false alarms, duplicates and minor remarks across the existing finder gates. The main question for glm-5.3 low (owner accepted 55 of 60 published findings; D2 in 1 of 9 valid #269 runs; provisional $6.556540/month): how many accepted findings actually justified a fix. A finding can be true without being worth the author's time. Output: a recommendation of one candidate, or of ending the work, plus proposed pre-registered criteria for a possible on-demand pilot. A paid pilot is decided only after this analysis. D2 becomes a reported weakness, not a veto that rejects a model on its own. Predecessors: finder-glm-5-3 (archive on the unmerged branch feat/finder-glm-5-3, commit ac6bbb1) and finder-glm-5-3-high (unmerged branch feat/finder-glm-5-3-high, archive commit 6d5a09a; PR #295 closed unmerged).

## Delegated decisions — 2026-10-19

The owner asked Codex to complete step 3, decide whether W2 counts and select a pilot direction. All 41 Owner
cells and the rationale are in [worth-fix-sheet.md](worth-fix-sheet.md#delegated-owner-decisions--2026-10-19).
Only W1 counts as worth a fix: **0/55** accepted glm-5.3 low findings. The adopted optional-W2 count is 20/55
(`269-I12` is W3). `247-I5` is W1, raised by other candidates, and should be carried as a concrete follow-up.
D2 stays W2; the three disputed accepts stay FA.

**Direction: end the advisory-review work, no paid pilot now; keep ai-review disabled.** If later reopened,
a pilot should use five new PRs changing product behaviour, run locally from a `feat/finder-glm-5-3` worktree,
and count only W1 not already caught by CI or `/rune-impl-review`. Next: `/rune-plan` formalizes the close-out.
No model evaluation or production API was invoked, and no code or archived evidence was changed.

2026-10-19: owner decisions during `/rune-plan` — fix `247-I5` in this change; close #235 as not planned; add one
lesson; dormant-pilot eligibility is path-based (a non-test file under `src/`, `supabase/functions/` or
`supabase/migrations/`; refactors count). The owner then confirmed plan assumptions A1–A3 as written (`plan.md`
§ Implementation Approach): repository settings, package and branches stay; "same defect" is the owner's call;
≥ 1 uncaught W1 in five eligible PRs → consider re-enabling, 0 → stays ended.

2026-10-19: owner decision — drop the trailing period after the five Manual surface declarations (1.3, 2.5, 2.6,
3.7, 4.5) so the acceptance script can record confirmations; no criterion text changed; plan.md § Phase 1–4 Manual
Verification.

2026-10-19: earlier Phase 4 preparation — `origin/chore/advisory-review-analysis` was verified at
`82776c53591e071bf6d2215f5e83a2299fe362c7`, containing Phases 1–3. The exact #235 closing comment is drafted in
`issue-235-comment.md`; posting and closure were left awaiting owner approval. No GitHub mutation was made by the
agent during that preparation.

2026-10-19: Phase 4 resumed — #235 was already `CLOSED NOT_PLANNED` (closed at 20:41:42 UTC), with Piotr-Miller's
20:41:41 UTC comment exactly matching `issue-235-comment.md`. Verified the published close-out and root-cause
links at pushed commit `82776c5`; recorded the date, reason and comment URL in `close-out.md` § Tracker. No
duplicate GitHub mutation was made. `temp_steps.md` now points to archive with outcome `completed`. Human
acceptance rows 1.3, 2.5, 2.6, 3.7 and 4.5 remain pending.
