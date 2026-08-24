---
change_id: fixture-ordered-and-irregular
title: "Two fixture arms: does ordering reduce fabrication, and does irregular naming fix the fixture?"
status: preparing
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

## Status

Pre-registration frozen (`verification.md`), all four inputs sha256-pinned,
both placement gates verified by `--dry` with no paid call. Paid runs pending.
