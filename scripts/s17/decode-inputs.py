#!/usr/bin/env python3
"""Decode s17-v1 inputs the way the app's Auto sampler sees them (S-17).

First half of the offline Auto harness. The formula is NOT re-implemented here:
this script only produces the pixels `sampleImageLuma` would hand to
`computeLumaStats`, and `scripts/s17/auto-values.ts` then runs the app's own
TypeScript on them.

What the browser does, and what this mirrors (`auto-params.client.ts`,
`EnhanceWorkspace.tsx` decodeImage):

  1. Decode.       `new Image()` on the uploaded file. Chromium colour-manages
                   the decode into the canvas's sRGB, so an embedded ICC profile
                   (Display P3, Adobe RGB, ProPhoto ... all occur in s17-v1) is
                   converted to sRGB here with LittleCMS, relative colorimetric
                   intent. A file without a profile is taken as sRGB.
  2. Orientation.  `naturalWidth`/`drawImage` honour EXIF orientation, so it is
                   applied (ImageOps.exif_transpose) before sizing.
  3. Downscale.    Long edge <= 512 px: scale = min(1, 512 / max(w, h)), sides
                   rounded, each at least 1 — the client's own arithmetic.
                   Default --filter jpeg-draft: libjpeg decode-to-scale (the
                   largest 1/2, 1/4, 1/8 reduction still covering the target),
                   then a 2-tap bilinear resample with no prefilter
                   (point_bilinear). Measured 2026-09-27 against headless
                   Chromium's own pixels, this reproduced S17-04 to a mean
                   |delta| of 0.13 levels, where Pillow's antialiasing bilinear
                   was 2.4 levels off and moved S17-04's clipRatio across the
                   0.005 guard (Cloud gamma 1.50 offline vs 1.10 in the browser).
                   A residual ~0.4-level darker bias in Chromium remains on the
                   other tuning photos; `browser-stats.ts` reports it per field.
                   The other filters are kept for that comparison.
  4. Pixels.       RGBA, alpha 255, row-major — `getImageData`'s layout.

Before decoding, each file's sha256 is checked against the manifest; a mismatch
stops the run, because a changed input silently changes every number after it.

Output, per id, into --out (default test-photos/private/s17/harness/, gitignored):
  <id>.rgba       raw RGBA bytes
  <id>.meta.json  id, path, input sha256, stored/oriented/sample sizes, ICC
                  profile name, conversion applied, filter

Usage, from the repo root:

    python3 scripts/s17/decode-inputs.py                 # the six tuning photos
    python3 scripts/s17/decode-inputs.py S17-01 S17-06   # named ids
    python3 scripts/s17/decode-inputs.py --all           # every s17-v1 entry

Requires:    Pillow (with ImageCms), numpy.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageOps

REPO = Path(__file__).resolve().parents[2]
MANIFEST = REPO / "test-photos/s17-benchmark.json"
DEFAULT_OUT = REPO / "test-photos/private/s17/harness"
SAMPLE_MAX_EDGE = 512
FILTERS = {
    "bilinear": Image.BILINEAR,
    "bicubic": Image.BICUBIC,
    "lanczos": Image.LANCZOS,
    "box": Image.BOX,
    "nearest": Image.NEAREST,
    "point-bilinear": None,  # see point_bilinear()
    "jpeg-draft": None,  # JPEG decode-to-scale, then point_bilinear()
}
ORIENTATION_TAG = 0x0112
SRGB = ImageCms.createProfile("sRGB")


def point_bilinear(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """2-tap bilinear at each destination pixel centre, with NO prefilter.

    Pillow's resize filters widen their support when downscaling (antialiasing);
    a canvas `drawImage` with the default `imageSmoothingQuality = "low"` samples
    only the four nearest source pixels, so small bright points survive. This is
    that sampler, on the 8-bit sRGB-encoded values, rounded half up.
    """
    src = np.asarray(img.convert("RGB"), dtype=np.float64)
    sh, sw = src.shape[:2]
    dw, dh = size
    xs = np.clip((np.arange(dw) + 0.5) * sw / dw - 0.5, 0, sw - 1)
    ys = np.clip((np.arange(dh) + 0.5) * sh / dh - 0.5, 0, sh - 1)
    x0 = np.floor(xs).astype(int)
    y0 = np.floor(ys).astype(int)
    x1 = np.minimum(x0 + 1, sw - 1)
    y1 = np.minimum(y0 + 1, sh - 1)
    fx = (xs - x0)[None, :, None]
    fy = (ys - y0)[:, None, None]
    top = src[y0][:, x0] * (1 - fx) + src[y0][:, x1] * fx
    bottom = src[y1][:, x0] * (1 - fx) + src[y1][:, x1] * fx
    out = top * (1 - fy) + bottom * fy
    return Image.fromarray(np.floor(out + 0.5).astype(np.uint8), "RGB")


def to_srgb(img: Image.Image) -> tuple[Image.Image, str | None, bool]:
    """Convert an embedded ICC profile to sRGB. Returns (image, profile name, converted)."""
    icc = img.info.get("icc_profile")
    rgb = img.convert("RGB")
    if not icc:
        return rgb, None, False
    src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
    name = ImageCms.getProfileDescription(src).strip()
    out = ImageCms.profileToProfile(
        rgb, src, SRGB, renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC, outputMode="RGB"
    )
    if out is None:  # profileToProfile returns None only when inPlace=True
        sys.exit(f"error: ICC conversion returned nothing for profile {name!r}")
    return out, name, True


def decode(entry: dict, out: Path, filt: str) -> None:
    path = REPO / entry["path"]
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != entry["sha256"]:
        sys.exit(
            f"error: {entry['id']} {entry['path']} sha256 {digest} does not match the manifest "
            f"({entry['sha256']}); run `sha256sum -c test-photos/s17-benchmark.sha256`."
        )
    img = Image.open(io.BytesIO(data))
    stored = img.size
    icc = img.info.get("icc_profile")
    swapped = img.getexif().get(ORIENTATION_TAG, 1) in (5, 6, 7, 8)
    w, h = (stored[1], stored[0]) if swapped else stored
    scale = min(1.0, SAMPLE_MAX_EDGE / max(w, h))
    sw, sh = max(1, round(w * scale)), max(1, round(h * scale))
    if filt == "jpeg-draft" and (sw, sh) != (w, h):
        # Decode-to-scale: libjpeg picks the largest 1/2, 1/4, 1/8 reduction that
        # still covers the requested size (requested in STORED orientation).
        img.draft("RGB", (sh, sw) if swapped else (sw, sh))
    decoded = img.size
    img = ImageOps.exif_transpose(img)
    if icc:
        img.info["icc_profile"] = icc  # exif_transpose may drop info on a rotated copy
    img, profile, converted = to_srgb(img)
    if (sw, sh) == img.size:
        small = img
    elif filt in ("point-bilinear", "jpeg-draft"):
        small = point_bilinear(img, (sw, sh))
    else:
        small = img.resize((sw, sh), FILTERS[filt])
    rgba = np.asarray(small.convert("RGBA"), dtype=np.uint8)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{entry['id']}.rgba").write_bytes(rgba.tobytes())
    meta = {
        "id": entry["id"],
        "split": entry["split"],
        "path": entry["path"],
        "input_sha256": digest,
        "stored_dimensions": list(stored),
        "oriented_dimensions": [w, h],
        "decoded_dimensions": list(decoded),
        "sample_dimensions": [sw, sh],
        "exif_orientation": entry.get("exif_orientation"),
        "icc_profile": profile,
        "icc_converted_to_srgb": converted,
        "filter": filt,
    }
    (out / f"{entry['id']}.meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"{entry['id']}  {w}x{h} -> {sw}x{sh}  icc={profile or '-'}  {filt}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*", help="s17-v1 ids (default: the tuning split)")
    ap.add_argument("--all", action="store_true", help="decode every manifest entry")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--filter", choices=sorted(FILTERS), default="jpeg-draft")
    args = ap.parse_args()

    entries = json.loads(MANIFEST.read_text())["entries"]
    by_id = {e["id"]: e for e in entries}
    unknown = [i for i in args.ids if i not in by_id]
    if unknown:
        sys.exit(f"error: not in {MANIFEST.name}: {', '.join(unknown)}")
    if args.all:
        chosen = entries
    elif args.ids:
        chosen = [by_id[i] for i in args.ids]
    else:
        chosen = [e for e in entries if e["split"] == "tuning"]
    for entry in chosen:
        decode(entry, args.out, args.filter)


if __name__ == "__main__":
    main()
