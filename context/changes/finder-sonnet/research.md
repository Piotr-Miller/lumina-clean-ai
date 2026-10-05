---
date: 2026-10-05T21:18:28+02:00
researcher: Claude (rune-research)
git_commit: 7c645946f5569753819c3af47a23940862007584
branch: feat/finder-sonnet
repository: lumina-clean-ai
topic: "finder-sonnet: anthropic/claude-sonnet-5 as the production finder — base, routing, model setting, cost"
tags: [research, codebase, code-reviewer, finder, openrouter, anthropic, ai-review, cost]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (rune-research)
---

# Research: finder-sonnet — sonnet-5 as the production finder

**Date**: 2026-10-05T21:18:28+02:00
**Researcher**: Claude (rune-research)
**Git Commit**: `7c64594` (= `origin/master`)
**Branch**: `feat/finder-sonnet`
**Repository**: lumina-clean-ai

## Research Question

`change.md` § Notes, point 3, asks three open questions, and the owner asked for external research too:

1. **Base branch.** What from `feat/finder-serialization-outage` and `feat/finder-verification` does a sonnet-5
   finder need, and how is it brought over?
2. **Routing.** Do structured output and the tool loop work for sonnet-5 on the `anthropic` endpoint today?
   Verify it; do not assume it from August.
3. **How the model is set.** `OPENROUTER_REVIEW_MODEL` vs `DEFAULT_MODEL`.

Point 4 adds a cost gate (≤ $10/month at recent PR volume), which this research also prepares.

**Method.** Three parallel read-only investigations, each covering one area:

- the code on `master` and on the three branches;
- the archived changes, plus PR volume via `gh`;
- the external sources: OpenRouter's public JSON API and docs, Anthropic's docs, the installed AI SDK source, and
  GitHub issues.

No paid or authenticated model call was made. One conflict between the investigations was settled by hand (see
§2.3).

**Lessons ledger:** 1 of 37 entries applies to `research` ("A fixture that fails to reproduce a live defect is
evidence about the fixture"). The finder-related entries that apply to `plan` and `implement` are listed in §5.

## Summary

- **Master can run sonnet-5 as the finder today, with no code from the three branches.** Master has a single
  `ToolLoopAgent` with a strict `json_schema` `response_format`, `require_parameters: true`, a tool-less final
  step, `withOneRetry` and an output-repair layer. That is exactly the path that ran sonnet-5 as finder in August:
  12/12 fixture rows and the only live catch of the out-of-hunk defect. The judge runs on sonnet-5 in production on
  the same path.
- **The outage branch is not needed for an Anthropic finder, and part of it would break one.**
  - The two-stage finder (`802a1e0`, `15b3f71`) exists because Venice ignored `response_format` for glm-4.6. It
    works with any model, but costs at least one extra request, re-sends the transcript, drops the provider's
    schema enforcement and hard-codes `reasoning: {enabled: false}`.
  - Its p3 routing (`DEFAULT_FINDER_PROVIDERS = ["novita"]`) would pin a sonnet-5 finder to a provider that does
    not serve Anthropic models.
  - Only two pieces are model-independent and worth taking: the per-step `provider=`/`finish=` log attribution with
    rejected-output logging (`2e2ae19`), and the `**/*.jsonl` diff exclusion (`5d72458`).
- **Routing today (2026-10-05):**
  - Sonnet-5 @ `anthropic` lists `tools`, `tool_choice`, `response_format`, `structured_outputs` and `reasoning`.
    Price: $2 / $10 per M; cache read $0.20, cache write $2.50 per M.
  - `reasoning.mandatory` is false, but reasoning is **on by default at effort `high`**. Master sends no reasoning
    field, so a sonnet-5 finder on master would think adaptively.
  - With `require_parameters: true`, OpenRouter skips the Bedrock endpoints because they lack `structured_outputs`.
  - Three new risks: Anthropic's docs reject `minLength` in strict schemas (§2.3; not observed through OpenRouter);
    vercel/ai #21992 (2026-10-03: sonnet-5 rarely writes the final JSON when native structured output is combined
    with tools in a loop); and sonnet-5 is now **legacy**, superseded by 5.5, with retirement not before
    2027-06-30.
- **How the model is set:** the repo variable outranks the default (`config.ts:138-139`). Both must name sonnet-5,
  or the variable must be deleted. `DEFAULT_MODEL` is pinned by a literal test (`config.test.ts:37`).
