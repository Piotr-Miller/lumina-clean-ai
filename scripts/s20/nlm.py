#!/usr/bin/env python3
"""S-20 step 1a NLM renderer and its calibration (`cloud-classical-denoise`, plan Phase 2).

  python3 scripts/s20/nlm.py --all | <ids…>           render every k of the grid
  python3 scripts/s20/nlm.py --estimate-only --all    print σ̂ and h/hColor; render nothing
  python3 scripts/s20/nlm.py --calibrate              synthetic fixtures only; write the record

Input: the shared decode `test-photos/private/s20/decoded/<id>.png` (written by
`local-arms.ts decoded`), read with `cv2.imread(…, IMREAD_COLOR)`; its RGB view must hash to the
decoded record's `pixels_sha256`. The noise estimate lives in the filter's own space: the 8-bit
`COLOR_LBGR2Lab` that `fastNlMeansDenoisingColored` applies (OpenCV 4.13.0
`modules/photo/src/denoising.cpp:168-207`), Immerkær 1996 per channel. Every parameter comes from
`scripts/s20/configs/nlm-grid.json`, frozen before any real render.

Output: `test-photos/private/s20/nlm/k<k>/<id>.png` (RGB, no metadata) plus `<id>.json`, the
record `local-arms.ts nlm-gamma` binds to.

Preconditions of a real render (plan § Implementation Approach, order step 2; owner decision
2026-11-05):
  - every rule file is committed and clean (`evidence.py`);
  - the committed calibration record's bind line is a PASS for this file's sha256, the grid's
    sha256 and the running OpenCV version.
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
import json
import math
import os
import re
import sys
import tempfile
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "s19"))
sys.path.insert(0, str(HERE))

import evidence  # noqa: E402
import protocol  # noqa: E402
from protocol import Refused  # noqa: E402

KERNEL = [[1, -2, 1], [-2, 4, -2], [1, -2, 1]]
ROUND_DIGITS = 2
STRIP_ROWS = 1024  # rows per strip of the estimator; the sum is exact, so the result is strip-independent

# Calibration fixtures and tolerances (plan Phase 2 item 3, fixed before any calibration result).
SEED = 20261105
CAL_SIZE = 1024
SIGMAS = (3, 8, 15)
FLAT_TOL = 0.10  # |σ̂ − σ_eff| / σ_eff
TEXTURE_TOL = 0.35  # (σ̂ − σ_eff) / σ_eff, one-sided as pre-registered
CONVERSION_STEP = 7
PINNED_BGR = ((35, 98, 238), (35, 98, 234))
BIND = re.compile(r"^S20-CALIBRATION (.+)$")


def private_s20() -> Path:
    return Path(os.environ.get("S20_PRIVATE", ROOT / "test-photos" / "private" / "s20"))


def rel(path: Path) -> str:
    """Repo-relative when inside the repository, so a record can be published without a home path."""
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def cv():
    try:
        import cv2
        import numpy
    except ImportError as e:
        raise Refused(f"OpenCV and numpy are needed ({e}); install them with `sudo dnf install python3-opencv`")
    return cv2, numpy


# ---------------------------------------------------------------- grid


def load_grid(root: Path) -> tuple[dict, str]:
    path = root / evidence.GRID_REL
    try:
        raw = path.read_bytes()
        grid = json.loads(raw)
    except (OSError, ValueError) as e:
        raise Refused(f"cannot read the NLM grid {path}: {e}")
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
    for w in ("templateWindowSize", "searchWindowSize"):
        v = grid.get(w)
        if not (isinstance(v, int) and not isinstance(v, bool) and v > 0 and v % 2 == 1):
            problems.append(f"{w} must be a positive odd integer, not {v!r}")
    if grid.get("filter") != "cv2.fastNlMeansDenoisingColored":
        problems.append("filter is not cv2.fastNlMeansDenoisingColored, the one this tool runs")
    if (grid.get("estimator") or {}).get("kernel") != KERNEL:
        problems.append(f"estimator.kernel differs from the kernel this tool implements, {KERNEL}")
    if (grid.get("mapping") or {}).get("round_digits") != ROUND_DIGITS:
        problems.append(f"mapping.round_digits differs from the {ROUND_DIGITS} this tool applies")
    if not isinstance(grid.get("opencv_version"), str):
        problems.append("opencv_version (the pinned version) is missing")
    if problems:
        raise Refused(f"{path} is not a grid this tool can run:\n  " + "\n  ".join(problems))
    return grid, hashlib.sha256(raw).hexdigest()


def k_dir(k: float) -> str:
    return f"k{k:.1f}"


def require_pinned_opencv(grid: dict, version: str) -> None:
    if grid["opencv_version"] != version:
        raise Refused(f"the grid pins OpenCV {grid['opencv_version']}, this process runs {version}: "
                      "install the pinned version, or revise the grid before any real render (never after)")


# ---------------------------------------------------------------- estimator and mapping


def immerkaer(channel) -> float:
    """σ̂ = √(π/2)·Σ|I∗N| / (6(W−2)(H−2)), N = [[1,−2,1],[−2,4,−2],[1,−2,1]], valid region, float64.

    N is the outer product of [1, −2, 1] with itself, so I∗N is a second difference along rows of a
    second difference along columns. Every term is an integer, so the float64 sum is exact and does
    not depend on the strip size.
    """
    _, np = cv()
    h, w = channel.shape
    if h < 3 or w < 3:
        raise Refused(f"an image of {w}×{h} is too small for the 3×3 noise estimator")
    total = 0.0
    for r0 in range(0, h - 2, STRIP_ROWS):
        r1 = min(h - 2, r0 + STRIP_ROWS)
        a = channel[r0:r1 + 2].astype(np.float64)
        d = a[:, :-2] - 2.0 * a[:, 1:-1] + a[:, 2:]
        e = d[:-2] - 2.0 * d[1:-1] + d[2:]
        total += float(np.abs(e).sum())
    return math.sqrt(math.pi / 2) * total / (6.0 * (w - 2) * (h - 2))


def estimate_lab(lab) -> dict:
    s = {c: immerkaer(lab[:, :, i]) for i, c in enumerate("Lab")}
    s["ab"] = (s["a"] + s["b"]) / 2
    return s


def estimate(bgr) -> dict:
    """σ̂ per channel of the filter's own 8-bit Lab."""
    cv2, _ = cv()
    return estimate_lab(cv2.cvtColor(bgr, cv2.COLOR_LBGR2Lab))


