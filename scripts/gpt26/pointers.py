#!/usr/bin/env python3
"""GPT26 status pointers, checked block by block (plan Phase 5, item 2).

  python3 scripts/gpt26/pointers.py [--root <dir>]

The canonical outcome is `context/changes/gpt-image-26-screen/evaluations/verdict.md`, whose
`**Verdict: PASS.**` or `**Verdict: FAIL.**` line decides. A BLOCKED or missing verdict decides
nothing, so no pointer can be current against it.

Selects exactly these live blocks, each by one selector that must match once:

  - `context/foundation/roadmap.md`: the one `## Parked` bullet (its `### Resolved (formerly
    parked)` subsection included) naming `gpt-image-26-screen`;
  - `context/foundation/github-issues.md`: the `## Final mapping` row whose Change ID cell is
    `gpt-image-26-screen` (only its Status cell is checked: the Labels cell carries GitHub's
    label names, `status:proposed` among them, which are not a status claim of this file);
  - the same file's `## Status updates` rows for #359: the dated 2026-11-05 `opened for` record
    must survive unchanged in meaning, and at least one later row must carry the outcome;
  - `idea-notes.md`: the current quality-status clause, from `**Still not demonstrated` to the
    end of its list item;
  - `temp_steps.md`: the `## Teraz` numbered item about #359, and the `## Kolejka` bullet for
    `gpt-image-26-screen`;
  - `context/changes/gpt-image-26-screen/change.md`: the `## Outcome` section.

Each outcome block must link the verdict file (a Markdown link resolved against the file's own
folder, or a backticked repository path) and state the verdict in bold (`**PASS**` or
`**FAIL**`), never the opposite one in bold; the mapping row's Status cell states it as a plain
word instead (`screened: FAIL`), never the opposite word. Each must also be free of the old current-status
wordings listed for it in `OLD`. Those words elsewhere in a file — a dated log row, another
change's entry — are not this check's business. The `idea-notes.md` clause must keep saying
that the quality claim is still not demonstrated and that Cloud stays paused, because even a
six-output PASS only opens a wider comparison.

Exit status: 0 every pointer current; 1 a pointer stale or missing its outcome text (file,
block and what was found); 2 a file unreadable, the verdict unreadable or undecided, or a
selector missing or ambiguous.
"""

from __future__ import annotations

import argparse
import posixpath
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHANGE_ID = "gpt-image-26-screen"
CHANGE_DIR = f"context/changes/{CHANGE_ID}"
VERDICT_REL = f"{CHANGE_DIR}/evaluations/verdict.md"
ROADMAP, ISSUES, IDEA, TEMP, CHANGE = ("context/foundation/roadmap.md", "context/foundation/github-issues.md",
                                       "idea-notes.md", "temp_steps.md", f"{CHANGE_DIR}/change.md")
ISSUE = "issues/359)"
VERDICT = re.compile(r"^\*\*Verdict: ([A-Z]+)\.\*\*", re.M)
HEADING = re.compile(r"^(#{1,6}) ")
MD_LINK = re.compile(r"\]\(([^)\s]+)\)")
CODE_PATH = re.compile(r"`([^`\s]+)`")

# The old current-status wordings, per block (plan Phase 5 item 2). Compared case-insensitively.
OLD = {
    "roadmap": ("Why parked", "Draft:", "proposed", "builds its blind viewer"),
    "mapping": ("proposed",),
    "idea": ("zdecyduj, czy robimy",),
    "teraz": ("zdecyduj, czy robimy", "Potem /rune-plan", "po #359"),
    "kolejka": ("w toku", "Potem /rune-plan", "faza 3 na Fedorze", "prompt w sekcji"),
    "outcome": ("proposed", "Draft"),
}


class Missing(Exception):
    """A file that cannot be read, or a selector that does not match exactly once."""


def read(root: Path, rel: str) -> str:
    try:
        return (root / rel).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        raise Missing(f"{rel}: cannot read ({e.__class__.__name__})")


