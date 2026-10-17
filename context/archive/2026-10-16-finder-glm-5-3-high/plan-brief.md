# finder-glm-5-3-high — Plan Brief

> Full plan: `context/changes/finder-glm-5-3-high/plan.md`
> Research: `context/changes/finder-glm-5-3-high/research.md`

## What & Why

AI review has been off since 2026-10-04. The predecessor measured glm-5.3 as the finder at `effort: low`. It passed
every reliability gate but ended `NOT ADMITTED (hand-read)`: D2 appeared in only 1 of 9 valid #269 runs. This change
measures the same finder at `effort: high` under the same gate rules, with its own pre-registration and seal. First it
runs a small screening that can stop the change before any series is sealed.

## Starting Point

The branch carries the predecessor's two-stage finder, its finder-only routing and its whole gate tooling, all at
`effort: low`. That setting is pinned in 24 places. The tooling is hard-wired to the archived change's folder. The
spike (2026-10-16) showed `high` is a real level on Z.AI: about 3× `low`'s reasoning tokens and 16–21 s on one finder
finalization request, against `max`'s 76–132 s and one 16,384-token cap hit.

## Desired End State

- **If admitted:** master reviews every eligible PR with glm-5.3 at `effort: high` through the two-stage finder. The
  `false &&` guard and the glm-4.6 variable are gone, and G5 ran green on this PR.
- **Otherwise:** the screening or gate record is committed, AI review stays off, and the PR closes unmerged.

## Key Decisions Made

| Decision              | Choice                                                                                                                                                          | Why (1 sentence)                                                                    | Source            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------- |
| What `high` is        | A distinct level, between `low` and `max`                                                                                                                       | Z.AI's docs and 8 pinned requests agree                                             | Research (spike)  |
| Gate rules            | The predecessor's, unchanged: G1–G5, hand-read ≤ ceil(0.05·N) rejected, D2 in every valid #269 run, ≤ $10/month                                                 | Only the effort differs, so the result stays comparable                             | Owner (change)    |
| Screening inputs      | G3's 4 fixture cases ×1, #247 ×1, #269 ×2, production CLI                                                                                                       | The 300 s and 16,384-token risks only show on #269                                  | Owner 2026-10-16  |
| Screening stops       | (a) a `length` finish; (b) a finder timeout after retry; (c) 53·m247 + 8·m269 > $7.404940; (d) a valid #269 run with no approved D2                             | Written before the run, so a bad result cannot be argued away                       | Owner 2026-10-16  |
| Screening non-stops   | A confirmed 401/402, a provider/model mismatch or a grader error pauses for the owner; a recovered first timeout is a warning; fixture quality is informational | As in the gate; screening runs are not samples                                      | Owner 2026-10-16  |
| D2 timing             | Decided per valid #269 run as it lands, final, in the ledger; the agent lists every `bread-spike.ts` finding with a recommendation; the first `no-match` stops  | At `low` this would have stopped after pr269-01; remaining gates are `not measured` | Owner 2026-10-16  |
| Budget                | Screening $0.75; series pause $3.00, hard stop $3.50; G5 $1.00; total $5.25                                                                                     | The predecessor's proven caps plus a screening                                      | Owner 2026-10-16  |
| Screening tooling     | A `--screening` mode of the existing runner: own ledger, same classification and settlement                                                                     | The stop rules need the gate's run classification                                   | Plan (H1)         |
| Screening admission   | T_s + P ≤ $0.75, P = largest settled cost of the kind                                                                                                           | The gate's 2 × P would refuse the second #269 run                                   | Plan (H3)         |
| Other invalid runs    | Pause for the owner                                                                                                                                             | The owner named pauses, not every case                                              | Plan (H5)         |
| Invalid #269 runs     | The runner pauses; the owner records `d2 --not-applicable`                                                                                                      | Decision 3(d) pauses after every #269 run; D2 counts only for valid runs (3a)       | Owner + Plan (H7) |
| Amendment 1           | Its three operator checks become runner refusals before the seal                                                                                                | Code was sealed then; it is not now                                                 | Plan (H8)         |
| Series first-step P   | max(predecessor estimate, 2 × screening cost)                                                                                                                   | Grounded in measured `high` costs; confirmed at the seal                            | Plan (H9)         |
| Timeout, cap, routing | Unchanged: 300 s, 16,384 tokens, Z.AI/Fireworks/Together                                                                                                        | The screening measures `high` under production's limits                             | Plan              |