def mapping(k: float, sigma: dict) -> tuple[float, float]:
    """h = round(k·σ̂_L, 2), hColor = round(k·σ̂_ab, 2). Non-finite or ≤ 0 is a technical refusal."""
    for name in ("L", "ab"):
        v = sigma[name]
        if not (isinstance(v, float) and math.isfinite(v) and v > 0):
            raise Refused(f"σ̂_{name} = {v!r}: a non-finite or zero noise estimate is a technical refusal, "
                          "not a vote, and no ε is introduced. Check the decoded input (a constant or empty "
                          "image has no noise to estimate)")
    h = round(k * sigma["L"], ROUND_DIGITS)
    hc = round(k * sigma["ab"], ROUND_DIGITS)
    for name, v in (("h", h), ("hColor", hc)):
        if not (math.isfinite(v) and v > 0):
            raise Refused(f"k {k} maps to {name} = {v!r}, not a positive filter strength: a technical refusal, "
                          "not a vote; no ε is introduced")
    return h, hc


def denoise(bgr, h: float, h_color: float, template: int, search: int):
    """The treatment. A module-level seam, so a test can swap in a no-op denoiser."""
    cv2, _ = cv()
    return cv2.fastNlMeansDenoisingColored(bgr, None, h, h_color, template, search)


# ---------------------------------------------------------------- calibration bind


def read_bind(path: Path) -> dict:
    try:
        lines = path.read_text().splitlines()
    except OSError as e:
        raise Refused(f"cannot read the calibration record {path}: {e}. Run `python3 scripts/s20/nlm.py "
                      "--calibrate` and commit the record before any real render")
    binds = [m.group(1) for m in (BIND.match(ln) for ln in lines) if m]
    if len(binds) != 1:
        raise Refused(f"{path} holds {len(binds)} S20-CALIBRATION bind lines, expected exactly one: "
                      "re-run --calibrate and commit its record")
    fields = dict(kv.split("=", 1) for kv in binds[0].split() if "=" in kv)
    need = {"result", "implementation_sha256", "config_sha256", "opencv_version"}
    if not need <= fields.keys():
        raise Refused(f"{path}: the bind line lacks {', '.join(sorted(need - fields.keys()))}; re-run --calibrate")
    return fields


