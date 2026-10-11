---
date: 2026-10-10T23:42:32+02:00
researcher: Claude (Opus 5.5) for Piotr-Miller
git_commit: f4936be0ec939d4946acc3554df2a75c63a436b0
branch: feat/finder-verifier-frozen-sonnet
repository: lumina-clean-ai
topic: "Stage 2 of the frozen-findings verifier with anthropic/claude-sonnet-5: budget, harness, reasoning, A2, F2, stage-1 lessons"
tags: [research, finder-verifier-frozen, verifier, sonnet-5, openrouter, budget, harness, pre-registration]
status: complete
last_updated: 2026-10-10
last_updated_by: Claude (Opus 5.5)
---

# Research: Stage 2 of the frozen-findings verifier with sonnet-5

**Date**: 2026-10-10T23:42:32+02:00
**Researcher**: Claude (Opus 5.5) for Piotr-Miller
**Git Commit**: `f4936be` (local, not pushed: no permalinks)
**Branch**: `feat/finder-verifier-frozen-sonnet`
**Repository**: lumina-clean-ai

No paid call was made. The live reads were unauthenticated `GET`s on OpenRouter's public model routes. Docs were read
on 2026-10-10.

## Research Question

What does stage 2 (`change.md`: the same sealed verifier, corpus, arms and criteria as `finder-verifier-frozen`,
with `anthropic/claude-sonnet-5` as the verifier) need, covering at least:

1. the budget and the reserve at sonnet-5 prices, checked live;
2. the stage-1 harness's luna pins, and why stage 2 needs a new harness, pre-registration and seal;
3. assumption A2 (template overhead ≤ 32 tokens per message + 32) on the Anthropic endpoint;
4. whether sonnet-5 reasoning is mandatory, and how `reasoning: {enabled: false}` is enforced;
5. note F2 (the Anthropic pin leaking into other `createReviewer` callers);
6. the stage-1 result and its lessons.

## Summary

- **Prices are confirmed live: $2 / $10 per M** on the `anthropic` endpoint (`provider_name: "Anthropic"`, tag
  `anthropic`). Unchanged since `finder-sonnet` and `finder-sonnet-effort`.
- **The reserve P is about $1.07–1.16 per attempt, not about $0.75.** The $0.72 figure is only P's output term
  (4 × 16,384 tokens × $10/M × 1.10). P also reserves input for the call and for a repair of up to
  B_r = 68,536 bytes, which adds $0.35–0.44 at $2/M. **P exceeds $1.00 for all 114 attempts**, so under the
  sealed formula the stage-1 cap ($1.00 hard, $0.80 stop-and-ask) **admits no attempt at all**, not merely "not the
  whole series".
- **Expected spend is about $1.7–2.7 for 114 attempts (central about $2.2).** It is not 20 × stage 1's $0.045.
  Stage 1 was billed about half its list-price cost through OpenAI's implicit caching. Anthropic gives no discount
  without `cache_control` (`supports_implicit_caching: false`). The Claude tokenizer also counts more tokens.
- **The harness pins `model` and `slug`, and an amendment cannot change them.** `checkSeal` lets an amendment touch
  only the `harness` pin. The model also sits in a hard-coded `VERIFIER` constant and two `"OpenAI"` provider checks.
  Stage 2 therefore needs a new harness copy in this change folder, a new `gate.md` with its own `json pins`, and a
  new seal. Running the archived harness would also write into `context/archive/`, which is forbidden.
- **Reasoning on sonnet-5 is not mandatory, but it is on by default** (adaptive, `high`). OpenRouter says
  `reasoning: {enabled: false}` is accepted on Sonnet 5 and maps to Anthropic's `thinking: {type: "disabled"}`.
  The sealed verifier already sends exactly that for any model. Enforcement needs one more channel:
  `reasoning.encrypted` / redacted thinking is invisible to all of stage 1's checks.
