#!/usr/bin/env python3
"""S-20 step 1b wavelet renderer, its diagnostic and its calibration (`cloud-classical-denoise`, plan Phase 10).

  python3 scripts/s20/wavelet.py --all | <ids…>           render every k of the grid
  python3 scripts/s20/wavelet.py --estimate-only --all    print σ̂ and σ per plane; render nothing
  python3 scripts/s20/wavelet.py --calibrate              synthetic fixtures only; write the record

Input: the shared decode `test-photos/private/s20/decoded/<id>.png` (written by
`local-arms.ts decoded`), verified by `nlm.verified_decoded`: its RGB bytes must hash to the
decoded record's `pixels_sha256`. The planes are Y, Cb and Cr of `skimage.color.rgb2ycbcr` on
`img_as_float`; a constant plane (max = min) is copied first, with no normalisation and no σ̂
(plan review F21). Every other plane is min–max normalised as skimage's own YCbCr loop does, its
noise is estimated there with 1a's Immerkær estimator (`nlm.immerkaer`), and the filter receives
σ = k·σ̂_norm (F19, F34): `cycle_spin(denoise_wavelet(method="BayesShrink", mode="soft",
wavelet="db1", wavelet_levels=None, rescale_sigma=False), max_shifts=3, workers=1,
channel_axis=None)` on each 2-D plane. Every parameter comes from
`scripts/s20/configs/wavelet-grid.json`, frozen before any real render (change.md § Owner
decisions (2026-11-09, step 1b candidate), item 2).

Diagnostic (item 3; never a gate criterion, never read by `pilot.py` or `gate.py`): a separate
observing pass repeats skimage's own calls for each plane and each of the 16 shifts and counts,
per level ("1" = finest) and orientation (`ad`, `da`, `dd`), the detail coefficients that
`pywt.threshold` set to 0 from nonzero, those nonzero before, and those already exactly 0. It
never feeds the output.

Output: `test-photos/private/s20/wavelet/k<k>/<id>.png` (RGB, no metadata) plus `<id>.json`, the
record `local-arms.ts wavelet-gamma` binds to.

Preconditions of a real render (plan § 1b Implementation Approach, order step 2):
  - every rule file is committed and clean (`evidence.py`);
  - the committed 1b calibration record's bind line is a PASS for trial 1b, this file's sha256,
    the grid's sha256 and the running scikit-image, PyWavelets and numpy.
`--calibrate` and `--estimate-only` render nothing real and are exempt. Every id passes
`protocol.require_access`, then every concrete path `protocol.check_paths`, before any byte is
read. Tuning photos only; there is no validation mode.

Exit status: 0 rendered (or calibration PASS, or estimates printed); 1 refused (or calibration
FAIL); 2 usage. Each refusal names its subject and the way out.

Environment overrides for the synthetic tests only: S19_MANIFEST, S19_PRIVATE (protocol.py),
S20_PRIVATE (the S-20 workspace), S20_REPO (the work tree holding the rule files, the grid and
the calibration record).
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import itertools
import json
import math
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "s19"))
sys.path.insert(0, str(HERE))

import evidence  # noqa: E402
import nlm  # noqa: E402  (1a's estimator, decode check and PNG writer, imported, never edited)
import protocol  # noqa: E402
from protocol import Refused  # noqa: E402
from trials import TRIALS  # noqa: E402

T = TRIALS["1b"]
PLANES = ("Y", "Cb", "Cr")
ORIENTATIONS = ("ad", "da", "dd")  # PyWavelets' keys of the three 2-D detail subbands
# What this tool runs; the grid must say exactly this (plan Phase 10 item 1).
FILTER = {"function": "skimage.restoration.denoise_wavelet", "method": "BayesShrink", "mode": "soft",
          "wavelet": "db1", "wavelet_levels": None, "rescale_sigma": False, "convert2ycbcr": False}
SPIN = {"function": "skimage.restoration.cycle_spin", "max_shifts": 3, "workers": 1, "channel_axis": None}
BIND = re.compile(r"^S20-CALIBRATION (.+)$")

# Calibration (plan Phase 10 item 3): 1a's seed, size, noise levels and tolerances, imported so
# they cannot drift from what 1a pre-registered.
SEED, CAL_SIZE, SIGMAS = nlm.SEED, nlm.CAL_SIZE, nlm.SIGMAS
FLAT_TOL, TEXTURE_TOL = nlm.FLAT_TOL, nlm.TEXTURE_TOL


def lib():
    try:
        import numpy
        import pywt
        import skimage
        import skimage.color
        import skimage.restoration
        import skimage.util
    except ImportError as e:
        raise Refused(f"scikit-image, PyWavelets and numpy are needed ({e}); install them with "
                      "`sudo dnf install python3-scikit-image python3-pywt`")
    return numpy, pywt, skimage


def versions() -> dict:
    np, pywt, skimage = lib()
    return {"skimage_version": skimage.__version__, "pywt_version": pywt.__version__,
            "numpy_version": np.__version__}


# ---------------------------------------------------------------- grid


def load_grid(root: Path) -> tuple[dict, str]:
    path = root / T.grid
    try:
        raw = path.read_bytes()
        grid = json.loads(raw)
    except (OSError, ValueError) as e:
        raise Refused(f"cannot read the wavelet grid {path}: {e}")
    problems = []
    ks = grid.get("k")
    if not (isinstance(ks, list) and ks and all(isinstance(k, (int, float)) and not isinstance(k, bool) for k in ks)):
        problems.append("k must be a non-empty list of numbers")
    else:
        for k in ks:
            if not (math.isfinite(k) and k > 0 and round(k, 1) == k):
                problems.append(f"k {k!r} is not a positive number with at most one decimal (directory k<k>)")
        if len(set(ks)) != len(ks):
            problems.append("k has duplicate values")
    for section, expected in (("filter", FILTER), ("spin", SPIN)):
        got = grid.get(section)
        if got != expected:
            problems.append(f"{section} is {got!r}, not the {expected!r} this tool runs")
    if (grid.get("estimator") or {}).get("kernel") != nlm.KERNEL:
        problems.append(f"estimator.kernel differs from the kernel this tool implements, {nlm.KERNEL}")
    if (grid.get("space") or {}).get("planes") != list(PLANES):
        problems.append(f"space.planes differs from the {list(PLANES)} this tool filters")
    for v in ("skimage_version", "pywt_version"):
        if not isinstance(grid.get(v), str):
            problems.append(f"{v} (the pinned version) is missing")
    if problems:
        raise Refused(f"{path} is not a grid this tool can run:\n  " + "\n  ".join(problems))
    return grid, hashlib.sha256(raw).hexdigest()


def require_pinned(grid: dict, current: dict) -> None:
    off = [f"{name} {grid[f]} pinned, {current[f]} running" for f, name in
           (("skimage_version", "scikit-image"), ("pywt_version", "PyWavelets")) if grid[f] != current[f]]
    if off:
        raise Refused(f"the grid and this process disagree ({'; '.join(off)}): install the pinned version, "
                      "or revise the grid before any real render (never after)")


# ---------------------------------------------------------------- planes, estimator and mapping


def to_ycbcr(rgb):
    """float64 YCbCr in rgb2ycbcr units (Y 16–235) of 8-bit RGB."""
    _, _, skimage = lib()
    return skimage.color.rgb2ycbcr(skimage.util.img_as_float(rgb))


def to_rgb8(ycc):
    """`ycbcr2rgb`, clip to [0, 1], `rint(x·255)` to uint8 RGB."""
    np, _, skimage = lib()
    return np.rint(np.clip(skimage.color.ycbcr2rgb(ycc), 0.0, 1.0) * 255.0).astype(np.uint8)


def plane_estimate(plane) -> dict:
    """The constant-plane check first (F21): max = min is copied, never normalised or estimated.
    Otherwise the plane normalised as skimage's YCbCr loop does it, and σ̂ on that normalised plane."""
    mn, mx = plane.min(), plane.max()
    if mx == mn:
        return {"constant": True, "min": float(mn), "max": float(mx), "sigma_hat_norm": None, "sigma_hat": None}
    scale = mx - mn
    norm = plane - mn
    norm /= scale
    s = nlm.immerkaer(norm)
    return {"constant": False, "min": float(mn), "max": float(mx), "scale": scale, "offset": mn, "norm": norm,
            "sigma_hat_norm": s, "sigma_hat": s * float(scale)}


