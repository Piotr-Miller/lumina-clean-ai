---
date: 2026-10-02T23:40:05+02:00
researcher: Claude (Opus 5.5)
git_commit: 87ba5daedd00c238d50aa9ede472403c448e67dd
branch: feat/finder-model-swap
repository: lumina-clean-ai
topic: "Shortlist of 2–4 finder candidates on OpenRouter, with current prices, availability, tool support, 429 risk and full-gate cost"
tags: [research, code-reviewer, finder, openrouter, model-selection, gate]
status: complete
last_updated: 2026-10-02
last_updated_by: Claude (Opus 5.5)
---

# Research: finder candidates for `finder-model-swap`

**Date**: 2026-10-02T23:40:05+02:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 87ba5da (pushed: `origin/feat/finder-model-swap`)
**Branch**: feat/finder-model-swap
**Repository**: lumina-clean-ai

## Research Question

A short list of 2–4 finder candidates (model + OpenRouter endpoint) with **current** prices and availability,
tool support, 429/limit risk, and an estimate of the full gate's cost (G1 #269 × 10, G2 clean × 5, G3 fixtures
× 12 plus the 40-finding hand-read sample, G4). Respect `change.md`'s constraints. **No paid model calls** —
public lists, prices and documentation only.

## Summary

**Shortlist, in the recommended measuring order:**

| #   | Model / endpoint to pin                             | Prompt / completion / cache read (USD/M) | Reasoning off possible? | Endpoints (in-list fallback)    | Est. full gate (finder + grader) |
| --- | --------------------------------------------------- | ---------------------------------------- | ----------------------- | ------------------------------- | -------------------------------- |
| 1   | `openai/gpt-6-luna` → `openai`                      | 0.10 / 0.50 / 0.01                       | yes (`none` listed)     | OpenAI, Azure, Bedrock (+ flex) | **~$0.13–0.25**                  |
| 2   | `minimax/minimax-m3` → `minimax` (first-party, fp8) | 0.30 / 1.20 / 0.06                       | `mandatory: false`      | 13 providers                    | **~$0.29–0.60**                  |
| 3   | `qwen/qwen3.8-flash` → `alibaba`                    | 0.15 / 0.47 / 0.016                      | `mandatory: false`      | **Alibaba only**                | **~$0.15–0.33**                  |
| —   | reference: `openai/gpt-6-sol` → `openai`            | 2.00 / 10.00 / 0.20                      | yes (`none` listed)     | OpenAI                          | ~$1.43–3.75, **G4 likely fails** |

All three cost **≤ $0.60 per candidate** for G1–G4; all three together ≈ **$0.6–1.2** (Phase 4 of the
predecessor spent $1.54 on four endpoints). G5 (one live scratch PR) is extra, order **≤ $0.25**, unverified.

**Three findings change the field compared with August:**

1. **Mandatory reasoning is now a hard exclusion.** The production request carries
   `reasoning: {enabled: false}` with `require_parameters: true`, and Amendment A3 counts any reasoning token or
   text as a failed attempt. OpenRouter's model list now publishes `reasoning.mandatory`; **117 of 332 models
   that declare it are `true`**, including `google/gemini-3.8-flash` and `anthropic/claude-sonnet-5.5`. Those
   cannot pass the gate as registered.
2. **The OpenAI exclusion from August no longer applies.** GPT-5.6 was excluded because strict structured
   outputs require every property in `required` (`decision.md`, round 2). The finder no longer sends
   `response_format` at all (`packages/code-reviewer/src/reviewer.ts:288`), so that reason is gone.
3. **No candidate has any evidence on this task.** Every cheap model live-probed so far failed differently
   (glm-4.6/5.2 tool-inert, deepseek-v4-flash 0/3 live, haiku-4.5 hallucinated). The shortlist is a list of what
   is _eligible_ and _affordable_ to measure, not a prediction that any will pass. The hand-read threshold
   (≤ 2 of 40 rejected) is the gate most likely to decide.

## Detailed Findings

### What the production request requires of an endpoint

- `require_parameters: true` is unconditional on the finder (`packages/code-reviewer/src/config.ts:148-166`),
  so the endpoint must list **`tools`** and **`reasoning`** in `supported_parameters`.
