"""S-20 step 1a, plan Phase 4 item 3: `gate.py`, one named case per Definitions row and per row of
the plan review's degenerate walkthrough, plus leak scans of every output channel [F12, F16].

One 8-photo synthetic world is built per class (rules, sealed pilot, committed freeze, sealed gate
set, all in a temporary Git repository). Each case resets that repository to the gate seal's
commit, commits its own export and runs the real CLI.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import blind_fixture as bf  # noqa: E402
import common  # noqa: E402
import evidence  # noqa: E402
import gate  # noqa: E402
from common import BlockedMany  # noqa: E402

K = 1.5
PHOTOS = tuple(f"T-{i:02d}" for i in range(1, 9))
# identities that must never reach a BLOCKED output: arm names, strengths, private locations
LEAKS = ("control-full", "nlm-gamma", "k1.0", "k1.5", "k2.0", '"k"', "test-photos/private", "/arms/",
         ".key-do-not-open", "Traceback")


class GateWorld(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="s20-gate-"))
        cls.w = bf.SyntheticWorld(cls.tmp, size=(48, 32), n_tuning=8)
        cls.w.pilot_chain(K)
        cls.key = cls.w.seal("gate", "gate-x")
        cls.base = cls.w.git("rev-parse", "HEAD").strip()
        cls.items = {(it["photo"], it["comparison"]): i for i, it in cls.key["items"].items()}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, True)

    def setUp(self):
        self.w.git("reset", "-q", "--hard", self.base)
        self.w.git("clean", "-qfd")
        logs = self.w.s20 / "logs"
        if logs.exists():
            shutil.rmtree(logs)

    def run_gate(self, spec=None, doc=None, default=None) -> subprocess.CompletedProcess:
        self.w.write_export("gate", doc or self.w.gate_export(self.key, spec, default))
        return self.w.gate()

    def verdict(self, code: int, spec=None, default=None) -> dict:
        r = self.run_gate(spec, default=default)
        self.assertEqual(r.returncode, code, r.stdout + r.stderr)
        return json.loads((self.w.repo / common.GATE_JSON).read_text())

    def blocked(self, *expect: str, r: subprocess.CompletedProcess | None = None, doc=None, spec=None) -> str:
        r = r or self.run_gate(spec, doc=doc)
        out = r.stdout + r.stderr
        self.assertEqual(r.returncode, 3, out)
        for e in expect:
            self.assertIn(e, out)
        self.assert_sanitized(out)
        return out

    def assert_sanitized(self, out: str) -> None:
        """BLOCKED: the sanitized reports exist and hold nothing decoded; no bundle, no key copy."""
        repo = self.w.repo
        report = json.loads((repo / common.GATE_JSON).read_text())
        self.assertEqual(set(report), {"verdict", "reasons", "way_out"})
        self.assertEqual(report["verdict"], "BLOCKED")
        md = (repo / common.GATE_MD).read_text()
        self.assertFalse((repo / common.AUDIT_DIR).exists(), "no audit bundle after BLOCKED")
        created = [p for p in repo.rglob("*") if p.is_file() and ".git" not in p.parts]
        for text in [out, md, json.dumps(report)] + [p.read_text(errors="replace") for p in created
                                                       if p.suffix in (".json", ".md", ".raw")
                                                       and "evaluations" in p.parts and "sealed" not in p.name
                                                       and "ratings" not in p.name and "pilot-result" not in p.name]:
            for leak in LEAKS + (str(self.w.private), str(self.w.s20)):
                self.assertNotIn(leak, text, f"leak {leak!r}")

    def pair(self, photo: str, comparison: str) -> str:
        return self.items[(photo, comparison)]


class QualityTest(GateWorld):
    def test_6_wins_1_loss_1_tie_is_pass(self):
        spec = {("T-07", "control-full"): ("ref-slight", "none", "none"),
                ("T-08", "control-full"): ("tie", "none", "none"),
                ("T-01", "control-full"): ("nlm-slight", "none", "none")}
        report = self.verdict(0, spec)
        self.assertEqual((report["verdict"], report["wins"]), ("PASS", 6))
        self.assertTrue((self.w.repo / common.AUDIT_DIR / "README.md").exists())

    def test_5_wins_3_ties_is_fail_and_local_cannot_supply_a_win(self):
        spec = {(p, "control-full"): ("tie", "none", "none") for p in PHOTOS[5:]}
        spec.update({(p, "local"): ("nlm-clear", "none", "none") for p in PHOTOS})
        report = self.verdict(1, spec)
        self.assertEqual((report["verdict"], report["wins"]), ("FAIL", 5))
        self.assertTrue(all(d["local"]["quality"] == "nlm-clear" for d in report["photos"].values()))

    def test_8_ties_is_fail_not_pass_for_no_harm(self):
        report = self.verdict(1, {(p, "control-full"): ("tie", "none", "none") for p in PHOTOS})
        self.assertEqual((report["verdict"], report["wins"]), ("FAIL", 0))


class FidelityTest(GateWorld):
    def test_a_loss_found_only_in_the_local_pair_is_fail(self):
        crop = [{"x": 1, "y": 1, "w": 4, "h": 3}]
        spec = {("T-03", "control-full"): ("nlm-clear", "minor", "none"),
                ("T-03", "local"): ("nlm-slight", ("significant", crop, "stars smeared"), "none")}
        report = self.verdict(1, spec)
        self.assertEqual(report["photos"]["T-03"]["worst_nlm_fidelity"], "significant")
        self.assertEqual(report["wins"], 8, "it fails on fidelity alone")
        md = (self.w.repo / common.GATE_MD).read_text()
        self.assertIn("stars smeared", md)

    def test_a_severe_loss_on_the_reference_side_alone_is_pass(self):
        crop = [{"x": 0, "y": 0, "w": 2, "h": 2}]
        spec = {("T-02", "local"): ("nlm-clear", "none", ("severe", crop, "lettering changed in Local"))}
        report = self.verdict(0, spec)
        self.assertEqual(report["photos"]["T-02"]["local"]["reference_fidelity"], "severe")

    def test_significant_without_a_crop_is_blocked_not_fail(self):
        p = self.pair("T-04", "control-full")
        out = self.blocked(f"pair {p}: missing evidence", spec={("T-04", "control-full"): (
            "nlm-clear", ("significant", [], "blurred"), "none")})
        self.assertEqual(out.count("pair "), 1)

    def test_significant_without_a_reason_is_blocked(self):
        self.blocked("missing evidence", spec={("T-04", "local"): (
            "nlm-clear", ("severe", [{"x": 0, "y": 0, "w": 1, "h": 1}], "  "), "none")})

    def test_one_uncertain_reference_side_blocks_and_names_only_its_pair(self):
        p = self.pair("T-05", "local")
        out = self.blocked(f"pair {p}: uncertain", spec={("T-05", "local"): ("tie", "none", "uncertain")})
        self.assertEqual(re.findall(r"pair (p\d\d)", out), [p], "only the uncertain pair, no count, no side")
        for word in ("A", "B", "wins", "of 8"):
            self.assertNotIn(f" {word} ", out.replace(common.WAY_OUT["uncertain"], ""))

    def test_crop_boundaries(self):
        W, H = 48, 32
        ok = [{"x": W - 1, "y": H - 1, "w": 1, "h": 1}]
        report = self.verdict(1, {("T-06", "control-full"): ("nlm-clear", ("significant", ok, "corner"), "none")})
        self.assertEqual(report["verdict"], "FAIL", "a valid 1×1 corner crop substantiates the loss")
        for bad in ({"x": 0, "y": 0, "w": 0, "h": 1}, {"x": 0, "y": 0, "w": -1, "h": 1},
                    {"x": W - 1, "y": 0, "w": 2, "h": 1}, {"x": 0, "y": H, "w": 1, "h": 1},
                    {"x": 0.5, "y": 0, "w": 1, "h": 1}, {"x": True, "y": 0, "w": 1, "h": 1},
                    {"x": 0, "y": 0, "w": 1}):
            with self.subTest(crop=bad):
                self.setUp()
                self.blocked("schema error", spec={("T-06", "control-full"): (
                    "nlm-clear", ("significant", [bad], "r"), "none")})

    def test_a_non_finite_crop_value_is_blocked(self):
        doc = self.w.gate_export(self.key, {("T-06", "control-full"): (
            "nlm-clear", ("significant", [{"x": 0, "y": 0, "w": 1, "h": 1}], "r"), "none")})
        text = json.dumps(doc).replace('"w": 1, "h": 1', '"w": NaN, "h": 1', 1)
        (self.w.repo / common.GATE_RATINGS).write_text(text)
        self.w.commit(common.GATE_RATINGS, message="nan")
        self.blocked("set: schema error", r=self.w.gate())


class SchemaCoverageTest(GateWorld):
    def test_a_legacy_s19_export_is_blocked(self):
        doc = {"viewer": "compare-arms", "version": 1, "series_id": "s", "ratings": [], "failed_slots": []}
        self.blocked("set: schema error", doc=doc)

    def test_a_null_or_unknown_level_and_a_missing_side_are_blocked(self):
        for mutate in (lambda f: f["A"].update(level=None), lambda f: f["B"].update(level="mild"),
                       lambda f: f.pop("B")):
            with self.subTest():
                self.setUp()
                doc = self.w.gate_export(self.key)
                mutate(doc["ratings"][2]["fidelity"])
                self.blocked("pair p03: schema error", doc=doc)

    def test_a_duplicate_plus_a_missing_pair_is_blocked_never_deduplicated(self):
        doc = self.w.gate_export(self.key)
        doc["ratings"][5] = dict(doc["ratings"][4])
        out = self.blocked("pair p05: coverage error", "pair p06: coverage error", doc=doc)
        self.assertIn("coverage error", out)

    def test_an_untrusted_pair_id_is_refused_and_not_echoed(self):
        doc = self.w.gate_export(self.key)
        doc["ratings"][0]["pair_id"] = "p99-UNTRUSTED/path"
        out = self.blocked("set: coverage error", doc=doc)
        self.assertNotIn("p99-UNTRUSTED", out)

    def test_a_key_mapping_two_ids_to_one_comparison_is_blocked(self):
        """A key sealed as built: coverage is derived from the manifest, not from key and export agreeing."""
        tmp = Path(tempfile.mkdtemp(prefix="s20-gate-dup-"))
        self.addCleanup(shutil.rmtree, tmp, True)
        w = bf.SyntheticWorld(tmp, size=(48, 32), n_tuning=8)
        w.pilot_chain(K)
        key = w.seal("gate", "gate-d", commit=False)
        key_path = w.s20 / "gate-d" / common.KEY_NAME
        k = json.loads(key_path.read_text())
        a, b = sorted(k["items"])[:2]
        k["items"][b]["photo"], k["items"][b]["comparison"] = k["items"][a]["photo"], k["items"][a]["comparison"]
        k["items"][b]["sides"] = {s: ({"arm": k["items"][a]["comparison"]} if v["arm"] != "nlm-gamma" else v)
                                  for s, v in k["items"][b]["sides"].items()}
        key_path.write_text(json.dumps(k, sort_keys=True, indent=1) + "\n")
        seal = w.repo / bf.EVAL / "gate-sealed.md"
        seal.write_text(re.sub(r"key_sha256=[0-9a-f]{64}", f"key_sha256={common.sha_file(key_path)}",
                               seal.read_text()))
        w.commit(f"{bf.EVAL}/gate-sealed.md", message="seal")
        w.write_export("gate", w.gate_export(k))
        r = w.gate("gate-d")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn(f"pair {a}: coverage error", r.stdout)
        self.assertIn(f"pair {b}: coverage error", r.stdout)


class BindingTest(GateWorld):
    def restore_after(self, path: Path) -> None:
        data = path.read_bytes()
        self.addCleanup(path.write_bytes, data)

    def test_a_tampered_presentation_file_is_blocked(self):
        p = self.pair("T-02", "local")
        png = self.w.s20 / "gate-x" / f"{p}-A.png"
        self.restore_after(png)
        png.write_bytes(png.read_bytes()[:-4] + b"\0\0\0\0")
        self.blocked(f"pair {p}: binding failed")

    def test_a_missing_presentation_file_is_blocked(self):
        p = self.pair("T-06", "control-full")
        png = self.w.s20 / "gate-x" / f"{p}-original.png"
        self.restore_after(png)
        png.unlink()
        self.blocked(f"pair {p}: missing file")

    def test_a_local_download_other_than_its_baseline_is_blocked(self):
        self.w.write_baselines({"T-03": "0" * 64})
        self.w.commit("scripts/s20/configs/local-baselines.json", message="baseline")
        self.blocked(f"pair {self.pair('T-03', 'local')}: baseline mismatch")

    def test_a_baselines_file_without_a_photo_is_blocked(self):
        path = self.w.repo / common.BASELINES
        doc = json.loads(path.read_text())
        del doc["sha256"]["T-08"]
        path.write_text(json.dumps(doc))
        self.w.commit(common.BASELINES, message="baseline")
        self.blocked("set: baseline mismatch")

    def test_a_tuning_path_into_the_holdout_is_refused_before_it_is_read(self):
        holdout = Path(next(e["path"] for e in self.w.entries if e["id"] == "V-01"))
        local = self.w.private / "local" / "T-04.jpg"
        data = local.read_bytes()
        self.addCleanup(lambda: (local.unlink(), local.write_bytes(data)))
        local.unlink()
        local.symlink_to(holdout)
        mode = holdout.stat().st_mode
        holdout.chmod(0)
        self.addCleanup(holdout.chmod, stat.S_IMODE(mode))
        out = self.blocked("set: access refused")
        self.assertNotIn("V-01", out)

    def test_a_malformed_key_carrying_a_path_and_an_untrusted_id_is_blocked_without_echo(self):
        key_path = self.w.s20 / "gate-x" / common.KEY_NAME
        self.restore_after(key_path)
        k = json.loads(key_path.read_text())
        k["items"]["p77-UNTRUSTED"] = {"photo": "/home/x/test-photos/private/s19/local/T-01.jpg"}
        key_path.write_text(json.dumps(k))
        out = self.blocked("set: key mismatch")
        self.assertNotIn("p77-UNTRUSTED", out)
        self.assertNotIn("/home/x", out)

    def test_auto_record_or_lut_changed_between_the_arms_is_blocked(self):
        """F9, on the record bindings themselves: both arms' bytes bind, their Auto file differs."""
        key = {"items": {"p01": {"sources": {
            "original": {"sha256": "o", "pixels_sha256": "px", "record": "d", "record_sha256": "d"},
            "A": {"sha256": "n", "record": "n", "record_sha256": "n", "nlm_record": "r", "nlm_record_sha256": "r"},
            "B": {"sha256": "c", "record": "c", "record_sha256": "c"}}}}}
        key["items"]["p02"] = json.loads(json.dumps(key["items"]["p01"]))
        key["items"]["p02"]["sources"]["B"] = {"sha256": "L"}
        bind = {"implementation_sha256": "i", "config_sha256": "g", "opencv_version": "v"}
        records = {
            "d": {"output_sha256": "o", "pixels_sha256": "px"},
            "n": {"output_sha256": "n", "source": {"record_sha256": "r", "k": K}, "decoded_pixels_sha256": "px",
                  "auto_file_sha256": "AUTO-1", "lut_sha256": "lut"},
            "c": {"output_sha256": "c", "decoded_pixels_sha256": "px", "auto_file_sha256": "AUTO-2", "lut_sha256": "lut"},
            "r": {**bind, "k": K, "decoded_pixels_sha256": "px", "config_sha256": "g"},
        }
        pairs = {"p01": {"photo": "T", "comparison": "control-full", "nlm": "A", "ref": "B"},
                 "p02": {"photo": "T", "comparison": "local", "nlm": "A", "ref": "B"}}
        read = lambda path, sha: json.dumps(records[path]).encode()  # noqa: E731
        with self.assertRaises(BlockedMany) as cm:
            gate.record_bindings(key, pairs, read, K, "g", bind, {"T": "L" * 64})
        self.assertIn(("p01", "binding failed"), {(b.item, b.reason) for b in cm.exception.found})
        self.assertTrue(any("auto_file_sha256" in b.detail for b in cm.exception.found))
        records["n"]["auto_file_sha256"] = "AUTO-2"
        records["r"]["opencv_version"] = "other"
        with self.assertRaises(BlockedMany) as cm:
            gate.record_bindings(key, pairs, read, K, "g", bind, {"T": "L" * 64})
        self.assertEqual({b.reason for b in cm.exception.found}, {"provenance mismatch"})  # refused before its baseline


