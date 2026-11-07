#!/usr/bin/env python3
"""S-20 step 1a gate (`cloud-classical-denoise`, plan Phase 4 item 3).

  python3 scripts/s20/gate.py --set <gate set_id> --export context/changes/cloud-classical-denoise/evaluations/gate-ratings.json
  python3 scripts/s20/gate.py --audit context/changes/cloud-classical-denoise/evaluations/step1-audit

Rules in a fixed order (owner decisions 2026-11-03 and 2026-11-05; plan § Definitions):

1. BLOCKED first, on any of: an order or seal violation (pilot seal ≺ pilot ratings ≺ freeze ≺
   gate seal ≺ every gate-ratings commit, each seal and the freeze write-once, every rule file
   clean, the freeze equal to what the current sealed pilot decides); a schema error (a missing
   side, a null or unknown level, a legacy S-19 export, a non-integer or out-of-image crop);
   coverage that is not exactly the 8 tuning photos × {control-full, local}, derived from the
   benchmark manifest alone; a set digest or key hash mismatch; any failed binding (presentation
   pixels against their source, the source against its records, each NLM record against the
   freeze and the committed calibration bind, control-full and nlm-gamma of a photo on the same
   decoded pixels, Auto record file and LUT [F9], Local against `local-baselines.json`); an
   `uncertain` on any side; a significant/severe level without a reason or a valid crop.
2. FAIL: fewer than 6 of 8 wins against control-full (a win is NLM preferred slightly or
   clearly; a tie is not a win; the Local pair never counts), or any photo whose worst NLM-side
   fidelity across both pairs is significant or severe.
3. PASS otherwise.

On PASS or FAIL it writes the decoded `evaluations/step1-gate.json` and `step1-gate.md` and the
audit bundle `evaluations/step1-audit/`: both keys, both manifests and every record they name,
copied verbatim as `*.raw` (records named by their sha256) so the formatter can never change a
pinned byte, plus a README listing the private inventory a full verification needs. On BLOCKED
it writes only the sanitized report (verdict, trusted pair ids, reason classes, way out) and
removes any earlier audit bundle, which would unblind the set while it is being resolved.

`--audit <dir>` re-derives the verdict from the committed seals, exports and freeze and the
bundle's metadata, without opening any image, and compares it with `step1-gate.json`.

Exit status: 0 PASS; 1 FAIL; 2 usage; 3 BLOCKED (or an audit that does not re-derive).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Callable

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import blind  # noqa: E402
import common  # noqa: E402
import evidence  # noqa: E402
import nlm  # noqa: E402  (md_table: Prettier-stable tables)
import pilot as pilot_rule  # noqa: E402
import protocol  # noqa: E402
from common import Blocked, BlockedMany  # noqa: E402

QUALITY = ("A-clear", "A-slight", "tie", "B-slight", "B-clear")
LEVELS = ("none", "minor", "significant", "severe", "uncertain")
SEVERITY = {"none": 0, "minor": 1, "significant": 2, "severe": 3}
NEEDS_EVIDENCE = ("significant", "severe")
REFS = ("control-full", "local")
PHOTOS_REQUIRED, WINS_REQUIRED = 8, 6
HEX = set("0123456789abcdef")

Reader = Callable[[str, str], bytes]  # (recorded path, expected sha256) -> bytes


def is_hex64(v) -> bool:
    return isinstance(v, str) and len(v) == 64 and set(v) <= HEX


# ---------------------------------------------------------------- coverage and schema


def pairs_of(key: dict, photos: list[str], k: float) -> dict:
    """item -> (photo, comparison, nlm side, reference side), checked against the comparisons
    derived independently: exactly the tuning photos × {control-full, local}, each once."""
    expected = {(p, r) for p in photos for r in REFS}
    out, found, seen = {}, [], {}
    for item, it in sorted(key["items"].items()):
        sides = it.get("sides") or {}
        nlm = [s for s, v in sides.items() if v.get("arm") == "nlm-gamma"]
        ref = [s for s, v in sides.items() if v.get("arm") != "nlm-gamma"]
        comp = (it.get("photo"), it.get("comparison"))
        if (sorted(sides) != ["A", "B"] or len(nlm) != 1 or len(ref) != 1
                or sides[ref[0]].get("arm") != it.get("comparison") or sides[nlm[0]].get("k") != k):
            found.append(Blocked("key mismatch", f"{item}: sides {sides}", item))
            continue
        if comp not in expected:
            found.append(Blocked("coverage error", f"{item} maps to an unexpected comparison", item))
            continue
        seen.setdefault(comp, []).append(item)
        out[item] = {"photo": comp[0], "comparison": comp[1], "nlm": nlm[0], "ref": ref[0]}
    for comp, items in seen.items():
        if len(items) > 1:
            found += [Blocked("coverage error", f"{i} and {len(items) - 1} other(s) map to one comparison", i)
                      for i in items]
    if set(seen) != expected:
        found.append(Blocked("coverage error", f"{len(expected - set(seen))} expected comparison(s) have no pair"))
    if found:
        raise BlockedMany(found)
    return out


def valid_crop(c, dims) -> bool:
    ints = lambda v: isinstance(v, int) and not isinstance(v, bool)  # noqa: E731
    return (isinstance(c, dict) and set(c) == {"x", "y", "w", "h"} and all(ints(c[f]) for f in "xywh")
            and c["w"] >= 1 and c["h"] >= 1 and c["x"] >= 0 and c["y"] >= 0
            and c["x"] + c["w"] <= dims[0] and c["y"] + c["h"] <= dims[1])


def ratings_of(export, sealed: dict, pairs: dict) -> dict:
    """item -> {quality, fidelity}, every pair exactly once, the S-20 contract only."""
    seal, key = sealed["seal"], sealed["key"]
    want = {"viewer", "version", "kind", "set_id", "set_digest", "rated_on", "ratings"}
    if not isinstance(export, dict) or set(export) != want:
        raise Blocked("schema error", "not an S-20 gate export (a legacy S-19 export has other fields)")
    if (export["viewer"], export["version"], export["kind"]) != ("compare-s20", 1, "gate"):
        raise Blocked("schema error", "not a compare-s20 version 1 gate export")
    if export["set_id"] != seal["set_id"] or export["set_digest"] != seal["set_digest"]:
        raise Blocked("key mismatch", "the export is for another set or digest than the seal")
    if not isinstance(export["ratings"], list):
        raise Blocked("schema error", "ratings is not a list")
    found, seen, out = [], {}, {}
    for row in export["ratings"]:
        if not isinstance(row, dict) or set(row) != {"pair_id", "quality", "fidelity"}:
            found.append(Blocked("schema error", "a rating row has other fields"))
            continue
        item = row["pair_id"]
        if item not in pairs:
            found.append(Blocked("coverage error", "a row names a pair outside the sealed key"))  # untrusted: not echoed
            continue
        seen[item] = seen.get(item, 0) + 1
        dims = key["items"][item]["sources"]["original"]["dimensions"]
        problems = []
        if row["quality"] not in QUALITY:
            problems.append(("schema error", "quality"))
        fid = row["fidelity"]
        if not isinstance(fid, dict) or set(fid) != {"A", "B"}:
            problems.append(("schema error", "fidelity sides"))
        else:
            for side in ("A", "B"):
                f = fid[side]
                if not isinstance(f, dict) or set(f) != {"level", "crops", "reason"}:
                    problems.append(("schema error", f"fidelity {side} fields"))
                    continue
                if f["level"] not in LEVELS:
                    problems.append(("schema error", f"fidelity {side} level"))
                if not isinstance(f["reason"], str) or not isinstance(f["crops"], list):
                    problems.append(("schema error", f"fidelity {side} reason or crops"))
                    continue
                if not all(valid_crop(c, dims) for c in f["crops"]):
                    problems.append(("schema error", f"fidelity {side} crop"))
                if f["level"] == "uncertain":
                    problems.append(("uncertain", side))
                elif f["level"] in NEEDS_EVIDENCE and (not f["crops"] or not f["reason"].strip()):
                    problems.append(("missing evidence", side))
        found += [Blocked(r, f"{item}: {what}", item) for r, what in problems]
        if not problems:
            out[item] = row
    for item in sorted(pairs):
        if seen.get(item, 0) != 1:
            found.append(Blocked("coverage error", f"{item} rated {seen.get(item, 0)} times", item))
    if found:
        raise BlockedMany(found)
    return out


# ---------------------------------------------------------------- bindings


def record_bindings(key: dict, pairs: dict, read: Reader, freeze_k: float, grid_sha: str, bind: dict,
                    base: dict) -> None:
    """Metadata bindings, shared by the gate and the audit: records against the key and each other."""
    found: list[Blocked] = []
    per_photo: dict[str, dict] = {}
    for item, pr in sorted(pairs.items()):
        src = key["items"][item]["sources"]
        try:
            recs = {}
            for side in ("original", "A", "B"):
                s = src[side]
                if "record" in s:
                    raw = read(s["record"], s["record_sha256"])
                    rec = common.strict_json(raw, "a record")
                    if rec.get("output_sha256") != s["sha256"]:
                        raise Blocked("binding failed", f"{item} {side}: the record names other output", item)
                    recs[side] = rec
            dec = recs.get("original")
            if not dec or dec.get("pixels_sha256") != src["original"]["pixels_sha256"]:
                raise Blocked("binding failed", f"{item}: the original is not its shared decode", item)
            n = src[pr["nlm"]]
            nlm_rec = common.strict_json(read(n["nlm_record"], n["nlm_record_sha256"]), "an NLM record")
            arm = recs.get(pr["nlm"]) or {}
            source = arm.get("source") or {}
            if (source.get("record_sha256") != n["nlm_record_sha256"] or source.get("k") != freeze_k
                    or nlm_rec.get("k") != freeze_k or nlm_rec.get("decoded_pixels_sha256") != dec["pixels_sha256"]):
                raise Blocked("binding failed", f"{item}: the NLM side is not the frozen strength's render", item)
            if nlm_rec.get("config_sha256") != grid_sha:
                raise Blocked("binding failed", f"{item}: the NLM record is not from the frozen grid", item)
            off = [f for f in blind.BIND_FIELDS if nlm_rec.get(f) != bind[f]]
            if off:
                raise Blocked("provenance mismatch", f"{item}: {', '.join(off)}", item)
            photo = per_photo.setdefault(pr["photo"], {"nlm": [], "control": None})
            photo["nlm"].append((item, n["nlm_record_sha256"], arm))
            ref = src[pr["ref"]]
            if pr["comparison"] == "control-full":
                photo["control"] = (item, recs.get(pr["ref"]) or {})
            elif not is_hex64(base.get(pr["photo"])) or ref["sha256"] != base[pr["photo"]]:
                raise Blocked("baseline mismatch", f"{item}: Local is not the expected download", item)
        except Blocked as b:
            found.append(b)
    for photo, d in sorted(per_photo.items()):
        if d["control"] is None or len(d["nlm"]) != 2:
            continue  # coverage already refused this
        item, ctl = d["control"]
        if len({r for _, r, _ in d["nlm"]}) != 1:
            found += [Blocked("binding failed", f"{i}: the two pairs of {photo} show different NLM renders", i)
                      for i, _, _ in d["nlm"]]
        for i, _, arm in d["nlm"]:
            off = [f for f in ("decoded_pixels_sha256", "auto_file_sha256", "lut_sha256") if arm.get(f) != ctl.get(f)]
            if off:
                found.append(Blocked("binding failed", f"{i}: {', '.join(off)} differ from control-full [F9]", i))
    if found:
        raise BlockedMany(found)


def file_reader(item_paths: dict | None = None) -> Reader:
    def read(path: str, sha: str) -> bytes:
        p = Path(path) if Path(path).is_absolute() else common.ROOT / path
        raw = common.read_bytes(p)
        if common.sha_bytes(raw) != sha:
            raise Blocked("binding failed", f"{p} is not the file the key names")
        return raw
    return read


def baselines(root: Path, photos: list[str]) -> dict:
    try:
        doc = common.strict_json(common.read_bytes(root / common.BASELINES), "local-baselines.json")
    except Blocked as b:
        if b.reason == "missing file":
            raise Blocked("baseline mismatch", b.detail)
        raise
    m = doc.get("sha256") if isinstance(doc, dict) else None
    if not isinstance(m, dict) or sorted(m) != sorted(photos) or not all(is_hex64(v) for v in m.values()):
        raise Blocked("baseline mismatch", f"{common.BASELINES} must map exactly the tuning photos to sha256s")
    return m


# ---------------------------------------------------------------- the rule


def decide(sealed: dict, pairs: dict, rows: dict) -> dict:
    photos: dict[str, dict] = {}
    for item, pr in sorted(pairs.items()):
        row = rows[item]
        q = row["quality"]
        quality = "tie" if q == "tie" else (("nlm-" if q[0] == pr["nlm"] else "reference-") + q.split("-")[1])
        f = row["fidelity"]
        d = photos.setdefault(pr["photo"], {})
        d[pr["comparison"]] = {"pair": item, "quality": quality, "nlm_fidelity": f[pr["nlm"]]["level"],
                               "reference_fidelity": f[pr["ref"]]["level"], "nlm_side": pr["nlm"],
                               "nlm_crops": f[pr["nlm"]]["crops"], "nlm_reason": f[pr["nlm"]]["reason"],
                               "reference_crops": f[pr["ref"]]["crops"], "reference_reason": f[pr["ref"]]["reason"]}
    wins, fidelity_fail = 0, []
    for photo, d in sorted(photos.items()):
        worst = max((d[r]["nlm_fidelity"] for r in REFS), key=lambda lv: SEVERITY[lv])
        d["worst_nlm_fidelity"] = worst
        d["win"] = d["control-full"]["quality"] in ("nlm-slight", "nlm-clear")
        wins += d["win"]
        if worst in NEEDS_EVIDENCE:
            fidelity_fail.append(photo)
    reasons = []
    if wins < WINS_REQUIRED:
        reasons.append(f"{wins} of {len(photos)} wins against control-full, {WINS_REQUIRED} required")
    if fidelity_fail:
        reasons.append(f"significant or severe NLM fidelity loss on {', '.join(fidelity_fail)}")
    return {"verdict": "FAIL" if reasons else "PASS", "wins": wins, "wins_required": WINS_REQUIRED,
            "photos_required": PHOTOS_REQUIRED, "reasons": reasons, "photos": photos}


def evaluate(root: Path, set_id: str) -> tuple[dict, dict]:
    """Every BLOCKED check in order, then the rule. Returns (report, context for the bundle)."""
    pilot, freeze = pilot_rule.require_freeze(root)  # rule files, steps 6 and 8
    common.require_gate_order(root)
    sealed = common.load_set(common.GATE_SEAL, "gate", root)
    if sealed["seal"]["set_id"] != set_id:
        raise Blocked("key mismatch", f"--set {set_id} is not the sealed gate set")
    if sealed["key"].get("freeze") != freeze:
        raise Blocked("stale freeze", "the gate set was built from another freeze")
    photos = common.expected_photos()
    if len(photos) != PHOTOS_REQUIRED:
        raise Blocked("coverage error", f"{len(photos)} tuning photos, the gate needs {PHOTOS_REQUIRED}")
    pilot_sealed = common.load_set(common.PILOT_SEAL, "pilot", root)
    try:
        bind = blind.committed_bind()
    except blind.Blocked as e:
        raise Blocked("provenance mismatch", e.detail)
    pairs = pairs_of(sealed["key"], photos, freeze["k"])
    base = baselines(root, photos)
    export_raw = common.read_bytes(root / common.GATE_RATINGS)
    found: list[Blocked] = []
    rows = {}
    for check in (lambda: rows.update(ratings_of(common.strict_json(export_raw, "the gate export"), sealed, pairs)),
                  lambda: record_bindings(sealed["key"], pairs, file_reader(), freeze["k"], pilot["grid_config_sha256"],
                                          bind, base),
                  lambda: common.file_bindings(sealed, pairs)):
        try:
            check()
        except BlockedMany as e:
            found += e.found
        except Blocked as b:
            found.append(b)
    if found:
        raise BlockedMany(found)
    report = decide(sealed, pairs, rows)
    report.update(evidence_hashes(sealed, pilot_sealed, freeze, export_raw, pilot))
    return report, {"gate": sealed, "pilot": pilot_sealed}


def evidence_hashes(sealed, pilot_sealed, freeze, export_raw, pilot) -> dict:
    return {"gate_set_id": sealed["seal"]["set_id"], "gate_set_digest": sealed["seal"]["set_digest"],
            "gate_key_sha256": sealed["seal"]["key_sha256"], "gate_export_sha256": common.sha_bytes(export_raw),
            "freeze_sha256": freeze["sha256"], "k": freeze["k"], "pilot_set_digest": pilot["pilot_set_digest"],
            "pilot_key_sha256": pilot["pilot_key_sha256"], "pilot_export_sha256": pilot["pilot_export_sha256"],
            "grid_config_sha256": pilot["grid_config_sha256"]}


# ---------------------------------------------------------------- outputs


def write_reports(root: Path, report: dict) -> None:
    pilot_rule.write_if_changed(root / common.GATE_JSON, report)
    lines = [
        "# S-20 step 1a — gate verdict",
        "",
        f"**Verdict: {report['verdict']}.** Wins against `control-full`: {report['wins']} of "
        f"{report['photos_required']} ({report['wins_required']} required). Frozen `k` = {report['k']:.1f}.",
        "",
    ]
    lines += [f"- {r}" for r in report["reasons"]] + ([""] if report["reasons"] else [])
    lines += [
        "Written by `scripts/s20/gate.py`; re-derive it with `gate.py --audit "
        f"{common.AUDIT_DIR}`. Quality is NLM's side: `nlm-*` means NLM preferred; the Local pair is",
        "diagnostic. Fidelity is judged against the original; the worst NLM side across both pairs counts.",
        "",
    ]
    lines += nlm.md_table(
        ["Photo", "vs control", "vs Local", "NLM fidelity (control / Local)", "Worst",
         "Reference fidelity (control / Local)"],
        [[photo, d["control-full"]["quality"], d["local"]["quality"],
          f"{d['control-full']['nlm_fidelity']} / {d['local']['nlm_fidelity']}", d["worst_nlm_fidelity"],
          f"{d['control-full']['reference_fidelity']} / {d['local']['reference_fidelity']}"]
         for photo, d in sorted(report["photos"].items())])
    ev = [(photo, comp, who, d[comp][f"{who}_crops"], d[comp][f"{who}_reason"])
          for photo, d in sorted(report["photos"].items()) for comp in REFS for who in ("nlm", "reference")
          if d[comp][f"{who}_crops"] or d[comp][f"{who}_reason"].strip()]
    if ev:
        lines += ["", "## Crops and reasons", "", "Source pixels, half-open `[x, x+w) × [y, y+h)`.", ""]
        for photo, comp, who, crops, reason in ev:
            cs = "; ".join(f"x {c['x']}, y {c['y']}, {c['w']}×{c['h']}" for c in crops) or "no crop"
            lines.append(f"- {photo}, {who} side vs {comp}: {cs} — {reason.strip() or 'no reason'}")
    (root / common.GATE_MD).write_text("\n".join(lines) + "\n")


def write_bundle(root: Path, ctx: dict) -> None:
    out = root / common.AUDIT_DIR
    if out.exists():
        shutil.rmtree(out)
    (out / "records").mkdir(parents=True)
    read = file_reader()
    for kind in ("pilot", "gate"):
        s = ctx[kind]
        (out / f"{kind}-key.raw").write_bytes(s["key_raw"])
        (out / f"{kind}-manifest.raw").write_bytes(s["manifest_raw"])
        for it in s["key"]["items"].values():
            for src in it["sources"].values():
                for path_f, sha_f in (("record", "record_sha256"), ("nlm_record", "nlm_record_sha256")):
                    if path_f in src:
                        (out / "records" / f"{src[sha_f]}.raw").write_bytes(read(src[path_f], src[sha_f]))
    (out / "README.md").write_text("""# S-20 step 1a — audit bundle

