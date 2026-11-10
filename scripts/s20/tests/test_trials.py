"""S-20 step 1, plan Phase 8: the trial seam (`trials.py`) with 1a kept literal.

1a's committed seals, freeze, gate report and audit bundle re-derive only while every literal they
depend on stays as it is, so the 1a row is pinned here field by field (impl of plan review F20),
and against the committed 1a evidence where that evidence carries it. The rule-file list grows by
a trial's grid and calibration record only once they exist (F17, F18, F27).
"""

from __future__ import annotations

import dataclasses
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

S20 = Path(__file__).resolve().parents[1]
ROOT = S20.parents[1]
sys.path.insert(0, str(S20))

import blind  # noqa: E402
import common  # noqa: E402
import evidence  # noqa: E402
import gate  # noqa: E402
import pilot  # noqa: E402
import pointers  # noqa: E402
from protocol import Refused  # noqa: E402
from trials import TRIALS  # noqa: E402

EVAL = "context/changes/cloud-classical-denoise/evaluations"
ONE_A = {
    "name": "1a",
    "title": "S-20 step 1a",
    "pilot_seal": f"{EVAL}/pilot-sealed.md",
    "pilot_ratings": f"{EVAL}/pilot-ratings.json",
    "pilot_result": f"{EVAL}/pilot-result.json",
    "pilot_stop": None,
    "gate_seal": f"{EVAL}/gate-sealed.md",
    "gate_ratings": f"{EVAL}/gate-ratings.json",
    "gate_json": f"{EVAL}/step1-gate.json",
    "gate_md": f"{EVAL}/step1-gate.md",
    "audit_dir": f"{EVAL}/step1-audit",
    "frozen": "scripts/s20/configs/nlm-frozen.json",
    "grid": "scripts/s20/configs/nlm-grid.json",
    "calibration": f"{EVAL}/step1-calibration.md",
    "raw_dir": "nlm",
    "arm": "nlm-gamma",
    "source_kind": "nlm",
    "record_key": "nlm_record",
    "record_sha_key": "nlm_record_sha256",
    "bind_trial": None,
    "bind_fields": ("implementation_sha256", "config_sha256", "opencv_version"),
    "prefix": "nlm",
    "label": "NLM",
    "decided": "pilot.py: plan § Definitions 'Pilot vote' (owner decision 2026-11-05, change.md § Owner decisions "
               "(2026-11-05) item 5): most votes wins, a tie goes to the weaker k, 'none' counts for no strength",
    "pointer": "evaluations/step1-gate.md",
    "stop_pointer": None,
}
STEP1B = f"{EVAL}/step1b"
ONE_B = {
    "name": "1b",
    "title": "S-20 step 1b",
    "pilot_seal": f"{STEP1B}/pilot-sealed.md",
    "pilot_ratings": f"{STEP1B}/pilot-ratings.json",
    "pilot_result": f"{STEP1B}/pilot-result.json",
    "pilot_stop": f"{STEP1B}/pilot-stop.md",
    "gate_seal": f"{STEP1B}/gate-sealed.md",
    "gate_ratings": f"{STEP1B}/gate-ratings.json",
    "gate_json": f"{STEP1B}/gate.json",
    "gate_md": f"{STEP1B}/gate.md",
    "audit_dir": f"{STEP1B}/audit",
    "frozen": "scripts/s20/configs/wavelet-frozen.json",
    "grid": "scripts/s20/configs/wavelet-grid.json",
    "calibration": f"{STEP1B}/calibration.md",
    "raw_dir": "wavelet",
    "arm": "wavelet-gamma",
    "source_kind": "wavelet",
    "record_key": "wavelet_record",
    "record_sha_key": "wavelet_record_sha256",
    "bind_trial": "1b",
    "bind_fields": ("implementation_sha256", "config_sha256", "skimage_version", "pywt_version", "numpy_version"),
    "prefix": "wavelet",
    "label": "wavelet",
    "pointer": "evaluations/step1b/gate.md",
    "stop_pointer": "evaluations/step1b/pilot-stop.md",
}
# The 1a files besides the tools that every 1a tool has always checked (order step 2).
ONE_A_FIXED = ["scripts/s20/configs/nlm-grid.json", "scripts/s19/local-arms.ts", "scripts/s19/s19.ts",
               f"{EVAL}/step1-calibration.md"]


