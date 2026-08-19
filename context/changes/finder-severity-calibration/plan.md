# Finder Severity Calibration — Implementation Plan

## Overview

The finder detects a cross-user path traversal and files it as `minor`. This change makes that
impossible, via the smallest attributable intervention, and **concludes with a recorded decision** rather
than assuming the first lever works.

Research finding that shapes everything below: **the finder's prompt defines severity nowhere.**
`buildInstructions` (`prompts.ts:26-58`) never mentions `critical`, `major`, `minor`, or `nit`. The only
guidance the model receives is the schema's `.describe("How bad the issue is if left unfixed")`
(`schemas.ts:46`). It is choosing from a four-value enum with no rubric — which is exactly the shape that
produces the observed collapse to a single constant.

## Current State Analysis

All figures from the committed snapshot `baseline-n20.json` (40 draws, 20 per fixture) and three live
runs on PR #146. No new spend was required to produce them.

| Fixture    | Draws | `defect_reported` | Zero-finding draws | Severity-monotone draws | Monotone constant    |
| ---------- | ----- | ----------------- | ------------------ | ----------------------- | -------------------- |
| Vulnerable | 20    | **10 / 20**       | **0**              | 8                       | 7× `minor`, 1× `nit` |
| Defended   | 20    | n/a               | 7                  | 11                      | 9× `minor`, 2× `nit` |

"Monotone" = more than one finding, every one carrying the same severity.

### Key Discoveries

- **There is no silence problem.** All ten failing draws emitted findings (1–8 each). The finder always
  reports; it grades wrong. So the 20/20 target is about severity only, and `requireDefectReported` —
  which conflates "not reported" with "reported too low" — is not hiding a second defect here.
- **The defect is a collapse, not one finding's severity.** In 16 of 19 monotone draws the constant is
  `minor`. Raising traversal severity specifically would move the metric without touching the mechanism.
- **The constant is not always `minor`.** PR #146 run `32255940666` produced 8 findings, **all
  `critical`**, on a clean PR — narration graded critical. Any fix must not simply push the constant up.
- **The finder has no orthogonal second axis.** The impl reviewer carries `severity` + `impact`
  (`schemas.ts:337-342`) and does not collapse this way; the judge has an anchored score. The finder has
  a bare four-value enum. This is the structural asymmetry behind Phase 3.
- **The instrument exists and is validated.** `hardening-vulnerable.diff` (one indisputable defect:
  `readSourceObject` forwards `rawKey` into a storage path while its sibling `removeSourceObject` calls
  `parseObjectKey` two functions above) plus `requireDefectReported`, which requires the **same** finding
  to name the defect and carry `critical`/`major`.

## Desired End State

A detected cross-user authorization-boundary violation cannot be filed below `major`, with the severity
distribution genuinely differentiated rather than pushed up wholesale — and a written record of **which
lever** achieved it.

## What We're NOT Doing

- **Not rebuilding the instrument.** Fixture, grader and harness exist. This change starts at Phase 2.
- **Not combining both levers in one measurement.** User decision, 2026-08-19: the rubric is measured
  alone first. Shipping both at once would move the number without saying which lever moved it, and that
  attribution is the durable output.
- **Not reaching for a deterministic grader over model prose.** `lessons.md` — "Don't grade natural
  language with regexes" — cost seven review rounds in the predecessor. `requireDefectReported` is safe
  because it reads a structured `severity` field plus a small pattern set, not an argument.
- **Not re-litigating fabrication.** That is `finder-fabrication-triggers`.
- **Not re-opening the model swap.** Closed on cost evidence (sonnet-5 at 57.6×).
- **Not chasing the defended fixture's 7/20 zero-finding rate.** That fixture has nothing to find; zero
  findings is correct behaviour there, and PR #146's run B is the same phenomenon.

## Implementation Approach

Staged and pre-registered, per the user's decision:

1. **Phase 1** — re-measure the baseline on today's code. Controls for hosted-model drift behind a stable
   model id, so a Phase-2 improvement cannot be confounded with the provider changing under us.
2. **Phase 2** — add a severity rubric to the finder's instructions. Measure. If it hits the bar and the
   counter-checks stay clean, **stop and record**.
3. **Phase 3** — only if Phase 2 falls short: add the structural consequence field, measure again.

