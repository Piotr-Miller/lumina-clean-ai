# Research: finder-glm-5-3-high

2026-10-16. No codebase research was run for this change; the blocking question was external.
Spikes below.

## Spike: Is `reasoning.effort: "high"` a distinct level for `z-ai/glm-5.3` served by Z.AI through OpenRouter — documented as one, and between `low` and `max` in reasoning tokens on the same request? (2026-10-16, 17:51 UTC)

Ran from this repository at `ac6bbb1` (branch `feat/finder-glm-5-3-high`) against OpenRouter's public model API,
OpenRouter's, Z.AI's and Together's documentation, and 8 paid requests to `z-ai/glm-5.3` pinned to Z.AI.

**What the previous source said.**

- `context/archive/2026-10-11-finder-glm-5-3/research.md:224` — "`z-ai/glm-5.3`: `reasoning: {mandatory: true,
default_enabled: true, supported_efforts: ["max","high","low"], default_effort: "max"}` — there is no `medium`, and
  reasoning cannot be turned off." (2026-10-11).
- `context/archive/2026-10-11-finder-glm-5-3/glm-screening-results.md:31` labels pass A "glm-5.3, `enabled: true`
  (`max`)", and `:57` reads "The `max` default spent up to ~8,800 reasoning tokens per call and exceeded the 300 s
  budget." (2026-10-11).
- No prior claim about what `high` does was found in `context/changes/`, `context/archive/` or `context/foundation/`.
  Every measured glm-5.3 request so far was `low`, `{enabled: true}` or no `reasoning` key.

**Documentary half.**

- **OpenRouter still lists three efforts, default `max`** — `"reasoning": {"mandatory": true, "default_enabled":
true, "supported_efforts": ["max", "high", "low"], "default_effort": "max"}` for `z-ai/glm-5.3`
  (https://openrouter.ai/api/v1/models, read 2026-10-16T17:51:07Z). Unchanged since 2026-10-11.
- **All three routed providers accept the effort parameter** — the Z.AI endpoint (`z-ai/fp8`, $1.40/M in, $4.40/M
  out, `max_completion_tokens` 131072), Fireworks (`fireworks`) and Together (`together`) each list `"reasoning"`
  and `"reasoning_effort"` in `supported_parameters` (https://openrouter.ai/api/v1/models/z-ai/glm-5.3/endpoints,
  read 2026-10-16T17:51:01Z; 46 endpoints, 40 on 2026-10-11).
- **Z.AI documents `high` as its own level** — "`reasoning_effort` | `low`, `high`, `max` | `max` | `low` –
  Lightweight Reasoning; `high` – Enhanced Reasoning; `max` – Deep Reasoning"
  (https://docs.z.ai/guides/llm/glm-5.3, read 2026-10-16).
- **Z.AI's only volume figures are per agentic task, not per request** — "At Max effort, GLM-5.3 reaches 34.5% at
  roughly 75K output tokens per task" and "At High effort, GLM-5.3 reaches 31.4% at around 50K output tokens"
  (https://docs.z.ai/guides/llm/glm-5.3, read 2026-10-16). The page gives no figure for `low`.
- **Z.AI's API reference restricts GLM-5.3 to those three** — "For the `GLM-5.3` `GLM-5.3-FLASH` model, only the
  `low` / `high` / `max` levels are supported." (https://docs.z.ai/api-reference/llm/chat-completion, read
  2026-10-16). It documents value mapping only for GLM-5.2; what GLM-5.3 does with another value, the
  documentation does not say.
- **OpenRouter maps an unsupported effort to the nearest one** — "If a model doesn't support a specific effort
  level (for example, if a model only supports `low` and `high`), OpenRouter will map your requested effort to the
  nearest supported level." (https://openrouter.ai/docs/guides/best-practices/reasoning-tokens, read 2026-10-16;
  `/docs/use-cases/reasoning-tokens` redirects there).
- **OpenRouter's page contradicts itself on `{enabled: true}`** — "`"enabled": true` - Enables reasoning at the
  "medium" effort level with no exclusions." versus "`thinking: { type: "adaptive" }` without an
  `output_config.effort` leaves the effort to the model. … other models use their default reasoning effort, which
  the models endpoint reports as `reasoning.default_effort`", where the same page's table maps `adaptive` to
  `reasoning: { enabled: true }` (same URL, read 2026-10-16). The page does not mention Z.AI or GLM.
- **Together, a fallback provider, disagrees with Z.AI on the value set** — "`reasoning_effort` accepts `"low"`,
  `"medium"`, `"high"`, and `"max"`." and "The levels are coarse dials rather than a strictly monotonic scale, so
  measure token counts on your own prompts before you tune. Invalid effort strings are accepted silently instead
  of returning an error" (https://docs.together.ai/docs/glm-5.3-quickstart, read 2026-10-16).

**Empirical half.**

One fixed request: the finder's real finalization request, built by `buildFinalizationInstructions("general",
{gatheredContext: false})` and `buildFinalizationPrompt` over `packages/code-reviewer/evals/fixtures/react-migration.diff`
(sha256 `7f4a7372968f440043596333a873ab05526af1f09da104e03d7f790702fa0fa0`) with an empty transcript, no tools, at `ac6bbb1` — 1,679 prompt tokens. The only
difference between arms is `reasoning`. Four arms per round, sent concurrently; two rounds. The key in
`packages/code-reviewer/.env` was used; its value is recorded nowhere.

```
npx tsx build-prompt.ts evals/fixtures/react-migration.diff prompt.json
python3 -I effort-probe.py prompt.json probe.jsonl 1   # 17:53:28Z
python3 -I effort-probe.py prompt.json probe.jsonl 2   # 17:54:55Z

