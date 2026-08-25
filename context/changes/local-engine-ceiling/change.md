---
change_id: local-engine-ceiling
title: Calibrate the local engine against the frozen cloud bar — the gap is a product feature, so find where the line should sit
status: new
created: 2026-08-25
updated: 2026-08-25
archived_at: null
issue: 188
---

## Notes

**Non-roadmap change, `phase:post-mvp`. Registered, deliberately NOT ready to plan** — it is blocked on
inputs only the maintainer can supply (see "What has to exist first").

`idea-notes.md` already counts "local engine produces a visible improvement" as a met MVP success
criterion, so nothing here discharges a PRD promise.

**And "make Local as good as possible" is the wrong goal — the PRD says so in as many words.** The gap
to Cloud is not an unbuilt feature, it is the business model:

> "Local-as-acquisition is a deliberate funnel; the visible quality gap to Cloud is the upgrade
> incentive." (`prd.md` §83)
>
> "Local is the free taste — **it should NOT be too good**. The visible quality gap is the upgrade
> incentive for Cloud." (`prd.md` §116)
>
> "No advanced Local engine … The visible quality gap to Cloud is intentional and motivates the
> upgrade." (`prd.md` §Non-Goals)

So the open question is **not** how much of the gap can be closed. It is **calibration**, and it has
never been answered with a number: _where does the local engine actually sit between "too weak to be a
convincing free taste" and "good enough that nobody upgrades", and is that where the product wants it?_

Both failure directions are real and neither is currently measured. Too weak, and the free tier makes
the whole product look amateur — the first impression most visitors ever get, since Cloud is
auth-gated. Too strong, and the funnel the PRD designed stops working.

Today the local engine is `src/lib/engines/local-engine.ts` — **63 lines**, a native `ctx.filter`
Gaussian blur plus a gamma LUT, described in its own header as "a deliberately-naive pass". The
recommendation layer (`auto-params.ts`, 160 lines) computes per-image parameters deterministically from
sampled luma, with no network.

### Two proposals, one rejected — with the reason recorded so it is not re-proposed blind

**Rejected: replace the Replicate call with a loop of vision models that judge the image until it is
good.** It does not work, for a reason that is structural rather than a matter of tuning: **a critic
judges, it does not transform.** A vision model can say "this one has less shadow noise"; it cannot
produce the denoised pixels. That leaves two ways to close the loop, and both defeat the premise:

- a vision model that _outputs_ images is the same class of thing as Bread, so the Replicate dependency
  is swapped, not removed — for a general-purpose model doing a task Bread is specialised for;
- our own engine as the producer with a model as the judge means **N metered calls per photo instead of
  one**. `CLOUD_DAILY_CAP` (3, global, `0` = kill-switch) exists precisely because metered operations
  are this product's main cost risk; an iterative runtime loop multiplies that risk by the iteration
  count and adds latency to a flow whose selling point is "instantly, right in your browser".

"Until it reaches perfection" is also not a stop condition. The `gauntlet-loop` skill requires a ceiling
agreed before the first builder runs, and "perfection" is not a bar — **the frozen Bread output on the
same photo is**.

**Accepted, and it is the same idea moved to the right place: run the loop at authoring time and ship
only its result — but with the loop's objective inverted.** The builder changes the engine (parameters, the `auto-params.ts` heuristics, possibly
the algorithm); the critic compares our output blind against the frozen Bread output for the same photo;
what reaches production is **constants and code**. Zero runtime model calls, zero per-user cost, no new
dependency. This is domain **B** in `.claude/skills/gauntlet-loop/references/bars.md`, which already
names the frozen cloud result as the strongest bar this repository has.

### Why this domain is worth the loop when the last one was not

Run 13 of the skill's eval (`references/eval-matrix.md`) measured that a blind A/B **fails for domain A**:
our own UI identifies itself by its feature set, so a critic inside this repo always knows whose page it
is judging. **Domain B does not have that problem.** The artifacts are output photographs — no brand, no
product fingerprint, nothing to recognise. This is the one place where the method's central mechanism
actually delivers what it claims.

