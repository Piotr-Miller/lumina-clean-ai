---
change_id: finder-serialization-outage
title: The ai-review finder stopped returning parseable output on 2026-09-20 — find out whether the incumbent is recoverable before paying for a replacement
status: new
created: 2026-09-24
updated: 2026-09-24
archived_at: null
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
**routing** error, not a model failure, which did not recur across 12 matrix rows. If the
current break is the same class, a provider pin or a `require_parameters` setting restores
`glm-4.6` at **no cost increase at all**, and no eval cycle is needed.

So the order is: establish whether this is the model or the route, and only then shop.

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

### Not in scope

Making `ai-review` required, changing what the finder reviews, and the `REVIEW_FINDER_MAX_STEPS`
budget — the last cycle established that a bigger budget only buys duplicate reads on a
synced-tree diff. Keeping the check advisory is the owner's standing decision (2026-09-24).
