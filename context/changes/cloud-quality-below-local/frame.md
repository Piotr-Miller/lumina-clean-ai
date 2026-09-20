# Frame Brief: Cloud AI output is worse than the local engine

> Framing step before /rune-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

Cloud AI (Bread) results on production are markedly worse than the local Canvas
engine. Across three runs on 2026-08-31 the shared signature is a hue shift to
the complement — **green → magenta** — at three different gammas (1.50 / 1.16 /
1.24) and three different strengths (0.12 / 0.08 / 0.09). Secondary: one output
is blown out to near-white with a violet cast; one output is noisier than its
input. Evidence: `references/01…png`, `02…png`, `03…png`.

## Initial Framing (preserved)

- **User's stated cause or approach**: cause explicitly NOT established. Four
  candidates recorded as hypotheses, with the client-side chroma post-pass
  (S-11, `CHROMA_POSTPASS_ENABLED`) named prime suspect because "green↔magenta
  is what a sign, offset or Cb/Cr-swap error looks like".
- **User's proposed direction**: settle the cause before writing code, using the
  cheapest discriminator — flip `CHROMA_POSTPASS_ENABLED=false` and run one real
  cloud job. Keep "make Bread better" (S-13) out of scope until then.

Observation is specific; no pre-dispatch narrowing was needed (Step 1.5 skipped).

## Dimension Map

1. **Chroma post-pass maths** — `denoiseChroma`'s YCbCr blend inverts or biases
   chroma. ← initial framing
2. **Post-pass delivery** — the `createImageBitmap` → canvas → JPEG round-trip
   strips/reinterprets a colour profile, or the BEFORE/AFTER panes are rendered
   through asymmetric paths.
3. **Bread itself** — what we send the model, or what the model returns.
4. **Auto recommendation** — a bad gamma. Can explain a blow-out, not a hue flip.

## Hypothesis Investigation