### The judging design: one referee and one preference critic, deliberately

Vision models are a reasonable instrument of taste and a poor instrument for noise — contrast and
saturation talk them round. So the piece gets two judges:

- **Referee, deterministic:** SSIM/PSNR of our output against the frozen Bread output for the same
  photo. A number, reproducible across rounds, immune to persuasion.
- **Preference critic, blind:** which image a person who took that photo on a phone would rather keep.

Disagreement between them is itself the finding. If the metric climbs while the preference critic prefers
the other side, the loop is optimising the metric instead of the impression — the exact failure a
single-judge setup would hide.

### The inversion that makes this different from a normal gauntlet run

A gauntlet round normally pushes until our output beats the bar. **Here, beating the bar would be a
product failure.** The frozen Bread output stays the reference — it is the only honest yardstick for
"how far apart are these two" — but the objective is a _position_ relative to it, not a win. Any round
whose verdict is `WINS` on a night photo is a signal to stop and re-read `prd.md` §116, not to
celebrate.

That has to be written into the run's Step 0 goal, or a lead following the skill's default instinct will
optimise straight through the funnel. It is also worth flagging back to the skill: `bars.md` §B frames
domain B as closing the distance to the cloud result, which is the right mechanic and the wrong
objective **for this product**.

### The ceiling this is meant to measure — and the decision it does NOT make

Blur masks noise; it does not restore detail. Parameter tuning therefore cannot make a gamma-plus-blur
pass rival a model. Closing the remaining gap would need the techniques `idea-notes.md` keeps **out of
MVP scope**: OpenCV.js, WASM, a Web Worker, CLAHE, NLM denoising, WebGPU.

**And the decision is already recorded, in stronger terms than "not yet built".** `roadmap.md` §Parked
says of the advanced local engine: _"the quality gap to Cloud is **intentional**; Local stays naive
(gamma + Gaussian blur)"_. So this change is not filling a gap nobody has considered — it measures how
much room exists **inside** a deliberate design choice.

**This change does not reopen that decision, and after the PRD citations above it is not even trying
to.** It produces the evidence for a _calibration_ judgement: a measured distance to the bar across a
varied photo set, plus blind preference verdicts, so that "the gap is intentional" stops being an
untested assertion and becomes a number somebody chose. The plausible outcomes are three, and only one
of them is more engineering:

- the distance is comfortable → the PRD's call is confirmed, this change closes, nothing ships;
- Local is **too weak** to be a convincing free taste → tune within gamma/blur/chroma, which is cheap
  and does not touch the scope boundary;
- Local is closer than expected → the interesting case, because it means the upgrade incentive rests on
  less than the PRD assumes, and that is a product conversation, not an engineering one.

### What has to exist first

1. **5–8 night photos the maintainer owns or has consent for**, varied: heavy shadow noise, colour cast,
   mixed light, a clipped highlight, a near-black frame. The archived `ab-harness/samples` are **not**
   usable — they were fetched from third-party URLs by a script and their provenance cannot be asserted.
2. **One controlled Bread freeze, off production**, against a local stack with the maintainer's own
   Replicate token. This is the single metered step in the whole change; every round after it runs the
   local engine only, with **zero cloud operations**.
3. **A ceiling** — rounds, wall-clock or spend — agreed before the first builder runs.

### Non-goals, so scope creep has something to bounce off

- No model call is added to the runtime path. Nothing the user triggers gains an inference.
- `CLOUD_DAILY_CAP` is not raised, and no round points at production (`guardrails.md` §1).
- Reference bytes and the maintainer's photos never enter git; they live in the gitignored
  `scratchpad/gauntlet/<slug>/reference/` and are hash-pinned in the workbench.
- This change does not decide the WASM/CLAHE/NLM scope question. It measures the case for asking it.
- **Nothing here is allowed to make Local "as good as possible".** That is not a stretch goal that got
  cut for time — it is contrary to `prd.md` §83/§116/§Non-Goals. Any round that closes the gap
  substantially must stop and route to the product decision instead of shipping.
