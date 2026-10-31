#!/usr/bin/env python3
"""Write an S-19 series manifest: the expected slots of one phase, fixed before any call.

  python3 scripts/s19/make-series.py phase3 [--out scripts/s19/series/phase3.json]

A series names, per slot: the config hash, photo, logical replicate slot, role (`core`,
`probe`, `tuning`, `validation`), which prepared input it gets and that input's hash, the
frozen request size and the slot's cost bound. `run-candidate.py` refuses any slot not listed
here, and `tally.py` joins ratings and attempts against it. Fix a series before looking at
its results; editing it afterwards changes its hash, which later gates check.

Only the Phase 3 layout is defined now. Phase 5 and validation layouts are added before their
runs (plan Phase 5, Phase 6). Exit status: 0 written; 1 refused; 2 usage.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import importlib.util
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import protocol  # noqa: E402

_spec = importlib.util.spec_from_file_location("run_candidate", Path(__file__).with_name("run-candidate.py"))
runner = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(runner)

CONFIGS = Path(__file__).resolve().parent / "configs"

# (config file, role, photos, replicate slots per photo). Plan Phase 3: nine standard GPT core
# slots, one large-size probe on S17-04 and S17-07 (diagnostic, never a passing core), and
# NAFNet core on the three core photos (deterministic: one slot each).
LAYOUTS = {
    "phase3": {
        "phase": 3,
        "split": "tuning",
        "rows": [
            ("gpt-std.json", "core", ["S17-03", "S17-04", "S17-07"], 3),
            ("gpt-large.json", "probe", ["S17-04", "S17-07"], 1),
            ("nafnet.json", "core", ["S17-03", "S17-04", "S17-07"], 1),
        ],
    },
}


def build(name: str) -> dict:
    layout = LAYOUTS[name]
    manifest = protocol.load_manifest()
    photos = sorted({p for _, _, ps, _ in layout["rows"] for p in ps})
    protocol.require_access(photos, manifest=manifest)  # metadata only: tuning photos, sidecars
    configs, slots = {}, []
    for file, role, ids, repeats in layout["rows"]:
        path = CONFIGS / file
        config = json.loads(path.read_text())
        sha = protocol.sha256_file(path)
        configs[sha] = {"path": str(path.relative_to(protocol.ROOT)), "name": config["name"], "kind": config["kind"],
                        "role": role}
        for photo in ids:
            _, meta = runner.input_for(photo, config["input"])
            dims = tuple(meta["dimensions"])
            size = runner.request_size(*dims, config["size_rule"]) if config["kind"] == "gpt" else dims
            for slot in range(1, repeats + 1):
                slots.append({"config_sha256": sha, "config_name": config["name"], "kind": config["kind"],
                              "photo": photo, "slot": slot, "role": role, "input": config["input"],
                              "input_sha256": meta["sha256"], "input_dimensions": list(dims),
                              "request_size": list(size), "cost_bound_usd": runner.cost_bound(config, size),
                              "requires": []})
    return {
        "series_id": name,
        "phase": layout["phase"],
        "split": layout["split"],
        "manifest_sha256": protocol.sha256_file(protocol.manifest_path()),
        "fixed_on": _dt.date.today().isoformat(),
        "note": "Fixed before any call of this series. Probes are diagnostic; a gate counts each photo's slot 1.",
        "configs": configs,
        "prerequisites": [],
        "slots": slots,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Write an S-19 series manifest")
    ap.add_argument("name", choices=sorted(LAYOUTS))
    ap.add_argument("--out")
    args = ap.parse_args(argv)
    out = protocol.resolve(args.out or f"scripts/s19/series/{args.name}.json")
    try:
        series = build(args.name)
    except protocol.Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(series, indent=2, ensure_ascii=False) + "\n")
    total = sum(s["cost_bound_usd"] for s in series["slots"])
    print(f"{out.relative_to(protocol.ROOT)}: {len(series['slots'])} slots, bound total ${total:.2f}")
    for s in series["slots"]:
        print(f"  {s['config_name']:<9} {s['role']:<6} {s['photo']}/{s['slot']}  "
              f"{s['request_size'][0]}×{s['request_size'][1]}  ${s['cost_bound_usd']:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
