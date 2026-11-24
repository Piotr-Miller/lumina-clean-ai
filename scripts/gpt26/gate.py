#!/usr/bin/env python3
"""GPT26 gate: a study's verdict from the sealed set, the run record and the ratings.

  python3 scripts/gpt26/gate.py --config <config> --set <set_id> --export <study.change_dir>/evaluations/ratings.json
  python3 scripts/gpt26/gate.py --config <config> --set <set_id>   # zero delivered slots: no viewer, no ratings

The config's `study` object (`study.py`) names the change folder, the private root and the slots.

BLOCKED first, on any of (exit 1, nothing written):
  - the dedicated seal `evaluations/gate-sealed.md` not tracked, committed and clean, touched by
    more than one commit, or without exactly one unbulleted, well-formed `GPT26-SEAL` line (a
    GPT26 parser; S-20's `read_seal` is not used for this prefix);
  - the key, manifest and seal disagreeing on set_id or digest, or the key not hashing to the seal;
  - the run record: the frozen ledger/sidecar copies not hashing to the key, the live ledger or
    sidecar differing from them (owner decision 2026-11-20), or `state.reconcile` finding any
    inconsistency or an unresolved slot against the registration and rule identities of THIS
    checkout — never the sidecar's own bindings (impl review phase 2, F2). Identities are file
    blobs only: the commits that carry them may be rewritten by a rebase-merge (lesson "Never
    bind sealed or frozen evidence to a branch commit SHA");
  - the key's pairs not being exactly the reconciled delivered slots, each once, or its passes not
    a valid partition (at most one slot of each scene per pass);
  - any presentation file, GPT output, original or Local download changed, or a resized copy that
    the recorded Lanczos transform no longer reproduces;
  - the ratings: not committed and clean, any commit of them not strictly after the seal's, a
    schema error, a delivered pair rated other than once, an `uncertain` level, or a
    significant/severe level without a crop and a reason; with two sealed passes, a missing or
    different private first-pass checkpoint (owner decision 2026-11-20). With zero delivered slots
    no ratings export is accepted.

Otherwise the config's gate block decides: PASS iff every registered slot is delivered, no GPT
side is significant/severe and at least `gate.min_tie_pairs` pairs are at least a tie (GPT level
≤ Local level). A cost-bound breach or conservative spend above the approved cap
forces FAIL as a budget/protocol failure, kept separate from fidelity. Quality and wall time
are diagnostics. It writes `evaluations/verdict.json` and `evaluations/verdict.md`.

Errors pass through the sanitized boundary of `blind.py`: reason classes, trusted ids and a fixed
way out, never a path, hash or arm name.

Exit status: 0 verdict computed (PASS or FAIL); 1 BLOCKED; 2 usage.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import blind  # noqa: E402
from blind import Blocked, BlockedMany  # noqa: E402

run, state, evidence, protocol, Refused = blind.run, blind.state, blind.evidence, blind.protocol, blind.Refused
study_mod = blind.study_mod
md_table = run.md_table

QUALITY = ("A-clear", "A-slight", "tie", "B-slight", "B-clear")
LEVELS = ("none", "minor", "significant", "severe", "uncertain")
EXPORT_FIELDS = {"viewer", "version", "kind", "set_id", "set_digest", "rated_on", "ratings", "passes", "locked_pass1"}
CHECKPOINT_FIELDS = {"viewer", "version", "kind", "set_id", "set_digest", "locked_on", "passes", "ratings"}
UNRATED = "nieoceniona"

WAY_OUT = {
    **blind.WAY_OUT,
    "order violation": "commit the seal once, before any ratings commit; seal and ratings never share a commit",
    "seal invalid": "save the seal file exactly as blind.py wrote it, with one GPT26-SEAL line, and commit it",
    "key mismatch": "the set on disk is not the sealed one; never rebuild a sealed set",
    "record changed": "the live ledger or run-state differs from the sealed copy; restore it from the frozen copy",
    "coverage error": "re-export the whole set once; every delivered pair exactly once, nothing else",
    "schema error": "re-export from the study's viewer for this set; every pair needs every answer",
    "checkpoint error": "move the first-pass checkpoint the viewer downloaded into the study's private root "
                        "(study.private_root in the config) unchanged; it must match the final export",
    "binding failed": "a rated or source file no longer matches the sealed key; restore it",
    "uncertain": "resolve the listed pairs against the original, re-export, commit, re-run",
    "missing evidence": "give each significant/severe rating at least one valid crop and a reason, re-export",
    "missing file": "restore the named evidence file, or run the step that writes it",
}


def checkpoint_path(paths: run.Paths, set_id: str) -> Path:
    return paths.private / f"{set_id}-pass1-checkpoint.json"


def strict_json(raw: bytes, what: str, reason: str = "schema error"):
    def no_constant(name):
        raise ValueError(f"non-finite number {name}")

    try:
        return json.loads(raw.decode("utf-8"), parse_constant=no_constant)
    except (UnicodeDecodeError, ValueError) as e:
        raise Blocked(reason, f"{what} is not strict JSON: {e}")


def read(path: Path, what: str, reason: str = "missing file") -> bytes:
    try:
        return path.read_bytes()
    except OSError as e:
        raise Blocked(reason, f"{what}: {e}")


def order(fn, *args, reason: str = "order violation", **kw):
    try:
        return fn(*args, **kw)
    except Refused as e:
        raise Blocked(reason, str(e))


# ---------------------------------------------------------------- seal and set


def read_seal(root: Path, seal_rel: str) -> dict:
    """The seal's one unbulleted, well-formed GPT26-SEAL line."""
    try:
        lines = (root / seal_rel).read_text().splitlines()
    except OSError as e:
        raise Blocked("seal invalid", f"cannot read {seal_rel}: {e}")
    tagged = [ln for ln in lines if "GPT26-SEAL" in ln]
    if len(tagged) != 1:
        raise Blocked("seal invalid", f"{seal_rel} holds {len(tagged)} GPT26-SEAL lines, expected exactly one")
    m = blind.SEAL.fullmatch(tagged[0])
    if not m:
        raise Blocked("seal invalid", f"{seal_rel}: the GPT26-SEAL line is bulleted, indented or malformed")
    return {"set_id": m.group(1), "set_digest": m.group(2), "key_sha256": m.group(3)}


