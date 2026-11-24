"""study.py and the study-driven CLIs offline (plan `gpt-image-26-wider` Phase 1 §1, §3).

  - the descriptor: repo-relative, normalized paths, contained after resolving symlinks; an
    archived change folder, a reserved or escaping private root and a misplaced viewer refused;
  - every study CLI refuses to run without `--config` (usage, exit 2) and refuses an archived study;
  - a generated 16-slot study (S17-01…07, S17-21 × slots 1, 2) checks, runs on a fake provider and
    reconciles with denominator 16, in a private root of its own, next to the screen-shaped fixture.
"""

from __future__ import annotations

import contextlib
import copy
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

GPT26 = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(GPT26))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import blind  # noqa: E402
import gate  # noqa: E402
import pointers  # noqa: E402
import test_run  # noqa: E402

study_mod, run, check_series = test_run.study_mod, test_run.run, test_run.check_series
ROOT = test_run.ROOT
SCREEN = json.loads((ROOT / test_run.CONFIG).read_text())

WIDE_CONFIG = "scripts/gpt26/tests/fixtures/wide-config.json"
WIDE_SERIES = "scripts/gpt26/tests/fixtures/wide-series.json"
WIDE_PHOTOS = ("S17-01", "S17-02", "S17-03", "S17-04", "S17-05", "S17-06", "S17-07", "S17-21")
WIDE_STUDY = {"change_dir": "context/changes/gpt26-wide-fixture", "series": WIDE_SERIES,
              "viewer": "context/changes/gpt26-wide-fixture/references/compare-gpt26.html",
              "private_root": "test-photos/private/gpt26-wide-fixture", "series_id": "gpt26-wide-fixture"}


def config_with(**study) -> dict:
    c = copy.deepcopy(SCREEN)
    c["study"].update(study)
    return c