def section(text: str, start: re.Pattern, what: str) -> list[str]:
    """The lines from the one heading `start` matches up to the next heading of the same or a higher level."""
    lines = text.splitlines()
    hits = [i for i, line in enumerate(lines) if start.match(line)]
    if len(hits) != 1:
        raise Missing(f"{what}: {len(hits)} matching headings, expected one")
    i = hits[0]
    level = len(HEADING.match(lines[i]).group(1))
    end = next((j for j in range(i + 1, len(lines))
                if (m := HEADING.match(lines[j])) and len(m.group(1)) <= level), len(lines))
    return lines[i:end]


def items(lines: list[str], start: re.Pattern) -> list[str]:
    """List items (a line `start` matches plus its indented continuation lines), as text."""
    out, cur = [], None
    for line in lines:
        if start.match(line):
            if cur is not None:
                out.append("\n".join(cur))
            cur = [line]
        elif cur is not None and line.startswith(" ") and line.strip():
            cur.append(line)
        elif cur is not None:
            out.append("\n".join(cur))
            cur = None
    if cur is not None:
        out.append("\n".join(cur))
    return out


def one(found: list[str], what: str) -> str:
    if len(found) != 1:
        raise Missing(f"{what}: {len(found)} matches, expected one")
    return found[0]


def cells(row: str) -> list[str]:
    return [c.strip() for c in row.strip().strip("|").split("|")]


def verdict(root: Path) -> str:
    try:
        text = read(root, VERDICT_REL)
    except Missing as e:
        raise Missing(f"{e}; run scripts/gpt26/gate.py first")
    found = VERDICT.findall(text)
    if len(found) != 1 or found[0] not in ("PASS", "FAIL"):
        raise Missing(f"{VERDICT_REL}: no single PASS/FAIL verdict line (found {found or 'none'}); "
                      "run scripts/gpt26/gate.py first")
    return found[0]


def blocks(root: Path) -> list[tuple[str, str, str, str]]:
    """(file, block name, OLD key, text) for every outcome block; Missing if one cannot be selected."""
    roadmap, issues, idea, temp, change = (read(root, r) for r in (ROADMAP, ISSUES, IDEA, TEMP, CHANGE))
    out = []

    parked = section(roadmap, re.compile(r"^## Parked\b"), f"{ROADMAP}: ## Parked")
    bullet = one([b for b in items(parked, re.compile(r"^- ")) if f"`{CHANGE_ID}`" in b],
                 f"{ROADMAP}: ## Parked bullet naming `{CHANGE_ID}`")
    out.append((ROADMAP, "Parked entry", "roadmap", bullet))

    mapping = section(issues, re.compile(r"^## Final mapping\b"), f"{ISSUES}: ## Final mapping")
    row = one([ln for ln in mapping if ln.startswith("|") and len(cells(ln)) >= 4
               and cells(ln)[2] == f"`{CHANGE_ID}`"], f"{ISSUES}: mapping row for `{CHANGE_ID}`")
    out.append((ISSUES, "mapping row (Status cell)", "mapping", cells(row)[3]))

    log = [ln for ln in section(issues, re.compile(r"^## Status updates\b"), f"{ISSUES}: ## Status updates")
           if ln.startswith("| 2") and ISSUE in ln]
    one([ln for ln in log if ln.startswith("| 2026-11-05 ") and f"opened for `{CHANGE_ID}`" in ln],
        f"{ISSUES}: the 2026-11-05 `opened for` row of #359")
    later = [ln for ln in log if not ln.startswith("| 2026-11-05 ")]
    out.append((ISSUES, "status-log rows after 2026-11-05", "outcome", "\n".join(later)))

    idea_lines = idea.splitlines()
    starts = [i for i, ln in enumerate(idea_lines) if "**Still not demonstrated" in ln]
    if len(starts) != 1:
        raise Missing(f"{IDEA}: the **Still not demonstrated clause: {len(starts)} matches, expected one")
    i = starts[0]
    end = next((j for j in range(i + 1, len(idea_lines))
                if not (idea_lines[j].startswith(" ") and idea_lines[j].strip())), len(idea_lines))
    clause = "\n".join([idea_lines[i][idea_lines[i].index("**Still not demonstrated"):], *idea_lines[i + 1:end]])
    out.append((IDEA, "Still-not-demonstrated clause", "idea", clause))

    teraz = section(temp, re.compile(r"^## Teraz\b"), f"{TEMP}: ## Teraz")
    out.append((TEMP, "## Teraz item about #359", "teraz",
                one([i for i in items(teraz, re.compile(r"^\d+\. ")) if "#359" in i],
                    f"{TEMP}: ## Teraz numbered item naming #359")))
    kolejka = section(temp, re.compile(r"^## Kolejka\b"), f"{TEMP}: ## Kolejka")
    out.append((TEMP, "## Kolejka entry", "kolejka",
                one([b for b in items(kolejka, re.compile(r"^- ")) if f"`{CHANGE_ID}`" in b],
                    f"{TEMP}: ## Kolejka bullet naming `{CHANGE_ID}`")))

    out.append((CHANGE, "## Outcome", "outcome",
                "\n".join(section(change, re.compile(r"^## Outcome\b"), f"{CHANGE}: ## Outcome"))))
    return out