class OrderTest(GateWorld):
    def test_a_gate_seal_and_its_ratings_in_one_commit_are_blocked(self):
        self.w.git("reset", "-q", "--hard", "HEAD~1")  # drop the seal commit, keep the set on disk
        self.w.git("clean", "-qfd")
        tmp_seal = self.w.repo / bf.EVAL / "gate-sealed.md"
        key_sha = common.sha_file(self.w.s20 / "gate-x" / common.KEY_NAME)
        tmp_seal.write_text(evidence.seal_text("gate", "gate-x", self.key["set_digest"], key_sha))
        self.w.write_export("gate", self.w.gate_export(self.key), commit=False)
        self.w.commit(f"{bf.EVAL}/gate-sealed.md", common.GATE_RATINGS, message="seal and ratings at once")
        self.blocked("set: order violation", r=self.w.gate())

    def test_a_replaced_gate_seal_is_blocked(self):
        """Replaced before the ratings: every seal commit still precedes them, so only write-once refuses."""
        seal = self.w.repo / common.GATE_SEAL
        seal.write_text(seal.read_text() + "\nedited\n")
        self.w.commit(common.GATE_SEAL, message="seal again")
        self.w.write_export("gate", self.w.gate_export(self.key))
        out = self.blocked("set: order violation", r=self.w.gate())
        log = next((self.w.s20 / "logs").glob("gate-*.log")).read_text()
        self.assertIn("touched by 2 commits", log)

    def test_a_stop_pilot_makes_the_frozen_gate_unusable(self):
        pilot_key = json.loads((self.w.s20 / "pilot-x" / common.KEY_NAME).read_text())
        self.w.write_export("pilot", self.w.pilot_export(pilot_key, lambda p, labels: "none"))
        self.blocked("set: pilot stop", spec=None)

    def test_an_uncommitted_export_is_blocked(self):
        self.w.write_export("gate", self.w.gate_export(self.key), commit=False)
        self.blocked("set: order violation", r=self.w.gate())

    def test_the_export_must_be_the_committed_ratings_path(self):
        r = self.w.run_tool("gate", "--set", "gate-x", "--export", "/tmp/x.json")
        self.assertEqual(r.returncode, 2)


