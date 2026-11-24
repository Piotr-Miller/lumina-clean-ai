#!/usr/bin/env python3
"""GPT26 study runner: the study's registered slots, one private ledger, the owner's single approval.

  python3 scripts/gpt26/run.py --config <config> --cap <usd> [--dry-run | --resume | --report]

The config's `study` object (`study.py`) names the change, the series and the private root. Its
slots are driven through the S-19 slot logic (`scripts/s19/run-candidate.py`) with a context of
their own: the ledger `<private_root>/attempts.jsonl`, outputs under `<private_root>/runs/`,
inputs read from the S-19 prepared inputs `test-photos/private/s19/inputs/`. Nothing of S-19's
ledger, approvals or outputs is read or written, and no other study's private root.

Before any reservation a paid run refuses unless:
  - the config, the series, the study's change.md and every rule file (`Study.rule_files`) are
    tracked, committed and clean in the Git checkout this code runs from;
  - change.md § GPT26 approvals holds exactly one well-formed
    `- GPT26-SPEND cap_usd=<cap> decision=approved date=YYYY-MM-DD` line whose cap equals --cap;
  - OPENAI_API_KEY is set (only when a slot is still to be sent).
The first paid run pins HEAD, the registration commit and the blob of every registration and
rule file in the versioned sidecar `<private_root>/run-state.json`; a resume must match the
blobs (HEAD and the registration commit are provenance only, so a rebase that keeps the bytes
keeps the run resumable). The same sidecar carries the terminal records S-19 rows do not
express: a slot the cap could not admit (`not_attempted_budget`) and slots stopped after a
cost-bound breach.

A slot has at most two attempts. A moderation block or a transient HTTP/timeout failure is
retried once with identical input, within the cap; an invalid PNG is not retried and the slot
is undelivered. Every admission re-reconciles the whole record (`state.reconcile`) inside the
ledger lock: an inconsistency or any cost-bound breach refuses the reservation.

--dry-run reads the same record and reports state and readiness without network access,
reservation, terminal records or any file change, and implies no consent.

--report reads the committed study, the approval and the existing private run record and writes
the reconciled summary to `<study.change_dir>/evaluations/run.md`: every slot's status and
terminal reason, known billed and conservative spend, unknown reservations, blocks and
recoveries, per-call wall time and p95, and any unresolved, BLOCKED or breached state. It never
calls the provider, needs no API key, makes no reservation and writes nothing to the ledger or
the sidecar.

Exit status: 0 all slots resolved and the cost/protocol checks pass (not a visual PASS), or with
--report the report was written; 1 refused, unresolved, BLOCKED, stopped by a budget/protocol
breach, or no report written; 2 usage.
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
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import check_series  # noqa: E402
import state  # noqa: E402
import study as study_mod  # noqa: E402


def _load_runner():
    spec = importlib.util.spec_from_file_location("s19_run_candidate", ROOT / "scripts" / "s19" / "run-candidate.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


runner = _load_runner()
protocol = runner.protocol
Refused = protocol.Refused

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


def load_study(root: Path, config_arg) -> study_mod.Study:
    try:
        return study_mod.load(root, config_arg)[0]
    except study_mod.StudyError as e:
        raise Refused(f"the study is not valid: {e} — run python3 scripts/gpt26/check_series.py --config "
                      f"{config_arg}") from e


def study_paths(root: Path, study: study_mod.Study) -> Paths:
    """Derived from the executing checkout and the validated study only — never from an S19_* or
    other environment override. Runner, builder and gate all derive their paths here."""
    return Paths(root, root / study.private_root, root / study_mod.S19_INPUTS)


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


def check_registration(root: Path, study: study_mod.Study, *, include_approval: bool = True) -> dict:
    """Identities of the study's registration and rule files, or Refused naming each file and its state."""
    top = git_root(root)
    if top != root.resolve():
        raise Refused(f"this code runs from {root}, but its Git checkout is {top}: run it from that checkout")
    problems = []
    for rel in (*study.binding_files, *((study.change_md,) if include_approval else ())):
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
    files = {rel: git(root, "rev-parse", f"HEAD:{rel}")[1] for rel in study.binding_files}
    rc, reg = git(root, "log", "-1", "--format=%H", "--", *study.registration_files)
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


