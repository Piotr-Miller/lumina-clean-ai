"""inputs.py: orientation and colour conversion against independently specified expectations.

Reproducibility (`--check`) alone cannot show a transform is right, so each fixture states its
expected pixels from first principles: a linear-gamma profile with sRGB primaries must come out
sRGB-encoded, a profile whose red and green primaries are swapped must swap those channels, and
an EXIF orientation 6 image must come out rotated 90° clockwise.
"""

from __future__ import annotations

import io
import json
import unittest

from PIL import Image, ImageCms

from fixtures import D50_SRGB, World, sha, srgb_encode, make_icc


class InputsTest(World):
    def replace_photo(self, pid: str, img: Image.Image, display: list[int], **save) -> None:
        path = self.photos / f"{pid}.jpg"
        img.save(path, "JPEG", quality=100, subsampling=0, **save)
        for e in self.entries:
            if e["id"] == pid:
                e["sha256"], e["display_dimensions"] = sha(path), display
        self.write_manifest(self.entries)

    def common(self, pid: str) -> Image.Image:
        return Image.open(self.private / "inputs" / f"{pid}-common.jpg").convert("RGB")

    def test_linear_profile_is_sRGB_encoded(self):
        icc = make_icc(D50_SRGB["r"], D50_SRGB["g"], D50_SRGB["b"], 1.0, "linear sRGB primaries")
        self.replace_photo("T-01", Image.new("RGB", (64, 32), (64, 64, 64)), [64, 32], icc_profile=icc)
        self.prepare("T-01")
        expected = round(srgb_encode(64 / 255) * 255)  # 137
        px = self.common("T-01").getpixel((32, 16))
        for c in px:
            self.assertLessEqual(abs(c - expected), 3, f"{px} vs expected gray {expected}")
        side = self.sidecar("T-01")
        self.assertEqual(side["source"]["icc_profile"], "linear sRGB primaries")
        self.assertIn("relative colorimetric", side["conversion"])

    def test_swapped_primaries_swap_channels(self):
        icc = make_icc(D50_SRGB["g"], D50_SRGB["r"], D50_SRGB["b"], 2.2, "swapped red/green")
        self.replace_photo("T-01", Image.new("RGB", (64, 32), (255, 0, 0)), [64, 32], icc_profile=icc)
        self.prepare("T-01")
        r, g, b = self.common("T-01").getpixel((32, 16))
        self.assertLess(r, 12)
        self.assertGreater(g, 243)
        self.assertLess(b, 12)

    def test_embedded_profile_is_srgb_and_exif_is_gone(self):
        exif = Image.Exif()
        exif[0x0112] = 6
        self.replace_photo("T-02", Image.new("RGB", (64, 32), (90, 90, 90)), [32, 64], exif=exif.tobytes())
        self.prepare("T-02")
        im = Image.open(self.private / "inputs" / "T-02-common.jpg")
        desc = ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(im.info["icc_profile"])))
        self.assertIn("sRGB", desc)
        self.assertEqual(im.getexif().get(0x0112, 1), 1)

    def test_orientation_6_rotates_clockwise(self):
        img = Image.new("RGB", (64, 32), (128, 128, 128))
        img.paste((255, 0, 0), (0, 0, 16, 16))  # stored top-left
        exif = Image.Exif()
        exif[0x0112] = 6
        self.replace_photo("T-02", img, [32, 64], exif=exif.tobytes())
        self.prepare("T-02")
        out = self.common("T-02")
        self.assertEqual(out.size, (32, 64))
        r, g, b = out.getpixel((24, 8))  # displayed top-right
        self.assertTrue(r > 200 and g < 60 and b < 60, (r, g, b))
        r, g, b = out.getpixel((8, 8))
        self.assertTrue(abs(r - 128) < 12 and abs(g - 128) < 12, (r, g, b))
        self.assertEqual(self.sidecar("T-02")["source"]["exif_orientation"], 6)

    def test_nafnet_input_is_downscaled_only_when_required(self):
        self.replace_photo("T-01", Image.new("RGB", (4100, 2000), (50, 60, 70)), [4100, 2000])
        self.replace_photo("T-02", Image.new("RGB", (3000, 2001), (50, 60, 70)), [3000, 2001])
        self.prepare("T-01", "T-02")
        big, small = self.sidecar("T-01"), self.sidecar("T-02")
        self.assertTrue(big["nafnet"]["downscaled"])
        w, h = big["nafnet"]["dimensions"]
        self.assertLessEqual(max(w, h), 3968)
        self.assertEqual((w % 16, h % 16), (0, 0))
        self.assertFalse(small["nafnet"]["downscaled"])
        self.assertEqual(small["nafnet"]["sha256"], small["common"]["sha256"])

    def test_prepared_files_are_quality_95_with_444_chroma(self):
        # implementation review F10: the 4:4:4 contract was set in code but never asserted
        from PIL import JpegImagePlugin

        self.replace_photo("T-01", Image.new("RGB", (4100, 2000), (50, 60, 70)), [4100, 2000])
        self.prepare("T-01")
        for target in ("common", "nafnet"):
            with self.subTest(target=target), Image.open(self.private / "inputs" / f"T-01-{target}.jpg") as im:
                self.assertEqual(im.format, "JPEG")
                self.assertEqual(JpegImagePlugin.get_sampling(im), 0, "0 means 4:4:4 (no chroma subsampling)")
                # quality 95 → the libjpeg luma table scaled by 10 %, so its DC entry is 2
                self.assertEqual(im.quantization[0][0], 2)

    def test_check_reproduces_and_detects_tampering(self):
        self.prepare("T-01")
        r = self.run_cli("inputs", "--check", "T-01")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        side = self.private / "inputs" / "T-01.json"
        data = json.loads(side.read_text())
        data["common"]["sha256"] = "0" * 64
        side.write_text(json.dumps(data))
        r = self.run_cli("inputs", "--check", "T-01")
        self.assertEqual(r.returncode, 1)
        self.assertIn("differs from its sidecar hash", r.stdout)

    def test_source_hash_mismatch_is_refused(self):
        Image.new("RGB", (64, 32), (1, 2, 3)).save(self.photos / "T-03.jpg")  # manifest hash now stale
        r = self.run_cli("inputs", "T-03")
        self.assertEqual(r.returncode, 1)
        self.assertIn("the manifest says", r.stdout)

    def test_all_means_tuning_only(self):
        r = self.run_cli("inputs", "--all")
        self.assertEqual(r.returncode, 0, r.stderr)
        made = sorted(p.name for p in (self.private / "inputs").glob("*.json"))
        self.assertEqual(made, ["T-01.json", "T-02.json", "T-03.json"])


if __name__ == "__main__":
    unittest.main()
