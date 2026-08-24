---
change_id: fixture-ordered-and-irregular
title: "Two fixture arms: does ordering reduce fabrication, and does irregular naming fix the fixture?"
status: implemented
created: 2026-08-24
updated: 2026-08-24
---

## Notes

Two cheap, well-posed measurements, both born from the `fabrication-fixture`
result (archived 2026-08-24, NOT REPRESENTATIVE at 11/20).

**Arm A — `--ordered`.** PR #164 reorders source ahead of prose before the cap.
Its effect on fabrication is currently asserted only BY CONSTRUCTION (the M1
target moves in-window on the real diff), never measured. The fixture is
placement-valid under both pipelines, so running the identical bytes under
`--ordered` measures it directly.

**Arm B — irregular naming.** The base arm named its own prime suspect: 8 of 28
flags cited `e-filler-03.ts` ... `l-filler-10.ts`, files that exist NOWHERE,
extrapolated from the regular `d-filler-01..08` sequence. Arm B removes the
enumerable pattern and nothing else — same defences, same prose, same placement
discipline — and pre-registers the mechanism prediction (invented paths = 0)
alongside the rate bar.

## Outcome (2026-08-24)

**Arm A — DROP (7/20 vs the fixture''s own 11/20).** The first MEASURED evidence
that PR #164''s source-first ordering reduces fabrication, on byte-identical
input. Margin is ONE RUN (7 is exactly the threshold), the predicted
prose-absence M1 flavour never appeared, and a second effect is entangled: arm A
also produced zero invented-path findings on the same uniformly-named content
that generated eight in the base arm. State the result at that strength.

**Arm B — NOT REPRESENTATIVE (2/20), hypothesis falsified informatively.** The
registered mechanism prediction HELD (0 invented paths across all 149 findings),
but the rate moved AWAY from the baseline. Those invented-path findings were
graded M3 and were inflating the base arm''s 11/20, so a synthetic fixture''s
honest fabrication rate is nearer 2/20 than 11/20 — against a real diff''s 17/20.

⚠️ **Confound (mine):** the irregular generator emits 16 duplicate
`const batchDefaults` declarations in one file — a real compile error — so arm
B''s RATE cannot separate "naming fixed" from "model had true bugs to report".
The mechanism result is unaffected. Fix the generator before further arms.

Hand-reads: arm A 18/19 agree (5.3%), arm B 13/13 (0%) — both valid. Spend
$3.44 of a $15 stop. Full record: `verification.md`, `decision.md`,
`reviews/hand-read.md`.
