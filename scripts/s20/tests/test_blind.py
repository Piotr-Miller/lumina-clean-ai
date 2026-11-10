"""S-20 step 1a, plan Phase 3: `blind.py`, the blind set builder.

Every case runs in `blind_fixture.SyntheticWorld`: a temporary benchmark (tuning T-01…T-03,
validation V-01…V-03), prepared inputs, shared decodes, NLM records and both arms written the way
the real tools write them. The NLM records carry the calibration bind committed at this
checkout's HEAD, which is what `blind.py` checks provenance against. No real photo is read.

The gate-build refusals of order step 8 (missing, uncommitted or stale freeze) are Phase 4's,
with the precondition itself (owner decision 2026-11-05).

The CLI classes also run for trial 1b as their `…1b` subclasses (plan Phase 8). Cases that drive
`blind.main` in this process stay 1a's: this process's `blind.py` reads the bind committed in this
checkout, while a 1b world runs its tools from their copy, where its synthetic 1b bind is committed.
"""

from __future__ import annotations

import io
import json
import os
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
sys.path.insert(0, str(bf.S20))
import common  # noqa: E402  (the rule tools' reason classes, raised by order step 8)

LEAKS = ("control-full", "nlm-gamma", "wavelet-gamma", "k1.0", "k1.5", "k2.0", '"k"', "test-photos/private",
         "/arms/", ".key-do-not-open", "Traceback")
ARM_WORDS = ("control", "nlm", "wavelet", "local", "decoded", "gamma", "arm", "k1.", "k2.", "sigma")


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
    trial = "1a"

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="s20-blind-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.w = bf.SyntheticWorld(self.tmp, trial=self.trial)
        self.t = self.w.t
        self.w.pilot_chain(1.5)  # a gate set needs order step 8: a committed pilot and freeze

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
        # a class blind.py does not own comes from the rule tools (an order-step-8 refusal)
        ways = blind.way_outs(self.t) if reason in blind.WAY_OUT else common.way_outs(self.t)
        self.assertIn(f"Way out: {ways[reason]}.", out, "the refusal names its way out (F7)")
        for leak in LEAKS + (str(self.w.private), str(self.w.s20)):  # F12: no identity in any channel
            self.assertNotIn(leak, out, f"leak {leak!r}")
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
            nlm = [s for s, v in sides.items() if v["arm"] == self.t.arm]
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
        self.assertIn("commit it, and only then open", r.stdout)


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

    def test_every_image_of_an_item_has_the_same_size(self):
        """File size must not rank the strengths or name the NLM side (impl review phase 3, F2)."""
        for kind in ("pilot", "gate"):
            with self.subTest(kind=kind):
                set_dir, key = self.build(kind, f"size-{kind}")
                for item, it in key["items"].items():
                    sizes = {side: (set_dir / s["presentation"]).stat().st_size for side, s in it["sources"].items()}
                    self.assertEqual(len(set(sizes.values())), 1, (item, sizes))

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

    def test_write_order_and_mtimes_carry_no_side(self):
        """Write order shows in mtimes and inode numbers, so it must follow the side, never the arm:
        the NLM side is forced to A and then to B, and the order stays original, A, B both times."""
        for nlm_side, pick in (("A", 0), ("B", -1)):
            with self.subTest(nlm_side=nlm_side):
                written: list[str] = []
                real = blind.write_copy

                def spy(src, out):
                    written.append(out.name)
                    return real(src, out)

                known = type("K", (self.Known,), {"choice": lambda self, seq, i=pick: seq[i]})
                out = io.StringIO()
                set_id = f"order-{nlm_side.lower()}"
                with mock.patch.object(blind, "rng", known), mock.patch.object(blind, "write_copy", spy), \
                        mock.patch("sys.stdout", out), mock.patch.dict("os.environ", self.w.env):
                    self.assertEqual(blind.main(["gate", "--set", set_id]), 0, out.getvalue())
                set_dir = self.w.s20 / set_id
                key = json.loads((set_dir / blind.KEY_NAME).read_text())["items"]
                for item, it in key.items():
                    self.assertEqual(it["sides"][nlm_side]["arm"], "nlm-gamma", item)
                    self.assertEqual([n for n in written if n.startswith(item + "-")],
                                     [f"{item}-original.png", f"{item}-A.png", f"{item}-B.png"], item)
                self.assertEqual({p.stat().st_mtime_ns for p in set_dir.iterdir()}, {blind.FILE_TIME_NS})

    def test_rng_is_the_operating_systems_csprng(self):
        import secrets

        self.assertIsInstance(blind.rng(), secrets.SystemRandom)


