# Decision — Finder Fabrication Ablation Campaign

- **Change**: `finder-fabrication-triggers`
- **Date**: 2026-08-21
- **Outcome**: **H\* = INCONCLUSIVE** — read off the frozen combining rule, no renegotiation.
  Two rungs ELIMINATED their predicted mechanisms; the rung H\* needed most read UNCHANGED.
- **Scope of every claim below**: `z-ai/glm-4.6` served by **Venice fp4 with strict structured
  outputs** (Amendment A1), single-attempt tool-less draws. Not bf16, not unpinned routing, not
  the tool-enabled production loop.

## What was measured

| Arm                     | Result                               | Pre-registered read-off      |
| ----------------------- | ------------------------------------ | ---------------------------- |
| CI baseline n=20        | **17/20** fabrication runs (B=17)    | G2 passes (≥ 5/20)           |
| Instrument n=20         | **8/20** fabrication runs            | G1 passes (not 0/20 on both) |
| R1 cap lifted n=20      | M1 findings **0**; fabrication 9/20  | **ELIMINATED** on M1         |
| R2 prose removed n=8    | 5/8 (\|5 − 6.8\| < 2, no escalation) | **UNCHANGED** on M2+M3       |
| R3 prose only n=20      | M2 findings **0**; fabrication 1/20  | **ELIMINATED** on M2         |
| R-loc defs injected n=8 | 5/8 (\|5 − 6.8\| < 2, no escalation) | **UNCHANGED** on M3          |

Mechanism split at baseline: CI — M1 10, M2 6, **M3 48**, none 102 (166 findings); instrument —
M1 1, M2 7, M3 12, none 101 (121 findings). Hand-reads: Phase 3 **1/94** misgrades (1.06%),
Phase 4 **2/43** (4.65%) — both far under the 15% invalidity bar. Ledger **102/140** attempts
(96 gradeable + 6 errors from reserve); spend ≈ **$9–10** of the $32.83 pre-registered ceiling.
Pre-registration committed at `2482fb8`, before the first paid call; every bar above provably
predates its number.

## The findings, traceable to the read-offs

1. **M1 is the cap's product, not the model's.** Lifting the 100 KB cap removed every
   cap-manufactured absence claim (0 M1 findings in 20 runs → ELIMINATED). The falsifier was
   pre-registered as cap-specific and it held exactly.
2. **Removing in-window code sharply reduced fabrication; prose alone produced almost none.**
   R3 (prose only): 1/20 fabrication runs — not zero, so code is not established as strictly
   necessary — with M2 = 0, and the pre-registered expectation that invisible-code claims would
   persist as M3 **failed** (1 M3 finding in 20 runs). R2 (code without prose) stayed at
   baseline rate. Together the rungs point at _in-window code referencing invisible material_
   as the dominant contributor, inverting H\*'s emphasis on the security prose.
3. **Injecting the named off-diff definition did not suppress M3.** R-loc appended the ground
   truth's one named definition (`logSafePath`, 596 bytes) verbatim to the input and the
   fabrication rate stayed UNCHANGED at screen size. That is evidence about this single
   injection only — not a general claim about what added context can or cannot do.
4. **The variant pair agrees.** CI (source in window, 14 source files over-cap): 17/20.
   Instrument (zero `packages/` source files in-window — the workflow YAML was still visible):
   8/20. Source visibility correlates with fabrication, consistent with finding 2.

## Why H\* still reads INCONCLUSIVE

The frozen rule requires R2 to read DROP or ELIMINATED for SUPPORTED; R2 read UNCHANGED. All
four UNCHANGED were required for FALSIFIED; R1 and R3 are ELIMINATED. **Recorded sensitivity**:
the Phase 4 hand-read found R2 run 2's sole flag (H-12) to be a misgrade — a corrected recount
would read 4/8 and would have met the escalation trigger. The validation-only protocol keeps
grader counts below the invalidity bar, so R2 stands UNCHANGED, but the R2 verdict is one
adjudicated finding away from having been tested at n=20. A successor re-running R2 (+12
attempts, 38 remain under the ceiling) resolves this cheaply.

## Disposition

**1. The instrument ships.** `fabrication-probe.mjs` (declared variants/rungs, byte-anchored
recipes, window manifests, per-attempt checkpointing, provider pinning + provenance) and
`fabrication-grade.mjs` (window-relative M1/M2/M3 grading, frozen rubric, identity checks,
resume) stay on the branch with all results. The campaign's grading survived two hand-reads.

**2. R5 — the finder truncation note — is the named follow-up change**, and R1's ELIMINATED
read is its justification: M1 exists only because the model is never told its input was cut.
Telling the finder _that_ the diff is truncated and _which files fell outside_ attacks the
mechanism the campaign proved cap-specific. Ships as its own change, per charter.

**3. The fixture path is specified, not built** — see `fixture-spec.md`: what a fixture can now
reproduce (M1 mechanically; M3 at measured baseline shape), and what it cannot claim (a
validated M2 trigger; a minimal sufficient condition, blocked by the R2 sensitivity).

**4. The capDiff path-order bias follow-up gains relevance**: since M1 is cap-manufactured and
byte-order decides which files fall over the cap, alphabetical path order silently selects
_which_ files the finder reports as missing.

## What this change does not claim

- Not that prose is irrelevant: R2's UNCHANGED is one adjudicated misgrade away from an n=20
  test it never received.
- Not that context cannot cure M3: R-loc injected one 596-byte definition; that is one point,
  not a curve.
- Not that any of this transfers to other providers or to tool-enabled runs — the Amendment A1
  scope is strict, and the unpinned-routing failures (4/4 before the pin) show serving-side
  behavior is a first-order variable.
- Not that the grader is ground truth: one double-graded finding received conflicting verdicts
  across concurrent sessions (recorded incident), and 3 of 117 flagged findings (3 of 137
  hand-read entries, including the 20 clean controls) were hand-identified misgrades. The
  rates carry hand-read-validated grading, nothing stronger.
- Not an explanation of the CI/instrument asymmetry (17/20 vs 8/20) — recorded, unexplained.
