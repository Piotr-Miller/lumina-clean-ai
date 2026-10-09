#!/usr/bin/env python3
"""Phase 0 tally: joins phase0-findings.json (layer D) with phase0-grades.json (layer C) and
prints the per-row outcomes and the counts phase0.md § Pre-registration §5-6 asks for.

    python3 context/changes/finder-failure-scenario/phase0-tally.py
"""

import collections
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
findings = json.load(open(os.path.join(HERE, "phase0-findings.json")))
grades = json.load(open(os.path.join(HERE, "phase0-grades.json")))["members"]
H2_CLASS = {"G-D4", "G-D5", "G-D6", "G-D7", "G-D8", "G-D9", "G-D10", "G-D16", "G-D18", "G-D19", "H-R2"}


def member_outcome(x, layer="D+C"):
    t, w, _ = grades[x["member"]]
    if not x["L"]:
        return "removed"
    if layer == "D":
        return "retained"
    if "no" in (t, w):
        return "removed"
    if "borderline" in (t, w):
        return "uncertain"
    return "retained"


def row_outcome(members):
    s = set(members)
    if "retained" in s:
        return "retained" if s == {"retained"} else "partly removed"
    if "uncertain" in s:
        return "uncertain"
    return "removed"


rows = collections.OrderedDict()
for x in findings:
    if x["member"] not in grades:
        raise SystemExit(f"ungraded member {x['member']}")
    rows.setdefault(x["row"], []).append(x)
assert len(findings) == len(grades) == 75 and len(rows) == 51

table = []
for row, xs in rows.items():
    full = row_outcome([member_outcome(x) for x in xs])
    d_only = row_outcome([member_outcome(x, "D") for x in xs])
    table.append((row, xs[0]["owner"], xs[0]["ownerBasis"], xs[0]["delegated"], d_only, full, len(xs)))

print("row | owner | delegated | D only | D+C | members")
for r in table:
    print(f"{r[0]} | {r[1]} | {r[3]} | {r[4]} | {r[5]} | {r[6]}")

def count(pred, col=5):
    return collections.Counter(r[col] for r in table if pred(r))

print("\nall rows, D+C:", dict(count(lambda r: True)))
print("all rows, D only:", dict(count(lambda r: True, 4)))
print("owner-rejected (21), D+C:", dict(count(lambda r: r[1] == "rejected")))
print("owner-real (4), D+C:", {r[0]: r[5] for r in table if r[1] == "real"})
print("H2 class (11), D+C:", dict(count(lambda r: r[0] in H2_CLASS)))
print("H2 class detail:", {r[0]: r[5] for r in table if r[0] in H2_CLASS})
print("E delegated-rejected (8):", dict(count(lambda r: r[3] == "rejected")))
print("E delegated-accepted (18):", dict(count(lambda r: r[3] == "accepted")))
print("by owner basis, D+C:")
for basis in sorted({r[2] for r in table if r[2]}):
    print("  ", basis, dict(count(lambda r: r[2] == basis)))
d2 = [(x["member"], member_outcome(x)) for x in findings if x["row"] == "G-D2"]
print("D2 members:", d2)

# Per run: published findings that survive the bar (retained or uncertain), and which survive with an
# owner-rejected or owner-unresolved disposition (both fail the unchanged gate).
print("\nper run: published -> surviving (gate-failing survivors)")
runs = collections.OrderedDict()
for x in findings:
    runs.setdefault(x["member"].split("#")[0], []).append(x)
for run, xs in runs.items():
    surv = [x for x in xs if member_outcome(x) != "removed"]
    bad = [x["row"] for x in surv if x["owner"] != "real"]
    d2 = any(x["row"] == "G-D2" for x in surv)
    print(f"  {run}: {len(xs)} -> {len(surv)}; failing {bad}; D2 {'kept' if d2 else '-'}")
