---
change_id: ai-review-weekly-report
title: "Weekly report of advisory AI review cost and owner reactions"
status: implemented
created: 2026-10-21
updated: 2026-10-25
archived_at: null
---

## Notes

2026-10-25: re-confirmed 2.5 — was accepted at 31bb392d3a22e0bb975974bc9f763400507eb7a1; accepted at f234339afcee7326663ac8a47afc34f85ae3d921. Owner confirmed after inspection of the GitHub write calls; collector and CLI tests passed (73 tests).

2026-10-23: PR #305 rebase-merged (master eecffa4); Progress SHAs of phases 1–3 repointed to the master commits (1baf547→ddce5c6, 94310b5→786023c, 1f13e6f→6e6df94; identical patch IDs). Manual rows 1.5, 2.5, 3.5 and 3.6 now read unverifiable (accepted revisions not in master history) and need re-confirmation at a master revision. Phase 4: first live dispatches ran (tracking issue #306, comment 6374372819, idempotent, no alarm); see first-run.md. 4.3 and 4.4 pending.

2026-10-22: reopened 1.5 — was accepted at ae7d6fddb99d41c46b4460ddee42b0408d676640; changed: packages/code-reviewer/src/weekly-report-render.ts (impl-review phase 1, F8 fix: truncation notice points to complete report.json data)

2026-10-22: reopened 1.5 — was accepted at 1baf54749bc6829956c94cb0f4734b534153719a; changed: packages/code-reviewer/src/weekly-report-render.ts (impl-review phase 1, F1 fix: per-pass amounts carry ≥ under cohort gaps)

2026-10-22: Plan-review triage complete: F1–F6 fixed (F4 Fix A), verdict after fixes SOUND. Plan/Progress structure and declared paths verified; implementation and all manual acceptance remain pending. See reviews/plan-review.md for the original review and decision history.

2026-10-22: Plan review F6 accepted: latest reviewed workflow is selected by greatest original created_at, then greatest numeric run ID, independent of input order. Verdict and finding counts use the same snapshot; tests cover tied timestamps, numeric ordering and timestamp precedence.

2026-10-22: Plan review F5 accepted: no-plan/skipped impl is not run; missing executed-pass cost is unknown/partial. All amounts are observed provider-reported cost with a per-request completeness caveat. Tests cover applicability, missing telemetry and explicit zero; F4's coverage-alarm definition is retained.

2026-10-22: Plan review F4 Fix A accepted: one observed snapshot per workflow ID, week by original created_at, explicit observation timestamp and unobserved earlier attempts. The existing coverage threshold counts the union of unreadable-review and incomplete/unknown-attempt workflow IDs once each; no per-attempt reconstruction or automatic historical refresh.

2026-10-21: Plan review F3 accepted: the workflow uses a Bash argument array and adds --dry-run only for the literal true value. Phase 3 verification tests the actual YAML command with a stub npm; existing Progress titles and IDs stay unchanged.

2026-10-21: Plan review F1 accepted: no-review requires positive skip evidence from the same attempt; missing artifacts without that proof remain unreported.

2026-10-21: Plan review F2 accepted: resolve PR identity through a unique repository/ref match with a commit-associated PR fallback; unmapped runs retain weekly data and explicitly incomplete PR coverage. Baseline run 39653424585 resolves to closed PR #300 despite an advanced current head SHA.

Add a scheduled weekly GitHub Actions job that monitors the advisory ai-review: per-PR and weekly cost (finder/judge/impl) read from each run's review.json in the ai-review-output artifact (14-day retention), the verdict / ai-cr label mix and finding counts, and a tally of the owner's 👍/👎 reactions on the AI review comments as the quality proxy. Report as a comment on one pinned "AI review weekly report" tracking issue; a week over a spend threshold opens a separate alarm issue. Advisory only, never a gate; no OpenRouter call, $0 to run. Owner decision 2026-10-21 after ai-review-reenable.
