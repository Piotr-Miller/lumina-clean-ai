# Finder Precision on Hardening Diffs — Implementation Plan

> Revised 2026-08-14 against `reviews/plan-review.md` (verdict RETHINK, 3 critical). The shape changed:
> this is now an **experiment whose deliverable is a decision**, not a change that ships a fix. See
> "Implementation Approach" for why, and the review doc for per-finding disposition.

## Overview

The code-review finder fabricates findings on hardening diffs: it asserts a defence is **absent** when
the diff contains it, in one case flagging a line two below the comment explaining that defence. Four of
ten findings on PR #127 were factually contradicted by the code they cited.

This change builds a deterministic instrument for that fabrication rate, pre-registers a total decision
table, measures a baseline, tries one structural intervention — requiring each finding to quote the diff
line it rests on — and **concludes with a recorded decision**. Rollout, if the decision is PASS, is a
separate change.

## Current State Analysis

From `research.md` (all figures measured):

- **The defect is a precision failure.** Of #127's ten findings: 4 factually contradicted by the cited
  code, 4 real-ish concerns with the wrong category and severity, 2 vacuous, **0 genuinely
  security-class and critical-class**.
- **It reproduces outside CI**, 2 of 8 local runs on the real #127 diff, and is **intermittent** — a
  distributional defect, so no single row can detect it.
- **Every fabrication is an absence claim.** Verifying an absence needs to look past the hunk, and
  `z-ai/glm-4.6` has made **zero** `getFileContext` calls in every recorded configuration
  (`finder-tool-loop-evals/decision.md:70-86`), including with a strengthened instruction.
- **The harness cannot grade this.** `category` is read by zero assertions; severity is reduced to a
  single boolean (`assertions.mjs:8-36,42-79`). No fixture has hardening subject matter.
- **Prompt-text fixes have failed on this model.** `09e6e03` spelled out a trigger class and moved glm
  not at all; `lessons.md:166-171` and `:187-192` record two further prompt-then-structure sequences.
- **A refuted mechanism we do not chase:** the trusted project-rules file is not _necessary_ — removing
  it entirely still produced a full collapse (1/5).

Two facts the plan review surfaced that change how this must be measured:

- **`schema_validity` cannot detect reliability loss.** It exists only on successful provider calls
  (`evals/README.md:33`), and the provider serializes an already-zod-validated object, so it is
  near-tautological (`code-review-evals/reviews/impl-review.md:65-73`). Generation failures become
  provider-error rows carrying no metric at all.
- **`scoreIssueRecall` is field-blind.** It regex-tests `JSON.stringify(review)` as one flat blob
  (`assertions.mjs:236`), so once findings carry a verbatim source quote, a planted-defect pattern can
  match the **quote** instead of the finding.

## Desired End State

A recorded, pre-registered decision about whether requiring quoted evidence reduces fabrication on
hardening diffs — and an instrument that will still measure the defect if the answer is no.

Concretely, when this change is done:

- Two hardening fixtures and a binary `no_fabricated_absence` metric exist and run under
  `npm run eval`, with a companion observational metric reporting what share of `evidence` strings are
  verbatim diff quotes.
- `verification.md` carries a **total** PASS / FAIL / INCONCLUSIVE table written before any number
  existed, a bounded rerun policy, and the measured baseline and post-intervention results.
- `decision.md` states the outcome and its consequence: hand the schema change to a rollout change, or
  revert it and record the measured fabrication rate as a known finder limitation.
- The instrument survives either way, because it documents the defect independently of any fix.

Explicitly **not** claimed as an end state: that every `evidence` string is a verbatim diff quote. The
schema enforces non-emptiness only; quote fidelity is _measured_, not guaranteed. See F4 in the review.

### Key Discoveries:

- `packages/code-reviewer/evals/assertions.mjs:118-142` — `countToolCalls` proves a `javascript`
  assertion may return an arbitrary numeric score that promptfoo averages as a named metric.
- `packages/code-reviewer/evals/assertions.mjs:236` — `scoreIssueRecall` searches the whole serialized
  review; it must **not** be reused to guard against suppression once `evidence` exists.
- `packages/code-reviewer/evals/README.md:33` — `schema_validity` only exists on successful calls.
- `packages/code-reviewer/evals/promptfooconfig.test.ts:82-108` — grader and its var travel together;
  `:86-88` keeps case-specific graders off `defaultTest`, because promptfoo prepends default asserts.
- `packages/code-reviewer/evals/review-result.schema.json` — draft-07, `additionalProperties: false`.
  Adding a field fails `schema_validity` on every row until this file changes in the same commit.
