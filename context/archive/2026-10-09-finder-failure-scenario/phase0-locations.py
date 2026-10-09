#!/usr/bin/env python3
"""Phase 0 deterministic layer (D): the location rule L of phase0.md § Pre-registration §2.

Reads the archived finding records (via `git show <commit>:<path>`), the frozen diffs and the
runs' tool-call logs, and writes one record per published finding with its row, its owner and
delegated dispositions, and whether its cited range passes L. No network, no model calls.

    python3 context/changes/finder-failure-scenario/phase0-locations.py > phase0-findings.json

Inputs outside the repository (not committed, kept by the owner since finder-sonnet):
  ~/.cache/finder-sonnet-gate/{247,269}/pr.diff            frozen diffs (sha256 checked below)
  ~/.cache/finder-sonnet-gate/runs/247-r1/stderr.log       set H tool calls
  ~/.cache/finder-sonnet-effort-gate/runs/<run>/stderr.log set E tool calls
Set G's tool calls are in its own records (`requests[].fileContextCalls`).
"""

import hashlib
import json
import os
import re
import subprocess
import sys

E_REF = "086a364d9f30519bf63f163a99183ce9ecce8580"
G_REF = "573ee3373cfd548fcbda9c1575b17684423a1b58"
H_REF = "origin/master"
E_DIR = "context/archive/2026-10-06-finder-sonnet-effort"
G_DIR = "context/archive/2026-10-02-finder-model-swap"
H_DIR = "context/archive/2026-10-05-finder-sonnet"

CACHE = os.path.expanduser("~/.cache")
DIFFS = {
    247: (f"{CACHE}/finder-sonnet-gate/247/pr.diff", "21973af35cc39f60488935583a85baf894a6c1a9b51069d16de86e701b5dc2e1"),
    269: (f"{CACHE}/finder-sonnet-gate/269/pr.diff", "1e4ec0882371989122f9e4254c93c4df1f51826a4f57dbfe04139175177e550f"),
}

# Dispositions transcribed from the archived hand-reads. Owner: G (2026-10-03) and H (2026-10-06).
# Delegated: E (agent at the owner's request, 2026-10-07) — information, never an owner decision.
G_OWNER = {"D2": ("real", "real")}
for r in ["D1", "D13", "D14", "D15", "D20"]:
    G_OWNER[r] = ("rejected", "code contradicts the claim")
for r in ["D3", "D11", "D17"]:
    G_OWNER[r] = ("rejected", "cannot occur with the harness's inputs")
G_OWNER["D12"] = ("rejected", "documented, deliberate method")
for r in ["D4", "D5", "D6", "D7", "D8"]:
    G_OWNER[r] = ("rejected", "missing tests for maintainer-only tooling")
for r in ["D9", "D10", "D16", "D18", "D19"]:
    G_OWNER[r] = ("rejected", "only a friendlier message is missing, no wrong result")
H_OWNER = {
    "R1": ("real", "no retention guidance for copied production photos"),
    "R2": ("rejected", "only an earlier message is missing, no wrong result"),
    "R3": ("real", "latent unpaginated query, false NOT found past max_rows"),
    "R4": ("rejected", "code contradicts the claim"),
    "R5": ("real", "latent unpaginated census prints CONFIRMED on a subset"),
}
E_DELEGATED_REJECTED = {"R247-03", "R247-07", "R247-08", "R247-11", "R247-13", "R247-14", "R269-06", "R269-09"}


def git_show(ref, path):
    return subprocess.run(["git", "show", f"{ref}:{path}"], check=True, capture_output=True, text=True).stdout


def jsonl(text):
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def hunks(pr):
    path, want = DIFFS[pr]
    raw = open(path, "rb").read()
    got = hashlib.sha256(raw).hexdigest()
    if got != want:
        sys.exit(f"frozen diff {path} sha256 {got} != {want}")
    spans, current = {}, None
    for line in raw.decode().splitlines():
        if line.startswith("+++ "):
            current = None if line[4:] == "/dev/null" else line[4:].removeprefix("b/")
            spans.setdefault(current, [])
        m = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", line)
        if m and current:
            start, count = int(m.group(1)), int(m.group(2) or 1)
            if count:
                spans[current].append((start, start + count - 1))
    return spans


