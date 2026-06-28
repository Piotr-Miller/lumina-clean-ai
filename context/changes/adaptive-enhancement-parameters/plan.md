# Adaptive Enhancement Parameters (S-12) Implementation Plan

## Overview

Add a responsive **parameter panel** (right of the image, stacked below on narrow screens) that lets the user tune the active engine and start from **deterministic Auto recommendations** they can override:

- **Local** (client Canvas): `gamma` (1.0–1.8) + blur intensity.
- **Cloud / Bread**: `gamma` (1.0–1.5) + `strength` (0.0–**0.2**, hard model ceiling).

Auto is a pure `(image luma stats) → params` function (no ML, no vision model). It **lowers gamma toward 1.0 as the input gets brighter** and protects highlights, fixing the measured over-brightening (`repro-findings.md`). Cloud changes are **cost-safe**: no slider/Auto action ever spawns a paid Bread job — only an explicit **Apply** consumes `CLOUD_DAILY_CAP`.

## Current State Analysis

Both engines apply **fixed, non-adaptive** parameters, which over-brighten anything not genuinely dark (proven in `repro-findings.md`: a fixed Local gamma 1.5 lifts a very-dark frame correctly 15→38 but blows an already-bright one 96→126 / sunset 122→145):

- **Local** (`src/lib/engines/local-engine.ts:16,18`): module constants `GAMMA=1.5`, `BLUR_PX=1.2`; gamma via the already-parameterized `buildGammaLut(gamma)` (`image-helpers.ts:64`), blur via `ctx.filter` (`:42`). `ImageEngine.enhance` `opts` is `{ mimeType }` only (`types.ts:26-29`). Call site `useLocalEnhance.ts:97`. Runs full-res on the main thread (no downscale).
- **Cloud/Bread** (`src/lib/services/bread.ts:35-41`): `buildBreadInput` returns fixed `gamma=1.2`/`strength=0.2`. Params would thread: `photo-job.schema.ts:23-31` (zod) → `src/types.ts` DTOs → new nullable `jobs` columns → `createPhotoJob` insert → Edge Function `enhance/index.ts:362` (already does `getJobById` `select("*")`). Cap counted before insert (`cloud-create-job.handler.ts:106`); webhook fires `AFTER INSERT WHEN status='queued'` only (`20260531120000_jobs_enqueue_webhook.sql`).
- **UI** (`src/components/enhance/EnhanceWorkspace.tsx:106`): centered `max-w-2xl` flex column; engine state `:45`; submit buttons `:198-199,:245-246`. Only `Button` exists under `src/components/ui/` — **no Slider**.

Full grounding: `context/changes/adaptive-enhancement-parameters/research.md` (incl. the external/Codex review).

## Desired End State

After selecting a photo the user sees a panel with the active engine's sliders pre-filled by Auto. Adjusting a Local slider re-renders the result (debounced); adjusting a Cloud slider changes only the pending values and nothing runs until **Apply**. Each slider shows its value; moving one marks it "adjusted manually" without discarding other Auto values; a **Restore Auto** control recomputes. Bright/already-exposed photos no longer get over-brightened by default. Verify: load the repro images, confirm Auto picks gamma≈1.0 for the bright ones and the higher lift only for dark ones; confirm a Cloud job applies the chosen Bread params and that dragging sliders issues **no** `create-job` request.

### Key Discoveries

- The gamma LUT is already parameterized (`image-helpers.ts:64`) — Local threading is two constants + `opts`.
- Bread params can **ride the persisted `jobs` row** to the Edge Function (`getJobById` `select("*")`) — **no new transport**; the only seam is `buildBreadInput` (`bread.ts:35`).
- **Bread `strength` model ceiling is 0.2** (resolver test fixture `tests/bread-version-resolver.test.ts:30-31` + `bread.ts:21`); gamma ceiling 1.5. Codex's proposed strength→0.30 is **invalid** and is clamped here.
- Cost-safety is structural (cap-before-insert + INSERT-only webhook) — preserved by keeping params on the single create-job POST.
- The deterministic auto-gamma engine (target-median + highlight protection) is established practice (research external refs).

