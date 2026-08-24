# Decision — fabrication fixture

- **Change**: `fabrication-fixture`
- **Date**: 2026-08-24
- **Outcome**: **NOT REPRESENTATIVE** — read off the frozen bar, no bar moved.
  Band 1 failed (11/20 fabrication runs vs the required 14–20); band 2 passed
  (M3-dominant). Both were required.
- **Scope**: `z-ai/glm-4.6` on Venice fp4 with strict structured outputs,
  tool-less single attempts, pre-note prompt — the same scope as B = 17.
- **Spend**: $1.60 of a $12 stop. Pre-registration committed at `3141532`,
  provably before the first paid call.

## What was measured

A synthetic 190,852-byte fixture with four planted defences, built by a
deterministic generator and placement-verified by `--dry` before any spend:
D1/D2 visible, D3's call in-window with its definition absent at any cap, and
D4's implementation over-cap with its importing test in-window.

|                     | CI baseline (B)   | fixture              |
| ------------------- | ----------------- | -------------------- |
| fabricationRuns     | 17/20             | **11/20**            |
| m1Runs              | 5                 | **5**                |
| findings            | 166               | 167                  |
| M1 / M2 / M3 / none | 10 / 6 / 48 / 102 | 5 / **0** / 23 / 139 |

Hand-read 37/38 agree (2.63% misgrade, bar 15%); the one misgrade moves the
M2/M3 split only and changes no read-off.

## Findings

1. **The fixture reproduces the MECHANISMS but not the RATE.** M1 fires at
   **exactly** the baseline's run-rate (5/20 vs 5/20) and M3 dominates, as at
   baseline — but overall fabrication runs at 11/20 against 17/20. A synthetic
   artifact can carry the right machinery and still not behave like the real
   input.
2. **Finding volume is not fidelity.** 167 findings vs 166 is almost an exact
   match while the gated metric misses by 6 runs. Anyone tempted to validate a
   fixture on "it produces about the same number of findings" would have
   concluded the opposite of the truth.
3. **M2 did not reproduce at all (0 vs 6).** This confirms the archived
   fixture-spec's refusal to promise one: "a validated M2 trigger … would be a
   guess". The planted D1/D2 defences are visible and correct, and the model
   simply declined to contradict them. Notably the one control that engaged D2
   (run 8) reasoned about the regex _correctly_ and offered a true improvement.
4. **A fabrication mode the real diff never showed: invented file paths.**
   8 of 28 flags (29%) cite `e-filler-03.ts` … `l-filler-10.ts` — files that
   exist nowhere. The fixture contains only `d-filler-01..08`; the model
   extrapolated the letter prefix and the numbers 09/10 from the visible naming
   pattern, then attached an identical boilerplate criticism to each.
   The frozen rubric grades these M3 correctly ("cites specific code … not in
   the window at all"), but the phenomenon is not the locality gap M3 was
   written to describe — it is pattern-completion off a regular filename
   sequence.

   **This is the fixture's own artifact.** Machine-generated filler with
   uniform names (`d-filler-NN`, `guardStepN`) invites exactly this
   extrapolation; the real PR #127 diff, whose files have irregular
   human-chosen names, produced nothing like it. It plausibly also explains
   part of the rate gap: fabrication budget spent inventing filenames is not
   spent contradicting planted defences.

## Disposition

**1. The fixture ships as-is, labelled NOT REPRESENTATIVE.** It is a valid
mechanism-level artifact — M1 and M3 both reproduce, and its placement is
verified under both cap pipelines — so it is usable for testing _whether an
intervention removes a mechanism_. It must **not** be used to estimate
fabrication rates, or to claim an intervention's effect size transfers to real
diffs.

**2. Do not tune the fixture to hit the band.** Adjusting content until 11/20
becomes 14/20 would be fitting the artifact to the bar after seeing the number
— the exact failure the pre-registration discipline exists to prevent. A future
attempt must re-register first.

**3. Named cause to attack first, if someone tries again:** replace the uniform
generated filler with irregular, human-shaped content. Finding 4 says the
regular naming actively induces a non-representative fabrication mode, so this
is a concrete hypothesis rather than a guess — and it is cheap to test, since
only the generator changes and the harness is built.

**4. The `--ordered` arm is now a cheap, well-posed follow-up.** The fixture is
placement-valid under current production too (`z-processor.ts` stays over-cap),
so running the same content under `--ordered` would measure directly whether PR
#164's source-first ordering changes fabrication. That question is currently
answered only by construction (the M1 target moves in-window on the real diff),
never by measurement. ≈$1.60 and one pre-registration away.

## Non-claims

- No claim that synthetic fixtures cannot be representative — one fixture, one
  composition, one model/provider scope.
- No claim about the _cause_ of the rate gap beyond finding 4's hypothesis;
  the M2 absence and the invented-path mode are observations, not a mechanism.
- Nothing here revises the archived campaign's numbers: B = 17 stands as
  measured, and this arm is a new comparator, not a re-analysis.
