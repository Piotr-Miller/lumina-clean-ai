"""tally.py: exact categories, counts, reasons and exits for PASS, STOP and invalid evidence.

Each test builds a series, writes the ledger records `run-candidate.py` would write, and an
export in the shape `compare-arms.html` produces, then runs the CLI.
"""

from __future__ import annotations

import json
import uuid

from fixtures import World, load, sha

runner = load("run-candidate")


class TallyWorld(World):
    tuning = tuple(f"T-{i:02d}" for i in range(1, 9))

    def setUp(self):
        super().setUp()
        self.prepare(*self.tuning)
        self.n = 0

    # ---- ledger and export builders

    def slot_key(self, series, cfg_name, photo, slot):
        s = next(x for x in json.loads(series.read_text())["slots"]
                 if x["config_name"] == cfg_name and x["photo"] == photo and x["slot"] == slot)
        return s

    def attempt(self, series, cfg_name, photo, slot, status="ok", ordinal=1):
        s = self.slot_key(series, cfg_name, photo, slot)
        aid = uuid.uuid4().hex
        out = f"{cfg_name}-{photo}-{slot}-{ordinal}-{status}"
        with runner.locked():
            runner.append({"event": "reserve", "attempt_id": aid, "phase": 3, "series_id": "s",
                           "config_sha256": s["config_sha256"], "config_name": cfg_name,
                           "input_sha256": s["input_sha256"], "photo": photo, "slot": slot, "ordinal": ordinal,
                           "role": s["role"], "request_size": s["request_size"], "reserved_usd": 1.0,
                           "requested_at": "t"})
            runner.append({"event": "result", "attempt_id": aid, "status": status, "transient": status != "ok",
                           "cost_usd": None, "output_sha256": out})
        return out

    def terminal(self, series, cfg_name, photo, slot, status="technical_failure"):
        s = self.slot_key(series, cfg_name, photo, slot)
        with runner.locked():
            runner.append({"event": "slot_terminal", "status": status, "reason": "test", "at": "t", "phase": 3,
                           "series_id": "s", "config_sha256": s["config_sha256"], "input_sha256": s["input_sha256"],
                           "photo": photo, "slot": slot})

    def rating(self, series, cfg_name, photo, slot, pref, ref="local", **flags):
        s = self.slot_key(series, cfg_name, photo, slot)
        self.n += 1
        r = {"rating_id": f"r{self.n}", "photo": photo, "preference": pref,
             "candidate": {"config_sha256": s["config_sha256"], "slot": slot, "input_sha256": s["input_sha256"],
                           "output_sha256": flags.pop("output", None) or f"{cfg_name}-{photo}-{slot}-1-ok",
                           "auto_common_sha256": "A"},
             "reference": {"kind": ref, "input_sha256": s["input_sha256"], "auto_common_sha256": "A"},
             "reason": "because" if pref.endswith("clear") else "",
             "clear_reason_type": "independent_gain" if pref == "candidate-clear" else None}
        r.update(flags)
        return r

    def tally(self, series, ratings, gate="tuning", split="tuning"):
        export = self.tmp / f"export-{uuid.uuid4().hex}.json"
        export.write_text(json.dumps({"split": split, "ratings": ratings}))
        out = self.tmp / "report.json"
        r = self.run_cli("tally", str(export), "--series", str(series), "--attempts",
                         str(self.private / "attempts.jsonl"), "--gate", gate, "--out", str(out))
        report = json.loads(out.read_text()) if r.returncode == 0 else None
        return r, report

    def only(self, report):
        (v,) = report["verdicts"].values()
        return v


