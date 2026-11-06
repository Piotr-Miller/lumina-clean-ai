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
EVAL = "context/changes/cloud-classical-denoise/evaluations"
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

    def __init__(self, tmp: Path, size: tuple[int, int] = (240, 160), n_tuning: int = 3):
        self.tmp, self.size = tmp, size
        self.tuning = tuple(f"T-{i:02d}" for i in range(1, n_tuning + 1))
        self.photos, self.private, self.s20, self.repo = tmp / "photos", tmp / "private", tmp / "s20", tmp / "repo"
        self.photos.mkdir(parents=True)
        entries = []
        for i, pid in enumerate(self.tuning + VALIDATION):
            path = self.photos / f"{pid}.jpg"
            scene(*size, seed=i).save(path, quality=95)
            entries.append({"id": pid, "path": str(path), "split": "tuning" if pid in self.tuning else "validation",
                            "sha256": sha(path), "display_dimensions": list(size)})
        self.entries = entries
        self.manifest = tmp / "manifest.json"
        self.manifest.write_text(json.dumps({"version": "test", "entries": entries}, indent=2))
        self.change_md = tmp / "change.md"
        self.change_md.write_text("# change\n\n## S-19 approvals\n\n")
        (self.repo / "scripts" / "s20" / "configs").mkdir(parents=True)
        self.env = {**os.environ, "S19_MANIFEST": str(self.manifest), "S19_CHANGE_MD": str(self.change_md),
                    "S19_PRIVATE": str(self.private), "S20_PRIVATE": str(self.s20), "S20_REPO": str(self.repo)}
        r = subprocess.run([sys.executable, "-B", str(S19 / "inputs.py"), *self.tuning], capture_output=True, text=True,
                           env=self.env, cwd=ROOT)
        if r.returncode != 0:
            raise RuntimeError(r.stdout + r.stderr)
        self.bind = load_blind().committed_bind()
        for pid in self.tuning:
            self.render(pid)
        self.repo_ready = False

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

    # ------------------------------------------------------------ the evidence chain (a temporary Git repo)

    def git(self, *args: str) -> str:
        return subprocess.run(["git", "-C", str(self.repo), "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                               "-c", "commit.gpgsign=false", *args], capture_output=True, text=True, check=True).stdout

    def commit(self, *rels: str, message: str = "evidence") -> None:
        self.git("add", "--", *rels)
        self.git("commit", "-q", "-m", message)

    def init_repo(self) -> None:
        """Order step 1: the rule files, copied from this checkout, plus this world's Local baselines."""
        if self.repo_ready:
            return
        sys.path.insert(0, str(S20))
        import evidence

        rules = evidence.rule_files(ROOT)
        for rel in rules:
            (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / rel, self.repo / rel)
        self.write_baselines()
        self.git("init", "-q")
        self.commit(*rules, "scripts/s20/configs/local-baselines.json", message="rules")
        self.repo_ready = True

    def write_baselines(self, override: dict | None = None) -> None:
        m = {pid: sha(self.private / "local" / f"{pid}.jpg") for pid in self.tuning}
        m.update(override or {})
        path = self.repo / "scripts" / "s20" / "configs" / "local-baselines.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"sha256": m}, indent=2) + "\n")

    def seal(self, kind: str, set_id: str, commit: bool = True) -> dict:
        """Build a set and save blind.py's printed seal file, as the owner does."""
        r = self.blind(kind, "--set", set_id)
        if r.returncode != 0:
            raise RuntimeError(r.stdout + r.stderr)
        text = r.stdout.split("--- START seal file ---\n", 1)[1].split("--- END seal file ---", 1)[0]
        rel = f"{EVAL}/{kind}-sealed.md"
        (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (self.repo / rel).write_text(text)
        if commit:
            self.commit(rel, message=f"{kind} seal")
        return json.loads((self.s20 / set_id / ".key-do-not-open.json").read_text())

    def pilot_export(self, key: dict, choose) -> dict:
        """`choose(photo, {label: k})` returns X/Y/Z/none for each item."""
        choices = []
        for item, it in sorted(key["items"].items()):
            labels = {lab: v["k"] for lab, v in it["labels"].items() if lab in "XYZ"}
            choices.append({"item_id": item, "photo": it["photo"], "choice": choose(it["photo"], labels)})
        return {"viewer": "compare-s20", "version": 1, "kind": "pilot", "set_id": key["set_id"],
                "set_digest": key["set_digest"], "rated_on": "2026-11-06", "choices": choices}

    def write_export(self, kind: str, doc: dict, commit: bool = True) -> None:
        rel = f"{EVAL}/{kind}-ratings.json"
        (self.repo / rel).write_text(json.dumps(doc, indent=2) + "\n")
        if commit:
            self.commit(rel, message=f"{kind} ratings")

    def run_tool(self, tool: str, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, "-B", str(S20 / f"{tool}.py"), *args], capture_output=True, text=True,
                              env=self.env, cwd=ROOT)

    def pilot(self, set_id: str = "pilot-x") -> subprocess.CompletedProcess:
        return self.run_tool("pilot", "--set", set_id, "--export", str(self.repo / EVAL / "pilot-ratings.json"))

    def pilot_chain(self, k: float, set_id: str = "pilot-x") -> dict:
        """Rules, pilot seal, ratings voting k on every photo, pilot.py, committed result and freeze."""
        self.init_repo()
        key = self.seal("pilot", set_id)
        self.write_export("pilot", self.pilot_export(key, lambda photo, labels: next(
            lab for lab, kk in labels.items() if kk == k)))
        r = self.pilot(set_id)
        if r.returncode != 0:
            raise RuntimeError(r.stdout + r.stderr)
        self.commit(f"{EVAL}/pilot-result.json", "scripts/s20/configs/nlm-frozen.json", message="pilot result")
        return key

    @staticmethod
    def gate_export(key: dict, spec: dict | None = None, default=None) -> dict:
        """A gate export from decoded intentions. `spec[(photo, comparison)]` = (quality, nlm side
        fidelity, reference side fidelity), quality one of nlm-clear/nlm-slight/tie/ref-slight/
        ref-clear; a fidelity is a level or (level, crops, reason). Translated to blind sides here."""
        default = default or {"control-full": ("nlm-clear", "none", "none"), "local": ("tie", "none", "none")}
        rows = []
        for item, it in sorted(key["items"].items()):
            nlm = next(s for s, v in it["sides"].items() if v["arm"] == "nlm-gamma")
            ref = "B" if nlm == "A" else "A"
            q, fn, fr = (spec or {}).get((it["photo"], it["comparison"]), default[it["comparison"]])
            quality = "tie" if q == "tie" else (nlm if q.startswith("nlm") else ref) + "-" + q.split("-")[1]
            fid = lambda f: ({"level": f, "crops": [], "reason": ""} if not isinstance(f, tuple)  # noqa: E731
                             else {"level": f[0], "crops": f[1], "reason": f[2]})
            rows.append({"pair_id": item, "quality": quality, "fidelity": {nlm: fid(fn), ref: fid(fr)}})
        return {"viewer": "compare-s20", "version": 1, "kind": "gate", "set_id": key["set_id"],
                "set_digest": key["set_digest"], "rated_on": "2026-11-06", "ratings": rows}

    def gate(self, set_id: str = "gate-x") -> subprocess.CompletedProcess:
        return self.run_tool("gate", "--set", set_id, "--export", str(self.repo / EVAL / "gate-ratings.json"))

    def blind(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, "-B", str(BLIND), *args], capture_output=True, text=True, env=self.env,
                              cwd=ROOT)


def publish() -> int:
    stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dt%H%M%S")
    dest = ROOT / "test-photos" / "private" / "s20"
    with tempfile.TemporaryDirectory(prefix="s20-synthetic-") as t:
        world = SyntheticWorld(Path(t), size=(640, 427))
        world.pilot_chain(world.bind["k"][1], set_id=f"synthetic-pilot-{stamp}")
        world.seal("gate", f"synthetic-gate-{stamp}")
        for kind in ("pilot", "gate"):
            set_id = f"synthetic-{kind}-{stamp}"
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copytree(world.s20 / set_id, dest / set_id)
            seal = (world.repo / EVAL / f"{kind}-sealed.md").read_text()
            line = next(ln for ln in seal.splitlines() if ln.startswith("S20-SEAL "))
            print(f"{kind}: context/changes/cloud-classical-denoise/references/compare-s20.html?set={set_id}\n"
                  f"  seal line to paste: {line}")
    print("Synthetic photos only; the keys are synthetic too. Delete the folders when done.")
    return 0


if __name__ == "__main__":
    if sys.argv[1:] != ["publish"]:
        print("usage: python3 scripts/s20/tests/blind_fixture.py publish", file=sys.stderr)
        sys.exit(2)
    sys.exit(publish())
