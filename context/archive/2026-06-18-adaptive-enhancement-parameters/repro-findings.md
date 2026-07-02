# Over-brightening reproduction — pre-research evidence (S-12)

> The `frame.md` step recommended **before** `/10x-research`: reproduce the
> over-brightening on a representative low-light set and identify where
> highlights / faces / midtones become unnaturally bright, separately for Local
> and Cloud. Done 2026-06-27. Before/after images in `./repro/`.

## Method

- **Local** — reproduced **faithfully** from `src/lib/engines/local-engine.ts`:
  `blur(1.2px)` then a per-RGB-channel gamma LUT `out = round(255·(in/255)^(1/1.5))`
  (`GAMMA = 1.5`, `image-helpers.ts:buildGammaLut`). Deterministic, zero-cost.
  Caveat: CSS `blur(1.2px)` is approximated by PIL `GaussianBlur(radius=1.2)`
  (radius ≈ std-dev); blur barely affects luma stats, the gamma drives brightness.
- **Cloud (Bread)** — `gamma = 1.2`, `strength = 0.2` (`src/lib/services/bread.ts`),
  runs on Replicate. Only **one** real output was available (today's `01` raw
  result); `02`/`03` need fresh Replicate calls (token + ~$0.0006/run) — not run.
- Luma = Rec.601 `Y`. Samples from the archived A/B set (the exact classes
  `frame.md` asks for).

## Local engine — result (DECISIVE)

Gamma LUT spot-check (confirms aggressive lift): `32→64`, `64→101`, `128→161`, `200→217`.

| Sample (class)             | Ymean before→after      | p50 (midtone) | p90               | near-white ≥240 % | Verdict                               |
| -------------------------- | ----------------------- | ------------- | ----------------- | ----------------- | ------------------------------------- |
| `01` very dark             | 15.2 → **38.2** (+23)   | 8 → 37        | 41 → 50           | 0 → 0             | ✅ correct — intended lift, no clip   |
| `03` moderate night        | 23.0 → **40.5** (+17)   | 8 → 25        | 50 → **85** (+35) | 1.5 → 1.8         | ⚠ midtones pushed hard                |
| `02` mixed / highlights    | 96.0 → **125.9** (+30)  | 93 → 124      | 157 → 181         | 1.0 → 1.2         | ❌ over-bright — already well-exposed |
| `Sunset` already-exposed\* | 122.0 → **145.1** (+23) | 121 → 154     | 249 → 250         | 16.5 → 18.1       | ❌ over-bright — blown toward white   |

\* `Sunset-Exposure-Example` is a composite exposure-tutorial montage, not a single photo — directional only.

**Visual (see `./repro/*.local-ba.jpg`):**

- `01` very dark — near-black → texture revealed; atmosphere preserved. Gamma 1.5 is **right** here.
- `02` Copenhagen blue-hour — a _well-exposed_ night scene loses its night mood: sky washed lighter, scene flat/brighter, warm lights less punchy. Clear over-brightening.
- `Sunset` — sky blown to near-white, midtones lifted toward white.

**Conclusion (Local):** the over-brightening is **not** a gamma-math bug — it's that a **single fixed `GAMMA = 1.5`** serves the very-dark target well but **over-brightens any moderately/well-exposed input** (midtone p50/p90 shift +30–35, mean +23–30). The engine assumes every photo is dark and needs the same lift. This decisively confirms `frame.md` hypotheses _"fixed defaults too aggressive"_ + _"settings must vary per image"_ — i.e. exactly the case for S-12's Auto-recommend + manual override.

## Cloud (Bread) — result (PARTIAL — 1 datapoint)

| Sample         | orig Ymean | Bread Ymean | p50    | p90     | p99         |
| -------------- | ---------- | ----------- | ------ | ------- | ----------- |
| `01` very dark | 15.2       | 36.2        | 8 → 36 | 41 → 42 | **76 → 50** |

- Bread on the very-dark target **lifts shadows and pulls highlights down** (p99 76→50, p50 8→36) — a tone-curve/denoise that _compresses_ range rather than naively brightening. Similar mean lift to Local (~36 vs 38) but **no over-bright / no clip** on this dark input.
- `gamma = 1.2` is milder than Local's `1.5`, and Bread also downscales to ~1.5 MP.
- **Gap:** Bread over-brightening on _moderate/mixed/well-exposed_ inputs is **unmeasured** — needs 2–3 real Replicate runs (`02`, `03`, + one well-exposed) to confirm whether Cloud shares Local's one-size-fits-all problem or its tone-mapping already adapts.

## What this means for `/10x-research` → `/10x-plan`

- **Confidence raised to HIGH on the Local side** (`frame.md` was MEDIUM pending this repro). The Auto analyzer must, at minimum, **detect already-bright / well-exposed inputs and recommend lower gamma** (down to ~1.0 = no lift) instead of a constant 1.5.
- **Bread side still MEDIUM** — confirm with a few real runs before locking Auto ranges for Cloud; if Bread's internal tone-mapping already adapts, the Cloud Auto job is mostly about safe `strength`/`gamma` _ranges_, not rescuing a naive curve.
- Feeds the open S-12 blockers: Auto-analyzer mechanism (deterministic luma metrics look sufficient for Local — mean/percentile-driven gamma), safe per-engine ranges, and cost-safe Cloud apply (don't auto-run Bread on every Auto recompute).

## Reusable rig

`scratchpad/repro_local.py` (Local replication + metrics). Re-run on any sample set; outputs before|after JPEGs + the metrics table.