- **Cost:** about **$6.6/month in the mid case** (range ≈ $3–13). That is 26 of 62 September PRs reviewable after
  the docs-only skip, at ≈ 1.6 runs per PR because every push re-reviews. The $10 ceiling holds in the mid case and
  is crossed in the high case or in an August-sized month. Every per-review figure for real diffs is an estimate
  until measured.

## Detailed Findings

### 1. How master chooses and calls the finder

- **Model resolution** (`packages/code-reviewer/src/config.ts`):
  - `DEFAULT_MODEL = "z-ai/glm-4.6"` (`:14`); `DEFAULT_JUDGE_MODEL = "anthropic/claude-sonnet-5"` (`:15`).
  - The comment at `:6-13` requires the default to match the repo variable, and records why sonnet-5 was moved out
    (~58×).
  - Precedence (`:138-139`): `override || OPENROUTER_REVIEW_MODEL || OPENROUTER_MODEL || DEFAULT_MODEL`. It uses
    `||`, so an empty variable falls through to the default.
  - CI wiring: `review.yml:284-287` passes `vars.OPENROUTER_REVIEW_MODEL`; `action.yml:86-89` maps it to the env
    var.
  - Tests: `config.test.ts:37` pins `DEFAULT_MODEL` as a literal. The stale comment at `schemas.ts:20-23` still says
    the finder falls back to an Anthropic model.
- **The request** (`src/reviewer.ts`):
  - `ToolLoopAgent` with `output: tolerantReviewOutput()`, which is `Output.object` named `review_result`
    (`:144-192`; `output-repair.ts:229-235`).
  - Routing: `provider: {require_parameters: true}` (`:156-159`); there is no `only`/`order` on master.
  - `maxOutputTokens: 16_384` (`config.ts:57`); `maxRetries: 0`.
  - Step budget: 5 in CI (`cli.ts:78`). `prepareFinalStep` removes tools on the last step (`:116-119, :174`).
  - Timeout: 300 s per attempt (`pipeline.ts:49`). `withOneRetry` covers timeouts, 429/5xx and
    `NoObjectGeneratedError` (`retry.ts:23-31`).
  - No `reasoning`, no `temperature`.
- **On the wire** (installed `ai@7.0.52`, `@openrouter/ai-sdk-provider@3.0.0`):
  - `responseFormat` goes on **every** step, tool steps included (`node_modules/ai/dist/index.js:5602-5606`).
  - It becomes `response_format: {type: "json_schema", json_schema: {strict: true, …}}`
    (`node_modules/@openrouter/ai-sdk-provider/dist/index.js:3622-3631`).
  - Output is parsed only when the last step ends with `stop` (`ai/dist/index.js:6012-6015`); otherwise it throws
    `NoOutputGeneratedError`.
- **Telemetry:**
  - `finderTelemetry.cost` and `judgeTelemetry.cost` are written to `review.json` (`pipeline.ts:516-531, 549-556,
623-624`), and one stderr line reports `review cost: finder=$… judge=$…` (`cli.ts:146-165`).
  - **Gap:** a failed run writes neither, so the spend of failed attempts is invisible except as token counts.

### 2. Routing for sonnet-5 today (external, 2026-10-05)

#### 2.1 OpenRouter endpoint and model data

Route: `GET https://openrouter.ai/api/v1/models/anthropic/claude-sonnet-5/endpoints` and `GET /api/v1/models`,
unauthenticated, ≈ 19:10–19:30 UTC.

- **`anthropic` endpoint:**
  - `provider_name: "Anthropic"`; prompt `0.000002`; completion `0.00001`; `input_cache_read` `0.0000002`;
    `input_cache_write` `0.0000025`.
  - `context_length` 1,000,000; `max_completion_tokens` 128,000.
  - `supported_parameters` include `tools`, `tool_choice`, `structured_outputs`, `response_format`, `reasoning`, and
    **not** `temperature`.
  - `uptime_last_1d` 99.98; `supports_implicit_caching: false`.
- **Model `reasoning`:** `{"mandatory": false, "default_enabled": true, "default_effort": "high"}`. The same values
  were read in the Phase 4 pre-flight of `finder-verification` the same day.
- **Other endpoints:**
  - `claude-on-aws`, `google-vertex/global` and `azure/global` are the same price and support `structured_outputs`.
  - **Bedrock endpoints lack `structured_outputs`**, so `require_parameters: true` excludes them.
  - Regional endpoints cost 10% more.
