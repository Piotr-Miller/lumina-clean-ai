# Finder output without `response_format` — Implementation Plan

## Overview

Since 2026-09-20 the `ai-review` finder (`z-ai/glm-4.6`) has failed on 35 of 35 real runs, because Venice is
the only endpoint OpenRouter will route a `json_schema` request to for this model, and Venice no longer
applies `response_format` (`frame.md`, Reframed Problem Statement). The owner decided on 2026-09-28
(`change.md`, Owner decision) to keep `glm-4.6`. The output format moves into the prompt, the JSON is
produced by a separate request with no tools and no `response_format`, and we validate it strictly ourselves.
The pipeline also has to become able to attribute its own failures. A model swap stays the fallback, taken
only if the pre-registered gate in Phase 4 fails.

## Current State Analysis

- **The finder is one `ToolLoopAgent` with `output: tolerantReviewOutput()`** (`src/reviewer.ts:144-192`).
  In `ai@7.0.52` the `output.responseFormat` goes into **every** step's `doGenerate` call, tool steps included
  (`node_modules/ai/dist/index.js:5606`). So no request the finder sends today is free of `response_format`.
  Origin: `code` (SDK source, read 2026-09-29).
- **`prepareFinalStep` does drop `tools` on the last step.** `activeTools: []` → `filterActiveTools` returns
  `{}` → `prepareTools` returns `undefined` (`ai/dist/index.js:3064-3071`, `2109-2116`), and the provider
  only emits `tools` when `tools.length > 0` (`@openrouter/ai-sdk-provider/dist/index.js:3649`). The history on
  that step still carries the assistant `tool_calls` and the `tool`-role results, though. This is the likely
  reason the probe's fifth step came back as a tool call with no tools declared (`frame.md`, Probe Results).
  That is inferred from static reading and not yet observed on the wire. Phase 0 observes it.
- **The finder's envelope repair fills in data** (`src/output-repair.ts:49-94`): it adds a placeholder
  summary to a bare array and maps `warning`→`major` and `observation`→`minor`. Owner condition 3 forbids
  both, and the user decided (2026-09-29) that only the wrapper may be stripped.
- **Routing is shared.** `DEFAULT_PROVIDER_ROUTING = { require_parameters: true }` (`src/config.ts:105`) serves
  the finder, the judge and the impl-review pass. The judge and impl-review still use `json_schema` on
  sonnet-5 and must keep it.
- **Retry.** `withOneRetry` re-rolls a `NoObjectGeneratedError` once with no delay (`src/retry.ts:23-31`). The
  frame shows both attempts failing identically on every post-break run.
- **Observability.** `describeFinderStep` records tool targets, tokens and cost, but not the serving provider
  or `finish_reason` (`src/pipeline.ts:406-424`). A failed run prints only the error message
  (`src/cli.ts`, catch block). The provider already exposes the upstream as
  `providerMetadata.openrouter.provider` (`@openrouter/ai-sdk-provider/dist/index.js:3843`).
- **Test seams.** `createOpenRouter` accepts an injected `fetch`, so a hermetic test can capture the exact
  request body. `provider-attempts.test.ts` mocks at the model level (`MockLanguageModelV3`), which cannot see
  the wire body. That is why condition 1 needs the `fetch` seam.
- **Consumers of `createReviewer`**: `src/pipeline.ts`, `src/demo.ts`, `evals/finder-provider.ts`
  (it counts `onOutputRepair` as `repairs`), `scripts/finder-distribution.mjs`, `scripts/fabrication-probe.mjs`
  (passes a Venice pin via `providerRouting`) and `scripts/judge-diagnose.mjs`.

## Definitions

| Term                          | Decided meaning                                                                                                                                                                                                                                                                                                                                                       | Origin                                                        | On degenerate data                                                                                                                                            | Verified by                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Valid finder output           | Text that, after only the wrapper is removed, `JSON.parse`s and passes the **unchanged strict** `reviewResultSchema`                                                                                                                                                                                                                                                  | user (condition 3, 2026-09-29 answer)                         | A bare array, `path` instead of `file`, `severity: "WARNING"`, or a missing `summary` is **invalid**, never rescued on our side                               | Phase 2 parser tests                                     |
| Wrapper                       | A markdown code fence around the object, or prose before or after exactly the object that `extractJsonObject` finds (first balanced top-level `{…}`)                                                                                                                                                                                                                  | user (condition 3: "a wrapper such as a markdown code fence") | Prose containing an example `{…}` before the real object → the first object is taken → strict validation fails → repair. There is no second guess on our side | Phase 2 parser tests                                     |
| Filling in data               | Any change beyond removing the wrapper: a synthesized summary, renamed fields, mapped or lowercased enum values, dropped or added findings                                                                                                                                                                                                                            | user                                                          | Every such case goes to the model repair and never to code                                                                                                    | Phase 2 parser tests (a negative test per former repair) |
| No findings                   | The model explicitly returns `{"summary": "…", "findings": []}`                                                                                                                                                                                                                                                                                                       | user (condition 3: a failure is never an empty list)          | Prose such as "No issues found." without JSON (no `{` in the text) is a **failure** → `FinderOutputError` **without a repair**, never `findings: []`          | Phase 2 parser test and the Phase 4 no-findings case     |
| Format repair                 | **One** extra request, with no tools and no `response_format`, carrying **only** the rejected text and the validation error (no diff, no transcript), whose prompt asks for a format conversion and forbids adding, removing or changing findings. At most one per finder pass. Not attempted when the text contains no `{` or the finalization ended `finish=length` | user (condition 3; plan-review F1, 2026-09-29)                | The repair also returns prose → `FinderOutputError`. No `{`, or `finish=length` → `FinderOutputError` with `repaired: false`, zero repair requests            | Phase 2 test                                             |
| Explicit error                | `FinderOutputError`, not retried by `withOneRetry`. Its message names the provider, the `finish_reason` and the validation error, and the CLI prints the rejected text (capped, control characters escaped)                                                                                                                                                           | user (2026-09-29 answer: terminal)                            | 429, 5xx and timeouts are **still** retried once                                                                                                              | Phase 2 retry test and the Phase 1 CLI test              |
| Endpoint that passed the gate | An OpenRouter provider slug for `z-ai/glm-4.6` that met every Phase 4 threshold, measured pinned (`only: [slug]`, `allow_fallbacks: false`)                                                                                                                                                                                                                           | user (routing decision 2026-09-29)                            | An endpoint not measured does not go on the list, even if it looks equivalent                                                                                 | Phase 4 `gate.md`, Phase 5 config test                   |