## What We're NOT Doing

- No vision model / ML / CLIP for Auto (deterministic only).
- No live Cloud preview; no per-keystroke Cloud calls; no UPDATE-triggered re-prediction.
- No model selection / fallback / Retinexformer / extra Bread params / advanced Local algorithms (S-13/S-14 scope).
- No change to the S-11 chroma post-pass (disjoint: client post-result, not a Bread input).
- No raising Bread `strength` above the model contract (0.2) or gamma above 1.5.
- No full 30–50 image regression dataset in this slice (seed 8–12 now; full set is a follow-up).
- Bread bright-input behavior is **not** empirically validated here (accepted evidence gap; Bread Auto ships provisional).

## Implementation Approach

**Local-first**, three phases. Phase 1 isolates the algorithm (pure, fully unit-tested) so the riskiest part is proven without UI. Phase 2 delivers the full Local vertical slice (panel + Slider + threading + debounce + Auto/override). Phase 3 threads Cloud/Bread end-to-end behind the cost-safe Apply, with provisional Bread Auto. Bread `strength` is clamped to ≤0.2 everywhere (UI range, zod, Auto formula).

## Critical Implementation Details

- **Cost-safety invariant (hard):** no slider change and no Auto recompute may issue a network request. The only path to a paid job stays: explicit Apply → `submitCloudJob` → one `create-job` POST → one `queued` INSERT → INSERT-only webhook. Cloud params are fields on that **same** POST; never an on-change request, never an UPDATE re-kickoff. Verify in Phase 3 manual testing (network panel shows zero `create-job` while dragging).
- **Bread `strength` ≤ 0.2** is a model contract ceiling, enforced at three layers (UI max, zod max, Auto clamp). A value >0.2 must be rejected by zod (400) and is unreachable from the slider.
- **`bread.ts` stays dependency-free** (shared across the Deno boundary — no `@/`, no `astro:env`). `buildBreadInput` gains optional overrides only.
- **Edge Function is outside tsc/eslint** — run `deno check supabase/functions/enhance/index.ts` after the Phase-3 edit (lessons.md).
- **Auto priority:** gamma + highlight protection is the primary decision; **blur is a small, conservative secondary add-on** and must never dominate (user directive). On Windows, lint only touched files (CRLF baseline; lessons.md).

## Phase 1: Deterministic Auto analyzer + parameter contracts (pure, no UI)

### Overview

Build the pure luma analyzer and the per-engine recommender + range/clamp contracts, with unit tests and an 8–12 image oracle. No DOM beyond a thin sampler wrapper.

### Changes Required

#### 1. Luma stats + recommender module

**File**: `src/lib/engines/auto-params.ts` (new)

**Intent**: A pure, DOM-free core that turns pixel data into luma statistics and maps those to recommended parameters per engine, implementing the Codex gamma engine with highlight protection and the user directive that blur stays a conservative secondary add-on.

**Contract**:

- `computeLumaStats(pixels: Uint8ClampedArray): LumaStats` — Rec.709 luma `Y = 0.2126R + 0.7152G + 0.0722B` normalized to [0,1] into a 256-bin histogram; returns `{ mean, p05, p25, p50, p75, p95, p99, shadowRatio (Y<0.18), highlightRatio (Y>0.90), clipRatio (Y>0.98) }`. Pure (array in → object out).
- `recommendParams` — declared with **TypeScript function overloads** so callers narrow without casts: `recommendParams(stats: LumaStats, engine: "local"): LocalParams` and `recommendParams(stats: LumaStats, engine: "cloud"): BreadParams` (single implementation signature over the `LocalParams | BreadParams` union). Gamma: `target_median` = 0.30 default, 0.26 when `shadowRatio>0.65 && p95<0.65`; `gamma = log(max(p50,0.03)) / log(target_median)`. Highlight guards: `if p95>0.85: gamma*=0.80`; `if clipRatio>0.005: gamma=min(gamma,1.10)`. Then per-engine clamp + extras:
  - Local: `gamma = clamp(g, 1.0, 1.8)`; `blur` is a **conservative secondary add-on** (darkness proxy), **never the dominant signal**, pinned to a concrete piecewise on a darkness band (use `shadowRatio`/`p50` to classify):
    - already-bright / highlight-heavy → `0.0–0.1`
    - moderate night → `0.2`
    - dark → `0.35–0.4`
    - very-dark → `0.6`
    - gamma bump: `+0.1` when `gamma ≥ 1.6`
    - final clamp: `clamp(blur, 0.0, 0.7)` for the **Auto recommendation** (the slider range stays `0.0–2.0` so the user can push higher manually).
  - Bread: `gamma = clamp(g, 1.0, 1.5)`; `strength = clamp(0.05 + 0.15*clamp((0.30 - p50)/0.30, 0, 1), 0.0, 0.20)`; brakes `if p95>0.85: strength*=0.7`; `if clipRatio>0.005: strength=min(strength,0.10), gamma=min(gamma,1.10)`. Mark result `provisional: true`.
- Export `PARAM_RANGES` (per-engine `{min,max,step,default}`) as the single source of truth for sliders + validators: Local gamma {1.0,1.8,0.05,1.5}, Local blur {0.0,2.0,0.1,1.2}, Bread gamma {1.0,1.5,0.05,1.2}, Bread strength {0.0,0.20,0.05,0.2}.

#### 2. DOM sampler wrapper

**File**: `src/lib/engines/auto-params.client.ts` (new) — or co-locate behind a clearly DOM-only export.

**Intent**: Thin browser-only helper that downscales the source and extracts pixels for `computeLumaStats`, reusing the canvas-2d path already used by the Local engine.

**Contract**: `sampleImageLuma(source: HTMLImageElement | ImageBitmap): LumaStats` — draw into an offscreen canvas at longest-edge ≤ 512 px, `getImageData`, delegate to `computeLumaStats`. No business logic here (keep it trivial so the tested core is the pure module).

#### 3. Shared param types

**File**: `src/lib/engines/types.ts`

**Intent**: Add the parameter shapes used across the engines, panel, and hooks.

**Contract**: Add `LocalParams { gamma: number; blur: number }`, `BreadParams { gamma: number; strength: number; provisional?: boolean }`, `LumaStats` (fields above). No change to `EngineId`.

#### 4. Oracle fixtures

**File**: `tests/fixtures/auto-params/*.json` (new, committed stats) + `tests/auto-params.test.ts` (new); oracle source images tracked under `context/changes/adaptive-enhancement-parameters/repro/`

**Intent**: Seed an 8–12 image regression oracle spanning the luma classes and assert **ranges, not golden numbers** — runnable in the Node vitest gate (no DOM/canvas, no image-decoder dependency).

**Contract**: Cover ~8–12 images across: very dark, dark w/ point lights, moderate night, blue-hour/already-OK, bright/sunset, clean-but-dark, noisy mid-shadow, high-contrast night. Tests assert: already-bright → Local gamma ≈1.0 + low blur; very-dark → higher gamma + higher blur; highlight-heavy → capped gamma; **Bread strength ≤ 0.2 always**; all outputs within `PARAM_RANGES`.