- **`anthropic/claude-sonnet-5.5`** (created 2026-09-28): same price, `reasoning.mandatory: true`.

#### 2.2 Docs

- **OpenRouter structured outputs** (`/docs/guides/features/structured-outputs.md`): "Support is determined per
  endpoint … Endpoint support can also change over time."
- **OpenRouter routing** (`/docs/guides/routing/provider-selection.md`): with `require_parameters: true`, "the
  request won't even be routed to that provider". Even without it, `tools` and `response_format` act as a soft
  preference.
- **OpenRouter prompt caching:** not automatic for Anthropic. It needs `cache_control`, either per message or at the
  top level. Writes cost 1.25× (5-minute TTL), reads 0.1×.
- **Anthropic structured outputs** (`platform.claude.com/docs/en/build-with-claude/structured-outputs.md`):
  - GA, and `claude-sonnet-5` is a supported model.
  - Unsupported: "String constraints (`minLength`, `maxLength`) … you'll receive a 400 error".
  - Limits: up to 24 optional parameters and up to 16 union types.
  - "Grammars apply only to Claude's direct output, not to tool use calls".
- **Anthropic Sonnet 5 model page:**
  - "**Legacy.** Released June 30, 2026 … consider migrating to Claude Sonnet 5.5"; retirement not before
    2027-06-30.
  - $2 / $10 is now the standard price (`pricing.md`; the planned rise to $3/$15 "will not occur").
  - Adaptive thinking is on by default and can be turned off on Sonnet 5 (`thinking.md`), which OpenRouter exposes
    as `reasoning: {enabled: false}`.
  - A non-default `temperature` returns a 400. Master sends none.
- **The error "structured_outputs not supported in your workspace":**
  - No OpenRouter doc explains it. One third-party issue repeats the text for Anthropic models.
  - In the repo it was **haiku-4.5's**, in one probe, and it did not recur over 12 rows
    (`context/archive/2026-08-10-finder-tool-loop-evals/decision.md:108-114`).
  - Its cause is **unverified**.

#### 2.3 Conflict settled: `minLength` in the strict schema

- **What the external research found:** the emitted wire schema has `minLength` from `file: z.string().min(1)`
  (`schemas.ts:34`), and Anthropic's docs say that is a 400.