## Desired End State

- The finder runs in two stages. First comes a context-gathering loop with `getFileContext` and **no** `output`.
  Then a separate, tool-less request with no `response_format` produces the JSON. Its history carries earlier
  tool calls and results **as plain text** (with the results still fenced as untrusted content).
- A hermetic test with an injected `fetch` shows that the finalization body has no `tools`, `tool_choice` or
  `response_format`, no message with `role: "tool"` and no `tool_calls`. It also shows that the gathering
  steps carry no `response_format`.
- A format failure ends after at most one repair, as `FinderOutputError`, without a second whole-pass run.
- Every finder step in the log names the provider and the `finish_reason`. A failed run prints the rejected
  text, so the next outage can be attributed from the run log alone.
- The finder routes only among endpoints that passed the gate (`order` + `only`, fallbacks inside that list).
  The judge and impl-review pass are untouched.
- `gate.md` holds the pre-registered thresholds (written before the measurement) and their results. On a live
  scratch PR the whole review goes green with a real finder output.

### Key Discoveries:

- `responseFormat` goes out on every step when `output` is set: `ai/dist/index.js:5606`.
- An empty `activeTools` removes `tools` from the request: `ai/dist/index.js:3064`, `2109`;
  `@openrouter/ai-sdk-provider/dist/index.js:3649`.
- The serving upstream is available as `providerMetadata.openrouter.provider`: `@openrouter/ai-sdk-provider/dist/index.js:3843`.
- The provider settings support `order`, `only`, `ignore` and `allow_fallbacks` (`@openrouter/ai-sdk-provider/dist/index.d.ts:213-233`).
- `extractJsonObject` (`src/output-repair.ts:134`) is already a correct wrapper-stripper (it respects strings
  and escapes and never returns a partial slice). The judge uses it and it stays.

## What We're NOT Doing

- Changing the finder model, and evaluating new models. That is the fallback, and only after a failed gate.
- Changing `REVIEW_FINDER_MAX_STEPS`, what the finder reviews, or the advisory status of `ai-review`
  (owner, 2026-09-24).
- Touching the judge and impl-review passes: their `json_schema`, `tolerantJudgeOutput` and
  `DEFAULT_PROVIDER_ROUTING` stay.
- Repairs that fill in data on our side (the user, 2026-09-29). `repairReviewResultShape` leaves the finder
  path.
- Re-running the whole finder pass after a format failure (the user, 2026-09-29).
- Porting the campaign scripts (`fabrication-probe.mjs`, `finder-distribution.mjs`, `judge-diagnose.mjs`)
  beyond keeping them compiling. Their measurements from before this change stop being comparable with ones
  after it. The plan records that in their headers and does not fix it.
- Waiting for a fix from Venice/OpenRouter. The report to them is a parallel owner step, not a dependency.

## Implementation Approach

The work runs in five phases, each ending in a state that is safe for the repo:

0. **Premise measured before the code** (lesson "measure the premise"). The wire shape is checked
   hermetically, and a cheap live probe on Z.AI shows that the prompt-carried format produces JSON at all. This
   phase also writes the gate's pre-registration. If the probe fails, the plan stops here and goes back to the
   owner with the fallback.
1. **Observability first.** It works on today's path (`NoObjectGeneratedError.text`/`.finishReason`), so it
   pays off even if the rest falls through.
2. **Two-stage finder, our parser, one repair, a terminal error.**
3. **The finder's own routing**, overridable by env so the gate can pin one endpoint at a time.
4. **Regression gate** on Z.AI first and then the other endpoints, against the thresholds from Phase 0.
5. **Production routing from the gate's results, a live scratch PR, and the pointers corrected.**

## Critical Implementation Details

- **Timing & lifecycle — one budget for the whole pass.** `review()` now makes 2–N requests (the loop, the
  finalization, optionally the repair). `REVIEW_FINDER_TIMEOUT_MS` must bound the **whole** `review()` call
  through one `AbortSignal`, not each request separately. Otherwise the worst case silently grows to 3×300 s.
- **State sequencing — telemetry counts every request.** The finalization and the repair must go through the
  same `onStepEnd` as the loop steps. Otherwise `finderTelemetry.cost` understates the cost exactly by the
  new calls, and the gate's cost threshold measures something false.
- **Debug & observability — the rejected text is untrusted and public.** Logs of a public repo are public, and
  the model's text may be prompt-injected. Print it capped (2,000 chars, with a marker) and with `\p{Cc}`
  escaped, the same way `logSafePath` does (`src/cli.ts`). It never goes into `comment.md`.
- **Security — plain text keeps the fence.** Rewriting the tool results into plain text must not take them
  out of the untrusted zone. They go into a `<file-context path="…">` fence built with the same `fence()` as
  `<review-unit>` (`src/prompts.ts:91`). The model-chosen path is escaped as in `planMetadata`.

## Phase 0: Measure the premise and pre-register the gate

### Overview

No production code changes. Three facts are checked before anything is built, and the gate thresholds are
written down before the first paid call of Phase 4.