class TuningGateTest(TallyWorld):
    def setUp(self):
        super().setUp()
        self.cfg = self.make_config(name="gpt")
        self.series = self.make_series([(self.cfg, "tuning", list(self.tuning), 1)])
        for p in self.tuning:
            self.attempt(self.series, "gpt", p, 1)

    def rate(self, prefs, **extra_by_photo):
        return [self.rating(self.series, "gpt", p, 1, pref, **extra_by_photo.get(p, {}))
                for p, pref in zip(self.tuning, prefs)]

    def test_six_of_eight_with_one_moderate_loss_passes(self):
        r, rep = self.tally(self.series, self.rate(["candidate-clear"] * 6 + ["reference-clear", "tie"]))
        self.assertEqual(r.returncode, 0, r.stderr)
        v = self.only(rep)
        self.assertEqual(v["verdict"], "PASS")
        self.assertEqual(v["counts"], {"clear win": 6, "moderate loss": 1, "tie": 1})

    def test_five_of_eight_stops(self):
        r, rep = self.tally(self.series, self.rate(["candidate-clear"] * 5 + ["tie"] * 3))
        self.assertEqual(r.returncode, 0)
        self.assertEqual(self.only(rep)["verdict"], "STOP")
        self.assertIn("5 clear wins of 8, needs ≥ 6", self.only(rep)["reasons"])

    def test_two_moderate_losses_stop(self):
        r, rep = self.tally(self.series, self.rate(["candidate-clear"] * 6 + ["reference-clear"] * 2))
        self.assertEqual(self.only(rep)["reasons"], ["2 moderate losses, allows ≤ 1"])

    def test_confirmed_content_change_is_severe_and_stops(self):
        flags = {"T-01": {"content_change": True, "crop_note": "sign → new letters"}}
        r, rep = self.tally(self.series, self.rate(["candidate-clear"] * 8, **flags))
        v = self.only(rep)
        self.assertEqual(v["counts"], {"clear win": 7, "severe regression": 1, "content change": 1})
        self.assertEqual(v["verdict"], "STOP")
        self.assertIn("1 confirmed content change(s), allows 0", v["reasons"])

    def test_unverified_lettering_alone_is_not_a_clear_win(self):
        flags = {p: {"unverified_reconstruction": True, "clear_reason_type": "unverified_lettering"}
                 for p in self.tuning[:2]}
        r, rep = self.tally(self.series, self.rate(["candidate-clear"] * 8, **flags))
        v = self.only(rep)
        self.assertEqual(v["counts"], {"clear win": 6, "tie": 2})
        self.assertEqual(v["verdict"], "PASS")
        rows = {x["photo"]: x for x in v["rows"]}
        self.assertEqual(rows["T-01"]["reason"], "clear preference rests only on unverified lettering")

    def test_unverified_flag_with_independent_gain_can_win(self):
        flags = {"T-01": {"unverified_reconstruction": True, "clear_reason_type": "independent_gain",
                          "reason": "far less noise in the sky"}}
        r, rep = self.tally(self.series, self.rate(["candidate-clear"] * 6 + ["tie"] * 2, **flags))
        self.assertEqual(self.only(rep)["counts"]["clear win"], 6)
        self.assertEqual(self.only(rep)["verdict"], "PASS")

    def test_technical_failure_keeps_the_denominator_and_stops(self):
        series =self.make_series([(self.make_config(name="gpt2"), "tuning", list(self.tuning), 1)], series_id="b")
        for p in self.tuning[:7]:
            self.attempt(series, "gpt2", p, 1)
        self.terminal(series, "gpt2", "T-08", 1)
        ratings = [self.rating(series, "gpt2", p, 1, "candidate-clear", output=f"gpt2-{p}-1-1-ok")
                   for p in self.tuning[:7]]
        r, rep = self.tally(series, ratings)
        self.assertEqual(r.returncode, 0, r.stderr)
        v = self.only(rep)
        self.assertEqual(v["verdict"], "STOP")
        self.assertEqual(v["denominator"], 8)
        self.assertIn("incomplete evidence: T-08 technical_failure (denominator stays 8)", v["reasons"])

    def test_missing_record_is_invalid_evidence(self):
        series = self.make_series([(self.make_config(name="gpt3"), "tuning", list(self.tuning), 1)], series_id="c")
        for p in self.tuning[:7]:
            self.attempt(series, "gpt3", p, 1)
        ratings = [self.rating(series, "gpt3", p, 1, "tie", output=f"gpt3-{p}-1-1-ok") for p in self.tuning[:7]]
        r, _ = self.tally(series, ratings)
        self.assertEqual(r.returncode, 2)
        self.assertIn("no record for T-08", r.stderr)

    def test_missing_rating_is_invalid_evidence(self):
        r, _ = self.tally(self.series, self.rate(["tie"] * 7))
        self.assertEqual(r.returncode, 2)
        self.assertIn("T-08 slot 1 has no rating against Local", r.stderr)

    def test_duplicate_rating_ids_and_double_ratings_are_invalid(self):
        ratings = self.rate(["tie"] * 8)
        ratings[1]["rating_id"] = ratings[0]["rating_id"]
        self.assertEqual(self.tally(self.series, ratings)[0].returncode, 2)
        ratings = self.rate(["tie"] * 8) + [self.rating(self.series, "gpt", "T-01", 1, "tie")]
        r, _ = self.tally(self.series, ratings)
        self.assertEqual(r.returncode, 2)
        self.assertIn("rated twice", r.stderr)

    def test_unknown_config_is_invalid(self):
        ratings = self.rate(["tie"] * 8)
        ratings[0]["candidate"]["config_sha256"] = "f" * 64
        r, _ = self.tally(self.series, ratings)
        self.assertEqual(r.returncode, 2)
        self.assertIn("not an expected slot", r.stderr)

    def test_wrong_split_is_invalid(self):
        r, _ = self.tally(self.series, self.rate(["tie"] * 8), split="validation")
        self.assertEqual(r.returncode, 2)

    def test_clear_win_without_reason_is_invalid(self):
        ratings = self.rate(["candidate-clear"] + ["tie"] * 7)
        ratings[0]["reason"] = ""
        r, _ = self.tally(self.series, ratings)
        self.assertEqual(r.returncode, 2)
        self.assertIn("needs a reason", r.stderr)

    def test_content_change_without_crop_note_is_invalid(self):
        ratings = self.rate(["tie"] * 8, **{"T-01": {"content_change": True}})
        r, _ = self.tally(self.series, ratings)
        self.assertEqual(r.returncode, 2)
        self.assertIn("crop note", r.stderr)