- `reasoning: {enabled: false}` is sent on every request via `extraBody` (`reviewer.ts:262-269`). A3
  (`context/archive/2026-09-24-finder-serialization-outage/plan.md:526-532`): reasoning tokens or text in a
  response fail the attempt; an endpoint that refuses the shape "does not pass".
- No `response_format` on any step (`reviewer.ts:288`): the JSON format is in the prompt and parsed locally, so
  strict-schema quirks of a provider no longer matter.
- CI step budget: 5 (`.github/actions/ai-review/action.yml:37`); SDK retries off (`reviewer.ts:291`).
- Routing: `only` + `order` from `OPENROUTER_FINDER_PROVIDERS`, fallbacks only inside the list
  (`config.ts:160-166`). Default today `["novita"]` (`config.ts:130`).

### Source and method for prices and availability

- **Route:** `GET https://openrouter.ai/api/v1/models` (HTTP 200, 466 models) and
  `GET https://openrouter.ai/api/v1/models/<id>/endpoints`, both unauthenticated, read **2026-10-02T21:38Z**.
  Fields used: `pricing.prompt|completion|input_cache_read`, `supported_parameters`, `reasoning.mandatory`,
  `reasoning.supported_efforts`, per-endpoint `provider_name`, `tag`, `quantization`, `uptime_last_30m`,
  `uptime_last_1d`, `status`. Raw files were kept in the session scratchpad only.
- `z-ai/glm-4.6` endpoint prices are **unchanged** since the predecessor's G-A1 table (venice 0.43/1.75,
  deepinfra 0.50/2.00, novita 0.55/2.20, z-ai 0.60/2.20) — a consistency check on the route.
- Filter: `tools` ∧ `reasoning` ∧ `reasoning.mandatory == false`, prompt ≤ $2/M, released since mid-2026, then
  narrowed by vendor track record in agentic coding and endpoint depth.

### Candidate 1 — `openai/gpt-6-luna` (released 2026-09-22)

- Price 0.10 / 0.50, cache read 0.01 — the cheapest serious option, ~5× cheaper per prompt token than glm-4.6.
- `reasoning: {mandatory: false, default_enabled: true, supported_efforts: [..., "none"]}`. Reasoning is **on by
  default**; whether `enabled: false` maps to effort `none` with zero reasoning tokens is **not documented** by
  OpenRouter (see Open Questions). The gate's A3 check will show it on the first attempt.
- Endpoints: `openai` (uptime 30 m 99.99%, 1 d 99.98%), `azure` (99.93 / 99.98), `azure/us`, `azure/eu`,
  `amazon-bedrock/us-east-1`, plus `openai/flex` (0.05/0.25, slower tier) and `openai/fast` (0.20/1.00).
  First-party capacity → **lowest 429 risk** on the list; production could route `["openai","azure"]`.
- Why it was not tested before: the August exclusion was the strict-schema issue, now moot (finding 2).

### Candidate 2 — `minimax/minimax-m3` (released 2026-05-31)

- Price 0.30 / 1.20 (first-party `minimax/fp8`), cheapest endpoint `coreweave/fp4` 0.23 / 0.96.
- `reasoning: {mandatory: false}`; no `supported_efforts` listed, so `enabled: false` is the only lever.
- 13 endpoints; `minimax/fp8` uptime 99.81 / 98.92. Venice and Novita also serve it — both measured
  previously; Venice's 1 d uptime here is the lowest (95.49%).
- Positioned by its vendor for "long-horizon agentic work, coding" (model description) — a vendor claim, not
  evidence.

### Candidate 3 — `qwen/qwen3.8-flash` (released 2026-08-26)

- Price 0.15 / 0.47, cache read 0.016.
- `reasoning: {mandatory: false, default_enabled: true, supports_max_tokens: true}` — on by default, like Luna.
- **One endpoint only (Alibaba**, 99.85 / 99.83). With `only: ["alibaba"]` there is no fallback, so any upstream
  429 is a failed G1 attempt and, in production, a failed review. That is the risk profile that sank Z.AI and
  DeepInfra in the predecessor's gate. Measured third for that reason.

