# S-20 step 1a — Phase 0 premise record

Measured 2026-11-05 on branch `feat/cloud-classical-denoise` at `8b37ef8`, before any S-20 harness
code exists. Plan: `context/changes/cloud-classical-denoise/plan.md` § Phase 0. Each "if this
fails" consequence below is copied from the plan, where it was written before the check ran.

Host: Fedora, `/usr/bin/python3` 3.15.0, Intel Core i7-8665U, 8 logical CPUs. The measurement
script is reproduced in the appendix; it ran from a session scratch directory and is not committed
as a tool.

## Checks

| #   | Check                                                        | Command                                                                                                         | Result                                                                                                                                                                                                                                                                                                                                                                                                                             | If this fails                                                   |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 0   | Holdout guard allows the eight tuning ids                    | `python3 -B scripts/s19/protocol.py check-access --ids S17-01 S17-02 S17-03 S17-04 S17-05 S17-06 S17-07 S17-21` | **Pass.** Exit 0, `{"allowed": [all eight]}`. Every later check also called `require_access` and `check_paths` on each concrete path before reading it.                                                                                                                                                                                                                                                                            | No photo is read                                                |
| 1   | OpenCV and numpy import                                      | `python3 -I -c "import cv2, numpy; print(cv2.__version__)"`                                                     | **Pass.** Exit 0. OpenCV **4.13.0** (`python3-opencv-4.13.0-11.fc45`), numpy **2.5.4** (`python3-numpy-2.5.4-1.fc45`). At planning this exited 1; the owner has since installed the package.                                                                                                                                                                                                                                       | Phase 2 is blocked                                              |
| 2   | Common-input and real-Local dimensions agree on 8/8          | `premise.py <root> facts` (appendix)                                                                            | **Pass, 8/8.** For every id the common input's pixel size equals its `inputs/<id>.json` record, its Auto record's `common_dimensions` and the `local/<id>.jpg` download; neither file carries an EXIF orientation tag. Each common input's sha256 also equals both records. Sizes: S17-01 3840×2560, S17-02 3840×2221, S17-03 3840×2560, S17-04 4032×3024, S17-05 3072×4080, S17-06 4284×5712, S17-07 5145×3431, S17-21 6016×4000. | Stop and write the mismatch into `change.md`                    |
| 3a  | Seven published Local baselines equal the archive            | same                                                                                                            | **Pass, 7/7.** `test-photos/private/s19/local/<id>.jpg` is byte-identical (sha256) to `context/archive/2026-09-28-cloud-model-comparison/references/s19-local/<id>.jpg` for S17-02, -03, -04, -05, -06, -07 and -21.                                                                                                                                                                                                               | Stop                                                            |
| 3b  | S17-01 bound to its private sha256                           | same                                                                                                            | **Pass.** `local/S17-01.jpg` has sha256 `f94c288da5de92e80bdad69daf0a58c5d0477d28580bdd4f4deddccfef42bfd0`. The archive records only the abbreviation `f94c288d…bfd0` (`references/README.md:100`, archived `change.md:67`); the full hash matches it and is recorded here for the first time.                                                                                                                                     | Stop                                                            |
| 3c  | Auto records equal the archived ones                         | same                                                                                                            | **Pass, 8/8**, S17-01 included. Each `local/<id>.auto.json` parses to the same JSON value as the archived `s19-local/<id>.auto.json`. The bytes differ on all eight, as the archive README states (the archived copies were reformatted by Prettier); the comparison is therefore on parsed values.                                                                                                                                | Stop                                                            |
| 3d  | `S17-01.jpg` absent from the archive                         | same                                                                                                            | **As expected.** `s19-local/S17-01.jpg` does not exist; the author/uploader rights gap that keeps it unpublished is unresolved (`references/README.md:96-103`).                                                                                                                                                                                                                                                                    | —                                                               |
| 4   | One timed `fastNlMeansDenoisingColored` (declared exception) | `TMPDIR=<scratch> python3 -B premise.py <root> time` (appendix)                                                 | **13.31 s** for the filter on S17-06's common input (5712×4284×3, 24.5 MP), h = hColor = 10, windows 7/21, 8 OpenCV threads. Decode 0.15 s, PNG write 0.46 s. The plan expected minutes per render; 24 renders therefore take roughly 5–6 min in total on this host.                                                                                                                                                               | More than 10 min per render is reported, and the plan continues |

## Declared exception: the timed render

This is the one render before the rules are committed, and it is stated here as the plan requires.

- It ran on S17-06 only, at h = hColor = 10 — a fixed value from the plan, not a point of the
  pre-registered grid (`k` · σ̂ is not computed in Phase 0).
- The guards ran first: `require_access(["S17-06"])`, then `check_paths` on the common input and
  on the temporary output path. The common input's sha256 was checked against its record.
- The output was written to a fresh temporary directory, deleted unopened (`unlink`, then
  `rmdir`), and never shown. Only the wall times above were kept.
