#!/usr/bin/env python3
"""S-20 step 1 pilot rule (`cloud-classical-denoise`, plan Phase 4 item 2 and Phase 8).

  python3 scripts/s20/pilot.py [--trial 1a|1b] --set <pilot set_id> --export <the trial's pilot-ratings.json>
  python3 scripts/s20/pilot.py --trial 1b --audit context/changes/cloud-classical-denoise/evaluations/step1b/audit

`--trial` (default `1a`) selects the row of `trials.py`; the paths below are 1a's.

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

A trial with a STOP report (1b; plan review F22) also writes, on STOP, `pilot-stop.md` (verdict,
counts and the evidence hashes; no identity beyond trusted ids) and a pilot-only audit bundle in
the trial's audit directory (pilot key, manifest and every record it names; no image bytes). A run
of that trial that does not end in STOP removes both first, so they are current or absent (F32).
1a's pilot keeps its behaviour.

`--audit <bundle>` (a trial with a STOP report only; F31): order step 6 first, then the decision
re-derived from the bundle and the committed seal and ratings, without opening an image, compared
with the committed pilot result. `--set` and `--export` are not used.

Exit status: 0 selected (an audit: re-derived SELECTED); 1 STOP (re-derived STOP); 2 usage;
3 BLOCKED (or an audit that does not re-derive).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import blind  # noqa: E402
import common  # noqa: E402
import evidence  # noqa: E402
import protocol  # noqa: E402
import trials  # noqa: E402
from common import Blocked, BlockedMany  # noqa: E402
from trials import TRIALS, Trial  # noqa: E402

T1A = TRIALS["1a"]
CHOICES = ("X", "Y", "Z", "none")
DECIDED = T1A.decided  # embedded in 1a's committed freeze; each trial's text is its row's
STOP_BUNDLE_TITLE = "pilot-only audit bundle (STOP)"


def check_provenance(key: dict, bind: dict, read=None, t: Trial = T1A) -> None:
    """Every raw-render record behind the key: still the bytes the key names, and from the committed
    rules. `read(path, sha)` returns verified bytes; the audits pass their bundle reader."""
    import gate

    read = read or gate.file_reader()
    for item, it in sorted(key["items"].items()):
        for label, src in sorted(it.get("sources", {}).items()):
            if t.record_key not in src:
                continue
            try:
                raw = read(src[t.record_key], src.get(t.record_sha_key))
            except Blocked as b:
                raise Blocked(b.reason, b.detail, item)
            rec = common.strict_json(raw, f"an {t.label} record")
            off = [f for f in t.bind_fields if rec.get(f) != bind[f]]
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


def committed_bind(t: Trial) -> dict:
    try:
        return blind.committed_bind(t)
    except blind.Blocked as e:
        raise Blocked("provenance mismatch", e.detail)


def decided(sealed: dict, export_raw: bytes, bind: dict, photos: list[str]) -> dict:
    """The rule on a sealed set's validated export: shared by the live pilot and the audit."""
    decoded = votes(common.strict_json(export_raw, "the pilot export"), sealed, photos)
    return {**rule(decoded, bind["k"]), "decoded": decoded, "grid_config_sha256": bind["config_sha256"],
            "pilot_set_id": sealed["seal"]["set_id"], "pilot_set_digest": sealed["seal"]["set_digest"],
            "pilot_key_sha256": sealed["seal"]["key_sha256"], "pilot_export_sha256": common.sha_bytes(export_raw)}


def evaluate(root: Path | None = None, t: Trial = T1A) -> dict:
    """Order step 6 plus the rule. Raises Blocked/BlockedMany; returns the decided pilot."""
    root = root or evidence.repo_root()
    common.require_pilot_order(root, t)
    sealed = common.load_set(t.pilot_seal, "pilot", root)
    bind = committed_bind(t)
    check_provenance(sealed["key"], bind, t=t)
    common.file_bindings(sealed, sealed["key"]["items"])
    export_raw = common.read_bytes(root / t.pilot_ratings)
    return {**decided(sealed, export_raw, bind, common.expected_photos()), "sealed": sealed}


def freeze_doc(p: dict, t: Trial = T1A) -> dict:
    return {"k": p["k"], "grid_config_sha256": p["grid_config_sha256"], "pilot_set_digest": p["pilot_set_digest"],
            "pilot_key_sha256": p["pilot_key_sha256"], "pilot_export_sha256": p["pilot_export_sha256"],
            "decided": t.decided}


