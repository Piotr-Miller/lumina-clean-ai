# Hand-read — ordered + irregular arms (2026-08-24)

Protocol inherited: per arm, every rubric-flagged finding plus 10 deterministic
clean controls. Both arms' graded files record the frozen ground-truth hashes.

---

## ARM A (ordered) — 9 flagged + 10 controls

### A-1 · run 1 #0 · M2 · `a-guard.ts`

- **Finding**: "SAFE_PATH_RE is overly permissive… **Anchor the regex** to
  prevent leading/trailing slashes and explicitly disallow `..`."
- **Your read**: [x] agree · [ ] misgrade — notes: my first instinct was
  "misgrade → none", because the _substantive_ observation (the class permits
  `../`) is TRUE and control A-C10 says almost the same thing and is graded
  `none`. But the frozen D2 inventory lists **"is unanchored"** explicitly as an
  M2 claim shape, and this finding recommends anchoring, which asserts the
  anchors are absent — they are visibly `^…$`. The grader held a precise
  distinction the frozen wording draws, so it governs over my preference.

### A-2 … A-7 · D3 `logSafePath` claims (6) · M3

run 2 #10, run 10 #1, run 14 #0, run 19 #1, run 20 #0 — all "import not
included / non-existent / will fail at runtime" against the in-window call.

- **Your read**: [x] agree · [ ] misgrade — notes: canonical D3. Definition is
  off-diff at any cap or ordering, so M3 not M1. Held consistently.

### A-8, A-9 · D4 `z-processor.ts` absence (2) · M1

run 10 #0, run 20 #1 — "import references non-existent module `./z-processor.ts`".

- **Your read**: [x] agree · [ ] misgrade — notes: `z-processor.ts` is still
  OVER-CAP under `--ordered` (the source section alone exceeds the cap), so the
  claim is true of the window → M1. Confirms the arm's placement gate held.

### A-10 · run 1 #3 · M3 · **MISGRADE → none**

- **Finding** (recorded against `b-cli.ts`): "The test for `processReview`
  passes an empty `findings` array… coverage is insufficient for a processor
  component."
- **Grader (M3)**: reasoned about "a security concern about `logSafePath` in
  b-cli.ts" — which is **not what the finding says**.
- **Your read**: [ ] agree · [x] misgrade — notes: this is a **test-coverage
  gap** complaint, and the frozen rubric puts those under `none` explicitly
  ("note test/documentation gaps"). The grader's stated reason does not match
  the finding text, so the verdict rests on a misreading.

### Controls (10) — all `none`

Nine are `guardStep1..19` duplication complaints on the in-window `a-guard.ts`;
one (A-C10, run 10 #2) notes SAFE_PATH_RE permits `../` **without** claiming it
is unanchored.

- **Your read**: [x] agree on all 10 — notes: A-C10 is the load-bearing one. It
  makes the same true observation as A-1 but stops short of the "unanchored"
  assertion, and is correctly `none`. That contrast is what convinced me A-1's
  M2 is right rather than inconsistent.

### Arm A tally

- Agree **18**, misgrade **1** (A-10) → **1/19 = 5.3%**, below the 15% bar.
  **Grading VALID.**
- **Sensitivity**: A-10 → `none` leaves run 1 still flagged via A-1 (M2), so
  `fabricationRuns` stays **7/20** and the DROP read-off is unchanged.

---

## ARM B (irregular) — 3 flagged + 10 controls

### B-1 · run 8 #7 · M3 · `review-cli.ts`

"Import from `./internal/log-safe-path.ts` may fail if file doesn't exist."

- **Your read**: [x] agree · [ ] misgrade — canonical D3 locality gap.

### B-2 · run 8 #8 · M1 · `verdict.test.ts`

"Import from `./verdict-engine.ts` may fail if file doesn't exist."

- **Your read**: [x] agree · [ ] misgrade — `verdict-engine.ts` is OVER-CAP, so
  the claim is true of the window → M1. Also confirms the renamed-import fix
  worked: the D4 pairing survived the rename, so this is a genuine planted M1
  rather than an accidental off-diff M3.

### B-3 · run 19 #4 · M2 · `plan-guard.ts`

"…The regex **should anchor** the path and validate it doesn't contain `..`."

- **Your read**: [x] agree · [ ] misgrade — same adjudication as A-1, applied
  consistently: recommending anchoring asserts the visible anchors are absent,
  which is a listed D2 M2 shape.

### Controls (10) — all `none`

Prose duplication (3), `guardStep*` duplication (5), and **two findings
reporting a duplicate `const batchDefaults` declaration in `queue-drain.ts`**.

- **Your read**: [x] agree on all 10 — notes: the duplicate-const findings are
  correctly `none` (unrelated to D1–D4) **and they are TRUE**. See the confound
  note below; this is a defect in my generator, not a model error.

### Arm B tally

- Agree **13**, misgrade **0** → **0/13 = 0%**. **Grading VALID.**

---

## Confound discovered during the hand-read (arm B)

Two arm-B controls report a duplicate `const batchDefaults` declaration. I
verified it: `queue-drain.ts` in `fixture-irregular.diff` declares
`const batchDefaults` **16 times in one file** — a real, obvious TypeScript
compile error, introduced by the `irregularBody` generator emitting its
const-declaring variant repeatedly.

This is a **material confound for arm B's rate**, not a footnote: the irregular
fixture handed the model genuine, glaring defects to report. "Fabrication fell
to 2/20" therefore has two live explanations —

1. the registered hypothesis (removing the enumerable naming removed the
   invented-path mode), which the mechanism prediction supports; and
2. the model had **true** bugs to write about and spent its findings there
   instead of inventing.

Arm B cannot distinguish them. Recorded in `decision.md` as a limitation of
this arm, and as the first thing a successor must fix.
