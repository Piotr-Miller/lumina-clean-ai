#!/usr/bin/env python3
"""GPT26 blind set builder (screen plan Phase 3, item 1; study-driven since `gpt-image-26-wider`).

  python3 scripts/gpt26/blind.py --config <config> --set <set_id>

Builds the sealed blind set of the config's study (`study.py`) from the complete, reconciled run
record and writes `<study.private_root>/<set_id>/`:

  - one RGB PNG per rater-facing image, named only by item id and side: `<item>-original.png`,
    `<item>-A.png`, `<item>-B.png`. One side is the delivered GPT output at its exact size, the
    other real Local (`scripts/s20/configs/local-baselines.json`) resized to that size with
    Lanczos; the original is resized the same way (plan § Definitions, comparison scale);
  - `manifest.js` (`window.S20_SET = …`), the S-20 viewer schema plus `passes`, which the
    study's viewer (`<study.viewer>?set=<set_id>`) loads;
  - the sealed key `.key-do-not-open.json` and verbatim frozen copies of the ledger and the
    run-state sidecar, whose sha256 the key binds.

It then writes `<study.change_dir>/evaluations/gate-sealed.md` exactly once,
with its one `GPT26-SEAL` line and the owner's commitment, and prints it. The owner commits that
file before opening any output.

Before anything is written the record must reconcile (`state.reconcile`) against the registration
and rule identities of THIS checkout, never the sidecar's own bindings (impl review phase 2,
F2), with every registered slot resolved and no inconsistency. Every source is hash-checked: the GPT
output against its ledger row, the original against the series input hash, Local against
`local-baselines.json`. Undelivered slots are left out of the set and listed in the key. With
zero delivered slots the set is an empty manifest plus key and seal, and no viewer opens.

Presentation (plan § Critical Implementation Details, blind leaks): RGB PNGs with only
IHDR/IDAT/IEND, compress level 0, so A and B of a pair have equal byte lengths; one mtime for
every file; writes in side order; anonymous names. A source carrying an ICC profile is accepted
only when it is one of the two sRGB profiles the inputs and the Local downloads embed, so
dropping it changes nothing a browser shows. Delivered pairs are split into at most two passes
with at most one slot of each scene per pass; pair order and sides are drawn independently with
`secrets.SystemRandom`. The two resized Local copies of a scene are pixel-identical: that residual
recognition risk is recorded, not hidden.

One CLI boundary: a refusal prints `set: <reason class>` with a fixed way out and exits 1, with no
traceback, path or arm name; the detail goes to a private log under `<study.private_root>/logs/`.
A failed build leaves no set directory and no seal.

Exit status: 0 built; 1 BLOCKED; 2 usage.
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as _dt
import hashlib
import io
import json
import os
import re
import secrets
import shutil
import sys
import tempfile
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run  # noqa: E402
import state  # noqa: E402
import study as study_mod  # noqa: E402

# scripts/s20/evidence.py (file-history checks) puts scripts/s20 first on sys.path when imported;
# that directory also holds a blind.py and a gate.py, so the path is restored right after.
_path = list(sys.path)
sys.path.insert(0, str(HERE.parent / "s20"))
import evidence  # noqa: E402

sys.path[:] = _path
del _path

ROOT = run.ROOT
runner, protocol, Refused = run.runner, run.protocol, run.Refused

SET_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
BASELINES = "scripts/s20/configs/local-baselines.json"
KEY_NAME = ".key-do-not-open.json"
LEDGER_COPY = ".ledger-do-not-open.jsonl"
SIDECAR_COPY = ".run-state-do-not-open.json"
MANIFEST = "manifest.js"
MANIFEST_PREFIX, MANIFEST_SUFFIX = "window.S20_SET = ", ";\n"
SEAL = re.compile(r"^GPT26-SEAL kind=gate set_id=([a-z0-9][a-z0-9-]{0,63}) "
                  r"set_digest=([0-9a-f]{64}) key_sha256=([0-9a-f]{64})$")
# The two sRGB profiles the sources embed: the prepared inputs' "sRGB built-in" and the
# "sRGB" Chrome's canvas writes into every Local download (measured 2026-11-20). Untagged PNG is
# sRGB to a browser, so dropping exactly these is a no-op.
SRGB_ICC_SHA256 = {"1d2e5a4c888f80b577c16b73ca06347cd168d99accd65b63d0547849ba1ee0c8",
                   "12afb4d9953adee0607d347daee5b78b18d6b3cab2d572b88970703f5edb37bc"}
# Stored deflate: a file's size then depends on its dimensions only, never on which side it is.
COMPRESS_LEVEL = 0
# Every file of a set carries this mtime (2026-11-05T00:00:00Z), so timestamps order nothing.
FILE_TIME_NS = 1_793_836_800 * 1_000_000_000
PNG_CHUNKS = ("IHDR", "IDAT", "IEND")
RESAMPLE = "LANCZOS"

WAY_OUT = {
    "usage": "run with --set <set_id> matching " + SET_ID.pattern,
    "set exists": "pick a new --set: a set_id is never reused",
    "seal exists": "a seal is write-once: never rebuild a sealed set; a new set needs a new change",
    "study invalid": "fix the config's study block; python3 scripts/gpt26/check_series.py --config <config> names "
                     "the field",
    "run not resolved": "finish the run first (python3 scripts/gpt26/run.py --config <config> --resume --cap "
                        "<cap>); every slot must be delivered or terminally undelivered",
    "run record blocked": "the run record does not reconcile: run python3 scripts/gpt26/run.py --config <config> "
                          "--dry-run --cap <cap> and resolve every BLOCKED line",
    "rules changed": "commit or restore the registration and rule files; they must equal the run's pinned identities",
    "approval invalid": "change.md must hold exactly one approved GPT26-SPEND line",
    "missing source": "restore the named slot's source files (output, prepared input, Local download)",
    "source binding failed": "a source no longer matches its record; restore it, never rebuild with other bytes",
    "baseline mismatch": "the Local download differs from local-baselines.json; restore the expected file",
    "access refused": "only tuning photos may be read; check that no path links into the holdout",
    "interrupted": "rebuild; the interrupted build left no set and no seal",
    "publication failed": "the seal and the set were both rolled back; fix the cause named in the private log and "
                          "rerun with the same --set",
    "publication incomplete": "the set was not published, but evaluations/gate-sealed.md is left on disk; the private "
                              "log says whether this build created it: remove it only then and only while "
                              "uncommitted, then rerun with the same --set",
    "internal error": "read the private log; report it if the cause is not in your inputs",
}

# Reasons after which this build may have left a file behind: the boundary must not say "Nothing was written".
RETAINED = frozenset({"publication incomplete"})


class Blocked(Exception):
    """A refusal. `reason` is a fixed class safe to print; `item` a trusted anonymous id or a
    registered slot label; `detail` goes only to the private log."""

    def __init__(self, reason: str, detail: str, item: str | None = None):
        super().__init__(detail)
        self.reason, self.detail, self.item = reason, detail, item


class BlockedMany(Exception):
    def __init__(self, found: list[Blocked]):
        super().__init__("; ".join(b.detail for b in found))
        self.found = found


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def rng():
    """Every draw comes from the OS CSPRNG; a module function so a test can patch the source."""
    return secrets.SystemRandom()


def rel(path: Path, root: Path) -> str:
    try:
        return Path(os.path.realpath(path)).relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(path)


def resolve(root: Path, recorded: str) -> Path:
    p = Path(recorded)
    return p if p.is_absolute() else root / p


# ---------------------------------------------------------------- registration and record


def approved_cap(root: Path, study: study_mod.Study) -> float:
    """The owner's approved cap: the one GPT26-SPEND line, validated by the runner's own parser."""
    try:
        text = run.approval_text(root, study)
    except Refused as e:
        raise Blocked("approval invalid", f"cannot read {study.change_md}: {e}")
    caps = [m.group(1) for m in map(run.SPEND_LINE.match, text.splitlines()) if m]
    if len(caps) != 1:
        raise Blocked("approval invalid", f"{len(caps)} GPT26-SPEND lines in {study.change_md}")
    try:
        run.spend_approval(text, float(caps[0]))
    except Refused as e:
        raise Blocked("approval invalid", str(e))
    return float(caps[0])


def parse_ledger(raw: bytes) -> list[dict]:
    """The runner's own reading of the ledger (`read_ledger`), from bytes."""
    rows = []
    for n, line in enumerate(raw.decode("utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except ValueError as e:
            raise Blocked("run record blocked", f"ledger line {n} is not JSON ({e})")
    return rows


def expected_bindings(root: Path, study: study_mod.Study, consumed: dict[str, bytes]) -> dict:
    """The registration and rule identities of this checkout (never the sidecar's own)."""
    try:
        return run.check_registration(root, study, include_approval=False, consumed=consumed)
    except Refused as e:
        raise Blocked("rules changed", str(e))


def reconciled(paths: run.Paths, study: study_mod.Study, ledger_raw: bytes,
               sidecar_raw: bytes | None) -> tuple[dict, str, dict, state.RunState, dict]:
    """(config, config_sha, series, state, bindings) for a COMPLETE record, or Blocked."""
    consumed: dict[str, bytes] = {}
    try:
        _, _, verified = run.checked_files(paths.root, study.binding_files)
        config, config_sha, series = run.load_registration(paths.root, study, consumed=consumed, verified=verified)
    except Refused as e:
        raise Blocked("rules changed", str(e))
    if sidecar_raw is None:
        raise Blocked("run not resolved", "no run-state sidecar: the study was never run")
    try:
        sidecar = json.loads(sidecar_raw.decode("utf-8"))
    except ValueError as e:
        raise Blocked("run record blocked", f"the run-state sidecar is not JSON ({e})")
    bindings = expected_bindings(paths.root, study, consumed)
    st = state.reconcile(series, config, config_sha, parse_ledger(ledger_raw), sidecar, root=paths.root,
                         study=study, expected_bindings=bindings)
    if st.errors:
        raise Blocked("run record blocked", "; ".join(st.errors))
    if not st.complete:
        raise Blocked("run not resolved", "unresolved: " + ", ".join(s.label for s in st.pending()))
    return config, config_sha, series, st, bindings


def load_baselines(root: Path, photos: list[str]) -> dict:
    try:
        _, _, data = run.checked_files(root, (BASELINES,))
        doc = json.loads(data[BASELINES].decode("utf-8"))
    except (Refused, ValueError) as e:
        raise Blocked("baseline mismatch", f"{BASELINES}: {e}")
    m = doc.get("sha256") if isinstance(doc, dict) else None
    if not isinstance(m, dict) or not all(isinstance(m.get(p), str) and re.fullmatch(r"[0-9a-f]{64}", m[p])
                                          for p in photos):
        raise Blocked("baseline mismatch", f"{BASELINES} lacks a sha256 for one of {photos}")
    return {p: m[p] for p in photos}


def require_clean(root: Path, rels: list[str], purpose: str) -> None:
    try:
        run.checked_files(root, tuple(rels))
    except Refused as e:
        raise Blocked("rules changed", f"{purpose}: {e}")


# ---------------------------------------------------------------- images


def decode(path: Path, item: str | None = None) -> tuple[bytes, list[int], str | None]:
    """RGB pixels, dimensions and the embedded ICC's sha256. RGBA is accepted only fully opaque
    (dropping alpha then changes nothing); any other mode or an unknown profile refuses."""
    from PIL import Image  # noqa: PLC0415

    try:
        with Image.open(path) as im:
            im.load()
            icc = im.info.get("icc_profile")
            if im.mode == "RGBA":
                if im.getchannel("A").getextrema() != (255, 255):
                    raise Blocked("source binding failed", f"{path} has transparent pixels", item)
                im = im.convert("RGB")
            elif im.mode != "RGB":
                raise Blocked("source binding failed", f"{path} is {im.mode}, not RGB", item)
            pixels, dims = im.tobytes(), list(im.size)
    except Blocked:
        raise
    except Exception as e:  # noqa: BLE001 - any decoder failure is one reason class
        raise Blocked("missing source", f"cannot decode {path}: {type(e).__name__}: {e}", item)
    icc_sha = sha_bytes(icc) if icc else None
    if icc_sha not in (None, *SRGB_ICC_SHA256):
        raise Blocked("source binding failed", f"{path} carries an ICC profile other than the known sRGB ones", item)
    return pixels, dims, icc_sha


def transformed(path: Path, size: list[int], item: str | None = None) -> tuple[bytes, dict, str | None]:
    """The source's RGB pixels resized with Lanczos to exactly `size`, the recipe that made them
    and the source's ICC sha256."""
    from PIL import Image  # noqa: PLC0415
    import PIL  # noqa: PLC0415

    pixels, dims, icc_sha = decode(path, item)
    im = Image.frombytes("RGB", tuple(dims), pixels).resize(tuple(size), Image.Resampling.LANCZOS)
    recipe = {"op": "resize", "resample": RESAMPLE, "from": dims, "to": list(size), "mode": "RGB",
              "icc": "known sRGB dropped (untagged PNG is sRGB)" if icc_sha else "none",
              "pillow": PIL.__version__}
    return im.tobytes(), recipe, icc_sha


def png_chunks(data: bytes) -> list[str]:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return []
    out, i = [], 8
    while i + 8 <= len(data):
        n = int.from_bytes(data[i:i + 4], "big")
        out.append(data[i + 4:i + 8].decode("latin-1"))
        i += 12 + n
    return out


def write_png(pixels: bytes, size: list[int], out: Path) -> str:
    """Encode RGB pixels as a stored-deflate PNG with only IHDR/IDAT/IEND; verify it decodes back."""
    from PIL import Image  # noqa: PLC0415

    buf = io.BytesIO()
    Image.frombytes("RGB", tuple(size), pixels).save(buf, "PNG", compress_level=COMPRESS_LEVEL)
    data = buf.getvalue()
    if set(png_chunks(data)) - set(PNG_CHUNKS):
        raise Blocked("internal error", f"{out.name}: unexpected PNG chunks {png_chunks(data)}")
    out.write_bytes(data)
    back, dims, _ = decode(out)
    if back != pixels or dims != list(size):
        raise Blocked("internal error", f"{out.name} does not decode to the pixels written")
    return sha_bytes(data)


def file_sha(path: Path, item: str | None = None) -> str:
    try:
        return protocol.sha256_file(path)
    except OSError as e:
        raise Blocked("missing source", f"{path}: {e}", item)


# ---------------------------------------------------------------- set


def canonical(payload: dict) -> bytes:
    """`scripts/s20/blind.py`'s canonical form: sorted keys, compact, the digest itself excluded."""
    return json.dumps({k: v for k, v in payload.items() if k != "set_digest"}, sort_keys=True,
                      separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def set_digest(payload: dict) -> str:
    return sha_bytes(canonical(payload))


def partition(delivered: list[state.Slot], r) -> list[list[state.Slot]]:
    """At most two passes, at most one slot of each scene per pass, order drawn within each.
    A scene's only delivered slot goes to pass 1, so pass 1 is never empty while pass 2 is not."""
    by_scene: dict[str, list[state.Slot]] = {}
    for s in delivered:
        by_scene.setdefault(s.photo, []).append(s)
    passes: list[list[state.Slot]] = [[], []]
    for scene in sorted(by_scene):
        slots = list(by_scene[scene])
        r.shuffle(slots)
        for n, s in enumerate(slots):
            passes[n].append(s)
    for p in passes:
        r.shuffle(p)
    return [p for p in passes if p]


def source_entry(role: str, path: Path, root: Path, pixels: bytes, presentation: str, presentation_sha: str,
                 *, source_sha: str, source_dims: list[int], icc_sha: str | None, recipe: dict | None) -> dict:
    return {"role": role, "path": rel(path, root), "sha256": source_sha, "source_dimensions": source_dims,
            "icc_sha256": icc_sha, "transform": recipe, "pixels_sha256": sha_bytes(pixels),
            "presentation": presentation, "presentation_sha256": presentation_sha}


def sources_for(slot: state.Slot, spec: dict, paths: run.Paths, ctx, baselines: dict) -> dict:
    """Hash-check one delivered slot's three sources; return their paths and hashes."""
    root, label = paths.root, slot.label
    ok = slot.output
    gpt = resolve(root, ok.get("output_path", ""))
    try:
        original, _ = runner.input_for(slot.photo, spec["input"], ctx)
    except (Refused, OSError, KeyError, ValueError) as e:
        raise Blocked("missing source", f"{label}: prepared input: {e}", label)
    local = paths.local / f"{slot.photo}.jpg"
    try:
        protocol.check_paths([gpt, original, local], validation=False)
    except Refused as e:
        raise Blocked("access refused", str(e), label)
    for p in (gpt, original, local):
        if not p.exists():
            raise Blocked("missing source", f"{label}: {p} is missing", label)
    if file_sha(gpt, label) != ok.get("output_sha256"):
        raise Blocked("source binding failed", f"{label}: the output differs from its ledger row", label)
    if file_sha(original, label) != spec["input_sha256"]:
        raise Blocked("source binding failed", f"{label}: the prepared input differs from the series hash", label)
    if file_sha(local, label) != baselines[slot.photo]:
        raise Blocked("baseline mismatch", f"{label}: {local} is not the pinned Local download", label)
    return {"gpt": gpt, "original": original, "local": local}


def seal_text(set_id: str, digest: str, key_sha: str, delivered: int, study: study_mod.Study) -> str:
    viewer = (f"`{study.viewer}?set={set_id}`" if delivered else
              "no viewer: zero slots were delivered, so the gate computes FAIL from terminal evidence alone "
              f"(`python3 scripts/gpt26/gate.py --config {study.config} --set {set_id}`)")
    return f"""# GPT26 study `{study.series_id}` — gate seal

Commit this file **before** opening any output (plan § Critical Implementation Details, order
step 4). It is write-once: the gate requires exactly one commit touching it, strictly before every
commit of `evaluations/ratings.json`. The tools read exactly one machine line:

GPT26-SEAL kind=gate set_id={set_id} set_digest={digest} key_sha256={key_sha}

## Human control

I open the set `{set_id}` only after this file is committed, and only through {viewer}. I do not
open its key or its frozen ledger copies, list its folder, or compare files or hashes across pairs
while rating. I rate in the sealed two-pass order and save the first-pass checkpoint before the
second pass. Each scene's two pairs share one Local file, so its two resized copies are
pixel-identical and I may recognise the repeated Local side; the procedure reduces immediate
comparison but cannot prevent recognition. This is a procedural commitment recorded in history,
not technical proof that nothing was opened earlier: Git can show when this seal was committed,
never who looked at what.
"""


def _open_seal(path: Path) -> int:
    return os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)


def _write_seal(fd: int, text: str) -> None:
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())


def _move_set(tmp: Path, final: Path) -> None:
    os.rename(tmp, final)


def _remove_seal(path: Path) -> None:
    os.unlink(path)


def publish(tmp: Path, final: Path, seal_path: Path, text: str, seal_rel: str) -> None:
    """Seal first, then the set. A failure undoes only what this call created, so a failed
    publication leaves neither the set nor a seal and the same --set can be built again; the
    redrawn mapping replaces one nobody saw. A seal file this call did not create is never
    removed. Leftovers this call cannot undo are reported as `publication incomplete`."""
    if os.path.lexists(final):
        raise Blocked("set exists", f"{final} appeared during the build: a set_id is never reused")
    seal_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = _open_seal(seal_path)
    except FileExistsError:
        raise Blocked("seal exists", f"{seal_rel} appeared during the build; nothing was published")
    except OSError as e:
        raise Blocked("publication failed", f"cannot create {seal_rel}: {e}; nothing was published")
    st = os.fstat(fd)
    mine = (st.st_dev, st.st_ino)
    written = False
    try:
        try:
            _write_seal(fd, text)
        finally:
            written = True  # fdopen owns the descriptor from here on, closed or not
        if os.path.lexists(final):
            raise Blocked("set exists", f"{final} appeared during the build: a set_id is never reused")
        _move_set(tmp, final)
    except BaseException as e:
        if not written:
            with contextlib.suppress(OSError):
                os.close(fd)
        try:
            now = os.lstat(seal_path)
        except FileNotFoundError:
            now = None
        except OSError as stat_error:
            raise Blocked("publication incomplete", f"cannot inspect {seal_rel} after {e!r}: {stat_error}") from e
        if now is not None and (now.st_dev, now.st_ino) != mine:
            raise Blocked("publication incomplete",
                          f"{seal_rel} no longer holds the file this build created after {e!r}; left untouched") from e
        if now is not None:
            try:
                _remove_seal(seal_path)
            except OSError as rm_error:
                raise Blocked("publication incomplete",
                              f"cannot remove the {seal_rel} this build created after {e!r}: {rm_error}") from e
        if isinstance(e, (Blocked, KeyboardInterrupt)) or not isinstance(e, Exception):
            raise
        raise Blocked("publication failed", f"{e!r}; the seal and the set were rolled back") from e


def build(set_id: str, study: study_mod.Study, paths: run.Paths | None = None) -> dict:
    paths = paths or run.study_paths(run.ROOT, study)
    root = paths.root
    if not SET_ID.fullmatch(set_id):
        raise Blocked("usage", f"set id {set_id!r} must match {SET_ID.pattern}")
    final = paths.private_write(paths.private / set_id)
    if os.path.lexists(final):
        raise Blocked("set exists", f"{final} exists: a set_id is never reused")
    seal_path = run.write_path(root, root / study.seal_rel)
    if os.path.lexists(seal_path) or evidence.present([study.seal_rel], root):
        raise Blocked("seal exists", f"{study.seal_rel} exists on disk or in the index")
    cap = approved_cap(root, study)
    study_ctx = runner.RunContext(ledger_dir=paths.private, output_dir=paths.private, input_dir=paths.inputs)
    ledger_path = paths.private_write(runner.ledger_path(study_ctx))
    sidecar = paths.private_write(paths.sidecar)
    try:
        ledger_raw = ledger_path.read_bytes() if ledger_path.exists() else b""
        sidecar_raw = sidecar.read_bytes() if sidecar.exists() else None
    except OSError as e:
        raise Blocked("run record blocked", f"cannot read the run record: {e}")
    config, config_sha, series, st, bindings = reconciled(paths, study, ledger_raw, sidecar_raw)
    require_clean(root, [BASELINES], "the blind set")
    specs = {(s["photo"], s["slot"]): s for s in series["slots"]}
    delivered = [st.slots[(s["photo"], s["slot"])] for s in series["slots"]
                 if st.slots[(s["photo"], s["slot"])].status == "delivered"]
    baselines = load_baselines(root, sorted({s.photo for s in delivered}))
    found, srcs = [], {}
    for slot in delivered:
        try:
            srcs[slot.label] = sources_for(slot, specs[(slot.photo, slot.slot)], paths, study_ctx, baselines)
        except Blocked as b:
            found.append(b)
    if found:
        raise BlockedMany(found)

    r = rng()
    passes = partition(delivered, r)
    private = paths.private_write(paths.private)
    private.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=f".{set_id}-", dir=private))
    try:
        items, key_items, pass_ids, n = [], {}, [], 0
        for number, members in enumerate(passes, 1):
            pass_ids.append([])
            for slot in members:
                n += 1
                item = f"p{n:02d}"
                pass_ids[-1].append(item)
                s = srcs[slot.label]
                size = list(slot.request_size)
                gpt_side = r.choice(("A", "B"))
                local_side = "B" if gpt_side == "A" else "A"
                gpt_pixels, gpt_dims, gpt_icc = decode(s["gpt"], slot.label)
                if gpt_dims != size:
                    raise Blocked("source binding failed", f"{slot.label}: output is {gpt_dims}, not {size}", slot.label)
                orig_pixels, orig_recipe, orig_icc = transformed(s["original"], size, slot.label)
                local_pixels, local_recipe, local_icc = transformed(s["local"], size, slot.label)
                faces = {"original": ("original", s["original"], orig_pixels, orig_recipe, orig_icc),
                         gpt_side: ("gpt", s["gpt"], gpt_pixels, None, gpt_icc),
                         local_side: ("local", s["local"], local_pixels, local_recipe, local_icc)}
                sources = {}
                # Written in side order, never GPT-first: write order shows in inodes.
                for face in ("original", "A", "B"):
                    role, src, pixels, recipe, icc = faces[face]
                    name = f"{item}-{face}.png"
                    psha = write_png(pixels, size, tmp / name)
                    sources[face] = source_entry(role, src, root, pixels, name, psha, source_sha=file_sha(src),
                                                 source_dims=recipe["from"] if recipe else gpt_dims, icc_sha=icc,
                                                 recipe=recipe)
                del gpt_pixels, orig_pixels, local_pixels
                items.append({"id": item, "photo": slot.photo,
                              "original": {"src": f"{item}-original.png", "dimensions": size},
                              "images": {"A": {"src": f"{item}-A.png"}, "B": {"src": f"{item}-B.png"}}})
                key_items[item] = {"photo": slot.photo, "slot": slot.slot, "pass": number,
                                   "attempt_id": slot.output.get("attempt_id"), "gpt_side": gpt_side,
                                   "local_side": local_side, "sources": sources}
        payload = {"set_id": set_id, "kind": "gate", "items": items, "passes": pass_ids}
        digest = set_digest(payload)
        payload["set_digest"] = digest
        (tmp / MANIFEST).write_text(MANIFEST_PREFIX + json.dumps(payload, sort_keys=True, indent=1, ensure_ascii=False)
                                    + MANIFEST_SUFFIX)
        (tmp / LEDGER_COPY).write_bytes(ledger_raw)
        (tmp / SIDECAR_COPY).write_bytes(sidecar_raw)
        item_of = {(it["photo"], it["slot"]): i for i, it in key_items.items()}
        key = {
            "set_id": set_id, "kind": "gate", "set_digest": digest,
            "built_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "series_id": series["series_id"], "config_sha256": config_sha, "gate_id": config["gate"]["id"],
            "bindings": bindings, "cap_usd": cap,
            "run_snapshot": {"ledger": {"name": LEDGER_COPY, "sha256": sha_bytes(ledger_raw)},
                             "sidecar": {"name": SIDECAR_COPY, "sha256": sha_bytes(sidecar_raw)}},
            "slots": [{"photo": s.photo, "slot": s.slot, "status": s.status, "reason": s.reason,
                       "item": item_of.get((s.photo, s.slot))} for s in st.slots.values()],
            "passes": pass_ids,
            "controls": {"compress_level": COMPRESS_LEVEL, "file_time_ns": FILE_TIME_NS, "png_chunks": list(PNG_CHUNKS),
                         "draws": "secrets.SystemRandom: pass membership, order within each pass, side per pair",
                         "repeated_local": config["blind_protocol"]["repeated_local_recognition_risk"]},
            "items": key_items,
        }
        (tmp / KEY_NAME).write_text(json.dumps(key, sort_keys=True, indent=1) + "\n")
        key_sha = protocol.sha256_file(tmp / KEY_NAME)
        for p in tmp.iterdir():  # one timestamp for every file: no file's mtime says when it was drawn
            os.utime(p, ns=(FILE_TIME_NS, FILE_TIME_NS))
        text = seal_text(set_id, digest, key_sha, len(items), study)
        publish(tmp, paths.private_write(final), run.write_path(root, seal_path), text, study.seal_rel)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    return {"set_id": set_id, "set_digest": digest, "key_sha256": key_sha, "items": len(items),
            "passes": [len(p) for p in pass_ids], "undelivered": [s.label for s in st.slots.values()
                                                                   if s.status == "undelivered"],
            "seal": text}


