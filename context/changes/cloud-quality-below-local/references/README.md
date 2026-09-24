# References — what each file is, and what it can actually prove

Two kinds of file here. `01`–`03` are **screenshots of the app** taken on production 2026-08-31, the
original report. `04`–`07` are **raw `result.png` bytes** pulled straight from Supabase Storage on
2026-09-24 — the model's own output, before the client-side chroma post-pass touches anything.

> **Provenance.** All of these derive from photographs traced to
> <https://capturetheatlas.com/noise-in-photography/>, whose footer reads `ALL RIGHTS RESERVED`. They
> are kept as the technical evidence for a live decision, at the smallest size that carries the
> finding. They are **not** licensed material and must never be moved into `test-photos/licensed/`,
> which `AGENTS.md` licence-gates. For new experiment inputs, use `test-photos/` instead.

## Measured, not eyeballed

Hue distribution over each raw output. "Chromatic" means saturation > 0.18 and not near-black or
near-white; the hue shares are shares **of that chromatic part**.

| File                   | Job        |  Chromatic |    Magenta |     Green | Orange | What it can prove            |
| ---------------------- | ---------- | ---------: | ---------: | --------: | -----: | ---------------------------- |
| `07-…-magenta.png`     | `190832de` | **65.0 %** | **43.2 %** |    56.2 % |  0.2 % | **the fault, unambiguously** |
| `06-…-sunset-no-green` | `3f219e67` |     44.1 % |      3.3 % | **0.0 %** | 63.6 % | nothing about a green flip   |
| `05-…-no-colour`       | `c560b9d4` |  **0.0 %** |      0.0 % |     0.0 % |  0.0 % | **nothing at all**           |
| `04-…-no-colour`       | `bcff4e39` |  **0.0 %** |      0.0 % |     0.0 % |  0.0 % | **nothing at all**           |

`04` and `05` are **byte-identical** (sha256 `b20f0cb7…`). The two 2026-06-27 jobs, 21 minutes apart,
were the same input run twice — the model is deterministic. So the "three large-source runs" are
really **two distinct images**.

## Why that matters

The fault is a **green→magenta hue flip, gated by luminance**: hue survives where the output is
bright and flips where it is dark or mid-tone. Exhibiting it therefore requires a scene with
saturated green in its darker regions.

- `04`/`05` contain **no colour whatsoever** — near-black textured frames. "No visible cast" is true
  and empty: there is nothing chromatic to flip.
- `06` has plenty of colour but **zero green**; it is a sunset silhouette, 63.6 % orange. Its 3.3 %
  magenta is an ordinary pink twilight gradient, and it sits in the **bright** sky while the palms
  are near-black — the inverse of the fault's gating.
- `07` is the signature: 43.2 % magenta beside 56.2 % green, the aurora staying green while the ice
  and water go magenta.

**So the "large source" half of the 2×2 is EMPTY, not clean.** No large-source run has ever carried a
saturated green night scene, so none of them tests size-dependence. An earlier write-up read these as
"the fault is not universal"; that over-read the evidence and is corrected in
`../result-dimensions-census.md`.

This is precisely what **Run A** exists to supply, and these files are the reason it is still needed.

## File list

| File                                           | What                                                        |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `01-wolf-night-overbright-magenta.png`         | app screenshot, 2026-08-31 — blown out, violet cast         |
| `02-aurora-water-green-to-magenta.png`         | app screenshot, 2026-08-31 — the headline report            |
| `03-waterfall-aurora-grass-magenta.png`        | app screenshot, 2026-08-31 — grass magenta, sky cyan        |
| `04-bcff4e39-large-source-no-colour.png`       | raw output, 1536×1024, large source, no colour              |
| `05-c560b9d4-large-source-no-colour.png`       | raw output, byte-identical to `04`                          |
| `06-3f219e67-large-source-sunset-no-green.png` | raw output, 1536×1152, sunset, no green                     |
| `07-190832de-raw-model-output-magenta.png`     | raw output, 896×600, **the fault in the model's own bytes** |

Pulled with `scripts/prod-fetch-results.py`.
