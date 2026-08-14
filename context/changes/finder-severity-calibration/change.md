---
change_id: finder-severity-calibration
title: Detected cross-user authorization-boundary violations must not be classified as minor
status: new
created: 2026-08-15
updated: 2026-08-15
archived_at: null
---

## Notes

The code-review finder **detects** a cross-user path traversal and then files it as `minor`. Not a
detection failure — a severity failure, and the more damaging of the two, because a fabricated finding
costs a reviewer's attention while an understated authorization risk simply gets skipped.

### Scope

> **Ensure detected cross-user authorization-boundary violations cannot be classified as `minor`.**

Deliberately narrow. Not "fix severity calibration" — one defect class, one fixture, one measurable
target.

### The baseline already exists

From `context/archive/2026-08-13-finder-security-vocabulary-bias/` (measured 2026-08-14, glm-4.6, n=20,
snapshot at `results/baseline-n20.json`):

**`guard_reported` = 10 of 20.** In the ten failures the finder usually _did_ notice the unvalidated
key — one row says _"could lead to directory traversal"_ verbatim — and graded it `minor`. One row
produced two `critical` IDOR findings about a _different_ concern (service-role scoping) while filing
the actual traversal as `minor/correctness`.

The measuring device exists and is validated: `evals/fixtures/hardening-vulnerable.diff` (one
indisputable defect — `readSourceObject` forwards `rawKey` into a storage path while its sibling
`removeSourceObject` calls `parseObjectKey` two functions above) plus the `requireDefectReported`
grader, which requires the _same_ finding to name the defect **and** carry `critical`/`major`.

**This change starts at Phase 2, not Phase 1.** Do not rebuild the instrument.

### Target and the counter-check

- **Target**: 20/20 non-minor on the existing vulnerable fixture.
- **Counter-check, non-negotiable**: ordinary validation bugs must **not** be inflated in exchange. Any
  severity-raising instruction has exactly one predictable failure mode, and it is this. The defended
  fixture and the existing `clean-change.diff` (`reviewMustPass` / `no_false_alarms`) are the guards
  already in the harness; a run that hits 20/20 while inflating those is a **failure**, not a partial
  win.

### Do NOT

- **Do not re-litigate fabrication here.** That went to research (see below). This change is about the
  severity assigned to findings the model already makes correctly.
- **Do not reach for a deterministic grader over model prose.** `lessons.md` — "Don't grade natural
  language with regexes" — cost seven review rounds to learn in the change that produced this baseline.
  `requireDefectReported` is safe precisely because it reads a structured `severity` field and a small
  pattern set, not an argument.
- **Pre-register the bar before spending.** Same discipline as the predecessor: the decision table is
  committed before any number exists, git history proves the ordering. The predecessor's
  `verification.md` is the template, including the n-awareness and the whole-procedure error rates.

### Open question for planning

The likely surface is the finder's `severitySchema`, which has no calibration, no ceiling and no
orthogonal pressure valve — unlike the judge's anchored score or the impl reviewer's severity/impact
pair. Whether the lever is schema structure, rubric examples, or both is a planning decision, but
`lessons.md` records three cases in this package where a prompt fix failed and a structural one worked.