def log_fetches(path):
    fetched = []
    for line in open(path):
        for m in re.finditer(r"getFileContext ([^\s,(]+)", line):
            target = m.group(1)
            rm = re.match(r"^(.*):(\d+)-(\d+)$", target)
            fetched.append((rm.group(1), int(rm.group(2)), int(rm.group(3))) if rm else (target, 1, 10**9))
    return fetched


def location(finding, spans, fetched):
    file, start = finding.get("file", ""), finding.get("startLine")
    end = finding.get("endLine") or start
    if file not in spans:
        return False, "file not in diff" if "." in os.path.basename(file) else "directory or non-file path"
    if start is None:
        return False, "file-level finding (no startLine)"
    if any(a <= end and start <= b for a, b in spans[file]):
        return True, "overlaps a diff hunk"
    if any(f == file and a <= end and start <= b for f, a, b in fetched):
        return True, "overlaps fetched context"
    return False, "outside every hunk and every fetch of that file"


def main():
    spans = {pr: hunks(pr) for pr in DIFFS}
    out = []

    # Set E: sonnet-5 low/medium.
    runs = {r["runId"]: r for r in jsonl(git_show(E_REF, f"{E_DIR}/gate-effort-runs.jsonl")) if r.get("runId") and isinstance(r.get("findings"), list)}
    key = json.loads(git_show(E_REF, f"{E_DIR}/hand-read-key.json"))["rows"]
    for row, spec in key.items():
        for m in spec["members"]:
            run = runs[m["runId"]]
            f = run["findings"][m["index"]]
            fetched = log_fetches(f"{CACHE}/finder-sonnet-effort-gate/runs/{m['runId']}/stderr.log")
            ok, why = location(f, spans[int(run["pr"])], fetched)
            out.append({"set": "E", "row": f"E-{row}", "member": f"{m['runId']}#{m['index']}", "pr": int(run["pr"]),
                        "owner": "unresolved", "ownerBasis": None,
                        "delegated": "rejected" if row in E_DELEGATED_REJECTED else "accepted",
                        "L": ok, "Lwhy": why, "finding": f})

    # Set G: gpt-6-luna on #269.
    attempts = {r["id"]: r for r in jsonl(git_show(G_REF, f"{G_DIR}/gate-openai-pr269.jsonl")) if r.get("kind") == "attempt"}
    for row in json.loads(git_show(G_REF, f"{G_DIR}/hand-read-openai.json")):
        for ref in row["findings"]:
            a, i = ref.split(".")
            att = attempts[f"openai-pr269-{int(a):02d}"]
            f = att["findings"][int(i) - 1]
            fetched = [(c["path"], c.get("startLine") or 1, c.get("endLine") or 10**9)
                       for q in att.get("requests", []) for c in q.get("fileContextCalls", [])]
            ok, why = location(f, spans[269], fetched)
            disp, basis = G_OWNER[row["id"]]
            out.append({"set": "G", "row": f"G-{row['id']}", "member": f"{att['id']}#{ref}", "pr": 269,
                        "owner": disp, "ownerBasis": basis, "delegated": None, "L": ok, "Lwhy": why, "finding": f})

    # Set H: sonnet-5 high, 247-r1.
    rec = next(r for r in jsonl(git_show(H_REF, f"{H_DIR}/gate-sonnet-runs.jsonl")) if r.get("runId") == "247-r1" and isinstance(r.get("findings"), list))
    fetched = log_fetches(f"{CACHE}/finder-sonnet-gate/runs/247-r1/stderr.log")
    for i, f in enumerate(rec["findings"]):
        ok, why = location(f, spans[247], fetched)
        disp, basis = H_OWNER[f"R{i + 1}"]
        out.append({"set": "H", "row": f"H-R{i + 1}", "member": f"247-r1#{i}", "pr": 247,
                    "owner": disp, "ownerBasis": basis, "delegated": None, "L": ok, "Lwhy": why, "finding": f})

    json.dump(out, sys.stdout, indent=1, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