def load_set(paths: run.Paths, seal: dict) -> dict:
    set_dir = paths.private / seal["set_id"]
    key_raw = read(set_dir / blind.KEY_NAME, f"sealed set {seal['set_id']} key")
    manifest_raw = read(set_dir / blind.MANIFEST, f"sealed set {seal['set_id']} manifest")
    if blind.sha_bytes(key_raw) != seal["key_sha256"]:
        raise Blocked("key mismatch", "the key does not hash to the sealed key_sha256")
    key = strict_json(key_raw, "the key", "key mismatch")
    text = manifest_raw.decode("utf-8", errors="replace")
    if not (text.startswith(blind.MANIFEST_PREFIX) and text.endswith(blind.MANIFEST_SUFFIX)):
        raise Blocked("key mismatch", "the manifest is not a blind.py manifest")
    payload = strict_json(text[len(blind.MANIFEST_PREFIX):-len(blind.MANIFEST_SUFFIX)].encode(), "the manifest",
                          "key mismatch")
    if not (isinstance(key, dict) and isinstance(payload, dict)
            and key.get("kind") == "gate" == payload.get("kind")
            and key.get("set_id") == seal["set_id"] == payload.get("set_id")
            and key.get("set_digest") == seal["set_digest"] == payload.get("set_digest")
            and blind.set_digest(payload) == seal["set_digest"]):
        raise Blocked("key mismatch", "the key, the manifest and the seal disagree on kind, set_id or set_digest")
    items = key.get("items")
    ids = [it.get("id") for it in payload.get("items", []) if isinstance(it, dict)]
    if not isinstance(items, dict) or sorted(items) != sorted(ids) or len(set(ids)) != len(ids):
        raise Blocked("key mismatch", "the key and the manifest list different items")
    if payload.get("passes") != key.get("passes"):
        raise Blocked("key mismatch", "the key and the manifest disagree on the passes")
    return {"dir": set_dir, "key": key, "payload": payload}


# ---------------------------------------------------------------- run record