- **Monotonicity is asserted vs `p50`, not `mean`** (the formula is `gamma = log(max(p50,0.03))/log(target_median)` — monotonic in `p50`, and the highlight guards make it non-monotonic in `mean`). Test it on a **synthetic stats sweep**: vary `p50` upward while holding `p95`/`clipRatio`/`shadowRatio` constant **below the guard thresholds**, assert recommended gamma is non-increasing. The **real-image oracle asserts coarse class ranges only** (no cross-image ordering): very-dark → higher bounded gamma; already-bright → gamma ≈ 1.0; highlight-heavy → capped gamma.
- **Oracle source = raw single-image originals**, not composites. The 4 files currently in `repro/` are `*.local-ba.jpg` — side-by-side **before/after montages**; luma stats over them mix the enhanced half into the histogram. Use the **raw originals** the repro rig read (`repro_local.py` inputs) as analyzer inputs; the `*.local-ba.jpg` files stay as **visual evidence only**. The `Sunset-Exposure-Example` montage is **directional/manual evidence**, not a single-image fixture (repro-findings.md already flags it as a composite, not one photo).
- **Fixture mechanism (no decode in the gate):** vitest runs `environment: "node"` (no `canvas`/`getImageData`) and the repo ships **no JS image decoder** (no `sharp`/`jimp`/`canvas`/`jpeg-js`). So **precompute** each oracle image's `LumaStats` offline (a one-off generation step in a DOM/PIL context — extend `repro_local.py` or a small Node+canvas script) and commit them as JSON under `tests/fixtures/auto-params/`. The oracle test reads those fixtures and asserts `recommendParams` output ranges — it does **not** decode images at runtime.
- **`computeLumaStats` is unit-tested separately** on hand-built synthetic `Uint8ClampedArray` buffers (the `tests/chroma-denoise.test.ts` pattern — known pixels → expected stats).
- **Parity caveat:** `computeLumaStats`↔`sampleImageLuma` (the real image→downscale→stats path) is **not** exercised by this gate; it is verified **manually in Phase 2** (Auto pre-fill on a real selected image). Record the fixture-generation command so stats can be regenerated.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes (touched files): `npx eslint src/lib/engines/auto-params*.ts tests/auto-params.test.ts`
- Unit tests pass: `npm run test:unit` (incl. `auto-params.test.ts` — range assertions + oracle)
- SSR build succeeds: `npm run build`

#### Manual Verification

- Spot-check `recommendParams` output on the repro images reads sane (bright → ~1.0, dark → strong lift, never Bread strength > 0.2).

**Implementation Note**: Pause for manual confirmation after automated checks pass before Phase 2.

---

## Phase 2: Parameter panel + Local engine end-to-end

### Overview

Deliver the full Local experience. Internally checkpointed (not separate top-level phases): **2a** panel + Slider + param state (no output change yet) → **2b** Local manual threading + debounce → **2c** Local Auto integration + override/restore.

### Changes Required

#### 1. Slider primitive

**File**: `src/components/ui/slider.tsx` (new, via `npx shadcn@latest add slider`; add `label` if needed)

**Intent** (2a): Provide the shadcn "new-york" Slider used by the panel.

**Contract**: Standard shadcn Slider (Radix) with `min/max/step/value/onValueChange`. No custom logic.

#### 2. Parameter panel component

**File**: `src/components/enhance/ParameterPanel.tsx` (new)

**Intent** (2a): Render the active engine's sliders with values, an Auto ON/OFF toggle, a Recalculate Auto action, per-slider "adjusted manually" marking, and Restore Auto — driven entirely by props/state (no engine calls inside).

**Contract**: Props `{ engine, params, ranges, auto: { on, onToggle, onRecalculate }, overridden: Set<paramKey>, onChange(key, value), onRestoreAuto }`. Engine-specific control sets keyed off `engine` (Local: gamma+blur; Bread: gamma+strength). Show numeric value per slider; render an "Auto adjusted manually" affordance when a key is in `overridden`; for Bread, show a small "provisional" note when `params.provisional`. Use `cn()` + existing Tailwind patterns.

#### 3. Workspace layout + param state

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent** (2a): Widen the container to a responsive 2-column grid (image + panel; panel stacks below at narrow widths) and own the parameter + Auto state, wiring it to `ParameterPanel`.

**Contract**: Replace the `max-w-2xl` column (`:106`) with a responsive grid (image cell + panel cell; single column < `md`). Add state: `localParams`, `breadParams`, `autoOn`, `overridden` per engine. Initialize from `PARAM_RANGES` defaults. `onChange` marks the key overridden; `onRestoreAuto`/`Recalculate` recompute from the current image via `sampleImageLuma` + `recommendParams` and clear overrides. **No network in any of these handlers.**

#### 4. Local engine accepts params

