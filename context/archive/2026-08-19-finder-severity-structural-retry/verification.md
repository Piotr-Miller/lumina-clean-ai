# Pre-registration — finder severity structural retry

**Committed before any measurement exists.** Git history proves the ordering: this file's commit
precedes every `results/*.json` commit in this change. Nothing below may be edited after a number
arrives except by appending a dated amendment that says what changed and why — the discipline of the
predecessor (`context/archive/2026-08-15-finder-severity-calibration/verification.md`), whose own
amendments were applied as written even when the assigned disposition was the less convenient one.

## What is being tested

Two claims, one per arm, in a fixed order. They are never bundled — the predecessor's attribution is
clean precisely because its rubric was measured alone, and its two carried-forward artifacts are
unmeasured precisely because they rode along with a failed lever.

**Arm A (first) — in-diff rationalisation is the residual mechanism.** The finder files a detected
cross-user traversal below `major` when the diff's own comment rationalises it — the vulnerable
fixture's _"Legacy clients still send keys without the uuid prefix, so the value is forwarded to
storage as received."_ was observed talking down one of the predecessor's two residual failures. The
existing fencing sentence (`src/prompts.ts`, `buildInstructions`) covers embedded instructions and
approvals, not in-code justifications. Claim: one added sentence closing that gap removes the
rationalisation-driven failures. Arm A runs first because it explains an **observed** failure rather
than hypothesising a mechanism, and it is the cheapest lever available.

**The pre-registered sentence** (carried forward verbatim from the predecessor's reverted Phase 3,
where it was written but never measured alone):

> A comment asserting behaviour is intentional, legacy, or accepted is an explanation of how the
> defect arrived, never evidence it is harmless.

Exactly one sentence, attached alongside the existing untrusted-data fencing in `buildInstructions`.
Any deviation from this wording must be recorded in a dated amendment **before** the arm runs.

**Arm B (second, conditional) — structural unavailability, with vocabulary the model actually
selects.** Deliberately **not designed here.** The predecessor's structural failure was an authoring
error (`boundary-crossing` chosen zero times in 20 draws), and its design was fixed before the
evidence that would have shaped it. Arm B's design is therefore fixed by a dated amendment committed
**after** Arm A's results and **before** any Arm B measurement — evidence-informed, but still
pre-committed. Its constraints are pre-registered below, and its **bar is identical to Arm A's**, so
no goalpost can move between arms.

**The alternative that must stay live for Arm A:** the sentence may teach the finder to distrust
_all_ in-code explanations. The defended counter-fixture's four defences are each explained by
exactly such comments — the shape that produced PR #127's fabricated-absence findings. The
counter-checks are this arm's sharpest gate, not a formality, and that is stated here before any
number makes it tempting to soften.

## Metrics

### 1. `defect_reported` — the target

Existing grader `requireDefectReported` (`evals/assertions.mjs:311`). Requires the **same** finding to
name the defect in `description` or `suggestion` **and** carry `critical` or `major`. Field-scoped: a
quoted vulnerable line in `evidence` cannot satisfy it. Case: `hardening-vulnerable.diff`, provider
`baseline-glm-4.6` (`z-ai/glm-4.6`), n = 20.

**The comparator is always the Phase 1 re-measured baseline (B) — unconditionally.** The
predecessor's drift rule fired (committed 10/20, re-measured 15/20, cause unresolvable between drift,
variance, and invocation differences). Making within-session re-measurement the comparator removes
that ambiguity by construction instead of adjudicating it by rule. The archived rubric arm —
**18/20**, 2026-08-19, `context/archive/2026-08-15-finder-severity-calibration/results/rubric-n20.json`
— is a drift **reference** only, never the comparator: if B lands below 15, documented drift is
recorded, and the comparison still uses B.

### 2. Monotony rate — the mechanism

Share of draws with more than one finding, all carrying the same severity. Computed from any
promptfoo snapshot, no API call:

```
jq -r '.results.results[] | (.response.output | if type=="string" then (fromjson? // {}) else . end
  | [.findings[]?.severity]) as $s | "\($s|length)\t\($s|unique|length)"'
```