def run_record(paths: run.Paths, study: study_mod.Study, key: dict) -> tuple[dict, str, dict, state.RunState]:
    snap = key.get("run_snapshot") or {}
    frozen = {}
    for part, live in (("ledger", paths.private / "attempts.jsonl"), ("sidecar", paths.sidecar)):
        entry = snap.get(part) or {}
        if entry.get("name") not in (blind.LEDGER_COPY, blind.SIDECAR_COPY):
            raise Blocked("key mismatch", f"the key names no frozen {part} copy")
        raw = read(paths.private / key["set_id"] / entry["name"], f"frozen {part} copy")
        if blind.sha_bytes(raw) != entry.get("sha256"):
            raise Blocked("key mismatch", f"the frozen {part} copy does not hash to the key")
        live_raw = read(live, f"live {part}", "record changed")
        if live_raw != raw:
            raise Blocked("record changed", f"the live {part} differs from the copy frozen at the seal")
        frozen[part] = raw
    config, config_sha, series, st, bindings = blind.reconciled(paths, study, frozen["ledger"], frozen["sidecar"])
    if key.get("config_sha256") != config_sha or key.get("series_id") != series["series_id"]:
        raise Blocked("key mismatch", "the key was built for another config or series")
    # Blob identities only; the key's head and registration commit are provenance (lesson 279).
    if (key.get("bindings") or {}).get("files") != bindings["files"]:
        raise Blocked("rules changed", "the rule identities differ from those the set was built with")
    return config, config_sha, series, st


def pairs_of(key: dict, st: state.RunState) -> dict:
    """item -> slot, an exact duplicate-free mapping onto the reconciled delivered slots."""
    delivered = {(s.photo, s.slot): s for s in st.slots.values() if s.status == "delivered"}
    found, seen, out = [], {}, {}
    for item, it in sorted(key["items"].items()):
        k = (it.get("photo"), it.get("slot"))
        sides = {it.get("gpt_side"), it.get("local_side")}
        if sides != {"A", "B"}:
            found.append(Blocked("key mismatch", f"{item}: sides {sides}", item))
            continue
        if k not in delivered:
            found.append(Blocked("coverage error", f"{item} maps to a slot that is not delivered", item))
            continue
        seen.setdefault(k, []).append(item)
        if it.get("attempt_id") != delivered[k].output.get("attempt_id"):
            found.append(Blocked("binding failed", f"{item} names another attempt than the delivered one", item))
        out[item] = delivered[k]
    for k, items in seen.items():
        if len(items) > 1:
            found += [Blocked("coverage error", f"{i}: {len(items)} pairs map to one slot", i) for i in items]
    missing = set(delivered) - set(seen)
    if missing:
        found.append(Blocked("coverage error", f"{len(missing)} delivered slot(s) have no pair"))
    recorded = {(s.get("photo"), s.get("slot")): s for s in key.get("slots", []) if isinstance(s, dict)}
    if sorted(recorded) != sorted(st.slots) or any(recorded[k].get("status") != st.slots[k].status
                                                   for k in st.slots):
        found.append(Blocked("key mismatch", "the key's slot list differs from the reconciled record"))
    passes = key.get("passes")
    flat = [i for p in passes for i in p] if isinstance(passes, list) and all(isinstance(p, list) for p in passes) \
        else None
    if flat is None or sorted(flat) != sorted(key["items"]) or len(set(flat)) != len(flat) or len(passes) > 2 \
            or any(not p for p in passes):
        found.append(Blocked("key mismatch", "the sealed passes are not a partition of the pairs"))
    else:
        for p in passes:
            scenes = [key["items"][i]["photo"] for i in p]
            if len(set(scenes)) != len(scenes):
                found.append(Blocked("key mismatch", "a sealed pass holds two slots of one scene"))
    if found:
        raise BlockedMany(found)
    return out


