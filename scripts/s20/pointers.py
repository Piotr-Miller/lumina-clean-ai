#!/usr/bin/env python3
"""S-20 status pointers, checked block by block (`cloud-classical-denoise`, plan Phase 4 item 4).

  python3 scripts/s20/pointers.py [--root <dir>]

Selects exactly these blocks and fails if any is missing [F13, F15]:

  - `context/foundation/roadmap.md`: the `### S-20` section, up to the next heading of the same or a
    higher level (`#`, `##` or `###`) or the end of the file;
  - its Backlog Handoff row: the `| S-20 ` row inside `## Backlog Handoff`;
  - `temp_steps.md`: the `## Teraz` section;
  - `context/changes/cloud-classical-denoise/change.md`: step 1 of `### Sequence`.

Each block must link `evaluations/step1-gate.md` and hold none of the old wordings
(`not started`, `NIE rozpoczęte`, `proposed`, `on hold`, `planning`, any case). A wording elsewhere
in the file (another slice's `on hold`) is not this check's business.

Exit status: 0 every pointer current; 1 a pointer stale (file, block and what was found); 2 a file
unreadable or a block missing.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import evidence  # noqa: E402

LINK = "evaluations/step1-gate.md"
OLD = ("not started", "NIE rozpoczęte", "proposed", "on hold", "planning")
ROADMAP, TEMP, CHANGE = ("context/foundation/roadmap.md", "temp_steps.md",
                         "context/changes/cloud-classical-denoise/change.md")
HEADING = re.compile(r"^(#{1,6}) ")


class Missing(Exception):
    pass


def section(text: str, start: re.Pattern, what: str) -> str:
    """From the heading `start` matches up to the next heading of the same or a higher level."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if start.match(line):
            level = len(HEADING.match(line).group(1))
            end = next((j for j in range(i + 1, len(lines))
                        if (m := HEADING.match(lines[j])) and len(m.group(1)) <= level), len(lines))
            return "\n".join(lines[i:end])
    raise Missing(what)


def blocks(root: Path) -> list[tuple[str, str, str]]:
    """(file, block name, text) for every designated block; Missing if one cannot be selected."""
    def read(rel):
        try:
            return (root / rel).read_text()
        except OSError as e:
            raise Missing(f"{rel}: {e}")

    roadmap, temp, change = read(ROADMAP), read(TEMP), read(CHANGE)
    out = [(ROADMAP, "### S-20 section", section(roadmap, re.compile(r"^### S-20\b"), f"{ROADMAP}: ### S-20"))]
    handoff = section(roadmap, re.compile(r"^## Backlog Handoff\b"), f"{ROADMAP}: ## Backlog Handoff")
    rows = [ln for ln in handoff.splitlines() if ln.startswith("| S-20 ")]
    if len(rows) != 1:
        raise Missing(f"{ROADMAP}: {len(rows)} `| S-20 ` rows in ## Backlog Handoff, expected one")
    out.append((ROADMAP, "Backlog Handoff row", rows[0]))
    out.append((TEMP, "## Teraz", section(temp, re.compile(r"^## Teraz\b"), f"{TEMP}: ## Teraz")))
    seq = section(change, re.compile(r"^### Sequence\b"), f"{CHANGE}: ### Sequence").splitlines()
    first = next((i for i, ln in enumerate(seq) if re.match(r"^1\. ", ln)), None)
    if first is None:
        raise Missing(f"{CHANGE}: step 1 of ### Sequence")
    end = next((j for j in range(first + 1, len(seq)) if re.match(r"^(\d+\. |#)", seq[j])), len(seq))
    out.append((CHANGE, "### Sequence step 1", "\n".join(seq[first:end])))
    return out


def stale(blocks_: list[tuple[str, str, str]]) -> list[str]:
    problems = []
    for rel, name, text in blocks_:
        if LINK not in text:
            problems.append(f"{rel} ({name}): no link to {LINK}")
        for old in OLD:
            if old.lower() in text.lower():
                line = next(ln.strip() for ln in text.splitlines() if old.lower() in ln.lower())
                problems.append(f"{rel} ({name}): old wording {old!r} in: {line[:160]}")
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", type=Path, default=None)
    args = ap.parse_args(argv)
    root = args.root or evidence.repo_root()
    try:
        found = blocks(root)
    except Missing as e:
        print(f"cannot check the S-20 pointers: {e}. Way out: restore the block, then re-run.", file=sys.stderr)
        return 2
    problems = stale(found)
    if problems:
        print("stale S-20 pointer(s):\n  " + "\n  ".join(problems)
              + f"\nWay out: point each block at {LINK} and drop the old wording.")
        return 1
    print(f"✓ all {len(found)} S-20 pointers link {LINK} and carry no old wording")
    return 0


if __name__ == "__main__":
    sys.exit(main())