- `packages/code-reviewer/src/prompts.ts:95-115` — `buildJudgePrompt` serializes complete finding
  objects, so stripping a field at one caller does not sanitize the judge boundary.
- `packages/code-reviewer/src/findings.ts:43-58` — `mergeFindings` dedups on `file:line|category` and
  keeps the higher severity; a new field must not enter that key.
- `packages/code-reviewer/src/output-repair.ts` — repair "never invents a finding, never drops one", so
  a response missing a **required** field is unrepairable by design and surfaces as a provider error.
- `finder-tool-loop-evals/decision.md:74-78` — glm is "the most schema-reliable model in the matrix",
  which is exactly the property a required field risks trading away.
- `research.md` §7 — the finder already fails `response did not match schema` 1 in 8 runs on the real
  diff, before this change adds anything.

## What We're NOT Doing

- **Not shipping the fix in this change.** The deliverable is a decision. Production rollout — merging
  the schema change as default behaviour, `AGENTS.md`, any prompt documentation — is a separate change,
  opened only on a PASS. This mirrors `finder-tool-loop-evals`, whose deliverable was the decision "no
  model change" and which archived cleanly on a negative result.
- **Not fixing the calibration layer** (severity monotony, category defaulting to `security`). Real,
  separable, and it would confound this measurement. Its own change.
- **Not enforcing quote fidelity in the schema.** A quote check in `superRefine` would reject an entire
  review over one bad quote, colliding with the reliability risk. Measured, not enforced.
- **Not changing the finder's prompt as the lever.** One orientation sentence is in scope.
- **Not touching `.github/ai-review-rules.md`.** Refuted as necessary; frequency contribution unmeasured
  and staying that way here.
- **Not re-opening the model swap.** Closed at 57.6× on matched-baseline evidence.
- **Not making the finder use `getFileContext`.** Zero calls across every recorded configuration.
- **Not changing `scoreIssueRecall`'s semantics.** Historical metrics across three committed matrices
  would silently change meaning; the suppression guard gets its own grader instead.
- **Not adding a finder-side cap or an `impact` axis.** Calibration-layer ideas.
- **Not wiring evals into CI.** Paid and manual, per `evals/README.md:3`.

## Implementation Approach

Instrument, pre-register, measure, intervene once, decide. The plan review's F3 established that a
single change cannot both run an experiment with three possible outcomes and mechanically complete a
rollout, so this change stops at the decision and every Progress row is phrased so it can be truthfully
completed under any outcome.

The intervention is a required `evidence` field. The reasoning is mechanical rather than motivational:
**an absence claim has no line to quote.** Either the model declines the claim, or it quotes something
that visibly fails to support it — which the metric and a human reader can both see. This is the same
move as the required `locus` field that took impl-review anchoring from 0/10 to 4/6.

The honest limit, per F4: `z.string().min(1)` proves non-emptiness, not quotation. So the change measures
quote fidelity as a separate observational number rather than assuming it. If fabrication drops while
quote fidelity is poor, that is a real and interesting result — the field disciplined the model without
grounding it — and it belongs in the decision.

## Critical Implementation Details

**The reliability guard must count attempts, not metrics.** A finder response missing a required field
is unrepairable by design, so it becomes a provider-error row with no `schema_validity` at all. Guarding
on `schema_validity` would therefore stay green while failures climbed. The guard is **usable-output
rate over all attempts**: how many of the 20 produced a parseable review at all.

**`evidence` poisons any blob-searching grader.** Once findings carry verbatim source text, any
assertion that regex-tests the serialized review can match the quote instead of the finding. This is why
the suppression guard needs a field-scoped grader and why `scoreIssueRecall` stays untouched.

**Ordering inside Phase 3 is load-bearing.** `evals/review-result.schema.json` has
`additionalProperties: false`; the moment `evidence` is added, every eval row fails `schema_validity`
until that file is updated. Same commit, or the comparison is meaningless.

**`--no-cache` on every eval invocation.** The cache is on by default and cached repeats would fake the
independence that n=20 exists to provide.

## Phase 1: Instrument — fixtures and a run-binary fabrication metric

### Overview

Build the fixtures and the graders. No provider calls and no cost: everything here is verified against
synthetic JSON.

### Changes Required:

#### 1. Defended hardening fixture

**File**: `packages/code-reviewer/evals/fixtures/hardening-defended.diff` (new)

**Intent**: A small diff whose subject matter is hardening and whose defences are **present and
commented** — the shape that produced fabrication on #127. The fixture the fabrication metric grades.

