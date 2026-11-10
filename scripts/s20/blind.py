#!/usr/bin/env python3
"""S-20 step 1 blind set builder (`cloud-classical-denoise`, plan Phases 3 and 8).

  python3 scripts/s20/blind.py pilot [--trial 1a|1b] --set <set_id>
  python3 scripts/s20/blind.py gate  [--trial 1a|1b] --set <set_id>

`--trial` (default `1a`) selects the row of `trials.py` that names the treatment arm, its raw
renders, its frozen config, its calibration bind and its seal paths (plan Phase 8). The paragraphs
below name 1a's values; 1b's are the wavelet row's (`wavelet-gamma`, `wavelet/`, …).

Writes `test-photos/private/s20/<set_id>/`: one metadata-free RGB PNG per rater-facing image,
named only by item id and side, the manifest `manifest.js` (`window.S20_SET = …`) that
`references/compare-s20.html?set=<set_id>` loads, and the sealed key `.key-do-not-open.json`.
It prints the set digest and the key's sha256; the owner commits them in the seal file before
opening the viewer (plan § Implementation Approach, order step 4).

Pilot: per tuning photo, the original, `control-full` labelled "kontrola" and the grid's
`nlm-gamma` strengths as X/Y/Z, the labels drawn with `secrets`. Gate: 8 photos ×
{NLM vs control-full, NLM vs real Local}, the NLM side and the global pair order drawn with
`secrets`, ids p01…p16. The NLM strength is the `k` of `scripts/s20/configs/nlm-frozen.json`,
and gate mode refuses unless order step 8 holds (`pilot.require_freeze`): every rule file clean,
the pilot seal write-once and before its ratings, the freeze write-once and after them, and the
freeze exactly what the current sealed pilot decides; a STOP pilot refuses any freeze (plan
Phase 4 item 5, owner decision 2026-11-05).

On success it prints the whole seal file for the set: one `S20-SEAL` line plus the human-control
statement (owner decision 2026-11-06). It never writes into the repository.

Before any byte is read: `protocol.require_access(ids)`, then `protocol.check_paths` on every
concrete path. Every source is verified before it is copied (order step 3): the shared decode
against its pixels, each arm against its record and the decode, each `nlm-gamma` against its
NLM record and the `control-full` of the same photo (decoded pixels, Auto record file, LUT), and
each NLM record's provenance — `implementation_sha256`, `config_sha256`, `opencv_version` —
against the calibration bind line committed at this repository's HEAD (impl review phase 2, F1).
That bind is read from this checkout's HEAD and never from a test override, so no environment
variable can redirect it.

Presentation copies [F2]: every image, the original and the JPEG Local included, is decoded and
re-encoded by Pillow as RGB PNG with only IHDR/IDAT/IEND and a fixed compress level. A source
carrying an ICC profile is accepted only when it is the sRGB profile the app's downloads embed, so
dropping it changes nothing a browser shows.

One CLI boundary [F7, F12]: any failure prints `set: <reason class>` (with a photo id from the
trusted manifest where one applies) and exits 3, with no traceback; the detail goes only to a
private log under `test-photos/private/s20/logs/`; the line also names one fixed way out per reason
class (`WAY_OUT`). A failed build leaves no set directory.

Exit status: 0 built; 2 usage (argparse, including a malformed --set); 3 BLOCKED.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "s19"))
sys.path.insert(0, str(HERE))

import evidence  # noqa: E402
import protocol  # noqa: E402
import trials  # noqa: E402
from trials import TRIALS, Trial  # noqa: E402

T1A = TRIALS["1a"]
FROZEN_REL = T1A.frozen
KEY_NAME = ".key-do-not-open.json"
SET_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
PILOT_LABELS = ("X", "Y", "Z")
# The sRGB profile Chrome's canvas embeds in every Local download (all eight tuning photos,
# measured 2026-11-05). Untagged PNG is sRGB to a browser, so dropping exactly this is a no-op.
SRGB_ICC_SHA256 = {"12afb4d9953adee0607d347daee5b78b18d6b3cab2d572b88970703f5edb37bc"}
# Stored deflate: a file's size then depends on its dimensions only. At any real level the
# smoother NLM output compresses smaller and its size names the side (impl review phase 3, F2).
COMPRESS_LEVEL = 0
# Every file of a set carries this mtime (2026-11-05T00:00:00Z), so timestamps order nothing.
FILE_TIME_NS = 1_793_836_800 * 1_000_000_000
BIND_FIELDS = T1A.bind_fields  # 1a's; every check reads the selected trial's row
# One fixed way out per reason class: printed with the BLOCKED line, so the refusal says what to
# do without naming an arm, a strength or a private path (impl review phase 3, F7). The renderer
# and its libraries are the selected trial's; the 1a texts are today's, byte for byte.


def way_outs(t: Trial = T1A) -> dict[str, str]:
    return {
        "access refused": "only tuning photos may be read; check the manifest split and that no path links into "
                          "the holdout",
        "calibration not committed": f"commit the PASS calibration record and {Path(t.grid).name} it names "
                                     f"({t.renderer} --calibrate)",
        "missing source": f"render the missing step with local-arms.ts and {t.renderer}, then rebuild",
        "source binding failed": "re-render the named photo's arms from its current decode, then rebuild",
        "provenance mismatch": f"re-render the {t.label} grid with the committed {t.renderer}, grid and "
                               f"{t.renderer_libs}, then rebuild",
        "set exists": "pick a new --set: a set_id is never reused",
        "usage": "run with --set <set_id> matching " + SET_ID.pattern,
        "interrupted": "rebuild; the interrupted build left no set",
        "internal error": "read the private log; report it if the cause is not in your inputs",
    }


WAY_OUT = way_outs(T1A)  # 1a's, the name that predates the seam


class Blocked(Exception):
    """A build refusal. `reason` is a fixed class safe to print; `detail` goes to the private log."""

    def __init__(self, reason: str, detail: str, photo: str | None = None):
        super().__init__(detail)
        self.reason, self.detail, self.photo = reason, detail, photo


def private_s20() -> Path:
    return Path(os.environ.get("S20_PRIVATE", ROOT / "test-photos" / "private" / "s20"))


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def rng():
    """Every draw comes from the OS CSPRNG; a module function so a test can patch the source."""
    return secrets.SystemRandom()


# ---------------------------------------------------------------- committed rules (this repository's HEAD)


def committed(rel_path: str) -> bytes:
    r = subprocess.run(["git", "-C", str(ROOT), "show", f"HEAD:{rel_path}"], capture_output=True)
    if r.returncode != 0:
        raise Blocked("calibration not committed",
                      f"cannot read {rel_path} at HEAD of {ROOT}: {r.stderr.decode(errors='replace').strip()}")
    return r.stdout


def committed_bind(t: Trial = T1A) -> dict:
    """The trial's calibration bind line at HEAD of this checkout, and the committed grid it names.
    Its `trial=` must be exactly the row's: absent for 1a, `trial=1b` for 1b (F24)."""
    text = committed(t.calibration).decode()
    binds = [ln[len("S20-CALIBRATION "):] for ln in text.splitlines() if ln.startswith("S20-CALIBRATION ")]
    if len(binds) != 1:
        raise Blocked("calibration not committed", f"{len(binds)} bind lines in the committed calibration record")
    fields = dict(kv.split("=", 1) for kv in binds[0].split() if "=" in kv)
    if fields.get("trial") != t.bind_trial:
        raise Blocked("calibration not committed",
                      f"the committed bind line names trial {fields.get('trial')!r}, not {t.bind_trial!r}")
    if fields.get("result") != "PASS":
        raise Blocked("calibration not committed", f"the committed calibration records {fields.get('result')!r}")
    for f in t.bind_fields:  # a missing field would let a record lacking it pass as None == None
        if not fields.get(f):
            raise Blocked("calibration not committed", f"the committed bind line has no {f}")
    grid_raw = committed(t.grid)
    if sha_bytes(grid_raw) != fields.get("config_sha256"):
        raise Blocked("calibration not committed", "the committed grid is not the one the committed calibration names")
    grid = json.loads(grid_raw)
    return {**{f: fields[f] for f in t.bind_fields}, "k": [float(k) for k in grid["k"]]}


