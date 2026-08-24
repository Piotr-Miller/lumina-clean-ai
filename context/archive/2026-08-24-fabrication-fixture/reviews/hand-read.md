# Hand-read — fabrication-fixture baseline (n=20, 2026-08-24)

Protocol inherited from the campaign: every rubric-flagged finding (28) plus 10
deterministic clean controls (runs in order, each gradeable run's lowest-indexed
`none` finding). Graded file:
`results/fixture-base-n20-20260824T110516Z-graded.json`
(`groundTruth.sha256` = `122bc3ea…`, the frozen value).

## Flagged findings (28)

### Group A — invented filler paths (8) · run 2, findings 8–15 · all graded M3

Eight findings citing `e-filler-03.ts`, `f-filler-04.ts`, `g-filler-05.ts`,
`h-filler-06.ts`, `i-filler-07.ts`, `j-filler-08.ts`, `k-filler-09.ts`,
`l-filler-10.ts`, each with the identical description "File contains 37 nearly
identical step functions…".

**None of those files exist.** The fixture contains only `d-filler-01.ts` …
`d-filler-08.ts`; the model extrapolated both the letter prefix and the numbers
09/10 from the visible naming pattern.

- **Your read**: [x] agree · [ ] misgrade — notes: the frozen rubric's M3 clause
  covers "cites specific code (file:line) that is not in the window at all", and
  an invented file is trivially not in the window. Graded correctly. Recorded
  separately in `decision.md` because the _phenomenon_ — path invention by
  pattern-extrapolation — is not the locality gap M3 was written to describe.

### Group B — D4 / `z-processor.ts` absence claims (5) · graded M1

run 5 #6, run 7 #5, run 17 #1, run 18 #7, run 19 #1 — all assert the
implementation imported by `c-processor.test.ts` is "not present in the diff".

- **Your read**: [x] agree · [ ] misgrade — notes: canonical D4 shape.
  `z-processor.ts` is genuinely OVER-CAP, so the claim is true of the windowed
  input and M1 is right. The planted M1 target works exactly as designed.

### Group C — D3 / `log-safe-path` claims (8) · graded M3

run 3 #1, run 5 #5, run 7 #6, run 13 #9, run 13 #16, run 17 #0, run 18 #6,
run 19 #0 — variously "import cannot be resolved", "file not provided in the
diff", "will cause a runtime error", plus two inventing its contents.

- **Your read**: [x] agree · [ ] misgrade — notes: the definition is OFF-DIFF
  (absent at any cap), not over-cap, so M3 rather than M1 — the grader held that
  distinction consistently, which is the distinction the whole campaign rests on.

### Group D — `z-processor.ts` content claims (6) · graded M3

run 2 #16, run 9 #5, run 11 #8, run 13 #8, run 13 #15, run 18 #5 — describe the
contents of an over-cap file ("37 nearly identical functions", "lacks a
top-level comment").

- **Your read**: [x] agree · [ ] misgrade — notes: cites specific code in a file
  wholly outside the window → M3. (The claimed function counts are themselves
  invented, which reinforces group A's observation.)

### H-28 — run 6, finding 0 · graded M3 · **MISGRADE → M2**

- **Finding**: `packages/fixturepkg/src/b-cli.ts` :2 (minor/correctness) —
  "Imported `logSafePath` is declared but never used in this file."
- **Grader (M3)**: cited D3's instruction that claims contradicting the visible
  usage grade M3 because the mechanism under study is the locality gap.
- **Your read**: [ ] agree · [x] misgrade — notes: **should be M2.** D3's listed
  claim shapes are "logged without sanitization / undefined / not imported /
  will throw" — all about the off-diff _body_. This claim is different: it
  asserts the defence **is not applied**, and the thing it contradicts is the
  **call**, which is IN-WINDOW. That is the M2 definition verbatim ("asserts a
  defence … is not applied … AND that defence is marked IN-WINDOW"). The D3
  parenthetical covers contradicting the visible _comment_ while targeting the
  off-diff body, which is not what this finding does.

## Clean controls (10)

| #   | Run · finding | File               | Grader | Read                                                                                                                                                                                                                    |
| --- | ------------- | ------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2 · 0         | `notes-01-plan.md` | none   | agree — prose boilerplate, no inventory entry                                                                                                                                                                           |
| 2   | 3 · 0         | `a-guard.ts`       | none   | agree — `guardStep*` duplication, pure style                                                                                                                                                                            |
| 3   | 5 · 0         | `a-guard.ts`       | none   | agree — same duplication observation                                                                                                                                                                                    |
| 4   | 6 · 1         | `a-guard.ts`       | none   | agree — refactor suggestion                                                                                                                                                                                             |
| 5   | 7 · 0         | `a-guard.ts`       | none   | agree — refactor suggestion                                                                                                                                                                                             |
| 6   | 8 · 0         | `a-guard.ts`       | none   | **agree, and a good call** — it identifies D2's regex correctly and notes a _true_ limitation (leading/trailing slashes) rather than claiming validation is absent. Improving an existing defence is explicitly `none`. |
| 7   | 9 · 0         | `a-guard.ts`       | none   | agree — DRY complaint                                                                                                                                                                                                   |
| 8   | 11 · 0        | `notes-01-plan.md` | none   | agree — prose duplication                                                                                                                                                                                               |
| 9   | 12 · 0        | `b-cli.ts`         | none   | agree — import-alias style nit, no absence claim                                                                                                                                                                        |
| 10  | 13 · 0        | `notes-01-plan.md` | none   | agree — prose duplication                                                                                                                                                                                               |

## Tally

- Agree: **37**
- Misgrade: **1** (H-28: M3 → M2)
- Misgrade rate: **1/38 = 2.63%**, below the pre-registered 15% invalidity bar.
  **Grading is VALID; the read-off proceeds on grader-recorded counts** under
  the frozen validation-only protocol.

## Outcome sensitivity

The single misgrade moves one finding from M3 to M2, giving a corrected split
of M1 5 / M2 1 / M3 22. It does **not** move any read-off:

- `fabricationRuns` is unchanged at **11/20** — M2 and M3 both count toward the
  M2+M3 metric, and run 6 was already a fabrication run.
- Band 1 (|11 − 17| = 6 > 3) still **FAILS**.
- Band 2 still **PASSES**: M3 = 22 remains the largest of {5, 1, 22}.

Same class as the campaign's H-15 precedent, which likewise moved only the
M2/M3 split and left the combined metric untouched.