**Contract**: A unified diff comparable in size to the existing fixtures (~30-100 lines) containing at
least three defences modelled on the ones actually fabricated about: a control-character stripper
applied at its call site, an anchored regex with an explicit safe character class, and a traversal
rejection. Each carries its explanatory comment, because #127's F7 flagged a line two below such a
comment. No planted defect — the ground truth is that there is nothing critical to find.

#### 2. Vulnerable hardening fixture (suppression guard)

**File**: `packages/code-reviewer/evals/fixtures/hardening-vulnerable.diff` (new)

**Intent**: Same subject matter, one genuine vulnerability. If the intervention works by making the
finder timid, this catches it.

**Contract**: Exactly one planted exploitable defect, indisputable in the way
`react-migration.diff:86`'s `dangerouslySetInnerHTML` is rather than debatable.

#### 3. Fabrication metric — run-binary

**File**: `packages/code-reviewer/evals/assertions.mjs`

**Intent**: Fail a review for claiming a declared-present defence is missing, scored so the metric means
the same thing the pre-registered bar counts.

**Contract**: New export reading the per-case var `presentDefences` — a list of
`{ label, patterns[] }`. For each finding, scan **only** `description` + `suggestion`; a fabrication is
a finding matching a defence's `patterns` _and_ an absence phrase. Score is **binary per run**: `1` when
zero fabrications, `0` otherwise — matching the bar's "N of 20 runs" unit rather than a finding-weighted
ratio (review F5). Offending findings are **deduplicated** so one finding matching several defences
counts once. The reason string carries the count, the defence labels, and the quoted finding.

The absence-phrase set decides what counts, so it is fixed here:

```
/\b(no|without|missing|absent|lacks?|fails? to|not (present|provided|implemented|validated|sanitiz\w+|enforced|checked))\b/i
```

**Implementation deviation (2026-08-14, Phase 1).** The pinned regex above was
replaced during implementation, in two rounds. Pinning the wrong detector is not
what pinning was for, and the wording of the fixture itself is what falsified
each attempt.

_Round 1 (own tests)_ replaced bare co-occurrence with negation cues plus an
80-character proximity window and a neutralized-cue blocklist, after
`"Validation looks solid; there is no test covering the traversal branch"` scored
as a fabrication and `"the key length is unbounded"` — an absence claim with no
negation word in it — was missed entirely.

_Round 2 (Phase 1 manual review, 1.14)_ discarded cue-proximity as the basis.
A negation near a defence says nothing about **what the negation attaches to**,
and reviewers routinely use negative wording to APPROVE a defence, so all four of
these scored as fabrications:
`"No path traversal is possible because parseObjectKey rejects dot segments"`,
`"No control characters can reach the logger because logSafeKey strips them"`,
`"The key length is not unbounded: MAX_KEY_LENGTH caps it"`,
`"The key is not unvalidated; OBJECT_KEY is an anchored allowlist"`.

**Shipped design: absence TEMPLATES over a mechanism vocabulary.** A negation
counts only when it attaches to the thing a defence _is_ — validation,
sanitization, a check, a guard, a bound — and attack nouns (traversal, injection,
XSS) are deliberately excluded from that vocabulary, because negating the attack
is approval. Five templates cover `no <mechanism>`, `is not <applied>`,
`fails to <defend>`, `is missing/absent`, and privative adjectives, the last
guarded against double negation so `not unbounded` reads as approval. Proximity
survives only as the link between an absence match and which defence it concerns.

This separates the pair the manual review named:
`"No traversal is possible because the check rejects it"` (approval) from
`"No traversal check exists"` (fabrication). All eleven classification cases are
pinned in `promptfooconfig.test.ts` against the SHIPPING fixture vars, which is
why both rounds of falsification came from tests rather than from a paid run.

#### 4. Suppression guard grader — field-scoped

**File**: `packages/code-reviewer/evals/assertions.mjs`

**Intent**: Prove the planted vulnerability was actually **reported**, not merely quoted. `evidence` will
contain the vulnerable line verbatim, so a blob search would pass on the quote alone (review F2).

**Contract**: New export reading a per-case var naming the expected defect's patterns. A pass requires a
**single finding** whose `description` + `suggestion` match — explicitly excluding `evidence`, `summary`,
`file`, and every other field — _and_ whose severity is `critical` or `major`. `scoreIssueRecall` is left
untouched so the three committed historical matrices keep their meaning.

#### 5. Quote-fidelity observational metric

**File**: `packages/code-reviewer/evals/assertions.mjs`

