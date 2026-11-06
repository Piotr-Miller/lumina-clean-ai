#!/usr/bin/env python3
"""S-20 step 1a pilot rule (`cloud-classical-denoise`, plan Phase 4 item 2).

  python3 scripts/s20/pilot.py --set <pilot set_id> --export context/changes/cloud-classical-denoise/evaluations/pilot-ratings.json

Requires order step 6: every rule file committed and clean; the pilot seal write-once, committed in
a strict ancestor of every commit of the ratings; the ratings committed and clean. It then reads
the sealed set (key hash and manifest digest against the seal), re-checks the provenance of every
NLM record behind the key against the calibration bind committed at this checkout's HEAD (impl
review phase 2, F1), validates the export and applies the vote rule (plan § Definitions, "Pilot
vote"; owner decision 2026-11-05 item 5):

  - each photo casts one blind choice: one of three strengths, or `none` (no strength);
  - the strength with the most votes wins; a tie between leaders goes to the weaker `k`;
  - if no strength receives a vote, the pilot is STOP.

Duplicates, missing photos and invalid labels are BLOCKED, never deduplicated or read as `none`.

Writes `evaluations/pilot-result.json`; on a selection also `scripts/s20/configs/nlm-frozen.json`
`{k, grid_config_sha256, pilot_set_digest, pilot_key_sha256, pilot_export_sha256, decided}`. A
freeze is write-once: an existing one with other content is refused. A BLOCKED run writes only the
sanitized result (verdict, trusted item ids, reason classes, way out) and no freeze.

Exit status: 0 selected; 1 STOP; 2 usage; 3 BLOCKED.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import blind  # noqa: E402
import common  # noqa: E402
import evidence  # noqa: E402
import protocol  # noqa: E402
from common import Blocked, BlockedMany  # noqa: E402

CHOICES = ("X", "Y", "Z", "none")
DECIDED = ("pilot.py: plan § Definitions 'Pilot vote' (owner decision 2026-11-05, change.md § Owner decisions "
           "(2026-11-05) item 5): most votes wins, a tie goes to the weaker k, 'none' counts for no strength")


def check_provenance(key: dict, bind: dict, read=None) -> None:
    """Every NLM record behind the key: still the bytes the key names, and from the committed rules.
    `read(path, sha)` returns verified bytes; the gate's audit passes its bundle reader."""
    import gate

    read = read or gate.file_reader()
    for item, it in sorted(key["items"].items()):
        for label, src in sorted(it.get("sources", {}).items()):
            if "nlm_record" not in src:
                continue
            try:
                raw = read(src["nlm_record"], src.get("nlm_record_sha256"))
            except Blocked as b:
                raise Blocked(b.reason, b.detail, item)
            rec = common.strict_json(raw, "an NLM record")
            off = [f for f in blind.BIND_FIELDS if rec.get(f) != bind[f]]
            if off:
                raise Blocked("provenance mismatch", f"{item}: {', '.join(off)} differ from the committed bind", item)


