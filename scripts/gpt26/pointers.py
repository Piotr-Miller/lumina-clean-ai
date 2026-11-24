#!/usr/bin/env python3
"""GPT26 status pointers, checked block by block (plan `gpt-image-26-wider` Phase 1 §1, Phase 5 §2).

  python3 scripts/gpt26/pointers.py --config <config> [--root <dir>]

The canonical outcome is the study's `<change_dir>/evaluations/verdict.md`, whose
`**Verdict: PASS.**` or `**Verdict: FAIL.**` line decides. A BLOCKED or missing verdict decides
nothing, so no pointer can be current against it. `<change-id>` below is the last component of
the config's `study.change_dir`.

Selects exactly these live blocks, each by one selector that must match once:

  - `context/foundation/roadmap.md`: the one `## Parked` bullet (its subsections included)
    naming `` `<change-id>` ``;
  - `idea-notes.md`: the current quality-status clause, from `**Still not demonstrated` to the
    end of its list item;
  - `temp_steps.md`: the one `## Teraz` numbered item naming `<change-id>`, and the one
    `## Kolejka` bullet naming `` `<change-id>` ``;
  - `<change_dir>/change.md`: the `## Outcome` section.

Only when `context/foundation/github-issues.md` has a `## Final mapping` row whose Change ID cell
is `` `<change-id>` `` and whose Issue cell carries an issue number, two more blocks are checked:
that row's Status cell, and the one dated `## Status updates` row for the same issue that links
the verdict. Without such a row the local check is complete (the issue decision is the owner's,
plan Phase 5). No selector keys on a predecessor's issue number or opening date.

Each block must link the verdict file (a Markdown link resolved against the file's own folder,
or a backticked repository path) and state the verdict in bold (`**PASS**` or `**FAIL**`), never
the opposite one in bold; the mapping Status cell states it as a plain word instead. No block
may carry a stale current claim from `STALE` (case-insensitive, whitespace-normalized, so a
line break cannot hide one). The `idea-notes.md` clause must keep saying that the quality claim
is still not demonstrated and that Cloud stays paused: a PASS opens only a further decision.

Exit status: 0 every pointer current; 1 a pointer stale or missing its outcome text (file,
block and what was found); 2 usage, a file unreadable, the study invalid, the verdict
unreadable or undecided, or a selector missing or ambiguous.
"""

from __future__ import annotations

import argparse
import posixpath
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import study as study_mod  # noqa: E402

ROADMAP, ISSUES, IDEA, TEMP = ("context/foundation/roadmap.md", "context/foundation/github-issues.md",
                               "idea-notes.md", "temp_steps.md")
VERDICT = re.compile(r"^\*\*Verdict: ([A-Z]+)\.\*\*", re.M)
HEADING = re.compile(r"^(#{1,6}) ")
MD_LINK = re.compile(r"\]\(([^)\s]+)\)")
CODE_PATH = re.compile(r"`([^`\s]+)`")
ISSUE_NUMBER = re.compile(r"(?:issues/|#)(\d+)\b")
DATE = re.compile(r"20\d{2}-\d{2}-\d{2}")

# Stale current claims from before the wider run (plan Phase 5 §2), rejected in every block.
STALE = (
    "only opens a wider comparison",
    "only opens this wider comparison",
    "Not yet a change",
    "otworzyć to porównanie jako nową zmianę",
)
IDEA_KEEPS = ("Still not demonstrated", "Cloud stays paused")


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


def normalized(text: str) -> str:
    return " ".join(text.split()).lower()


def verdict(root: Path, verdict_rel: str) -> str:
    try:
        text = read(root, verdict_rel)
    except Missing as e:
        raise Missing(f"{e}; run scripts/gpt26/gate.py first")
    found = VERDICT.findall(text)
    if len(found) != 1 or found[0] not in ("PASS", "FAIL"):
        raise Missing(f"{verdict_rel}: no single PASS/FAIL verdict line (found {found or 'none'}); "
                      "run scripts/gpt26/gate.py first")
    return found[0]


def blocks(root: Path, study: study_mod.Study) -> list[tuple[str, str, str, str]]:
    """(file, block name, kind, text) for every outcome block; Missing if one cannot be selected."""
    cid = study.change_id
    roadmap, idea, temp, change, issues = (read(root, r) for r in (ROADMAP, IDEA, TEMP, study.change_md, ISSUES))
    out = []

    parked = section(roadmap, re.compile(r"^## Parked\b"), f"{ROADMAP}: ## Parked")
    out.append((ROADMAP, "Parked entry", "prose",
                one([b for b in items(parked, re.compile(r"^- ")) if f"`{cid}`" in b],
                    f"{ROADMAP}: ## Parked bullet naming `{cid}`")))

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
    out.append((TEMP, "## Teraz item", "prose",
                one([t for t in items(teraz, re.compile(r"^\d+\. ")) if cid in t],
                    f"{TEMP}: ## Teraz numbered item naming {cid}")))
    kolejka = section(temp, re.compile(r"^## Kolejka\b"), f"{TEMP}: ## Kolejka")
    out.append((TEMP, "## Kolejka entry", "prose",
                one([b for b in items(kolejka, re.compile(r"^- ")) if f"`{cid}`" in b],
                    f"{TEMP}: ## Kolejka bullet naming `{cid}`")))

    out.append((study.change_md, "## Outcome", "prose",
                "\n".join(section(change, re.compile(r"^## Outcome\b"), f"{study.change_md}: ## Outcome"))))

    out += issue_blocks(issues, study)
    return out