- The input was decoded by `cv2.imread`, not by the shared sharp decode of Phase 1. That does not
  matter for a timing, and nothing from this render feeds a later phase.
- **Not the step-4 guardrail.** This times one filter call on a laptop CPU. It says nothing about
  the ≤ 30 s p95 product budget, a container's cold start or a server CPU.

## What this changes downstream

- Nothing in the plan's design. All premises hold.
- The "minutes on CPU" estimate in plan § Critical Implementation Details (Render time) and
  § Performance Considerations is too pessimistic for this host by roughly an order of magnitude.
  Recorded as a fact; the plan text is not edited, because nothing depends on the estimate.
- S17-01's full baseline hash now exists in a committed record. Phase 4's gate can bind the Local
  side of S17-01 to it instead of to an 8+4-character abbreviation.

## Appendix: measurement script

sha256 of the file as run: `0ab3647bfd6759f283a860646aadbd30a9da742e35e64d95e2ede770d3c2f6e0`.

```python
"""S-20 Phase 0 premise measurements (scratch, not harness code).

Usage: python3 -B premise.py <repo-root> {facts|time}
Guards run before any byte of an image or image-bearing record is read:
protocol.require_access(ids), then protocol.check_paths(every concrete path).
"""
import hashlib, json, os, sys, tempfile, time
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(ROOT / "scripts" / "s19"))
import protocol  # noqa: E402

IDS = ["S17-01", "S17-02", "S17-03", "S17-04", "S17-05", "S17-06", "S17-07", "S17-21"]
PRIV = ROOT / "test-photos" / "private" / "s19"
ARCH = ROOT / "context" / "archive" / "2026-09-28-cloud-model-comparison" / "references" / "s19-local"


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def guard(ids, paths):
    protocol.require_access(ids)
    protocol.check_paths(paths, validation=False)


def facts():
    from PIL import Image
    paths = []
    for i in IDS:
        paths += [PRIV / "inputs" / f"{i}.json", PRIV / "inputs" / f"{i}-common.jpg",
                  PRIV / "local" / f"{i}.jpg", PRIV / "local" / f"{i}.auto.json",
                  ARCH / f"{i}.auto.json"]
        if i != "S17-01":
            paths.append(ARCH / f"{i}.jpg")
    guard(IDS, paths)
    out = {"dimensions": [], "baselines": []}
    for i in IDS:
        rec = json.loads((PRIV / "inputs" / f"{i}.json").read_text())
        common = PRIV / "inputs" / f"{i}-common.jpg"
        local = PRIV / "local" / f"{i}.jpg"
        common_sha = sha(common)
        with Image.open(common) as im:
            cdim = list(im.size); cexif = im.getexif().get(0x0112)
        with Image.open(local) as im:
            ldim = list(im.size); lexif = im.getexif().get(0x0112)
        auto = json.loads((PRIV / "local" / f"{i}.auto.json").read_text())
        out["dimensions"].append({
            "id": i, "common_sha_matches_record": common_sha == rec["common"]["sha256"],
            "common_sha_matches_auto": common_sha == auto["common_sha256"],
            "common": cdim, "record": rec["common"]["dimensions"], "local": ldim,
            "auto_common_dimensions": auto["common_dimensions"],
            "orientation_tags": [cexif, lexif], "equal": cdim == ldim == rec["common"]["dimensions"]})
        arch_auto = json.loads((ARCH / f"{i}.auto.json").read_text())
        b = {"id": i, "local_sha256": sha(local), "auto_json_equal_parsed": auto == arch_auto,
             "auto_bytes_equal": (PRIV / "local" / f"{i}.auto.json").read_bytes() == (ARCH / f"{i}.auto.json").read_bytes()}
        if i == "S17-01":
            b["archived_jpg_present"] = (ARCH / "S17-01.jpg").exists()
            b["matches_recorded_abbrev_f94c288d…bfd0"] = b["local_sha256"].startswith("f94c288d") and b["local_sha256"].endswith("bfd0")
        else:
            b["archived_sha256"] = sha(ARCH / f"{i}.jpg")
            b["byte_identical"] = b["archived_sha256"] == b["local_sha256"]
        out["baselines"].append(b)
    print(json.dumps(out, indent=1))


def timed():
    import cv2, numpy
    i = "S17-06"
    common = PRIV / "inputs" / f"{i}-common.jpg"
    tmpdir = Path(tempfile.mkdtemp(prefix="s20-p0-"))
    target = tmpdir / "nlm-probe.png"
    guard([i], [common, target])
    rec = json.loads((PRIV / "inputs" / f"{i}.json").read_text())
    assert sha(common) == rec["common"]["sha256"], "common input differs from its record"
    t0 = time.perf_counter()
    bgr = cv2.imread(str(common), cv2.IMREAD_COLOR)
    t1 = time.perf_counter()
    out = cv2.fastNlMeansDenoisingColored(bgr, None, 10, 10, 7, 21)
    t2 = time.perf_counter()
    ok = cv2.imwrite(str(target), out)
    t3 = time.perf_counter()
    target.unlink()  # deleted unopened, never shown
    tmpdir.rmdir()
    print(json.dumps({"id": i, "opencv": cv2.__version__, "numpy": numpy.__version__,
                      "threads": cv2.getNumThreads(), "cpu_count": os.cpu_count(),
                      "shape_hwc": list(bgr.shape), "h": 10, "hColor": 10,
                      "templateWindowSize": 7, "searchWindowSize": 21,
                      "decode_s": round(t1 - t0, 2), "nlm_s": round(t2 - t1, 2),
                      "write_s": round(t3 - t2, 2), "written": bool(ok),
                      "temp_deleted": not target.exists()}, indent=1))


{"facts": facts, "time": timed}[sys.argv[2]]()
```

