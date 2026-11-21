# Paid run — six GPT26 slots (Linux host)

Plan Phase 4. One paid run on 2026-11-21, on the owner's Linux (Fedora) host, from the clean
checkout at `33f2039a6ddcfe3a29f4696960e50d351bf08a53`. The run used the owner's approval line
`- GPT26-SPEND cap_usd=1.50 decision=approved date=2026-11-21` (`change.md` § GPT26 approvals,
committed in `33f2039`). It followed a dry run that exited 0 at the same revision. Only
`OPENAI_API_KEY` was exported into the run's process. No slot was regenerated, and no
`--resume` was needed.

## Command

`python3 -B scripts/gpt26/run.py --cap 1.50`. It started at 2026-11-21T15:11:11Z, ended at
2026-11-21T15:14:11Z and exited **0**. Exit 0 means that all six slots resolved and the cost and
protocol checks passed. It is not a visual PASS; the verdict comes in Phase 5.

## Runner output (verbatim, stdout and stderr)

```text
gpt26-low (bda91bfbcc01…), series gpt26-screen, ledger /home/piotrmiller/Source/lumina-clean-ai/test-photos/private/gpt26/attempts.jsonl, cap $1.50; record incomplete
  S17-03/1  2336×1552  bound $0.20  pending (0 attempt(s))
  S17-03/2  2336×1552  bound $0.20  pending (0 attempt(s))
  S17-04/1  2192×1648  bound $0.20  pending (0 attempt(s))
  S17-04/2  2192×1648  bound $0.20  pending (0 attempt(s))
  S17-07/1  2320×1552  bound $0.20  pending (0 attempt(s))
  S17-07/2  2320×1552  bound $0.20  pending (0 attempt(s))
spend: $0.00 committed (known cost, else the full reservation), $0.0000 known billed, 0 attempt(s) without a known cost; cap $1.50
  S17-03/1 attempt 1: ok
  S17-03/2 attempt 1: ok
  S17-04/1 attempt 1: ok
  S17-04/2 attempt 1: ok
  S17-07/1 attempt 1: ok
  S17-07/2 attempt 1: ok
  S17-03/1  2336×1552  bound $0.20  delivered (1 attempt(s))
  S17-03/2  2336×1552  bound $0.20  delivered (1 attempt(s))
  S17-04/1  2192×1648  bound $0.20  delivered (1 attempt(s))
  S17-04/2  2192×1648  bound $0.20  delivered (1 attempt(s))
  S17-07/1  2320×1552  bound $0.20  delivered (1 attempt(s))
  S17-07/2  2320×1552  bound $0.20  delivered (1 attempt(s))
spend: $0.48 committed (known cost, else the full reservation), $0.4843 known billed, 0 attempt(s) without a known cost; cap $1.50
summary: 6 delivered [S17-03/1, S17-03/2, S17-04/1, S17-04/2, S17-07/1, S17-07/2]; 0 undelivered []; 0 unresolved []
  moderation_blocked: 0 first-attempt block(s), 0 recovered by the retry, 0 final undelivered
  wall time per call (s): 29.98, 30.95, 27.91, 30.55, 29.28, 27.94; p95 30.95 s vs the 30 s guardrail (diagnostic only)
  spend $0.48 committed of the $1.50 cap; protocol ok
```

## Reading

| Item       | Result                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Slots      | 6 of 6 delivered on the first attempt; 0 undelivered, 0 unresolved                                                                          |
| Blocks     | none, so there are no block request ids to record                                                                                           |
| Spend      | $0.4843 known billed, $0.48 committed of the $1.50 cap; no attempt without a known cost; no bound breach; protocol ok                       |
| Wall time  | 27.91–30.95 s per call; p95 **30.95 s**, just above the ≤ 30 s guardrail (`context/foundation/roadmap.md:383`); a diagnostic, not the gate  |
| Blind seal | outputs are under the gitignored `test-photos/private/gpt26/runs/` and were not opened; nobody looks at them before the Phase 5 seal commit |

## Private record

These files are gitignored and stay on the host. The hashes were taken right after the run.

| File                                       | sha256                                                             |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `test-photos/private/gpt26/attempts.jsonl` | `59eda9e7e52a501937595e0abaf80d7ab1c381772671e43b5ab230c7ab6fad13` |
| `test-photos/private/gpt26/run-state.json` | `60eb3d6fd1c628b6b79775e4aca4aaf9759083f632ea074ab0a0fc26f16ba170` |
