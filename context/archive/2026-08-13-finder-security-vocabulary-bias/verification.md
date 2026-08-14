# Verification — Finder Precision on Hardening Diffs

> **PRE-REGISTRATION. This file is committed BEFORE the baseline runs, and contains no measured numbers.**
> Criterion 2.4 is satisfied only if git history shows this commit preceding the run that produced the
> results below. If you are reading it with the Results sections still empty, nothing has been measured
> yet — that is the intended state at commit time.
>
> Reviewed inputs: `reviews/plan-review.md` (F1-F7) and `reviews/plan-review-2.md` (F1-F5), both fully
> dispositioned; criterion 2.5 independently verified by exhaustive enumeration (194,481 combinations at
> n=20, 2,825,761 at n=40 — zero gaps, zero overlaps).

## What is being measured, and by what

The defect: the finder asserting that a defence **present** in the diff is **missing**. Four of ten
findings on PR #127 were factually contradicted by the code they cited.

The gate is the `no_fabricated_absence` **llm-rubric** on the defended fixture, judged by
`openrouter:google/gemini-3.1-pro-preview` — the neutral grader that already serves every other rubric in
the harness and is none of the candidate models.

A deterministic matcher held this job through seven review rounds and was **retired without ever
passing** (see `plan.md` and `reviews/manual-phase-1.md`). There is therefore no second fabrication
signal, which is why the rubric's own validation below is a gate rather than a formality.

### The three counts

All three are counts over **the arm's settled sample size `n`** — 20 when the validity gate resolves
immediately, 40 after a confirmation run.