def load_registration(root: Path, study: study_mod.Study) -> tuple[dict, str, dict]:
    def read(rel):
        try:
            raw = (root / rel).read_bytes()
            return raw, json.loads(raw.decode("utf-8"))
        except (OSError, UnicodeDecodeError, ValueError) as e:
            raise Refused(f"{rel}: cannot read ({e}) — restore it from Git") from e

    config_raw, config = read(study.config)
    try:
        if study_mod.from_config(root, study.config, config) != study:
            raise Refused(f"{study.config} changed while it was being read: rerun")
    except study_mod.StudyError as e:
        raise Refused(f"the study is not valid: {e}") from e
    _, series = read(study.series)
    _, phase5 = read(check_series.PHASE5_CONFIG)
    _, phase5_series = read(check_series.PHASE5_SERIES)
    config_sha = hashlib.sha256(config_raw).hexdigest()
    calc = check_series.check_calculation_config(config, study.config)
    errs = check_series.check_config(config, phase5, study, root) + calc
    if not calc:
        errs += check_series.check_series(series, config, config_sha, phase5_series, study)
    if errs:
        raise Refused(f"the registration does not check ({len(errs)} discrepancy(ies)): " + "; ".join(errs[:4])
                      + f" — run python3 scripts/gpt26/check_series.py --config {study.config}")
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


class Session:
    """One run of a study: its registration, paths and S-19 context."""

    def __init__(self, paths: Paths, study: study_mod.Study, cap: float):
        self.paths, self.study, self.cap = paths, study, cap
        self.config, self.config_sha, self.series = load_registration(paths.root, study)
        self.ctx = runner.RunContext(
            ledger_dir=paths.private, output_dir=paths.private, input_dir=paths.inputs,
            approve=lambda _phase, c: spend_approval((paths.root / study.change_md).read_text(), c),
            admission_check=self.admission_check, invalid_output_is_transient=False)

    def reconcile(self, rows: list[dict] | None = None, sidecar: dict | None = None,
                  use_disk_sidecar: bool = True) -> state.RunState:
        rows = runner.read_ledger(self.ctx) if rows is None else rows
        if sidecar is None and use_disk_sidecar:
            sidecar = read_sidecar(self.paths)
        expected_bindings = (check_registration(self.paths.root, self.study, include_approval=False)
                             if sidecar is not None else None)
        return state.reconcile(self.series, self.config, self.config_sha, rows, sidecar, root=self.paths.root,
                               study=self.study, expected_bindings=expected_bindings)

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


def md_table(header: list[str], rows: list[list[str]]) -> list[str]:
    """A Markdown table padded the way Prettier pads it, so a re-run stays byte-identical."""

    def width(cell: str) -> int:
        return sum(1 for ch in cell if not unicodedata.combining(ch))

    cols = [max(3, *(width(r[i]) for r in [header, *rows])) for i in range(len(header))]

    def line(cells: list[str]) -> str:
        return "| " + " | ".join(c + " " * (cols[i] - width(c)) for i, c in enumerate(cells)) + " |"

    return [line(header), "| " + " | ".join("-" * w for w in cols) + " |", *(line(r) for r in rows)]


