# Finder Precision on Hardening Diffs — Plan Brief

> Full plan: `context/changes/finder-security-vocabulary-bias/plan.md`
> Research: `context/changes/finder-security-vocabulary-bias/research.md`
> Plan review answered by this revision: `context/changes/finder-security-vocabulary-bias/reviews/plan-review.md`

## What & Why

The code-review finder fabricates findings on hardening diffs: it asserts a defence is **absent** when
the diff contains it — in one case flagging a line two below the comment explaining that defence. Four
of ten findings on PR #127 were factually contradicted by the code they cited, and zero were genuinely
security-class and critical-class. That output is worse than noisy; it is wrong, confidently worded, and
labelled `critical`.

## Starting Point

The finder is `z-ai/glm-4.6`, the most schema-reliable model in the eval matrix and otherwise a strong
reviewer. The defect reproduces outside CI (2 of 8 local runs on the real #127 diff) and is
**intermittent**, so it is distributional rather than deterministic. Nothing currently measures it: the
eval harness reads `category` in **zero** assertions and reduces severity to a single boolean, and no
fixture has hardening subject matter. Prompt-strengthening has already failed on this exact model once.

Two measurement traps found by the plan review shape the design: `schema_validity` cannot detect
reliability loss (it exists only on successful calls, and the provider serializes an already-validated
object), and `scoreIssueRecall` searches the whole serialized review as one blob — so it would happily
match a quoted source line instead of a real finding.

## Desired End State

A **recorded, pre-registered decision** about whether requiring quoted evidence reduces fabrication on
hardening diffs — plus an instrument that still measures the defect if the answer is no. Rollout, if the
decision is PASS, is a separate change.

Not claimed as an end state: that every `evidence` string is a verbatim diff quote. The schema enforces
non-emptiness; quote fidelity is measured as a separate number, not guaranteed.

## Key Decisions Made

| Decision            | Choice                                                        | Why (1 sentence)                                                                                                                               | Source    |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Which defect layer  | Precision now, calibration deferred                           | Fabrications are the actual harm; measuring two interventions at once confounds one paid run.                                                  | Plan      |
| Change shape        | Experiment ending in a decision; rollout is a separate change | A single change cannot mechanically complete a rollout it may never do — `finder-tool-loop-evals` archived cleanly on exactly this shape.      | Review F3 |
| Fix surface         | Required `evidence` quote per finding                         | An absence claim has no line to quote, and required-schema-field is the only lever with a winning record here.                                 | Plan      |
| Quote fidelity      | Measured, not enforced                                        | A `superRefine` quote check would reject a whole review over one bad quote, colliding with the reliability risk.                               | Review F4 |
| Reliability guard   | Usable-output rate over all attempts                          | `schema_validity` exists only on successful calls, so it stays green exactly when failures rise.                                               | Review F1 |
| Suppression guard   | Dedicated field-scoped grader, not `scoreIssueRecall`         | Once findings carry a verbatim quote, a blob search matches the quote instead of the finding.                                                  | Review F2 |
| Fabrication metric  | Binary per run, deduplicated                                  | The registered bar counts runs, so a finding-weighted ratio measures a different thing than it gates.                                          | Review F5 |
| Judge sanitization  | At the judge prompt boundary, not one caller                  | `buildJudgePrompt` serializes whole findings and `judge-diagnose.mjs` bypasses the pipeline.                                                   | Review F6 |
| Graded fixture      | Purpose-built small hardening diff                            | Cheap enough for the repeats an intermittent defect needs; the real diff stays as an out-of-suite canary.                                      | Plan      |
| Budget              | glm-only, n=20 per arm, pooling to 40 if ambiguous            | n=8 cannot distinguish a 25% rate from 10%; a flat n=20 gate wrongly rejects 22.5% of the time at the measured rate, so the gate is two-stage. | Plan      |
| Decision function   | Total PASS/FAIL/INCONCLUSIVE + one bounded rerun              | The first draft left 2-4 fabrications and a reliability delta of exactly 2 owned by no outcome.                                                | Review F3 |
| Mechanism ruled out | Trusted project-rules file                                    | Removing it entirely still produced a full collapse (1/5).                                                                                     | Research  |

## Scope

**In scope:** two hardening fixtures (defended + vulnerable guard); three graders — run-binary
fabrication, field-scoped suppression, observational quote fidelity — and their wiring; a total
pre-registered decision table with baseline and post-intervention measurement at the arm's settled n
(20, or 40 after a confirmation run); a required
`evidence` field on the finder's finding schema, sanitized at the judge boundary; a live observation from
this change's own PR; a recorded decision.

**Out of scope:** shipping the fix as production default (separate rollout change on a PASS); the
calibration layer (severity monotony, category defaulting); prompt-strengthening as the fix; quote
validation in the schema; `.github/ai-review-rules.md`; the model swap; making the finder use
`getFileContext`; changing `scoreIssueRecall`'s semantics; a finder-side cap or `impact` axis; the
finder's 1-in-8 schema mismatch; wiring evals into CI.

## Architecture / Approach

Instrument → pre-register → measure → intervene once → decide. The intervention is structural, not
motivational: `findingSchema` gains a required `evidence` string, so grounding is enforced by the layer
the model acts on rather than requested in prose. `evidence` flows into `review.json` and the eval, is
omitted at the judge prompt boundary so the generation length that broke #127 stays flat, and is never
rendered in the comment.

The honest limit: `min(1)` proves non-emptiness, not quotation. So quote fidelity is a separate
observational number. Fabrication falling while quote fidelity stays poor is a real result — the field
disciplined the model without grounding it — and it belongs in the decision rather than being assumed
away.

## Phases at a Glance

| Phase                          | What it delivers                                                                                | Key risk                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Instrument                  | Two fixtures + three graders, fully hermetic, no cost                                           | A grader mis-fires on legitimately-worded findings                                         |
| 2. Pre-register + baseline     | A total decision table committed before any number, then the baseline at n=20 (40 if ambiguous) | Fixture does not reproduce the defect — change goes straight to the decision               |
| 3. The intervention            | Required `evidence` field, judge boundary, re-measured against the table                        | A required field raises the unrepairable-response rate and trades away glm's best property |
| 4. Live observation + decision | Live reading from this PR's own review, then `decision.md` and one disposition                  | Offline result does not transfer live                                                      |

**Prerequisites:** `OPENROUTER_API_KEY` for Phases 2-4 (evals make real paid calls, no dry-run mode).
Phase 4's live observation comes free from this change's own PR — `review.yml` runs the finder from the
PR head.
**Estimated effort:** ~3-4 sessions across four phases; under $1 of provider spend.

## Open Risks & Assumptions

- **The defect may be unfixable under this model.** Every fabrication is an absence claim, verifying an
  absence needs to look past the hunk, and glm has made zero `getFileContext` calls in every recorded
  configuration. The decision table exists because of this.
- **A required field may reduce usable output.** The finder already fails `response did not match schema`
  1 in 8 runs on the real diff _before_ this change, and a response missing a required field is
  unrepairable by design. This is a guard threshold, not a nice-to-have.
- **The fixture may not reproduce.** No fixture has ever produced the collapse — 30 glm rows across
  three committed matrices, never once. Phase 2 gates on this and routes to a documented negative.
- **The metric only catches fabrications about defences we thought to list.**
- Assumed: `evidence` quoting is discouraging enough to matter. It may instead convert invisible
  fabrication into visible fabrication — measurably, now, via the quote-fidelity number.

## Success Criteria (Summary)

- A total decision table exists in `verification.md`, provably committed before the baseline run.
- Baseline and post-intervention `fabrication_runs`, `usable_output`, and `guard_reported` are recorded
  with committed snapshots, and the outcome is read off the table without renegotiation.
- `decision.md` records the outcome and exactly one disposition — hand to a rollout change, revert and
  record the limitation, or document the fixture's reproduction limits.
- The instrument ships under every outcome, because it documents the defect independently of any fix.
