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
