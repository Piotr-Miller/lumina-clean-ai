# Chroma-denoise A/B harness (Phase 5)

Standalone, dependency-free browser tool to tune the chroma-denoise params on
real **Bread-result** photos and confirm the end-to-end in-browser timing.

## Use

1. Open `index.html` directly in a browser (works from `file://` — the algorithm
   is loaded as a classic `<script>`, no server needed).
2. Click **Load image…** (or drag-drop) a Bread-result JPG (ideally one with
   visible color noise in the shadows).
3. Drag the divider to wipe **BEFORE (raw) ↔ AFTER (denoised)**. Hover for a
   100% loupe (left half = before, right half = after) to inspect shadow color
   noise vs luminance detail.
4. Tune `blurRadius` / `maxStrength` / `shadowCurve` — it reprocesses live. Read
   the **denoise (JS)** time and the **GO gate** (≤ 2 s) in the stats.
5. Record the chosen params + observations in `../tuning-results.md`.

## Fidelity

The pipeline mirrors production exactly
(`src/lib/services/cloud-result-postprocess.client.ts`):
`createImageBitmap → drawImage → getImageData → denoiseChroma → forceOpaque →
toBlob('image/jpeg', 0.92)`, and uses the **real bundled module**, not a re-port.

## Regenerating the bundle

`chroma-denoise.iife.js` is generated from the real source — regenerate after any
change to `src/lib/engines/chroma-denoise.ts`:

```bash
npx esbuild src/lib/engines/chroma-denoise.ts --bundle --format=iife \
  --global-name=ChromaDenoise \
  --outfile=context/changes/bread-chroma-postpass/ab-harness/chroma-denoise.iife.js
```

## Test samples

`bash fetch-samples.sh` (from repo root) downloads the 3 representative low-light
photos into `samples/`. These three (and the generated `analysis/` A/B strips)
are committed to the repo so the Phase-5 evidence is self-contained and survives
the external source URLs rotting. All ≤ 12 MP so the pass runs; the larger two
(~10 MP) also exercise the end-to-end perf budget. Any other files in `samples/`
(ad-hoc scratch inputs used in manual spot-checks) are local-only and gitignored
— they have no recorded license and are deliberately not committed.

| File                            | Category        | Source / license                                                                                |
| ------------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `01-very-dark-iso160000.jpg`    | very dark       | Sony A9 II ISO-160000 black-frame, extreme chroma noise — Wikimedia, **CC BY 4.0** (Anil Öztaş) |
| `02-mixed-copenhagen-night.jpg` | mixed           | Copenhagen Kødbyen by night — Wikimedia, **CC BY-SA 4.0** (Terragio67)                          |
| `03-moderate-night-street.jpg`  | moderately dark | Night street (Olympus E-M1) — **Unsplash License** (MChe Lee)                                   |

The `01` black-frame is the clearest view of the pass smoothing pure shadow
chroma noise; `02`/`03` are real scenes for judging luminance-detail
preservation. These approximate Bread outputs (real shadow noise) — for a fully
faithful input, run a night photo through Bread first, then load that here.

> The harness is a tuning aid; the production flag `CHROMA_POSTPASS_ENABLED`
> stays **OFF** regardless of what is tuned here.