def require_freeze(root: Path | None = None, t: Trial = T1A) -> tuple[dict, dict]:
    """Order step 8: step 6 still holds; the freeze is write-once, clean and committed after every
    pilot-ratings commit; it is exactly what the current sealed pilot decides. A STOP pilot
    refuses any freeze, so a stale one from an earlier attempt is unusable."""
    root = root or evidence.repo_root()
    pilot = evaluate(root, t)
    if pilot["decision"] == "STOP":
        raise Blocked("pilot stop", "the current sealed pilot is STOP: any freeze is stale")
    common.require_freeze_order(root, t)
    raw = common.read_bytes(root / t.frozen)
    freeze = common.strict_json(raw, "the freeze")
    if freeze != freeze_doc(pilot, t):
        raise Blocked("stale freeze", "the freeze differs from what the current sealed pilot decides")
    return pilot, {"path": t.frozen, "sha256": common.sha_bytes(raw), "k": pilot["k"]}


def result_doc(p: dict, t: Trial = T1A) -> dict:
    """The committed pilot result: written by the live pilot, re-derived by the audit."""
    counts = {blind.k_dir(k): c for k, c in p["counts"].items()}
    return {"verdict": p["decision"], "k": p["k"], "counts": counts, "none": p["none"],
            "choices": {photo: (None if k is None else blind.k_dir(k)) for photo, k in sorted(p["decoded"].items())},
            "pilot_set_digest": p["pilot_set_digest"], "pilot_key_sha256": p["pilot_key_sha256"],
            "pilot_export_sha256": p["pilot_export_sha256"], "grid_config_sha256": p["grid_config_sha256"],
            "rule": t.decided}


# ---------------------------------------------------------------- the STOP report (plan review F22, F32)


def is_stop_bundle(path: Path) -> bool:
    """The audit directory holds a STOP bundle (its README's heading says so), not a gate bundle."""
    try:
        first = (path / "README.md").read_text().split("\n", 1)[0]
    except OSError:
        return False
    return first.startswith("# ") and first.endswith(STOP_BUNDLE_TITLE)


def remove_stop_files(root: Path, t: Trial) -> None:
    """A run that does not end in STOP leaves no STOP report and no STOP bundle behind. A gate
    bundle in the same directory is not a STOP bundle and stays."""
    if t.pilot_stop is None:
        return
    stop = root / t.pilot_stop
    if stop.exists() or stop.is_symlink():
        stop.unlink()
    if is_stop_bundle(root / t.audit_dir):
        shutil.rmtree(root / t.audit_dir)


def write_stop(root: Path, t: Trial, result: dict, sealed: dict) -> None:
    """`pilot-stop.md` and the pilot-only bundle: the STOP as reproducible as a gate verdict."""
    import gate
    import nlm  # md_table: Prettier-stable tables

    out = root / t.audit_dir
    if out.exists():
        shutil.rmtree(out)  # a gate bundle from before this STOP describes a pilot that no longer holds
    (out / "records").mkdir(parents=True)
    read = gate.file_reader()
    (out / "pilot-key.raw").write_bytes(sealed["key_raw"])
    (out / "pilot-manifest.raw").write_bytes(sealed["manifest_raw"])
    for it in sealed["key"]["items"].values():
        for src in it["sources"].values():
            for path_f, sha_f in (("record", "record_sha256"), (t.record_key, t.record_sha_key)):
                if path_f in src:
                    (out / "records" / f"{src[sha_f]}.raw").write_bytes(read(src[path_f], src[sha_f]))
    seal_name = Path(t.pilot_seal).name
    (out / "README.md").write_text(f"""# {t.title} — {STOP_BUNDLE_TITLE}

Written by `scripts/s20/pilot.py{t.flag}` after a STOP. JSON metadata only: no image bytes.

- `pilot-key.raw`: the sealed pilot key, verbatim. Its sha256 equals the `key_sha256` of
  `../{seal_name}`.
- `pilot-manifest.raw`: the viewer manifest, verbatim; `set_digest` recomputes.
- `records/<sha256>.raw`: every decoded, arm and {t.label} record the key names, named by its sha256.

`*.raw` keeps the formatter away from bytes whose hashes are pinned.

**From a checkout alone:** `python3 scripts/s20/pilot.py{t.flag} --audit {t.audit_dir}`
re-derives the STOP from these files and the committed seal and ratings, without opening an image.
""")
    rows = [[k, str(c)] for k, c in result["counts"].items()] + [["none", str(result["none"])]]
    lines = [f"# {t.title} — pilot STOP", "",
             "**Verdict: STOP.** No strength received a vote, so no strength is frozen and no gate set is built.",
             "",
             "Written by `scripts/s20/pilot.py`; re-derive it with "
             f"`pilot.py{t.flag} --audit {t.audit_dir}`.", ""]
    lines += nlm.md_table(["Choice", "Votes"], rows)
    lines += ["", "## Evidence", "",
              f"- Pilot set `{sealed['seal']['set_id']}`, set digest `{result['pilot_set_digest']}`",
              f"- Pilot key sha256 `{result['pilot_key_sha256']}`",
              f"- Pilot export sha256 `{result['pilot_export_sha256']}`",
              f"- Grid config sha256 `{result['grid_config_sha256']}`",
              f"- Rule: {result['rule']}"]
    (root / t.pilot_stop).write_text("\n".join(lines) + "\n")


