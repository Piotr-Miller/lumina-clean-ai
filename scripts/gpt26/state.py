#!/usr/bin/env python3
"""GPT26 run-state reconciliation: offline, read-only, shared by runner, builder and gate.

Plan Phase 2, item 3. The expected set is the committed six-slot series, never the number of
images, ratings or key entries (lesson "A guard metric that only exists on success cannot
detect failure"). Every reserve/result row of the private ledger and every terminal record of
the versioned sidecar is matched to one expected slot and attempt; anything else is evidence
the record cannot explain, and the state is BLOCKED until it is resolved.

Spend is conservative: a known actual cost where a result reports one, the full reservation
otherwise (errors, lost responses, crashes, attempts still in flight). A result above its
bound, flagged or recomputed, is a persistent budget/protocol breach: no further send is
admitted, also after a resume or a valid PNG.

This module never touches the network and never writes. The runner owns the locked durable
reservations (`scripts/s19/run-candidate.py`) and the sidecar writes (`scripts/gpt26/run.py`).
"""

from __future__ import annotations

import dataclasses
import hashlib
import io
import math
from pathlib import Path

PHASE = 26
SIDECAR_VERSION = 1
# Terminal reasons only the sidecar records; technical failures are S-19 `slot_terminal` rows.
SIDECAR_REASONS = ("not_attempted_budget", "stopped_after_bound_breach")
# Every runtime file whose bytes decide what a paid run does. Pinned at the first reservation
# and required unchanged on resume (plan § Critical Implementation Details). Phase 3 extends it
# with the builder, gate and viewer before any run.
RULE_FILES = (
    "scripts/gpt26/run.py",
    "scripts/gpt26/state.py",
    "scripts/gpt26/check_series.py",
    "scripts/s19/run-candidate.py",
    "scripts/s19/protocol.py",
    "scripts/s19/inputs.py",
)
REGISTRATION_FILES = ("scripts/gpt26/configs/gpt26-low.json", "scripts/gpt26/series/screen.json")
OK, INVALID = "ok", "invalid"


@dataclasses.dataclass
class Slot:
    photo: str
    slot: int
    request_size: list[int]
    bound_usd: float
    attempts: list[dict] = dataclasses.field(default_factory=list)  # {"reserve", "result"|None}
    status: str = "pending"  # pending | delivered | undelivered
    reason: str | None = None
    output: dict | None = None

    @property
    def label(self) -> str:
        return f"{self.photo}/{self.slot}"


@dataclasses.dataclass
class RunState:
    slots: dict[tuple[str, int], Slot]
    max_attempts: int
    committed_usd: float = 0.0
    known_usd: float = 0.0
    unknown_attempts: int = 0
    errors: list[str] = dataclasses.field(default_factory=list)
    breaches: list[str] = dataclasses.field(default_factory=list)
    blocks: dict = dataclasses.field(default_factory=dict)
    walls: list[float] = dataclasses.field(default_factory=list)

    @property
    def blocked(self) -> bool:
        return bool(self.errors)

    @property
    def complete(self) -> bool:
        return not self.errors and all(s.status != "pending" for s in self.slots.values())

    @property
    def status(self) -> str:
        if self.errors:
            return "BLOCKED"
        return "complete" if self.complete else "incomplete"

    def pending(self) -> list[Slot]:
        return [s for s in self.slots.values() if s.status == "pending"]

    def open_bound(self) -> float:
        """The first-attempt bound of every slot still pending with an attempt left."""
        return round(sum(s.bound_usd for s in self.pending() if len(s.attempts) < self.max_attempts), 2)


def p95(values: list[float]) -> float | None:
    """Nearest-rank 95th percentile; None without values."""
    if not values:
        return None
    v = sorted(values)
    return v[max(0, math.ceil(0.95 * len(v)) - 1)]


def error_code(error) -> str | None:
    inner = error.get("error") if isinstance(error, dict) else None
    return inner.get("code") if isinstance(inner, dict) else None


def check_png(path: Path, sha256: str, size: list[int]) -> str | None:
    """None when the file is the recorded PNG at the requested size; else what is wrong."""
    try:
        data = path.read_bytes()
    except OSError as e:
        return f"output {path} cannot be read ({e.strerror or e})"
    if hashlib.sha256(data).hexdigest() != sha256:
        return f"output {path} no longer hashes to the recorded {sha256[:12]}…"
    try:
        from PIL import Image  # noqa: PLC0415 — only output checks need Pillow

        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as e:  # noqa: BLE001 — any decode failure is the finding
        return f"output {path} does not decode as an image ({type(e).__name__})"
    if im.format != "PNG":
        return f"output {path} is {im.format}, not PNG"
    if list(im.size) != list(size):
        return f"output {path} is {im.size[0]}×{im.size[1]}, not the requested {size[0]}×{size[1]}"
    return None