# ---------------------------------------------------------------- sources


def k_dir(k: float) -> str:
    return f"k{k:.1f}"


def paths_for(pid: str, ks: list[float], local: bool, t: Trial = T1A) -> dict:
    s19, s20 = protocol.private_dir(), private_s20()
    p = {
        "sidecar": s19 / "inputs" / f"{pid}.json",
        "decoded": (s20 / "decoded" / f"{pid}.png", s20 / "decoded" / f"{pid}.json"),
        "control": (s19 / "arms" / "control-full" / f"{pid}.png", s19 / "arms" / "control-full" / f"{pid}.json"),
        "arm": {k: (s19 / "arms" / t.arm / k_dir(k) / f"{pid}.png",
                    s19 / "arms" / t.arm / k_dir(k) / f"{pid}.json") for k in ks},
        "raw": {k: (s20 / t.raw_dir / k_dir(k) / f"{pid}.png", s20 / t.raw_dir / k_dir(k) / f"{pid}.json") for k in ks},
    }
    if local:
        p["local"] = s19 / "local" / f"{pid}.jpg"
    return p


def flatten(p: dict) -> list[Path]:
    out: list[Path] = []
    for v in p.values():
        if isinstance(v, Path):
            out.append(v)
        elif isinstance(v, tuple):
            out.extend(v)
        else:
            for pair in v.values():
                out.extend(pair)
    return out