class OneARowTest(unittest.TestCase):
    def test_1a_defaults_are_literal(self):
        self.assertEqual(dataclasses.asdict(TRIALS["1a"]), ONE_A)

    def test_the_module_names_that_predate_the_seam_are_the_1a_row(self):
        t = TRIALS["1a"]
        self.assertEqual((common.PILOT_SEAL, common.PILOT_RATINGS, common.PILOT_RESULT, common.GATE_SEAL,
                          common.GATE_RATINGS, common.GATE_JSON, common.GATE_MD, common.AUDIT_DIR, common.FROZEN),
                         (t.pilot_seal, t.pilot_ratings, t.pilot_result, t.gate_seal, t.gate_ratings, t.gate_json,
                          t.gate_md, t.audit_dir, t.frozen))
        self.assertEqual(blind.BIND_FIELDS, ONE_A["bind_fields"])
        self.assertEqual(blind.FROZEN_REL, ONE_A["frozen"])
        self.assertEqual(pilot.DECIDED, ONE_A["decided"])
        self.assertEqual(pointers.LINK, ONE_A["pointer"])
        self.assertEqual(t.flag, "", "a printed 1a command carries no --trial")

    def test_the_committed_1a_evidence_carries_these_literals(self):
        """The bytes the 1a audit compares: the freeze's `decided`, the report keys, the reason."""
        freeze = json.loads((ROOT / ONE_A["frozen"]).read_text())
        self.assertEqual(freeze["decided"], ONE_A["decided"])
        self.assertEqual(json.loads((ROOT / ONE_A["pilot_result"]).read_text())["rule"], ONE_A["decided"])
        report = json.loads((ROOT / ONE_A["gate_json"]).read_text())
        photo = next(iter(report["photos"].values()))
        self.assertIn("worst_nlm_fidelity", photo)
        self.assertLessEqual({"nlm_fidelity", "nlm_side", "nlm_crops", "nlm_reason"}, set(photo["control-full"]))
        self.assertTrue(any(r.startswith("significant or severe NLM fidelity loss on ") for r in report["reasons"]))
        cal = (ROOT / ONE_A["calibration"]).read_text()
        bind = next(ln for ln in cal.splitlines() if ln.startswith("S20-CALIBRATION "))
        self.assertNotIn("trial=", bind, "1a's bind line names no trial (F24)")
        self.assertEqual({kv.split("=")[0] for kv in bind.split()[1:]}, {"result", *ONE_A["bind_fields"]})

    def test_the_report_wording_follows_the_row(self):
        """decide() on one synthetic pair per comparison: 1a's keys and reason, 1b's in its place."""
        rows = {"p01": {"quality": "A-clear", "fidelity": {"A": {"level": "severe", "crops": [], "reason": "r"},
                                                           "B": {"level": "none", "crops": [], "reason": ""}}},
                "p02": {"quality": "tie", "fidelity": {"A": {"level": "none", "crops": [], "reason": ""},
                                                       "B": {"level": "none", "crops": [], "reason": ""}}}}
        pairs = {"p01": {"photo": "T", "comparison": "control-full", "nlm": "A", "ref": "B"},
                 "p02": {"photo": "T", "comparison": "local", "nlm": "A", "ref": "B"}}
        for name, x, label in (("1a", "nlm", "NLM"), ("1b", "wavelet", "wavelet")):
            with self.subTest(trial=name):
                r = gate.decide({}, pairs, rows, TRIALS[name])
                d = r["photos"]["T"]
                self.assertEqual(d["control-full"]["quality"], f"{x}-clear")
                self.assertEqual(d[f"worst_{x}_fidelity"], "severe")
                self.assertTrue(d["win"])
                self.assertIn(f"significant or severe {label} fidelity loss on T", r["reasons"])
                self.assertEqual(set(d["control-full"]) - {"pair", "quality", "reference_fidelity", "reference_crops",
                                                            "reference_reason"},
                                 {f"{x}_fidelity", f"{x}_side", f"{x}_crops", f"{x}_reason"})

    def test_seal_headings(self):
        self.assertTrue(evidence.seal_text("pilot", "s", "0" * 64, "1" * 64).startswith("# S-20 step 1a — pilot seal\n"))
        self.assertTrue(evidence.seal_text("gate", "s", "0" * 64, "1" * 64, "1b").startswith("# S-20 step 1b — gate seal\n"))


class OneBRowTest(unittest.TestCase):
    def test_1b_row(self):
        row = dataclasses.asdict(TRIALS["1b"])
        decided = row.pop("decided")
        self.assertEqual(row, ONE_B)
        self.assertIn("most votes wins, a tie goes to the weaker k, 'none' counts for no strength", decided)
        self.assertNotEqual(decided, ONE_A["decided"])
        self.assertEqual(TRIALS["1b"].flag, " --trial 1b")

    def test_no_1b_path_is_a_1a_path(self):
        paths = lambda t: {v for k, v in dataclasses.asdict(t).items() if isinstance(v, str) and "/" in v}  # noqa: E731
        self.assertEqual(paths(TRIALS["1a"]) & paths(TRIALS["1b"]), set())
        for p in paths(TRIALS["1b"]):
            if p.startswith(EVAL):
                self.assertTrue(p.startswith(STEP1B + "/"), p)


