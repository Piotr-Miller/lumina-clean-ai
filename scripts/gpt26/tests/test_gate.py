"""blind.py, gate.py and the viewer copy offline: synthetic sets only, no private corpus, no network.

Three kinds of test:
  - pure rule and schema tests on hand-built records (`gate.decide`, `gate.ratings_of`,
    `gate.pairs_of`, the seal parser, the pass partition);
  - pipeline tests on module-level templates: a throwaway repository from `test_run.Screen`, a
    fake paid run, one real build of the blind set, the seal and a ratings export committed in
    order. Each test that mutates a template restores it (files by bytes, Git by reset), so the
    expensive build happens once per template;
  - the viewer copy: an allowlist diff against the archived S-20 viewer, and its two-pass
    controller exercised in Node.
"""

from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import json
import os
import random
import re
import shutil
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

GPT26 = Path(__file__).resolve().parents[1]
ROOT = GPT26.parents[1]
sys.path.insert(0, str(GPT26))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import blind  # noqa: E402
import gate  # noqa: E402
import test_run  # noqa: E402

state = blind.state
VIEWER = ROOT / blind.VIEWER_REL
S20_VIEWER = ROOT / "context/archive/2026-11-03-cloud-classical-denoise/references/compare-s20.html"
HEX64 = re.compile(r"[0-9a-f]{64}")
CROP = {"x": 1, "y": 2, "w": 3, "h": 4}

# The viewer adaptations the plan permits (Phase 3 item 2): base path and seal prefix. Everything
# else that differs must sit inside a `GPT26 begin` / `GPT26 end` block.
VIEWER_SUBS = [
    ('fatal("Podaj zestaw: compare-s20.html?set=<set_id> (zbudowany przez scripts/s20/blind.py).");',
     'fatal("Podaj zestaw: compare-gpt26.html?set=<set_id> (zbudowany przez scripts/gpt26/blind.py).");'),
    ('const base = "../../../../test-photos/private/s20/" + setId + "/";',
     'const base = "../../../../test-photos/private/gpt26/" + setId + "/";'),
    ('s.onerror = () =>\n          fatal("Brak manifestu " + s.src + ". Uruchom: python3 scripts/s20/blind.py <pilot|gate> --set " + setId);',
     's.onerror = () => fatal("Brak manifestu " + s.src + ". Uruchom: python3 scripts/gpt26/blind.py --set " + setId);'),
    ("/^S20-SEAL kind=(pilot|gate)", "/^GPT26-SEAL kind=(pilot|gate)"),
    ('.filter((l) => l.startsWith("S20-SEAL"));', '.filter((l) => l.startsWith("GPT26-SEAL"));'),
    ('"wklej dokładnie jedną linię S20-SEAL (jest "', '"wklej dokładnie jedną linię GPT26-SEAL (jest "'),
    ('"linia S20-SEAL ma zły format', '"linia GPT26-SEAL ma zły format'),
    ("Wklej linię <code>S20-SEAL</code>", "Wklej linię <code>GPT26-SEAL</code>"),
    ('aria-label="Linia S20-SEAL"', 'aria-label="Linia GPT26-SEAL"'),
]


def git(repo: Path, *args: str) -> str:
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, env=env)
    if r.returncode:
        raise AssertionError(f"git {args}: {r.stderr}")
    return r.stdout.strip()


# ---------------------------------------------------------------- templates