**Intent**: Measure, rather than assume, that `evidence` is a real quote (review F4). Observational — it
reports, it does not gate.

**Contract**: New export returning the share of findings whose `evidence`, after canonicalization
(strip leading `+`/`-`/space diff markers, collapse whitespace), appears as a substring of the diff
under review. Always passes; the number is the point. Zero findings scores `1` by convention, noted in
the reason.

#### 6. Grader wiring

**Files**: `packages/code-reviewer/evals/assertions.d.mts`,
`packages/code-reviewer/evals/promptfooconfig.yaml`,
`packages/code-reviewer/evals/promptfooconfig.test.ts`,
`packages/code-reviewer/evals/recall-selfcheck.mjs`

**Intent**: Declare the new exports, add the two cases, and pin the wiring invariants the config test
already enforces for every other grader.

**Contract**: `assertions.d.mts` gains three signatures. `promptfooconfig.yaml` gains two cases carrying
`diff`, `projectContext`, and their respective vars; all three new asserts are **per-case, never on
`defaultTest`**. `promptfooconfig.test.ts` gains grader⟺var pairing assertions mirroring
`scoreIssueRecall` ⟺ `expectedIssues`, plus a check that none of the three appears in `defaultTest`.
`recall-selfcheck.mjs` gains bare-node cases.

### Success Criteria:

#### Automated Verification:

- Package lint passes: `cd packages/code-reviewer && npm run lint`
- Type checking passes: `cd packages/code-reviewer && npm run typecheck`
- Unit tests pass: `cd packages/code-reviewer && npm test`
- Fabrication metric returns `0` for a review claiming a declared defence is missing, `1` otherwise
- Fabrication metric counts one finding once even when it matches several declared defences
- Fabrication metric returns `1` for a zero-finding review
- Fabrication metric ignores `evidence`, `summary`, and `file` when matching
- Suppression grader fails when the defect appears **only** in `evidence` and not in the finding text
- Suppression grader fails when a matching finding exists at `minor`/`nit` severity
- Quote-fidelity metric scores a verbatim quote `1` and an invented string `0`, and canonicalizes diff
  markers and whitespace
- Config test fails if any new grader lands on `defaultTest` or its var is missing
- `node evals/recall-selfcheck.mjs` passes with the new cases

#### Manual Verification:

- Both fixtures read correctly as a reviewer would: the defended one has nothing critical to find, the
  vulnerable one's defect is indisputable
- `presentDefences` patterns match the wording a reviewer would actually use, and do not fire on a
  finding that merely mentions a defence approvingly

**Implementation Note**: After automated verification passes, pause for manual confirmation before
proceeding.

---

## Phase 2: Pre-register a total decision table, then measure the baseline

### Overview

Write down every outcome and its consequence **before** producing a number. This phase is also a gate:
if the fixture does not reproduce fabrication, the change ends here with a documented negative.

### Changes Required:

#### 1. Pre-registered decision table

**File**: `context/changes/finder-security-vocabulary-bias/verification.md` (new)

**Intent**: A **total** decision function — no numeric band unowned (review F3) — plus a bounded rerun
policy, committed before the baseline exists.

**Contract**: Defines `fabrication_runs` (of 20, on the defended fixture), `usable_output` (of 20
attempts producing a parseable review — **not** `schema_validity`, per review F1), and
`guard_reported` (of 20 runs where the suppression grader passes).

- **Fixture validity gate**: baseline `fabrication_runs ≥ 4/20`. Below that the fixture does not
  reproduce the defect; Phase 3 does not start and the change goes to Phase 4 with an
  INVALID-FIXTURE outcome.
- **PASS**: `fabrication_runs ≤ 1` **and** `usable_output ≥ baseline − 1` **and** `guard_reported ≥ 19`.
- **FAIL**: `fabrication_runs ≥ 5` **or** `usable_output ≤ baseline − 3` **or** `guard_reported ≤ 18`.
- **INCONCLUSIVE**: everything else — which is exactly the bands the first draft left unowned
  (`fabrication_runs` 2-4, `usable_output` at `baseline − 2`, `guard_reported` 19 with a
  `fabrication_runs` in range). Policy: **one** rerun at n=20; if still INCONCLUSIVE, record as FAIL.

**Instrument-validation policy (added 2026-08-14, after the Phase 1 manual review).** The deterministic
matcher took four rounds to stop oscillating between recall and precision — round 3 caught 6 of 8
absence claims, round 4 caught 8 of 8 but turned 11 of 14 adversarial clean probes into false positives.
Its error rate is therefore **measured, not asserted**: the defended case carries a second grader,
`no_fabricated_absence_rubric`, judged by the neutral grader that already serves every other rubric in
the harness. `verification.md` pre-registers what their disagreement means, before any number exists:

