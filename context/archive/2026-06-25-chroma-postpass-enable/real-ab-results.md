# Real-Bread A/B — chroma post-pass enable (F3 gate)

> Phase 1 of `chroma-postpass-enable`. Closes S-11 observation **F3**: the Phase-5 GO
> rested on a _synthetic_ ground-truth A/B because the prior samples lacked flat-shadow
> chroma noise. This records the deferred confirmation on **real Bread output**.
>
> **Decision recorded here gates Phase 5 (the prod flip).** GO requires, on ≥1
> genuinely-noisy real Bread output (bar locked to one on 2026-06-26 — safety already
> confirmed ×3 in Round 1): visible shadow-chroma reduction + `maxΔY ≈ 0`
> (no luminance softening) + no edge bleeding, judged in the harness diff/loupe.
> NO-GO → bounded retune of `DEFAULT_CHROMA_PARAMS` via the harness sliders, re-A/B;
> if still unacceptable, stop without enabling.

- **Status:** ✅ **CONDITIONAL GO — F3 safety closed; sufficiency is measurable but modest
  (2026-06-26).** Round 1 (3 NIND ISO6400 outputs) proved **safety** on real Bread output
  but couldn't test sufficiency (Bread lifted them clean, `Y<64` = 1.5–6%). **Round 2**
  added `tree1`: a real high-ISO noisy Bread output whose deep-shadow population is below
  the rig's original ≥15–20% floor (`Y<64` = 10.2%), but whose claimed noise band is mostly
  mid-shadow (`Y 64–128` = 51.1%). Re-measuring that band shows a **12.9% / 15.2% Cb/Cr
  stddev reduction**; the clean `nightsky` control stays near-null (**1.2% / 1.4%** in the
  same band). The effect is clean but subtle, so Phase 1 unblocks Phases 2–4 and supports
  an observable/reversible experiment; Phase 5 must still lean on telemetry / real-world
  verification, not treat sufficiency as firmly proven. Flag stays OFF until Phase 5; params
  unchanged `(3, 0.9, 2.5)` (2.0 retune gain marginal, not adopted). See Round 2 section below.
- **Params under test:** `DEFAULT_CHROMA_PARAMS = { blurRadius: 3, maxStrength: 0.9, shadowCurve: 2.5 }`
- **Harness:** `context/archive/2026-06-18-bread-chroma-postpass/ab-harness/index.html` (loads any local image; runs the real bundled algorithm)
- **Recipe source:** `research.md` §C + `context/archive/2026-06-07-cloud-flip-on-revalidation/local-runbook.md`

## Inputs (genuinely-noisy real Bread outputs)

Good input characteristics: real high-ISO handheld **night phone shot**, straight-from-camera
RGB JPG (not editor-denoised), large flat dark regions (sky / shadowed wall / asphalt),
under-exposed so Bread lifts substantially, 8-bit, ≤ 12 MP. (Bread rejects RGBA — JPG only.)

| #   | Source photo (what / where from)                                               | Bread output captured (path)                             | MP   |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------------------- | ---- |
| 1   | NIND `MuseeL-fuite` ISO6400 (Natural Image Noise Dataset, tripod museum scene) | `…/b477…/scratchpad/NIND_MuseeL-fuite_ISO6400-bread.png` | 2.29 |
| 2   | NIND `Saint-Remi` ISO6400 (church interior)                                    | `…/b477…/scratchpad/NIND_Saint-Remi_ISO6400-bread.png`   | 1.68 |
| 3   | NIND `chapel` ISO6400 (chapel interior)                                        | `…/b477…/scratchpad/NIND_chapel_ISO6400-bread.png`       | 1.56 |

> ⚠️ All three are **NIND dataset** scenes, not the handheld phone night shot the recipe asks
> for. More importantly, after Bread's exposure-lift each retains almost no deep near-black
> (`Y<64` = 1.5–6%), so they do **not** qualify as _genuinely-noisy_ under the gate. Round 2
> still owes ≥1 true underexposed phone night shot with large near-black regions.

## Per-sample A/B observations

For each Bread output, loaded into the harness (diff view + 100% loupe over a flat shadow):