def file_bindings(paths: run.Paths, sealed: dict, pairs: dict, series: dict) -> None:
    """Re-hash and re-decode every presentation file and source; recompute each resized copy."""
    root, key = paths.root, sealed["key"]
    specs = {(s["photo"], s["slot"]): s for s in series["slots"]}
    baselines = None
    found = []
    for item, slot in sorted(pairs.items()):
        it = key["items"][item]
        size = list(slot.request_size)
        try:
            lengths = {}
            for face in ("original", "A", "B"):
                e = it["sources"][face]
                pres = sealed["dir"] / e["presentation"]
                data = read(pres, f"{item} {face} presentation")
                lengths[face] = len(data)
                if blind.sha_bytes(data) != e["presentation_sha256"]:
                    raise Blocked("binding failed", f"{item} {face}: the presentation file changed", item)
                pixels, dims, icc = blind.decode(pres, item)
                if dims != size or icc is not None or blind.sha_bytes(pixels) != e["pixels_sha256"]:
                    raise Blocked("binding failed", f"{item} {face}: the presentation decodes to other pixels", item)
                if set(blind.png_chunks(data)) - set(blind.PNG_CHUNKS):
                    raise Blocked("binding failed", f"{item} {face}: the presentation carries extra chunks", item)
                src = blind.resolve(root, e["path"])
                try:
                    protocol.check_paths([src], validation=False)
                except Refused as err:
                    raise Blocked("access refused", str(err), item)
                if blind.file_sha(src, item) != e["sha256"]:
                    raise Blocked("binding failed", f"{item} {face}: the source file changed", item)
                role = e["role"]
                expect_role = "original" if face == "original" else ("gpt" if face == it["gpt_side"] else "local")
                if role != expect_role:
                    raise Blocked("key mismatch", f"{item} {face}: role {role}, the key's sides say {expect_role}", item)
                if role == "gpt":
                    if e["sha256"] != slot.output.get("output_sha256") or \
                            blind.resolve(root, slot.output.get("output_path", "")).resolve() != src.resolve():
                        raise Blocked("binding failed", f"{item}: the GPT side is not the delivered output", item)
                    spixels, sdims, _ = blind.decode(src, item)
                    if sdims != size or spixels != pixels or e.get("transform") is not None:
                        raise Blocked("binding failed", f"{item}: the GPT side is not the output's pixels", item)
                    continue
                if role == "original" and e["sha256"] != specs[(slot.photo, slot.slot)]["input_sha256"]:
                    raise Blocked("binding failed", f"{item}: the original is not the series input", item)
                if role == "local":
                    baselines = baselines or blind.load_baselines(root, sorted({s.photo for s in pairs.values()}))
                    if e["sha256"] != baselines[slot.photo]:
                        raise Blocked("baseline mismatch", f"{item}: Local is not the pinned download", item)
                tpixels, recipe, _ = blind.transformed(src, size, item)
                if recipe != e.get("transform") or blind.sha_bytes(tpixels) != e["pixels_sha256"]:
                    raise Blocked("binding failed", f"{item} {face}: the recorded Lanczos transform does not "
                                  "reproduce the presented pixels", item)
            if lengths["A"] != lengths["B"]:
                raise Blocked("binding failed", f"{item}: A and B differ in byte length", item)
        except Blocked as b:
            found.append(b)
        except (KeyError, TypeError) as err:
            found.append(Blocked("key mismatch", f"{item}: malformed source entry ({err!r})", item))
    if found:
        raise BlockedMany(found)


# ---------------------------------------------------------------- ratings


def valid_crop(c, dims) -> bool:
    ints = lambda v: isinstance(v, int) and not isinstance(v, bool)  # noqa: E731
    return (isinstance(c, dict) and set(c) == {"x", "y", "w", "h"} and all(ints(c[f]) for f in "xywh")
            and c["w"] >= 1 and c["h"] >= 1 and c["x"] >= 0 and c["y"] >= 0
            and c["x"] + c["w"] <= dims[0] and c["y"] + c["h"] <= dims[1])


def check_rows(rows, sealed: dict, pairs: dict, *, expect: list[str]) -> dict:
    """item -> row for exactly the `expect` items, each once, the S-20 row contract."""
    if not isinstance(rows, list):
        raise Blocked("schema error", "ratings is not a list")
    found, seen, out = [], {}, {}
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"pair_id", "quality", "fidelity"}:
            found.append(Blocked("schema error", "a rating row has other fields"))
            continue
        item = row["pair_id"]
        if item not in expect:
            found.append(Blocked("coverage error", "a row names a pair outside the expected set"))  # untrusted: not echoed
            continue
        seen[item] = seen.get(item, 0) + 1
        dims = list(pairs[item].request_size)
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
                elif f["level"] in ("significant", "severe") and (not f["crops"] or not f["reason"].strip()):
                    problems.append(("missing evidence", side))
        found += [Blocked(r, f"{item}: {what}", item) for r, what in problems]
        if not problems:
            out[item] = row
    for item in expect:
        if seen.get(item, 0) != 1:
            found.append(Blocked("coverage error", f"{item} rated {seen.get(item, 0)} times", item))
    if found:
        raise BlockedMany(found)
    return out


