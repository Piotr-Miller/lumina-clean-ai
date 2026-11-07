#!/usr/bin/env python3
"""S-20 step 1a evidence state: the preconditions of each transition in the plan's order table.

`context/changes/cloud-classical-denoise/plan.md` § Implementation Approach orders the work as
rules first, renders second, ratings last. This module answers, from Git at check time, whether a
transition's preconditions hold:

  - `require_committed_clean`: tracked, no staged or unstaged change, not untracked (order step 2);
  - `require_write_once`: exactly one commit ever touched the path, and it is clean [F11];
  - `require_strictly_before`: every commit of one file is a strict ancestor of every commit of
    another (seal ≺ ratings, ratings ≺ freeze, …) [F1];
  - `read_seal` / `seal_text`: the seal file's one `S20-SEAL` line (owner decision 2026-11-06).

Results are computed from the working tree and history when the check runs, never from a recorded
commit SHA, so rebase-merged history still verifies.

Environment override for the synthetic tests only: S20_REPO (the Git work tree whose rule files
are checked; default this repository).
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "s19"))

from protocol import Refused, check_paths  # noqa: E402

CALIBRATION_REL = "context/changes/cloud-classical-denoise/evaluations/step1-calibration.md"
GRID_REL = "scripts/s20/configs/nlm-grid.json"
# Order step 2: the rule files besides the S-20 tools themselves.
FIXED_RULE_FILES = (GRID_REL, "scripts/s19/local-arms.ts", "scripts/s19/s19.ts", CALIBRATION_REL)
TOOLS_DIR = "scripts/s20"


def repo_root() -> Path:
    return Path(os.environ.get("S20_REPO", ROOT))


def _git(root: Path, *args: str) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(["git", "-C", str(root), "-c", "core.quotepath=off", "--literal-pathspecs", *args],
                              capture_output=True, text=True)
    except OSError as e:
        raise Refused(f"cannot run git in {root} to check the rule files: {e}. Install git or run from a checkout")


def rule_files(root: Path | None = None) -> list[str]:
    """`scripts/s20/**/*.py` (tools, not tests), found on disk AND in the index, so a new untracked
    tool and a deleted tracked one are both caught; then the fixed rule files."""
    root = root or repo_root()
    tools: set[str] = set()
    base = root / TOOLS_DIR
    if base.is_dir():
        for p in base.rglob("*.py"):
            rel = p.relative_to(root).as_posix()
            if "tests" not in p.relative_to(base).parts:
                tools.add(rel)
    r = _git(root, "ls-files", "-z", "--", TOOLS_DIR)
    if r.returncode != 0:
        raise Refused(f"cannot list the tracked S-20 tools in {root}: {r.stderr.strip()}. "
                      "A real render needs a Git checkout")
    for rel in filter(None, r.stdout.split("\0")):
        if rel.endswith(".py") and "/tests/" not in f"/{rel[len(TOOLS_DIR) + 1:]}":
            tools.add(rel)
    return sorted(tools) + list(FIXED_RULE_FILES)


def require_committed_clean(paths: list[str], root: Path | None = None, *, purpose: str) -> None:
    """Each path is tracked and has no staged, unstaged or missing-file change against HEAD.

    Refuses with every offending file, the state found and the command that fixes it. A Git error
    is reported as "could not see", never read as clean.
    """
    root = root or repo_root()
    head = _git(root, "rev-parse", "--verify", "HEAD")
    if head.returncode != 0:
        raise Refused(f"cannot see a HEAD commit in {root}: {head.stderr.strip()}. {purpose} needs committed rule files")
    tracked = _git(root, "ls-files", "-z", "--", *paths)
    if tracked.returncode != 0:
        raise Refused(f"cannot list tracked files in {root}: {tracked.stderr.strip()}")
    known = set(filter(None, tracked.stdout.split("\0")))
    status = _git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames", "--", *paths)
    if status.returncode != 0:
        raise Refused(f"cannot read git status in {root}: {status.stderr.strip()}")
    states: dict[str, str] = {}
    for entry in filter(None, status.stdout.split("\0")):
        code, path = entry[:2], entry[3:]
        states[path] = describe(code)
    problems = []
    for p in paths:
        if p in states:
            problems.append(f"{p}: {states[p]}")
        elif p not in known:
            problems.append(f"{p}: {'not tracked' if (root / p).exists() else 'missing and not tracked'}")
    if problems:
        raise Refused(
            f"{purpose} needs every rule file committed and clean (plan § Implementation Approach, order step 2). "
            "Found:\n  " + "\n  ".join(problems)
            + f"\nWay out: review and commit them (git add -- <paths> && git commit), then re-run. "
            "--calibrate and --estimate-only render nothing real and need no commit."
        )


def describe(code: str) -> str:
    if code == "??":
        return "untracked"
    x, y = code[0], code[1]
    parts = []
    if x not in (" ", "?"):
        parts.append({"M": "modified", "A": "added", "D": "deleted", "T": "type changed"}.get(x, x) + " (staged)")
    if y not in (" ", "?"):
        parts.append({"M": "modified", "D": "deleted", "T": "type changed"}.get(y, y) + " (unstaged)")
    return ", ".join(parts) + " — not committed"


# ---------------------------------------------------------------- history (order steps 4–12)


def commits(path: str, root: Path | None = None) -> list[str]:
    """Every commit that touched `path`, newest first, following exact renames only.

    Plain `--follow` also follows a *similar* file: the pilot and gate seals are near-identical
    templates, so the gate seal would inherit the pilot seal's commit and look touched twice.
    `-M100%` keeps a genuine `git mv` followed and never merges two different files."""
    root = root or repo_root()
    r = _git(root, "log", "--format=%H", "--follow", "-M100%", "--", path)
    if r.returncode != 0:
        raise Refused(f"cannot read the history of {path} in {root}: {r.stderr.strip()}")
    return [c for c in r.stdout.split() if c]


def is_strict_ancestor(a: str, b: str, root: Path) -> bool:
    if a == b:
        return False
    r = _git(root, "merge-base", "--is-ancestor", a, b)
    if r.returncode not in (0, 1):
        raise Refused(f"cannot compare commits {a[:12]} and {b[:12]} in {root}: {r.stderr.strip()}")
    return r.returncode == 0


def require_write_once(path: str, root: Path | None = None) -> str:
    """Committed, clean, and touched by exactly one commit, so a replaced seal or freeze cannot
    borrow its original's place in history [F11]. Returns that commit."""
    root = root or repo_root()
    require_committed_clean([path], root, purpose=f"{path}")
    found = commits(path, root)
    if len(found) != 1:
        raise Refused(f"{path} was touched by {len(found)} commits; a seal or freeze is write-once. "
                      "Way out: a changed seal or freeze needs a new set or a new attempt, never an edit")
    return found[0]


