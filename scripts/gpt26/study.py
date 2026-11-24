#!/usr/bin/env python3
"""The GPT26 study descriptor: which change, series, viewer and private root a config drives.

Plan `gpt-image-26-wider` Phase 1 §1. Every GPT26 study tool (`run.py`, `check_series.py`,
`blind.py`, `gate.py`, `pointers.py`) takes `--config <path>` and reads the study from the
config's `study` object instead of module constants, so one code base serves any registered
study without pointing at another change's folder:

    "study": {
      "change_dir": "context/changes/<change-id>",
      "series": "<repo-relative series JSON>",
      "viewer": "context/changes/<change-id>/references/<viewer>.html",
      "private_root": "test-photos/private/<name>",
      "series_id": "<series id>"
    }

The expected slots are the config's `gate.expected_slots`, never a second list here.

Every path is validated before any tool writes: repo-relative and normalized, then contained
after resolving symlinks. `change_dir` must resolve under `context/changes/` and never under
`context/archive/` (an archived change is immutable); `private_root` must resolve under
`test-photos/private/` and never into the S-19 or S-20 roots, whose prepared inputs, Local
downloads and ledgers stay where they are. Stored paths stay repo-relative, so a detached
worktree of the same commit verifies the same bytes.

Standard library only; reads the config it is given and nothing else; never writes.
"""

from __future__ import annotations

import dataclasses
import json
import os
import re
from pathlib import Path, PurePosixPath

STUDY_FIELDS = ("change_dir", "series", "viewer", "private_root", "series_id")
KEBAB = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
SERIES_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
CHANGES, ARCHIVE, PRIVATE = "context/changes", "context/archive", "test-photos/private"
# Roots other studies own: the S-19 prepared inputs and Local downloads, the S-20 sets.
RESERVED_PRIVATE = ("s19", "s20")
S19_INPUTS = f"{PRIVATE}/s19/inputs"
# The runtime files whose bytes decide what a study does, from the paid run to the verdict,
# except its viewer, which each study registers itself. Pinned at the first reservation and
# required unchanged on resume, at build and at the gate (plan § Critical Implementation Details).
BASE_RULE_FILES = (
    "scripts/gpt26/run.py",
    "scripts/gpt26/state.py",
    "scripts/gpt26/study.py",
    "scripts/gpt26/check_series.py",
    "scripts/gpt26/blind.py",
    "scripts/gpt26/gate.py",
    "scripts/s19/run-candidate.py",
    "scripts/s19/protocol.py",
    "scripts/s19/inputs.py",
    "scripts/s20/evidence.py",
    "scripts/s20/trials.py",
)
VIEWER_AT = 6  # where the study's viewer sits in rule_files (after the GPT26 tools)


class StudyError(Exception):
    """The config names no valid study. The message names the field and the way out."""


@dataclasses.dataclass(frozen=True)
class Study:
    config: str
    change_dir: str
    series: str
    viewer: str
    private_root: str
    series_id: str
    expected_slots: tuple[tuple[str, int], ...]

    @property
    def change_id(self) -> str:
        return PurePosixPath(self.change_dir).name

    @property
    def eval_dir(self) -> str:
        return f"{self.change_dir}/evaluations"

    @property
    def change_md(self) -> str:
        return f"{self.change_dir}/change.md"

    @property
    def seal_rel(self) -> str:
        return f"{self.eval_dir}/gate-sealed.md"

    @property
    def ratings_rel(self) -> str:
        return f"{self.eval_dir}/ratings.json"

    @property
    def verdict_json(self) -> str:
        return f"{self.eval_dir}/verdict.json"

    @property
    def verdict_md(self) -> str:
        return f"{self.eval_dir}/verdict.md"

    @property
    def run_report(self) -> str:
        return f"{self.eval_dir}/run.md"

    @property
    def registration_files(self) -> tuple[str, str]:
        return (self.config, self.series)

    @property
    def rule_files(self) -> tuple[str, ...]:
        return (*BASE_RULE_FILES[:VIEWER_AT], self.viewer, *BASE_RULE_FILES[VIEWER_AT:])

    @property
    def binding_files(self) -> tuple[str, ...]:
        return (*self.registration_files, *self.rule_files)

    @property
    def labels(self) -> list[str]:
        return [f"{p}/{n}" for p, n in self.expected_slots]


def _real(path: Path) -> str:
    return os.path.realpath(path)


def within(path: str, base: str) -> bool:
    return path == base or path.startswith(base.rstrip(os.sep) + os.sep)


def rel_path(value, what: str) -> PurePosixPath:
    """A normalized repo-relative POSIX path, or StudyError."""
    if not isinstance(value, str) or not value or value != value.strip():
        raise StudyError(f"{what} must be a non-empty repo-relative path, got {value!r}")
    if "\\" in value or value.startswith("/") or re.match(r"^[A-Za-z]:", value):
        raise StudyError(f"{what} {value!r} must be repo-relative with '/' separators")
    parts = value.split("/")
    if any(p in ("", ".", "..") for p in parts):
        raise StudyError(f"{what} {value!r} must be normalized (no empty, '.' or '..' segment)")
    return PurePosixPath(value)