**File**: `src/lib/engines/types.ts`, `src/lib/engines/local-engine.ts`

**Intent** (2b): Thread `gamma` + `blur` into the Local engine, defaulting to today's constants when absent.

**Contract**: Widen `ImageEngine.enhance` `opts` to `{ mimeType: string; gamma?: number; blur?: number }`. In `local-engine.ts`, read `opts.gamma ?? 1.5` (feed `buildGammaLut`) and `opts.blur ?? 1.2` (feed `ctx.filter`). Behavior identical to today when params omitted.

#### 5. Local hook threading + debounce

**File**: `src/components/hooks/useLocalEnhance.ts` (+ a small debounce helper if none exists)

**Intent** (2b): Pass the panel's Local params into `enhance` and re-run on change, debounced (~300–500 ms) to keep full-res main-thread re-processing smooth.

**Contract**: `enhance()` forwards `{ gamma, blur }` to `localEngine.enhance` (the `:97` call). A debounced effect re-runs `enhance` when Local params change while a result exists. Keep the existing object-URL lifecycle/revocation intact.

#### 6. Local Auto integration

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent** (2c): On image accept (and on Recalculate/Restore Auto) compute Local Auto params and populate the sliders; manual edits override per-key; Restore Auto recomputes.

**Contract**: When a source is accepted and `autoOn`, call `sampleImageLuma` → `recommendParams(stats,"local")` → set `localParams`, clear `overridden`. A debounced re-render then reflects the Auto values. All client-side; no job.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes (touched files): `npx eslint <touched .tsx/.ts>`
- Unit tests pass: `npm run test:unit` (param validators/range clamping; any hook-level pure logic)
- SSR build succeeds: `npm run build`

#### Manual Verification

- Panel renders to the right on desktop and stacks below the image on mobile (responsive).
- Adjusting Local gamma/blur re-renders the result after the debounce; no UI freeze on a large image.
- On selecting a photo with Auto ON, sliders pre-fill; a **bright** photo gets gamma ≈1.0 (no over-brightening); a **very dark** photo gets a strong lift.
- Moving a slider marks it "adjusted manually" and leaves other Auto values intact; Restore Auto recomputes and clears the mark.
- No regressions to the existing upload → enhance → compare → download flow.

**Implementation Note**: Pause for manual confirmation after automated checks pass before Phase 3.

---

## Phase 3: Cloud/Bread threading + cost-safe Apply

### Overview

Thread user Bread `gamma`/`strength` from the panel to the Replicate prediction via the persisted `jobs` row, behind the explicit Apply (cost-safe). Bread Auto ships provisional (conservative, clamped, marked).

### Changes Required

#### 1. Migration — nullable Bread param columns

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_bread_params_to_jobs.sql` (new)

**Intent**: Persist the per-job Bread params (also gives telemetry parity with `model_version`).

**Contract**: `alter table public.jobs add column gamma double precision; add column strength double precision;` Additive + nullable, no backfill. Copy the `20260621120000_add_model_version_to_jobs.sql` pattern — new columns inherit existing RLS/grants (no policy/grant change), table is already `REPLICA IDENTITY FULL`. INSERT is service-role-only (`20260621185226`), so clients can't forge — values arrive via the validated create-job route.

#### 2. Zod schema + DTOs (bounds, strength ≤ 0.2)

**File**: `src/lib/services/photo-job.schema.ts`, `src/types.ts`

**Intent**: Accept and bound-validate optional Bread params on create-job; thread them through the command/request/entity types.

**Contract**: Extend `createPhotoJobRequestSchema` (`:23-31`) with optional `gamma: z.number().min(1.0).max(1.5)` and `strength: z.number().min(0.0).max(0.2)` (omitted → server uses locked defaults). Out-of-range → existing `invalid_body` 400. Add `gamma`/`strength` to `PhotoJob` (`:16`), `CreatePhotoJobCommand` (`:37`), `CreatePhotoJobRequest` (`:48`) (mirror `model_version`).

#### 3. Persist on insert + forward in handler

**File**: `src/lib/services/photo-job.service.ts`, `src/lib/services/cloud-create-job.handler.ts`

**Intent**: Write the params into the inserted row; forward parsed values from the handler.

**Contract**: `createPhotoJob` insert includes `gamma`/`strength` (from the command). `cloud-create-job.handler.ts:118` forwards `parsed.data.gamma`/`strength` into the command. Cap check (`:106`) unchanged — still one count per create-job.

#### 4. Client sends params on the single Apply POST

**File**: `src/lib/services/cloud-upload.client.ts`, `src/components/hooks/useCloudSubmit.ts`, `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: Include the user's Bread params in the existing create-job request body — and nowhere else.