# ---------------------------------------------------------------- the one CLI boundary


def log_detail(paths: run.Paths, tool: str, text: str) -> str | None:
    try:
        name = f"{tool}-{_dt.datetime.now(_dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.log"
        path = paths.private_write(paths.private / "logs" / name)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("x", encoding="utf-8") as stream:
            stream.write(text)
        return f"logs/{name}"
    except Exception:  # noqa: BLE001
        return None


def boundary(tool: str, fn, paths: run.Paths, ways: dict, *, trusted: set[str] = frozenset(),
             log: bool = True) -> tuple[int, object]:
    """Run `fn()`; on any exception print sanitized lines only and return exit 1.

    Printed: the reason class, an item id only when it is a trusted anonymous id or registered
    slot label, and one fixed way out per class. Never a path, a hash, a traceback or an arm.
    The detail goes to the private log, unless `log` is false (a read-only check writes nothing)."""
    try:
        return 0, fn()
    except BaseException as e:  # noqa: BLE001 - the one boundary
        if isinstance(e, BlockedMany):
            found = e.found
        elif isinstance(e, Blocked):
            found = [e]
        elif isinstance(e, Refused):
            found = [Blocked("access refused", str(e))]
        elif isinstance(e, KeyboardInterrupt):
            found = [Blocked("interrupted", "interrupted")]
        else:
            found = [Blocked("internal error", "".join(traceback.format_exception(e)))]
        found = [b if b.reason in ways else Blocked("internal error", f"{b.reason}: {b.detail}") for b in found]
        detail = "\n".join(f"{b.item or 'set'}: {b.reason}: {b.detail}" for b in found) + "\n"
        logged = log_detail(paths, tool, detail) if log else None
        rows = sorted({((b.item if b.item in trusted else None), b.reason) for b in found},
                      key=lambda x: (x[0] or "", x[1]))
        for item, reason in rows:
            print(f"{item or 'set'}: {reason}")
        partial = any(r in RETAINED for _, r in rows)
        print("BLOCKED. A partial publication remains. Way out:" if partial else "BLOCKED. Nothing was written. Way out:")
        for reason in sorted({r for _, r in rows}):
            print(f"  {reason}: {ways[reason]}.")
        if not log:
            print("No private log was written (read-only check).")
        else:
            print(f"Details in the private GPT26 log {logged}." if logged else "No private log could be written.")
        return 1, None


