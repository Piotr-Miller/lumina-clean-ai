"""Phase 4 exposure curve (curve.ts) and the curve arms of `local-arms.ts`.

The curve is checked through tsx against independently stated properties: it pins black and
white, never lifts more than Local's gamma, applies the full gamma lift between the median and
p95, only λ0 of it in the darkest tones, and fades it above p95. The arms run through the real CLI
on a synthetic world whose gate ledger holds one NAFNet result.
"""

from __future__ import annotations

import json
import subprocess
import uuid

from PIL import Image

from fixtures import ROOT, World, load, sha

runner = load("run-candidate")

STATS = {"mean": 0.12, "p05": 0.02, "p25": 0.05, "p50": 0.1, "p75": 0.16, "p95": 0.6, "p99": 0.8,
         "shadowRatio": 0.8, "highlightRatio": 0.001, "clipRatio": 0.0002}
CFG = {"name": "curve-test", "lambda0": 0.5, "highlight_fade": 0.5}


def tsx(code: str) -> str:
    return subprocess.run(["npx", "--no-install", "tsx", "--eval", code], capture_output=True, text=True,
                          cwd=ROOT, check=True).stdout


class CurveTest(World):
    def values(self, gamma: float, xs: list[float]) -> list[float]:
        out = tsx("import { curve } from './scripts/s19/curve';"
                  f"console.log(JSON.stringify({json.dumps(xs)}.map((x) => curve(x, {gamma}, "
                  f"{json.dumps(STATS)}, {json.dumps(CFG)}))))")
        return json.loads(out)

    def test_shape(self):
        g = 1.8
        xs = [i / 100 for i in range(101)]
        ys = self.values(g, xs)
        self.assertEqual((ys[0], ys[-1]), (0, 1), "black and white stay pinned")
        self.assertTrue(all(b >= a for a, b in zip(ys, ys[1:])), "the curve is monotone")
        for x, y in zip(xs, ys):
            self.assertGreaterEqual(y, x - 1e-12, f"never darkens ({x})")
            self.assertLessEqual(y, x ** (1 / g) + 1e-12, f"never lifts more than Local's gamma ({x})")
        mid, dark, bright = self.values(g, [0.3, 0.01, 0.99])
        self.assertAlmostEqual(mid, 0.3 ** (1 / g), places=12, msg="full gamma between the median and p95")
        self.assertAlmostEqual(dark, 0.01 + 0.5 * (0.01 ** (1 / g) - 0.01), places=12, msg="λ0 below p05")
        lift = 0.99 ** (1 / g) - 0.99
        self.assertLess(bright - 0.99, 0.6 * lift, "the lift fades above p95")


class CurveArmsTest(World):
    def setUp(self):
        super().setUp()
        self.prepare("T-01")
        side = self.sidecar("T-01")
        local = json.loads(tsx("import { recommendParams } from './src/lib/engines/auto-params';"
                               f"console.log(JSON.stringify(recommendParams({json.dumps(STATS)}, 'local')))"))
        (self.private / "local").mkdir(parents=True, exist_ok=True)
        (self.private / "local" / "T-01.auto.json").write_text(json.dumps(
            {"id": "T-01", "common_sha256": side["common"]["sha256"], "stats": STATS, "local": local,
             "session_id": uuid.uuid4().hex}))
        self.naf_cfg = self.make_config(name="naf", kind="nafnet")
        out = self.tmp / "naf-out.png"
        Image.new("RGB", side["nafnet"]["dimensions"], (40, 50, 60)).save(out)
        with runner.locked():
            runner.append({"event": "reserve", "attempt_id": "a1", "phase": 3, "series_id": "s",
                           "config_sha256": sha(self.naf_cfg), "config_name": "naf",
                           "input_sha256": side["nafnet"]["sha256"], "photo": "T-01", "slot": 1, "ordinal": 1,
                           "role": "core", "request_size": side["nafnet"]["dimensions"], "reserved_usd": 1.0,
                           "requested_at": "t"})
            runner.append({"event": "result", "attempt_id": "a1", "status": "ok", "transient": False,
                           "cost_usd": None, "output_path": str(out), "output_sha256": sha(out)})
        self.curve = self.tmp / "curve.json"
        self.curve.write_text(json.dumps(CFG))

    def arm(self, arm):
        r = self.run_cli("local-arms", arm, "T-01", "--nafnet-config", str(self.naf_cfg), "--curve-config",
                         str(self.curve), tsx=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return json.loads((self.private / "arms" / arm / "T-01.json").read_text())

    def test_curve_arms_name_their_curve_and_share_the_control_input(self):
        naf, ctl, blur = self.arm("nafnet-curve"), self.arm("control-curve"), self.arm("blur-curve")
        for rec in (naf, ctl, blur):
            self.assertEqual(rec["tone"]["kind"], "curve")
            self.assertEqual(rec["tone"]["config_sha256"], sha(self.curve))
        side = self.sidecar("T-01")
        self.assertEqual(naf["source"]["kind"], "ledger")
        # Small test photos need no downscale, so both inputs share one hash; check the files too.
        self.assertEqual(ctl["input_sha256"], side["nafnet"]["sha256"], "the control starts from NAFNet's input")
        self.assertTrue(ctl["input"].endswith("T-01-nafnet.jpg"), ctl["input"])
        self.assertEqual(blur["input_sha256"], side["common"]["sha256"], "blur+curve starts from the common input")
        self.assertTrue(blur["input"].endswith("T-01-common.jpg"), blur["input"])
        self.assertGreater(blur["blur_sigma_px"], 0)
        self.assertEqual(self.arm("nafnet-gamma")["tone"], {"kind": "gamma"})

    def test_a_curve_arm_differs_from_its_gamma_arm(self):
        self.arm("control")
        self.arm("control-curve")
        a = Image.open(self.private / "arms" / "control" / "T-01.png").tobytes()
        b = Image.open(self.private / "arms" / "control-curve" / "T-01.png").tobytes()
        self.assertNotEqual(a, b, "the curve must change the rendered pixels")


if __name__ == "__main__":
    import unittest

    unittest.main()