**Budget ceiling: ~$0.15 total** (user-set). Each n=20 single-fixture run is roughly $0.04–$0.05 at
glm-4.6 prices, so the ceiling accommodates baseline + rubric + one structural round, and no more.

## Phase 1: Re-measure the baseline, and pre-register the bar before any number exists

### Overview

Fresh n=20 on the vulnerable fixture against unmodified code, plus a committed decision table written
**before** the run. Git history proves the ordering, exactly as the predecessor did.

### Changes Required:

#### 1. `verification.md` — the pre-registration, committed FIRST

Write `context/changes/finder-severity-calibration/verification.md` and commit it **before** running
anything. It must state, in advance:

- The three metrics and how each is computed: `defect_reported` (existing grader), **monotony rate**
  (share of draws with >1 finding all carrying one severity — computable from the snapshot with `jq`, no
  API call), and the counter-check metrics `no_false_alarms` / the defended fixture's behaviour.
- The decision table, total over the outcome space — every combination of (target met / not met) ×
  (counter-checks clean / inflated) must map to a named disposition, so no result can arrive without a
  pre-agreed reading.
- **The n for every claim.** A 20/20 on n=20 has a wide interval; state it rather than implying
  precision the sample cannot carry.
- The escalation rule: what specifically constitutes "falls short" and triggers Phase 3.

#### 2. Baseline run

```
npx promptfoo eval --config evals/promptfooconfig.yaml \
  --filter-providers baseline-glm-4.6 \
  --filter-pattern "genuine traversal" \
  --repeat 20 --no-cache \
  -o context/changes/finder-severity-calibration/results/baseline-rerun-n20.json
```

Then compute monotony rate from the snapshot with the `jq` recipe recorded in
`review-pipeline-verification.md`.

**Interpretation rule, fixed in advance:** if this baseline differs materially from the committed 10/20,
the old snapshot is not a valid comparator and Phase 2's before/after uses **this** run only. Say so in
`verification.md` rather than quietly picking whichever baseline flatters the result.

### Success Criteria:

#### Automated Verification:

- [x] `verification.md` is committed before the run — provable from `git log` ordering (19c05a1 precedes the results commit)
- [x] The run completes and the snapshot lands under `results/` — `baseline-rerun-n20.json`, $0.0234
- [x] Monotony rate computed for the baseline and recorded — 6/20 (4× `minor`, 2× `critical`)

#### Manual Verification:

- [x] The decision table covers every outcome combination, with no "we'll decide when we see it" cell
- [x] Baseline is compared against the committed 10/20 and the drift question answered explicitly — **15/20 vs 10/20, outside the 7–13 band, so the drift rule FIRED and 15/20 is the comparator**

## Phase 2: The rubric — the smallest attributable intervention

### Overview

Add a severity rubric to `buildInstructions`. Measure. Stop if it works.

### Changes Required:

#### 1. `packages/code-reviewer/src/prompts.ts` — the rubric

Add one entry to the `buildInstructions` array, after the "Report only issues worth fixing" line. Anchor
each level on **consequence**, not on vocabulary, since the predecessor established that the collapse is
not driven by subject matter:

- `critical` — exploitable, or causes data loss or corruption; crossing an authorization or trust
  boundary belongs here.
- `major` — incorrect behaviour a user would notice, or a defence that is absent where one is required.
- `minor` — a real defect with bounded impact.
- `nit` — taste, naming, formatting.

Two constraints on the wording, both load-bearing:

- **It must push both ways.** The observed constant is `minor` on fixtures and `critical` on PR #146's
  clean diff. A rubric that only says "grade authorization issues critical" would convert one collapse
  into the other. State explicitly that most findings are not critical, and that a finding whose fix is a
  suggestion rather than a defect is a `nit`.
- **It goes in the trusted system instructions**, never in the fenced unit — the same boundary every
  other instruction respects (`impl-review-phase-1 F4`).

#### 2. `prompts.test.ts`

Pin that the rubric text appears in the built instructions, and that it appears for every lens (the
collapse is not lens-specific).

#### 3. Measurement

Identical invocation to Phase 1, output to `results/rubric-n20.json`. Then the counter-checks —
`no_false_alarms` on `clean-change.diff` and the defended fixture — which the plan treats as
**non-negotiable**: a run that hits 20/20 while inflating those is a failure, not a partial win.

### Success Criteria:

#### Automated Verification:

