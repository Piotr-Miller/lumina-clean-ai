# GPT26 run — `gpt26-wider`

Written by `python3 scripts/gpt26/run.py --config scripts/gpt26/configs/gpt26-wider.json --cap 3.50 --report` from the registration files and the private run record. Offline: no provider call, no reservation, no ledger or sidecar write.

- Config: `scripts/gpt26/configs/gpt26-wider.json` (sha256 `7b9994c564528b26f8e0c22a8eb71fdf1db255f53c74d49229e9f75feeb98d69`), series `scripts/gpt26/series/wider.json`, 16 registered slots.
- Approval: `- GPT26-SPEND cap_usd=3.50 decision=approved date=2026-11-25`
- Record: **complete**.

## Slots

| Slot     | Request size | Bound | Status    | Terminal reason | Attempts | Without known cost | Wall time (s) |
| -------- | ------------ | ----- | --------- | --------------- | -------- | ------------------ | ------------- |
| S17-01/1 | 2336×1552    | $0.20 | delivered | —               | 1        | 0                  | 26.56         |
| S17-01/2 | 2336×1552    | $0.20 | delivered | —               | 1        | 0                  | 27.06         |
| S17-02/1 | 2512×1456    | $0.21 | delivered | —               | 1        | 0                  | 24.06         |
| S17-02/2 | 2512×1456    | $0.21 | delivered | —               | 1        | 0                  | 22.91         |
| S17-03/1 | 2336×1552    | $0.20 | delivered | —               | 1        | 0                  | 30.06         |
| S17-03/2 | 2336×1552    | $0.20 | delivered | —               | 1        | 0                  | 27.73         |
| S17-04/1 | 2192×1648    | $0.20 | delivered | —               | 1        | 0                  | 26.46         |
| S17-04/2 | 2192×1648    | $0.20 | delivered | —               | 1        | 0                  | 26.35         |
| S17-05/1 | 1664×2208    | $0.21 | delivered | —               | 1        | 0                  | 27.76         |
| S17-05/2 | 1664×2208    | $0.21 | delivered | —               | 1        | 0                  | 30.72         |
| S17-06/1 | 1648×2192    | $0.20 | delivered | —               | 1        | 0                  | 29.89         |
| S17-06/2 | 1648×2192    | $0.20 | delivered | —               | 1        | 0                  | 36.7          |
| S17-07/1 | 2320×1552    | $0.20 | delivered | —               | 2        | 1                  | 29.03, 29.1   |
| S17-07/2 | 2320×1552    | $0.20 | delivered | —               | 1        | 0                  | 27.66         |
| S17-21/1 | 2336×1552    | $0.20 | delivered | —               | 1        | 0                  | 34.59         |
| S17-21/2 | 2336×1552    | $0.20 | delivered | —               | 1        | 0                  | 29.53         |

## Spend

- Known billed: $1.2831.
- Conservative: $1.48 (known cost, else the full reservation) of the $3.50 cap — within the cap.
- Unknown reservations: 1 attempt(s) without a known cost, each counted at its full bound.
- Cost-bound breaches: none.

## Blocks and recoveries

- moderation_blocked: 1 first-attempt block(s), 1 recovered by the retry, 0 final undelivered.

## Wall time

- Per call (s): 26.56, 27.06, 24.06, 22.91, 30.06, 27.73, 26.46, 26.35, 27.76, 30.72, 29.89, 36.7, 29.03, 29.1, 27.66, 34.59, 29.53.
- p95: 36.7 s vs the 30 s guardrail (diagnostic only).

## State

- Every slot resolved; no inconsistency and no cost-bound breach.
