"""S-20 step 1b, plan Phase 10: `wavelet.py`, its grid, its diagnostic and its calibration.

The CLI cases run in the S-19 fixtures world (`scripts/s19/tests/fixtures.py`). S20_PRIVATE points
at a temporary workspace, and S20_REPO at a temporary Git repository that holds committed copies of
the rule files and a 1b calibration written by the real `wavelet.py`, so the order-step-2 check is
exercised without depending on this checkout's state (as `test_nlm.py` does). The `zeroed` case
runs two 1b synthetic worlds (`blind_fixture.py`). No real photo, decoded image or render is read.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import math
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
import pywt
from PIL import Image
from skimage.restoration import cycle_spin, denoise_wavelet

S20 = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(S20.parent / "s19" / "tests"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(S20))

import blind_fixture as bf  # noqa: E402
from fixtures import ROOT, World, sha  # noqa: E402

WAVELET = S20 / "wavelet.py"
EVAL = "context/changes/cloud-classical-denoise/evaluations"
GRID_REL = "scripts/s20/configs/wavelet-grid.json"
CAL_REL = f"{EVAL}/step1b/calibration.md"
# The 1a rule files every tool checks (evidence.FIXED_RULE_FILES); the temporary repository holds
# copies, and a stand-in for 1a's calibration record, which no 1b path reads.
COPIED = ("scripts/s20/wavelet.py", "scripts/s20/nlm.py", "scripts/s20/evidence.py", "scripts/s20/trials.py",
          GRID_REL, "scripts/s20/configs/nlm-grid.json", "scripts/s19/local-arms.ts", "scripts/s19/s19.ts")
CAL_1A_REL = f"{EVAL}/step1-calibration.md"
PID = "T-01"
KS = ("k1.0", "k1.5", "k2.0")
PLANES = ("Y", "Cb", "Cr")
RECORD_FIELDS = {"id", "k", "sigma_hat", "sigma", "plane_range", "wavelet", "levels", "shifts", "decoded_record",
                 "decoded_pixels_sha256", "output_sha256", "dimensions", "config_sha256", "skimage_version",
                 "pywt_version", "numpy_version", "implementation_sha256", "rendered_at", "zeroed"}
CELL = {"set_to_zero", "nonzero_before", "already_zero", "ratio"}


def load_wavelet():
    spec = importlib.util.spec_from_file_location("s20_wavelet", WAVELET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


wl = load_wavelet()
GRID = json.loads((ROOT / GRID_REL).read_text())


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
    """An asymmetric colour (R high, G low, B middle) with noise, so every plane carries noise."""
    rng = np.random.default_rng(seed)
    base = np.array([200, 40, 120], dtype=np.float64)
    ramp = np.linspace(-20, 20, w)[None, :, None]
    return np.clip(np.rint(base + ramp + rng.normal(0, 6, (h, w, 3))), 0, 255).astype(np.uint8)


def noisy_plane(h: int = 37, w: int = 53, seed: int = 1) -> np.ndarray:
    """A normalised plane in [0, 1] with structure and noise; odd sizes exercise `original_extent`."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    p = 0.5 + 0.3 * np.sin(x / 5) * np.cos(y / 7) + rng.normal(0, 0.05, (h, w))
    p -= p.min()
    p /= p.max()
    return p


def all_cells(zeroed: dict):
    for plane, levels in zeroed.items():
        for level, by in levels.items():
            for key, cell in by.items():
                yield plane, level, key, cell


class RepoTemplate:
    """One committed copy of the rule files, calibrated by the real wavelet.py, shared by the tests."""

    path: Path | None = None

    @classmethod
    def get(cls) -> Path:
        if cls.path is None:
            tmp = Path(tempfile.mkdtemp(prefix="s20-wavelet-repo-"))
            for rel in COPIED:
                (tmp / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / rel, tmp / rel)
            (tmp / CAL_1A_REL).parent.mkdir(parents=True, exist_ok=True)
            (tmp / CAL_1A_REL).write_text("stand-in for 1a's calibration record; no 1b path reads it\n")
            r = subprocess.run([sys.executable, "-B", str(WAVELET), "--calibrate"], capture_output=True, text=True,
                               env={**os.environ, "S20_REPO": str(tmp)})
            assert r.returncode == 0, r.stdout + r.stderr
            git(tmp, "init", "-q")
            git(tmp, "add", "-A")
            git(tmp, "commit", "-q", "-m", "rules")
            cls.path = tmp
        return cls.path


