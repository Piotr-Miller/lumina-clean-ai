# Implementation review follow-ups

- 2026-10-23 — Phase 2 review F1: applied the approved fix in `weekly-report-cli.ts`; a firing alarm writes `alarm.md` with the other report files before publication, then updates its comment link after success. Extended the publication-failure test to check the retained alarm file and spend. Regression failed before the fix; all 866 package tests, typecheck and lint pass after it. Sibling paths checked; no manual acceptance rows needed reopening. Changes await a workflow commit; the review skill does not commit.

- 2026-10-22 — Phase 1 re-review F8: applied the approved fix in `weekly-report-render.ts`; the truncation notice points to the complete data in `report.json`. Added an overflow check in `weekly-report-cli.test.ts` that verifies the published comment is capped while the named JSON artifact retains all 2,000 runs, including the final omitted run. Changes await a workflow commit; the review skill does not commit.
- Manual acceptance 1.5 was reopened because its render surface changed after acceptance at `ae7d6fddb99d41c46b4460ddee42b0408d676640`. Commit the fix and its records before requesting acceptance through `$rune-implement`.