Objective metrics from `bread-ab.ts` (real `denoiseChroma` on the real Bread output; `maxΔY`
and shadow `Cb/Cr` stddev reduction over `Y<64`). Run 2026-06-26, params `(3, 0.9, 2.5)`:

| #   | Shadow-chroma reduction (Cb / Cr) | Luminance softening (maxΔY≈0)?   | Edge bleeding?     | Verdict           |
| --- | --------------------------------- | -------------------------------- | ------------------ | ----------------- |
| 1   | 12.1% / 10.4% (mod.)              | No — maxΔY 0.49 (rounding floor) | None — hiLeak 0.58 | safe, weak effect |
| 2   | 4.6% / 2.8% (slight)              | No — maxΔY 0.48                  | None — hiLeak 0.67 | safe, near-no-op  |
| 3   | 9.6% / 3.7% (mod.)                | No — maxΔY 0.49                  | None — hiLeak 0.00 | safe, weak effect |

Notes (per sample, free-form — what the metrics/diff showed):

- **Safety is the headline and it's unanimous.** `maxΔY ≈ 0.48–0.49` on all three is the 8-bit
  RGB-write rounding floor (the pass preserves Y exactly in float); it matches the synthetic
  test's 0.5 — now confirmed on **real Bread**. `hiLeak ≈ 0` → highlights untouched. The diff
  views showed change localized to shadows/edges with bright walls/columns reading black.
- **Sufficiency could not be tested.** Reduction is 3–12% vs the synthetic test's 45–66%, but
  the decisive number is `shadowPx(Y<64)` = 1.5–6%: Bread lifted these scenes so hard there's
  almost no deep near-black left to clean. The visible diff speckle sat in _mid_-shadows
  (Y 64–128) / edges, which the `Y<64` metric window doesn't capture — so the low % both
  understates the real effect **and** signals the inputs don't qualify as genuinely-noisy.
- **Param read:** raising `maxStrength 0.9→1.0` is pointless here (only touches the 1.5–6%
  near-black). If a qualifying sample shows the noise sits in mid-shadows, the relevant lever
  is `shadowCurve 2.5→2.0` (spreads weight into Y 64–128) — to be tested in Round 2, not now.

## Round 2 — genuinely-noisy sample (2026-06-26)

Sourced freely-licensed real high-ISO inputs (NIND interiors lifted clean → needed dark+noisy).
Best candidate **`tree1`** (Wikimedia NIND tree bark, ISO6400, CC-BY-SA) had genuine shadow
chroma noise (raw shadow Cb std ≈ 12) that survived into Bread's output; **`nightsky`**
(Wikimedia, CC-BY) as a clean dark control. Direct Replicate Bread call via `bread-ab.ts`.
Note: Bread output is a downscaled RGB **PNG** (~1.5 MP) — so the 12 MP guard never trips on
real Bread output.

| Sample                   | deep shadow% (Y<64) | mid shadow% (Y 64–128) | maxΔY | deep Cb/Cr ↓  | mid Cb/Cr ↓   | hi-leak | verdict                    |
| ------------------------ | ------------------- | ---------------------- | ----- | ------------- | ------------- | ------- | -------------------------- |
| tree1 (noisy)            | 10.2%               | 51.1%                  | 0.50  | 22.4% / 29.1% | 12.9% / 15.2% | 0.58    | ✅ clean, modest reduction |
| nightsky (clean control) | 14.4%               | 12.6%                  | 0.48  | 0.2% / 0.6%   | 1.2% / 1.4%   | 0.58    | null — no false change     |

Visual (matched 100% crop of the darkest region + 10× diff, inspected directly): before/after
indistinguishable at normal zoom; the 10× diff is fine **chroma-only** speckle (no luminance
structure), **no edge halos / bleeding / blobs**. Free `shadowCurve 2.0` test (re-ran the
post-pass on the cached Bread output — no credit): 24.1% / 31.8%, diff still clean → **kept the
default 2.5** (marginal gain; a retune off one sample would over-fit). **Read:** the post-pass
safely cleans shadow chroma and shows a measurable, modest mid-shadow reduction on real Bread
output. This is enough to continue with the runtime flag, telemetry, and ON-path test, but it
is not strong enough to make Phase 5 a blind quality flip.