class RefusalTest(BlindWorld):
    def nlm_record(self, pid="T-01", k="k1.5") -> Path:
        return self.w.s20 / self.t.raw_dir / k / f"{pid}.json"

    def test_provenance_must_match_the_committed_calibration_in_both_modes(self):
        self.assertEqual(self.t.bind_fields[:2], ("implementation_sha256", "config_sha256"))
        for field in self.t.bind_fields:
            for kind in ("pilot", "gate"):
                with self.subTest(field=field, kind=kind):
                    rec = self.nlm_record()
                    good = rec.read_text()
                    self.edit(rec, **{field: "0" * 64 if field.endswith("sha256") else "4.12.0"})
                    # keep the arm's binding to the record intact, so only provenance can refuse
                    arm = self.w.private / "arms" / self.t.arm / "k1.5" / "T-01.json"
                    arm_good = arm.read_text()
                    a = json.loads(arm_good)
                    a["source"]["record_sha256"] = blind.protocol.sha256_file(rec)
                    arm.write_text(json.dumps(a))
                    if kind == "pilot":
                        self.assertIn("(photo T-01)", self.blocked(kind, "provenance mismatch"))
                    else:  # step 8 re-checks the pilot's NLM records first: the edited one no longer binds
                        self.blocked(kind, "binding failed")
                    rec.write_text(good)
                    arm.write_text(arm_good)

    def test_an_existing_set_id_is_never_reused(self):
        self.build("pilot")
        r = self.w.blind("gate", "--set", "s1")
        self.assertEqual(r.returncode, 3)
        self.assertIn("set: set exists", r.stdout)
        self.assertIn(f"Way out: {blind.WAY_OUT['set exists']}.", r.stdout)

    def test_a_bad_set_id_is_a_usage_error(self):
        """Exit 2 from argparse, like every s19/s20 tool; a trailing newline is not a set id (F6)."""
        for bad in ("../x", "A", "_x", "x" * 65, "pilot-1\n"):
            with self.subTest(set_id=bad):
                r = self.w.blind("pilot", "--set", bad)
                self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
                self.assertIn("must match", r.stderr)
                self.assertNotIn("Traceback", r.stdout + r.stderr)

    def test_every_reason_class_has_one_way_out(self):
        src = Path(blind.__file__).read_text()
        reasons = (set(re.findall(r'Blocked\("([a-z ]+)"', src))
                   | set(re.findall(r'reason, photo, detail = "([a-z ]+)"', src))
                   | set(re.findall(r'f"[^"\n]*",\s*"([a-z ]+)"\)', src))  # need(..., f"detail", "reason")
                   | set(re.findall(r'reason: str = "([a-z ]+)"', src)))
        self.assertIn("provenance mismatch", reasons, "the scan sees need()'s reason argument")
        self.assertEqual(reasons, set(blind.WAY_OUT))

    def test_a_bind_line_missing_a_field_is_refused(self):
        """A missing bind field must not let a record lacking it pass as None == None (F5)."""
        real = blind.committed
        for field in blind.BIND_FIELDS:
            with self.subTest(field=field):
                def without(rel_path, field=field):
                    raw = real(rel_path)
                    if rel_path == blind.evidence.CALIBRATION_REL:
                        raw = re.sub(rf" {field}=\S+".encode(), b"", raw)
                    return raw

                with mock.patch.object(blind, "committed", without), mock.patch.dict("os.environ", self.w.env):
                    with self.assertRaises(blind.Blocked) as cm:
                        blind.committed_bind()
                self.assertEqual(cm.exception.reason, "calibration not committed")
                self.assertIn(field, cm.exception.detail)

    def test_a_set_dir_that_appears_during_the_build_is_not_replaced(self):
        """Linux rename replaces an empty directory, so the id is re-checked right before it (F8)."""
        final = self.w.s20 / "late"
        real = blind.write_copy

        def appear(src, out):
            final.mkdir(parents=True, exist_ok=True)
            return real(src, out)

        out = io.StringIO()
        with mock.patch.object(blind, "write_copy", appear), mock.patch("sys.stdout", out), \
                mock.patch.dict("os.environ", self.w.env):
            self.assertEqual(blind.main(["pilot", "--set", "late"]), 3, out.getvalue())
        self.assertIn("set: set exists", out.getvalue())
        self.assertEqual(list(final.iterdir()), [], "the directory that appeared is left as it was")
        self.assertEqual([p.name for p in self.w.s20.iterdir() if p.name.startswith(".late-")], [])

    def test_every_copy_re_guards_the_realpath_it_opens(self):
        """write_copy runs minutes after verification, so it guards its source again (F8)."""
        guarded: list[list[Path]] = []
        real_guard, real_copy = blind.protocol.check_paths, blind.write_copy

        def guard(paths, **kw):
            guarded.append([Path(p) for p in paths])
            return real_guard(paths, **kw)

        def copy(src, out):
            start = len(guarded)
            entry = real_copy(src, out)
            self.assertEqual(src["_abs"], os.path.realpath(src["_abs"]), "the verified realpath is kept")
            self.assertIn([Path(src["_abs"])], guarded[start:], out.name)
            return entry

        out = io.StringIO()
        with mock.patch.object(blind.protocol, "check_paths", guard), mock.patch.object(blind, "write_copy", copy), \
                mock.patch("sys.stdout", out), mock.patch.dict("os.environ", self.w.env):
            self.assertEqual(blind.main(["gate", "--set", "guarded"]), 0, out.getvalue())

    def test_a_missing_or_unbound_record_is_refused(self):
        self.nlm_record("T-03", "k2.0").unlink()
        self.blocked("pilot", "missing source")

    def test_an_arm_from_another_auto_record_or_lut_is_refused(self):
        arm = self.w.private / "arms" / self.t.arm / "k1.5" / "T-02.json"
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
            nlm = self.w.s20 / self.t.raw_dir / kd / "T-01.json"
            self.edit(nlm, decoded_pixels_sha256=x)
            arm = self.w.private / "arms" / self.t.arm / kd / "T-01.json"
            a = json.loads(arm.read_text())
            a.update(decoded_pixels_sha256=x, decoded_record_sha256=sha(dec))
            a["source"]["record_sha256"] = sha(nlm)
            arm.write_text(json.dumps(a))
        self.assertIn("(photo T-01)", self.blocked("pilot", "source binding failed"))
        log = next((self.w.s20 / "logs").glob("blind-*.log")).read_text()
        self.assertIn("does not hold pixels_sha256", log, "refused by the decoder-agreement check itself")

    # ---- order step 8 (plan Phase 4 item 5; moved from Phase 3 by owner decision 2026-11-05)

    @property
    def FROZEN(self) -> str:  # noqa: N802 - the trial's freeze
        return self.t.frozen

    def test_a_missing_freeze_refuses_a_gate_build(self):
        self.w.git("rm", "-q", "--", self.FROZEN)
        self.w.git("commit", "-q", "-m", "drop freeze")
        self.blocked("gate", "order violation")

    def test_an_uncommitted_freeze_change_refuses_a_gate_build(self):
        path = self.w.repo / self.FROZEN
        doc = json.loads(path.read_text())
        doc["decided"] += " (edited)"
        path.write_text(json.dumps(doc))
        self.blocked("gate", "order violation")

    def test_a_freeze_whose_k_differs_from_the_recomputed_pilot_refuses_a_gate_build(self):
        tmp = Path(tempfile.mkdtemp(prefix="s20-blind-stale-"))
        self.addCleanup(shutil.rmtree, tmp, True)
        w = bf.SyntheticWorld(tmp, trial=self.trial)
        w.init_repo()
        key = w.seal("pilot", "pilot-y")
        w.write_export("pilot", w.pilot_export(key, lambda photo, labels: next(l for l, k in labels.items() if k == 1.5)))
        self.assertEqual(w.pilot("pilot-y").returncode, 0)
        frozen = w.repo / self.FROZEN
        doc = json.loads(frozen.read_text())
        doc["k"] = 2.0  # written once, committed once: write-once holds, the content does not follow
        frozen.write_text(json.dumps(doc))
        w.commit(self.FROZEN, message="freeze")
        r = w.blind("gate", "--set", "g")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("set: stale freeze", r.stdout)

    def test_a_stop_pilot_makes_an_earlier_freeze_unusable(self):
        key = json.loads((self.w.s20 / "pilot-x" / blind.KEY_NAME).read_text())
        self.w.write_export("pilot", self.w.pilot_export(key, lambda photo, labels: "none"))  # re-exported, legal
        self.assertEqual(self.w.pilot().returncode, 1, "the pilot is now STOP")
        self.blocked("gate", "pilot stop")

    def test_the_built_gate_key_names_the_committed_freeze(self):
        _, key = self.build("gate")
        raw = (self.w.repo / self.FROZEN).read_bytes()
        self.assertEqual(key["freeze"], {"path": self.FROZEN, "sha256": blind.sha_bytes(raw), "k": 1.5})

    def test_the_printed_seal_file_holds_one_valid_seal_line(self):
        r = self.w.blind("pilot", "--set", "s9")
        text = r.stdout.split("--- START seal file ---\n", 1)[1].split("--- END seal file ---", 1)[0]
        lines = [ln for ln in text.splitlines() if ln.startswith("S20-SEAL")]
        key_sha = blind.protocol.sha256_file(self.w.s20 / "s9" / blind.KEY_NAME)
        _, payload = read_manifest(self.w.s20 / "s9")
        self.assertEqual(lines, [f"S20-SEAL kind=pilot set_id=s9 set_digest={payload['set_digest']} key_sha256={key_sha}"])
        self.assertIn("procedural commitment", text)
        self.assertIn("not technical proof", text)

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