def reconcile(series: dict, config: dict, config_sha: str, rows: list[dict], sidecar: dict | None,
              *, root: Path, check_outputs: bool = True) -> RunState:
    """The normalized six-slot state the ledger and sidecar support, with every inconsistency."""
    max_attempts = int(config["retry"]["max_retries"]) + 1
    codes = list(config["retry"].get("retry_error_codes", []))
    slots: dict[tuple[str, int], Slot] = {}
    specs: dict[tuple[str, int], dict] = {}
    st = RunState(slots=slots, max_attempts=max_attempts)
    err = st.errors.append
    denominator = config.get("gate", {}).get("denominator", 6)
    for s in series.get("slots", []):
        key = (s.get("photo"), s.get("slot"))
        if s.get("config_sha256") != config_sha:
            err(f"series slot {key[0]}/{key[1]} names config {str(s.get('config_sha256'))[:12]}…, not "
                f"{config_sha[:12]}…")
            continue
        if key in slots:
            err(f"series slot {key[0]}/{key[1]} is registered twice")
            continue
        slots[key] = Slot(key[0], key[1], list(s["request_size"]), float(s["cost_bound_usd"]))
        specs[key] = s
    if len(slots) != denominator:
        err(f"the series registers {len(slots)} slot(s); the gate's denominator is always {denominator}")

    reserves: dict[str, dict] = {}
    results: dict[str, dict] = {}
    s19_terminal: dict[tuple[str, int], dict] = {}

    def slot_of(row: dict, what: str) -> tuple[str, int] | None:
        key = (row.get("photo"), row.get("slot"))
        if key not in slots:
            err(f"ledger {what} for {key[0]}/{key[1]} is not one of the six registered slots")
            return None
        spec = specs[key]
        if row.get("config_sha256") != config_sha or row.get("input_sha256") != spec["input_sha256"]:
            err(f"ledger {what} for {key[0]}/{key[1]} binds another config or input hash")
            return None
        if row.get("series_id") != series.get("series_id") or row.get("phase") != PHASE:
            err(f"ledger {what} for {key[0]}/{key[1]} belongs to series {row.get('series_id')!r} phase "
                f"{row.get('phase')!r}, not {series.get('series_id')!r} phase {PHASE}")
            return None
        return key

    for n, row in enumerate(rows, 1):
        event = row.get("event")
        if event == "reserve":
            aid = row.get("attempt_id")
            if not aid or aid in reserves:
                err(f"ledger row {n}: reserve without a unique attempt id ({aid!r})")
                continue
            key = slot_of(row, f"reserve {aid}")
            if key is None:
                continue
            usd = row.get("reserved_usd")
            if isinstance(usd, bool) or not isinstance(usd, (int, float)):
                err(f"ledger row {n}: {slots[key].label} reservation has no numeric reserved_usd ({usd!r})")
                continue
            if abs(usd - slots[key].bound_usd) > 1e-9:
                err(f"ledger row {n}: {slots[key].label} reserved ${usd}, the series bound is "
                    f"${slots[key].bound_usd:.2f}")
            if list(row.get("request_size") or []) != slots[key].request_size:
                err(f"ledger row {n}: {slots[key].label} reserved size {row.get('request_size')}, the series froze "
                    f"{slots[key].request_size}")
            reserves[aid] = row
            slots[key].attempts.append({"reserve": row, "result": None})
        elif event == "result":
            aid = row.get("attempt_id")
            if aid not in reserves:
                err(f"ledger row {n}: result for attempt {aid!r}, which has no reservation")
            elif aid in results:
                err(f"ledger row {n}: a second result for attempt {aid}")
            else:
                results[aid] = row
        elif event == "slot_terminal":
            key = slot_of(row, "slot_terminal")
            if key is None:
                continue
            if key in s19_terminal:
                err(f"ledger row {n}: a second slot_terminal for {slots[key].label}")
            s19_terminal[key] = row
        elif event == "budget_refusal":
            slot_of(row, "budget_refusal")
        else:
            err(f"ledger row {n}: unknown event {event!r}")

    side_terminal: dict[tuple[str, int], dict] = {}
    if sidecar is not None:
        if sidecar.get("version") != SIDECAR_VERSION:
            err(f"run-state sidecar version {sidecar.get('version')!r}, this reader knows {SIDECAR_VERSION}")
        if sidecar.get("series_id") != series.get("series_id") or sidecar.get("config_sha256") != config_sha:
            err("run-state sidecar belongs to another series or config")
        for t in sidecar.get("terminal", []):
            key = (t.get("photo"), t.get("slot"))
            if key not in slots:
                err(f"sidecar terminal record for {key[0]}/{key[1]} is not one of the six registered slots")
            elif key in side_terminal:
                err(f"sidecar has two terminal records for {slots[key].label}")
            elif t.get("status") != "undelivered" or t.get("reason") not in SIDECAR_REASONS:
                err(f"sidecar terminal record for {slots[key].label} is {t.get('status')!r}/{t.get('reason')!r}")
            else:
                side_terminal[key] = t

    for key, slot in slots.items():
        for a in slot.attempts:
            a["result"] = results.get(a["reserve"]["attempt_id"])
        slot.attempts.sort(key=lambda a: a["reserve"].get("ordinal", 0))
        ordinals = [a["reserve"].get("ordinal") for a in slot.attempts]
        if ordinals != list(range(1, len(ordinals) + 1)):
            err(f"{slot.label}: attempt ordinals {ordinals} are not 1..{len(ordinals)}")
        if len(slot.attempts) > max_attempts:
            err(f"{slot.label}: {len(slot.attempts)} reservations, at most {max_attempts} attempts are allowed")
        oks = [i for i, a in enumerate(slot.attempts) if (a["result"] or {}).get("status") == OK]
        if len(oks) > 1 or (oks and oks[0] != len(slot.attempts) - 1):
            err(f"{slot.label}: an attempt was reserved after a delivered output")
        for a in slot.attempts:
            res, rv = a["result"], a["reserve"]
            cost = (res or {}).get("cost_usd")
            known = isinstance(cost, (int, float)) and not isinstance(cost, bool)
            if known:
                st.known_usd += cost
                st.committed_usd += cost
            else:
                st.committed_usd += float(rv["reserved_usd"])
                st.unknown_attempts += 1
            over = known and cost > float(rv["reserved_usd"]) + 1e-9
            if over or (res or {}).get("bound_exceeded"):
                shown = f"cost ${cost:.4f}" if known else "flagged bound_exceeded"
                st.breaches.append(f"{slot.label} attempt {rv.get('ordinal')}: {shown} above its bound "
                                   f"${float(rv['reserved_usd']):.2f}")
            if res and isinstance(res.get("wall_s"), (int, float)):
                st.walls.append(float(res["wall_s"]))
        if oks:
            ok = slot.attempts[oks[0]]["result"]
            slot.status, slot.output = "delivered", ok
            if key in s19_terminal or key in side_terminal:
                err(f"{slot.label}: delivered, yet a terminal undelivered record exists")
            if check_outputs:
                problem = check_png(root / ok.get("output_path", ""), ok.get("output_sha256", ""), slot.request_size)
                if problem:
                    err(f"{slot.label}: {problem} — evidence changed after delivery; BLOCKED until restored")
        elif key in s19_terminal:
            slot.status, slot.reason = "undelivered", f"technical_failure: {s19_terminal[key].get('reason')}"
            last = (slot.attempts[-1]["result"] or {}) if slot.attempts else {}
            if last.get("status") == INVALID:
                slot.reason = f"invalid_output: {last.get('error')}"
            if key in side_terminal:
                err(f"{slot.label}: both an S-19 slot_terminal and a sidecar terminal record")
        elif key in side_terminal:
            slot.status, slot.reason = "undelivered", side_terminal[key]["reason"]
    st.committed_usd = round(st.committed_usd, 6)
    st.known_usd = round(st.known_usd, 6)

    first_blocks = recovered = final = 0
    for slot in slots.values():
        done = [a for a in slot.attempts if a["result"]]
        if not done or error_code(done[0]["result"].get("error")) not in codes:
            continue
        first_blocks += 1
        if slot.status == "delivered":
            recovered += 1
        elif slot.status == "undelivered":
            final += 1
    st.blocks = {"codes": codes, "first_attempt_blocks": first_blocks, "recovered_by_retry": recovered,
                 "final_undelivered_after_block": final}
    return st


