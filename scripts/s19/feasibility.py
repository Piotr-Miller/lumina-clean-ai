#!/usr/bin/env python3
"""Paid feasibility calls for the S-19 vendor spike (cloud-model-comparison, research.md).

One call per (candidate, tuning photo), as listed in each research.md section's "Empirical
half". Owner consent: 2026-10-30, about $1.1 in total. Only s17-v2 TUNING photos are sent.

Every call writes test-photos/private/s19-spike/<call-id>/ (gitignored): the output, if any,
and meta.json with output size, wall time and the vendor's usage figures. A call whose
meta.json already exists is skipped, so a re-run never pays twice; delete the folder to
repeat one on purpose.

Keys come from the environment and are never written anywhere:
REPLICATE_API_TOKEN, FAL_KEY, OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY,\nTYPESAFE_API_KEY.

Usage:  set -a; . ~/.config/lumina-s19.env; set +a
        python3 scripts/s19/feasibility.py [call-id ...]      (default: every call)
Needs:  Pillow (with LittleCMS) for the sRGB copy and for output sizes.
"""

import base64
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from PIL import Image, ImageCms

ROOT = Path(__file__).resolve().parents[2]
PHOTOS = ROOT / "test-photos" / "licensed"
OUT = ROOT / "test-photos" / "private" / "s19-spike"

S17_03 = PHOTOS / "03-aurora-reykjanes-snow-lava.jpg"
S17_04 = PHOTOS / "04-phone-whitehouse-iphone13pro.jpg"
S17_07 = PHOTOS / "07-night-portrait.jpg"

# Production's pinned Bread (src/lib/services/bread.ts), not Replicate's latest version.
BREAD_VERSION = "057a4e073829a8c50f2622206f71a8ed25331cd07a520bc264469389c7c11e54"
SCI_VERSION = "8755e56955d1fe51fc5f146612124f2f616abc2b76f46163afe48918277c1039"

EDIT_PROMPT = (
    "Enhance this low-light photo: reduce noise and correct the exposure while keeping it a "
    "natural night scene. Preserve every detail exactly as it is: all text and lettering, faces, "
    "geometry and the colours of the light sources. Do not add, remove or change any content."
)
CHOOSER_PROMPT = (
    "You choose parameters for a low-light enhancement model for this photo. "
    "gamma is the illumination gamma: 1.0 brightens least, 1.5 brightens most. "
    "strength is the denoising strength: 0.0 is none, 0.2 is strongest. "
    "Pick values that improve the photo without washing out a dark night sky or smoothing away "
    "texture. If the photo already looks good, pick the gentlest values. "
    "Answer with JSON only: {\"gamma\": number, \"strength\": number}."
)
CHOOSER_SCHEMA = {
    "type": "object",
    "properties": {
        "gamma": {"type": "number", "minimum": 1.0, "maximum": 1.5},
        "strength": {"type": "number", "minimum": 0.0, "maximum": 0.2},
    },
    "required": ["gamma", "strength"],
    "additionalProperties": False,
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def data_uri(path: Path) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode()


def http(method, url, headers=None, body=None, timeout=600):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def post_json(url, headers, payload, timeout=600):
    status, raw = http("POST", url, {**headers, "Content-Type": "application/json"},
                       json.dumps(payload).encode(), timeout)
    try:
        return status, json.loads(raw)
    except ValueError:
        return status, {"raw": raw[:2000].decode(errors="replace")}


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, (name, data, ctype) in files.items():
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\n'
            f"Content-Type: {ctype}\r\n\r\n".encode() + data + b"\r\n"
        )
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def image_meta(data: bytes) -> dict:
    im = Image.open(io.BytesIO(data))
    return {"width": im.width, "height": im.height, "format": im.format,
            "icc_profile": bool(im.info.get("icc_profile")), "sha256": sha256(data), "bytes": len(data)}


def fetch(url: str) -> bytes:
    if url.startswith("data:"):
        return base64.b64decode(url.split(",", 1)[1])
    return http("GET", url, timeout=300)[1]


# ---------------------------------------------------------------- Replicate