def links_verdict(rel: str, text: str) -> bool:
    base = posixpath.dirname(rel)
    for target in MD_LINK.findall(text):
        path = target.split("#", 1)[0]
        if path and posixpath.normpath(posixpath.join(base, path)) == VERDICT_REL:
            return True
    return any(posixpath.normpath(p) == VERDICT_REL for p in CODE_PATH.findall(text))


def stale(found: list[tuple[str, str, str, str]], outcome: str) -> list[str]:
    other = "FAIL" if outcome == "PASS" else "PASS"
    problems = []
    for rel, name, key, text in found:
        where = f"{rel} ({name})"
        if not text.strip():
            problems.append(f"{where}: no row carries the outcome")
            continue
        if key != "mapping" and not links_verdict(rel, text):
            problems.append(f"{where}: no link to {VERDICT_REL}")
        # A table cell states the word plainly; prose states it in bold, so "a PASS would open…"
        # in a FAIL block is not a contradiction.
        says, contra = ((re.search(rf"\b{outcome}\b", text), re.search(rf"\b{other}\b", text)) if key == "mapping"
                        else (f"**{outcome}**" in text, f"**{other}**" in text))
        if not says:
            problems.append(f"{where}: does not state {outcome}")
        if contra:
            problems.append(f"{where}: states {other}, but the verdict is {outcome}")
        for old in OLD[key]:
            if old.lower() in text.lower():
                line = next(ln.strip() for ln in text.splitlines() if old.lower() in ln.lower())
                problems.append(f"{where}: old wording {old!r} in: {line[:160]}")
        if key == "idea":
            for keep in ("Still not demonstrated", "Cloud stays paused"):
                if keep not in text:
                    problems.append(f"{where}: lost {keep!r}; a screen never proves production quality")
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", type=Path, default=None)
    args = ap.parse_args(argv)
    root = args.root or ROOT
    try:
        outcome = verdict(root)
        found = blocks(root)
    except Missing as e:
        print(f"cannot check the GPT26 pointers: {e}. Way out: restore the file or block, then re-run.",
              file=sys.stderr)
        return 2
    problems = stale(found, outcome)
    if problems:
        print(f"stale GPT26 pointer(s) against verdict {outcome}:\n  " + "\n  ".join(problems)
              + f"\nWay out: state **{outcome}** with a link to {VERDICT_REL} in each block and drop the old wording.")
        return 1
    print(f"✓ all {len(found)} GPT26 pointer blocks link {VERDICT_REL} and state **{outcome}**")
    return 0


if __name__ == "__main__":
    sys.exit(main())