class RuleFilesTest(unittest.TestCase):
    """F17, F18, F27: the frozen nlm.py's names stay; a trial's grid and calibration join the rule
    files only once they exist on disk or in the index."""

    def test_nlm_imports_and_reads_the_1a_names(self):
        import nlm  # noqa: F401  (frozen: nlm.py:98,221,536,545 read these three names)

        self.assertEqual(evidence.GRID_REL, "scripts/s20/configs/nlm-grid.json")
        self.assertEqual(evidence.CALIBRATION_REL, f"{EVAL}/step1-calibration.md")
        self.assertTrue(callable(evidence.rule_files))

    def test_the_checkouts_rule_files_hold_1a_and_a_1b_file_only_when_it_exists(self):
        found = evidence.rule_files(ROOT)
        self.assertLessEqual(set(ONE_A_FIXED), set(found))
        self.assertIn("scripts/s20/trials.py", found)
        tracked = set(subprocess.run(["git", "-C", str(ROOT), "ls-files", "--", ONE_B["grid"], ONE_B["calibration"]],
                                     capture_output=True, text=True, check=True).stdout.split())
        for rel in (ONE_B["grid"], ONE_B["calibration"]):
            with self.subTest(path=rel):
                self.assertEqual(rel in found, (ROOT / rel).exists() or rel in tracked)

    def git(self, repo: Path, *args: str) -> str:
        return subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                               "-c", "commit.gpgsign=false", *args], capture_output=True, text=True, check=True).stdout

    def refusal(self, repo: Path) -> str:
        with self.assertRaises(Refused) as cm:
            evidence.require_committed_clean(evidence.rule_files(repo), repo, purpose="test")
        return str(cm.exception)

    def test_a_trial_rule_file_is_no_offence_until_it_exists_and_then_must_be_committed(self):
        repo = Path(tempfile.mkdtemp(prefix="s20-trials-"))
        self.addCleanup(shutil.rmtree, repo, True)
        rules = [rel for rel in evidence.rule_files(ROOT) if (ROOT / rel).exists() and rel not in (
            ONE_B["grid"], ONE_B["calibration"])]
        for rel in rules:
            (repo / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / rel, repo / rel)
        self.git(repo, "init", "-q")
        self.git(repo, "add", "--", *rules)
        self.git(repo, "commit", "-q", "-m", "rules")
        grid = repo / ONE_B["grid"]
        self.assertNotIn(ONE_B["grid"], evidence.rule_files(repo), "absent: not a rule file yet")
        evidence.require_committed_clean(evidence.rule_files(repo), repo, purpose="test")  # 1a tools still run

        grid.write_text('{"k": [1.0, 1.5, 2.0]}\n')
        self.assertIn(ONE_B["grid"], evidence.rule_files(repo))
        self.assertIn(f"{ONE_B['grid']}: untracked", self.refusal(repo))
        self.git(repo, "add", "--", ONE_B["grid"])
        self.assertIn(f"{ONE_B['grid']}: added (staged)", self.refusal(repo))
        self.git(repo, "commit", "-q", "-m", "1b grid")
        evidence.require_committed_clean(evidence.rule_files(repo), repo, purpose="test")
        grid.write_text('{"k": [1.0]}\n')
        self.assertIn(f"{ONE_B['grid']}: modified (unstaged)", self.refusal(repo))
        grid.unlink()
        self.assertIn(ONE_B["grid"], evidence.rule_files(repo), "a tracked file deleted on disk is still listed")
        self.assertIn(f"{ONE_B['grid']}: deleted (unstaged)", self.refusal(repo))

    def test_present_lists_disk_or_index_in_order(self):
        repo = Path(tempfile.mkdtemp(prefix="s20-present-"))
        self.addCleanup(shutil.rmtree, repo, True)
        self.git(repo, "init", "-q")
        (repo / "b").write_text("b")
        (repo / "a").write_text("a")
        self.git(repo, "add", "a")
        self.git(repo, "commit", "-q", "-m", "a")
        (repo / "a").unlink()
        self.assertEqual(evidence.present(["c", "b", "a"], repo), ["b", "a"])


class UsageTest(unittest.TestCase):
    def test_an_unknown_trial_is_a_usage_error_in_every_cli(self):
        for argv in (["blind.py", "pilot", "--set", "s1"], ["pilot.py", "--set", "s1", "--export", "x"],
                     ["gate.py", "--audit", "x"], ["gate.py", "--set", "s1", "--export", "x"], ["pointers.py"]):
            with self.subTest(tool=argv[0]):
                r = subprocess.run([sys.executable, "-B", str(S20 / argv[0]), *argv[1:], "--trial", "1c"],
                                   capture_output=True, text=True)
                self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
                self.assertIn("unknown trial '1c'", r.stderr)
                self.assertNotIn("Traceback", r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