class DescriptorTest(unittest.TestCase):
    def setUp(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.root = Path(d.name)
        (self.root / "context/changes").mkdir(parents=True)
        (self.root / "test-photos/private/s19").mkdir(parents=True)

    def refused(self, config, needle: str) -> None:
        with self.assertRaises(study_mod.StudyError) as cm:
            study_mod.from_config(self.root, "c.json", config)
        self.assertIn(needle, str(cm.exception))

    def test_the_fixture_study_and_its_derived_paths(self):
        s = study_mod.from_config(self.root, "c.json", SCREEN)
        self.assertEqual(s.change_id, "gpt26-screen-fixture")
        self.assertEqual(s.seal_rel, "context/changes/gpt26-screen-fixture/evaluations/gate-sealed.md")
        self.assertEqual(s.ratings_rel, "context/changes/gpt26-screen-fixture/evaluations/ratings.json")
        self.assertEqual(s.run_report, "context/changes/gpt26-screen-fixture/evaluations/run.md")
        self.assertEqual(s.change_md, "context/changes/gpt26-screen-fixture/change.md")
        self.assertEqual(s.registration_files, ("c.json", SCREEN["study"]["series"]))
        self.assertEqual(s.rule_files.count(s.viewer), 1)
        self.assertEqual(len(s.expected_slots), 6)
        self.assertEqual(s.labels[0], "S17-03/1")

    def test_an_archived_change_dir_is_refused_also_through_a_symlink(self):
        self.refused(config_with(change_dir="context/archive/2026-11-05-x", viewer="context/archive/2026-11-05-x/"
                                 "references/v.html"), "must be context/changes/<change-id>")
        (self.root / "context/archive/2026-11-05-old").mkdir(parents=True)
        os.symlink("../archive/2026-11-05-old", self.root / "context/changes/old")
        self.refused(config_with(change_dir="context/changes/old", viewer="context/changes/old/references/v.html"),
                     "resolves under context/archive/")

    def test_paths_must_be_repo_relative_and_normalized(self):
        for field, value in (("change_dir", "/abs/context/changes/x"), ("change_dir", "context/changes/../x"),
                             ("series", "C:\\series.json"), ("series", "./s.json"), ("series", ""),
                             ("viewer", None), ("private_root", "test-photos//private/x")):
            with self.subTest(field=field, value=value):
                self.refused(config_with(**{field: value}), field)

    def test_the_viewer_sits_in_the_changes_references(self):
        self.refused(config_with(viewer="context/changes/gpt26-screen-fixture/v.html"), "directly under")
        self.refused(config_with(viewer="scripts/gpt26/tests/fixtures/compare-gpt26.html"), "directly under")

    def test_the_private_root_is_its_own_under_test_photos_private(self):
        for value in ("test-photos/private/s19", "test-photos/private/s20", "test-photos/other/x",
                      "test-photos/private", "test-photos/private/a/b", "test-photos/private/Upper"):
            with self.subTest(value=value):
                self.refused(config_with(private_root=value), "private_root")
        os.symlink("s19", self.root / "test-photos/private/alias")
        self.refused(config_with(private_root="test-photos/private/alias"), "resolves into test-photos/private/s19/")
        os.symlink(str(self.root), self.root / "test-photos/private/escape")
        self.refused(config_with(private_root="test-photos/private/escape"), "resolves outside test-photos/private/")

    def test_the_study_object_and_the_expected_slots_are_strict(self):
        self.refused({"gate": SCREEN["gate"]}, "has no study object")
        self.refused(dict(SCREEN, study=dict(SCREEN["study"], extra=1)), "expected exactly")
        bad = copy.deepcopy(SCREEN)
        bad["gate"]["expected_slots"].append(dict(bad["gate"]["expected_slots"][0]))
        self.refused(bad, "lists a slot twice")
        for slots in ([], None, [{"photo": "S17-03", "slot": True}], [{"photo": "", "slot": 1}]):
            with self.subTest(slots=slots):
                bad = copy.deepcopy(SCREEN)
                bad["gate"]["expected_slots"] = slots
                self.refused(bad, "expected_slots")
        self.refused(config_with(series_id="Bad id"), "series_id")

    def test_the_config_must_be_inside_the_checkout(self):
        with self.assertRaises(study_mod.StudyError):
            study_mod.config_rel(self.root, "/etc/passwd")
        with self.assertRaises(study_mod.StudyError):
            study_mod.config_rel(self.root, "../outside.json")
        self.assertEqual(study_mod.config_rel(self.root, self.root / "scripts/c.json"), "scripts/c.json")

    def test_two_studies_have_distinct_private_roots(self):
        screen = study_mod.from_config(self.root, "a.json", SCREEN)
        wide = study_mod.from_config(self.root, "b.json", config_with(**WIDE_STUDY))
        a, b = run.study_paths(self.root, screen), run.study_paths(self.root, wide)
        self.assertNotEqual(a.private, b.private)
        self.assertEqual((a.inputs, a.local), (b.inputs, b.local))  # S-19's inputs and Local stay shared
        self.assertNotEqual(screen.seal_rel, wide.seal_rel)


class UsageTest(test_run.Screen):
    """Every study CLI: --config is required (exit 2), and an archived study is refused."""

    def call(self, tool, args: list[str]) -> tuple[int, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                if tool is pointers:
                    code = tool.main([*args, "--root", str(self.repo)])
                elif tool is run:
                    code = tool.main(args, root=self.repo, sleep=lambda s: None)
                else:
                    code = tool.main(args, root=self.repo)
            except SystemExit as e:
                code = e.code
        return code, out.getvalue() + err.getvalue()

    def test_a_missing_config_is_a_usage_error(self):
        for tool, args in ((run, ["--cap", "1.50"]), (check_series, []), (blind, ["--set", "t1"]),
                           (gate, ["--set", "t1"]), (pointers, [])):
            with self.subTest(tool=tool.__name__):
                code, text = self.call(tool, args)
                self.assertEqual(code, 2, text)
                self.assertIn("--config", text)
        self.assertEqual(self.rows(), [])
        self.assertFalse(self.private.exists())

    def test_an_archived_study_is_refused_before_anything_is_written(self):
        archived = "context/archive/2026-11-05-gpt26-screen-fixture"
        (self.repo / archived).mkdir(parents=True)
        os.symlink(f"../archive/2026-11-05-gpt26-screen-fixture", self.repo / "context/changes/gpt26-gone")
        config = json.loads((self.repo / self.CONFIG).read_text())
        config["study"].update(change_dir="context/changes/gpt26-gone",
                               viewer="context/changes/gpt26-gone/references/compare-gpt26.html")
        self.write("archived-config.json", json.dumps(config))
        self.approve()
        for tool, args, needle in ((run, ["--cap", "1.50"], "resolves under context/archive/"),
                                   (check_series, [], "REFUSED"),
                                   (blind, ["--set", "t1"], "set: study invalid"),
                                   (gate, ["--set", "t1"], "set: study invalid"),
                                   (pointers, [], "the study is not valid")):
            with self.subTest(tool=tool.__name__):
                fake = test_run.Fake()
                with mock.patch.object(test_run.runner, "call_provider", fake):
                    code, text = self.call(tool, ["--config", "archived-config.json", *args])
                self.assertEqual(code, 2 if tool is pointers else 1, text)
                self.assertIn(needle, text)
                self.assertEqual(fake.calls, [])
        self.assertEqual(self.rows(), [])
        self.assertFalse(self.private.exists())
        self.assertEqual(list((self.repo / archived).iterdir()), [])


class WideStudy(test_run.Screen):
    """A generated 16-slot study beside the screen-shaped fixture, in one repository."""

    CONFIG = WIDE_CONFIG

    def register(self) -> None:
        screen = study_mod.load(ROOT, test_run.CONFIG)[0]
        for rel in screen.registration_files:  # the screen-shaped fixture study lives here too
            (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / rel, self.repo / rel)
        (self.repo / screen.viewer).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(test_run.VIEWER_FIXTURE, self.repo / screen.viewer)
        config = copy.deepcopy(SCREEN)
        config["name"] = "gpt26-wide-fixture"
        config["study"] = dict(WIDE_STUDY)
        config["gate"].update(id="gpt26-wide-fixture-v1", denominator=16, min_tie_pairs=8, cap_usd=3.50,
                              expected_slots=[{"photo": p, "slot": n} for p in WIDE_PHOTOS for n in (1, 2)])
        raw = (json.dumps(config, indent=2, ensure_ascii=False) + "\n").encode()
        self.write(WIDE_CONFIG, raw.decode())
        sha = hashlib.sha256(raw).hexdigest()
        phase5 = {(s["photo"], s["slot"]): s for s in json.loads((ROOT / check_series.PHASE5_SERIES).read_text())["slots"]}
        slots = []
        for p in WIDE_PHOTOS:
            src = phase5[(p, 1)]
            for n in (1, 2):
                slots.append({"config_sha256": sha, "config_name": config["name"], "kind": "gpt", "photo": p,
                              "slot": n, "role": "screen", "input": src["input"], "input_sha256": src["input_sha256"],
                              "input_dimensions": src["input_dimensions"], "request_size": src["request_size"],
                              "cost_bound_usd": check_series.cost_bound(config, tuple(src["request_size"])),
                              "requires": []})
        series = json.loads((ROOT / screen.series).read_text())
        series.update(series_id=WIDE_STUDY["series_id"], slots=slots,
                      configs={sha: {"path": WIDE_CONFIG, "name": config["name"], "kind": "gpt", "role": "screen"}})
        self.write(WIDE_SERIES, json.dumps(series, indent=2) + "\n")
        viewer = test_run.VIEWER_FIXTURE.read_text()
        self.write(WIDE_STUDY["viewer"], viewer.replace('"../../../../test-photos/private/gpt26/"',
                                                        '"../../../../test-photos/private/gpt26-wide-fixture/"'))

    def test_sixteen_slots_check_run_and_reconcile_with_denominator_16(self):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = check_series.main(["--config", WIDE_CONFIG], root=self.repo)
        self.assertEqual(code, 0, err.getvalue())
        self.assertIn("registers 16 slots", out.getvalue())
        self.assertIn("first-attempt bounds total $3.24 within the registered cap $3.50", out.getvalue())

        self.approve("3.50")
        code, out, err = self.main("--cap", "3.50")
        self.assertEqual(code, 0, out + err)
        st = self.session(3.5).reconcile()
        self.assertEqual((st.status, len(st.slots)), ("complete", 16))
        self.assertEqual({s.status for s in st.slots.values()}, {"delivered"})
        self.assertIn("16 delivered", out)
        self.assertEqual(self.private, self.repo / "test-photos/private/gpt26-wide-fixture")
        self.assertEqual(len(self.reserves()), 16)
        # The other study's private root in the same checkout is untouched.
        self.assertFalse((self.repo / "test-photos/private/gpt26").exists())

    def test_fifteen_delivered_keep_the_denominator_16(self):
        self.approve("3.50")
        code, out, err = self.main("--cap", "3.50", fake=test_run.Fake({"S17-21": ["moderation", "moderation"]}))
        self.assertEqual(code, 0, out + err)
        st = self.session(3.5).reconcile()
        self.assertEqual(len(st.slots), 16)
        self.assertEqual(sum(s.status == "delivered" for s in st.slots.values()), 15)
        self.assertEqual(st.slots[("S17-21", 1)].status, "undelivered")

    def test_a_short_series_blocks_against_the_registered_denominator(self):
        session = self.session(3.5)
        series = copy.deepcopy(session.series)
        series["slots"] = series["slots"][:15]
        st = test_run.state.reconcile(series, session.config, session.config_sha, [], None, root=self.repo,
                                      study=self.study)
        self.assertEqual(st.status, "BLOCKED")
        self.assertIn("denominator is always 16", " ".join(st.errors))


if __name__ == "__main__":
    unittest.main()
