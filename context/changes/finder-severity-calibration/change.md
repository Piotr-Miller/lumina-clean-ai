---
change_id: finder-severity-calibration
title: Detected cross-user authorization-boundary violations must not be classified as minor
status: new
created: 2026-08-15
updated: 2026-08-19
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

### Re-read of the same snapshot, 2026-08-19 — the defect is a COLLAPSE, not one finding's severity

No new spend; all of this comes out of the committed `baseline-n20.json` (40 draws, 20 per fixture) plus
three live runs on PR #146. Full workings in `context/foundation/review-pipeline-verification.md`.

| Fixture    | Draws | Zero-finding draws | Severity-monotone draws | Monotone constant    |
| ---------- | ----- | ------------------ | ----------------------- | -------------------- |
| Vulnerable | 20    | **0**              | 8                       | 7× `minor`, 1× `nit` |
| Defended   | 20    | 7                  | 11                      | 9× `minor`, 2× `nit` |

"Monotone" = more than one finding, every one carrying the same severity.

**Two things this settles before planning starts.**

1. **There is no silence problem, so the 20/20 target stands as scoped.** All ten `defect_reported = 0`
   draws emitted findings (1–8 each) — the finder never declines to report on this fixture. This was
   worth checking because "reported at the wrong severity" and "not reported at all" need different
   fixes while `requireDefectReported` scores them identically. It is the former, every time.
2. **Aim the intervention at the collapse.** The traversal being graded `minor` is a symptom: in 16 of
   19 monotone draws the whole finding set collapses to `minor`. A change that raises traversal severity
   specifically would move the metric without touching the mechanism — and the counter-check above is
   exactly what such a change would fail. PR #146 run `32255940666` shows the constant is not always
   `minor` either: 8 findings, **all `critical`**, on a clean PR — narration graded critical.

**Monotony rate is a free second metric.** It is computable from any promptfoo snapshot with `jq`, needs
no API call, and it measures the mechanism rather than one instance of it. Track it alongside
`defect_reported` from the first measurement so before/after are comparable.

**Do not spend on a `--repeat` run to size run-to-run variance.** The 40 committed draws already do it.

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
