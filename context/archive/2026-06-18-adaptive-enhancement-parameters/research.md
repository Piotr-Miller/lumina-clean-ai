---
date: 2026-06-28T00:00:00Z
researcher: Claude (Opus 4.8)
git_commit: 96aa07e2c738e8125c8ba329ace2e94d2d6bf941
branch: s12-adaptive-enhancement-parameters
repository: LuminaClean_AI
topic: "S-12 adaptive-enhancement-parameters — manual + Auto parameter panel for Local and Bread"
tags: [research, codebase, enhance-ui, local-engine, bread, cloud-pipeline, auto-analyzer, cost-safety]
status: complete
last_updated: 2026-06-28
last_updated_by: Claude (Opus 4.8)
last_updated_note: "Added external (web) validation + review of Codex's Auto_mode.pdf proposal; corrected the Bread strength contract claim and reconciled heuristics."
---

# Research: S-12 adaptive-enhancement-parameters

**Date**: 2026-06-28
**Researcher**: Claude (Opus 4.8)
**Git Commit**: 96aa07e (branch `s12-adaptive-enhancement-parameters`)
**Repository**: LuminaClean_AI

## Research Question

How to implement S-12: a responsive parameter panel (right of the image, below on narrow screens) with **manual sliders** + a **deterministic Auto mode** for both engines — Local (`gamma`, blur) and Cloud/Bread (`gamma`, `strength`) — where Auto analyzes the selected image and populates the same sliders, the user can override any slider, and **Cloud parameter changes never spawn a paid Bread job except on an explicit Apply**.

## Locked decisions (this turn)

1. **Auto analyzer = deterministic luma metrics** (client-side, $0, unit-testable). No vision model.
2. **Cloud = explicit Apply only.** **HARD INVARIANT:** no slider change and no Auto recompute may trigger `/start`; only a conscious Apply/Submit may consume `CLOUD_DAILY_CAP`.
3. **Bread evidence gap is accepted, not blocking** — Bread over-brightening on moderate/bright inputs is unmeasured (only 1 real dark datapoint). Logged as a follow-up: 2–3 real Replicate runs on bright/midtone images when a token is handy. Local has HIGH confidence and already justifies S-12 (`repro-findings.md`).

## Summary

The slice is **well-supported by the existing architecture and low-risk to thread**. Both engines already isolate their parameters in one place; the work is to (a) lift those fixed constants/defaults into user-controllable state, (b) build a panel + Slider UI, and (c) add a deterministic luma analyzer.

- **Local** is the decisive win and the cleaner path: fully client-side, the gamma LUT already takes a `gamma` arg (`buildGammaLut(gamma)`), and the only fixed values are two module constants (`GAMMA=1.5`, `BLUR_PX=1.2`). Threading is: widen `ImageEngine.enhance` `opts`, pass `{gamma, blurPx}` from a panel through `useLocalEnhance`, **debounce** re-processing (full-res, main-thread).
- **Cloud/Bread** threads a per-job value through 6 well-defined seams (schema → DTOs → migration → createPhotoJob insert → Edge Function `buildBreadInput`). The fixed defaults live in exactly one function (`bread.ts:buildBreadInput`), and the value can ride the persisted `jobs` row to the Edge Function — **no new transport needed**. The cost-safety invariant **already holds** and is preserved as long as params are fields on the same single create-job POST (never an on-change request, never an UPDATE-triggered re-kickoff — the webhook fires on INSERT only).
- **Auto** is a pure `(luma stats) → params` function computed from a downscaled `getImageData` sample. The repro evidence gives concrete heuristics: **lower gamma toward 1.0 as the input brightens**, keep the 1.5 lift only for genuinely dark frames; Bread nudges stay small/conservative within a tight model contract.
- **UI**: no `Slider` component exists yet (`npx shadcn@latest add slider` needed). The current layout is a centered `max-w-2xl` flex column; the panel needs a responsive 2-col grid (panel right at `md:+`, stacked below on mobile).

## Detailed Findings

### 1. UI / component architecture (where the panel goes)

