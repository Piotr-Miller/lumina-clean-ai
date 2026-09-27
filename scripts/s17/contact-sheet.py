#!/usr/bin/env python3
"""Build S-17 tuning contact sheets from direct Bread runs (plan Phase 3).

One local HTML page per tuning photo: the original plus every direct-run output
found for it, at matched size, each labelled with its parameters and exposure
diagnostics. The maintainer marks preferred and acceptable values from these
sheets (calibration.md § Phase 3 procedure).

Which runs belong to which photo is decided by the run record, never by the
filename: each `<output>.png.json` written by `scripts/spikes/bread-spike.ts`
carries the input sha256, which is looked up in the s17-v1 manifest. Before a
run is shown, its output file's sha256 is checked against the record.

TUNING PHOTOS ONLY. Naming a validation id is an error (exit 2). A run of a
validation photo found in a scanned directory — the Phase 2 EXIF probe on
S17-06 lives next to the baseline runs — is skipped without opening its image,
and the skip is counted in the summary. Validation outputs are never opened
before the rule is frozen (plan, Definitions).

Matched size: every image on a sheet is shown at the Bread output's pixel size.
The original is EXIF-transposed, converted to sRGB exactly as
`decode-inputs.py` does, and downscaled with LANCZOS. An output is never
enlarged; if one photo's outputs differ in size, all are downscaled to the
smallest and the sheet says so.

Diagnostics use `exposure_stats` from `scripts/measure-hue-shares.py` (its
docstring fixes the method): the file's encoded values at FULL resolution, the
whole frame. The six tuning photos' manifest ROI is the whole frame, so no ROI
line is shown. They are diagnostics, not thresholds.

Usage, from the repo root:

    python3 scripts/s17/contact-sheet.py --name phase3-gamma \\
        --run test-photos/private/s17/direct/phase2 --run test-photos/private/s17/direct/phase3/gamma
    python3 scripts/s17/contact-sheet.py --name phase3-gamma --run <dir> S17-01 S17-04
    python3 scripts/s17/contact-sheet.py ... --markdown     # also print run-log rows

Writes test-photos/private/s17/sheets/<name>/ (gitignored): index.html, one
<id>.html per photo, and the matched-size PNGs. Exits 1 on a checksum mismatch
or a missing output, 2 on a validation or unknown id.

Requires:    Pillow (with ImageCms), numpy.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import numpy as np
from PIL import Image, ImageOps

REPO = Path(__file__).resolve().parents[2]
MANIFEST = REPO / "test-photos/s17-benchmark.json"
SHEETS = REPO / "test-photos/private/s17/sheets"


def load(name: str, path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        sys.exit(f"error: cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MEASURE = load("measure_hue_shares", REPO / "scripts/measure-hue-shares.py")
DECODE = load("decode_inputs", Path(__file__).resolve().parent / "decode-inputs.py")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def diagnostics(rgb8: np.ndarray) -> str:
    v_hi, any255, mean = MEASURE.exposure_stats(rgb8)
    return f"V≥0.90 {v_hi:.1f} % · any=255 {any255:.1f} % · mean {mean[0]:.3f} {mean[1]:.3f} {mean[2]:.3f}"


def collect(dirs: list[Path], by_sha: dict[str, dict]) -> tuple[dict[str, list[dict]], int, list[str]]:
    """Run records per tuning id; count of validation runs skipped; records outside s17-v1."""
    runs: dict[str, list[dict]] = {}
    skipped_validation = 0
    foreign: list[str] = []
    for d in dirs:
        if not d.is_dir():
            sys.exit(f"error: run directory {d} does not exist")
        for record_path in sorted(d.glob("*.png.json")):
            record = json.loads(record_path.read_text())
            entry = by_sha.get(record.get("input_sha256") or "")
            if entry is None:
                foreign.append(str(record_path))
                continue
            if entry["split"] != "tuning":
                skipped_validation += 1  # never open a validation output
                continue
            output = record_path.with_name(record_path.name.removesuffix(".json"))
            if not output.is_file():
                sys.exit(f"error: {record_path} names an output that is missing: {output}")
            actual = sha256(output)
            if actual != record["output_sha256"]:
                sys.exit(
                    f"error: {output} sha256 {actual} does not match its run record "
                    f"({record['output_sha256']}); the output changed after the run."
                )
            runs.setdefault(entry["id"], []).append({**record, "_output": output})
    return runs, skipped_validation, foreign


def original_rgb(entry: dict) -> Image.Image:
    path = REPO / entry["path"]
    if sha256(path) != entry["sha256"]:
        sys.exit(f"error: {entry['path']} does not match the manifest; run `sha256sum -c test-photos/s17-benchmark.sha256`.")
    img = Image.open(path)
    icc = img.info.get("icc_profile")
    img = ImageOps.exif_transpose(img)
    if icc:
        img.info["icc_profile"] = icc
    rgb, _profile, _converted = DECODE.to_srgb(img)
    return rgb


def figure(src: str, caption: str) -> str:
    return (
        f'<figure><a href="{html.escape(src)}" target="_blank"><img src="{html.escape(src)}" loading="lazy"></a>'
        f"<figcaption>{caption}</figcaption></figure>"
    )


def build_photo(entry: dict, runs: list[dict], out: Path, markdown: bool) -> str:
    pid = entry["id"]
    runs.sort(key=lambda r: (r["strength"], r["gamma"], r["prediction_id"]))
    outputs = [(r, Image.open(r["_output"]).convert("RGB")) for r in runs]
    sizes = {img.size for _, img in outputs}
    target = min(sizes, key=lambda s: s[0] * s[1])
    note = "" if len(sizes) == 1 else f"<p>⚠ outputs differ in size ({sorted(sizes)}); all shown at {target[0]}×{target[1]}.</p>"

    original = original_rgb(entry)
    orig_diag = diagnostics(np.asarray(original, dtype=np.uint8))
    original.resize(target, Image.LANCZOS).save(out / f"{pid}-original.png")
    figures = [figure(f"{pid}-original.png", f"<b>Original</b> ({original.size[0]}×{original.size[1]} sRGB)<br>{orig_diag}")]

    for record, img in outputs:
        name = f"{pid}-{record['prediction_id'][:8]}.png"
        (img if img.size == target else img.resize(target, Image.LANCZOS)).save(out / name)
        diag = diagnostics(np.asarray(img, dtype=np.uint8))
        label = f"γ {record['gamma']:g} · strength {record['strength']:g}"
        figures.append(figure(name, f"<b>{label}</b><br>{record['prediction_id'][:8]} · {img.size[0]}×{img.size[1]}<br>{diag}"))
        if markdown:
            v_hi, any255, mean = MEASURE.exposure_stats(np.asarray(img, dtype=np.uint8))
            print(
                f"| `{record['prediction_id']}` | {pid} | {record['gamma']:g} / {record['strength']:g} | "
                f"{img.size[0]} × {img.size[1]} | `{record['output_sha256'][:12]}…` | {v_hi:.1f} % | {any255:.1f} % | "
                f"{mean[0]:.3f} {mean[1]:.3f} {mean[2]:.3f} | |"
            )

    page = (
        f'<!doctype html><meta charset="utf-8"><title>{pid} contact sheet</title>'
        "<style>body{background:#111;color:#ddd;font:14px system-ui;margin:16px}"
        ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px}"
        "figure{margin:0}img{width:100%;height:auto;display:block}a{color:#9cf}</style>"
        f'<p><a href="index.html">← all photos</a></p><h1>{pid}</h1>'
        f"<p>{html.escape(entry['path'])} · every image at {target[0]}×{target[1]} · "
        "click an image for full size · diagnostics at each file's own full resolution</p>"
        f'{note}<div class="grid">{"".join(figures)}</div>'
    )
    (out / f"{pid}.html").write_text(page)
    return f'<li><a href="{pid}.html">{pid}</a> — {len(runs)} run(s)</li>'


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*", help="tuning ids (default: every tuning photo with runs)")
    ap.add_argument(
        "--run",
        action="append",
        type=Path,
        required=True,
        dest="runs",
        help="a directory of bread-spike outputs + run records (repeatable)",
    )
    ap.add_argument("--name", required=True, help="sheet folder name under test-photos/private/s17/sheets/")
    ap.add_argument("--markdown", action="store_true", help="print one calibration.md run-log row per run")
    args = ap.parse_args()

    entries = json.loads(MANIFEST.read_text())["entries"]
    by_id = {e["id"]: e for e in entries}
    unknown = [i for i in args.ids if i not in by_id]
    if unknown:
        print(f"error: not in {MANIFEST.name}: {', '.join(unknown)}", file=sys.stderr)
        sys.exit(2)
    validation = [i for i in args.ids if by_id[i]["split"] != "tuning"]
    if validation:
        print(
            f"error: {', '.join(validation)} {'is a validation photo' if len(validation) == 1 else 'are validation photos'}; "
            "contact sheets are for the six tuning photos only (plan Phase 3).",
            file=sys.stderr,
        )
        sys.exit(2)

    runs, skipped, foreign = collect(args.runs, {e["sha256"]: e for e in entries})
    ids = args.ids or sorted(runs)
    missing = [i for i in ids if i not in runs]
    if missing:
        sys.exit(f"error: no runs found for {', '.join(missing)} in {', '.join(map(str, args.runs))}")

    out = SHEETS / args.name
    out.mkdir(parents=True, exist_ok=True)
    items = [build_photo(by_id[i], runs[i], out, args.markdown) for i in ids]
    (out / "index.html").write_text(
        f'<!doctype html><meta charset="utf-8"><title>S-17 {html.escape(args.name)}</title>'
        "<style>body{background:#111;color:#ddd;font:15px system-ui;margin:16px}a{color:#9cf}</style>"
        f"<h1>S-17 contact sheets — {html.escape(args.name)}</h1><ul>{''.join(items)}</ul>"
    )
    total = sum(len(runs[i]) for i in ids)
    print(f"wrote {out / 'index.html'}: {len(ids)} photo(s), {total} run(s)", file=sys.stderr)
    if skipped:
        print(f"skipped {skipped} run(s) of validation photos without opening them", file=sys.stderr)
    for path in foreign:
        print(f"skipped {path}: its input is not in s17-v1", file=sys.stderr)


if __name__ == "__main__":
    main()
