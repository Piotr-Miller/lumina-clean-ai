# Pre-registration — r2-prose-rerun

Written BEFORE any paid attempt of this change. The method is inherited
verbatim from the archived campaign pre-registration
(`context/archive/2026-08-15-finder-fabrication-triggers/verification.md`,
frozen at commit `2482fb8`, which provably predates every number here); this
document only restates the applicable frozen rules, pins the re-frozen inputs,
and freezes the read-off arithmetic for THIS arm. Measurements and read-offs
may be appended below; nothing above the "Results" heading may change after
the first paid call.

## What runs

**R2 escalation to cumulative n=20**: 12 additional gradeable attempts of the
campaign's R2 rung (CI recipe minus `context/**` → `capDiff`), combined with
the archived n=8 screen (`ci-r2-n8-20260821T165839Z`, fabricationRuns 5/8,
grader-recorded). Scope identical to the campaign: `z-ai/glm-4.6` served by
Venice fp4 with strict structured outputs (Amendment A1 pin, unchanged in
`fabrication-probe.mjs` `PINNED_PROVIDER`), tool-less single attempts.

## Identity gate (combinability — before any paid attempt)

A `--dry` manifest of this working tree MUST match the archived screen's
manifest (`ci-r2-n8-20260821T165839Z-manifest.json`) exactly on:

| Field        | Frozen value                                                       |
| ------------ | ------------------------------------------------------------------ |
| rawBytes     | 155354                                                             |
| sentBytes    | 100030                                                             |
| inputSha256  | `84696acc25889619f9c26401328414f8564e3e11a8a7c7cbc74c73d14a3a8e9c` |
| rulesSha256  | `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f` |
| inputsSha256 | `5c1685e51869881146168a81dd8de6791d843a155e96f3c34a83b15ec2dee5c7` |
| cutFile      | `packages/code-reviewer/src/pipeline.ts`                           |
| window       | 15 files; overCap 7                                                |

Any mismatch → STOP before spending; the arm is not combinable.

**Prompt continuity**: the archived screen ran BEFORE the production
truncation note (change `r5-finder-truncation-note`) existed, so its prompt
carried no note. This run therefore uses the probe's `--pre-note` flag (added
for this change, additive and instrument-side, documented here before any paid
attempt — the Amendment-A1 pattern): the review unit is built WITHOUT
truncation fields, which by the production prompt contract ("the untruncated
prompt must stay byte-identical to the pre-note prompt", pinned in
`prompts.test.ts`) renders the exact pre-note prompt the screen saw.
`noteActive` must record `false` in every run's provenance; a run with
`noteActive: true` is INVALID for this arm and must not enter the denominator.

## Ground-truth freeze

`ground-truth/ci.md` in THIS change dir, copied byte-identical from the
archive; raw-byte sha256 MUST equal the campaign-frozen value:

`12fceadb423bb6130f1512773f360f3610515fbe6178d783cd46b7c34695e820`

Every graded file must record this hash in `groundTruth.sha256`; a graded file
recording any other hash is INVALID and enters no denominator.

## Frozen read-off (restated from the campaign, applied to this arm)

