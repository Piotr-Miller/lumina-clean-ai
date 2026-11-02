#!/usr/bin/env python3
"""Write an S-19 series manifest: the expected slots of one phase, fixed before any call.

  python3 scripts/s19/make-series.py phase3 [--out scripts/s19/series/phase3.json]

A series names, per slot: the config hash, photo, logical replicate slot, role (`core`,
`probe`, `tuning`, `validation`), which prepared input it gets and that input's hash, the
frozen request size and the slot's cost bound. `run-candidate.py` refuses any slot not listed
here, and `tally.py` joins ratings and attempts against it. Fix a series before looking at
its results; editing it afterwards changes its hash, which later gates check.

Layouts: phase3, and phase5 (owner decision 2026-11-02: a fresh restrained-prompt GPT config,
9 core slots on S17-03/04/07, then one slot on each remaining tuning photo). The phase5 extension
slots require the config's PASS core report; until `--core-report <phase5-core-report.json>` pins
that report's hash, the runner refuses them, and a STOP report never satisfies the requirement.
The validation layout is added before its run (plan Phase 6). Exit status: 0 written; 1 refused;
2 usage.
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
    "phase5": {
        "phase": 5,
        "split": "tuning",
        "rows": [
            ("phase5-gpt.json", "core", ["S17-03", "S17-04", "S17-07"], 3),
            ("phase5-gpt.json", "tuning", ["S17-01", "S17-02", "S17-05", "S17-06", "S17-21"], 1),
        ],
        "core_report": "context/changes/cloud-model-comparison/evaluations/phase5-core-report.json",
    },
}


def build(name: str, core_report: str | None = None) -> dict:
    layout = LAYOUTS[name]
    manifest = protocol.load_manifest()
    photos = sorted({p for _, _, ps, _ in layout["rows"] for p in ps})
    protocol.require_access(photos, manifest=manifest)  # metadata only: tuning photos, sidecars
    configs, slots = {}, []
    for file, role, ids, repeats in layout["rows"]:
        path = CONFIGS / file
        config = json.loads(path.read_text())
        sha = protocol.sha256_file(path)
        configs.setdefault(sha, {"path": str(path.relative_to(protocol.ROOT)), "name": config["name"],
                                 "kind": config["kind"], "role": role})  # a config's role is its first row's
        for photo in ids:
            _, meta = runner.input_for(photo, config["input"])
            dims = tuple(meta["dimensions"])
            size = runner.request_size(*dims, config["size_rule"]) if config["kind"] == "gpt" else dims
            for slot in range(1, repeats + 1):
                slots.append({"config_sha256": sha, "config_name": config["name"], "kind": config["kind"],
                              "photo": photo, "slot": slot, "role": role, "input": config["input"],
                              "input_sha256": meta["sha256"], "input_dimensions": list(dims),
                              "request_size": list(size), "cost_bound_usd": runner.cost_bound(config, size),
                              "requires": ["core"] if role == "tuning" and layout.get("core_report") else []})
    return {
        "series_id": name,
        "phase": layout["phase"],
        "split": layout["split"],
        "manifest_sha256": protocol.sha256_file(protocol.manifest_path()),
        "fixed_on": _dt.date.today().isoformat(),
        "note": "Fixed before any call of this series. Probes are diagnostic; a gate counts each photo's slot 1.",
        "configs": configs,
        "prerequisites": prerequisites(layout, configs, core_report),
        "slots": slots,
    }


def prerequisites(layout: dict, configs: dict, core_report: str | None) -> list[dict]:
    """The core-PASS requirement of an extension layout; its report hash stays null (refused by
    the runner) until the owner's core verdict exists and is pinned with --core-report."""
    if not layout.get("core_report"):
        return []
    core = [sha for sha, c in configs.items() if c["role"] == "core"]
    report = layout["core_report"]
    if core_report:
        path = protocol.resolve(core_report)
        if path.resolve() != protocol.resolve(report).resolve() or not path.exists():
            raise protocol.Refused(f"--core-report must be the existing {report}")
        sha = protocol.sha256_file(path)
    else:
        sha = None
    return [{"id": "core", "stage": "core", "config_sha256": core[0], "report": report, "report_sha256": sha}]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Write an S-19 series manifest")
    ap.add_argument("name", choices=sorted(LAYOUTS))
    ap.add_argument("--out")
    ap.add_argument("--core-report", help="phase5: pin the PASS core report the extension requires")
    args = ap.parse_args(argv)
    out = protocol.resolve(args.out or f"scripts/s19/series/{args.name}.json")
    try:
        series = build(args.name, args.core_report)
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
