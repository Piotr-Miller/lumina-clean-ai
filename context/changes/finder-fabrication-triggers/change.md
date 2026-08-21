---
change_id: finder-fabrication-triggers
title: Characterize which real-diff properties trigger finder fabrication, before building any fixture
status: impl_reviewed
created: 2026-08-15
updated: 2026-08-21
archived_at: null
---

## Notes

**Research, not implementation.** The deliverable is knowing what to build a fixture out of — not a
fixture.

### Why this is research and not another fixture attempt

`finder-security-vocabulary-bias` set out to reproduce the defect synthetically and failed, on a
pre-registered gate, at a cost of about $0.15 and a great deal of engineering. Its evidence:

| Where                                           | Fabrications                  |
| ----------------------------------------------- | ----------------------------- |
| Real PR #127 diff, run locally                  | **2 of 8**                    |
| Purpose-built hardening fixture (n=20)          | **0**                         |
| Three earlier committed matrices (30 glm rows)  | **0**                         |
| PR #143's own live review, hardening-heavy diff | **0** (7 findings, all `nit`) |

**50 synthetic rows, zero fabrications.** The change was named for the theory that security-saturated
subject matter triggers the collapse; three independent results contradict it, including research's
finding that the same severity monotony appears on an ordinary-code CONTROL diff. "The diff is about
security" is not a sufficient condition.

So the question is no longer _how do we fix it_ but **what actually triggers it** — and guessing at
synthetic variants is how the next budget gets burned. See
`context/archive/2026-08-13-finder-security-vocabulary-bias/decision.md`.

### Candidate properties to characterize

Untested hypotheses, listed so the research has a starting frame rather than a blank page:

- **Diff size** — #127 was large; every clean fixture was small. The cheapest hypothesis to test, and
  the one with the most obvious mechanism.
- **File count** — multi-file versus the single-file fixtures.
- **Position in a truncated diff.** The reviewer truncates at 100 KB. PR #143 accidentally demonstrated
  that truncation makes the impl reviewer report present files as _missing at CRITICAL severity_ — a
  fabricated absence, produced by truncation. If truncation can manufacture that in one pass it is a
  prime suspect for the finder's absence claims, and #127 was large enough to truncate.
- **Genuine ambiguity** — code where the defence is real but not locally evident, versus a fixture where
  it sits three lines away and commented.
- **Committed review prose in the diff** — already known to be echoed back as current findings, which is
  why `**/reviews/*.md` is stripped. #127 was a review-tooling PR.

### Method constraint

The real #127 diff **does** reproduce it, 2 of 8 tool-less locally, at roughly $0.02 a probe
(`packages/code-reviewer/scripts/finder-distribution.mjs`). That makes ablation affordable: start from
the diff that reproduces and remove properties until it stops, rather than starting from nothing and
adding properties until it starts. The failed change did the latter.

### Do NOT

- **Do not build a fixture first.** That is the mistake this change exists to avoid repeating.
- **Do not re-open the model swap.** Closed on cost evidence (sonnet-5 at 57.6×).
- **Do not conflate this with severity calibration.** That is `finder-severity-calibration`, which is
  actionable today; this one is not, and mixing them would confound both.