def tearDownModule():
    if RepoTemplate.path:
        shutil.rmtree(RepoTemplate.path, True)


class WaveletWorld(World):
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

    def cli(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, "-B", str(WAVELET), *args], capture_output=True, text=True,
                              env=self.env, cwd=ROOT)

    def ok(self, *args: str) -> subprocess.CompletedProcess:
        r = self.cli(*args)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r

    def refused(self, *args: str) -> str:
        r = self.cli(*args)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertNotIn("Traceback", r.stderr, "a refusal, not a crash")
        return r.stdout + r.stderr

    def out(self, k: str, pid: str = PID) -> tuple[Path, Path]:
        d = self.s20 / "wavelet" / k
        return d / f"{pid}.png", d / f"{pid}.json"

    def commit(self, *paths: str) -> None:
        git(self.repo, "add", "--", *paths)
        git(self.repo, "commit", "-q", "-m", "change")


# ---------------------------------------------------------------- estimator, mapping, constant plane


class EstimatorTest(unittest.TestCase):
    def test_flat_noise_is_read_within_tolerance_through_the_real_path(self):
        r2 = wl.rounding_variance()
        base = np.full((256, 256), 128.0)
        for sigma in (3, 8, 15):
            with self.subTest(sigma=sigma):
                rgb8 = wl.to_rgb8(wl.noisy_ycbcr(base, sigma, 99))
                est = wl.estimate(wl.to_ycbcr(rgb8))
                for p in PLANES:
                    eff = math.sqrt(sigma * sigma + r2[p])
                    self.assertLessEqual(abs(est[p]["sigma_hat"] - eff) / eff, 0.10, (p, est[p]["sigma_hat"]))

    def test_sigma_hat_is_the_normalised_estimate_times_the_plane_range(self):
        """F19: rgb2ycbcr already returns 8-bit units, so σ̂ = σ̂_norm × (max − min), no × 255."""
        ycc = wl.to_ycbcr(textured())
        est = wl.estimate(ycc)
        for i, p in enumerate(PLANES):
            e = est[p]
            self.assertEqual(e["sigma_hat"], e["sigma_hat_norm"] * (e["max"] - e["min"]))
            self.assertAlmostEqual(e["sigma_hat"], wl.nlm.immerkaer(ycc[:, :, i]), places=9)
            self.assertLess(e["sigma_hat"], 20, "rgb2ycbcr units, not ×255")

    def test_the_filter_receives_k_times_the_normalised_estimate(self):
        est = wl.estimate(wl.to_ycbcr(textured()))
        for k in (1.0, 1.5, 2.0):
            s = wl.mapping(k, est)
            for p in PLANES:
                self.assertEqual(s[p], k * est[p]["sigma_hat_norm"], (k, p))

    def test_a_non_constant_plane_without_noise_is_a_technical_refusal(self):
        """Y = 16 + x over 65 columns normalises to x/64, exactly: σ̂ = 0 on a non-constant plane."""
        rng = np.random.default_rng(5)
        ycc = 128.0 + rng.normal(0, 3, (40, 65, 3))
        ycc[:, :, 0] = 16.0 + np.arange(65)[None, :]
        with self.assertRaisesRegex(wl.Refused, r"^σ̂_Y = 0\.0 on a non-constant plane: .*not a vote"):
            wl.estimate(ycc)
        ycc[0, 0, 0] = np.nan
        with self.assertRaisesRegex(wl.Refused, r"^σ̂_Y = nan on a non-constant plane"):
            wl.estimate(ycc)

    def test_mapping_refuses_a_strength_that_is_not_positive_and_finite(self):
        est = wl.estimate(wl.to_ycbcr(textured()))
        est["Cr"] = {**est["Cr"], "sigma_hat_norm": float("inf")}
        with self.assertRaisesRegex(wl.Refused, r"maps to σ_Cr = inf, not a positive filter strength"):
            wl.mapping(1.0, est)


