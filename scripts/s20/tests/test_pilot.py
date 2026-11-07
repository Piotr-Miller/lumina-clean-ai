"""S-20 step 1a, plan Phase 4 item 2: `pilot.py`, the vote rule and its evidence.

The arithmetic cases are the plan review's walkthrough rows (eight photos), run on the rule itself.
The CLI cases run the real tool in `blind_fixture.SyntheticWorld`: a committed rule set, a sealed
pilot set and a committed export in a temporary Git repository.
"""

from __future__ import annotations

import json
import shutil
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
LEAKS = ("control-full", "nlm-gamma", "k1.0", "k1.5", "k2.0", '"k"', "test-photos/private", "/arms/",
         ".key-do-not-open", "Traceback")


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

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="s20-pilot-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.w = bf.SyntheticWorld(self.tmp, n_tuning=self.n_tuning)
        self.w.init_repo()
        self.key = self.w.seal("pilot", "pilot-x")
        self.result = self.w.repo / bf.EVAL / "pilot-result.json"
        self.frozen = self.w.repo / common.FROZEN

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
        self.assertEqual(freeze["pilot_export_sha256"], common.sha_file(self.w.repo / common.PILOT_RATINGS))
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
        w = bf.SyntheticWorld(tmp)
        w.init_repo()
        key = w.seal("pilot", "pilot-y", commit=False)
        w.write_export("pilot", w.pilot_export(key, lambda p, labels: "X"), commit=False)
        w.commit(f"{bf.EVAL}/pilot-sealed.md", f"{bf.EVAL}/pilot-ratings.json", message="seal and ratings at once")
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
        rec = self.w.s20 / "nlm" / "k2.0" / "T-02.json"
        rec.write_text(rec.read_text().replace('"opencv_version": "', '"opencv_version": "x'))
        self.blocked("binding failed")  # the key pins the record's bytes, so tampering shows first

    def test_a_non_finite_number_is_a_schema_error(self):
        self.w.write_export("pilot", self.export())
        path = self.w.repo / common.PILOT_RATINGS
        # rated_on is not schema-checked, so only the strict parser can refuse a NaN there
        path.write_text(path.read_text().replace('"rated_on": "2026-11-06"', '"rated_on": NaN'))
        self.w.commit(common.PILOT_RATINGS, message="nan")
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
        self.w.commit(common.PILOT_RESULT, common.FROZEN, message="freeze")
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


if __name__ == "__main__":
    unittest.main()
