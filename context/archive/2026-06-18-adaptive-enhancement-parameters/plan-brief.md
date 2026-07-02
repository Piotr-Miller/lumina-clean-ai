# Adaptive Enhancement Parameters (S-12) — Plan Brief

> Full plan: `context/changes/adaptive-enhancement-parameters/plan.md`
> Frame brief: `context/changes/adaptive-enhancement-parameters/frame.md`
> Research: `context/changes/adaptive-enhancement-parameters/research.md`

## What & Why

LuminaClean applies fixed enhancement parameters, which **over-brighten** any photo that isn't genuinely dark (measured: a fixed Local gamma 1.5 lifts a very-dark frame correctly but blows an already-bright one 96→126 and a sunset to white). This slice adds a parameter panel with **manual sliders** + a **deterministic Auto** mode that recommends per-image values — lowering gamma toward 1.0 as the input brightens and protecting highlights — for both engines, while keeping Cloud strictly cost-safe.

## Starting Point

Both engines use fixed constants/defaults in one place each: Local `GAMMA=1.5`/`BLUR_PX=1.2` (`local-engine.ts:16,18`; gamma LUT already parameterized) and Bread `gamma=1.2`/`strength=0.2` (`bread.ts:35`). The UI is a centered `max-w-2xl` column with no Slider component. Bread params can ride the persisted `jobs` row to the Edge Function (no new transport).

## Desired End State

After selecting a photo, the user sees the active engine's sliders pre-filled by Auto. Local edits re-render (debounced); Cloud edits change only pending values — nothing runs until **Apply**. Each slider shows its value, marks itself "adjusted manually" on override, and a Restore Auto recomputes. Bright photos are no longer over-brightened by default.

## Key Decisions Made

| Decision               | Choice                                                  | Why                                                         | Source         |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------- | -------------- |
| Auto analyzer          | Deterministic luma metrics                              | $0, instant, unit-testable; repro shows it suffices         | Research       |
| Cloud cost-safety      | Explicit Apply only                                     | No slider/Auto action spawns a paid job (invariant in code) | Research       |
| Gamma engine           | target-median 0.28–0.34 (0.26 night) + highlight guards | Codex; established auto-tone practice; avoids "washed HDR"  | Research/Codex |
| Luma coefficients      | Rec.709                                                 | Correct for sRGB                                            | Codex          |
| Bread strength max     | **0.2** (clamp)                                         | Model contract ceiling — Codex's 0.30 would be rejected     | Research       |
| Local gamma slider max | **1.8**                                                 | Headroom for very-dark; client-side, free/reversible        | Plan           |
| Local re-process       | Debounce-only (full-res)                                | Simplest, exact result; no 2nd render path                  | Plan           |
| Blur                   | Simple darkness proxy, **conservative secondary**       | Must not dominate; priority = don't over-brighten           | Plan           |
| Phasing                | Local-first (3 phases)                                  | Ship decisive low-risk value first; isolate Cloud DB/Edge   | Plan           |
| Regression oracle      | Seed 8–12 now, full 30–50 later                         | Catch main luma-class regressions without a dataset project | Plan/Codex     |
| Bread Auto             | Conservative **provisional** (clamped, marked)          | Bright-input behavior unmeasured; honest + cost-safe        | Plan           |

## Scope

**In scope:** parameter panel (responsive, engine-specific) + Slider; deterministic Auto (`computeLumaStats` + `recommendParams`); Local `gamma`+blur threading with debounce; Bread `gamma`+`strength` threading via create-job → jobs row → Edge Function, behind Apply; nullable `jobs.gamma`/`strength` migration; 8–12 image oracle.

**Out of scope:** vision/ML Auto; live Cloud preview; model selection/fallback/Retinexformer/extra Bread params/advanced Local algorithms; raising Bread strength >0.2 or gamma >1.5; full 30–50 dataset; empirical Bread bright-input validation (deferred); S-11 chroma changes.

## Architecture / Approach

Pure core `src/lib/engines/auto-params.ts` (`computeLumaStats` → `recommendParams`, `PARAM_RANGES`) + a thin DOM sampler. UI: `ParameterPanel` driven by workspace state in a responsive grid. Local threads params through `ImageEngine.enhance` `opts` + `useLocalEnhance` (debounced). Cloud threads params on the single create-job POST → zod (bounds) → `jobs` columns → `buildBreadInput` override in the Edge Function. Cost-safety is structural (cap-before-insert + INSERT-only webhook); params never trigger a request outside Apply.

## Phases at a Glance

| Phase                   | What it delivers                                                                    | Key risk                                                            |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. Auto analyzer (pure) | `computeLumaStats` + `recommendParams` + ranges + 8–12 oracle                       | Heuristic quality — mitigated by range-based tests + repro evidence |
| 2. Panel + Local e2e    | Slider, responsive panel, Local threading + debounce + Auto/override/restore        | Full-res reprocess latency (debounce); first responsive grid        |
| 3. Cloud/Bread + Apply  | Migration, zod (strength≤0.2), DTOs, Edge Function override, provisional Bread Auto | DB/Deno boundary; preserving the cost-safety invariant              |

**Prerequisites:** S-01 (Local + UI) + S-04 (Bread pipeline) — both done. Phase 1 has no deps; Phase 3 needs a local Supabase stack for migration/integration tests.
**Estimated effort:** ~3 sessions (one per phase).

## Open Risks & Assumptions

- **Bread bright-input over-brightening is unmeasured** (1 dark datapoint). Bread Auto ships provisional; follow-up = 2–3 real Replicate runs on bright/mid images (token).
- **Bread contract bounds** (gamma≤1.5, strength≤0.2) come from the resolver test fixture + comments; definitively confirm via a live schema query when a token is handy.
- Prod migration must be applied by hand after merge (CI deploy doesn't run migrations).

## Success Criteria (Summary)

- Bright/already-exposed photos are no longer over-brightened by default; very-dark still gets a strong lift (Auto picks per-image gamma).
- User can override any slider and restore Auto; Local re-renders smoothly (debounced).
- A Cloud job applies the chosen Bread params; dragging sliders/Auto issues zero `create-job` requests — only Apply spends a cap slot; Bread strength can never exceed 0.2.
