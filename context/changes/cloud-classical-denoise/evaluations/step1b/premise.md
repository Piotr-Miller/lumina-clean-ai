# S-20 step 1b — Phase 7 premise record

Measured 2026-11-10 on branch `feat/cloud-classical-denoise-1b` at `0ec1ce6`, before any step-1b
harness code exists. Plan: `context/changes/cloud-classical-denoise/plan.md` § Phase 7. Each "if
this fails" consequence below is copied from the plan, where it was written before the check ran.

Host: Fedora, `/usr/bin/python3` 3.15.0, 8 logical CPUs (the 1a host). The measurement script is
reproduced in the appendix; it ran from a session scratch directory and is not committed as a tool.

## Checks

| #   | Check                                                         | Command                                                                                                                                                                                                                        | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | If this fails                                                  |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | scikit-image and PyWavelets at the pinned versions            | `python3 -I -c "import skimage, pywt; assert (skimage.__version__, pywt.__version__) == ('0.26.0', '1.8.0'), …"`                                                                                                               | **Pass.** Exit 0. scikit-image **0.26.0**, PyWavelets **1.8.0** (Fedora `python3-scikit-image`, `python3-pywt`, installed by the owner 2026-11-10). Recorded: numpy 2.5.4, scipy 1.18.0. dask is **not** importable, so `cycle_spin` would run serially even without `workers=1`; the plan pins `workers=1` anyway.                                                                                                                                                                                                       | A version mismatch stops 1b until the owner decides            |
| 2   | The installed skimage sources are the ones the decision cites | sha256 of the installed `/usr/lib64/python3.15/site-packages/skimage/{restoration/_denoise.py, restoration/_cycle_spin.py, color/colorconv.py}` against the v0.26.0 tag sources (`src/skimage/…`, read through the GitHub API) | **Pass, byte-identical, 3/3.** `_denoise.py` `88481e09372f298e…`, `_cycle_spin.py` `63f9ac98e4d417b7…`, `colorconv.py` `fc5f49ac194c2293…` on both sides. No Fedora patch touches them, so every line the decision record cites (BayesShrink threshold `_denoise.py:611-617`, untouched approximation `:793`, default levels `:737-742`, `_rescale_sigma_rgb2ycbcr` `:830-849`, the 16-shift `np.roll` enumeration `_cycle_spin.py:14-47,147-151`, `ycbcr_from_rgb` `colorconv.py:482-484`) holds for the installed code. | A difference stops 1b and is written into `change.md`          |
| 3   | The 1a audit re-derives FAIL before any 1b change             | `python3 scripts/s20/gate.py --audit context/changes/cloud-classical-denoise/evaluations/step1-audit`                                                                                                                          | **Pass.** Exit 1 (the FAIL verdict): "audit re-derives FAIL: 3 of 8 wins, k 1.0; metadata only, no image opened." This is the baseline for Phases 8–12.                                                                                                                                                                                                                                                                                                                                                                   | 1b does not start while 1a no longer re-derives                |
| 4   | One timed wavelet run (declared exception)                    | `TMPDIR=<scratch> python3 -I premise1b.py <root>` (appendix)                                                                                                                                                                   | **4.7 min per photo at one `k`** on S17-06's decoded PNG (4284×5712, 24.5 MP): estimation and conversion 5.9 s, render 211.4 s (3 planes × 16 shifts, one thread), observing pass 68.3 s, PNG write 1.5 s; peak RSS **3438 MB**; 9 wavelet levels. The 24 renders of Phase 11 therefore take roughly 1.9 h on this host (estimate from one photo).                                                                                                                                                                        | More than 15 min per photo is reported, and the plan continues |
| 5   | Holdout guard allows the eight tuning ids                     | `python3 -B scripts/s19/protocol.py check-access --ids S17-01 S17-02 S17-03 S17-04 S17-05 S17-06 S17-07 S17-21`                                                                                                                | **Pass.** Exit 0, `{"allowed": [all eight]}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 1b does not read any photo                                     |

## Declared exception: the timed render

This is the one render before the 1b rules are committed, and it is stated here as the plan
requires.

- It ran on S17-06 only, at k = 1.0, with σ̂ computed as decided (Immerkær on each normalised
  `rgb2ycbcr` plane) and the filter called as decided (`cycle_spin(denoise_wavelet, max_shifts=3,
workers=1)`, BayesShrink, soft, `db1`, default levels, `rescale_sigma=False`). Neither σ̂ nor
  any count of the observing pass was printed or kept.
- The guards ran first: `require_access(["S17-06"])`, then `check_paths` on the prepared input's
  sidecar, the decoded record and the decoded PNG; the decoded PNG was verified against its
  record (`nlm.verified_decoded`: file hash and pixel hash). The temporary output path was not
  passed through `check_paths`; it was a fresh file in the session scratch directory, outside the
  repository and the photo store.
- The output was written to that temporary file and deleted unopened (`os.remove`, never read
  back); the scratch directory was empty afterwards. Only the wall times and peak memory above
  were kept.
- **Not the step-4 guardrail.** This times one single-threaded run on a laptop CPU. It says
  nothing about the ≤ 30 s p95 product budget, a container's cold start or a server CPU. It does
  say the decided method is about 21× slower than 1a's NLM on the same photo (13.31 s with 8
  threads), which step 4 would have to answer for if 1b passed.

## What this changes downstream

Nothing in the plan. All five checks pass; the 1b render budget (≈ 1.9 h for Phase 11, 3.4 GB peak)
fits this host. The plan's estimate of "a few GB" peak memory holds.

## Appendix: `premise1b.py`

```python
"""S-20 step 1b premise probe (plan Phase 7, check 4): one timed wavelet render on S17-06.

Declared exception to "no render before the rules": guards first, output to a temporary file that
is deleted unopened, only wall times and peak memory are printed. Run:
  python3 -I premise1b.py <repo-root>
"""
import math
import os
import resource
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(ROOT / "scripts" / "s19"))
sys.path.insert(0, str(ROOT / "scripts" / "s20"))

