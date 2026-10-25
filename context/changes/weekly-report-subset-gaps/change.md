---
change_id: weekly-report-subset-gaps
title: "Close two low-risk input gaps in the AI review weekly report"
status: implementing
created: 2026-10-23
updated: 2026-10-25
archived_at: null
---

## Notes

Two low-risk gaps in the ai-review weekly report (packages/code-reviewer), found in the phase-3 review and the AI review of PR #305: (1) reviewJsonSubset parses implReview findings as z.unknown() (src/weekly-report.ts:108), so their free text (title/detail/fix) ends up in report.json, uploaded as the 90-day ai-review-weekly-report artifact — report.md and the issue comment stay clean, but the plan promised a narrow subset; (2) collectWeek dedups runs by id with a Set, and the zod catch maps a missing id to NaN, so several runs without an id collapse into one (SameValueZero) and undercount invalid runs and coverage gaps (theoretical: GitHub always returns a numeric id). Predecessor: ai-review-weekly-report (not yet archived).