def ratings_of(export, checkpoint_raw: bytes | None, sealed: dict, pairs: dict) -> dict:
    key, seal_digest = sealed["key"], sealed["key"]["set_digest"]
    if not isinstance(export, dict) or set(export) != EXPORT_FIELDS:
        raise Blocked("schema error", "not a compare-gpt26 gate export (an S-20 export lacks passes/locked_pass1)")
    if (export["viewer"], export["version"], export["kind"]) != ("compare-s20", 1, "gate"):
        raise Blocked("schema error", "not a version 1 gate export of the copied viewer")
    if export["set_id"] != key["set_id"] or export["set_digest"] != seal_digest:
        raise Blocked("key mismatch", "the export is for another set or digest than the seal")
    if export["passes"] != key["passes"]:
        raise Blocked("checkpoint error", "the export's passes differ from the sealed passes")
    rows = check_rows(export["ratings"], sealed, pairs, expect=sorted(pairs))
    if len(key["passes"]) < 2:
        if export["locked_pass1"] is not None:
            raise Blocked("checkpoint error", "a single-pass set carries a first-pass lock")
        return rows
    first = key["passes"][0]
    locked = export["locked_pass1"]
    if not isinstance(locked, list) or [r.get("pair_id") if isinstance(r, dict) else None for r in locked] != first:
        raise Blocked("checkpoint error", "the export's first-pass lock is missing or not the sealed first pass")
    if any(r != rows[r["pair_id"]] for r in locked):
        raise Blocked("checkpoint error", "first-pass answers changed after they were locked")
    if checkpoint_raw is None:
        raise Blocked("checkpoint error", "two sealed passes and no private first-pass checkpoint")
    cp = strict_json(checkpoint_raw, "the first-pass checkpoint", "checkpoint error")
    if not isinstance(cp, dict) or set(cp) != CHECKPOINT_FIELDS or \
            (cp["viewer"], cp["version"], cp["kind"]) != ("compare-s20", 1, "gate-pass1-checkpoint") or \
            cp["set_id"] != key["set_id"] or cp["set_digest"] != seal_digest or cp["passes"] != key["passes"]:
        raise Blocked("checkpoint error", "the checkpoint is not this set's first-pass checkpoint")
    if cp["ratings"] != locked:
        raise Blocked("checkpoint error", "the checkpoint differs from the export's locked first pass")
    return rows


# ---------------------------------------------------------------- the rule


def decide(gate: dict, slots: list[dict], spend: dict) -> dict:
    """The verdict from the study's slot records (pure).

    `slots`: [{label, delivered, gpt_level, local_level, quality}], levels None when undelivered;
    `spend`: {committed_usd, cap_usd, breaches}. Diagnostics never enter the decision."""
    order_ = {lv: n for n, lv in enumerate(gate["fidelity_levels"])}
    disq = set(gate["fidelity_disqualifying_levels"])
    reasons = {"not_delivered": [], "fidelity": [], "budget_protocol": []}
    ties = 0
    for s in slots:
        if not s["delivered"]:
            reasons["not_delivered"].append(f"not delivered: {s['label']}" + (f" ({s['reason']})" if s.get("reason")
                                                                              else ""))
            s["tie"] = None
            continue
        s["tie"] = order_[s["gpt_level"]] <= order_[s["local_level"]]
        ties += s["tie"]
        if s["gpt_level"] in disq:
            reasons["fidelity"].append(f"fidelity: {s['gpt_level']} on {s['label']}")
    if len(slots) != gate["denominator"]:
        reasons["not_delivered"].append(f"{len(slots)} slot records, the denominator is {gate['denominator']}")
    if ties < gate["min_tie_pairs"]:
        reasons["fidelity"].append(f"fidelity: {ties} of {gate['denominator']} pairs at least a tie, "
                                   f"{gate['min_tie_pairs']} required")
    for b in spend["breaches"]:
        reasons["budget_protocol"].append(f"budget/protocol: cost-bound breach: {b}")
    if spend["committed_usd"] > spend["cap_usd"] + 1e-9:
        reasons["budget_protocol"].append(f"budget/protocol: conservative spend ${spend['committed_usd']:.2f} exceeds "
                                          f"the ${spend['cap_usd']:.2f} cap")
    flat = [r for k in ("not_delivered", "fidelity", "budget_protocol") for r in reasons[k]]
    return {"verdict": "FAIL" if flat else "PASS", "ties": ties, "min_tie_pairs": gate["min_tie_pairs"],
            "denominator": gate["denominator"], "reasons": reasons, "slots": slots}


def quality_of(q: str, gpt_side: str) -> str:
    if q == "tie":
        return "tie"
    return ("gpt-" if q[0] == gpt_side else "local-") + q.split("-")[1]