# ---------------------------------------------------------------- trial 1b (plan Phase 8 item 3)

IN_PROCESS = "drives blind.main in this process, whose bind is this checkout's 1a bind; covered for 1a"


class ManifestTest1b(ManifestTest):
    trial = "1b"


class PresentationTest1b(PresentationTest):
    trial = "1b"


class RefusalTest1b(RefusalTest):
    trial = "1b"

    test_a_bind_line_missing_a_field_is_refused = unittest.skip(IN_PROCESS)(
        RefusalTest.test_a_bind_line_missing_a_field_is_refused)
    test_a_set_dir_that_appears_during_the_build_is_not_replaced = unittest.skip(IN_PROCESS)(
        RefusalTest.test_a_set_dir_that_appears_during_the_build_is_not_replaced)
    test_every_copy_re_guards_the_realpath_it_opens = unittest.skip(IN_PROCESS)(
        RefusalTest.test_every_copy_re_guards_the_realpath_it_opens)
    test_the_boundary_never_prints_a_traceback = unittest.skip(IN_PROCESS)(
        RefusalTest.test_the_boundary_never_prints_a_traceback)

    def test_the_key_binds_the_1b_calibration_fields(self):
        """F20: the key's `calibration_bind` holds the row's bind fields, not a hard-coded opencv_version."""
        _, key = self.build("gate")
        self.assertEqual(set(key["calibration_bind"]), set(self.t.bind_fields))
        self.assertEqual(key["calibration_bind"], {f: self.w.bind[f] for f in self.t.bind_fields})
        for it in key["items"].values():
            treated = next(s for s, v in it["sides"].items() if v["arm"] == self.t.arm)
            self.assertIn(self.t.record_key, it["sources"][treated])
            self.assertNotIn("nlm_record", it["sources"][treated])

    def test_the_printed_seal_file_names_the_1b_seal_path_and_heading(self):
        r = self.w.blind("pilot", "--set", "s9")
        self.assertIn(f"as {self.t.pilot_seal},", r.stdout)
        text = r.stdout.split("--- START seal file ---\n", 1)[1]
        self.assertTrue(text.startswith("# S-20 step 1b — pilot seal\n"))