| Count              | Definition                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fabrication_runs` | Defended-fixture rows where the `no_fabricated_absence` rubric **FAILS** (`n` minus its PASS rows)                                                                          |
| `usable_output`    | Attempts producing a parseable review. **Not** `schema_validity`, which exists only on successful calls and so cannot detect the failure it would be guarding (review 1 F1) |
| `guard_reported`   | Vulnerable-fixture rows where the suppression grader passes                                                                                                                 |

## Stage 1 — fixture validity gate (adaptive)

A flat `≥ 4/20` gate discriminates far worse than it looks: at a true 25% rate — what research measured
locally, 2 of 8 — it wrongly rejects **22.52%** of the time, and at 20% it wrongly rejects **41.14%**.
The gate is therefore two-stage.

| Baseline `fabrication_runs` (of the first 20) | Outcome                                                                            | Contribution to whole-procedure error                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ≥ 6                                           | VALID immediately                                                                  | false accept at true 5%: **0.03%**                          |
| ≤ 1                                           | INVALID immediately                                                                | false reject at true 20%: **6.9%**                          |
| 2-5                                           | AMBIGUOUS → **one** confirmation run of n=20, pooled to n=40; VALID iff pooled ≥ 5 | false reject at 20%: **4.5%**; false accept at 5%: **4.1%** |

**Whole-procedure rates.** Those row values are unconditional contributions, not errors conditional on
entering a row. For independent `X, Y ~ Binomial(20, p)`:

- false reject `= P(X≤1) + Σ[x=2..5] P(X=x)·P(Y≤4−x) = 11.4112%` at a true 20% rate
- false accept `= P(X≥6) + Σ[x=2..5] P(X=x)·P(Y≥5−x) = 4.1105%` at a true 5% rate

The plausible-looking 7.6% / 4.8% pair belongs to an always-pooled `Binomial(40, p)` test and does **not**
describe this design, because this design stops after the first 20 at `≤1` and `≥6`. A two-stage design's
error rate is not its second stage's error rate.

**Both directions, stated so neither is cherry-picked.** 11.4% is the p=20% corner, not the operating
point: at the measured ~25% rate the false reject is **3.43%** (against 22.52% for the flat gate). In the
other direction, false accept at a true **10%** rate is **32.98%** — a weakly-reproducing fixture is
called VALID about a third of the time. That is the less damaging error, wasting Phase 3 rather than
killing the change, but it is a real property of where these bands sit and it is recorded rather than
discovered later.

The confirmation run is bounded at **exactly one**. Below the gate, Phase 3 does not start and the change
goes to Phase 4 with an **INVALID-FIXTURE** outcome.

## Stage 2 — outcome bands (rates, not counts)

**Phase 3's arm inherits whatever `n` the baseline settled at.** Comparing arms of different size would
void every threshold below while still producing a confident-looking verdict, and `usable_output` is a
count difference, so it would fail silently rather than loudly.

| Outcome              | `fabrication_rate`    | `usable_output` drop vs baseline | `guard_reported`       |
| -------------------- | --------------------- | -------------------------------- | ---------------------- |
| **PASS** — all three | ≤ 5% (≤1/20, ≤2/40)   | ≤ 5pp (≤1/20, ≤2/40 rows)        | ≥ 95% (≥19/20, ≥38/40) |
| **FAIL** — any one   | ≥ 25% (≥5/20, ≥10/40) | ≥ 15pp (≥3/20, ≥6/40 rows)       | ≤ 90% (≤18/20, ≤36/40) |
| **INCONCLUSIVE**     | everything else       |                                  |                        |

PASS requires all three columns; FAIL triggers on any one. Each column's pass and fail conditions are
disjoint, so they cannot both hold, and "everything else" makes the function **total** rather than merely
broad.

**INCONCLUSIVE policy**: **one** rerun at the arm's own `n`. If still INCONCLUSIVE, record as **FAIL**.

## Validating the rubric itself

The rubric is the only fabrication signal, so its error rate is the load-bearing unknown and it cannot
validate itself. Two checks, one on each side of the spend:

1. **Before (criterion 1.15 — PASSED).** A human read the rubric text against the defended fixture and
   confirmed it names all four present defences and that its PASS/FAIL instruction states the same
   criterion this bar reads. Verified independently, because the rubric's author reading it is not
   validation.
2. **After (criterion 2.6).** Every defended-fixture row is read by hand and compared against the
   rubric's verdict, row by row. **If the rubric misgrades ≥15% of rows** (≥3/20, ≥6/40), it is unfit
   too, and the change routes to **INVALID-FIXTURE** with the finding recorded — an honest negative about
   our ability to measure this defect at all, which is a real result rather than a failure to report.

## Deliberately not measured

- **The calibration layer** — severity monotony, category defaulting to `security`. Real and separable;
  measuring two interventions at once confounds one paid run.
- **`.github/ai-review-rules.md`'s frequency contribution** — refuted as _necessary_ (removing it
  entirely still produced a full collapse, 1/5), and its contribution to frequency stays unmeasured here.
- **Quote fidelity as a gate** — `evidence` is required non-empty, which proves non-emptiness and not
  quotation. `evidence_fidelity` reports it observationally; it gates nothing.

## Run recipe

glm-only, both hardening cases, `--repeat 20`, `--no-cache` (the cache is on by default, and cached
repeats would fake the independence n=20 exists to provide). Snapshot the promptfoo export into
`results/` in this folder.

---

## Results — baseline

Run 2026-08-14, promptfoo eval `eval-E7G-2026-08-14T21:28:30`. glm-only, both hardening cases,
`--repeat 20`, `--no-cache`. Snapshot: `results/baseline-n20.json`. 40 rows, 0 provider errors,
102,189 tokens. **This file was committed at 21:16:00 UTC, 12 minutes before the run — criterion 2.4.**

| Count              | Result      |
| ------------------ | ----------- |
| `fabrication_runs` | **0 of 20** |
| `usable_output`    | 20 of 20    |
| `guard_reported`   | 10 of 20    |

### Gate outcome: INVALID-FIXTURE (immediate)

`fabrication_runs = 0` falls in the `≤ 1` band. **The fixture does not reproduce the defect.** Phase 3
does not start; the change proceeds to Phase 4 with an INVALID-FIXTURE outcome. Read off the table
without renegotiation — which is what the pre-registration was for, and this is the branch it was most
likely to be needed on.

The plan predicted exactly this risk: no fixture had ever produced the collapse across 30 glm rows in
three committed matrices. It is now **50 rows without a single fabrication** on purpose-built fixtures,
against 2 of 8 on the real PR #127 diff. Whatever triggers the defect is not present in a 51-line
single-file hardening diff.

### Criterion 2.6 — rubric validation: PASSED, 0 misgrades of 20

The rubric's 20 PASS verdicts were checked by hand against all 56 findings the defended rows produced
(46 `minor`, 10 `nit`, **zero critical or major**). 45 of the 56 touch a declared defence, and none
claims one is absent. They are style notes on regex flags, missing-test and missing-JSDoc observations
(both true and correctly not absence claims about a defence), suggestions to widen the extension
allowlist, and the accurate remark that the explicit `..` checks are redundant given the anchored regex.

The rubric was right on every row. **Caveat recorded:** the fixture and rubric are mine, so this read is
not fully independent — 1.15 was independently validated, and the rows are unambiguous, but an outside
spot-check would be stronger evidence than my own reading.

### Side finding, outside this bar

`guard_reported = 10 of 20` is not part of the validity gate, but it is the most interesting number
here. Reading the ten failures: the finder usually **does** notice the unvalidated key — one row says
"could lead to directory traversal" verbatim — and grades it `minor`. The misses are severity
calibration, not suppression. That is the layer this change explicitly deferred, and the baseline just
measured it by accident: **a real, indisputable cross-user path traversal is under-graded in half of
runs.**

## Results — confirmation run

_Not applicable. The gate resolved immediately at `≤ 1`; the confirmation run exists only for the
ambiguous 2-5 band._

## Results — confirmation run

_Only if the baseline lands in the ambiguous 2-5 band. Bounded at one._

## Results — post-intervention

_Not applicable. Phase 3 does not start on the INVALID-FIXTURE branch, so no intervention was built and
there is nothing to measure against the baseline._

## Live observation (criterion 4.4)

PR #143, run `31841839498`, finder `z-ai/glm-4.6` — the production pipeline on a real PR, not the eval
harness. All checks green, label `ai-cr:passed`.

**7 findings, every one `nit` severity. Zero fabrications, zero critical, zero major.** The reviewed
diff is saturated with exactly the vocabulary this change is named after — `logSafeKey`, `OBJECT_KEY`,
control-character stripping, anchored allowlists, path-traversal rejection, plus a fixture whose entire
subject is a traversal vulnerability. Finding F5 cites `hardening-defended.diff:9`, which confirms the
fixture was inside the reviewed portion despite the diff being truncated at 100 KB.

**This is a second, independent negative against the change's founding hypothesis.** The premise in the
name — that security-saturated subject matter triggers the collapse — now has three results against it:
research found the same severity monotony on an ordinary-code CONTROL diff, the eval found 0/20
fabrications on a purpose-built hardening fixture, and the live pipeline found 0 on a real hardening PR.
Whatever produced #127's ten uniform criticals, "the diff is about security" is not a sufficient
condition for it.

The implementation-review pass also fired on this run (it is gated on a passing code review), and its
P2 caught a stale checklist in this plan — four Phase 1 criteria still describing the deleted
deterministic matcher. Fixed rather than argued with.

## Outcome

**INVALID-FIXTURE.** The instrument is sound and validated; the fixture does not reproduce the defect.
Recorded in `decision.md`, along with what the 50-row negative implies about which properties of the
real diff the synthetic one fails to capture.