- **Host page**: `src/pages/index.astro:45-54` mounts `<EnhanceWorkspace client:load>` inside `<main class="bg-cosmic min-h-screen px-4 py-10 ... sm:py-16">`.
- **Workspace**: `src/components/enhance/EnhanceWorkspace.tsx:37-294`. Container `mx-auto w-full max-w-2xl` (`:106`); a `flex flex-col items-center gap-4` stack (`:113-274`) holds image / compare slider / action buttons. **This is the seam** — the `max-w-2xl` column must become a wider responsive grid (image cell + panel cell), panel stacking below at narrow widths.
- **Engine toggle (Strategy)**: `src/components/enhance/EngineToggle.tsx:18-55`; active engine held in workspace state `const [engine, setEngine] = useState<EngineId>("local")` (`EnhanceWorkspace.tsx:45`). `EngineId = "local" | "cloud"` (`src/lib/engines/types`). The panel must show **engine-specific controls** keyed off this state.
- **Before/after slider**: `src/components/enhance/BeforeAfterSlider.tsx:1-113` (result comparison UI — not a form control). Shown when a result is ready (`EnhanceWorkspace.tsx:118-133`).
- **Hooks & state ownership**:
  - `src/components/hooks/useLocalEnhance.ts:45-141` — Local: `enhance()` (`:82-111`) calls `localEngine.enhance(img, { mimeType })` at `:97`; holds `status/resultUrl/resultBlob/dimensions`.
  - `src/components/hooks/useCloudSubmit.ts:29-65` — `submit()` (`:34-56`) → `submitCloudJob(file)`; returns `jobId`. Triggered by explicit buttons `EnhanceWorkspace.tsx:198-199` and `:245-246`.
  - `src/components/hooks/useCloudJob.ts:128-420` — watches the job row via Realtime, loads the result, runs the optional chroma post-pass.
  - Top-level state lives in `EnhanceWorkspace` (`sourceFile`, `engine`) + the hooks (results/status). **Params are new state to add here**, piped into the hooks.
- **shadcn/ui present**: only `Button` (`src/components/ui/button.tsx`). **No `Slider`, `Label`, `Tabs/Toggle`.** → `npx shadcn@latest add slider` (and likely `label`).
- **Patterns to mirror**: `cn()` conditional classes (`EngineToggle.tsx:34`, `ImageUploader.tsx:52-56`); responsive padding (`index.astro:38`); all layout is flex + `gap-*` (no grid yet) — the panel introduces the first responsive grid.

### 2. Local engine — parameter threading

- **Interface**: `src/lib/engines/types.ts:26-29` — `enhance(source, opts: { mimeType: string })`. Widen `opts` → `{ mimeType: string; gamma?: number; blurPx?: number }`.
- **Constants**: `src/lib/engines/local-engine.ts:16` `GAMMA = 1.5`, `:18` `BLUR_PX = 1.2`. Applied at `:42` (`ctx.filter = blur(${BLUR_PX}px)`) and `:49-54` (LUT loop over RGB). Change to read `opts.gamma ?? 1.5`, `opts.blurPx ?? 1.2`.
- **LUT**: `src/lib/engines/image-helpers.ts:64-71` `buildGammaLut(gamma)` already parameterized — `out = round(255·(in/255)^(1/gamma))`. **No change**; just feed user gamma.
- **Call site**: `useLocalEnhance.ts:97` passes only `{ mimeType }`. Hook must accept `{gamma, blurPx}` and forward them; `EnhanceWorkspace` owns the slider state.
- **Perf**: `enhance()` runs **full-resolution on the main thread** (`local-engine.ts:34-35`, no downscale). A 12 MP re-process is ~0.5–2 s → re-running on every slider drag will stutter. **Debounce (~300–500 ms) is required** at the call site (no debounce exists today).
- **Validation gap**: `image-helpers.ts` validates only file type/size (`:35-58`) + `MAX_IMAGE_DIMENSION=8000` (`:23`). New `validateGamma`/`validateBlur` (range-guarded) needed.
- **Tests**: `tests/image-helpers.test.ts:43-62` pins `buildGammaLut(1.5)` behavior (256 entries, fixed [0,255] endpoints, monotonic, midtone brighten). Constants `GAMMA`/`BLUR_PX` are not separately pinned. `enhance()` itself is DOM-dependent and untested. New tests: param-range assertions + the Auto analyzer (pure fn).

### 3. Cloud/Bread — parameter threading + cost-safety (full trace)

Flow today (params NOT carried anywhere yet):

