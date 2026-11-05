"""S-20 step 1a, plan Phase 3: `blind.py`, the blind set builder.

Every case runs in `blind_fixture.SyntheticWorld`: a temporary benchmark (tuning T-01…T-03,
validation V-01…V-03), prepared inputs, shared decodes, NLM records and both arms written the way
the real tools write them. The NLM records carry the calibration bind committed at this
checkout's HEAD, which is what `blind.py` checks provenance against. No real photo is read.

The gate-build refusals of order step 8 (missing, uncommitted or stale freeze) are Phase 4's,
with the precondition itself (owner decision 2026-11-05).
"""

from __future__ import annotations

import io
import json
import re
import shutil
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "s19" / "tests"))

import blind_fixture as bf  # noqa: E402
from fixtures import make_icc, D50_SRGB  # noqa: E402

blind = bf.load_blind()
ARM_WORDS = ("control", "nlm", "local", "decoded", "gamma", "arm", "k1.", "k2.", "sigma")


def png_chunks(path: Path) -> list[str]:
    data = path.read_bytes()
    out, i = [], 8
    while i < len(data):
        n = int.from_bytes(data[i:i + 4], "big")
        out.append(data[i + 4:i + 8].decode("ascii"))
        i += 12 + n
    return out


def pixels_sha(path: Path) -> str:
    with Image.open(path) as im:
        return blind.sha_bytes(im.convert("RGB").tobytes())


def read_manifest(set_dir: Path) -> tuple[str, dict]:
    text = (set_dir / "manifest.js").read_text()
    m = re.fullmatch(r"window\.S20_SET = (.*);\n", text, re.S)
    assert m, text[:80]
    return text, json.loads(m.group(1))