def require_calibrated(root: Path, impl_sha: str, config_sha: str, version: str) -> None:
    path = root / evidence.CALIBRATION_REL
    b = read_bind(path)
    if b["result"] != "PASS":
        raise Refused(f"{path} records calibration {b['result']}: revise the grid or the estimator and "
                      "re-calibrate before any real render (plan Phase 2 item 3)")
    current = {"implementation_sha256": impl_sha, "config_sha256": config_sha, "opencv_version": version}
    off = [f"{k} {b[k][:16]}… calibrated, {v[:16]}… now" for k, v in current.items() if b[k] != v]
    if off:
        raise Refused(f"{path} calibrated another estimator, grid or OpenCV than the one rendering now "
                      f"({'; '.join(off)}): re-run --calibrate, commit its record, then render")


# ---------------------------------------------------------------- render


def paths_for(pid: str, ks: list[float]) -> dict:
    s20 = private_s20()
    return {
        "sidecar": protocol.private_dir() / "inputs" / f"{pid}.json",
        "decoded_png": s20 / "decoded" / f"{pid}.png",
        "decoded_record": s20 / "decoded" / f"{pid}.json",
        "outs": {k: (s20 / "nlm" / k_dir(k) / f"{pid}.png", s20 / "nlm" / k_dir(k) / f"{pid}.json") for k in ks},
    }


def verified_decoded(pid: str, p: dict):
    """The shared decode, its record bound to the current common input and its pixels to the record."""
    cv2, np = cv()
    try:
        side = json.loads(p["sidecar"].read_text())
    except (OSError, ValueError):
        raise Refused(f"{pid}: no prepared input at {p['sidecar']}; run python3 scripts/s19/inputs.py {pid}")
    if not p["decoded_record"].exists() or not p["decoded_png"].exists():
        raise Refused(f"{pid}: no shared decode at {p['decoded_record']}; run "
                      f"npx tsx scripts/s19/local-arms.ts decoded {pid} first")
    try:
        rec = json.loads(p["decoded_record"].read_text())
    except (OSError, ValueError) as e:
        raise Refused(f"{pid}: {p['decoded_record']} is not readable JSON ({e}); re-run local-arms.ts decoded {pid}")
    if (rec.get("kind") != "decoded" or rec.get("id") != pid
            or rec.get("common_sha256") != (side.get("common") or {}).get("sha256")):
        raise Refused(f"{pid}: {p['decoded_record']} is not the decode of this photo's current common input; "
                      f"re-run local-arms.ts decoded {pid}")
    if protocol.sha256_file(p["decoded_png"]) != rec.get("output_sha256"):
        raise Refused(f"{pid}: {p['decoded_png']} is no longer the file its record names (output_sha256); "
                      f"re-run local-arms.ts decoded {pid}")
    bgr = cv2.imread(str(p["decoded_png"]), cv2.IMREAD_COLOR)
    if bgr is None or bgr.dtype != np.uint8 or bgr.ndim != 3 or bgr.shape[2] != 3:
        raise Refused(f"{pid}: OpenCV cannot read {p['decoded_png']} as 8-bit BGR; re-run local-arms.ts decoded {pid}")
    pixels = hashlib.sha256(np.ascontiguousarray(bgr[:, :, ::-1]).tobytes()).hexdigest()
    if pixels != rec.get("pixels_sha256"):
        raise Refused(f"{pid}: {p['decoded_png']} read by OpenCV does not hold the pixels its record names "
                      f"(pixels_sha256); re-run local-arms.ts decoded {pid}")
    h, w = bgr.shape[:2]
    if rec.get("dimensions") != [w, h]:
        raise Refused(f"{pid}: {p['decoded_png']} is {w}×{h}, its record says {rec.get('dimensions')!r}")
    return rec, bgr