class CoreGateTest(TallyWorld):
    def setUp(self):
        super().setUp()
        self.core = ["T-01", "T-02", "T-03"]
        self.gpt = self.make_config(name="gpt")
        self.naf = self.make_config(name="naf", kind="nafnet")
        self.probe = self.make_config(name="large")
        self.series = self.make_series([(self.gpt, "core", self.core, 3), (self.naf, "core", self.core, 1),
                                        (self.probe, "probe", ["T-02", "T-03"], 1)])
        for p in self.core:
            for n in (1, 2, 3):
                self.attempt(self.series, "gpt", p, n)
            self.attempt(self.series, "naf", p, 1)

    def gpt_ratings(self, prefs, **flags):
        out = []
        for i, (p, n) in enumerate([(p, n) for p in self.core for n in (1, 2, 3)]):
            out.append(self.rating(self.series, "gpt", p, n, prefs[i], output=f"gpt-{p}-{n}-1-ok",
                                   **flags.get(f"{p}/{n}", {})))
        return out

    def naf_ratings(self, vs_control):
        out = []
        for p, pref in zip(self.core, vs_control):
            out.append(self.rating(self.series, "naf", p, 1, "tie", output=f"naf-{p}-1-1-ok"))
            out.append(self.rating(self.series, "naf", p, 1, pref, ref="control", output=f"naf-{p}-1-1-ok"))
        return out

    def verdicts(self, report):
        return {v["name"]: v for v in report["verdicts"].values()}

    def test_stable_core_passes_and_probe_stays_diagnostic(self):
        ratings = self.gpt_ratings(["candidate-clear", "tie", "candidate-slight"] * 3)
        ratings += self.naf_ratings(["candidate-clear", "candidate-slight", "tie"])
        r, rep = self.tally(self.series, ratings, gate="core")
        self.assertEqual(r.returncode, 0, r.stderr)
        v = self.verdicts(rep)
        self.assertEqual((v["gpt"]["verdict"], v["naf"]["verdict"], v["large"]["verdict"]),
                         ("PASS", "PASS", "DIAGNOSTIC"))

    def test_repeat_spread_from_win_to_loss_stops(self):
        prefs = ["candidate-clear", "tie", "reference-clear"] + ["tie"] * 6
        r, rep = self.tally(self.series, self.gpt_ratings(prefs) + self.naf_ratings(["candidate-clear"] * 3),
                            gate="core")
        v = self.verdicts(rep)["gpt"]
        self.assertEqual(v["verdict"], "STOP")
        self.assertEqual(v["reasons"], ["T-01: repeats span a clear win and moderate loss"])

    def test_any_content_change_in_nine_stops(self):
        flags = {"T-03/3": {"content_change": True, "crop_note": "flag → spread out"}}
        r, rep = self.tally(self.series, self.gpt_ratings(["tie"] * 9, **flags)
                            + self.naf_ratings(["candidate-clear"] * 3), gate="core")
        v = self.verdicts(rep)["gpt"]
        self.assertEqual(v["verdict"], "STOP")
        self.assertEqual(v["reasons"], ["confirmed content change on T-03/3: flag → spread out"])

    def test_nafnet_needs_two_of_three_over_its_control(self):
        r, rep = self.tally(self.series, self.gpt_ratings(["tie"] * 9)
                            + self.naf_ratings(["candidate-clear", "tie", "reference-slight"]), gate="core")
        v = self.verdicts(rep)["naf"]
        self.assertEqual(v["verdict"], "STOP")
        self.assertEqual(v["reasons"], ["NAFNet preferred over its control on 1 of 3, needs ≥ 2"])

    def test_control_with_other_input_is_invalid(self):
        ratings = self.gpt_ratings(["tie"] * 9) + self.naf_ratings(["candidate-clear"] * 3)
        ratings[-1]["reference"]["input_sha256"] = "0" * 64
        r, _ = self.tally(self.series, ratings, gate="core")
        self.assertEqual(r.returncode, 2)
        self.assertIn("same prepared input", r.stderr)

    def test_later_repeat_cannot_replace_the_first_valid_result(self):
        self.attempt(self.series, "gpt", "T-01", 1, ordinal=2)  # a second attempt after a valid one
        r, _ = self.tally(self.series, self.gpt_ratings(["tie"] * 9) + self.naf_ratings(["tie"] * 3), gate="core")
        self.assertEqual(r.returncode, 2)
        self.assertIn("cannot replace it", r.stderr)

    def test_incomplete_core_stops(self):
        series = self.make_series([(self.make_config(name="g2"), "core", self.core, 3)], series_id="inc")
        for p in self.core:
            for n in (1, 2, 3):
                if (p, n) == ("T-02", 3):
                    self.terminal(series, "g2", p, n)
                else:
                    self.attempt(series, "g2", p, n)
        ratings = [self.rating(series, "g2", p, n, "tie", output=f"g2-{p}-{n}-1-ok")
                   for p in self.core for n in (1, 2, 3) if (p, n) != ("T-02", 3)]
        r, rep = self.tally(series, ratings, gate="core")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.only(rep)["reasons"], ["incomplete core: T-02/3 technical_failure"])