class ConstantPlaneTest(unittest.TestCase):
    """F21: the constant-plane check runs first; such a plane is copied, never refused."""

    def setUp(self):
        rng = np.random.default_rng(11)
        self.ycc = 128.0 + rng.normal(0, 4, (48, 64, 3))
        self.ycc[:, :, 1] = 131.25  # Cb constant

    def test_a_constant_plane_is_copied_unfiltered_with_null_cells_and_not_refused(self):
        calls = []
        real = wl.nlm.immerkaer
        with mock.patch.object(wl.nlm, "immerkaer", lambda ch: calls.append(ch.shape) or real(ch)):
            est = wl.estimate(self.ycc)
        self.assertEqual(len(calls), 2, "the constant plane never reaches the estimator")
        self.assertTrue(est["Cb"]["constant"])
        self.assertIsNone(est["Cb"]["sigma_hat"])
        self.assertEqual((est["Cb"]["min"], est["Cb"]["max"]), (131.25, 131.25))
        sigmas = wl.mapping(1.0, est)
        self.assertIsNone(sigmas["Cb"])
        out = wl.denoise_ycc(self.ycc, est, sigmas, GRID)
        self.assertTrue(np.array_equal(out[:, :, 1], self.ycc[:, :, 1]), "copied unchanged")
        for i in (0, 2):
            self.assertFalse(np.array_equal(out[:, :, i], self.ycc[:, :, i]), "the other planes are filtered")
        zeroed = wl.observe(self.ycc, est, sigmas, GRID)
        levels = wl.level_count((48, 64), pywt.Wavelet("db1"))
        self.assertEqual(zeroed["Cb"], {str(lv): {"ad": None, "da": None, "dd": None} for lv in range(1, levels + 1)})
        self.assertTrue(all(isinstance(c, dict) for p, _, _, c in all_cells(zeroed) if p != "Cb"))


# ---------------------------------------------------------------- the treatment and the observing pass