- **A2 has no documented basis for Claude, and none against it.** Anthropic publishes no per-message overhead. Under
  A1's slack it is very likely irrelevant: expected prompt tokens are about 0.4–0.5 of the bound, against 0.28 on
  luna. The after-the-fact detector stays the guarantee, as in stage 1.
- **F2 does not reach stage 2.** The sealed verifier path never calls `createReviewer`. It matters only if code from
  the `finder-sonnet-effort` branch is ever ported.
- **Stage 1 failed both hard criteria** (true class 5/11, code-refutable 1/3). The trigger of decision 5 held:
  luna confirmed G-D13 and G-D14 despite delivered counterevidence. Stage 2 can only test **judgement**. The
  evidence-delivery limits (D2 #4.2, H-R1, H-R3) are properties of the sealed excerpts, and a model change cannot fix
  them.

## Detailed Findings

### 1. Prices, budget and the reserve P

**Live prices** (`GET /api/v1/models/anthropic/claude-sonnet-5/endpoints`, unauthenticated, 2026-10-10T21:35:26Z):

| Tag (slug)                                                      | `provider_name`               | Price per M (in / out) | `reasoning` / `max_tokens` supported |
| --------------------------------------------------------------- | ----------------------------- | ---------------------- | ------------------------------------ |
| `anthropic`                                                     | `Anthropic`                   | $2.00 / $10.00         | yes / yes                            |
| `claude-on-aws`                                                 | Claude Platform on AWS        | $2.00 / $10.00         | yes / yes                            |
| `azure/global`, `google-vertex/global`, `amazon-bedrock/global` | Azure, Google, Amazon Bedrock | $2.00 / $10.00         | yes / yes                            |
| regional (`…/us`, `…/europe`, `eu-west-1`, `us-east-1`)         | Azure, Google, Amazon Bedrock | $2.20 / $11.00         | yes / yes                            |

- No service-tier variant is listed. Stage 1's pre-flight found `openai/flex` and `openai/fast`, which was the
  reason for Amendment 1.
- Cache prices: read $0.20/M, write $2.50/M. They are irrelevant without `cache_control` (§5).

**P, recomputed from stage 1's real request sizes.** The formula is
`harness.mjs:457-465` (archived copy): P = 1.1 × 2 × [(B+256)·p_in + 16,384·p_out + (B_r+256)·p_in + 16,384·p_out],
with B_r = 3,000 + 4 × 16,384 = 68,536 bytes. B comes from the 114 `request` lines of
`context/archive/2026-10-09-finder-verifier-frozen/series-luna.jsonl`: 9,838–31,666 bytes. Every one of those
requests ran first try, with no retry and no repair.

| Quantity                                            | luna ($0.10 / $0.50), recorded | sonnet-5 ($2 / $10), computed |
| --------------------------------------------------- | ------------------------------ | ----------------------------- |
| P per attempt (min–max)                             | $0.0534–0.0582                 | **$1.068–1.164**              |
| of which the output term (4 × 16,384 × p_out × 1.1) | $0.0360                        | $0.7209                       |
| Request-gate bound per request (min–max)            | about $0.010–0.012             | **$0.202–0.250**              |
| Attempts with P > $1.00                             | 0                              | **114 of 114**                |

- Check against the record: the computed luna P for the first attempt (B = 11,079) is $0.05367, against $0.053711
  recorded.
- **Consequence:** with `CAP_HARD = 1.0` (`harness.mjs:374`) and admission T + P ≤ cap, no stage-2 attempt starts.
  Admission also wastes up to $1.16 of headroom at the end of a series: it stops once T > cap − P.

**Expected spend for 114 attempts.** Luna's tokens from the same file were 654,426 prompt and 36,850 completion
(maximum 590 out per request).

| Assumption                                                         | sonnet-5 cost |
| ------------------------------------------------------------------ | ------------- |
| luna's token counts, no cache                                      | $1.68         |
| Claude tokenizer +30% on input and output (Anthropic's figure, §4) | $2.18         |
| +30% input, 2× output (longer reasons)                             | about $2.4    |
| +50% input, 2× output                                              | about $2.7    |

- Stage 1 settled at **$0.045438**, but its list-price cost was about $0.084. The difference is OpenAI's implicit
  caching ($0.01/M cache reads).
- "20 × stage 1" ($0.91) would therefore understate stage 2 by about half. The earlier projection,
  `context/archive/2026-10-09-finder-verifier-frozen/research.md:275` ("sonnet-5 … ≈ $2.2"), agrees with the central
  estimate.
- **Credit:** after stage 1 the account had $60 total and about $54.605 used, so about **$5.39** was left. That is
  the last recorded value (`gate.md` § Ledger), **not re-read**: the authenticated `GET /api/v1/credits` belongs in
  the pre-flight.

**Budget options for the owner** (numbers are from the table above; the decision is the owner's):

| Option                                                            | Cap needed to finish an about-$2.7 series | Notes                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Keep the sealed P, raise the cap                              | about $3.9 (ask) / about $4.5 (hard)      | Same instrument as stage 1. Admission keeps an unusable $1.16 headroom. It fits the about $5.39 credit with little margin.                                                                                                                                            |
| (b) Redefine P as the first call's bound (≤ $0.25), raise the cap | about $3.0 (ask) / about $3.5 (hard)      | **The Request gate stays the proof of the cap** (gate.md §6, "P is not the proof of the cap; the Request gate is"). Cost: an attempt that needs a repair near the cap is `budget-stopped` and scored as not met. Stage 1 had 0 repairs and 0 retries in 114 attempts. |
| (c) Lower `max_tokens`                                            | —                                         | **Not available.** `MAX_OUTPUT_TOKENS = 16_384` is hard-coded in sealed `9c85aa2:packages/code-reviewer/src/config.ts:66`. Changing it changes the instrument and breaks comparability with stage 1.                                                                  |
| (d) Fewer repeats or arms                                         | lower                                     | Changes the design of §4/§7. The criteria (3/3 base) need all 3 repeats, and arm O is the diagnostic that separates judgement from evidence delivery.                                                                                                                 |

### 2. The harness: luna pins and why stage 2 needs a new version, pre-registration and seal

Luna- and OpenAI-specific places in `context/archive/2026-10-09-finder-verifier-frozen/harness.mjs` (Amendment-1
version, sha256 `ea7a3977…`):

| Where                                                          | What                                                                                                      | Stage 2                                                                                                                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `:68`                                                          | `const VERIFIER = { model: "openai/gpt-6-luna", slug: "openai" };`                                        | `anthropic/claude-sonnet-5` / `anthropic`                                                                                                                                                                          |
| `:358-370`                                                     | `PINS` with `model: VERIFIER.model, slug: VERIFIER.slug`                                                  | new values. Every other pin (`sealCommit`, `srcTree`, `gateCore`, `corpus`, `diffs`, `evid`, `class`, `compound`, `rationale`) stays identical: that is the "same verifier, corpus, arms, criteria" of `change.md` |
| `:371`                                                         | `ROUTING = { order: [slug], only: [slug], allow_fallbacks: true, require_parameters: true }`              | follows from `:68` (§5)                                                                                                                                                                                            |
| `:497`, `:507`                                                 | `if (r.provider !== "OpenAI")` (wire) and `if (s.provider !== "OpenAI")` (SDK step)                       | `"Anthropic"`, best derived from the sealed `ENDPOINT_NAMES` (`9c85aa2:packages/code-reviewer/scripts/finder-gate-core.mjs:38`, `anthropic: "Anthropic"`)                                                          |
| `:595-598`                                                     | reasoning on the wire: `completion_tokens_details.reasoning_tokens` and `message.reasoning` (string only) | add `message.reasoning_details` (§4)                                                                                                                                                                               |
| `:603-604`, `:1103-1117`                                       | Amendment 1: `generationId`, `serviceTier`                                                                | keep (cheap audit trail). Whether OpenRouter returns `service_tier` for Anthropic is unknown; a null is reported as `undetermined`                                                                                 |
| `:374`, `:828-830`                                             | `CAP_HARD = 1.0`                                                                                          | owner decision (§1)                                                                                                                                                                                                |
| `:448-470`                                                     | Request gate (A1–A3), P, E                                                                                | A1/A2 restated for Claude (§3). E's "60 output tokens per finding" was calibrated on luna                                                                                                                          |
| `:23`, gate.md:102                                             | usage comment and invocation point to `context/changes/finder-verifier-frozen/series-luna.jsonl`          | `context/changes/finder-verifier-frozen-sonnet/series-sonnet.jsonl`                                                                                                                                                |
| `:831-835`                                                     | the series must live beside the harness, and `gate.md` is read from `join(HERE, "gate.md")`               | **the archived copy cannot run stage 2** without writing into `context/archive/` (AGENTS.md hard rule)                                                                                                             |
| `:1432`, `:1470-1473`, `:1546`, `:1846`, `:2388-2425`, `:1536` | dry-run and self-test stubs with `provider: "OpenAI"`, `serviceTier: "default"`, `PRICES = {0.1, 0.5}`    | move to `"Anthropic"`. Consider realistic test prices, so the budget cases exercise P > cap                                                                                                                        |

**Why an amendment cannot do it.**

- `checkSeal` (`harness.mjs:731-766`) requires the sealed section's hash to match the record, and the `json pins` to
  equal `{ ...PINS, harness: HARNESS_SHA256 }` key by key.
- An amendment may change **only** `harness` and must name the pin it supersedes (`:796-801`).
- `run` always checks the seal (`:835`).
- A resume is refused when the PINS, harness, repeats, runs or arms differ from the series header (`:864-869`).
- The stage-1 gate states the same rule (`gate.md` §12: "A change to the model … after a result has been seen needs
  a new pre-registered change"), and so does decision 4.7 (`context/archive/2026-10-09-finder-verifier-frozen/change.md:117`).

**Sealed code is model-neutral** (`9c85aa2:packages/code-reviewer/src`):

- The model and routing are passed by the harness through `VerifierOptions` (`harness.mjs:623`, `:658-662`). They
  win over the defaults (`verifier.ts:162`, `config.ts:38`, `config.ts:187`).
- `reasoning: {enabled: false}` is hard-coded in `verifier.ts:161` as `extraBody`. It is spread last by
  `@openrouter/ai-sdk-provider@3.0.0`, so it goes out unchanged for any model.
- `max_tokens` 16,384 (`config.ts:66`) and the 120 s timeout (`pipeline.ts:90`) are sealed.
- None of the sealed code uses `reasoning_effort`, `service_tier`, `response_format`, tools or `temperature`.
- The sealed code anticipated a sonnet arm: `config.ts:15` `DEFAULT_JUDGE_MODEL = "anthropic/claude-sonnet-5"`, and
  `verifier.ts:24` "MAIN = the judge's".

**The scratch worktree is fragile.** `git worktree list` shows the `9c85aa2` worktree in **another session's
scratchpad** (`/tmp/claude-1000/…/789990f8-…/scratchpad/fv-seal`). It can disappear. The dependencies are not
pinned by the harness: `package.json` allows `^3.0.0` / `^7.0.52`, and only the lockfile plus `npm ci` give
`@openrouter/ai-sdk-provider` 3.0.0 and `ai` 7.0.52. Stage 2 should re-create it in a stable place and check
`npm ci` was used.

### 3. Assumption A2 on the Anthropic endpoint

- **Stage 1's basis is OpenAI-specific.** A1 rests on "a byte-level BPE token never covers less than one byte" and A2
  on OpenAI's cookbook (`gate.md` §6, Request gate row). Neither transfers to Claude by citation.
- **What Anthropic documents** (platform.claude.com, read 2026-10-10):
  - No per-message or system-prompt overhead without tools: "If no `tools` are provided, then a tool choice of `none`
    uses 0 additional system prompt tokens" (`about-claude/pricing.md`).
  - Counts "may include tokens added automatically by Anthropic for system optimizations. You are not billed for
    system-added tokens" (`build-with-claude/token-counting.md`).
  - The newer tokenizer: "The same input text produces approximately 30 percent more tokens than on earlier models"
    (same page; it applies to Claude 4.7 and later).
  - The only worked size example: system "You are a scientist" plus user "Hello, Claude" → `input_tokens: 14`, about
    6 tokens over the text, on Opus 5.5. It fits A2, but it is one example on another model.
- **OpenRouter** counts "using the model's native tokenizer" (`cookbook/administration/usage-accounting.md`).
- **Local evidence (inference).**
  - No sonnet record pairs request bytes with `prompt_tokens`.
  - From `finder-sonnet-effort`, the step-1 difference between #269 and #247 (about 54,274 bytes of diff, 24,186
    tokens) gives about **2.24 bytes per token**, a lower bound on diff text.
  - Applied to stage 1's bodies, sonnet prompt tokens land at about 0.45 of `b + 32·m + 32`, against 0.281 on luna.
  - A1 (≥ 1 byte per token) leaves thousands of tokens of slack, so A2 would have to be off by orders of magnitude to
    matter.
- **Conclusion:** A2 stays an **assumption with no published guarantee**, worded for Anthropic. The harness's
  after-the-fact detector (`prompt_tokens > b + 32·m + 32` → condition violation, `harness.mjs:501`) stays the
  enforcement. A paid probe to measure it is possible (one request) but not necessary. Whether to run one is the
  owner's call.

### 4. Reasoning on sonnet-5: mandatory, and how to enforce "off"

**Live metadata** (`GET /api/v1/models`, 2026-10-10):

- `anthropic/claude-sonnet-5`: `"reasoning": {"mandatory": false, "default_enabled": true, "supported_efforts": ["max","xhigh","high","medium","low"], "default_effort": "high"}`.
- Unlike luna, `none` is not in `supported_efforts`.
- `sonnet-5.5` is `mandatory: true`. This matters if anyone substitutes it.

**Docs:**

- OpenRouter: "Reasoning is on by default on Sonnet 5: requests that don't configure `reasoning` run with adaptive
  thinking enabled. Disable it explicitly with `reasoning: { "enabled": false }`" (`cookbook/evaluate-and-optimize/model-migrations/sonnet-5.md`).
- "Sonnet 5 accepted `reasoning: {"enabled": false}`. On Sonnet 5.5, OpenRouter returns a 400" (`…/claude-5-5.md`).
- Mapping: `thinking: { type: "disabled" }` ↔ `reasoning: { enabled: false }` (`guides/best-practices/reasoning-tokens.md`).
- Anthropic's per-model table, Sonnet 5 row: "… | Thinking off" for `disabled`, with no effort restriction. The
  `≤ high` restriction is stated for Opus 5 and Haiku 5.5 only (`build-with-claude/thinking.md`).

**History:**

- **No archive records sonnet-5 run with reasoning off.**
  - `finder-sonnet` used the default (adaptive `high`).
  - `finder-sonnet-effort` used `reasoning: {effort: low|medium}`, with 0–7,538 reasoning tokens per step and one
    natural 0 (`context/archive/2026-10-06-finder-sonnet-effort/gate.md:505`).
  - `finder-verification`'s MAIN arm (sonnet, `enabled: false`) was declined before any call
    (`context/archive/2026-10-03-finder-verification/gate.md:740-750`).
- A natural 0 under adaptive thinking means **a 0 does not prove "off" was honoured**. The request record proves what
  was sent; the response channels prove what came back.

**Enforcement gap (confirmed in code).**

- Stage 1 treats reasoning on any of three channels as a condition violation:
  - SDK `reasoningTokens`;
  - OpenRouter `completionTokensDetails.reasoningTokens`;
  - reasoning text length (`finder-gate-core.mjs:377-415`, `harness.mjs:595-598`).
- In `@openrouter/ai-sdk-provider@3.0.0` (`dist/index.js:3718-3762`), **`reasoning.encrypted` is dropped**, and
  `message.reasoning` is used only when `reasoning_details` is empty.
- Anthropic: "A `redacted_thinking` block contains encrypted thinking content in a `data` field, with no readable
  text" (`thinking.md`).
- Anthropic's native display default on Sonnet 5 is `"omitted"`, an empty `thinking` field. OpenRouter overrides it to
  summarized (`reasoning-tokens.md`).
- So a response whose only thinking is redacted, with `reasoning_tokens` unreported, passes all of stage 1's checks.
- **Fix inside the new harness, sealed code untouched:** treat a non-empty `message.reasoning_details` (any type,
  `reasoning.encrypted` included) on the wire as a condition violation. Optionally also check
  `step.providerMetadata.openrouter.reasoning_details`. Add a self-test case for it.

### 5. Routing, provider identity, caching

- **Routing.** The base-slug rule: a base slug "matches all endpoints for that provider, including any variants or
  regions", and "service tier endpoints … are not matched by base slugs" (`guides/routing/provider-selection.md`).
  - "Claude Platform on AWS" is its own slug (`claude-on-aws`), so `only: ["anthropic"]` excludes it, along with
    Bedrock, Vertex and Azure. That is a reading of the rule against the live tags; no sentence names the pair.
  - The sealed `allow_fallbacks: true` under `only` stays inside `only`.
  - All 15 recorded sonnet finder steps were served by `Anthropic`.
- **Provider identity.**
  - The `ChatResult` schema does not document a top-level `provider` field. Stage 1's wire check read one and it was
    present. The documented sources are `GET /api/v1/generation?id=…` (`provider_name`) and the opt-in
    `X-OpenRouter-Metadata: enabled` header.
  - The pre-flight should confirm the wire field on the first response, or the harness should fall back to the
    generation record.
- **Caching.**
  - OpenRouter: Anthropic needs per-message opt-in, and even "automatic caching" means a top-level `cache_control`
    (`guides/best-practices/prompt-caching.md`). The endpoints report `supports_implicit_caching: false`.
  - All recorded sonnet costs match list price exactly (`finder-sonnet-effort`, `finder-sonnet/gate.md:404`).
  - Adding `cache_control` would change the request shape relative to the sealed verifier, so it is not an option
    without touching sealed code.

### 6. Note F2

- Verbatim (`context/archive/2026-10-09-finder-failure-scenario/change.md:66-67`): "**F2** — the finder's Anthropic
  pin re-routes every other `createReviewer` caller (evals, `demo.ts`, `finder-distribution.mjs`); confine it to the
  CLI/pipeline path before merging."
- The pin is `src/reviewer.ts:218` on the `finder-sonnet-effort` branch
  (`context/archive/2026-10-06-finder-sonnet-effort/gate.md:616-637`).
- **It does not reach stage 2.**
  - In sealed `9c85aa2`, `"anthropic"` appears in `src` only in tests (`config.test.ts:192`, `verifier.test.ts:307`),
    and `resolveFinderProviderRouting` defaults to `["novita"]` (`config.ts:139`).
  - The harness imports only `runVerificationPass` and `createVerifier` (`harness.mjs:87-88`) and always passes
    `providerRouting: ROUTING` (`:623`).
  - F2 and F4 matter only if sonnet code from that branch is ported to the production pipeline. That is outside this
    change.

### 7. Stage-1 result and its lessons

- **Result** (`context/archive/2026-10-09-finder-verifier-frozen/gate.md` § Hand-read and final result):
  - True class: **FAIL, 5 of 11**. It survives on D2 #1.2, #2.1, #5.1, #6.3 and #8.2. Evidence-delivery limit: D2
    #4.2, H-R1, H-R3. Investigate: D2 #3.2, #7.1 (2/3) and H-R5 (0/3 both arms, `unsupported`).
  - Code-refutable: **FAIL, 1 of 3**. G-D20 3/3 (automatic and hand-read). G-D13 and G-D14 were confirmed and
    published in every repeat of both arms, with G-D13's refuting guard (`contact-sheet.py:208–211`) delivered in
    both arms.
  - Reliability: 114/114 `ok`, tier `default` on every request, T $0.045438 of $0.80.
- **What stage 2 can and cannot show.**
  - It can show whether a stronger judge refutes G-D13/G-D14 and keeps D2 #3.2/#7.1, the judgement failures.
  - Decision 5 (`change.md:39-41`): "if the limit is in the excerpts, a different model does not fix evidence
    delivery." Base-arm failures on D2 #4.2, H-R1 and H-R3 are expected to persist whatever the model. Arm O stays
    diagnostic only.
  - H-R5's `unsupported` cites a fact outside the code (the API page cap). That is the instruction's own case, not a
    model error.
- **Lessons to carry into the new harness and gate:**
  1. **T0 read time.** `t0At` in the series header was the header's creation time, not the T0 read
     (`gate.md:403-407`; `reviews/impl-review-e0d2d19.md:126`): "a future harness should carry the read time
     explicitly".
  2. **Endpoint variants.** Re-read the endpoint list at pre-flight and keep the per-response
     `generationId`/`serviceTier` recording (Amendment 1). None is listed for sonnet today.
  3. **Counter lag.** The key counter lags; carry T as max(counter, recorded). Stage 1's end read under-reported by
     about $0.003. In `finder-sonnet-effort` every first reconcile was still unsettled after 180 s.
  4. **Headroom** observed on luna (0.281 prompt, 0.112 cost) is "observed checks of A1–A3, not a general provider
     guarantee" (`impl-review-e0d2d19.md:82`). For sonnet the cost headroom will be similar: the output reserve
     dominates.
  5. **Seal hygiene against rebase-merge.** The stage-1 seal and Amendment-1 commits were rewritten by the
     rebase-merge of #287. The annotated tags (`finder-verifier-frozen/seal`, `…/amendment-1`) keep them reachable.
     Stage 2 should tag its seal the same way, and write any `archive_commit` only after the merge (see #288).
  6. **Lesson ledger** (`context/foundation/lessons.md`, 1 of 38 entries applies to `research`: "ablate from the
     artifact that reproduces"). Stage 2 is in line with it: it starts from the reproducing artifact (the frozen
     findings that luna mis-judged) and changes exactly one property, the model.

## Code References

- `context/archive/2026-10-09-finder-verifier-frozen/harness.mjs:68`: the `VERIFIER` model/slug constant
- `context/archive/2026-10-09-finder-verifier-frozen/harness.mjs:358-371`: `PINS` and `ROUTING`
- `context/archive/2026-10-09-finder-verifier-frozen/harness.mjs:374`: `CAP_HARD = 1.0`
- `context/archive/2026-10-09-finder-verifier-frozen/harness.mjs:448-470`: the Request-gate bound, P, E
- `context/archive/2026-10-09-finder-verifier-frozen/harness.mjs:497`, `:507`: the `"OpenAI"` provider checks
- `context/archive/2026-10-09-finder-verifier-frozen/harness.mjs:595-604`: reasoning and service-tier capture on the wire
- `context/archive/2026-10-09-finder-verifier-frozen/harness.mjs:731-805`: `checkSeal` and the amendment chain (amendments may change only `harness`)
- `context/archive/2026-10-09-finder-verifier-frozen/harness.mjs:831-869`: series location, seal check on `run`, resume refusal
- `9c85aa2:packages/code-reviewer/src/verifier.ts:158-172`: the verifier model construction (`reasoning: {enabled: false}` in `extraBody`, routing, `maxOutputTokens`)
- `9c85aa2:packages/code-reviewer/src/config.ts:66`: `MAX_OUTPUT_TOKENS = 16_384`
- `9c85aa2:packages/code-reviewer/scripts/finder-gate-core.mjs:38`, `:377-415`: `ENDPOINT_NAMES` and the reasoning channels
- `context/archive/2026-10-09-finder-verifier-frozen/gate.md:121-141`: §6 definitions (P, the Request gate, A1–A3, Cap)
- `context/archive/2026-10-09-finder-verifier-frozen/series-luna.jsonl`: stage 1's 114 request sizes and token counts used for the budget

## Architecture Insights

- **The cap's guarantee is the Request gate, not P.** P is an admission heuristic sized for luna, where its
  conservatism cost nothing. At 20× the price it is the binding constraint. A new pre-registration can redefine
  admission without weakening the cap proof.
- **What the experiment holds fixed lives in two places.** The sealed `src` tree holds the request shape (reasoning
  off, `max_tokens`, timeout, retry/repair). The harness holds the target (model, slug, provider identity) and the
  accounting. Stage 2 changes only the second, which is why the pins other than `model`, `slug` and `harness` can be
  carried over byte for byte.
- **Detection channels are provider-shaped.** The reasoning and provider checks were written against what OpenAI
  returns. Anthropic's thinking has an encrypted form the SDK silently drops, so the harness, which already wraps
  `fetch`, has to read the raw wire for it.

## Historical Context (from prior changes)

- `context/archive/2026-10-09-finder-verifier-frozen/change.md:39-41`, `:117`: decision 5 (luna first, sonnet only as
  a second stage) and decision 4.7 (stage 2 as a new, separately pre-registered change)
- `context/archive/2026-10-09-finder-verifier-frozen/research.md:275`: the earlier sonnet projection, about $2.2 for 19 × 3
- `context/archive/2026-10-03-finder-verification/gate.md:195`, `:740-750`: the never-run MAIN arm (sonnet, `enabled: false`). Its pessimistic total of $2.25 did not fit $2.00
- `context/archive/2026-10-05-finder-sonnet/research.md:121-154`: sonnet-5 prices, caching and the docs on disabling adaptive thinking
- `context/archive/2026-10-06-finder-sonnet-effort/gate.md:90-131`, `:459-505`, `:616-637`: the effort runs, reasoning tokens per step, and the carry-forward with F2/F4
- `context/archive/2026-10-09-finder-failure-scenario/change.md:66-69`: F2 and F4 verbatim

## Related Research

- `context/archive/2026-10-09-finder-verifier-frozen/research.md`: stage 1's research (sealed verifier, corpus, arms, budget design)
- `context/archive/2026-10-05-finder-sonnet/research.md`: sonnet-5 as a finder (prices, routing, reasoning)
- `context/archive/2026-10-03-finder-verification/research.md`: the verifier's design

No companion files were written.

## Open Questions

1. **Budget (owner).** Which option of §1: keep P and raise the cap to about $4–4.5, or redefine admission and use
   about $3–3.5? Is about $2.2 expected (up to $2.7) acceptable against about $5.39 of credit? The credit needs an
   authenticated re-read at pre-flight.
2. **Is `enabled: false` honoured on the wire?** The docs say yes. No local record shows a sonnet response with
   reasoning off. The first paid request answers it, and the new `reasoning_details` check enforces it from then on.
   A one-request probe before the series is possible, and it is the owner's call.
3. **Top-level `provider` in the response** for Anthropic: undocumented, so confirm on the first response or fall back
   to `/generation`.
4. **`service_tier` for Anthropic**: whether OpenRouter returns it at all. A null is reported as `undetermined`, not a
   violation.
5. **A2 wording for Claude.** Keep "≤ 32 per message + 32" as an assumption with no published guarantee, relying on
   A1's slack and the detector, or measure it with one paid request.
6. **Model lifecycle.** Anthropic lists Sonnet 5 as "**Legacy.** Released June 30, 2026"
   (`models/sonnet-5/overview.md`). No deprecation date was found. A retirement between seal and series would be a
   stop condition worth naming in the new §10.
7. **Conflicting docs on sampling.** OpenRouter says non-default `temperature`/`top_p` are "silently ignored", while
   Anthropic returns 400. The sealed verifier sends none, so this is moot unless that changes.
