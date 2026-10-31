#!/usr/bin/env python3
"""S-19 paid runner: one immutable config, named photos, logical replicate slots, one ledger.

Generalises `scripts/s19/feasibility.py` (which stays as the spike record). Plan Phase 1,
item 3, and Implementation Approach § Budget.

  python3 scripts/s19/run-candidate.py --config scripts/s19/configs/gpt-std.json --phase 3 \\
      --series scripts/s19/series/phase3.json --cap 3 [--repeat 3] [--resume] [--dry-run] S17-03 ...

Every attempt is written to the shared ledger `test-photos/private/s19/attempts.jsonl`:

  reserve        written under an exclusive lock BEFORE any network access, carrying the
                 attempt id and the call's maximum cost (`cost_bound_usd` from the series)
  result         ok | error | unknown | invalid, with usage, the cost it implies (null when
                 the outcome is unknown or an error: the full reservation then stays counted),
                 the output hash and size
  budget_refusal a slot the phase cap could not admit (reported as not_attempted_budget)
  slot_terminal  a slot that ran out of retries or hit a non-transient error (technical_failure)

Admission is one guarded operation: lock → sum the phase's committed cost (actual cost where
a result reports it, the full reservation otherwise, including attempts still in flight or
interrupted) → refuse if that plus this call's bound exceeds the cap → append the reservation
→ unlock. Restarting, switching config or running two processes cannot reset or overshoot it.

Paid mode needs the owner's `S19-SPEND phase=N ... decision=approved` record whose cap equals
--cap. --dry-run needs the same arguments but never touches the network, reserves nothing and
implies no consent. --resume skips a slot that already has a valid result for the identical
config and input hashes (from any phase, so Phase 3 probes count towards a Phase 5 core) and
never regenerates for quality. Retries follow the config (`retry.max_retries`, transient
failures only); urllib makes no hidden retries.

Keys come from the environment only: OPENAI_API_KEY, FAL_KEY.

Exit status: 0 every requested slot is now resolved (a valid result, or an explicitly recorded
technical failure); 1 refused (access, approval, cap, prerequisite, manifest) or a slot left
unresolved by a budget stop; 2 usage.
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import datetime as _dt
import fcntl
import io
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import protocol  # noqa: E402

OK, ERROR, UNKNOWN, INVALID = "ok", "error", "unknown", "invalid"


def ledger_path() -> Path:
    return protocol.private_dir() / "attempts.jsonl"


def now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- sizes and cost bounds


def request_size(width: int, height: int, rule: dict) -> tuple[int, int]:
    """Largest aspect-matched size within the rule's pixel cap: both edges multiples of
    `multiple`, no edge over `max_edge`, no cropping. Aspect is kept as closely as rounding to
    `multiple` allows at the chosen short edge."""
    m, cap, max_edge = rule["multiple"], rule["max_pixels"], rule["max_edge"]
    long_in, short_in = max(width, height), min(width, height)
    aspect = long_in / short_in
    if aspect > rule.get("max_aspect", 3.0):
        raise protocol.Refused(f"aspect {aspect:.3f} exceeds the size rule's {rule.get('max_aspect', 3.0)}")
    for short in range(max_edge // m * m, 0, -m):
        long = round(short * aspect / m) * m
        if long <= max_edge and long * short <= cap:
            if long * short < rule["min_pixels"]:
                break
            return (long, short) if width >= height else (short, long)
    raise protocol.Refused(f"no size within {rule} fits a {width}×{height} input")


def cost_bound(config: dict, size: tuple[int, int]) -> float:
    """Conservative maximum cost of one call, rounded up to the cent."""
    b = config["cost_bound"]
    mp = size[0] * size[1] / 1e6
    if config["kind"] == "gpt":
        usd = (
            math.ceil(mp * b["output_image_tokens_per_megapixel"]) * b["usd_per_million_output_image_tokens"]
            + b["input_image_tokens"] * b["usd_per_million_input_image_tokens"]
            + b["input_text_tokens"] * b["usd_per_million_input_text_tokens"]
        ) / 1e6 + b["rounding_usd"]
    elif config["kind"] == "nafnet":
        usd = math.ceil(mp) * b["usd_per_megapixel"] + b["rounding_usd"]
    else:
        raise protocol.Refused(f"unknown config kind {config['kind']!r}")
    return math.ceil(usd * 100 - 1e-9) / 100


def actual_cost(config: dict, usage: dict | None) -> float | None:
    """The cost a successful response's usage implies, or None when it cannot be computed (the
    reservation then stays counted)."""
    b = config["cost_bound"]
    if config["kind"] == "gpt" and usage:
        out = usage.get("output_tokens_details", {}).get("image_tokens", usage.get("output_tokens"))
        img = usage.get("input_tokens_details", {}).get("image_tokens")
        txt = usage.get("input_tokens_details", {}).get("text_tokens")
        if None in (out, img, txt):
            return None
        return round(
            (out * b["usd_per_million_output_image_tokens"]
             + img * b["usd_per_million_input_image_tokens"]
             + txt * b["usd_per_million_input_text_tokens"]) / 1e6, 6)
    return None  # fal reports no billed amount; the full reservation stays counted


# ---------------------------------------------------------------- ledger


@contextlib.contextmanager
def locked():
    path = ledger_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path.with_suffix(".lock"), "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def read_ledger() -> list[dict]:
    path = ledger_path()
    if not path.exists():
        return []
    rows = []
    for n, line in enumerate(path.read_text().splitlines(), 1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except ValueError as e:
            raise protocol.Refused(f"{path} line {n} is not JSON ({e}): repair the ledger before any call") from e
    return rows


def append(row: dict) -> None:
    with open(ledger_path(), "a") as f:
        f.write(json.dumps(row, sort_keys=True) + "\n")
        f.flush()
        os.fsync(f.fileno())


def phase_committed(rows: list[dict], phase: int) -> tuple[float, int]:
    """(committed USD, attempts without a known cost) for one phase, reconciled by attempt id."""
    results = {r["attempt_id"]: r for r in rows if r["event"] == "result"}
    reserves = {r["attempt_id"]: r for r in rows if r["event"] == "reserve" and r["phase"] == phase}
    total, unknown = 0.0, 0
    for aid, res in reserves.items():
        cost = results.get(aid, {}).get("cost_usd")
        if cost is None:
            total += res["reserved_usd"]
            unknown += 1
        else:
            total += cost
    return round(total, 6), unknown


def slot_key(config_sha: str, input_sha: str, photo: str, slot: int) -> tuple:
    return (config_sha, input_sha, photo, slot)


def slot_state(rows: list[dict], key: tuple) -> dict:
    """What the ledger says about one logical slot, across every phase."""
    reserves = [r for r in rows if r["event"] == "reserve" and slot_key(
        r["config_sha256"], r["input_sha256"], r["photo"], r["slot"]) == key]
    ids = {r["attempt_id"] for r in reserves}
    results = [r for r in rows if r["event"] == "result" and r["attempt_id"] in ids]
    terminal = [r for r in rows if r["event"] == "slot_terminal" and slot_key(
        r["config_sha256"], r["input_sha256"], r["photo"], r["slot"]) == key]
    ok = [r for r in results if r["status"] == OK]
    last = results[-1] if results else None
    return {
        "attempts": len(reserves),
        "ok": ok[0] if ok else None,
        "terminal": terminal[0] if terminal else None,
        "in_flight": len(ids - {r["attempt_id"] for r in results}),
        "last_transient": bool(last and last.get("transient")) if last else True,
    }


def admit(phase: int, cap: float, reserve: dict) -> tuple[bool, float]:
    """Atomically reserve, or refuse when committed + bound would exceed the cap."""
    with locked():
        committed, _ = phase_committed(read_ledger(), phase)
        if committed + reserve["reserved_usd"] > cap + 1e-9:
            return False, committed
        append(reserve)
        return True, committed


# ---------------------------------------------------------------- providers (the only network code)


def http(method: str, url: str, headers: dict, body: bytes | None, timeout: float) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def multipart(fields: dict, files: dict) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
             for k, v in fields.items()]
    for k, (name, data, ctype) in files.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\n'
                     f"Content-Type: {ctype}\r\n\r\n".encode() + data + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def call_provider(config: dict, image: Path, size: tuple[int, int]) -> dict:
    """One HTTP call. Returns {http_status, output?, usage?, error?}; raises on transport failure."""
    timeout = config["retry"]["timeout_s"]
    if config["kind"] == "gpt":
        body, ctype = multipart(
            {"model": config["model"], "prompt": config["prompt"], "size": f"{size[0]}x{size[1]}",
             "quality": config["quality"], "output_format": config["output_format"], "n": "1"},
            {"image": (image.name, image.read_bytes(), "image/jpeg")},
        )
        status, raw = http("POST", config["endpoint"],
                           {"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"], "Content-Type": ctype},
                           body, timeout)
        res = json.loads(raw) if raw[:1] in (b"{", b"[") else {"raw": raw[:500].decode(errors="replace")}
        if status >= 300:
            return {"http_status": status, "error": res}
        return {"http_status": status, "output": base64.b64decode(res["data"][0]["b64_json"]),
                "usage": res.get("usage"), "response_model": res.get("model")}
    uri = "data:image/jpeg;base64," + base64.b64encode(image.read_bytes()).decode()
    status, raw = http("POST", config["endpoint"],
                       {"Authorization": "Key " + os.environ["FAL_KEY"], "X-Fal-Store-IO": "0",
                        "Content-Type": "application/json"},
                       json.dumps({"image_url": uri, "sync_mode": True, **config.get("extra", {})}).encode(),
                       timeout)
    res = json.loads(raw) if raw[:1] in (b"{", b"[") else {"raw": raw[:500].decode(errors="replace")}
    if status >= 300:
        return {"http_status": status, "error": res}
    img = res.get("images", [res.get("image")])[0]
    url = img["url"]
    data = base64.b64decode(url.split(",", 1)[1]) if url.startswith("data:") else http("GET", url, {}, None, timeout)[1]
    return {"http_status": status, "output": data, "usage": {"reported_size": [img.get("width"), img.get("height")]}}


def validate_output(config: dict, data: bytes, size: tuple[int, int]) -> tuple[bool, str, dict]:
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as e:  # noqa: BLE001 — any decode failure makes the result technically invalid
        return False, f"output does not decode: {e!r}", {}
    meta = {"format": im.format, "dimensions": list(im.size), "bytes": len(data),
            "icc_profile": bool(im.info.get("icc_profile"))}
    want_format = config["validity"]["format"]
    if im.format != want_format:
        return False, f"format {im.format}, frozen requirement {want_format}", meta
    if list(im.size) != list(size):
        return False, f"size {im.size[0]}×{im.size[1]}, frozen requirement {size[0]}×{size[1]}", meta
    return True, "", meta


# ---------------------------------------------------------------- series and prerequisites


def load_series(path: Path, config_sha: str, phase: int) -> dict:
    try:
        series = json.loads(path.read_text())
    except (OSError, ValueError) as e:
        raise protocol.Refused(f"cannot read series manifest {path}: {e}") from e
    if series.get("phase") != phase:
        raise protocol.Refused(f"{path} is the phase {series.get('phase')} series, not phase {phase}")
    if config_sha not in series.get("configs", {}):
        raise protocol.Refused(f"config {config_sha[:12]}… is not one of {path}'s expected configs")
    manifest_sha = protocol.sha256_file(protocol.manifest_path())
    if series.get("manifest_sha256") != manifest_sha:
        raise protocol.Refused(f"{path} was fixed against another benchmark manifest")
    return series


def check_prerequisites(series: dict, slots: list[dict]) -> None:
    """Only an explicit PASS for the named config satisfies a prerequisite; a STOP never does."""
    prereqs = {p["id"]: p for p in series.get("prerequisites", [])}
    for s in slots:
        for pid in s.get("requires", []):
            p = prereqs.get(pid)
            if p is None:
                raise protocol.Refused(f"slot {s['photo']}/{s['slot']} requires unknown prerequisite {pid!r}")
            report = protocol.resolve(p["report"])
            if not report.exists() or protocol.sha256_file(report) != p["report_sha256"]:
                raise protocol.Refused(f"prerequisite {pid}: {p['report']} is missing or not the fixed report")
            verdict = json.loads(report.read_text()).get("verdicts", {}).get(p["config_sha256"], {}).get("verdict")
            if verdict != "PASS":
                raise protocol.Refused(f"prerequisite {pid}: verdict {verdict!r} for config "
                                       f"{p['config_sha256'][:12]}…; only PASS permits this paid stage")


def input_for(photo: str, target: str) -> tuple[Path, dict]:
    sidecar = protocol.private_dir() / "inputs" / f"{photo}.json"
    if not sidecar.exists():
        raise protocol.Refused(f"{photo}: no prepared input ({sidecar}); run inputs.py first")
    meta = json.loads(sidecar.read_text())[target]
    return protocol.resolve(meta["path"]), meta


# ---------------------------------------------------------------- run


def run_slot(config: dict, config_sha: str, series: dict, spec: dict, phase: int, cap: float,
             sleep=time.sleep) -> str:
    """Drive one logical slot to a valid result, a terminal failure or a budget stop."""
    image, meta = input_for(spec["photo"], spec["input"])
    key = slot_key(config_sha, meta["sha256"], spec["photo"], spec["slot"])
    size = tuple(spec["request_size"])
    max_attempts = config["retry"]["max_retries"] + 1
    while True:
        rows = read_ledger()
        st = slot_state(rows, key)
        if st["ok"]:
            return "done"
        if st["terminal"]:
            return st["terminal"]["status"]
        if st["attempts"] >= max_attempts or not st["last_transient"]:
            reason = (f"{st['attempts']} attempt(s) used of {max_attempts}" if st["attempts"] >= max_attempts
                      else "last error was not transient")
            with locked():
                append({"event": "slot_terminal", "status": "technical_failure", "reason": reason, "at": now(),
                        "phase": phase, "series_id": series["series_id"], "config_sha256": config_sha,
                        "input_sha256": meta["sha256"], "photo": spec["photo"], "slot": spec["slot"]})
            return "technical_failure"
        if st["attempts"]:
            backoff = config["retry"]["backoff_s"]
            sleep(backoff[min(st["attempts"] - 1, len(backoff) - 1)])
        if protocol.sha256_file(image) != meta["sha256"]:
            raise protocol.Refused(f"{image} no longer matches its prepared hash")
        attempt_id = uuid.uuid4().hex
        reserve = {"event": "reserve", "attempt_id": attempt_id, "phase": phase, "series_id": series["series_id"],
                   "config_sha256": config_sha, "config_name": config["name"], "input_sha256": meta["sha256"],
                   "photo": spec["photo"], "slot": spec["slot"], "ordinal": st["attempts"] + 1,
                   "role": spec["role"], "request_size": list(size), "reserved_usd": spec["cost_bound_usd"],
                   "requested_at": now()}
        admitted, committed = admit(phase, cap, reserve)
        if not admitted:
            with locked():
                append({"event": "budget_refusal", "at": now(), "phase": phase, "series_id": series["series_id"],
                        "config_sha256": config_sha, "input_sha256": meta["sha256"], "photo": spec["photo"],
                        "slot": spec["slot"], "committed_usd": committed, "bound_usd": spec["cost_bound_usd"],
                        "cap_usd": cap})
            print(f"  {spec['photo']}/{spec['slot']}: NOT SENT — phase {phase} has ${committed:.2f} committed; "
                  f"this call's bound ${spec['cost_bound_usd']:.2f} would exceed the ${cap:g} cap. "
                  "Only an owner-approved numeric amendment raises it.")
            return "not_attempted_budget"
        t0 = time.time()
        result = {"event": "result", "attempt_id": attempt_id}
        try:
            res = call_provider(config, image, size)
        except Exception as e:  # noqa: BLE001 — a lost response may still be billed
            result.update(status=UNKNOWN, transient=True, error=repr(e), cost_usd=None,
                          cost_basis="unknown result, potential cost: full reservation kept")
        else:
            result["http_status"] = res["http_status"]
            if "error" in res:
                transient = res["http_status"] in config["retry"]["transient_http"]
                result.update(status=ERROR, transient=transient, error=res["error"], cost_usd=None,
                              cost_basis="error response: full reservation kept")
            else:
                data = res["output"]
                valid, why, out_meta = validate_output(config, data, size)
                cost = actual_cost(config, res.get("usage"))
                out_dir = protocol.private_dir() / "runs" / config["name"] / spec["photo"] / str(spec["slot"])
                out_dir.mkdir(parents=True, exist_ok=True)
                ext = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}.get(out_meta.get("format"), "bin")
                out_path = out_dir / f"{attempt_id}.{ext}"
                out_path.write_bytes(data)
                result.update(status=OK if valid else INVALID, transient=not valid, usage=res.get("usage"),
                              response_model=res.get("response_model"), cost_usd=cost,
                              cost_basis="reported usage × config rates" if cost is not None
                              else "no billed amount reported: full reservation kept",
                              output_sha256=protocol.sha256_bytes(data), output=out_meta,
                              output_path=str(out_path.relative_to(protocol.ROOT))
                              if out_path.is_relative_to(protocol.ROOT) else str(out_path))
                if not valid:
                    result["error"] = why
                if cost is not None and cost > spec["cost_bound_usd"]:
                    result["bound_exceeded"] = True
        result.update(finished_at=now(), wall_s=round(time.time() - t0, 2))
        with locked():
            append(result)
        print(f"  {spec['photo']}/{spec['slot']} attempt {reserve['ordinal']}: {result['status']}"
              f"{' — ' + str(result.get('error'))[:200] if result.get('error') else ''}")
        if result.get("bound_exceeded"):
            raise protocol.Refused(
                f"{spec['photo']}/{spec['slot']} cost ${result['cost_usd']:.4f}, above its bound "
                f"${spec['cost_bound_usd']:.2f}: the bound is not defensible, so no further call is made")


def main(argv: list[str] | None = None, sleep=time.sleep) -> int:
    ap = argparse.ArgumentParser(description="S-19 paid runner")
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--config", required=True)
    ap.add_argument("--phase", type=int, required=True, choices=(3, 5, 7))
    ap.add_argument("--series", required=True)
    ap.add_argument("--cap", type=float, required=True)
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all-validation", action="store_true")
    ap.add_argument("--validation", action="store_true")
    ap.add_argument("--access")
    args = ap.parse_args(argv)

    try:
        config_path = protocol.resolve(args.config)
        config = json.loads(config_path.read_text())
        config_sha = protocol.sha256_file(config_path)
        if args.all_validation and not args.validation:
            raise protocol.Refused("--all-validation needs --validation --access <release.json>")
        manifest = protocol.load_manifest()
        ids = protocol.select_ids(manifest, args.ids, False, args.all_validation)
        if not ids:
            raise protocol.Refused("no photos named")
        protocol.require_access(ids, validation=args.validation, access=args.access, config=args.config,
                                manifest=manifest)
        series = load_series(protocol.resolve(args.series), config_sha, args.phase)
        wanted = [(i, n) for i in ids for n in range(1, args.repeat + 1)]
        by = {(s["photo"], s["slot"]): s for s in series["slots"] if s["config_sha256"] == config_sha}
        missing = [f"{i}/{n}" for i, n in wanted if (i, n) not in by]
        if missing:
            raise protocol.Refused(f"slot(s) {', '.join(missing)} are not in {args.series} for this config")
        slots = [by[w] for w in wanted]
        rows = read_ledger()
        committed, unknown = phase_committed(rows, args.phase)
    except protocol.Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError) as e:
        print(f"refused: cannot use config/series: {e!r}", file=sys.stderr)
        return 1

    pending = []
    print(f"{config['name']} ({config_sha[:12]}…), phase {args.phase}, series {series['series_id']}, cap ${args.cap:g}; "
          f"ledger: ${committed:.2f} committed, {unknown} attempt(s) without a known cost")
    for s in slots:
        _, meta = input_for(s["photo"], s["input"])
        st = slot_state(rows, slot_key(config_sha, meta["sha256"], s["photo"], s["slot"]))
        state = "done" if st["ok"] else st["terminal"]["status"] if st["terminal"] else "pending"
        if state == "pending":
            pending.append(s)
        used = f" ({st['attempts']} attempt(s))" if st["attempts"] else ""
        print(f"  {s['photo']}/{s['slot']:<2} {s['role']:<9} {s['request_size'][0]}×{s['request_size'][1]}  "
              f"bound ${s['cost_bound_usd']:.2f}  {state}{used}")
    planned = round(sum(s["cost_bound_usd"] for s in pending), 2)
    print(f"requested: {len(pending)} slot(s) to send, bounded at ${planned:.2f}; "
          f"headroom ${args.cap - committed:.2f}")
    open_total = 0.0
    for s in series["slots"]:
        _, meta = input_for(s["photo"], s["input"])
        if not slot_state(rows, slot_key(s["config_sha256"], meta["sha256"], s["photo"], s["slot"]))["ok"]:
            open_total += s["cost_bound_usd"]
    fits = committed + open_total <= args.cap + 1e-9
    print(f"whole series {series['series_id']}: {len(series['slots'])} slot(s) across {len(series['configs'])} "
          f"config(s), unresolved bound ${open_total:.2f} → "
          f"{'fits' if fits else 'DOES NOT FIT'} the ${args.cap:g} cap with ${committed:.2f} committed")

    if args.dry_run:
        print("dry run: no network access, nothing reserved, no consent implied")
        return 0 if committed + planned <= args.cap + 1e-9 else 1
    if not args.resume and any(s not in pending for s in slots):
        print("refused: some slots already have results; pass --resume to fill only the missing ones",
              file=sys.stderr)
        return 1
    try:
        protocol.check_cap(args.phase, args.cap)
        check_prerequisites(series, pending)
    except protocol.Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1
    outcome = {}
    try:
        for s in pending:
            outcome[f"{s['photo']}/{s['slot']}"] = run_slot(config, config_sha, series, s, args.phase, args.cap, sleep)
    except protocol.Refused as e:
        print(f"stopped: {e}", file=sys.stderr)
        return 1
    committed, unknown = phase_committed(read_ledger(), args.phase)
    print(f"phase {args.phase} ledger: ${committed:.2f} committed, {unknown} without a known cost; "
          + ", ".join(f"{k} {v}" for k, v in outcome.items()))
    return 1 if "not_attempted_budget" in outcome.values() else 0


if __name__ == "__main__":
    sys.exit(main())