# body of each request (POST https://openrouter.ai/api/v1/chat/completions):
{"model": "z-ai/glm-5.3", "messages": [system, user], "max_tokens": 16384,
 "reasoning": <arm>, "provider": {"only": ["z-ai"], "allow_fallbacks": false}, "usage": {"include": true}}
# arms: low = {"enabled": true, "effort": "low"}, high = {"enabled": true, "effort": "high"},
#       max = {"enabled": true, "effort": "max"}, enabled-only = {"enabled": true}
```

| Round | Arm          | Status | Provider | Finish | Completion | Reasoning | Latency | Cost      |
| ----- | ------------ | ------ | -------- | ------ | ---------- | --------- | ------- | --------- |
| 1     | low          | 200    | Z.AI     | stop   | 771        | 327       | 11.3 s  | $0.005743 |
| 1     | high         | 200    | Z.AI     | stop   | 1,719      | 1,238     | 20.7 s  | $0.009914 |
| 1     | max          | 200    | Z.AI     | stop   | 7,554      | 6,869     | 75.9 s  | $0.035588 |
| 1     | enabled-only | 200    | Z.AI     | stop   | 7,196      | 6,571     | 77.2 s  | $0.034013 |
| 2     | low          | 200    | Z.AI     | stop   | 616        | 316       | 9.0 s   | $0.005061 |
| 2     | high         | 200    | Z.AI     | stop   | 1,347      | 842       | 16.0 s  | $0.008277 |
| 2     | max          | 200    | Z.AI     | length | 16,384     | 16,362    | 131.9 s | $0.072543 |
| 2     | enabled-only | 200    | Z.AI     | stop   | 7,437      | 6,781     | 78.4 s  | $0.033176 |

Reasoning is `usage.completion_tokens_details.reasoning_tokens`; cost is `usage.cost`; latency is wall time to the
full (non-streamed) response. Every response reported the model `z-ai/glm-5.3`.

- **`high` sat between `low` and `max` in both rounds:** 1,238 and 842 reasoning tokens, against 327 and 316 at
  `low` (2.7–3.8× per round) and 6,869 and 16,362 at `max` (5.5× and ≥ 19.4× per round).
- **Latency and cost followed:** `high` took 16.0–20.7 s and cost $0.008277–0.009914 (1.6–1.7× `low` per round);
  `low` took 9.0–11.3 s; `max` took 75.9–131.9 s.
- **One `max` request used the whole 16,384-token budget on reasoning:** `finish=length`, 16,362 reasoning tokens
  and empty content (0 characters).
- **`{enabled: true}` with no effort behaved at `max`'s scale, not `high`'s:** 6,571 and 6,781 reasoning tokens,
  77.2 and 78.4 s. This is consistent with `glm-screening-results.md:31`, which labels pass A `max`. It does not fit
  the "medium" sentence unless OpenRouter maps medium to `max`. Two samples cannot show that this arm is identical
  to `max`.
- **Spend:** $0.204316 reported across the 8 responses. The key counter still read usage $58.982082 (+$0.000000
  against the pre-spike read at 17:52:43Z) at 17:57:23Z, a known lag, so the reported total is the carried figure.
- **Raw files, outside git:** in `~/.cache/finder-glm-5-3-high/spike-effort/`. Their sha256:
  - `effort-probe.py` `7f1fd6f1d697daad3712fde374dbf8fd8f31b731c49e3aeeb314c387411d1057`;
  - `build-prompt.ts` `0a5a78db210a7902fb6daa4c0059225d25c6c0df45f0ecb0bdff480b526b8ae5`;
  - `prompt.json` `1b415f8601600480e49a7ff32dd0469266973fadcc9f5e34f781c851e3dd1036` (the request text, no key);
  - `probe.jsonl` `37877c510c37397173700178985fcacbab897d1d5a6367083e289b5def7d8481` (metadata only, no message
    text);
  - `glm53-endpoints.json` `d90aaf85b1311a070c4aac8aa4af5d3f1f2cbb7170bc6c3b61c973e0e0aa9db2`.

**Not yet checked:**

- **Fireworks and Together at `high`.** Both are in the finder's routing list, and all 8 requests were pinned to
  Z.AI. Together's own page claims a `medium` level and silent acceptance of invalid values.
- **Whether OpenRouter forwards `high` to Z.AI verbatim** as `reasoning_effort: "high"`. The forwarded body is not
  visible; only the distinct volume points to it.
- **A tool-enabled loop step and a whole multi-request finder run at `high`.** This was one finalization request
  with no tools. Run latency against the 300 s budget and cost per row are the change's fixture screening.
- **A #269-size input.** The #269 diff is about 65 KB; this prompt was 1,679 tokens.
- **Variance.** There were n = 2 per arm, and `high` already ranged from 842 to 1,238 reasoning tokens.
- **Settlement.** The key counter needs a re-read once it catches up. The generation records also need a
  re-read: `/api/v1/generation` returned no data for the four `high` and `max` ids at about 17:57Z.
- **Fireworks' documentation.** It was not read.

**What this settles:** `high` is a real, separate level for glm-5.3 on Z.AI and not another name for `max`. On the
same finder finalization request it used about 3× `low`'s reasoning tokens and under a fifth of `max`'s, in
about 16–21 s. The slice does not die on "`high` = `max`". That unblocks the change's fixture screening at `high`
(run latency against the 300 s budget, cost per row against the cost headroom).
