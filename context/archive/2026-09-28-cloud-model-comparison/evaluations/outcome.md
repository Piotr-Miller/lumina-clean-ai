# S-19 outcome

- **Outcome:** stopped before validation
- **Last completed phase:** Phase 5 core (2026-11-03). Phases 1–4 are complete; Phase 5 stopped at its core gate; Phases 6–7 were not started.
- **Gate report:** `evaluations/phase3-report.json` (`gpt-std` STOP: incomplete core, S17-07/1 technical failure; `nafnet` STOP: preferred over its control on 0 of 3; `gpt-large` diagnostic, 2 probes) and `evaluations/phase5-core-report.json` (`phase5-gpt` STOP: incomplete core, S17-07/1 technical failure). No config passed a core gate, so none reached the tuning gate.
- **Attempts:** 24 paid attempts in the shared ledger `test-photos/private/s19/attempts.jsonl`: 14 in Phase 3 (14 slots) and 10 in Phase 5 (9 slots). Plus 8 spike calls on 2026-10-30, before the harness (Phase 2 indexes 3 of them).
- **Technical failures:** 2 slots, both S17-07 slot 1 and both OpenAI `moderation_blocked` (HTTP 400): `gpt-std` in Phase 3 (1 attempt, no retry rule) and `phase5-gpt` in Phase 5 (2 attempts, the retry was blocked too). Across both phases OpenAI blocked 3 of 7 attempts on S17-07 with the same prepared input; S17-03 and S17-04 were never blocked.
- **Unattempted slots:** 5, the Phase 5 extension slots on S17-01/02/05/06/21. They require a PASS core report and were never sent. No slot was refused by the budget.
- **Spend:** $1.5677 reported by the vendors in the gate ledger (Phase 3 $0.9192, Phase 5 $0.6485), plus about $0.56 for the 2026-10-30 spike. The ledger commits $1.90 of the $4 Phase 3 cap and $1.05 of the $4 Phase 5 cap.
- **Unresolved reservations:** $1.38 held at full bound because no cost was reported: the 3 fal NAFNet calls ($0.78; fal reports no billed amount) and the 3 moderation-blocked OpenAI attempts ($0.60; a blocked request is probably not billed, but no amount was reported).
- **Consent status:** owner-written `S19-SPEND phase=3 cap_usd=4` (2026-11-01) and `S19-SPEND phase=5 cap_usd=4` (2026-11-02), both approved and both within their caps. No `S19-SPEND phase=7` or `S19-VALIDATION` record exists, and none was needed.
- **Holdout opened:** no. The 12 validation photos of `s17-v2` were never read, prepared or sent, so they remain available as an independent holdout for a later attempt.

## What S-19 found

S-19 set out to choose the basic Cloud path's model from a blind comparison against the real Local
engine, judged on a holdout no candidate was tuned on. It stops before that point: **no candidate
passed the tuning-photo core gate, so there is no finalist and the holdout stays closed.** Cloud
stays paused (`CLOUD_DAILY_CAP=0` since 2026-10-28); nothing in production changed.

| Candidate                                    | Result                                                                                                                                                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GPT Image 2.5 Sunburst, standard (`gpt-std`) | Visually a clear win over Local on all 8 rated outputs, but **STOP**: one call blocked by moderation. Repeated fidelity flags: aurora band shapes (suspected, not confirmed content change), black sky turned navy with clouds, reconstructed neon. |
| GPT, large size (`gpt-large`)                | 2 probes, both clear wins; inconclusive, never completed to a core.                                                                                                                                                                                 |
| GPT, restrained prompt (`phase5-gpt`)        | **STOP**: S17-07/1 blocked twice. Rated on two axes: GPT slightly or clearly better-looking on 8 of 8, **real Local clearly more faithful on 8 of 8**. The prompt toned down the visual lead but did not fix fidelity.                              |
| NAFNet + Local gamma (`nafnet`)              | **STOP**: never preferred over its no-NAFNet control (0 of 3 in Phase 3), slightly behind Local; a green cast measured in NAFNet's own output.                                                                                                      |
| NAFNet / Local + exposure curve (Phase 4)    | Exploratory, unpaid: NAFNet + curve lost clearly to its matched control on 3 of 3; the curve on Local was neutral. Neither exposure nor NAFNet carried a gain.                                                                                      |

The main lessons for any later attempt:

1. **Looks and fidelity point in opposite directions for GPT.** The generative edit is the most
   attractive result on every photo, and the least faithful. The quality bar must keep judging
   fidelity separately; a visual win alone would have passed a model that redraws the scene.
2. **Moderation is a reliability problem on people at night.** A night portrait was blocked on
   3 of 7 identical requests, and one retry did not rescue the slot. A production GPT path would
   need a tested fallback to Local and a measured block rate on a larger photo sample.
3. **Denoising alone does not beat Local here.** NAFNet lost to its own control twice, with and
   without an exposure curve.

Evidence: `evaluations/phase2-existing.md`, `phase3-core.md`, `phase4-curve.md`,
`phase5-tuning.md`, their JSON exports and reports.

## Follow-up candidates (not started)

- **TypeSafe Jev as a gate and Auto chooser for Local (owner, 2026-11-03).** Jev is a decision
  model (class D): it returns typed answers such as "already well exposed" or a preset choice,
  not pixels. In S-19 it fails sieve S1, because TypeSafe states its image mode is "not yet up to
  our standards to call ready for production" (`research.md` § Spike: Jev). It also caps images at
  1568 px and ignores EXIF orientation. It fits the S-19 finding that real Local was the more
  faithful result: a gate that leaves already-good photos untouched, plus a better parameter
  choice for Local, keeps the image Local's own. On the one spike call (S17-04) Jev leaned to
  "leave the exposure alone", the owner's own label for that photo. A separate change would
  compare Jev's answers with the owner's per-photo labels (`calibration.md`), rate Local + Jev
  against Local + Auto blind, and wait for the vendor's production status before any app change.
  Cost about $0.0003 per photo.
- **A production GPT path with a Local fallback**, if the visual lead is wanted despite the
  fidelity findings: blocked-request handling, a measured block rate and a fidelity gate. This
  would be a new comparison on the still-closed holdout, not a continuation of S-19's configs.
- **Unblocked by this outcome, still parked:** the Cloud delivery-resolution half of S-18 and
  `local-engine-ceiling` (#188) waited for S-19's model choice. With no model chosen, they stay
  parked; their next step depends on which follow-up the owner picks.