class PrerequisiteTest(TallyWorld):
    def test_stop_report_never_satisfies_a_prerequisite(self):
        cfg = self.make_config(name="gpt")
        h = sha(cfg)
        for verdict, ok in (("STOP", False), ("PASS", True)):
            report = self.tmp / f"core-{verdict}.json"
            report.write_text(json.dumps({"verdicts": {h: {"verdict": verdict}}}))
            series = {"prerequisites": [{"id": "core", "stage": "core", "report": str(report),
                                         "report_sha256": sha(report), "config_sha256": h}]}
            slot = {"photo": "T-04", "slot": 1, "requires": ["core"]}
            if ok:
                runner.check_prerequisites(series, [slot])
            else:
                with self.assertRaises(Exception) as cm:
                    runner.check_prerequisites(series, [slot])
                self.assertIn("only PASS permits", str(cm.exception))

    def test_tuning_gate_needs_a_linked_passing_core(self):
        cfg = self.make_config(name="gpt")
        series = self.make_series([(cfg, "core", ["T-01", "T-02", "T-03"], 1),
                                   (cfg, "tuning", ["T-04", "T-05", "T-06", "T-07", "T-08"], 1)])
        for p in self.tuning:
            self.attempt(series, "gpt", p, 1)
        ratings = [self.rating(series, "gpt", p, 1, "candidate-clear") for p in self.tuning]
        r, rep = self.tally(series, ratings)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.only(rep)["verdict"], "STOP")
        self.assertIn("no linked PASS core report for this config", self.only(rep)["reasons"])


class ValidationGateTest(TallyWorld):
    def setUp(self):
        super().setUp()
        self.prepare_validation()

    def prepare_validation(self):
        # Synthetic validation photos may be prepared here only by rewriting them as tuning in a
        # second manifest: the real guard refuses validation ids, which test_protocol covers.
        for e in self.entries:
            e["split"] = "tuning"
        self.write_manifest(self.entries)
        self.prepare(*self.validation)
        for e in self.entries:
            if e["id"].startswith("V"):
                e["split"] = "validation"
        self.write_manifest(self.entries)

    def test_eight_of_twelve_passes_and_seven_stops(self):
        cfg = self.make_config(name="final")
        series = self.make_series([(cfg, "validation", list(self.validation), 1)], split="validation")
        for p in self.validation:
            self.attempt(series, "final", p, 1)
        for wins, verdict in ((8, "PASS"), (7, "STOP")):
            prefs = ["candidate-clear"] * wins + ["reference-clear"] + ["tie"] * (11 - wins)
            ratings = [self.rating(series, "final", p, 1, pref) for p, pref in zip(self.validation, prefs)]
            r, rep = self.tally(series, ratings, gate="validation", split="validation")
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(self.only(rep)["verdict"], verdict)
            self.assertEqual(self.only(rep)["counts"]["clear win"], wins)


if __name__ == "__main__":
    import unittest

    unittest.main()
