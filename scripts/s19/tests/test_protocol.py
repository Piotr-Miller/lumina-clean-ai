"""protocol.py and every S-19 CLI: the holdout stays closed until a positive, matching release.

The synthetic validation photos are generated images. To prove a refusal happens BEFORE any
read, the refusal tests delete the validation files first: a tool that tried to read one would
fail with a file error instead of the access refusal the tests require.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fixtures import World, load, sha

protocol = load("protocol")

REFUSAL = "validation photo"


class Holdout(World):
    def setUp(self):
        super().setUp()
        self.prepare("T-01")
        for v in self.validation:
            (self.photos / f"{v}.jpg").unlink()  # any read attempt would now be a file error

    def assert_refused(self, r):
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn(REFUSAL, r.stdout + r.stderr)
        self.assertNotIn("No such file", r.stdout + r.stderr)

    def test_every_cli_refuses_a_validation_id_before_reading(self):
        cfg = self.make_config()
        series = self.make_series([(cfg, "core", ["T-01"], 1)])
        self.assert_refused(self.run_cli("protocol", "check-access", "--ids", "V-01"))
        self.assert_refused(self.run_cli("inputs", "V-01"))
        self.assert_refused(self.run_cli("run-candidate", "--config", str(cfg), "--phase", "3", "--series",
                                         str(series), "--cap", "3", "--dry-run", "V-01"))
        spec = self.tmp / "spec.json"
        spec.write_text(json.dumps({"series_id": "x", "split": "tuning", "photos": [
            {"id": "V-01", "original": str(self.photos / "V-01.jpg"), "arms": [], "pairs": []}]}))
        self.assert_refused(self.run_cli("viewer-inputs", str(spec)))
        self.assert_refused(self.run_cli("local-arms", "local-equiv", "V-01", tsx=True))
        self.assert_refused(self.run_cli("baseline", "--check-auto", "V-01", tsx=True))

    def test_every_cli_refuses_flag_and_matching_release_without_consent(self):
        # implementation review F10: the hardest refusal, a validation flag plus a release whose
        # config and manifest hashes match, with no owner approval, run through every CLI
        cfg = self.make_config()
        series = self.make_series([(cfg, "core", ["T-01"], 1)])
        release = self.private / "validation-access.json"
        release.parent.mkdir(parents=True, exist_ok=True)
        release.write_text(json.dumps({"phase": 7, "run_id": "val-1", "config_sha256": sha(cfg),
                                       "manifest_sha256": sha(self.manifest), "series_sha256": "0" * 64,
                                       "vendor": "openai", "terms": "t", "created_at": "x"}))
        flags = ("--validation", "--access", str(release), "--config", str(cfg))
        spec = self.tmp / "spec-v.json"
        spec.write_text(json.dumps({"series_id": "x", "split": "validation", "photos": [
            {"id": "V-01", "original": str(self.photos / "V-01.jpg"), "arms": [], "pairs": []}]}))
        runs = {
            "inputs": self.run_cli("inputs", *flags, "V-01"),
            "run-candidate": self.run_cli("run-candidate", "--phase", "7", "--series", str(series), "--cap", "5",
                                          "--dry-run", *flags, "V-01"),
            "viewer-inputs": self.run_cli("viewer-inputs", str(spec), *flags),
            "local-arms": self.run_cli("local-arms", "local-equiv", "V-01", *flags, tsx=True),
            "baseline": self.run_cli("baseline", "--check-auto", "V-01", *flags, tsx=True),
        }
        for cli, r in runs.items():
            with self.subTest(cli=cli):
                self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
                self.assertIn("no S19-VALIDATION record", r.stdout + r.stderr)
                self.assertNotIn("No such file", r.stdout + r.stderr)

    def test_tuning_tools_refuse_holdout_paths_behind_tuning_ids(self):
        # implementation review F7: the id guard checks the claim, this checks what paths reach
        t01 = self.entries[0]["path"]
        held_run = self.private / "runs" / "gpt" / "V-02" / "1" / "out.png"

        def spec(original=t01, arm_path=None):
            path = self.tmp / "spec.json"
            arms = [{"arm_id": "a", "kind": "candidate", "path": arm_path}] if arm_path else []
            path.write_text(json.dumps({"series_id": "x", "split": "tuning", "photos": [
                {"id": "T-01", "original": original, "arms": arms, "pairs": []}]}))
            return str(path)

        r = self.run_cli("viewer-inputs", spec(original=str(self.photos / "V-01.jpg")))
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("is not this photo's manifest file", r.stderr)
        for arm_path, why in ((str(self.photos / "V-01.jpg"), "is a validation photo"),
                              (str(held_run), "is named after validation photo V-02"),
                              (str(self.private / "validation-local" / "x.jpg"), "is inside validation-local/")):
            with self.subTest(why=why):
                r = self.run_cli("viewer-inputs", spec(arm_path=arm_path))
                self.assertEqual(r.returncode, 1, r.stdout)
                self.assertIn(why, r.stderr)
                self.assertNotIn("No such file", r.stderr)
        r = self.run_cli("local-arms", "nafnet-gamma", "T-01", "--source", str(held_run), tsx=True)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("is named after validation photo V-02", r.stdout + r.stderr)

    def test_all_means_tuning_and_all_validation_needs_a_release(self):
        r = self.run_cli("protocol", "check-access", "--all")
        self.assertEqual(json.loads(r.stdout)["allowed"], list(self.tuning))
        r = self.run_cli("protocol", "check-access", "--all-validation")
        self.assertEqual(r.returncode, 1)
        self.assertIn("--all-validation needs --validation", r.stderr)

    def test_flag_and_matching_hashes_without_consent_still_refuse(self):
        cfg = self.make_config()
        release = self.private / "validation-access.json"
        release.parent.mkdir(parents=True, exist_ok=True)
        release.write_text(json.dumps({"phase": 7, "run_id": "val-1", "config_sha256": sha(cfg),
                                       "manifest_sha256": sha(self.manifest), "series_sha256": "0" * 64,
                                       "vendor": "openai", "terms": "t", "created_at": "x"}))
        args = ("check-access", "--ids", "V-01", "--validation", "--access", str(release), "--config", str(cfg))
        approval = (f"S19-VALIDATION config_sha256={sha(cfg)} manifest_sha256={sha(self.manifest)} vendor=openai "
                    f'terms="t" run_id=val-1 decision={{}} date=2026-11-20')
        spend7 = "S19-SPEND phase=7 cap_usd=5 decision=approved date=2026-11-20"
        cases = [
            ([], "no S19-VALIDATION record"),
            ([approval.format("declined"), spend7], "was declined"),
            ([approval.format("approved")], "no S19-SPEND record for phase 7"),
            ([approval.format("approved"), spend7.replace("approved", "declined")], "spending is declined"),
            ([approval.format("approved"), approval.format("approved"), spend7], "more than one S19-VALIDATION"),
            ([approval.format("approved").replace("vendor=openai", "vendor=fal"), spend7], "differs from the owner"),
            ([approval.format("approved") + " decision=approved", spend7], "duplicate key"),
            ([approval.format("approved").replace('terms="t"', "terms=t extra=1"), spend7], "unknown key"),
            ([approval.format("approved").replace("decision=approved", "decision=yes"), spend7], "approved or declined"),
        ]
        for records, why in cases:
            with self.subTest(why=why):
                self.set_records(records)
                r = self.run_cli("protocol", *args)
                self.assertEqual(r.returncode, 1, r.stdout)
                self.assertIn(why, r.stderr)
        self.set_records([approval.format("approved"), spend7])
        r = self.run_cli("protocol", *args)
        self.assertEqual(r.returncode, 0, r.stderr)
        r = self.run_cli("protocol", *args[:-2], "--config", str(self.make_config(name="other")))
        self.assertEqual(r.returncode, 1)
        self.assertIn("is for config", r.stderr)

    def test_records_outside_the_approvals_section_are_ignored(self):
        # fixtures put an approved-looking S19-SPEND line in ## Notes; it must not count.
        self.assertEqual(protocol.read_records()["S19-SPEND"], [])


class Phase7Flow(World):
    """A synthetic approved Phase 7: freeze → owner approvals → open-validation → prepare."""

    def setUp(self):
        super().setUp()
        impl = self.tmp / "impl.py"
        impl.write_text("# frozen implementation\n")
        self.impl = impl
        cfg = json.loads(self.make_config(name="final").read_text())
        cfg["implementation"] = {str(impl): sha(impl)}
        self.cfg = self.tmp / "finalist.json"
        self.cfg.write_text(json.dumps(cfg))
        self.report = self.tmp / "tuning-report.json"
        self.report.write_text(json.dumps({"verdicts": {sha(self.cfg): {"verdict": "PASS"}}}))
        self.series = self.tmp / "validation.json"
        self.series.write_text(json.dumps({
            "series_id": "validation", "phase": 7, "split": "validation", "manifest_sha256": sha(self.manifest),
            "configs": {sha(self.cfg): {"path": str(self.cfg), "name": "final", "kind": "gpt", "role": "validation"}},
            "slots": [{"config_sha256": sha(self.cfg), "photo": v, "slot": 1, "cost_bound_usd": 0.4}
                      for v in self.validation]}))
        self.freeze = (f"S19-FREEZE config_sha256={sha(self.cfg)} series_sha256={sha(self.series)} "
                       f"tuning_report={self.report} tuning_report_sha256={sha(self.report)} date=2026-11-15")
        self.approvals = [
            f"S19-VALIDATION config_sha256={sha(self.cfg)} manifest_sha256={sha(self.manifest)} vendor=openai "
            'terms="30-day abuse retention, no training" run_id=val-1 decision=approved date=2026-11-20',
            "S19-SPEND phase=7 cap_usd=5 decision=approved date=2026-11-20",
        ]
        self.set_records(self.approvals, [self.freeze])

    def open(self, cap="5"):
        return self.run_cli("protocol", "open-validation", "--config", str(self.cfg), "--phase", "7",
                            "--series", str(self.series), "--cap", cap)

    def test_approved_path_releases_once_and_prepares_validation_inputs(self):
        r = self.open()
        self.assertEqual(r.returncode, 0, r.stderr)
        release = self.private / "validation-access.json"
        rel = json.loads(release.read_text())
        self.assertEqual((rel["run_id"], rel["config_sha256"]), ("val-1", sha(self.cfg)))
        r = self.run_cli("inputs", "--config", str(self.cfg), "--validation", "--access", str(release),
                         "--all-validation")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue((self.private / "inputs" / "V-12-common.jpg").exists())
        r = self.run_cli("inputs", "--check", "--config", str(self.cfg), "--validation", "--access", str(release),
                         "--all-validation")  # implementation review F8: covers the 12, adds no tuning id
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(r.stdout.count("✓"), 12, r.stdout)
        self.assertEqual(self.open().returncode, 0, "the same run resumes")
        self.set_records([a.replace("val-1", "val-2") for a in self.approvals], [self.freeze])
        r = self.open()
        self.assertEqual(r.returncode, 1)
        self.assertIn("opened once", r.stderr)

    def test_no_release_without_each_precondition(self):
        cases = [
            (lambda: self.set_records([], [self.freeze]), "no S19-VALIDATION record"),
            (lambda: self.set_records([self.approvals[0]], [self.freeze]), "no S19-SPEND record for phase 7"),
            (lambda: self.set_records(self.approvals, []), "no S19-FREEZE record"),
            (lambda: self.report.write_text(json.dumps({"verdicts": {sha(self.cfg): {"verdict": "STOP"}}})),
             "missing or differs from the frozen hash"),
        ]
        for mutate, why in cases:
            with self.subTest(why=why):
                self.setUp()
                mutate()
                r = self.open()
                self.assertEqual(r.returncode, 1, r.stdout)
                self.assertIn(why, r.stderr)
                self.assertFalse((self.private / "validation-access.json").exists())

    def test_release_binds_vendor_series_and_the_frozen_process(self):
        # implementation review F8
        self.set_records([a.replace("vendor=openai", "vendor=fal") for a in self.approvals], [self.freeze])
        r = self.open()
        self.assertEqual(r.returncode, 1)
        self.assertIn("approves vendor 'fal', but finalist.json sends to 'openai'", r.stderr)
        self.assertFalse((self.private / "validation-access.json").exists())
        self.set_records(self.approvals, [self.freeze])
        self.assertEqual(self.open().returncode, 0)
        release = str(self.private / "validation-access.json")
        runner = ("run-candidate", "--config", str(self.cfg), "--phase", "7", "--cap", "5", "--dry-run",
                  "--validation", "--access", release, "--all-validation")
        edited = self.tmp / "validation-edited.json"
        edited.write_text(self.series.read_text() + "\n")
        r = self.run_cli(*runner[:1], "--series", str(edited), *runner[1:])
        self.assertEqual(r.returncode, 1)
        self.assertIn("is not the validation series the release froze", r.stderr)
        self.impl.write_text("# changed after the release\n")
        r = self.run_cli(*runner[:1], "--series", str(self.series), *runner[1:])
        self.assertEqual(r.returncode, 1)
        self.assertIn("the process changed", r.stderr)

    def test_cap_must_fit_the_twelve_initial_calls(self):
        self.approvals[1] = self.approvals[1].replace("cap_usd=5", "cap_usd=4")
        self.set_records(self.approvals, [self.freeze])
        r = self.open(cap="4")
        self.assertEqual(r.returncode, 1)
        self.assertIn("bounded at $4.80, above the Phase 7 cap of $4", r.stderr)

    def test_check_freeze_passes_then_fails_on_any_mutation(self):
        self.assertEqual(self.run_cli("protocol", "check-freeze", "--config", str(self.cfg)).returncode, 0)
        self.impl.write_text("# changed\n")
        r = self.run_cli("protocol", "check-freeze", "--config", str(self.cfg))
        self.assertEqual(r.returncode, 1)
        self.assertIn("the process changed", r.stderr)
        self.setUp()
        self.cfg.write_text(self.cfg.read_text().replace('"p"', '"p2"'))
        r = self.run_cli("protocol", "check-freeze", "--config", str(self.cfg))
        self.assertEqual(r.returncode, 1)
        self.assertIn("needs new tuning evidence", r.stderr)


class Close(World):
    FIELDS = protocol.OUTCOME_FIELDS

    def outcome(self, skip=None):
        path = self.tmp / "outcome.md"
        lines = [f"- **{f}:** {'stopped before validation' if f == 'Outcome' else 'x'}" for f in self.FIELDS
                 if f != skip]
        path.write_text("# Outcome\n\n" + "\n".join(lines) + "\n")
        return path

    def pointers(self, roadmap_status="done", steps="see evaluations/outcome.md"):
        roadmap = self.tmp / "roadmap.md"
        roadmap.write_text(f"| S-19 | cloud-model-comparison | x | {roadmap_status} |\n\n### S-19: x\n\n"
                           f"- **Status:** {roadmap_status}\n")
        temp = self.tmp / "temp_steps.md"
        temp.write_text(steps)
        self.env.update(S19_ROADMAP=str(roadmap), S19_TEMP_STEPS=str(temp))
        self.change_md.write_text(self.change_md.read_text() + "\nOutcome: evaluations/outcome.md\n")

    def test_complete_record_closes(self):
        self.pointers()
        r = self.run_cli("protocol", "close", "--outcome", str(self.outcome()))
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_missing_field_or_stale_pointer_fails(self):
        self.pointers(roadmap_status="in-progress")
        r = self.run_cli("protocol", "close", "--outcome", str(self.outcome(skip="Spend")))
        self.assertEqual(r.returncode, 1)
        self.assertIn("field 'Spend' is missing", r.stderr)
        self.assertIn("At-a-glance S-19 row still says", r.stderr)
        self.assertIn("item Status still says", r.stderr)


class Scope(unittest.TestCase):
    def test_paths_outside_the_allowlist_fail(self):
        with mock.patch.object(protocol, "changed_paths", return_value=[
                "scripts/s19/x.py", "context/changes/cloud-model-comparison/plan.md", "temp_steps.md",
                "context/foundation/roadmap.md", "wrangler.jsonc", "src/lib/engines/auto-params.ts"]):
            self.assertEqual(protocol.check_scope("HEAD"), ["wrangler.jsonc", "src/lib/engines/auto-params.ts"])

    def test_cli_exit_follows_the_changed_paths(self):
        # implementation review F10: replaces an `assertIn(r, (0, 1))` that could never fail
        allowed = ["scripts/s19/x.py", "context/changes/cloud-model-comparison/plan.md"]
        with mock.patch.object(protocol, "changed_paths", return_value=allowed):
            self.assertEqual(protocol.main(["check-scope", "--since", "HEAD"]), 0)
        with mock.patch.object(protocol, "changed_paths", return_value=allowed + ["wrangler.jsonc"]):
            self.assertEqual(protocol.main(["check-scope", "--since", "HEAD"]), 1)
        self.assertTrue(protocol.IMPLEMENTATION_BASE.startswith("ef80a97"))

    def test_git_level_changes_are_seen_committed_staged_and_untracked(self):
        repo = Path(tempfile.mkdtemp(prefix="s19-scope-"))
        self.addCleanup(shutil.rmtree, repo, True)

        def git(*a):
            subprocess.run(["git", "-C", str(repo), *a], check=True, capture_output=True,
                           env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                                "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"})

        git("init", "-q")
        (repo / "README.md").write_text("base\n")
        git("add", "README.md")
        git("commit", "-q", "-m", "base")
        base = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True,
                              text=True).stdout.strip()
        (repo / "scripts" / "s19").mkdir(parents=True)
        (repo / "scripts" / "s19" / "ok.py").write_text("x\n")
        (repo / "src").mkdir()
        (repo / "src" / "committed.ts").write_text("x\n")
        git("add", "src/committed.ts", "scripts/s19/ok.py")
        git("commit", "-q", "-m", "change")
        (repo / "wrangler.jsonc").write_text("{}\n")  # untracked
        with mock.patch.object(protocol, "ROOT", repo):
            self.assertEqual(protocol.check_scope(base), ["src/committed.ts", "wrangler.jsonc"])


if __name__ == "__main__":
    unittest.main()