class AuditTest(GateWorld):
    def audit(self, env_extra=None) -> subprocess.CompletedProcess:
        env = {**self.w.env, **(env_extra or {})}
        return subprocess.run([sys.executable, "-B", str(bf.S20 / "gate.py"), "--audit",
                               str(self.w.repo / common.AUDIT_DIR)], capture_output=True, text=True, env=env,
                              cwd=bf.ROOT)

    def test_the_verdict_re_derives_from_metadata_alone(self):
        self.verdict(0)
        bundle = self.w.repo / common.AUDIT_DIR
        names = sorted(p.name for p in bundle.iterdir())
        self.assertEqual(names, ["README.md", "gate-key.raw", "gate-manifest.raw", "pilot-key.raw",
                                 "pilot-manifest.raw", "records"])
        self.assertFalse([p for p in bundle.rglob("*") if p.suffix in (".png", ".jpg")], "no image bytes")
        empty = self.tmp / "no-private"
        empty.mkdir(exist_ok=True)
        r = self.audit({"S19_PRIVATE": str(empty), "S20_PRIVATE": str(empty)})  # no private workspace at all
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("re-derives PASS", r.stdout)

    def test_a_fail_re_derives_as_fail(self):
        self.verdict(1, {(p, "control-full"): ("tie", "none", "none") for p in PHOTOS})
        r = self.audit()
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)

    def test_a_replaced_seal_blocks_audit_as_well_as_the_live_gate(self):
        self.verdict(0)
        path = self.w.repo / common.GATE_SEAL
        path.write_text(path.read_text() + "\nreplaced after ratings\n")
        self.w.commit(common.GATE_SEAL, message="replace gate seal")
        r = self.audit()
        self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
        self.assertIn("set: order violation", r.stdout)
        self.assertNotIn("re-derives PASS", r.stdout)
        live = self.w.gate()
        self.assertEqual(live.returncode, 3, live.stdout + live.stderr)
        self.assertIn("set: order violation", live.stdout)

    def test_dirty_evidence_rule_or_baseline_files_block_audit(self):
        self.verdict(0)
        for rel in (common.PILOT_SEAL, common.PILOT_RATINGS, common.FROZEN, common.GATE_SEAL,
                    common.GATE_RATINGS, common.BASELINES, "scripts/s20/common.py"):
            with self.subTest(path=rel):
                path = self.w.repo / rel
                before = path.read_bytes()
                try:
                    path.write_bytes(before + b"\n")
                    r = self.audit()
                    self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
                    self.assertIn("set: order violation", r.stdout)
                finally:
                    path.write_bytes(before)

    def test_a_seal_and_ratings_in_one_commit_block_audit(self):
        self.verdict(0)
        self.w.git("reset", "--soft", "HEAD~2")  # combine the gate seal and its ratings
        self.w.git("commit", "-q", "-m", "gate seal and ratings together")
        r = self.audit()
        self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
        self.assertIn("set: order violation", r.stdout)

    def test_a_valid_gate_re_export_still_re_derives_without_private_images(self):
        self.verdict(0)
        doc = self.w.gate_export(self.key)
        doc["rated_on"] = "2026-11-07"
        self.w.write_export("gate", doc)
        r = self.w.gate()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        empty = self.tmp / "re-export-no-private"
        empty.mkdir(exist_ok=True)
        r = self.audit({"S19_PRIVATE": str(empty), "S20_PRIVATE": str(empty)})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("re-derives PASS", r.stdout)

    def test_a_tampered_bundle_record_does_not_re_derive(self):
        self.verdict(0)
        rec = next((self.w.repo / common.AUDIT_DIR / "records").iterdir())
        rec.write_bytes(rec.read_bytes() + b" ")
        r = self.audit()
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("binding failed", r.stdout)

    def assert_holdout_read_is_refused(self, bundle):
        held = next(e["path"] for e in self.w.entries if e["split"] == "validation")
        original_open = Path.open

        def trap(path, *args, **kwargs):
            self.assertNotEqual(os.path.realpath(path), os.path.realpath(held), "holdout was opened before refusal")
            return original_open(path, *args, **kwargs)

        with patch.dict(os.environ, self.w.env), patch.object(Path, "open", trap):
            with self.assertRaises((common.Blocked, common.BlockedMany)) as cm:
                gate.audit(bundle)
        found = cm.exception.found if isinstance(cm.exception, common.BlockedMany) else [cm.exception]
        self.assertEqual({b.reason for b in found}, {"access refused"})

    def test_holdout_symlinks_in_every_bundle_reader_are_refused_before_open(self):
        self.verdict(0)
        bundle = self.w.repo / common.AUDIT_DIR
        held = next(e["path"] for e in self.w.entries if e["split"] == "validation")
        paths = [bundle / name for name in ("pilot-key.raw", "pilot-manifest.raw", "gate-key.raw", "gate-manifest.raw")]
        paths.append(next((bundle / "records").iterdir()))
        for path in paths:
            with self.subTest(file=path.name):
                before = path.read_bytes()
                path.unlink()
                path.symlink_to(held)
                try:
                    self.assert_holdout_read_is_refused(bundle)
                    r = self.audit()
                    self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
                    self.assertIn("access refused", r.stdout)
                    for leak in LEAKS + (held, "V-01"):
                        self.assertNotIn(leak, r.stdout + r.stderr)
                finally:
                    path.unlink()
                    path.write_bytes(before)

    def test_a_report_symlink_into_the_holdout_is_refused_before_open(self):
        self.verdict(0)
        path = self.w.repo / common.GATE_JSON
        path.unlink()
        path.symlink_to(next(e["path"] for e in self.w.entries if e["split"] == "validation"))
        self.assert_holdout_read_is_refused(self.w.repo / common.AUDIT_DIR)

    def test_a_bundle_directory_link_into_a_holdout_namespace_is_refused(self):
        self.verdict(0)
        bundle = self.w.repo / common.AUDIT_DIR
        held_dir = self.tmp / "V-01" / "metadata-bundle"
        held_dir.parent.mkdir(exist_ok=True)
        shutil.copytree(bundle, held_dir)
        self.addCleanup(shutil.rmtree, held_dir)
        link = self.tmp / "holdout-bundle-link"
        link.symlink_to(held_dir, target_is_directory=True)
        self.addCleanup(link.unlink)
        self.assert_holdout_read_is_refused(link)

    def test_a_report_that_differs_from_the_evidence_does_not_re_derive(self):
        self.verdict(1, {(p, "control-full"): ("tie", "none", "none") for p in PHOTOS})
        path = self.w.repo / common.GATE_JSON
        doc = json.loads(path.read_text())
        doc["verdict"] = "PASS"
        path.write_text(json.dumps(doc))
        self.assertEqual(self.audit().returncode, 3)

    def test_blocked_removes_an_earlier_bundle(self):
        self.verdict(0)
        self.assertTrue((self.w.repo / common.AUDIT_DIR).exists())
        self.blocked("uncertain", spec={("T-01", "local"): ("tie", "uncertain", "none")})


