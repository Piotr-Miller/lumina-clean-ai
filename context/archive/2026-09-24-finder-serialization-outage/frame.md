# Frame Brief: the ai-review finder stopped producing parseable output

> Framing step before /rune-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

Since 2026-09-20 the `ai-review` finder (`z-ai/glm-4.6` on OpenRouter) ends every real run with
`AI_NoObjectGeneratedError` ("No object generated: could not parse the response"), or
occasionally "No output generated". It failed on both attempts every time. On 2026-09-13 and earlier,
every finder run succeeded.

Re-measured on 2026-09-28 from the `review.yml` logs of all 76 completed runs since 2026-09-10
(the run IDs are below):

| Window                  | Finder actually ran | Succeeded | Failed |
| ----------------------- | ------------------- | --------- | ------ |
| 2026-09-10 → 2026-09-13 | 17                  | 17        | 0      |
| 2026-09-20 → 2026-09-28 | 35                  | 0         | 35     |

Every green run after the break took the `SKIP_REVIEW` branch (the "skipping the AI review" line is
printed). That includes PR #270 (run 36470506709), so `temp_steps.md`'s note that the failure is
"intermittent, not constant" because #270 passed is **wrong**. #270's finder never ran.

**Observed / inferred**: the failure counts, the error strings and the unchanged repo state are
observed. That the cause lies outside the repo is inferred from those observations. "The model
changed" vs "the route changed" is **inferred from neither**, because no log records which upstream
served a call or what text it returned.

## Initial Framing (preserved)

- **User's stated cause or approach**: nothing changed on our side, so the cause is outward. Either
  `glm-4.6`'s structured-output behaviour changed on OpenRouter or OpenRouter's routing for it did.
  The break may be the same class as the `structured_outputs not supported in your workspace` error
  hit in `finder-tool-loop-evals`.
- **User's proposed direction**: first establish model vs route, and only then shop for a
  replacement. Try the cheap recovery first: "a provider pin or a `require_parameters` setting
  restores `glm-4.6` at no cost increase". If it comes to shopping, weight schema reliability under
  repeats above recall, and attribute each failure to the model or to routing separately.

## Dimension Map

1. **Our side** (code, lockfile, model variable, workflow): a repo change altered the request.
2. **Input content / size**: the diffs after the break are bigger or of a different kind, and push
   the model off the schema.
3. **Serving route**: what answers our `z-ai/glm-4.6` requests changed. ← initial framing (a).
   Verification split this into two readings:
   - **3a. Route moved**: OpenRouter began sending the requests to a different endpoint, which does
     not enforce the schema. The cause could be the upstream set, an account/workspace setting or the
     eligibility filter.
   - **3b. Same endpoint, changed serving**: Venice, the only provider on both sides of the break,
     changed how it serves `glm-4.6`: deployment, quantization, chat template, tool-call parsing, or
     how it enforces `response_format` when tools are present.
4. **Model revision**: the weights or chat template behind the id changed at the source, for every
   endpoint that serves it. ← initial framing (b)

## Hypothesis Investigation

| Hypothesis                                            | Falsifier (what would kill it)                                                                                                                                                                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Verdict                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1. Our side                                           | A change to `packages/code-reviewer`, its lockfile or `OPENROUTER_REVIEW_MODEL` before 2026-09-20 13:01Z. **Found absent.**                                                                                            | The last package commit before the break is 2026-09-08 (`976dd37`). `926df0c` landed 2026-09-21, after the first failure (run 35512300004, 2026-09-20T13:01Z). The lockfile is unchanged (`change.md`). `require_parameters: true` has been the default since 2026-08-24 (`packages/code-reviewer/src/config.ts:105`), before 17 successes.                                                                                                                                                                                                                                                                                                                                                                                                 | NONE                                                                                      |
| 2. Input content / size                               | Small inputs failing after the break, and inputs of similar size passing before it. **Found.**                                                                                                                         | Failures at input 1,631 tokens (run 36268905342) and 1,740 (35647763451). Pre-break successes at 2,131–7,875 input tokens. Output as short as 7 and 9 tokens was rejected as unparseable. No valid `{summary, findings}` object fits in 7 tokens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | NONE                                                                                      |
| 3a. Route moved to another endpoint                   | The same provider served the calls on both sides of the break. **Found** (Verification Results).                                                                                                                       | Venice served the passing generation of 2026-09-13 and the failing ones of 2026-09-28. No other provider served `glm-4.6` anywhere in 2026-09-10 → 2026-09-28.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | NONE                                                                                      |
| 3b. Venice changed how it serves `glm-4.6`            | Venice, pinned, still returns schema-constrained output. **Looked for, absent** (Probe Results).                                                                                                                       | **The behaviour flipped on the same provider.** Before the break: zero tool calls in 17 of 17 live runs, matching the evals (`context/archive/2026-08-10-finder-tool-loop-evals/decision.md:54,71`, `change.md:33`). After it: tool loops in most of the 35 runs. **Probe:** Venice, pinned, answered PR #269's diff with a 4,028-character **markdown** review, with no JSON anywhere, and answered a trivial strict-`json_schema` request with a plain sentence, both **with and without tools** (2 of 2 each). The finder prompt never asks for JSON (`src/prompts.ts`), so the JSON seen before the break came from `response_format` being applied. Today Venice does not apply it, although it still advertises `structured_outputs`. | **STRONG**                                                                                |
| 4. Model revision (as the cause of the parse failure) | Output that ignores a strict `json_schema` on a prompt that never asks for JSON. Constrained decoding is applied by the server, so a revised model under enforcement would still emit JSON. **Found** (Probe Results). | A revision may still explain the new tool-calling habit. It cannot explain `response_format` being dropped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | NONE for the parse failure. Open for the tool-use flip, which does not decide the outage. |