def load_json(path: Path, pid: str) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError) as e:
        raise Blocked("missing source", f"{path}: {e}", pid)


def decode(path: Path, pid: str) -> tuple[bytes, list[int], dict]:
    """Pillow's RGB pixels, dimensions and whatever ICC the file carries; refuses other modes."""
    from PIL import Image

    try:
        with Image.open(path) as im:
            im.load()
            icc = im.info.get("icc_profile")
            if im.mode != "RGB":
                raise Blocked("source binding failed", f"{path} is {im.mode}, not RGB", pid)
            return im.tobytes(), list(im.size), {"icc_sha256": sha_bytes(icc) if icc else None}
    except Blocked:
        raise
    except Exception as e:  # noqa: BLE001 - any decoder failure is one reason class
        raise Blocked("missing source", f"cannot decode {path}: {e}", pid)


def need(cond: bool, pid: str, detail: str, reason: str = "source binding failed") -> None:
    if not cond:
        raise Blocked(reason, detail, pid)


def verified_sources(pid: str, ks: list[float], bind: dict, *, local: bool, t: Trial = T1A) -> dict:
    """Order step 3 for one photo: every record exists and verifies. Returns the decoded sources."""
    p = paths_for(pid, ks, local, t)
    protocol.check_paths(flatten(p), validation=False)
    for f in flatten(p):
        need(f.exists(), pid, f"{f} is missing", "missing source")
    side = load_json(p["sidecar"], pid)
    dec_png, dec_json = p["decoded"]
    dec = load_json(dec_json, pid)
    need(dec.get("kind") == "decoded" and dec.get("id") == pid
         and dec.get("common_sha256") == (side.get("common") or {}).get("sha256"), pid,
         f"{dec_json} is not the decode of this photo's current common input")
    need(protocol.sha256_file(dec_png) == dec.get("output_sha256"), pid, f"{dec_png} differs from its record")
    pixels, dims, meta = decode(dec_png, pid)
    need(sha_bytes(pixels) == dec.get("pixels_sha256"), pid, f"{dec_png} does not hold pixels_sha256")
    need(dec.get("dimensions") == dims, pid, f"{dec_png} is {dims}, its record says {dec.get('dimensions')}")
    out = {"original": source(dec_png, pixels, dims, meta, record=dec_json)}

    ctl_png, ctl_json = p["control"]
    ctl = load_json(ctl_json, pid)
    check_arm(pid, ctl, "control-full", ctl_png, dec, dec_json, dims)
    need(ctl.get("source") is None, pid, f"{ctl_json}: control-full names a source")
    out["control-full"] = source(ctl_png, *decode(ctl_png, pid), record=ctl_json)

    for k in ks:
        arm_png, arm_json = p["arm"][k]
        raw_png, raw_json = p["raw"][k]
        arm = load_json(arm_json, pid)
        raw = load_json(raw_json, pid)
        check_arm(pid, arm, t.arm, arm_png, dec, dec_json, dims)
        for f in ("auto_file_sha256", "lut_sha256", "gamma"):
            need(arm.get(f) == ctl.get(f), pid, f"{arm_json}: {f} differs from control-full's [F9]")
        src = arm.get("source") or {}
        need(src.get("kind") == t.source_kind and src.get("k") == k
             and src.get("record_sha256") == protocol.sha256_file(raw_json)
             and src.get("output_sha256") == raw.get("output_sha256"), pid,
             f"{arm_json} does not name {raw_json} and its output")
        need(raw.get("id") == pid and raw.get("k") == k and raw.get("decoded_pixels_sha256") == dec["pixels_sha256"]
             and raw.get("dimensions") == dims and protocol.sha256_file(raw_png) == raw.get("output_sha256"), pid,
             f"{raw_json} does not verify against its output and the shared decode")
        off = [f for f in t.bind_fields if raw.get(f) != bind[f]]
        need(not off, pid, f"{raw_json}: {', '.join(off)} differ from the committed calibration bind",
             "provenance mismatch")
        out[(t.arm, k)] = source(arm_png, *decode(arm_png, pid), record=arm_json,
                                 raw_record=(raw_json, protocol.sha256_file(raw_json)), t=t)

    if local:
        lp, ld, lm = decode(p["local"], pid)
        need(ld == dims, pid, f"{p['local']} is {ld}, the decode {dims}")
        out["local"] = source(p["local"], lp, ld, lm)
    for name, s in out.items():
        need(s["icc_sha256"] in (None, *SRGB_ICC_SHA256), pid,
             f"{s['path']} ({name}) carries an ICC profile other than the app's sRGB; its PNG copy would look different")
    return out


