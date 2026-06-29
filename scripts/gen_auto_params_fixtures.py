#!/usr/bin/env python3
"""Generate the Auto-params oracle fixtures (S-12).

Emits one JSON file per oracle image under ``tests/fixtures/auto-params/``,
each holding precomputed Rec.709 ``LumaStats``. The vitest gate runs in a Node
environment with no image decoder, so stats are precomputed here (offline) and
committed; the test feeds them into ``recommendParams`` and asserts ranges.

Two provenances:
  * ``montage-derived`` — luma stats of the LEFT (before) half of a
                    ``*.local-ba.jpg`` before/after montage in ``repro/``. This
                    is a faithful PROXY for the raw source, not the raw original
                    itself (the montage adds one JPEG re-export and a possible
                    fit-resize); the raw originals are not in the repo.
  * ``synthetic`` — a constructed luma distribution covering a class the 3
                    available photos don't (point-lights, blue-hour, etc.).

The stat math mirrors ``src/lib/engines/auto-params.ts::computeLumaStats``
(Rec.709 luma, 256-bin histogram, nearest-rank percentiles).

Regenerate:  python scripts/gen_auto_params_fixtures.py
Requires:    Pillow, numpy.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
REPRO = REPO / "context/changes/adaptive-enhancement-parameters/repro"
OUT = REPO / "tests/fixtures/auto-params"
SAMPLE_MAX_EDGE = 512

LUMA = np.array([0.2126, 0.7152, 0.0722])
SHADOW_T, HIGHLIGHT_T, CLIP_T = 0.18, 0.90, 0.98


def luma_stats(rgb: np.ndarray) -> dict:
    """rgb: HxWx3 uint8 -> LumaStats dict (mirrors computeLumaStats)."""
    y = np.clip(np.round(rgb.astype(np.float64) @ LUMA), 0, 255).astype(int)
    hist = np.bincount(y.ravel(), minlength=256).astype(np.float64)
    total = float(y.size)
    values = np.arange(256) / 255.0

    mean = float((values * hist).sum() / total)
    cum = np.cumsum(hist)

    def pct(q: float) -> float:
        idx = int(np.searchsorted(cum, q * total, side="left"))
        return min(idx, 255) / 255.0

    return {
        "mean": mean,
        "p05": pct(0.05),
        "p25": pct(0.25),
        "p50": pct(0.50),
        "p75": pct(0.75),
        "p95": pct(0.95),
        "p99": pct(0.99),
        "shadowRatio": float(hist[values < SHADOW_T].sum() / total),
        "highlightRatio": float(hist[values > HIGHLIGHT_T].sum() / total),
        "clipRatio": float(hist[values > CLIP_T].sum() / total),
    }


def downscale(im: Image.Image) -> np.ndarray:
    w, h = im.size
    scale = min(1.0, SAMPLE_MAX_EDGE / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BILINEAR)
    return np.asarray(im.convert("RGB"))


def before_half(path: Path) -> np.ndarray:
    """Recover the source from the left (before) half of a B/A montage."""
    im = Image.open(path)
    w, h = im.size
    return downscale(im.crop((0, 0, w // 2, h)))


# --- Synthetic class builders (deterministic; no RNG seed needed via np default) ---
def _img_from_channels(y: np.ndarray) -> np.ndarray:
    """Stack a single luma plane into a gray RGB image (R=G=B≈y)."""
    g = np.clip(y, 0, 255).astype(np.uint8)
    return np.stack([g, g, g], axis=-1)


def synth(kind: str) -> np.ndarray:
    rng = np.random.default_rng(12345)  # fixed seed → reproducible fixtures
    n = 256 * 256
    if kind == "dark-point-lights":
        base = rng.normal(14, 5, n)
        spec = rng.integers(0, n, 60)  # a handful of clipped point lights
        base[spec] = 255
        return _img_from_channels(base.reshape(256, 256))
    if kind == "blue-hour-ok":
        return _img_from_channels(rng.normal(92, 18, n).reshape(256, 256))
    if kind == "bright-daylight":
        return _img_from_channels(rng.normal(165, 22, n).reshape(256, 256))
    if kind == "clean-but-dark":
        return _img_from_channels(rng.normal(26, 4, n).reshape(256, 256))
    if kind == "noisy-mid-shadow":
        return _img_from_channels(rng.normal(40, 22, n).reshape(256, 256))
    if kind == "high-contrast-night":
        base = rng.normal(18, 8, n)
        bright = rng.integers(0, n, n // 12)  # ~8% bright highlights
        base[bright] = rng.normal(245, 8, bright.size)
        return _img_from_channels(base.reshape(256, 256))
    raise ValueError(kind)


REAL = [
    ("01-very-dark", "very-dark", "01-very-dark-iso160000.local-ba.jpg"),
    ("02-mixed-bright", "already-bright", "02-mixed-copenhagen-night.local-ba.jpg"),
    ("03-moderate-night", "moderate-night", "03-moderate-night-street.local-ba.jpg"),
]
SYNTH = [
    ("04-dark-point-lights", "highlight-clipped", "dark-point-lights"),
    ("05-blue-hour-ok", "already-bright", "blue-hour-ok"),
    ("06-bright-daylight", "already-bright", "bright-daylight"),
    ("07-clean-but-dark", "dark", "clean-but-dark"),
    ("08-noisy-mid-shadow", "moderate-night", "noisy-mid-shadow"),
    ("09-high-contrast-night", "highlight-heavy", "high-contrast-night"),
]


def write(name: str, payload: dict) -> None:
    (OUT / f"{name}.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, cls, fname in REAL:
        stats = luma_stats(before_half(REPRO / fname))
        write(name, {"name": name, "class": cls, "provenance": "montage-derived",
                     "source": f"repro/{fname} (left/before half, ≤512px — proxy for raw source)",
                     "stats": stats})
        print(f"{name:24} {cls:18} p50={stats['p50']:.3f} mean={stats['mean']:.3f}")
    for name, cls, kind in SYNTH:
        stats = luma_stats(synth(kind))
        write(name, {"name": name, "class": cls, "provenance": "synthetic",
                     "source": f"synthetic:{kind}", "stats": stats})
        print(f"{name:24} {cls:18} p50={stats['p50']:.3f} mean={stats['mean']:.3f}")


if __name__ == "__main__":
    main()