class ObservingPassTest(unittest.TestCase):
    SIGMA = 0.05

    def test_one_shift_reconstructs_to_denoise_wavelet_on_the_rolled_plane(self):
        """F25, F33: compared on the rolled plane, before any roll-back (`_cycle_spin.py:147-151`)."""
        p = noisy_plane()
        for shift in ((0, 0), (1, 2), (3, 3)):
            with self.subTest(shift=shift):
                xs = np.roll(p, shift, axis=(0, 1))
                coeffs, thresholded, _ = wl.observe_shift(xs, self.SIGMA, GRID)
                ours = wl.reconstruct(coeffs, thresholded, GRID, xs.shape, xs.dtype)
                ref = denoise_wavelet(xs, sigma=self.SIGMA, wavelet="db1", mode="soft", method="BayesShrink",
                                      wavelet_levels=None, rescale_sigma=False)
                self.assertEqual(ours.shape, xs.shape)
                self.assertTrue(np.array_equal(ours, ref), "the observing pass repeats skimage's own calls")

    def test_the_render_is_the_mean_of_the_16_rolled_shifts(self):
        p = noisy_plane()
        mean = None
        for shift in wl.shifts(3):
            xs = np.roll(p, shift, axis=(0, 1))
            coeffs, thresholded, _ = wl.observe_shift(xs, self.SIGMA, GRID)
            back = np.roll(wl.reconstruct(coeffs, thresholded, GRID, xs.shape, xs.dtype),
                           tuple(-s for s in shift), axis=(0, 1))
            mean = back if mean is None else mean + back
        mean /= 16
        self.assertEqual(wl.shifts(3), [(dy, dx) for dy in range(4) for dx in range(4)])
        self.assertTrue(np.array_equal(wl.denoise_plane(p, self.SIGMA, GRID), mean))

    def test_cycle_spin_runs_as_decided_on_each_2d_plane(self):
        """Determinism (§ 1b Critical Implementation Details): `workers=1`, so dask never matters."""
        seen = []

        def spy(x, func, max_shifts, **kw):
            seen.append({"ndim": x.ndim, "func": func, "max_shifts": max_shifts, **kw})
            return cycle_spin(x, func, max_shifts, **kw)

        ycc = wl.to_ycbcr(textured())
        est = wl.estimate(ycc)
        with mock.patch("skimage.restoration.cycle_spin", spy):
            wl.denoise_ycc(ycc, est, wl.mapping(1.0, est), GRID)
        self.assertEqual(len(seen), 3)
        for call, p in zip(seen, PLANES):
            with self.subTest(plane=p):
                self.assertEqual((call["ndim"], call["func"], call["max_shifts"]), (2, denoise_wavelet, 3))
                self.assertEqual((call.get("workers"), call.get("channel_axis", "absent")), (1, None))
                self.assertEqual(call["func_kw"], {"sigma": 1.0 * est[p]["sigma_hat_norm"], "wavelet": "db1",
                                                   "mode": "soft", "wavelet_levels": None, "method": "BayesShrink",
                                                   "rescale_sigma": False})

    def test_a_checkerboard_puts_its_detail_in_level_1(self):
        """F23: ±1 at the finest scale only; PyWavelets lists details coarsest first."""
        cb = (np.indices((64, 64)).sum(axis=0) % 2) * 2 - 1.0
        z = wl.observe_plane(cb, 0.1, GRID)
        self.assertEqual(list(z), ["1", "2", "3"], "max(6 − 3, 1) levels, finest first")
        self.assertEqual(z["1"]["dd"]["nonzero_before"], 16 * 32 * 32)
        for level, by in z.items():
            for key, cell in by.items():
                if (level, key) != ("1", "dd"):
                    with self.subTest(level=level, key=key):
                        self.assertEqual(cell["nonzero_before"], 0)

    def test_an_all_zero_subband_gives_ratio_null(self):
        cb = (np.indices((64, 64)).sum(axis=0) % 2) * 2 - 1.0
        z = wl.observe_plane(cb, 0.1, GRID)
        self.assertIsNone(z["2"]["ad"]["ratio"])
        self.assertEqual(z["2"]["ad"]["already_zero"], 16 * 16 * 16)
        self.assertIsNone(z["1"]["ad"]["ratio"])
        self.assertEqual(z["1"]["dd"]["ratio"], 0.0, "a nonzero subband gets a number, here nothing zeroed")
        json.dumps(z, allow_nan=False)  # null, never NaN

    def test_an_already_zero_corner_is_counted_only_in_already_zero(self):
        p = noisy_plane(64, 64, seed=3)
        p[:16, :16] = 0.0  # clipped black: its finest-level Haar details are exactly 0
        before = pywt.wavedecn(p, "db1", level=wl.level_count(p.shape, pywt.Wavelet("db1")))[-1]
        _, _, counts = wl.observe_shift(p, 10.0, GRID)  # a threshold above every coefficient
        for key in ("ad", "da", "dd"):
            with self.subTest(key=key):
                c = counts["1"][key]
                zeros = int(np.count_nonzero(before[key] == 0))
                self.assertGreaterEqual(zeros, 64)
                self.assertEqual(c["already_zero"], zeros)
                self.assertEqual(c["set_to_zero"], c["nonzero_before"], "every nonzero one was set to 0 …")
                self.assertEqual(c["set_to_zero"] + c["already_zero"], before[key].size, "… and only those")

    def test_set_to_zero_is_read_from_the_thresholded_output(self):
        p = noisy_plane()
        coeffs, thresholded, counts = wl.observe_shift(p, self.SIGMA, GRID)
        for i, (b, a) in enumerate(zip(coeffs[1:], thresholded)):
            label = str(len(thresholded) - i)
            for key in ("ad", "da", "dd"):
                expected = int(np.count_nonzero((b[key] != 0) & (a[key] == 0)))
                self.assertEqual(counts[label][key]["set_to_zero"], expected, (label, key))
                self.assertGreater(expected, 0, "the fixture zeroes something at every level")

    def test_counts_are_summed_over_the_16_shifts(self):
        p = noisy_plane()
        z = wl.observe_plane(p, self.SIGMA, GRID)
        coeffs = pywt.wavedecn(p, "db1", level=wl.level_count(p.shape, pywt.Wavelet("db1")))
        for i, level in enumerate(coeffs[1:]):
            label = str(len(coeffs) - 1 - i)
            for key in ("ad", "da", "dd"):
                cell = z[label][key]
                self.assertEqual(cell["nonzero_before"] + cell["already_zero"], 16 * level[key].size)
                self.assertEqual(cell["ratio"], cell["set_to_zero"] / cell["nonzero_before"])


# ---------------------------------------------------------------- the CLI