def estimate(ycc) -> dict:
    """σ̂ per plane. A non-finite or ≤ 0 σ̂ on a non-constant plane is a technical refusal."""
    est = {name: plane_estimate(ycc[:, :, i]) for i, name in enumerate(PLANES)}
    for name, e in est.items():
        v = e["sigma_hat_norm"]
        if not e["constant"] and not (isinstance(v, float) and math.isfinite(v) and v > 0):
            raise Refused(f"σ̂_{name} = {v!r} on a non-constant plane: a non-finite or zero noise estimate is a "
                          "technical refusal, not a vote, and no ε is introduced. Check the decoded input (an "
                          "image without noise has none to estimate)")
    return est


def mapping(k: float, est: dict) -> dict:
    """σ per plane = k·σ̂_norm, the normalised value the filter receives; None for a constant plane."""
    out = {}
    for name in PLANES:
        e = est[name]
        if e["constant"]:
            out[name] = None
            continue
        v = k * e["sigma_hat_norm"]
        if not (math.isfinite(v) and v > 0):
            raise Refused(f"k {k} maps to σ_{name} = {v!r}, not a positive filter strength: a technical refusal, "
                          "not a vote; no ε is introduced")
        out[name] = v
    return out


# ---------------------------------------------------------------- the treatment


def denoise_plane(norm, sigma: float, grid: dict):
    """The decided skimage call on one normalised 2-D plane. A module-level seam, so a test can
    swap in a no-op denoiser."""
    _, _, skimage = lib()
    f, s = grid["filter"], grid["spin"]
    return skimage.restoration.cycle_spin(
        norm, func=skimage.restoration.denoise_wavelet, max_shifts=s["max_shifts"],
        func_kw={"sigma": sigma, "wavelet": f["wavelet"], "mode": f["mode"], "wavelet_levels": f["wavelet_levels"],
                 "method": f["method"], "rescale_sigma": f["rescale_sigma"]},
        workers=s["workers"], channel_axis=s["channel_axis"])