def report_md(session: Session, st: state.RunState, cap: float, approval: str) -> str:
    """The reconciled run summary for `evaluations/run.md` (plan Phase 1 §4). Deterministic: the
    same record gives the same bytes, so a rerun is a no-op."""
    study = session.study
    walls = ", ".join(f"{w:g}" for w in st.walls) or "none"
    p = state.p95(st.walls)
    b = st.blocks
    pending = [s.label for s in st.pending()]
    rows = []
    for s in st.slots.values():
        times = [a["result"]["wall_s"] for a in s.attempts
                 if a["result"] and isinstance(a["result"].get("wall_s"), (int, float))]
        unknown = sum(1 for a in s.attempts if not state.valid_amount((a["result"] or {}).get("cost_usd")))
        rows.append([s.label, f"{s.request_size[0]}×{s.request_size[1]}", f"${s.bound_usd:.2f}", s.status,
                     s.reason or ("—" if s.status != "pending" else "unresolved"), str(len(s.attempts)),
                     str(unknown), ", ".join(f"{t:g}" for t in times) or "—"])
    lines = [f"# GPT26 run — `{study.series_id}`", "",
             f"Written by `python3 scripts/gpt26/run.py --config {study.config} --cap {cap:.2f} --report` from the "
             "committed registration and the private run record. Offline: no provider call, no reservation, no "
             "ledger or sidecar write.", "",
             f"- Config: `{study.config}` (sha256 `{session.config_sha}`), series `{study.series}`, "
             f"{len(st.slots)} registered slots.",
             f"- Approval: {approval}",
             f"- Record: **{st.status}**"
             + (f"; BREACHED ({len(st.breaches)} cost-bound breach(es))" if st.breaches else "") + ".", "",
             "## Slots", ""]
    lines += md_table(["Slot", "Request size", "Bound", "Status", "Terminal reason", "Attempts",
                       "Without known cost", "Wall time (s)"], rows)
    lines += ["", "## Spend", "",
              f"- Known billed: ${st.known_usd:.4f}.",
              f"- Conservative: ${st.committed_usd:.2f} (known cost, else the full reservation) of the "
              f"${cap:.2f} cap" + (" — within the cap." if st.committed_usd <= cap + 1e-9 else " — ABOVE the cap."),
              f"- Unknown reservations: {st.unknown_attempts} attempt(s) without a known cost, each counted at its "
              "full bound.",
              "- Cost-bound breaches: " + ("; ".join(st.breaches) if st.breaches else "none") + ".",
              "", "## Blocks and recoveries", "",
              f"- {'/'.join(b['codes']) or 'blocks'}: {b['first_attempt_blocks']} first-attempt block(s), "
              f"{b['recovered_by_retry']} recovered by the retry, {b['final_undelivered_after_block']} final "
              "undelivered.",
              "", "## Wall time", "",
              f"- Per call (s): {walls}.",
              f"- p95: {'n/a' if p is None else f'{p:g} s'} vs the {GUARDRAIL_P95_S} s guardrail (diagnostic only).",
              "", "## State", ""]
    if st.errors:
        lines += [f"- BLOCKED: {e}" for e in st.errors]
    if st.breaches:
        lines.append("- BREACHED: a call exceeded its cost bound, so no further call is made.")
    if pending:
        lines.append(f"- Unresolved: {', '.join(pending)}.")
    if not (st.errors or st.breaches or pending):
        lines.append("- Every slot resolved; no inconsistency and no cost-bound breach.")
    return "\n".join(lines) + "\n"


def write_report(session: Session, st: state.RunState) -> int:
    """Write `evaluations/run.md`; 0 when written, 1 otherwise. Never touches the run record."""
    root, study = session.paths.root, session.study
    try:
        approval = f"`{spend_approval((root / study.change_md).read_text(), session.cap)}`"
    except (Refused, OSError) as e:
        approval = f"not usable for --cap {session.cap:.2f} — {e}"
    target = root / study.run_report
    if not study_mod.within(os.path.realpath(target), os.path.realpath(root / study.change_dir)):
        print(f"refused: {study.run_report} resolves outside {study.change_dir} (a symlink?); no report written",
              file=sys.stderr)
        return 1
    text = report_md(session, st, session.cap, approval)
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    except OSError as e:
        print(f"refused: cannot write {study.run_report} ({e.strerror or e}); no report written", file=sys.stderr)
        return 1
    print(f"wrote {study.run_report} (record {st.status}); commit it with the run's records")
    return 0


# ---------------------------------------------------------------- CLI