class BlindWorld(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="s20-blind-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.w = bf.SyntheticWorld(self.tmp)
        self.w.freeze(1.5)

    def build(self, kind: str, set_id: str = "s1") -> tuple[Path, dict]:
        r = self.w.blind(kind, "--set", set_id)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        set_dir = self.w.s20 / set_id
        return set_dir, json.loads((set_dir / blind.KEY_NAME).read_text())

    def blocked(self, kind: str, reason: str, set_id: str = "s1") -> str:
        r = self.w.blind(kind, "--set", set_id)
        out = r.stdout + r.stderr
        self.assertEqual(r.returncode, 3, out)
        self.assertIn(f"set: {reason}", out)
        self.assertNotIn("Traceback", out)
        self.assertFalse((self.w.s20 / set_id).exists(), "a failed build leaves no set directory")
        self.assertEqual([p.name for p in self.w.s20.iterdir() if p.name.startswith(f".{set_id}-")], [],
                         "nor a temporary one")
        return out

    def edit(self, path: Path, **change) -> None:
        rec = json.loads(path.read_text())
        rec.update(change)
        path.write_text(json.dumps(rec))


class ManifestTest(BlindWorld):
    def assert_allowlisted(self, payload: dict, labels: list[str]) -> None:
        """Exactly the contract's fields: anything else could carry identity, whatever its name."""
        self.assertEqual(sorted(payload), ["items", "kind", "set_digest", "set_id"])
        for it in payload["items"]:
            self.assertEqual(sorted(it), ["id", "images", "original", "photo"], it["id"])
            self.assertEqual(sorted(it["original"]), ["dimensions", "src"], it["id"])
            self.assertEqual(sorted(it["images"]), sorted(labels), it["id"])
            for label, img in it["images"].items():
                self.assertEqual(list(img), ["src"], (it["id"], label))
                self.assertEqual(img["src"], f"{it['id']}-{label}.png")

    def test_pilot_manifest_names_no_arm_strength_path_or_source_hash(self):
        set_dir, key = self.build("pilot")
        text, payload = read_manifest(set_dir)
        for word in ARM_WORDS:
            self.assertNotIn(word, text.lower(), word)
        self.assertNotIn("/", text, "no path: image sources are bare file names")
        self.assertEqual(re.findall(r"[0-9a-f]{64}", text), [payload["set_digest"]], "the only hash is set_digest")
        self.assertEqual([it["photo"] for it in payload["items"]], list(bf.TUNING))
        self.assert_allowlisted(payload, ["X", "Y", "Z", "kontrola"])
        for it in payload["items"]:
            k = key["items"][it["id"]]
            self.assertEqual(k["labels"]["kontrola"], {"arm": "control-full"})
            self.assertEqual(sorted(k["labels"][label]["k"] for label in "XYZ"), [1.0, 1.5, 2.0])

    def test_gate_manifest_pairs_every_photo_with_both_references_once(self):
        set_dir, key = self.build("gate")
        text, payload = read_manifest(set_dir)
        for word in ARM_WORDS:
            self.assertNotIn(word, text.lower(), word)
        self.assert_allowlisted(payload, ["A", "B"])
        ids = [it["id"] for it in payload["items"]]
        self.assertEqual(ids, [f"p{n:02d}" for n in range(1, 7)])
        pairs = sorted((key["items"][i]["photo"], key["items"][i]["comparison"]) for i in ids)
        self.assertEqual(pairs, sorted((p, r) for p in bf.TUNING for r in ("control-full", "local")))
        for i in ids:
            sides = key["items"][i]["sides"]
            self.assertEqual(sorted(sides), ["A", "B"])
            nlm = [s for s, v in sides.items() if v["arm"] == "nlm-gamma"]
            self.assertEqual(len(nlm), 1, sides)
            self.assertEqual(sides[nlm[0]]["k"], 1.5, "the frozen k")
        self.assertEqual(key["freeze"]["k"], 1.5)

    def test_set_digest_recomputes_resists_tampering_and_ignores_key_order(self):
        set_dir, key = self.build("gate")
        _, payload = read_manifest(set_dir)
        self.assertEqual(blind.set_digest(payload), payload["set_digest"])
        self.assertEqual(key["set_digest"], payload["set_digest"])
        reordered = json.loads(json.dumps(payload), object_pairs_hook=lambda kv: dict(reversed(kv)))
        self.assertNotEqual(list(reordered), list(payload))
        self.assertEqual(blind.set_digest(reordered), payload["set_digest"])
        tampered = json.loads(json.dumps(payload))
        tampered["items"][0]["photo"] = "T-02" if tampered["items"][0]["photo"] != "T-02" else "T-01"
        self.assertNotEqual(blind.set_digest(tampered), payload["set_digest"])
        self.assertEqual(blind.set_digest({**payload, "set_digest": "0" * 64}), payload["set_digest"],
                         "the digest does not hash itself")

    def test_the_builder_prints_the_digest_and_the_key_hash(self):
        r = self.w.blind("pilot", "--set", "s1")
        key_sha = blind.protocol.sha256_file(self.w.s20 / "s1" / blind.KEY_NAME)
        _, payload = read_manifest(self.w.s20 / "s1")
        self.assertIn(f"set_digest  {payload['set_digest']}", r.stdout)
        self.assertIn(f"key sha256  {key_sha}", r.stdout)
        self.assertIn("BEFORE opening the viewer", r.stdout)


class PresentationTest(BlindWorld):
    def test_every_copy_is_a_metadata_free_png_with_its_sources_pixels(self):
        for kind in ("pilot", "gate"):
            with self.subTest(kind=kind):
                set_dir, key = self.build(kind, f"{kind}-1")
                files = sorted(p for p in set_dir.glob("*.png"))
                self.assertEqual(len(files), 3 * 5 if kind == "pilot" else 6 * 3)
                for it in key["items"].values():
                    for side, src in it["sources"].items():
                        copy = set_dir / src["presentation"]
                        self.assertTrue(re.fullmatch(r"[ip]\d\d-(original|kontrola|[XYZAB])\.png", copy.name), copy.name)
                        self.assertEqual(copy.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
                        self.assertEqual(set(png_chunks(copy)), {"IHDR", "IDAT", "IEND"}, copy.name)
                        self.assertEqual(pixels_sha(copy), src["pixels_sha256"], copy.name)
                        original = Path(src["path"]) if Path(src["path"]).is_absolute() else bf.ROOT / src["path"]
                        self.assertEqual(pixels_sha(original), src["pixels_sha256"])
                        self.assertEqual(blind.protocol.sha256_file(copy), src["presentation_sha256"])

    def test_the_jpeg_local_leaves_no_jpeg_signature(self):
        set_dir, key = self.build("gate")
        locals_ = [(set_dir / it["sources"][s]["presentation"], it["sources"][s])
                   for it in key["items"].values() for s, v in it["sides"].items() if v["arm"] == "local"]
        self.assertEqual(len(locals_), 3)
        for copy, src in locals_:
            self.assertTrue(src["path"].endswith(".jpg"))
            self.assertFalse(copy.read_bytes().startswith(b"\xff\xd8"))
            self.assertNotIn(b"JFIF", copy.read_bytes())

    def test_a_source_with_a_foreign_icc_profile_is_refused(self):
        local = self.w.private / "local" / "T-02.jpg"
        with Image.open(local) as im:
            im.load()
            img = im.copy()
        img.save(local, quality=92, icc_profile=make_icc(**D50_SRGB, gamma=1.8, desc="not the app's sRGB"))
        self.assertIn("(photo T-02)", self.blocked("gate", "source binding failed"))


class DrawTest(BlindWorld):
    class Known:
        """A generator whose every draw is known: shuffle reverses, choice takes the last."""

        calls = 0

        def shuffle(self, seq):
            type(self).calls += 1
            seq.reverse()

        def choice(self, seq):
            type(self).calls += 1
            return seq[-1]

    def run_main(self, *argv: str) -> None:
        out = io.StringIO()
        with mock.patch.object(blind, "rng", self.Known), mock.patch("sys.stdout", out), \
                mock.patch.dict("os.environ", self.w.env):
            self.assertEqual(blind.main(list(argv)), 0, out.getvalue())

    def test_every_draw_comes_from_blind_rng(self):
        self.Known.calls = 0
        self.run_main("pilot", "--set", "a")
        self.run_main("gate", "--set", "b")
        pilot = json.loads((self.w.s20 / "a" / blind.KEY_NAME).read_text())["items"]
        for it in pilot.values():  # reversed X/Y/Z against k 1.0/1.5/2.0
            self.assertEqual({lab: it["labels"][lab]["k"] for lab in "XYZ"}, {"Z": 1.0, "Y": 1.5, "X": 2.0})
        gate = json.loads((self.w.s20 / "b" / blind.KEY_NAME).read_text())["items"]
        order = [(gate[f"p{n:02d}"]["photo"], gate[f"p{n:02d}"]["comparison"]) for n in range(1, 7)]
        self.assertEqual(order, list(reversed([(p, r) for p in bf.TUNING for r in ("control-full", "local")])))
        for it in gate.values():
            self.assertEqual(it["sides"]["B"]["arm"], "nlm-gamma", "choice took the last side")
        self.assertEqual(self.Known.calls, 3 + 1 + 6, "3 label shuffles, 1 pair shuffle, 6 side draws")

    def test_rng_is_the_operating_systems_csprng(self):
        import secrets

        self.assertIsInstance(blind.rng(), secrets.SystemRandom)


class RefusalTest(BlindWorld):
    def nlm_record(self, pid="T-01", k="k1.5") -> Path:
        return self.w.s20 / "nlm" / k / f"{pid}.json"

    def test_provenance_must_match_the_committed_calibration_in_both_modes(self):
        for field in ("implementation_sha256", "config_sha256", "opencv_version"):
            for kind in ("pilot", "gate"):
                with self.subTest(field=field, kind=kind):
                    rec = self.nlm_record()
                    good = rec.read_text()
                    self.edit(rec, **{field: "0" * 64 if field != "opencv_version" else "4.12.0"})
                    # keep the arm's binding to the record intact, so only provenance can refuse
                    arm = self.w.private / "arms" / "nlm-gamma" / "k1.5" / "T-01.json"
                    arm_good = arm.read_text()
                    a = json.loads(arm_good)
                    a["source"]["record_sha256"] = blind.protocol.sha256_file(rec)
                    arm.write_text(json.dumps(a))
                    self.assertIn("(photo T-01)", self.blocked(kind, "provenance mismatch"))
                    rec.write_text(good)
                    arm.write_text(arm_good)

    def test_an_existing_set_id_is_never_reused(self):
        self.build("pilot")
        r = self.w.blind("gate", "--set", "s1")
        self.assertEqual(r.returncode, 3)
        self.assertIn("set: set exists", r.stdout)

    def test_a_bad_set_id_is_refused(self):
        for bad in ("../x", "A", "_x", "x" * 65):
            with self.subTest(set_id=bad):
                r = self.w.blind("pilot", "--set", bad)
                self.assertEqual(r.returncode, 3)
                self.assertIn("set: usage", r.stdout)

    def test_a_missing_or_unbound_record_is_refused(self):
        self.nlm_record("T-03", "k2.0").unlink()
        self.blocked("pilot", "missing source")

    def test_an_arm_from_another_auto_record_or_lut_is_refused(self):
        arm = self.w.private / "arms" / "nlm-gamma" / "k1.5" / "T-02.json"
        for field in ("auto_file_sha256", "lut_sha256"):
            with self.subTest(field=field):
                good = arm.read_text()
                self.edit(arm, **{field: "f" * 64})
                self.assertIn("(photo T-02)", self.blocked("gate", "source binding failed"))
                arm.write_text(good)

    def test_a_tampered_presentation_source_is_refused(self):
        png = self.w.private / "arms" / "control-full" / "T-01.png"
        with Image.open(png) as im:
            img = im.convert("RGB")
        img.putpixel((0, 0), (255, 0, 255))
        img.save(png, "PNG")
        self.blocked("pilot", "source binding failed")

    def test_a_decode_whose_pixels_disagree_with_a_consistent_record_chain_is_refused(self):
        """Every record agrees on pixels_sha256 = X, but the PNG decodes to something else: only the
        decoder-agreement check can see it (sharp wrote the record, Pillow reads the file)."""
        x = "0" * 64
        dec = self.w.s20 / "decoded" / "T-01.json"
        self.edit(dec, pixels_sha256=x)
        sha = blind.protocol.sha256_file
        self.edit(self.w.private / "arms" / "control-full" / "T-01.json", decoded_pixels_sha256=x,
                  decoded_record_sha256=sha(dec))
        for kd in ("k1.0", "k1.5", "k2.0"):
            nlm = self.w.s20 / "nlm" / kd / "T-01.json"
            self.edit(nlm, decoded_pixels_sha256=x)
            arm = self.w.private / "arms" / "nlm-gamma" / kd / "T-01.json"
            a = json.loads(arm.read_text())
            a.update(decoded_pixels_sha256=x, decoded_record_sha256=sha(dec))
            a["source"]["record_sha256"] = sha(nlm)
            arm.write_text(json.dumps(a))
        self.assertIn("(photo T-01)", self.blocked("pilot", "source binding failed"))
        log = next((self.w.s20 / "logs").glob("blind-*.log")).read_text()
        self.assertIn("does not hold pixels_sha256", log, "refused by the decoder-agreement check itself")

    def test_a_freeze_whose_k_is_not_in_the_grid_is_refused(self):
        self.w.freeze(1.25)
        self.blocked("gate", "freeze invalid")

    def test_a_tuning_path_into_the_holdout_is_refused_before_it_is_read(self):
        holdout = Path(next(e["path"] for e in self.w.entries if e["id"] == "V-01"))
        target = self.w.private / "arms" / "control-full" / "T-02.png"
        target.unlink()
        target.symlink_to(holdout)
        mode = holdout.stat().st_mode
        holdout.chmod(0)  # an open, hash or decode before the guard fails with EACCES instead
        self.addCleanup(holdout.chmod, stat.S_IMODE(mode))
        out = self.blocked("pilot", "access refused")
        self.assertNotIn("V-01", out, "the refused path is not echoed")

    def test_the_boundary_never_prints_a_traceback(self):
        with mock.patch.object(blind, "build", side_effect=RuntimeError("boom /secret/path nlm-gamma")):
            out = io.StringIO()
            with mock.patch("sys.stdout", out), mock.patch("sys.stderr", out), \
                    mock.patch.dict("os.environ", self.w.env):
                self.assertEqual(blind.main(["pilot", "--set", "x"]), 3)
        text = out.getvalue()
        self.assertIn("set: internal error", text)
        for leak in ("Traceback", "boom", "/secret/path", "nlm-gamma"):
            self.assertNotIn(leak, text)
        logs = list((self.w.s20 / "logs").glob("blind-*.log"))
        self.assertEqual(len(logs), 1)
        self.assertIn("boom", logs[0].read_text(), "the detail goes to the private log")


if __name__ == "__main__":
    unittest.main()