def replicate(version: str, image: Path, extra: dict) -> dict:
    h = {"Authorization": "Bearer " + os.environ["REPLICATE_API_TOKEN"]}
    body, ctype = multipart({}, {"content": (image.name, image.read_bytes(), "image/jpeg")})
    status, raw = http("POST", "https://api.replicate.com/v1/files", {**h, "Content-Type": ctype}, body)
    file = json.loads(raw)
    if status >= 300:
        return {"error": file}
    try:
        status, pred = post_json("https://api.replicate.com/v1/predictions", {**h, "Prefer": "wait=60"},
                                 {"version": version, "input": {"image": file["urls"]["get"], **extra}})
        while pred.get("status") in ("starting", "processing"):
            time.sleep(3)
            pred = json.loads(http("GET", pred["urls"]["get"], h)[1])
    finally:
        http("DELETE", file["urls"]["get"], h)
    if pred.get("status") != "succeeded":
        return {"error": {k: pred.get(k) for k in ("status", "error", "id")}}
    out = pred["output"][0] if isinstance(pred["output"], list) else pred["output"]
    return {"output": fetch(out), "usage": {"prediction_id": pred["id"], "metrics": pred.get("metrics")}}


# ---------------------------------------------------------------- fal

def fal(endpoint: str, image: Path, extra: dict) -> dict:
    h = {"Authorization": "Key " + os.environ["FAL_KEY"], "X-Fal-Store-IO": "0"}
    status, res = post_json("https://fal.run/" + endpoint, h,
                            {"image_url": data_uri(image), "sync_mode": True, **extra}, timeout=900)
    if status >= 300:
        return {"error": res}
    img = res.get("images", [res.get("image")])[0]
    return {"output": fetch(img["url"]),
            "usage": {"reported_size": [img.get("width"), img.get("height")], "seed": res.get("seed"),
                      "timings": res.get("timings")}}


# ---------------------------------------------------------------- OpenAI

def openai_edit(image: Path, size: str) -> dict:
    body, ctype = multipart(
        {"model": "gpt-image-2.5-sunburst", "prompt": EDIT_PROMPT, "size": size, "quality": "high", "n": "1"},
        {"image": (image.name, image.read_bytes(), "image/jpeg")},
    )
    status, raw = http("POST", "https://api.openai.com/v1/images/edits",
                       {"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"], "Content-Type": ctype},
                       body, timeout=900)
    res = json.loads(raw)
    if status >= 300:
        return {"error": res}
    return {"output": base64.b64decode(res["data"][0]["b64_json"]), "usage": res.get("usage")}


def openai_choose(image: Path) -> dict:
    payload = {
        "model": "gpt-6-luna",
        "input": [{"role": "user", "content": [
            {"type": "input_text", "text": CHOOSER_PROMPT},
            {"type": "input_image", "image_url": data_uri(image), "detail": "high"},
        ]}],
        "text": {"format": {"type": "json_schema", "name": "params", "schema": CHOOSER_SCHEMA, "strict": True}},
    }
    status, res = post_json("https://api.openai.com/v1/responses",
                            {"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"]}, payload)
    if status >= 300:
        return {"error": res}
    text = "".join(c.get("text", "") for o in res.get("output", []) if o.get("type") == "message"
                   for c in o.get("content", []))
    return {"answer": text, "usage": res.get("usage")}


# ---------------------------------------------------------------- Gemini

def gemini(model: str, image: Path, prompt: str, gen: dict) -> dict:
    payload = {
        "contents": [{"parts": [
            {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(image.read_bytes()).decode()}},
            {"text": prompt},
        ]}],
        "generationConfig": gen,
    }
    status, res = post_json(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                            {"x-goog-api-key": os.environ["GEMINI_API_KEY"]}, payload, timeout=900)
    if status >= 300:
        return {"error": res}
    parts = res["candidates"][0]["content"]["parts"]
    out = {"usage": res.get("usageMetadata"), "model_version": res.get("modelVersion")}
    for p in parts:
        inline = p.get("inlineData") or p.get("inline_data")
        if inline:
            out["output"] = base64.b64decode(inline["data"])
        elif "text" in p and not p.get("thought"):
            out["answer"] = out.get("answer", "") + p["text"]
    return out