def votes(export: dict, sealed: dict, photos: list[str]) -> dict:
    """Validate the pilot export against the sealed set and the independently derived photos."""
    seal, key = sealed["seal"], sealed["key"]
    want = {"viewer", "version", "kind", "set_id", "set_digest", "rated_on", "choices"}
    if not isinstance(export, dict) or set(export) != want:
        raise Blocked("schema error", f"export fields {sorted(export) if isinstance(export, dict) else export!r}")
    if (export["viewer"], export["version"], export["kind"]) != ("compare-s20", 1, "pilot"):
        raise Blocked("schema error", "not a compare-s20 version 1 pilot export")
    if export["set_id"] != seal["set_id"] or export["set_digest"] != seal["set_digest"]:
        raise Blocked("key mismatch", "the export is for another set or digest than the seal")
    key_photos = sorted(it["photo"] for it in key["items"].values())
    if key_photos != sorted(photos) or len(set(key_photos)) != len(key_photos):
        raise Blocked("coverage error", "the sealed key does not cover each tuning photo exactly once")
    rows = export["choices"]
    if not isinstance(rows, list):
        raise Blocked("schema error", "choices is not a list")
    found: list[Blocked] = []
    seen: dict[str, int] = {}
    chosen: dict[str, str] = {}
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"item_id", "photo", "choice"}:
            found.append(Blocked("schema error", f"choice row {row!r}"))
            continue
        item = row["item_id"]
        if item not in key["items"]:
            found.append(Blocked("coverage error", "a row names an item outside the sealed key"))  # untrusted id: not echoed
            continue
        seen[item] = seen.get(item, 0) + 1
        if row["photo"] != key["items"][item]["photo"]:
            found.append(Blocked("schema error", f"{item}: photo {row['photo']!r} is not the item's", item))
        elif row["choice"] not in CHOICES:
            found.append(Blocked("schema error", f"{item}: choice {row['choice']!r}", item))
        else:
            chosen[item] = row["choice"]
    for item in sorted(key["items"]):
        if seen.get(item, 0) > 1:
            found.append(Blocked("coverage error", f"{item} appears {seen[item]} times", item))
        elif seen.get(item, 0) == 0:
            found.append(Blocked("coverage error", f"{item} is missing", item))
    if found:
        raise BlockedMany(found)
    decoded = {}
    for item, choice in sorted(chosen.items()):
        it = key["items"][item]
        decoded[it["photo"]] = None if choice == "none" else float(it["labels"][choice]["k"])
    return decoded


def rule(decoded: dict, ks: list[float]) -> dict:
    """The vote rule on decoded choices {photo: k or None}."""
    counts = {k: sum(1 for v in decoded.values() if v == k) for k in ks}
    none = sum(1 for v in decoded.values() if v is None)
    top = max(counts.values()) if counts else 0
    if top == 0:
        return {"decision": "STOP", "k": None, "counts": counts, "none": none}
    return {"decision": "SELECTED", "k": min(k for k, c in counts.items() if c == top), "counts": counts, "none": none}


def evaluate(root: Path | None = None) -> dict:
    """Order step 6 plus the rule. Raises Blocked/BlockedMany; returns the decided pilot."""
    root = root or evidence.repo_root()
    common.evidence_order(evidence.require_committed_clean, evidence.rule_files(root), root, purpose="the pilot rule")
    common.evidence_order(evidence.require_write_once, common.PILOT_SEAL, root)
    common.evidence_order(evidence.require_committed_clean, [common.PILOT_RATINGS], root, purpose="the pilot rule")
    common.evidence_order(evidence.require_strictly_before, common.PILOT_SEAL, common.PILOT_RATINGS, root)
    sealed = common.load_set(common.PILOT_SEAL, "pilot", root)
    try:
        bind = blind.committed_bind()
    except blind.Blocked as e:
        raise Blocked("provenance mismatch", e.detail)
    check_provenance(sealed["key"], bind)
    export_raw = (root / common.PILOT_RATINGS).read_bytes()
    decoded = votes(common.strict_json(export_raw, "the pilot export"), sealed, common.expected_photos())
    result = rule(decoded, bind["k"])
    return {**result, "decoded": decoded, "grid_config_sha256": bind["config_sha256"],
            "pilot_set_id": sealed["seal"]["set_id"], "pilot_set_digest": sealed["seal"]["set_digest"],
            "pilot_key_sha256": sealed["seal"]["key_sha256"], "pilot_export_sha256": common.sha_bytes(export_raw)}


def freeze_doc(p: dict) -> dict:
    return {"k": p["k"], "grid_config_sha256": p["grid_config_sha256"], "pilot_set_digest": p["pilot_set_digest"],
            "pilot_key_sha256": p["pilot_key_sha256"], "pilot_export_sha256": p["pilot_export_sha256"],
            "decided": DECIDED}