def denoise_ycc(ycc, est: dict, sigmas: dict, grid: dict):
    """Each non-constant plane filtered and denormalised (`x·scale + min`, skimage's order); a
    constant plane copied through."""
    np, _, _ = lib()
    out = np.empty_like(ycc)
    for i, name in enumerate(PLANES):
        e = est[name]
        if e["constant"]:
            out[:, :, i] = ycc[:, :, i]
            continue
        d = denoise_plane(e["norm"], sigmas[name], grid)
        d = d * e["scale"]
        d += e["offset"]
        out[:, :, i] = d
    return out


# ---------------------------------------------------------------- observing pass (the diagnostic)


def shifts(max_shifts: int) -> list[tuple[int, int]]:
    """cycle_spin's 2-D shifts in its order: `product(range(0, max_shifts + 1), repeat=2)`."""
    return list(itertools.product(range(max_shifts + 1), repeat=2))


def level_count(shape, wavelet) -> int:
    """skimage's default: `max(dwtn_max_level(shape, wavelet) − 3, 1)` (_denoise.py:737-742)."""
    _, pywt, _ = lib()
    return max(pywt.dwtn_max_level(shape, wavelet) - 3, 1)


def bayes_thresh(details, var: float):
    """skimage's `_bayes_thresh` (_denoise.py:611-617): var / sqrt(max(mean(d·d) − var, eps))."""
    np, _, _ = lib()
    dvar = np.mean(details * details)
    eps = np.finfo(details.dtype).eps
    return var / np.sqrt(max(dvar - var, eps))


