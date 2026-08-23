---
change_id: r2-prose-rerun
title: R2 escalation re-run — settle the prose question at cumulative n=20
status: archived
created: 2026-08-23
updated: 2026-08-23
archived_at: 2026-08-23T20:55:00Z
---

## Notes

The optional R2 re-run registered in the archived fabrication campaign
(`context/archive/2026-08-15-finder-fabrication-triggers/decision.md`, restated
without adoption in `context/archive/2026-08-22-r5-finder-truncation-note/decision.md`):
the R2 screen (prose removed — CI recipe minus `context/**`) read 5/8
fabrication runs, missing the escalation trigger (|5 − 6.8| < 2) — but the
Phase-4 hand-read established that R2 run 2's sole flagged finding was a
misgrade (H-12), and a corrected 4/8 WOULD have escalated. The archived
verdicts stay FINAL; this change runs the +12-attempt escalation R2 never
received, under the campaign's frozen method, and records its own read-off.

- Method inherited VERBATIM from the archived pre-registration
  (`context/archive/2026-08-15-finder-fabrication-triggers/verification.md`) —
  no new thresholds, bands, or rubric wording. This change's `verification.md`
  restates the applicable frozen rules and pins the re-frozen ground truth.
- Instrument: `packages/code-reviewer/scripts/fabrication-probe.mjs` +
  `fabrication-grade.mjs`, changeDir re-pointed here per the re-freeze
  discipline (ci.md precedent). One additive instrument change: a `--pre-note`
  flag reproducing the pre-R5 prompt, because the archived screen predates the
  production truncation note and a combinable arm must match its prompt.
- Budget: ≈ $2 (12 finder attempts + grading), inside the campaign's unused
  ceiling headroom (102/140 attempts spent at close; 38 remained).

**Outcome (2026-08-23)**: 12/12 gradeable (0 errors, all Venice, noteActive
false), fabricationRuns 6/12 → cumulative **11/20 = DROP** on M2+M3 (band
≤ 13, B = 17). Hand-read 17/17 agree (0% misgrade). Successor H\* read:
**SUPPORTED** (R2 DROP + archived R1 ELIMINATED). Ledger 114/140, spend
≈ $0.94. Full record: `verification.md` (Results) + `decision.md`.
