"""Offline CLI regressions for registration dimensions and cost verification."""

from __future__ import annotations

import copy
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CHECKER = "scripts/gpt26/check_series.py"
SERIES = "scripts/gpt26/series/screen.json"
CONFIG = "scripts/gpt26/configs/gpt26-low.json"


class CheckSeriesTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        for rel in (
            CHECKER,
            SERIES,
            CONFIG,
            "scripts/s19/configs/phase5-gpt.json",
            "scripts/s19/series/phase5.json",
        ):
            target = self.root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / rel, target)
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

    def run_checker(self):
        (self.root / SERIES).write_text(json.dumps(self.series), encoding="utf-8")
        return subprocess.run(
            [sys.executable, "-B", str(self.root / CHECKER)],
            cwd=self.root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )

    def test_registered_bounds_pass(self):
        result = self.run_checker()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("first-attempt bounds total $1.20", result.stdout)

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