## Narrowing Signals

- **The flip happened on one provider.** Between 2026-09-13 21:20Z and 2026-09-20 13:01Z, Venice's
  answers for this model id changed: tool calls appeared and output stopped being schema-constrained.
  The route did not change.
- **Tools are not required for the failure.** Three post-break runs never called a tool and still
  failed (35524527921, 35533002936, 36268905342). The tool loop is part of the new behaviour, not
  the mechanism of the parse failure.
- **The rejected responses vary widely in length.** Final steps that fail to parse range from
  **7 to 1,078** output tokens: 7 (36268905342), 9 (35647763451), 34 and 49 (the
  `test-photos-baseline-like-scenes` runs), 51 and 87 (36273972778), and 1,078 (36469048792). The
  short ones cannot be a truncated review, and the long ones cannot be an empty result. Seeing what
  the text actually is decides which fix class applies.
- **The cheap recovery is already spent.** `require_parameters: true` was in force for all 35
  failing runs. Pinning Venice is today's route, and OpenRouter routes a `json_schema` request for
  this model nowhere else (Probe Results).
- **Venice drops `response_format` entirely.** Pinned, it answered with markdown prose on the real
  diff and on a trivial request, with and without tools (Probe Results).
- **The pipeline logs nothing that could attribute the failure.** A failed run uploads no output.
  The step telemetry prints tokens and tool targets, but not the serving provider or the rejected
  text (`packages/code-reviewer/src/pipeline.ts`, `describeFinderStep`). OpenRouter keeps no bodies
  either. The same blind spot is recorded in lessons.md as "a check that cannot say what it found".

No narrowing questions were asked. The attribution data sat in the owner's OpenRouter account and was
read there (Verification Results).

## Cross-System Convention

For a multi-provider router, the usual first step is to read the router's own per-generation record
of which upstream served a call before changing routing or models. That was done, and it ruled out a
route change. The repo's earlier incident (`context/archive/2026-08-24-finder-provider-routing/change.md`)
was diagnosed as an endpoint-level property, "structured output is a property of the endpoint, not the
model". This incident is the harder case that change's "Not claimed" section anticipated: an endpoint
that advertises enforcement and no longer delivers it.

## Discriminator Check

