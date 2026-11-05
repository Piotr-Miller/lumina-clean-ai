"""S-20 step 1a, plan Phase 2: `nlm.py`, its grid and its calibration.

The tools run in the S-19 fixtures world (`scripts/s19/tests/fixtures.py`). S20_PRIVATE points at
a temporary workspace, and S20_REPO at a temporary Git repository that holds committed copies of
the rule files, so the order-step-2 check is exercised without depending on this checkout's state.
No real photo, decoded image or render is read.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock

import numpy as np
from PIL import Image

S20 = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(S20.parent / "s19" / "tests"))

from fixtures import ROOT, World, sha  # noqa: E402

NLM = S20 / "nlm.py"
CAL_REL = "context/changes/cloud-classical-denoise/evaluations/step1-calibration.md"
GRID_REL = "scripts/s20/configs/nlm-grid.json"
COPIED = ("scripts/s20/nlm.py", "scripts/s20/evidence.py", GRID_REL, "scripts/s19/local-arms.ts",
          "scripts/s19/s19.ts")
PID = "T-01"
KS = ("k1.0", "k1.5", "k2.0")
RECORD_FIELDS = {"id", "k", "sigma_hat_L", "sigma_hat_ab", "h", "h_color", "windows", "decoded_record",
                 "decoded_pixels_sha256", "output_sha256", "dimensions", "config_sha256", "opencv_version",
                 "implementation_sha256", "rendered_at"}


def load_nlm():
    spec = importlib.util.spec_from_file_location("s20_nlm", NLM)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


nlm = load_nlm()


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                           "-c", "commit.gpgsign=false", *args], capture_output=True, text=True, check=True).stdout


def png_chunks(path: Path) -> list[str]:
    data = path.read_bytes()
    out, i = [], 8
    while i < len(data):
        n = int.from_bytes(data[i:i + 4], "big")
        out.append(data[i + 4:i + 8].decode("ascii"))
        i += 12 + n
    return out


def textured(w: int = 64, h: int = 48, seed: int = 7) -> np.ndarray:
    """An asymmetric colour (R high, G low, B middle) with noise, so σ̂ > 0 and a swap shows."""
    rng = np.random.default_rng(seed)
    base = np.array([200, 40, 120], dtype=np.float64)
    ramp = np.linspace(-20, 20, w)[None, :, None]
    return np.clip(np.rint(base + ramp + rng.normal(0, 6, (h, w, 3))), 0, 255).astype(np.uint8)


class RepoTemplate:
    """One committed copy of the rule files, calibrated by the real nlm.py, shared by the tests."""

    path: Path | None = None

    @classmethod
    def get(cls) -> Path:
        if cls.path is None:
            tmp = Path(tempfile.mkdtemp(prefix="s20-repo-"))
            for rel in COPIED:
                (tmp / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / rel, tmp / rel)
            env = {**os.environ, "S20_REPO": str(tmp)}
            r = subprocess.run([sys.executable, "-B", str(NLM), "--calibrate"], capture_output=True, text=True,
                               env=env)
            assert r.returncode == 0, r.stdout + r.stderr
            git(tmp, "init", "-q")
            git(tmp, "add", "-A")
            git(tmp, "commit", "-q", "-m", "rules")
            cls.path = tmp
        return cls.path


def tearDownModule():
    if RepoTemplate.path:
        shutil.rmtree(RepoTemplate.path, True)


class NlmWorld(World):
    def setUp(self):
        super().setUp()
        self.s20 = self.tmp / "s20"
        self.repo = self.tmp / "repo"
        shutil.copytree(RepoTemplate.get(), self.repo, symlinks=True)
        self.env.update(S20_PRIVATE=str(self.s20), S20_REPO=str(self.repo))
        saved = {k: os.environ.get(k) for k in ("S20_PRIVATE", "S20_REPO")}
        os.environ.update(S20_PRIVATE=str(self.s20), S20_REPO=str(self.repo))
        self.addCleanup(lambda: [os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
                                 for k, v in saved.items()])
        self.prepare(PID)

    # ------------------------------------------------------------ helpers

    def write_decoded(self, rgb: np.ndarray, pid: str = PID) -> Path:
        """What `local-arms.ts decoded` writes: a metadata-free PNG and its record."""
        d = self.s20 / "decoded"
        d.mkdir(parents=True, exist_ok=True)
        png = d / f"{pid}.png"
        Image.fromarray(rgb, "RGB").save(png, "PNG")
        h, w = rgb.shape[:2]
        (d / f"{pid}.json").write_text(json.dumps({
            "kind": "decoded", "id": pid, "common": {"path": "x", "sha256": self.sidecar(pid)["common"]["sha256"]},
            "common_sha256": self.sidecar(pid)["common"]["sha256"],
            "pixels_sha256": hashlib.sha256(np.ascontiguousarray(rgb).tobytes()).hexdigest(),
            "output_sha256": sha(png), "dimensions": [w, h]}))
        return png

    def nlm_cli(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, "-B", str(NLM), *args], capture_output=True, text=True,
                              env=self.env, cwd=ROOT)

    def ok(self, *args: str) -> subprocess.CompletedProcess:
        r = self.nlm_cli(*args)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r

    def refused(self, *args: str) -> str:
        r = self.nlm_cli(*args)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertNotIn("Traceback", r.stderr, "a refusal, not a crash")
        return r.stdout + r.stderr

    def out(self, k: str, pid: str = PID) -> tuple[Path, Path]:
        d = self.s20 / "nlm" / k
        return d / f"{pid}.png", d / f"{pid}.json"

    def commit(self, *paths: str) -> None:
        git(self.repo, "add", "--", *paths)
        git(self.repo, "commit", "-q", "-m", "change")


class EstimatorTest(unittest.TestCase):
    def test_flat_noise_is_read_within_tolerance_through_the_real_path(self):
        import cv2

        base = np.full((256, 256), 128.0)
        for sigma in (3, 8, 15):
            with self.subTest(sigma=sigma):
                bgr = cv2.cvtColor(nlm.noisy_lab(base, sigma, 99), cv2.COLOR_Lab2LBGR)
                s = nlm.estimate(bgr)
                for c in "Lab":
                    self.assertLessEqual(abs(s[c] - nlm.sigma_eff(sigma)) / nlm.sigma_eff(sigma), 0.10, (c, s))
                self.assertAlmostEqual(s["ab"], (s["a"] + s["b"]) / 2)

    def test_estimator_equals_a_direct_3x3_correlation_whatever_the_strip_size(self):
        rng = np.random.default_rng(3)
        ch = rng.integers(0, 256, (37, 53), dtype=np.uint8)
        k = np.array(nlm.KERNEL, dtype=np.float64)
        a = ch.astype(np.float64)
        total = sum(abs(float((a[y:y + 3, x:x + 3] * k).sum())) for y in range(35) for x in range(51))
        expected = np.sqrt(np.pi / 2) * total / (6 * 51 * 35)
        whole = nlm.immerkaer(ch)
        self.assertAlmostEqual(whole, expected, places=12)
        for rows in (1, 5, 34):
            with self.subTest(strip_rows=rows), mock.patch.object(nlm, "STRIP_ROWS", rows):
                self.assertEqual(nlm.immerkaer(ch), whole, "the sum is exact, so strips cannot change it")

    def test_a_constant_image_estimates_zero(self):
        self.assertEqual(nlm.immerkaer(np.full((20, 20), 77, dtype=np.uint8)), 0.0)

    def test_mapping_rounds_to_two_decimals(self):
        self.assertEqual(nlm.mapping(1.5, {"L": 3.14159, "ab": 2.00001}), (4.71, 3.0))
        self.assertEqual(nlm.mapping(2.0, {"L": 1.005, "ab": 0.5}), (round(2.0 * 1.005, 2), 1.0))

    def test_mapping_refuses_zero_non_finite_and_rounded_away_strength(self):
        # A bad estimate is refused as an estimate, naming the channel, before any strength is derived.
        for sigma, channel in (({"L": 0.0, "ab": 1.0}, "L"), ({"L": 1.0, "ab": 0.0}, "ab"),
                               ({"L": float("nan"), "ab": 1.0}, "L"), ({"L": float("inf"), "ab": 1.0}, "L"),
                               ({"L": 1.0, "ab": -2.0}, "ab")):
            with self.subTest(sigma=sigma), self.assertRaisesRegex(nlm.Refused, f"^σ̂_{channel} = .*not a vote"):
                nlm.mapping(1.0, sigma)
        # A positive estimate that rounds to a zero strength is refused as a strength.
        with self.assertRaisesRegex(nlm.Refused, "maps to h = 0.0, not a positive filter strength.*not a vote"):
            nlm.mapping(1.0, {"L": 0.001, "ab": 1.0})


class RenderTest(NlmWorld):
    def test_record_carries_every_contract_field_and_binds_its_inputs(self):
        rgb = textured()
        self.write_decoded(rgb)
        self.ok(PID)
        dec = json.loads((self.s20 / "decoded" / f"{PID}.json").read_text())
        grid = json.loads((self.repo / GRID_REL).read_text())
        import cv2

        for kd, k in zip(KS, grid["k"]):
            with self.subTest(k=kd):
                png, record = self.out(kd)
                rec = json.loads(record.read_text())
                self.assertLessEqual(RECORD_FIELDS, rec.keys())
                self.assertEqual((rec["id"], rec["k"]), (PID, k))
                self.assertEqual(rec["h"], round(k * rec["sigma_hat_L"], 2))
                self.assertEqual(rec["h_color"], round(k * rec["sigma_hat_ab"], 2))
                self.assertGreater(rec["h"], 0)
                self.assertEqual(rec["windows"], {"templateWindowSize": 7, "searchWindowSize": 21})
                self.assertEqual(rec["decoded_pixels_sha256"], dec["pixels_sha256"])
                self.assertEqual(Path(rec["decoded_record"]), self.s20 / "decoded" / f"{PID}.json")
                self.assertEqual(rec["output_sha256"], sha(png))
                self.assertEqual(rec["dimensions"], [rgb.shape[1], rgb.shape[0]])
                self.assertEqual(rec["config_sha256"], sha(self.repo / GRID_REL))
                self.assertEqual(rec["opencv_version"], cv2.__version__)
                self.assertEqual(rec["implementation_sha256"], sha(NLM))
                self.assertEqual(set(png_chunks(png)), {"IHDR", "IDAT", "IEND"}, "no metadata")
                with Image.open(png) as im:
                    self.assertEqual((im.mode, im.size), ("RGB", (rgb.shape[1], rgb.shape[0])))
        sigmas = {json.loads(self.out(kd)[1].read_text())["sigma_hat_L"] for kd in KS}
        self.assertEqual(len(sigmas), 1, "one estimate per photo, shared by every k")

    def test_channel_order_survives_a_no_op_denoiser(self):
        rgb = textured()
        self.write_decoded(rgb)
        with mock.patch.object(nlm, "denoise", lambda bgr, *a: bgr.copy()), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(nlm.main([PID]), 0)
        for kd in KS:
            with Image.open(self.out(kd)[0]) as im:
                got = np.asarray(im.convert("RGB"))
            self.assertTrue(np.array_equal(got, rgb), kd)
        self.assertGreater(got[..., 0].mean(), got[..., 2].mean() + 50, "R stays R: the colour is not swapped")

    def test_a_noiseless_photo_is_a_technical_refusal_not_a_vote(self):
        self.write_decoded(np.full((48, 64, 3), (50, 60, 70), dtype=np.uint8))
        for extra in ((), ("--estimate-only",)):
            with self.subTest(extra=extra):
                self.assertIn("σ̂_L = 0.0: a non-finite or zero noise estimate is a technical refusal, not a vote",
                              self.refused(PID, *extra))
        self.assertFalse((self.s20 / "nlm").exists())

    def test_a_tampered_decoded_png_is_refused(self):
        rgb = textured()
        png = self.write_decoded(rgb)
        bad = rgb.copy()
        bad[0, 0] = 255 - bad[0, 0]
        Image.fromarray(bad, "RGB").save(png, "PNG")
        self.assertIn("output_sha256", self.refused(PID))
        rec_path = self.s20 / "decoded" / f"{PID}.json"
        rec = json.loads(rec_path.read_text())
        rec["output_sha256"] = sha(png)  # the file hash re-recorded, the pixels still not
        rec_path.write_text(json.dumps(rec))
        self.assertIn("pixels_sha256", self.refused(PID))
        self.assertFalse((self.s20 / "nlm").exists())

    def test_a_decode_of_another_common_input_is_refused(self):
        self.write_decoded(textured())
        rec_path = self.s20 / "decoded" / f"{PID}.json"
        rec = json.loads(rec_path.read_text())
        rec["common_sha256"] = "0" * 64
        rec_path.write_text(json.dumps(rec))
        self.assertIn("current common input", self.refused(PID))

    def test_paths_into_the_holdout_are_refused_before_they_are_read(self):
        holdout = Path(next(e["path"] for e in self.entries if e["id"] == "V-01"))
        mode = holdout.stat().st_mode
        self.addCleanup(holdout.chmod, stat.S_IMODE(mode))
        targets = {"decoded PNG": self.s20 / "decoded" / f"{PID}.png",
                   "sidecar": self.private / "inputs" / f"{PID}.json"}
        for name, target in targets.items():
            with self.subTest(path=name):
                self.write_decoded(textured())
                self.prepare(PID)
                target.unlink()
                target.symlink_to(holdout)
                holdout.chmod(0)  # any open, hash or decode before the guard fails with EACCES instead
                self.assertIn("is a validation photo", self.refused(PID))
                holdout.chmod(stat.S_IMODE(mode))
                target.unlink()
        self.assertFalse((self.s20 / "nlm").exists())

    def test_a_validation_id_is_refused(self):
        self.assertIn("is a validation photo", self.refused("V-01"))

    def test_two_renders_give_identical_bytes(self):
        self.write_decoded(textured())
        self.ok(PID)
        first = {kd: (self.out(kd)[0].read_bytes(), json.loads(self.out(kd)[1].read_text())) for kd in KS}
        shutil.rmtree(self.s20 / "nlm")
        self.ok(PID)
        for kd in KS:
            png, rec = first[kd]
            again = json.loads(self.out(kd)[1].read_text())
            self.assertEqual(self.out(kd)[0].read_bytes(), png, kd)
            self.assertEqual({**rec, "rendered_at": None}, {**again, "rendered_at": None}, kd)

    def test_an_existing_render_is_never_overwritten(self):
        self.write_decoded(textured())
        self.ok(PID)
        before = self.out("k1.5")[0].read_bytes()
        self.assertIn("already rendered", self.refused(PID))
        self.assertEqual(self.out("k1.5")[0].read_bytes(), before)

    def test_estimate_only_prints_the_strengths_and_writes_nothing(self):
        self.write_decoded(textured())
        r = self.ok("--estimate-only", PID)
        line = json.loads(r.stdout.strip())
        self.assertEqual(set(line["strengths"]), set(KS))
        for kd in KS:
            k = float(kd[1:])
            self.assertEqual(line["strengths"][kd]["h"], round(k * line["sigma_hat"]["L"], 2))
            self.assertEqual(line["strengths"][kd]["h_color"], round(k * line["sigma_hat"]["ab"], 2))
        self.assertFalse((self.s20 / "nlm").exists())

    def test_usage_errors_exit_2(self):
        for args in ((), ("--calibrate", PID), ("--calibrate", "--all")):
            with self.subTest(args=args):
                self.assertEqual(self.nlm_cli(*args).returncode, 2)


class RulesTest(NlmWorld):
    def setUp(self):
        super().setUp()
        self.write_decoded(textured())

    def edit_grid(self, **change) -> None:
        path = self.repo / GRID_REL
        grid = json.loads(path.read_text())
        grid.update(change)
        path.write_text(json.dumps(grid, indent=2) + "\n")

    def test_a_modified_grid_blocks_a_real_render_but_not_estimate_only_or_calibrate(self):
        self.edit_grid(hypothesis="edited after calibration")
        msg = self.refused(PID)
        self.assertIn(f"{GRID_REL}: modified (unstaged)", msg)
        self.assertIn("committed and clean", msg)
        self.assertIn("git commit", msg, "the refusal names the way out")
        self.assertFalse((self.s20 / "nlm").exists())
        self.ok("--estimate-only", PID)
        self.ok("--calibrate")

    def test_a_staged_but_uncommitted_grid_is_refused(self):
        self.edit_grid(hypothesis="staged")
        git(self.repo, "add", "--", GRID_REL)
        self.assertIn(f"{GRID_REL}: modified (staged)", self.refused(PID))

    def test_an_untracked_tool_is_refused_but_an_untracked_test_is_not(self):
        (self.repo / "scripts/s20/tests").mkdir(parents=True, exist_ok=True)
        (self.repo / "scripts/s20/tests/test_x.py").write_text("")
        self.ok(PID)
        shutil.rmtree(self.s20 / "nlm")
        (self.repo / "scripts/s20/blind.py").write_text("")
        self.assertIn("scripts/s20/blind.py: untracked", self.refused(PID))

    def test_a_missing_rule_file_is_refused(self):
        (self.repo / "scripts/s19/s19.ts").unlink()
        self.assertIn("scripts/s19/s19.ts: deleted (unstaged)", self.refused(PID))
        self.commit("scripts/s19/s19.ts")
        self.assertIn("scripts/s19/s19.ts: missing and not tracked", self.refused(PID))

    def test_a_committed_grid_change_needs_a_new_calibration(self):
        self.edit_grid(hypothesis="changed and committed, not re-calibrated")
        self.commit(GRID_REL)
        msg = self.refused(PID)
        self.assertIn("config_sha256", msg)
        self.assertIn("re-run --calibrate", msg)
        self.ok("--calibrate")
        self.commit(CAL_REL)
        self.ok(PID)

    def test_the_bind_line_must_be_a_pass_for_this_opencv_and_appear_once(self):
        cal = self.repo / CAL_REL
        text = cal.read_text()
        cases = {
            "result=FAIL": (text.replace("result=PASS", "result=FAIL"), "calibration FAIL"),
            "opencv": (text.replace("opencv_version=4.13.0", "opencv_version=4.12.0"), "opencv_version"),
            "implementation": (text.replace("implementation_sha256=", "implementation_sha256=0"), "implementation"),
            "twice": (text + "\nS20-CALIBRATION result=PASS\n", "2 S20-CALIBRATION bind lines"),
        }
        for name, (body, expected) in cases.items():
            with self.subTest(case=name):
                cal.write_text(body)
                self.commit(CAL_REL)
                self.assertIn(expected, self.refused(PID))
        self.assertFalse((self.s20 / "nlm").exists())

    def test_a_grid_this_tool_cannot_run_is_refused(self):
        for change, expected in (({"opencv_version": "4.12.0"}, "pins OpenCV 4.12.0"),
                                 ({"k": [1.0, 1.25]}, "at most one decimal"),
                                 ({"searchWindowSize": 20}, "positive odd integer")):
            with self.subTest(change=change):
                git(self.repo, "checkout", "-q", "--", GRID_REL)
                self.edit_grid(**change)
                self.assertIn(expected, self.refused("--estimate-only", PID))


class CalibrationTest(NlmWorld):
    def test_calibration_passes_reads_no_photo_and_is_reproducible(self):
        env = {**self.env, "S19_MANIFEST": str(self.tmp / "absent.json"), "S20_PRIVATE": str(self.tmp / "absent")}
        cal = self.repo / CAL_REL
        cal.unlink()
        for _ in range(2):
            r = subprocess.run([sys.executable, "-B", str(NLM), "--calibrate"], capture_output=True, text=True,
                               env=env)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            if _ == 0:
                first = cal.read_bytes()
        self.assertEqual(cal.read_bytes(), first, "same tool, grid and libraries → same bytes")
        self.assertFalse((self.tmp / "absent").exists(), "calibration touches no S-20 workspace")
        text = cal.read_text()
        binds = [ln for ln in text.splitlines() if ln.startswith("S20-CALIBRATION ")]
        self.assertEqual(len(binds), 1)
        fields = dict(kv.split("=", 1) for kv in binds[0].split()[1:])
        self.assertEqual(fields["result"], "PASS")
        self.assertEqual(fields["implementation_sha256"], sha(NLM))
        self.assertEqual(fields["config_sha256"], sha(self.repo / GRID_REL))
        for needle in ("(35, 98, 238) → (35, 98, 234) (reproduced)", "| flat ", "| texture ", "| dark ramp ",
                       "| near 0 ", "| near 255 ", "Direct σ̂_L", "| 1.5 | 0.4111", "Known limit"):
            self.assertIn(needle, text)


class NlmGammaBindingTest(NlmWorld):
    """End to end with the real shared decode: `local-arms.ts nlm-gamma` accepts nlm.py's record."""

    def test_nlm_gamma_renders_from_a_real_nlm_record(self):
        w, h = 96, 64
        img = Image.new("RGB", (w, h))
        img.putdata([((x * 7 + y * 3) % 256, (x * 2 + y * 5) % 256, (x * y) % 256) for y in range(h) for x in range(w)])
        entry = next(e for e in self.entries if e["id"] == PID)
        img.save(entry["path"], quality=95)
        entry["sha256"] = sha(Path(entry["path"]))
        entry["display_dimensions"] = [w, h]
        self.write_manifest(self.entries)
        self.prepare(PID)
        stats = {"mean": 0.12, "p05": 0.02, "p25": 0.05, "p50": 0.1, "p75": 0.16, "p95": 0.6, "p99": 0.8,
                 "shadowRatio": 0.8, "highlightRatio": 0.001, "clipRatio": 0.0002}
        local = json.loads(subprocess.run(
            ["npx", "--no-install", "tsx", "--eval",
             "import { recommendParams } from './src/lib/engines/auto-params';"
             f"console.log(JSON.stringify(recommendParams({json.dumps(stats)}, 'local')))"],
            capture_output=True, text=True, cwd=ROOT, check=True).stdout)
        (self.private / "local").mkdir(parents=True, exist_ok=True)
        (self.private / "local" / f"{PID}.auto.json").write_text(json.dumps(
            {"id": PID, "common_sha256": self.sidecar(PID)["common"]["sha256"], "stats": stats, "local": local,
             "session_id": uuid.uuid4().hex}))
        for args in (("decoded", PID), ("control-full", PID)):
            r = self.run_cli("local-arms", *args, tsx=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.ok(PID)
        r = self.run_cli("local-arms", "nlm-gamma", PID, "--nlm-k", "1.5", tsx=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        arm = json.loads((self.private / "arms" / "nlm-gamma" / "k1.5" / f"{PID}.json").read_text())
        ctl = json.loads((self.private / "arms" / "control-full" / f"{PID}.json").read_text())
        _, nlm_record = self.out("k1.5")
        self.assertEqual(arm["source"]["record_sha256"], sha(nlm_record))
        self.assertEqual(arm["source"]["k"], 1.5)
        for f in ("decoded_pixels_sha256", "auto_file_sha256", "lut_sha256"):
            self.assertEqual(arm[f], ctl[f], f)
        self.assertNotEqual(arm["output_sha256"], ctl["output_sha256"], "the real denoiser changes the pixels")


if __name__ == "__main__":
    unittest.main()