class Template:
    """One throwaway screen: registration, fake paid run, built and sealed set, committed ratings."""

    def __init__(self, script: dict | None = None, default: str = "ok", ratings: bool = True):
        self.screen = s = test_run.Screen("setUp")
        s.setUp()
        self.repo, self.paths, self.private = s.repo, s.paths, s.private
        local = s.paths.local
        local.mkdir(parents=True, exist_ok=True)
        series = json.loads((self.repo / blind.run.SERIES).read_text())
        shas = {}
        for spec in series["slots"]:
            if spec["photo"] in shas:
                continue
            path = local / f"{spec['photo']}.jpg"
            Image.linear_gradient("L").resize(tuple(spec["input_dimensions"])).convert("RGB").save(path, "JPEG")
            shas[spec["photo"]] = blind.sha_bytes(path.read_bytes())
        (self.repo / blind.BASELINES).parent.mkdir(parents=True, exist_ok=True)
        (self.repo / blind.BASELINES).write_text(json.dumps({"sha256": shas}, indent=2) + "\n")
        s.commit("baselines")
        s.approve()
        self.run_code, self.run_out, self.run_err = s.main("--cap", "1.50", fake=test_run.Fake(script, default))
        self.writes: list[str] = []
        real = blind.write_png

        def logged(pixels, size, out):
            self.writes.append(out.name)
            return real(pixels, size, out)

        with mock.patch.object(blind, "rng", lambda: random.Random(7)), mock.patch.object(blind, "write_png", logged):
            self.built = blind.build("t1", self.paths)
        self.set_dir = self.private / "t1"
        git(self.repo, "add", blind.SEAL_REL)
        git(self.repo, "commit", "-q", "-m", "seal")
        self.seal_commit = git(self.repo, "rev-parse", "HEAD")
        self.key = json.loads((self.set_dir / blind.KEY_NAME).read_text())
        if ratings and self.key["items"]:
            self.write_ratings()
            git(self.repo, "add", blind.RATINGS_REL)
            git(self.repo, "commit", "-q", "-m", "ratings")
        self.head = git(self.repo, "rev-parse", "HEAD")

    # ------------------------------------------------------------ ratings

    def rows(self, levels: dict | None = None, quality: str = "tie") -> list[dict]:
        levels = levels or {}
        out = []
        for item in [i for p in self.key["passes"] for i in p]:
            it = self.key["items"][item]
            g, lo = levels.get(f"{it['photo']}/{it['slot']}", ("none", "none"))
            fid = {}
            for side, level in ((it["gpt_side"], g), (it["local_side"], lo)):
                evidence = level in ("significant", "severe")
                fid[side] = {"level": level, "crops": [dict(CROP)] if evidence else [],
                             "reason": "lost stars" if evidence else ""}
            out.append({"pair_id": item, "quality": quality, "fidelity": dict(sorted(fid.items()))})
        return out

    def export(self, rows: list[dict]) -> dict:
        passes = self.key["passes"]
        first = [r for r in rows if r["pair_id"] in passes[0]] if len(passes) == 2 else None
        return {"viewer": "compare-s20", "version": 1, "kind": "gate", "set_id": "t1",
                "set_digest": self.key["set_digest"], "rated_on": "2026-11-21", "ratings": rows, "passes": passes,
                "locked_pass1": first}

    def checkpoint(self, locked: list[dict]) -> dict:
        return {"viewer": "compare-s20", "version": 1, "kind": "gate-pass1-checkpoint", "set_id": "t1",
                "set_digest": self.key["set_digest"], "locked_on": "2026-11-21", "passes": self.key["passes"],
                "ratings": locked}

    def write_ratings(self, levels: dict | None = None, quality: str = "tie") -> None:
        doc = self.export(self.rows(levels, quality))
        (self.repo / blind.RATINGS_REL).write_text(json.dumps(doc, indent=2) + "\n")
        if doc["locked_pass1"] is not None:
            gate.checkpoint_path(self.paths, "t1").write_text(json.dumps(self.checkpoint(doc["locked_pass1"])))

    def commit_ratings(self, levels: dict | None = None, quality: str = "tie") -> None:
        self.write_ratings(levels, quality)
        git(self.repo, "add", blind.RATINGS_REL)
        git(self.repo, "commit", "-q", "-m", "ratings again")

    # ------------------------------------------------------------ evaluation and restore

    def evaluate(self, export: bool = True) -> dict:
        return gate.evaluate("t1", (self.repo / blind.RATINGS_REL) if export else None, self.paths)

    def cli(self, tool, *args: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = tool.main(list(args), paths=self.paths)
        return code, out.getvalue(), err.getvalue()

    @contextlib.contextmanager
    def restored(self):
        """Restore Git to the template head and every private file to its bytes afterwards."""
        roots = (self.private, self.paths.inputs, self.paths.local)
        files = {p: p.read_bytes() for r in roots for p in r.rglob("*") if p.is_file()}
        try:
            yield
        finally:
            git(self.repo, "checkout", "-q", "-f", "--detach", self.head)
            git(self.repo, "clean", "-qfd")
            for p in [p for r in roots for p in r.rglob("*")]:
                if p.is_file() and p not in files and "logs" not in p.parts:
                    p.unlink()
            for p, data in files.items():
                if not p.exists() or p.read_bytes() != data:
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_bytes(data)
                    os.utime(p, ns=(blind.FILE_TIME_NS, blind.FILE_TIME_NS)) if p.parent == self.set_dir else None

    def label_of(self, item: str) -> str:
        it = self.key["items"][item]
        return f"{it['photo']}/{it['slot']}"


TEMPLATES: dict[str, Template] = {}


def template(kind: str) -> Template:
    if kind not in TEMPLATES:
        if kind == "six":
            TEMPLATES[kind] = Template()
        elif kind == "zero":  # every slot blocked twice or refused by the cap
            TEMPLATES[kind] = Template(default="moderation")
        elif kind == "breach":  # the first response is over its bound: everything else stops
            TEMPLATES[kind] = Template(script={"S17-03": ["over"]})
        elif kind == "five":  # S17-07/1 blocked twice: five delivered
            TEMPLATES[kind] = Template(script={"S17-07": ["moderation", "moderation"]})
    return TEMPLATES[kind]


def tearDownModule():
    for t in TEMPLATES.values():
        t.screen.doCleanups()


def blocked_reasons(fn) -> set[str]:
    try:
        fn()
    except gate.BlockedMany as e:
        return {b.reason for b in e.found}
    except gate.Blocked as e:
        return {e.reason}
    raise AssertionError("not BLOCKED")


# ---------------------------------------------------------------- the rule (pure)


GATE = json.loads((ROOT / "scripts/gpt26/configs/gpt26-low.json").read_text())["gate"]
LABELS = [f"{p}/{n}" for p in ("S17-03", "S17-04", "S17-07") for n in (1, 2)]
SPEND_OK = {"committed_usd": 0.6, "cap_usd": 1.5, "breaches": []}


def records(levels: list[tuple[str, str] | None], quality: str = "tie") -> list[dict]:
    out = []
    for label, lv in zip(LABELS, levels):
        if lv is None:
            out.append({"label": label, "delivered": False, "reason": "technical_failure: moderation_blocked",
                        "gpt_level": None, "local_level": None, "quality": None})
        else:
            out.append({"label": label, "delivered": True, "gpt_level": lv[0], "local_level": lv[1], "quality": quality})
    return out


class RuleTest(unittest.TestCase):
    def test_tie_rule_table(self):
        levels = GATE["fidelity_levels"]
        for g in levels:
            for lo in levels:
                with self.subTest(gpt=g, local=lo):
                    r = gate.decide(GATE, records([(g, lo)] * 6), SPEND_OK)
                    self.assertEqual(r["slots"][0]["tie"], levels.index(g) <= levels.index(lo))
        self.assertEqual(len(levels) ** 2, 16)

    def test_three_of_six_fails(self):
        r = gate.decide(GATE, records([("none", "none")] * 3 + [("minor", "none")] * 3), SPEND_OK)
        self.assertEqual((r["verdict"], r["ties"]), ("FAIL", 3))
        self.assertIn("fidelity: 3 of 6 pairs at least a tie, 4 required", r["reasons"]["fidelity"])

    def test_four_of_six_passes(self):
        r = gate.decide(GATE, records([("minor", "minor")] * 4 + [("minor", "none")] * 2), SPEND_OK)
        self.assertEqual((r["verdict"], r["ties"]), ("PASS", 4))

    def test_significant_fails(self):
        for bad in ("significant", "severe"):
            with self.subTest(level=bad):
                r = gate.decide(GATE, records([("none", "none")] * 5 + [(bad, "severe")]), SPEND_OK)
                self.assertEqual(r["verdict"], "FAIL")
                self.assertEqual(r["ties"], 6)  # a tie on the scale, yet disqualifying on its own
                self.assertEqual(r["reasons"]["fidelity"], [f"fidelity: {bad} on S17-07/2"])

    def test_blocked_slot_fails_gate(self):
        r = gate.decide(GATE, records([("none", "none")] * 5 + [None]), SPEND_OK)
        self.assertEqual((r["verdict"], r["ties"], r["denominator"]), ("FAIL", 5, 6))
        self.assertEqual(r["reasons"]["fidelity"], [])

    def test_undelivered_is_unrated(self):
        r = gate.decide(GATE, records([None] * 6), SPEND_OK)
        self.assertEqual(r["verdict"], "FAIL")
        self.assertTrue(all(s["gpt_level"] is None and s["tie"] is None for s in r["slots"]))
        md = gate.verdict_md({**r, **self.extra(r)})
        self.assertEqual(md.count(gate.UNRATED), 6 * 3)
        self.assertNotIn("severe", md.split("## Pairs")[1].split("## Run")[0])

    def test_fail_reasons_distinguished(self):
        r = gate.decide(GATE, records([("none", "none")] * 3 + [("significant", "none"), None, ("none", "none")]),
                        {"committed_usd": 1.6, "cap_usd": 1.5, "breaches": ["S17-03/1 attempt 1: cost $0.3130"]})
        self.assertEqual(r["reasons"]["not_delivered"], ["not delivered: S17-07/1 (technical_failure: moderation_blocked)"])
        self.assertEqual(r["reasons"]["fidelity"], ["fidelity: significant on S17-04/2"])
        self.assertEqual(len(r["reasons"]["budget_protocol"]), 2)
        self.assertFalse(any("fidelity" in x for x in r["reasons"]["not_delivered"]))

    def test_diagnostics_do_not_change_verdict(self):
        base = [("none", "none")] * 4 + [("minor", "none")] * 2
        verdicts = set()
        for q in ("gpt-clear", "gpt-slight", "tie", "local-slight", "local-clear"):
            verdicts.add(gate.decide(GATE, records(base, q), SPEND_OK)["verdict"])
        self.assertEqual(verdicts, {"PASS"})

    def test_breach_forces_fail_separately_from_fidelity(self):
        r = gate.decide(GATE, records([("none", "none")] * 6),
                        {"committed_usd": 1.2, "cap_usd": 1.5, "breaches": ["S17-07/2 attempt 1: cost $0.3130"]})
        self.assertEqual(r["verdict"], "FAIL")
        self.assertEqual(r["reasons"]["fidelity"], [])
        self.assertEqual(len(r["reasons"]["budget_protocol"]), 1)

    @staticmethod
    def extra(r):
        return {"gate_id": "g", "set_id": "t1", "spend": {**SPEND_OK, "known_usd": 0.0, "unknown_attempts": 0},
                "blocks": {"codes": ["moderation_blocked"], "first_attempt_blocks": 0, "recovered_by_retry": 0,
                           "final_undelivered_after_block": 0}, "walls_s": [], "wall_p95_s": None,
                "guardrail_p95_s": 30, "passes": [], "repeated_local_risk": "risk", "ratings_export_sha256": None}


# ---------------------------------------------------------------- schema, mapping and seals (pure)


def slot(photo: str, n: int, attempt: str | None = None) -> state.Slot:
    s = state.Slot(photo, n, [64, 48], 0.2)
    s.status, s.output = "delivered", {"attempt_id": attempt or f"{photo}-{n}"}
    return s


class SchemaTest(unittest.TestCase):
    def setUp(self):
        self.pairs = {"p01": slot("S17-03", 1), "p02": slot("S17-03", 2)}
        items = {"p01": {"photo": "S17-03", "slot": 1, "gpt_side": "A", "local_side": "B"},
                 "p02": {"photo": "S17-03", "slot": 2, "gpt_side": "B", "local_side": "A"}}
        self.sealed = {"key": {"set_id": "t1", "set_digest": "d" * 64, "items": items, "passes": [["p01"], ["p02"]]}}

    def row(self, item, a="none", b="none", crops=None, reason=""):
        side = lambda lv: {"level": lv, "crops": crops if crops is not None else [], "reason": reason}  # noqa: E731
        return {"pair_id": item, "quality": "tie", "fidelity": {"A": side(a), "B": side(b)}}

    def export(self, rows, locked="auto"):
        locked = [r for r in rows if r["pair_id"] == "p01"] if locked == "auto" else locked
        return {"viewer": "compare-s20", "version": 1, "kind": "gate", "set_id": "t1", "set_digest": "d" * 64,
                "rated_on": "2026-11-21", "ratings": rows, "passes": [["p01"], ["p02"]], "locked_pass1": locked}

    def checkpoint(self, rows):
        return json.dumps({"viewer": "compare-s20", "version": 1, "kind": "gate-pass1-checkpoint", "set_id": "t1",
                           "set_digest": "d" * 64, "locked_on": "2026-11-21", "passes": [["p01"], ["p02"]],
                           "ratings": rows}).encode()

    def test_valid_two_pass_export(self):
        rows = [self.row("p01"), self.row("p02")]
        out = gate.ratings_of(self.export(rows), self.checkpoint(rows[:1]), self.sealed, self.pairs)
        self.assertEqual(sorted(out), ["p01", "p02"])

    def test_uncertain_blocks(self):
        rows = [self.row("p01", a="uncertain"), self.row("p02")]
        self.assertEqual(blocked_reasons(lambda: gate.ratings_of(self.export(rows), self.checkpoint(rows[:1]),
                                                                 self.sealed, self.pairs)), {"uncertain"})

    def test_missing_evidence_blocks(self):
        for crops, reason in (([], "lost"), ([CROP], " "), ([], "")):
            with self.subTest(crops=crops, reason=reason):
                rows = [self.row("p01", b="significant", crops=crops, reason=reason), self.row("p02")]
                self.assertEqual(blocked_reasons(lambda: gate.ratings_of(
                    self.export(rows), self.checkpoint(rows[:1]), self.sealed, self.pairs)), {"missing evidence"})

    def test_out_of_image_crop_is_a_schema_error(self):
        rows = [self.row("p01", b="severe", crops=[{"x": 60, "y": 0, "w": 10, "h": 1}], reason="r"), self.row("p02")]
        self.assertIn("schema error", blocked_reasons(lambda: gate.ratings_of(
            self.export(rows), self.checkpoint(rows[:1]), self.sealed, self.pairs)))

    def test_coverage_duplicate_and_missing_rows(self):
        for rows in ([self.row("p01")], [self.row("p01"), self.row("p01"), self.row("p02")],
                     [self.row("p01"), self.row("p02"), self.row("p09")]):
            with self.subTest(rows=[r["pair_id"] for r in rows]):
                self.assertIn("coverage error", blocked_reasons(lambda: gate.ratings_of(
                    self.export(rows, locked=rows[:1]), self.checkpoint(rows[:1]), self.sealed, self.pairs)))

    def test_s20_export_and_wrong_digest_refused(self):
        rows = [self.row("p01"), self.row("p02")]
        s20 = {k: v for k, v in self.export(rows).items() if k not in ("passes", "locked_pass1")}
        self.assertEqual(blocked_reasons(lambda: gate.ratings_of(s20, None, self.sealed, self.pairs)), {"schema error"})
        other = {**self.export(rows), "set_digest": "e" * 64}
        self.assertEqual(blocked_reasons(lambda: gate.ratings_of(other, None, self.sealed, self.pairs)), {"key mismatch"})

    def test_checkpoint_required_and_matching(self):
        rows = [self.row("p01"), self.row("p02")]
        changed = [self.row("p01", a="minor"), self.row("p02")]
        cases = {
            "missing checkpoint": (self.export(rows), None),
            "first pass changed after the lock": (self.export(changed, locked=rows[:1]), self.checkpoint(rows[:1])),
            "checkpoint differs": (self.export(rows), self.checkpoint(changed[:1])),
            "no lock in a two-pass export": (self.export(rows, locked=None), self.checkpoint(rows[:1])),
            "lock of the wrong pass": (self.export(rows, locked=rows[1:]), self.checkpoint(rows[1:])),
            "other set's checkpoint": (self.export(rows), self.checkpoint(rows[:1]).replace(b'"t1"', b'"t2"')),
            "passes differ": ({**self.export(rows), "passes": [["p02"], ["p01"]]}, self.checkpoint(rows[:1])),
        }
        for name, (export, cp) in cases.items():
            with self.subTest(name):
                self.assertEqual(blocked_reasons(lambda: gate.ratings_of(export, cp, self.sealed, self.pairs)),
                                 {"checkpoint error"})

    def test_single_pass_needs_no_checkpoint_and_carries_no_lock(self):
        self.sealed["key"]["passes"] = [["p01", "p02"]]
        rows = [self.row("p01"), self.row("p02")]
        export = {**self.export(rows, locked=None), "passes": [["p01", "p02"]]}
        self.assertEqual(sorted(gate.ratings_of(export, None, self.sealed, self.pairs)), ["p01", "p02"])
        export["locked_pass1"] = rows[:1]
        self.assertEqual(blocked_reasons(lambda: gate.ratings_of(export, None, self.sealed, self.pairs)),
                         {"checkpoint error"})


class MappingTest(unittest.TestCase):
    def st(self, delivered: list[tuple[str, int]]) -> state.RunState:
        slots = {}
        for p in ("S17-03", "S17-04", "S17-07"):
            for n in (1, 2):
                s = slot(p, n) if (p, n) in delivered else state.Slot(p, n, [64, 48], 0.2)
                if (p, n) not in delivered:
                    s.status, s.reason = "undelivered", "technical_failure: x"
                slots[(p, n)] = s
        return state.RunState(slots=slots, max_attempts=2)

    def key(self, items: dict, passes) -> dict:
        full = {i: {"photo": p, "slot": n, "gpt_side": "A", "local_side": "B", "attempt_id": f"{p}-{n}"}
                for i, (p, n) in items.items()}
        return {"items": full, "passes": passes, "slots": []}

    def test_six_duplicate_free_expected_slot_bindings(self):
        all6 = [(p, n) for p in ("S17-03", "S17-04", "S17-07") for n in (1, 2)]
        st = self.st(all6)
        items = {f"p{i:02d}": k for i, k in enumerate(all6, 1)}
        key = self.key(items, [["p01", "p03", "p05"], ["p02", "p04", "p06"]])
        key["slots"] = [{"photo": p, "slot": n, "status": "delivered"} for p, n in all6]
        self.assertEqual({i: (s.photo, s.slot) for i, s in gate.pairs_of(key, st).items()}, items)

    def test_a_duplicated_slot_cannot_hide_a_missing_one(self):
        all6 = [(p, n) for p in ("S17-03", "S17-04", "S17-07") for n in (1, 2)]
        st = self.st(all6)
        items = {f"p{i:02d}": k for i, k in enumerate(all6, 1)}
        items["p06"] = ("S17-07", 1)  # six rows, S17-07/2 missing
        key = self.key(items, [["p01", "p03", "p05"], ["p02", "p04", "p06"]])
        key["slots"] = [{"photo": p, "slot": n, "status": "delivered"} for p, n in all6]
        self.assertIn("coverage error", blocked_reasons(lambda: gate.pairs_of(key, st)))

    def test_a_pair_for_an_undelivered_slot_and_a_bad_pass(self):
        st = self.st([("S17-03", 1), ("S17-03", 2)])
        key = self.key({"p01": ("S17-03", 1), "p02": ("S17-03", 2)}, [["p01", "p02"]])  # one scene twice in a pass
        key["slots"] = [{"photo": s.photo, "slot": s.slot, "status": s.status} for s in st.slots.values()]
        self.assertEqual(blocked_reasons(lambda: gate.pairs_of(key, st)), {"key mismatch"})
        key = self.key({"p01": ("S17-03", 1), "p02": ("S17-04", 1)}, [["p01"], ["p02"]])
        key["slots"] = [{"photo": s.photo, "slot": s.slot, "status": s.status} for s in st.slots.values()]
        self.assertIn("coverage error", blocked_reasons(lambda: gate.pairs_of(key, st)))

    def test_partition_one_slot_per_scene_per_pass(self):
        for seed in range(20):
            delivered = [slot(p, n) for p in ("S17-03", "S17-04", "S17-07") for n in (1, 2)][: 6 - seed % 3]
            passes = blind.partition(delivered, random.Random(seed))
            with self.subTest(seed=seed):
                self.assertTrue(passes and passes[0])
                self.assertEqual(sorted(s.label for p in passes for s in p), sorted(s.label for s in delivered))
                for p in passes:
                    self.assertEqual(len({s.photo for s in p}), len(p))

    def test_set_digest_matches_s20(self):
        spec = importlib.util.spec_from_file_location("s20_blind", ROOT / "scripts/s20/blind.py")
        s20 = importlib.util.module_from_spec(spec)
        saved = list(sys.path)
        try:
            spec.loader.exec_module(s20)
        finally:
            sys.path[:] = saved  # s20's blind.py puts scripts/s20 (with its own gate.py) first
        payload = {"set_id": "t1", "kind": "gate", "items": [{"id": "p01", "photo": "S17-03"}], "passes": [["p01"]],
                   "set_digest": "ignored", "ü": "ł"}
        self.assertEqual(blind.set_digest(payload), s20.set_digest(payload))


class SealTest(unittest.TestCase):
    LINE = f"GPT26-SEAL kind=gate set_id=t1 set_digest={'a' * 64} key_sha256={'b' * 64}"

    def parse(self, text: str):
        tmp = Path(self.tmp) / blind.SEAL_REL
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(text)
        return gate.read_seal(Path(self.tmp))

    def setUp(self):
        import tempfile

        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.tmp = d.name

    def test_one_unbulleted_line(self):
        self.assertEqual(self.parse(f"# seal\n\n{self.LINE}\n\ntext\n")["set_id"], "t1")

    def test_malformed_duplicate_bulleted_or_missing(self):
        for text in (f"- {self.LINE}\n", f"  {self.LINE}\n", f"{self.LINE}\n{self.LINE}\n", "no seal\n",
                     self.LINE.replace("kind=gate", "kind=pilot") + "\n", self.LINE[:-1] + "\n",
                     f"S20-SEAL{self.LINE[10:]}\n{self.LINE} x\n"):
            with self.subTest(text=text[:30]):
                self.assertEqual(blocked_reasons(lambda: self.parse(text)), {"seal invalid"})


# ---------------------------------------------------------------- pipeline: six delivered


class SixTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t = template("six")

    def test_the_fake_run_delivered_six(self):
        self.assertEqual(self.t.run_code, 0, self.t.run_err)
        self.assertEqual(self.t.built["items"], 6)

    def test_six_pairs_two_per_scene(self):
        key = self.t.key
        self.assertEqual(len(key["items"]), 6)
        scenes = [it["photo"] for it in key["items"].values()]
        self.assertEqual(sorted(scenes), ["S17-03"] * 2 + ["S17-04"] * 2 + ["S17-07"] * 2)
        self.assertEqual([len(p) for p in key["passes"]], [3, 3])
        for p in key["passes"]:
            self.assertEqual(len({key["items"][i]["photo"] for i in p}), 3)
        for photo in ("S17-03", "S17-04", "S17-07"):  # the two pairs of a scene share one Local source
            locals_ = {it["sources"][it["local_side"]]["sha256"] for it in key["items"].values() if it["photo"] == photo}
            self.assertEqual(len(locals_), 1)

    def test_resized_to_gpt_size(self):
        for item, it in self.t.key["items"].items():
            size = it["sources"][it["gpt_side"]]["source_dimensions"]
            for face in ("original", "A", "B"):
                with Image.open(self.t.set_dir / f"{item}-{face}.png") as im:
                    self.assertEqual((list(im.size), im.mode), (size, "RGB"))
            for face in ("original", it["local_side"]):
                tr = it["sources"][face]["transform"]
                self.assertEqual((tr["resample"], tr["to"]), ("LANCZOS", size))
                self.assertNotEqual(tr["from"], size)
                self.assertNotEqual(it["sources"][face]["sha256"], it["sources"][face]["pixels_sha256"])

    def test_presentation_controls(self):
        for item in self.t.key["items"]:
            data = {f: (self.t.set_dir / f"{item}-{f}.png").read_bytes() for f in ("original", "A", "B")}
            self.assertEqual(len(data["A"]), len(data["B"]))
            for f, raw in data.items():
                self.assertEqual(set(blind.png_chunks(raw)), {"IHDR", "IDAT", "IEND"})
                with Image.open(io.BytesIO(raw)) as im:
                    self.assertGreater(len(raw), im.size[0] * im.size[1] * 3)  # stored, never compressed
        for p in self.t.set_dir.iterdir():
            self.assertEqual(p.stat().st_mtime_ns, blind.FILE_TIME_NS, p.name)
        # Side-order writes: original, A, B for every item, never the GPT side first.
        self.assertEqual(self.t.writes, [f"{i}-{f}.png" for p in self.t.key["passes"] for i in p
                                         for f in ("original", "A", "B")])

    def test_no_leak_in_output(self):
        manifest = (self.t.set_dir / blind.MANIFEST).read_text()
        names = {p.name for p in self.t.set_dir.iterdir()}
        self.assertEqual({n for n in names if not n.startswith(".")},
                         {blind.MANIFEST} | {f"p{n:02d}-{f}.png" for n in range(1, 7) for f in ("original", "A", "B")})
        for needle in ("gpt", "local", "Local", str(self.t.screen.tmp), "attempt", "runs/"):
            self.assertNotIn(needle, manifest, needle)
        self.assertEqual(HEX64.findall(manifest), [self.t.key["set_digest"]])
        export = (self.t.repo / blind.RATINGS_REL).read_text()
        for needle in ("gpt", "local", str(self.t.screen.tmp)):
            self.assertNotIn(needle, export)

    def test_verdict_written_with_six_ties(self):
        with self.t.restored():
            code, out, err = self.t.cli(gate, "--set", "t1", "--export", str(self.t.repo / blind.RATINGS_REL))
            self.assertEqual(code, 0, out + err)
            self.assertTrue(out.startswith("PASS: 6 of 6 pairs at least a tie"), out)
            report = json.loads((self.t.repo / gate.VERDICT_JSON).read_text())
            self.assertEqual((report["verdict"], report["ties"]), ("PASS", 6))
            md = (self.t.repo / gate.VERDICT_MD).read_text()
            for label in LABELS:
                self.assertIn(f"| {label} ", md)
            self.assertIn("Within the cap and no bound breach.", md)
            self.assertIn("pixel-identical", md)

    def test_fidelity_loss_from_real_ratings(self):
        with self.t.restored():
            self.t.commit_ratings({"S17-04/2": ("significant", "none"), "S17-03/1": ("minor", "none"),
                                   "S17-03/2": ("minor", "none")})
            r = self.t.evaluate()
            self.assertEqual(r["verdict"], "FAIL")
            self.assertEqual(r["ties"], 3)
            self.assertIn("fidelity: significant on S17-04/2", r["reasons"]["fidelity"])
            self.assertEqual(r["reasons"]["not_delivered"], [])

    def test_ratings_before_seal_or_in_the_seal_commit_blocked(self):
        base = git(self.t.repo, "rev-parse", f"{self.t.seal_commit}~1")
        ratings = (self.t.repo / blind.RATINGS_REL).read_bytes()
        seal = (self.t.repo / blind.SEAL_REL).read_bytes()
        for order in ("same commit", "ratings first"):
            with self.subTest(order), self.t.restored():
                git(self.t.repo, "checkout", "-q", "--detach", base)
                (self.t.repo / blind.SEAL_REL).parent.mkdir(parents=True, exist_ok=True)
                if order == "ratings first":
                    (self.t.repo / blind.RATINGS_REL).write_bytes(ratings)
                    git(self.t.repo, "add", blind.RATINGS_REL)
                    git(self.t.repo, "commit", "-q", "-m", "ratings")
                (self.t.repo / blind.SEAL_REL).write_bytes(seal)
                (self.t.repo / blind.RATINGS_REL).write_bytes(ratings)
                git(self.t.repo, "add", blind.SEAL_REL, blind.RATINGS_REL)
                git(self.t.repo, "commit", "-q", "-m", "both")
                self.assertEqual(blocked_reasons(self.t.evaluate), {"order violation"})

    def test_seal_replacement_and_uncommitted_evidence_blocked(self):
        cases = {
            "seal touched twice": lambda: ((self.t.repo / blind.SEAL_REL).write_text(
                (self.t.repo / blind.SEAL_REL).read_text() + "\nedited\n"),
                git(self.t.repo, "commit", "-q", "-am", "edit seal")),
            "seal dirty": lambda: (self.t.repo / blind.SEAL_REL).write_text("x\n"),
            "ratings dirty": lambda: (self.t.repo / blind.RATINGS_REL).write_text("{}\n"),
            "ratings untracked": lambda: (git(self.t.repo, "rm", "-q", "--cached", blind.RATINGS_REL),
                                          git(self.t.repo, "commit", "-q", "-m", "untrack")),
        }
        for name, mutate in cases.items():
            with self.subTest(name), self.t.restored():
                mutate()
                self.assertEqual(blocked_reasons(self.t.evaluate), {"order violation"})

    def test_later_change_md_edits_and_a_rebase_keep_the_verdict(self):
        with self.t.restored():
            md = self.t.repo / blind.run.CHANGE_MD
            md.write_text(md.read_text().replace("status: implementing", "status: implemented"))
            git(self.t.repo, "commit", "-q", "-am", "lifecycle")
            self.assertEqual(self.t.evaluate()["verdict"], "PASS")
        with self.t.restored():  # rebase-like rewrite: new SHAs, same order
            base = git(self.t.repo, "rev-parse", f"{self.t.seal_commit}~1")
            git(self.t.repo, "checkout", "-q", "--detach", base)
            (self.t.repo / "unrelated.txt").write_text("x\n")
            git(self.t.repo, "add", "unrelated.txt")
            git(self.t.repo, "commit", "-q", "-m", "unrelated")
            git(self.t.repo, "cherry-pick", self.t.seal_commit, self.t.head)
            self.assertNotEqual(git(self.t.repo, "rev-parse", "HEAD"), self.t.head)
            self.assertEqual(self.t.evaluate()["verdict"], "PASS")

    def test_png_corruption_and_wrong_dimensions_at_gate_time(self):
        item = "p01"
        pres = self.t.set_dir / f"{item}-A.png"
        cases = {
            "presentation bytes": (pres, lambda b: b[:-20] + bytes(20), {"binding failed"}),
            "presentation dims": (pres, lambda b: self.png((10, 10)), {"binding failed"}),
        }
        for name, (path, change, want) in cases.items():
            with self.subTest(name), self.t.restored():
                path.write_bytes(change(path.read_bytes()))
                self.assertEqual(blocked_reasons(self.t.evaluate), want)
        rows = [json.loads(x) for x in (self.t.private / "attempts.jsonl").read_text().splitlines()]
        out = next(r for r in rows if r["event"] == "result" and r.get("status") == "ok")
        gpt = blind.resolve(self.t.repo, out["output_path"])
        for name, data in (("output truncated", gpt.read_bytes()[:100]), ("output resized", self.png((16, 16)))):
            with self.subTest(name), self.t.restored():
                gpt.write_bytes(data)
                self.assertEqual(blocked_reasons(self.t.evaluate), {"run record blocked"})

    def test_frozen_snapshot_and_live_record_tampering(self):
        frozen = self.t.set_dir / blind.LEDGER_COPY
        live = self.t.private / "attempts.jsonl"
        sidecar = self.t.private / "run-state.json"
        cases = {
            "frozen ledger edited": (frozen, {"key mismatch"}),
            "live ledger appended": (live, {"record changed"}),
            "live sidecar edited": (sidecar, {"record changed"}),
        }
        for name, (path, want) in cases.items():
            with self.subTest(name), self.t.restored():
                path.write_bytes(path.read_bytes() + b"\n")
                self.assertEqual(blocked_reasons(self.t.evaluate), want)
        with self.t.restored():
            live.unlink()
            self.assertEqual(blocked_reasons(self.t.evaluate), {"record changed"})

    def test_key_and_manifest_tampering(self):
        for name in (blind.KEY_NAME, blind.MANIFEST):
            with self.subTest(name), self.t.restored():
                p = self.t.set_dir / name
                p.write_text(p.read_text().replace('"p01"', '"p99"', 1))
                self.assertEqual(blocked_reasons(self.t.evaluate), {"key mismatch"})

    def test_source_and_transform_tampering(self):
        item, it = next(iter(self.t.key["items"].items()))
        original = blind.resolve(self.t.repo, it["sources"]["original"]["path"])
        local = blind.resolve(self.t.repo, it["sources"][it["local_side"]]["path"])
        for name, path, want in (("original replaced", original, {"binding failed"}),
                                 ("Local replaced", local, {"binding failed"})):
            with self.subTest(name), self.t.restored():
                Image.new("RGB", (64, 48)).save(path, "JPEG")
                self.assertIn(want.pop(), blocked_reasons(self.t.evaluate))
        with self.subTest("Lanczos not reproduced"), self.t.restored():
            real = Image.Image.resize
            with mock.patch.object(Image.Image, "resize",
                                   lambda im, size, *a, **k: real(im, size, Image.Resampling.BICUBIC)):
                self.assertEqual(blocked_reasons(self.t.evaluate), {"binding failed"})
        with self.subTest("baseline file changed"), self.t.restored():
            doc = json.loads((self.t.repo / blind.BASELINES).read_text())
            doc["sha256"][it["photo"]] = "0" * 64
            (self.t.repo / blind.BASELINES).write_text(json.dumps(doc))
            git(self.t.repo, "commit", "-q", "-am", "baselines changed")
            self.assertIn("baseline mismatch", blocked_reasons(self.t.evaluate))

    def test_rule_file_changed_after_the_run(self):
        with self.t.restored():
            p = self.t.repo / "scripts/gpt26/gate.py"
            p.write_text(p.read_text() + "\n# changed\n")
            git(self.t.repo, "commit", "-q", "-am", "rule change")
            self.assertEqual(blocked_reasons(self.t.evaluate), {"run record blocked"})

    def test_missing_checkpoint_and_export_blocked(self):
        with self.t.restored():
            gate.checkpoint_path(self.t.paths, "t1").unlink()
            self.assertEqual(blocked_reasons(self.t.evaluate), {"checkpoint error"})
        with self.t.restored():
            self.assertEqual(blocked_reasons(lambda: self.t.evaluate(export=False)), {"missing file"})

    def test_sanitized_errors_on_stdout_and_stderr(self):
        def boom(*_a, **_k):
            raise RuntimeError(f"decoder failed on {self.t.set_dir}/p01-A.png sha {'c' * 64}")

        with self.t.restored(), mock.patch.object(blind, "decode", boom):
            code, out, err = self.t.cli(gate, "--set", "t1", "--export", str(self.t.repo / blind.RATINGS_REL))
        self.assertEqual(code, 1)
        for text in (out, err):
            for needle in (str(self.t.screen.tmp), "Traceback", "c" * 64, "p01-A", "RuntimeError"):
                self.assertNotIn(needle, text)
        self.assertIn("set: internal error", out)
        self.assertFalse((self.t.repo / gate.VERDICT_JSON).exists())
        with self.t.restored():
            (self.t.set_dir / "p02-B.png").write_bytes(b"not a png")
            code, out, err = self.t.cli(gate, "--set", "t1", "--export", str(self.t.repo / blind.RATINGS_REL))
        self.assertEqual(code, 1)
        self.assertIn("p02: binding failed", out)
        self.assertNotIn(str(self.t.screen.tmp), out + err)

    def test_builder_refuses_a_second_build_and_a_wrong_baseline(self):
        with self.t.restored():
            code, out, err = self.t.cli(blind, "--set", "t2")
            self.assertEqual(code, 1)
            self.assertIn("set: seal exists", out)
            self.assertFalse((self.t.private / "t2").exists())
            code, out, _ = self.t.cli(blind, "--set", "t1")
            self.assertIn("set: set exists", out)
        with self.t.restored():  # local_hash_mismatch_refused: no seal yet, a wrong pinned Local
            git(self.t.repo, "rm", "-q", blind.SEAL_REL)
            git(self.t.repo, "commit", "-q", "-m", "no seal")
            local = self.t.paths.local / "S17-04.jpg"
            Image.new("RGB", (64, 48), (9, 9, 9)).save(local, "JPEG")
            code, out, err = self.t.cli(blind, "--set", "t3")
            self.assertEqual(code, 1, out)
            self.assertIn("S17-04/1: baseline mismatch", out)
            self.assertIn("S17-04/2: baseline mismatch", out)
            self.assertFalse((self.t.private / "t3").exists())
            self.assertFalse((self.t.repo / blind.SEAL_REL).exists())
            self.assertNotIn(str(self.t.screen.tmp), out + err)

    @staticmethod
    def png(size) -> bytes:
        buf = io.BytesIO()
        Image.new("RGB", size).save(buf, "PNG")
        return buf.getvalue()


# ---------------------------------------------------------------- pipeline: undelivered slots


class UndeliveredTest(unittest.TestCase):
    def test_zero_delivery_sealed_fail_without_export(self):
        t = template("zero")
        self.assertEqual(t.built["items"], 0)
        self.assertEqual(t.key["passes"], [])
        self.assertFalse(any(t.set_dir.glob("*.png")))
        with t.restored():
            code, out, err = t.cli(gate, "--set", "t1")
            self.assertEqual(code, 0, out + err)
            report = json.loads((t.repo / gate.VERDICT_JSON).read_text())
            self.assertEqual(report["verdict"], "FAIL")
            self.assertEqual(len(report["reasons"]["not_delivered"]), 6)
            self.assertTrue(all(s["gpt_level"] is None for s in report["slots"]))
            self.assertEqual((t.repo / gate.VERDICT_MD).read_text().count(gate.UNRATED), 18)
        with t.restored():
            (t.repo / blind.RATINGS_REL).write_text("{}\n")
            self.assertEqual(blocked_reasons(t.evaluate), {"schema error"})
        self.assertIn("no viewer", t.built["seal"])

    def test_five_delivered_rated_but_fail_not_delivered(self):
        t = template("five")
        self.assertEqual(t.built["items"], 5)
        with t.restored():
            r = t.evaluate()
            self.assertEqual(r["verdict"], "FAIL")
            self.assertEqual(len(r["reasons"]["not_delivered"]), 1)
            self.assertIn("S17-07/1", r["reasons"]["not_delivered"][0])
            self.assertEqual(r["reasons"]["fidelity"], [])
            self.assertEqual(r["ties"], 5)

    def test_first_response_bound_breach_forces_fail(self):
        t = template("breach")
        self.assertEqual(t.run_code, 1)
        with t.restored():
            r = t.evaluate()
            self.assertEqual(r["verdict"], "FAIL")
            self.assertEqual(len(r["reasons"]["budget_protocol"]), 1)
            self.assertTrue(r["spend"]["breaches"])
            self.assertIn("The cap is NOT shown to have held.", gate.verdict_md(r))

    def test_unresolved_record_blocks_the_builder(self):
        s = test_run.Screen("setUp")
        s.setUp()
        self.addCleanup(s.doCleanups)
        s.approve()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = blind.main(["--set", "t1"], paths=s.paths)
        self.assertEqual(code, 1)
        self.assertIn("set: run not resolved", out.getvalue())
        self.assertFalse((s.repo / blind.SEAL_REL).exists())


# ---------------------------------------------------------------- the viewer copy


def strip_gpt26(text: str) -> str:
    out, skip = [], False
    for line in text.splitlines(keepends=True):
        s = line.strip()
        if s in ("// GPT26 begin", "<!-- GPT26 begin -->"):
            skip = True
            continue
        if s in ("// GPT26 end", "<!-- GPT26 end -->"):
            skip = False
            continue
        if not skip:
            out.append(line)
    return "".join(out)


class ViewerTest(unittest.TestCase):
    def test_viewer_diff_limited(self):
        text = strip_gpt26(VIEWER.read_text())
        for old, new in VIEWER_SUBS:
            self.assertEqual(text.count(new), 1, new)
            text = text.replace(new, old)
        self.assertEqual(text, S20_VIEWER.read_text())

    def test_questions_and_scale_unchanged(self):
        s20, gpt = S20_VIEWER.read_text(), VIEWER.read_text()
        for needle in ('"Który wynik lepszy (jakość)?"', '["A wyraźnie", "A nieco", "remis", "B nieco", "B wyraźnie"]',
                       '["brak straty", "drobna", "istotna", "ciężka", "niepewne"]',
                       'const LEVELS = ["none", "minor", "significant", "severe", "uncertain"];',
                       'const QUALITY = ["A-clear", "A-slight", "tie", "B-slight", "B-clear"];'):
            self.assertEqual((s20.count(needle), gpt.count(needle)), (1, 1), needle)
        self.assertIn('kind: "gate-pass1-checkpoint"', gpt)
        self.assertIn('M.set_id + "-pass1-checkpoint.json"', gpt)
        self.assertEqual(gate.checkpoint_path(blind.run.default_paths(), "x").name, "x-pass1-checkpoint.json")

    def test_two_pass_controller(self):
        if not shutil.which("node"):
            self.skipTest("node is not installed")
        script = VIEWER.read_text().split("<script>")[1].split("</script>")[0]
        block = next(b for b in script.split("// GPT26 begin")[1:] if "function gpt26Passes" in b).split("// GPT26 end")[0]
        consts = "\n".join(ln for ln in script.splitlines() if ln.strip().startswith(("const QUALITY", "const LEVELS")))
        harness = consts + "\n" + block + r"""
const assert = require("node:assert/strict");
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const items = ["p01", "p02", "p03", "p04"].map((id) => ({ id }));
const M = { set_id: "t1", set_digest: "d".repeat(64), items, passes: [["p02", "p03"], ["p04", "p01"]] };
const row = (id, lv) => ({ pair_id: id, quality: "tie", fidelity: { A: { level: lv, crops: [], reason: "" }, B: { level: "none", crops: [], reason: "" } } });
assert.equal(gpt26PassProblem(M), null);
assert.match(gpt26PassProblem({ ...M, passes: [["p01"], ["p02"]] }), /dzielą/);
assert.match(gpt26PassProblem({ ...M, passes: [] }), /przebieg/);
// hidden pass 2: only pass 1 is visible before the lock
let P = gpt26Passes(M, "k");
assert.equal(P.pass(), 1);
assert.deepEqual(P.visible(items).map((i) => i.id), ["p02", "p03"]);
assert.equal(P.lockedRows(), null);
// lock before reveal: the lock persists, then pass 2 alone is visible
const locked = [row("p02", "none"), row("p03", "minor")];
const cp = P.lock(locked);
assert.equal(cp.kind, "gate-pass1-checkpoint");
assert.deepEqual(cp.ratings, locked);
assert.deepEqual(cp.passes, M.passes);
assert.deepEqual(P.visible(items).map((i) => i.id), ["p04", "p01"]);
assert.equal(P.lock(locked), null);  // a second lock is refused
// reload/resume: a new controller reads the lock; locked answers override any later edit
P = gpt26Passes(M, "k");
assert.equal(P.pass(), 2);
assert.deepEqual(P.visible(items).map((i) => i.id), ["p04", "p01"]);
const answers = { p02: { quality: "A-clear", fidelity: { A: { level: "severe", crops: [], reason: "x" }, B: { level: "none", crops: [], reason: "" } } } };
P.restore(answers);
assert.equal(answers.p02.quality, "tie");
assert.equal(answers.p02.fidelity.A.level, "none");
assert.deepEqual(P.lockedRows(), locked);
// a corrupt or foreign lock never unlocks pass 1
store.set("k:gpt26-pass1-lock", "{");
assert.match(gpt26Passes(M, "k").problem, /uszkodzona/);
store.set("k:gpt26-pass1-lock", JSON.stringify({ ...cp, set_digest: "e".repeat(64) }));
assert.match(gpt26Passes(M, "k").problem, /uszkodzona/);
// storage that cannot keep the lock: no reveal
store.clear();
globalThis.localStorage.setItem = () => { throw new Error("quota"); };
P = gpt26Passes(M, "k2");
assert.equal(P.lock(locked), null);
assert.equal(P.pass(), 1);
// one pass: no transition
store.clear();
const one = gpt26Passes({ ...M, passes: [["p01", "p02", "p03", "p04"]] }, "k3");
assert.equal(one.count(), 1);
assert.equal(one.lock(locked), null);
assert.equal(one.visible(items).length, 4);
console.log("ok");
"""
        r = subprocess.run(["node", "-e", harness], capture_output=True, text=True)
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "ok"), r.stderr)

    def test_note_shown_before_the_seal_and_in_every_rating_view(self):
        script = VIEWER.read_text().split("<script>")[1].split("</script>")[0]
        start = script.split("function start(M, base)")[1].split("function openSet")[0]
        self.assertIn('form.querySelector("textarea").insertAdjacentHTML("beforebegin", GPT26_NOTE);', start)
        self.assertLess(start.index("GPT26_NOTE"), start.index("main.replaceChildren(form)"))
        update = script.split("function update()")[1].split("function go(")[0]
        self.assertIn('footer();\n          // GPT26 begin\n          gpt26ShowNote(P, $("rating"));', update)
        if not shutil.which("node"):
            self.skipTest("node is not installed")
        block = next(b for b in script.split("// GPT26 begin")[1:] if "function gpt26ShowNote" in b).split("// GPT26 end")[0]
        consts = "\n".join(ln for ln in script.splitlines() if ln.strip().startswith(("const QUALITY", "const LEVELS")))
        harness = consts + "\n" + block + r"""
const assert = require("node:assert/strict");
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
globalThis.document = { createElement: (tag) => ({ tag }) };
const footer = { kids: [], prepend(el) { this.kids.unshift(el); } };
const items = ["p01", "p02"].map((id) => ({ id }));
const M = { set_id: "t1", set_digest: "d".repeat(64), items, passes: [["p01"], ["p02"]] };
const P = gpt26Passes(M, "k");
let el = gpt26ShowNote(P, footer);
assert.equal(footer.kids[0], el);
assert.equal(el.tag, "details");
assert.match(el.innerHTML, /^<summary><strong>Przebieg 1 z 2\.<\/strong>/);
assert.match(el.innerHTML, /Ryzyko rozpoznania/);
assert.match(el.innerHTML, /Ocena w dwóch przebiegach/);
// the open state survives the rebuild of the footer
el.open = true; el.ontoggle();
assert.equal(gpt26ShowNote(P, footer).open, true);
const row = { pair_id: "p01", quality: "tie", fidelity: { A: { level: "none", crops: [], reason: "" }, B: { level: "none", crops: [], reason: "" } } };
assert.ok(P.lock([row]));
assert.match(gpt26ShowNote(P, footer).innerHTML, /Przebieg 2 z 2\./);
// after a reload the lock is read back and the note still names pass 2
assert.match(gpt26ShowNote(gpt26Passes(M, "k"), footer).innerHTML, /Przebieg 2 z 2\./);
console.log("ok");
"""
        r = subprocess.run(["node", "-e", harness], capture_output=True, text=True)
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "ok"), r.stderr)


if __name__ == "__main__":
    unittest.main()