### Changes Required:

#### 1. Wire-shape observation (hermetic)

**File**: `packages/code-reviewer/scripts/finder-wire-dump.mjs` (new, throwaway, not committed if it adds
nothing lasting. The hermetic version comes back as a test in Phase 2)

**Intent**: On today's `createReviewer`, with an injected `fetch` returning canned OpenRouter responses (step 1
a tool call, step N a `stop`), write down the request bodies: whether every step carries `response_format`, and
whether the last one (`activeTools: []`) carries `tools` and tool-role messages.

**Contract**: The result goes into `probe-phase0.md` in the change folder: one table, step → {`tools`,
`response_format`, roles in `messages`}. **Falsifier**: if the last step does carry `tools`, then
`prepareFinalStep` does not work as the code reads, and condition 1 needs a different guard (an explicit
`toolChoice: "none"` plus a test). The note records that.

#### 2. Live probe: prompt-carried format on Z.AI

**File**: the same script, `--live` mode (uses `.env`)

**Intent**: Pinned to Z.AI (`only: ["z-ai"]`, `allow_fallbacks: false`, no `response_format`, no tools), ask
for PR #269's review, with the setup from `frame.md` (Probe Results): the worktree at `fca2778`, the diff
recomputed with the workflow pathspec, and the base branch's rules. A system prompt carries the format and
`z.toJSONSchema(reviewResultSchema)`. 5 repeats. Plus 2 repeats with history made of (a) `tool`-role messages
and (b) the same history as plain text, to settle condition 2 empirically.

**Contract**: Confirm the provider slug (`z-ai` vs another notation in `providerMetadata.openrouter.provider`)
and write down, per call: the provider, `finish_reason`, whether the text parses after removing the wrapper,
and cost. **Pre-registered clause (before running)**: _if fewer than 4 of 5 calls return an object that passes
strict validation (without a repair), the direction "prompt-carried format on glm-4.6" is not supported by the
evidence. The plan stops after Phase 1, and the owner decides on the fallback (model swap)._ A failure on
history (a) with a pass on (b) confirms the choice of plain text. A pass on both still keeps plain text as the
provider-independent option.

**Amendment A1 (2026-09-29, owner, before any model response was received).** The clause above is evaluated
**per endpoint**. An API error (e.g. HTTP 429) is not a model response: it is recorded, does not count toward
the 5, and an endpoint that yields no model response gets "unavailable — no format verdict", **not** STOP.
Order after run 1 (Z.AI: 9/9 × 429): Novita, then DeepInfra, then Z.AI again later with the same protocol.
If at least one endpoint passes 4/5, work continues; STOP applies only when no endpoint that answered passes.
BYOK for Z.AI is considered only if the measurements show Z.AI is needed as a production route.

**Amendment A2 (2026-09-29, owner, written before any A2 call).** A separate experiment; it does not
revise run 2's verdict (Novita 1/5 = FAIL for the original configuration). Hypothesis under test: with
reasoning controlled, glm-4.6 on Novita keeps the prompt-carried format.

- **The one change:** the request adds `reasoning: {"enabled": false}` (OpenRouter's unified reasoning
  parameter) and `provider.require_parameters: true`, so an endpoint that cannot honour `reasoning` is
  refused rather than silently ignoring it. Everything else is unchanged from run 2: the same diff (65,455
  bytes), rules, system and user messages, `only: ["novita"]`, `allow_fallbacks: false`, `max_tokens: 16384`.
- **Checking the parameter:** the request body as sent is recorded per call (its `reasoning` and `provider`
  fields). Arrival at the endpoint is judged from the response: `usage.completion_tokens_details.reasoning_tokens`
  must be 0 or absent and `message.reasoning` empty. Anything else means "the parameter did not take effect".
- **Sequence:** call 1 is the control and counts as the first of the 5. Abort the series if it ends
  `finish=length` with empty content, if the parameter did not take effect, or if the request is refused.
  Otherwise calls 2–5 follow.
- **Threshold:** unchanged, ≥ 4/5 strictly valid without a repair, API errors recorded and not counted (A1).
- **History 2+2:** only after the main result is recorded, and only if it passes 4/5. A failed main result
  leaves condition 2 unmeasured rather than spending on it.
- **Spend limit:** $0.15 cumulative for A2 (estimate ~$0.013 per call without reasoning). The series stops
  before any call that could push the running total past the limit at the run-2 worst case ($0.047).

#### 3. Matched cost baseline and gate pre-registration

**File**: `context/changes/finder-serialization-outage/gate.md` (new)

**Intent**: Use the 12 `baseline-glm-4.6` rows (4 cases × 3 repeats) in
`context/archive/2026-08-10-finder-tool-loop-evals/results/2026-08-11-tool-loop-matrix.json` as the
matched cost and quality baseline for the same fixture diffs. Also read the `review cost: finder=$…` lines
from the 17 pre-break production runs (34534771623 … 34783469218), if present, to report the production
median separately. The 12 archived costs currently yield a median of **$0.00100551** and a 3× G4 ceiling
of **$0.00301653** per attempt; recompute and record both in `gate.md` during Phase 0, before any Phase 4
measurement. Write the gate thresholds before any Phase 4 measurement.

**Contract**: `gate.md` has a **Pre-registration** section dated before the first Phase 4 call:

- G1 reliability: PR #269 × 10 per endpoint. **≥ 9/10 attempts** end with a valid object (after ≤ 1 repair).
  The count is over **attempts**, not successful rows: every `FinderOutputError`, timeout and API error counts
  against it. The repair rate is reported separately, as a signal rather than a gate.
- G2 no findings: `evals/fixtures/clean-change.diff` × 5, tool-enabled: **5/5** valid with
  `findings: []`. Any finding, including `minor` or `nit`, fails this clean-case gate.