def admission_refusal(st: RunState, photo: str, slot: int) -> str | None:
    """Why the next reservation for `photo/slot` must not be made, or None."""
    if st.errors:
        return "the run record is inconsistent: " + "; ".join(st.errors[:3])
    if st.breaches:
        return "a call exceeded its cost bound, so no further call is made: " + "; ".join(st.breaches)
    s = st.slots.get((photo, slot))
    if s is None:
        return f"{photo}/{slot} is not a registered slot"
    if s.status != "pending":
        return f"{s.label} is already {s.status}"
    if len(s.attempts) >= st.max_attempts:
        return f"{s.label} has used all {st.max_attempts} attempts"
    return None


def check_bindings(recorded: dict, current: dict) -> list[str]:
    """What differs between the identities pinned at the first reservation and now."""
    out = []
    if recorded.get("registration_commit") != current.get("registration_commit"):
        out.append(f"registration commit {str(recorded.get('registration_commit'))[:12]}… was pinned, the "
                   f"checkout registers {str(current.get('registration_commit'))[:12]}…")
    rec, cur = recorded.get("files", {}), current.get("files", {})
    for path in sorted(set(rec) | set(cur)):
        if rec.get(path) != cur.get(path):
            out.append(f"{path}: pinned blob {str(rec.get(path))[:12]}…, now {str(cur.get(path))[:12]}…")
    return out