### Reference, not a candidate — `openai/gpt-6-sol`

Same price as `claude-sonnet-5` (2 / 10). The calibrated estimate puts a fixture row at ~$0.011, ≈ 3.6× the G4
ceiling ($0.00301653), so it would most likely fail G4 alone — the case G-A1 sends to the owner. Listed only as
the frontier-class fallback that, unlike `claude-sonnet-5.5`, can still have reasoning disabled.

### Excluded, with reason

| Model                                           | Reason                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `google/gemini-3.8-flash`, `-3.7-flash`         | `reasoning.mandatory: true` — cannot meet A3                      |
| `anthropic/claude-sonnet-5.5`                   | `reasoning.mandatory: true`; and the 57.6× class of cost          |
| `anthropic/claude-sonnet-5`                     | rejected at 57.6× (`decision.md`); unchanged price 2 / 10         |
| `anthropic/claude-haiku-4.5`                    | hallucinated a finding the diff contradicts, live (`decision.md`) |
| `z-ai/glm-5.x`                                  | glm-5.2 inherited glm-4.6's tool inertia (0/6); same family       |
| `deepseek/deepseek-v4-flash-0731`, `v4.1-flash` | 0/3 live; v4.1 lists efforts `max,high,low` only — no `none`      |
| `~…-latest` aliases                             | moving target; a gate result would not pin what production runs   |

### Full-gate cost estimate

**Method.** The token volume of Novita's measured attempts, re-priced at each candidate's current list prices.
For each attempt: _pessimistic_ = every input token at the prompt price; _optimistic_ = only the largest
request's input uncached, the rest at the cache-read price (prefix caching across loop steps). Fixture rows:
~36 k input / ~6 k output for 12 rows, back-derived from Novita's $0.0328. Grader: promptfoo `llm-rubric` on
`google/gemini-3.1-pro-preview`, measured at **$0.063 per 12 rows** (A3-F1 supplement).

- Volumes (`gate-novita-*.jsonl`): G1 1,619,535 in / 27,127 out over 59 requests; G2 22,160 / 593.
- **Calibration:** the same method gives Novita $0.39–0.95 for G1; the measured figure was **$0.416**, so the
  optimistic bound is the realistic one for a cache-friendly endpoint.

