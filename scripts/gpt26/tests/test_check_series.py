"""Offline CLI regressions for a study's registration: dimensions, cost bounds, the gate block,
the viewer's base and the study descriptor. Runs the checker as a subprocess on a copied tree."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CHECKER = "scripts/gpt26/check_series.py"
STUDY_PY = "scripts/gpt26/study.py"
SERIES = "scripts/gpt26/tests/fixtures/screen-series.json"
CONFIG = "scripts/gpt26/tests/fixtures/screen-config.json"
VIEWER_FIXTURE = "scripts/gpt26/tests/fixtures/compare-gpt26.html"
VIEWER = "context/changes/gpt26-screen-fixture/references/compare-gpt26.html"


class CheckSeriesTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        for rel in (
            CHECKER,
            STUDY_PY,
            SERIES,
            CONFIG,
            "scripts/s19/configs/phase5-gpt.json",
            "scripts/s19/series/phase5.json",
        ):
            target = self.root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / rel, target)
        (self.root / VIEWER).parent.mkdir(parents=True)
        shutil.copyfile(ROOT / VIEWER_FIXTURE, self.root / VIEWER)
        self.series = json.loads((self.root / SERIES).read_text(encoding="utf-8"))
        self.config = json.loads((self.root / CONFIG).read_text(encoding="utf-8"))

    def write_config(self, config):
        raw = json.dumps(config).encode("utf-8")
        (self.root / CONFIG).write_bytes(raw)
        sha = hashlib.sha256(raw).hexdigest()
        self.series["configs"] = {sha: next(iter(self.series["configs"].values()))}
        for slot in self.series["slots"]:
            slot["config_sha256"] = sha

    def assert_config_refused(self, field):
        result = self.run_checker()
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn(field, result.stderr)
        self.assertIn("not checked", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def run_checker(self, *args):
        (self.root / SERIES).write_text(json.dumps(self.series), encoding="utf-8")
        return subprocess.run(
            [sys.executable, "-B", str(self.root / CHECKER), *(args or ("--config", CONFIG))],
            cwd=self.root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )

    def test_registered_bounds_pass(self):
        result = self.run_checker()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("registers 6 slots", result.stdout)
        self.assertIn("first-attempt bounds total $1.20 within the registered cap $1.50", result.stdout)

    def test_missing_config_is_a_usage_error(self):
        result = subprocess.run([sys.executable, "-B", str(self.root / CHECKER)], cwd=self.root,
                                capture_output=True, text=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 2, result.stdout)
        self.assertIn("--config", result.stderr)

    def assert_refused(self, *needles):
        result = self.run_checker()
        self.assertEqual(result.returncode, 1, result.stdout)
        for needle in needles:
            self.assertIn(needle, result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_first_attempt_sum_above_the_cap_fails(self):
        config = copy.deepcopy(self.config)
        config["gate"]["cap_usd"] = 1.19
        self.write_config(config)
        self.assert_refused("first-attempt bounds total $1.20, above the registered gate.cap_usd $1.19")
        for bad in (None, 0, -1, True, "1.50", float("inf")):
            with self.subTest(cap=bad):
                config["gate"]["cap_usd"] = bad
                self.write_config(config)
                self.assert_refused("gate.cap_usd")

    def test_config_name_must_be_a_single_output_directory(self):
        config = copy.deepcopy(self.config)
        config["name"] = "nested/output"
        self.write_config(config)
        for slot in self.series["slots"]:
            slot["config_name"] = config["name"]
        self.assert_refused("name must be a single output directory name")

    def test_gate_values_come_from_the_config_and_must_agree(self):
        cases = {
            "denominator differs from the slots": (("denominator", 5), "gate.denominator is 5"),
            "tie minimum above the denominator": (("min_tie_pairs", 7), "gate.min_tie_pairs is 7"),
            "tie minimum zero": (("min_tie_pairs", 0), "gate.min_tie_pairs is 0"),
            "a changed level scale": (("fidelity_levels", ["none", "severe"]), "gate.fidelity_levels"),
        }
        for name, ((field, value), needle) in cases.items():
            with self.subTest(name):
                config = copy.deepcopy(self.config)
                config["gate"][field] = value
                self.write_config(config)
                self.assert_refused(needle)

    def test_the_series_must_register_exactly_the_expected_slots(self):
        config = copy.deepcopy(self.config)
        config["gate"]["expected_slots"] = config["gate"]["expected_slots"][:5]
        config["gate"]["denominator"] = 5
        self.write_config(config)
        self.assert_refused("6 slot(s), expected exactly 5", "slot S17-07/2 is not one of the config's gate.expected_slots")

    def test_series_id_must_be_the_studys(self):
        self.series["series_id"] = "gpt26-other"
        self.assert_refused("series_id is 'gpt26-other', the study registers 'gpt26-screen'")

    def test_viewer_base_must_be_the_private_root(self):
        viewer = self.root / VIEWER
        text = viewer.read_text(encoding="utf-8")
        viewer.write_text(text.replace("test-photos/private/gpt26/", "test-photos/private/s20/"), encoding="utf-8")
        self.assert_refused("resolves to 'test-photos/private/s20', not the study's private_root "
                            "'test-photos/private/gpt26'")
        viewer.write_text(text + text, encoding="utf-8")
        self.assert_refused("2 manifest base lines")
        viewer.unlink()
        self.assert_refused("cannot read the study's viewer")

    def test_an_archived_change_dir_is_refused(self):
        archived = self.root / "context/archive/2026-11-05-gpt26-screen-fixture"
        archived.mkdir(parents=True)
        os.symlink("../archive/2026-11-05-gpt26-screen-fixture", self.root / "context/changes/gpt26-old")
        for change_dir, needle in (("context/archive/2026-11-05-gpt26-screen-fixture", "must be context/changes/"),
                                   ("context/changes/gpt26-old", "resolves under context/archive/")):
            with self.subTest(change_dir=change_dir):
                config = copy.deepcopy(self.config)
                config["study"]["change_dir"] = change_dir
                config["study"]["viewer"] = f"{change_dir}/references/compare-gpt26.html"
                self.write_config(config)
                result = self.run_checker()
                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertIn("check_series: REFUSED", result.stderr)
                self.assertIn(needle, result.stderr)

    def test_integer_dimensions_do_not_bypass_understated_bound(self):
        self.series["slots"][0]["cost_bound_usd"] = 0.01
        result = self.run_checker()
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn("slot S17-03/1: cost_bound_usd is 0.01, the config gives 0.2", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_float_source_dimensions_cannot_hide_understated_bound(self):
        slot = self.series["slots"][0]
        slot["input_dimensions"] = [3840.0, 2560.0]
        slot["cost_bound_usd"] = 0.01
        result = self.run_checker()
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn("slot S17-03/1: input_dimensions must be two positive integers", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_invalid_dimensions_have_slot_specific_diagnostics(self):
        slot = self.series["slots"][0]
        for field in ("input_dimensions", "request_size"):
            original = slot[field]
            invalid = (
                [float(original[0]), float(original[1])],
                [str(original[0]), original[1]],
                [True, original[1]],
                [0, original[1]],
                [-1, original[1]],
                [original[0]],
                None,
            )
            for dims in invalid:
                with self.subTest(field=field, dimensions=dims):
                    slot[field] = dims
                    result = self.run_checker()
                    self.assertEqual(result.returncode, 1, result.stdout)
                    self.assertIn(f"slot S17-03/1: {field} must be two positive integers", result.stderr)
                    self.assertNotIn("Traceback", result.stderr)
            slot[field] = original

    def test_missing_cost_fields_have_diagnostics(self):
        for field in self.config["cost_bound"]:
            if not isinstance(self.config["cost_bound"][field], (int, float)):
                continue
            with self.subTest(field=field):
                config = copy.deepcopy(self.config)
                del config["cost_bound"][field]
                self.write_config(config)
                self.assert_config_refused(f"cost_bound.{field}")

    def test_invalid_cost_fields_have_diagnostics(self):
        for value in ("0.01", None, True, -1, float("inf"), float("nan")):
            with self.subTest(value=value):
                config = copy.deepcopy(self.config)
                config["cost_bound"]["rounding_usd"] = value
                self.write_config(config)
                self.assert_config_refused("cost_bound.rounding_usd")

    def test_invalid_size_rule_fields_have_diagnostics(self):
        for field in ("multiple", "max_pixels", "min_pixels", "max_edge", "max_aspect"):
            for value in ("16", None, True, 0, -1, float("inf"), float("nan")):
                with self.subTest(field=field, value=value):
                    config = copy.deepcopy(self.config)
                    config["size_rule"][field] = value
                    self.write_config(config)
                    self.assert_config_refused(f"size_rule.{field}")
        for field in ("multiple", "max_pixels", "min_pixels", "max_edge"):
            with self.subTest(field=field, shape="float"):
                config = copy.deepcopy(self.config)
                config["size_rule"][field] = float(config["size_rule"][field])
                self.write_config(config)
                self.assert_config_refused(f"size_rule.{field}")
            with self.subTest(field=field, shape="missing"):
                config = copy.deepcopy(self.config)
                del config["size_rule"][field]
                self.write_config(config)
                self.assert_config_refused(f"size_rule.{field}")

    def test_missing_or_invalid_calculation_blocks_have_diagnostics(self):
        for block in ("size_rule", "cost_bound"):
            for value in (None, [], "invalid"):
                with self.subTest(block=block, value=value):
                    config = copy.deepcopy(self.config)
                    config[block] = value
                    self.write_config(config)
                    self.assert_config_refused(block)


if __name__ == "__main__":
    unittest.main()
