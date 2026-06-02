# Phase 0 — Bread spike findings

> Throwaway de-risking spike for S-04. Run against the real Replicate model. Gates Phase 2.

## How it was run

```
$env:REPLICATE_API_TOKEN=…; $env:GAMMA=…; $env:STRENGTH=…
npx tsx scripts/spikes/bread-spike.ts "<image url>"
```

- Test image: `https://www.image-engineering.de/content/library/image-quality/noise/noise_intro_2.jpg` — **a noise/resolution test chart, NOT a real low-light color photo** (the color-quality verdict below is therefore a weak proxy).
- Each run: cold (after idle) + warm (immediately after).

## Locked

- **Model / version:** `mingcv/bread` @ `057a4e073829a8c50f2622206f71a8ed25331cd07a520bc264469389c7c11e54` — reachable: **yes**.
- **Input mapping (chosen defaults for `buildBreadInput`):** `gamma = 1.2`, `strength = 0.2`.
- **Output shape:** single URI string — **confirmed**.

## Latency (vs ≤30s p95 budget)

| Run  | wall-clock | queue/boot (created→started) | predict (started→completed) |
| ---- | ---------- | ---------------------------- | --------------------------- |
| cold | ~135.6 s   | **~131.6 s** (model boot)    | ~3.0 s                      |
| warm | ~4.2 s     | ~0 s                         | ~1.7–2.2 s                  |

(Consistent across 3 sessions: cold boot ≈ 118–135 s; warm predict ≈ 1.7–3.6 s.)

## Verdicts

- **Cold-start vs ≤30s p95:** ❌ **misses badly when cold** (~132 s boot, model scales to zero when idle); ✅ **warm is well within budget** (~2–4 s).
  - **Decision: relax the SLA** — ≤30s p95 is a **warm-path** target; a cold first-request-after-idle is a **known ~2 min wait**. Revisit keep-warm (Replicate min-instances, continuous cost — tension with S-05's cost bound) later if needed. Model swap not pursued now.
- **Color in → color out:** returns **color, not grayscale** ✅ (the API's "Grayscale input image" label was a non-issue). **Subjective quality: INCONCLUSIVE** — only tested on a noise/resolution chart, where output read as "not really usable". **Action:** confirm real-world quality on a genuine low-light **color photo** during Phase 3 E2E before relying on output quality; if it's poor on real photos, that's a model-swap signal then.
- **Cost:** ~$0.0006/run — confirmed cheap.

## GO / NO-GO for Phase 2: **GO** (with the relaxed-SLA note above).

## Downstream implications (carry into later phases)

1. **Phase 5 client watchdog must NOT be ~60s.** A 60s timeout would FALSELY fail every cold-start job (~132 s). Either raise the watchdog above the cold-start ceiling (e.g. ~150–180 s), or show a "first run after idle can take ~2 min" affordance and only treat a much-longer stall as failure. Update the Phase 5 §3 timeout value when implementing.
2. **"within ~30s p95" copy/criteria** (Phases 4–5 success criteria, Desired End State) should be read as **warm-path**; the cold first request is the known exception. Reflect in the UX wording ("Enhancing in the cloud… first run can take a little longer").
3. **Output quality on real photos is unproven** — Phase 3 E2E should use a representative low-light color photo as its acceptance image, not a test chart.