def require_freeze(root: Path | None = None) -> tuple[dict, dict]:
    """Order step 8: step 6 still holds; the freeze is write-once, clean and committed after every
    pilot-ratings commit; it is exactly what the current sealed pilot decides. A STOP pilot
    refuses any freeze, so a stale one from an earlier attempt is unusable."""
    root = root or evidence.repo_root()
    pilot = evaluate(root)
    if pilot["decision"] == "STOP":
        raise Blocked("pilot stop", "the current sealed pilot is STOP: any freeze is stale")
    common.evidence_order(evidence.require_write_once, common.FROZEN, root)
    common.evidence_order(evidence.require_strictly_before, common.PILOT_RATINGS, common.FROZEN, root)
    raw = (root / common.FROZEN).read_bytes()
    freeze = common.strict_json(raw, "the freeze")
    if freeze != freeze_doc(pilot):
        raise Blocked("stale freeze", "the freeze differs from what the current sealed pilot decides")
    return pilot, {"path": common.FROZEN, "sha256": common.sha_bytes(raw), "k": pilot["k"]}


def write_if_changed(path: Path, doc: dict) -> None:
    """Rewrite only when the parsed content differs, so a re-run never undoes the formatter."""
    try:
        if json.loads(path.read_text()) == doc:
            return
    except (OSError, ValueError):
        pass
    common.write_json(path, doc)


def run(set_id: str) -> int:
    root = evidence.repo_root()
    p = evaluate(root)
    if p["pilot_set_id"] != set_id:
        raise Blocked("key mismatch", f"--set {set_id} is not the sealed pilot set")
    counts = {blind.k_dir(k): c for k, c in p["counts"].items()}
    result = {"verdict": p["decision"], "k": p["k"], "counts": counts, "none": p["none"],
              "choices": {photo: (None if k is None else blind.k_dir(k)) for photo, k in sorted(p["decoded"].items())},
              "pilot_set_digest": p["pilot_set_digest"], "pilot_key_sha256": p["pilot_key_sha256"],
              "pilot_export_sha256": p["pilot_export_sha256"], "grid_config_sha256": p["grid_config_sha256"],
              "rule": DECIDED}
    frozen = root / common.FROZEN
    if p["decision"] == "SELECTED":
        doc = freeze_doc(p)
        if frozen.exists():
            try:
                same = json.loads(frozen.read_text()) == doc
            except ValueError:
                same = False
            if not same:
                raise Blocked("freeze exists", f"{common.FROZEN} exists with other content")
        else:
            common.write_json(frozen, doc)
    write_if_changed(root / common.PILOT_RESULT, result)
    if p["decision"] == "STOP":
        print("STOP: no strength received a vote. 1a stops (plan Phase 5): record it in change.md; no gate set.")
        if frozen.exists():
            print(f"  {common.FROZEN} exists from an earlier attempt and is unusable for this one.")
        return 1
    print(f"SELECTED k {p['k']:.1f}: counts {counts}, none {p['none']}.\n"
          f"  wrote {common.PILOT_RESULT} and {common.FROZEN}; commit both, then build the gate set.")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--set", required=True, dest="set_id", type=blind.set_id_arg)
    ap.add_argument("--export", required=True)
    args = ap.parse_args(argv)
    root = evidence.repo_root()
    export = Path(args.export)
    export = export if export.is_absolute() else Path.cwd() / export
    if export.resolve() != (root / common.PILOT_RATINGS).resolve():
        ap.error(f"--export must be the committed {common.PILOT_RATINGS}")

    def blocked(rows):
        common.write_json(root / common.PILOT_RESULT, {
            "verdict": "BLOCKED", "reasons": common.blocked_rows(rows),
            "way_out": {r: common.WAY_OUT[r] for r in sorted({r for _, r in rows})}})

    return common.boundary("pilot", lambda: run(args.set_id), blocked)


if __name__ == "__main__":
    sys.exit(main())