## Erratum and guarded replay (2026-11-05, implementation review F1)

The original script and its checksum above are preserved as the historical measurement.
The Checks table's claim that every concrete path was guarded is too broad:

- `timed()` guarded the common image and temporary output, but read the input sidecar
  `inputs/S17-06.json` without passing that path to `check_paths` first.
- `facts()` omitted `ARCH / "S17-01.jpg"` from its guard list before checking its absence
  with `.exists()`.

These omissions mean a tuning-named sidecar or archive path resolving into the holdout would
not have been refused before that access. The review demonstrated the sidecar omission with
synthetic paths and a read trap; it did not establish that the original run accessed the holdout.

The corrected replay makes exactly these changes:

```diff
-    paths = []
+    paths = [ARCH / "S17-01.jpg"]

-    guard([i], [common, target])
-    rec = json.loads((PRIV / "inputs" / f"{i}.json").read_text())
+    record_path = PRIV / "inputs" / f"{i}.json"
+    guard([i], [common, target, record_path])
+    rec = json.loads(record_path.read_text())
```

Save the following block outside the repository, for example as
`/tmp/s20-premise-replay.py`, and run `python3 -B /tmp/s20-premise-replay.py` from the repository
root. It verifies the historical checksum, applies the two exact corrections in memory, and
runs only `facts()`. The original timing is not repeated; the one-render exception remains used.

````python
"""Guarded Phase 0 facts replay; no decode, filter, or output-image write."""
import hashlib
import sys
from pathlib import Path

root = Path.cwd().resolve()
record = root / "context/changes/cloud-classical-denoise/evaluations/step1-premise.md"
document = record.read_text()
source = document.split("```python\n", 1)[1].split("\n```", 1)[0] + "\n"
expected = "0ab3647bfd6759f283a860646aadbd30a9da742e35e64d95e2ede770d3c2f6e0"
if hashlib.sha256(source.encode()).hexdigest() != expected:
    raise RuntimeError("historical appendix changed; inspect it before replaying")

patches = [
    ("    paths = []\n", '    paths = [ARCH / "S17-01.jpg"]\n'),
    (
        '    guard([i], [common, target])\n'
        '    rec = json.loads((PRIV / "inputs" / f"{i}.json").read_text())\n',
        '    record_path = PRIV / "inputs" / f"{i}.json"\n'
        '    guard([i], [common, target, record_path])\n'
        '    rec = json.loads(record_path.read_text())\n',
    ),
]
for before, after in patches:
    if source.count(before) != 1:
        raise RuntimeError("expected exactly one patch site; inspect the appendix")
    source = source.replace(before, after, 1)

sys.argv = ["premise.py", str(root), "facts"]
exec(compile(source, "<guarded Phase 0 replay>", "exec"))
````

### Correction verification

- The documented replay executed successfully (exit 0). Dimensions and common-file bindings
  agree on 8/8; published Local hashes agree on 7/7; parsed Auto records agree on 8/8;
  S17-01's full private hash matches, and its archived JPEG remains absent. Auto dimensions and
  the absence of EXIF orientation tags also match the original record.
- The historical appendix still hashes to
  `0ab3647bfd6759f283a860646aadbd30a9da742e35e64d95e2ede770d3c2f6e0`.
  The corrected in-memory script hashes to
  `1624de556d4bbf51fe04fe728bca6da72b63c8f51ccdba535116d38f1f62a149`.
- A synthetic `S17-06.json` symlink resolving to a validation-named fixture is refused by the
  corrected `timed()` before `read_text`, image decode or filtering. Read/decode/filter traps
  would fail the check if reached.
- A synthetic archived `S17-01.jpg` symlink resolving to a validation-named fixture is refused
  by the corrected `facts()` before `.exists()` or image metadata access. Traps on both access
  methods would fail the check if reached.
- Both refusal checks passed (exit 0). Only synthetic fixtures were used for them; no holdout
  bytes were read, and no additional NLM render ran. The 13.31 s timing remains historical.
