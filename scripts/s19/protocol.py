#!/usr/bin/env python3
"""Shared S-19 protocol: holdout access guard, owner approvals, freeze, release, closure, scope.

Every S-19 harness path that reads, decodes, copies, displays or uploads a photo calls
`require_access` first (Python directly; the TypeScript tools through `check-access`). The
guard decides from manifest METADATA only: it never opens a photo to find out its split.

A validation photo is released only when all of these hold (plan § Critical Implementation
Details, "Holdout guard"):
  1. `--validation --access <release.json> --config <finalist.json>` are given;
  2. the release was written by `open-validation` and binds this config hash, this manifest
     hash and one run id;
  3. change.md still carries the owner's `S19-VALIDATION ... decision=approved` record for that
     exact config hash, manifest hash, vendor, terms and run id, and an approved
     `S19-SPEND phase=7` record.
Absent, declined, malformed, duplicate or conflicting records fail closed. A hash plus a flag
never suffices. This is a protocol for the harness, not a security boundary: a person who
opens the files by hand bypasses it, and the plan prohibits that.

Owner approval records (owner decision 2026-10-31) live under `## S-19 approvals` in
change.md, one bullet per record, one line each, strict `key=value` grammar with optional
double-quoted values:

  - S19-SPEND phase=3 cap_usd=3 decision=approved date=2026-11-02
  - S19-VALIDATION config_sha256=<64 hex> manifest_sha256=<64 hex> vendor=openai terms="..." run_id=val-1 decision=approved date=2026-11-20

Only the owner writes these; no S-19 tool creates or edits them. The agent-written freeze
record lives under `## S-19 freeze` and is not an approval:

  - S19-FREEZE config_sha256=<hex> series_sha256=<hex> tuning_report=<path> tuning_report_sha256=<hex> date=2026-11-15

Subcommands (all metadata-only):
  check-access   --ids ... [--all] [--all-validation] [--validation --access F --config F]
  approvals      print the parsed approval records, or why they are invalid
  check-freeze   --config F
  open-validation --config F --phase 7 --series F --cap N
  close          --outcome F
  check-scope    [--since REV]

Exit status: 0 the check passed; 1 refused or failed, with the reason on stderr; 2 usage.
Environment overrides exist for the synthetic tests only: S19_MANIFEST, S19_CHANGE_MD,
S19_PRIVATE, S19_ROADMAP, S19_TEMP_STEPS.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHANGE_DIR = ROOT / "context" / "changes" / "cloud-model-comparison"

# The commit this harness was started from. `check-scope` compares everything after it (plus
# the worktree) with the S-19 allowlist; earlier branch commits set up the v2 benchmark.
IMPLEMENTATION_BASE = "ef80a97cad27556e98e77dde73c559e7909555ae"
SCOPE_ALLOWLIST = (
    "context/changes/cloud-model-comparison/",
    "scripts/s19/",
    "context/foundation/roadmap.md",
    "temp_steps.md",
)

HEX64 = re.compile(r"^[0-9a-f]{64}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class Refused(Exception):
    """A protocol check said no. The message states what, about which subject, and the way out."""


# ---------------------------------------------------------------- paths


def manifest_path() -> Path:
    return Path(os.environ.get("S19_MANIFEST", ROOT / "test-photos" / "s17-benchmark-v2.json"))


def change_md_path() -> Path:
    return Path(os.environ.get("S19_CHANGE_MD", CHANGE_DIR / "change.md"))


def private_dir() -> Path:
    return Path(os.environ.get("S19_PRIVATE", ROOT / "test-photos" / "private" / "s19"))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def resolve(path: str | Path) -> Path:
    p = Path(path)
    return p if p.is_absolute() else ROOT / p


# ---------------------------------------------------------------- manifest (metadata only)


def load_manifest(path: Path | None = None) -> dict:
    path = path or manifest_path()
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError) as e:
        raise Refused(f"cannot read benchmark manifest {path}: {e}") from e
    ids = [e.get("id") for e in data.get("entries", [])]
    if len(ids) != len(set(ids)) or not ids:
        raise Refused(f"benchmark manifest {path} has no entries or duplicate ids")
    for e in data["entries"]:
        if e.get("split") not in ("tuning", "validation"):
            raise Refused(f"{e.get('id')}: split {e.get('split')!r} is neither tuning nor validation")
    return data


def select_ids(manifest: dict, ids: list[str], all_tuning: bool, all_validation: bool) -> list[str]:
    """`--all` always means tuning; validation needs `--all-validation` or explicit ids."""
    known = {e["id"]: e for e in manifest["entries"]}
    unknown = [i for i in ids if i not in known]
    if unknown:
        raise Refused(f"not in the benchmark manifest: {', '.join(unknown)}")
    out = list(ids)
    if all_tuning:
        out += [e["id"] for e in manifest["entries"] if e["split"] == "tuning"]
    if all_validation:
        out += [e["id"] for e in manifest["entries"] if e["split"] == "validation"]
    seen: set[str] = set()
    return [i for i in out if not (i in seen or seen.add(i))]


# ---------------------------------------------------------------- approval records


RECORD_KEYS = {
    "S19-SPEND": ({"phase", "cap_usd", "decision", "date"}, {"note"}),
    "S19-VALIDATION": (
        {"config_sha256", "manifest_sha256", "vendor", "terms", "run_id", "decision", "date"},
        {"note"},
    ),
    "S19-FREEZE": (
        {"config_sha256", "series_sha256", "tuning_report", "tuning_report_sha256", "date"},
        {"note"},
    ),
}
TOKEN = re.compile(r'\s*([a-z0-9_]+)=("(?:[^"\\]|\\.)*"|[^\s"]+)')


def parse_record_line(line: str, lineno: int) -> tuple[str, dict]:
    """Parse `- S19-KIND k=v k="quoted v" ...`; raise Refused on any deviation from the grammar."""
    m = re.match(r"^- (S19-[A-Z]+)(.*)$", line.rstrip("\n"))
    if not m or m.group(1) not in RECORD_KEYS:
        raise Refused(f"change.md line {lineno}: not a recognised S-19 record: {line.strip()!r}")
    kind, rest = m.group(1), m.group(2)
    fields: dict[str, str] = {}
    pos = 0
    while pos < len(rest):
        if rest[pos:].strip() == "":
            break
        t = TOKEN.match(rest, pos)
        if not t:
            raise Refused(f"change.md line {lineno}: malformed {kind} record near {rest[pos:pos + 30]!r}")
        key, raw = t.group(1), t.group(2)
        if key in fields:
            raise Refused(f"change.md line {lineno}: duplicate key {key!r} in {kind} record")
        value = re.sub(r"\\(.)", r"\1", raw[1:-1]) if raw.startswith('"') else raw
        fields[key] = value
        pos = t.end()
    required, optional = RECORD_KEYS[kind]
    missing = required - fields.keys()
    extra = fields.keys() - required - optional
    if missing:
        raise Refused(f"change.md line {lineno}: {kind} record lacks {', '.join(sorted(missing))}")
    if extra:
        raise Refused(f"change.md line {lineno}: {kind} record has unknown key(s) {', '.join(sorted(extra))}")
    if not DATE.match(fields["date"]):
        raise Refused(f"change.md line {lineno}: date {fields['date']!r} is not YYYY-MM-DD")
    if "decision" in fields and fields["decision"] not in ("approved", "declined"):
        raise Refused(f"change.md line {lineno}: decision must be approved or declined, not {fields['decision']!r}")
    for k in ("config_sha256", "manifest_sha256", "series_sha256", "tuning_report_sha256"):
        if k in fields and not HEX64.match(fields[k]):
            raise Refused(f"change.md line {lineno}: {k} is not a 64-hex sha256")
    if kind == "S19-SPEND":
        if fields["phase"] not in ("3", "5", "7"):
            raise Refused(f"change.md line {lineno}: phase must be 3, 5 or 7")
        if not re.match(r"^\d+(\.\d{1,2})?$", fields["cap_usd"]):
            raise Refused(f"change.md line {lineno}: cap_usd {fields['cap_usd']!r} is not a dollar amount")
    return kind, fields


def read_records(path: Path | None = None) -> dict[str, list[dict]]:
    """Every S-19 record under `## S-19 approvals` and `## S-19 freeze`. Any malformed bullet
    there that starts with `- S19-` invalidates the whole set: a broken approval never reads
    as an absent one."""
    path = path or change_md_path()
    try:
        lines = path.read_text().splitlines()
    except OSError as e:
        raise Refused(f"cannot read {path}: {e}") from e
    out: dict[str, list[dict]] = {k: [] for k in RECORD_KEYS}
    section = None
    for n, line in enumerate(lines, 1):
        if line.startswith("## "):
            section = line[3:].strip()
            continue
        if section not in ("S-19 approvals", "S-19 freeze") or not line.startswith("- S19-"):
            continue
        kind, fields = parse_record_line(line, n)
        if section == "S-19 freeze" and kind != "S19-FREEZE":
            raise Refused(f"change.md line {n}: {kind} belongs under ## S-19 approvals, not ## S-19 freeze")
        if section == "S-19 approvals" and kind == "S19-FREEZE":
            raise Refused(f"change.md line {n}: S19-FREEZE belongs under ## S-19 freeze")
        fields["_line"] = str(n)
        out[kind].append(fields)
    return out


def spend_approval(phase: int, records: dict | None = None) -> dict:
    """The single approved spending record for `phase`, or Refused."""
    records = records if records is not None else read_records()
    rows = [r for r in records["S19-SPEND"] if r["phase"] == str(phase)]
    if not rows:
        raise Refused(
            f"no S19-SPEND record for phase {phase} in change.md § S-19 approvals: "
            f"paid Phase {phase} work needs the owner's explicit spending approval first"
        )
    if len(rows) > 1:
        lines = ", ".join(r["_line"] for r in rows)
        raise Refused(f"conflicting S19-SPEND records for phase {phase} (change.md lines {lines}): keep exactly one")
    row = rows[0]
    if row["decision"] != "approved":
        raise Refused(f"phase {phase} spending is {row['decision']} (change.md line {row['_line']}): no paid call")
    return row


def check_cap(phase: int, cap: float, records: dict | None = None) -> dict:
    row = spend_approval(phase, records)
    if abs(float(row["cap_usd"]) - cap) > 1e-9:
        raise Refused(
            f"--cap {cap:g} does not match the owner-approved phase {phase} cap of ${row['cap_usd']} "
            f"(change.md line {row['_line']})"
        )
    return row


def validation_approval(config_sha: str, manifest_sha: str, records: dict | None = None) -> dict:
    records = records if records is not None else read_records()
    rows = records["S19-VALIDATION"]
    if not rows:
        raise Refused("no S19-VALIDATION record in change.md § S-19 approvals: the holdout stays closed")
    if len(rows) > 1:
        raise Refused(
            "more than one S19-VALIDATION record (change.md lines "
            + ", ".join(r["_line"] for r in rows)
            + "): the holdout is released at most once, for one finalist"
        )
    row = rows[0]
    if row["decision"] != "approved":
        raise Refused(f"sending the holdout was {row['decision']} (change.md line {row['_line']}): it stays closed")
    if row["config_sha256"] != config_sha:
        raise Refused(f"S19-VALIDATION approves config {row['config_sha256'][:12]}…, not {config_sha[:12]}…")
    if row["manifest_sha256"] != manifest_sha:
        raise Refused(f"S19-VALIDATION approves manifest {row['manifest_sha256'][:12]}…, not {manifest_sha[:12]}…")
    return row


def freeze_record(config_sha: str, records: dict | None = None) -> dict:
    records = records if records is not None else read_records()
    rows = records["S19-FREEZE"]
    if not rows:
        raise Refused("no S19-FREEZE record in change.md § S-19 freeze: the finalist is not frozen")
    if len(rows) > 1:
        raise Refused("more than one S19-FREEZE record: exactly one finalist can be frozen")
    if rows[0]["config_sha256"] != config_sha:
        raise Refused(
            f"the frozen config is {rows[0]['config_sha256'][:12]}…, this file hashes to {config_sha[:12]}…: "
            "a changed config needs new tuning evidence"
        )
    return rows[0]


# ---------------------------------------------------------------- access guard


def release_path() -> Path:
    return private_dir() / "validation-access.json"


def require_access(
    ids: list[str],
    *,
    validation: bool = False,
    access: str | Path | None = None,
    config: str | Path | None = None,
    manifest: dict | None = None,
) -> list[str]:
    """Return `ids` if this process may touch their bytes; raise Refused otherwise.

    Metadata only: it reads the manifest, change.md and the release record, never a photo.
    """
    manifest = manifest or load_manifest()
    split = {e["id"]: e["split"] for e in manifest["entries"]}
    unknown = [i for i in ids if i not in split]
    if unknown:
        raise Refused(f"not in the benchmark manifest: {', '.join(unknown)}")
    held = [i for i in ids if split[i] == "validation"]
    if not validation:
        if held:
            raise Refused(
                f"{', '.join(held)} {'is a validation photo' if len(held) == 1 else 'are validation photos'}: the holdout opens only "
                "in Phase 7, after the owner's S19-VALIDATION approval and `protocol.py open-validation`, "
                "with --validation --access <release.json> --config <finalist.json>"
            )
        return ids
    if not access or not config:
        raise Refused("--validation needs both --access <release.json> and --config <finalist.json>")
    tuning = [i for i in ids if split[i] == "tuning"]
    if tuning:
        raise Refused(f"validation mode covers validation photos only; drop {', '.join(tuning)}")
    release = read_release(Path(access))
    config_sha = sha256_file(resolve(config))
    manifest_sha = sha256_file(manifest_path())
    if release["config_sha256"] != config_sha:
        raise Refused(f"release {access} is for config {release['config_sha256'][:12]}…, not {config_sha[:12]}…")
    if release["manifest_sha256"] != manifest_sha:
        raise Refused(f"release {access} is for manifest {release['manifest_sha256'][:12]}…, not {manifest_sha[:12]}…")
    records = read_records()
    row = validation_approval(config_sha, manifest_sha, records)
    for k in ("vendor", "terms", "run_id"):
        if row[k] != release[k]:
            raise Refused(f"release {k} {release[k]!r} differs from the owner's approval {row[k]!r}")
    spend_approval(7, records)
    return ids


def read_release(path: Path) -> dict:
    try:
        release = json.loads(path.read_text())
    except (OSError, ValueError) as e:
        raise Refused(f"no readable validation release at {path}: {e}. Run `protocol.py open-validation` first") from e
    need = {"phase", "run_id", "config_sha256", "manifest_sha256", "series_sha256", "vendor", "terms", "created_at"}
    if not need <= release.keys() or release.get("phase") != 7:
        raise Refused(f"{path} is not a Phase 7 release record written by open-validation")
    return release


# ---------------------------------------------------------------- freeze


def check_freeze(config_path: Path) -> dict:
    """Compare the config with the S19-FREEZE record, its implementation hashes and its passing
    tuning report. Returns the freeze record."""
    try:
        config = json.loads(config_path.read_text())
    except (OSError, ValueError) as e:
        raise Refused(f"cannot read config {config_path}: {e}") from e
    config_sha = sha256_file(config_path)
    for field in ("name", "kind", "vendor", "retry", "cost_bound", "input", "implementation"):
        if field not in config:
            raise Refused(f"{config_path}: required field {field!r} is missing")
    for rel, expected in config["implementation"].items():
        p = resolve(rel)
        if not p.exists():
            raise Refused(f"{config_path}: implementation file {rel} is missing")
        actual = sha256_file(p)
        if actual != expected:
            raise Refused(f"{rel} hashes to {actual[:12]}…, the config pins {expected[:12]}…: the process changed")
    rec = freeze_record(config_sha)
    report = resolve(rec["tuning_report"])
    if not report.exists() or sha256_file(report) != rec["tuning_report_sha256"]:
        raise Refused(f"tuning report {rec['tuning_report']} is missing or differs from the frozen hash")
    verdicts = json.loads(report.read_text()).get("verdicts", {})
    if verdicts.get(config_sha, {}).get("verdict") != "PASS":
        raise Refused(f"tuning report {rec['tuning_report']} has no PASS verdict for config {config_sha[:12]}…")
    return rec


# ---------------------------------------------------------------- open-validation


def open_validation(config_path: Path, phase: int, series_path: Path, cap: float) -> dict:
    if phase != 7:
        raise Refused("open-validation is Phase 7 only")
    rec = check_freeze(config_path)
    config_sha = sha256_file(config_path)
    manifest = load_manifest()
    manifest_sha = sha256_file(manifest_path())
    records = read_records()
    row = validation_approval(config_sha, manifest_sha, records)
    check_cap(7, cap, records)
    series_sha = sha256_file(series_path)
    if series_sha != rec["series_sha256"]:
        raise Refused(f"series {series_path} differs from the frozen validation series hash")
    series = json.loads(series_path.read_text())
    want = sorted(e["id"] for e in manifest["entries"] if e["split"] == "validation")
    got = sorted({s["photo"] for s in series.get("slots", []) if s.get("config_sha256") == config_sha})
    if got != want or len(want) != 12:
        raise Refused(f"validation series covers {got}, expected the 12 validation photos {want}")
    bound = sum(float(s["cost_bound_usd"]) for s in series["slots"] if s.get("slot") == 1)
    if bound > cap + 1e-9:
        raise Refused(f"the 12 initial calls are bounded at ${bound:.2f}, above the Phase 7 cap of ${cap:g}")
    path = release_path()
    if path.exists():
        existing = read_release(path)
        if (existing["run_id"], existing["config_sha256"]) == (row["run_id"], config_sha):
            return existing  # the same released run resumes; nothing is reset
        raise Refused(f"{path} already releases run {existing['run_id']}: the holdout is opened once")
    release = {
        "phase": 7,
        "run_id": row["run_id"],
        "config_sha256": config_sha,
        "manifest_sha256": manifest_sha,
        "series_sha256": series_sha,
        "vendor": row["vendor"],
        "terms": row["terms"],
        "created_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(release, indent=2) + "\n")
    os.replace(tmp, path)
    return release


# ---------------------------------------------------------------- close


OUTCOME_FIELDS = (
    "Outcome",
    "Last completed phase",
    "Gate report",
    "Attempts",
    "Technical failures",
    "Unattempted slots",
    "Spend",
    "Unresolved reservations",
    "Consent status",
    "Holdout opened",
)
OUTCOMES = ("pass", "fail", "stopped before validation", "inconclusive validation")


def close(outcome_path: Path) -> list[str]:
    """Check the terminal record and every S-19 status pointer. Returns the problems found."""
    problems: list[str] = []
    try:
        text = outcome_path.read_text()
    except OSError as e:
        return [f"cannot read {outcome_path}: {e}"]
    for f in OUTCOME_FIELDS:
        m = re.search(rf"^- \*\*{re.escape(f)}:\*\* *(.+)$", text, re.M)
        if not m or not m.group(1).strip():
            problems.append(f"{outcome_path.name}: field '{f}' is missing or empty")
        elif f == "Outcome" and m.group(1).strip().lower() not in OUTCOMES:
            problems.append(f"{outcome_path.name}: Outcome must be one of {', '.join(OUTCOMES)}")
    rel = "evaluations/outcome.md"
    if rel not in change_md_path().read_text():
        problems.append("change.md does not point to evaluations/outcome.md")
    roadmap = Path(os.environ.get("S19_ROADMAP", ROOT / "context" / "foundation" / "roadmap.md"))
    rtext = roadmap.read_text()
    row = next((ln for ln in rtext.splitlines() if ln.startswith("| S-19 ")), "")
    if re.search(r"\|\s*(planning|in-progress|pending)\s*\|\s*$", row):
        problems.append("roadmap.md At-a-glance S-19 row still says planning/in-progress/pending")
    body = rtext.split("### S-19:", 1)[1].split("\n### ", 1)[0] if "### S-19:" in rtext else ""
    m = re.search(r"^- \*\*Status:\*\* *(.+)$", body, re.M)
    if not m or re.match(r"(planning|in-progress|pending)\b", m.group(1)):
        problems.append("roadmap.md S-19 item Status still says planning/in-progress/pending")
    steps = Path(os.environ.get("S19_TEMP_STEPS", ROOT / "temp_steps.md"))
    if "outcome.md" not in steps.read_text():
        problems.append("temp_steps.md does not point to the S-19 outcome")
    return problems


# ---------------------------------------------------------------- scope


def changed_paths(since: str) -> list[str]:
    def git(*args: str) -> str:
        r = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)
        if r.returncode != 0:
            raise Refused(f"git {' '.join(args)} failed: {r.stderr.strip()}")
        return r.stdout

    paths = set(git("diff", "--name-only", "--no-renames", f"{since}..HEAD").split("\n"))
    for line in git("status", "--porcelain", "--untracked-files=all", "--no-renames").split("\n"):
        if line:
            paths.add(line[3:].strip('"'))
    return sorted(p for p in paths if p)


def check_scope(since: str) -> list[str]:
    return [p for p in changed_paths(since) if not p.startswith(SCOPE_ALLOWLIST)]


# ---------------------------------------------------------------- CLI


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("check-access")
    a.add_argument("--ids", nargs="*", default=[])
    a.add_argument("--all", action="store_true")
    a.add_argument("--all-validation", action="store_true")
    a.add_argument("--validation", action="store_true")
    a.add_argument("--access")
    a.add_argument("--config")
    sub.add_parser("approvals")
    f = sub.add_parser("check-freeze")
    f.add_argument("--config", required=True)
    o = sub.add_parser("open-validation")
    o.add_argument("--config", required=True)
    o.add_argument("--phase", type=int, required=True)
    o.add_argument("--series", required=True)
    o.add_argument("--cap", type=float, required=True)
    c = sub.add_parser("close")
    c.add_argument("--outcome", required=True)
    s = sub.add_parser("check-scope")
    s.add_argument("--since", default=IMPLEMENTATION_BASE)
    args = ap.parse_args(argv)

    try:
        if args.cmd == "check-access":
            if args.all_validation and not args.validation:
                raise Refused("--all-validation needs --validation --access <release.json> --config <finalist.json>")
            manifest = load_manifest()
            ids = select_ids(manifest, args.ids, args.all, args.all_validation)
            require_access(ids, validation=args.validation, access=args.access, config=args.config, manifest=manifest)
            print(json.dumps({"allowed": ids}))
        elif args.cmd == "approvals":
            print(json.dumps({k: v for k, v in read_records().items()}, indent=2))
        elif args.cmd == "check-freeze":
            rec = check_freeze(resolve(args.config))
            print(f"freeze OK: {args.config} matches S19-FREEZE (change.md line {rec['_line']}), "
                  "implementation hashes and its PASS tuning report")
        elif args.cmd == "open-validation":
            rel = open_validation(resolve(args.config), args.phase, resolve(args.series), args.cap)
            print(f"validation released: run {rel['run_id']} → {release_path()}")
        elif args.cmd == "close":
            problems = close(resolve(args.outcome))
            if problems:
                raise Refused("terminal record incomplete:\n  " + "\n  ".join(problems))
            print(f"closed: {args.outcome} and every S-19 status pointer are recorded")
        elif args.cmd == "check-scope":
            bad = check_scope(args.since)
            if bad:
                raise Refused(
                    f"{len(bad)} path(s) changed since {args.since[:12]} outside the S-19 allowlist "
                    f"({', '.join(SCOPE_ALLOWLIST)}):\n  " + "\n  ".join(bad)
                )
            print(f"scope OK: every change since {args.since[:12]} and in the worktree is inside the S-19 "
                  "allowlist. This is evidence about changes, not a read of the production CLOUD_DAILY_CAP.")
    except Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
