# S-20 step 1a — NLM estimator calibration

Written by `python3 scripts/s20/nlm.py --calibrate`. Synthetic fixtures only: no photo, decoded
image or render was read. Re-running it on the same `nlm.py`, grid, OpenCV and numpy gives the
same bytes. Plan: `context/changes/cloud-classical-denoise/plan.md` § Phase 2, item 3, whose
fixtures and tolerances were fixed before this record existed (F14), and the owner decisions of
2026-11-05 recorded there.

**Result: PASS.**

## Bind

A real render refuses unless this line is a PASS for the `nlm.py`, grid and OpenCV that render
(owner decision 2026-11-05).

```text
S20-CALIBRATION result=PASS implementation_sha256=ab27728fc7858be9a79a501b70a562d6757fe4ccace10b8eea00dfe48eb19a85 config_sha256=34f1a72b3b3bd3a29276a8bafe6792ac58c70d29e2c394655de91ca402fd7b95 opencv_version=4.13.0
```

## Set-up

- Seed 20261105; fixtures 1024×1024; σ ∈ {3, 8, 15}. Each channel draws from
  `numpy.random.default_rng([seed, fixture, σ, channel])` (PCG64).
- Noise: N(0, σ²) added in float to the 8-bit Lab L, a and b channels independently, then
  rounded to the nearest integer (`numpy.rint`) and clipped to 0–255. Expected value:
  σ_eff = √(σ² + 1/12).
- **Gated path:** the noisy Lab is converted with `COLOR_Lab2LBGR` to 8-bit BGR, then the
  estimator runs as on a photo: `COLOR_LBGR2Lab`, then Immerkær per channel. The round-trip error
  stays in the measurement.
- **Diagnostic, ungated:** the same estimator on the noisy Lab itself, with no conversion.
- **Tolerances,** each applied to σ̂_L, σ̂_a and σ̂_b separately (owner decision 2026-11-05):
  flat |σ̂ − σ_eff| / σ_eff ≤ 0.10; texture (σ̂ − σ_eff) / σ_eff ≤ 0.35, one-sided,
  as pre-registered. Dark ramp and near-clipping rows are recorded, not gated.
- Fixtures: flat L = 128; texture L = 128 + 40·sin(2πx/16)·sin(2πy/24); dark ramp L = 0 → 40
  across x; near 0 L = 2; near 255 L = 253. a = b = 128 before noise in every fixture.
- OpenCV 4.13.0, numpy 2.5.4.

## Estimates

σ̂ in 8-bit Lab units (L scaled to 0–255; a, b offset by 128). Relative error against σ_eff.

| Fixture   | σ   | σ_eff   | σ̂_L     | σ̂_a     | σ̂_b     | σ̂_ab    | err L    | err a    | err b    | Direct σ̂_L / σ̂_a / σ̂_b      | Gate |
| --------- | --- | ------- | ------- | ------- | ------- | ------- | -------- | -------- | -------- | --------------------------- | ---- |
| flat      | 3   | 3.0139  | 3.0615  | 3.0291  | 3.0294  | 3.0293  | +1.58 %  | +0.51 %  | +0.52 %  | 3.0071 / 3.0097 / 3.0108    | pass |
| flat      | 8   | 8.0052  | 8.0999  | 8.0664  | 8.0384  | 8.0524  | +1.18 %  | +0.76 %  | +0.42 %  | 8.0087 / 8.0260 / 7.9987    | pass |
| flat      | 15  | 15.0028 | 15.1147 | 14.8150 | 15.0373 | 14.9261 | +0.75 %  | -1.25 %  | +0.23 %  | 14.9803 / 15.0064 / 14.9930 | pass |
| texture   | 3   | 3.0139  | 3.0842  | 3.0423  | 3.0456  | 3.0439  | +2.33 %  | +0.94 %  | +1.05 %  | 3.0148 / 3.0175 / 3.0184    | pass |
| texture   | 8   | 8.0052  | 8.1000  | 8.0400  | 8.0576  | 8.0488  | +1.18 %  | +0.44 %  | +0.65 %  | 7.9983 / 7.9931 / 8.0053    | pass |
| texture   | 15  | 15.0028 | 15.1717 | 14.7736 | 15.0284 | 14.9010 | +1.13 %  | -1.53 %  | +0.17 %  | 15.0257 / 14.9859 / 14.9797 | pass |
| dark ramp | 3   | 3.0139  | 3.3108  | 3.1792  | 3.3381  | 3.2587  | +9.85 %  | +5.49 %  | +10.76 % | 2.9380 / 3.0133 / 3.0172    | —    |
| dark ramp | 8   | 8.0052  | 7.3942  | 7.0551  | 7.1547  | 7.1049  | -7.63 %  | -11.87 % | -10.62 % | 7.4575 / 7.9728 / 8.0266    | —    |
| dark ramp | 15  | 15.0028 | 12.5609 | 11.4251 | 11.6988 | 11.5619 | -16.28 % | -23.85 % | -22.02 % | 13.1664 / 14.9693 / 14.9959 | —    |
| near 0    | 3   | 3.0139  | 1.0040  | 1.1978  | 1.7026  | 1.4502  | -66.69 % | -60.26 % | -43.51 % | 2.3789 / 3.0118 / 3.0055    | —    |
| near 0    | 8   | 8.0052  | 4.0252  | 4.6461  | 4.8836  | 4.7648  | -49.72 % | -41.96 % | -38.99 % | 5.2424 / 8.0012 / 7.9983    | —    |
| near 0    | 15  | 15.0028 | 7.9897  | 8.8924  | 9.4142  | 9.1533  | -46.75 % | -40.73 % | -37.25 % | 9.2095 / 15.0457 / 15.0013  | —    |
| near 255  | 3   | 3.0139  | 2.0892  | 2.2348  | 2.1759  | 2.2054  | -30.68 % | -25.85 % | -27.80 % | 2.3802 / 3.0073 / 3.0154    | —    |
| near 255  | 8   | 8.0052  | 4.6348  | 5.5989  | 5.4136  | 5.5062  | -42.10 % | -30.06 % | -32.37 % | 5.2516 / 7.9926 / 8.0160    | —    |
| near 255  | 15  | 15.0028 | 8.2171  | 10.6866 | 10.0332 | 10.3599 | -45.23 % | -28.77 % | -33.12 % | 9.2192 / 15.0195 / 14.9555  | —    |

## Conversion quantisation (measured, not gated)

The 8-bit `COLOR_LBGR2Lab` → `COLOR_Lab2LBGR` round trip on every BGR triple of
`range(0, 256, 7)`³ (50653 colours, 151959 channel values). These are facts
of the treatment; they are never fixed by swapping in another conversion.

- Maximum |Δ|: 4.
- Channel values with |Δ| > 1: 16706; colours with any |Δ| > 1: 15485.
- Pinned counterexample BGR (35, 98, 238) → (35, 98, 234) (reproduced).

## Idealised reference weight (recorded, not gated)

exp(−2σ²/h²) at h = k·σ, that is exp(−2/k²). It is not the measured weight of any real patch.

| k   | exp(−2/k²) |
| --- | ---------- |
| 1.0 | 0.1353     |
| 1.5 | 0.4111     |
| 2.0 | 0.6065     |

## Known limit

Synthetic white noise does not reproduce correlated camera or JPEG noise. A PASS shows that the
estimator reads additive noise in the filter's own space within the pre-registered tolerances. It
does not show that any `k` improves a real photo; the blind pilot and gate decide that. If this
record contradicts the grid, the grid is revised before it is committed, never after a real render.