| Hop           | Location                                                                                                          | Today                                                              | Change for S-12                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Client submit | `useCloudSubmit.ts:49` → `cloud-upload.client.ts:30-34,69-93`                                                     | POST body `{ fileExtension, mimeType }` only                       | add `gamma`/`strength` to the body (still on the explicit Apply button)         |
| API route     | `src/pages/api/enhance/cloud/create-job.ts` (`prerender=false`, POST) → `cloud-create-job.handler.ts:60-129`      | auth→parse→zod→sweep→cap→createPhotoJob                            | forward parsed `gamma`/`strength` into the command (`:118`)                     |
| Zod schema    | `src/lib/services/photo-job.schema.ts:23-31`                                                                      | only `fileExtension`+`mimeType` enums                              | **add** `gamma`/`strength` `z.number()` with bounds (gamma ≤1.5, strength ≤0.2) |
| DTOs          | `src/types.ts:16-30` (`PhotoJob`), `:37-41` (`CreatePhotoJobCommand`), `:48-51` (`CreatePhotoJobRequest`)         | no params                                                          | add fields (mirror `model_version` at `:24`)                                    |
| jobs table    | `supabase/migrations/20260528120000_create_jobs_table.sql:30-42`                                                  | no gamma/strength columns                                          | **new migration** adds nullable `gamma`/`strength`                              |
| Insert        | `photo-job.service.ts:createPhotoJob` (insert ~`:101`)                                                            | inserts row without params                                         | write `gamma`/`strength` into the row                                           |
| DB webhook    | `20260531120000_jobs_enqueue_webhook.sql:40-55`                                                                   | `AFTER INSERT WHEN status='queued'` → POST `{ jobId }` to `/start` | unchanged — params ride the row, not the webhook                                |
| Edge `/start` | `supabase/functions/enhance/index.ts:333` `getJobById` (`select("*")`), `:362` `buildBreadInput(signedSourceUrl)` | uses fixed defaults                                                | pass `job.gamma`/`job.strength` (already loaded by `select("*")`)               |
| **The seam**  | `src/lib/services/bread.ts:35-41` `buildBreadInput`                                                               | returns fixed `BREAD_GAMMA=1.2`/`BREAD_STRENGTH=0.2`               | accept optional overrides, fall back to locked defaults                         |

