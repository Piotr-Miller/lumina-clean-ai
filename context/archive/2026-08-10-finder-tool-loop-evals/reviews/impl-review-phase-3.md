<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder Tool-Loop Evals + Model Decision

- **Plan**: `context/changes/finder-tool-loop-evals/plan.md`
- **Scope**: Phase 3 of 4
- **Date**: 2026-08-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Quality metrics exclude failed repeats

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `context/changes/finder-tool-loop-evals/decision.md:15`
- **Detail**: The record promises repeat-level rates, but several quality metrics condition on successful output. DeepSeek's `no_false_alarms` is shown as 1/1 despite three clean repeats and two provider errors. Its recall is calculated across 7/9 scored defect rows; Haiku's perfect recall excludes one failed repeat. Repairs are shown as raw `0` rather than `0/12`. The adjacent `Usable output` column makes the omission visible, but “perfect recall/precision” remains conditional.
- **Fix A ⭐ Recommended**: Show conditional quality and coverage together.
  - Strength: Preserves the distinction between review quality and provider reliability while exposing every denominator.
  - Tradeoff: Makes the table slightly wider.
  - Confidence: HIGH — all denominators were reproduced from the raw rows.
  - Blind spot: Production retry behavior remains unmeasured.
- **Fix B**: Count provider-error repeats as zero in end-to-end rates.
  - Strength: Every repeat contributes to the advertised rate.
  - Tradeoff: Conflates content quality with schema/provider failures and may overstate failures relative to production retries.
  - Confidence: HIGH — arithmetic is deterministic.
  - Blind spot: The matrix deliberately uses one attempt per row.
- **Decision**: ACCEPTED — **Fix A** applied. Every quality cell now carries its denominator
  (recall `0.952 (7/9)`, `no_false_alarms` `1/1 (of 3)`, repairs `0/8`), a lead-in paragraph states
  that telemetry columns cover all repeats while quality columns are conditional on usable output,
  and a Caveats bullet names deepseek's one-scored-row precision explicitly. Fix B was declined:
  scoring a provider error as a quality zero would conflate "reviewed badly" with "never produced a
  review", and the two failure classes drive different decisions — the first disqualifies a model on
  quality, the second on reliability, and the record needs to say which.

### F2 — Zero-call evidence counts tool-disabled rows

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `context/changes/finder-tool-loop-evals/decision.md:51`
- **Detail**: “0/12 here” includes six canary/React rows where the tool was not attached and therefore could not be called. Eligible matrix evidence is 0/6 tool-enabled rows. The listed historical operands also sum to 21, not the stated 19, before considering possible overlap.
- **Fix**: State 0/6 tool-enabled matrix rows and omit the cumulative total until the historical observations are deduplicated.
- **Decision**: ACCEPTED — fixed as prescribed, and the arithmetic complaint is correct: the listed
  operands sum to 21, not 19. The claim is now "0/6 tool-enabled rows in this matrix plus 0/3 in the
  probe", with the historical runs cited as corroboration under different harnesses and prompts
  rather than as addends, and an explicit sentence stating that no cumulative figure is claimed.
  The six canary/React rows carried no tool and are named as not being evidence in either direction.

### F3 — Retry failure percentages assume independent attempts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `context/changes/finder-tool-loop-evals/decision.md:58`
- **Detail**: The projected 11% DeepSeek and 0.7% Haiku production failure rates square the observed 4/12 and 1/12 single-attempt rates. That assumes independent, identically distributed retries, but no paired retry run tested this. Routing and schema failures may be correlated.
- **Fix**: Report the observed 33.3% and 8.3% single-attempt rates and say retry reliability remains unmeasured.
  - Strength: Keeps every reliability claim directly supported.
  - Tradeoff: Removes a convenient production estimate.
  - Confidence: HIGH — the snapshot contains no retry experiment.
  - Blind spot: Phase 4 may provide only one live observation, not a rate.
- **Decision**: ACCEPTED — fixed as prescribed. The projected ~11% / ~0.7% figures are removed and
  replaced with the observed single-attempt rates (33.3% deepseek, 8.3% haiku, 0% glm-4.6 and
  sonnet-5), with the removal itself recorded so the earlier number is not silently rewritten. The
  Caveats bullet now states that squaring assumes i.i.d. retries, that no paired-retry experiment
  was run, and that a schema failure may recur on the same prompt while a routing error persists for
  as long as the route is unavailable.

  This finding cost the haiku recommendation its main reliability defence, so the recommendation was
  re-argued rather than left standing on a deleted premise: haiku is now stated to LOSE to both
  glm-4.6 and sonnet-5 on observed schema reliability, and to be recommended anyway because the gate
  is advisory, carries a retry and a manual re-run label, and cross-hunk blindness is the defect the
  change exists to fix. The reviewer's blind-spot note is adopted verbatim into the Phase 4 exit
  criteria: one live run can only falsify — a failure is decisive against haiku, a success is not
  proof of reliability. If it fails live, the fallback is sonnet-5, not a revert to glm-4.6.

## Verification Evidence

| Check            | Result                                                                      |
| ---------------- | --------------------------------------------------------------------------- |
| Snapshot JSON    | PASS — 48 rows, four models, four cases, repeat 3, cache disabled           |
| Tool telemetry   | PASS — 16 rows with non-zero calls; cross-hunk delivery best 3/3, worst 0/3 |
| Cost telemetry   | PASS — all 48 rows non-zero; total $0.626254664                             |
| Secrets/PII scan | PASS — zero key-shaped tokens, bearer values, emails, or user-home paths    |
| Manual criteria  | PASS — all three have observable evidence                                   |
| Mutation testing | SKIPPED — Phase 3 changes only decision/evidence artifacts                  |
| Guardrails       | PASS — production adoption remains gated on Phase 4 live validation         |

## Scope Notes

- Reviewed implementation commit: `b24e65d`.
- `plan.md` and `verification.md` bookkeeping changes were expected and accurate.
- The unplanned $0.16 probe is documented evidence, not product-scope expansion.
- No runtime code, production configuration, or archived change was modified by this review.