class RenderTest(WaveletWorld):
    def test_record_carries_every_contract_field_and_binds_its_inputs(self):
        rgb = textured()
        self.write_decoded(rgb)
        self.ok(PID)
        dec = json.loads((self.s20 / "decoded" / f"{PID}.json").read_text())
        import skimage

        levels = max(pywt.dwtn_max_level((48, 64), "db1") - 3, 1)
        for kd, k in zip(KS, GRID["k"]):
            with self.subTest(k=kd):
                png, record = self.out(kd)
                rec = json.loads(record.read_text())
                self.assertEqual(set(rec), RECORD_FIELDS)
                self.assertEqual((rec["id"], rec["k"], rec["wavelet"], rec["levels"], rec["shifts"]),
                                 (PID, k, "db1", levels, 16))
                for p in PLANES:
                    lo, hi = rec["plane_range"][p]
                    self.assertLess(lo, hi)
                    self.assertAlmostEqual(rec["sigma"][p], k * rec["sigma_hat"][p] / (hi - lo), places=12)
                self.assertEqual(rec["decoded_pixels_sha256"], dec["pixels_sha256"])
                self.assertEqual(Path(rec["decoded_record"]), self.s20 / "decoded" / f"{PID}.json")
                self.assertEqual(rec["output_sha256"], sha(png))
                self.assertEqual(rec["dimensions"], [64, 48])
                self.assertEqual(rec["config_sha256"], sha(self.repo / GRID_REL))
                self.assertEqual((rec["skimage_version"], rec["pywt_version"], rec["numpy_version"]),
                                 (skimage.__version__, pywt.__version__, np.__version__))
                self.assertEqual(rec["implementation_sha256"], sha(WAVELET))
                for f in bf.TRIALS["1b"].bind_fields:
                    self.assertIn(f, rec, "every 1b bind field is in the record blind.py checks")
                self.assertEqual(set(rec["zeroed"]), set(PLANES))
                for p, by in rec["zeroed"].items():
                    self.assertEqual(list(by), [str(lv) for lv in range(1, levels + 1)], p)
                for _, _, key, cell in all_cells(rec["zeroed"]):
                    self.assertIn(key, ("ad", "da", "dd"))
                    self.assertEqual(set(cell), CELL)
                    self.assertEqual(cell["ratio"], cell["set_to_zero"] / cell["nonzero_before"])
                self.assertEqual(set(png_chunks(png)), {"IHDR", "IDAT", "IEND"}, "no metadata")
                with Image.open(png) as im:
                    self.assertEqual((im.mode, im.size), ("RGB", (64, 48)))
        sigmas = {json.dumps(json.loads(self.out(kd)[1].read_text())["sigma_hat"]) for kd in KS}
        self.assertEqual(len(sigmas), 1, "one estimate per photo, shared by every k")

    def test_two_renders_give_identical_bytes_and_k1_changes_a_noisy_fixture(self):
        rgb = textured()
        self.write_decoded(rgb)
        self.ok(PID)
        first = {kd: (self.out(kd)[0].read_bytes(), json.loads(self.out(kd)[1].read_text())) for kd in KS}
        shutil.rmtree(self.s20 / "wavelet")
        self.ok(PID)
        for kd in KS:
            png, rec = first[kd]
            again = json.loads(self.out(kd)[1].read_text())
            self.assertEqual(self.out(kd)[0].read_bytes(), png, kd)
            self.assertEqual({**rec, "rendered_at": None}, {**again, "rendered_at": None}, kd)
        with Image.open(self.out("k1.0")[0]) as im:
            got = np.asarray(im.convert("RGB"))
        self.assertFalse(np.array_equal(got, rgb), "k = 1.0 changes a noisy fixture (output ≠ input)")

    def test_channel_order_survives_a_no_op_denoiser(self):
        rgb = textured()
        self.write_decoded(rgb)
        with mock.patch.object(wl, "denoise_plane", lambda norm, *a: norm.copy()), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(wl.main([PID]), 0)
        with Image.open(self.out("k1.0")[0]) as im:
            got = np.asarray(im.convert("RGB")).astype(int)
        self.assertLessEqual(int(np.abs(got - rgb).max()), 1, "the YCbCr round trip keeps the pixels")
        self.assertGreater(got[..., 0].mean(), got[..., 2].mean() + 50, "R stays R: the colour is not swapped")

    def test_a_uniform_image_is_copied_not_refused(self):
        """Every plane constant: no σ̂, no filter, null cells; the round trip returns the input."""
        rgb = np.full((48, 64, 3), (50, 60, 70), dtype=np.uint8)
        self.write_decoded(rgb)
        self.ok(PID)
        rec = json.loads(self.out("k1.0")[1].read_text())
        self.assertEqual(rec["sigma_hat"], {p: None for p in PLANES})
        self.assertEqual(rec["sigma"], {p: None for p in PLANES})
        self.assertTrue(all(cell is None for *_, cell in all_cells(rec["zeroed"])))
        with Image.open(self.out("k1.0")[0]) as im:
            self.assertTrue(np.array_equal(np.asarray(im.convert("RGB")), rgb))

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
        self.assertFalse((self.s20 / "wavelet").exists())

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
        self.assertFalse((self.s20 / "wavelet").exists())

    def test_a_validation_id_is_refused(self):
        self.assertIn("is a validation photo", self.refused("V-01"))

    def test_an_existing_render_is_never_overwritten(self):
        self.write_decoded(textured())
        self.ok(PID)
        before = self.out("k1.5")[0].read_bytes()
        msg = self.refused(PID)
        self.assertIn("already rendered", msg)
        self.assertIn("wavelet.py", msg)
        self.assertEqual(self.out("k1.5")[0].read_bytes(), before)

    def test_estimate_only_prints_the_strengths_and_writes_nothing(self):
        self.write_decoded(textured())
        line = json.loads(self.ok("--estimate-only", PID).stdout.strip())
        self.assertEqual(set(line["sigma"]), set(KS))
        for kd in KS:
            k = float(kd[1:])
            for p in PLANES:
                lo, hi = line["plane_range"][p]
                self.assertAlmostEqual(line["sigma"][kd][p], k * line["sigma_hat"][p] / (hi - lo), places=12)
        self.assertFalse((self.s20 / "wavelet").exists())

    def test_usage_errors_exit_2(self):
        for args in ((), ("--calibrate", PID), ("--calibrate", "--all"), ("--calibrate", "--estimate-only")):
            with self.subTest(args=args):
                self.assertEqual(self.cli(*args).returncode, 2)


