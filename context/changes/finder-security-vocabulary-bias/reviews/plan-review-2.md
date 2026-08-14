<!-- PLAN-REVIEW-REPORT -->

> **Review 2 of 2 — reviews the REVISED plan and the Phase 1 instrument.** Its F1-F5 are unrelated to the
> first review's F1-F7; the earlier numbering is cited throughout `plan.md`, `plan-brief.md`, `change.md`
> and `lessons.md`, so the two must not be conflated. Review 1 is
> [`plan-review.md`](plan-review.md).
>
> Filed here on 2026-08-14 after it was written over review 1's path.

# Plan Review: Finder Precision on Hardening Diffs — revised plan + Phase 1

- **Plan**: `context/changes/finder-security-vocabulary-bias/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-14
- **Verdict**: RETHINK
- **Findings**: 3 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | FAIL    |

## Grounding

Grounding: 15/15 paths ✓, 6/6 symbols ✓, brief↔plan ✓, Progress 41/42 ✗

Targeted verification: 105/105 tests passed ✓

## Findings

### F1 — Fabrication matcher misses ordinary and historically observed wording

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: `packages/code-reviewer/evals/assertions.mjs:272`, `packages/code-reviewer/evals/promptfooconfig.yaml:278`
- **Detail**: The shipping matcher returned `fabrication: false` for all six realistic defect descriptions tested:
  - “The code does not validate the object key before download.”
  - “The object key isn't checked before it reaches storage.”
  - “The function omits validation of rawKey.”
  - “This allows path traversal outside the user's folder.”
  - “parseObjectKey is never called before the path is built.”
  - “The regex allows arbitrary characters, including ../.”

  The last form closely matches the historical F2 language recorded in `research.md:366`. This can suppress `fabrication_runs` and falsely classify a genuinely vulnerable fixture as `INVALID-FIXTURE`.

- **Fix**: Expand the deterministic matcher and regression corpus before Phase 2. Cover direct negated verbs, contractions, omission wording, attack-enabling predicates, `parseObjectKey`, and permissive-regex/arbitrary-character language.
- **Strength**: Hermetic and directly protects the measurement.
- **Tradeoff**: Lexical matching will still require maintenance for future paraphrases.
- **Confidence**: HIGH — reproduced against the shipping matcher.
- **Blind spot**: Unseen semantic equivalents can still escape a finite vocabulary.

### F2 — The INVALID-FIXTURE branch cannot complete Phase 3 Progress

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: `plan.md:320`, `plan.md:360`, `plan.md:618`, `plan.md:663-679`
- **Detail**: The Phase 2 gate says fewer than four fabrication runs ends the experiment as `INVALID-FIXTURE` and Phase 3 does not start. Progress nevertheless requires every Phase 3 intervention, validation, rerun, and evidence-retention row to be completed. That contradicts the plan's claim that every terminal outcome is completable.
- **Recommended fix**: Replace those Phase 3 rows with newly numbered, branch-neutral criteria. Each row should accept either execution evidence on the valid-fixture branch or an explicit `INVALID-FIXTURE` N/A record.
- **Strength**: Preserves one change and makes completion truthful.
- **Tradeoff**: Conditional Progress criteria are more verbose.
- **Confidence**: HIGH — direct control-flow contradiction.
- **Blind spot**: The implementation workflow has no separate “skipped” checkbox state.
- **Alternative**: End this change after baseline classification and open a separate intervention change only when the fixture is valid. This is cleaner and linear, but introduces another handoff.

### F3 — Phase 4 has a success criterion with no Progress row

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `plan.md:545-549`, `plan.md:691-693`
- **Detail**: Phase 4 contains four manual-verification bullets, but Progress tracks only three. The missing row is the outcome-specific action: opening rollout, reverting intervention, or recording reproduction limits.
- **Fix**: Add a new `4.7` Progress row for the outcome-specific disposition. Do not renumber previously reviewed rows.

### F4 — `review.json` retention lacks an artifact-level regression test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `plan.md:442-452`, `packages/code-reviewer/src/cli.ts:301`, `packages/code-reviewer/src/cli.test.ts:71-78`
- **Detail**: The plan promises that evidence survives into `review.json`, but its Phase 3 test blast radius omits `src/cli.test.ts`. Pipeline assertions prove the in-memory DTO, not the serialized artifact.
- **Fix**: Include `packages/code-reviewer/src/cli.test.ts` and assert that a finding with evidence retains that evidence in emitted `review.json`.

### F5 — The 20-run fixture gate has material misclassification risk

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: `plan-brief.md:50`, `plan.md:320`
- **Detail**: With `n=20` and validity defined as at least four fabrication runs:
  - At a true 25% rate, the fixture is falsely rejected about 22.5% of the time.
  - At a true 20% rate, it is falsely rejected about 41.1% of the time.
  - At a true 10% rate, it is falsely accepted about 13.3% of the time.

  That is weaker discrimination than the brief currently implies.

- **Fix**: Pre-register acceptable error rates and select sample size/threshold accordingly, or add one bounded baseline confirmation run for ambiguous results before spending on intervention.

## Conclusion

The fixtures themselves now look sound: the defended fixture has no critical defect, and the vulnerable fixture contains one clear, isolated defect. The remaining blocker is that the measurement machinery still misses realistic reviewer language, and the plan's terminal branches cannot all satisfy Progress as written.

**Verdict: RETHINK.**

---

## Dispositions (2026-08-14, Claude)

All five addressed. F1 was resolved by a change of instrument rather than a fix, and F5's arithmetic was
verified independently before acting on it.

### F1 — FIXED, by inverting the instrument rather than repairing it

Accepted, and it was the sixth round of the same failure. The matcher was repaired for the named cases
and broke adjacent ones every time; the fifth round's own fixes produced this round's five defect
classes. Verified locally: 7 of 8 reported cases reproduced.

Rather than a seventh round, the roles were inverted through the reversal route the plan pre-registered:
`no_fabricated_absence` is now the `llm-rubric`, and the deterministic matcher is `fabrication_floor`, an
observational cross-check narrowed to high-precision templates that name their own mechanism. The
templates whose failures were being chased — omission verbs, the missing-state subject form, the
permissive family and its three guards, pronoun-clause inheritance — are removed, and the floor's blind
spots are pinned as seven explicit "documented miss" tests so the scope is stated rather than accidental.

What validates the rubric is recorded in the plan amendment: Phase 2's manual criterion 2.6 is promoted
from sanity check to the rubric's validation, and a rubric misgrading ≥3 of 20 hand-read rows routes the
change to INVALID-FIXTURE. Commit `56ea063`.

### F2 — FIXED, and the diagnosis was of a claim I wrote

Accepted in full. The Progress preamble asserted that every Phase 3 and 4 row was completable under any
outcome. That holds for Phase 4, whose rows ask that a branch be **recorded**, and is false for Phase 3,
whose rows all presuppose the intervention was built.

The branch structure is now stated instead of implied: Phases 1-2 always execute; the Phase 2 gate
decides the rest; on the INVALID-FIXTURE branch rows 3.1-3.14 and 4.1-4.3 resolve as
`N/A (INVALID-FIXTURE, <sha>)` while 4.4-4.6 tick normally, because `decision.md` is still written.
`references/progress-format.md` has no skipped state, so that marker is a local extension of the
convention — spelled out in advance rather than improvised, and meaning "not reachable on the branch
taken", never "we chose not to do it".

The offered alternative (end this change at Phase 2, open a separate intervention change) is recorded as
rejected-for-now with its condition: the experiment is already split once, and a second split puts three
handoffs between the instrument and any answer. **If the INVALID-FIXTURE branch is actually taken,
prefer opening the follow-up over carrying fourteen N/A rows into the archive.**

This finding is also more load-bearing than when it was filed: the F1 amendment added a _second_ route
into INVALID-FIXTURE (rubric misgrades ≥3 of 20), so that branch went from unlikely to genuinely
reachable.

### F3 — FIXED as specified

Progress row `4.7` added for the outcome-specific disposition, without renumbering reviewed rows.

### F4 — FIXED as specified

`cli.test.ts` added to the Phase 3 blast radius, and criterion 3.7 now names the assertion explicitly.
The gap is real and specific: the pipeline assertions prove the in-memory DTO retains `evidence`, not
that the serialized artifact does. `review.json` is what a human audits after a failed review, so its
retention is asserted where the file is written (`cli.ts:301`) rather than inferred from the object that
precedes it.

### F5 — FIXED, after independent verification, with a correction on the record

Accepted. I had told the user this finding was "substantially answered" by the F1 inversion. **That was
wrong** — F5 is a statistical-power argument about n=20 and is independent of which instrument does the
measuring. The arithmetic was recomputed from the binomial rather than taken on trust, and it is exact:
at a true 25% rate the flat `≥ 4/20` gate wrongly rejects 22.5% of the time, at 20% it wrongly rejects
41.1%, and at 10% it wrongly accepts 13.3%.

The 25% figure is the live one: research measured local reproduction at 2 of 8. So the gate as written
would have killed the change on noise roughly one run in four and a half.

Replaced with a two-stage adaptive gate whose error rates are pre-registered rather than implied:
immediate VALID at ≥6/20 (false accept at a true 5% rate: 0.03%), immediate INVALID at ≤1/20 (false
reject at 20%: 6.9%), and one bounded confirmation run for the ambiguous 2-5 band pooled to n=40 with a
≥5 threshold (false reject at 20%: 7.6%; false accept at 5%: 4.8%). The confirmation run is capped at
exactly one, so the ambiguous branch doubles a sub-dollar spend rather than opening a loop.