| Hypothesis                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Verdict                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **1. Chroma post-pass maths** (initial framing) | Recombine is a **convex** blend: `out_C = orig_C + w·scale·(blur_C − orig_C)` with `w ≤ 0.9` and `scale ∈ [0,1]` (`chroma-denoise.ts:220, 235-240`, `:100`) — output chroma cannot leave the segment between a pixel's own chroma and its 7×7 local mean, so it can desaturate but never pass through neutral to the complement. Measured on the real module: a uniform saturated field returns **bit-identical** (Δchannel 0); over 4,000 random fields max hue rotation with chroma ≥ 40 retained was **34.7°**; on a 200×200 noisy dark-green region **0 of 39,960** chroma-≥20 pixels landed magenta. `boxBlurPlane` matches an independently written implementation **bit-for-bit**, impulse response exactly 3px. BT.601 inverse coefficients cancel Y algebraically (0.299×1.402 = 0.587×0.714136). Byte-plane clamping bites at ≤0.5 units and only at four RGB corners — saturated green (Cb 43.5, Cr 21.2) is nowhere near them. Three independent runs of the module (mine + two delegates) agree. | **NONE**                                     |
| **2. Post-pass delivery / colour management**   | `createImageBitmap(blob)` is called with **no options** (`cloud-result-postprocess.client.ts:48`), so `colorSpaceConversion` is `"default"` — the profile is _applied and baked down_, not stripped and reinterpreted. Zero `colorSpace`/ICC references anywhere in `src/`. Decisive control: the **local engine runs the identical round-trip** — same `canvas-helpers`, same untagged JPEG at 0.92, same original-`File` BEFORE (`local-engine.ts:36-60`, `canvas-helpers.ts:12`) — and shows no shift. `width`/`height` come from the result's own `naturalWidth/Height` (`cloud-result.client.ts:27-38`), so no stride mismatch. No ICC transform is a channel inversion.                                                                                                                                                                                                                                                                                                                                 | **NONE** for hue                             |
| **2b. Delivery — the "noisier" symptom**        | Bread returns a **downscaled ~1.5 MP PNG** (recorded three times: `real-ab-results.md:80`, `prod-flip-procedure.md:27`, `repro-findings.md:49`). `BeforeAfterSlider.tsx:64-67` sizes one box from the **result's** dimensions and renders both panes `object-cover`: a 12 MP original is downsampled ~3× by the browser (averaging its grain away) while the 1.5 MP result is shown near 1:1. Plus a lossy JPEG generation at `JPEG_QUALITY = 0.92` over exactly the shadow grain the pass targets. The local engine returns the source's own dimensions (`local-engine.ts:31, 61`), so it cannot produce this.                                                                                                                                                                                                                                                                                                                                                                                               | **STRONG**                                   |
| **3. Bread itself**                             | Nothing we own transforms the source before the model reads it — `cloud-upload.client.ts:87-91` `PUT`s the original `File` verbatim; validation is MIME+size only (`image-helpers.ts:37-60`). Nothing we own transforms the output — `enhance/index.ts:570-582` streams Replicate's bytes to storage with the upstream content-type, and the Edge runtime has no image library. `BREAD_VERSION` has **never changed** since 2026-05-31. The repo states the gap in writing: the founding spike recorded "**Subjective quality: INCONCLUSIVE** — only tested on a noise/resolution chart… **Action:** confirm real-world quality on a genuine low-light **color photo**… if it's poor on real photos, that's a model-swap signal then" (`spike-findings.md:34`) — **no artifact anywhere closes that action.** A blind delegate, given only the symptom and no hypothesis, ranked this #1 independently.                                                                                                       | **CONFIRMED — directly observed 2026-09-20** |
| **4. Auto recommendation**                      | `PARAM_RANGES.cloud.gamma.max = 1.5` and `baseGamma = log(p50)/log(0.30)` (`auto-params.ts:25, 107-113`) cross 1.5 at **p50 ≈ 0.164**, so _every_ night photo pins the cloud slider at its maximum — 1.50 is the designed output, not an anomaly. The three runs' (gamma, strength) pairs are mutually consistent with p50 ≈ 0.16 / 0.24 / 0.22 via `:153`. And gamma 1.5 lifts p50 0.16 → 0.29, which does not reach near-white, so it does not explain `01` either.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **NONE**                                     |

## Narrowing Signals

- **The comparative premise is untested.** The user did **not** run the local
  engine on these three photos; "cloud is worse than local" is inferred from
  other runs. No artifact in the repo captures local's output on a green-dominant
  night scene.
- **All three failing inputs are green/aurora-dominant, and no non-green control
  has been run through Cloud AI.** So "green → magenta" is a description of three
  correlated samples, not an established input-independent behaviour.