Written by `scripts/s20/gate.py` after a terminal verdict. JSON metadata only: no image bytes.

- `pilot-key.raw`, `gate-key.raw`: the sealed keys, verbatim. Their sha256 equals the `key_sha256`
  of `../pilot-sealed.md` and `../gate-sealed.md`.
- `pilot-manifest.raw`, `gate-manifest.raw`: the viewer manifests, verbatim; `set_digest` recomputes.
- `records/<sha256>.raw`: every decoded, arm and NLM record either key names, named by its sha256.

`*.raw` keeps the formatter away from bytes whose hashes are pinned.

**From a checkout alone:** `python3 scripts/s20/gate.py --audit context/changes/cloud-classical-denoise/evaluations/step1-audit`
re-derives the verdict from these files, the committed seals, exports, freeze and
`scripts/s20/configs/local-baselines.json`, without opening an image.

**Full verification** also re-hashes and re-decodes the presentation and source images. It needs
the private workspace: `test-photos/private/s19/inputs/`, `test-photos/private/s19/local/`,
`test-photos/private/s19/arms/{control-full,nlm-gamma}/`, and `test-photos/private/s20/` (`decoded/`,
`nlm/`, and the two set folders named in the seals). Then run `gate.py --set <gate set_id> --export
context/changes/cloud-classical-denoise/evaluations/gate-ratings.json`.
""")


def write_blocked(root: Path, rows) -> None:
    """The sanitized report: verdict, trusted pair ids, reason classes, way out. Nothing decoded."""
    if (root / common.AUDIT_DIR).exists():
        shutil.rmtree(root / common.AUDIT_DIR)  # an earlier bundle would unblind the set while it is resolved
    ways = {r: common.WAY_OUT[r] for r in sorted({r for _, r in rows})}
    common.write_json(root / common.GATE_JSON, {"verdict": "BLOCKED", "reasons": common.blocked_rows(rows),
                                                "way_out": ways})
    lines = ["# S-20 step 1a — gate verdict", "", "**Verdict: BLOCKED.** Nothing is decided until every item below",
             "is resolved; the set stays blind.", ""]
    lines += nlm.md_table(["Item", "Reason"], [[item or "set", reason] for item, reason in rows])
    lines += ["", "## Way out", ""] + [f"- **{r}:** {w}." for r, w in ways.items()]
    (root / common.GATE_MD).write_text("\n".join(lines) + "\n")


# ---------------------------------------------------------------- audit


def audit(bundle: Path) -> int:
    """Re-derive the verdict from metadata only and compare it with the committed report."""
    root = evidence.repo_root()
    common.require_pilot_order(root)
    common.require_freeze_order(root)
    common.require_gate_order(root)
    bundle = common.guarded_path(bundle)

    def raw(name):
        return common.read_bytes(bundle / name)

    def read(_path: str, sha: str) -> bytes:
        data = raw(f"records/{sha}.raw")
        if common.sha_bytes(data) != sha:
            raise Blocked("binding failed", f"records/{sha[:12]}… does not hash to its name")
        return data

    photos = common.expected_photos()
    try:
        bind = blind.committed_bind()
    except blind.Blocked as e:
        raise Blocked("provenance mismatch", e.detail)
    sealed = {}
    for kind, seal_rel in (("pilot", common.PILOT_SEAL), ("gate", common.GATE_SEAL)):
        seal = common.evidence_order(evidence.read_seal, seal_rel, kind, root, reason="seal invalid")
        sealed[kind] = common.sealed_from(seal, kind, raw(f"{kind}-key.raw"), raw(f"{kind}-manifest.raw"))
    pilot_raw = common.read_bytes(root / common.PILOT_RATINGS)
    pilot_rule.check_provenance(sealed["pilot"]["key"], bind, read)
    decoded = pilot_rule.votes(common.strict_json(pilot_raw, "the pilot export"), sealed["pilot"], photos)
    p = {**pilot_rule.rule(decoded, bind["k"]), "grid_config_sha256": bind["config_sha256"],
         "pilot_set_digest": sealed["pilot"]["seal"]["set_digest"], "pilot_key_sha256": sealed["pilot"]["seal"]["key_sha256"],
         "pilot_export_sha256": common.sha_bytes(pilot_raw)}
    if p["decision"] != "SELECTED":
        raise Blocked("pilot stop", "the committed pilot is STOP")
    freeze_raw = common.read_bytes(root / common.FROZEN)
    if common.strict_json(freeze_raw, "the freeze") != pilot_rule.freeze_doc(p):
        raise Blocked("stale freeze", "the committed freeze is not what the committed pilot decides")
    freeze = {"path": common.FROZEN, "sha256": common.sha_bytes(freeze_raw), "k": p["k"]}
    if sealed["gate"]["key"].get("freeze") != freeze:
        raise Blocked("stale freeze", "the gate key names another freeze")
    pairs = pairs_of(sealed["gate"]["key"], photos, p["k"])
    gate_raw = common.read_bytes(root / common.GATE_RATINGS)
    rows = ratings_of(common.strict_json(gate_raw, "the gate export"), sealed["gate"], pairs)
    record_bindings(sealed["gate"]["key"], pairs, read, p["k"], p["grid_config_sha256"], bind,
                    baselines(root, photos))
    report = decide(sealed["gate"], pairs, rows)
    report.update(evidence_hashes(sealed["gate"], sealed["pilot"], freeze, gate_raw, p))
    try:
        recorded = json.loads(common.read_bytes(root / common.GATE_JSON))
    except (OSError, ValueError) as e:
        raise Blocked("missing file", f"{common.GATE_JSON}: {e}")
    if recorded != report:
        raise Blocked("binding failed", f"the re-derived report differs from {common.GATE_JSON}")
    print(f"✓ audit re-derives {report['verdict']}: {report['wins']} of {report['photos_required']} wins, "
          f"k {report['k']:.1f}; metadata only, no image opened.")
    return 0 if report["verdict"] == "PASS" else 1


# ---------------------------------------------------------------- CLI


def run(set_id: str) -> int:
    root = evidence.repo_root()
    report, ctx = evaluate(root, set_id)
    write_reports(root, report)
    write_bundle(root, ctx)
    print(f"{report['verdict']}: {report['wins']} of {report['photos_required']} wins against control-full "
          f"({report['wins_required']} required)" + (f"; {'; '.join(report['reasons'])}" if report["reasons"] else "")
          + f".\n  wrote {common.GATE_JSON}, {common.GATE_MD} and {common.AUDIT_DIR}/; commit them.")
    return 0 if report["verdict"] == "PASS" else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--set", dest="set_id", type=blind.set_id_arg)
    ap.add_argument("--export")
    ap.add_argument("--audit")
    args = ap.parse_args(argv)
    root = evidence.repo_root()
    if args.audit:
        if args.set_id or args.export:
            ap.error("--audit takes no --set or --export")
        return common.boundary("gate-audit", lambda: audit(Path(args.audit)), lambda rows: None)
    if not (args.set_id and args.export):
        ap.error("--set and --export are required (or --audit <dir>)")
    export = Path(args.export)
    export = export if export.is_absolute() else Path.cwd() / export
    if export.resolve() != (root / common.GATE_RATINGS).resolve():
        ap.error(f"--export must be the committed {common.GATE_RATINGS}")
    return common.boundary("gate", lambda: run(args.set_id), lambda rows: write_blocked(root, rows))


if __name__ == "__main__":
    sys.exit(main())
