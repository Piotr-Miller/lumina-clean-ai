#!/usr/bin/env python3
"""GPT26 screen runner: six registered slots, one private ledger, the owner's single approval.

  python3 scripts/gpt26/run.py --cap 1.50 [--dry-run] [--resume]

Plan Phase 2, item 2. The six slots of `scripts/gpt26/series/screen.json` are driven through
the S-19 slot logic (`scripts/s19/run-candidate.py`) with a context of their own: the ledger
`test-photos/private/gpt26/attempts.jsonl`, outputs under `test-photos/private/gpt26/runs/`,
inputs read from the S-19 prepared inputs `test-photos/private/s19/inputs/`. Nothing of S-19's
ledger, approvals or outputs is read or written.

Before any reservation a paid run refuses unless:
  - the config, the series, change.md and every rule file (`state.RULE_FILES`) are tracked,
    committed and clean in the Git checkout this code runs from;
  - change.md § GPT26 approvals holds exactly one well-formed
    `- GPT26-SPEND cap_usd=1.50 decision=approved date=YYYY-MM-DD` line whose cap equals --cap;
  - OPENAI_API_KEY is set (only when a slot is still to be sent).
The first paid run pins HEAD, the registration commit and the blob of every registration and
rule file in the versioned sidecar `test-photos/private/gpt26/run-state.json`; a resume must
match them. The same sidecar carries the terminal records S-19 rows do not express: a slot the
cap could not admit (`not_attempted_budget`) and slots stopped after a cost-bound breach.

A slot has at most two attempts. A moderation block or a transient HTTP/timeout failure is
retried once with identical input, within the cap; an invalid PNG is not retried and the slot
is undelivered. Every admission re-reconciles the whole record (`state.reconcile`) inside the
ledger lock: an inconsistency or any cost-bound breach refuses the reservation.

--dry-run reads the same record and reports state and readiness without network access,
reservation, terminal records or any file change, and implies no consent.

Exit status: 0 all six slots resolved and the cost/protocol checks pass (not a visual PASS);
1 refused, unresolved, BLOCKED, or stopped by a budget/protocol breach; 2 usage.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as _dt
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import check_series  # noqa: E402
import state  # noqa: E402


def _load_runner():
    spec = importlib.util.spec_from_file_location("s19_run_candidate", ROOT / "scripts" / "s19" / "run-candidate.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


runner = _load_runner()
protocol = runner.protocol
Refused = protocol.Refused

CONFIG, SERIES = state.REGISTRATION_FILES
CHANGE_MD = "context/changes/gpt-image-26-screen/change.md"
APPROVAL_SECTION = "GPT26 approvals"
SPEND_LINE = re.compile(r"^- GPT26-SPEND cap_usd=(\d+\.\d{2}) decision=(approved|declined) date=(\d{4}-\d{2}-\d{2})$")
# Git variables that would point a subprocess at another repository, index or work tree.
GIT_ENV = ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR",
           "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CEILING_DIRECTORIES")
GUARDRAIL_P95_S = 30


@dataclasses.dataclass(frozen=True)
class Paths:
    root: Path
    private: Path
    inputs: Path

    @property
    def sidecar(self) -> Path:
        return self.private / "run-state.json"

    @property
    def local(self) -> Path:
        """The real Local downloads, next to the prepared inputs (`private/s19/local/`)."""
        return self.inputs.parent / "local"


def default_paths() -> Paths:
    """Derived from the executing code only — never from an S19_* or other environment override."""
    return Paths(ROOT, ROOT / "test-photos" / "private" / "gpt26", ROOT / "test-photos" / "private" / "s19" / "inputs")


# ---------------------------------------------------------------- git (registration and rule identity)


def git(root: Path, *args: str) -> tuple[int, str]:
    env = {k: v for k, v in os.environ.items() if k not in GIT_ENV}
    r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, env=env)
    return r.returncode, (r.stdout if r.returncode == 0 else r.stderr).strip()


def git_root(start: Path) -> Path:
    rc, out = git(start, "rev-parse", "--show-toplevel")
    if rc != 0:
        raise Refused(f"{start} is not inside a Git checkout ({out}): a paid run needs its committed registration")
    return Path(out).resolve()


def check_registration(root: Path, *, include_approval: bool = True) -> dict:
    """Identities of the registration and rule files, or Refused naming each file and its state."""
    top = git_root(root)
    if top != root.resolve():
        raise Refused(f"this code runs from {root}, but its Git checkout is {top}: run it from that checkout")
    problems = []
    for rel in (*state.REGISTRATION_FILES, *state.RULE_FILES, *((CHANGE_MD,) if include_approval else ())):
        if git(root, "ls-files", "--error-unmatch", "--", rel)[0] != 0:
            problems.append(f"{rel}: untracked")
            continue
        if git(root, "cat-file", "-e", f"HEAD:{rel}")[0] != 0:
            problems.append(f"{rel}: staged but never committed")
            continue
        rc, out = git(root, "status", "--porcelain=v1", "--untracked-files=all", "--", rel)
        if rc != 0 or out:
            problems.append(f"{rel}: {'uncommitted changes (' + out[:2].strip() + ')' if rc == 0 else out}")
    if problems:
        raise Refused("registration and rule files must be tracked, committed and clean before any reservation:\n    "
                      + "\n    ".join(problems) + "\n  commit them (or restore them), then rerun — nothing reserved or sent")
    files = {rel: git(root, "rev-parse", f"HEAD:{rel}")[1] for rel in (*state.REGISTRATION_FILES, *state.RULE_FILES)}
    rc, reg = git(root, "log", "-1", "--format=%H", "--", *state.REGISTRATION_FILES)
    return {"head": git(root, "rev-parse", "HEAD")[1], "registration_commit": reg if rc == 0 else None, "files": files}


# ---------------------------------------------------------------- approval


def spend_approval(text: str, cap: float) -> str:
    """The owner's single GPT26-SPEND line for exactly `cap`, or Refused. HTML comments (the
    grammar example) are not records."""
    protocol.require_cap(cap)
    lines, in_comment, section, found, found_section = text.splitlines(), False, None, [], False
    for n, line in enumerate(lines, 1):
        if in_comment:
            in_comment = "-->" not in line
            continue
        if line.lstrip().startswith("<!--"):
            in_comment = "-->" not in line
            continue
        if line.startswith("## "):
            section = line[3:].strip()
            found_section = found_section or section == APPROVAL_SECTION
            continue
        if "GPT26-" not in line:
            continue
        if section != APPROVAL_SECTION:
            if line.startswith("- GPT26-SPEND"):
                raise Refused(f"change.md line {n}: a GPT26-SPEND line outside § {APPROVAL_SECTION} — move or "
                              "remove it; nothing reserved or sent")
            continue
        if not SPEND_LINE.match(line):
            raise Refused(f"change.md line {n}: {line.strip()!r} is not the grammar "
                          "`- GPT26-SPEND cap_usd=1.50 decision=approved date=YYYY-MM-DD` — nothing reserved or sent")
        found.append((n, SPEND_LINE.match(line)))
    if not found_section:
        raise Refused(f"change.md has no § {APPROVAL_SECTION}: no paid call without the owner's approval")
    if not found:
        raise Refused(f"no GPT26-SPEND line in change.md § {APPROVAL_SECTION}: the owner writes and commits it "
                      "before any paid call")
    if len(found) > 1:
        raise Refused(f"{len(found)} GPT26-SPEND lines (change.md lines {', '.join(str(n) for n, _ in found)}): "
                      "keep exactly one")
    n, m = found[0]
    if m.group(2) != "approved":
        raise Refused(f"the GPT26 spend is {m.group(2)} (change.md line {n}): no paid call")
    if not abs(float(m.group(1)) - cap) <= 1e-9:
        raise Refused(f"--cap {cap:g} does not match the owner-approved cap of ${m.group(1)} (change.md line {n})")
    return m.group(0)


# ---------------------------------------------------------------- registration, sidecar, context


def load_registration(root: Path) -> tuple[dict, str, dict]:
    def read(rel):
        try:
            raw = (root / rel).read_bytes()
            return raw, json.loads(raw.decode("utf-8"))
        except (OSError, UnicodeDecodeError, ValueError) as e:
            raise Refused(f"{rel}: cannot read ({e}) — restore it from Git") from e

    config_raw, config = read(CONFIG)
    _, series = read(SERIES)
    _, phase5 = read(check_series.PHASE5_CONFIG)
    _, phase5_series = read(check_series.PHASE5_SERIES)
    config_sha = hashlib.sha256(config_raw).hexdigest()
    calc = check_series.check_calculation_config(config)
    errs = check_series.check_config(config, phase5) + calc
    if not calc:
        errs += check_series.check_series(series, config, config_sha, phase5_series)
    if errs:
        raise Refused(f"the registration does not check ({len(errs)} discrepancy(ies)): " + "; ".join(errs[:4])
                      + " — run python3 scripts/gpt26/check_series.py")
    runner.request_fields(config)
    return config, config_sha, series


def read_sidecar(paths: Paths) -> dict | None:
    try:
        return json.loads(paths.sidecar.read_text())
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as e:
        raise Refused(f"{paths.sidecar} is not readable JSON ({e}): repair it before any call") from e


def write_sidecar(paths: Paths, data: dict) -> None:
    paths.sidecar.parent.mkdir(parents=True, exist_ok=True)
    tmp = paths.sidecar.with_suffix(".tmp")
    with open(tmp, "w") as f:
        f.write(json.dumps(data, indent=2, sort_keys=True) + "\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, paths.sidecar)


def now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Screen:
    """One run of the screen: its registration, paths and S-19 context."""

    def __init__(self, paths: Paths, cap: float):
        self.paths, self.cap = paths, cap
        self.config, self.config_sha, self.series = load_registration(paths.root)
        self.ctx = runner.RunContext(
            ledger_dir=paths.private, output_dir=paths.private, input_dir=paths.inputs,
            approve=lambda _phase, c: spend_approval((paths.root / CHANGE_MD).read_text(), c),
            admission_check=self.admission_check, invalid_output_is_transient=False)

    def reconcile(self, rows: list[dict] | None = None, sidecar: dict | None = None,
                  use_disk_sidecar: bool = True) -> state.RunState:
        rows = runner.read_ledger(self.ctx) if rows is None else rows
        if sidecar is None and use_disk_sidecar:
            sidecar = read_sidecar(self.paths)
        expected_bindings = check_registration(self.paths.root, include_approval=False) if sidecar is not None else None
        return state.reconcile(self.series, self.config, self.config_sha, rows, sidecar, root=self.paths.root,
                               expected_bindings=expected_bindings)

    def admission_check(self, rows: list[dict], reserve: dict) -> None:
        """Runs inside the ledger lock, on the rows the reservation would be appended to."""
        st = self.reconcile(rows)
        why = state.admission_refusal(st, reserve["photo"], reserve["slot"])
        if why:
            raise Refused(f"{reserve['photo']}/{reserve['slot']}: {why} — nothing reserved or sent")

    def new_sidecar(self, bindings: dict) -> dict:
        return {"version": state.SIDECAR_VERSION, "series_id": self.series["series_id"],
                "config_sha256": self.config_sha, "bindings": {**bindings, "pinned_at": now()}, "terminal": []}

    def mark_terminal(self, photo: str, slot: int, reason: str) -> None:
        with runner.locked(self.ctx):
            sc = read_sidecar(self.paths)
            if sc is None:
                raise Refused(f"{photo}/{slot}: no run-state sidecar to record {reason} in")
            if any((t["photo"], t["slot"]) == (photo, slot) for t in sc["terminal"]):
                return
            sc["terminal"].append({"photo": photo, "slot": slot, "status": "undelivered", "reason": reason, "at": now()})
            write_sidecar(self.paths, sc)

    def stop_after_breach(self, st: state.RunState) -> None:
        for s in st.pending():
            self.mark_terminal(s.photo, s.slot, "stopped_after_bound_breach")


# ---------------------------------------------------------------- reporting


def print_state(st: state.RunState, cap: float) -> None:
    for s in st.slots.values():
        tail = f" — {s.reason}" if s.reason else ""
        print(f"  {s.label:<9} {s.request_size[0]}×{s.request_size[1]}  bound ${s.bound_usd:.2f}  "
              f"{s.status}{tail} ({len(s.attempts)} attempt(s))")
    print(f"spend: ${st.committed_usd:.2f} committed (known cost, else the full reservation), "
          f"${st.known_usd:.4f} known billed, {st.unknown_attempts} attempt(s) without a known cost; cap ${cap:.2f}")
    for b in st.breaches:
        print(f"  BOUND BREACH: {b}")
    for e in st.errors:
        print(f"  BLOCKED: {e}")


def print_summary(st: state.RunState, cap: float) -> None:
    delivered = [s.label for s in st.slots.values() if s.status == "delivered"]
    undelivered = [f"{s.label} ({s.reason})" for s in st.slots.values() if s.status == "undelivered"]
    pending = [s.label for s in st.pending()]
    print(f"summary: {len(delivered)} delivered [{', '.join(delivered)}]; {len(undelivered)} undelivered "
          f"[{', '.join(undelivered)}]; {len(pending)} unresolved [{', '.join(pending)}]")
    b = st.blocks
    print(f"  {'/'.join(b['codes']) or 'blocks'}: {b['first_attempt_blocks']} first-attempt block(s), "
          f"{b['recovered_by_retry']} recovered by the retry, {b['final_undelivered_after_block']} final undelivered")
    walls = ", ".join(f"{w:g}" for w in st.walls) or "none"
    p = state.p95(st.walls)
    print(f"  wall time per call (s): {walls}; p95 {'n/a' if p is None else f'{p:g} s'} vs the "
          f"{GUARDRAIL_P95_S} s guardrail (diagnostic only)")
    print(f"  spend ${st.committed_usd:.2f} committed of the ${cap:.2f} cap; protocol "
          f"{'BREACHED' if st.breaches else 'BLOCKED' if st.errors else 'ok'}")


# ---------------------------------------------------------------- CLI


def dry_run(screen: Screen, st: state.RunState) -> int:
    paths, cap = screen.paths, screen.cap
    for label, check in (
        ("registration", lambda: check_registration(paths.root) and "tracked, committed and clean"),
        ("approval", lambda: f"{spend_approval((paths.root / CHANGE_MD).read_text(), cap)}"),
    ):
        try:
            print(f"  {label}: {check()}")
        except (Refused, OSError) as e:
            print(f"  {label}: a paid run would refuse — {e}")
    print(f"  key: OPENAI_API_KEY {'set' if os.environ.get('OPENAI_API_KEY') else 'not set (a paid run would refuse)'}")
    inputs_ok = True
    for spec in screen.series["slots"]:
        if (spec["photo"], spec["slot"]) not in {(s.photo, s.slot) for s in st.pending()}:
            continue
        try:
            image, meta = runner.input_for(spec["photo"], spec["input"], screen.ctx)
            runner.check_slot_frozen(screen.config, spec, meta)
            if protocol.sha256_file(image) != spec["input_sha256"]:
                raise Refused(f"{image} does not hash to the frozen {spec['input_sha256'][:12]}…")
            print(f"  input {spec['photo']}/{spec['slot']}: verified sha256 {spec['input_sha256'][:12]}…")
        except (Refused, OSError, KeyError, ValueError) as e:
            inputs_ok = False
            print(f"  input {spec['photo']}/{spec['slot']}: NOT READY — {e}")
    planned = st.open_bound()
    fits = st.committed_usd + planned <= cap + 1e-9
    print(f"dry run: {len(st.pending())} pending slot(s) bounded at ${planned:.2f} on ${st.committed_usd:.2f} "
          f"committed → {'fits' if fits else 'DOES NOT FIT'} the ${cap:.2f} cap. No network access, nothing "
          "reserved, no file changed, no consent implied")
    return 0 if fits and inputs_ok else 1


def main(argv: list[str] | None = None, *, paths: Paths | None = None, sleep=time.sleep) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="GPT26 screen runner")
    ap.add_argument("--cap", type=float, required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--resume", action="store_true")
    args = ap.parse_args(argv)
    paths = paths or default_paths()
    try:
        protocol.require_cap(args.cap)
        screen = Screen(paths, args.cap)
        st = screen.reconcile()
    except Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1
    print(f"{screen.config['name']} ({screen.config_sha[:12]}…), series {screen.series['series_id']}, "
          f"ledger {runner.ledger_path(screen.ctx)}, cap ${args.cap:.2f}; record {st.status}")
    print_state(st, args.cap)
    if st.errors:
        print("refused: the run record is BLOCKED — " + "; ".join(st.errors)
              + " — resolve every item before any call", file=sys.stderr)
        return 1
    if args.dry_run:
        return dry_run(screen, st)

    started = any(s.attempts or s.status != "pending" for s in st.slots.values())
    if started and not args.resume:
        print("refused: this screen already has attempts; pass --resume to finish only the unresolved slots",
              file=sys.stderr)
        return 1
    try:
        bindings = check_registration(paths.root)
        screen.ctx.approve(state.PHASE, args.cap)
        sidecar = read_sidecar(paths)
        if sidecar is not None:
            diffs = state.check_bindings(sidecar.get("bindings", {}), bindings)
            if diffs:
                raise Refused("the registration or rules changed since this run was pinned:\n    "
                              + "\n    ".join(diffs) + "\n  a resume needs the identical registration and rules")
        elif started:
            raise Refused(f"the ledger has attempts but {paths.sidecar} is missing: the run's pinned identities are "
                          "unknown, so it cannot be resumed — restore the sidecar")
        if st.pending() and not st.breaches:
            runner.require_key(screen.config)
        if sidecar is None:
            with runner.locked(screen.ctx):
                if read_sidecar(paths) is None:
                    write_sidecar(paths, screen.new_sidecar(bindings))
    except Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1

    stopped: Exception | None = None
    if st.breaches:
        stopped = Refused("a call exceeded its cost bound: no further call is made")
    else:
        pending = {(s.photo, s.slot) for s in st.pending()}
        for spec in screen.series["slots"]:
            if (spec["photo"], spec["slot"]) not in pending:
                continue
            if st.slots[(spec["photo"], spec["slot"])].budget_refusal is not None:
                screen.mark_terminal(spec["photo"], spec["slot"], "not_attempted_budget")
                continue
            try:
                outcome = runner.run_slot(screen.config, screen.config_sha, screen.series, spec, state.PHASE,
                                          args.cap, sleep, screen.ctx)
            except Refused as e:
                stopped = e
                break
            if outcome == "not_attempted_budget":
                screen.mark_terminal(spec["photo"], spec["slot"], "not_attempted_budget")
    st = screen.reconcile()
    if st.breaches:
        screen.stop_after_breach(st)
        st = screen.reconcile()
    if stopped:
        print(f"stopped: {stopped}", file=sys.stderr)
    print_state(st, args.cap)
    print_summary(st, args.cap)
    return 0 if st.complete and not st.breaches and stopped is None else 1


if __name__ == "__main__":
    sys.exit(main())
