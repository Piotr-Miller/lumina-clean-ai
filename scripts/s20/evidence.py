#!/usr/bin/env python3
"""S-20 step 1a evidence state: the preconditions of each transition in the plan's order table.

`context/changes/cloud-classical-denoise/plan.md` § Implementation Approach orders the work as
rules first, renders second, ratings last. This module answers, from Git at check time, whether a
transition's preconditions hold. Phase 2 needs the first one: a real NLM render (order step 2)
refuses unless every rule file is committed and clean. The write-once seal and strict-ancestor
checks are Phase 4's.

Results are computed from the working tree and history when the check runs, never from a recorded
commit SHA, so rebase-merged history still verifies.

Environment override for the synthetic tests only: S20_REPO (the Git work tree whose rule files
are checked; default this repository).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "s19"))

from protocol import Refused  # noqa: E402

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
