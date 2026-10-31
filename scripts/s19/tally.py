#!/usr/bin/env python3
"""S-19 tally and gates: join the expected series, every attempt and the blind ratings.

  python3 scripts/s19/tally.py <export.json> --series <series.json> \\
      --attempts test-photos/private/s19/attempts.jsonl --gate core|tuning|validation --out <report.json>
  python3 scripts/s19/tally.py <export.json> --series <s.json> --attempts <a.jsonl> --diagnostic --out <r.json>

Execution is separate from the quality verdict (plan § Implementation Approach):
  exit 0  a structurally valid, auditable report; its `verdicts` say PASS or STOP per config
  exit 2  invalid evidence: duplicates, unknown or mismatched ids/hashes, mixed configs, wrong
          split, a missing expected record, an unreconciled attempt, a substituted result
Exit 0 alone never authorises another phase; read `verdicts[<config sha256>].verdict`.

Bar categories, from the candidate's side (`quality-bar.md`, plan § Definitions):
  severe regression  a confirmed content change, or the candidate flagged severe
  clear win          a clear preference for the candidate with a reason; an "unverified
                     lettering" reason alone is not enough (tie), an independent confirmed gain is,
                     even on a photo flagged "unverified reconstruction"
  moderate loss      a clear preference for the reference
  tie                anything slighter

Slot outcomes come from the ledger, never from the export: `ok` (first technically valid
result), `technical_failure`, `not_attempted_budget`. A technical failure or an unattempted slot
stays in the fixed denominator and makes the gate STOP as incomplete; it is never a visual tie
or a severe regression. A slot with no record at all is invalid evidence.

Gates, per immutable config (a combined export never pools candidates):
  core        GPT: all 3 photos × 3 slots resolved, valid and rated; STOP on any confirmed
              content change, or when one photo's repeats span a clear win and a moderate loss
              or worse. NAFNet: three matched comparisons with its control (same prepared hash,
              same Auto) and preference over the control on ≥ 2; otherwise STOP. Probes are
              diagnostic until their config's full core exists.
  tuning      all eight photos' slot-1 results rated against Local, the config's passing core
              report when it has core slots, ≥ 6 clear wins, ≤ 1 moderate loss, 0 severe, 0
              content changes
  validation  all 12 frozen slots, ≥ 8 clear wins, ≤ 1 moderate loss, 0 severe
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import protocol  # noqa: E402

PREFERENCES = ("candidate-clear", "candidate-slight", "tie", "reference-slight", "reference-clear")
REASON_TYPES = ("independent_gain", "unverified_lettering")
GATES = {
    "tuning": {"photos": 8, "wins": 6, "moderate": 1},
    "validation": {"photos": 12, "wins": 8, "moderate": 1},
}


class Invalid(Exception):
    pass


def category(r: dict) -> tuple[str, str]:
    """(bar category, reason) for one rating, from the candidate's side."""
    if r.get("content_change"):
        return "severe regression", "confirmed content change: " + r.get("crop_note", "")
    if r.get("severe_candidate"):
        return "severe regression", "flagged severe"
    pref = r["preference"]
    if pref == "candidate-clear":
        if r.get("clear_reason_type") == "unverified_lettering":
            return "tie", "clear preference rests only on unverified lettering"
        return "clear win", r.get("reason", "")
    if pref == "reference-clear":
        return "moderate loss", r.get("reason", "")
    return "tie", pref


def validate_rating(r: dict) -> None:
    rid = r.get("rating_id", "?")
    for k in ("rating_id", "photo", "preference", "candidate", "reference"):
        if k not in r:
            raise Invalid(f"rating {rid}: missing {k}")
    if r["preference"] not in PREFERENCES:
        raise Invalid(f"rating {rid}: preference {r['preference']!r} is not one of {PREFERENCES}")
    if r.get("content_change") and not r.get("crop_note", "").strip():
        raise Invalid(f"rating {rid}: content change without the mandatory crop note 'original → result'")
    if r["preference"] in ("candidate-clear", "reference-clear"):
        if not r.get("reason", "").strip():
            raise Invalid(f"rating {rid}: a clear preference needs a reason")
        if r["preference"] == "candidate-clear" and r.get("clear_reason_type") not in REASON_TYPES:
            raise Invalid(f"rating {rid}: a clear candidate win needs clear_reason_type {REASON_TYPES}")


