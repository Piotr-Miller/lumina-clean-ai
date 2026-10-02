---
change_id: finder-serialization-outage
title: The ai-review finder stopped returning parseable output on 2026-09-20 — find out whether the incumbent is recoverable before paying for a replacement
status: archived
outcome: completed
created: 2026-09-24
updated: 2026-10-02
archived_at: 2026-10-02T21:13:08Z
archive_commit: 1917728
sync: none
---

## Notes

`ai-review` carries no signal about code today. The finder has run 15 times since
2026-09-20 and failed 15 times with `AI_NoObjectGeneratedError` / "No object generated:
could not parse the response"; it has succeeded **zero** times. Every green `review.yml` run
since the break is the `SKIP_REVIEW` branch on a docs-only PR — a `skipped` step, not a pass.
The check is advisory (master requires only `ci`, `integration`, `e2e`, `code-reviewer`),
so nothing is blocked; what is lost is the review itself.

### The observation, separated from its presumed cause

|                          |                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Finder ran and succeeded | 13/13 on 2026-09-13                                                                                     |
| Finder ran and failed    | 15/15 from 2026-09-20 to 2026-09-24                                                                     |
| Content dependence       | none — prose, source, YAML and JSON all fail the same way                                               |
| Shape dependence         | none — four earlier `chore/pin-ai-toolkit-*` PRs of the exact shape that fails now passed on 2026-09-13 |

**Nothing on our side changed across the break**, checked rather than assumed:

- `packages/code-reviewer` last changed 2026-09-08, twelve days before the first failure.
  The one commit inside the window (`926df0c`, the prose pathspec) is a response to the
  break, not a cause — it landed after it.
- The composite action installs with `npm ci`, and `packages/code-reviewer/package-lock.json`
  is untouched since before 2026-09-08: `ai@7.0.52`, `@openrouter/ai-sdk-provider@3.0.0`.
- `OPENROUTER_REVIEW_MODEL` has read `z-ai/glm-4.6` since 2026-08-08.

A clean break with no change on our side points outward — to `glm-4.6`'s structured-output
behaviour on OpenRouter, or to OpenRouter's routing for it. That is where this change starts.

### Why the cheapest question comes first

The instinct is to pick a replacement model. That skips a cheaper possibility nobody has
tested: **the incumbent may be recoverable.** The `finder-tool-loop-evals` probe already hit
`structured_outputs not supported in your workspace` on `claude-haiku-4.5` — an OpenRouter
**routing** error, not a model failure, which did not recur across 12 matrix rows. The
hypothesis at opening was that, if the current break were the same class, a provider pin or a
`require_parameters` setting would restore `glm-4.6` at no cost increase. **`frame.md` refuted
it** (correction below): `require_parameters: true` was already in force for every failing run,
so it cannot be the fix, and pinning Venice is the failing route itself.

So the order is: establish whether this is the model or the route, and only then shop.

> **Correction (2026-09-28, `frame.md`).** Neither cheap lever is available. `require_parameters:
true` has been the production default since 2026-08-24 (`packages/code-reviewer/src/config.ts`)
> and was in force for every failing run. OpenRouter Logs show Venice served `glm-4.6` on both
> sides of the break, and it is the only endpoint advertising `structured_outputs`, so pinning it is
> the status quo. Pinning any other provider means giving up schema enforcement. The failure is also
> constant, not intermittent: 35/35 finder runs from 2026-09-20 to 2026-09-28.

### What the last cycle says about shopping, if it comes to that

`context/archive/2026-08-10-finder-tool-loop-evals/decision.md` kept `glm-4.6` and declined
`anthropic/claude-sonnet-5` at a matched-baseline **57.6×** the production cost per review —
the finder is a tool loop on every PR, unlike the judge and impl-review passes, which are
single tool-less calls and already run sonnet-5. Two constraints carry forward:

1. **A cheap candidate must be judged on quality, not on emitting valid JSON.** Sonnet-5 was
   the only live-probed model that converted out-of-hunk context into a correct verdict.
2. **Fixtures do not predict live behaviour.** `deepseek-v4-flash-0731` fetched on 6/6
   tool-enabled fixture rows and 0/3 live runs; `haiku-4.5` cleared the fixture bar and then
   failed live. `evals/README.md` states the rule: passing the cross-hunk case is necessary,
   not sufficient — **a live scratch-PR probe is the actual gate.**

### The weighting this cycle should change

Last cycle measured schema reliability as one axis among six, and an **8.3%** single-attempt
failure rate was enough to make `haiku-4.5` the weakest recommendation — notably on a repeat
that _had already fetched the file before failing to serialize, so the cost was paid and the
review was lost._ Production has now shown that axis is the one that decides whether a review
exists at all, at a 100% rate rather than 8.3%. **Schema reliability under repeats should
outweigh recall in this cycle**, and a candidate's failures should be attributed to the model
or to OpenRouter routing separately — otherwise a usable cheap model gets rejected for
someone else's fault.