# ---------------------------------------------------------------- Anthropic

def claude_choose(image: Path) -> dict:
    payload = {
        "model": "claude-haiku-5-5",
        "max_tokens": 300,
        "messages": [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                         "data": base64.b64encode(image.read_bytes()).decode()}},
            {"type": "text", "text": CHOOSER_PROMPT},
        ]}],
        # Anthropic rejects minimum/maximum on numbers (400, 2026-10-30), so the bounds live only
        # in the prompt here and the answer is checked against them afterwards.
        "output_config": {"format": {"type": "json_schema", "schema": {
            **CHOOSER_SCHEMA,
            "properties": {k: {"type": "number"} for k in CHOOSER_SCHEMA["properties"]},
        }}},
    }
    status, res = post_json("https://api.anthropic.com/v1/messages",
                            {"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01"},
                            payload)
    if status >= 300:
        return {"error": res}
    return {"answer": "".join(c.get("text", "") for c in res["content"]), "usage": res.get("usage")}


# ---------------------------------------------------------------- TypeSafe Jev

def jev_choose(image: Path) -> dict:
    """Jev answers typed questions, not free JSON, so {gamma, strength} comes back as two scores
    and a preset choice. Images are "not yet ready for production" per TypeSafe and need the
    danger-zone header; inputs are capped at 1568 px a side."""
    payload = {
        "model": "jev-latest",
        "state": {"photo": "s17-04"},
        "assets": {"s17-04": {"type": "image", "format": "jpg",
                              "data_base64": base64.b64encode(image.read_bytes()).decode()}},
        "questions": {
            "brightening": {"type": "score", "instructions": "How much brightening does the night photo `photo` need?",
                            "criteria": ["None: it is already well exposed and should be left as it is.",
                                         "A little: slightly dark, gentle brightening would help.",
                                         "A lot: clearly underexposed, strong brightening would help."]},
            "noise": {"type": "score", "instructions": "How much visible noise or grain is in `photo`?",
                      "criteria": ["Clean: no visible noise.", "Some: noise visible in dark areas.",
                                   "Heavy: strong grain or colour noise across the image."]},
            "preset": {"type": "choice", "instructions": "Which enhancement suits the night photo `photo` best?",
                       "criteria": {"leave": "Leave it unchanged; it already looks good.",
                                    "gentle": "Gentle brightening and light denoising.",
                                    "medium": "Moderate brightening and moderate denoising.",
                                    "strong": "Strong brightening and strong denoising."}},
        },
    }
    status, res = post_json("https://api.typesafe.ai/v1/systemone",
                            {"Authorization": "Bearer " + os.environ["TYPESAFE_API_KEY"],
                             "TypeSafe-Danger-Zone-Images": "true"}, payload)
    if status >= 300:
        return {"error": res}
    return {"answer": json.dumps(res.get("answers")), "usage": res.get("usage"), "model_version": res.get("model")}


# ---------------------------------------------------------------- calls

def srgb_copy(src: Path) -> Path:
    """S17-03 converted from its embedded profile to sRGB, for the Bread ICC test."""
    dst = OUT / "_inputs" / (src.stem + "-srgb.jpg")
    if not dst.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        im = Image.open(src)
        prof = ImageCms.ImageCmsProfile(io.BytesIO(im.info["icc_profile"]))
        conv = ImageCms.profileToProfile(im, prof, ImageCms.createProfile("sRGB"), outputMode="RGB")
        conv.save(dst, quality=95, subsampling=0)
    return dst