| Candidate                | G1 (#269 × 10) | G2 (clean × 5) | G3/G4 finder (12 rows) | Grader | Total G1–G4    | Per #269 attempt |
| ------------------------ | -------------- | -------------- | ---------------------- | ------ | -------------- | ---------------- |
| `openai/gpt-6-luna`      | $0.06–0.18     | ≤ $0.003       | $0.007                 | $0.063 | **$0.13–0.25** | $0.006–0.018     |
| `qwen/qwen3.8-flash`     | $0.08–0.26     | ≤ $0.004       | $0.008                 | $0.063 | **$0.15–0.33** | $0.008–0.026     |
| `minimax/minimax-m3`     | $0.21–0.52     | ≤ $0.007       | $0.018                 | $0.063 | **$0.29–0.60** | $0.021–0.052     |
| `openai/gpt-6-sol` (ref) | $1.21–3.51     | $0.03–0.05     | $0.13                  | $0.063 | $1.43–3.75     | $0.12–0.35       |

- **G4** (median fixture row ≤ $0.00301653): Luna ≈ $0.0006, Qwen ≈ $0.0007, MiniMax ≈ $0.0015 — all
  comfortably under at Novita's step count; a model that loops all 5 steps on every row roughly doubles that and
  still passes. Sol ≈ $0.011 fails.
- **Hand-read sample of 40:** no API spend (owner + agent time). It requires ≥ 1 valid G1 attempt with
  findings; see the N < 40 caveat below.
- **Caveats:** different tokenizers (±20–30%); a candidate that makes more tool calls than Novita (5–6
  requests per #269 attempt) scales G1 linearly; a 429 attempt costs nothing but fails G1.

## Code References

- `packages/code-reviewer/src/config.ts:14` — `DEFAULT_MODEL = "z-ai/glm-4.6"`; must change with the repo variable
- `packages/code-reviewer/src/config.ts:130` — `DEFAULT_FINDER_PROVIDERS = ["novita"]`
- `packages/code-reviewer/src/config.ts:148-166` — finder routing, unconditional `require_parameters: true`
- `packages/code-reviewer/src/reviewer.ts:262-269` — `reasoning: {enabled: false}` via `extraBody`
- `packages/code-reviewer/src/reviewer.ts:288-294` — no `output`/`response_format`; `maxRetries: 0`; step budget
- `.github/actions/ai-review/action.yml:37,86-89` — `OPENROUTER_REVIEW_MODEL`, `REVIEW_FINDER_MAX_STEPS` (default 5)
- `.github/workflows/review.yml:292` — `review-model: ${{ vars.OPENROUTER_REVIEW_MODEL }}`

## Architecture Insights

- Swapping the model is configuration, not code: `vars.OPENROUTER_REVIEW_MODEL` plus `DEFAULT_MODEL`
  (pinned by a literal test in `config.test.ts`) plus `DEFAULT_FINDER_PROVIDERS`. The gate runner pins the
  endpoint through `OPENROUTER_FINDER_PROVIDERS`.
- The gate's provider check maps slug → reported name (`novita` → `Novita`). New mappings will be needed:
  `openai` → `OpenAI`, `minimax` → `Minimax`, `alibaba` → `Alibaba` (names as listed by the endpoints API).

## Historical Context (from prior changes)

- `context/archive/2026-08-10-finder-tool-loop-evals/decision.md` — six models evaluated, four live-probed;
  only sonnet-5 used out-of-hunk context correctly, at 57.6×. Its follow-up 2 ("re-test when a cheap
  tool-capable model appears") is what this change does.
- `context/archive/2026-09-24-finder-serialization-outage/gate.md` — the protocol to reuse; Novita #269
  $0.040/attempt, ~99 s; 429s on Z.AI (G2 3/5) and DeepInfra (G1 5/10); Phase 4 spend $1.54.
- `context/foundation/lessons.md` — "fixture behaviour does not transfer" (1 of 37 lessons applied to
  `research`; the other applicable one, on ablation, is not relevant here).

## Related Research

- `context/archive/2026-09-24-finder-serialization-outage/hand-read-269.md` — Novita's 50 distinct #269
  findings, the only hand-read material that exists.

## Open Questions

1. **Does `reasoning: {enabled: false}` yield zero reasoning tokens on `gpt-6-luna` and `qwen3.8-flash`?** Both
   default to reasoning on. OpenRouter's reasoning page (fetched 2026-10-02) documents `enabled: true` and the
   `mandatory` flag but **does not say** what `enabled: false` maps to for OpenAI or Qwen. Only a request
   answers it; the first G2 attempt (cheapest, ~$0.0005) is the natural probe.
2. **Does OpenRouter's `uptime_*` include upstream 429s?** The limits page (fetched 2026-10-02) says 429s
   come from OpenRouter or the upstream provider and that provider 429s trigger fallback, but **does not say**
   how pinned (`only`) requests behave or whether uptime counts 429s. Uptime is therefore weak evidence about
   429 risk; endpoint depth is the stronger signal.
3. **N < 40 and small N.** With floor(0.05 × N), any candidate with **N ≤ 19** distinct findings must have
   **zero** rejected. A terse model is held to a stricter bar than a verbose one. This is a property of the
   owner's rule, recorded, not changed.
4. **Novita's annotation vs "unresolved = rejected".** The 2026-10-02 decision counts unresolved as rejected.
   Under that rule Novita's existing read is 10 rejected **plus 40 unresolved** — 50 of 50 — unless a fresh
   read resolves some. The ~0.0003% figure assumes only 10 rejected, so it is an upper bound.
   **Resolved 2026-10-02:** the owner adopted this reading; `change.md` carries the clarification.
5. **G5 cost** (one scratch PR: finder + judge `claude-sonnet-5` + impl review if a plan resolves) was not
   priced from data; ≤ $0.25 is an order-of-magnitude guess from AGENTS.md's measured impl-review $0.20.
