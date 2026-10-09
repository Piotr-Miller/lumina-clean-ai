# Phase 0 — premise measured before the code

> Plan: `context/changes/finder-serialization-outage/plan.md`, Phase 0.
> Instrument: `packages/code-reviewer/scripts/finder-wire-dump.mjs` (hermetic by default; `--live` is paid).

## 1. What today's finder puts on the wire (hermetic, 2026-09-29)

Produced by `npx tsx scripts/finder-wire-dump.mjs` against today's `createReviewer`, with `globalThis.fetch`
stubbed to return canned OpenRouter completions. `ai@7.0.52`, `@openrouter/ai-sdk-provider@3.0.0`.

| Scenario                                                         | Step | `tools`        | `tool_choice` | `response_format` | roles in `messages`              | assistant `tool_calls` in history |
| ---------------------------------------------------------------- | ---- | -------------- | ------------- | ----------------- | -------------------------------- | --------------------------------- |
| A: tool call on step 0, forced tool-less final step (maxSteps 2) | 0    | getFileContext | "auto"        | json_schema       | system → user                    | false                             |
| A: tool call on step 0, forced tool-less final step (maxSteps 2) | 1    | absent         | absent        | json_schema       | system → user → assistant → tool | true                              |
| B: model answers on step 0 without a tool call (maxSteps 5)      | 0    | getFileContext | "auto"        | json_schema       | system → user                    | false                             |

**Read:**

- `response_format: json_schema` is on **every** request, tool steps included. While the agent carries
  `output`, no finder request is free of it. Condition 1 therefore needs the loop to lose its `output`.
- `prepareFinalStep` works as the code reads: the final step carries **no** `tools` and no `tool_choice`.
  **The falsifier did not fire**, so no extra `toolChoice: "none"` guard is needed for that reason.
- The final step's history still carries the assistant `tool_calls` and a `tool`-role message. That is the
  shape condition 2 is about, and it is on the wire today.
- In scenario B the model's first answer is sent with `tools` declared. An answer given on a step with tools
  can never satisfy condition 1, which is why the plan always runs a separate finalization.

## 2. Live probe on Z.AI (paid)

Endpoint slugs confirmed 2026-09-29 from `GET /api/v1/models/z-ai/glm-4.6/endpoints`:

| Provider  | Tag             | Quantization | `response_format` | `structured_outputs` | `tools` |
| --------- | --------------- | ------------ | ----------------- | -------------------- | ------- |
| Venice    | `venice/fp4`    | fp4          | yes               | yes                  | yes     |
| DeepInfra | `deepinfra/fp4` | fp4          | no                | no                   | yes     |
| Novita    | `novita/bf16`   | bf16         | yes               | no                   | yes     |
| Z.AI      | `z-ai/fp4`      | fp4          | no                | no                   | yes     |

Input, set up as CI ran PR #269: the diff `git diff 3d0adc1...fca2778` with the workflow's EXCLUDES
(**65,455 bytes**, identical to CI), the rules `git show 3d0adc1:.github/ai-review-rules.md` (2,929 bytes),
and a worktree at `fca2778` for the fetched file. Pinned `provider: {only: ["z-ai"], allow_fallbacks: false}`,
no `response_format`, no `tools`, `max_tokens: 16384`.

**Pre-registered clause** (from the plan, before running): _if fewer than 4 of 5 calls return an object that
passes strict validation (without a repair), the direction "prompt-carried format on glm-4.6" is not supported
by the evidence; the plan stops after Phase 1 and the owner decides on the fallback._ An API error is not a
model response and cannot satisfy or refute this clause; it is recorded as unavailability.

### Run 1 — 2026-09-29

All 9 calls (5 prompt-format, 2 tool-role history, 2 plain-text history) returned **HTTP 429**,
`z-ai/glm-4.6 is temporarily rate-limited upstream`, in 0.56–0.99 s. No call reached the model, no tokens
were billed. **No verdict.**

### Availability checks — 2026-09-29

A trivial request (`Reply with the JSON object {"ok": true}`), pinned per endpoint, to separate a short
blip from a lasting limit:

| When (UTC)                      | Endpoint | Result                                                                |
| ------------------------------- | -------- | --------------------------------------------------------------------- |
| ~90 s after run 1               | `z-ai`   | HTTP 429, rate-limited upstream                                       |
| 18:18:12Z (~12 min after run 1) | `z-ai`   | HTTP 429, rate-limited upstream                                       |
| 18:18:13Z                       | `novita` | HTTP 200, provider Novita, `finish=stop`, `{"ok": true}`, $0.00038665 |

**Read:** Z.AI through OpenRouter's shared pool stayed unavailable for at least 12 minutes; the model itself
is reachable on Novita at the same moment. The limit is specific to the Z.AI endpoint, not to the account or
the model. OpenRouter's message points to bring-your-own-key as the way past it. Under G1 a 429 counts
against the endpoint, so a lasting shared-pool limit is itself a finding about Z.AI as a production route.

### Run 2 — Novita, 2026-09-29 (plan Amendment A1)

Same input and messages as run 1, pinned `only: ["novita"]`. Every call was served by Novita (HTTP 200).