def fit_copy(src: Path, max_side: int) -> Path:
    """A downscaled copy for hosts with an input-size limit (fal NAFNet: 3981 px, 2026-10-30)."""
    dst = OUT / "_inputs" / f"{src.stem}-max{max_side}.jpg"
    if not dst.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        im = Image.open(src)
        k = max_side / max(im.size)
        im.resize((round(im.width * k) // 16 * 16, round(im.height * k) // 16 * 16), Image.LANCZOS).save(
            dst, quality=95, subsampling=0, icc_profile=im.info.get("icc_profile"))
    return dst


CALLS = {
    "A-fal-control-light-S17-04": (S17_04, lambda: fal("fal-ai/control-light", S17_04, {"seed": 1})),
    "A-fal-nafnet-denoise-S17-04": (S17_04, lambda: fal("fal-ai/nafnet/denoise", S17_04, {"seed": 1})),
    "A-fal-nafnet-denoise-S17-04-max3968": (None, lambda: fal("fal-ai/nafnet/denoise", fit_copy(S17_04, 3968), {"seed": 1})),
    "A-replicate-sci-medium-S17-04": (S17_04, lambda: replicate(SCI_VERSION, S17_04, {"model_type": "medium"})),
    "A-bread-icc-original-S17-03": (S17_03, lambda: replicate(BREAD_VERSION, S17_03, {"gamma": 1.0, "strength": 0.05})),
    "A-bread-icc-srgb-S17-03": (None, lambda: replicate(BREAD_VERSION, srgb_copy(S17_03), {"gamma": 1.0, "strength": 0.05})),
    "B-openai-sunburst-S17-04": (S17_04, lambda: openai_edit(S17_04, "2048x1536")),
    "B-openai-sunburst-S17-07": (S17_07, lambda: openai_edit(S17_07, "2304x1536")),
    "B-gemini-nano-banana-2.1-S17-04": (S17_04, lambda: gemini(
        "gemini-nano-banana-2.1", S17_04, EDIT_PROMPT,
        {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "4:3", "imageSize": "2K"}})),
    "B-gemini-nano-banana-2.1-S17-07": (S17_07, lambda: gemini(
        "gemini-nano-banana-2.1", S17_07, EDIT_PROMPT,
        {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "3:2", "imageSize": "2K"}})),
    "D-claude-haiku-5-5-S17-04": (S17_04, lambda: claude_choose(S17_04)),
    "D-gemini-3.1-flash-lite-S17-04": (S17_04, lambda: gemini(
        "gemini-3.1-flash-lite", S17_04, CHOOSER_PROMPT,
        {"responseMimeType": "application/json", "responseJsonSchema": CHOOSER_SCHEMA})),
    "D-openai-gpt-6-luna-S17-04": (S17_04, lambda: openai_choose(S17_04)),
    "D-typesafe-jev-S17-04-max1568": (None, lambda: jev_choose(fit_copy(S17_04, 1568))),
}


def src_of(cid: str) -> Path:
    src = CALLS[cid][0]
    if src:
        return src
    if "icc-srgb" in cid:
        return srgb_copy(S17_03)
    return fit_copy(S17_04, 1568 if "max1568" in cid else 3968)


def main(ids):
    for cid in ids or CALLS:
        src, run = CALLS[cid]
        d = OUT / cid
        if (d / "meta.json").exists():
            print(f"{cid}: done before, skipped")
            continue
        d.mkdir(parents=True, exist_ok=True)
        t0 = time.time()
        try:
            res = run()
        except Exception as e:  # recorded, never retried automatically: a retry could pay twice
            res = {"error": repr(e)}
        meta = {"call": cid, "run_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "wall_s": round(time.time() - t0, 2),
                "input": str(src_of(cid).relative_to(ROOT)),
                "input_sha256": sha256(src_of(cid).read_bytes())}
        if "output" in res:
            data = res.pop("output")
            meta["output"] = image_meta(data)
            ext = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}.get(meta["output"]["format"], "bin")
            (d / f"output.{ext}").write_bytes(data)
        meta.update(res)
        if "error" in res:
            (d / "error.json").write_text(json.dumps(meta, indent=2))
            print(f"{cid}: ERROR {json.dumps(res['error'])[:300]}")
            continue  # no meta.json, so a fixed request can be re-run; the error cost nothing billable
        (d / "meta.json").write_text(json.dumps(meta, indent=2))
        o = meta.get("output", {})
        print(f"{cid}: {o.get('width')}x{o.get('height')} {meta['wall_s']}s "
              f"answer={meta.get('answer')!r} usage={json.dumps(meta.get('usage'))[:300]}")


if __name__ == "__main__":
    main(sys.argv[1:])