- **Migration pattern**: copy `20260621120000_add_model_version_to_jobs.sql` — additive, nullable, no backfill. New columns **inherit existing RLS** (no policy/grant change), and the table is already `REPLICA IDENTITY FULL` so Realtime payloads carry them. INSERT is service-role only since `20260621185226_restrict_jobs_insert_to_service_role.sql` — good (clients can't forge params; they pass them through the validated create-job route which inserts via service role).
- **Cap enforcement**: `cloud-create-job.handler.ts:106` checks `isOverDailyCap(countCloudJobsToday(...), cap)` **before** insert. `countCloudJobsToday` (`photo-job.service.ts:135-149`) = global count of today's rows where `status<>'failed' OR replicate_prediction_id IS NOT NULL`. **1 Apply = 1 INSERT = 1 cap slot = ≤1 paid prediction.** (Pre-Replicate `failed` rows release their slot — no over-count.)

#### Cost-safety invariant — CONFIRMED (and how to preserve it)

The only path to a paid job today is: explicit button `onClick` (`EnhanceWorkspace.tsx:198/245`) → `cloudSubmit.submit()` → `submitCloudJob` → POST `/create-job` → one `queued` INSERT → the `AFTER INSERT WHEN status='queued'` webhook → one `/start` → one Replicate prediction. There are **zero** `gamma`/`strength`/slider references in any cloud component today, and the webhook fires on **INSERT only, never UPDATE**. **Preserve by**: carrying params as fields on the _same single create-job POST_; never issue an on-change request; never re-kick a prediction from an UPDATE. Auto recompute mutates only local slider state.

### 4. Deterministic Auto — heuristics, safe ranges, history

**Where luma is computed**: reuse the canvas-2d `getImageData` path (already at `local-engine.ts:47`) on a **downscaled sample** (longest edge ≤256 px). Compute Rec.601 `Y` into a 256-bin histogram → `mean, p50, p90, p99, %clip≥250, %near-white≥240` (the repro metric set). Pure `(Uint8ClampedArray) → LumaStats`, sub-ms, unit-testable, no DOM coupling beyond the sample draw.

**Local heuristic (decisive — rescuing a fixed curve).** Target-driven: to hit output mean `T`, `γ = ln(m/255)/ln(T/255)` with a sliding target that → input mean (γ→1.0) for bright inputs. Equivalent testable band table:

| Input mean | Class        | Local gamma | Note                             |
| ---------- | ------------ | ----------- | -------------------------------- |
| ≤20        | very dark    | **1.5**     | repro `01`: 15→38 correct        |
| 20–40      | dark night   | **1.35**    | stop `03` p90 +35 blowout        |
| 40–70      | dim          | **1.2**     |                                  |
| 70–100     | moderate     | **1.1**     | `02` (96): avoid +30 over-bright |
| >100       | well-exposed | **1.0**     | Sunset: no lift                  |

Safety overrides (clip guards): if `%near-white≥240 > 10%` or `p99 ≥ 250` → cap gamma at **1.05**; if `p90 ≥ 220` → subtract 0.1. Blur tied weakly to darkness: ≤40 → 1.5px; 40–100 → 1.2px; >100 → 0.8px.

**Bread heuristic (conservative — nudging an already-adaptive model).** The one real datapoint shows Bread _compresses_ range (p99 76→50) and didn't over-bright on dark input; bright-input behavior is unmeasured → small nudges only, inside the contract:

| Input mean | Bread gamma       | Bread strength |
| ---------- | ----------------- | -------------- |
| ≤20        | **1.2** (default) | **0.2** (max)  |
| 20–60      | 1.15              | 0.2            |
| 60–100     | 1.1               | 0.15           |
| >100       | 1.0               | 0.1            |

Bread highlight guard: `%near-white≥240 > 10%` → gamma 1.0. Never exceed contract ceilings.

**Per-engine safe-range + default table**

| Engine | Param    | Min | Max | Step | Default | Bound source                                                        |
| ------ | -------- | --- | --- | ---- | ------- | ------------------------------------------------------------------- |
| Local  | gamma    | 1.0 | 1.5 | 0.05 | 1.5     | `local-engine.ts:16`; max=current=strongest needed, min 1.0=no lift |
| Local  | blur px  | 0.0 | 2.0 | 0.1  | 1.2     | `local-engine.ts:18`                                                |
| Bread  | gamma    | 1.0 | 1.5 | 0.05 | 1.2     | `bread.ts:18` "≤1.5" — **hard contract ceiling**                    |
| Bread  | strength | 0.0 | 0.2 | 0.05 | 0.2     | `bread.ts:21` "≤0.2" — **hard contract ceiling**                    |

**Bread bounds are machine-enforced, not preferences.** `scripts/lib/bread-version-resolver.ts:80-104` (`assertNumericPropertyAccepts`) refuses to pin a model version whose OpenAPI input schema wouldn't accept the configured gamma/strength — so Auto/sliders must never recommend above 1.5 / 0.2.

## Code References

- `src/components/enhance/EnhanceWorkspace.tsx:37-294` — workspace; container `:106`, layout stack `:113-274`, engine state `:45`, cloud submit buttons `:198-199,:245-246`
- `src/components/enhance/EngineToggle.tsx:18-55` — Local↔Cloud toggle
- `src/components/enhance/BeforeAfterSlider.tsx:1-113` — result comparison slider
- `src/components/hooks/useLocalEnhance.ts:82-111,:97` — local enhance + the `.enhance(img,{mimeType})` call site
- `src/components/hooks/useCloudSubmit.ts:34-56` ; `src/lib/services/cloud-upload.client.ts:30-93` — cloud submit payload
- `src/lib/engines/types.ts:26-29` — `ImageEngine.enhance` opts
- `src/lib/engines/local-engine.ts:16,18,42,49-54` — constants + application
- `src/lib/engines/image-helpers.ts:64-71,:35-58,:23` — `buildGammaLut`, validators, max-dim
- `src/lib/services/photo-job.schema.ts:23-31` — create-job zod (add params here)
- `src/lib/services/cloud-create-job.handler.ts:60-129` — handler order; cap `:106`; forward `:118`
- `src/lib/services/photo-job.service.ts:101,:135-149` — `createPhotoJob` insert; `countCloudJobsToday`
- `src/types.ts:16-30,:37-41,:48-51` — PhotoJob + command/request DTOs
- `supabase/migrations/20260528120000_create_jobs_table.sql:30-42,86-90,115-121,136` — jobs schema, RLS, grants, REPLICA IDENTITY
- `supabase/migrations/20260621120000_add_model_version_to_jobs.sql` — additive-nullable migration precedent
- `supabase/migrations/20260531120000_jobs_enqueue_webhook.sql:40-55` — INSERT-only webhook
- `supabase/functions/enhance/index.ts:333,:362` — `getJobById(select *)`, `buildBreadInput` call
- `src/lib/services/bread.ts:15-41` — defaults, `BreadInput`, `buildBreadInput` (the per-job seam)
- `scripts/lib/bread-version-resolver.ts:80-104` — machine-enforced gamma/strength contract
- `src/lib/engines/chroma-denoise.ts:24-55` — chroma params (disjoint from Bread input)
- `context/changes/adaptive-enhancement-parameters/repro-findings.md` — measured over-brightening evidence

## Architecture Insights

- **Each engine isolates its params in one spot** — Local in two module constants + a parameterized LUT; Bread in `buildBreadInput`. This makes S-12 a _threading_ job, not a rewrite.
- **Bread params ride the persisted `jobs` row**, so no pipeline/transport change is needed — the Edge Function already does `select("*")`. The `model_version` column (S-11) is a perfect precedent for an additive-nullable param column.
- **The cost-safety invariant is structural** (INSERT-only webhook + cap-before-insert), so the risk is purely about _not introducing_ an on-change request — easy to hold.
- **Local re-processing is the only real perf concern** (full-res main thread) → debounce, and consider a downscaled live preview if drag latency is poor (Local only; Cloud has no live preview by decision).
- **Auto is a pure function** → high test leverage; the repro metrics are exactly the analyzer's inputs, so unit tests can assert dark→1.5, bright→≤1.1/1.0, guards fire, outputs in-range, gamma monotonic-decreasing in mean.

## Historical Context (from prior changes)

- **Phase-0 Bread spike** (`context/archive/2026-05-31-cloud-ai-realtime-result/spike-findings.md`): locked `gamma=1.2`/`strength=0.2` as **safe defaults inside the model contract**, _not_ empirically tuned optima — there was no parameter sweep, and the only test image was a noise/resolution chart, so real-photo quality was **INCONCLUSIVE** (carried forward as a model-swap signal). Cold boot ~132 s (relaxed SLA); ~$0.0006/run. This is why Bread Auto should nudge conservatively and why the Bread evidence gap is real.
- **S-11 `bread-chroma-postpass`** (`context/archive/2026-06-18-bread-chroma-postpass/`): the chroma post-pass is **client-side on the fetched result**, params `{blurRadius,maxStrength,shadowCurve}` — **disjoint** from `BreadInput` (`gamma`/`strength` → Replicate). `grep` confirms no gamma/strength in `chroma-denoise.ts`. **No conflict** with S-12; the ownership boundary holds (S-12 = prediction inputs, S-11 = post-result pixels). S-11 flag is independent of S-12.
- **Lessons priors that apply** (`context/foundation/lessons.md`): new jobs column → keep service_role grants, owner-scoped writes, REPLICA IDENTITY FULL (already set); Edge Function stays excluded from tsc/eslint (Deno) — `bread.ts` is the shared dependency-free seam, keep it `@/`-free; debounce/perf and the "don't lint generated artifacts"/CRLF Windows notes for implementation.

## Related Research

- `context/changes/adaptive-enhancement-parameters/repro-findings.md` — the pre-research over-brightening reproduction (Local decisive, Bread partial).
- `context/changes/adaptive-enhancement-parameters/frame.md` — framing brief (problem vs solution separation, locked scope).
- `context/archive/2026-05-31-cloud-ai-realtime-result/` — S-04 Bread pipeline + spike.
- `context/archive/2026-06-18-bread-chroma-postpass/` — S-11 ownership boundary.

## Open Questions / Follow-ups

1. **Bread evidence gap (deferred, non-blocking)**: run 2–3 real Replicate Bread predictions on moderate/well-exposed images to confirm whether Bread shares Local's over-brightening or its tone-mapping already adapts. Decides how aggressive the Bread Auto table should be. Needs a `REPLICATE_API_TOKEN`. The archived `bread-ab.ts` harness can drive it.
2. **Local live preview vs debounce-only**: is debounced full-res re-process acceptable UX, or is a downscaled live-preview-then-final-render needed? (Local only.)
3. **Auto re-trigger semantics on engine switch**: when the user toggles Local↔Cloud, does Auto recompute for the newly-active engine automatically (cheap, deterministic) or only on demand? (Cost-safe either way — Auto never calls the network.)
4. **Param persistence**: are chosen params remembered per session / written to the job row for audit only, or also surfaced back in the UI on result? (The row will store the Bread values regardless for telemetry parity with `model_version`.)
5. **"Restore Auto" UX**: per-slider override marking + a visible reset — confirm the exact interaction in planning (frame.md requires it).

---

## Follow-up Research [2026-06-28] — External validation + Codex `Auto_mode.pdf` review

Two inputs added: (1) external web research on the Bread model contract + deterministic auto-exposure practice; (2) review of Codex's proposal in `c:\Users\prmi\Downloads\Auto_mode.pdf` (7 pp.).

### Correction to an earlier claim (important)

The main-research line "Bread strength ≤0.2 is a hard contract ceiling, machine-enforced by the resolver" was **overstated**. `scripts/lib/bread-version-resolver.ts:80-104` only asserts the model schema **accepts the configured defaults** (`BREAD_GAMMA=1.2`, `BREAD_STRENGTH=0.2`) — it does NOT read or enforce the model's maximum. However, the repo independently encodes the **actual model contract**: the resolver test fixture `tests/bread-version-resolver.test.ts:30-31` mocks the live schema as `gamma {min 0, max 1.5}`, `strength {min 0, max 0.2}`, matching the `bread.ts:18,21` comments. So **treat gamma≤1.5 / strength≤0.2 as the model's declared input range** (high confidence). Definitive confirmation = a live schema query (`npm run resolve:bread-version` or `GET /v1/models/mingcv/bread/versions/<hash>`), which needs a `REPLICATE_API_TOKEN` — quick follow-up.

### External findings (web)

- **Bread params semantics** ([Replicate `mingcv/bread`](https://replicate.com/mingcv/bread), [GitHub `mingcv/Bread`](https://github.com/mingcv/Bread), IJCV "Breaking Down the Darkness"): `gamma` = brighter output; `strength` = smoother (denoise) output. The model itself decouples luminance/chrominance and runs an illumination-adjustment net then noise suppression — i.e. **Bread already does adaptive tone-mapping internally**, corroborating the repro's single-datapoint observation and the "nudge conservatively" stance. Public pages do **not** expose numeric min/max (rendered client-side / in the version `openapi_schema`).
- **Deterministic auto-gamma is established practice** ([Automatic Exposure via a Luminance Histogram, bruop.github.io](https://bruop.github.io/exposure/); USPTO tone-correction patents [7142712](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7142712), [7443442](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7443442); [adaptive gamma w/ color preservation, ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0030402615014230)): targeting the luminance histogram's center-of-gravity/median to a fixed target, then deriving a gamma curve, and **expanding only toward lower luminance to protect highlights**, is textbook auto-tone-correction. This validates BOTH our and Codex's `gamma = log(median)/log(target)` + highlight-protection approach. No ML needed.

### Codex `Auto_mode.pdf` — summary

Codex independently converges on our locked decisions: **Auto = deterministic "slider recommender", not a separate pipeline**; analyze luminance on a downscaled (~512 px) copy; **"don't make the photo bright — extract shadow detail without blowing highlights"**; never start from constants. Specifics it adds:

- **Luma**: Rec.709 `Y = 0.2126R + 0.7152G + 0.0722B`, percentiles p05/p25/p50/p75/p95/p99 + `shadow_ratio (Y<0.18)`, `highlight_ratio (Y>0.90)`, `clip_ratio (Y>0.98)`, normalized [0,1].
- **Gamma**: `gamma = log(p50)/log(target_median)`, **target_median 0.28–0.34** (0.26 for night scenes; explicitly warns against ≥0.40 → "washed HDR").
- **Highlight protection**: `if p95>0.85: gamma*=0.80`; `if clip_ratio>0.005: gamma=min(gamma,1.10)`.
- **Local ranges**: gamma **1.00–1.80**, blur 0.00–1.00; **blur from a noise estimator** (`std(highpass(Y))` on `dark_mask Y<0.25`), `+0.15` if gamma>1.4 — not from brightness.
- **Bread ranges**: gamma **1.00–1.35**, **strength 0.05–0.30**; `strength = 0.05 + 0.25·clamp((0.30−p50)/0.30,0,1)`; brakes `if p95>0.85: strength*=0.7`, `if clip>0.005: strength≤0.10, gamma≤1.10`.
- **UX**: `Auto: ON/OFF`, `[Recalculate Auto]`, show values (e.g. `Gamma 1.18 / Strength 0.14`), flag `Auto adjusted manually` on override — matches `frame.md`.
- **Process**: build a **30–50 image regression set with expected Auto recommendations** ("else you fix one photo and break five").

### Reconciliation — our research vs Codex vs contract

| Dimension                        | Our research                | Codex                              | Evidence                                  | Reconciled                                                                                                                              |
| -------------------------------- | --------------------------- | ---------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Auto = deterministic recommender | yes                         | yes                                | web ✓ established                         | **Agree**                                                                                                                               |
| Gamma formula                    | `ln(m)/ln(T)` target-driven | `log(p50)/log(target)`             | identical                                 | **Agree** — adopt with explicit target                                                                                                  |
| Target median                    | implicit (~0.43 = 110/255)  | **0.28–0.34**, 0.26 night          | Codex's avoids "washed HDR"               | **Adopt Codex 0.28–0.34** (lower = safer vs over-bright)                                                                                |
| Luma coeffs                      | Rec.601 (repro)             | **Rec.709**                        | 709 correct for sRGB                      | **Adopt Rec.709** (Codex)                                                                                                               |
| Highlight guards                 | coarse                      | **granular** (p95/clip thresholds) | web ✓                                     | **Adopt Codex's granular guards**                                                                                                       |
| Local gamma max                  | 1.5 (=current)              | **1.8**                            | no contract limit (client-side)           | **Decision** → recommend slider max **1.8** (headroom for darkest), Auto stays ≤~1.6; repro's 1.5 was adequate at mean 15 so not urgent |
| Local blur                       | darkness proxy              | **noise estimator**                | Codex more principled                     | **Adopt noise-proxy** (Codex), simplify if needed                                                                                       |
| Bread gamma max                  | 1.5 (contract)              | 1.35 (conservative)                | contract 1.5                              | slider max **1.5**, Auto recommends ≤1.35 (Codex)                                                                                       |
| **Bread strength max**           | **0.2**                     | **0.30** ❌                        | **contract 0.2** (test fixture + comment) | **0.2 wins** — clamp; Codex's 0.30 would be rejected by the model / refuse-to-pin                                                       |
| Cost-safety (Apply-only)         | invariant confirmed         | (UX implies it)                    | code ✓                                    | **Agree**                                                                                                                               |
| Regression test set              | open Q                      | **30–50 imgs w/ expected**         | —                                         | **Adopt** as a plan deliverable                                                                                                         |

### Net adjustments for `/10x-plan`

1. **CLAMP Bread strength to ≤0.2** (model contract) — Codex's 0.05–0.30 must become **0.05–0.20**; rescale its `strength = 0.05 + 0.25·underexposure` to `0.05 + 0.15·underexposure` (so max lands at 0.20, not 0.30). This is the one hard fix to Codex's numbers.
2. **Adopt Codex's gamma engine**: Rec.709 luma, target_median 0.28–0.34 (0.26 night), `gamma=log(p50)/log(target)`, granular highlight guards. Supersedes the coarser band table in the main research (keep the band table only as a sanity cross-check / unit-test oracle).
3. **Local gamma slider max** = open decision (1.5 vs 1.8) — recommend **1.8** for dark-frame headroom; cheap/reversible (client-side).
4. **Blur** = noise-estimator (Codex) preferred over the darkness proxy.
5. **Add the 30–50 image regression set** (expected Auto outputs) as an explicit plan/test deliverable — extends the existing `repro/` evidence; also the vehicle for the deferred Bread bright-input runs.
6. **Verify the live Bread schema** (token) to nail down gamma/strength min/max definitively before locking slider bounds.

### Sources

- [Replicate — mingcv/bread](https://replicate.com/mingcv/bread)
- [GitHub — mingcv/Bread (IJCV "Breaking Down the Darkness")](https://github.com/mingcv/Bread)
- [Automatic Exposure Using a Luminance Histogram — Bruno Opsenica](https://bruop.github.io/exposure/)
- [Adaptive gamma correction w/ color preservation — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0030402615014230)
- USPTO automatic tone-correction patents [US7142712](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7142712), [US7443442](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7443442)
- Codex proposal: `c:\Users\prmi\Downloads\Auto_mode.pdf` (reviewed 2026-06-28; not committed to the repo)
