#!/usr/bin/env python3
"""Index the paid spike outputs Phase 2 rates, as an isolated historical series (plan Phase 2).

  python3 scripts/s19/historical.py            # write the Phase 2 evidence
  python3 scripts/s19/historical.py --check    # rebuild in memory and compare with the files

The 2026-10-30 vendor spike (`feasibility.py`) wrote one `meta.json` per call into
test-photos/private/s19-spike/<call>/. This script turns the three calls Phase 2 rates into the
shapes `tally.py` and `local-arms.ts --attempts` read, written to the change's `evaluations/`:

  phase2-configs/<name>.json  one descriptor per spike configuration, taken from the committed
                              `feasibility.py` (model, prompt, size, quality, seed); its sha256 is
                              the config hash the series and ledger use
  phase2-series.json          the three expected slots, each with the input the spike actually
                              sent (an unprepared file: no sRGB conversion, see `input_note`)
  phase2-attempts.jsonl       one reserve + result per call, with the recorded input/output
                              hashes, the meta.json path and hash, and the vendor's usage

Everything is checked before it is written: the access guard on the photo ids and paths, then
each meta.json's input and output hash against the files on disk. Fields the spike did not record
are listed under `unknown_historical_fields` with value null, never estimated. Nothing here can
count towards a gate: the series is `phase: 2` / `historical: true` and lives outside the shared
gate ledger. Output is deterministic, so a rerun on unchanged files rewrites identical bytes.
S19_SPIKE and S19_EVALUATIONS override the two folders (tests).

Exit status: 0 written or matching; 1 refused, a hash mismatch or (--check) a difference; 2 usage.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import protocol  # noqa: E402

FEASIBILITY = Path(__file__).resolve().parent / "feasibility.py"
FEASIBILITY_COMMIT = "eb22c59"  # the commit that recorded the spike's results with this script
SERIES_ID = "phase2-historical"

CONFIGS = {
    "gpt-spike": {
        "kind": "gpt",
        "vendor": "openai",
        "endpoint": "https://api.openai.com/v1/images/edits",
        "model": "gpt-image-2.5-sunburst",
        "prompt_constant": "EDIT_PROMPT",
        "quality": "high",
        "input_note": "the benchmark source file as stored: no EXIF transpose, no ICC conversion",
    },
    "nafnet-spike": {
        "kind": "nafnet",
        "vendor": "fal",
        "endpoint": "https://fal.run/fal-ai/nafnet/denoise",
        "model": "fal-ai/nafnet/denoise",
        "seed": 1,
        "input_note": ("feasibility.py fit_copy: Lanczos to longer edge ≤ 3968, multiples of 16, JPEG q95 "
                       "4:4:4, source ICC profile (Display P3 for S17-04) kept, no sRGB conversion"),
    },
}
CALLS = [  # (config, spike call id, photo, requested size as feasibility.py sent it)
    ("gpt-spike", "B-openai-sunburst-S17-04", "S17-04", [2048, 1536]),
    ("gpt-spike", "B-openai-sunburst-S17-07", "S17-07", [2304, 1536]),
    ("nafnet-spike", "A-fal-nafnet-denoise-S17-04-max3968", "S17-04", None),
]
UNKNOWN_RESERVE = ["reserved_usd", "cost_bound_usd", "retry_policy"]
UNKNOWN_RESULT = ["http_status", "cost_usd"]


def spike_dir() -> Path:
    return Path(os.environ.get("S19_SPIKE", protocol.ROOT / "test-photos" / "private" / "s19-spike"))


def out_dir() -> Path:
    return Path(os.environ.get("S19_EVALUATIONS", protocol.CHANGE_DIR / "evaluations"))


def rel(path: Path) -> str:
    return str(path.relative_to(protocol.ROOT)) if path.is_relative_to(protocol.ROOT) else str(path)


def prompt(name: str) -> str:
    """A string constant of feasibility.py, read without executing the script."""
    for node in ast.parse(FEASIBILITY.read_text()).body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise protocol.Refused(f"feasibility.py has no constant {name}")


def config_doc(name: str) -> dict:
    spec = dict(CONFIGS[name])
    doc = {"name": name, "historical": True, "series_id": SERIES_ID,
           "source": {"script": rel(FEASIBILITY), "commit": FEASIBILITY_COMMIT}}
    if "prompt_constant" in spec:
        doc["prompt"] = prompt(spec.pop("prompt_constant"))
    doc.update(spec)
    doc["unknown_historical_fields"] = {k: None for k in UNKNOWN_RESERVE}
    return doc


def dumps(obj, name: str) -> str:
    """JSON exactly as the repository's Prettier leaves it. Config hashes are taken over these
    bytes, so the pre-commit format pass must not be able to change them."""
    text = json.dumps(obj, indent=2, ensure_ascii=False) + "\n"
    r = subprocess.run(["npx", "--no-install", "prettier", "--stdin-filepath", name], input=text,
                       capture_output=True, text=True, cwd=protocol.ROOT)
    if r.returncode != 0:
        raise protocol.Refused(f"prettier could not format {name}: {r.stderr.strip()}")
    return r.stdout


def build() -> dict[str, str]:
    """{repo-relative path: file text} for every evidence file; raises protocol.Refused."""
    manifest = protocol.load_manifest()
    ids = sorted({photo for _, _, photo, _ in CALLS})
    protocol.require_access(ids, validation=False, access=None, config=None, manifest=manifest)
    metas = {call: spike_dir() / call / "meta.json" for _, call, _, _ in CALLS}
    protocol.check_paths([str(p) for p in metas.values()], validation=False, manifest=manifest)

    files: dict[str, str] = {}
    hashes: dict[str, str] = {}
    for name in CONFIGS:
        path = out_dir() / "phase2-configs" / f"{name}.json"
        files[rel(path)] = dumps(config_doc(name), f"{name}.json")
        hashes[name] = protocol.sha256_bytes(files[rel(path)].encode())

    series = {"series_id": SERIES_ID, "phase": 2, "split": "tuning", "historical": True,
              "manifest_sha256": protocol.sha256_file(protocol.manifest_path()),
              "note": ("Historical diagnostic evidence: the spike's calls, made from unprepared inputs. No slot "
                       "counts towards a core, tuning or validation gate."),
              "configs": {hashes[n]: {"path": rel(out_dir() / "phase2-configs" / f"{n}.json"), "name": n,
                                      "kind": CONFIGS[n]["kind"], "role": "core"} for n in CONFIGS},
              "prerequisites": [], "slots": []}
    ledger: list[dict] = []
    for name, call, photo, size in CALLS:
        meta_path = metas[call]
        if not meta_path.exists():
            raise protocol.Refused(f"{call}: no {rel(meta_path)}")
        meta = json.loads(meta_path.read_text())
        inp = protocol.resolve(meta["input"])
        out = meta_path.parent / "output.png"
        protocol.check_paths([str(inp), str(out)], validation=False, manifest=manifest)
        if protocol.sha256_file(inp) != meta["input_sha256"]:
            raise protocol.Refused(f"{call}: {meta['input']} no longer hashes to the input the spike recorded")
        if protocol.sha256_file(out) != meta["output"]["sha256"]:
            raise protocol.Refused(f"{call}: {rel(out)} is not the output the spike recorded")
        with Image.open(inp) as im:
            in_dims = list(im.size)
        with Image.open(out) as im:
            out_dims = list(im.size)
        if out_dims != [meta["output"]["width"], meta["output"]["height"]]:
            raise protocol.Refused(f"{call}: output is {out_dims}, meta.json says otherwise")
        common = {"config_sha256": hashes[name], "config_name": name, "kind": CONFIGS[name]["kind"], "photo": photo,
                  "slot": 1, "role": "core", "input_sha256": meta["input_sha256"]}
        series["slots"].append({**common, "input": "spike", "input_path": meta["input"], "input_dimensions": in_dims,
                                "request_size": size or in_dims, "cost_bound_usd": None, "requires": [],
                                "input_note": CONFIGS[name]["input_note"]})
        ledger.append({"event": "reserve", "attempt_id": f"phase2-{call}", "phase": 2, "series_id": SERIES_ID,
                       **{k: common[k] for k in ("config_sha256", "config_name", "input_sha256", "photo", "slot",
                                                 "role")},
                       "input_path": meta["input"], "ordinal": 1, "request_size": size or in_dims,
                       "requested_at": meta["run_at"], "historical": True, "meta_path": rel(meta_path),
                       "meta_sha256": protocol.sha256_file(meta_path),
                       "unknown_historical_fields": {k: None for k in UNKNOWN_RESERVE}})
        ledger.append({"event": "result", "attempt_id": f"phase2-{call}", "status": "ok", "transient": False,
                       "output_path": rel(out), "output_sha256": meta["output"]["sha256"],
                       "output_dimensions": out_dims, "output_icc_profile": meta["output"].get("icc_profile"),
                       "wall_s": meta.get("wall_s"), "usage": meta.get("usage"),
                       "unknown_historical_fields": {k: None for k in UNKNOWN_RESULT}})
    files[rel(out_dir() / "phase2-series.json")] = dumps(series, "phase2-series.json")
    files[rel(out_dir() / "phase2-attempts.jsonl")] = "".join(json.dumps(r, ensure_ascii=False) + "\n"
                                                              for r in ledger)
    return files


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Index the Phase 2 historical spike outputs")
    ap.add_argument("--check", action="store_true", help="compare with the written files, write nothing")
    args = ap.parse_args(argv)
    try:
        files = build()
    except protocol.Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1
    if args.check:
        stale = [p for p, text in files.items()
                 if not protocol.resolve(p).exists() or protocol.resolve(p).read_text() != text]
        for p in stale:
            print(f"✗ {p} differs from a rebuild", file=sys.stderr)
        if not stale:
            print(f"✓ {len(files)} historical evidence file(s) match a rebuild")
        return 1 if stale else 0
    for p, text in files.items():
        path = protocol.resolve(p)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
