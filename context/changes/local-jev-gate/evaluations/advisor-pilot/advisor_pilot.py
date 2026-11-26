#!/usr/bin/env python3
"""Cloud advisor pilot (local-jev-gate): one Jev request per licensed original, hint vs owner label.

    python3 -I advisor_pilot.py <repo-root> [--dry-run]

Labels were committed before this ran (evaluations/advisor-labels.json, PR #378).
The key comes from TYPESAFE_API_KEY or ~/.config/typesafe/api_key and is never printed.
"""
import hashlib, io, json, os, sys
from pathlib import Path

import requests
from PIL import Image, ImageOps

API = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-1.14.0"
MAX_SIDE = 1568
YES, NO = 0.7, 0.3
CAP_USD = 0.01
# Input price confirmed by the owner 2026-11-26; output price not read, bounded at 10x input.
IN_USD, OUT_USD_BOUND = 0.042e-6, 0.42e-6
EST_REQ_USD = 6000 * IN_USD + 400 * OUT_USD_BOUND  # pre-call reservation per request

QUESTIONS = {
    "is_photo": {"type": "noul", "instructions": "Is `photo` a camera photograph of a real scene?",
                 "criteria": {"true": "A photo taken with a camera or a phone.",
                              "false": "A screenshot, a scanned document, a drawing or a graphic."}},
    "low_light": {"type": "noul", "instructions": "Was `photo` taken at night or in dim light?",
                  "criteria": {"true": "A night sky, a street at night, a dim interior or dusk.",
                               "false": "Daylight, or a brightly lit room."}},
    "visible_noise": {"type": "noul",
                      "instructions": "Is there visible grain or coloured speckle in the dark areas of `photo`?",
                      "criteria": {"true": "The shadows look grainy or are full of small coloured dots.",
                                   "false": "The shadows are smooth, even where they are dark."}},
    "subject_too_dark": {"type": "noul",
                         "instructions": "Is the main part of the scene in `photo` too dark to see clearly?",
                         "criteria": {"true": "You have to strain to see what is there.",
                                      "false": "The scene is easy to read, even if it is dark and moody."}},
    "sharp": {"type": "noul", "instructions": "Is the scene in `photo` in focus and free of motion blur?",
              "criteria": {"true": "Edges, lights and stars are crisp.",
                           "false": "Everything is soft, smeared or shaken."}},
    "has_faces": {"type": "noul", "instructions": "Does `photo` show a recognisable human face?",
                  "criteria": {"true": "A face is large enough to recognise the person.",
                               "false": "No people, or only distant figures whose faces cannot be made out."}},
}


def level(p):
    return "yes" if p > YES else "no" if p < NO else "unsettled"


def hint(a):
    """Decision table from change.md § Cloud advisor; every combination has a row."""
    lv = {k: level(v["noul"]) for k, v in a.items()}
    if lv["is_photo"] == "no":
        h = "not_a_photo"
    elif lv["is_photo"] == "yes" and all(lv[k] == "no" for k in ("low_light", "visible_noise", "subject_too_dark")):
        h = "local_likely_enough"
    elif lv["is_photo"] == "yes" and "yes" in (lv["visible_noise"], lv["subject_too_dark"]):
        h = "cloud_may_help"
    else:
        h = "none"
    return h, lv["sharp"] == "no", lv


def prepare(path):
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((MAX_SIDE, MAX_SIDE))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=85, progressive=False)
        return buf.getvalue(), im.size


def api_key():
    p = Path.home() / ".config" / "typesafe" / "api_key"
    return os.environ.get("TYPESAFE_API_KEY") or (p.read_text().strip() if p.exists() else None)


def main():
    root, dry = Path(sys.argv[1]), "--dry-run" in sys.argv
    ev = root / "context/changes/local-jev-gate/evaluations"
    out = ev / "advisor-pilot"
    out.mkdir(exist_ok=True)
    labels = json.loads((ev / "advisor-labels.json").read_text())["labels"]
    if not dry and not api_key():
        sys.exit("no TypeSafe key found")
    spent, rows = 0.0, []
    for e in labels:
        src = root / e["source"]
        raw = src.read_bytes()
        if hashlib.sha256(raw).hexdigest() != e["source_sha256"]:
            sys.exit(f"{e['photo']}: source hash mismatch")
        jpg, size = prepare(src)
        ref = f"<photo-{e['photo']}>"
        payload = {"model": MODEL, "state": {"photo": ref}, "questions": QUESTIONS,
                   "assets": {ref: {"type": "image", "part": "photo"}}}
        (out / f"{e['photo']}.request.json").write_text(json.dumps(
            {"payload": payload, "image_sha256": hashlib.sha256(jpg).hexdigest(), "image_size": size}, indent=2) + "\n")
        if dry:
            continue
        if spent + EST_REQ_USD > CAP_USD:
            sys.exit(f"stop before {e['photo']}: ${spent:.5f} spent, next request would risk the ${CAP_USD} cap")
        files = {"request": (None, json.dumps(payload), "application/json"),
                 "photo": ("photo.jpg", jpg, "image/jpeg")}
        r = requests.post(API, files=files, timeout=120, headers={
            "Authorization": f"Bearer {api_key()}", "TypeSafe-Danger-Zone-Images": "true"})
        if r.status_code != 200:
            sys.exit(f"{e['photo']}: HTTP {r.status_code}: {r.text[:300]}")  # an error, never an answer
        d = r.json()
        (out / f"{e['photo']}.response.json").write_text(json.dumps(d, indent=2) + "\n")
        u = d.get("usage", {})
        spent += u.get("input_tokens", 0) * IN_USD + u.get("output_tokens", 0) * OUT_USD_BOUND
        h, blur, lv = hint(d["answers"])
        rows.append({"photo": e["photo"], "label": e["label"], "hint": h, "blur_warning": blur,
                     "noul": {k: v["noul"] for k, v in d["answers"].items()}, "levels": lv, "usage": u})
        print(e["photo"], e["label"], "->", h, "(blur)" if blur else "",
              {k: v["noul"] for k, v in d["answers"].items()})
    if not dry:
        (out / "results.json").write_text(json.dumps(
            {"model": MODEL, "thresholds": [YES, NO], "spent_usd_bound": round(spent, 6), "rows": rows}, indent=2) + "\n")
        print(f"spent (bound) ${spent:.5f}")


main()