def dry_run(session: Session, st: state.RunState) -> int:
    paths, cap, study = session.paths, session.cap, session.study
    for label, check in (
        ("registration", lambda: check_registration(paths.root, study) and "tracked, committed and clean"),
        ("approval", lambda: f"{spend_approval((paths.root / study.change_md).read_text(), cap)}"),
    ):
        try:
            print(f"  {label}: {check()}")
        except (Refused, OSError) as e:
            print(f"  {label}: a paid run would refuse — {e}")
    print(f"  key: OPENAI_API_KEY {'set' if os.environ.get('OPENAI_API_KEY') else 'not set (a paid run would refuse)'}")
    inputs_ok = True
    for spec in session.series["slots"]:
        if (spec["photo"], spec["slot"]) not in {(s.photo, s.slot) for s in st.pending()}:
            continue
        try:
            image, meta = runner.input_for(spec["photo"], spec["input"], session.ctx)
            runner.check_slot_frozen(session.config, spec, meta)
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


def main(argv: list[str] | None = None, *, root: Path | None = None, sleep=time.sleep) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="GPT26 study runner")
    ap.add_argument("--config", required=True, help="the study's config (repo-relative or inside the checkout)")
    ap.add_argument("--cap", type=float, required=True)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--resume", action="store_true")
    mode.add_argument("--report", action="store_true")
    args = ap.parse_args(argv)
    root = root or ROOT
    try:
        protocol.require_cap(args.cap)
        study = load_study(root, args.config)
        paths = study_paths(root, study)
        session = Session(paths, study, args.cap)
        st = session.reconcile()
    except Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1
    if args.report:
        return write_report(session, st)
    print(f"{session.config['name']} ({session.config_sha[:12]}…), series {session.series['series_id']}, "
          f"ledger {runner.ledger_path(session.ctx)}, cap ${args.cap:.2f}; record {st.status}")
    print_state(st, args.cap)
    if st.errors:
        print("refused: the run record is BLOCKED — " + "; ".join(st.errors)
              + " — resolve every item before any call", file=sys.stderr)
        return 1
    if args.dry_run:
        return dry_run(session, st)

    started = any(s.attempts or s.status != "pending" for s in st.slots.values())
    if started and not args.resume:
        print("refused: this study already has attempts; pass --resume to finish only the unresolved slots",
              file=sys.stderr)
        return 1
    try:
        bindings = check_registration(paths.root, study)
        session.ctx.approve(state.PHASE, args.cap)
        sidecar = read_sidecar(paths)
        if sidecar is not None:
            diffs = state.check_bindings(sidecar.get("bindings", {}), bindings, study.binding_files)
            if diffs:
                raise Refused("the registration or rules changed since this run was pinned:\n    "
                              + "\n    ".join(diffs) + "\n  a resume needs the identical registration and rules")
        elif started:
            raise Refused(f"the ledger has attempts but {paths.sidecar} is missing: the run's pinned identities are "
                          "unknown, so it cannot be resumed — restore the sidecar")
        if st.pending() and not st.breaches:
            runner.require_key(session.config)
        if sidecar is None:
            with runner.locked(session.ctx):
                if read_sidecar(paths) is None:
                    write_sidecar(paths, session.new_sidecar(bindings))
    except Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1

    stopped: Exception | None = None
    if st.breaches:
        stopped = Refused("a call exceeded its cost bound: no further call is made")
    else:
        pending = {(s.photo, s.slot) for s in st.pending()}
        for spec in session.series["slots"]:
            if (spec["photo"], spec["slot"]) not in pending:
                continue
            if st.slots[(spec["photo"], spec["slot"])].budget_refusal is not None:
                session.mark_terminal(spec["photo"], spec["slot"], "not_attempted_budget")
                continue
            try:
                outcome = runner.run_slot(session.config, session.config_sha, session.series, spec, state.PHASE,
                                          args.cap, sleep, session.ctx)
            except Refused as e:
                stopped = e
                break
            if outcome == "not_attempted_budget":
                session.mark_terminal(spec["photo"], spec["slot"], "not_attempted_budget")
    st = session.reconcile()
    if st.breaches:
        session.stop_after_breach(st)
        st = session.reconcile()
    if stopped:
        print(f"stopped: {stopped}", file=sys.stderr)
    print_state(st, args.cap)
    print_summary(st, args.cap)
    return 0 if st.complete and not st.breaches and stopped is None else 1


if __name__ == "__main__":
    sys.exit(main())
