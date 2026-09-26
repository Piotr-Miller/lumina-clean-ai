#!/usr/bin/env python3
"""Measure green / magenta hue shares in a model output (S-17, cloud-quality-below-local).

The S-17 fault is a green->magenta hue flip in Bread's raw output. This script
turns "does this image show it" into numbers, with every choice written down,
because the first set of figures (2026-09-24) was published without its method
and could not be reproduced two days later.

Method - everything a percentage depends on:

  1. Scale.   Each image is converted to RGB and resized so its LONG edge is
              MATCH_EDGE px (Pillow LANCZOS; aspect kept, sides rounded). An
              image already at that size is resampled anyway, a no-op in
              practice. Matching scale matters because a full-resolution run
              returns ~1536 px while the small baselines are 896 px.
  2. HSV.     Standard hexcone HSV on 8-bit values scaled to 0..1, as Python's
              colorsys: V = max(R,G,B), S = (max-min)/max (0 where max is 0),
              H in degrees 0..360 (0 where max == min).
  3. Mask.    A pixel is CHROMATIC when S > SAT_MIN and V_MIN < V < V_MAX, i.e.
              visibly coloured and neither near-black nor near-white.
  4. Bands.   Hue bands in degrees, half-open [lo, hi); red/orange wraps 0.
  5. Tones.   Chromatic pixels are split by V into dark / mid / bright.

Denominators - the part that is easy to misread:

  * "chromatic"                 = chromatic pixels / ALL pixels.
  * each hue band               = band pixels / CHROMATIC pixels.
  * a tone's "share"            = that tone's chromatic pixels / CHROMATIC pixels.
  * a tone's green / magenta    = band pixels in that tone / that TONE's chromatic pixels.

So "93.5 % green" says what the COLOURED part of an image is; it says nothing
about how much of the frame is neutral. Do not read it as a scene description.

Usage, from the repo root:

    python3 scripts/measure-hue-shares.py label=path [label=path ...]

Photos stay where they are; this script only reads them. Do not copy outputs
into test-photos/licensed/ - see AGENTS.md.

Requires:    Pillow, numpy.
"""

from __future__ import annotations

import hashlib
import sys

import numpy as np
from PIL import Image

MATCH_EDGE = 896
SAT_MIN = 0.18
V_MIN, V_MAX = 0.10, 0.90
BANDS = {
    "green": (60, 180),
    "blue": (180, 250),
    "magenta": (250, 340),
    "red/orange": (340, 60),
}
TONES = {
    "dark": (0.0, 0.35),
    "mid": (0.35, 0.65),
    "bright": (0.65, 1.01),
}


def hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(axis=2)
    d = mx - rgb.min(axis=2)
    s = np.where(mx > 0, d / np.maximum(mx, 1e-12), 0.0)
    dd = np.where(d == 0, 1.0, d)
    h = np.zeros_like(mx)
    h = np.where(mx == r, ((g - b) / dd) % 6, h)
    h = np.where(mx == g, (b - r) / dd + 2, h)
    h = np.where(mx == b, (r - g) / dd + 4, h)
    h = np.where(d == 0, 0.0, h)
    return h * 60, s, mx


def in_band(h: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return ((h >= lo) & (h < hi)) if lo < hi else ((h >= lo) | (h < hi))


def pct(part: int, whole: int) -> float:
    return 100.0 * part / whole if whole else 0.0


def measure(label: str, path: str) -> None:
    with open(path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    img = Image.open(path).convert("RGB")
    w, h_px = img.size
    scale = MATCH_EDGE / max(w, h_px)
    small = img.resize((round(w * scale), round(h_px * scale)), Image.LANCZOS)
    rgb = np.asarray(small, dtype=np.float64) / 255.0
    hue, sat, val = hsv(rgb)
    chrom = (sat > SAT_MIN) & (val > V_MIN) & (val < V_MAX)
    n = int(chrom.sum())

    print(f"== {label}")
    print(f"   file     {path}")
    print(f"   sha256   {digest}")
    print(f"   size     {w}x{h_px} -> {small.size[0]}x{small.size[1]}   mean RGB {rgb.mean():.3f}")
    print(f"   chromatic {pct(n, chrom.size):5.1f} % of all pixels")
    print("   bands    " + "   ".join(f"{k} {pct(int((in_band(hue, *b) & chrom).sum()), n):5.1f} %" for k, b in BANDS.items()))
    for tone, (lo, hi) in TONES.items():
        m = chrom & (val >= lo) & (val < hi)
        t = int(m.sum())
        green = pct(int((in_band(hue, *BANDS["green"]) & m).sum()), t)
        magenta = pct(int((in_band(hue, *BANDS["magenta"]) & m).sum()), t)
        print(f"   {tone:7s}  {pct(t, n):5.1f} % of chromatic   green {green:5.1f} %   magenta {magenta:5.1f} %")
    print()


def main(args: list[str]) -> None:
    if not args:
        sys.exit(__doc__)
    for arg in args:
        label, sep, path = arg.partition("=")
        if not sep:
            sys.exit(f"error: expected label=path, got {arg!r}")
        measure(label, path)


if __name__ == "__main__":
    main(sys.argv[1:])
