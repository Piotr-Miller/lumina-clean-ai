# GPT26 study `gpt26-wider` — verdict

**Verdict: FAIL.** Pairs at least a tie: 7 of 16 (8 required). Gate `gpt26-wider-v1`, set `gpt26-wider`.

## Not delivered

- none

## Fidelity

- fidelity: 7 of 16 pairs at least a tie, 8 required

## Budget and protocol

- none

## Pairs

Fidelity is judged against the original at the GPT output's size. A pair is at least a tie when its fidelity preference is tie, gpt-slight or gpt-clear; a GPT side rated significant or severe disqualifies on its own. Local's level and quality are diagnostic only.

| Slot     | Pair | GPT fidelity | Fidelity preference | At least a tie | Local fidelity (diagnostic) | Quality (diagnostic) |
| -------- | ---- | ------------ | ------------------- | -------------- | --------------------------- | -------------------- |
| S17-01/1 | p01  | none         | tie                 | yes            | none                        | gpt-clear            |
| S17-01/2 | p13  | none         | tie                 | yes            | none                        | gpt-clear            |
| S17-02/1 | p07  | none         | tie                 | yes            | none                        | gpt-slight           |
| S17-02/2 | p09  | none         | tie                 | yes            | none                        | gpt-clear            |
| S17-03/1 | p15  | minor        | local-slight        | no             | none                        | gpt-slight           |
| S17-03/2 | p04  | minor        | tie                 | yes            | none                        | gpt-slight           |
| S17-04/1 | p08  | minor        | local-slight        | no             | none                        | gpt-clear            |
| S17-04/2 | p12  | minor        | tie                 | yes            | none                        | gpt-clear            |
| S17-05/1 | p14  | none         | tie                 | yes            | none                        | gpt-clear            |
| S17-05/2 | p06  | none         | local-slight        | no             | none                        | gpt-clear            |
| S17-06/1 | p11  | minor        | local-slight        | no             | none                        | gpt-slight           |
| S17-06/2 | p03  | minor        | local-slight        | no             | none                        | gpt-clear            |
| S17-07/1 | p02  | minor        | local-slight        | no             | none                        | gpt-clear            |
| S17-07/2 | p16  | minor        | local-slight        | no             | none                        | gpt-clear            |
| S17-21/1 | p05  | minor        | local-slight        | no             | none                        | local-slight         |
| S17-21/2 | p10  | minor        | local-slight        | no             | none                        | gpt-slight           |

## Run

- Spend: $1.48 conservative (known cost, else the full reservation), $1.2831 known billed, 1 attempt(s) without a known cost; approved cap $3.50. Within the cap and no bound breach.
- Blocks (moderation_blocked): 1 first-attempt, 1 recovered by the retry, 0 final undelivered.
- Wall time per call (s): 26.56, 27.06, 24.06, 22.91, 30.06, 27.73, 26.46, 26.35, 27.76, 30.72, 29.89, 36.7, 29.03, 29.1, 27.66, 34.59, 29.53; p95 36.7 s vs the 30 s guardrail (diagnostic).
- Passes: [8, 8].
- Residual risk: Each photo's two pairs share the same Local file, so its two resized copies are pixel-identical. Independent per-pair order and A/B draws do not hide that repetition; a rater may recognise the repeated Local side, which bears on the pairwise preference as much as on the per-side levels. The two-pass procedure reduces immediate comparison but cannot eliminate recognition or prove compliance. Recorded before spend; restated in the verdict.

Written by `scripts/gpt26/gate.py` from the sealed set, the frozen run record and the committed ratings.