- **Both metrics agree on ≥18/20 rows** → the deterministic metric is fit; it remains the kill bar and
  the rubric is recorded as corroboration.
- **They disagree on 3-5 rows** → the kill bar still reads from the deterministic metric, but every
  disagreeing row is read by hand and the adjudication is recorded per row.
- **They disagree on ≥6 rows** → the deterministic metric is **unfit for the kill bar**. The rubric
  becomes the gate and the plan is amended to say so. This is the only route by which the recorded
  "deterministic metric" decision may be reversed, and it requires the measurement, not an argument.

Recorded deliberately: the rubric is a **cross-check, not a second gate**. It cannot fail a run on its
own, because a model-graded number carries its own error and two ungoverned gates would be worse than
one measured gate.

Also records what is deliberately not measured: the calibration layer, the rules file's frequency
contribution, and quote fidelity as a gate.

#### 2. Baseline run and snapshot

**Files**: `context/changes/finder-security-vocabulary-bias/results/` (new)

**Intent**: Produce and commit the pre-intervention numbers so the comparison is auditable.

**Contract**: glm-only, both new cases, `--repeat 20`, `--no-cache`, per the filtered-invocation pattern
in `evals/README.md:57-70`. Snapshot the promptfoo export into the change folder as `code-review-evals`
did (`plan.md:190-196`). Record all three counts — including the provider-error count that
`usable_output` derives from — plus per-run finding distributions.

### Success Criteria:

#### Automated Verification:

- The filtered eval command completes and produces a result export
- The snapshot file exists under the change folder
- The recorded baseline includes `fabrication_runs`, `usable_output`, and `guard_reported`

#### Manual Verification:

- `verification.md`'s decision table was committed **before** the baseline run — verifiable from git
  history
- The decision table is total: every combination of the three counts maps to exactly one outcome
- Baseline fabrications read as genuinely false claims, not the metric mis-firing on legitimate wording
- Fixture-validity gate outcome recorded, and the branch taken from it is stated explicitly

**Implementation Note**: This phase spends real money — well under $1 at glm rates on small fixtures.
Pause for manual confirmation of the gate outcome before proceeding. An INVALID-FIXTURE outcome skips
Phase 3 and goes straight to Phase 4.

---

## Phase 3: The intervention — a required evidence field

### Overview

Require every finding to quote the diff line it rests on, then re-measure against the Phase 2 table.
This is an experiment on a branch, not a rollout.

### Changes Required:

#### 1. The schema field

**File**: `packages/code-reviewer/src/schemas.ts`

**Intent**: Make grounding structural rather than requested. A finding must carry the diff text it rests
on; an absence claim has nothing to put there.

**Contract**: `findingSchema` gains a **required** `evidence: z.string().min(1)`, described as the exact
line(s) copied verbatim from the diff under review. Required rather than optional, per
`lessons.md:166-171`. No `minimum`/`maximum`, no union, per `lessons.md:187-192`. No quote validation in
the schema — one bad quote must not reject a whole review.

#### 2. Eval output schema

**File**: `packages/code-reviewer/evals/review-result.schema.json`

**Intent**: Keep `schema_validity` meaningful. Must land in the same commit as the field.

**Contract**: `evidence` added to `properties` and `required`; stays draft-07 with
`additionalProperties: false` retained.

#### 3. Judge boundary sanitization

**Files**: `packages/code-reviewer/src/prompts.ts`, `packages/code-reviewer/src/judge.ts`,
`packages/code-reviewer/src/pipeline.ts`, `packages/code-reviewer/scripts/judge-diagnose.mjs`

**Intent**: Keep the judge payload flat at the boundary rather than at one caller (review F6). #127's
downstream failure was an over-long judge generation; the judge APIs are publicly exported and
`judge-diagnose.mjs` bypasses the pipeline entirely.

**Contract**: `buildJudgePrompt` serializes a judge-facing projection of each finding rather than the
finding object, so `evidence` cannot reach the judge from any caller. `JudgePromptInput` names that
projection in its type. `PipelineResult` keeps full findings including `evidence`.
`judge-diagnose.mjs` updated to the new shape.

#### 4. Merge and render behaviour

**Files**: `packages/code-reviewer/src/findings.ts`, `packages/code-reviewer/src/render.ts`

**Intent**: Keep dedup identity and comment weight exactly as they are.