def observe_shift(xs, sigma: float, grid: dict):
    """skimage's `_wavelet_threshold` calls on one rolled plane, in its order: `wavedecn` (default
    mode), BayesShrink thresholds from the same σ, `pywt.threshold(…, mode)`. Returns the
    coefficients, the thresholded details (coarsest first, as PyWavelets lists them) and the counts
    by level label ("1" = finest) and orientation. "Set to 0" is read from the thresholded output."""
    np, pywt, _ = lib()
    wavelet = pywt.Wavelet(grid["filter"]["wavelet"])
    levels = level_count(xs.shape, wavelet)
    coeffs = pywt.wavedecn(xs, wavelet=wavelet, level=levels)
    dcoeffs = coeffs[1:]
    var = sigma ** 2
    thresholds = [{key: bayes_thresh(level[key], var) for key in level} for level in dcoeffs]
    out = [{key: pywt.threshold(level[key], value=thr[key], mode=grid["filter"]["mode"]) for key in level}
           for thr, level in zip(thresholds, dcoeffs)]
    counts = {}
    for i, (before, after) in enumerate(zip(dcoeffs, out)):
        label = str(len(dcoeffs) - i)  # PyWavelets lists details coarsest first; "1" is the finest
        counts[label] = {}
        for key in ORIENTATIONS:
            nonzero = before[key] != 0
            n_nonzero = int(np.count_nonzero(nonzero))
            counts[label][key] = {"set_to_zero": int(np.count_nonzero(nonzero & (after[key] == 0))),
                                  "nonzero_before": n_nonzero, "already_zero": int(before[key].size) - n_nonzero}
    return coeffs, out, counts


def reconstruct(coeffs, thresholded, grid: dict, shape, dtype):
    """skimage's reconstruction: `waverecn([approx] + details)[original_extent].astype(dtype)`."""
    _, pywt, _ = lib()
    wavelet = pywt.Wavelet(grid["filter"]["wavelet"])
    return pywt.waverecn([coeffs[0]] + thresholded, wavelet)[tuple(slice(s) for s in shape)].astype(dtype)


def null_cells(shape, grid: dict) -> dict:
    _, pywt, _ = lib()
    n = level_count(shape, pywt.Wavelet(grid["filter"]["wavelet"]))
    return {str(lv): {key: None for key in ORIENTATIONS} for lv in range(1, n + 1)}


def observe_plane(norm, sigma: float, grid: dict) -> dict:
    """Counts summed over the 16 shifts, each shift rolled with `np.roll` as cycle_spin rolls it;
    ratio = Σ set_to_zero / Σ nonzero_before, null when nothing was nonzero before."""
    np, _, _ = lib()
    total: dict = {}
    for shift in shifts(grid["spin"]["max_shifts"]):
        xs = np.roll(norm, shift, axis=(0, 1))
        _, _, counts = observe_shift(xs, sigma, grid)
        for label, by in counts.items():
            for key, c in by.items():
                t = total.setdefault(label, {}).setdefault(key, {"set_to_zero": 0, "nonzero_before": 0,
                                                                  "already_zero": 0})
                for f in t:
                    t[f] += c[f]
    for by in total.values():
        for t in by.values():
            t["ratio"] = t["set_to_zero"] / t["nonzero_before"] if t["nonzero_before"] else None
    return dict(sorted(total.items(), key=lambda kv: int(kv[0])))


def observe(ycc, est: dict, sigmas: dict, grid: dict) -> dict:
    shape = ycc.shape[:2]
    return {name: null_cells(shape, grid) if est[name]["constant"] else observe_plane(est[name]["norm"],
                                                                                        sigmas[name], grid)
            for name in PLANES}


# ---------------------------------------------------------------- calibration bind