### Owner decision (2026-09-28, after `frame.md`)

**Direction: keep `glm-4.6`, carry the output format in the prompt, and parse on our side.**
`frame.md` (Probe Results) is the evidence: Venice, the only endpoint OpenRouter routes `json_schema`
to for this model, no longer applies `response_format`. A model swap stays the **fallback**, taken
only if the gate below fails. A report to OpenRouter/Venice is prepared in parallel. It is not a
dependency.

Conditions the plan must meet:

1. **The finalization is a separate request with neither `tools` nor `response_format`.** Verify it
   on the request the SDK actually sends, not on the settings. The probe saw the last step come back
   as a tool call although `prepareFinalStep` had set `activeTools: []`. Whether the SDK still sent
   the tools is unverified, which is why "configured tool-less" is not evidence of "sent tool-less".
2. **The tool-less finalization must cope with tool results in the history.** Either rewrite the
   earlier tool calls and results as plain text, or verify that both Z.AI and Venice accept
   tool-role messages in a request that declares no tools.
3. **Strict validation after the parse.** Stripping a wrapper such as a markdown code fence is
   allowed. Filling in missing data, or turning a failure into an empty findings list, is not. Allow
   at most one format-repair attempt, then an explicit error.
4. **Z.AI (first-party) is the first endpoint to test.** A request that Z.AI accepts proves the
   endpoint is available, not that the finder is reliable on it.
5. **A regression gate covering quality and cost:** repeats on PR #269's diff, a no-findings case,
   and a live scratch PR. It measures the validation pass rate, how often repair is needed, finding
   quality, cost and latency.

**Correction to "no eval cycle is needed"** (Why the cheapest question comes first): that held only
for a routing-only fix. This change alters the prompt and the finalization, and probably the
provider, so a **bounded regression evaluation** is required. A full new-model comparison is not.

### Not in scope

Making `ai-review` required, changing what the finder reviews, and the `REVIEW_FINDER_MAX_STEPS`
budget — the last cycle established that a bigger budget only buys duplicate reads on a
synced-tree diff. Keeping the check advisory is the owner's standing decision (2026-09-24).

### Phase 4 result: no endpoint passes the gate (2026-10-02)

The regression gate (`gate.md`) measured `z-ai/glm-4.6` with the prompt-carried format on all four
OpenRouter endpoints. **None meets the whole of G1–G4.**

- **z-ai:** fails G2 (2/5, HTTP 429) and G3 (stale closure 2/3).
- **deepinfra:** fails G1 (5/10, HTTP 429) and G2 (4/5).
- **venice:** fails G2 (3/5) and G3 (2/3).
- **novita:** passes every automated gate, including A3 with both reasoning channels re-measured (Supplement
  A3-F1). It fails G3's hand-read: 10 of its 50 distinct #269 findings are rejected as not real defects,
  and the other 40 are unresolved.

The format fix itself works: across all four endpoints, every finalization that answered parsed strictly,
after at most one repair. What fails is availability (the 429s) and review quality (false or unproven
findings), not serialization.

**Owner decision (4.3 / 4.4, 2026-10-02):** the admitted list is empty, Phase 5 does not start, and the path
chosen is the **model swap fallback**. This does not approve any particular replacement. A replacement is
measured before it is admitted. Phase 4 spent $1.538486 of the $2.30 limit.

**Reservation, from the owner:** G3's hand-read clause ("every distinct finding must identify a real defect
in #269's diff") **has no baseline**. The archived glm-4.6 cycle never applied it to #269, so no measured
configuration has ever met it. **Before any replacement is measured, the clause must be redefined as a
pre-registered, measurable threshold.** For example: a stated maximum share of rejected findings, who reads
them, and how unresolved rows count. Measuring a candidate against the current clause would test it against
a bar no configuration has been shown to clear.

### Result (2026-10-02)

- **The cause is removed in code.** Venice ignores `response_format`. Phases 1–3 take it out of the
  finder: the format is carried in the prompt, a tool-less finalization is parsed and strictly validated
  on our side, with at most one repair. Nothing in that path depends on the model or on an endpoint
  honouring `response_format`, so it carries over to a replacement model. Measured on `glm-4.6` only:
  G1 10/10 on z-ai, novita and venice, including Venice, the endpoint that caused the outage (`gate.md`).
- **No `glm-4.6` endpoint was admitted** (`gate.md`, 4.3 / 4.4). The path taken is the **model swap**,
  in the successor change **`finder-model-swap`**. Phase 5 was reduced to this close-out; G5, the live
  scratch PR, was **not run** and moves to the successor.
- **The code is NOT merged to `master`.** Production still runs the pre-change finder, which fails on
  every non-docs PR. Whether to deploy Phases 1–3 in the interim (with the provisional `["novita"]`
  routing, which did not pass G3) is an **open decision for the owner**.
- **Follow-up T2** (a bounded log of the stage-1 text in CI) moves to `finder-model-swap`, together with
  the report to OpenRouter/Venice (old 5.4).
