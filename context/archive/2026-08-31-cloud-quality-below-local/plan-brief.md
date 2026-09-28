# Calibrate Cloud Auto exposure and verify quality against Local — Plan Brief

> Full plan: `context/changes/cloud-quality-below-local/plan.md`
> Frame brief: `context/changes/cloud-quality-below-local/frame.md` (its magenta diagnosis is superseded — see `change.md` § Decision)
> Research: `context/changes/cloud-quality-below-local/research.md` (its model mechanism is superseded; code references still hold)

## What & Why

Cloud AI's Auto recommendation overexposes night photos. At Auto's 1.50 / 0.1216, one licensed
aurora came back with 77.6 % of pixels at V ≥ 0.90. S-17 calibrates that recommendation and then
decides, on a frozen 12-photo validation set, whether Cloud is actually better than the free Local
engine — the product's central promise, currently unverified.

## Starting Point

Cloud Auto is a pure function evaluated in the browser. It shares `baseGamma` with Local and pins
most dark frames at gamma 1.5. Bread stays (decision 2026-09-26). The agreed quality bar is in
`quality-bar.md`, the frozen benchmark `s17-v1` is in `test-photos/`, and a direct model path
(`bread-spike.ts`) is calibrated byte-equivalent to the app.

## Desired End State

Cloud Auto no longer washes out the tuning photos, and its S17-01 result matches an accepted
reference, pinned by a test. The candidate is live and Local is unchanged. Twelve validation photos
have been rated blind, and S-17 records two verdicts: whether Auto works, and whether Cloud's
advantage over Local is confirmed.

## Key Decisions Made

| Decision                    | Choice                                                                                                                                                                               | Why                                                                | Source                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------- |
| Model                       | Keep Bread                                                                                                                                                                           | The magenta diagnosis did not survive source comparison            | Change decision              |
| Which Auto                  | Cloud branch only; `baseGamma` and Local unchanged                                                                                                                                   | Local stays a fixed reference; judge the whole Cloud Auto output   | Plan (user)                  |
| Regression reference        | S17-01, frozen Commons rendition 3840×2560                                                                                                                                           | Tests the input the product gets; Run C/D stay history             | Plan (user)                  |
| Condition 1 (Auto works)    | Improvement on every input pre-labelled needs-improvement, no harm on all 12, regression passes                                                                                      | Brightening alone is not improvement; controls left alone are fine | Plan (user, after review F1) |
| Condition 2 (Cloud > Local) | ≥ 8 clear wins, ≤ 1 moderate loss, 0 severe                                                                                                                                          | As agreed before tuning                                            | Quality bar                  |
| Where to validate           | Normal production deploy                                                                                                                                                             | Measures exactly what users get; deploy ≠ pass                     | Plan (user)                  |
| Daily cap                   | 10 only on planned days, then back to 3                                                                                                                                              | 12 runs need ≥ 2 days; the cap is global                           | Plan (user)                  |
| Gamma < 1.0                 | Probe 0.9 first; floor chosen on quality                                                                                                                                             | Bread brightens strongly at 1.0; the pinned version is unverified  | Plan (user)                  |
| EXIF ignored by Bread       | Separate change; validation waits                                                                                                                                                    | A real bug outside Auto calibration                                | Plan (user)                  |
| Job failures                | Infra retried ≤ 2×; unresolved → validation **incomplete**, no verdict; final model error = the one exception, recorded before unblinding, scored harm + severe                      | A failed attempt never stands in for a result                      | Plan (user, review F3)       |
| Regression check            | Exact parameters pinned in a unit test; output hash first, mismatch → investigate reproducibility; tolerances for S17-01 only, set at acceptance                                     | Byte-identity was proven only on a smaller input                   | Plan (user)                  |
| Harness parity              | Full `LumaStats` compared with the browser on all six tuning photos                                                                                                                  | Matching parameters can hide a sampling difference                 | Plan (user)                  |
| Tuning freeze               | The fitted rule's own pair run and rated on all six before freezing                                                                                                                  | Separately accepted ranges do not guarantee the combination        | Plan (user)                  |
| Cap on validation days      | Reverted to 3 at the end of every validation day, interrupted ones included; every change dated                                                                                      | Never left raised overnight                                        | Plan (user)                  |
| Gauntlet bar                | Correct `bars.md` before Phase 1; after S-17, a frozen Bread output is a Local bar only where visually accepted                                                                      | Stop a disproven diagnosis seeding a new bar                       | Plan (user)                  |
| Post-pass                   | ON in production (served page, 2026-09-27) → final tuning results also checked through the app; each run records file, format, post-pass outcome; a flag change = changed conditions | Users receive the post-passed file, with fallback to raw PNG       | Plan (user, review F5)       |
| Phase dependencies          | Entry gates: named manual rows must be recorded before the dependent phase starts                                                                                                    | Measurements are preconditions, not optional acceptance            | Plan (review F2)             |