## Scope

**In scope:**

- `effort: high` in production config, tests and gate constants.
- This change's paths in the tooling; stale pointers fixed.
- The screening ledger and the D2 instrument; Amendment 1 as code; finder-pass timing.
- The screening, the pre-registration and seal, the series and the hand-read.
- On admission: the workflow flip and G5.

**Out of scope:**

- Changing the timeout, the cap, the routing, the judge or the weights.
- Reopening the predecessor's gate.
- `max` or mixed efforts.
- Fixing the `exit-<n>` record of a technical judge failure.
- A `review.yml` exclude change for G5's large diff.

## Architecture / Approach

The production CLI is unchanged apart from one constant. The runner (`scripts/glm-gate.mjs`) drives it for the
screening and for the gate, through two ledgers that share one classification (`classifyRun`), one settlement
(`reconcile`) and one D2 command (`d2`). `scheduleState` / `screeningState` hold the order, the stops and the pause
after each #269 run. The hand-read sheet takes D2 from the ledger, so the full hand-read never revisits it.

## Phases at a Glance

| Phase                  | What it delivers                                                     | Key risk                                             |
| ---------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| 1. Configure `high`    | Effort flipped, 24 pins updated, tooling retargeted, draft PR        | A missed pin keeps testing `low`                     |
| 2. Screening + D2 tool | `--screening` ledger, `d2` + pause + early stop, Amendment 1 as code | New unsealed code with its own bugs                  |
| 3. Screening (paid)    | GO or STOP under pre-stated rules, ≤ $0.75                           | `length` or a timeout on #269; no D2 in either run   |
| 4. Seal                | Owner-approved pre-registration, hashed, pushed, tagged              | A rule discovered after the seal                     |
| 5. Series (paid)       | G2 → G3 → #247 ×2 → G1 with a D2 decision per #269 run, ≤ $3.50      | D2 in every valid #269 run; the 300 s budget on #269 |
| 6. Hand-read           | Owner verdicts on non-D2 findings; outcome                           | Owner effort (≈ 60 findings)                         |
| 7. G5                  | `false &&` removed, variable deleted, live review on this PR         | A 524 KB diff truncated to 100 KB, run at `high`     |

**Prerequisites:** owner authorization before the screening and before the series; the key limit raised by the owner
(≈ $1.92 allowed now); about $5.81 of credit against the $5.25 budget, so a top-up is advisable; frozen inputs in
`~/.cache/finder-sonnet-gate/` (verified 2026-10-16).
**Estimated effort:** ~2 sessions for Phases 1–2, one short paid session for Phase 3, one for the seal, one paid
session for the series, one owner session for the hand-read, one for G5.

## Open Risks & Assumptions

- **D2 stays the hardest bar.** The predecessor found it in 1 of 9 runs. The screening's (d) and the per-run stop keep
  that failure cheap.
- **The cap and the budget on #269.** At `low`, a single #269 step reached 4,978 reasoning tokens; ≈ 3× that is close
  to 16,384.
- **Fixtures do not predict live behaviour.** G5 is the only live probe, and it runs on a diff larger than #269.
- **n is small.** Two #269 screening runs can stop a candidate that would have passed, and the owner accepted that.
- **The finder can cost ≈ 2.9× its `low` cost** before the cost gate fails; the spike measured 1.6–1.7× on one
  request kind.

## Success Criteria (Summary)

- The screening ends GO or STOP by rules written before it ran, within $0.75. `INCONCLUSIVE (no valid #269 run)` or
  `INCOMPLETE (budget)` goes to the owner, who records GO or STOP.
- On GO, every sealed gate is decided within $3.50, each #269 run's D2 is decided as it lands, and G5 runs green on
  the real workflow.
- Otherwise the record says which rule or gate stopped it, at what cost, and production is unchanged.