| Label              | #   | `finish` | out tokens (reasoning) | text chars | Strict check                                            | Cost     |
| ------------------ | --- | -------- | ---------------------- | ---------- | ------------------------------------------------------- | -------- |
| prompt-format      | 1   | length   | 16,384 (16,384)        | 0          | INVALID — no JSON                                       | $0.04713 |
| prompt-format      | 2   | stop     | 13,217 (12,849)        | 1,496      | **VALID** — 2 findings [minor, nit], fenced ` ```json ` | $0.03132 |
| prompt-format      | 3   | length   | 16,384 (16,384)        | 0          | INVALID — no JSON                                       | $0.04713 |
| prompt-format      | 4   | length   | 16,384 (16,384)        | 0          | INVALID — no JSON                                       | $0.03829 |
| prompt-format      | 5   | length   | 16,384 (16,384)        | 0          | INVALID — no JSON                                       | $0.03829 |
| history-tool-role  | 1   | length   | 16,384 (16,384)        | 0          | INVALID — no JSON                                       | $0.03856 |
| history-tool-role  | 2   | length   | 16,384 (16,384)        | 0          | INVALID — no JSON                                       | $0.03856 |
| history-plain-text | 1   | length   | 16,384 (16,384)        | 0          | INVALID — no JSON                                       | $0.03857 |
| history-plain-text | 2   | stop     | 10,982 (10,643)        | 1,478      | **VALID** — 2 findings [major, minor], fenced           | $0.02669 |

Total spend **$0.344543** (the plan expected cents; the reasoning cap made each call ~40× a pre-break review).

**Verdict under the pre-registered clause (A1, per endpoint): Novita 1/5 → FAIL** for the protocol as
pre-registered. Condition 2 is not settled: 1/2 vs 0/2 on a run where both variants mostly never answered.

**What the failures are — and are not.** In 7 of 9 calls the model spent the entire 16,384-token budget on
**reasoning** and emitted no content (`finish=length`). In both calls that did finish, the content was a valid,
fenced JSON object that passed the strict schema. So the observed failure is **reasoning runaway**, not the
model ignoring a prompt-carried format; when it answers, it answered in the format. Pre-break production
finder calls emitted 37–661 output tokens in total (`src/config.ts` notes, `frame.md`), so reasoning was
evidently not engaged on that route — a reasoning setting is the property this probe varied without meaning to.

This is a finding, not a pass: the clause was pre-registered on "valid without a repair", and 1/5 misses it.
Whether constraining reasoning changes the result is a **new** measurement that needs its own pre-registered
amendment before it runs.

### Run 3 — Amendment A2: Novita with reasoning disabled

Pre-registered in `plan.md` (Amendment A2) before any call: `reasoning: {"enabled": false}` +
`provider.require_parameters: true`, otherwise run 2's input unchanged; call 1 is the control (abort on
`finish=length` with empty content, on reasoning tokens or reasoning text in the response, or on refusal);
threshold ≥ 4/5; history 2+2 only after a passing main result; spend limit $0.15.

**Results (2026-09-29).** Every request went out with `reasoning: {"enabled": false}` and
`provider: {only: ["novita"], allow_fallbacks: false, require_parameters: true}` (recorded per call), and
every response was served by Novita with `reasoning_tokens = 0` and no reasoning text.

| Stage              | #   | `finish` | out tokens | Strict check                                                                            | Cost     |
| ------------------ | --- | -------- | ---------- | --------------------------------------------------------------------------------------- | -------- |
| main (control)     | 1   | stop     | 942        | **VALID** — 5 findings [major, minor, nit, nit, minor]                                  | $0.00432 |
| main               | 2   | stop     | 1,136      | **VALID** — 8 findings                                                                  | $0.00474 |
| main               | 3   | stop     | 1,117      | INVALID — `JSON.parse: Bad escaped character` (the model wrote ``\` `` inside a string) | $0.00470 |
| main               | 4   | stop     | 474        | **VALID** — 3 findings                                                                  | $0.00329 |
| main               | 5   | stop     | 1,309      | **VALID** — 7 findings                                                                  | $0.00512 |
| history-tool-role  | 1   | stop     | 1,083      | **VALID** — 7 findings                                                                  | $0.00467 |
| history-tool-role  | 2   | stop     | 1,220      | **VALID** — 8 findings                                                                  | $0.00498 |
| history-plain-text | 1   | stop     | 981        | **VALID** — 6 findings                                                                  | $0.00446 |
| history-plain-text | 2   | stop     | 979        | **VALID** — 6 findings                                                                  | $0.00445 |

- **Control: PASSED** — `finish=stop`, content present, the parameter took effect.
- **Main: 4/5 valid without a repair → PASS** under A2's threshold. Every valid answer came fenced in
  ` ```json `, which the wrapper rule strips. The one failure is malformed JSON (an invalid escape),
  not prose and not an empty answer — the class the single format repair exists for.
- **History (condition 2): 2/2 tool-role, 2/2 plain text.** Novita accepts tool-role messages in a request
  that declares no tools, and returned no tool call in either variant. The run does **not** discriminate the
  two options; plain text stays the plan's choice because it does not depend on each endpoint accepting
  tool-role messages (Z.AI and DeepInfra are unmeasured).
- **Spend:** A2 total **$0.040736** (main $0.022172, history $0.018564), within the $0.15 limit. Median main
  call **$0.00470**, i.e. ~2.3× the pre-break production median ($0.002038) for a single tool-less call on
  a 65 KB diff — context only; G4 is measured on the matched fixtures.

**Phase 0 verdict:** the direction "prompt-carried format on glm-4.6" is **supported, conditionally on
reasoning being disabled** (A2: Novita 4/5). Without that control it fails (run 2: Novita 1/5). Z.AI:
unavailable (429), no verdict; DeepInfra: not measured. Phase 0 spend in total: **$0.385666** (run 2
$0.344543, A2 $0.040736, availability check $0.000387).

**Consequence for the later phases (not yet written into their contracts):** the finder's requests — the
loop, the finalization and the repair — must carry `reasoning: {"enabled": false}`, and the finder's routing
must keep `require_parameters: true` so an endpoint that cannot honour it is excluded rather than silently
reasoning to the token cap.
