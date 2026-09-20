---
date: 2026-09-20T17:02:05+02:00
researcher: Piotr-Miller
git_commit: 1fc8da336d39db0fdeea3920e42f5dd4467c4aec
branch: master
repository: lumina-clean-ai
topic: "The model decision for the Cloud AI engine, after the frame confirmed Bread's own output is the fault"
tags: [research, codebase, bread, replicate, cloud-engine, model-swap, sci, retinexformer]
status: complete
last_updated: 2026-09-20
last_updated_by: Piotr-Miller
---

# Research: the Cloud AI model decision

**Date**: 2026-09-20T17:02:05+02:00
**Researcher**: Piotr-Miller
**Git Commit**: `1fc8da336d39db0fdeea3920e42f5dd4467c4aec`
**Branch**: master
**Repository**: lumina-clean-ai

## Research Question

`frame.md` confirmed the green→magenta hue flip and the blow-out are in Bread's own
returned bytes, not in our pipeline. What follows: keep Bread and compensate, swap
the model, or drop the cloud engine? Scope: Bread's real contract and whether this
is a known failure mode; the alternatives with cost, contract and colour behaviour;
what this repo already decided about S-13 and the premium tiers; and the blast
radius of a swap.

## Summary

**The fault is architectural and now fully explained.** Bread converts to YCbCr and
runs a colour-adaptation network (CAN) that **regresses Cb/Cr from scratch** — no
residual path, no hue constraint — supervised by an L1 chroma loss against LOL +
SICE, an indoor/urban corpus with no saturated emissive green. Green is the one
common hue deep in the **negative** quadrant of both Cb and Cr; magenta is positive
in both. A chroma prior learned on that corpus lands an aurora across the neutral
point. The luminance gating we observed is a literal code branch that blends the
original image back by the estimated illumination map.

**We have also been driving the model in the worst part of its range**, and that is
ours to fix: Bread's own defaults are `gamma 1.0` / `strength 0.05`; ours are
`1.2` / **`0.2`** (4× the default, exactly the model ceiling), and our zod schema
and slider **floor gamma at 1.0**, so the lower half of the model's range has never
been reachable. `gamma` acts on the illumination map, which is _also_ the fusion
weight deciding how much original colour survives — so raising it both blows out
luminance and hands maximum authority to the colour net, in exactly the dark
regions that go magenta. Auto pins it to 1.5 on any night photo.

**Retinexformer — the parked S-13 answer — is not on Replicate at all.** The
low-light cluster actually runnable there is four models, none with a new version
since 2024. The credible replacement is **`vis-opt-group/sci`**: live, MIT, 13.2K
runs, **$0.00025/run (2.4× cheaper)**, **resolution-preserving**, and measurably
hue-faithful on saturated darks. Its costs are that it does **no denoising** (it
amplifies noise ~5× at the darkest levels) and it has **no `gamma`/`strength`
knobs**, which is precisely the knob change that forces a migration on
`public.admit_cloud_job`.

**And the strategically largest finding: SCI is 258 trainable weights / 44 KB.**
Three 3×3 convolutions. It runs in a browser. That makes "move it into the free
local engine" a real option — full resolution, hue-faithful, zero marginal cost, no
cold boot, no cap — and turns the question from "which cloud model" into "does the
cloud engine still earn its pipeline".

**Cheapest next step, before any of that: ~$0.0006.** Re-run the aurora at Bread's
own defaults (`gamma 1.0`, `strength 0.05`). We have never tried the model at its
documented operating point.

## Detailed Findings

### Bread's colour branch — the mechanism