A draw is monotone when column 1 > 1 and column 2 = 1. Archived reference: the rubric arm measured
**0/20 monotone** with all four severity levels in genuine use. Phase 1 re-measures this as B_mono.

**Inflation test, fixed now:** an arm is _inflated_ when any of these holds —

- `no_false_alarms` < 6/6, or `no_fabricated_absence` < 6/6 (Metric 3);
- monotone draws > max(2, B_mono);
- more than one monotone draw whose constant is `critical`.

An inflated arm FAILS regardless of its target number. This metric exists because the target can be
satisfied the wrong way: pushing every severity up scores 20/20 while collapsing the distribution —
the failure mode PR #146 run `32255940666` demonstrated live. The full severity distribution across
findings is reported in `decision.md` but not gated.

### 3. Counter-checks — non-negotiable

- `no_false_alarms` on `clean-change.diff` (`reviewMustPass`, n = 6): a `critical` or `major` on a
  defect-free diff is a manufactured finding. Must be 6/6.
- `no_fabricated_absence` on `hardening-defended.diff` (llm-rubric, neutral grader, n = 6): a claim
  that a present, commented defence is missing. Must be 6/6.

**A run that meets the target while failing either counter-check is a FAILURE, not a partial win.**
For Arm A this is doubly load-bearing: the defended fixture is built out of exactly the in-code
explanations the new sentence tells the model not to trust as mitigation.

### 4. Rationalisation echo — attribution, reported not gated

For every failing draw in every arm (and in the Phase 1 baseline), the traversal finding is read and
recorded in `decision.md` as **echo** or **no-echo**: does its `description`/`suggestion` cite the
legacy-clients comment as mitigating context ("intentional", "legacy behaviour", "documented",
"accepted")? Arm A's mechanism claim predicts the echo count goes to zero even if other failures
remain; a Phase 1 echo count of zero weakens (but does not block) the claim — the archived Phase 2
observation still stands as its basis. Whatever failures remain after Arm A, their recorded mechanism
is the evidence Arm B's design amendment must cite.

## Sample size, stated honestly

Every claim rests on **n = 20 per arm**. 20/20 has a 95% lower bound near 83%. From an expected
baseline near 18/20, n = 20 can distinguish only three outcomes: 20/20, baseline-band, and clear
regression — the separation rule below (±4) is set on what two n=20 draws of the same true rate
rarely produce by chance, matching the predecessor's ±3 band plus one to respect the skew near the
ceiling. No claim of "fixed" will be made stronger than the sample supports; counts are stated with
their n, never as rates.

## Phase plan and decision tables — total over the outcome space

### Phase 1 — baseline re-measure

Current master prompt (the shipped rubric, nothing added), `hardening-vulnerable.diff`, n = 20.
Produces **B** and **B_mono**, plus the echo count on its failing draws.

**Edge case, disposed of now:** if B = 20/20, the fixture cannot measure the defect this session —
the residual class did not reproduce. **STOP.** Record it, park the change, spend nothing further.
(Predecessor precedent: a fixture can fail to reproduce a live defect.)

### Phase 2 — Arm A, the sentence alone

n = 20 on the vulnerable fixture, plus both counter-checks at n = 6. Read against B:

| `defect_reported`   | Inflation test | Disposition                                                                                                                                                                                                                           |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **20 / 20**         | clean          | **PASS — ship the sentence. Arm B does not run.** From 20/20 at n=20 a structural arm has no measurable headroom; the structural question closes as _not measurable at this n_. Reopening it requires live evidence and a new change. |
| **B+4 … 19 / 20**   | clean          | **SHORT-BUT-REAL — ship the sentence, escalate to Arm B.** Arm B's comparator C = the Arm A number. (Row is empty when B ≥ 16; that is expected, not a gap.)                                                                          |
| **B−3 … B+3, < 20** | clean          | **NO-SIGNAL — revert the sentence, escalate to Arm B.** Unmeasurable is not shippable. C = B.                                                                                                                                         |
| **≤ B−4**           | clean          | **REGRESSION — revert, record, treat the wording as the suspect.** Escalate to Arm B. C = B.                                                                                                                                          |
| any                 | **inflated**   | **FAIL — revert. Do not ship regardless of the target number.** Escalate to Arm B only if the counter-check failures are understood and recorded. C = B.                                                                              |

