#!/usr/bin/env python3
"""Prepare the exact bytes every S-19 arm receives (plan Phase 1, item 1; "Fair input").

Per photo it writes, under test-photos/private/s19/inputs/ (gitignored):

  <id>-common.jpg   EXIF orientation applied, the embedded ICC profile converted to sRGB
                    (LittleCMS, relative colorimetric), sRGB profile embedded, no EXIF,
                    JPEG quality 95 with 4:4:4 chroma. Real Local (in the app) and GPT get
                    exactly this file.
  <id>-nafnet.jpg   Derived only from <id>-common.jpg. When an edge exceeds 3968 px (fal's
                    NAFNet endpoint rejects > 3981 px) it is Lanczos-downscaled so the longer
                    edge is ≤ 3968 and both edges are multiples of 16; otherwise it is a byte
                    copy of the common file. NAFNet and its no-NAFNet control share it.
  <id>.json         Sidecar: source and prepared hashes, orientation, source profile,
                    conversion, dimensions and the versions that produced them.

A photo without an embedded profile is treated as sRGB and still re-encoded the same way.

  python3 scripts/s19/inputs.py --all                 # the eight tuning photos
  python3 scripts/s19/inputs.py S17-03 S17-06         # named tuning photos
  python3 scripts/s19/inputs.py --check [--all|ids]   # re-derive and compare, check invariants
  python3 scripts/s19/inputs.py --config <finalist.json> --validation \\
      --access test-photos/private/s19/validation-access.json --all-validation   # Phase 7 only

Every mode calls the protocol's access guard before a photo byte is read. Exit status: 0 done
or every check passed; 1 refused or a check failed (named per photo); 2 usage.
"""

from __future__ import annotations

import argparse
import io
import json
import shutil
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageCms, ImageOps, features

sys.path.insert(0, str(Path(__file__).resolve().parent))
import protocol  # noqa: E402

NAFNET_MAX_EDGE = 3968
GPT_INPUT_MAX_BYTES = 50_000_000
JPEG_ARGS = {"quality": 95, "subsampling": 0, "optimize": False}
SRGB = ImageCms.createProfile("sRGB")
# LittleCMS stamps the current time into the ICC header (bytes 24–35), which would make every
# run's JPEG differ. Pin it; the profile ID (bytes 84–99) is zero, so nothing else depends on it.
_srgb = bytearray(ImageCms.ImageCmsProfile(SRGB).tobytes())
_srgb[24:36] = bytes([0x07, 0xEA, 0, 10, 0, 31, 0, 0, 0, 0, 0, 0])  # 2026-10-31T00:00:00
SRGB_BYTES = bytes(_srgb)


def out_dir() -> Path:
    return protocol.private_dir() / "inputs"


def profile_name(icc: bytes | None) -> str | None:
    if not icc:
        return None
    return ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(icc))).strip()


def nafnet_size(width: int, height: int) -> tuple[int, int] | None:
    """The NAFNet input size, or None when no downscale is required."""
    if max(width, height) <= NAFNET_MAX_EDGE:
        return None
    k = NAFNET_MAX_EDGE / max(width, height)
    return round(width * k) // 16 * 16, round(height * k) // 16 * 16


def prepare(entry: dict, dest: Path) -> dict:
    """Write <id>-common.jpg, <id>-nafnet.jpg and <id>.json into `dest`; return the sidecar."""
    src = protocol.resolve(entry["path"])
    data = src.read_bytes()
    src_sha = protocol.sha256_bytes(data)
    if src_sha != entry["sha256"]:
        raise protocol.Refused(f"{entry['id']}: {entry['path']} hashes to {src_sha}, the manifest says {entry['sha256']}")
    im = Image.open(io.BytesIO(data))
    stored = im.size
    orientation = im.getexif().get(0x0112, 1)
    icc = im.info.get("icc_profile")
    oriented = ImageOps.exif_transpose(im)
    rgb = oriented.convert("RGB")
    if icc:
        rgb = ImageCms.profileToProfile(
            rgb,
            ImageCms.ImageCmsProfile(io.BytesIO(icc)),
            SRGB,
            renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
            outputMode="RGB",
        )
        conversion = "ICC → sRGB, LittleCMS relative colorimetric"
    else:
        conversion = "none: no embedded profile, treated as sRGB"

    dest.mkdir(parents=True, exist_ok=True)
    common = dest / f"{entry['id']}-common.jpg"
    rgb.save(common, "JPEG", icc_profile=SRGB_BYTES, **JPEG_ARGS)

    nafnet = dest / f"{entry['id']}-nafnet.jpg"
    reread = Image.open(common)
    target = nafnet_size(*reread.size)
    if target is None:
        shutil.copyfile(common, nafnet)
    else:
        reread.convert("RGB").resize(target, Image.LANCZOS).save(nafnet, "JPEG", icc_profile=SRGB_BYTES, **JPEG_ARGS)

    sidecar = {
        "id": entry["id"],
        "split": entry["split"],
        "source": {
            "path": entry["path"],
            "sha256": src_sha,
            "stored_dimensions": list(stored),
            "exif_orientation": orientation,
            "icc_profile": profile_name(icc),
        },
        "conversion": conversion,
        "common": {
            "path": str(common.relative_to(protocol.ROOT)) if common.is_relative_to(protocol.ROOT) else str(common),
            "sha256": protocol.sha256_file(common),
            "bytes": common.stat().st_size,
            "dimensions": list(Image.open(common).size),
            "encoding": "JPEG q95 4:4:4, sRGB profile embedded, no EXIF",
        },
        "nafnet": {
            "path": str(nafnet.relative_to(protocol.ROOT)) if nafnet.is_relative_to(protocol.ROOT) else str(nafnet),
            "sha256": protocol.sha256_file(nafnet),
            "dimensions": list(Image.open(nafnet).size),
            "downscaled": target is not None,
            "rule": f"longer edge ≤ {NAFNET_MAX_EDGE}, multiples of 16, Lanczos, only when required",
        },
        "producer": {
            "script_sha256": protocol.sha256_file(Path(__file__)),
            "pillow": Image.__version__,
            "littlecms": features.version("littlecms2"),
        },
    }
    (dest / f"{entry['id']}.json").write_text(json.dumps(sidecar, indent=2) + "\n")
    return sidecar


