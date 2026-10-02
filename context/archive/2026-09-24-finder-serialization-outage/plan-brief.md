# Finder output without `response_format` — Plan Brief

> Full plan: `context/changes/finder-serialization-outage/plan.md`
> Frame brief: `context/changes/finder-serialization-outage/frame.md`

## What & Why

> The only OpenRouter endpoint that will take our `json_schema` request for `z-ai/glm-4.6` is Venice, and Venice
> no longer applies `response_format` at all, even though it still advertises `structured_outputs`. The finder
> receives free-form markdown and cannot parse it. The route did not change; the available evidence does not
> distinguish a change in Venice's serving from a model revision.

As a result `ai-review` has produced no review since 2026-09-20 (35/35 failures). The owner decided to keep
`glm-4.6` and move the format into the prompt, parsing it on our side. A model swap is the fallback.

## Starting Point

The finder is a single `ToolLoopAgent` with `output: Output.object`. In `ai@7.0.52` that `output` puts
`response_format` into **every** step, and the last, "tool-less" step still carries the tool-role history. The
finder's envelope repair fills in data (a placeholder summary, `warning`→`major`). Routing is shared with the
judge. The log does not name the provider or the rejected text.

## Desired End State

The finder gathers context in a loop with no `output`. A separate request with no tools, no `response_format`
and a plain-text history then writes the JSON, which we validate strictly: one model repair at most, then an
explicit error. The finder routes only among endpoints that passed the gate. Every step in the log names the
provider and the `finish_reason`, and a failure shows the rejected text.

## Key Decisions Made

| Decision                 | Choice                                                                                                                                                             | Why (1 sentence)                                                                                                                                             | Source                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Direction                | Keep glm-4.6, format in the prompt, our parser                                                                                                                     | The observed Venice response ignores `response_format`, and routing will not send `json_schema` anywhere else                                                | Frame / owner                                      |
| Finalization             | A separate request with no `tools` or `response_format`, verified on the wire body                                                                                 | Condition 1: "configured" is not proof of "sent"                                                                                                             | Owner                                              |
| Tool history             | Rewritten as plain text, results fenced as untrusted                                                                                                               | Independent of the provider; the probe saw a tool call on a tool-less step                                                                                   | Plan (condition 2)                                 |
| Work on our side         | Only removing the wrapper (fence/prose); malformed JSON goes to a format-only model repair (rejected text + error, no diff); no `{` or `finish=length` → no repair | Condition 3: no filled-in data; the old repair goes                                                                                                          | Plan (user answer)                                 |
| Failure after the repair | `FinderOutputError`, not retried (transient errors still are)                                                                                                      | Bounded cost; the frame showed both attempts failing identically                                                                                             | Plan (user answer)                                 |
| Finder routing           | Its own: `order` + `only` = endpoints that passed the gate                                                                                                         | Production only on measured endpoints, and more than one upstream                                                                                            | Plan (user answer)                                 |
| Gate                     | G1 ≥9/10 on #269; G2 5/5 valid with `findings: []`; G3 matched fixture quality + all distinct #269 findings per endpoint; G4 matched fixture cost ≤3×; G5 live PR  | Pre-register before measuring; count failed attempts and admit only endpoints passing G1–G4; a G4-only failure goes to the owner with endpoint prices (G-A1) | Plan (user answer; thresholds clarified in review) |

## Scope

**In scope:** a two-stage finder, the parser and one repair, `FinderOutputError`, the finder's own routing,
provider/`finish_reason`/rejected text in the log, a gate runner, the gate, a live PR, correcting the pointers.

**Out of scope:** changing the model, the judge and impl-review, `REVIEW_FINDER_MAX_STEPS`, the advisory status of
`ai-review`, porting the campaign scripts, waiting on Venice.

## Architecture / Approach

`review()` = loop (`tools`, no `output`) → plain-text transcript from `result.steps` → `generateText` with no tools
and no `output` (the format and JSON Schema in the system prompt) → `extractJsonObject` → strict
`reviewResultSchema` → [on failure: 1 repair call] → result or `FinderOutputError`. One `AbortSignal` over the whole
pass, and every request counted in `finderTelemetry`. The eval adapter records the serving provider per step
and displays the actual finalization prompt; Phase 4 runs its fixture evaluation with one endpoint pinned at a time.

## Phases at a Glance

| Phase            | What it delivers                                                                                                                    | Key risk                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 0. Premise       | **Done (`6e37867`), conditional GO:** wire table; Z.AI 429 (no verdict); Novita 1/5 as registered, 4/5 with reasoning disabled (A2) | Reasoning runaway unless disabled                            |
| 1. Observability | Provider, `finish_reason` and the rejected text in the log                                                                          | Untrusted text in a public log: cap + escaping               |
| 2. Two stages    | Our finalization, parser, repair, terminal error                                                                                    | Cost ~2× input; the transcript must keep the untrusted fence |
| 3. Routing       | The finder's own endpoint list + env override                                                                                       | Breaking the judge's routing                                 |
| 4. Gate          | G1–G4 per endpoint, Z.AI first                                                                                                      | No endpoint passes → fallback                                |
| 5. Production    | The list from the gate, live PR (G5), pointers corrected                                                                            | Stale pointers in AGENTS.md/README                           |

**Prerequisites:** an OpenRouter key in `packages/code-reviewer/.env` (already there); the PR #269 worktree at `fca2778`.
**Estimated effort:** ~3–4 sessions; gate spend in cents to low dollars (glm-4.6).

## Open Risks & Assumptions

- Phase 0 (2026-09-29): the prompt-carried format holds on Novita **only with reasoning disabled** (A2: 4/5; without it 1/5, reasoning ran to the 16,384-token cap). Z.AI returned only 429s and has no verdict; DeepInfra is unmeasured. Every finder request therefore carries `reasoning: {enabled: false}` under `require_parameters: true` (A3). The finder's default list is a provisional `["novita"]` for local runs in Phases 2–3, with no G1–G4 status; Phase 5 replaces it with only the endpoints that pass the full gate, or STOP.
- The finalization re-sends the diff. G4 compares all-request finder cost on the same 12 fixture attempts against the archived 2026-08-10 glm-4.6 rows (median $0.00100551; 3× ceiling $0.00301653, to be recorded in Phase 0). Pre-break production logs provide context when they have cost lines; unrelated PR sizes are not the gate denominator.
- Existing campaign-script results are not directly comparable after this change. G3 and G4 compare the unchanged fixture cases with the archived baseline and report their limits.
- Why Venice stopped applying `response_format` stays unknown; that does not change the plan.

## Success Criteria (Summary)

- A PR with a code change gets a real `ai-review` again from glm-4.6; the matched fixture median finder cost stays within 3× the archived baseline.
- A format failure is legible from the log (provider, `finish_reason`, the text) and never passes as "no findings".
- The finalization's wire body demonstrably carries neither `tools` nor `response_format`.
