# Decision — finder severity calibration

**Date**: 2026-08-19 · **Total spend**: $0.0886 of a ~$0.15 ceiling · **Outcome**: ship the rubric, revert
the structural lever, open a follow-up.

## What shipped

A severity rubric in the finder's system instructions. Severity had been undefined anywhere in the
prompt: `buildInstructions` never mentioned `critical`, `major`, `minor` or `nit`, leaving the model to
pick from a four-value enum whose only guidance was a terse `.describe()` in `schemas.ts`.

| Metric                  | Baseline (n=20)           | Rubric (n=20) |
| ----------------------- | ------------------------- | ------------- |
| `defect_reported`       | 15                        | **18**        |
| Severity-monotone draws | 6                         | **0**         |
| Monotone constant       | 4× `minor`, 2× `critical` | — (none)      |
| `no_false_alarms` (n=6) | —                         | 6 / 6 clean   |
| Defended fixture (n=6)  | —                         | 6 / 6 clean   |

Distribution across all rubric-arm findings: 11 `critical`, 20 `major`, 29 `minor`, 22 `nit` — all four
levels in genuine use.

## What did not ship

A required `consequence` enum driving a severity floor. It measured **14 / 20** — worse than the rubric
alone and worse than the baseline — and was reverted in full.

The cause is precise: **`boundary-crossing` was selected zero times in 20 draws.** The traversal was
filed as `none` instead, whose floor is `nit`, so the mechanism was inert exactly where it was designed
to fire. `none` also appeared alongside `critical` six times, which is self-contradictory and shows the
model was not reading the field as a consequence at all. The enum used terms of art the model does not
map to the defect it had just described correctly in prose. **The structural approach was not tested by
this experiment — a badly-named enum was.** That authoring error is mine, not a model failure.

## The scope target was NOT met

> _"Ensure detected cross-user authorization-boundary violations cannot be classified as `minor`."_

**Unmet.** 2 of 20 draws still file the cross-user traversal as `minor`, and both failures are genuine
rather than grader artifacts — the grader's own reason reads _"only below major severity: minor"_. One of
those draws graded four other findings correctly across `major`/`minor`/`nit` while still calling the
traversal `minor`, so the finder can now differentiate severity and still get this specific class wrong.

Stated plainly because the improvement is real and would be easy to present as completion: 18/20 is
better, and it is not a guarantee. At n=20 a 90% observed rate is consistent with a true rate roughly in
the 68–99% range. The word "cannot" in the scope was not achieved.

## What was learned, and it is not what the change set out to learn

**The collapse and the class are two different defects.** The rubric eliminated severity monotony
outright (6/20 → 0/20) without touching the residual under-grading of the traversal. Going in, the
working theory — recorded in `change.md` — was that the `minor` traversal was a _symptom_ of the
collapse. It is not. They are independent, and only one of them is fixed.

**Prose can shape a distribution; it cannot remove an option.** That was the stated rationale for Phase 3
and it still stands. What Phase 3 established is narrower and more useful: a structural constraint is
only as good as the vocabulary the model has to select from, and a required enum whose values the model
never picks is worse than no constraint — it adds cost, adds a field, and moves the metric the wrong way.

**A model's prose and its structured fields can disagree.** The `none` + `critical` combination is the
sharpest evidence: the same response described a serious defect and labelled it as having no functional
impact. Any future design deriving one field from another has to contend with that.

## Follow-up: registered, not implied

A redesigned structural approach needs **its own change with a fresh pre-registration**. Doing the
vocabulary retry inside this change was considered and rejected: the diagnosis arrived _after_ the
results, so acting on it here would convert a pre-registered experiment into post-hoc tuning. The cost
was not the obstacle ($0.026 was available under the ceiling); the methodology was.

Two artifacts survive as inputs to that follow-up, both **bundled into the failed phase and therefore
unmeasured in isolation** — neither may be claimed as a win:

1. **In-diff rationalisation lowers severity.** One residual Phase 2 failure was talked down by the
   fixture's own comment — _"Legacy clients still send keys without the uuid prefix"_ — i.e. untrusted
   in-code prose rationalising a defect, read as evidence the defect is acceptable. The existing fencing
   sentence does not cover this: it addresses embedded instructions and approvals, not in-code
   justifications. This may be the more tractable lever than any enum.
2. **The repair-layer default pattern.** Making a field required broke the envelope repair against the
   recorded live drift shape. Defaulting to the value whose floor is the bottom rank — so a repaired-in
   value can never manufacture severity — generalises to any future required field.

## What this change does not claim

- Not that the traversal-as-`minor` defect is fixed. It is reduced, measurably, and the residual is
  documented with its mechanism.
- Not that 18/20 at n=20 is 90%. The interval is wide; the count is stated everywhere rather than a rate.
- Not that a structural lever cannot work. One badly-named enum failed. That is all the evidence supports.
- Not that the rubric generalises beyond this fixture. It was measured on one fixture plus two
  counter-checks; the predecessor's finding that a fixture can fail to reproduce a live defect applies
  here too.
