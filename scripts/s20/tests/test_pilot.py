"""S-20 step 1a, plan Phase 4 item 2: `pilot.py`, the vote rule and its evidence.

The arithmetic cases are the plan review's walkthrough rows (eight photos), run on the rule itself.
The CLI cases run the real tool in `blind_fixture.SyntheticWorld`: a committed rule set, a sealed
pilot set and a committed export in a temporary Git repository. Each CLI class runs for trial 1a
and, as its `…1b` subclass, for trial 1b; the STOP report and `--audit` are 1b's (plan Phase 8).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import blind_fixture as bf  # noqa: E402
import common  # noqa: E402
import pilot  # noqa: E402
from common import Blocked, BlockedMany  # noqa: E402

KS = [1.0, 1.5, 2.0]
LEAKS = ("control-full", "nlm-gamma", "wavelet-gamma", "k1.0", "k1.5", "k2.0", '"k"', "test-photos/private",
         "/arms/", ".key-do-not-open", "Traceback")


def decoded(*votes):
    """votes as (k or None, count) pairs -> {photo: k or None} over eight photos."""
    out, n = {}, 0
    for k, count in votes:
        for _ in range(count):
            n += 1
            out[f"P-{n:02d}"] = k
    return out


class RuleTest(unittest.TestCase):
    def test_2_2_1_3_selects_the_weaker_of_the_tied_leaders(self):
        r = pilot.rule(decoded((1.0, 2), (1.5, 2), (2.0, 1), (None, 3)), KS)
        self.assertEqual((r["decision"], r["k"], r["none"]), ("SELECTED", 1.0, 3))

    def test_0_0_1_7_selects_that_k_none_is_abstention_not_a_majority(self):
        r = pilot.rule(decoded((2.0, 1), (None, 7)), KS)
        self.assertEqual((r["decision"], r["k"]), ("SELECTED", 2.0))

    def test_eight_none_is_stop(self):
        r = pilot.rule(decoded((None, 8)), KS)
        self.assertEqual((r["decision"], r["k"]), ("STOP", None))

    def test_a_clear_leader_wins_whatever_its_strength(self):
        self.assertEqual(pilot.rule(decoded((1.0, 1), (2.0, 4), (1.5, 3)), KS)["k"], 2.0)
        self.assertEqual(pilot.rule(decoded((1.5, 3), (2.0, 3), (None, 2)), KS)["k"], 1.5)


class World(unittest.TestCase):
    n_tuning = 3
    trial = "1a"

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="s20-pilot-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.w = bf.SyntheticWorld(self.tmp, n_tuning=self.n_tuning, trial=self.trial)
        self.t = self.w.t
        self.w.init_repo()
        self.key = self.w.seal("pilot", "pilot-x")
        self.result = self.w.repo / self.t.pilot_result
        self.frozen = self.w.repo / self.t.frozen

    def export(self, choose=lambda photo, labels: next(l for l, k in labels.items() if k == 1.5)) -> dict:
        return self.w.pilot_export(self.key, choose)

    def blocked(self, *reasons: str) -> str:
        r = self.w.pilot()
        out = r.stdout + r.stderr
        self.assertEqual(r.returncode, 3, out)
        for reason in reasons:
            self.assertIn(reason, out)
        doc = json.loads(self.result.read_text())
        for text in (out, json.dumps(doc)):  # F12: stdout, stderr and the sanitized result
            for leak in LEAKS + (str(self.w.private), str(self.w.s20)):
                self.assertNotIn(leak, text, f"leak {leak!r}")
        self.assertEqual(doc["verdict"], "BLOCKED")
        self.assertEqual(set(doc), {"verdict", "reasons", "way_out"}, "the sanitized result holds nothing decoded")
        self.assertFalse(self.frozen.exists(), "a BLOCKED pilot writes no freeze")
        return out


class CliTest(World):
    def test_a_selection_writes_the_result_and_the_freeze(self):
        self.w.write_export("pilot", self.export())
        r = self.w.pilot()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        freeze = json.loads(self.frozen.read_text())
        self.assertEqual(freeze["k"], 1.5)
        self.assertEqual(set(freeze), {"k", "grid_config_sha256", "pilot_set_digest", "pilot_key_sha256",
                                       "pilot_export_sha256", "decided"})
        self.assertEqual(freeze["pilot_set_digest"], self.key["set_digest"])
        self.assertEqual(freeze["pilot_export_sha256"], common.sha_file(self.w.repo / self.t.pilot_ratings))
        self.assertEqual(freeze["decided"], self.t.decided)
        result = json.loads(self.result.read_text())
        self.assertEqual((result["verdict"], result["counts"]), ("SELECTED", {"k1.0": 0, "k1.5": 3, "k2.0": 0}))
        again = self.w.pilot()  # deterministic and idempotent: the same evidence decides the same
        self.assertEqual(again.returncode, 0, again.stdout + again.stderr)
        self.assertEqual(json.loads(self.frozen.read_text()), freeze)

    def test_stop_writes_no_freeze_and_exits_1(self):
        self.w.write_export("pilot", self.export(lambda photo, labels: "none"))
        r = self.w.pilot()
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("STOP", r.stdout)
        self.assertEqual(json.loads(self.result.read_text())["verdict"], "STOP")
        self.assertFalse(self.frozen.exists())

    def test_a_freeze_with_other_content_is_never_overwritten(self):
        self.w.write_export("pilot", self.export())
        self.frozen.write_text(json.dumps({"k": 2.0}))
        r = self.w.pilot()
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("freeze exists", r.stdout)
        self.assertEqual(json.loads(self.frozen.read_text()), {"k": 2.0})

    def test_the_export_must_be_the_committed_ratings_path(self):
        r = self.w.run_tool("pilot", "--set", "pilot-x", "--export", str(self.tmp / "elsewhere.json"))
        self.assertEqual(r.returncode, 2)
        self.assertIn("--export must be", r.stderr)


class BlockedTest(World):
    def test_ratings_committed_with_the_seal_are_an_order_violation(self):
        tmp = Path(tempfile.mkdtemp(prefix="s20-pilot-order-"))
        self.addCleanup(shutil.rmtree, tmp, True)
        w = bf.SyntheticWorld(tmp, trial=self.trial)
        w.init_repo()
        key = w.seal("pilot", "pilot-y", commit=False)
        w.write_export("pilot", w.pilot_export(key, lambda p, labels: "X"), commit=False)
        w.commit(w.t.pilot_seal, w.t.pilot_ratings, message="seal and ratings at once")
        r = w.pilot("pilot-y")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("set: order violation", r.stdout)

    def test_an_uncommitted_export_is_an_order_violation(self):
        self.w.write_export("pilot", self.export(), commit=False)
        self.blocked("set: order violation")

    def test_a_duplicate_photo_is_blocked_never_deduplicated(self):
        doc = self.export()
        doc["choices"].append(dict(doc["choices"][0]))
        self.w.write_export("pilot", doc)
        self.blocked("item i01: coverage error")

    def test_a_missing_photo_is_blocked_not_read_as_none(self):
        doc = self.export()
        doc["choices"].pop()
        self.w.write_export("pilot", doc)
        self.blocked("item i03: coverage error")

    def test_an_invalid_or_null_label_is_blocked(self):
        for bad in ("W", None, "kontrola"):
            with self.subTest(choice=bad):
                doc = self.export()
                doc["choices"][1]["choice"] = bad
                self.w.write_export("pilot", doc)
                self.blocked("item i02: schema error")

    def test_an_untrusted_item_id_is_refused_and_not_echoed(self):
        doc = self.export()
        doc["choices"][0]["item_id"] = "i99-UNTRUSTED"
        self.w.write_export("pilot", doc)
        out = self.blocked("set: coverage error")
        self.assertNotIn("i99-UNTRUSTED", out)
        self.assertNotIn("i99-UNTRUSTED", self.result.read_text())

    def test_an_export_for_another_digest_is_a_key_mismatch(self):
        doc = self.export()
        doc["set_digest"] = "0" * 64
        self.w.write_export("pilot", doc)
        self.blocked("set: key mismatch")

    def test_a_rebuilt_key_no_longer_matches_its_seal(self):
        self.w.write_export("pilot", self.export())
        key_path = self.w.s20 / "pilot-x" / common.KEY_NAME
        key_path.write_text(key_path.read_text().replace('"photo": "T-01"', '"photo": "T-01" '))
        self.blocked("set: key mismatch")

    def test_an_nlm_record_with_other_provenance_is_blocked(self):
        self.w.write_export("pilot", self.export())
        rec = self.w.s20 / self.t.raw_dir / "k2.0" / "T-02.json"
        field = self.t.bind_fields[-1]  # opencv_version for 1a, numpy_version for 1b
        self.assertIn(f'"{field}": "', rec.read_text())
        rec.write_text(rec.read_text().replace(f'"{field}": "', f'"{field}": "x'))
        self.blocked("binding failed")  # the key pins the record's bytes, so tampering shows first

    def test_a_non_finite_number_is_a_schema_error(self):
        self.w.write_export("pilot", self.export())
        path = self.w.repo / self.t.pilot_ratings
        # rated_on is not schema-checked, so only the strict parser can refuse a NaN there
        path.write_text(path.read_text().replace('"rated_on": "2026-11-06"', '"rated_on": NaN'))
        self.w.commit(self.t.pilot_ratings, message="nan")
        self.blocked("set: schema error")


class FileBindingTest(World):
    n_tuning = 8

    def swap_strengths(self):
        for item, it in self.key["items"].items():
            labels = [next(lab for lab, v in it["labels"].items() if v.get("k") == k) for k in (1.5, 2.0)]
            a, b = [self.w.s20 / "pilot-x" / it["sources"][lab]["presentation"] for lab in labels]
            first, second = a.read_bytes(), b.read_bytes()
            a.write_bytes(second)
            b.write_bytes(first)

    def test_swapped_strength_presentations_block_selection(self):
        self.swap_strengths()
        self.w.write_export("pilot", self.export())
        self.blocked("item i01: binding failed")

    def test_changed_source_blocks_selection_even_when_presentations_are_untouched(self):
        src = Path(self.key["items"]["i01"]["sources"]["X"]["path"])
        src.write_bytes(b"changed source")
        self.w.write_export("pilot", self.export())
        self.blocked("item i01: binding failed")

    def test_missing_presentation_blocks_selection(self):
        src = self.key["items"]["i01"]["sources"]["original"]
        (self.w.s20 / "pilot-x" / src["presentation"]).unlink()
        self.w.write_export("pilot", self.export())
        self.blocked("item i01: missing file")

    def test_swapped_pilot_blocks_both_gate_construction_and_execution_after_freeze(self):
        self.w.write_export("pilot", self.export())
        selected = self.w.pilot()
        self.assertEqual(selected.returncode, 0, selected.stdout + selected.stderr)
        self.w.commit(self.t.pilot_result, self.t.frozen, message="freeze")
        self.swap_strengths()
        for run in (lambda: self.w.blind("gate", "--set", "gate-x"), self.w.gate):
            with self.subTest(entrypoint=run):
                r = run()
                self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
                self.assertIn("binding failed", r.stdout)
                for leak in LEAKS:
                    self.assertNotIn(leak, r.stdout + r.stderr)
        self.assertFalse((self.w.s20 / "gate-x").exists())


class ProvenanceUnitTest(unittest.TestCase):
    def test_a_record_whose_bytes_bind_but_whose_rules_differ_is_a_provenance_mismatch(self):
        bind = {"implementation_sha256": "i" * 64, "config_sha256": "c" * 64, "opencv_version": "4.13.0"}
        rec = json.dumps({**bind, "opencv_version": "4.12.0"}).encode()
        key = {"items": {"i01": {"sources": {"X": {"nlm_record": "r", "nlm_record_sha256": "s"}}}}}
        with self.assertRaises(Blocked) as cm:
            pilot.check_provenance(key, bind, lambda path, sha: rec)
        self.assertEqual((cm.exception.reason, cm.exception.item), ("provenance mismatch", "i01"))
        pilot.check_provenance(key, bind, lambda path, sha: json.dumps(bind).encode())

    def test_votes_reports_every_problem_at_once(self):
        key = {"items": {"i01": {"photo": "A", "labels": {}}, "i02": {"photo": "B", "labels": {}}}}
        sealed = {"seal": {"set_id": "s", "set_digest": "d"}, "key": key}
        export = {"viewer": "compare-s20", "version": 1, "kind": "pilot", "set_id": "s", "set_digest": "d",
                  "rated_on": "x", "choices": [{"item_id": "i01", "photo": "A", "choice": "Q"}]}
        with self.assertRaises(BlockedMany) as cm:
            pilot.votes(export, sealed, ["A", "B"])
        self.assertEqual(sorted((b.item, b.reason) for b in cm.exception.found),
                         [("i01", "schema error"), ("i02", "coverage error")])


# ---------------------------------------------------------------- trial 1b (plan Phase 8 items 2–3)


class CliTest1b(CliTest):
    trial = "1b"


class BlockedTest1b(BlockedTest):
    trial = "1b"


class FileBindingTest1b(FileBindingTest):
    trial = "1b"


def tree(root: Path) -> dict:
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in sorted(root.rglob("*")) if p.is_file()} \
        if root.exists() else {}


class StopReportTest(World):
    """F22, F31, F32: a 1b STOP writes `pilot-stop.md` and a pilot-only bundle, `--audit`
    re-derives it from metadata alone, and a later run that is not STOP leaves neither behind."""

    trial = "1b"

    def choose(self, k: float | None) -> None:
        pick = (lambda photo, labels: "none") if k is None else \
            (lambda photo, labels: next(lab for lab, kk in labels.items() if kk == k))
        self.w.write_export("pilot", self.export(pick))

    def stop(self) -> subprocess.CompletedProcess:
        self.choose(None)
        r = self.w.pilot()
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        return r

    def audit(self, *extra: str, env: dict | None = None) -> subprocess.CompletedProcess:
        return self.w.run_tool("pilot", "--audit", str(self.w.repo / self.t.audit_dir), *extra, env=env)

    def one_a_evidence(self) -> dict:
        o = bf.TRIALS["1a"]
        for rel in (o.pilot_result, o.gate_json, f"{o.audit_dir}/README.md", f"{o.audit_dir}/pilot-key.raw"):
            (self.w.repo / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.w.repo / rel).write_text(f"1a sentinel {rel}\n")
        self.w.commit(o.pilot_result, o.gate_json, o.audit_dir, message="1a evidence")
        return tree(self.w.repo / bf.EVAL / "step1-audit") | {
            rel: (self.w.repo / rel).read_bytes() for rel in (o.pilot_result, o.gate_json)}

    def test_a_stop_writes_the_report_and_a_pilot_only_bundle_that_re_derives(self):
        before = self.one_a_evidence()
        r = self.stop()
        self.assertIn(self.t.pilot_stop, r.stdout)
        report = (self.w.repo / self.t.pilot_stop).read_text()
        self.assertTrue(report.startswith("# S-20 step 1b — pilot STOP\n"))
        self.assertIn("**Verdict: STOP.**", report)
        self.assertIn("| none   | 3     |", report)
        bundle = self.w.repo / self.t.audit_dir
        self.assertEqual(sorted(p.name for p in bundle.iterdir()),
                         ["README.md", "pilot-key.raw", "pilot-manifest.raw", "records"])
        self.assertFalse([p for p in bundle.rglob("*") if p.suffix in (".png", ".jpg")], "no image bytes")
        self.assertEqual(common.sha_file(bundle / "pilot-key.raw"), self.w.git(
            "show", f"HEAD:{self.t.pilot_seal}").split("key_sha256=")[1].split()[0])
        for text in (r.stdout + r.stderr, report, (bundle / "README.md").read_text()):
            for leak in ("test-photos/private", ".key-do-not-open", "Traceback", str(self.w.private), str(self.w.s20)):
                self.assertNotIn(leak, text)
        self.w.commit(self.t.pilot_result, self.t.pilot_stop, self.t.audit_dir, message="pilot stop")
        empty = self.tmp / "no-private"
        empty.mkdir()
        a = self.audit(env={"S19_PRIVATE": str(empty), "S20_PRIVATE": str(empty)})  # no private workspace at all
        self.assertEqual(a.returncode, 1, a.stdout + a.stderr)
        self.assertIn("pilot audit re-derives STOP", a.stdout)
        o = bf.TRIALS["1a"]
        self.assertEqual(tree(self.w.repo / bf.EVAL / "step1-audit") | {
            rel: (self.w.repo / rel).read_bytes() for rel in (o.pilot_result, o.gate_json)}, before,
            "nothing of 1a's changes")

    def test_the_audit_re_derives_a_selection_and_refuses_what_does_not_re_derive(self):
        self.stop()
        self.w.commit(self.t.pilot_result, self.t.pilot_stop, self.t.audit_dir, message="pilot stop")
        bundle = self.w.repo / self.t.audit_dir
        key = json.loads((bundle / "pilot-key.raw").read_text())
        sha = next(src[self.t.record_sha_key] for it in key["items"].values() for src in it["sources"].values()
                   if self.t.record_sha_key in src)
        rec = bundle / "records" / f"{sha}.raw"  # a wavelet record: the one the rule's provenance reads
        good = rec.read_bytes()
        rec.write_bytes(good + b" ")
        self.w.commit(self.t.audit_dir, message="tampered")
        r = self.audit()
        self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
        self.assertIn("binding failed", r.stdout)
        rec.write_bytes(good)
        result = self.w.repo / self.t.pilot_result
        doc = json.loads(result.read_text())
        result.write_text(json.dumps({**doc, "verdict": "SELECTED"}))
        self.w.commit(self.t.audit_dir, self.t.pilot_result, message="a result that does not follow")
        self.assertEqual(self.audit().returncode, 3)
        self.w.write_export("pilot", self.export())  # k 1.5 everywhere: SELECTED, freeze written
        self.assertEqual(self.w.pilot().returncode, 0)
        self.w.commit(self.t.pilot_result, self.t.frozen, message="selected")
        # the STOP bundle is gone (F32); the selection re-derives from any bundle with the pilot key
        self.assertFalse(bundle.exists())
        bundle.mkdir(parents=True)
        (bundle / "records").mkdir()
        sealed = common.sealed_from(*self.sealed_parts())
        (bundle / "pilot-key.raw").write_bytes(sealed["key_raw"])
        (bundle / "pilot-manifest.raw").write_bytes(sealed["manifest_raw"])
        for it in sealed["key"]["items"].values():
            for src in it["sources"].values():
                if self.t.record_key in src:
                    path = Path(src[self.t.record_key])
                    (bundle / "records" / f"{src[self.t.record_sha_key]}.raw").write_bytes(path.read_bytes())
        r = self.audit()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("re-derives SELECTED", r.stdout)

    def sealed_parts(self):
        seal_line = next(ln for ln in (self.w.repo / self.t.pilot_seal).read_text().splitlines()
                         if ln.startswith("S20-SEAL"))
        f = dict(kv.split("=", 1) for kv in seal_line.split()[1:])
        seal = {"kind": f["kind"], "set_id": f["set_id"], "set_digest": f["set_digest"], "key_sha256": f["key_sha256"]}
        set_dir = self.w.s20 / f["set_id"]
        return seal, "pilot", (set_dir / common.KEY_NAME).read_bytes(), (set_dir / "manifest.js").read_bytes()

    def test_a_later_selected_or_blocked_pilot_removes_the_stop_files(self):
        stop, bundle = self.w.repo / self.t.pilot_stop, self.w.repo / self.t.audit_dir
        for later, code in (("selected", 0), ("blocked", 3)):
            with self.subTest(later=later):
                self.stop()
                self.assertTrue(stop.exists() and bundle.exists())
                if later == "selected":
                    self.choose(1.5)
                else:  # an uncommitted export: order violation
                    self.w.write_export("pilot", self.export(), commit=False)
                r = self.w.pilot()
                self.assertEqual(r.returncode, code, r.stdout + r.stderr)
                self.assertFalse(stop.exists(), "no stale STOP report")
                self.assertFalse(bundle.exists(), "no stale STOP bundle")
                if later == "selected":
                    self.frozen.unlink()  # this case's freeze; the next STOP comes from a fresh export

    def test_a_gate_bundle_in_the_audit_directory_is_not_a_stop_bundle(self):
        bundle = self.w.repo / self.t.audit_dir
        bundle.mkdir(parents=True)
        (bundle / "README.md").write_text(f"# {self.t.title} — audit bundle\n")
        self.choose(1.5)
        self.assertEqual(self.w.pilot().returncode, 0)
        self.assertTrue((bundle / "README.md").exists(), "only a STOP bundle is removed")

    def test_audit_usage(self):
        r = self.w.run_tool("pilot", "--audit", str(self.w.repo / self.t.audit_dir), "--set", "pilot-x")
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        one_a = subprocess.run([sys.executable, "-B", str(bf.S20 / "pilot.py"), "--audit", "x"],
                               capture_output=True, text=True, env=self.w.env)
        self.assertEqual(one_a.returncode, 2, "1a has no STOP report, so no pilot audit")
        self.assertIn("--audit needs a trial with a STOP report", one_a.stderr)
        r = self.w.run_tool("pilot")
        self.assertEqual(r.returncode, 2)


class Provenance1bUnitTest(unittest.TestCase):
    def test_a_1b_record_is_checked_on_1b_bind_fields_and_key_name(self):
        t = bf.TRIALS["1b"]
        bind = {f: "v" for f in t.bind_fields}
        key = {"items": {"i01": {"sources": {"X": {t.record_key: "r", t.record_sha_key: "s"},
                                             "Y": {"nlm_record": "q", "nlm_record_sha256": "q"}}}}}
        pilot.check_provenance(key, bind, lambda path, sha: json.dumps(bind).encode() if path == "r" else b"!", t)
        with self.assertRaises(Blocked) as cm:
            pilot.check_provenance(key, bind, lambda path, sha: json.dumps({**bind, "numpy_version": "w"}).encode(), t)
        self.assertEqual((cm.exception.reason, cm.exception.item), ("provenance mismatch", "i01"))


if __name__ == "__main__":
    unittest.main()