class RulesTest(WaveletWorld):
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
        self.assertFalse((self.s20 / "wavelet").exists())
        self.ok("--estimate-only", PID)
        self.ok("--calibrate")

    def test_an_uncommitted_grid_is_refused(self):
        git(self.repo, "rm", "-q", "--cached", "--", GRID_REL)
        git(self.repo, "commit", "-q", "-m", "untrack the grid")
        self.assertIn(f"{GRID_REL}: untracked", self.refused(PID))
        git(self.repo, "add", "--", GRID_REL)
        self.assertIn(f"{GRID_REL}: added (staged)", self.refused(PID))
        self.assertFalse((self.s20 / "wavelet").exists())
        self.ok("--calibrate")

    def test_an_untracked_tool_is_refused_but_an_untracked_test_is_not(self):
        (self.repo / "scripts/s20/tests").mkdir(parents=True, exist_ok=True)
        (self.repo / "scripts/s20/tests/test_x.py").write_text("")
        self.ok(PID)
        shutil.rmtree(self.s20 / "wavelet")
        (self.repo / "scripts/s20/blind.py").write_text("")
        self.assertIn("scripts/s20/blind.py: untracked", self.refused(PID))

    def test_a_committed_grid_change_needs_a_new_calibration(self):
        self.edit_grid(hypothesis="changed and committed, not re-calibrated")
        self.commit(GRID_REL)
        msg = self.refused(PID)
        self.assertIn("config_sha256", msg)
        self.assertIn("wavelet.py --calibrate", msg)
        self.ok("--calibrate")
        self.commit(CAL_REL)
        self.ok(PID)

    def test_the_bind_line_must_be_a_pass_for_trial_1b_and_these_libraries_and_appear_once(self):
        """F24: the bind names its trial exactly, and pins numpy."""
        cal = self.repo / CAL_REL
        text = cal.read_text()
        cases = {
            "result=FAIL": (text.replace("result=PASS", "result=FAIL"), "calibration FAIL"),
            "trial=1a": (text.replace("trial=1b", "trial=1a"), "binds trial '1a', not '1b'"),
            "no trial": (text.replace("trial=1b ", ""), "lacks trial"),
            "numpy": (text.replace(f"numpy_version={np.__version__}", "numpy_version=2.3.5"), "numpy_version"),
            "skimage": (text.replace("skimage_version=0.26.0", "skimage_version=0.25.2"), "skimage_version"),
            "pywt": (text.replace("pywt_version=1.8.0", "pywt_version=1.7.0"), "pywt_version"),
            "implementation": (text.replace("implementation_sha256=", "implementation_sha256=0"), "implementation"),
            "twice": (text + "\nS20-CALIBRATION trial=1b result=PASS\n", "2 S20-CALIBRATION bind lines"),
        }
        for name, (body, expected) in cases.items():
            with self.subTest(case=name):
                self.assertNotEqual(body, text)
                cal.write_text(body)
                self.commit(CAL_REL)
                self.assertIn(expected, self.refused(PID))
        self.assertFalse((self.s20 / "wavelet").exists())

    def test_a_grid_this_tool_cannot_run_is_refused(self):
        spin, filt = dict(GRID["spin"]), dict(GRID["filter"])
        for change, expected in (({"skimage_version": "0.25.2"}, "scikit-image 0.25.2 pinned"),
                                 ({"pywt_version": "1.7.0"}, "PyWavelets 1.7.0 pinned"),
                                 ({"k": [1.0, 1.25]}, "at most one decimal"),
                                 ({"spin": {**spin, "max_shifts": 2}}, "spin is"),
                                 ({"spin": {**spin, "workers": 4}}, "spin is"),
                                 ({"filter": {**filt, "method": "VisuShrink"}}, "filter is"),
                                 ({"filter": {**filt, "wavelet": "db2"}}, "filter is")):
            with self.subTest(change=change):
                git(self.repo, "checkout", "-q", "--", GRID_REL)
                self.edit_grid(**change)
                self.assertIn(expected, self.refused("--estimate-only", PID))