def write_png(rgb, out: Path) -> None:
    """RGB PNG with only IHDR, IDAT and IEND, written atomically. Pillow writes no ancillary chunk
    unless asked; a fixed compress_level keeps two renders byte-identical."""
    from PIL import Image

    out.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{out.stem}-", suffix=".png", dir=out.parent)
    os.close(fd)
    try:
        Image.fromarray(rgb, "RGB").save(tmp, "PNG", compress_level=6)
        os.replace(tmp, out)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def render(pid: str, grid: dict, config_sha: str, impl_sha: str, version: str, *, estimate_only: bool) -> dict:
    cv2, np = cv()
    ks = [float(k) for k in grid["k"]]
    protocol.require_access([pid])
    p = paths_for(pid, ks)
    protocol.check_paths([p["sidecar"], p["decoded_png"], p["decoded_record"],
                          *[f for pair in p["outs"].values() for f in pair]], validation=False)
    if not estimate_only:
        done = [rel(png) for png, record in p["outs"].values() if png.exists() or record.exists()]
        if done:
            raise Refused(f"{pid}: already rendered ({', '.join(done)}); a render is never overwritten. "
                          "Delete those files deliberately to re-render")
    dec, bgr = verified_decoded(pid, p)
    sigma = estimate(bgr)
    strengths = {k: mapping(k, sigma) for k in ks}  # every refusal happens before anything is written
    summary = {"id": pid, "sigma_hat": sigma, "strengths": {k_dir(k): {"h": h, "h_color": hc}
                                                            for k, (h, hc) in strengths.items()}}
    if estimate_only:
        return summary
    t, s = grid["templateWindowSize"], grid["searchWindowSize"]
    for k, (h, hc) in strengths.items():
        png, record = p["outs"][k]
        out = denoise(bgr, h, hc, t, s)
        if out is None or out.shape != bgr.shape or out.dtype != np.uint8:
            raise Refused(f"{pid}: the denoiser returned {getattr(out, 'shape', None)}, not {bgr.shape} uint8")
        rgb = np.ascontiguousarray(out[:, :, ::-1])
        write_png(rgb, png)
        back = cv2.imread(str(png), cv2.IMREAD_COLOR)
        if back is None or not np.array_equal(back, out):
            raise Refused(f"{pid}: {png} does not read back as the pixels just written; the PNG is not lossless")
        hh, ww = bgr.shape[:2]
        rec = {
            "id": pid,
            "k": k,
            "sigma_hat_L": sigma["L"],
            "sigma_hat_a": sigma["a"],
            "sigma_hat_b": sigma["b"],
            "sigma_hat_ab": sigma["ab"],
            "h": h,
            "h_color": hc,
            "windows": {"templateWindowSize": t, "searchWindowSize": s},
            "decoded_record": rel(p["decoded_record"]),
            "decoded_pixels_sha256": dec["pixels_sha256"],
            "output_sha256": protocol.sha256_file(png),
            "dimensions": [ww, hh],
            "config_sha256": config_sha,
            "opencv_version": version,
            "implementation_sha256": impl_sha,
            "rendered_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        tmp = record.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(rec, indent=2) + "\n")
        os.replace(tmp, record)
    return summary


# ---------------------------------------------------------------- calibration


def sigma_eff(sigma: float) -> float:
    """The noise actually present after rounding to integers: √(σ² + 1/12)."""
    return math.sqrt(sigma * sigma + 1.0 / 12.0)


def noisy_lab(base_l, sigma: float, tag: int):
    """Base L (float), a = b = 128; independent N(0, σ²) added in float to L, a and b, rounded, clipped."""
    _, np = cv()
    out = np.empty(base_l.shape + (3,), dtype=np.uint8)
    for c, base in enumerate((base_l, np.full_like(base_l, 128.0), np.full_like(base_l, 128.0))):
        rng = np.random.default_rng([SEED, tag, int(sigma), c])
        out[:, :, c] = np.clip(np.rint(base + rng.normal(0.0, sigma, base.shape)), 0, 255).astype(np.uint8)
    return out


def md_table(header: list[str], rows: list[list[str]]) -> list[str]:
    """A Markdown table padded the way Prettier pads it (combining marks have no width), so the
    committed record stays byte-identical to a re-run after the pre-commit Prettier pass."""

    def width(cell: str) -> int:
        return sum(1 for ch in cell if not unicodedata.combining(ch))

    cols = [max(3, *(width(r[i]) for r in [header, *rows])) for i in range(len(header))]

    def line(cells: list[str]) -> str:
        return "| " + " | ".join(c + " " * (cols[i] - width(c)) for i, c in enumerate(cells)) + " |"

    return [line(header), "| " + " | ".join("-" * w for w in cols) + " |", *(line(r) for r in rows)]


def calibrate(grid: dict, config_sha: str, impl_sha: str, version: str) -> tuple[bool, str]:
    cv2, np = cv()
    n = CAL_SIZE
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    fixtures = {
        "flat": (1, np.full((n, n), 128.0)),
        "texture": (2, 128.0 + 40.0 * np.sin(2 * np.pi * x / 16) * np.sin(2 * np.pi * y / 24)),
        "dark ramp": (3, 40.0 * x / (n - 1)),
        "near 0": (4, np.full((n, n), 2.0)),
        "near 255": (5, np.full((n, n), 253.0)),
    }
    rows = []
    ok = True
    for name, (tag, base) in fixtures.items():
        for sigma in SIGMAS:
            lab = noisy_lab(base, sigma, tag)
            bgr = cv2.cvtColor(lab, cv2.COLOR_Lab2LBGR)
            gated = estimate(bgr)
            direct = estimate_lab(lab)
            eff = sigma_eff(sigma)
            relerr = {c: (gated[c] - eff) / eff for c in "Lab"}
            if name == "flat":
                verdict = all(abs(relerr[c]) <= FLAT_TOL for c in "Lab")
            elif name == "texture":
                verdict = all(relerr[c] <= TEXTURE_TOL for c in "Lab")
            else:
                verdict = None
            ok = ok and verdict is not False
            rows.append((name, sigma, eff, gated, relerr, direct, verdict))

    # Conversion quantisation: a fact of the treatment, measured, never a gate.
    steps = np.arange(0, 256, CONVERSION_STEP, dtype=np.uint8)
    grid_bgr = np.stack(np.meshgrid(steps, steps, steps, indexing="ij"), axis=-1).reshape(1, -1, 3)
    back = cv2.cvtColor(cv2.cvtColor(grid_bgr, cv2.COLOR_LBGR2Lab), cv2.COLOR_Lab2LBGR)
    delta = np.abs(back.astype(np.int16) - grid_bgr.astype(np.int16))
    pinned_in = np.array([[PINNED_BGR[0]]], dtype=np.uint8)
    pinned_out = tuple(int(v) for v in cv2.cvtColor(cv2.cvtColor(pinned_in, cv2.COLOR_LBGR2Lab),
                                                    cv2.COLOR_Lab2LBGR)[0, 0])

    result = "PASS" if ok else "FAIL"
    pct = lambda v: f"{100 * v:+.2f} %"  # noqa: E731
    lines = [
        "# S-20 step 1a — NLM estimator calibration",
        "",
        "Written by `python3 scripts/s20/nlm.py --calibrate`. Synthetic fixtures only: no photo, decoded",
        "image or render was read. Re-running it on the same `nlm.py`, grid, OpenCV and numpy gives the",
        "same bytes. Plan: `context/changes/cloud-classical-denoise/plan.md` § Phase 2, item 3, whose",
        "fixtures and tolerances were fixed before this record existed (F14), and the owner decisions of",
        "2026-11-05 recorded there.",
        "",
        f"**Result: {result}.**",
        "",
        "## Bind",
        "",
        "A real render refuses unless this line is a PASS for the `nlm.py`, grid and OpenCV that render",
        "(owner decision 2026-11-05).",
        "",
        "```text",
        f"S20-CALIBRATION result={result} implementation_sha256={impl_sha} config_sha256={config_sha} "
        f"opencv_version={version}",
        "```",
        "",
        "## Set-up",
        "",
        f"- Seed {SEED}; fixtures {n}×{n}; σ ∈ {{{', '.join(str(s) for s in SIGMAS)}}}. Each channel draws from",
        "  `numpy.random.default_rng([seed, fixture, σ, channel])` (PCG64).",
        "- Noise: N(0, σ²) added in float to the 8-bit Lab L, a and b channels independently, then",
        "  rounded to the nearest integer (`numpy.rint`) and clipped to 0–255. Expected value:",
        "  σ_eff = √(σ² + 1/12).",
        "- **Gated path:** the noisy Lab is converted with `COLOR_Lab2LBGR` to 8-bit BGR, then the",
        "  estimator runs as on a photo: `COLOR_LBGR2Lab`, then Immerkær per channel. The round-trip error",
        "  stays in the measurement.",
        "- **Diagnostic, ungated:** the same estimator on the noisy Lab itself, with no conversion.",
        "- **Tolerances,** each applied to σ̂_L, σ̂_a and σ̂_b separately (owner decision 2026-11-05):",
        f"  flat |σ̂ − σ_eff| / σ_eff ≤ {FLAT_TOL:.2f}; texture (σ̂ − σ_eff) / σ_eff ≤ {TEXTURE_TOL:.2f}, one-sided,",
        "  as pre-registered. Dark ramp and near-clipping rows are recorded, not gated.",
        "- Fixtures: flat L = 128; texture L = 128 + 40·sin(2πx/16)·sin(2πy/24); dark ramp L = 0 → 40",
        "  across x; near 0 L = 2; near 255 L = 253. a = b = 128 before noise in every fixture.",
        f"- OpenCV {version}, numpy {np.__version__}, OpenCV threads {cv2.getNumThreads()}.",
        "",
        "## Estimates",
        "",
        "σ̂ in 8-bit Lab units (L scaled to 0–255; a, b offset by 128). Relative error against σ_eff.",
        "",
    ]
    lines += md_table(
        ["Fixture", "σ", "σ_eff", "σ̂_L", "σ̂_a", "σ̂_b", "σ̂_ab", "err L", "err a", "err b",
         "Direct σ̂_L / σ̂_a / σ̂_b", "Gate"],
        [[name, str(sigma), f"{eff:.4f}", f"{g['L']:.4f}", f"{g['a']:.4f}", f"{g['b']:.4f}", f"{g['ab']:.4f}",
          pct(e["L"]), pct(e["a"]), pct(e["b"]), f"{d['L']:.4f} / {d['a']:.4f} / {d['b']:.4f}",
          "—" if verdict is None else ("pass" if verdict else "**FAIL**")]
         for name, sigma, eff, g, e, d, verdict in rows],
    )
    reproduced = pinned_out == PINNED_BGR[1]
    lines += [
        "",
        "## Conversion quantisation (measured, not gated)",
        "",
        "The 8-bit `COLOR_LBGR2Lab` → `COLOR_Lab2LBGR` round trip on every BGR triple of",
        f"`range(0, 256, {CONVERSION_STEP})`³ ({grid_bgr.shape[1]} colours, {delta.size} channel values). These are facts",
        "of the treatment; they are never fixed by swapping in another conversion.",
        "",
        f"- Maximum |Δ|: {int(delta.max())}.",
        f"- Channel values with |Δ| > 1: {int((delta > 1).sum())}; colours with any |Δ| > 1: "
        f"{int((delta > 1).any(axis=-1).sum())}.",
        f"- Pinned counterexample BGR {PINNED_BGR[0]} → {pinned_out} "
        f"({'reproduced' if reproduced else 'NOT reproduced; expected ' + str(PINNED_BGR[1])}).",
        "",
        "## Idealised reference weight (recorded, not gated)",
        "",
        "exp(−2σ²/h²) at h = k·σ, that is exp(−2/k²). It is not the measured weight of any real patch.",
        "",
    ]
    lines += md_table(["k", "exp(−2/k²)"],
                      [[f"{float(k):.1f}", f"{math.exp(-2.0 / (float(k) ** 2)):.4f}"] for k in grid["k"]])
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
        cv2, _ = cv()
        root = evidence.repo_root()
        grid, config_sha = load_grid(root)
        version = cv2.__version__
        require_pinned_opencv(grid, version)
        impl_sha = protocol.sha256_file(Path(__file__).resolve())
        if args.calibrate:
            ok, text = calibrate(grid, config_sha, impl_sha, version)
            out = root / evidence.CALIBRATION_REL
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(text)
            print(f"{'✓' if ok else '✗'} calibration {'PASS' if ok else 'FAIL'}: {out}")
            if not ok:
                print("  a tolerance failed: revise the grid or the estimator here, before the grid is committed "
                      "(plan Phase 2 item 3); the record shows which row", file=sys.stderr)
            return 0 if ok else 1
        if not args.estimate_only:
            evidence.require_committed_clean(evidence.rule_files(root), root, purpose="a real NLM render")
            require_calibrated(root, impl_sha, config_sha, version)
        manifest = protocol.load_manifest()
        ids = protocol.select_ids(manifest, args.ids, args.all, False)
        failed = 0
        for pid in ids:
            try:
                summary = render(pid, grid, config_sha, impl_sha, version, estimate_only=args.estimate_only)
                if args.estimate_only:
                    print(json.dumps(summary))
                else:
                    print(f"✓ {pid}: " + ", ".join(f"{kd} h={v['h']} hColor={v['h_color']}"
                                                  for kd, v in summary["strengths"].items()))
            except Refused as e:
                print(f"✗ {e}")
                failed += 1
        return 1 if failed else 0
    except Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