B = 17 (CI baseline fabrication-run count of 20, FINAL in the archive).
R2's predicted component: **M2+M3** — a fabrication run is a run with ≥ 1
M2-or-M3 verdict (the grader's `fabricationRuns` counter). Read at cumulative
n=20 = 8 archived screen runs + these 12:

**cumulative count = 5 (archived, grader-recorded) + fabrication runs among
the 12 new gradeable attempts**

| Verdict        | Condition (campaign table) | Reachable here as       |
| -------------- | -------------------------- | ----------------------- |
| **ELIMINATED** | count = 0 while B ≥ 4      | unreachable (already 5) |
| **DROP**       | count ≤ B − 4 = 13         | ≤ 8 of 12 new fabricate |
| **UNCHANGED**  | \|count − 17\| ≤ 3 (14–20) | ≥ 9 of 12 new fabricate |
| **INCREASED**  | count > 20                 | unreachable (max 17)    |

Grader-recorded counts are the read-off inputs; the hand-read validates
grading and never substitutes labels below the invalidity bar (the campaign's
frozen validation-only protocol).

**Interpretation contract (recorded now):** the archived campaign's verdicts
(R2 UNCHANGED at n=8-no-escalation; H\* INCONCLUSIVE) remain FINAL and are not
retroactively edited. This change records its own successor read-off; under
the archived combining rule, a DROP here alongside the archived R1 ELIMINATED
would satisfy the SUPPORTED antecedent, and that implication is recorded as
this change's finding, in the decision note, not as a rewrite of the archive.

## Attempt ledger and ceilings

- Campaign ledger at close: 102/140 attempts spent → 38 remained. This arm's
  budget: exactly 12 gradeable attempts; provider errors are retried and
  consume headroom but never shrink the denominator; total attempts of this
  change (failed included, per the checkpoint-counting rule) must keep the
  cumulative ledger ≤ 140 (i.e. ≤ 38 attempts here — far above need).
- Dollar: ≈ $2 expected (finder ~$0.005–0.013/attempt on Venice; grader
  ~$0.02/verdict, ~7.5 findings/run screen-observed). Hard stop if this
  change's spend reaches **$6** (3× the estimate) before 12 gradeable
  attempts are graded → record INCONCLUSIVE for the arm.

## Hand-read protocol (inherited)

Every rubric-flagged finding (mechanism ≠ none) among the 12 new runs, plus
**10 deterministic clean controls**, adjudicated in `reviews/hand-read.md`.
Clean-control selection rule (frozen now): iterate new runs 1..12 in order,
taking from each gradeable run its lowest-indexed `none`-verdict finding; if
fewer than 10 are collected after one pass, repeat with each run's
second-lowest, and so on, until 10 controls or exhaustion. Misgrade rate
≥ 15% invalidates the grading — stop, record, no read-off.

## Results

### Identity gate (2026-08-23, before any paid attempt) — PASS

`results/ci-r2-dry-manifest.json` matched the archived screen on every gated
field: rawBytes 155354, sentBytes 100030, inputSha256 `84696acc…`,
rulesSha256 `34d5fcac…`, inputsSha256 `5c1685e5…`, cutFile
`packages/code-reviewer/src/pipeline.ts`, window 15 / overCap 7. Ground truth
re-frozen: `ground-truth/ci.md` sha256 =
`12fceadb423bb6130f1512773f360f3610515fbe6178d783cd46b7c34695e820` (the frozen
value).

### Paid run (2026-08-23)

- `fabrication-probe.mjs --variant ci --rung r2 --n 12 --pre-note` →
  `results/ci-r2-n12-20260823T193846Z.json`. **12/12 gradeable, 0 finder
  errors**; every run `provider: Venice`, `noteActive: false` (pre-note prompt
  confirmed per the prompt-continuity rule). Finder cost $0.085799.
- Grading: `results/ci-r2-n12-20260823T193846Z-graded.json`, complete after
  one resume (1 grader call errored and was re-attempted per the checkpoint
  protocol); `groundTruth.sha256` = the frozen value in the graded file.
  Grader cost ≥ $0.849986 across 73 calls. Total spend ≈ **$0.94** — far
  under the $6 stop.
- Totals (grader-recorded): 72 findings — **M1 0, M2 1, M3 6, none 65**;
  **fabricationRuns 6/12**; m1Runs 0. Fabricating runs: 6, 7, 8, 10, 11, 12;
  clean: 1, 2, 3, 4, 5 (zero findings), 9. Six of seven flags are the D3
  `logSafePath` locality gap; M1 = 0 is consistent with the R2 delta (D4's
  files in-window; M1 possible only on the seven over-cap files).

### Hand-read (2026-08-23) — grading VALID

All 7 flagged findings + 10 deterministic clean controls adjudicated in
`reviews/hand-read.md` against the archived Phase-3/-4 precedents (H-11
agreed-M3 shape; archived H-12 misgrade shape matched none of the flags).
**17/17 agree, misgrade rate 0% < 15%** — the read-off proceeds on
grader-recorded counts.

### Read-off (frozen rule, cumulative n=20)

cumulative count = 5 (archived screen, grader-recorded) + 6 (this run) =
**11 of 20** → 11 ≤ B − 4 = 13 → **R2 reads DROP on M2+M3**.

- Robustness: under the archived H-12 sensitivity (screen corrected to 4/8),
  cumulative = 10 — still DROP. The verdict does not depend on the disputed
  screen flag.
- Rate view: baseline 17/20 (85%) → R2 cumulative 11/20 (55%); the new
  12-attempt arm alone ran at 6/12 (50%).

### Ledger

Campaign cumulative: 102 (archived) + 12 (this change, 0 errors) = **114/140**
attempts — inside the pre-registered ceiling. This change's own budget: 12 of
≤ 38, $0.94 of $6.

### Successor H\* read (recorded per the interpretation contract)

Under the archived frozen combining rule (SUPPORTED iff R2 ∈ {DROP,
ELIMINATED} AND R1 ELIMINATED on M1 or R-loc ELIMINATED on M3): R2 = DROP
(here, at the cumulative n=20 the rule always specified) AND R1 = ELIMINATED
(archived, FINAL) → the SUPPORTED antecedent is satisfied. The archived
campaign's recorded H\* = INCONCLUSIVE is not edited; this change's
`decision.md` records the successor verdict. Scope unchanged: glm-4.6 on
Venice fp4 strict structured outputs, tool-less single attempts.