def evaluate(set_id: str, export: Path | None, paths: run.Paths, study: study_mod.Study) -> dict:
    root = paths.root
    order(evidence.require_write_once, study.seal_rel, root)
    seal = read_seal(root, study.seal_rel)
    if seal["set_id"] != set_id:
        raise Blocked("key mismatch", f"--set {set_id} is not the sealed set")
    sealed = load_set(paths, seal)
    config, _config_sha, series, st = run_record(paths, study, sealed["key"])
    pairs = pairs_of(sealed["key"], st)
    blind.require_clean(root, [blind.BASELINES], "the gate")
    file_bindings(paths, sealed, pairs, series)
    cap = blind.approved_cap(root, study)
    rows: dict = {}
    export_sha = None
    if not pairs:
        if export is not None:
            raise Blocked("schema error", "zero delivered slots: the gate accepts no ratings export")
    else:
        if export is None:
            raise Blocked("missing file", "delivered pairs need the committed ratings export (--export)")
        order(evidence.require_committed_clean, [study.ratings_rel], root, purpose="the gate")
        order(evidence.require_strictly_before, study.seal_rel, study.ratings_rel, root)
        raw = read(root / study.ratings_rel, "the ratings export")
        export_sha = blind.sha_bytes(raw)
        cp = checkpoint_path(paths, set_id)
        cp_raw = cp.read_bytes() if len(sealed["key"]["passes"]) == 2 and cp.exists() else None
        rows = ratings_of(strict_json(raw, "the ratings export"), cp_raw, sealed, pairs)
    item_of = {(s.photo, s.slot): i for i, s in pairs.items()}
    records = []
    for s in st.slots.values():
        item = item_of.get((s.photo, s.slot))
        if item is None:
            records.append({"label": s.label, "delivered": False, "reason": s.reason, "pair": None,
                            "gpt_level": None, "local_level": None, "quality": None})
            continue
        it, row = sealed["key"]["items"][item], rows[item]
        g, lo = it["gpt_side"], it["local_side"]
        records.append({"label": s.label, "delivered": True, "reason": None, "pair": item,
                        "gpt_level": row["fidelity"][g]["level"], "local_level": row["fidelity"][lo]["level"],
                        "quality": quality_of(row["quality"], g), "gpt_side": g,
                        "gpt_crops": row["fidelity"][g]["crops"], "gpt_reason": row["fidelity"][g]["reason"],
                        "local_crops": row["fidelity"][lo]["crops"], "local_reason": row["fidelity"][lo]["reason"]})
    spend = {"committed_usd": st.committed_usd, "known_usd": st.known_usd, "unknown_attempts": st.unknown_attempts,
             "cap_usd": cap, "breaches": list(st.breaches)}
    report = decide(config["gate"], records, spend)
    report.update(gate_id=config["gate"]["id"], series_id=study.series_id, set_id=set_id, set_digest=seal["set_digest"],
                  key_sha256=seal["key_sha256"], ratings_export_sha256=export_sha, spend=spend, blocks=st.blocks,
                  walls_s=st.walls, wall_p95_s=state.p95(st.walls), guardrail_p95_s=run.GUARDRAIL_P95_S,
                  passes=[len(p) for p in sealed["key"]["passes"]],
                  repeated_local_risk=config["blind_protocol"]["repeated_local_recognition_risk"])
    return report


# ---------------------------------------------------------------- outputs


