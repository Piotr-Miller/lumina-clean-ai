# Decision — finder severity structural retry

**Date**: 2026-08-20 · **Total spend**: $0.0990 of a ~$0.15 ceiling · **Outcome**: ship the
rationalisation sentence, revert the structural lever, close the structural question at this n.

## What shipped

One sentence in the finder's system instructions (`src/prompts.ts`, alongside the untrusted-data
fencing), wording pinned verbatim in the pre-registration before the run:

> A comment asserting behaviour is intentional, legacy, or accepted is an explanation of how the
> defect arrived, never evidence it is harmless.

| Metric                        | Baseline (n=20) | Arm A — sentence (n=20) | Arm B — boolean+floor (n=20, reverted) |
| ----------------------------- | --------------- | ----------------------- | -------------------------------------- |
| `defect_reported`             | 15              | **19**                  | 18                                     |
| Monotone draws                | 0               | 0                       | 2                                      |
| `no_false_alarms` (n=6)       | —               | 6 / 6                   | 6 / 6                                  |
| `no_fabricated_absence` (n=6) | —               | 6 / 6                   | 6 / 6                                  |

The pre-declared risk of the sentence — teaching the finder to distrust the defended fixture's
defence comments — did not materialise: both counter-checks stayed clean in both arms.

## What did not ship

A required `crossUserAccess: boolean` on every finding ("could one user read, modify, or delete
another user's data or objects through this issue?") driving a severity floor (`true` cannot file
below `major`), with the repair-layer bottom-rank default. It measured **18/20 against Arm A's 19/20**
— the pre-registered NO-SIGNAL band — and was reverted in full (`5b583ee`). The net code diff of this
change is exactly one sentence.

## The scope target is still NOT met

The inherited target — _detected cross-user authorization-boundary violations **cannot** be
classified as `minor`_ — remains unmet: 1/20 (Arm A) and 2/20 (Arm B) draws still under-file or miss
the traversal. 19/20 at n=20 is consistent with a true rate roughly in the 75–99% range. The word
"cannot" was not achieved, and no severity mechanism measured in this change can achieve it.

## What was learned — and it closes the question the predecessor left open

The predecessor's structural lever failed on vocabulary (`boundary-crossing` selected 0/20), leaving
open whether a structural constraint with _good_ vocabulary would work. This change answers that:

**The vocabulary was fixed and it did not matter.** The smoke proved the yes/no field is selected
correctly (5/6, with the one "over-selection" a semantically defensible IDOR claim — no
`data-loss`-style label-grabbing). Yet the floor added nothing, because **the boolean is answered
coherently with the model's framing, never independently of it.** All 24 `true` answers in the arm
sat on findings already graded `critical` (17) or `major` (7) — where the framing is right, the
rubric has already priced it and the floor is redundant. Both failing draws answered `false`: one
framed the traversal as "inconsistent key handling" (`false` + `minor`, internally coherent, wrong),
the other never reported the defect at all. Zero contradictory answers in 20 draws — unlike the
predecessor's enum, the field was read and understood.

**A same-response structural constraint sits downstream of the model's framing decision and cannot
rescue a misclassification.** When the framing is right the floor has nothing to do; when it is
wrong the floor has nothing to fire on. This bounds every lever of this shape (enum, boolean,
floor, any required field the same response fills in) on this defect class.

**The residual failure is framing collapse, not severity selection.** The failing draws don't grade
a recognised traversal too low — they stop recognising it as a traversal ("inconsistent key
handling", or silence). Arm A's residual failure showed the same shape from the other side: prose
that rebuts the legacy excuse and still files `minor`.

**Attribution for the sentence is deliberately cautious.** 15 → 19 is the minimum gap the
pre-registration accepts as signal; the sentence-free prompt measured 18/20 the day before; the
Phase 1 strict echo count was 0/5. The sentence ships because its pre-registered row says ship — the
rationalisation mechanism itself was not proven by these counts.

## Follow-up: registered, not implied

Anything that moves the residual must act on a **different response** from the one that misframed
the defect — e.g. a second-pass adjudicator over flagged classes, or a detection-side lever — and
belongs in a new change with its own pre-registration. Reopening the same-response structural
question requires live evidence, per the pre-registered NO-SIGNAL disposition.

## What this change does not claim

- Not that the traversal-as-`minor` class is fixed. 19/20, counted, with the interval stated.
- Not that the sentence caused the improvement. Its row shipped it; variance plausibly owns part of
  the movement.
- Not that structural severity constraints are useless in general — only that a constraint filled in
  by the same response it constrains cannot beat that response's own framing, measured twice now on
  this fixture.
- Not that the fixture generalises. One indisputable case, two counter-fixtures — the same
  instrument, and the same limits, as its predecessors.
