# Decision — R2 escalation re-run

- **Change**: `r2-prose-rerun`
- **Date**: 2026-08-23
- **Outcome**: **R2 = DROP on M2+M3 at cumulative n=20** (11/20 vs B=17;
  DROP band ≤ 13). Under the archived campaign's frozen combining rule this
  satisfies the SUPPORTED antecedent together with R1's ELIMINATED — the
  successor read of **H\*** ("in-window security-subject content referencing
  material the cap or diff boundary has made invisible") is **SUPPORTED**.
- **Scope of every claim**: `z-ai/glm-4.6` served by Venice fp4 with strict
  structured outputs, single-attempt tool-less draws, pre-note prompt (the
  regime the campaign measured). Not bf16, not unpinned routing, not the
  tool-enabled production loop, not the truncation-note prompt.

## What was measured

The +12-attempt escalation the archived R2 screen missed by one adjudicated
misgrade (archived H-12 sensitivity): byte-identical input to the screen
(identity gate on inputSha256/rulesSha256/inputsSha256 — all matched),
same pin, same frozen rubric and ground truth (sha256-verified), graded by
the same instrument, hand-read at 0% misgrades (17/17).

| Arm                       | fabricationRuns | M1  | M2  | M3  | none |
| ------------------------- | --------------- | --- | --- | --- | ---- |
| R2 screen (archived, n=8) | 5/8             | 0   | 1   | 4   | 55   |
| R2 escalation (new, n=12) | 6/12            | 0   | 1   | 6   | 65   |
| **R2 cumulative (n=20)**  | **11/20**       | 0   | 2   | 10  | 120  |

CI baseline B = 17/20. 11 ≤ 13 → **DROP**. Robust to the archived H-12
correction (would be 10/20 — still DROP).

## What this settles

1. **The prose question.** Removing in-window prose (`context/**`) drops the
   fabrication-run rate from 85% (baseline) to 55% at n=20 — the screen-size
   UNCHANGED read was an artifact of n=8 granularity, exactly as the recorded
   sensitivity suspected. Prose contributes to fabrication; it is not inert.
2. **H\* successor read: SUPPORTED.** R2 DROP + R1 ELIMINATED (archived,
   FINAL) satisfies the frozen rule's SUPPORTED branch. The archived
   campaign's recorded H\* = INCONCLUSIVE stands as history; this change is
   the registered successor that resolves it. Consistent with the archived
   finding 2: in-window content referencing invisible material — code
   dominant (R3), prose contributing (this read) — drives fabrication.
3. **The residue is the locality gap.** What fabrication remains under R2 is
   almost entirely M3 on the one off-diff defence (D3 `logSafePath`: 6 of 7
   new flags); M1 = 0 with D4's files pulled in-window. The mechanism mix
   matches the campaign's decomposition rather than adding a new one.

## Non-claims

- No claim about the truncation-note prompt (this arm deliberately ran
  `--pre-note` for screen continuity) or the tool-enabled production loop.
- No re-grading of the archived screen and no edit to any archived verdict;
  grader-recorded counts were used throughout (validation-only hand-read).
- The R-loc single-injection result and R3's near-zero prose-only result are
  unchanged by this arm.

## Disposition

1. **Registered follow-up CLOSED.** The "optional R2 re-run" named in the
   archived campaign and R5 decisions is done; ledger 114/140, spend ≈ $0.94.
2. **Fixture-spec unblock.** The archived `fixture-spec.md` withheld the
   "minimal sufficient condition" claim behind the R2 sensitivity; with R2
   read at n=20 as DROP, a successor fixture may cite the conjunction H\* as
   supported (same scope caveats).
3. **Path-order fix is the practical consequence.** The sibling change
   `capdiff-path-order` (implemented alongside) orders source before prose at
   the cap, directly shrinking the "in-window prose referencing invisible
   source" configuration H\* names — on the production path where the cap
   actually fires.
4. **Instrument state.** `fabrication-probe.mjs` gained `--pre-note`
   (additive); probe + grader changeDir now point at this change per the
   re-freeze discipline. A future successor must re-point and re-freeze
   again (ci.md precedent).