class TrialBindTest(unittest.TestCase):
    """F24: the bind line's `trial=` must equal the row's exactly: absent for 1a, `1b` for 1b."""

    def committed(self, line: str, grid: bytes = b'{"k": [1.0, 1.5, 2.0]}'):
        def fake(rel_path):
            if rel_path.endswith(".md"):
                return f"# record\n\n{line}\n".encode()
            return grid
        return fake

    def line(self, t, trial_token: str | None) -> str:
        fields = {f: "v" for f in t.bind_fields}
        fields["config_sha256"] = blind.sha_bytes(b'{"k": [1.0, 1.5, 2.0]}')
        token = "" if trial_token is None else f" trial={trial_token}"
        return f"S20-CALIBRATION{token} result=PASS " + " ".join(f"{f}={v}" for f, v in fields.items())

    def test_each_row_accepts_only_its_own_trial_token(self):
        for name, token, ok in (("1a", None, True), ("1a", "1a", False), ("1a", "1b", False),
                                ("1b", "1b", True), ("1b", None, False), ("1b", "1a", False), ("1b", "1c", False)):
            t = bf.TRIALS[name]
            with self.subTest(trial=name, token=token), mock.patch.object(blind, "committed",
                                                                         self.committed(self.line(t, token))):
                if ok:
                    bind = blind.committed_bind(t)
                    self.assertEqual(set(bind), set(t.bind_fields) | {"k"})
                else:
                    with self.assertRaises(blind.Blocked) as cm:
                        blind.committed_bind(t)
                    self.assertEqual(cm.exception.reason, "calibration not committed")

    def test_a_1b_bind_missing_numpy_version_is_refused(self):
        t = bf.TRIALS["1b"]
        line = re.sub(r" numpy_version=\S+", "", self.line(t, "1b"))
        with mock.patch.object(blind, "committed", self.committed(line)):
            with self.assertRaises(blind.Blocked) as cm:
                blind.committed_bind(t)
        self.assertIn("numpy_version", cm.exception.detail)


if __name__ == "__main__":
    unittest.main()