Paper: Hu & Guo, _"Low-light Image Enhancement via Breaking Down the Darkness"_,
[arXiv:2111.15557](https://arxiv.org/abs/2111.15557), IJCV 2022. Reference
implementation [github.com/mingcv/Bread](https://github.com/mingcv/Bread),
Apache-2.0, **last push 2023-05-02** — dormant 3+ years. (Checked 2026-09-20.)

From `test_Bread_NoNFM.py` (the path Replicate runs — the author confirms the
hosted model omits NFM, [issue #8](https://github.com/mingcv/Bread/issues/8)):

```python
texture_in, cb_in, cr_in = torch.split(kornia.color.rgb_to_ycbcr(image), 1, dim=1)
colors = self.model_canet(torch.cat([texture_in, cb_in, cr_in, texture_ns], dim=1))
cb_out, cr_out = torch.split(colors, 1, dim=1)          # regressed, clamped [0,1]
...
# Further preserve the color under brighter illumination
img_fusion = texture_illumi * image + (1 - texture_illumi) * image_out
```

Three consequences, and together they are the whole symptom:

1. **Chroma is freely regressed, not corrected.** The CAN is a U-Net emitting Cb/Cr
   as a 2-channel image. The input's own chroma is an _input_ to the net, not a base
   it adjusts. No residual, no hue-angle parameterisation, no saturation limiter —
   nothing prevents output chroma landing on the far side of neutral.
2. **Green is uniquely exposed.** In Kornia's convention (neutral at 0.5): pure
   green is (−0.331, −0.419) from neutral, magenta is (+0.331, +0.419). Green is the
   only common hue deep in the negative quadrant of _both_ channels, so a prior
   biased toward neutral/warm — where tungsten, skin, wood and sodium street light
   all live — can only _under_-correct a warm input but can **invert** a green one.
3. **The luminance gating is deliberate.** `texture_illumi` ≈ 1 where bright, ≈ 0
   where dark, so bright regions are pinned to the original colour and the CAN's
   chroma is progressively substituted as the scene darkens. That is exactly the
   observed pattern — highlights keep their hue, dark and mid regions flip — and it
   was read independently off the screenshots twice before the code was found.

**`strength` provably cannot be the cause**: it is the ANSN's alpha,
`noise_syn_exp(illumi, strength) = exp(-illumi) * strength`, feeding only the
**luminance** noise branch. It never touches Cb/Cr — which is why the artifact was
invariant across all three strength values in the evidence.

**Training data supports the out-of-distribution reading.** README §3.1: 485
low/high pairs from **LOL** plus 559 multi-exposure sequences from **SICE**. LOL's
own paper describes _houses, campuses, clubs, streets_, resized to 400×600. Colour
supervision is a per-pixel L1 on Cb/Cr against ground truth. No aurora; almost
certainly no large-area saturated _emissive_ green.

**Author-acknowledged train/test mismatch on the CAN**
([issue #13](https://github.com/mingcv/Bread/issues/13), reply 2026-02-04): training
feeds the CAN the _ground-truth_ texture while inference feeds the _enhanced_
texture. The author calls this deliberate — _"intended to decouple texture and
color"_ — and argues using the enhanced texture _"generally hurts the model's
ability to generalize to unseen data"_. Either way the CAN is queried at a point it
was never trained at.

**Third-party corroboration.** The CVPR 2025 HVI/CIDNet paper names Bread
explicitly: methods including Bread are _"biased in terms of color with pure black
area"_ ([arxiv.org/html/2402.05809v3](https://arxiv.org/html/2402.05809v3), checked
2026-09-20). No public report of the specific green→magenta inversion exists — all
13 GitHub issues were enumerated; none concerns hue.

### We are operating the model outside its documented defaults

Verified directly on <https://replicate.com/mingcv/bread/api/schema> (2026-09-20):

| input      | model default | model max | ours                                                     |
| ---------- | ------------- | --------- | -------------------------------------------------------- |
| `gamma`    | **1.0**       | 1.5       | `BREAD_GAMMA = 1.2`; Auto pins **1.50** on night photos  |
| `strength` | **0.05**      | 0.2       | `BREAD_STRENGTH = 0.2` — 4× default, exactly the ceiling |

And our own bounds exclude half the model's range: `photo-job.schema.ts:31` is
`z.number().min(1.0).max(1.5)` and `auto-params.ts:25` is `{ min: 1.0, max: 1.5 }`.
Since `gamma` scales the illumination map — which is the fusion weight in (3) above
— **high gamma simultaneously maximises blow-out and minimises original-colour
preservation**. Our Auto engine drives it to the ceiling on exactly the photo class
that fails (`baseGamma` crosses 1.5 at p50 ≈ 0.164, so any night photo pins).

The model's `gamma` minimum is not shown in Replicate's table view; the repo's own
resolver fixture records `minimum: 0` (`tests/bread-version-resolver.test.ts:30`),
unconfirmed directly. A rejected request would be a 422, so the experiment is
self-diagnosing.

**Output resolution rule, measured on Bread's own demo pairs:** long edge capped at
**1536 px**, both dimensions floored to a multiple of 8 (matching
`datasets/low_light_test.py` — the U-Net needs /32 alignment). So 17.9 MP → 1.57 MP,
60 MP → 1.88 MP, and a 0.67 MP input passes through. "~1.5 MP" is a good average,
not a constant; "regardless of input size" is wrong at the bottom end. **Not
configurable** — the schema has exactly three inputs.

**Our pin is stale but that is not a fix.** Four versions exist; ours (`057a4e07…`,
2023-05-02) is the third. Latest is `bf9f60e7…` (2023-07-19). `gamma`/`strength`
constraints are byte-identical across all four; the only observable change is the
`image` description string. Nothing suggests a colour fix landed.

### The alternatives

**Retinexformer is not on Replicate.** `api/search?query=retinexformer` returns only
fuzzy matches (codeformer, mask2former, segformer — verified directly, 2026-09-20);
direct slug probes under `cjwbw`, `chenxwh`, `lucataco`, `zsxkib`, `camenduru` all 404. Same for Zero-DCE, RetinexNet, KinD, URetinex-Net, LLFlow, DiffLL, CIDNet.
**S-13 as written — "Retinexformer self-hosted" — means building and owning a Cog
container forever**, not swapping a slug.

The low-light cluster actually runnable on Replicate, none updated since Feb 2024:

| slug                      | runs  | cost/run     | predict | licence                        |
| ------------------------- | ----- | ------------ | ------- | ------------------------------ |
| `mingcv/bread` (current)  | 32.5K | $0.00060     | ~3 s    | Apache-2.0                     |
| **`vis-opt-group/sci`**   | 13.2K | **$0.00025** | ~2 s    | **MIT**                        |
| `cjwbw/night-enhancement` | 50.6K | $0.00046     | ~3 s    | MIT                            |
| `sczhou/lednet`           | 21.6K | $0.031       | ~138 s  | **S-Lab 1.0 — non-commercial** |

**`vis-opt-group/sci` is the one credible drop-in.** Schema verified directly
(2026-09-20): inputs are `image` (uri) and `model_type` (string, default
`"medium"`); output is a uri. It is `r = clamp(input / illumination, 0, 1)` with a
smooth 3-channel illumination anchored to the input — structurally close to a
per-pixel exposure multiplier, so it **cannot invert a hue**. Measured on controlled
saturated patches at night luminances, worst-case hue shift was 14° (bright orange
near clipping) and 1–7° in the dark range that matters, with saturation essentially
untouched. It preserves resolution exactly.

Its two real costs: **it does no denoising** and amplifies noise in lockstep with
brightness (~5× at input level 0.04); and it has **no `gamma`/`strength` knobs**,
which is exactly the change that triggers the `admit_cloud_job` migration below.

Rejected with reasons: `cjwbw/night-enhancement` — measured saturation collapse
(0.324→0.083) with 7–8% of coloured pixels flipping hue >120°, and a hard 512×512
squash (0.26 MP effective); `sczhou/lednet` — S-Lab 1.0 forbids commercial use;
`cszn/scunet` — denoise only, no exposure correction, likely OOM at 12 MP;
`mv-lab/instructir` — modern and MIT but its cog pins `device = cpu`, hence ~120 s
and $0.027/run.

**Cold boot is a platform property, not a model property.** Every candidate is a
community model on T4 that scales to zero, so all cold-boot in ~2 min. The only cure
is a deployment with `min_instances ≥ 1` — a warm T4 at $0.81/hr is ~$583/month to
serve 3 runs/day.

### The null option, and why it is strong

**SCI is 0.0003 M parameters — three 3×3 convolutions at 3 channels plus one
BatchNorm, 258 trainable weights, a 44 KB checkpoint.** It is the smallest entry in
its own CVPR-2022 comparison table (vs RetinexNet 0.8383 M, KinD 8.5402 M). A
from-scratch numpy reimplementation reproduced the official Replicate output at
**53 dB PSNR** — bit-exact modulo 8-bit quantisation.

That makes shipping SCI **client-side** (ONNX Runtime Web / WebGPU, or plausibly a
WebGL fragment shader) a few hundred KB of payload at zero marginal cost: full
resolution, no cap, no cold boot, no auth gate, no daily limit, no webhook pipeline.
Scaling the paper's 0.0619 GFLOPs to 12 MP is ~3 GFLOPs.

The honest bound: a local SCI + guided-filter denoise + CLAHE pipeline will not
match a good _learned_ joint denoise-and-expose model on heavy sensor noise — it has
no learned prior for what the noise hid. But **the bar it must clear is low**: the
current cloud engine downscales to 1.5 MP and inverts hue on the failing class.

This collides with a PRD premise — see Historical Context.

### Blast radius of a swap

**Identity is cheap; the input contract is not.** The version pin is one constant
(`bread.ts:15`) with exactly one runtime importer (`enhance/index.ts:25`), and
`jobs.model_version` was designed model-agnostically (free-text, write-once, **no
runtime reader**) — so a swap needs no migration for provenance and historical rows
keep their old hash.

But `gamma`/`strength` are not internal. They reach eight layers, and the sharpest
is the database:

```sql
create or replace function public.admit_cloud_job(
  p_job_id uuid, p_user_id uuid, p_source_path text,
  p_gamma double precision, p_strength double precision, ...
```

The **cap-enforcement function takes the model's two knobs as positional typed
arguments**, and its `revoke`/`grant` statements name the full signature. A
different knob set cannot be `create or replace`d past — it needs a migration that
drops and recreates the function and re-issues grants, landing in the one area with
a documented "merge before migrating and every submission 500s" failure mode.

Other couplings that **degrade silently** rather than failing:

- `RGBA_ALPHA_SIGNATURE = "Input size must have a shape of (*, 3"`
  (`cloud-job-decisions.ts:25`) — a raw PyTorch substring from Bread. A different
  model has a different dialect, so the "Convert to RGB and try again" affordance
  just stops appearing.
- The chroma post-pass is **tuned to Bread's specific failure mode** ("lifts shadows
  well but leaves chroma noise in near-black"). Against a different model it is
  useless or harmful.
- Watchdog budgets are Bread-cold-boot-derived: `PROCESSING_WATCHDOG_MS = 300_000`
  against Bread's measured 258.3 s cold boot — 42 s of headroom, pinned by
  `tests/cloud-timings.test.ts:22-23`.
- The storage bucket allows `['image/jpeg','image/png','image/heic']` — **no webp**
  — while `resultExtensionFromContentType` maps `image/webp` happily. A WebP-emitting
  model passes our code and is rejected by Storage.

**No seam exists.** `ImageEngine` (`types.ts:76-82`) has exactly one implementation,
`localEngine`; the cloud path never touches it. `EngineId = "local" | "cloud"` is a
two-valued toggle. "Bread" is a concrete assumption across ~18 files in 8 layers.

**The biggest cost is not any edit — it is that nothing can tell you the swap
worked.** The E2E stub never contacts Replicate (verified: no `replicate.com` /
`predictions` reference in `tests/e2e/helpers/replicate-stub.ts`); it impersonates
Replicate's outbound webhook and serves a local JPEG fixture, so the gate stays
green through a swap that produces garbage. The live smoke's pass criterion is
"`succeeded` + slider renders without a refresh". **Pricing a swap honestly means
pricing an output-quality harness alongside it.**

## Code References

- `src/lib/services/bread.ts:15,18,21,24-28,38-44` — pin, locked defaults, input type, mapper
- `supabase/functions/enhance/index.ts:25,329,332,374` — the only runtime consumers
- `supabase/migrations/20260828120000_atomic_cloud_daily_cap.sql:61-66,110-116,122-124` — `admit_cloud_job`'s Bread-shaped signature and grants
- `src/lib/services/photo-job.schema.ts:31-32` — zod bounds that exclude gamma < 1.0
- `src/lib/engines/auto-params.ts:19-28,107-113,141-159` — `PARAM_RANGES.cloud` (duplicated literals), and the cloud branch that pins gamma at 1.5
- `src/components/hooks/cloud-job-decisions.ts:25` — the raw PyTorch RGBA substring
- `src/components/hooks/useCloudJob.ts:99-102` — Bread-derived watchdog budgets
- `supabase/migrations/20260528120100_create_photos_storage.sql:28` — MIME allowlist without webp
- `src/lib/engines/types.ts:76-82` — `ImageEngine`, single implementation
- `scripts/lib/bread-version-resolver.ts:12,99-104` — hard-coded slug; contract check that would refuse a different model
- `tests/e2e/helpers/replicate-stub.ts` — impersonates the webhook; never calls Replicate

## Architecture Insights

- **A model's input contract is an architectural boundary, and this one leaked into
  a database function signature.** The cheapest structural fix — worth doing whether
  or not the model changes — is a model-descriptor module from which `PARAM_RANGES`
  and the zod bounds are _derived_ rather than duplicated, plus a `params jsonb`
  column replacing the two positional `double precision` arguments.
- **The Strategy pattern stops at "cloud vs local".** There is no seam for "which
  cloud model", and the parameter panel (`ParameterPanel.tsx`) is the one genuinely
  param-agnostic layer — it already renders off `Object.keys(ranges)`.
- **Every gate in this pipeline measures delivery.** That is why a defect present
  since 2026-06-08 survived a flip-on revalidation, a chroma A/B, an E2E gate, a
  production smoke and a cost verification.

## Historical Context (from prior changes)

- **Bread was never chosen.** It came from the user's seed notes —
  `context/foundation/shape-notes.md:241-253` marks those as _"Informational only —
  NOT part of PRD … NOT pre-committed"_ — and `context/foundation/tech-stack.md`
  contains **zero** mentions of Bread, Replicate or any model. The promised
  downstream evaluation never happened. S-04 took it as given and applied only
  latency and cost criteria.
- **The founding spike pre-authorised exactly this trigger.**
  `context/archive/2026-05-31-cloud-ai-realtime-result/spike-findings.md:34` —
  _"Subjective quality: INCONCLUSIVE … Action: confirm real-world quality on a
  genuine low-light color photo … if it's poor on real photos, that's a model-swap
  signal then."_ No artifact closes that action.
- **The quality gate was excluded deliberately, not forgotten.**
  `context/foundation/test-plan.md:428` — _"AI 'is it actually better' visual
  evaluation — a vision model judging before/after improvement is an unstable,
  expensive oracle; cost exceeds signal. This is why §3 has no AI-native phase."_
  The six-risk map contains no output-quality risk.
- **Measured cost:** median **$0.00061**/run over 15 predictions
  (`context/archive/2026-09-13-bread-unit-cost-verification/change.md:63-99`). At the
  prod cap of 3/day the variable bill is ~$0.05/mo. **Cost is not a constraint on
  this decision** — and "keep Bread because it's cheap" is a weak argument.
- **A PRD premise is currently inverted.** `context/foundation/prd.md:116` — _"Local
  is the free taste — it should NOT be too good"_; `:83` and `:180` restate the
  visible gap as the upgrade incentive. On saturated night scenes the gap runs the
  other way. This bears directly on the null option above: moving SCI into the local
  engine is a **product** decision, not just a technical one.
- **`local-engine-ceiling` would freeze the fault.** Its single metered step is one
  controlled Bread freeze to create the reference bar, and
  `.claude/skills/gauntlet-loop/references/bars.md` asks that reference set to
  include a "colour cast" photo — the failing class. It must not start until this
  resolves.
- **S-13 describes an _additive_ Premium engine, not a replacement**
  (`context/changes/premium-retinexformer-enhancement/change.md:16-17`). Its parking
  rationale ("optional quality upside") was corrected on 2026-09-20; if the decision
  is a swap, S-13 needs rewriting rather than promoting — and its named model is not
  on Replicate.

## Related Research

- `context/changes/cloud-quality-below-local/frame.md` — the framing step that
  confirmed the cause against the production artifact
- `context/changes/cloud-result-resolution-gap/change.md` — the separable delivery
  gap split out on 2026-09-20; **if the model changes, output resolution should be a
  selection criterion, not a follow-up**
- `context/archive/2026-06-25-chroma-postpass-enable/real-ab-results.md` — the only
  prior look at real Bread output, on five low-chroma scenes

## Open Questions

1. **Does Bread behave at its own defaults?** `gamma 1.0` / `strength 0.05` on the
   aurora. ~$0.0006, one cap slot. Never tried. This is the first thing to do.
2. **Is the failure saturation-dependent or universal?** All 18 stored results are
   the same saturated aurora, so prod holds no control. One non-green night photo
   settles it — and it decides between "swap the model" and "gate/warn on an input
   class".
3. **Is `gamma < 1.0` legal?** Not shown in Replicate's table view; our fixture says
   `minimum: 0`. A 422 answers it.
4. **Does SCI's noise amplification survive our chroma post-pass?** One prediction
   at $0.00025 on the same aurora. Note the post-pass is tuned for Bread's failure
   mode, so this needs judging, not assuming.
5. **Should SCI go in the local engine instead of the cloud?** If it does, does the
   cloud engine still earn its pipeline — and what happens to `prd.md:116`?
6. **What would an output-quality gate actually be?** `test-plan.md:428` excluded
   the vision-model oracle on cost grounds. A deterministic hue-preservation check
   (compare input and output hue histograms on saturated pixels) is cheap,
   deterministic, and would have caught this on 2026-06-08 — it is a different
   proposal from the one that was rejected.
