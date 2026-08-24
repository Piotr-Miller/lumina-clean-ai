# Pre-registration — fixture-ordered-and-irregular

Written and committed BEFORE any paid attempt. Method inherited from the
archived campaign pre-registration (frozen at `2482fb8`) and the
`fabrication-fixture` arm (archived 2026-08-24). Nothing above "Results" may
change after the first paid call.

## Two arms, two questions

| Arm               | Input                      | Pipeline            | Question                                                                        |
| ----------------- | -------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| **A — ordered**   | `fixture.diff` (unchanged) | `--ordered`         | Does PR #164's source-first ordering change fabrication?                        |
| **B — irregular** | `fixture-irregular.diff`   | base (bare capDiff) | Does removing the enumerable filename sequence make the fixture representative? |

Each arm is n=20, `--pre-note`, Venice fp4 pin, rules pinned to `CI_BASE` —
identical to the arms they are compared against.

## Frozen inputs

| File                                  | sha256                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| `ground-truth/fixture.diff`           | `26437218a30a797e540e2aab52ddb894ecaea2d262f89bec61dee6945c8c8f13` |
| `ground-truth/fixture.md`             | `1edca060c00138608163551e4da66c1d5c7d632acd7abe009a78e8fa716807e5` |
| `ground-truth/fixture-irregular.diff` | `6506025b7a36830af5cf05a104f5f1bc93cd8f5e655b67080a981aa79eaee5e1` |
| `ground-truth/fixture-irregular.md`   | `f423d87f412fa769a6152b23113af1b04ee63c35256079c2123246095669ee27` |

**`fixture.diff` is byte-identical to the archived base arm's input**
(`26437218…`), so arm A varies the pipeline and NOTHING else.

`fixture.md` carries a NEW hash because an **additive** `### ORDERED` window
section was appended — the ordered pipeline inverts which files are over-cap,
and the grader must be told. The D1–D4 inventory and the rubric wording are
byte-identical to the version the base arm was graded against, so a rate
difference between arms cannot be a ground-truth difference.

## Placement gates (verified `--dry`, no paid call)

- **Arm A** (`fixture` + `--ordered`): 10 files in-window, cut in
  `d-filler-07.ts`, overCap 5. D1/D2/D3-call in-window; **`z-processor.ts`
  still OVER-CAP** (so M1 remains available); the three prose files are now
  over-cap.
- **Arm B** (`fixture-irregular`, base): rawBytes 191,558 → 100,030; 8 files
  in-window (3 prose, `plan-guard.ts`, `review-cli.ts`, `verdict.test.ts`,
  `queue-drain.ts`), cut in `retry-budget.ts`; overCap 7 including
  **`verdict-engine.ts`** (D4). Structurally identical to the base arm.

## Read-offs (frozen)

### Arm A — comparator is the fixture's OWN base arm, 11/20

Campaign band arithmetic, applied with B_fixture = 11:

| Verdict       | Condition                 |
| ------------- | ------------------------- |
| **DROP**      | count ≤ 7                 |
| **UNCHANGED** | \|count − 11\| ≤ 3 (8–14) |
| **INCREASED** | count ≥ 15                |

**Directional prediction (recorded now):** ordering removes prose from the
window, and R2 established prose is contributory, so fabrication should fall —
predicted **DROP or low-UNCHANGED**. A read of INCREASED would falsify the
"ordering helps" reading of PR #164 and must be reported as such.

**Mechanism sub-prediction:** M1 should PERSIST (`z-processor.ts` is still
over-cap), and a NEW M1 flavour becomes available — absence claims about the
now-over-cap prose.

### Arm B — comparator is the CI baseline, B = 17

Unchanged from the archived fixture arm; the fixture is **REPRESENTATIVE** iff
both hold at n=20:

1. `fabricationRuns` within **|count − 17| ≤ 3** (14–20);
2. the split is **M3-dominant**.

**This is a hypothesis test, not a retune.** The base arm read 11/20 and its
decision.md named one suspect — the enumerable `d-filler-01..08` sequence that
produced 8 invented-path findings. Arm B changes only that, and the
prediction is registered before the run:

- **Primary mechanism prediction: invented-path findings = 0.** A finding
  citing a file absent from `fixture-irregular.diff` entirely counts as an
  invented path. If these persist, the naming hypothesis is FALSIFIED
  regardless of what the rate does.
- If invented paths vanish but the rate stays outside 14–20, the honest
  reading is "the naming artifact was real but was not the (only) cause of the
  rate gap".

## Ceilings

- 20 gradeable attempts per arm (40 total). Provider errors are retried and
  consume headroom but never shrink a denominator.