def check_arm(pid: str, rec: dict, arm: str, png: Path, dec: dict, dec_json: Path, dims: list[int]) -> None:
    need(rec.get("arm") == arm and rec.get("id") == pid, pid, f"{png.with_suffix('.json')} is not {arm} for {pid}")
    need(rec.get("decoded_pixels_sha256") == dec["pixels_sha256"]
         and rec.get("decoded_record_sha256") == protocol.sha256_file(dec_json), pid,
         f"{png.with_suffix('.json')} was rendered from other decoded pixels")
    need(rec.get("output_sha256") == protocol.sha256_file(png) and rec.get("dimensions") == dims, pid,
         f"{png} differs from its record")
    for f in ("auto_file_sha256", "lut_sha256"):
        need(isinstance(rec.get(f), str) and len(rec[f]) == 64, pid, f"{png.with_suffix('.json')} lacks {f}")


def source(path: Path, pixels: bytes, dims: list[int], meta: dict, *, record: Path | None = None,
           raw_record: tuple[Path, str] | None = None, t: Trial = T1A) -> dict:
    # Only hashes are kept: write_copy re-decodes and re-verifies, so a build never holds every photo.
    # `_abs` is the realpath the guard just passed; write_copy re-guards and opens exactly that.
    s = {"_abs": os.path.realpath(path), "path": rel(path), "sha256": protocol.sha256_file(path), "dimensions": dims,
         "pixels_sha256": sha_bytes(pixels), "icc_sha256": meta["icc_sha256"]}
    if record:
        s["record"], s["record_sha256"] = rel(record), protocol.sha256_file(record)
    if raw_record:
        s[t.record_key], s[t.record_sha_key] = rel(raw_record[0]), raw_record[1]
    return s


# ---------------------------------------------------------------- set