class CalibrationTest(WaveletWorld):
    def test_calibration_passes_reads_no_photo_and_is_reproducible(self):
        env = {**self.env, "S19_MANIFEST": str(self.tmp / "absent.json"), "S20_PRIVATE": str(self.tmp / "absent")}
        cal = self.repo / CAL_REL
        cal.unlink()
        for i in range(2):
            r = subprocess.run([sys.executable, "-B", str(WAVELET), "--calibrate"], capture_output=True, text=True,
                               env=env)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            if i == 0:
                first = cal.read_bytes()
        self.assertEqual(cal.read_bytes(), first, "same tool, grid and libraries → same bytes")
        self.assertFalse((self.tmp / "absent").exists(), "calibration touches no S-20 workspace")
        text = cal.read_text()
        binds = [ln for ln in text.splitlines() if ln.startswith("S20-CALIBRATION ")]
        self.assertEqual(len(binds), 1)
        self.assertTrue(binds[0].startswith("S20-CALIBRATION trial=1b result=PASS "), binds[0])
        fields = dict(kv.split("=", 1) for kv in binds[0].split()[1:])
        self.assertEqual(set(fields), {"trial", "result", *bf.TRIALS["1b"].bind_fields})
        self.assertEqual(fields["implementation_sha256"], sha(WAVELET))
        self.assertEqual(fields["config_sha256"], sha(self.repo / GRID_REL))
        self.assertEqual(fields["numpy_version"], np.__version__)
        for needle in ("| flat ", "| texture ", "| dark ramp ", "| near 16 ", "| near 235 ", "Direct σ̂_Y",
                       "σ̂_norm × (plane max − min)", "Known limit"):
            self.assertIn(needle, text)

    def test_the_rounding_term_is_each_planes_own_not_one_twelfth(self):
        """F34: rounding happens in 8-bit RGB, so r² per YCbCr plane is Σ_j (M_ij / 255)² / 12."""
        r2 = wl.rounding_variance()
        self.assertAlmostEqual(r2["Y"], (65.481 ** 2 + 128.553 ** 2 + 24.966 ** 2) / 255 ** 2 / 12, places=12)
        for p in PLANES:
            self.assertTrue(0.024 < r2[p] < 0.028, (p, r2[p]))
        self.assertIn(f"| Y     | {r2['Y']:.6f}", (self.repo / CAL_REL).read_text())


# ---------------------------------------------------------------- way outs and the diagnostic's reach