- [ ] `cd packages/code-reviewer && npm run typecheck && npm test && npm run lint`
- [ ] Rubric run completes; snapshot committed
- [ ] Counter-check run completes; snapshot committed

#### Manual Verification:

- [ ] Result read against the **pre-registered** table, not against a bar adjusted after seeing it
- [ ] Monotony rate compared before/after — did the distribution differentiate, or did the constant just
      move up?
- [ ] Decision recorded in `decision.md`: PASS (stop) or SHORT (escalate to Phase 3), with the numbers

## Phase 3: Structural — only if Phase 2 falls short

### Overview

**Conditional.** Do not start this phase if Phase 2 met the pre-registered bar. If it did, this phase is
deleted from the plan with a note saying why, and that is a successful outcome.

### Changes Required:

#### 1. The consequence field

Give the finder the orthogonal second axis it lacks — a required field the severity must follow, so
severity is a conclusion rather than a free choice. Mirrors the impl reviewer's `severity`/`impact` pair,
which does not exhibit this collapse.

The exact shape is a Phase-3 design decision informed by Phase 2's failure mode, and deliberately not
fixed here: choosing it now would be guessing before the evidence exists.

#### 2. Blast radius

The finder's wire schema is read by the judge, the renderer, the eval schema
(`evals/review-result.schema.json`) and the fixtures. Any field added here must be threaded through all
of them, and `lessons.md` records that an **optional** field in a model-facing schema gets skipped no
matter how the prompt asks — so if it is wanted in practice, it must be `required`.

### Success Criteria:

#### Automated Verification:

- [ ] Full package gate green
- [ ] Structural run completes; snapshot committed
- [ ] Counter-checks re-run and still clean

#### Manual Verification:

- [ ] Attribution stated plainly: how much of the movement came from the rubric versus the structure
- [ ] Total spend against the ~$0.15 ceiling recorded

## References

- `context/changes/finder-severity-calibration/change.md` — scope, baseline re-read, the collapse finding
- `context/foundation/review-pipeline-verification.md` — the variance entry, the monotony `jq` recipe
- `context/archive/2026-08-13-finder-security-vocabulary-bias/` — the instrument, `verification.md` as
  the pre-registration template, and `decision.md` as the outcome template
- `context/foundation/lessons.md` — "Don't grade natural language with regexes"; "An optional field in a
  structured-output schema will be skipped"
- `packages/code-reviewer/src/prompts.ts:26-58` — `buildInstructions`, where severity is undefined today
- `packages/code-reviewer/src/schemas.ts:9,46` — `severitySchema` and its lone `.describe`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Re-measure the baseline, and pre-register the bar before any number exists

#### Automated

- [x] 1.1 Write and commit `verification.md` BEFORE any run — 19c05a1
- [x] 1.2 Baseline n=20 run on the vulnerable fixture; snapshot committed
- [x] 1.3 Monotony rate computed and recorded

#### Manual

- [x] 1.4 Decision table is total over the outcome space
- [x] 1.5 Drift question answered against the committed 10/20 — re-measured 15/20, drift rule FIRED; 15/20 adopted as the comparator

### Phase 2: The rubric — the smallest attributable intervention

#### Automated

- [ ] 2.1 Add the severity rubric to `buildInstructions`
- [ ] 2.2 Pin the rubric in `prompts.test.ts` across all lenses
- [ ] 2.3 Package gate green (typecheck, test, lint)
- [ ] 2.4 Rubric n=20 run; snapshot committed
- [ ] 2.5 Counter-check run; snapshot committed

#### Manual

- [ ] 2.6 Read against the pre-registered table
- [ ] 2.7 Monotony before/after compared — differentiated, or constant merely moved?
- [ ] 2.8 `decision.md` written: PASS (stop) or SHORT (escalate)

### Phase 3: Structural — only if Phase 2 falls short

#### Automated

- [ ] 3.1 Design and add the consequence field (shape informed by Phase 2's failure mode)
- [ ] 3.2 Thread through judge, renderer, eval schema, fixtures
- [ ] 3.3 Package gate green
- [ ] 3.4 Structural n=20 run; snapshot committed
- [ ] 3.5 Counter-checks re-run and clean

#### Manual

- [ ] 3.6 Attribution stated: rubric versus structure
- [ ] 3.7 Total spend recorded against the ~$0.15 ceiling
