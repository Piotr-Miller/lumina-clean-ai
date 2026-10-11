# Probe record — sonnet-5 @ anthropic (Phase 2)

One verifier attempt on the synthetic, non-corpus batch, sent through the stage-2 harness before the seal. Owner
authorization: 2026-10-11, after reading the pre-flight reads below (manual 2.4). The outcome rules and their
precedence were fixed in `plan.md` Phase 2 before the probe ran.

- **Harness**: `harness.mjs` at `0539158`, sha256 `57e64a7aed3f0675f41e5f4d255307d85729e5efd9b122e8cc7bc5269f5723db`
- **Journal**: `probe.jsonl`, sha256 `614a8de43f6928cdae7ef089fb10239e1d50434c4fe5813dbb8b31412f5fcac6`, 7 lines
  (header, start counter, start, request, end, generation, end counter)
- **Seal referenced by the header**: commit `9c85aa27…`, src tree `9be94235…`, gate core `e713226c…`
- **Command**: `harness.mjs probe --series context/changes/finder-verifier-frozen-sonnet/probe.jsonl --t0 54.605930621
--t0-at 2026-10-11T12:31:36.364Z --cap 0.60 --price-in 2 --price-out 10` → exit 0

## Reads

| UTC time                 | Route                                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-11T12:30:56.809Z | `GET /api/v1/models/anthropic/claude-sonnet-5/endpoints`        | HTTP 200. Endpoint `Anthropic`, tag `anthropic`, model `claude-sonnet-5-20260630`: prompt $0.000002, completion $0.00001 (= $2 / $10 per M), status 0, context 1 000 000, max output 128 000. Supports `reasoning`, `include_reasoning`, `max_tokens`. No tier variant of the `anthropic` endpoint; the other nine endpoints are AWS, Azure, Google and Bedrock (global at $2 / $10, regional at $2.2 / $11) |
| 2026-10-11T12:30:57.079Z | `GET /api/v1/models`                                            | HTTP 200. `anthropic/claude-sonnet-5`: `reasoning` `{mandatory: false, default_enabled: true, default_effort: high}`; `expiration_date: null`                                                                                                                                                                                                                                                                |
| 2026-10-11T12:30:57.549Z | `GET /api/v1/credits`                                           | HTTP 200. Total $65.00, used $54.605931, **remaining $10.394069** (≥ $5.10)                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-11T12:30:57.571Z | `GET /api/v1/key`                                               | HTTP 200. Usage $54.605930621, no key limit, not free tier                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-11T12:31:36.364Z | `GET /api/v1/key`                                               | HTTP 200. Usage $54.605930621 — **T0** of the probe, re-read immediately before it                                                                                                                                                                                                                                                                                                                           |
| 2026-10-11T12:31:53.088Z | `GET /api/v1/generation?id=gen-1791721897-9nSkxQlXNeKhcnl1Tu6k` | HTTP 200 (journaled by the harness). `provider_name` Anthropic, model `anthropic/claude-sonnet-5-20260630`, `service_tier` default, native tokens prompt 1987 / completion 178 / reasoning 0 / cached 0, `tokens_prompt` 1344, `total_cost` $0.005754, `native_finish_reason` end_turn                                                                                                                       |
| 2026-10-11T12:31:53.115Z | `GET /api/v1/key`                                               | HTTP 200 (journaled end counter). Usage $54.605930621, Δ $0 — the counter lags                                                                                                                                                                                                                                                                                                                               |
| 2026-10-11T12:37:14.316Z | `GET /api/v1/key`, `GET /api/v1/credits`                        | HTTP 200, re-read by hand after the probe (not journaled). Usage $54.611684621, **Δ $0.005754 = the recorded cost**; credit remaining $10.388315                                                                                                                                                                                                                                                             |

## Checklist (harness output, verbatim)

```
PROBE anthropic/claude-sonnet-5 @ anthropic (packages/code-reviewer/src/retry.ts, one attempt, cap $0.60)
1. Served by Anthropic: wire provider [Anthropic]; SDK step provider [Anthropic]; generation record [gen-1791721897-9nSkxQlXNeKhcnl1Tu6k: provider_name Anthropic] → holds
2. No reasoning on any channel: wire reasoning_tokens [0]; wire reasoning text chars [null]; wire reasoning_details [absent]; SDK tokens sdk/openrouter [0/0] (the SDK reports a missing count as 0); SDK text chars [0] (derived); SDK reasoning_details [0] (derived: the provider fills [] when the field is absent); generation native_tokens_reasoning [0] → holds
3. prompt_tokens ≤ b + 32·m + 32 (A1/A2): [1987 / 5692 = 0.349] → holds
4. cost ≤ bound (A3): [$0.005754 / $0.192746 = 0.030] → holds
5. service_tier: response [default]; generation record [default] (information)
6. Attempt: ok; requests sent 1, blocked 0; HTTP [200]; the sealed parser accepted the answer
7. Spend within the probe cap: T $0.005754 = max(counter Δ $0.000000, recorded $0.005754) vs cap $0.60 → holds
8. Generation record read for every successful response: [gen-1791721897-9nSkxQlXNeKhcnl1Tu6k: read] → holds
OUTCOME PROCEED: items 1–4, 7 and 8 hold → Phase 3 (pre-registration and seal).
```

## Observed against expected

| Item              | Expected                                       | Observed                                                                                                                                                                                                |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Provider        | `Anthropic` on wire, SDK and generation record | `Anthropic` on all three. The wire field is present, so rule 1's "wire absent" branch does not arise                                                                                                    |
| 2 Reasoning       | None on any of four channels                   | `reasoning_tokens` **0** (reported, not absent); wire `reasoning` present as `null`; wire `reasoning_details` absent; generation `native_tokens_reasoning` 0. `reasoning: {enabled: false}` is honoured |
| 3 A1/A2           | `prompt_tokens` ≤ b + 32·m + 32                | 1987 ≤ 5692 (b 5596 bytes, m 2), ratio 0.349. Stage 1 observed 0.281                                                                                                                                    |
| 4 A3              | cost ≤ bound                                   | $0.005754 ≤ $0.192746, ratio 0.030. Billed at $2 / $10: 1987 × 2 + 178 × 10 = 5754 µ$, exactly the recorded cost                                                                                        |
| 5 Tier            | value or `absent`                              | `default` on the response and in the generation record                                                                                                                                                  |
| 6 Attempt         | information                                    | `ok` in one request: no retry, no repair                                                                                                                                                                |
| 7 Spend           | T ≤ $0.60                                      | T $0.005754 from the recorded cost; the counter had not moved at the journaled end read, and the re-read 5 minutes later gives Δ $0.005754, equal to it                                                 |
| 8 Generation read | HTTP 200 with JSON for every success           | Read on the first try                                                                                                                                                                                   |

**Outcome rule that applies:** all of 1–4 hold → Phase 3. No blocking rule fired (no account error, no condition
violation, spend within the cap, the record was read).

## Notes for Phase 3 and 4 (information, not part of the outcome)

- **Tokenizer**: the native prompt count (1987) is 1.48 × OpenRouter's normalized `tokens_prompt` (1344), and the
  request is 2.82 bytes per native token on this synthetic excerpt. Both are consistent with the token inflation
  behind the ≈ $2.2 planning estimate; the $1.68 projection in gate §10 does not include it.
- **Caching**: `native_tokens_cached` 0 and no `cache_discount`, as expected without `cache_control`.
- **Verdict content**: the model refuted the synthetic false finding. The batch is not from the corpus, so this says
  nothing about any criterion; it shows only that the sealed parser accepts sonnet-5's answer shape.
