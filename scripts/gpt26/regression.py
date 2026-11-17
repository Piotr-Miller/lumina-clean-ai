#!/usr/bin/env python3
"""Reproducible S-19 / S-20 regression baseline in a disposable worktree (plan Phase 2, item 5).

  python3 scripts/gpt26/regression.py --suite s19|s20 --revision <commit>

Materializes a detached Git worktree of the local revision outside the live checkout, runs
`TMPDIR=/tmp python3 -B -m unittest discover -s scripts/<suite>/tests` there and propagates
its real exit status. No network, no private corpus, no photographs.

The suite's Node dependencies (S-19 calls `npx --no-install tsx` and prettier) come from the
live checkout's `node_modules`, linked into the worktree only when the revision's
`package-lock.json` is byte-identical to the live one (owner decision 2026-11-17); no install,
no network.

For S-20 only, four metadata files are restored to their pre-archive paths under
`context/changes/cloud-classical-denoise/` inside that disposable worktree, read from the
matching `context/archive/2026-11-03-cloud-classical-denoise/` blobs AT THE SAME REVISION.
Source and copy are compared by SHA-256 and the mapping is logged. Nothing is staged, the
archive is not touched, and cleanup removes only this run's own worktree.

Exit status: the suite's own exit status when it ran; 2 when the harness could not run it
(unknown revision, missing fixture blob, fixture hash mismatch, worktree failure).
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import os
import platform
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = "context/archive/2026-11-03-cloud-classical-denoise"
LEGACY = "context/changes/cloud-classical-denoise"
S20_FIXTURES = (
    "change.md",
    "evaluations/pilot-result.json",
    "evaluations/step1-gate.json",
    "evaluations/step1-calibration.md",
)
DEPENDENCIES = ("Pillow", "numpy", "opencv-python", "opencv-python-headless", "scikit-image", "PyWavelets")
# Git variables that would point a subprocess at another repository or index.
GIT_ENV = ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR")


class HarnessError(Exception):
    """The harness could not run the suite. The message names the subject and the way out."""


def clean_env() -> dict:
    env = {k: v for k, v in os.environ.items() if k not in GIT_ENV}
    env["TMPDIR"] = "/tmp"
    return env


def git(*args: str, cwd: Path | None = None, binary: bool = False):
    cwd = cwd or ROOT
    r = subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, env=clean_env())
    if r.returncode != 0:
        raise HarnessError(f"git {' '.join(args)} failed in {cwd}: {r.stderr.decode(errors='replace').strip()}")
    return r.stdout if binary else r.stdout.decode().strip()


def dependency_versions() -> dict[str, str]:
    out = {"python": platform.python_version()}
    for name in DEPENDENCIES:
        try:
            out[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            out[name] = "not installed"
    try:
        import cv2  # noqa: PLC0415 — a distro OpenCV has no pip metadata

        out["cv2"] = cv2.__version__
    except ImportError:
        out["cv2"] = "not importable"
    return out


def restore_s20_fixtures(worktree: Path, revision: str, log) -> list[dict]:
    """Copy the four archived metadata blobs of `revision` to their legacy paths in `worktree`."""
    mapping = []
    for rel in S20_FIXTURES:
        source = f"{ARCHIVE}/{rel}"
        try:
            data = git("show", f"{revision}:{source}", binary=True)
        except HarnessError as e:
            raise HarnessError(f"fixture blob {source} is missing at {revision[:12]}: {e}. "
                               "The S-20 overlay needs the archived folder at that revision") from e
        target = worktree / LEGACY / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        write_fixture(target, data)
        src_sha = hashlib.sha256(data).hexdigest()
        copy_sha = hashlib.sha256(target.read_bytes()).hexdigest()
        if copy_sha != src_sha:
            raise HarnessError(f"fixture copy {LEGACY}/{rel} hashes to {copy_sha[:12]}…, its blob {source} to "
                               f"{src_sha[:12]}…: the overlay is not byte-identical, nothing was run")
        mapping.append({"source": source, "target": f"{LEGACY}/{rel}", "sha256": src_sha})
        log(f"fixture {source} → {LEGACY}/{rel} sha256 {src_sha}")
    return mapping


def write_fixture(target: Path, data: bytes) -> None:
    target.write_bytes(data)


def link_node_modules(worktree: Path, revision: str, log) -> None:
    """Give the worktree the live Node dependencies, but only for an identical lockfile."""
    live = ROOT / "node_modules"
    if not live.is_dir():
        raise HarnessError(f"{live} is missing: run npm ci in the live checkout first")
    try:
        locked = git("show", f"{revision}:package-lock.json", binary=True)
    except HarnessError as e:
        raise HarnessError(f"package-lock.json is missing at {revision[:12]}: {e}") from e
    live_lock = (ROOT / "package-lock.json").read_bytes()
    if locked != live_lock:
        raise HarnessError(f"package-lock.json at {revision[:12]} differs from the live checkout's: the live "
                           "node_modules would not be that revision's dependencies, nothing was run")
    (worktree / "node_modules").symlink_to(live, target_is_directory=True)
    log(f"node_modules linked from {live} (package-lock.json sha256 {hashlib.sha256(locked).hexdigest()})")


def run(suite: str, revision: str, log=print) -> int:
    commit = git("rev-parse", "--verify", "--end-of-options", f"{revision}^{{commit}}")
    log(f"suite {suite}, revision {revision} = {commit}")
    for k, v in dependency_versions().items():
        log(f"dependency {k} {v}")
    base = Path(tempfile.mkdtemp(prefix=f"gpt26-regression-{suite}-", dir="/tmp"))
    worktree = base / "wt"
    git("worktree", "add", "--detach", str(worktree), commit)
    try:
        link_node_modules(worktree, commit, log)
        if suite == "s20":
            restore_s20_fixtures(worktree, commit, log)
        cmd = [sys.executable, "-B", "-m", "unittest", "discover", "-s", f"scripts/{suite}/tests"]
        log(f"command (cwd {worktree}): TMPDIR=/tmp {' '.join(cmd)}")
        r = subprocess.run(cmd, cwd=worktree, env=clean_env(), capture_output=True, text=True)
        full_log = Path("/tmp") / f"gpt26-regression-{suite}-{commit[:12]}.log"
        full_log.write_text((r.stdout or "") + (r.stderr or ""))
        for ln in (r.stderr or "").splitlines():
            if ln.startswith(("Ran ", "OK", "FAILED", "ERROR: ", "FAIL: ")):
                log(f"result {ln}")
        log(f"full output: {full_log}")
        log(f"exit {r.returncode}")
        return r.returncode
    finally:
        link = worktree / "node_modules"
        if link.is_symlink():
            link.unlink()  # never let a recursive removal reach the live node_modules
        try:
            git("worktree", "remove", "--force", str(worktree))
        except HarnessError as e:
            log(f"cleanup: {e}; remove {worktree} by hand with git worktree remove --force")
        try:
            base.rmdir()
        except OSError:
            pass


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="S-19/S-20 regression in a disposable worktree")
    ap.add_argument("--suite", required=True, choices=("s19", "s20"))
    ap.add_argument("--revision", required=True)
    args = ap.parse_args(argv)
    try:
        return run(args.suite, args.revision)
    except HarnessError as e:
        print(f"regression: NOT RUN — {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
