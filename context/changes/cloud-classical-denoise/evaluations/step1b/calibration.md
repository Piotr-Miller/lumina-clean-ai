# S-20 step 1b — wavelet estimator calibration

Written by `python3 scripts/s20/wavelet.py --calibrate`. Synthetic fixtures only: no photo, decoded
image or render was read. Re-running it on the same `wavelet.py`, grid, scikit-image, PyWavelets and
numpy gives the same bytes. Plan: `context/changes/cloud-classical-denoise/plan.md` § Phase 10,
item 3, whose fixtures and tolerances (1a's, plan § Phase 2 item 3) were fixed before this record
existed, and change.md § Owner decisions (2026-11-09, step 1b candidate), item 2.

**Result: PASS.**

## Bind

A real render refuses unless this line is a PASS for trial 1b and the `wavelet.py`, grid,
scikit-image, PyWavelets and numpy that render (plan Phase 10 item 3; plan review F24).

```text
S20-CALIBRATION trial=1b result=PASS implementation_sha256=6b6119186030cfc60de6bc61e8626ce74bc26ee4e5f43516de979f09413b2ada config_sha256=c17de82767e914616412f1f7a49aeb4b7d9f38cb9e2f72509ca749ac12617186 skimage_version=0.26.0 pywt_version=1.8.0 numpy_version=2.5.4
```

## Set-up

- Seed 20261105; fixtures 1024×1024; σ ∈ {3, 8, 15}. Each plane draws from
  `numpy.random.default_rng([seed, fixture, σ, plane])` (PCG64).
- Noise: N(0, σ²) added in float to Y, Cb and Cr independently, in `rgb2ycbcr` units (Y 16–235).
- **Gated path:** the noisy YCbCr is converted with `ycbcr2rgb`, clipped to [0, 1] and rounded to
  8-bit RGB (`numpy.rint(x·255)`), the renderer's own output step. The estimator then runs its full
  path as on a photo: `rgb2ycbcr(img_as_float(rgb))`, the constant-plane check, per-plane min–max
  normalisation, Immerkær on the normalised plane. σ̂ is reported as σ̂_norm × (plane max − min), in
  `rgb2ycbcr` units; the filter itself would receive σ = k·σ̂_norm (plan review F19).
- **Expected value:** σ_eff = √(σ² + r²), where r² is each plane's own variance from rounding to
  8-bit RGB (plan review F34), computed below from skimage's `ycbcr_from_rgb` matrix M as
  Σ_j (M_ij / 255)² / 12.
- **Diagnostic, ungated:** the same estimator on the noisy YCbCr itself, with no conversion and no
  rounding.
- **Tolerances,** each applied to σ̂_Y, σ̂_Cb and σ̂_Cr separately (owner decision 2026-11-05):
  flat |σ̂ − σ_eff| / σ_eff ≤ 0.10; texture (σ̂ − σ_eff) / σ_eff ≤ 0.35, one-sided,
  as pre-registered. Dark ramp and near-clipping rows are recorded, not gated.
- Fixtures: flat Y = 128; texture Y = 128 + 40·sin(2πx/16)·sin(2πy/24); dark ramp Y = 16 → 56
  across x; near 16 Y = 18; near 235 Y = 233. Cb = Cr = 128 before noise in every fixture.
- scikit-image 0.26.0, PyWavelets 1.8.0, numpy 2.5.4.

## Rounding term

| Plane | r²       | r        |
| ----- | -------- | -------- |
| Y     | 0.027473 | 0.165749 |
| Cb    | 0.024963 | 0.157997 |
| Cr    | 0.027773 | 0.166653 |

## Estimates

σ̂ in `rgb2ycbcr` units. Relative error against each plane's own σ_eff.

| Fixture   | σ   | σ_eff Y / Cb / Cr           | σ̂_Y     | σ̂_Cb    | σ̂_Cr    | err Y    | err Cb   | err Cr   | Direct σ̂_Y / σ̂_Cb / σ̂_Cr    | Gate |
| --------- | --- | --------------------------- | ------- | ------- | ------- | -------- | -------- | -------- | --------------------------- | ---- |
| flat      | 3   | 3.0046 / 3.0042 / 3.0046    | 2.9991  | 3.0007  | 3.0018  | -0.18 %  | -0.12 %  | -0.09 %  | 2.9946 / 2.9966 / 2.9976    | pass |
| flat      | 8   | 8.0017 / 8.0016 / 8.0017    | 8.0058  | 8.0240  | 7.9955  | +0.05 %  | +0.28 %  | -0.08 %  | 8.0043 / 8.0224 / 7.9937    | pass |
| flat      | 15  | 15.0009 / 15.0008 / 15.0009 | 14.9794 | 15.0007 | 14.9908 | -0.14 %  | -0.00 %  | -0.07 %  | 14.9784 / 15.0026 / 14.9898 | pass |
| texture   | 3   | 3.0046 / 3.0042 / 3.0046    | 3.0075  | 3.0085  | 3.0096  | +0.10 %  | +0.14 %  | +0.17 %  | 3.0030 / 3.0044 / 3.0053    | pass |
| texture   | 8   | 8.0017 / 8.0016 / 8.0017    | 7.9938  | 7.9893  | 8.0016  | -0.10 %  | -0.15 %  | -0.00 %  | 7.9923 / 7.9880 / 7.9998    | pass |
| texture   | 15  | 15.0009 / 15.0008 / 15.0009 | 15.0195 | 14.9621 | 14.9744 | +0.12 %  | -0.26 %  | -0.18 %  | 15.0233 / 14.9822 / 14.9768 | pass |
| dark ramp | 3   | 3.0046 / 3.0042 / 3.0046    | 2.8912  | 2.8666  | 2.8924  | -3.77 %  | -4.58 %  | -3.74 %  | 2.9986 / 3.0009 / 3.0034    | —    |
| dark ramp | 8   | 8.0017 / 8.0016 / 8.0017    | 7.1862  | 6.9997  | 7.1902  | -10.19 % | -12.52 % | -10.14 % | 7.9817 / 7.9668 / 8.0217    | —    |
| dark ramp | 15  | 15.0009 / 15.0008 / 15.0009 | 12.3367 | 11.8695 | 12.2209 | -17.76 % | -20.87 % | -18.53 % | 15.0428 / 14.9656 / 14.9932 | —    |
| near 16   | 3   | 3.0046 / 3.0042 / 3.0046    | 2.1776  | 2.1310  | 2.1730  | -27.52 % | -29.06 % | -27.68 % | 2.9950 / 2.9981 / 2.9927    | —    |
| near 16   | 8   | 8.0017 / 8.0016 / 8.0017    | 5.0227  | 5.0862  | 5.0726  | -37.23 % | -36.43 % | -36.61 % | 7.9932 / 7.9972 / 7.9939    | —    |
| near 16   | 15  | 15.0009 / 15.0008 / 15.0009 | 8.9994  | 9.2248  | 9.1263  | -40.01 % | -38.51 % | -39.16 % | 15.0148 / 15.0427 / 14.9993 | —    |
| near 235  | 3   | 3.0046 / 3.0042 / 3.0046    | 2.1809  | 2.1282  | 2.1799  | -27.41 % | -29.16 % | -27.45 % | 2.9963 / 2.9944 / 3.0020    | —    |
| near 235  | 8   | 8.0017 / 8.0016 / 8.0017    | 5.0279  | 5.0737  | 5.0810  | -37.16 % | -36.59 % | -36.50 % | 8.0065 / 7.9881 / 8.0104    | —    |
| near 235  | 15  | 15.0009 / 15.0008 / 15.0009 | 8.9963  | 9.2149  | 9.1068  | -40.03 % | -38.57 % | -39.29 % | 15.0040 / 15.0176 / 14.9520 | —    |

## Known limit

Synthetic white noise does not reproduce correlated camera or JPEG noise. A PASS shows that the
estimator reads additive noise in the filter's own space within the pre-registered tolerances. It
does not show that any `k` improves a real photo; the blind pilot and gate decide that. If this
record contradicts the grid, the grid is revised before it is committed, never after a real render.