- G3 quality: run `baseline-glm-4.6` (4 cases × 3 repeats) **pinned per endpoint**. Count all 12
  attempts, including provider errors, timeouts and `FinderOutputError`, as failures for their case.
  The archived glm-4.6 baseline passed `issue_recall` 3/3 on the JS loop and 3/3 on React, and
  `review_fails` 3/3 on React; require the same, plus 3/3 on each of React's three named flaw
  rubrics. The archived cross-hunk case passed neither `tool_required` nor its flaw rubric (0/3);
  record both rates as diagnostic signals, without treating that zero baseline as a quality pass.
  The archived clean case passed `no_false_alarms` 3/3; require the same, while G2
  supplies the stricter zero-finding check. The owner also hand-reads **all findings from successful G1
  attempts for each candidate endpoint**, after deduplicating the same claimed defect at the same
  location. Keep the contributing attempt IDs in `gate.md`; every distinct finding must identify a real
  defect in #269's diff. A rejected hand-read fails G3.
- G4 cost: on the same 12 fixture attempts used by G3, median **total finder cost per attempt**
  (all loop, finalization and repair requests, including failed attempts) **≤ 3×** the archived
  `baseline-glm-4.6` median. An attempt with missing cost telemetry for **any request** fails G4 rather than being
  omitted. Report the median and maximum latency over all attempts; timeouts fail G1.
- G5 live: one scratch PR, whole review green, `finderTelemetry` present, finder steps logged with their
  provider.
- Production median cost, when available, is context only: the production PRs differ in diff size
  from #269 and the fixtures, so it is not G4's denominator. If the old logs have no cost line,
  `gate.md` says so explicitly. The archived matched rows remain G4's denominator.

### Success Criteria:

#### Automated Verification:

- The wire table in `probe-phase0.md` was produced by the script (not written by hand): `node scripts/finder-wire-dump.mjs`
- `gate.md` holds the Pre-registration with all five gates and the baseline value: `grep -c "^- G[1-5]" context/changes/finder-serialization-outage/gate.md` = 5

#### Manual Verification:

- The live probe verdict is written down and accepted by the owner: conditional GO on Novita's A2 (4/5 with reasoning disabled); Z.AI unavailable (429), no verdict
- The owner accepts the thresholds in `gate.md` before Phase 4

**Implementation Note**: STOP from item 2 ends implementation after Phase 1. The following phases are not started without an owner decision.

---

## Phase 1: A failure that can be attributed from the log

### Overview

The finder log states which upstream served each step, how the step ended, and what text was rejected. It works
on today's path and on the new one.

### Changes Required:

#### 1. The step gets a provider and `finish_reason`

**File**: `packages/code-reviewer/src/pipeline.ts`

**Intent**: `FinderStepInfo` gains `provider?: string` (narrowed from `providerMetadata.openrouter.provider`
with the same discipline as `asStepCost`) and `finishReason` (from `step.finishReason`).

**Contract**: `describeFinderStep` returns both. A missing provider means the key is absent, never `""` or
`"unknown"`. Exported `asStepProvider(metadata)` next to `asStepCost`.

#### 2. Step line and failure line in the CLI

**File**: `packages/code-reviewer/src/cli.ts`

**Intent**: `formatFinderStepLine` appends `provider=<x> finish=<y>`. Today the step line is emitted only with
`--source-root`. In CI that is always set, so the scope stays. On a finder failure the CLI prints, besides the
message, a line `finder rejected output (provider=…, finish=…, <n> chars): <text>`, capped at 2,000 chars and
with control characters escaped. The source is `NoObjectGeneratedError.text`/`.finishReason` today and
`FinderOutputError` fields after Phase 2.

**Contract**: A new pure `formatRejectedOutputLine(error)` → `string | undefined` (undefined when the error has no
text: an abort, an auth error). The rejected text goes **only** to stderr, never into `comment.md` or the
step summary.

### Success Criteria:

#### Automated Verification:

- Unit tests: `describeFinderStep` with and without `openrouter.provider`, and with a malformed value (not a string): `npm test -- pipeline`
- Unit tests: `formatRejectedOutputLine` for `NoObjectGeneratedError` with text, a text > 2,000 chars (marker present), a text with ANSI/newlines (escaped), an error without text (→ undefined): `npm test -- cli`
- `npm run lint` and `npm run typecheck` in `packages/code-reviewer`

#### Manual Verification:

- A local CLI run on a small diff shows `provider=` and `finish=` in every step line

---

## Phase 2: Two-stage finder with its own parser

### Overview

The format stops depending on `response_format`. The loop gathers context, the finalization writes the JSON,
we validate it strictly, allow one repair at most, and otherwise raise an explicit error.

### Changes Required:

#### 1. Model-facing text

**File**: `packages/code-reviewer/src/prompts.ts`

**Intent**: Add `buildFinalizationInstructions(lens, options)`: the unchanged reviewer criteria from
`buildInstructions` plus the format section (exactly one JSON object; the schema from
`z.toJSONSchema(reviewResultSchema)`; the `severity` and `category` enum values spelled out; an explicit
`findings: []` when there is nothing to report; no prose around it). Add `buildFinalizationPrompt(unit,
transcript)`: the review unit and the gathering transcript as plain text, with `getFileContext` results in a
`<file-context path="…">` fence. Add `buildFormatRepairPrompt(rejectedText, validationError)`: a format conversion only. It carries the rejected text
(fenced as untrusted) and the validation error, **not** the diff or the transcript, and instructs the model to
re-emit the same findings in the schema without adding, removing or changing any (plan-review F1).

**Contract**: The loop's instructions (`buildInstructions`) stay **unchanged**. The pre-registered sentence
about comments rationalising a defect (`prompts.ts:75`) is not touched. The finalization prompt carries the same
untrusted-data statement as the loop, extended to `<file-context>`.