def slot_labels(study: study_mod.Study) -> set[str]:
    """The registered slot labels: safe to print at the boundary."""
    return set(study.labels)


def set_id_arg(value: str) -> str:
    if not SET_ID.fullmatch(value):
        raise argparse.ArgumentTypeError(f"must match {SET_ID.pattern}")
    return value


def load_study(root: Path, config_arg: str) -> study_mod.Study | None:
    """The validated study, or None after printing the sanitized refusal (no private root to log to)."""
    try:
        return study_mod.load(root, config_arg)[0]
    except study_mod.StudyError:
        print("set: study invalid")
        print(f"BLOCKED. Nothing was written. Way out:\n  study invalid: {WAY_OUT['study invalid']}.")
        return None


def main(argv: list[str] | None = None, *, root: Path | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="GPT26 blind set builder")
    ap.add_argument("--config", required=True, help="the study's config (repo-relative or inside the checkout)")
    ap.add_argument("--set", required=True, dest="set_id", type=set_id_arg)
    args = ap.parse_args(argv)
    root = root or ROOT
    study = load_study(root, args.config)
    if study is None:
        return 1
    paths = run.study_paths(root, study)
    code, out = boundary("blind", lambda: build(args.set_id, study, paths), paths, WAY_OUT,
                         trusted=slot_labels(study))
    if code:
        return code
    print(f"✓ gate set {out['set_id']}: {out['items']} pair(s) in {len(out['passes'])} pass(es) "
          f"{out['passes']}; undelivered: {', '.join(out['undelivered']) or 'none'}\n"
          f"  set_digest  {out['set_digest']}\n"
          f"  key sha256  {out['key_sha256']}\n"
          f"Wrote {study.seal_rel}. Commit it, and only then "
          + (f"open {study.viewer}?set={out['set_id']}" if out["items"] else
             f"run python3 scripts/gpt26/gate.py --config {study.config} --set {out['set_id']} (zero delivered: "
             "no viewer, no ratings)")
          + ".\n--- START seal file ---\n" + out["seal"] + "--- END seal file ---")
    return 0


if __name__ == "__main__":
    sys.exit(main())
