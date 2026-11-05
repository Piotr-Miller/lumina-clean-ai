"""A synthetic S-20 world for `blind.py`: benchmark, prepared inputs, shared decodes, NLM records and
both arms, written the way `local-arms.ts` and `nlm.py` write them. No real photo is read.

The images are drawn, not photographed: a dark noisy scene with a gradient sky, star-like dots,
block "lettering" and edges. `control-full` is a gamma lift; each `nlm-gamma` strength blurs before
the same lift, more for a larger `k`; Local blurs lightly. Different enough to see in the viewer.

Used by `test_blind.py`, and by the owner for plan manual check 3.3:

  python3 scripts/s20/tests/blind_fixture.py publish

builds a synthetic pilot set and a synthetic gate set in a temporary world and copies them into
`test-photos/private/s20/synthetic-{pilot,gate}-<UTC stamp>/`, then prints the viewer URLs.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

S20 = Path(__file__).resolve().parents[1]
ROOT = S20.parents[1]
S19 = ROOT / "scripts" / "s19"
BLIND = S20 / "blind.py"
TUNING = ("T-01", "T-02", "T-03")
VALIDATION = tuple(f"V-{i:02d}" for i in range(1, 4))
GAMMA = 1.6


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_blind():
    spec = importlib.util.spec_from_file_location("s20_blind", BLIND)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def scene(w: int, h: int, seed: int) -> Image.Image:
    import random

    rnd = random.Random(seed)
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            base = 10 + 30 * y // h
            px[x, y] = (base, base + 4, base + 14)
    d = ImageDraw.Draw(im)
    for _ in range(40):  # stars
        x, y = rnd.randrange(w), rnd.randrange(h // 2)
        d.point((x, y), fill=(200, 200, 210))
    d.rectangle((w // 8, h * 2 // 3, w // 2, h * 5 // 6), fill=(60, 45, 30))  # a building
    for i in range(6):  # "lettering"
        x0 = w // 8 + 8 + i * (w // 18)
        d.rectangle((x0, h * 2 // 3 + 8, x0 + w // 40, h * 2 // 3 + 22), fill=(220, 190, 80))
    d.line((0, h - 10, w, h // 2), fill=(90, 90, 100), width=2)
    noisy = im.copy()
    npx = noisy.load()
    for y in range(h):
        for x in range(w):
            r, g, b = npx[x, y]
            n = rnd.randint(-9, 9)
            npx[x, y] = tuple(max(0, min(255, v + n + rnd.randint(-4, 4))) for v in (r, g, b))
    return noisy


def bare(im: Image.Image) -> Image.Image:
    """Pixels only: no ICC, no info carried over (Pillow copies `info`, and PNG save writes iCCP)."""
    rgb = im.convert("RGB")
    return Image.frombytes("RGB", rgb.size, rgb.tobytes())


def lift(im: Image.Image) -> Image.Image:
    lut = [round(255 * (v / 255) ** (1 / GAMMA)) for v in range(256)]
    return bare(im.point(lut * 3))


class SyntheticWorld:
    """Everything blind.py reads, under one temporary folder; `env` points the tools at it."""

    def __init__(self, tmp: Path, size: tuple[int, int] = (240, 160)):
        self.tmp, self.size = tmp, size
        self.photos, self.private, self.s20, self.repo = tmp / "photos", tmp / "private", tmp / "s20", tmp / "repo"
        self.photos.mkdir(parents=True)
        entries = []
        for i, pid in enumerate(TUNING + VALIDATION):
            path = self.photos / f"{pid}.jpg"
            scene(*size, seed=i).save(path, quality=95)
            entries.append({"id": pid, "path": str(path), "split": "tuning" if pid in TUNING else "validation",
                            "sha256": sha(path), "display_dimensions": list(size)})
        self.entries = entries
        self.manifest = tmp / "manifest.json"
        self.manifest.write_text(json.dumps({"version": "test", "entries": entries}, indent=2))
        self.change_md = tmp / "change.md"
        self.change_md.write_text("# change\n\n## S-19 approvals\n\n")
        (self.repo / "scripts" / "s20" / "configs").mkdir(parents=True)
        self.env = {**os.environ, "S19_MANIFEST": str(self.manifest), "S19_CHANGE_MD": str(self.change_md),
                    "S19_PRIVATE": str(self.private), "S20_PRIVATE": str(self.s20), "S20_REPO": str(self.repo)}
        r = subprocess.run([sys.executable, "-B", str(S19 / "inputs.py"), *TUNING], capture_output=True, text=True,
                           env=self.env, cwd=ROOT)
        if r.returncode != 0:
            raise RuntimeError(r.stdout + r.stderr)
        self.bind = load_blind().committed_bind()
        for pid in TUNING:
            self.render(pid)

    # ------------------------------------------------------------ what the real tools write

    def sidecar(self, pid: str) -> dict:
        return json.loads((self.private / "inputs" / f"{pid}.json").read_text())

    def render(self, pid: str) -> None:
        side = self.sidecar(pid)
        common = Path(side["common"]["path"])
        common = common if common.is_absolute() else ROOT / common
        with Image.open(common) as im:
            dec_img = bare(im)
        dec_dir = self.s20 / "decoded"
        dec_dir.mkdir(parents=True, exist_ok=True)
        dec_png = dec_dir / f"{pid}.png"
        dec_img.save(dec_png, "PNG")
        pixels = hashlib.sha256(dec_img.tobytes()).hexdigest()
        dims = list(dec_img.size)
        dec_json = dec_png.with_suffix(".json")
        dec_json.write_text(json.dumps({"kind": "decoded", "id": pid, "common_sha256": side["common"]["sha256"],
                                        "pixels_sha256": pixels, "output_sha256": sha(dec_png), "dimensions": dims}))
        auto = self.private / "local" / f"{pid}.auto.json"
        auto.parent.mkdir(parents=True, exist_ok=True)
        auto.write_text(json.dumps({"id": pid, "common_sha256": side["common"]["sha256"], "gamma": GAMMA}))
        common_fields = {"id": pid, "decoded_record": str(dec_json), "decoded_record_sha256": sha(dec_json),
                         "decoded_pixels_sha256": pixels, "auto_file_sha256": sha(auto), "gamma": GAMMA,
                         "lut_sha256": hashlib.sha256(bytes(round(255 * (v / 255) ** (1 / GAMMA))
                                                            for v in range(256))).hexdigest(),
                         "tone": {"kind": "gamma"}, "blur_sigma_px": 0, "dimensions": dims}
        ctl_dir = self.private / "arms" / "control-full"
        ctl_dir.mkdir(parents=True, exist_ok=True)
        lift(dec_img).save(ctl_dir / f"{pid}.png", "PNG")
        (ctl_dir / f"{pid}.json").write_text(json.dumps({
            "arm": "control-full", **common_fields, "source": None,
            "output_sha256": sha(ctl_dir / f"{pid}.png")}))
        for k in self.bind["k"]:
            kd = f"k{k:.1f}"
            nlm_dir = self.s20 / "nlm" / kd
            nlm_dir.mkdir(parents=True, exist_ok=True)
            den = bare(dec_img.filter(ImageFilter.GaussianBlur(radius=0.6 * k)))
            den.save(nlm_dir / f"{pid}.png", "PNG")
            nlm_rec = nlm_dir / f"{pid}.json"
            nlm_rec.write_text(json.dumps({
                "id": pid, "k": k, "sigma_hat_L": 3.0, "sigma_hat_ab": 2.0, "h": round(3 * k, 2),
                "h_color": round(2 * k, 2), "windows": {"templateWindowSize": 7, "searchWindowSize": 21},
                "decoded_record": str(dec_json), "decoded_pixels_sha256": pixels,
                "output_sha256": sha(nlm_dir / f"{pid}.png"), "dimensions": dims,
                "config_sha256": self.bind["config_sha256"], "opencv_version": self.bind["opencv_version"],
                "implementation_sha256": self.bind["implementation_sha256"], "rendered_at": "2026-11-05T00:00:00Z"}))
            arm_dir = self.private / "arms" / "nlm-gamma" / kd
            arm_dir.mkdir(parents=True, exist_ok=True)
            lift(den).save(arm_dir / f"{pid}.png", "PNG")
            (arm_dir / f"{pid}.json").write_text(json.dumps({
                "arm": "nlm-gamma", **common_fields,
                "source": {"kind": "nlm", "record": str(nlm_rec), "record_sha256": sha(nlm_rec),
                           "output_sha256": sha(nlm_dir / f"{pid}.png"), "config_sha256": self.bind["config_sha256"],
                           "k": k},
                "output_sha256": sha(arm_dir / f"{pid}.png")}))
        lift(dec_img.filter(ImageFilter.GaussianBlur(radius=0.4))).save(self.private / "local" / f"{pid}.jpg",
                                                                          quality=92)

    def freeze(self, k: float) -> None:
        (self.repo / "scripts" / "s20" / "configs" / "nlm-frozen.json").write_text(json.dumps({"k": k}))

    def blind(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, "-B", str(BLIND), *args], capture_output=True, text=True, env=self.env,
                              cwd=ROOT)


def publish() -> int:
    stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dt%H%M%S")
    dest = ROOT / "test-photos" / "private" / "s20"
    with tempfile.TemporaryDirectory(prefix="s20-synthetic-") as t:
        world = SyntheticWorld(Path(t), size=(640, 427))
        world.freeze(world.bind["k"][1])
        for kind in ("pilot", "gate"):
            set_id = f"synthetic-{kind}-{stamp}"
            r = world.blind(kind, "--set", set_id)
            if r.returncode != 0:
                print(r.stdout + r.stderr, file=sys.stderr)
                return 1
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copytree(world.s20 / set_id, dest / set_id)
            print(f"{kind}: context/changes/cloud-classical-denoise/references/compare-s20.html?set={set_id}")
    print("Synthetic photos only; the keys are synthetic too. Delete the folders when done.")
    return 0


if __name__ == "__main__":
    if sys.argv[1:] != ["publish"]:
        print("usage: python3 scripts/s20/tests/blind_fixture.py publish", file=sys.stderr)
        sys.exit(2)
    sys.exit(publish())