def write_if_changed(path: Path, doc: dict) -> None:
    """Rewrite only when the parsed content differs, so a re-run never undoes the formatter."""
    try:
        if json.loads(common.guarded_path(path).read_text()) == doc:
            return
    except (OSError, ValueError):
        pass
    common.write_json(path, doc)


def run(set_id: str, t: Trial = T1A) -> int:
    root = evidence.repo_root()
    p = evaluate(root, t)
    if p["pilot_set_id"] != set_id:
        raise Blocked("key mismatch", f"--set {set_id} is not the sealed pilot set")
    result = result_doc(p, t)
    counts = result["counts"]
    frozen = root / t.frozen
    frozen_read = common.guarded_path(frozen)
    if p["decision"] == "SELECTED":
        doc = freeze_doc(p, t)
        if frozen_read.exists():
            try:
                same = json.loads(frozen_read.read_text()) == doc
            except ValueError:
                same = False
            if not same:
                raise Blocked("freeze exists", f"{t.frozen} exists with other content")
        remove_stop_files(root, t)
        if not frozen_read.exists():
            common.write_json(frozen, doc)
    write_if_changed(root / t.pilot_result, result)
    if p["decision"] == "STOP":
        if t.pilot_stop is None:
            print("STOP: no strength received a vote. 1a stops (plan Phase 5): record it in change.md; no gate set.")
        else:
            write_stop(root, t, result, p["sealed"])
            print(f"STOP: no strength received a vote. {t.name} stops and step 1 closes as FAIL: record it in "
                  f"change.md; no gate set.\n  wrote {t.pilot_result}, {t.pilot_stop} and {t.audit_dir}/; commit them.")
        if frozen_read.exists():
            print(f"  {t.frozen} exists from an earlier attempt and is unusable for this one.")
        return 1
    print(f"SELECTED k {p['k']:.1f}: counts {counts}, none {p['none']}.\n"
          f"  wrote {t.pilot_result} and {t.frozen}; commit both, then build the gate set.")
    return 0


def audit(bundle: Path, t: Trial) -> int:
    """Re-derive the pilot decision from metadata only and compare it with the committed result."""
    root = evidence.repo_root()
    common.require_pilot_order(root, t)
    bundle = common.guarded_path(bundle)

    def raw(name):
        return common.read_bytes(bundle / name)

    def read(_path: str, sha: str) -> bytes:
        data = raw(f"records/{sha}.raw")
        if common.sha_bytes(data) != sha:
            raise Blocked("binding failed", f"records/{sha[:12]}… does not hash to its name")
        return data

    photos = common.expected_photos()
    bind = committed_bind(t)
    seal = common.evidence_order(evidence.read_seal, t.pilot_seal, "pilot", root, reason="seal invalid")
    sealed = common.sealed_from(seal, "pilot", raw("pilot-key.raw"), raw("pilot-manifest.raw"))
    check_provenance(sealed["key"], bind, read, t)
    export_raw = common.read_bytes(root / t.pilot_ratings)
    p = decided(sealed, export_raw, bind, photos)
    report = result_doc(p, t)
    try:
        recorded = json.loads(common.read_bytes(root / t.pilot_result))
    except (OSError, ValueError) as e:
        raise Blocked("missing file", f"{t.pilot_result}: {e}")
    if recorded != report:
        raise Blocked("binding failed", f"the re-derived pilot result differs from {t.pilot_result}")
    print(f"✓ pilot audit re-derives {report['verdict']}: counts {report['counts']}, none {report['none']}; "
          "metadata only, no image opened.")
    return 1 if report["verdict"] == "STOP" else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--set", dest="set_id", type=blind.set_id_arg)
    ap.add_argument("--export")
    ap.add_argument("--audit")
    trials.add_argument(ap)
    args = ap.parse_args(argv)
    t = args.trial
    root = evidence.repo_root()
    if args.audit:
        if t.pilot_stop is None:
            ap.error(f"--audit needs a trial with a STOP report (--trial {t.name} has none)")
        if args.set_id or args.export:
            ap.error("--audit takes no --set or --export")
        return common.boundary("pilot-audit", lambda: audit(Path(args.audit), t), None)
    if not (args.set_id and args.export):
        ap.error("the following arguments are required: --set, --export (or --audit <dir>)")
    export = Path(args.export)
    export = export if export.is_absolute() else Path.cwd() / export
    if export.resolve() != (root / t.pilot_ratings).resolve():
        ap.error(f"--export must be the committed {t.pilot_ratings}")

    def blocked(rows):
        remove_stop_files(root, t)
        common.write_json(root / t.pilot_result, {
            "verdict": "BLOCKED", "reasons": common.blocked_rows(rows),
            "way_out": {r: common.WAY_OUT[r] for r in sorted({r for _, r in rows})}})

    return common.boundary("pilot", lambda: run(args.set_id, t), blocked)


if __name__ == "__main__":
    sys.exit(main())