**Contract**: `evidence` does not join the `file:line|category` dedup key; when duplicates collapse the
surviving higher-severity finding's evidence is kept. `render.ts` does not render `evidence` — it is an
audit field in `review.json`, and the comment already caps at five findings.

#### 5. Envelope-repair behaviour, documented

**File**: `packages/code-reviewer/src/output-repair.ts`

**Intent**: State what happens when a response omits the new required field, because it determines what
the reliability guard sees (review F7).

**Contract**: Repair's contract is unchanged — it never invents a finding and never drops one — so a
response missing `evidence` is **unrepairable** and surfaces as a provider error. A comment records that
explicitly, and this is precisely why the Phase 2 guard counts usable output over attempts rather than
reading `schema_validity`.

#### 6. One prompt sentence

**File**: `packages/code-reviewer/src/prompts.ts`

**Intent**: Orientation only. The schema enforces; prompt strengthening has no track record here.

**Contract**: One sentence in `buildInstructions` stating that every finding must quote the diff lines it
rests on, and that a claim you cannot quote support for should not be reported.

#### 7. Test and fixture blast radius

**Files**: `packages/code-reviewer/src/schemas.test.ts`, `findings.test.ts`, `pipeline.test.ts`,
`render.test.ts`, `judge.test.ts`, `scorecard.test.ts`, `prompts.test.ts`, `provider-attempts.test.ts`,
`output-repair.test.ts`

**Intent**: A required field breaks every typed finding factory in the suite. Enumerated so the
implementer does not discover it one failing file at a time (review F7).

**Contract**: Each file's finding fixtures gain `evidence`. New or extended assertions map to the
behavioural criteria below: schema rejection in `schemas.test.ts`, dedup identity in `findings.test.ts`,
judge-projection omission in `prompts.test.ts` and `pipeline.test.ts`, render omission in
`render.test.ts`, and the unrepairable-missing-field case in `output-repair.test.ts`.

#### 8. Post-intervention measurement

**File**: `context/changes/finder-security-vocabulary-bias/verification.md`

**Intent**: Record all three counts and the resulting outcome, including a FAIL or INCONCLUSIVE.

**Contract**: Same command shape and n as Phase 2, snapshot committed alongside the baseline, plus the
quote-fidelity observational number. The outcome is read off the pre-registered table without
renegotiation; an INCONCLUSIVE triggers exactly one rerun.

### Success Criteria:

#### Automated Verification:

- Package lint passes: `cd packages/code-reviewer && npm run lint`
- Type checking passes: `cd packages/code-reviewer && npm run typecheck`
- Unit tests pass: `cd packages/code-reviewer && npm test`
- A finding without `evidence` is rejected by the schema
- The emitted JSON Schema contains no `minimum`, `maximum`, or `anyOf`
- `buildJudgePrompt` output provably omits `evidence` for a finding that has it
- `review.json` retains `evidence`
- `evidence` is absent from the rendered comment
- Dedup identity unchanged: findings differing only in `evidence` still collapse
- A response missing `evidence` is not repaired into a partial result
- Post-intervention eval run completes and its snapshot is committed

#### Manual Verification:

- All three counts recorded and the pre-registered outcome read off the table without renegotiation
- Quote-fidelity number recorded and interpreted — including the case where fabrication fell while
  quote fidelity stayed poor
- Rerun policy honoured: at most one rerun, and an INCONCLUSIVE second result recorded as FAIL

**Implementation Note**: After automated verification, pause for manual confirmation of the outcome
before Phase 4.

---

## Phase 4: Live observation and recorded decision

### Overview

Add live evidence to the decision, then record it and dispose of the intervention. Every criterion here
is completable under PASS, FAIL, or INVALID-FIXTURE.

### Changes Required:

#### 1. Live observation

**File**: `context/changes/finder-security-vocabulary-bias/verification.md`

**Intent**: Close the offline-to-live gap `lessons.md:159-164` exists to enforce — deepseek went 6/6 on
fixtures and 0/3 live. This change's own PR provides it free: `review.yml` runs the finder from the PR
head, so a branch carrying the intervention reviews itself.

**Contract**: Records the run URL and every finding read for fabrication with its `evidence` beside it.
Where the outcome was INVALID-FIXTURE or FAIL, records the observation anyway — a live reading of the
unmodified finder is still the best evidence about the defect's real rate. Notes that the finder runs on
every PR regardless of the code-review verdict, so the impl-review cost gate does not interfere.

#### 2. Decision and disposition

**Files**: `context/changes/finder-security-vocabulary-bias/decision.md` (new),
`context/changes/finder-security-vocabulary-bias/change.md`

