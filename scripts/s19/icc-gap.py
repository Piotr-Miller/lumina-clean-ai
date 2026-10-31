#!/usr/bin/env python3
"""Measure how much ignoring an embedded ICC profile changes an image (S-19, cloud-model-comparison).

frame.md's dimension 5 asks whether Cloud input loses colour because the
pipeline treats wide-gamut JPEGs (Display P3, ProPhoto, Adobe RGB) as sRGB.
This script puts a number on the size of that gap for any image: it decodes
each file twice and prints mean brightness and saturation for both decodes.
Run it on an original and on its Bread output; whether Bread itself ignores the
profile is a separate check (compare the output's figures with both decodes of
its input).

Method:

  1. Scale.   Pillow's JPEG draft mode decodes at about 1/4 of each side (DCT
              scaling), so a 4000 px photo is measured at about 1000 px. Means
              barely move with scale; this keeps a full run to seconds.
  2. Naive.   The decoded RGB values read as if they were sRGB, which is what
              a pipeline that drops the profile does.
  3. ICC.     The same pixels converted from the embedded profile to sRGB
              (ImageCms, relative colorimetric intent). A file with no
              profile prints "none" and both decodes are identical.
  4. HSV.     V = max(R,G,B) and S = (max-min)/max (0 where max is 0), on
              values scaled to 0..1, averaged over every pixel.

Measured on 2026-10-29 (meanS naive -> icc): S17-02 0.208 -> 0.232,
S17-03 0.406 -> 0.547 (meanV 0.248 -> 0.303), S17-04 0.255 -> 0.263,
S17-07 0.600 -> 0.736, S17-08 0.636 -> 0.855, S17-21 0.569 -> 0.694.

Usage:  python3 scripts/s19/icc-gap.py test-photos/licensed/03-*.jpg ...
Needs:  Pillow (with LittleCMS) and numpy.
"""

import io
import sys

import numpy as np
from PIL import Image, ImageCms

SRGB = ImageCms.createProfile("sRGB")


def mean_v(rgb: np.ndarray) -> float:
    return float(rgb.max(axis=2).mean())


def mean_s(rgb: np.ndarray) -> float:
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    return float(np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0).mean())


def measure(path: str) -> str:
    im = Image.open(path)
    im.draft("RGB", (im.width // 4, im.height // 4))
    rgb = im.convert("RGB")
    naive = np.asarray(rgb, dtype=np.float32) / 255
    icc = im.info.get("icc_profile")
    if icc:
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        converted = ImageCms.profileToProfile(
            rgb, src, SRGB, renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC, outputMode="RGB"
        )
        managed = np.asarray(converted, dtype=np.float32) / 255
        name = ImageCms.getProfileDescription(src).strip()
    else:
        managed = naive
        name = "none"
    file = path.replace("\\", "/").split("/")[-1]
    return (
        f"{file:44s} {name:28s} "
        f"meanV naive {mean_v(naive):.3f} icc {mean_v(managed):.3f} | "
        f"meanS naive {mean_s(naive):.3f} icc {mean_s(managed):.3f}"
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: icc-gap.py IMAGE [IMAGE ...]")
    for p in sys.argv[1:]:
        print(measure(p))
