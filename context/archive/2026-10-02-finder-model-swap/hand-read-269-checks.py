#!/usr/bin/env python3
"""Checks behind the G3 pre-sort of openai/gpt-6-luna on PR #269 (hand-read-269-presort.md, 2026-10-03).

Reproduces, with Pillow only, three claims against the decode path of scripts/s17/decode-inputs.py at
fca2778 (the geometry code below is copied from that revision; sizes and orientations are synthetic JPEGs):
  D1  — the draft request for EXIF orientations 5-8 is in stored coordinates and covers the target;
  D15 — a JPEG draft never decodes smaller than the request (Pillow picks scale = min(W // sw, H // sh));
  D17 — the edge clamp in the 2-tap sampler is a no-op whenever the source is at least the target size.
Run from anywhere: python3 context/changes/finder-model-swap/hand-read-269-checks.py (Pillow 12.3.0 used).
"""
import io, math, random
from PIL import Image, ImageOps
ORIENTATION_TAG = 0x0112
SAMPLE_MAX_EDGE = 512

def make_jpeg(w, h, orientation):
    random.seed(0)
    img = Image.effect_noise((w, h), 64).convert("RGB")
    exif = Image.Exif(); exif[ORIENTATION_TAG] = orientation
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=90, exif=exif.tobytes())
    return buf.getvalue()

def decode(data):
    img = Image.open(io.BytesIO(data)); stored = img.size
    swapped = img.getexif().get(ORIENTATION_TAG, 1) in (5, 6, 7, 8)
    w, h = (stored[1], stored[0]) if swapped else stored
    scale = min(1.0, SAMPLE_MAX_EDGE / max(w, h))
    sw, sh = max(1, round(w * scale)), max(1, round(h * scale))
    req = (sh, sw) if swapped else (sw, sh)
    if (sw, sh) != (w, h):
        img.draft("RGB", req)
    decoded = img.size
    img = ImageOps.exif_transpose(img)
    od = img.size
    return dict(stored=stored, oriented=(w, h), target=(sw, sh), draft_request=req, decoded=decoded,
                after_transpose=od, covers=(od[0] >= sw and od[1] >= sh), ratio=(round(od[0]/sw,3), round(od[1]/sh,3))), img, (sw, sh)

print("== D1 / D15: draft geometry, stored size x orientation")
for (w, h) in [(4000, 3000), (3000, 4000), (4032, 3024), (1023, 2047), (1025, 513), (1536, 1024)]:
    for o in (1, 6, 8, 5):
        i, img, t = decode(make_jpeg(w, h, o))
        print(f"stored {w}x{h} o={o}: oriented {i['oriented']} target {i['target']} draft_req {i['draft_request']} decoded {i['decoded']} -> transposed {i['after_transpose']} covers_target={i['covers']} ratio={i['ratio']}")

print("\n== D1 control: what the claimed bug (oriented coordinates passed to draft) would do")
for (w, h) in [(4000, 3000), (1025, 513)]:
    data = make_jpeg(w, h, 6)
    img = Image.open(io.BytesIO(data)); sw, sh = (round(h*512/max(w,h)), round(w*512/max(w,h)))
    img.draft("RGB", (sw, sh)); print(f"stored {w}x{h} o=6, WRONG request {(sw, sh)} -> decoded {img.size} -> transposed {ImageOps.exif_transpose(img).size} vs target {(sw, sh)}")

print("\n== D17: clamp vs no-clamp, pure-python 2-tap bilinear, when source >= target")
def pb(img, size, clamp):
    src = img.convert("RGB").load(); sw, sh = img.size; dw, dh = size
    out = []; xmin = math.inf; xmax = -math.inf
    for j in range(dh):
        y = (j + 0.5) * sh / dh - 0.5
        if clamp: y = min(max(y, 0), sh - 1)
        y0 = math.floor(y); y1 = min(y0 + 1, sh - 1); fy = y - y0; y0c = min(max(y0, 0), sh - 1)
        for i in range(dw):
            x = (i + 0.5) * sw / dw - 0.5
            xmin = min(xmin, x); xmax = max(xmax, x)
            if clamp: x = min(max(x, 0), sw - 1)
            x0 = math.floor(x); x1 = min(x0 + 1, sw - 1); fx = x - x0; x0c = min(max(x0, 0), sw - 1)
            px = []
            for c in range(3):
                top = src[x0c, y0c][c] * (1 - fx) + src[x1, y0c][c] * fx
                bot = src[x0c, y1][c] * (1 - fx) + src[x1, y1][c] * fx
                px.append(math.floor(top * (1 - fy) + bot * fy + 0.5))
            out.append(tuple(px))
    return out, xmin, xmax
for (w, h) in [(4000, 3000), (1025, 513), (1023, 2047)]:
    i, img, t = decode(make_jpeg(w, h, 6))
    small = img.resize((min(img.size[0], 97), min(img.size[1], 61)))  # keep the pure-python loop cheap, same ratio class (>= 1)
    tgt = (max(1, round(small.size[0] / i['ratio'][0])), max(1, round(small.size[1] / i['ratio'][1])))
    a, xmin, xmax = pb(small, tgt, True); b, _, _ = pb(small, tgt, False)
    diff = max(abs(p[c] - q[c]) for p, q in zip(a, b) for c in range(3))
    print(f"source {small.size} -> target {tgt} (ratio {small.size[0]/tgt[0]:.2f}, {small.size[1]/tgt[1]:.2f}): unclamped x in [{xmin:.3f}, {xmax:.3f}] within [0, {small.size[0]-1}]: {xmin >= 0 and xmax <= small.size[0]-1}; max|clamp-noclamp| = {diff}")
print("algebra: for ratio r = sw/dw >= 1, x(0) = r/2 - 1/2 >= 0 and x(dw-1) = sw - r/2 - 1/2 <= sw - 1, so the clamp is a no-op whenever the source is at least the target size.")