class PublishKeepTest(unittest.TestCase):
    """`blind_fixture.py publish --keep`: the owner's round trip (manual check 4.3) runs exactly as
    the printed commands say: an eight-photo world, 16 pairs, an uncertain pair BLOCKED alone, the
    resolved re-export decided."""

    def test_the_printed_round_trip_commands_work(self):
        tmp = Path(tempfile.mkdtemp(prefix="s20-keep-"))
        self.addCleanup(shutil.rmtree, tmp, True)
        world, sets = tmp / "world", tmp / "sets"
        r = subprocess.run([sys.executable, "-B", str(bf.S20 / "tests" / "blind_fixture.py"), "publish",
                            "--keep", str(world), "--dest", str(sets)], capture_output=True, text=True, cwd=bf.ROOT)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(len([ln for ln in r.stdout.splitlines() if ln.strip().startswith("seal line to paste: S20-SEAL")]), 3)
        lines = r.stdout.splitlines()
        cp = next(ln.strip() for ln in lines if ln.strip().startswith("cp ~/Downloads/"))
        git_line = next(ln.strip() for ln in lines if ln.strip().startswith("git -C "))
        gate_line = next(ln.strip() for ln in lines if "scripts/s20/gate.py" in ln)
        target = Path(cp.split()[-1])
        gate_id = re.search(r"--set (\S+)", gate_line).group(1)
        key = json.loads((sets / gate_id / common.KEY_NAME).read_text())
        self.assertEqual(len(key["items"]), 16)
        shell = lambda cmd: subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, cwd=bf.ROOT)  # noqa: E731
        uncertain = next(i for i, it in sorted(key["items"].items()) if it["comparison"] == "local")
        photo = key["items"][uncertain]["photo"]
        for spec, code in (({(photo, "local"): ("tie", "none", "uncertain")}, 3), (None, 0)):
            target.write_text(json.dumps(bf.SyntheticWorld.gate_export(key, spec), indent=2) + "\n")
            g = shell(git_line)
            self.assertEqual(g.returncode, 0, g.stderr)
            out = shell(gate_line)
            self.assertEqual(out.returncode, code, out.stdout + out.stderr)
            if code == 3:
                self.assertEqual(re.findall(r"pair (p\d\d)", out.stdout), [uncertain])
        report = json.loads((target.parent / "step1-gate.json").read_text())
        self.assertEqual((report["verdict"], report["wins"]), ("PASS", 8))