## Scope

**In scope:** a harness for full-size direct runs and offline Auto values from the app's own code;
a premise check at full resolution; EXIF and gamma-0.9 probes; pre-registered tuning on six photos;
a frozen S17-01 reference; the cloud-branch change with tests; a production deploy; blind
validation on 12; recording the verdict everywhere S-17's state is stated.

**Out of scope:** `baseGamma` and Local Auto; an EXIF fix (separate change if needed); the chroma
post-pass; the Bread version or model; Cloud output resolution; committing validation outputs;
changing `s17-v1`; the cap's enforcement.

## Architecture / Approach

Python decodes and downsizes each photo like the browser does. TypeScript runs the real
`recommendParams`. `bread-spike.ts` calls the pinned Bread (upload API above 1 MB), and a measuring
script reports exposure and hue diagnostics. The maintainer judges contact sheets. A single rule
over existing stats is fitted inside the ranges they mark, then shipped in the cloud branch.
Validation uses the live app, Downloads from both engines, and a seeded blind A/B page whose key is
kept apart until the ratings are saved.

## Phases at a Glance

| Phase                       | What it delivers                                                                                                         | Key risk                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 0. Correct the gauntlet bar | `bars.md` (both trees) without the disproven magenta / “pins 1.50” claims                                                | The two copies drifting apart                                                  |
| 1. Measurement harness      | Direct runs for any size; Auto values matching the app                                                                   | Offline stats drift from the browser's → tuning the wrong function             |
| 2. Premise check and probes | Full-res baseline, EXIF and gamma-0.9 answers                                                                            | Premise may not hold at full resolution → stop gate                            |
| 3. Tune and freeze          | Fitted cloud rule; its own pair rated on all six, directly and through the app (post-pass ON); accepted S17-01 reference | No single rule fits all six → stop; app checks take ~2 days of cap slots       |
| 4. Ship the candidate       | Cloud branch + tests, deployed                                                                                           | A shared edit moving Local Auto — pinned by a test                             |
| 5. Validate on 12           | Blind ratings; both verdicts — or recorded incomplete                                                                    | Cap exhausted by other users; an unresolved delivery failure leaves no verdict |
| 6. Record the verdict       | Consistent state across docs and issue #203                                                                              | Stale pointers — handled by a checklist                                        |

**Prerequisites:** your own `REPLICATE_API_TOKEN` (local only); Pillow + numpy; the maintainer's time
for ratings; Cloudflare access to change `CLOUD_DAILY_CAP` on validation days.
**Estimated effort:** ~4–6 sessions across 7 phases (0–6), plus two validation days; about $0.05 in
direct runs.

## Open Risks & Assumptions

- The defect was measured on one photo at 896 px; Phase 2 re-measures before building.
- Direct runs omit the chroma post-pass, which is ON in production; the six final tuning results are therefore also checked through the app before freezing.
- One rater who has seen tuning outputs; A/B blinding and matched sizes reduce, not remove, bias.
- `s17-v1` has no held-out aurora, and phone coverage is limited. The verdict is a decision gate
  for S-17, not a claim about all night photos.

## Success Criteria (Summary)

- Cloud Auto: 0 harms on the 12 validation photos and the S17-01 regression holds.
- Cloud vs Local: ≥ 8 clear Cloud wins, ≤ 1 moderate loss, 0 severe regressions — or recorded as
  unconfirmed.
- Local Auto unchanged; the cap back at 3; every S-17 status pointer consistent.
