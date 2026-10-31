"""Synthetic S-19 world for the tests: a throwaway benchmark, change.md, inputs and series.

Nothing here reads a real benchmark photo, a provider credential or the network. Every test
points the tools at its own temporary folder through S19_MANIFEST, S19_CHANGE_MD and
S19_PRIVATE, and validation photos are generated images with validation ids.
"""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

S19 = Path(__file__).resolve().parents[1]
ROOT = S19.parents[1]
sys.path.insert(0, str(S19))


def load(name: str):
    """Import a hyphenated S-19 script as a module."""
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), S19 / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------- ICC (independent of LittleCMS' builders)

D50_SRGB = {  # sRGB primaries chromatically adapted to D50 (Bradford), as ICC v2 matrix-shaper tags
    "r": (0.4360747, 0.2225045, 0.0139322),
    "g": (0.3850649, 0.7168786, 0.0971045),
    "b": (0.1430804, 0.0606169, 0.7141733),
}
D50 = (0.9642, 1.0, 0.8249)


def make_icc(r, g, b, gamma: float, desc: str) -> bytes:
    """A minimal ICC v2 RGB matrix/TRC display profile."""

    def s15(v: float) -> bytes:
        return struct.pack(">i", round(v * 65536))

    def xyz(t) -> bytes:
        return b"XYZ " + b"\0" * 4 + b"".join(s15(v) for v in t)

    def curv(gm: float) -> bytes:
        return b"curv" + b"\0" * 4 + struct.pack(">I", 1) + struct.pack(">H", round(gm * 256)) + b"\0\0"

    a = desc.encode("ascii") + b"\0"
    desc_tag = b"desc" + b"\0" * 4 + struct.pack(">I", len(a)) + a + b"\0" * 8 + b"\0" * 3 + b"\0" * 67
    tags = [(b"desc", desc_tag), (b"wtpt", xyz(D50)), (b"rXYZ", xyz(r)), (b"gXYZ", xyz(g)), (b"bXYZ", xyz(b)),
            (b"rTRC", curv(gamma)), (b"gTRC", curv(gamma)), (b"bTRC", curv(gamma))]
    offset = 128 + 4 + 12 * len(tags)
    table, data = b"", b""
    for sig, body in tags:
        while (offset + len(data)) % 4:
            data += b"\0"
        table += sig + struct.pack(">II", offset + len(data), len(body))
        data += body
    body = struct.pack(">I", len(tags)) + table + data
    size = 128 + len(body)
    header = (struct.pack(">I", size) + b"lcms" + struct.pack(">I", 0x02100000) + b"mntr" + b"RGB " + b"XYZ "
              + struct.pack(">6H", 2026, 10, 31, 0, 0, 0) + b"acsp" + b"\0" * 4 + b"\0" * 4 + b"\0" * 8 + b"\0" * 8
              + struct.pack(">I", 0) + b"".join(s15(v) for v in D50) + b"\0" * 4 + b"\0" * 16 + b"\0" * 28)
    assert len(header) == 128
    return header + body


def srgb_encode(linear: float) -> float:
    return 12.92 * linear if linear <= 0.0031308 else 1.055 * linear ** (1 / 2.4) - 0.055


# ---------------------------------------------------------------- world


class World(unittest.TestCase):
    """A temporary benchmark with tuning photos T-01…T-03 and validation photos V-01…V-12."""

    tuning = ("T-01", "T-02", "T-03")
    validation = tuple(f"V-{i:02d}" for i in range(1, 13))

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="s19-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.photos = self.tmp / "photos"
        self.photos.mkdir()
        self.private = self.tmp / "private"
        entries = []
        for i, pid in enumerate(self.tuning + self.validation):
            path = self.photos / f"{pid}.jpg"
            Image.new("RGB", (96 + 16 * i, 64), (20 + i, 30, 40)).save(path, quality=95)
            split = "tuning" if pid.startswith("T") else "validation"
            entries.append({"id": pid, "path": str(path), "split": split, "sha256": sha(path),
                            "display_dimensions": [96 + 16 * i, 64]})
        self.manifest = self.tmp / "manifest.json"
        self.write_manifest(entries)
        self.change_md = self.tmp / "change.md"
        self.set_records([])
        self.env = {**os.environ, "S19_MANIFEST": str(self.manifest), "S19_CHANGE_MD": str(self.change_md),
                    "S19_PRIVATE": str(self.private)}
        self._saved = {k: os.environ.get(k) for k in ("S19_MANIFEST", "S19_CHANGE_MD", "S19_PRIVATE")}
        os.environ.update({k: self.env[k] for k in self._saved})
        self.addCleanup(self._restore)

    def _restore(self) -> None:
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def write_manifest(self, entries: list[dict]) -> None:
        self.entries = entries
        self.manifest.write_text(json.dumps({"version": "test", "entries": entries}, indent=2))

    def set_records(self, approvals: list[str], freeze: list[str] | None = None) -> None:
        text = "# change\n\n## Notes\n\n- S19-SPEND phase=3 cap_usd=99 decision=approved date=2026-01-01 (prose, not a record)\n"
        text += "\n## S-19 approvals\n\n" + "".join(f"- {a}\n" for a in approvals)
        if freeze:
            text += "\n## S-19 freeze\n\n" + "".join(f"- {f}\n" for f in freeze)
        self.change_md.write_text(text)

    def run_cli(self, script: str, *args: str, tsx: bool = False) -> subprocess.CompletedProcess:
        cmd = (["npx", "--no-install", "tsx", str(S19 / f"{script}.ts")] if tsx
               else [sys.executable, "-B", str(S19 / f"{script}.py")])
        return subprocess.run([*cmd, *args], capture_output=True, text=True, env=self.env, cwd=ROOT)

    def prepare(self, *ids: str) -> None:
        r = self.run_cli("inputs", *ids)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def sidecar(self, pid: str) -> dict:
        return json.loads((self.private / "inputs" / f"{pid}.json").read_text())

    def make_config(self, name: str = "fake-gpt", kind: str = "gpt", bound_usd: float = 1.0,
                    max_retries: int = 1) -> Path:
        """A config whose per-call bound is exactly `bound_usd` (rounding_usd carries it all)."""
        cfg = {"name": name, "kind": kind, "vendor": "test", "endpoint": "http://invalid.test/", "model": "m",
               "prompt": "p", "quality": "high", "output_format": "png", "input": "common",
               "size_rule": {"max_pixels": 655360 * 2, "min_pixels": 1, "max_edge": 3840, "multiple": 16},
               "validity": {"format": "PNG"},
               "retry": {"max_retries": max_retries, "backoff_s": [0], "transient_http": [429, 500, 503],
                         "timeout_s": 5},
               "cost_bound": ({"output_image_tokens_per_megapixel": 0, "input_image_tokens": 0,
                               "input_text_tokens": 0, "usd_per_million_output_image_tokens": 30,
                               "usd_per_million_input_image_tokens": 8, "usd_per_million_input_text_tokens": 10,
                               "rounding_usd": bound_usd} if kind == "gpt"
                              else {"usd_per_megapixel": 0, "rounding_usd": bound_usd}),
               "implementation": {}}
        path = self.tmp / f"{name}.json"
        path.write_text(json.dumps(cfg))
        return path

    def make_series(self, configs: list[tuple[Path, str, list[str], int]], phase: int = 3,
                    split: str = "tuning", series_id: str = "s", prerequisites=None) -> Path:
        """configs: (config path, role, photos, slots per photo)."""
        series = {"series_id": series_id, "phase": phase, "split": split, "manifest_sha256": sha(self.manifest),
                  "configs": {}, "prerequisites": prerequisites or [], "slots": []}
        for path, role, photos, repeats in configs:
            cfg = json.loads(path.read_text())
            h = sha(path)
            series["configs"][h] = {"path": str(path), "name": cfg["name"], "kind": cfg["kind"], "role": role}
            for p in photos:
                side = self.sidecar(p)[cfg["input"]]
                for n in range(1, repeats + 1):
                    series["slots"].append({
                        "config_sha256": h, "config_name": cfg["name"], "kind": cfg["kind"], "photo": p, "slot": n,
                        "role": role, "input": cfg["input"], "input_sha256": side["sha256"],
                        "input_dimensions": side["dimensions"], "request_size": side["dimensions"],
                        "cost_bound_usd": cfg["cost_bound"]["rounding_usd"], "requires": [],
                    })
        path = self.tmp / f"series-{series_id}.json"
        path.write_text(json.dumps(series, indent=2))
        return path


def png_bytes(size: tuple[int, int]) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", tuple(size), (100, 110, 120)).save(buf, "PNG")
    return buf.getvalue()