**Contract**: `deriveRequest`/`submitCloudJob` (`cloud-upload.client.ts:30,69`) accept `{ gamma, strength }` and add them to the POST body. `useCloudSubmit.submit()` takes the current Bread params; `EnhanceWorkspace` passes `breadParams` at the existing Apply buttons (`:198-199,:245-246`). **No new request path** — sliders/Auto mutate state only.

#### 5. Edge Function uses per-job params

**File**: `src/lib/services/bread.ts`, `supabase/functions/enhance/index.ts`

**Intent**: Let `buildBreadInput` accept per-job overrides; pass the row's values at the call site.

**Contract**: `buildBreadInput(imageUrl, overrides?: { gamma?: number; strength?: number })` → uses overrides when present, else the locked `BREAD_GAMMA`/`BREAD_STRENGTH`. Keep the module `@/`-free. In `enhance/index.ts:362`, pass `{ gamma: job.gamma ?? undefined, strength: job.strength ?? undefined }` (already loaded by `getJobById` `select("*")`).

#### 6. Bread sliders + provisional Auto

**File**: `src/components/enhance/EnhanceWorkspace.tsx`, `ParameterPanel.tsx`

**Intent**: Show Bread sliders when the Cloud engine is active; Auto populates them with conservative provisional values; nothing runs until Apply.

**Contract**: When `engine==="cloud"`, panel shows Bread gamma/strength with a "provisional" note. Auto computes `recommendParams(stats,"cloud")` on select/Recalculate. Changing a Bread slider never triggers a job; the result updates only after an Apply round-trip.

### Success Criteria

#### Automated Verification

- Migration applies cleanly against a local stack: `npx supabase db reset` (or migration up)
- Type checking passes: `npm run typecheck`
- Linting passes (touched files): `npx eslint <touched>`
- Unit tests pass: `npm run test:unit` (zod accepts in-range, **rejects strength > 0.2 / gamma > 1.5**; `buildBreadInput` override; `createPhotoJob` writes params)
- Integration tests pass: `npm run test:integration` (a created job row carries `gamma`/`strength`; RLS unaffected)
- Edge Function checks: `deno check supabase/functions/enhance/index.ts`
- SSR build succeeds: `npm run build`

#### Manual Verification

- A real cloud job submitted with adjusted Bread params produces a result reflecting them (e.g. lower gamma → less lift); the `jobs` row shows the chosen `gamma`/`strength`.
- **Cost-safety:** dragging Bread sliders and toggling/Recalculating Auto issues **zero** `create-job` requests (verify in the network panel); only Apply creates a job and consumes one cap slot.
- Bread Auto pre-fills conservative provisional values; never offers strength > 0.2.
- No regression to the existing cloud submit → Realtime → result → download flow (and the S-11 chroma post-pass, if enabled, still applies on top).

**Implementation Note**: Pause for manual confirmation after automated checks pass.

---

## Testing Strategy

### Unit Tests

- `computeLumaStats`: known pixel buffers → expected stats (pure).
- `recommendParams`: range-based oracle on 8–12 images (already-bright→gamma≈1.0/low blur; very-dark→higher gamma+blur; highlight-heavy→capped gamma; Bread strength≤0.2 always; outputs within `PARAM_RANGES`). Gamma **monotonicity asserted vs `p50` on a synthetic sweep** (guards held below threshold), **not** across the real-image oracle (which asserts coarse class ranges only).
- Param validators / zod: in-range accepted, out-of-range (strength>0.2, gamma>1.5) rejected.
- `buildBreadInput` override vs default; `createPhotoJob` writes params.