def read_ledger(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for n, line in enumerate(path.read_text().splitlines(), 1):
        if line.strip():
            try:
                rows.append(json.loads(line))
            except ValueError as e:
                raise Invalid(f"{path} line {n} is not JSON: {e}") from e
    return rows


def slot_outcomes(series: dict, rows: list[dict], diagnostic: bool) -> dict[tuple, dict]:
    """Per expected slot: status and, when ok, the first valid result. Raises Invalid."""
    res_by = {r["attempt_id"]: r for r in rows if r.get("event") == "result"}
    out = {}
    for s in series["slots"]:
        key = (s["config_sha256"], s["input_sha256"], s["photo"], s["slot"])

        def match(r: dict, key=key) -> bool:
            return (r.get("config_sha256"), r.get("input_sha256"), r.get("photo"), r.get("slot")) == key

        reserves = sorted((r for r in rows if r.get("event") == "reserve" and match(r)), key=lambda r: r["ordinal"])
        terminal = [r for r in rows if r.get("event") == "slot_terminal" and match(r)]
        refused = [r for r in rows if r.get("event") == "budget_refusal" and match(r)]
        results = [res_by.get(r["attempt_id"]) for r in reserves]
        oks = [i for i, r in enumerate(results) if r and r.get("status") == "ok"]
        if oks:
            first = oks[0]
            if len(reserves) > first + 1:
                raise Invalid(f"{s['photo']}/{s['slot']} ({s['config_name']}): attempts after its first valid result "
                              "— a later result cannot replace it")
            if None in results[:first]:
                raise Invalid(f"{s['photo']}/{s['slot']}: an earlier attempt has no reconciled result")
            out[key] = {"status": "ok", "result": results[first], "attempts": len(reserves)}
        elif terminal:
            out[key] = {"status": terminal[0]["status"], "attempts": len(reserves), "reason": terminal[0]["reason"]}
        elif refused:
            out[key] = {"status": "not_attempted_budget", "attempts": len(reserves)}
        elif reserves:
            raise Invalid(f"{s['photo']}/{s['slot']} ({s['config_name']}): {len(reserves)} attempt(s) but no valid "
                          "result and no terminal record — reconcile the ledger (resume the run) first")
        elif diagnostic:
            out[key] = {"status": "absent"}
        else:
            out[key] = {"status": "missing"}
    return out


def tally(export: dict, series: dict, rows: list[dict], gate: str | None, diagnostic: bool) -> dict:
    ratings = export.get("ratings")
    if not isinstance(ratings, list):
        raise Invalid("export has no ratings list")
    if export.get("split") != series.get("split"):
        raise Invalid(f"export split {export.get('split')!r} ≠ series split {series.get('split')!r}")
    seen_ids: set[str] = set()
    for r in ratings:
        validate_rating(r)
        if r["rating_id"] in seen_ids:
            raise Invalid(f"duplicate rating id {r['rating_id']}")
        seen_ids.add(r["rating_id"])
    outcomes = slot_outcomes(series, rows, diagnostic)
    slots = {(s["config_sha256"], s["photo"], s["slot"]): s for s in series["slots"]}

    # Join each rating to its expected slot and that slot's first valid output.
    joined: dict[tuple, list[dict]] = defaultdict(list)
    for r in ratings:
        c = r["candidate"]
        key = (c.get("config_sha256"), r["photo"], c.get("slot"))
        s = slots.get(key)
        if s is None:
            raise Invalid(f"rating {r['rating_id']}: {r['photo']}/{c.get('slot')} of config "
                          f"{str(c.get('config_sha256'))[:12]}… is not an expected slot of this series")
        if c.get("input_sha256") != s["input_sha256"]:
            raise Invalid(f"rating {r['rating_id']}: input hash differs from the series' prepared input")
        o = outcomes[(s["config_sha256"], s["input_sha256"], s["photo"], s["slot"])]
        if o["status"] != "ok":
            raise Invalid(f"rating {r['rating_id']}: slot status is {o['status']}, there is no output to rate")
        if c.get("output_sha256") != o["result"]["output_sha256"]:
            raise Invalid(f"rating {r['rating_id']}: rated output is not the slot's first valid result")
        ref = r["reference"]
        if ref.get("kind") not in ("local", "control"):
            raise Invalid(f"rating {r['rating_id']}: reference kind must be local or control")
        if ref.get("kind") == "control":
            if s["kind"] != "nafnet":
                raise Invalid(f"rating {r['rating_id']}: only NAFNet is rated against a control")
            if ref.get("input_sha256") != s["input_sha256"]:
                raise Invalid(f"rating {r['rating_id']}: control was not made from the same prepared input")
            if ref.get("auto_common_sha256") != c.get("auto_common_sha256"):
                raise Invalid(f"rating {r['rating_id']}: control and candidate use different Auto records")
        pair = (key, ref["kind"])
        if pair in {(k, x["reference"]["kind"]) for k, xs in joined.items() for x in xs}:
            raise Invalid(f"rating {r['rating_id']}: {r['photo']}/{c.get('slot')} rated twice against "
                          f"{ref['kind']}")
        cat, why = category(r)
        joined[key].append({**r, "category": cat, "category_reason": why})

    report: dict = {"gate": "diagnostic" if diagnostic else gate, "series_id": series["series_id"],
                    "split": series["split"], "verdicts": {}}
    for config_sha, meta in series["configs"].items():
        mine = [s for s in series["slots"] if s["config_sha256"] == config_sha]
        status_counts = Counter(outcomes[(s["config_sha256"], s["input_sha256"], s["photo"], s["slot"])]["status"]
                                for s in mine)
        rows_out = []
        for s in mine:
            o = outcomes[(s["config_sha256"], s["input_sha256"], s["photo"], s["slot"])]
            for j in joined.get((config_sha, s["photo"], s["slot"]), []) or [None]:
                rows_out.append({"photo": s["photo"], "slot": s["slot"], "role": s["role"], "status": o["status"],
                                 "attempts": o.get("attempts", 0),
                                 "reference": j["reference"]["kind"] if j else None,
                                 "category": j["category"] if j else None,
                                 "reason": j["category_reason"] if j else o.get("reason")})
        entry = {"name": meta["name"], "kind": meta["kind"], "slot_status": dict(status_counts), "rows": rows_out}
        if diagnostic:
            entry["verdict"] = "DIAGNOSTIC"
        else:
            entry.update(gate_verdict(gate, meta, mine, outcomes, joined, series))
        report["verdicts"][config_sha] = entry
    return report


def need(cond: bool, reasons: list[str], msg: str) -> None:
    if not cond:
        reasons.append(msg)


def gate_verdict(gate: str, meta: dict, mine: list[dict], outcomes: dict, joined: dict, series: dict) -> dict:
    reasons: list[str] = []

    def outcome(s):
        return outcomes[(s["config_sha256"], s["input_sha256"], s["photo"], s["slot"])]

    def ratings_of(s, kind):
        return [j for j in joined.get((s["config_sha256"], s["photo"], s["slot"]), []) if j["reference"]["kind"] == kind]

    if gate == "core":
        core = [s for s in mine if s["role"] == "core"]
        if not core:
            return {"verdict": "DIAGNOSTIC", "reasons": ["probe-only config: no core slots in this series"]}
        bad = [f"{s['photo']}/{s['slot']} {outcome(s)['status']}" for s in core if outcome(s)["status"] != "ok"]
        if any(outcome(s)["status"] == "missing" for s in core):
            raise Invalid(f"{meta['name']}: expected core slot(s) have no record: {bad}")
        if bad:
            return {"verdict": "STOP", "reasons": [f"incomplete core: {', '.join(bad)}"]}
        for s in core:
            if not ratings_of(s, "local"):
                raise Invalid(f"{meta['name']}: core slot {s['photo']}/{s['slot']} has no rating against Local")
        cats = defaultdict(list)
        for s in core:
            for j in ratings_of(s, "local"):
                cats[s["photo"]].append(j["category"])
                need(not j.get("content_change"), reasons,
                     f"confirmed content change on {s['photo']}/{s['slot']}: {j.get('crop_note', '')}")
        for photo, cs in cats.items():
            if "clear win" in cs and ({"moderate loss", "severe regression"} & set(cs)):
                reasons.append(f"{photo}: repeats span a clear win and {'/'.join(sorted(set(cs) - {'clear win', 'tie'}))}")
        if meta["kind"] == "nafnet":
            preferred = 0
            for s in core:
                ctl = ratings_of(s, "control")
                if not ctl:
                    raise Invalid(f"nafnet {s['photo']}: no matched rating against its control")
                preferred += ctl[0]["preference"] in ("candidate-clear", "candidate-slight")
            need(preferred >= 2, reasons, f"NAFNet preferred over its control on {preferred} of {len(core)}, needs ≥ 2")
        return {"verdict": "STOP" if reasons else "PASS", "reasons": reasons, "per_photo": dict(cats)}

    rule = GATES[gate]
    firsts = [s for s in mine if s["slot"] == 1 and s["role"] in ("core", "tuning", "validation")]
    photos = sorted({s["photo"] for s in firsts})
    if len(photos) != rule["photos"]:
        raise Invalid(f"{meta['name']}: the {gate} gate needs {rule['photos']} photos' slot-1 results, the series "
                      f"lists {len(photos)}")
    missing = [s["photo"] for s in firsts if outcome(s)["status"] == "missing"]
    if missing:
        raise Invalid(f"{meta['name']}: no record for {', '.join(missing)}")
    if gate == "tuning" and any(s["role"] == "core" for s in mine):
        pre = [p for p in series.get("prerequisites", []) if p.get("config_sha256") == mine[0]["config_sha256"]
               and p.get("stage") == "core"]
        ok_pre = False
        for p in pre:
            path = protocol.resolve(p["report"])
            if path.exists() and protocol.sha256_file(path) == p["report_sha256"]:
                v = json.loads(path.read_text()).get("verdicts", {}).get(p["config_sha256"], {}).get("verdict")
                ok_pre = ok_pre or v == "PASS"
        need(ok_pre, reasons, "no linked PASS core report for this config")
    cats = Counter()
    incomplete = []
    for s in firsts:
        o = outcome(s)
        if o["status"] != "ok":
            incomplete.append(f"{s['photo']} {o['status']}")
            continue
        r = ratings_of(s, "local")
        if not r:
            raise Invalid(f"{meta['name']}: {s['photo']} slot 1 has no rating against Local")
        cats[r[0]["category"]] += 1
        if r[0].get("content_change"):
            cats["content change"] += 1
    if incomplete:
        reasons.append(f"incomplete evidence: {', '.join(incomplete)} (denominator stays {rule['photos']})")
    need(cats["clear win"] >= rule["wins"], reasons,
         f"{cats['clear win']} clear wins of {rule['photos']}, needs ≥ {rule['wins']}")
    need(cats["moderate loss"] <= rule["moderate"], reasons, f"{cats['moderate loss']} moderate losses, allows ≤ 1")
    need(cats["severe regression"] == 0, reasons, f"{cats['severe regression']} severe regression(s), allows 0")
    if gate == "tuning":
        need(cats["content change"] == 0, reasons, f"{cats['content change']} confirmed content change(s), allows 0")
    return {"verdict": "STOP" if reasons else "PASS", "reasons": reasons, "counts": dict(cats),
            "denominator": rule["photos"], "incomplete": bool(incomplete)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="S-19 tally and gates")
    ap.add_argument("export")
    ap.add_argument("--series", required=True)
    ap.add_argument("--attempts", required=True)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--gate", choices=("core", "tuning", "validation"))
    g.add_argument("--diagnostic", action="store_true")
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    try:
        export = json.loads(protocol.resolve(args.export).read_text())
        series_path = protocol.resolve(args.series)
        series = json.loads(series_path.read_text())
        if args.gate == "validation" and series.get("split") != "validation":
            raise Invalid("the validation gate needs the validation series")
        if args.gate in ("core", "tuning") and series.get("split") != "tuning":
            raise Invalid(f"the {args.gate} gate needs a tuning series")
        rows = read_ledger(protocol.resolve(args.attempts))
        report = tally(export, series, rows, args.gate, args.diagnostic)
    except (Invalid, OSError, ValueError, KeyError) as e:
        print(f"INVALID EVIDENCE: {e}", file=sys.stderr)
        return 2
    report["inputs"] = {"export_sha256": protocol.sha256_file(protocol.resolve(args.export)),
                        "series_sha256": protocol.sha256_file(series_path),
                        "attempts": args.attempts}
    out = protocol.resolve(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    for sha, v in report["verdicts"].items():
        print(f"{v['name']} ({sha[:12]}…): {v['verdict']}  slots {v['slot_status']}  {v.get('counts', '')}")
        for r in v.get("reasons", []):
            print(f"    - {r}")
    print(f"report → {args.out}. Exit 0 means the evidence is valid; read each verdict before advancing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