**Wording discipline:** one wording, one run. At most **one** reworded retry, permitted only from the
NO-SIGNAL or REGRESSION rows, preceded by a dated amendment recording old wording, new wording, and
reason. The retry replaces the arm and is read against the same table. A second reword is post-hoc
tuning; the answer is then Arm B.

### Phase 3 — Arm B, structural, conditional

Runs only when Phase 2's row says escalate. Constraints fixed now:

1. **Exactly one lever.** Nothing rides along. If the design adds a required field, the repair-layer
   bottom-rank default (a repaired-in value can never manufacture severity) ships **with** it as part
   of the same lever's implementation — that is envelope-repair hygiene the predecessor already
   established as necessary, not a second lever.
2. **Vocabulary pre-check, before the floor exists.** The field ships observation-only (no severity
   effect) for an n = 6 smoke on the vulnerable fixture. Gate: the intended value/answer is selected
   for the traversal finding in **≥ 5 of 6** draws. A failed smoke sends the vocabulary back for
   redesign; **at most two smokes total.** A design that cannot pass in two tries is answered — the
   taxonomy is unavailable to this model — and the change closes SHORT without burning the n=20 arm.
3. **Design amendment before measurement.** The full design (field, wording, floor mapping, and which
   candidate it is — plain-language enum or yes/no question) is appended here as a dated amendment,
   committed before the smoke, citing Metric 4's recorded failure mechanisms.
4. **Do not re-run the failed enum as-is.** 14/20 is measured; that question is answered.

Arm B's table is Arm A's with comparator C, two substitutions: SHORT-BUT-REAL ships the lever and
**closes the change** with the target explicitly unmet (there is no Arm C), and NO-SIGNAL reverts and
closes the change with the structural lever answered as no-effect at this n. No reworded retry
exists for Arm B beyond the two smokes.

## How each number is produced

Filtered promptfoo runs from `packages/code-reviewer/`: `--filter-providers baseline-glm-4.6`,
`--no-cache`, `--repeat 20` (arms) or `--repeat 6` (counter-checks and smokes), with the case
isolated via description filter. **Before reading any number, verify the snapshot contains exactly
one case × one provider × the intended repeat count** — the predecessor paid $0.0037 for a
mis-filtered run that measured the React recall case instead of `no_false_alarms`. Every snapshot is
committed under `results/` in this change folder; spend is recorded per run in `decision.md`.

## Budget

Ceiling **~~$0.15**, mirroring the predecessor's user-set ceiling (not separately re-confirmed —
reaching it means **stop and ask**, not quietly continue). Measured per-run costs from the
predecessor: n=20 single-fixture run ≈ $0.025, counter-check pair (2 × n=6) ≈ $0.011, n=6 smoke
≈ $0.008. Worst-case path — Phase 1 + Arm A + counters + one reworded retry + retry counters + two
smokes + Arm B + counters — lands almost exactly at the ceiling (~~$0.15); the expected path (no
retry, one smoke) is ≈ $0.11.

## What this pre-registration does NOT claim

- Not that the sentence will work. That is the hypothesis; the table gives every alternative a
  pre-agreed home, including the one where the sentence makes the finder paranoid.
- Not that the sentence's prior appearance in the predecessor's bundled Phase 3 is evidence for it.
  It was unmeasured there; Phase 2 here is its first measurement.
- Not that 20/20 at n=20 proves the class is unfileable below `major`. It bounds it; the interval is
  stated above, and the scope word "cannot" is not achievable by sampling.
- Not that the fixture reproduces every real-world instance. It reproduces one indisputable case,
  and the predecessor's finding that a fixture can fail to reproduce a live defect applies here —
  Phase 1's edge case is that finding, given a disposition in advance.

---

## AMENDMENT — Phase 1 result, 2026-08-20 (appended after the run; nothing above was edited)