#### 2. The finder's parser

**File**: `packages/code-reviewer/src/output-repair.ts`

**Intent**: `parseFinderOutput(text)` → `{ ok: true, result } | { ok: false, reason }`: `extractJsonObject` →
`JSON.parse` → `reviewResultSchema.safeParse`, and nothing more. Remove `repairReviewResultShape`,
`repairParsedOutput`, `tolerantReviewOutput` and `REPAIRED_SUMMARY_PLACEHOLDER`, together with their tests.
The judge's part (`extractJsonObject`, `repairParsedJudgeOutput`, `tolerantJudgeOutput`) stays unchanged.

**Contract**: A new `FinderOutputError extends Error` with `text`, `provider?`, `finishReason?`,
`validationError`, and `repaired: boolean` (whether the repair was attempted). It is **not** a
`NoObjectGeneratedError`. Update the file header: the old "why" (tool-active drift under `response_format`)
becomes history, and the new one points to `frame.md`.

#### 3. Two stages in the reviewer

**File**: `packages/code-reviewer/src/reviewer.ts`

**Intent**: The `ToolLoopAgent` loses `output` (it returns text) and keeps `tools`, `stopWhen` and
`prepareFinalStep`. After the loop, `review()` builds the plain-text transcript from `result.steps` (the
assistant text, each tool call as a line, each result in a fence) and makes the finalization call via
`generateText` on the same model with **no** `tools` and **no** `output`. Then it runs `parseFinderOutput`. On
failure it makes one repair call, parses again, and otherwise throws `FinderOutputError`. **No repair** when the
rejected text contains no `{` or the finalization ended `finish=length`: those throw `FinderOutputError` with
`repaired: false` straight away, so a prose or truncated answer can never become `findings: []` or a completed
list (plan-review F1). `normalizeFindings`
works as today on the valid result.

**Contract**:

- `ReviewerOptions` gains `fetch?: typeof fetch`, passed to `createOpenRouter`: a test seam, documented as such.
- `ReviewerOptions` gains an `onFinalizationPrompt` observation hook. `review()` calls it with the exact
  system and user text it passes to `generateText`, after the gathering transcript has been built. The
  eval adapter uses it to show the finalization prompt actually used for JSON formatting; an error
  before finalization is labelled as such instead of displaying the loop prompt as `actualPrompt`.
- `onOutputRepair` changes meaning to "a format repair call was needed" (`reason` = the validation error). Its
  documentation in `ReviewerOptions`, `PipelineInput` and in `evals/finder-provider.ts` (`repairs`) says so.
- The finalization and repair calls report steps through the same `options.onStepEnd`.
- One `AbortSignal` for the whole `review()` (`timeoutMs` combined with `abortSignal`), shared by all requests.
- **Amendment A3 (2026-09-29, owner, from Phase 0 run 2 vs A2):** every finder request — each gathering-loop
  step, the finalization and the format repair — carries `reasoning: {"enabled": false}` in the request body
  (set once on the model as `extraBody: { reasoning: { enabled: false } }`, so it cannot be forgotten on one call.
  Not the provider's typed `reasoning` setting: its type requires `max_tokens` or `effort`
  (`@openrouter/ai-sdk-provider/dist/index.d.ts:388-395`), and `effort: "none"` is a different request from the
  one A2 measured. `extraBody` is spread last into the body (`dist/index.js:3648`); wire test 2.1 pins it). Without
  it glm-4.6 spent the whole 16,384-token budget on reasoning in 7/9 calls (Novita 1/5); with it, 4/5.
- Without a `source` (tool-less reviewer) there is no loop: one finalization call straight on the prompt, with
  the same parser and repair.

#### 4. Eval adapter metadata and prompt

**File**: `packages/code-reviewer/evals/finder-provider.ts`

**Intent**: Add an ordered provider slug for **every** observed finder step to promptfoo metadata, alongside
`steps` and `cost`, on both success and error. Also record whether each step has provider-reported cost, so G4
can reject a partially priced attempt. Use the new `onFinalizationPrompt` hook for `actualPrompt` so the
viewer shows the request that formats the JSON, including the real transcript. Rename the `repairs` description
to format-repair requests; keep counting the `onOutputRepair` callback once per repair request.

**Contract**: Missing or malformed provider metadata stays visibly missing, never becomes the requested slug.
The per-step provider and cost-presence lists each have `steps` entries, including on an error path.
When an attempt ends before finalization, `actualPrompt` says that finalization was not reached and shows the
loop prompt separately. A gate rejects any step whose observed provider does not match its pinned endpoint.

#### 5. Retry

**File**: `packages/code-reviewer/src/retry.ts`

