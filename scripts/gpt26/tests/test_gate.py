"""blind.py, gate.py and the viewer copy offline: synthetic sets only, no private corpus, no network.

Three kinds of test:
  - pure rule and schema tests on hand-built records (`gate.decide`, `gate.ratings_of`,
    `gate.pairs_of`, the seal parser, the pass partition);
  - pipeline tests on module-level templates: a throwaway repository from `test_run.Screen`, a
    fake paid run, one real build of the blind set, the seal and a ratings export committed in
    order. Each test that mutates a template restores it (files by bytes, Git by reset), so the
    expensive build happens once per template;
  - the viewer copy: the Phase 1 fixture `tests/fixtures/compare-gpt26.html` (the screen's viewer,
    byte for byte), an allowlist diff against the archived S-20 viewer, and its two-pass
    controller exercised in Node;
  - the wider study's viewer (`context/changes/gpt-image-26-wider/references/compare-gpt26.html`,
    plan Phase 2): a bounded diff against the Phase 1 fixture, the anchor and the required
    fidelity preference, and its version-2 controller in Node. The preference rule (gate version
    2) runs on pure records, on hand-built exports and on a pipeline template whose study
    registers `tie_rule_kind: "preference"` and that very viewer.
"""

from __future__ import annotations

import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
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
CONFIG, STUDY = test_run.CONFIG, test_run.STUDY
VIEWER = test_run.VIEWER_FIXTURE
S20_VIEWER = ROOT / "context/archive/2026-11-03-cloud-classical-denoise/references/compare-s20.html"
HEX64 = re.compile(r"[0-9a-f]{64}")
CROP = {"x": 1, "y": 2, "w": 3, "h": 4}

WIDER_VIEWER = ROOT / "context/changes/gpt-image-26-wider/references/compare-gpt26.html"
ANCHOR = ("istotna = widoczna przy całym kadrze bez powiększenia; drobna = tylko po powiększeniu; dotyczy też "
          "treści dodanej lub zmienionej (twarze, napisy, obiekty) i usuniętego detalu lub koloru")
# A six-slot study shaped like the screen but registering the preference rule and the wider
# viewer byte for byte; generated inside each throwaway repository only.
PREF_CONFIG = "scripts/gpt26/tests/fixtures/pref-config.json"
PREF_STUDY = {"change_dir": "context/changes/gpt26-pref-fixture",
              "series": "scripts/gpt26/tests/fixtures/pref-series.json",
              "viewer": "context/changes/gpt26-pref-fixture/references/compare-gpt26.html",
              "private_root": "test-photos/private/gpt26-wider", "series_id": "gpt26-pref-fixture"}

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


class PrefScreen(test_run.Screen):
    """The screen-shaped fixture study rebound to the preference rule and the wider viewer."""

    CONFIG = PREF_CONFIG

    def register(self) -> None:
        config = json.loads((ROOT / CONFIG).read_text())
        config["name"] = "gpt26-pref-fixture"
        config["study"] = dict(PREF_STUDY)
        config["gate"].update(id="gpt26-pref-fixture-v1", tie_rule_kind="preference")
        raw = (json.dumps(config, indent=2, ensure_ascii=False) + "\n").encode()
        self.write(PREF_CONFIG, raw.decode())
        sha = hashlib.sha256(raw).hexdigest()
        series = json.loads((ROOT / STUDY.series).read_text())
        (entry,) = series["configs"].values()
        series.update(series_id=PREF_STUDY["series_id"],
                      configs={sha: {**entry, "path": PREF_CONFIG, "name": config["name"]}})
        for s in series["slots"]:
            s.update(config_sha256=sha, config_name=config["name"])
        self.write(PREF_STUDY["series"], json.dumps(series, indent=2) + "\n")
        self.write(PREF_STUDY["viewer"], WIDER_VIEWER.read_text())


def ab_of(pref: str, gpt_side: str) -> str:
    """A GPT-relative preference (`local-clear … gpt-clear`) as the viewer's A/B choice."""
    if pref == "tie":
        return "tie"
    who, strength = pref.split("-")
    return f"{gpt_side if who == 'gpt' else ('B' if gpt_side == 'A' else 'A')}-{strength}"