**Intent**: State the outcome and what follows from it, in the form `finder-tool-loop-evals` used for a
change whose deliverable was a decision.

**Contract**: `decision.md` records the pre-registered table, the measured counts, the live observation,
and exactly one disposition:

- **PASS** → the schema change is handed to a new rollout change (production default, `AGENTS.md`, any
  prompt documentation). This change does not ship it.
- **FAIL / INCONCLUSIVE-then-FAIL** → the schema change is reverted from this branch; the measured
  fabrication rate is recorded as a known finder limitation.
- **INVALID-FIXTURE** → no intervention was attempted; the fixture and metric still land, and the
  recorded baseline documents what the fixture does and does not reproduce.

In every branch the instrument (fixtures, three graders, wiring) ships, because it documents the defect
independently of any fix. `change.md` is stamped with the outcome.

### Success Criteria:

#### Automated Verification:

- Full package gate passes: `cd packages/code-reviewer && npm run lint && npm run typecheck && npm test`
- The branch's `ai-review` run completes and uploads its artifact
- The instrument is present on the branch regardless of outcome: both fixtures and all three graders

#### Manual Verification:

- Live findings read and recorded, with fabrication assessed per finding
- `decision.md` states the outcome against every pre-registered criterion, including any that failed
- Exactly one disposition executed, and it matches the recorded outcome
- If PASS: the follow-up rollout change is opened. If FAIL: the schema change is reverted and the
  limitation is recorded. If INVALID-FIXTURE: the baseline's reproduction limits are recorded.

**Implementation Note**: Last phase; archive the change after it.

---

## Testing Strategy

### Unit Tests:

- Fabrication metric: binary scoring, dedup of multi-defence matches, zero-finding tolerance, field
  scoping (ignores `evidence`/`summary`/`file`), and no firing on approving mentions
- Suppression grader: fails on quote-only matches, fails on a below-severity match, passes on a genuine
  critical/major report
- Quote-fidelity metric: verbatim pass, invented fail, diff-marker and whitespace canonicalization
- Schema: `evidence` required, empty rejected, no forbidden JSON Schema keywords emitted
- Judge boundary: `buildJudgePrompt` omits `evidence` for any caller
- Findings: dedup identity unaffected; survivor keeps its own evidence
- Render: `evidence` never appears in the comment
- Repair: a response missing `evidence` is not repaired into a partial result

### Integration Tests:

- Existing hermetic pipeline tests pass with the new required field, including the repair path
- `recall-selfcheck.mjs` exercises all three new graders without a provider call

### Manual Testing Steps:

1. Read both fixtures as a reviewer; confirm the defended one has nothing critical and the vulnerable
   one's defect is indisputable
2. Confirm from git history that the decision table predates the baseline run
3. Read baseline fabrications to confirm the metric fires on real falsehoods
4. After the intervention, read a sample of `evidence` strings against the diff and compare with the
   quote-fidelity number
5. Read the live run's findings end to end

## Performance Considerations

Cost, not latency. glm runs ~$0.001-0.004 per fixture row
(`finder-tool-loop-evals/decision.md:126-131`), so 2 cases × 20 repeats × up to 3 runs (baseline,
post-intervention, at most one rerun) stays near $1. `evidence` adds output tokens to every production
review; the judge payload is unaffected by design, and the finder's own cost rise should be
sanity-checked from `finderTelemetry.cost` on the live run.

## Migration Notes

`evidence` is additive and required from the first run — no stored finder output to migrate. The one
compatibility surface is `evals/review-result.schema.json`, which changes in lockstep. Reverting is a
single revert of the schema field, that file, and the judge projection; the fixtures and graders are
kept in every branch, since they document the defect whether or not it is fixed.

## References

