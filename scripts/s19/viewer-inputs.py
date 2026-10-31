#!/usr/bin/env python3
"""Build the manifest `compare-arms.html` reads (plan Phase 1, item 4).

  python3 scripts/s19/viewer-inputs.py <spec.json> [--name arms]
  python3 scripts/s19/viewer-inputs.py <spec.json> --validation --access <release.json> --config <finalist.json>

A spec lists, per photo, the original, every arm (a file plus the ids that tie it to its
series, slot, attempt and input) and the gate pairs: candidate vs real Local, or a NAFNet arm vs
its control. The builder checks access for every photo id BEFORE reading any image, then
hashes each file and reads its pixel size, and writes
`test-photos/private/s19/viewer/<name>.js` (gitignored) as `window.S19_ARMS = {...}` — a
script, because browsers refuse `fetch` of a JSON file opened from disk. Images are referenced
by path, never embedded.

A failed slot is listed with its status and no file. A tuning spec that names a validation
photo is refused, so a tuning manifest never enumerates validation image paths. A validation
spec embeds the Phase 7 release (run id, config and manifest hashes), and the viewer refuses a
validation manifest without it.

Exit status: 0 written; 1 refused or a file is missing/mismatched; 2 usage.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import protocol  # noqa: E402

REFERENCES = protocol.CHANGE_DIR / "references"


def rel_to_viewer(path: Path) -> str:
    """Path as compare-arms.html (in references/) must request it."""
    return os.path.relpath(path, REFERENCES).replace(os.sep, "/")


def describe(path_str: str, expect_sha: str | None) -> dict:
    path = protocol.resolve(path_str)
    if not path.exists():
        raise protocol.Refused(f"{path_str} does not exist")
    sha = protocol.sha256_file(path)
    if expect_sha and sha != expect_sha:
        raise protocol.Refused(f"{path_str} hashes to {sha[:12]}…, the spec expects {expect_sha[:12]}…")
    with Image.open(path) as im:
        size = list(im.size)
    return {"src": rel_to_viewer(path), "sha256": sha, "dimensions": size}


def derived_link(photo: str, arm: dict, shown_sha: str) -> dict:
    """A rated file made from a paid output (NAFNet + Local gamma) is not the slot's raw result.
    Tie it to that result through the `local-arms.ts` record that produced it: the record must
    name the shown file as its output and a ledger output as its source; tally then checks the
    source against the slot's first valid result and the record's hash against this link."""
    spec = arm["candidate"]["derived"]
    if "record" not in spec:
        raise protocol.Refused(f"{photo} {arm['arm_id']}: a derived arm needs candidate.derived.record "
                               "(the local-arms <id>.json that produced it)")
    record_path = protocol.resolve(spec["record"])
    try:
        record = json.loads(record_path.read_text())
    except (OSError, ValueError) as e:
        raise protocol.Refused(f"{photo} {arm['arm_id']}: cannot read derived record {spec['record']}: {e}") from e
    if record.get("output_sha256") != shown_sha:
        raise protocol.Refused(f"{photo} {arm['arm_id']}: {spec['record']} did not produce the shown file")
    source = record.get("source") or {}
    if source.get("kind") != "ledger" or not source.get("output_sha256"):
        raise protocol.Refused(f"{photo} {arm['arm_id']}: {spec['record']} was not rendered from a ledger output "
                               "(--source files cannot be rated in a gate)")
    return {"arm": record.get("arm"), "record": spec["record"], "record_sha256": protocol.sha256_file(record_path),
            "source_output_sha256": source["output_sha256"], "source_config_sha256": source.get("config_sha256")}


def build(spec: dict, validation: bool, access: str | None, config: str | None) -> dict:
    split = spec.get("split")
    if split not in ("tuning", "validation"):
        raise protocol.Refused("spec split must be tuning or validation")
    if (split == "validation") != validation:
        raise protocol.Refused("a validation spec needs --validation --access --config; a tuning spec must not use them")
    ids = [p["id"] for p in spec["photos"]]
    manifest = protocol.load_manifest()
    protocol.require_access(ids, validation=validation, access=access, config=config,
                            manifest=manifest)  # before any image read
    # The id guard checks which photos the spec claims; bind its paths to those claims too, so a
    # slip cannot read a holdout file under a tuning id.
    by_id = {e["id"]: e for e in manifest["entries"]}
    for p in spec["photos"]:
        if os.path.realpath(protocol.resolve(p["original"])) != os.path.realpath(protocol.resolve(by_id[p["id"]]["path"])):
            raise protocol.Refused(f"{p['id']}: original {p['original']} is not this photo's manifest file "
                                   f"{by_id[p['id']]['path']}")
        paths = [p["original"]] + [a["path"] for a in p["arms"] if a.get("status", "ok") == "ok"]
        paths += [a["candidate"]["derived"]["record"] for a in p["arms"]
                  if a.get("candidate", {}).get("derived", {}).get("record")]
        protocol.check_paths(paths, validation=validation, manifest=manifest)
    photos = []
    for p in spec["photos"]:
        arms = {}
        for a in p["arms"]:
            if a["arm_id"] in arms:
                raise protocol.Refused(f"{p['id']}: duplicate arm id {a['arm_id']}")
            entry = {k: v for k, v in a.items() if k != "path"}
            if a.get("status", "ok") == "ok":
                entry.update(describe(a["path"], a.get("candidate", {}).get("output_sha256") or a.get("sha256")))
                if a.get("candidate", {}).get("derived"):
                    entry["candidate"] = {**a["candidate"],
                                          "derived": derived_link(p["id"], a, entry["sha256"])}
            arms[a["arm_id"]] = entry
        for cand, ref in p["pairs"]:
            if cand not in arms or ref not in arms:
                raise protocol.Refused(f"{p['id']}: pair {cand} vs {ref} names an unknown arm")
            if arms[ref].get("kind") not in ("local", "control"):
                raise protocol.Refused(f"{p['id']}: the reference of a gate pair must be real Local or a control")
        photos.append({"id": p["id"], "original": describe(p["original"], None), "arms": arms, "pairs": p["pairs"]})
    out = {"version": 1, "series_id": spec["series_id"], "split": split, "title": spec.get("title", ""),
           "manifest_sha256": protocol.sha256_file(protocol.manifest_path()), "photos": photos}
    if validation:
        release = protocol.read_release(Path(access))
        out["release"] = {k: release[k] for k in ("run_id", "config_sha256", "manifest_sha256")}
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build a compare-arms.html manifest")
    ap.add_argument("spec")
    ap.add_argument("--name", default="arms")
    ap.add_argument("--validation", action="store_true")
    ap.add_argument("--access")
    ap.add_argument("--config")
    args = ap.parse_args(argv)
    try:
        spec = json.loads(protocol.resolve(args.spec).read_text())
        manifest = build(spec, args.validation, args.access, args.config)
    except protocol.Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1
    out = protocol.private_dir() / "viewer" / f"{args.name}.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(manifest, indent=1, ensure_ascii=False)
    out.write_text(f"window.S19_ARMS = {body};\n")
    pairs = sum(len(p["pairs"]) for p in manifest["photos"])
    print(f"{out}: {len(manifest['photos'])} photo(s), {pairs} gate pair(s). Open "
          f"context/changes/cloud-model-comparison/references/compare-arms.html"
          f"{'' if args.name == 'arms' else '?m=' + args.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