def read_bind(path: Path) -> dict:
    try:
        lines = path.read_text().splitlines()
    except OSError as e:
        raise Refused(f"cannot read the 1b calibration record {path}: {e}. Run `python3 scripts/s20/wavelet.py "
                      "--calibrate` and commit the record before any real render")
    binds = [m.group(1) for m in (BIND.match(ln) for ln in lines) if m]
    if len(binds) != 1:
        raise Refused(f"{path} holds {len(binds)} S20-CALIBRATION bind lines, expected exactly one: "
                      "re-run wavelet.py --calibrate and commit its record")
    fields = dict(kv.split("=", 1) for kv in binds[0].split() if "=" in kv)
    need = {"trial", "result", *T.bind_fields}
    if not need <= fields.keys():
        raise Refused(f"{path}: the bind line lacks {', '.join(sorted(need - fields.keys()))}; "
                      "re-run wavelet.py --calibrate")
    return fields


def require_calibrated(root: Path, current: dict) -> None:
    """`current`: this run's value of every bind field of the 1b row."""
    path = root / T.calibration
    b = read_bind(path)
    if b["trial"] != T.bind_trial:
        raise Refused(f"{path} binds trial {b['trial']!r}, not {T.bind_trial!r}: a 1b render needs the 1b "
                      "calibration; re-run wavelet.py --calibrate and commit its record")
    if b["result"] != "PASS":
        raise Refused(f"{path} records calibration {b['result']}: the grid or the estimator is the owner's to "
                      "revise before any real render (plan Phase 10 item 3)")
    off = [f"{k} {b[k][:16]}… calibrated, {current[k][:16]}… now" for k in T.bind_fields if b[k] != current[k]]
    if off:
        raise Refused(f"{path} calibrated another wavelet.py, grid or library than the one rendering now "
                      f"({'; '.join(off)}): re-run wavelet.py --calibrate, commit its record, then render")


# ---------------------------------------------------------------- render


def paths_for(pid: str, ks: list[float]) -> dict:
    """nlm.py's layout under the 1b row's raw directory; the keys `nlm.verified_decoded` reads."""
    s20 = nlm.private_s20()
    raw = s20 / T.raw_dir
    return {
        "sidecar": protocol.private_dir() / "inputs" / f"{pid}.json",
        "decoded_png": s20 / "decoded" / f"{pid}.png",
        "decoded_record": s20 / "decoded" / f"{pid}.json",
        "outs": {k: (raw / nlm.k_dir(k) / f"{pid}.png", raw / nlm.k_dir(k) / f"{pid}.json") for k in ks},
    }


def render(pid: str, grid: dict, config_sha: str, impl_sha: str, current: dict, *, estimate_only: bool) -> dict:
    cv2, np = nlm.cv()
    ks = [float(k) for k in grid["k"]]
    protocol.require_access([pid])
    p = paths_for(pid, ks)
    protocol.check_paths([p["sidecar"], p["decoded_png"], p["decoded_record"],
                          *[f for pair in p["outs"].values() for f in pair]], validation=False)
    if not estimate_only:
        done = [nlm.rel(png) for png, record in p["outs"].values() if png.exists() or record.exists()]
        if done:
            raise Refused(f"{pid}: already rendered ({', '.join(done)}); a render is never overwritten. "
                          "Delete those files deliberately to re-render with wavelet.py")
    dec, bgr = nlm.verified_decoded(pid, p)
    rgb = np.ascontiguousarray(bgr[:, :, ::-1])
    del bgr
    ycc = to_ycbcr(rgb)
    est = estimate(ycc)
    sigmas = {k: mapping(k, est) for k in ks}  # every refusal happens before anything is written
    summary = {"id": pid, "sigma_hat": {n: est[n]["sigma_hat"] for n in PLANES},
               "plane_range": {n: [est[n]["min"], est[n]["max"]] for n in PLANES},
               "sigma": {nlm.k_dir(k): s for k, s in sigmas.items()}}
    if estimate_only:
        return summary
    _, pywt, _ = lib()
    hh, ww = rgb.shape[:2]
    levels = level_count((hh, ww), pywt.Wavelet(grid["filter"]["wavelet"]))
    for k in ks:
        png, record = p["outs"][k]
        out = to_rgb8(denoise_ycc(ycc, est, sigmas[k], grid))
        if out.shape != rgb.shape or out.dtype != np.uint8:
            raise Refused(f"{pid}: the denoiser returned {out.shape} {out.dtype}, not {rgb.shape} uint8")
        zeroed = observe(ycc, est, sigmas[k], grid)
        nlm.write_png(np.ascontiguousarray(out), png)
        back = cv2.imread(str(png), cv2.IMREAD_COLOR)
        if back is None or not np.array_equal(back[:, :, ::-1], out):
            raise Refused(f"{pid}: {png} does not read back as the pixels just written; the PNG is not lossless")
        rec = {
            "id": pid,
            "k": k,
            "sigma_hat": {n: est[n]["sigma_hat"] for n in PLANES},
            "sigma": sigmas[k],
            "plane_range": {n: [est[n]["min"], est[n]["max"]] for n in PLANES},
            "wavelet": grid["filter"]["wavelet"],
            "levels": levels,
            "shifts": len(shifts(grid["spin"]["max_shifts"])),
            "decoded_record": nlm.rel(p["decoded_record"]),
            "decoded_pixels_sha256": dec["pixels_sha256"],
            "output_sha256": protocol.sha256_file(png),
            "dimensions": [ww, hh],
            "config_sha256": config_sha,
            **{f: current[f] for f in ("skimage_version", "pywt_version", "numpy_version")},
            "implementation_sha256": impl_sha,
            "rendered_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "zeroed": zeroed,
        }
        tmp = record.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(rec, indent=2, allow_nan=False) + "\n")
        os.replace(tmp, record)
    return summary