Metric caveat: Cb/Cr stddev reduction is a useful proxy for less chroma variation, but it
cannot by itself prove the removed variation is noise rather than real low-light chroma detail.
The visual crop/diff checks reduce that risk for this sample; Phase 3 telemetry plus Phase 5
real-world verification remain the actual sufficiency arbiter.

## Retune log (only if a first pass was NO-GO)

| Round | Params (r, s, c) | Result | Notes |
| ----- | ---------------- | ------ | ----- |
|       |                  |        |       |

(If `DEFAULT_CHROMA_PARAMS` was changed, record the final value here and update
`src/lib/engines/chroma-denoise.ts` — Phase 1 change #2.)

## Decision

**✅ CONDITIONAL GO (2026-06-26)** — flag stays OFF until Phase 5; Phases 2–4 unblocked.

Rationale (tying back to the GO criteria):

- **Safety criterion met** decisively on real Bread output (Rounds 1 + 2): `maxΔY ≈ 0`
  (rounding floor) and no highlight leak on all samples — the part F3 explicitly deferred is
  confirmed, and the visual diff is chroma-only with no halos/bleeding/softening.
- **Sufficiency criterion is measurable but weak** in Round 2: `tree1` sub-qualifies on the
  rig's original deep-shadow floor (`Y<64` = 10.2%), but the claimed mid-shadow band
  (`Y 64–128` = 51.1%) shows a real 12.9% / 15.2% Cb/Cr stddev reduction vs 1.2% / 1.4%
  on the clean `nightsky` control. The effect is artifact-free, but not visibly obvious at
  normal zoom and still depends on stddev as a proxy that cannot distinguish noise removal
  from chroma-detail attenuation on its own.
- **Caveat (eyes-open):** the benefit is _subtle_ (Bread already denoises + downscales, so
  little residual noise) and every cloud result pays a one-time generational JPEG re-encode.
  Accepted only as a conditional GO because enabling ships behind a runtime flag (Phase 2) +
  telemetry (Phase 3), making the Phase 5 decision reversible and observable. Params kept at
  `(3, 0.9, 2.5)`.
- **Next:** Phase 2 (runtime SSR-prop flag) → Phase 3 (telemetry) → Phase 4 (ON-path test) →
  Phase 5 (flip prod secret, verify rollback).

---

### Recipe (condensed — see research.md §C / the local-runbook for full detail)

```
1.  npx supabase start && npx supabase db reset
2.  cloudflared tunnel --url http://127.0.0.1:54321        # note the https URL (re-mints each run)
3.  psql … : alter database postgres set "app.settings.edge_function_url" = '<tunnel>/functions/v1/enhance';
            alter database postgres set "app.settings.db_webhook_secret" = '<DB_WEBHOOK_SECRET>';
4.  supabase/functions/.env: CLOUD_PIPELINE_ENABLED=true, DB_WEBHOOK_SECRET=<same>,
       REPLICATE_API_TOKEN=<REAL>, EDGE_FUNCTION_URL=<tunnel>   (do NOT set E2E_ALLOWED_OUTPUT_ORIGIN)
5.  (F1-correct) REPLICATE_WEBHOOK_SIGNING_SECRET = `GET api.replicate.com/v1/webhooks/default/secret`
6.  npx supabase functions serve enhance --env-file supabase/functions/.env
7.  .dev.vars: CLOUD_PIPELINE_ENABLED=true, CLOUD_DAILY_CAP=5, local SUPABASE_*  →  npm run build && npx wrangler dev --port 4321
8.  Sign in → Cloud AI → upload the noisy night JPG → Process; wait queued→processing→succeeded
9.  Save the AFTER (Bread) image to the scratchpad (NOT under context/archive/)
10. Open ab-harness/index.html → Load image… → inspect diff + loupe over flat shadows
```

Footgun: the `cloudflared` URL re-mints each run — keep `.env` `EDGE_FUNCTION_URL` and the DB GUC in
sync or the callback is `null` and the row stalls in `processing`.