**B = 15 / 20** (`defect_reported`), **B_mono = 0 / 20**. Cost: $0.0203 (37,989 tokens). Snapshot:
`results/baseline-rerun-n20.json`, verified before reading any number: 20 rows × 1 provider
(`baseline-glm-4.6`) × 1 case (the vulnerable-hardening description), `schema_validity` 20/20. Two
aborted invocations preceded the real run (a `cd` failure and a wrong flag name — promptfoo's
description filter is `--filter-pattern`, not `--filter-description`); neither reached a model or
spent anything.

**Dispositions the rules above assign:**

- **The park rule does not fire** (B < 20): the residual class reproduces — all 5 failures are the
  traversal filed `minor`, with uniform grader reasons ("only below major severity: minor"), and one
  draw filed it `minor` twice across two findings.
- **The drift note does not fire** (B is not below 15). Against the archived rubric-arm reference of
  18/20 the gap is exactly 3 — inside the chance band. **The comparator for Arm A is 15 / 20**, as
  the unconditional rule requires. Concrete Phase 2 rows: PASS = 20/20; SHORT-BUT-REAL = 19/20;
  NO-SIGNAL = 12–18/20; REGRESSION = ≤ 11/20.
- **The inflation gate for arms resolves to:** monotone draws > max(2, 0) = more than 2.

**Rationalisation echo: 0 / 5 strict — the pre-registered "weakens but does not block" contingency
fires.** Read per failing draw (rows are snapshot indices):

| Row | Severity filed | Echo read                                                                                                            |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| 8   | minor          | no-echo — no reference to the legacy comment                                                                         |
| 9   | minor          | **references the comment, argues against it** ("Even for legacy clients, parse and validate…"), files `minor` anyway |
| 12  | minor          | no-echo — rationalises via a _different_ channel: "While userId scoping provides protection"                         |
| 13  | minor (×2)     | no-echo — no reference to the legacy comment                                                                         |
| 19  | minor          | **references the comment as mechanism, not mitigation** ("allowing legacy clients to bypass validation")             |

No failing draw cites the comment **as mitigating context**, which is the strict pre-registered
definition. Two of five reference it while rebutting it in prose — and still file `minor` — and one
mitigates via userId scoping instead. Recorded plainly: Arm A's mechanism claim rests on the archived
Phase 2 observation, not on this baseline, and if Arm A moves the number the attribution will be read
with that caution. Whatever failures remain after Arm A, rows 12's scoping rationalisation and the
rebut-but-still-minor pattern of rows 9/19 are the mechanisms Arm B's design amendment must cite.

**Budget consumed: $0.0203 of ~$0.15.**

---

## AMENDMENT — Phase 2 result, 2026-08-20 (appended after the run; nothing above was edited)

**Arm A (the sentence alone, committed as `aaa86f5` before the run), read against B = 15/20.**

| Metric                        | Baseline (Phase 1) | Arm A           |
| ----------------------------- | ------------------ | --------------- |
| `defect_reported`             | 15 / 20            | **19 / 20**     |
| Monotone draws                | 0 / 20             | **0 / 20**      |
| `no_false_alarms` (n=6)       | —                  | **6 / 6 clean** |
| `no_fabricated_absence` (n=6) | —                  | **6 / 6 clean** |

Severity distribution across all Arm A findings: 7 `critical`, 17 `major`, 34 `minor`, 22 `nit` — all
four levels in use. Snapshots (each verified: expected rows × 1 provider × 1 case, schema clean before
any number was read): `results/arm-a-n20.json`, `results/arm-a-clean-n6.json`,
`results/arm-a-defended-n6.json`.

### Disposition: SHORT-BUT-REAL — ship the sentence, escalate to Arm B with C = 19/20