- **What the evidence shows** (checked by hand on 2026-10-05):
  - `file: z.string().min(1)` entered in `d67a125` (2026-08-07, #111).
  - The August sonnet-5 live probe (run 31533093356, scratch PR #123 off `f6e51f3`) ran on a base that contains
    `d67a125`. `f6e51f3:packages/code-reviewer/src/schemas.ts:41` has the same line, and `reviewer.ts:139` there
    uses `tolerantReviewOutput`. That probe **succeeded**.
  - Rendering master's schemas with the installed `asSchema` shows `minLength` in `reviewResultSchema`,
    `judgeOutputSchema` and `implReviewOutputSchema`. The judge and impl-review have run on sonnet-5 in production
    on the strict `json_schema` path.
- **Reading:** OpenRouter evidently accepts or sanitizes `minLength` for the Anthropic endpoint. **The documented
  risk has not been observed through OpenRouter.** It stays an item for the first paid probe to confirm, not a
  code change to make blind.

#### 2.4 Known issue: vercel/ai #21992 (open, 2026-10-03)

- It reports that "In an agent loop that also has tools, native structured outputs do not work well on Sonnet 5
  and 5.5 … the model usually calls another tool instead of writing the final JSON." Sonnet 5 produced 1/20 valid
  final answers.
- That was on `@ai-sdk/anthropic` directly, not OpenRouter.
- Master's `prepareFinalStep` removes the tools on the last step, which should prevent the "calls another tool"
  failure. The August record (12/12 fixtures, 1/1 live, no "No output generated" after `prepareFinalStep`) agrees,
  but that was a different SDK version and two months ago.
- **To verify in the first paid probe.**

#### 2.5 Thinking and the output budget

- With reasoning on at effort `high`, thinking tokens count toward `max_tokens` (16,384 per step) and are billed as
  output.
- The August fixture matrix has one React row at **18,408 output tokens**
  (`results/2026-08-11-tool-loop-matrix.json`), above today's cap. The record does not say whether reasoning was
  on.
- Whether to send `reasoning: {enabled: false}` or a lower effort is a **plan decision**. It affects cost, quality
  and the risk of a truncated JSON. The August quality evidence is under whatever the default was then.

### 3. What the three branches carry (base-branch question)

- **Ancestry:** `outage` (`87ba5da`) ⊂ `model-swap` (`573ee33`) ⊂ `verification` (`da99692`). All three branch from
  `a4f4d34`, before `68151b0`. A merge-tree of master with each is clean. `model-swap` adds no `src/` or `.github`
  changes beyond `outage`.
- **Themes:**

  | Theme                                                                                                                                                                             | Commits                                | Needed for a sonnet-5 finder?                                                                                                                                                                       |
  | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | A. Log attribution: `provider=`/`finish=` per step, rejected-output line on stderr                                                                                                | `2e2ae19`                              | **Useful, model-independent**; standalone                                                                                                                                                           |
  | B. Two-stage finder (format in the prompt, tool-less finalization without `response_format`, strict parse, one repair, `FinderOutputError`) + forced `reasoning: {enabled:false}` | `802a1e0`, `15b3f71`                   | **Not needed** for Anthropic (`response_format` is enforced there); costs at least +1 request per review and drops provider enforcement. Its model-agnosticism is claimed, measured on glm-4.6 only |
  | C. Finder routing `DEFAULT_FINDER_PROVIDERS = ["novita"]`, `OPENROUTER_FINDER_PROVIDERS` not wired in CI                                                                          | `e5be9ff`, `b3a4a38`                   | **Harmful**: pins sonnet-5 to novita                                                                                                                                                                |
  | D. Gate/eval tooling (`finder-gate*.mjs`, `hand-read-sample.mjs`, `promptfoo-gate-rows.mjs`, `recall-guard.mjs`, …)                                                               | outage p0–p1, model-swap, verification | Not production; **the runner (`finder-gate.mjs`) and `hand-read-sample.mjs` are the measurement tools a gate here would reuse**                                                                     |
  | E. Verifier stage (luna)                                                                                                                                                          | verification p1                        | Out of scope (decision 4.4)                                                                                                                                                                         |
  | F. `.github`: `**/*.jsonl` exclusion                                                                                                                                              | `5d72458`                              | Small, worth taking                                                                                                                                                                                 |

- **Extraction:** every code commit also carries the change's own `context/changes/…` documents, so taking a theme
  means a path-limited cherry-pick (`cherry-pick -n`, keep `packages/` and `.github/` only).
  - Theme A applies alone.
  - B depends on A.
  - C sits on B.
  - Taking the outage tip whole brings C.
- **The measurement runner** on `feat/finder-verification` runs finder, verifier and judge, and needs `--stages`.
  Its finder routing is `OPENROUTER_FINDER_PROVIDERS`, and its finder is the two-stage one. To measure master's
  single-loop finder on #247 and #269, the plan must either port a finder-only runner to this branch or drive the
  CLI itself (`cli.ts`, which already writes `review.json` with `finderTelemetry.cost`). This is an open plan choice
  (see Open Questions).

### 4. Cost model (history + PR volume)

**Measured sonnet-5 finder points (August, old single-loop path):**

| Point                         | Size                         | Tokens in / out                     | Cost                                                             |
| ----------------------------- | ---------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| Live run 31533093356, PR #123 | 2-file, 16-addition diff     | 32,848 / 2,938 (5 steps, 4 fetches) | $0.0951 (derived from tokens at list price)                      |
| Live run 31428446096          | 58,869 B diff, 8-step budget | 64,993 / 12,348                     | ≈ $0.25 (`2026-08-10-finder-file-context/verification.md:39-80`) |
| Fixture matrix                | 12 rows                      | —                                   | mean $0.04338/row; React up to $0.192/row (18,408 out)           |

**Judge (sonnet-5, production), PR #132 run 31735830016** (`context/archive/2026-08-11-impl-review-ci-agent/verification.md:93-102`):

| Pass        | Tokens in / out | Cost      |
| ----------- | --------------- | --------- |
| Judge       | 3,852 / 940     | $0.017104 |
| Impl-review | 33,675 / 13,227 | $0.199620 |

The pessimistic judge figure used in `finder-verification` is $0.033.

**PR volume** (`gh pr list`, created 2026-09-05..10-04):

- 62 PRs, all by the owner, none drafts, forks or bots. The month before had 94 PRs and 159 review runs.
- **26 of 62 would be reviewed** after the docs-only skip. `review.yml:243-264` skips a PR whose diff is empty after
  excluding `**/*.md`, `**/reviews/*.md`, `**/results/*.json`, `**/ground-truth/*` and the plan.
- Of the 26 reviewable PRs:
  - 18 have ≤ 50 changed lines;
  - 6 have 51–300;
  - 2 have more than 300 (#269 with 1,259; #265 with 830).
- Triggers are `opened, synchronize, reopened, labeled` (`review.yml:14`), so **every push re-reviews**. History
  shows ≈ 1.6 runs per reviewable PR (42 runs on 26 PRs). `cancel-in-progress` does not refund tokens already
  spent.

**Projection** (sonnet ≈ 1.7–2.1× glm's tokens on the same content, assumed ≈ 0.5 tokens/byte + 3k overhead;
summed input 2×/4×/8× step 1; derived, not measured):

| Bucket → reviews/month       | Finder per review (low / mid / high) | + judge      | Month (low / mid / high)  |
| ---------------------------- | ------------------------------------ | ------------ | ------------------------- |
| ≤ 50 lines → 29              | $0.04 / $0.09 / $0.19                | $0.017–0.033 | $1.7 / $3.3 / $6.5        |
| 51–300 lines → 10            | $0.05–0.07 / $0.12–0.15 / $0.26–0.31 | same         | $0.8 / $1.6 / $3.2        |
| > 300 lines → 3              | $0.16 / $0.34 / $0.70                | same         | $0.5 / $1.1 / $2.2        |
| Impl-review (plan PRs) → 3–5 | $0.20 (measured once)                | —            | $0 / $0.6 / $1.0+         |
| **Total**                    |                                      |              | **≈ $3.1 / $6.6 / $12.9** |

**What could push it up:**

- an August-sized month (≈ $10 at mid);
- the single retry (it can double a finder pass);
- long outputs or thinking (12–18k tokens);
- a review on every push.

**Levers if the measurement lands above $10:**

- `cache_control` (pays off only if the same ≥ 1,024-token prefix is re-sent within 5 minutes; a 5-step loop
  re-sends its prefix every step, so this is the strongest one);
- a lower `REVIEW_FINDER_MAX_STEPS`;
- `reasoning` off or at a lower effort;
- reviewing on `opened` plus the label only.

## Code References

- `packages/code-reviewer/src/config.ts:6-15, 57, 105-114, 135-142` — defaults, routing, precedence
- `packages/code-reviewer/src/config.test.ts:37` — literal pin of `DEFAULT_MODEL`
- `packages/code-reviewer/src/reviewer.ts:110-119, 144-198` — tool loop, `prepareFinalStep`, routing, output
- `packages/code-reviewer/src/output-repair.ts:5-21, 228-252` — `tolerantReviewOutput`, envelope repair
- `packages/code-reviewer/src/schemas.ts:20-47, 123-124` — finder and judge schemas (`minLength` from `.min(1)`)
- `packages/code-reviewer/src/pipeline.ts:49-55, 374-422, 516-556, 574-577, 623-624` — timeouts, cost, telemetry, retry
- `packages/code-reviewer/src/retry.ts:23-53` — retry classes
- `packages/code-reviewer/src/cli.ts:78-88, 105-165, 272-298` — step budget, log lines, cost line
- `.github/workflows/review.yml:14, 23-33, 219-220, 243-264, 280-317` — triggers, `false &&`, docs skip, vars, artifact
- `.github/actions/ai-review/action.yml:24-39, 86-97` — inputs → env, `--source-root`
- `node_modules/ai/dist/index.js:5602-5606, 6012-6015` — `responseFormat` on every step; parse on `stop`
- `node_modules/@openrouter/ai-sdk-provider/dist/index.js:3622-3631` — `json_schema`, `strict: true`

## Architecture Insights

- The finder, the judge and impl-review share one transport pattern: strict `json_schema` plus
  `require_parameters: true` through OpenRouter. The judge has proved it on sonnet-5 in production. A sonnet-5
  finder is the same pattern with a tool loop in front, which is why master needs no structural change.
- The model is chosen by configuration, not code, and the repo variable wins. The 2026-08-12 decision record warns
  that `! gh variable set` from a non-interactive shell writes an **empty** value (`decision.md:208-211`). An empty
  value falls through to `DEFAULT_MODEL`, which is why both must agree.
- `ai-review` is advisory and never in `deploy.needs`. A finder failure blocks nothing but the review comment.
  Since 2026-09-20 every finder run has failed (Venice), so turning the job back on with an unverified finder
  repeats a visible red on every PR.

## Historical Context (from prior changes)

- `context/archive/2026-08-10-finder-tool-loop-evals/decision.md` — the sonnet-5 decision trail: flawless 12/12
  fixtures, the only live out-of-hunk catch, 57.6× glm, and "order $3–8/month" at August cadence. Declined on cost
  2026-08-12.
- `context/archive/2026-08-10-finder-tool-loop-evals/verification.md:249-252, 318-332` — instrument gaps:
  1. fixture tool use does not predict live tool use;
  2. `no_false_alarms` cannot see minor hallucinations;
  3. CI logs which paths were requested, never whether they were delivered;
  4. PR title and body reach the finder.
- `context/archive/2026-08-10-finder-file-context/verification.md:39-80` — the 58 KB sonnet-5 run (≈ $0.25) and
  the "No output generated" deaths that led to `prepareFinalStep`.
- `context/archive/2026-08-11-impl-review-ci-agent/verification.md:93-102` — the only measured judge and
  impl-review costs (PR #132).
- **On the branches only, not on master:**
  - `context/archive/2026-09-24-finder-serialization-outage/` — the outage's root cause (Venice) and the two-stage
    fix.
  - `context/archive/2026-10-02-finder-model-swap/` — the luna hand-read: 19/20 rejected, with the rejection
    categories and a reusable method (`change.md:51-65`, `hand-read-269.md:91-104`).
  - `context/archive/2026-10-03-finder-verification/` — the frozen #240/#247 inputs (`gate.md` § Inputs freeze;
    #247 is still unseen) and `follow-ups/successor.md` (F-a, F-b).

  A plan that cites them must cite them by branch or bring them to master.

## Related Research

- `context/archive/2026-08-10-finder-tool-loop-evals/` — the original model matrix and live probes.
- `feat/finder-verification:context/archive/2026-10-03-finder-verification/research.md` — verifier research,
  including the judge latency and size formulas (`:233-249`).

## Open Questions

1. **Reasoning setting for the finder** (plan decision): default (adaptive, `high`), a lower effort, or
   `enabled: false`. It affects cost, the 16,384-token budget and quality. The August evidence was gathered under
   the default of the time.
2. **Endpoint pinning** (plan decision): `only: ["anthropic"]`, or `require_parameters` alone, which also allows
   Vertex, Azure and Claude-on-AWS at the same price. Pinning makes the measurement reproducible. Not pinning gives
   fallbacks.
3. **Measurement tool** (plan decision): port a finder-only runner from `feat/finder-verification` (the two-stage
   finder must not come with it), or measure through the CLI and `review.json`. Either way, record failed attempts'
   spend, which master does not.
4. **Confirm in the first paid probe** (unverified today, routes failed or would need a paid call):
   - a strict schema with `minLength` is accepted on the `anthropic` endpoint today (§2.3; very likely);
   - the tool-less final step returns valid JSON on sonnet-5 with the current SDK (vercel/ai #21992; very likely
     mitigated);
   - "structured_outputs not supported in your workspace" does not occur (cause unknown);
   - the token-per-byte and steps multipliers behind the cost projection.
5. **Sonnet-5 vs 5.5** (owner): sonnet-5 is legacy, retiring not before 2027-06-30. 5.5 costs the same, cannot turn
   thinking off, and fared worse in vercel/ai #21992. The owner chose sonnet-5; this is recorded, not reopened.
6. **Bring the three archived folders to master** (owner): today they live only on the branches, so master's
   `context/archive/` has no record of the outage, the model swap or the verifier result. That is out of this
   change's scope unless the owner says otherwise.
7. **Turning `ai-review` back on** removes the `false &&` line (`review.yml:23-29`), whose comment names "the change
   that deploys a finder which passes those gates". That makes this change's gates the condition for the removal.

**Failed external routes:**

- `status.openrouter.ai/api/v2/incidents.json` returned 403;
- `status.openrouter.ai/` returned a JavaScript shell with no data;
- OpenRouter `/docs/*.mdx` returned 404 (the `.md` routes worked);
- `platform.claude.com/.../whats-new-claude-sonnet-5.md` returned 404.