| Proposed experiment                                                                                                                            | Separates                                                                                      | Conflates                                                         | Cost (money / irreversible / wait)                                               | Already answered by                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set `require_parameters` (`change.md`, "why the cheapest question comes first")                                                                | Nothing. It has only one possible outcome.                                                     | —                                                                 | $0 / no / none                                                                   | **Dominated.** It has been the default since 2026-08-24 (`config.ts:105`) and was in force for all 35 failures, at $0.                                                                                                                                                                                                |
| OpenRouter Logs: the provider for a failing and a passing generation                                                                           | 3a vs the rest                                                                                 | Nothing                                                           | $0 / no / minutes                                                                | **Done** (Verification Results): Venice both sides, so 3a is NONE.                                                                                                                                                                                                                                                    |
| Pin Venice (`order: ["venice"]`, `allow_fallbacks: false`) on PR #269's diff, printing the rejected text and `finish_reason`                   | What Venice returns. It turned out to be free markdown, so an envelope repair cannot reach it. | Nothing                                                           | Cents / reversible / minutes                                                     | **Done** (Probe Results).                                                                                                                                                                                                                                                                                             |
| Pin a non-Venice provider (Z.AI fp4, Novita bf16, DeepInfra fp4) with `require_parameters` relaxed, same diff (Verification Results' proposal) | Would have separated 3b and 4 only on success.                                                 | **Provider and schema enforcement**, moved together.              | —                                                                                | **Not runnable in the production request shape.** OpenRouter removes every non-Venice endpoint for a `json_schema` request even with `require_parameters: false` ("Filter by Parameters removed deepinfra/fp4, novita/bf16, z-ai/fp4"). It is no longer needed: the trivial-request probe settled 3b vs 4 without it. |
| Shop for a replacement model (the "instinct" in `change.md`)                                                                                   | Nothing about glm-4.6                                                                          | **Model and route together.** A new id brings a new endpoint set. | Eval-cycle money (last cycle's rows cost $0.0036–$0.21 each) / reversible / days | Nothing found                                                                                                                                                                                                                                                                                                         |

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the only OpenRouter endpoint that will take our
> `json_schema` request for `z-ai/glm-4.6` is Venice, and Venice no longer applies `response_format`
> at all, even though it still advertises `structured_outputs`. The finder receives free-form
> markdown and cannot parse it. The route did not change, and the model is not the cause.

The initial framing's direction holds: the cause is outward, and the incumbent was examined before any
shopping. Its hoped-for cheap recovery does not exist:

- `require_parameters` is already in force.
- Pinning Venice is the status quo.
- OpenRouter will not route a `json_schema` request anywhere else.
- The failure is constant, not intermittent.

Keeping `glm-4.6` therefore means one of two things. Either the schema stops depending on
`response_format`, with the format carried by the prompt and a parse/repair on our side, or we wait
for Venice to fix it. Otherwise the answer is a different model whose endpoints actually enforce the
schema. Choosing between these is /rune-plan's job. Whatever is chosen, the pipeline should log the
serving provider, `finish_reason` and the rejected text, so the next break is attributable from the
run log.

## Confidence

**HIGH.** The failure was reproduced locally on PR #269's exact diff, with the serving provider and
the raw output seen. It was reproduced again on a trivial request with and without tools. The
falsifier for "model revision" was found. What stays unverified is **why** Venice stopped applying
`response_format`: a Venice deployment change, or a change in OpenRouter's pass-through to it. Both
sit outside the repo, and neither changes what there is to plan.

- ~~Look up the serving provider in OpenRouter Logs.~~ Done: Venice both sides. — Actor: user
- ~~Check the OpenRouter account/workspace settings.~~ Done: neutral. — Actor: user
- ~~Put a real OpenRouter key in `packages/code-reviewer/.env`.~~ Done. — Actor: user
- ~~Run the CLI locally on PR #269's diff pinned to Venice.~~ Done (Probe Results). — Actor: agent
- ~~Non-Venice pin.~~ Not runnable in the production request shape and no longer needed (Probe
  Results). — Actor: agent
- Optional, before relying on a Venice fix: report the non-enforcement to OpenRouter/Venice with the
  trivial repro below. — Actor: user

## Verification Results (2026-09-28)

The first two verification steps are done. Claude read them in the owner's browser. OpenRouter
Logs keep history back past 2026-09-10.

- **Serving provider: Venice on both sides of the break.** Venice served the passing generation
  of 2026-09-13 ~21:20Z (`gen-1789334415-Pl9rWzae8xbHAQJzEC3F`: 4,196 → 52 tok, `stop`, no
  fallback). It also served the failing generations of 2026-09-28 ~19:00–19:01Z. With the filter
  "provider is not Venice" over 2026-09-10 → 2026-09-28, only Claude Sonnet 5 rows remain. **No
  other provider served `z-ai/glm-4.6` in the whole window.**
- **The per-generation shape flipped on the same provider.** Before the break, each finder call
  was one generation ending `stop` at 37–525 output tokens. After it, a typical attempt is a chain
  of generations of about 40 tokens with finish reason `tool_calls`, ending in one `stop` that fails
  to parse. That final `stop` ranges from **7 to 1,078** output tokens across the CI logs, not only
  400–1,100. Three post-break runs made no tool call at all and still failed (35524527921,
  35533002936, 36268905342). OpenRouter keeps no request or response bodies, so the rejected text is
  still unseen.
- **Account settings are neutral.** There is no allowed or ignored provider list, ZDR is off,
  "allow paid endpoints that train on request data" is off, and the default provider sort is
  balanced. OpenRouter shows no change history for these settings. That is moot, because the
  provider did not change.

**Effect on the hypotheses (before the probe).** Dimension 3a (the route moved to another endpoint) is **falsified**,
because the provider is the same. What remains is 3b (a change inside Venice's serving of `glm-4.6`)
or 4 (a model revision), and the logs do not separate them. A pin to a non-Venice provider (Z.AI
first-party, Novita bf16 or DeepInfra) discriminates **only on success**. None of those advertises
`structured_outputs`, so the probe must relax `require_parameters`, which moves provider and schema
enforcement together. A schema-valid review from one of them points to 3b. A failure is predicted by
both 3b and 4, because non-enforcing endpoints broke the envelope before this incident too
(Amendment A1), so it does **not** point to the model. Probe Results below settle it.

## Probe Results (2026-09-28)

Set up exactly as CI ran PR #269: a worktree at head `fca2778` as `--source-root`, the diff
recomputed with the workflow's pathspec (65,455 bytes, byte-for-byte the size CI logged), and the
base branch's `.github/ai-review-rules.md`. `--plan-file` was left out because only the
implementation-review pass reads the plan, and leaving it out avoided that pass's cost. A temporary
patch to `packages/code-reviewer/src/reviewer.ts` pinned the route from an env var (`order`,
`allow_fallbacks: false`, `require_parameters`) and printed one line per generation carrying only
the provider, `finish_reason` and the text. The patch has been **reverted** (`git checkout --
src/reviewer.ts`, tree clean).

A first attempt failed on authentication: the `.env` held a Replicate token. Once the owner replaced
it with an OpenRouter key:

- **Venice pin, finder on PR #269: reproduced.** Attempt 1 was one generation, `provider=Venice`,
  `finish=stop`, 914 output tokens. The text was a 4,028-character **markdown** review ("I'll review
  this unified diff…", `## Findings`, `### major`, code fences, `## Review Conclusion`), with no JSON
  object anywhere. The SDK rejected it with `AI_NoObjectGeneratedError`. Attempt 2 was five
  `getFileContext` generations (`finish=tool-calls`, empty text), all `provider=Venice`, ending in
  "No output generated." The fifth step was meant to be tool-less (`prepareFinalStep`) and still
  came back as a tool call. That is the same run shape as CI run 36469048792.
- **Venice, trivial strict `json_schema` request** (direct API, schema `{summary: string, count:
integer}`, prompt "Describe the number 7 in one sentence."): **plain prose sentence, `finish=stop`,
  in 2 of 2 without tools and 2 of 2 with a tool declared.** Two earlier no-tool calls at
  `max_tokens: 400` ended `finish=length` with no content, because the model spent the budget on
  reasoning; at 3,000 the outputs used 1,701–1,920 tokens.
- **Non-Venice pin (Z.AI, `require_parameters: false`): not runnable.** OpenRouter refused:
  "No endpoints found for z-ai/glm-4.6. Every candidate endpoint was removed during routing: Filter
  by Parameters removed deepinfra/fp4, novita/bf16, z-ai/fp4; Filter by Fallback removed
  venice/fp4." A direct check isolated the trigger to `response_format: json_schema`. The same pin
  with only `tools`, or with no extra parameters, is served by Z.AI. So OpenRouter hard-filters
  `json_schema` to Venice regardless of `require_parameters`.

Spend: one finder run pinned to Venice (about 107k input tokens over six generations) plus six small
direct calls. That is cents; the exact figure was not read. Artifacts (the rejected text as JSONL,
the diff, the rules copy and the worktree) remain in the session scratchpad only.

## What Changes for /rune-plan

The plan is about restoring a parseable finder output given that `response_format` is not honoured
for `glm-4.6` on OpenRouter. Candidate directions for /rune-plan to weigh, not decided here:

- a prompt-carried format with our own parse/repair;
- a different finder model whose endpoints enforce the schema, judged under the constraints in
  `change.md`;
- waiting on a Venice/OpenRouter fix.

Each direction should also make the pipeline log provider, `finish_reason` and the rejected text.

## References

- Run logs: 17 pre-break successes (34534771623 … 34783469218). 35 post-break failures, including
  35512300004 (the first), 35647763451, 35659916148, 36268905342 and 36469048792 (PR #269). SKIP
  runs include 36470506709 (PR #270).
- Source: `packages/code-reviewer/src/config.ts:105` (`DEFAULT_PROVIDER_ROUTING`),
  `src/reviewer.ts` (tools + `tolerantReviewOutput` + routing on one agent),
  `src/pipeline.ts` (`describeFinderStep`: no provider field).
- Prior: `context/archive/2026-08-10-finder-tool-loop-evals/` (glm-4.6 made 0 tool calls),
  `context/archive/2026-08-24-finder-provider-routing/change.md` (why `require_parameters`; its effect
  was never measured).
- Lessons applied (3 of 37 entries carry `frame`): "measure the premise before building on it",
  which shaped the re-count that overturned "intermittent" and "`require_parameters` would restore
  it", and "ablate from the artifact that reproduces", which is why PR #269's diff is the probe
  input. The third (Astro `run_worker_first`) does not bear on this frame.
- Investigation: all dimensions were checked directly from CI logs, git history and the public
  endpoint listing; 3a was settled from OpenRouter Logs (Verification Results). No sub-agents were used.
- Pressure test: prior occurrences checked (the `finder-provider-routing` and
  `finder-tool-loop-evals` archives), and the inverse checked (pre-break runs never touched tools;
  post-break tool-less runs still fail). The independent search was **skipped** because the frame
  confirms the user's direction (outward, attribute first) rather than redirecting it.