# ---------------------------------------------------------------- calibration


def rounding_variance() -> dict:
    """Each plane's variance from rounding 8-bit RGB: Σ_j (M_ij / 255)² / 12, M = skimage's
    `ycbcr_from_rgb` (rgb2ycbcr multiplies [0, 1] RGB by M; an 8-bit step is 1/255 of that)."""
    from skimage.color import colorconv

    m = colorconv.ycbcr_from_rgb
    return {name: float(sum((m[i][j] / 255.0) ** 2 for j in range(3)) / 12.0) for i, name in enumerate(PLANES)}


def noisy_ycbcr(base_y, sigma: float, tag: int):
    """Base Y, Cb = Cr = 128 (rgb2ycbcr units, float); independent N(0, σ²) added to each plane."""
    np, _, _ = lib()
    out = np.empty(base_y.shape + (3,), dtype=np.float64)
    for c, base in enumerate((base_y, np.full_like(base_y, 128.0), np.full_like(base_y, 128.0))):
        rng = np.random.default_rng([SEED, tag, int(sigma), c])
        out[:, :, c] = base + rng.normal(0.0, sigma, base.shape)
    return out


def calibrate(grid: dict, config_sha: str, impl_sha: str, current: dict) -> tuple[bool, str]:
    np, _, _ = lib()
    n = CAL_SIZE
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    fixtures = {
        "flat": (1, np.full((n, n), 128.0)),
        "texture": (2, 128.0 + 40.0 * np.sin(2 * np.pi * x / 16) * np.sin(2 * np.pi * y / 24)),
        "dark ramp": (3, 16.0 + 40.0 * x / (n - 1)),
        "near 16": (4, np.full((n, n), 18.0)),
        "near 235": (5, np.full((n, n), 233.0)),
    }
    r2 = rounding_variance()
    rows = []
    ok = True
    for name, (tag, base) in fixtures.items():
        for sigma in SIGMAS:
            noisy = noisy_ycbcr(base, sigma, tag)
            rgb8 = to_rgb8(noisy)
            gated = {p: e["sigma_hat"] for p, e in zip(PLANES, (plane_estimate(to_ycbcr(rgb8)[:, :, i])
                                                                for i in range(3)))}
            direct = {p: plane_estimate(noisy[:, :, i])["sigma_hat"] for i, p in enumerate(PLANES)}
            eff = {p: math.sqrt(sigma * sigma + r2[p]) for p in PLANES}
            relerr = {p: None if gated[p] is None else (gated[p] - eff[p]) / eff[p] for p in PLANES}
            if name == "flat":
                verdict = all(e is not None and abs(e) <= FLAT_TOL for e in relerr.values())
            elif name == "texture":
                verdict = all(e is not None and e <= TEXTURE_TOL for e in relerr.values())
            else:
                verdict = None
            ok = ok and verdict is not False
            rows.append((name, sigma, eff, gated, relerr, direct, verdict))

    result = "PASS" if ok else "FAIL"
    bound = {"implementation_sha256": impl_sha, "config_sha256": config_sha, **current}
    num = lambda v: "—" if v is None else f"{v:.4f}"  # noqa: E731
    pct = lambda v: "—" if v is None else f"{100 * v:+.2f} %"  # noqa: E731
    lines = [
        "# S-20 step 1b — wavelet estimator calibration",
        "",
        "Written by `python3 scripts/s20/wavelet.py --calibrate`. Synthetic fixtures only: no photo, decoded",
        "image or render was read. Re-running it on the same `wavelet.py`, grid, scikit-image, PyWavelets and",
        "numpy gives the same bytes. Plan: `context/changes/cloud-classical-denoise/plan.md` § Phase 10,",
        "item 3, whose fixtures and tolerances (1a's, plan § Phase 2 item 3) were fixed before this record",
        "existed, and change.md § Owner decisions (2026-11-09, step 1b candidate), item 2.",
        "",
        f"**Result: {result}.**",
        "",
        "## Bind",
        "",
        "A real render refuses unless this line is a PASS for trial 1b and the `wavelet.py`, grid,",
        "scikit-image, PyWavelets and numpy that render (plan Phase 10 item 3; plan review F24).",
        "",
        "```text",
        f"S20-CALIBRATION trial={T.bind_trial} result={result} " + " ".join(f"{f}={bound[f]}" for f in T.bind_fields),
        "```",
        "",
        "## Set-up",
        "",
        f"- Seed {SEED}; fixtures {n}×{n}; σ ∈ {{{', '.join(str(s) for s in SIGMAS)}}}. Each plane draws from",
        "  `numpy.random.default_rng([seed, fixture, σ, plane])` (PCG64).",
        "- Noise: N(0, σ²) added in float to Y, Cb and Cr independently, in `rgb2ycbcr` units (Y 16–235).",
        "- **Gated path:** the noisy YCbCr is converted with `ycbcr2rgb`, clipped to [0, 1] and rounded to",
        "  8-bit RGB (`numpy.rint(x·255)`), the renderer's own output step. The estimator then runs its full",
        "  path as on a photo: `rgb2ycbcr(img_as_float(rgb))`, the constant-plane check, per-plane min–max",
        "  normalisation, Immerkær on the normalised plane. σ̂ is reported as σ̂_norm × (plane max − min), in",
        "  `rgb2ycbcr` units; the filter itself would receive σ = k·σ̂_norm (plan review F19).",
        "- **Expected value:** σ_eff = √(σ² + r²), where r² is each plane's own variance from rounding to",
        "  8-bit RGB (plan review F34), computed below from skimage's `ycbcr_from_rgb` matrix M as",
        "  Σ_j (M_ij / 255)² / 12.",
        "- **Diagnostic, ungated:** the same estimator on the noisy YCbCr itself, with no conversion and no",
        "  rounding.",
        "- **Tolerances,** each applied to σ̂_Y, σ̂_Cb and σ̂_Cr separately (owner decision 2026-11-05):",
        f"  flat |σ̂ − σ_eff| / σ_eff ≤ {FLAT_TOL:.2f}; texture (σ̂ − σ_eff) / σ_eff ≤ {TEXTURE_TOL:.2f}, one-sided,",
        "  as pre-registered. Dark ramp and near-clipping rows are recorded, not gated.",
        "- Fixtures: flat Y = 128; texture Y = 128 + 40·sin(2πx/16)·sin(2πy/24); dark ramp Y = 16 → 56",
        "  across x; near 16 Y = 18; near 235 Y = 233. Cb = Cr = 128 before noise in every fixture.",
        f"- scikit-image {current['skimage_version']}, PyWavelets {current['pywt_version']}, "
        f"numpy {current['numpy_version']}.",
        "",
        "## Rounding term",
        "",
    ]
    lines += nlm.md_table(["Plane", "r²", "r"], [[p, f"{r2[p]:.6f}", f"{math.sqrt(r2[p]):.6f}"] for p in PLANES])
    lines += [
        "",
        "## Estimates",
        "",
        "σ̂ in `rgb2ycbcr` units. Relative error against each plane's own σ_eff.",
        "",
    ]
    lines += nlm.md_table(
        ["Fixture", "σ", "σ_eff Y / Cb / Cr", "σ̂_Y", "σ̂_Cb", "σ̂_Cr", "err Y", "err Cb", "err Cr",
         "Direct σ̂_Y / σ̂_Cb / σ̂_Cr", "Gate"],
        [[name, str(sigma), " / ".join(f"{eff[p]:.4f}" for p in PLANES), num(g["Y"]), num(g["Cb"]), num(g["Cr"]),
          pct(e["Y"]), pct(e["Cb"]), pct(e["Cr"]), " / ".join(num(d[p]) for p in PLANES),
          "—" if verdict is None else ("pass" if verdict else "**FAIL**")]
         for name, sigma, eff, g, e, d, verdict in rows],
    )
    lines += [
        "",
        "## Known limit",
        "",
        "Synthetic white noise does not reproduce correlated camera or JPEG noise. A PASS shows that the",
        "estimator reads additive noise in the filter's own space within the pre-registered tolerances. It",
        "does not show that any `k` improves a real photo; the blind pilot and gate decide that. If this",
        "record contradicts the grid, the grid is revised before it is committed, never after a real render.",
        "",
    ]
    return ok, "\n".join(lines)