def canonical(payload: dict) -> bytes:
    return json.dumps({k: v for k, v in payload.items() if k != "set_digest"}, sort_keys=True,
                      separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def set_digest(payload: dict) -> str:
    """sha256 of the canonical payload, excluding the `set_digest` field itself [F6]."""
    return sha_bytes(canonical(payload))


def write_copy(src: dict, out: Path) -> dict:
    """Re-decode a verified source, re-encode it as a metadata-free RGB PNG, and verify the copy
    decodes to the same pixels. A source that changed since it was verified is refused."""
    from PIL import Image

    path = Path(src["_abs"])
    protocol.check_paths([path], validation=False)  # again: minutes may have passed since verification
    if protocol.sha256_file(path) != src["sha256"]:
        raise Blocked("source binding failed", f"{path} changed after it was verified")
    pixels, dims, _ = decode(path, None)
    if sha_bytes(pixels) != src["pixels_sha256"] or dims != src["dimensions"]:
        raise Blocked("source binding failed", f"{path} decodes to other pixels than when it was verified")
    Image.frombytes("RGB", tuple(dims), pixels).save(out, "PNG", compress_level=COMPRESS_LEVEL)
    del pixels
    with Image.open(out) as im:
        back = im.convert("RGB").tobytes()
    if sha_bytes(back) != src["pixels_sha256"]:
        raise Blocked("internal error", f"{out} does not decode to its source's pixels")
    entry = {k: v for k, v in src.items() if not k.startswith("_")}
    entry.update(presentation=out.name, presentation_sha256=protocol.sha256_file(out))
    return entry


def build(kind: str, set_id: str, t: Trial = T1A) -> dict:
    if not SET_ID.fullmatch(set_id):
        raise Blocked("usage", f"set id {set_id!r} must match {SET_ID.pattern}")
    final = private_s20() / set_id
    protocol.check_paths([final], validation=False)
    if final.exists():
        raise Blocked("set exists", f"{final} exists: a set_id is never reused; pick a new one")
    bind = committed_bind(t)
    ks = bind["k"]
    freeze = None
    if kind == "gate":
        import pilot  # step 8; imported here because pilot imports this module

        _, freeze = pilot.require_freeze(evidence.repo_root(), t)
        k = freeze["k"]
    manifest = protocol.load_manifest()
    ids = protocol.select_ids(manifest, [], True, False)
    if not ids:
        raise Blocked("missing source", "the benchmark manifest has no tuning photos")
    protocol.require_access(ids)
    sources = {pid: verified_sources(pid, ks if kind == "pilot" else [k], bind, local=kind == "gate", t=t)
               for pid in ids}

    r = rng()
    final.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=f".{set_id}-", dir=final.parent))
    try:
        items, key_items = [], {}
        if kind == "pilot":
            for n, pid in enumerate(ids, 1):
                item = f"i{n:02d}"
                labels = list(PILOT_LABELS)
                r.shuffle(labels)
                src = sources[pid]
                images, key_sources, key_labels = {}, {"original": write_copy(src["original"], tmp / f"{item}-original.png")}, {}
                key_sources["kontrola"] = write_copy(src["control-full"], tmp / f"{item}-kontrola.png")
                images["kontrola"] = {"src": f"{item}-kontrola.png"}
                key_labels["kontrola"] = {"arm": "control-full"}
                for label, k in sorted(zip(labels, ks)):
                    key_sources[label] = write_copy(src[(t.arm, k)], tmp / f"{item}-{label}.png")
                    images[label] = {"src": f"{item}-{label}.png"}
                    key_labels[label] = {"arm": t.arm, "k": k}
                items.append({"id": item, "photo": pid,
                              "original": {"src": f"{item}-original.png", "dimensions": src["original"]["dimensions"]},
                              "images": dict(sorted(images.items()))})
                key_items[item] = {"photo": pid, "labels": key_labels, "sources": key_sources}
        else:
            pairs = [(pid, ref) for pid in ids for ref in ("control-full", "local")]
            r.shuffle(pairs)
            for n, (pid, ref) in enumerate(pairs, 1):
                item = f"p{n:02d}"
                nlm_side = r.choice(("A", "B"))
                ref_side = "B" if nlm_side == "A" else "A"
                src = sources[pid]
                # Written in side order, never NLM-first: write order shows in mtimes and inodes.
                key_sources = {"original": write_copy(src["original"], tmp / f"{item}-original.png")}
                for side in ("A", "B"):
                    arm = (t.arm, k) if side == nlm_side else ref
                    key_sources[side] = write_copy(src[arm], tmp / f"{item}-{side}.png")
                items.append({"id": item, "photo": pid,
                              "original": {"src": f"{item}-original.png", "dimensions": src["original"]["dimensions"]},
                              "images": {"A": {"src": f"{item}-A.png"}, "B": {"src": f"{item}-B.png"}}})
                key_items[item] = {"photo": pid, "comparison": ref,
                                   "sides": {nlm_side: {"arm": t.arm, "k": k}, ref_side: {"arm": ref}},
                                   "sources": dict(sorted(key_sources.items()))}
        payload = {"set_id": set_id, "kind": kind, "items": items}
        digest = set_digest(payload)
        payload["set_digest"] = digest
        (tmp / "manifest.js").write_text(
            "window.S20_SET = " + json.dumps(payload, sort_keys=True, indent=1, ensure_ascii=False) + ";\n")
        key = {"set_id": set_id, "kind": kind, "set_digest": digest,
               "built_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "calibration_bind": {f: bind[f] for f in t.bind_fields},
               "freeze": freeze, "items": key_items}
        (tmp / KEY_NAME).write_text(json.dumps(key, sort_keys=True, indent=1) + "\n")
        key_sha = protocol.sha256_file(tmp / KEY_NAME)
        for p in tmp.iterdir():  # one timestamp for every file: no file's mtime says when it was drawn
            os.utime(p, ns=(FILE_TIME_NS, FILE_TIME_NS))
        # Again, right before the rename: on Linux it would silently replace an empty directory
        # that appeared during the minutes of the build, and a set_id is never reused.
        if os.path.lexists(final):
            raise Blocked("set exists", f"{final} appeared during the build: a set_id is never reused")
        os.rename(tmp, final)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    return {"set_id": set_id, "kind": kind, "set_digest": digest, "key_sha256": key_sha, "items": len(items),
            "dir": final}


