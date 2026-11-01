"""historical.py and `local-arms.ts --attempts`: Phase 2's spike outputs, indexed and rendered.

The spike folder is synthetic: generated inputs and outputs with meta.json files in the shape
feasibility.py wrote. The builder runs in-process with its call list pointed at test photos; the
arms run through the real `local-arms.ts` CLI against an Auto record whose parameters come from
the app's own `recommendParams`.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
import unittest
import uuid
from unittest import mock

from PIL import Image

from fixtures import ROOT, World, load, sha

historical = load("historical")
protocol = historical.protocol

STATS = {"mean": 0.12, "p05": 0.01, "p25": 0.05, "p50": 0.1, "p75": 0.16, "p95": 0.25, "p99": 0.4,
         "shadowRatio": 0.8, "highlightRatio": 0.001, "clipRatio": 0.0002}


class HistoricalWorld(World):
    def setUp(self):
        super().setUp()
        self.prepare("T-01")
        self.spike = self.tmp / "spike"
        self.evaluations = self.tmp / "evaluations"
        self.env.update(S19_SPIKE=str(self.spike), S19_EVALUATIONS=str(self.evaluations))
        for k in ("S19_SPIKE", "S19_EVALUATIONS"):
            self._saved.setdefault(k, os.environ.get(k))
        os.environ.update(S19_SPIKE=str(self.spike), S19_EVALUATIONS=str(self.evaluations))
        side = self.sidecar("T-01")["nafnet"]
        self.naf_input = self.spike / "_inputs" / "T-01-max.jpg"
        self.naf_input.parent.mkdir(parents=True)
        Image.new("RGB", side["dimensions"], (60, 50, 40)).save(self.naf_input, quality=95)
        self.spike_call("gpt-T-01", self.photos / "T-01.jpg", (64, 48), "2026-10-30T21:00:00Z")
        self.spike_call("naf-T-01", self.naf_input, tuple(side["dimensions"]), "2026-10-30T22:00:00Z")
        self.calls = [("gpt-spike", "gpt-T-01", "T-01", [64, 48]), ("nafnet-spike", "naf-T-01", "T-01", None)]
        patch = mock.patch.object(historical, "CALLS", self.calls)
        patch.start()
        self.addCleanup(patch.stop)

    def spike_call(self, call, inp, size, run_at):
        d = self.spike / call
        d.mkdir(parents=True)
        Image.new("RGB", size, (90, 80, 70)).save(d / "output.png")
        (d / "meta.json").write_text(json.dumps({
            "call": call, "run_at": run_at, "wall_s": 1.5, "input": str(inp), "input_sha256": sha(inp),
            "output": {"width": size[0], "height": size[1], "format": "PNG", "icc_profile": False,
                       "sha256": sha(d / "output.png"), "bytes": (d / "output.png").stat().st_size},
            "usage": {"total_tokens": 10}}))

    def write_index(self):
        for p, text in historical.build().items():
            path = protocol.resolve(p)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
        return self.evaluations / "phase2-series.json", self.evaluations / "phase2-attempts.jsonl"


class IndexTest(HistoricalWorld):
    def test_index_records_the_spike_hashes_labels_unknowns_and_is_deterministic(self):
        first = historical.build()
        self.assertEqual(first, historical.build(), "a rebuild on unchanged files must give identical bytes")
        series_path, ledger_path = self.write_index()
        series = json.loads(series_path.read_text())
        self.assertEqual((series["phase"], series["historical"], series["split"]), (2, True, "tuning"))
        for h, meta in series["configs"].items():
            self.assertEqual(sha(protocol.resolve(meta["path"])), h, "a config hash is its file's bytes")
        naf = next(s for s in series["slots"] if s["kind"] == "nafnet")
        self.assertEqual((naf["input_sha256"], naf["input_path"]), (sha(self.naf_input), str(self.naf_input)))
        rows = [json.loads(line) for line in ledger_path.read_text().splitlines()]
        self.assertEqual([r["event"] for r in rows], ["reserve", "result"] * 2)
        result = rows[1]
        self.assertEqual(result["output_sha256"], sha(self.spike / "gpt-T-01" / "output.png"))
        self.assertEqual(result["unknown_historical_fields"], {"http_status": None, "cost_usd": None})
        self.assertIsNone(rows[0]["unknown_historical_fields"]["reserved_usd"])
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(historical.main(["--check"]), 0)
            series_path.write_text(series_path.read_text().replace('"phase": 2', '"phase": 3'))
            self.assertEqual(historical.main(["--check"]), 1, "--check must notice an edited index")

    def test_changed_spike_files_are_refused(self):
        (self.spike / "gpt-T-01" / "output.png").write_bytes(b"not the output")
        with self.assertRaisesRegex(protocol.Refused, "not the output the spike recorded"):
            historical.build()
        self.setUp()
        self.naf_input.write_bytes(b"other input")
        with self.assertRaisesRegex(protocol.Refused, "no longer hashes to the input the spike recorded"):
            historical.build()

    def test_a_validation_photo_is_refused_before_any_read(self):
        historical.CALLS.append(("gpt-spike", "gpt-V-01", "V-01", [64, 48]))  # no such folder exists
        with self.assertRaisesRegex(protocol.Refused, "validation photo"):
            historical.build()


class ArmsTest(HistoricalWorld):
    def setUp(self):
        super().setUp()
        self.series, self.ledger = self.write_index()
        self.naf_cfg = next(protocol.resolve(m["path"]) for m in json.loads(self.series.read_text())["configs"].values()
                            if m["kind"] == "nafnet")
        local = subprocess.run(
            ["npx", "--no-install", "tsx", "--eval",
             "import { recommendParams } from './src/lib/engines/auto-params';"
             f"console.log(JSON.stringify(recommendParams({json.dumps(STATS)}, 'local')))"],
            capture_output=True, text=True, cwd=ROOT, check=True)
        rec = {"id": "T-01", "common_sha256": self.sidecar("T-01")["common"]["sha256"], "stats": STATS,
               "local": json.loads(local.stdout), "session_id": uuid.uuid4().hex}
        (self.private / "local").mkdir(parents=True, exist_ok=True)
        (self.private / "local" / "T-01.auto.json").write_text(json.dumps(rec))
        self.gamma = rec["local"]["gamma"]

    def arm(self, arm, *extra):
        return self.run_cli("local-arms", arm, "T-01", "--attempts", str(self.ledger), "--nafnet-config",
                            str(self.naf_cfg), *extra, tsx=True)

    def record(self, arm):
        return json.loads((self.private / "arms" / "phase2-attempts" / arm / "T-01.json").read_text())

    def test_both_arms_start_from_the_historical_slot(self):
        for arm in ("nafnet-gamma", "control"):
            r = self.arm(arm)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        naf = self.record("nafnet-gamma")
        self.assertEqual(naf["source"]["kind"], "ledger")
        self.assertEqual(naf["source"]["output_sha256"], sha(self.spike / "naf-T-01" / "output.png"))
        self.assertEqual(naf["source"]["config_sha256"], sha(self.naf_cfg))
        self.assertTrue(naf["source"]["ledger"].endswith("phase2-attempts.jsonl"))
        ctl = self.record("control")
        self.assertEqual(ctl["input_sha256"], sha(self.naf_input), "the control reproduces the spike's input")
        self.assertNotEqual(ctl["input_sha256"], self.sidecar("T-01")["nafnet"]["sha256"])
        self.assertEqual((ctl["gamma"], naf["gamma"]), (self.gamma, self.gamma))
        self.assertFalse((self.private / "arms" / "control" / "T-01.png").exists(), "a gate arm was written")

    def test_a_changed_input_or_wrong_use_is_refused(self):
        self.naf_input.write_bytes(self.naf_input.read_bytes() + b"x")
        r = self.arm("control")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("no longer the input the ledger recorded", r.stdout)
        for args, why in ((("local-equiv",), "--attempts needs control or nafnet-gamma"),
                          (("nafnet-gamma", "--source", str(self.naf_input)), "two different NAFNet sources")):
            with self.subTest(why=why):
                r = self.run_cli("local-arms", args[0], "T-01", "--attempts", str(self.ledger), *args[1:], tsx=True)
                self.assertEqual(r.returncode, 1, r.stdout)
                self.assertIn(why, r.stderr)

    def test_the_diagnostic_tally_accepts_the_historical_ratings(self):
        self.assertEqual(self.arm("nafnet-gamma").returncode, 0)
        self.assertEqual(self.arm("control").returncode, 0)
        series = json.loads(self.series.read_text())
        gpt, naf = (next(s for s in series["slots"] if s["kind"] == k) for k in ("gpt", "nafnet"))
        rec_path = self.private / "arms" / "phase2-attempts" / "nafnet-gamma" / "T-01.json"
        rec, ctl = self.record("nafnet-gamma"), self.record("control")
        auto = rec["auto_record"]["common_sha256"]
        derived = {"arm": "nafnet-gamma", "record": str(rec_path), "record_sha256": sha(rec_path),
                   "source_output_sha256": rec["source"]["output_sha256"]}

        def rating(n, s, out, ref, pref="tie", **cand):
            return {"rating_id": f"r{n}", "photo": "T-01", "preference": pref,
                    "candidate": {"config_sha256": s["config_sha256"], "slot": 1, "input_sha256": s["input_sha256"],
                                  "output_sha256": out, "auto_common_sha256": auto, **cand},
                    "reference": ref, "reason": ""}

        local = {"kind": "local", "sha256": "historical-download"}
        control = {"kind": "control", "sha256": ctl["output_sha256"], "input_sha256": ctl["input_sha256"],
                   "auto_common_sha256": auto}
        ratings = [rating(1, gpt, sha(self.spike / "gpt-T-01" / "output.png"), local),
                   rating(2, naf, rec["output_sha256"], local, derived=dict(derived)),
                   rating(3, naf, rec["output_sha256"], control, "candidate-slight", derived=dict(derived))]
        export = self.tmp / "export.json"
        export.write_text(json.dumps({"split": "tuning", "ratings": ratings}))
        out = self.tmp / "report.json"
        r = self.run_cli("tally", str(export), "--series", str(self.series), "--attempts", str(self.ledger),
                         "--diagnostic", "--out", str(out))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual({v["verdict"] for v in json.loads(out.read_text())["verdicts"].values()}, {"DIAGNOSTIC"})


if __name__ == "__main__":
    unittest.main()