class WayOutTest(unittest.TestCase):
    """1b refusals name wavelet.py; 1a's texts stay today's, byte for byte."""

    def test_1a_way_outs_are_todays_literals(self):
        import blind
        import common

        self.assertEqual(blind.way_outs(), blind.WAY_OUT)
        self.assertEqual(common.way_outs(), common.WAY_OUT)
        self.assertEqual(
            {r: blind.WAY_OUT[r] for r in ("calibration not committed", "missing source", "provenance mismatch")},
            {"calibration not committed": "commit the PASS calibration record and nlm-grid.json it names "
                                          "(nlm.py --calibrate)",
             "missing source": "render the missing step with local-arms.ts and nlm.py, then rebuild",
             "provenance mismatch": "re-render the NLM grid with the committed nlm.py, grid and OpenCV, then rebuild"})
        self.assertEqual(common.WAY_OUT["provenance mismatch"],
                         "re-render with the committed nlm.py, grid and OpenCV, then build a new set")

    def test_1b_way_outs_name_wavelet_py(self):
        import blind
        import common

        t = bf.TRIALS["1b"]
        for ways, old in ((blind.way_outs(t), blind.WAY_OUT), (common.way_outs(t), common.WAY_OUT)):
            self.assertEqual(set(ways), set(old), "the same reason classes")
            for reason, text in ways.items():
                self.assertNotIn("nlm", text.lower(), reason)
        b = blind.way_outs(t)
        self.assertEqual(b["calibration not committed"],
                         "commit the PASS calibration record and wavelet-grid.json it names (wavelet.py --calibrate)")
        self.assertEqual(b["missing source"], "render the missing step with local-arms.ts and wavelet.py, then rebuild")
        self.assertIn("committed wavelet.py, grid and scikit-image, PyWavelets and numpy", b["provenance mismatch"])
        self.assertIn("committed wavelet.py, grid and scikit-image, PyWavelets and numpy",
                      common.way_outs(t)["provenance mismatch"])
        self.assertNotIn("1a", common.way_outs(t)["pilot stop"])
        self.assertIn("step 1 closes as FAIL", common.way_outs(t)["pilot stop"])


class ZeroedWorld(bf.SyntheticWorld):
    """A 1b world whose raw records carry (or lack) a `zeroed` diagnostic; the arm records re-bind."""

    def __init__(self, tmp: Path, with_zeroed: bool):
        self.with_zeroed = with_zeroed
        super().__init__(tmp, size=(48, 32), n_tuning=8, trial="1b")

    def render(self, pid: str) -> None:
        super().render(pid)
        if not self.with_zeroed:
            return
        for k in self.bind["k"]:
            kd = f"k{k:.1f}"
            raw = self.s20 / self.t.raw_dir / kd / f"{pid}.json"
            rec = json.loads(raw.read_text())
            rec["zeroed"] = {p: {"1": {o: {"set_to_zero": 9, "nonzero_before": 10, "already_zero": 1, "ratio": 0.9}
                                       for o in ("ad", "da", "dd")}} for p in PLANES}
            raw.write_text(json.dumps(rec))
            arm = self.private / "arms" / self.t.arm / kd / f"{pid}.json"
            a = json.loads(arm.read_text())
            a["source"]["record_sha256"] = bf.sha(raw)
            arm.write_text(json.dumps(a))


class ZeroedIsNeverReadTest(unittest.TestCase):
    """Owner decision 2026-11-09 item 3: the diagnostic is never a gate criterion."""

    def test_the_rule_tools_name_no_zeroed_field(self):
        for tool in ("pilot.py", "gate.py", "common.py", "blind.py"):
            with self.subTest(tool=tool):
                self.assertNotIn("zeroed", (S20 / tool).read_text())

    def test_records_with_and_without_zeroed_give_the_same_verdicts(self):
        results = {}
        for with_zeroed in (True, False):
            tmp = Path(tempfile.mkdtemp(prefix="s20-zeroed-"))
            self.addCleanup(shutil.rmtree, tmp, True)
            w = ZeroedWorld(tmp, with_zeroed)
            raw = json.loads((w.s20 / "wavelet" / "k1.5" / "T-01.json").read_text())
            self.assertEqual("zeroed" in raw, with_zeroed)
            w.pilot_chain(1.5)
            pilot = json.loads((w.repo / w.t.pilot_result).read_text())
            key = w.seal("gate", "gate-x")
            w.write_export("gate", w.gate_export(key))
            r = w.gate()
            self.assertIn(r.returncode, (0, 1), r.stdout + r.stderr)
            gate = json.loads((w.repo / w.t.gate_json).read_text())
            results[with_zeroed] = (pilot["verdict"], pilot.get("k"), r.returncode, gate["verdict"], gate["wins"],
                                    gate["reasons"])
        self.assertEqual(results[True], results[False])
        self.assertEqual(results[True][3], "PASS")


if __name__ == "__main__":
    unittest.main()