def issue_blocks(issues: str, study: study_mod.Study) -> list[tuple[str, str, str, str]]:
    """The mapping Status cell and the dated outcome row, only when this change has an issue."""
    cid = study.change_id
    try:
        mapping = section(issues, re.compile(r"^## Final mapping\b"), f"{ISSUES}: ## Final mapping")
    except Missing:
        return []
    rows = [ln for ln in mapping if ln.startswith("|") and len(cells(ln)) >= 4 and cells(ln)[2] == f"`{cid}`"]
    numbered = [(ln, m.group(1)) for ln in rows if (m := ISSUE_NUMBER.search(cells(ln)[1]))]
    if not numbered:
        return []
    row, number = one([ln for ln, _ in numbered], f"{ISSUES}: mapping row for `{cid}` with an issue"), numbered[0][1]
    out = [(ISSUES, f"mapping row #{number} (Status cell)", "mapping", cells(row)[3])]
    log = section(issues, re.compile(r"^## Status updates\b"), f"{ISSUES}: ## Status updates")
    dated = [c for ln in log if ln.startswith("|") and len(c := cells(ln)) == 4 and DATE.fullmatch(c[0])
             and re.search(rf"(?:issues/|#){number}\b", c[2])]
    linking = [c[3] for c in dated if links_verdict(ISSUES, c[3], study.verdict_md)]
    block = f"status-log outcome row for #{number}"
    out.append((ISSUES, block, "prose", one(linking, f"{ISSUES}: {block}") if linking else ""))
    return out


def links_verdict(rel: str, text: str, verdict_rel: str) -> bool:
    base = posixpath.dirname(rel)
    for target in MD_LINK.findall(text):
        path = target.split("#", 1)[0]
        if path and posixpath.normpath(posixpath.join(base, path)) == verdict_rel:
            return True
    return any(posixpath.normpath(p) == verdict_rel for p in CODE_PATH.findall(text))


def stale(found: list[tuple[str, str, str, str]], outcome: str, verdict_rel: str) -> list[str]:
    other = "FAIL" if outcome == "PASS" else "PASS"
    problems = []
    for rel, name, kind, text in found:
        where = f"{rel} ({name})"
        if not text.strip():
            problems.append(f"{where}: no row carries the outcome")
            continue
        if not links_verdict(rel, text, verdict_rel):
            problems.append(f"{where}: no link to {verdict_rel}")
        # A table cell states the word plainly; prose states it in bold, so "a PASS would open…"
        # in a FAIL block is not a contradiction.
        says, contra = ((re.search(rf"\b{outcome}\b", text), re.search(rf"\b{other}\b", text)) if kind == "mapping"
                        else (f"**{outcome}**" in text, f"**{other}**" in text))
        if not says:
            problems.append(f"{where}: does not state {outcome}")
        if contra:
            problems.append(f"{where}: states {other}, but the verdict is {outcome}")
        flat = normalized(text)
        for old in STALE:
            if normalized(old) in flat:
                problems.append(f"{where}: stale current claim {old!r}")
        if kind == "idea":
            for keep in IDEA_KEEPS:
                if normalized(keep) not in flat:
                    problems.append(f"{where}: lost {keep!r}; a GPT26 study never proves production quality")
    return problems


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--config", required=True, help="the study's config (repo-relative or inside the checkout)")
    ap.add_argument("--root", type=Path, default=None)
    args = ap.parse_args(argv)
    root = args.root or ROOT
    try:
        study = study_mod.load(root, args.config)[0]
    except study_mod.StudyError as e:
        print(f"cannot check the GPT26 pointers: the study is not valid: {e}", file=sys.stderr)
        return 2
    try:
        outcome = verdict(root, study.verdict_md)
        found = blocks(root, study)
    except Missing as e:
        print(f"cannot check the GPT26 pointers: {e}. Way out: restore the file or block, then re-run.",
              file=sys.stderr)
        return 2
    problems = stale(found, outcome, study.verdict_md)
    if problems:
        print(f"stale GPT26 pointer(s) against verdict {outcome}:\n  " + "\n  ".join(problems)
              + f"\nWay out: state **{outcome}** with a link to {study.verdict_md} in each block and drop the "
              "stale claim.")
        return 1
    print(f"✓ all {len(found)} GPT26 pointer blocks link {study.verdict_md} and state **{outcome}**")
    return 0


if __name__ == "__main__":
    sys.exit(main())