class Template:
    """One throwaway screen: registration, fake paid run, built and sealed set, committed ratings."""

    def __init__(self, script: dict | None = None, default: str = "ok", ratings: bool = True,
                 screen: type = test_run.Screen):
        self.screen = s = screen("setUp")
        s.setUp()
        self.repo, self.paths, self.private, self.study = s.repo, s.paths, s.private, s.study
        self.config = s.CONFIG
        self.kind = json.loads((s.repo / s.CONFIG).read_text())["gate"]["tie_rule_kind"]
        self.version = gate.RULE_KINDS[self.kind]["version"]
        local = s.paths.local
        local.mkdir(parents=True, exist_ok=True)
        series = json.loads((self.repo / self.study.series).read_text())
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
            self.built = blind.build("t1", self.study, self.paths)
        self.set_dir = self.private / "t1"
        git(self.repo, "add", self.study.seal_rel)
        git(self.repo, "commit", "-q", "-m", "seal")
        self.seal_commit = git(self.repo, "rev-parse", "HEAD")
        self.key = json.loads((self.set_dir / blind.KEY_NAME).read_text())
        if ratings and self.key["items"]:
            self.write_ratings()
            git(self.repo, "add", self.study.ratings_rel)
            git(self.repo, "commit", "-q", "-m", "ratings")
        self.head = git(self.repo, "rev-parse", "HEAD")

    # ------------------------------------------------------------ ratings

    def rows(self, levels: dict | None = None, quality: str = "tie", prefs: dict | None = None) -> list[dict]:
        """Rows in sealed order; `prefs` maps a slot label to its GPT-relative fidelity preference
        (default `tie`), written as the A/B choice the viewer stores (preference rule only)."""
        levels, prefs = levels or {}, prefs or {}
        out = []
        for item in [i for p in self.key["passes"] for i in p]:
            it = self.key["items"][item]
            label = f"{it['photo']}/{it['slot']}"
            g, lo = levels.get(label, ("none", "none"))
            fid = {}
            for side, level in ((it["gpt_side"], g), (it["local_side"], lo)):
                evidence = level in ("significant", "severe")
                fid[side] = {"level": level, "crops": [dict(CROP)] if evidence else [],
                             "reason": "lost stars" if evidence else ""}
            row = {"pair_id": item, "quality": quality, "fidelity": dict(sorted(fid.items()))}
            if self.kind == "preference":
                row["fidelity_preference"] = ab_of(prefs.get(label, "tie"), it["gpt_side"])
            out.append(row)
        return out

    def export(self, rows: list[dict]) -> dict:
        passes = self.key["passes"]
        first = [r for r in rows if r["pair_id"] in passes[0]] if len(passes) == 2 else None
        return {"viewer": "compare-s20", "version": self.version, "kind": "gate", "set_id": "t1",
                "set_digest": self.key["set_digest"], "rated_on": "2026-11-21", "ratings": rows, "passes": passes,
                "locked_pass1": first}

    def checkpoint(self, locked: list[dict]) -> dict:
        return {"viewer": "compare-s20", "version": self.version, "kind": "gate-pass1-checkpoint", "set_id": "t1",
                "set_digest": self.key["set_digest"], "locked_on": "2026-11-21", "passes": self.key["passes"],
                "ratings": locked}

    def write_ratings(self, levels: dict | None = None, quality: str = "tie", prefs: dict | None = None) -> None:
        doc = self.export(self.rows(levels, quality, prefs))
        (self.repo / self.study.ratings_rel).write_text(json.dumps(doc, indent=2) + "\n")
        if doc["locked_pass1"] is not None:
            gate.checkpoint_path(self.paths, "t1").write_text(json.dumps(self.checkpoint(doc["locked_pass1"])))

    def commit_ratings(self, levels: dict | None = None, quality: str = "tie", prefs: dict | None = None) -> None:
        self.write_ratings(levels, quality, prefs)
        git(self.repo, "add", self.study.ratings_rel)
        git(self.repo, "commit", "-q", "-m", "ratings again")

    # ------------------------------------------------------------ evaluation and restore

    def evaluate(self, export: bool = True) -> dict:
        return gate.evaluate("t1", (self.repo / self.study.ratings_rel) if export else None, self.paths, self.study)

    def cli(self, tool, *args: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = tool.main(["--config", self.config, *args], root=self.repo)
        return code, out.getvalue(), err.getvalue()

    @property
    def ratings(self) -> Path:
        return self.repo / self.study.ratings_rel

    @property
    def seal(self) -> Path:
        return self.repo / self.study.seal_rel

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
        elif kind == "pref":  # six delivered under the preference rule and the wider viewer
            TEMPLATES[kind] = Template(screen=PrefScreen)
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


GATE = json.loads((ROOT / CONFIG).read_text())["gate"]
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
        return {"gate_id": "g", "series_id": "gpt26-screen", "set_id": "t1", "spend": {**SPEND_OK, "known_usd": 0.0, "unknown_attempts": 0},
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
        tmp = Path(self.tmp) / STUDY.seal_rel
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(text)
        return gate.read_seal(Path(self.tmp), STUDY.seal_rel)

    def setUp(self):
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


class ArtifactPathsTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.paths = blind.run.study_paths(self.root, STUDY)

    def test_builder_refuses_an_aliased_evaluations_directory(self):
        evaluations = self.root / STUDY.eval_dir
        evaluations.parent.mkdir(parents=True)
        sibling = self.root / "other-evaluations"
        sibling.mkdir()
        evaluations.symlink_to(sibling, target_is_directory=True)
        with self.assertRaisesRegex(blind.Refused, "unsafe write path"):
            blind.build("fixture", STUDY, self.paths)
        self.assertEqual(list(sibling.iterdir()), [])
        self.assertFalse(self.paths.private.exists())

    def test_verdict_validates_both_destinations_before_writing(self):
        markdown = self.root / STUDY.verdict_md
        markdown.parent.mkdir(parents=True)
        markdown.symlink_to("other-report.md")
        with self.assertRaisesRegex(blind.Refused, "unsafe write path"):
            gate.write_reports(self.root, STUDY, {})
        self.assertFalse((self.root / STUDY.verdict_json).exists())
        self.assertFalse(markdown.exists())

    def test_diagnostics_refuse_an_aliased_logs_directory(self):
        self.paths.private.mkdir(parents=True)
        sibling = self.root / "other-logs"
        sibling.mkdir()
        (self.paths.private / "logs").symlink_to(sibling, target_is_directory=True)
        self.assertIsNone(blind.log_detail(self.paths, "gate", "synthetic diagnostic"))
        self.assertEqual(list(sibling.iterdir()), [])


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
        export = self.t.ratings.read_text()
        for needle in ("gpt", "local", str(self.t.screen.tmp)):
            self.assertNotIn(needle, export)

    def test_verdict_written_with_six_ties(self):
        with self.t.restored():
            code, out, err = self.t.cli(gate, "--set", "t1", "--export", str(self.t.ratings))
            self.assertEqual(code, 0, out + err)
            self.assertTrue(out.startswith("PASS: 6 of 6 pairs at least a tie"), out)
            report = json.loads((self.t.repo / STUDY.verdict_json).read_text())
            self.assertEqual((report["verdict"], report["ties"]), ("PASS", 6))
            md = (self.t.repo / STUDY.verdict_md).read_text()
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
        ratings = self.t.ratings.read_bytes()
        seal = self.t.seal.read_bytes()
        for order in ("same commit", "ratings first"):
            with self.subTest(order), self.t.restored():
                git(self.t.repo, "checkout", "-q", "--detach", base)
                self.t.seal.parent.mkdir(parents=True, exist_ok=True)
                if order == "ratings first":
                    self.t.ratings.write_bytes(ratings)
                    git(self.t.repo, "add", STUDY.ratings_rel)
                    git(self.t.repo, "commit", "-q", "-m", "ratings")
                self.t.seal.write_bytes(seal)
                self.t.ratings.write_bytes(ratings)
                git(self.t.repo, "add", STUDY.seal_rel, STUDY.ratings_rel)
                git(self.t.repo, "commit", "-q", "-m", "both")
                self.assertEqual(blocked_reasons(self.t.evaluate), {"order violation"})

    def test_seal_replacement_and_uncommitted_evidence_blocked(self):
        cases = {
            "seal touched twice": lambda: (self.t.seal.write_text(self.t.seal.read_text() + "\nedited\n"),
                                           git(self.t.repo, "commit", "-q", "-am", "edit seal")),
            "seal dirty": lambda: self.t.seal.write_text("x\n"),
            "ratings dirty": lambda: self.t.ratings.write_text("{}\n"),
            "ratings untracked": lambda: (git(self.t.repo, "rm", "-q", "--cached", STUDY.ratings_rel),
                                          git(self.t.repo, "commit", "-q", "-m", "untrack")),
        }
        for name, mutate in cases.items():
            with self.subTest(name), self.t.restored():
                mutate()
                self.assertEqual(blocked_reasons(self.t.evaluate), {"order violation"})

    def test_later_change_md_edits_and_a_rebase_keep_the_verdict(self):
        with self.t.restored():
            md = self.t.repo / STUDY.change_md
            md.write_text(md.read_text().rstrip("\n") + "\n\nLifecycle bookkeeping updated.\n")
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

    def test_a_rewrite_that_includes_the_registration_commit_keeps_the_verdict(self):
        # Lesson "Never bind sealed or frozen evidence to a branch commit SHA": every commit is
        # recreated, the registration commit first, with the same bytes and the same order.
        with self.t.restored():
            before = self.t.evaluate()
            old, new = self.t.screen.rewrite_history()
            self.assertNotEqual(old, new)
            self.assertEqual(self.t.key["bindings"]["registration_commit"], old)  # recorded, never compared
            self.assertNotIn(self.t.seal_commit, git(self.t.repo, "rev-list", "HEAD").split())
            after = self.t.evaluate()
            self.assertEqual({k: after[k] for k in ("verdict", "ties", "reasons")},
                             {k: before[k] for k in ("verdict", "ties", "reasons")})
            code, out, err = self.t.cli(gate, "--set", "t1", "--export", str(self.t.ratings))
            self.assertEqual(code, 0, out + err)
            self.assertTrue(out.startswith("PASS: 6 of 6"), out)
            # A changed rule blob still blocks the gate on the rewritten history.
            p = self.t.repo / "scripts/gpt26/state.py"
            p.write_text(p.read_text() + "\n# changed\n")
            git(self.t.repo, "commit", "-q", "-am", "rule change after the rewrite")
            self.assertEqual(blocked_reasons(self.t.evaluate), {"run record blocked"})

    def test_runner_builder_and_gate_share_the_study_private_root(self):
        private = self.t.repo / STUDY.private_root
        derived = blind.run.study_paths(self.t.repo, self.t.study)  # blind's run module, not test_run's copy
        self.assertEqual((derived.root, derived.private, derived.inputs),
                         (self.t.paths.root, self.t.paths.private, self.t.paths.inputs))
        self.assertEqual(self.t.paths.private, private)
        self.assertTrue((private / "attempts.jsonl").is_file())  # the runner's ledger ...
        self.assertTrue((private / "run-state.json").is_file())  # ... and sidecar
        self.assertEqual(self.t.set_dir, private / "t1")  # the builder's set
        self.assertTrue((private / "t1" / blind.MANIFEST).is_file())
        self.assertEqual(gate.checkpoint_path(self.t.paths, "t1").parent, private)  # the gate's checkpoint
        self.assertEqual(blind.run.check_series.check_viewer(self.t.repo, STUDY), [])  # the viewer's base
        self.assertEqual(self.t.paths.inputs, self.t.repo / "test-photos/private/s19/inputs")  # S-19's root kept
        self.assertEqual(self.t.paths.local, self.t.repo / "test-photos/private/s19/local")

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
            code, out, err = self.t.cli(gate, "--set", "t1", "--export", str(self.t.ratings))
        self.assertEqual(code, 1)
        for text in (out, err):
            for needle in (str(self.t.screen.tmp), "Traceback", "c" * 64, "p01-A", "RuntimeError"):
                self.assertNotIn(needle, text)
        self.assertIn("set: internal error", out)
        self.assertFalse((self.t.repo / STUDY.verdict_json).exists())
        with self.t.restored():
            (self.t.set_dir / "p02-B.png").write_bytes(b"not a png")
            code, out, err = self.t.cli(gate, "--set", "t1", "--export", str(self.t.ratings))
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
            git(self.t.repo, "rm", "-q", STUDY.seal_rel)
            git(self.t.repo, "commit", "-q", "-m", "no seal")
            local = self.t.paths.local / "S17-04.jpg"
            Image.new("RGB", (64, 48), (9, 9, 9)).save(local, "JPEG")
            code, out, err = self.t.cli(blind, "--set", "t3")
            self.assertEqual(code, 1, out)
            self.assertIn("S17-04/1: baseline mismatch", out)
            self.assertIn("S17-04/2: baseline mismatch", out)
            self.assertFalse((self.t.private / "t3").exists())
            self.assertFalse(self.t.seal.exists())
            self.assertNotIn(str(self.t.screen.tmp), out + err)

    def test_a_failed_publication_rolls_back_and_the_same_set_can_be_rebuilt(self):
        def fail(*_a, **_k):
            raise OSError("disk full")

        def replace_seal(*_a, **_k):  # someone else's seal takes the path before the set moves
            seal = self.t.seal
            seal.unlink()
            seal.write_text("foreign\n")
            raise OSError("rename failed")

        faults = {"before the seal": ("_open_seal", fail, "publication failed"),
                  "while writing the seal": ("_write_seal", fail, "publication failed"),
                  "moving the set": ("_move_set", fail, "publication failed"),
                  "interrupted while moving": ("_move_set", mock.Mock(side_effect=KeyboardInterrupt), "interrupted"),
                  "the seal cannot be removed": ("_move_set", fail, "publication incomplete"),
                  "a foreign seal at the path": ("_move_set", replace_seal, "publication incomplete")}
        for n, (name, (seam, effect, reason)) in enumerate(faults.items(), 1):
            set_id = f"r{n}"  # restored() keeps new directories, so each case builds its own set
            self.addCleanup(shutil.rmtree, self.t.private / set_id, True)
            with self.subTest(name), self.t.restored():
                git(self.t.repo, "rm", "-q", STUDY.seal_rel)
                git(self.t.repo, "commit", "-q", "-m", "no seal")
                seal = self.t.seal
                with contextlib.ExitStack() as stack:
                    stack.enter_context(mock.patch.object(blind, seam, effect))
                    if name == "the seal cannot be removed":
                        stack.enter_context(mock.patch.object(blind, "_remove_seal", fail))
                    code, out, err = self.t.cli(blind, "--set", set_id)
                self.assertEqual(code, 1, out)
                self.assertIn(f"set: {reason}", out)
                self.assertFalse((self.t.private / set_id).exists())
                self.assertEqual(list(self.t.private.glob(f".{set_id}-*")), [])
                if reason == "publication incomplete":
                    self.assertIn("A partial publication remains", out)
                    self.assertNotIn("Nothing was written", out)
                    self.assertTrue(seal.exists())
                    if name == "a foreign seal at the path":
                        self.assertEqual(seal.read_text(), "foreign\n")  # never removed
                    seal.unlink()
                else:
                    self.assertIn("Nothing was written", out)
                    self.assertFalse(seal.exists())
                code, out, err = self.t.cli(blind, "--set", set_id)  # the same set id, no fault
                self.assertEqual(code, 0, out + err)
                self.assertTrue((self.t.private / set_id / blind.MANIFEST).exists())
                self.assertIn(f"set_id={set_id} ", seal.read_text())

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
            report = json.loads((t.repo / STUDY.verdict_json).read_text())
            self.assertEqual(report["verdict"], "FAIL")
            self.assertEqual(len(report["reasons"]["not_delivered"]), 6)
            self.assertTrue(all(s["gpt_level"] is None for s in report["slots"]))
            self.assertEqual((t.repo / STUDY.verdict_md).read_text().count(gate.UNRATED), 18)
        with t.restored():
            t.ratings.write_text("{}\n")
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
            code = blind.main(["--config", CONFIG, "--set", "t1"], root=s.repo)
        self.assertEqual(code, 1)
        self.assertIn("set: run not resolved", out.getvalue())
        self.assertFalse((s.repo / STUDY.seal_rel).exists())


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
        self.assertEqual(gate.checkpoint_path(blind.run.study_paths(ROOT, STUDY), "x").name, "x-pass1-checkpoint.json")

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

    def test_a_stale_tab_cannot_replace_the_first_lock(self):
        script = VIEWER.read_text().split("<script>")[1].split("</script>")[0]
        open_set = script.split("function openSet(M, base)")[1]
        guard = "if (P.stale()) return fatal(P.stale());"
        for where, text in (("save", open_set.split("const save = () => {")[1].split("};")[0]),
                            ("update", open_set.split("function update()")[1].split("function go(")[0]),
                            ("export", open_set.split('$("export").onclick = () => {')[1].split("exportJson =")[0])):
            self.assertIn(guard, text, where)
        self.assertIn("if (!cp && P.stale()) return fatal(P.stale());", open_set)
        self.assertIn('addEventListener("storage", () => {\n          const why = P.stale();\n          if (why) fatal(why);',
                      open_set)
        if not shutil.which("node"):
            self.skipTest("node is not installed")
        block = next(b for b in script.split("// GPT26 begin")[1:] if "function gpt26Passes" in b).split("// GPT26 end")[0]
        consts = "\n".join(ln for ln in script.splitlines() if ln.strip().startswith(("const QUALITY", "const LEVELS")))
        harness = consts + "\n" + block + r"""
const assert = require("node:assert/strict");
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const items = ["p01", "p02"].map((id) => ({ id }));
const M = { set_id: "t1", set_digest: "d".repeat(64), items, passes: [["p01"], ["p02"]] };
const row = (q) => ({ pair_id: "p01", quality: q, fidelity: { A: { level: "none", crops: [], reason: "" }, B: { level: "none", crops: [], reason: "" } } });
// two tabs opened before either locks: the older one is stale at once
const older = gpt26Passes(M, "k");
const newer = gpt26Passes(M, "k");
assert.match(older.stale(), /innej karcie/);
assert.equal(newer.stale(), null);
assert.ok(newer.lock([row("tie")]));
// the stale tab still believes pass 1 is open, but its lock is refused and the first lock stays
assert.equal(older.pass(), 1);
assert.equal(older.lock([row("A-clear")]), null);
assert.equal(JSON.parse(store.get("k:gpt26-pass1-lock")).ratings[0].quality, "tie");
// a reload reads the first lock back
const reloaded = gpt26Passes(M, "k");
assert.equal(reloaded.pass(), 2);
assert.equal(reloaded.lockedRows()[0].quality, "tie");
assert.equal(reloaded.stale(), null);
// a lock changed outside this tab switches it off
store.set("k:gpt26-pass1-lock", store.get("k:gpt26-pass1-lock").replace('"tie"', '"A-clear"'));
assert.match(reloaded.stale(), /zmieniła się/);
// the older tab locking first is refused too when a newer tab exists
store.clear();
const a = gpt26Passes(M, "k2");
gpt26Passes(M, "k2");
assert.equal(a.lock([row("tie")]), null);
assert.equal(store.has("k2:gpt26-pass1-lock"), false);
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
        self.assertIn('footer();\n          // GPT26 begin\n          if (P.stale()) return fatal(P.stale());\n'
                      '          gpt26ShowNote(P, $("rating"));', update)
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


# ---------------------------------------------------------------- gate version 2: the preference rule (pure)


PHOTOS16 = ("S17-01", "S17-02", "S17-03", "S17-04", "S17-05", "S17-06", "S17-07", "S17-21")
LABELS16 = [f"{p}/{n}" for p in PHOTOS16 for n in (1, 2)]
GATE16 = {**GATE, "tie_rule_kind": "preference", "denominator": 16, "min_tie_pairs": 8, "cap_usd": 3.5,
          "expected_slots": [{"photo": p, "slot": n} for p in PHOTOS16 for n in (1, 2)]}
SPEND16 = {"committed_usd": 1.3, "cap_usd": 3.5, "breaches": []}


def records16(prefs: list[str | None], levels: tuple[str, str] = ("none", "none")) -> list[dict]:
    out = []
    for label, pref in zip(LABELS16, prefs):
        if pref is None:
            out.append({"label": label, "delivered": False, "reason": "technical_failure: moderation_blocked",
                        "gpt_level": None, "local_level": None, "quality": None, "preference": None})
        else:
            out.append({"label": label, "delivered": True, "gpt_level": levels[0], "local_level": levels[1],
                        "quality": "tie", "preference": pref})
    return out


class PreferenceRuleTest(unittest.TestCase):
    def test_eight_of_sixteen_at_least_a_tie_passes(self):
        prefs = ["tie", "gpt-slight", "gpt-clear", "tie"] * 2 + ["local-slight", "local-clear"] * 4
        r = gate.decide(GATE16, records16(prefs), SPEND16)
        self.assertEqual((r["verdict"], r["ties"], r["denominator"]), ("PASS", 8, 16))

    def test_seven_of_sixteen_fails(self):
        prefs = ["tie"] * 7 + ["local-slight"] * 9
        r = gate.decide(GATE16, records16(prefs), SPEND16)
        self.assertEqual((r["verdict"], r["ties"]), ("FAIL", 7))
        self.assertEqual(r["reasons"]["fidelity"], ["fidelity: 7 of 16 pairs at least a tie, 8 required"])

    def test_local_slight_counts_against_gpt(self):
        want = {"local-clear": False, "local-slight": False, "tie": True, "gpt-slight": True, "gpt-clear": True}
        for pref, tie in want.items():
            with self.subTest(pref=pref):
                r = gate.decide(GATE16, records16([pref] * 16), SPEND16)
                self.assertEqual(r["slots"][0]["tie"], tie)
                self.assertEqual(r["verdict"], "PASS" if tie else "FAIL")

    def test_one_gpt_significant_with_sixteen_ties_fails(self):
        recs = records16(["gpt-clear"] * 16)
        recs[5]["gpt_level"] = "significant"
        r = gate.decide(GATE16, recs, SPEND16)
        self.assertEqual((r["verdict"], r["ties"]), ("FAIL", 16))
        self.assertEqual(r["reasons"]["fidelity"], ["fidelity: significant on S17-03/2"])

    def test_fifteen_delivered_fail_with_denominator_16(self):
        r = gate.decide(GATE16, records16(["tie"] * 15 + [None]), SPEND16)
        self.assertEqual((r["verdict"], r["ties"], r["denominator"]), ("FAIL", 15, 16))
        self.assertEqual(r["reasons"]["not_delivered"],
                         ["not delivered: S17-21/2 (technical_failure: moderation_blocked)"])
        self.assertEqual(r["reasons"]["fidelity"], [])

    def test_local_level_is_a_diagnostic_under_the_preference_rule(self):
        r = gate.decide(GATE16, records16(["tie"] * 16, levels=("minor", "none")), SPEND16)
        self.assertEqual((r["verdict"], r["ties"]), ("PASS", 16))  # level(GPT) > level(Local) is no longer a loss

    def test_unknown_or_missing_rule_kind_refused(self):
        for kind in (None, "levels", "", 2):
            with self.subTest(kind=kind):
                g = {k: v for k, v in GATE16.items() if k != "tie_rule_kind"}
                if kind is not None:
                    g["tie_rule_kind"] = kind
                self.assertEqual(blocked_reasons(lambda: gate.decide(g, records16(["tie"] * 16), SPEND16)),
                                 {"rule kind"})
        self.assertEqual(sorted(gate.RULE_KINDS), sorted(blind.run.check_series.TIE_RULE_KINDS))

    def test_p95_above_the_guardrail_does_not_change_the_verdict(self):
        r = gate.decide(GATE16, records16(["tie"] * 16), SPEND16)
        extra = {**RuleTest.extra(r), "series_id": "gpt26-wider", "walls_s": [12.0, 31.5], "wall_p95_s": 31.5}
        md = gate.verdict_md({**r, **extra})
        self.assertEqual(r["verdict"], "PASS")
        self.assertIn("**Verdict: PASS.**", md)
        self.assertIn("p95 31.5 s vs the 30 s guardrail (diagnostic)", md)

    def test_verdict_table_has_a_preference_column_and_local_as_diagnostic(self):
        r = gate.decide(GATE16, records16(["gpt-slight"] * 15 + [None]), SPEND16)
        md = gate.verdict_md({**r, **RuleTest.extra(r)})
        header = next(ln for ln in md.splitlines() if ln.startswith("| Slot"))
        self.assertEqual([c.strip() for c in header.strip("|").split("|")],
                         ["Slot", "Pair", "GPT fidelity", "Fidelity preference", "At least a tie",
                          "Local fidelity (diagnostic)", "Quality (diagnostic)"])
        self.assertRegex(md, r"\| S17-01/1 +\| — +\| none +\| gpt-slight +\| yes +\| none +\| tie +\|")
        self.assertIn("Local's level and quality are diagnostic only.", md)


class PreferenceSchemaTest(SchemaTest):
    """ratings_of under the preference rule: version 2 rows, each with one valid A/B preference."""

    def row(self, item, a="none", b="none", crops=None, reason="", pref="tie"):
        r = super().row(item, a, b, crops, reason)
        if pref != "omit":
            r["fidelity_preference"] = pref
        return r

    def export(self, rows, locked="auto", version=2):
        return {**super().export(rows, locked), "version": version}

    def checkpoint(self, rows, version=2):
        doc = json.loads(super().checkpoint(rows))
        return json.dumps({**doc, "version": version}).encode()

    def of(self, export, cp, kind="preference"):
        return gate.ratings_of(export, cp, self.sealed, self.pairs, kind)

    def test_valid_two_pass_export(self):
        rows = [self.row("p01", pref="A-clear"), self.row("p02", pref="B-slight")]
        out = self.of(self.export(rows), self.checkpoint(rows[:1]))
        self.assertEqual({k: v["fidelity_preference"] for k, v in out.items()}, {"p01": "A-clear", "p02": "B-slight"})

    # The inherited cases (uncertain, evidence, crops, coverage, checkpoints) run with version-2
    # rows against the level rule's reader; route them through the preference rule instead.
    def setUp(self):
        super().setUp()
        real = gate.ratings_of
        patcher = mock.patch.object(gate, "ratings_of",
                                    lambda e, c, s, p, kind="preference": real(e, c, s, p, kind))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_all_five_choices_map_with_gpt_on_either_side(self):
        want = {("A-clear", "A"): "gpt-clear", ("A-slight", "A"): "gpt-slight", ("tie", "A"): "tie",
                ("B-slight", "A"): "local-slight", ("B-clear", "A"): "local-clear",
                ("A-clear", "B"): "local-clear", ("A-slight", "B"): "local-slight", ("tie", "B"): "tie",
                ("B-slight", "B"): "gpt-slight", ("B-clear", "B"): "gpt-clear"}
        for (choice, gpt_side), mapped in want.items():
            with self.subTest(choice=choice, gpt_side=gpt_side):
                self.assertEqual(gate.preference_of(choice, gpt_side), mapped)
                self.assertEqual(ab_of(mapped, gpt_side), choice)  # the test helper inverts it
        self.assertEqual(set(gate.PREFERENCE), {c for c, _ in want})

    def test_missing_null_or_invalid_preference_blocks_never_a_tie(self):
        for pref in ("omit", None, "", "gpt-clear", "local-slight", "uncertain", "A", 1, ["tie"]):
            with self.subTest(pref=pref):
                rows = [self.row("p01", pref=pref), self.row("p02")]
                # An omitted field also leaves the pair unrated (coverage); either way BLOCKED, never a tie.
                self.assertIn("schema error",
                              blocked_reasons(lambda: self.of(self.export(rows), self.checkpoint(rows[:1]))))

    def test_version_1_export_or_checkpoint_blocked_for_the_preference_rule(self):
        rows = [self.row("p01"), self.row("p02")]
        self.assertEqual(blocked_reasons(lambda: self.of(self.export(rows, version=1), self.checkpoint(rows[:1]))),
                         {"schema error"})
        self.assertEqual(blocked_reasons(lambda: self.of(self.export(rows), self.checkpoint(rows[:1], version=1))),
                         {"checkpoint error"})
        legacy = [SchemaTest.row(self, "p01"), SchemaTest.row(self, "p02")]  # screen rows: no preference field
        self.assertIn("schema error", blocked_reasons(lambda: self.of(self.export(legacy), self.checkpoint(legacy[:1]))))

    def test_version_2_export_blocked_for_the_level_rule(self):
        rows = [self.row("p01"), self.row("p02")]
        self.assertEqual(blocked_reasons(lambda: self.of(self.export(rows), self.checkpoint(rows[:1]), "level")),
                         {"schema error"})

    def test_a_changed_first_pass_preference_blocks(self):
        rows = [self.row("p01", pref="A-slight"), self.row("p02")]
        changed = [self.row("p01", pref="tie"), self.row("p02")]
        cases = {"final export": (self.export(changed, locked=rows[:1]), self.checkpoint(rows[:1])),
                 "private checkpoint": (self.export(rows), self.checkpoint(changed[:1]))}
        for name, (export, cp) in cases.items():
            with self.subTest(name):
                self.assertEqual(blocked_reasons(lambda: self.of(export, cp)), {"checkpoint error"})


# ---------------------------------------------------------------- pipeline: the preference rule and --check


def tree(*roots: Path) -> dict:
    return {p: p.read_bytes() for r in roots for p in r.rglob("*") if p.is_file() and ".git" not in p.parts}


class PreferencePipelineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t = template("pref")

    def test_the_pref_study_uses_the_wider_viewer_byte_for_byte(self):
        self.assertEqual(self.t.run_code, 0, self.t.run_err)
        self.assertEqual(self.t.built["items"], 6)
        self.assertEqual((self.t.repo / self.t.study.viewer).read_bytes(), WIDER_VIEWER.read_bytes())
        self.assertIn(self.t.study.viewer, self.t.study.rule_files)
        self.assertEqual(blind.run.check_series.check_viewer(self.t.repo, self.t.study), [])

    def test_preferences_decide_through_the_sealed_key(self):
        sides = {it["gpt_side"] for it in self.t.key["items"].values()}
        self.assertEqual(sides, {"A", "B"})  # the mapping is exercised with GPT on both sides
        labels = sorted(self.t.label_of(i) for i in self.t.key["items"])
        prefs = dict(zip(labels, ["gpt-clear", "gpt-slight", "tie", "local-slight", "local-clear", "tie"]))
        with self.t.restored():
            self.t.commit_ratings(levels={labels[4]: ("none", "severe")}, prefs=prefs)  # Local's level: diagnostic
            r = self.t.evaluate()
            self.assertEqual((r["verdict"], r["ties"], r["tie_rule_kind"]), ("PASS", 4, "preference"))
            self.assertEqual({s["label"]: s["preference"] for s in r["slots"]}, prefs)
            md = gate.verdict_md(r)
            self.assertIn("Fidelity preference", md)
        with self.t.restored():
            self.t.commit_ratings(prefs={**prefs, labels[2]: "local-slight"})
            r = self.t.evaluate()
            self.assertEqual((r["verdict"], r["ties"]), ("FAIL", 3))

    def test_viewer_artifacts_carry_only_anonymous_ids_and_ab_choices(self):
        manifest = (self.t.set_dir / blind.MANIFEST).read_text()
        export = self.t.ratings.read_text()
        checkpoint = gate.checkpoint_path(self.t.paths, "t1").read_text()
        for text in (manifest, export, checkpoint):
            for needle in ("gpt", "local", "Local", str(self.t.screen.tmp)):
                self.assertNotIn(needle, text)
        doc = json.loads(export)
        self.assertEqual(doc["version"], 2)
        self.assertEqual({r["fidelity_preference"] for r in doc["ratings"]} - set(gate.PREFERENCE), set())
        self.assertEqual({r["pair_id"] for r in doc["ratings"]}, set(self.t.key["items"]))

    def test_version_1_ratings_blocked_by_the_preference_study(self):
        with self.t.restored():
            doc = json.loads(self.t.ratings.read_text())
            doc["version"] = 1
            self.t.ratings.write_text(json.dumps(doc, indent=2) + "\n")
            git(self.t.repo, "commit", "-q", "-am", "v1 ratings")
            self.assertEqual(blocked_reasons(self.t.evaluate), {"schema error"})

    def test_wall_p95_above_30_s_does_not_change_the_verdict(self):
        with self.t.restored():
            before = self.t.evaluate()
            with mock.patch.object(gate.state, "p95", lambda walls: 31.0):
                after = self.t.evaluate()
            self.assertEqual(after["wall_p95_s"], 31.0)
            self.assertEqual({k: after[k] for k in ("verdict", "ties", "reasons")},
                             {k: before[k] for k in ("verdict", "ties", "reasons")})
            self.assertIn("p95 31 s vs the 30 s guardrail (diagnostic)", gate.verdict_md(after))


class CheckModeTest(unittest.TestCase):
    """`gate.py --check`: the canonical Markdown on stdout, nothing written, at any template."""

    def roots(self, t: Template) -> tuple[Path, ...]:
        return (t.repo,)

    def check(self, t: Template, *extra: str) -> tuple[int, str, str]:
        args = ["--set", "t1", *extra, "--check"]
        return t.cli(gate, *args)

    def assert_reproduces(self, t: Template, export: bool):
        extra = ("--export", str(t.ratings)) if export else ()
        with t.restored():
            code, out, err = t.cli(gate, "--set", "t1", *extra)
            self.assertEqual(code, 0, out + err)
            written = (t.repo / t.study.verdict_md).read_text(encoding="utf-8")
        with t.restored():
            for rel in (t.study.verdict_md, t.study.verdict_json):
                self.assertFalse((t.repo / rel).exists(), rel)  # the checked revision has no verdict
            before = tree(*self.roots(t))
            code, out, err = self.check(t, *extra)
            self.assertEqual((code, err), (0, ""), out + err)
            self.assertEqual(out, written)
            self.assertEqual(tree(*self.roots(t)), before)  # no verdict file, no private log

    def test_check_reproduces_the_level_verdict(self):
        self.assert_reproduces(template("six"), export=True)

    def test_check_reproduces_the_preference_verdict(self):
        self.assert_reproduces(template("pref"), export=True)

    def test_check_reproduces_the_zero_delivery_verdict_without_export(self):
        self.assert_reproduces(template("zero"), export=False)

    def test_a_blocked_check_writes_nothing_and_reports_on_stderr(self):
        t = template("pref")
        with t.restored():
            t.ratings.write_text("{}\n")  # dirty ratings: an order violation
            before = tree(*self.roots(t))
            code, out, err = self.check(t, "--export", str(t.ratings))
            self.assertEqual((code, out), (1, ""))
            self.assertIn("set: order violation", err)
            self.assertIn("No private log was written (read-only check).", err)
            self.assertNotIn(str(t.screen.tmp), err)
            self.assertEqual(tree(*self.roots(t)), before)
        with t.restored():  # an invalid study is refused on stderr too
            out_, err_ = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out_), contextlib.redirect_stderr(err_):
                code = gate.main(["--config", "scripts/gpt26/tests/fixtures/missing.json", "--set", "t1", "--check"],
                                 root=t.repo)
            self.assertEqual((code, out_.getvalue()), (1, ""))
            self.assertIn("study invalid", err_.getvalue())

    def test_check_usage_errors_exit_2(self):
        t = template("pref")
        for args in (["--set", "t1", "--check", "--export", "elsewhere.json"], ["--check"]):
            with self.subTest(args=args), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as e:
                    gate.main(["--config", t.config, *args], root=t.repo)
                self.assertEqual(e.exception.code, 2)


# ---------------------------------------------------------------- the wider study's viewer


# Fixture text -> wider text, each once. Everything else that differs sits inside a
# `GPT26-WIDER begin` / `GPT26-WIDER end` block (plan Phase 2 §1).
WIDER_SUBS = [
    ('const base = "../../../../test-photos/private/gpt26/" + setId + "/";',
     'const base = "../../../../test-photos/private/gpt26-wider/" + setId + "/";'),
    ('s.onerror = () => fatal("Brak manifestu " + s.src + ". Uruchom: python3 scripts/gpt26/blind.py --set " + setId);',
     's.onerror = () =>\n          fatal(\n            "Brak manifestu " +\n              s.src +\n              ". Uruchom: '
     'python3 scripts/gpt26/blind.py --config scripts/gpt26/configs/gpt26-wider.json --set " +\n              setId,\n'
     '          );'),
    ('if (!keys.every((k) => k === "quality" || k === "fidelity")) return false;',
     'if (!keys.every((k) => k === "quality" || k === "fidelity" || k === "fidelity_preference")) return false;'),
    ("(przenieś go bez zmian do <code>test-photos/private/gpt26/</code>)",
     "(przenieś go bez zmian do <code>test-photos/private/gpt26-wider/</code>)"),
    ('          Object.keys(r).sort().join() === "fidelity,pair_id,quality" &&\n          QUALITY.includes(r.quality) &&\n',
     '          Object.keys(r).sort().join() === "fidelity,fidelity_preference,pair_id,quality" &&\n'
     '          QUALITY.includes(r.quality) &&\n          PREFERENCE.includes(r.fidelity_preference) &&\n'),
    ('            s.kind === "gate-pass1-checkpoint" &&\n',
     '            s.viewer === "compare-s20" &&\n            s.version === GPT26_VERSION &&\n'
     '            s.kind === "gate-pass1-checkpoint" &&\n'),
    ("answers[r.pair_id] = JSON.parse(JSON.stringify({ quality: r.quality, fidelity: r.fidelity }));",
     "answers[r.pair_id] = JSON.parse(\n                  JSON.stringify({\n                    quality: r.quality,\n"
     "                    fidelity_preference: r.fidelity_preference,\n                    fidelity: r.fidelity,\n"
     "                  }),\n                );"),
    ("if (lock || passes.length < 2 || stale()) return null;\n",
     "if (lock || passes.length < 2 || stale()) return null;\n"
     "            // Only complete, valid first-pass rows in the sealed order can be locked.\n"
     "            if (\n              !Array.isArray(rows) ||\n              !gpt26Same(\n"
     "                rows.map((r) => r && r.pair_id),\n                passes[0],\n              ) ||\n"
     "              !rows.every(gpt26ValidRow)\n            )\n              return null;\n"),
    ('              version: 1,\n              kind: "gate-pass1-checkpoint",\n',
     '              version: GPT26_VERSION,\n              kind: "gate-pass1-checkpoint",\n'),
    ('reason.placeholder = "Co zostało utracone wobec oryginału? (wymagane przy istotnej/ciężkiej)";',
     'reason.placeholder =\n                  "Co się zmieniło, pojawiło lub zniknęło wobec oryginału i co widać bez powiększenia? '
     '(wymagane przy istotnej/ciężkiej)";'),
    ("            version: 1,\n            kind: M.kind,\n", "            version: GPT26_VERSION,\n            kind: M.kind,\n"),
    ("            pair_id: id,\n            quality: a.quality || null,\n",
     "            pair_id: id,\n            quality: a.quality || null,\n"
     "            fidelity_preference: a.fidelity_preference || null,\n"),
    ('"Przebieg 1 zablokowany. Przenieś pobrany checkpoint do test-photos/private/gpt26/ i oceniaj przebieg 2."',
     '"Przebieg 1 zablokowany. Przenieś pobrany checkpoint do test-photos/private/gpt26-wider/ i oceniaj przebieg 2."'),
]


def strip_wider(text: str) -> str:
    out, skip = [], False
    for line in text.splitlines(keepends=True):
        s = line.strip()
        if s in ("// GPT26-WIDER begin", "<!-- GPT26-WIDER begin -->"):
            skip = True
            continue
        if s in ("// GPT26-WIDER end", "<!-- GPT26-WIDER end -->"):
            skip = False
            continue
        if not skip:
            out.append(line)
    return "".join(out)


def wider_script() -> str:
    return WIDER_VIEWER.read_text().split("<script>")[1].split("</script>")[0]


def node(harness: str) -> subprocess.CompletedProcess:
    return subprocess.run(["node", "-e", harness], capture_output=True, text=True)


class WiderViewerTest(unittest.TestCase):
    def test_bounded_diff_against_the_phase_1_fixture(self):
        text = strip_wider(WIDER_VIEWER.read_text())
        for old, new in WIDER_SUBS:
            self.assertEqual(text.count(new), 1, new)
            text = text.replace(new, old)
        self.assertEqual(text, VIEWER.read_text())

    def test_anchor_question_and_evidence_prompt_on_screen(self):
        html = WIDER_VIEWER.read_text()
        for needle in (ANCHOR, '"Który wynik wierniejszy oryginałowi?"',
                       '["A wyraźnie", "A nieco", "remis", "B nieco", "B wyraźnie"]',
                       'const PREFERENCE = ["A-clear", "A-slight", "tie", "B-slight", "B-clear"];',
                       "Co się zmieniło, pojawiło lub zniknęło wobec oryginału i co widać bez powiększenia?"):
            self.assertEqual(html.count(needle), 1 if needle != '["A wyraźnie", "A nieco", "remis", "B nieco", "B wyraźnie"]'
                             else 2, needle)  # the quality and the fidelity question share the labels
        footer = wider_script().split("function footer()")[1].split("function checkText()")[0]
        self.assertLess(footer.index('"Wierność " + side'), footer.index("GPT26_ANCHOR"))  # under the level buttons
        self.assertLess(footer.index("GPT26_ANCHOR"), footer.index("Który wynik wierniejszy"))
        study = blind.study_mod.Study(
            config="scripts/gpt26/configs/gpt26-wider.json", change_dir="context/changes/gpt-image-26-wider",
            series="scripts/gpt26/series/wider.json", viewer=str(WIDER_VIEWER.relative_to(ROOT).as_posix()),
            private_root="test-photos/private/gpt26-wider", series_id="gpt26-wider", expected_slots=())
        self.assertEqual(blind.run.check_series.check_viewer(ROOT, study), [])

    def test_stale_tab_guards_kept(self):
        open_set = wider_script().split("function openSet(M, base)")[1]
        guard = "if (P.stale()) return fatal(P.stale());"
        for where, text in (("save", open_set.split("const save = () => {")[1].split("};")[0]),
                            ("update", open_set.split("function update()")[1].split("function go(")[0]),
                            ("export", open_set.split('$("export").onclick = () => {')[1].split("exportJson =")[0])):
            self.assertIn(guard, text, where)
        self.assertIn("if (!cp && P.stale()) return fatal(P.stale());", open_set)
        lock_click = open_set.split("lockBtn.onclick = () => {")[1].split("};")[0]
        self.assertIn("missing(it).length || uncertain(it)", lock_click)

    def harness_prelude(self) -> str:
        script = wider_script()
        consts = "\n".join(ln for ln in script.splitlines()
                           if ln.strip().startswith(("const QUALITY", "const LEVELS", "const PREFERENCE",
                                                     "const GPT26_VERSION", "const NEEDS_EVIDENCE")))
        block = next(b for b in script.split("// GPT26 begin")[1:] if "function gpt26Passes" in b).split("// GPT26 end")[0]
        block = strip_wider_inline(block)
        return consts + "\n" + block

    def test_version_2_controller_lock_restore_and_legacy_refusal(self):
        if not shutil.which("node"):
            self.skipTest("node is not installed")
        harness = self.harness_prelude() + r"""
const assert = require("node:assert/strict");
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const items = ["p01", "p02", "p03", "p04"].map((id) => ({ id }));
const M = { set_id: "t1", set_digest: "d".repeat(64), items, passes: [["p02", "p03"], ["p04", "p01"]] };
const side = (lv) => ({ level: lv, crops: [], reason: "" });
const row = (id, pref) => {
  const r = { pair_id: id, quality: "tie", fidelity: { A: side("none"), B: side("minor") } };
  if (pref !== undefined) r.fidelity_preference = pref;
  return r;
};
let P = gpt26Passes(M, "k");
assert.equal(P.pass(), 1);
// an unanswered, null or invalid preference cannot be locked: pass 2 stays hidden
for (const bad of [undefined, null, "", "gpt-clear", "uncertain"]) {
  assert.equal(P.lock([row("p02", "tie"), row("p03", bad)]), null);
  assert.equal(P.pass(), 1);
  assert.deepEqual(P.visible(items).map((i) => i.id), ["p02", "p03"]);
}
assert.equal(P.lock([row("p03", "tie"), row("p02", "tie")]), null);  // not the sealed order
assert.equal(store.has("k:gpt26-pass1-lock"), false);
// a complete first pass locks as a version-2 checkpoint, preference kept
const locked = [row("p02", "A-slight"), row("p03", "B-clear")];
const cp = P.lock(locked);
assert.equal(cp.version, 2);
assert.equal(cp.viewer, "compare-s20");
assert.deepEqual(cp.ratings, locked);
assert.deepEqual(P.visible(items).map((i) => i.id), ["p04", "p01"]);
// reload: the v2 lock is read back and restores the first-pass preference over later edits
P = gpt26Passes(M, "k");
assert.equal(P.problem, null);
assert.equal(P.pass(), 2);
const answers = { p02: { quality: "A-clear", fidelity_preference: "B-clear", fidelity: { A: side("severe"), B: side("none") } } };
P.restore(answers);
assert.equal(answers.p02.fidelity_preference, "A-slight");
assert.equal(answers.p03.fidelity_preference, "B-clear");
assert.deepEqual(P.lockedRows(), locked);
// a legacy (version 1, no preference) lock is refused without revealing pass 2
const legacy = { ...cp, version: 1, ratings: cp.ratings.map(({ fidelity_preference, ...r }) => r) };
store.set("k:gpt26-pass1-lock", JSON.stringify(legacy));
assert.match(gpt26Passes(M, "k").problem, /uszkodzona/);
store.set("k:gpt26-pass1-lock", JSON.stringify({ ...cp, version: 1 }));
assert.match(gpt26Passes(M, "k").problem, /uszkodzona/);
store.set("k:gpt26-pass1-lock", JSON.stringify({ ...cp, ratings: [row("p02", null), row("p03", "tie")] }));
assert.match(gpt26Passes(M, "k").problem, /uszkodzona/);
console.log("ok");
"""
        r = node(harness)
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "ok"), r.stderr)

    def test_saved_state_missing_and_export_row_carry_the_preference(self):
        if not shutil.which("node"):
            self.skipTest("node is not installed")
        script = wider_script()
        valid = script.split("const isInt = ")[1].split("function loadState")[0]
        open_set = script.split("function openSet(M, base)")[1]
        fresh = "const fresh = " + open_set.split("const fresh = ")[1].split("});")[0] + "});"
        missing = "function missing(it) {" + open_set.split("function missing(it) {")[1].split("const uncertain")[0]
        row_fn = "const gpt26Row = " + open_set.split("const gpt26Row = ")[1].split("};")[0] + "};\n};"
        harness = self.harness_prelude() + "\nconst isInt = " + valid + "\n" + strip_wider_inline(fresh) + "\n" \
            + strip_wider_inline(missing) + "\n" + row_fn + r"""
const assert = require("node:assert/strict");
const item = { id: "p01", original: { dimensions: [64, 48] } };
const M = { kind: "gate" };
const side = (lv) => ({ level: lv, crops: [], reason: "" });
const base = { quality: "tie", fidelity: { A: side("none"), B: side("minor") } };
// saved state: the preference is optional until chosen, and only the five A/B choices are valid
assert.equal(validAnswer("gate", base, item), true);
assert.equal(validAnswer("gate", { ...base, fidelity_preference: "B-slight" }, item), true);
for (const bad of [null, "", "gpt-clear", "uncertain"])
  assert.equal(validAnswer("gate", { ...base, fidelity_preference: bad }, item), false);
// an unanswered preference is missing, so pass 1 cannot lock and the export warns
const answers = { p01: JSON.parse(JSON.stringify(base)) };
assert.ok(missing({ id: "p01" }).includes("wierniejszy wynik"));
assert.ok(missing({ id: "p02" }).includes("wierniejszy wynik"));
answers.p01.fidelity_preference = "tie";
assert.deepEqual(missing({ id: "p01" }), []);
// the export row: anonymous id, A/B choices only, null when unanswered
assert.deepEqual(gpt26Row("p01"), { pair_id: "p01", quality: "tie", fidelity_preference: "tie", fidelity: base.fidelity });
assert.equal(gpt26ValidRow(gpt26Row("p01")), true);
assert.equal(gpt26Row("p02").fidelity_preference, null);
assert.equal(gpt26ValidRow(gpt26Row("p02")), false);
console.log(JSON.stringify(gpt26Row("p01")));
"""
        r = node(harness)
        self.assertEqual(r.returncode, 0, r.stderr)
        exported = json.loads(r.stdout.strip())
        # The gate reads exactly the row the viewer writes.
        sealed = {"key": {"items": {"p01": {"gpt_side": "A", "local_side": "B"}}}}
        out = gate.check_rows([exported], sealed, {"p01": slot("S17-03", 1)}, expect=["p01"], kind="preference")
        self.assertEqual(out["p01"]["fidelity_preference"], "tie")


def strip_wider_inline(text: str) -> str:
    """Drop the `GPT26-WIDER` markers but keep their content (for a harness that needs both)."""
    return "".join(ln for ln in text.splitlines(keepends=True)
                   if ln.strip() not in ("// GPT26-WIDER begin", "// GPT26-WIDER end"))


if __name__ == "__main__":
    unittest.main()