**Intent**: Update the documentation: the finder no longer produces `NoObjectGeneratedError`, and its
`FinderOutputError` is deliberately non-retryable (the repair took over the re-roll's role). The classifier
itself needs no change: `FinderOutputError` fails every condition. The test pins it.

**Contract**: `isRetryableError(new FinderOutputError(…)) === false`. `NoObjectGeneratedError` stays
retryable for the judge.

#### 6. Tests

**Files**: `src/reviewer.test.ts`, `src/output-repair.test.ts`, `src/retry.test.ts`, `src/provider-attempts.test.ts`, `src/pipeline.test.ts`, `evals/finder-provider.test.ts`

**Intent**: A hermetic test with the injected `fetch` captures every request body of a run with one tool call:
the gathering steps have `tools` and **no** `response_format`; the finalization has no `tools`, `tool_choice` or
`response_format`, and no message with `role: "tool"` or with `tool_calls`; the file-context text sits inside the
`<file-context>` fence. Parser tests cover every row of the Definitions table. The provider-attempts test is
adjusted to the new attempt count (a loop without a tool call + finalization = 2 requests; plus the repair = 3;
never more on a format failure).

### Success Criteria:

#### Automated Verification:

- Wire test: the finalization body has no `tools`/`tool_choice`/`response_format`/`role:"tool"`/`tool_calls`: `npm test -- reviewer`
- Wire test (A3): **every** captured request body — loop steps, finalization and repair — carries `reasoning: {"enabled": false}` and `provider.require_parameters: true`: `npm test -- reviewer`
- Parser tests: fence → valid; prose around the object → valid; bare array → invalid; `path` without `file` → invalid; `severity:"WARNING"` → invalid; missing `summary` → invalid; `"No issues found."` → invalid (never `findings: []`); `{"summary":"…","findings":[]}` → valid with an empty list; an example `{}` before the real object → invalid (goes to repair): `npm test -- output-repair`
- Repair: a first invalid response + a valid repair → result, `onOutputRepair` called once; invalid + invalid → `FinderOutputError` with `repaired: true`, exactly 1 repair request; `"No issues found."` (no `{`) and a `finish=length` response → `FinderOutputError` with `repaired: false` and **zero** repair requests; the repair request body contains the rejected text and not the diff: `npm test -- reviewer`
- Retry: `FinderOutputError` is not retried by `withOneRetry` (exactly 1 pass); 429 is still retried: `npm test -- retry pipeline`
- Telemetry: `finderTelemetry.steps` and `cost` include the finalization and the repair: `npm test -- pipeline`
- Eval adapter: provider slugs and cost presence are recorded per step on success and error,
  `actualPrompt` contains the finalization request's text, and `repairs` counts format-repair
  requests: `npm test -- finder-provider`
- Timeout: one budget for the whole `review()` (a fake clock; the timeout during finalization aborts the pass): `npm test -- reviewer`
- The whole package: `npm test`, `npm run lint`, `npm run typecheck` in `packages/code-reviewer`
- Repo formatting: `npm run format:check`

#### Manual Verification:

- A local CLI run on PR #269's diff (setup as in `frame.md`) ends with a valid review or a legible `FinderOutputError` with the rejected text in the log

---

## Phase 3: The finder's own routing

### Overview

The finder stops sharing routing with the judge. Its endpoint list becomes configurable, so the gate can pin
one endpoint at a time and production can run only on the measured ones.

### Changes Required:

#### 1. Finder routing

**File**: `packages/code-reviewer/src/config.ts`

**Intent**: Add `DEFAULT_FINDER_PROVIDERS: readonly string[]` (initially `["novita"]`, a **provisional
Phase 0 probe result** — Novita passed only the A2 probe, 4/5 with reasoning disabled, and holds **no** G1–G4
status; the value exists so local runs in Phases 2–3 do not default to Z.AI, which returned only 429s in
Phase 0. Phase 5 replaces it) and `resolveFinderProviderRouting()` → `{ order, only, allow_fallbacks: true,
require_parameters: true }`, with the env override `OPENROUTER_FINDER_PROVIDERS` (a comma-separated list;
empty or malformed → the default, never unfiltered routing). `DEFAULT_PROVIDER_ROUTING` and its comment stay
for the judge and impl-review, and the comment says the finder has its own.

**Contract**: `require_parameters: true` now filters on `tools` and `reasoning` support, since there is no
`response_format`. An explicit `providerRouting` in `ReviewerOptions` (campaign tooling) still wins.
**Amendment A3 (2026-09-29, owner):** `require_parameters: true` stays on the finder's routing
unconditionally. It is what refuses an endpoint that cannot honour `reasoning: {"enabled": false}` instead of
letting it reason to the token cap, so `OPENROUTER_REQUIRE_PARAMETERS=false` no longer removes it from the
finder (it still does for the judge and impl-review). This supersedes the Wiring contract below where the two
disagree.

#### 2. Wiring

**Files**: `packages/code-reviewer/src/reviewer.ts`, `src/provider-routing.test.ts`, `src/config.test.ts`

**Intent**: `createReviewer` uses `resolveFinderProviderRouting()` instead of `resolveProviderRouting()`.
The tests pin the literal `DEFAULT_FINDER_PROVIDERS` (the same pattern as `DEFAULT_MODEL`), the env parsing
and that the judge still gets `DEFAULT_PROVIDER_ROUTING`.

**Contract**: `OPENROUTER_REQUIRE_PARAMETERS=false` still turns off `require_parameters` for the judge. For the
finder it turns off only that one field, and `only` stays. _(Superseded by Amendment A3 above: the finder keeps
`require_parameters: true` regardless of this variable.)_

### Success Criteria:

#### Automated Verification:

- Tests: default finder routing = `{order:["novita"], only:["novita"], allow_fallbacks:true, require_parameters:true}` (provisional); `OPENROUTER_FINDER_PROVIDERS="deepinfra"` → `only:["deepinfra"]`; `""` and `" , "` → the default; `OPENROUTER_REQUIRE_PARAMETERS=false` leaves the finder's `require_parameters: true` in place (A3); the judge unchanged: `npm test -- provider-routing config`
- `npm test`, `npm run lint`, `npm run typecheck` in `packages/code-reviewer`

#### Manual Verification:

- None beyond the automated ones (Phase 4 exercises the routing live)

---

## Phase 4: Regression gate

### Overview

Measurement against the thresholds pre-registered in Phase 0, starting with Z.AI and then the remaining
endpoints (Novita, DeepInfra, Venice), one at a time, pinned via `OPENROUTER_FINDER_PROVIDERS`.

### Changes Required:

#### 1. Gate runner

**File**: `packages/code-reviewer/scripts/finder-gate.mjs` (new)

**Intent**: Runs `createReviewer` N times on a given diff (with `--source-root`, as in CI, with a 5-step
budget) and writes one JSONL line per **attempt**: the outcome (`valid` / `valid-after-repair` /
`FinderOutputError` / other error with its class), the provider of each step, the number of findings by
severity, cost and time. The summary counts over attempts, never over successful rows (lesson "a guard metric
that only exists on success").

**Contract**: The output goes to the change folder as `gate-<endpoint>-<case>.jsonl` plus a table in
`gate.md`. The rejected texts go into the JSONL (a local file, not a public log).

#### 2. Measurement and record

**File**: `context/changes/finder-serialization-outage/gate.md`

**Intent**: G1–G4 per endpoint (Z.AI first; if it fails, measure the other endpoints for the record).
Run promptfoo with each endpoint pinned through `OPENROUTER_FINDER_PROVIDERS`; compare every observed
step's provider slug in the eval metadata with that pin, including attempts that end in error. A missing or
different slug fails that endpoint's gate, so a fallback cannot silently pass. The owner hand-reads all
deduplicated findings from successful #269 attempts for each candidate endpoint. The **Results** section is
written after the fact and does not edit the Pre-registration.

**Contract**: Every endpoint gets a verdict PASS/FAIL for each of G1–G4. Only endpoints that pass **all four**
go into Phase 5's production list. **If no endpoint passes**: stop, record the finding in `change.md`, and the
owner decides on the fallback (model swap). A failure on **G4 alone** does not trigger the fallback
automatically: it goes to the owner together with the endpoint's per-token prices and the fallback's known cost
ratio (57.6× last cycle), because the G4 baseline was priced at Venice fp4 rates (plan-review F4, gate.md
Amendment G-A1).
**Amendment A3 (2026-09-29, owner):** the gate measures the production request shape — `reasoning:
{"enabled": false}` and `require_parameters: true` on every finder request — with each endpoint pinned in turn
(Z.AI, Novita, DeepInfra, Venice). Every request records `reasoning_tokens`; a request that returns reasoning
tokens or reasoning text means the parameter did not take effect, and that attempt counts as failed for G1–G4.
An endpoint that refuses the request under `require_parameters` is recorded as "cannot honour the production
shape" and does not pass. Phase 0's Novita result is not a gate result: which pinned endpoints pass the whole
gate is decided here.

### Success Criteria:

#### Automated Verification:

- The JSONL files exist for **each candidate endpoint** × {#269 ×10, clean-change ×5}, with one
  record per attempt; the gate table reports every candidate's G1–G4 verdict.
- From `packages/code-reviewer`, repeat for each candidate slug:
  `OPENROUTER_FINDER_PROVIDERS="<slug>" npm run eval -- --env-file .env --no-cache --repeat 3 --filter-providers baseline-glm-4.6 --filter-pattern "^(Finds the material|React 16->19|Cross-hunk contract|Defect-free mechanical rename)"`.
  The filter keeps the four archived cases; `promptfooconfig.yaml` now also has two hardening cases (#143) that
  are not in the archived baseline and would make 18 rows. Each endpoint must yield **exactly 12** rows; any other
  count is a failed run, not a gate result. Hardening cases, if run, are diagnostic only. Confirm that the 12 promptfoo rows have per-step provider metadata matching `<slug>`; a missing or
  mismatched slug is a failed gate, not an unmeasured success.

#### Manual Verification:

- The owner's hand-read of every distinct finding from successful G1 attempts, per endpoint, with
  deduplication and contributing attempt IDs recorded in `gate.md` (G3)
- The owner accepts the list of endpoints that passed, which goes to Phase 5

---

## Phase 5: Production routing, live PR, the record

### Overview

The production list = the endpoints that passed. The live scratch PR closes G5. Pointers to the old facts are
corrected in one commit.

### Changes Required:

#### 1. The endpoint list

**File**: `packages/code-reviewer/src/config.ts`, `src/config.test.ts`

**Intent**: Replace the provisional `["novita"]` with **only** the endpoints that passed the full G1–G4 gate in
Phase 4, each measured pinned on its own (in order of the gate result, Z.AI first if it passed), with a comment
pointing at `gate.md`. Novita stays on the list only if it passes the gate itself; its Phase 0 probe result
does not count. If no endpoint passed, Phase 5 does not run: STOP, per Phase 4's contract.

**Contract**: The literal is pinned by the test. Changing it requires a measurement (the comment says so).

#### 2. Live scratch PR (G5)

**Intent**: A same-repo, non-draft, human-authored PR with a small code change (the `review.yml` conditions),
so the finder really runs. The whole review goes green, and the log has step lines with `provider=` from the list.

**Contract**: The run number and outcome go into `gate.md` (G5). The PR is closed without a merge.

#### 3. Stale pointers (lesson "writing a fact into its canonical home")

**Files** (grep for the old wording: `schema mismatches re-roll`, `re-roll`, `require_parameters`, `repairReviewResultShape`, `envelope repair`, `intermittent`):

- `AGENTS.md`, the CI → AI Code Review paragraph: "schema mismatches re-roll immediately" → the finder does not
  re-roll a format error (one model repair, then an explicit error); the judge does as before.
- `src/config.ts`, the `DEFAULT_PROVIDER_ROUTING` comment ("every STRUCTURED model call").
- `src/reviewer.ts`, the `ReviewerOptions.providerRouting` doc.
- `src/output-repair.ts`, the `repairParsedJudgeOutput` doc ("the same discipline as the finder's", `:169`): the
  finder repair it points to is removed in Phase 2.
- `evals/README.md`: the meaning of `repairs` and a note that the metrics before and after this change are not comparable.
- The headers of `scripts/fabrication-probe.mjs` and `scripts/finder-distribution.mjs`: measurements taken
  before this change used `json_schema` on Venice.
- `temp_steps.md`: the note "intermittent, not constant" (already refuted in `frame.md`).
- `change.md`: the status and the gate result.

**Contract**: The implementer runs the grep with the old wording and lists every hit in the commit. The archive
(`context/archive/…`) is not edited.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run lint`, `npm run typecheck` in `packages/code-reviewer`; `npm run format:check` in the root
- No stale wording: `grep -rn "re-roll immediately\|repairReviewResultShape\|tolerantReviewOutput" AGENTS.md packages/code-reviewer --include=*.ts --include=*.md --include=*.mjs | grep -v node_modules` returns only history entries marked as such (or nothing)

#### Manual Verification:

- The live scratch PR is green with a real finder output (G5) — the owner confirms the run
- The owner's decision on the report to OpenRouter/Venice (a parallel step, not a blocker)

---

## Testing Strategy

### Unit Tests:

- Parser: every row of Definitions, including the negative cases for each former repair.
- Wire: the request bodies via the injected `fetch` (condition 1 checked on the request, not on the settings).
- Transcript: tool calls and results as plain text, the result fenced, a model path with `<`/a newline escaped.
- Retry: `FinderOutputError` terminal, transient errors retried once.
- Telemetry: steps, cost and provider over the finalization and the repair.

### Integration Tests:

- `provider-attempts.test.ts`: the number of provider requests per pass, bounded (loop ≤ maxSteps + finalization + ≤ 1 repair).

### Manual Testing Steps:

1. Phase 0 (done 2026-09-29, `probe-phase0.md`): the live probe with prompt-carried format, 5 repeats + 2×2 on the history. Z.AI returned HTTP 429 on every call (no verdict); Novita as registered 1/5 (reasoning ran to the token cap); Novita A2 with reasoning disabled 4/5 main and 4/4 history.
2. A local CLI run on PR #269 (setup as in `frame.md`).
3. The Phase 4 gate per `gate.md`.
4. The live scratch PR.

## Performance Considerations

The finalization re-sends the diff. For a review with no tool call that means ~2× the input tokens compared with
the single pre-break call. G4 (≤ 3× the archived matched-fixture median) bounds the measured cost on the same
fixture mix; it does not establish a cost bound for every production PR. glm-4.6 spends a lot on reasoning (the frame
saw 1,701–1,920 tokens on a trivial request), and `MAX_OUTPUT_TOKENS` = 16,384 covers it per request.

## Migration Notes

There is no data migration. Rollback = revert the Phase 2–5 commits. `ai-review` is advisory, so a failed
deployment blocks nothing, but it does go back to the "no review" state. Measurements from before and after this
change are not comparable (Phase 5.3).

## References

- Frame: `context/changes/finder-serialization-outage/frame.md`
- Owner decision: `context/changes/finder-serialization-outage/change.md`
- Prior: `context/archive/2026-08-10-finder-tool-loop-evals/`, `context/archive/2026-08-24-finder-provider-routing/`
- Lessons applied (11 of the 30 carrying `plan`): live probe as the gate, ablation from the reproducing artifact (#269),
  a required field vs an optional one, silent degradation, guards counting attempts, no regex grading of prose, the
  provider schema subset, enum vocabulary, stale pointers, a check that says what it found, measuring the premise.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 0: Measure the premise and pre-register the gate

#### Automated

- [x] 0.1 The wire table in `probe-phase0.md` was produced by the script — 6e37867
- [x] 0.2 `gate.md` holds the Pre-registration with all five gates and the baseline — 6e37867

#### Manual

- [x] 0.3 Conditional GO on Novita's A2 (4/5, reasoning disabled); Z.AI 429, no verdict
- [x] 0.4 The owner accepts the thresholds in `gate.md`

### Phase 1: A failure that can be attributed from the log

#### Automated

- [x] 1.1 `describeFinderStep` tests with provider and `finishReason`
- [x] 1.2 `formatRejectedOutputLine` tests (cap, escaping, no text)
- [x] 1.3 Lint and typecheck of `packages/code-reviewer`

#### Manual

- [ ] 1.4 A local CLI run shows `provider=` and `finish=` in every step line

### Phase 2: Two-stage finder with its own parser

#### Automated

- [ ] 2.1 Wire test: a tool-less finalization with no `response_format` and no tool-role messages; `reasoning` disabled on every request (A3)
- [ ] 2.2 Parser tests for every row of Definitions
- [ ] 2.3 Repair tests: one repair, then `FinderOutputError`
- [ ] 2.4 Retry tests: `FinderOutputError` terminal, 429 retried
- [ ] 2.5 Telemetry test: the finalization and the repair counted
- [ ] 2.6 Timeout test: one budget for the whole `review()`
- [ ] 2.7 The whole package: test, lint, typecheck
- [ ] 2.8 Repo formatting `npm run format:check`
- [ ] 2.9 Eval adapter test: per-step providers, finalization prompt, format-repair count

#### Manual

- [ ] 2.10 A local CLI run on PR #269's diff: a valid review or a legible `FinderOutputError`

### Phase 3: The finder's own routing

#### Automated

- [ ] 3.1 Finder routing tests (default, env, malformed, judge unchanged)
- [ ] 3.2 The whole package: test, lint, typecheck

### Phase 4: Regression gate

#### Automated

- [ ] 4.1 JSONL files for every candidate × {#269 ×10, clean-change ×5}
- [ ] 4.2 Pinned promptfoo rows for every candidate endpoint

#### Manual

- [ ] 4.3 The owner's hand-read of all distinct #269 findings per endpoint (G3)
- [ ] 4.4 The owner accepts the list of endpoints that passed

### Phase 5: Production routing, live PR, the record

#### Automated

- [ ] 5.1 The whole package: test, lint, typecheck; `format:check` in the root
- [ ] 5.2 No stale wording (grep)

#### Manual

- [ ] 5.3 The live scratch PR is green with a real finder output (G5)
- [ ] 5.4 The owner's decision on the report to OpenRouter/Venice