def config_rel(root: Path, arg: str | os.PathLike) -> str:
    """The config's repo-relative path: `arg` is repo-relative (to `root`) or absolute inside it."""
    p = Path(arg)
    full = Path(os.path.abspath(p if p.is_absolute() else root / p))
    try:
        lexical = full.relative_to(Path(os.path.abspath(root))).as_posix()
    except ValueError:
        raise StudyError(f"--config {arg} is outside the checkout {root}: pass a config inside it") from None
    rel_path(lexical, "--config")
    if not within(_real(full), _real(root)):
        raise StudyError(f"--config {arg} resolves outside the checkout {root} (a symlink?)")
    return lexical


def from_config(root: Path, config_path: str, config) -> Study:
    """The study a parsed config registers, validated against the checkout at `root`."""
    where = f"{config_path}: study"
    if not isinstance(config, dict) or not isinstance(config.get("study"), dict):
        raise StudyError(f"{config_path} has no study object — add one naming change_dir, series, viewer, "
                         "private_root and series_id")
    s = config["study"]
    if set(s) != set(STUDY_FIELDS):
        raise StudyError(f"{where} fields are {sorted(s)}, expected exactly {list(STUDY_FIELDS)}")

    change = rel_path(s["change_dir"], f"{where}.change_dir")
    if change.parts[:2] != ("context", "changes") or len(change.parts) != 3 or not KEBAB.fullmatch(change.name):
        raise StudyError(f"{where}.change_dir {s['change_dir']!r} must be context/changes/<change-id> "
                         "(kebab-case)")
    real_change = _real(root / change)
    if within(real_change, _real(root / ARCHIVE)):
        raise StudyError(f"{where}.change_dir {s['change_dir']!r} resolves under {ARCHIVE}/: an archived change "
                         "is immutable — open a new change and point the study at it")
    if not within(real_change, _real(root / CHANGES)):
        raise StudyError(f"{where}.change_dir {s['change_dir']!r} resolves outside {CHANGES}/ (a symlink?)")

    series = rel_path(s["series"], f"{where}.series")
    if series.suffix != ".json" or not within(_real(root / series), _real(root)):
        raise StudyError(f"{where}.series {s['series']!r} must be a .json file inside the checkout")

    viewer = rel_path(s["viewer"], f"{where}.viewer")
    references = change / "references"
    if viewer.parent != references or viewer.suffix != ".html":
        raise StudyError(f"{where}.viewer {s['viewer']!r} must be an .html file directly under {references}/")
    if not within(_real(root / viewer), real_change):
        raise StudyError(f"{where}.viewer {s['viewer']!r} resolves outside {s['change_dir']} (a symlink?)")

    private = rel_path(s["private_root"], f"{where}.private_root")
    if private.parts[:2] != ("test-photos", "private") or len(private.parts) != 3 \
            or not KEBAB.fullmatch(private.name) or private.name in RESERVED_PRIVATE:
        raise StudyError(f"{where}.private_root {s['private_root']!r} must be {PRIVATE}/<name> (kebab-case, "
                         f"not {' or '.join(RESERVED_PRIVATE)})")
    real_private = _real(root / private)
    if not within(real_private, _real(root / PRIVATE)) or real_private == _real(root / PRIVATE):
        raise StudyError(f"{where}.private_root {s['private_root']!r} resolves outside {PRIVATE}/ (a symlink?)")
    for name in RESERVED_PRIVATE:
        if within(real_private, _real(root / PRIVATE / name)):
            raise StudyError(f"{where}.private_root {s['private_root']!r} resolves into {PRIVATE}/{name}/, "
                             "which another study owns")

    if not isinstance(s["series_id"], str) or not SERIES_ID.fullmatch(s["series_id"]):
        raise StudyError(f"{where}.series_id {s['series_id']!r} must match {SERIES_ID.pattern}")

    gate = config.get("gate")
    slots = gate.get("expected_slots") if isinstance(gate, dict) else None
    if not isinstance(slots, list) or not slots:
        raise StudyError(f"{config_path}: gate.expected_slots must be a non-empty list of {{photo, slot}}")
    expected = []
    for n, e in enumerate(slots):
        if not (isinstance(e, dict) and set(e) == {"photo", "slot"} and isinstance(e["photo"], str)
                and e["photo"] and type(e["slot"]) is int and e["slot"] > 0):
            raise StudyError(f"{config_path}: gate.expected_slots[{n}] must be {{photo: <id>, slot: <positive int>}}")
        expected.append((e["photo"], e["slot"]))
    if len(set(expected)) != len(expected):
        raise StudyError(f"{config_path}: gate.expected_slots lists a slot twice")

    return Study(config=config_path, change_dir=change.as_posix(), series=series.as_posix(),
                 viewer=viewer.as_posix(), private_root=private.as_posix(), series_id=s["series_id"],
                 expected_slots=tuple(expected))


def read_config(root: Path, config_path: str) -> tuple[bytes, object]:
    try:
        raw = (root / config_path).read_bytes()
    except OSError as e:
        raise StudyError(f"{config_path}: cannot read ({e.strerror or e}) — restore it from Git") from e
    try:
        return raw, json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as e:
        raise StudyError(f"{config_path}: not valid UTF-8 JSON ({e}) — fix the syntax") from e


def load(root: Path, arg: str | os.PathLike) -> tuple[Study, bytes, dict]:
    """(study, config bytes, parsed config) for `--config arg`, or StudyError."""
    rel = config_rel(root, arg)
    raw, config = read_config(root, rel)
    return from_config(root, rel, config), raw, config
