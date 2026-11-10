"""Shared pieces of the S-20 step 1 rule tools `pilot.py` and `gate.py` (plan Phases 4 and 8).

  - the evidence paths, relative to the repository (`evidence.repo_root()`): the selected trial's
    row of `trials.py` (plan Phase 8); the module names below are the 1a row's, for callers that
    predate the seam;
  - `Blocked`: a refusal with a fixed reason class (safe to print), an optional trusted item id,
    and a detail that goes only to the private log;
  - `boundary`: the one CLI boundary [F7, F12]. It catches everything, never re-raises, prints
    `<item|set>: <reason class>` lines plus one fixed way out per class, writes the tool's
    sanitized BLOCKED report and exits 3;
  - strict JSON (no NaN or Infinity), and loading a sealed set: the key verified against the
    committed seal, the manifest's digest recomputed.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Callable

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "s19"))
sys.path.insert(0, str(HERE))

import evidence  # noqa: E402
import protocol  # noqa: E402
from trials import TRIALS, Trial  # noqa: E402

T1A = TRIALS["1a"]
EVAL = "context/changes/cloud-classical-denoise/evaluations"
PILOT_SEAL, PILOT_RATINGS, PILOT_RESULT = T1A.pilot_seal, T1A.pilot_ratings, T1A.pilot_result
GATE_SEAL, GATE_RATINGS = T1A.gate_seal, T1A.gate_ratings
GATE_JSON, GATE_MD, AUDIT_DIR = T1A.gate_json, T1A.gate_md, T1A.audit_dir
FROZEN = T1A.frozen
BASELINES = "scripts/s20/configs/local-baselines.json"
KEY_NAME = ".key-do-not-open.json"

WAY_OUT = {
    "order violation": "commit the evidence in plan order (rules, seal, ratings, freeze, gate seal, gate ratings); "
                       "a seal or freeze is write-once and never shares a commit with what it precedes",
    "seal invalid": "save the seal file exactly as blind.py printed it, with one S20-SEAL line, and commit it",
    "key mismatch": "the set on disk is not the sealed one; never rebuild a sealed set, start a new set and seal",
    "schema error": "re-export from compare-s20.html for this set; every item needs every answer",
    "coverage error": "re-export the whole set once; every expected item exactly once, nothing else",
    "binding failed": "a rated file no longer matches its records; restore it or start a new set",
    "provenance mismatch": "re-render with the committed nlm.py, grid and OpenCV, then build a new set",
    "baseline mismatch": "the Local download differs from local-baselines.json; restore the expected file",
    "uncertain": "resolve the listed items against the original in the same set, re-export, commit, re-run",
    "missing evidence": "give each significant/severe rating at least one valid crop and a reason, re-export",
    "access refused": "only tuning photos may be read; check the manifest split and links into the holdout",
    "missing file": "restore the named evidence file, or run the step that writes it",
    "stale freeze": "the freeze does not follow from the current sealed pilot; it is unusable for this attempt",
    "pilot stop": "the pilot chose no strength: 1a stops (plan Phase 5); no gate set may be built",
    "freeze exists": "a freeze is write-once; a different result needs a new attempt, never an edit",
    "interrupted": "re-run; nothing was decided",
    "internal error": "read the private log; report it if the cause is not in your inputs",
}


class Blocked(Exception):
    """`reason` is a WAY_OUT class; `item` a trusted anonymous id (from the sealed key) or None."""

    def __init__(self, reason: str, detail: str, item: str | None = None):
        assert reason in WAY_OUT, reason
        super().__init__(detail)
        self.reason, self.detail, self.item = reason, detail, item


class BlockedMany(Exception):
    """Several item-level refusals found in one pass, reported together."""

    def __init__(self, found: list[Blocked]):
        super().__init__("; ".join(b.detail for b in found))
        self.found = found


def private_s20() -> Path:
    return Path(os.environ.get("S20_PRIVATE", ROOT / "test-photos" / "private" / "s20"))


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path) -> str:
    return protocol.sha256_file(path)


def strict_json(raw: bytes | str, what: str):
    def no_constant(name):
        raise ValueError(f"non-finite number {name}")

    try:
        return json.loads(raw, parse_constant=no_constant)
    except ValueError as e:
        raise Blocked("schema error", f"{what} is not strict JSON: {e}")


def evidence_order(fn: Callable, *args, reason: str = "order violation", **kw):
    """Run an evidence.py check; its refusal becomes a Blocked of `reason`."""
    try:
        return fn(*args, **kw)
    except protocol.Refused as e:
        raise Blocked(reason, str(e))


def require_pilot_order(root: Path, t: Trial = T1A) -> None:
    """Metadata-only order step 6, shared by the live pilot and the published audit."""
    evidence_order(evidence.require_committed_clean, evidence.rule_files(root), root, purpose="the pilot rule")
    evidence_order(evidence.require_write_once, t.pilot_seal, root)
    evidence_order(evidence.require_committed_clean, [t.pilot_ratings], root, purpose="the pilot rule")
    evidence_order(evidence.require_strictly_before, t.pilot_seal, t.pilot_ratings, root)


def require_freeze_order(root: Path, t: Trial = T1A) -> None:
    """The freeze is committed once, clean, and later than every pilot-ratings commit."""
    evidence_order(evidence.require_write_once, t.frozen, root)
    evidence_order(evidence.require_strictly_before, t.pilot_ratings, t.frozen, root)


def require_gate_order(root: Path, t: Trial = T1A) -> None:
    """Metadata-only gate-seal and ratings order, shared by the live gate and audit."""
    evidence_order(evidence.require_write_once, t.gate_seal, root)
    evidence_order(evidence.require_strictly_before, t.frozen, t.gate_seal, root)
    evidence_order(evidence.require_committed_clean, [t.gate_ratings, BASELINES], root, purpose="the gate")
    evidence_order(evidence.require_strictly_before, t.gate_seal, t.gate_ratings, root)


def guarded_path(path: Path) -> Path:
    """The evidence helper's path guard, translated to the tools' sanitized refusal class."""
    try:
        return evidence.guarded_path(path)
    except protocol.Refused as e:
        raise Blocked("access refused", str(e))


def read_bytes(path: Path) -> bytes:
    """Guard a concrete resolved metadata path before opening any of its bytes."""
    try:
        return guarded_path(path).read_bytes()
    except OSError as e:
        raise Blocked("missing file", f"{path}: {e}")


def load_set(seal_rel: str, kind: str, root: Path) -> dict:
    """The sealed set on disk: seal line, key and manifest, each path guarded before it is read."""
    seal = evidence_order(evidence.read_seal, seal_rel, kind, root, reason="seal invalid")
    set_dir = private_s20() / seal["set_id"]
    key_path, manifest_path = set_dir / KEY_NAME, set_dir / "manifest.js"
    try:
        protocol.check_paths([set_dir, key_path, manifest_path], validation=False)
    except protocol.Refused as e:
        raise Blocked("access refused", str(e))
    try:
        key_raw = key_path.read_bytes()
        manifest_raw = manifest_path.read_bytes()
    except OSError as e:
        raise Blocked("missing file", f"sealed set {seal['set_id']}: {e}")
    return {**sealed_from(seal, kind, key_raw, manifest_raw), "dir": set_dir}


def sealed_from(seal: dict, kind: str, key_raw: bytes, manifest_raw: bytes) -> dict:
    """Key (its sha256 equal to the seal's) and manifest payload (its digest recomputed and equal to
    the seal's and the key's), from bytes: the same check on disk and in the audit bundle."""
    import blind  # set_digest and the canonical form live with the builder

    if sha_bytes(key_raw) != seal["key_sha256"]:
        raise Blocked("key mismatch", "the key does not hash to the sealed key_sha256")
    key = strict_json(key_raw, "the key")
    text = manifest_raw.decode("utf-8", errors="replace")
    prefix, suffix = "window.S20_SET = ", ";\n"
    if not (text.startswith(prefix) and text.endswith(suffix)):
        raise Blocked("key mismatch", "the manifest is not a blind.py manifest")
    payload = strict_json(text[len(prefix):-len(suffix)], "the manifest")
    if not (isinstance(key, dict) and isinstance(payload, dict)
            and key.get("kind") == kind == payload.get("kind") and key.get("set_id") == seal["set_id"] == payload.get("set_id")
            and key.get("set_digest") == seal["set_digest"] == payload.get("set_digest")
            and blind.set_digest(payload) == seal["set_digest"]):
        raise Blocked("key mismatch", "the key, the manifest and the seal disagree on kind, set_id or set_digest")
    items = key.get("items")
    if not isinstance(items, dict) or sorted(items) != sorted(it.get("id") for it in payload.get("items", [])):
        raise Blocked("key mismatch", "the key and the manifest list different items")
    return {"seal": seal, "key": key, "key_raw": key_raw, "manifest_raw": manifest_raw, "payload": payload}


def expected_photos() -> list[str]:
    """The tuning photos, derived from the benchmark manifest alone: never from a key or an export."""
    manifest = protocol.load_manifest()
    return protocol.select_ids(manifest, [], True, False)


def file_bindings(sealed: dict, items: dict) -> None:
    """Pilot or gate presentation pixels against their source: re-hash and re-decode both files."""
    import blind

    found = []
    for item in sorted(items):
        for side, s in sorted(sealed["key"]["items"][item]["sources"].items()):
            pres = sealed["dir"] / s["presentation"]
            srcp = Path(s["path"]) if Path(s["path"]).is_absolute() else ROOT / s["path"]
            try:
                protocol.check_paths([pres, srcp], validation=False)
                if (sha_file(pres) != s["presentation_sha256"] or sha_file(srcp) != s["sha256"]):
                    raise Blocked("binding failed", f"{item} {side}: a file changed", item)
                for f in (pres, srcp):
                    pixels, dims, _ = blind.decode(f, None)
                    if sha_bytes(pixels) != s["pixels_sha256"] or dims != s["dimensions"]:
                        raise Blocked("binding failed", f"{item} {side}: {f.name} decodes to other pixels", item)
            except protocol.Refused as e:
                found.append(Blocked("access refused", str(e)))
            except OSError as e:
                found.append(Blocked("missing file", f"{item} {side}: {e}", item))
            except blind.Blocked as e:
                found.append(Blocked("binding failed", e.detail, item))
            except Blocked as b:
                found.append(b)
    if found:
        raise BlockedMany(found)


# ---------------------------------------------------------------- the one CLI boundary


def log_detail(tool: str, text: str) -> str | None:
    try:
        logs = private_s20() / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        name = f"{tool}-{_dt.datetime.now(_dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.log"
        (logs / name).write_text(text)
        return f"logs/{name}"
    except Exception:  # noqa: BLE001
        return None


def boundary(tool: str, run: Callable[[], int],
             write_blocked: Callable[[list[tuple[str | None, str]]], None] | None) -> int:
    """Run `run()`; on any exception print sanitized lines, write the sanitized report, exit 3.
    Nothing propagates: no traceback and no chained context reach stdout or stderr. With
    `write_blocked` None the refusal writes nothing and says so."""
    try:
        return run()
    except BaseException as e:  # noqa: BLE001 - the one boundary
        if isinstance(e, BlockedMany):
            found = e.found
        elif isinstance(e, Blocked):
            found = [e]
        elif isinstance(e, protocol.Refused):
            found = [Blocked("access refused", str(e))]
        elif isinstance(e, KeyboardInterrupt):
            found = [Blocked("interrupted", "interrupted")]
        else:
            found = [Blocked("internal error", "".join(traceback.format_exception(e)))]
        rows = sorted({(b.item, b.reason) for b in found}, key=lambda r: (r[0] or "", r[1]))
        log = log_detail(tool, "\n".join(f"{b.item or 'set'}: {b.reason}: {b.detail}" for b in found) + "\n")
        try:
            if write_blocked is None:
                report = "Nothing was written."
            else:
                write_blocked(rows)
                report = "The sanitized report was written."
        except Exception:  # noqa: BLE001
            report = "The sanitized report could not be written."
        for item, reason in rows:
            print(f"{'pair ' + item if item and item.startswith('p') else ('item ' + item if item else 'set')}: {reason}")
        print(f"BLOCKED. {report} Way out:")
        for reason in sorted({r for _, r in rows}):
            print(f"  {reason}: {WAY_OUT[reason]}.")
        print(f"Details in the private S-20 log {log}." if log else "No private log could be written.")
        return 3


def blocked_rows(rows: list[tuple[str | None, str]]) -> list[dict]:
    return [{"item": item, "reason": reason} for item, reason in rows]


def write_json(path: Path, doc) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n")
    os.replace(tmp, path)