class BaselinesFileTest(unittest.TestCase):
    """The committed local-baselines.json against its two sources (owner decision 2026-11-06):
    exactly the eight tuning ids; seven hashes equal the exact bytes of the committed archive
    copies, S17-01's equals the full hash recorded in the premise record."""

    def test_the_baselines_file_matches_its_sources_exactly(self):
        import hashlib

        sys.path.insert(0, str(bf.ROOT / "scripts" / "s19"))
        import protocol

        root = bf.ROOT
        doc = json.loads((root / common.BASELINES).read_text())
        manifest = json.loads((root / "test-photos" / "s17-benchmark-v2.json").read_text())
        tuning = sorted(e["id"] for e in manifest["entries"] if e["split"] == "tuning")
        self.assertEqual(sorted(doc["sha256"]), tuning)
        self.assertEqual(len(tuning), 8)
        archive = root / "context/archive/2026-09-28-cloud-model-comparison/references/s19-local"
        protocol.check_paths([archive / f"{i}.jpg" for i in tuning if i != "S17-01"], validation=False,
                             manifest=manifest)
        for pid in tuning:
            with self.subTest(photo=pid):
                expected = doc["sha256"][pid]
                self.assertTrue(gate.is_hex64(expected))
                if pid == "S17-01":
                    self.assertFalse((archive / "S17-01.jpg").exists(), "its JPEG is not published")
                    premise = (root / common.EVAL / "step1-premise.md").read_text()
                    self.assertIn(f"`local/S17-01.jpg` has sha256 `{expected}`", premise)
                else:
                    self.assertEqual(hashlib.sha256((archive / f"{pid}.jpg").read_bytes()).hexdigest(), expected)


if __name__ == "__main__":
    unittest.main()
