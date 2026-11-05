"""S-20 step 1a, plan Phase 1: the shared decode and the two matched arms of `local-arms.ts`.

Every case drives the real CLI through tsx in the S-19 fixtures world (`scripts/s19/tests/
fixtures.py`), with S20_PRIVATE pointing at a temporary folder. No real photo, Auto record or
render is read. The NLM record here is a stand-in written by the test, carrying only the fields
`nlm-gamma` binds to; nlm.py itself is plan Phase 2.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import stat
import subprocess
import sys
import uuid
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "s19" / "tests"))

from fixtures import ROOT, World, sha  # noqa: E402

STATS = {"mean": 0.12, "p05": 0.02, "p25": 0.05, "p50": 0.1, "p75": 0.16, "p95": 0.6, "p99": 0.8,
         "shadowRatio": 0.8, "highlightRatio": 0.001, "clipRatio": 0.0002}
PID = "T-01"
K = "1.5"


def tsx(code: str) -> str:
    return subprocess.run(["npx", "--no-install", "tsx", "--eval", code], capture_output=True, text=True,
                          cwd=ROOT, check=True).stdout


def pixels_sha(path: Path) -> str:
    with Image.open(path) as im:
        return hashlib.sha256(im.convert("RGB").tobytes()).hexdigest()


def png_chunks(path: Path) -> list[str]:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    out, i = [], 8
    while i < len(data):
        n = int.from_bytes(data[i:i + 4], "big")
        out.append(data[i + 4:i + 8].decode("ascii"))
        i += 12 + n
    return out


class ArmsTest(World):
    def setUp(self):
        super().setUp()
        self.s20 = self.tmp / "s20"
        self.env["S20_PRIVATE"] = str(self.s20)
        # A textured photo, so an applied gamma and a denoiser change visible pixels.
        w, h = 96, 64
        img = Image.new("RGB", (w, h))
        img.putdata([((x * 7 + y * 3) % 256, (x * 2 + y * 5) % 256, (x * y) % 256)
                     for y in range(h) for x in range(w)])
        entry = next(e for e in self.entries if e["id"] == PID)
        img.save(entry["path"], quality=95)
        entry["sha256"] = sha(Path(entry["path"]))
        entry["display_dimensions"] = [w, h]
        self.write_manifest(self.entries)
        self.prepare(PID)
        self.local = json.loads(tsx("import { recommendParams } from './src/lib/engines/auto-params';"
                                    f"console.log(JSON.stringify(recommendParams({json.dumps(STATS)}, 'local')))"))
        self.assertNotEqual(self.local["gamma"], 1, "the fixture needs a gamma that changes pixels")
        self.write_auto()

    # ------------------------------------------------------------ helpers

    def write_auto(self, session: str | None = None) -> None:
        (self.private / "local").mkdir(parents=True, exist_ok=True)
        (self.private / "local" / f"{PID}.auto.json").write_text(json.dumps(
            {"id": PID, "common_sha256": self.sidecar(PID)["common"]["sha256"], "stats": STATS,
             "local": self.local, "session_id": session or uuid.uuid4().hex}))

    def arm(self, arm: str, *extra: str, ok: bool = True) -> subprocess.CompletedProcess:
        r = self.run_cli("local-arms", arm, PID, *extra, tsx=True)
        if ok:
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r

    def refused(self, arm: str, *extra: str) -> str:
        r = self.arm(arm, *extra, ok=False)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertNotIn("    at ", r.stderr, "a refusal, not a crash")
        return r.stdout + r.stderr

    def decoded(self) -> tuple[Path, dict]:
        png = self.s20 / "decoded" / f"{PID}.png"
        return png, json.loads(png.with_suffix(".json").read_text())

    def arm_out(self, arm: str) -> tuple[Path, dict]:
        d = self.private / "arms" / arm if arm == "control-full" else self.private / "arms" / arm / f"k{K}"
        return d / f"{PID}.png", json.loads((d / f"{PID}.json").read_text())

    def fake_nlm(self, image: Image.Image | None = None, **override) -> Path:
        """An nlm.py stand-in: by default the identity denoiser (a byte copy of the decoded PNG)."""
        dec_png, dec = self.decoded()
        out = self.s20 / "nlm" / f"k{K}" / f"{PID}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        if image is None:
            shutil.copyfile(dec_png, out)
        else:
            image.save(out, "PNG")
        with Image.open(out) as im:
            dims = list(im.size)
        rec = {"id": PID, "k": float(K), "sigma_hat_L": 1.0, "sigma_hat_ab": 1.0, "h": 1.5, "h_color": 1.5,
               "decoded_record": str(dec_png.with_suffix(".json")), "decoded_pixels_sha256": dec["pixels_sha256"],
               "output_sha256": sha(out), "dimensions": dims, "config_sha256": "c" * 64}
        rec.update(override)
        out.with_suffix(".json").write_text(json.dumps(rec))
        return out

    # ------------------------------------------------------------ cases

    def test_decoded_is_a_lossless_metadata_free_png_bound_to_the_common_input(self):
        self.arm("decoded")
        png, rec = self.decoded()
        side = self.sidecar(PID)
        chunks = png_chunks(png)
        self.assertEqual((chunks[0], chunks[-1], set(chunks)), ("IHDR", "IEND", {"IHDR", "IDAT", "IEND"}),
                         f"no ICC, pHYs, text or gamma chunk: {chunks}")
        with Image.open(png) as im:
            self.assertEqual((im.mode, list(im.size)), ("RGB", side["common"]["dimensions"]))
        self.assertEqual(rec["pixels_sha256"], pixels_sha(png), "pixels_sha256 is the raw RGB bytes' hash")
        self.assertEqual(rec["common_sha256"], side["common"]["sha256"])
        self.assertEqual(rec["output_sha256"], sha(png))
        self.assertEqual(rec["dimensions"], side["common"]["dimensions"])
        self.assertTrue(rec["decoder"]["sharp"] and rec["decoder"]["vips"], rec["decoder"])

    def test_identity_denoiser_makes_nlm_gamma_byte_identical_to_control_full(self):
        self.arm("decoded")
        self.arm("control-full")
        self.fake_nlm()
        self.arm("nlm-gamma", "--nlm-k", K)
        ctl_png, ctl = self.arm_out("control-full")
        nlm_png, nlm = self.arm_out("nlm-gamma")
        self.assertEqual(ctl_png.read_bytes(), nlm_png.read_bytes())
        dec_png, dec = self.decoded()
        self.assertNotEqual(pixels_sha(ctl_png), dec["pixels_sha256"], "the gamma must change the pixels")
        for f in ("decoded_pixels_sha256", "auto_file_sha256", "lut_sha256", "gamma", "dimensions"):
            self.assertEqual(ctl[f], nlm[f], f)
        self.assertEqual(ctl["decoded_pixels_sha256"], dec["pixels_sha256"])
        self.assertEqual(ctl["auto_file_sha256"], sha(self.private / "local" / f"{PID}.auto.json"))
        self.assertEqual((ctl["blur_sigma_px"], ctl["tone"], ctl["source"]), (0, {"kind": "gamma"}, None))
        nlm_out = self.s20 / "nlm" / f"k{K}" / f"{PID}.png"
        self.assertEqual(nlm["source"], {"kind": "nlm", "record": nlm["source"]["record"],
                                         "record_sha256": sha(nlm_out.with_suffix(".json")),
                                         "output_sha256": sha(nlm_out), "config_sha256": "c" * 64, "k": 1.5})
        self.assertTrue(nlm["source"]["record"].endswith(f"nlm/k{K}/{PID}.json"), nlm["source"]["record"])
        self.assertEqual(ctl["output_sha256"], sha(ctl_png))
        self.assertEqual(set(png_chunks(ctl_png)), {"IHDR", "IDAT", "IEND"}, "arm outputs carry no metadata either")

    def test_auto_record_changed_between_the_two_arm_runs_shows_in_the_records(self):
        self.arm("decoded")
        self.arm("control-full")
        self.write_auto(session="another-session")
        self.fake_nlm()
        self.arm("nlm-gamma", "--nlm-k", K)
        _, ctl = self.arm_out("control-full")
        _, nlm = self.arm_out("nlm-gamma")
        self.assertNotEqual(ctl["auto_file_sha256"], nlm["auto_file_sha256"],
                            "the Phase 4 pair check needs this difference to refuse the pair")
        self.assertEqual(ctl["lut_sha256"], nlm["lut_sha256"])

    def test_tampered_decoded_png_is_refused_by_both_arms(self):
        self.arm("decoded")
        self.fake_nlm()
        png, _ = self.decoded()
        with Image.open(png) as im:
            im = im.convert("RGB")
            im.putpixel((0, 0), tuple(255 - v for v in im.getpixel((0, 0))))
            im.save(png, "PNG")
        for arm, extra in (("control-full", ()), ("nlm-gamma", ("--nlm-k", K))):
            with self.subTest(arm=arm):
                self.assertIn("pixels_sha256", self.refused(arm, *extra))
        self.assertFalse((self.private / "arms" / "control-full" / f"{PID}.png").exists())

    def test_tampered_nlm_output_is_refused(self):
        self.arm("decoded")
        out = self.fake_nlm()
        with Image.open(out) as im:
            im = im.convert("RGB")
            im.putpixel((1, 1), (0, 0, 0) if im.getpixel((1, 1)) != (0, 0, 0) else (9, 9, 9))
            im.save(out, "PNG")
        self.assertIn("output_sha256", self.refused("nlm-gamma", "--nlm-k", K))

    def test_nlm_record_from_other_decoded_pixels_is_refused(self):
        self.arm("decoded")
        self.fake_nlm(decoded_pixels_sha256="0" * 64)
        self.assertIn("decoded_pixels_sha256", self.refused("nlm-gamma", "--nlm-k", K))

    def test_nlm_record_for_another_photo_or_strength_is_refused(self):
        self.arm("decoded")
        for override in ({"id": "T-02"}, {"k": 2.0}):
            with self.subTest(override=override):
                self.fake_nlm(**override)
                self.assertIn("not T-01 at k", self.refused("nlm-gamma", "--nlm-k", K))

    def test_size_mismatch_is_refused(self):
        self.arm("decoded")
        _, dec = self.decoded()
        w, h = dec["dimensions"]
        self.fake_nlm(Image.new("RGB", (w - 16, h), (50, 60, 70)))  # record dims match the file, not the decode
        self.assertIn("≠ decoded", self.refused("nlm-gamma", "--nlm-k", K))

    def test_a_sidecar_path_into_the_holdout_is_refused_before_it_is_read(self):
        self.arm("decoded")
        holdout = Path(next(e["path"] for e in self.entries if e["id"] == "V-01"))
        link = self.tmp / "innocent.jpg"
        link.symlink_to(holdout)
        side_path = self.private / "inputs" / f"{PID}.json"
        side = json.loads(side_path.read_text())
        side["common"].update(path=str(link), sha256=sha(holdout))  # only the guard can refuse it now
        side_path.write_text(json.dumps(side))
        mode = holdout.stat().st_mode
        holdout.chmod(0)  # any open, hash or decode before the guard would fail with EACCES instead
        self.addCleanup(holdout.chmod, stat.S_IMODE(mode))
        for arm in ("decoded", "control-full"):
            with self.subTest(arm=arm):
                self.assertIn("is a validation photo", self.refused(arm))
        self.assertFalse((self.private / "arms" / "control-full").exists())

    def test_nlm_k_is_required_validated_and_scoped(self):
        self.arm("decoded")
        self.assertIn("needs --nlm-k", self.refused("nlm-gamma"))
        self.assertIn("needs the nlm-gamma arm", self.refused("control-full", "--nlm-k", K))
        for bad in ("abc", "0", "1.25", "-1"):
            with self.subTest(k=bad):
                self.assertIn("--nlm-k", self.refused("nlm-gamma", "--nlm-k", bad))
        self.assertIn("no NLM render", self.refused("nlm-gamma", "--nlm-k", "2.0"))

    def test_s20_arms_have_no_validation_mode(self):
        self.assertIn("no validation mode", self.refused("decoded", "--validation"))

    def test_matched_arms_need_the_shared_decode(self):
        self.assertIn("no shared decode", self.refused("control-full"))

    def test_old_arms_still_render(self):
        for arm in ("local-equiv", "control"):
            with self.subTest(arm=arm):
                self.arm(arm)
                rec = json.loads((self.private / "arms" / arm / f"{PID}.json").read_text())
                self.assertEqual(rec["arm"], arm)
                self.assertNotIn("decoded_pixels_sha256", rec, "the S-19 arms' records are unchanged")
        self.assertFalse(self.s20.exists(), "S-19 arms write nothing into the S-20 workspace")


if __name__ == "__main__":
    import unittest

    unittest.main()