def check(entry: dict) -> list[str]:
    """Re-derive into a temporary folder and compare; then check the invariants."""
    problems: list[str] = []
    sidecar_path = out_dir() / f"{entry['id']}.json"
    if not sidecar_path.exists():
        return [f"{entry['id']}: no prepared input; run inputs.py first"]
    stored = json.loads(sidecar_path.read_text())
    with tempfile.TemporaryDirectory() as tmp:
        fresh = prepare(entry, Path(tmp))
    for part in ("common", "nafnet"):
        on_disk = protocol.sha256_file(protocol.resolve(stored[part]["path"]))
        if on_disk != stored[part]["sha256"]:
            problems.append(f"{entry['id']}: {part} file on disk differs from its sidecar hash")
        if fresh[part]["sha256"] != stored[part]["sha256"]:
            problems.append(f"{entry['id']}: {part} does not reproduce ({fresh[part]['sha256'][:12]}… vs "
                            f"{stored[part]['sha256'][:12]}…)")
    common = Image.open(protocol.resolve(stored["common"]["path"]))
    expected = entry.get("display_dimensions")
    if expected and list(common.size) != list(expected):
        problems.append(f"{entry['id']}: common is {common.size}, the manifest's oriented size is {expected}")
    if "sRGB" not in (profile_name(common.info.get("icc_profile")) or ""):
        problems.append(f"{entry['id']}: common file does not embed an sRGB profile")
    if common.getexif().get(0x0112, 1) != 1:
        problems.append(f"{entry['id']}: common file still carries an EXIF orientation")
    if stored["common"]["bytes"] > GPT_INPUT_MAX_BYTES:
        problems.append(f"{entry['id']}: common file is {stored['common']['bytes']} bytes, over GPT's 50 MB")
    w, h = stored["nafnet"]["dimensions"]
    if max(w, h) > NAFNET_MAX_EDGE:
        problems.append(f"{entry['id']}: NAFNet input {w}×{h} exceeds {NAFNET_MAX_EDGE} px")
    if stored["nafnet"]["downscaled"] and (w % 16 or h % 16):
        problems.append(f"{entry['id']}: downscaled NAFNet input {w}×{h} is not a multiple of 16")
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Prepare S-19 inputs")
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--all", action="store_true", help="every tuning photo")
    ap.add_argument("--all-validation", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--validation", action="store_true")
    ap.add_argument("--access")
    ap.add_argument("--config")
    args = ap.parse_args(argv)
    try:
        if args.all_validation and not args.validation:
            raise protocol.Refused("--all-validation needs --validation --access <release.json> --config <finalist.json>")
        manifest = protocol.load_manifest()
        # A bare --check covers tuning; with --all-validation it covers validation only.
        ids = protocol.select_ids(manifest, args.ids, args.all or (args.check and not args.ids and not args.all_validation),
                                  args.all_validation)
        if not ids:
            raise protocol.Refused("no photos selected: name ids or pass --all")
        protocol.require_access(ids, validation=args.validation, access=args.access, config=args.config,
                                manifest=manifest)
    except protocol.Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1
    entries = {e["id"]: e for e in manifest["entries"]}
    failed = 0
    for i in ids:
        try:
            if args.check:
                problems = check(entries[i])
                for p in problems:
                    print(f"✗ {p}")
                failed += bool(problems)
                if not problems:
                    print(f"✓ {i}: reproducible; oriented size, sRGB profile, no EXIF orientation, NAFNet size OK")
            else:
                s = prepare(entries[i], out_dir())
                print(f"{i}: {s['source']['icc_profile'] or 'no profile'} → sRGB, orientation "
                      f"{s['source']['exif_orientation']}, common {s['common']['dimensions']} "
                      f"{s['common']['bytes'] // 1000} kB, nafnet {s['nafnet']['dimensions']}"
                      f"{' (downscaled)' if s['nafnet']['downscaled'] else ' (copy)'}")
        except protocol.Refused as e:
            print(f"✗ {e}")
            failed += 1
    if failed:
        print(f"{failed} photo(s) failed", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