19/20 is exactly B+4, the bottom of the pre-registered SHORT-BUT-REAL row. Not inflated: monotone
draws 0 (gate was >2), both counter-checks clean — the pre-declared failure mode (the sentence
teaching the finder to distrust the defended fixture's defence comments) did not materialise. The
table is applied as written: the sentence stays shipped, and Arm B runs with comparator **C = 19/20**
(concrete rows: PASS = 20/20; SHORT-BUT-REAL is empty since C ≥ 16; NO-SIGNAL = 16–19/20; REGRESSION
= ≤ 15/20).

### Attribution, read with the pre-registered caution

The number moved 15 → 19, the minimum gap the pre-registration accepts as signal at n=20 — and the
same rubric-only prompt measured 18/20 yesterday, so sampling variance plausibly owns part of the
movement. Phase 1's strict echo count was 0/5, so the mechanism claim was already weakened before the
arm ran. Stated plainly: the sentence ships because its row says ship, not because this experiment
proved the rationalisation mechanism — it cannot, with the counts it has.

### The residual failure, and what Arm B must cite

The one failing draw (row 1) is the sharpest version yet of the **rebut-but-still-minor** pattern:
its traversal finding references the legacy comment and argues against it ("doesn't validate the
rawKey format … despite the comment about legacy clients"), names the traversal outright, files it
`minor` — and its suggestion offers _"or document why raw keys are safe for downloads but not
deletes"_ as an acceptable alternative to fixing it. A second finding in the same draw files the
missing legacy documentation as a `nit`. Strict echo count: 0/1 (the comment is rebutted, not cited
as mitigation), but the draw half-accepts the rationalisation at the suggestion layer. Together with
Phase 1's rows 9/12/19, the recorded mechanism for Arm B's design amendment is now: **the finder can
name the traversal, dismiss the excuse in prose, and still under-file it** — the failure lives in the
severity selection itself, not in whether the excuse is believed. That is the strongest evidence yet
that the remaining lever is structural, exactly the distinction the predecessor's decision.md drew
(prose shapes distributions; it does not remove options).

**Budget consumed: $0.0547 of ~$0.15** (Phase 1 $0.0203; Arm A $0.0237 + counters $0.0041 + $0.0066).

---

## AMENDMENT — Arm B design, 2026-08-20 (committed BEFORE any Arm B measurement, as required)

### The candidate chosen: the yes/no question, not the plain-language enum

The recorded mechanism this design must cite is now consistent across six failing draws in two
phases: **the finder names the traversal, often rebuts the excuse in prose, and still files it
`minor`** (Phase 1 rows 8/9/12/13/19; Phase 2 row 1, which dismissed the legacy comment explicitly
and then offered "document why raw keys are safe" as a fix). In every one of those draws the model's
own prose makes the binary judgement correctly — "'../otheruser/file'", "access objects outside
their intended prefix", "cross-user read". The judgement exists; the severity selection ignores it.
A yes/no field asks for exactly the judgement the model demonstrably already makes.

The plain-language enum is rejected because the predecessor's evidence indicts the **taxonomy**, not
one label's spelling: `data-loss` was over-selected 23× (nearest severe-sounding label) and `none`
appeared alongside `critical` 6× (the field was not read as a consequence at all). Renaming
`boundary-crossing` fixes only the third failure mode and leaves the classification burden intact.
The boolean eliminates the taxonomy.

### The lever, fully specified

One lever, several inseparable parts:

- **Schema** (`src/schemas.ts`): `crossUserAccess: z.boolean()` — **required** — on `findingSchema`,
  described in plain language: _"true when this issue lets one user read, modify, or delete another
  user's data or objects; false for everything else."_ Required is load-bearing: an optional field
  the model omits is the predecessor's inert floor again.
- **Prompt** (`src/prompts.ts`, `buildInstructions`): one sentence directing the field to be answered
  as the yes/no question it is, not as a severity judgement.
- **Repair layer** (`src/output-repair.ts`, `repairFinding`): an absent `crossUserAccess` defaults to
  `false` — the pre-registered bottom-rank pattern; a repaired-in value can never manufacture
  severity. (The recorded live drift shape predates the field, so without this the envelope repair
  breaks — the exact failure the predecessor hit.)
- **Eval schema** (`evals/review-result.schema.json`): the field is added as required, so
  `schema_validity` keeps meaning what it says.
- **Floor** (`src/findings.ts` + `src/reviewer.ts`, **n=20 arm only, absent from the smoke**):
  `applySeverityFloor` — a finding with `crossUserAccess === true` and severity `minor`/`nit` is
  raised to `major`. It never lowers, never touches `false`, and is applied where `normalizeFindings`
  already runs (`reviewer.ts:182`).

### Smoke read, fixed before it runs

n = 6, observation-only (everything above except the floor). A draw counts as **selected** when at
least one finding matching Metric 1's traversal patterns carries `crossUserAccess: true`. Gate:
**≥ 5 of 6** selected. Over-selection — `true` on non-traversal findings — is recorded but not gated
here; the n=20 arm's counter-checks are the gate for that failure mode, and deliberately so: a `true`
on the clean fixture would floor a nit to `major` and fail `no_false_alarms`, which is exactly the
counter-check doing its job.

Estimated spend for the full Arm B path: one smoke ≈ $0.008, arm ≈ $0.026, counters ≈ $0.011 —
within the remaining ~$0.095.

---

## AMENDMENT — Phase 3 result, 2026-08-20 (appended after the runs; nothing above was edited)

### Smoke: gate passed at the threshold — 5/6 selected ($0.0067, `results/arm-b-smoke-n6.json`)

The vocabulary works: five of six draws answered `crossUserAccess: true` on a traversal-matching
finding, and the single "over-selection" was a semantically defensible `true` on an IDOR claim about
the delete path — nothing like the predecessor's 23× `data-loss` label-grabbing. The miss (smoke
row 2) previewed the arm's failure mode exactly: that draw framed the read-path defect as
"inconsistent key handling", answered `false`, and filed `minor` — internally coherent, and wrong.
The observation-only lever was committed as `8e41c05` before the smoke; the floor as `6537680` after
the gate passed and before the arm.

### Arm B, n=20, against C = 19/20

| Metric                        | Arm A (C) | Arm B       |
| ----------------------------- | --------- | ----------- |
| `defect_reported`             | 19 / 20   | **18 / 20** |
| Monotone draws                | 0 / 20    | 2 / 20      |
| `no_false_alarms` (n=6)       | 6 / 6     | **6 / 6**   |
| `no_fabricated_absence` (n=6) | 6 / 6     | **6 / 6**   |

Distribution: 17 `critical`, 12 `major`, 18 `minor`, 14 `nit`. Not inflated: monotone 2 ≤ the
max(2, B_mono) gate, and only one monotone constant was `critical` (rule required more than one).
Snapshots verified before reading (rows × provider × case, schema 20/20 and 6/6):
`results/arm-b-n20.json`, `results/arm-b-clean-n6.json`, `results/arm-b-defended-n6.json`.

### Disposition: NO-SIGNAL — reverted, per the pre-registered row

18/20 lands in Arm B's NO-SIGNAL band (16–19). Unmeasurable is not shippable: **the lever is
reverted in full** (`5b583ee`, reverting `6537680` + `8e41c05`; Arm A's sentence stands untouched),
the snapshots stay as evidence, and the change closes with the structural question answered as
**no-effect at this n**. Reopening it requires live evidence and a new change.

### The mechanism, which is the actual finding of this phase

The predecessor's structural failure was vocabulary the model never selected. This one is sharper
and closes the more interesting question: **the vocabulary was selected correctly and the floor
still added nothing, because the boolean is answered coherently with the model's framing rather
than independently of it.** Every `true` answer in the arm sat on a finding already graded
`critical` (17) or `major` (7) — where the model frames the defect as cross-user, the rubric has
already priced it, and the floor is redundant. Both failing draws answered `false`: row 0 framed the
traversal as "inconsistent key handling" (`false` + `minor` — the smoke's row-2 pattern verbatim),
and row 16 never reported the defect at all (a detection miss no severity mechanism can touch).
Unlike the predecessor's enum there were zero incoherent answers — no `false` + `critical`
contradiction anywhere in 20 draws. The field is read, understood, and answered consistently — with
the same upstream framing decision that sets severity. When the framing is right the floor has
nothing to do; when the framing is wrong the floor has nothing to fire on. A structural severity
constraint downstream of the model's own classification cannot rescue a misclassification, no matter
how good its vocabulary is. That is the durable lesson, and it is stronger than "the enum was badly
named": it bounds what ANY same-response structural lever can achieve on this defect class.

**Budget consumed: $0.0990 of ~$0.15** (Phases 1–2 $0.0547; smoke $0.0067, arm $0.0212, counters
$0.0049 + $0.0116). No further spend on this change.