- **The hue shift is luminance-gated.** Read independently from the screenshots
  twice: hue survives where the output is bright (`02` sky, `03` sky/waterfall,
  `01` blown background) and flips where it is dark or mid-tone (`02` water,
  `03` hillside, `01` the wolf → yellow-green, violet's complement). Whatever
  does this has both a chroma path and an illumination-dependent weight.
- **The downloaded filename is free evidence nobody has read.** With the pass ON
  the download is a re-encoded `-post.jpg`; with it OFF it is the raw
  `result.png` straight from the signed storage URL (`prod-flip-procedure.md:62`).
  The user is not sure whether those files still exist.

## Cross-System Convention

The convention for "is the model output any good?" is a quality gate on the
output. **This pipeline has none, at any layer.** `cloud-live-smoke.md`'s pass
criterion is that a job "goes `queued → processing → succeeded` and the
before/after slider renders via Realtime **without a refresh**" — plumbing only.
`tests/chroma-denoise.test.ts` asserts variance reduction, ΔY tolerance,
determinism and validation, but **never hue, chroma sign or direction** — a 180°
inversion preserves chroma magnitude, preserves Y exactly and _reduces_ variance,
so it would pass every existing assertion. Both S-11 archives judged the
post-pass's _delta_ via Cb/Cr **stddev**, a magnitude statistic blind to rotation,
on museum interiors, a church, a chapel, tree bark and a clean night sky — no
saturated scene, no hue metric. A model returning well-delivered garbage passes
every gate this project has.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the colour fidelity of what Bread
> returns has never once been checked — and because every gate in the pipeline
> measures delivery rather than output, a bad result has been shipping to the
> paid path since **2026-06-08**, the day the cloud engine went live, with nothing
> able to notice.

The initial framing's prime suspect is **eliminated by measurement, not by
reading**: the post-pass is structurally incapable of the observed artifact, and
the delivery path around it is clean. The hue shift originates at the model —
**confirmed 2026-09-20** by opening the stored raw `result.png` outside the app
(see Confidence). That is where the founding spike said to look, in an action
item that was written down and never executed. What remains is the decision
between input semantics, model swap, or accepting and compensating. Separately and
independently, Cloud AI hands the user a **~1.5 MP lossy JPEG where the free
Local engine hands back full resolution**; that is a "cloud is worse than local"
mechanism our code owns entirely, it needs no model change, and it is recorded
nowhere outside a parenthetical in an archived procedure.

## Confidence

**HIGH — the reframe was verified against the production artifact on 2026-09-20.**

The check cost nothing: no prediction, no cap slot, no new job. Three prod jobs
on 2026-08-31 were listed and their persisted `gamma`/`strength` matched the
screenshots exactly, so the S-16 smoke jobs and the user's trials are the **same
three runs**:

| job         | gamma      | strength   | screenshot             |
| ----------- | ---------- | ---------- | ---------------------- |
| `3d19146a…` | 1.5        | 0.1215686… | `01` wolf              |
| `190832de…` | 1.1612628… | 0.0764706… | `02` aurora / water    |
| `06ce207c…` | 1.2443905… | 0.0882353… | `03` waterfall / grass |

Each `result.png` is still in the `photos` bucket under
`a4e94cf3-…/<jobId>/result.png`; each folder holds **only** `result.png`, the
`source.jpg` already reaped — matching `reaper_stale_source_paths.sql:37`.

**Opened straight from Supabase Storage, outside the app entirely:**

- `190832de…/result.png` (799.69 KB) — the foreground water is **already
  magenta**, the aurora still green, and the frame is **already noisy**.
  Indistinguishable from screenshot `02`'s AFTER pane.
- `3d19146a…/result.png` (590.57 KB) — **already blown out to near-white with
  the violet cast**, the wolf **already yellow-green**. Indistinguishable from
  screenshot `01`'s AFTER pane.

Those bytes are what Replicate returned, stored verbatim
(`enhance/index.ts:570-582`), rendered by a different browser surface than the
app's. **Both the hue flip and the blow-out are Bread's own output.** Every line
of our client pixel code is exonerated — the post-pass, the canvas round-trip,
the colour management and the Auto recommendation alike.

Not established, and left open: whether `CHROMA_POSTPASS_ENABLED` is currently
`true` in prod. It is **absent** from the Worker secret list in
`production-config.md:54-55`, recorded ON only in an archive, and
`EDGE_FUNCTION_URL` was found silently missing on 2026-08-31 with no explanation
(`production-config.md:58`). `wrangler secret list` prints names only, so it can
prove OFF but never ON. This no longer gates the diagnosis — it is now a
config-hygiene question, not a cause question.

**Dating, established 2026-09-20 from the stored corpus.** The `photos` bucket
holds 18 succeeded cloud jobs — the app's entire history. Three sampled from
2026-06-08, 2026-06-13 and 2026-06-18 are the **same aurora photo**, each
`result.png` **706.3 KB** (byte-identical output — same input, deterministic
model), and **each already magenta**. Two of those dates pre-date the chroma
post-pass flip-ON (2026-06-27) by 19 and 14 days, so hypothesis 1 was never
temporally capable of producing this: the artifact existed before the suspected
code ever ran in production. Nobody checked the dates.

That corpus also shows the same aurora image has been the de-facto cloud test
photo since launch. Its result has been visibly wrong on **every** run — through
the cloud flip-on revalidation, the S-11 chroma A/B, the E2E gate, the S-16
production smoke and the unit-cost verification — and not one of those looked at
the colour.

**Still unconfirmed:** saturation-dependence. Every stored result is that same
saturated aurora, so prod holds no non-green control. Settling it costs one run
(~$0.0006 plus a cap slot) on a night photo with no strong green.

## What Changes for /rune-plan

Do not plan a fix to the chroma post-pass; the confirmation above closed that.
Two tracks remain, and they are separate changes.

**(a) The model decision.** One sub-question is already answered and should not
be re-researched: Replicate's own model page for `mingcv/bread` states
_"Increase the `gamma` value for brighter outputs"_ and _"increase the
`strength` value for smoother outputs"_ — **our convention matches the model's**,
so we are not driving it backwards (checked 2026-09-20; the repo had recorded
only our chosen defaults, `spike-findings.md:18`). What is left is whether this
model is fit for saturated night colour. Note the shape of the evidence: 3 of 3
saturated, green-dominant scenes fail, while the five real Bread outputs in the
S-11 archives — museum/church/chapel interiors, tree bark, a clean night sky, all
low-chroma — were examined closely and drew no colour complaint. That points at a
**saturation-dependent** failure, not a universally broken model, and it makes
S-13 (Retinexformer / model swap) a legitimate option again — earned by evidence
rather than assumed, which is the opposite of the framing `change.md` set out to
resist.

**(b) The delivery gap** — full-resolution output and a fair before/after
comparison. Confirmed, ours, independent of the model, and it will be swallowed
by S-17 unless it gets its own change-id.

And whatever is decided, this project needs one gate that looks at the
**output**, not the plumbing — that absence is why a broken paid path ran for two
months unnoticed.

## References

- Pixel path: `src/lib/engines/chroma-denoise.ts:100, 110-153, 163-247` ·
  `src/lib/services/cloud-result-postprocess.client.ts:47-69, 104-117` ·
  `src/lib/services/cloud-result.client.ts:27-38, 45-55` ·
  `src/lib/engines/local-engine.ts:31, 36-61` · `src/lib/engines/canvas-helpers.ts:12` ·
  `src/lib/engines/auto-params.ts:19-28, 107-113, 141-159` ·
  `src/components/enhance/BeforeAfterSlider.tsx:64-67, 86-100`
- Upload / model / storage: `src/lib/services/cloud-upload.client.ts:87-91` ·
  `src/lib/services/bread.ts:15, 18, 21, 38-44` ·
  `supabase/functions/enhance/index.ts:315-332, 570-582` ·
  `supabase/migrations/20260614120000_reaper_stale_source_paths.sql:37` ·
  `supabase/migrations/20260628190000_add_bread_params_to_jobs.sql:15-16`
- Prior art: `context/archive/2026-05-31-cloud-ai-realtime-result/spike-findings.md:12, 34, 43` ·
  `context/archive/2026-06-25-chroma-postpass-enable/real-ab-results.md:37-39, 74-100` ·
  `context/archive/2026-06-25-chroma-postpass-enable/prod-flip-procedure.md:27, 62-63` ·
  `context/foundation/cloud-live-smoke.md` ("What pass means") ·
  `context/foundation/production-config.md:54-58, 177-179` ·
  `context/foundation/lessons.md:152-157` (synthetic GO ≠ GO-to-enable),
  `:166-172` (ablate from the artifact that reproduces)
- Investigation: dimensions 1, 2 and 3 delegated to analysis agents; dimension 4
  and an executed probe of the real `denoiseChroma` module done in-session; a
  fourth **blind** search agent, given the symptom with no hypothesis named, was
  run as the cross-system pressure test and converged on dimension 3
  independently.