# ---------------------------------------------------------------- CLI boundary


def log_detail(text: str) -> str | None:
    """Write the rich diagnostic to the private log; return its name, or None if it could not be written."""
    try:
        logs = private_s20() / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        name = f"blind-{_dt.datetime.now(_dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.log"
        (logs / name).write_text(text)
        return f"logs/{name}"
    except Exception:  # noqa: BLE001
        return None


def set_id_arg(value: str) -> str:
    """A usage error is argparse's (exit 2), like every s19/s20 tool; `fullmatch` rejects "id\\n"."""
    if not SET_ID.fullmatch(value):
        raise argparse.ArgumentTypeError(f"must match {SET_ID.pattern}")
    return value


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("kind", choices=("pilot", "gate"))
    ap.add_argument("--set", required=True, dest="set_id", type=set_id_arg)
    trials.add_argument(ap)
    args = ap.parse_args(argv)
    t = args.trial
    manifest_ids: set[str] = set()
    try:
        manifest_ids = {e["id"] for e in protocol.load_manifest()["entries"]}
        out = build(args.kind, args.set_id, t)
    except BaseException as e:  # noqa: BLE001 - the one boundary: nothing propagates, nothing chains
        import common  # the step-8 refusals carry the rule tools' reason classes

        ways = way_outs(t)
        if isinstance(e, Blocked):
            reason, photo, detail = e.reason, e.photo, e.detail
        elif isinstance(e, (common.Blocked, common.BlockedMany)):
            first = e.found[0] if isinstance(e, common.BlockedMany) else e
            reason, photo, detail, ways = first.reason, None, str(e), common.way_outs(t)
        elif isinstance(e, protocol.Refused):
            reason, photo, detail = "access refused", None, str(e)
        elif isinstance(e, KeyboardInterrupt):
            reason, photo, detail = "interrupted", None, "interrupted"
        else:
            reason, photo, detail = "internal error", None, "".join(traceback.format_exception(e))
        log = log_detail(f"blind.py {args.kind}{t.flag} --set {args.set_id}\nreason: {reason}\n\n{detail}\n")
        where = f" (photo {photo})" if photo in manifest_ids else ""
        print(f"set: {reason}{where}. BLOCKED: no set was written. Way out: {ways[reason]}. "
              + (f"Details in the private S-20 log {log}." if log else "No private log could be written."))
        return 3
    seal_rel = t.pilot_seal if out["kind"] == "pilot" else t.gate_seal
    print(f"✓ {out['kind']} set {out['set_id']}: {out['items']} items\n"
          f"  set_digest  {out['set_digest']}\n"
          f"  key sha256  {out['key_sha256']}\n"
          f"Save everything between the markers as {seal_rel}, commit it, and only then open\n"
          f"  context/changes/cloud-classical-denoise/references/compare-s20.html?set={out['set_id']}\n"
          "--- START seal file ---\n"
          + evidence.seal_text(out["kind"], out["set_id"], out["set_digest"], out["key_sha256"], t.name)
          + "--- END seal file ---")
    return 0


if __name__ == "__main__":
    sys.exit(main())