# ---------------------------------------------------------------- CLI


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--all", action="store_true", help="every tuning photo")
    ap.add_argument("--estimate-only", action="store_true")
    ap.add_argument("--calibrate", action="store_true")
    args = ap.parse_args(argv)
    if args.calibrate and (args.ids or args.all or args.estimate_only):
        ap.error("--calibrate takes no photos and no other mode")
    if not args.calibrate and not (args.ids or args.all):
        ap.error("name ids or pass --all (or --calibrate)")
    try:
        current = versions()
        root = evidence.repo_root()
        grid, config_sha = load_grid(root)
        require_pinned(grid, current)
        impl_sha = protocol.sha256_file(Path(__file__).resolve())
        if args.calibrate:
            ok, text = calibrate(grid, config_sha, impl_sha, current)
            out = root / T.calibration
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(text)
            print(f"{'✓' if ok else '✗'} calibration {'PASS' if ok else 'FAIL'}: {out}")
            if not ok:
                print("  a tolerance failed: the grid or the estimator is the owner's to revise, before the grid "
                      "is committed (plan Phase 10 item 3); the record shows which row", file=sys.stderr)
            return 0 if ok else 1
        if not args.estimate_only:
            evidence.require_committed_clean(evidence.rule_files(root), root, purpose="a real wavelet render")
            require_calibrated(root, {"implementation_sha256": impl_sha, "config_sha256": config_sha, **current})
        manifest = protocol.load_manifest()
        ids = protocol.select_ids(manifest, args.ids, args.all, False)
        failed = 0
        for pid in ids:
            try:
                summary = render(pid, grid, config_sha, impl_sha, current, estimate_only=args.estimate_only)
                if args.estimate_only:
                    print(json.dumps(summary, allow_nan=False))
                else:
                    print(f"✓ {pid}: " + ", ".join(
                        f"{kd} σ " + " ".join(f"{p}={'—' if v is None else f'{v:.5f}'}" for p, v in s.items())
                        for kd, s in summary["sigma"].items()))
            except Refused as e:
                print(f"✗ {e}")
                failed += 1
        return 1 if failed else 0
    except Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