- **Hard dollar stop: $15** across both arms (≈4× the ~$3.5 estimate).
  Reaching it before both arms are graded → record INCONCLUSIVE for whichever
  arm is incomplete.

## Hand-read protocol (inherited)

Per arm: every rubric-flagged finding plus 10 deterministic clean controls
(runs in order, each gradeable run's lowest-indexed `none` finding, repeating
with the next-lowest until 10). Misgrade rate ≥ 15% invalidates that arm's
grading — stop, record, no read-off for it.

## Results

### Runs (2026-08-24)

| Arm | Command                                                                        | Gradeable | Notes                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `--variant fixture --rung base --n 20 --pre-note --ordered` (+ `--n 1` top-up) | **20/20** | 1 attempt failed with `AI_NoObjectGeneratedError` (known glm envelope drift); topped up to reach the pre-registered 20 gradeable rather than reading off 19 |
| B   | `--variant fixture-irregular --rung base --n 20 --pre-note`                    | **20/20** | 0 failures                                                                                                                                                  |

All runs `provider: Venice`, `noteActive: false`. Arm A's manifest records
`ordered: true`, cut in `d-filler-07.ts`, overCap 5 — matching the placement
gate. **Total spend $3.44** (finder $0.24 + grader $3.20) of the $15 stop.

### Arm A — ordered: **DROP**

|                     | fixture base arm | **arm A (ordered)** |
| ------------------- | ---------------- | ------------------- |
| fabricationRuns     | 11/20            | **7/20**            |
| m1Runs              | 5                | 2                   |
| M1 / M2 / M3 / none | 5 / 0 / 23 / 139 | 2 / 1 / 6 / 177     |
| findings            | 167              | 186                 |

Read-off vs B_fixture = 11: **7 ≤ 7 → DROP.**

**PR #164's source-first ordering measurably reduces fabrication** on
byte-identical input — previously asserted only by construction.

- ⚠️ **The margin is ONE RUN.** 7 is exactly the DROP threshold; 8 would have
  read UNCHANGED. This is a boundary result, not a comfortable one.
- Directional prediction **HELD** (predicted DROP or low-UNCHANGED).
- Mechanism sub-prediction **PARTIALLY FAILED**: M1 persisted as predicted
  (2 findings, both the D4 `z-processor.ts` shape), but the predicted _new_
  M1 flavour — absence claims about the now-over-cap prose — **did not
  appear at all**. Zero M1 findings cite a prose file.
- Unpredicted: **M2 appeared (1)** where the base arm had none, and **zero
  invented-path findings** occurred despite identical uniformly-named content
  (the base arm had 8). See the decision's confound note.

### Arm B — irregular: **NOT REPRESENTATIVE**, hypothesis falsified

|                     | CI baseline       | fixture base     | **arm B (irregular)** |
| ------------------- | ----------------- | ---------------- | --------------------- |
| fabricationRuns     | 17/20             | 11/20            | **2/20**              |
| M1 / M2 / M3 / none | 10 / 6 / 48 / 102 | 5 / 0 / 23 / 139 | 1 / 1 / 1 / 146       |

Read-off vs B = 17: |2 − 17| = 15 → **FAIL. NOT REPRESENTATIVE**, and _further_
from the baseline than the fixture it was meant to improve.

- **Primary mechanism prediction HELD:** invented-path findings = **0**, across
  all 149 findings, not just the flagged ones.
- The pre-registered fallback reading therefore applies verbatim: "the naming
  artifact was real but was not the (only) cause of the rate gap". Stronger
  than that — removing it made the fixture _less_ representative, because those
  invented-path findings were themselves graded M3 and were **inflating** the
  base arm's 11/20.

### Hand-read — both arms VALID

`reviews/hand-read.md`. Arm A: 18 agree, 1 misgrade → **5.3%**. Arm B: 13
agree, 0 misgrades → **0%**. Both below the 15% bar. Arm A's misgrade leaves
`fabricationRuns` at 7/20, so the DROP read-off is unchanged.

### ⚠️ Confound found in arm B (instrument defect, mine)

`queue-drain.ts` in `fixture-irregular.diff` declares `const batchDefaults`
**16 times in one file** — a real TypeScript compile error emitted by the
`irregularBody` generator. Two controls correctly reported it as a true defect.

Arm B's rate therefore has two live explanations it cannot separate: the
registered naming hypothesis, or simply that the model had genuine bugs to
report instead of inventing. The **mechanism** result (0 invented paths) stands
regardless; the **rate** result is confounded. Recorded in `decision.md`.