### Integration Tests

- Created job row carries `gamma`/`strength`; RLS/grants unchanged (extends `jobs.rls.test.ts`).

### Manual Testing Steps

1. Bright photo + Auto → gamma ≈1.0, not over-brightened (Local).
2. Very dark photo + Auto → strong lift; override gamma, confirm only that slider marked; Restore Auto resets.
3. Resize to mobile → panel stacks below image.
4. Cloud: adjust Bread sliders/Auto, watch network = no `create-job`; Apply once → job runs with chosen params.

## Performance Considerations

Local re-process is full-res on the main thread (~0.5–2 s at 12 MP) → debounced (~300–500 ms); no live preview. Auto runs on a ≤512 px downscaled sample (sub-ms). Cloud unaffected (one job per Apply).

## Migration Notes

Additive nullable columns; existing rows stay null; the Edge Function falls back to locked Bread defaults when null, so in-flight/legacy jobs are unaffected. **Apply the prod migration by hand after merge** (CI deploy does not run migrations — see lessons.md / `supabase-migrations-not-auto-applied-by-ci-deploy`).

## References

- Research: `context/changes/adaptive-enhancement-parameters/research.md` (+ external/Codex review)
- Frame: `context/changes/adaptive-enhancement-parameters/frame.md`
- Repro evidence: `context/changes/adaptive-enhancement-parameters/repro-findings.md`
- Bread contract: `src/lib/services/bread.ts:15-41`, `scripts/lib/bread-version-resolver.ts:80-104`
- Migration precedent: `supabase/migrations/20260621120000_add_model_version_to_jobs.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Deterministic Auto analyzer + parameter contracts

#### Automated

- [x] 1.1 Type checking passes
- [x] 1.2 Linting passes (touched files)
- [x] 1.3 Unit tests pass (`auto-params.test.ts` — range assertions + 8–12 image oracle)
- [x] 1.4 SSR build succeeds

#### Manual

- [x] 1.5 `recommendParams` output on repro images reads sane (bright→~1.0, dark→strong lift, Bread strength ≤0.2)

### Phase 2: Parameter panel + Local engine end-to-end

#### Automated

- [ ] 2.1 Type checking passes
- [ ] 2.2 Linting passes (touched files)
- [ ] 2.3 Unit tests pass (param validators / range clamping)
- [ ] 2.4 SSR build succeeds

#### Manual

- [ ] 2.5 Panel responsive (right on desktop, stacked below on mobile)
- [ ] 2.6 Local slider change re-renders after debounce; no freeze on large image
- [ ] 2.7 Auto pre-fills on select; bright→gamma≈1.0 (no over-bright), very-dark→strong lift
- [ ] 2.8 Per-slider override marking + Restore Auto work; no regression to upload→enhance→compare→download

### Phase 3: Cloud/Bread threading + cost-safe Apply

#### Automated

- [ ] 3.1 Migration applies cleanly (local stack)
- [ ] 3.2 Type checking passes
- [ ] 3.3 Linting passes (touched files)
- [ ] 3.4 Unit tests pass (zod bounds incl. reject strength>0.2 / gamma>1.5; `buildBreadInput` override; `createPhotoJob` writes params)
- [ ] 3.5 Integration tests pass (job row carries params; RLS unaffected)
- [ ] 3.6 `deno check supabase/functions/enhance/index.ts` passes
- [ ] 3.7 SSR build succeeds

#### Manual

- [ ] 3.8 Real cloud job applies chosen Bread params; `jobs` row shows `gamma`/`strength`
- [ ] 3.9 Cost-safety: dragging sliders / Auto recompute issues zero `create-job`; only Apply creates a job
- [ ] 3.10 Bread Auto pre-fills conservative provisional values (never strength>0.2); no regression to cloud flow (+ chroma post-pass still applies if enabled)