import protocol  # noqa: E402
import nlm  # noqa: E402  (1a's renderer: decoded-record verification and the Immerkaer estimator)

import numpy as np  # noqa: E402
import pywt  # noqa: E402
from PIL import Image  # noqa: E402
from skimage import color, img_as_float  # noqa: E402
from skimage.restoration import cycle_spin, denoise_wavelet  # noqa: E402

PID, K = "S17-06", 1.0

protocol.require_access([PID])
p = nlm.paths_for(PID, [K])
protocol.check_paths([p["sidecar"], p["decoded_record"], p["decoded_png"]], validation=False)
_, bgr = nlm.verified_decoded(PID, p)
rgb = np.ascontiguousarray(bgr[:, :, ::-1])
h, w = rgb.shape[:2]

t0 = time.perf_counter()
ycc = color.rgb2ycbcr(img_as_float(rgb))
planes, sigmas = [], []
for i in range(3):
    pl = ycc[..., i]
    lo, hi = float(pl.min()), float(pl.max())
    norm = (pl - lo) / (hi - lo)
    s_hat = nlm.immerkaer(norm)
    planes.append((norm, lo, hi))
    sigmas.append(K * s_hat)
t_prep = time.perf_counter() - t0

kw = dict(wavelet="db1", mode="soft", method="BayesShrink", wavelet_levels=None, rescale_sigma=False)
t0 = time.perf_counter()
out = np.empty_like(ycc)
for i, (norm, lo, hi) in enumerate(planes):
    den = cycle_spin(norm, func=denoise_wavelet, max_shifts=3, workers=1,
                     func_kw={**kw, "sigma": sigmas[i]})
    out[..., i] = den * (hi - lo) + lo
res = np.rint(np.clip(color.ycbcr2rgb(out), 0, 1) * 255).astype(np.uint8)
t_render = time.perf_counter() - t0

t0 = time.perf_counter()
counted = 0
for i, (norm, _, _) in enumerate(planes):
    var = sigmas[i] ** 2
    levels = max(pywt.dwtn_max_level(norm.shape, "db1") - 3, 1)
    for dy in range(4):
        for dx in range(4):
            coeffs = pywt.wavedecn(np.roll(norm, (dy, dx), axis=(0, 1)), "db1", level=levels)
            for lvl in coeffs[1:]:
                for c in lvl.values():
                    dvar = np.mean(c * c)
                    t = var / math.sqrt(max(dvar - var, np.finfo(c.dtype).eps))
                    after = pywt.threshold(c, value=t, mode="soft")
                    counted += int(np.count_nonzero((c != 0) & (after == 0)))
t_observe = time.perf_counter() - t0

fd, tmp = tempfile.mkstemp(suffix=".png")
os.close(fd)
t0 = time.perf_counter()
Image.fromarray(res, "RGB").save(tmp, compress_level=1)
t_write = time.perf_counter() - t0
os.remove(tmp)  # deleted unopened: never read back, never shown

peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
print(f"{PID} {w}x{h} ({w*h/1e6:.1f} MP), k {K}: prep {t_prep:.2f} s, render (16 shifts x 3 planes) "
      f"{t_render:.1f} s, observing pass {t_observe:.1f} s, PNG write {t_write:.2f} s, "
      f"peak RSS {peak_mb:.0f} MB, levels {levels}")
```