def require_strictly_before(earlier: str, later: str, root: Path | None = None) -> None:
    """Every commit of `earlier` is a strict ancestor of every commit of `later` (computed now, so
    rebase-merged history still verifies). Re-exported ratings committed later stay legal; a seal
    and its ratings in one commit do not."""
    root = root or repo_root()
    a, b = commits(earlier, root), commits(later, root)
    if not a or not b:
        raise Refused(f"{earlier if not a else later} has no commit: commit it in order "
                      f"({earlier} first, then {later})")
    bad = [(x, y) for x in a for y in b if not is_strict_ancestor(x, y, root)]
    if bad:
        x, y = bad[0]
        raise Refused(f"{earlier} (commit {x[:12]}) is not strictly before {later} (commit {y[:12]}): "
                      f"the order is {earlier} committed first, then {later} in a later commit")


# ---------------------------------------------------------------- seals (owner decision 2026-11-06)

SEAL = re.compile(r"^S20-SEAL kind=(pilot|gate) set_id=([a-z0-9][a-z0-9-]{0,63}) "
                  r"set_digest=([0-9a-f]{64}) key_sha256=([0-9a-f]{64})$")


def guarded_path(path: Path) -> Path:
    """Guard and return the real path that the caller will open, before any file read or stat."""
    real = Path(os.path.realpath(path))
    check_paths([real], validation=False)
    return real


def read_seal(path: str, kind: str, root: Path | None = None) -> dict:
    """The seal file's one valid `S20-SEAL` line. A missing, duplicated or malformed line refuses."""
    root = root or repo_root()
    try:
        lines = guarded_path(root / path).read_text().splitlines()
    except OSError as e:
        raise Refused(f"cannot read the seal {path}: {e}. Save blind.py's printed seal file there and commit it")
    tagged = [ln for ln in lines if ln.startswith("S20-SEAL")]
    if len(tagged) != 1:
        raise Refused(f"{path} holds {len(tagged)} S20-SEAL lines, expected exactly one")
    m = SEAL.fullmatch(tagged[0].strip())
    if not m:
        raise Refused(f"{path}: the S20-SEAL line is malformed; paste it exactly as blind.py printed it")
    if m.group(1) != kind:
        raise Refused(f"{path} seals a {m.group(1)} set, not a {kind} set")
    return {"kind": m.group(1), "set_id": m.group(2), "set_digest": m.group(3), "key_sha256": m.group(4)}


def seal_text(kind: str, set_id: str, digest: str, key_sha: str) -> str:
    return f"""# S-20 step 1a — {kind} seal

Commit this file **before** opening the viewer (plan § Implementation Approach, order step 4).
The tools read exactly one machine line:

```text
S20-SEAL kind={kind} set_id={set_id} set_digest={digest} key_sha256={key_sha}
```

## Human control

I open the set `{set_id}` only after this file is committed, and only through
`context/changes/cloud-classical-denoise/references/compare-s20.html`. I do not open its key or list
its folder. This is a procedural commitment recorded in history, not technical proof that nothing
was opened earlier: Git can show when this seal was committed, never who looked at what.
"""