- Research: `context/changes/finder-security-vocabulary-bias/research.md`
- Plan review this revision answers: `context/changes/finder-security-vocabulary-bias/reviews/plan-review.md`
- Numeric-metric precedent: `packages/code-reviewer/evals/assertions.mjs:118-142`
- Field-blind grader to avoid reusing: `packages/code-reviewer/evals/assertions.mjs:236`
- Required-field precedent: `context/foundation/lessons.md:166-171`
- Guard-metric integrity (this review's F1+F2, generalized): `context/foundation/lessons.md:180-185`
- Provider schema-subset constraint: `context/foundation/lessons.md:187-192`
- Offline-vs-live gate: `context/foundation/lessons.md:159-164`
- Decision-as-deliverable precedent: `context/archive/2026-08-10-finder-tool-loop-evals/decision.md`
- Reproduction instrument: `packages/code-reviewer/scripts/finder-distribution.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename
> step titles. See `references/progress-format.md`.
>
> Phase 3 and 4 criteria are phrased to be completable under **any** outcome — PASS, FAIL, or
> INVALID-FIXTURE. Where a criterion depends on the branch taken, it asks that the branch be recorded
> and honoured, not that a particular result occurred.

### Phase 1: Instrument — fixtures and a run-binary fabrication metric

#### Automated

- [x] 1.1 Package lint passes: `cd packages/code-reviewer && npm run lint` — 4d15f8c
- [x] 1.2 Type checking passes: `cd packages/code-reviewer && npm run typecheck` — 4d15f8c
- [x] 1.3 Unit tests pass: `cd packages/code-reviewer && npm test` — 4d15f8c
- [x] 1.4 Fabrication metric is binary per run: `0` with a fabrication, `1` without — 4d15f8c
- [x] 1.5 Fabrication metric counts one finding once across several matched defences — 4d15f8c
- [x] 1.6 Fabrication metric returns `1` for a zero-finding review — 4d15f8c
- [x] 1.7 Fabrication metric ignores `evidence`, `summary`, and `file` when matching — 4d15f8c
- [x] 1.8 Suppression grader fails when the defect appears only in `evidence` — 4d15f8c
- [x] 1.9 Suppression grader fails when the matching finding is below critical/major — 4d15f8c
- [x] 1.10 Quote-fidelity metric: verbatim `1`, invented `0`, canonicalizes markers and whitespace — 4d15f8c
- [x] 1.11 Config test fails if a new grader lands on `defaultTest` or its var is missing — 4d15f8c
- [x] 1.12 `node evals/recall-selfcheck.mjs` passes with the new cases — 4d15f8c

#### Manual

- [x] 1.13 Both fixtures read correctly: defended has nothing critical, vulnerable is indisputable
- [ ] 1.14 `presentDefences` patterns match real reviewer wording and do not fire on approving mentions

### Phase 2: Pre-register a total decision table, then measure the baseline

#### Automated

- [ ] 2.1 Filtered eval command completes and produces a result export
- [ ] 2.2 Snapshot file exists under the change folder
- [ ] 2.3 Baseline record includes `fabrication_runs`, `usable_output`, and `guard_reported`

#### Manual

- [ ] 2.4 Decision table committed before the baseline run, verifiable from git history
- [ ] 2.5 Decision table is total: every combination maps to exactly one outcome
- [ ] 2.6 Baseline fabrications read as genuinely false claims, not metric mis-fires
- [ ] 2.7 Fixture-validity gate outcome recorded and the branch taken stated explicitly

### Phase 3: The intervention — a required evidence field

#### Automated

- [ ] 3.1 Package lint passes: `cd packages/code-reviewer && npm run lint`
- [ ] 3.2 Type checking passes: `cd packages/code-reviewer && npm run typecheck`
- [ ] 3.3 Unit tests pass: `cd packages/code-reviewer && npm test`
- [ ] 3.4 A finding without `evidence` is rejected by the schema
- [ ] 3.5 Emitted JSON Schema contains no `minimum`, `maximum`, or `anyOf`
- [ ] 3.6 `buildJudgePrompt` output omits `evidence` for a finding that carries it
- [ ] 3.7 `review.json` retains `evidence`
- [ ] 3.8 `evidence` is absent from the rendered comment
- [ ] 3.9 Dedup identity unchanged: findings differing only in `evidence` still collapse
- [ ] 3.10 A response missing `evidence` is not repaired into a partial result
- [ ] 3.11 Post-intervention eval run completes and its snapshot is committed

#### Manual

- [ ] 3.12 All three counts recorded and the outcome read off the table without renegotiation
- [ ] 3.13 Quote-fidelity number recorded and interpreted
- [ ] 3.14 Rerun policy honoured: at most one rerun, second INCONCLUSIVE recorded as FAIL

### Phase 4: Live observation and recorded decision

#### Automated

- [ ] 4.1 Full package gate passes: `cd packages/code-reviewer && npm run lint && npm run typecheck && npm test`
- [ ] 4.2 The branch's `ai-review` run completes and uploads its artifact
- [ ] 4.3 Instrument present on the branch regardless of outcome: both fixtures and all three graders

#### Manual

- [ ] 4.4 Live findings read and recorded, with fabrication assessed per finding
- [ ] 4.5 `decision.md` states the outcome against every pre-registered criterion, including failures
- [ ] 4.6 Exactly one disposition executed, matching the recorded outcome