def verdict_md(report: dict) -> str:
    sp, b = report["spend"], report["blocks"]
    within = not sp["breaches"] and sp["committed_usd"] <= sp["cap_usd"] + 1e-9
    lines = [f"# GPT26 study `{report['series_id']}` — verdict", "",
             f"**Verdict: {report['verdict']}.** Pairs at least a tie: {report['ties']} of {report['denominator']} "
             f"({report['min_tie_pairs']} required). Gate `{report['gate_id']}`, set `{report['set_id']}`.", ""]
    for title, key in (("Not delivered", "not_delivered"), ("Fidelity", "fidelity"),
                       ("Budget and protocol", "budget_protocol")):
        lines += [f"## {title}", ""]
        lines += [f"- {r}" for r in report["reasons"][key]] or ["- none"]
        lines.append("")
    lines += ["## Pairs", "",
              "Fidelity is judged against the original at the GPT output's size; the tie rule is GPT level ≤ Local "
              "level. Quality is diagnostic only.", ""]
    lines += md_table(
        ["Slot", "Pair", "GPT fidelity", "Local fidelity", "At least a tie", "Quality (diagnostic)"],
        [[s["label"], s.get("pair") or "—", s["gpt_level"] or UNRATED, s["local_level"] or UNRATED,
          "—" if s["tie"] is None else ("yes" if s["tie"] else "no"), s["quality"] or UNRATED]
         for s in report["slots"]])
    p95 = report["wall_p95_s"]
    lines += ["", "## Run", "",
              f"- Spend: ${sp['committed_usd']:.2f} conservative (known cost, else the full reservation), "
              f"${sp['known_usd']:.4f} known billed, {sp['unknown_attempts']} attempt(s) without a known cost; approved "
              f"cap ${sp['cap_usd']:.2f}. " + ("Within the cap and no bound breach." if within else
                                               "The cap is NOT shown to have held."),
              f"- Blocks ({'/'.join(b['codes']) or 'none'}): {b['first_attempt_blocks']} first-attempt, "
              f"{b['recovered_by_retry']} recovered by the retry, {b['final_undelivered_after_block']} final undelivered.",
              f"- Wall time per call (s): {', '.join(f'{w:g}' for w in report['walls_s']) or 'none'}; p95 "
              f"{'n/a' if p95 is None else f'{p95:g} s'} vs the {report['guardrail_p95_s']} s guardrail (diagnostic).",
              f"- Passes: {report['passes'] or 'none (zero delivered, no viewer)'}.",
              f"- Residual risk: {report['repeated_local_risk']}", ""]
    ev = [(s["label"], who, s.get(f"{who}_crops") or [], s.get(f"{who}_reason") or "") for s in report["slots"]
          if s["delivered"] for who in ("gpt", "local") if s.get(f"{who}_crops") or (s.get(f"{who}_reason") or "").strip()]
    if ev:
        lines += ["## Crops and reasons", "", "Pixels of the GPT-size comparison, half-open `[x, x+w) × [y, y+h)`.", ""]
        for label, who, crops, reason in ev:
            cs = "; ".join(f"x {c['x']}, y {c['y']}, {c['w']}×{c['h']}" for c in crops) or "no crop"
            lines.append(f"- {label}, {'GPT' if who == 'gpt' else 'Local'} side: {cs} — {reason.strip() or 'no reason'}")
        lines.append("")
    lines += [f"Written by `scripts/gpt26/gate.py` from the sealed set, the frozen run record and "
              f"{'the committed ratings' if report['ratings_export_sha256'] else 'terminal evidence alone'}.", ""]
    return "\n".join(lines)


def write_reports(root: Path, study: study_mod.Study, report: dict) -> None:
    (root / study.verdict_json).parent.mkdir(parents=True, exist_ok=True)
    (root / study.verdict_json).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    (root / study.verdict_md).write_text(verdict_md(report))


def main(argv: list[str] | None = None, *, root: Path | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="GPT26 gate")
    ap.add_argument("--config", required=True, help="the study's config (repo-relative or inside the checkout)")
    ap.add_argument("--set", required=True, dest="set_id", type=blind.set_id_arg)
    ap.add_argument("--export")
    args = ap.parse_args(argv)
    root = root or blind.ROOT
    study = blind.load_study(root, args.config)
    if study is None:
        return 1
    paths = run.study_paths(root, study)
    export = None
    if args.export:
        export = Path(args.export)
        export = export if export.is_absolute() else Path.cwd() / export
        if export.resolve() != (paths.root / study.ratings_rel).resolve():
            ap.error(f"--export must be the committed {study.ratings_rel}")

    def go():
        report = evaluate(args.set_id, export, paths, study)
        write_reports(paths.root, study, report)
        return report

    trusted = blind.slot_labels(study) | {f"p{n:02d}" for n in range(1, len(study.expected_slots) + 1)}
    code, report = blind.boundary("gate", go, paths.private, WAY_OUT, trusted=trusted)
    if code:
        return code
    flat = [r for k in ("not_delivered", "fidelity", "budget_protocol") for r in report["reasons"][k]]
    print(f"{report['verdict']}: {report['ties']} of {report['denominator']} pairs at least a tie "
          f"({report['min_tie_pairs']} required)" + (f"; {'; '.join(flat)}" if flat else "")
          + f".\n  wrote {study.verdict_json} and {study.verdict_md}; commit them.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
