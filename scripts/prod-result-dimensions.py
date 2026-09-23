#!/usr/bin/env python3
"""
READ-ONLY production diagnostic: what resolution did Cloud AI actually return,
for every stored job?

Cloud AI caps its output long edge at 1536px, so the result's own dimensions are
a sufficient discriminator and no source file is needed (sources are reaped at
24h, results never are):

    result long edge >= 1536  ->  the source was LARGER, so it was downscaled
    result long edge <  1536  ->  the source was <= 1536, so it passed through

Safety contract, and the reason this file is prefixed `prod-`:

  * It performs NO writes of any kind - one PostgREST select, one signed URL per
    object, one ranged GET of the leading bytes. It never fetches a whole image.
  * The service-role key is read from the environment at run time. It is never
    stored, logged or printed, and MUST NOT be committed anywhere.
  * Run it yourself rather than handing an agent the key. That is how the
    2026-09-22 census was produced: the maintainer ran it and pasted the table.

Usage, from the repo root:

    SUPABASE_SERVICE_ROLE_KEY='<service role key>' python3 scripts/prod-result-dimensions.py

SUPABASE_URL defaults to the luminaclean-prod project; override it to point
elsewhere. Result recorded in
context/changes/cloud-quality-below-local/result-dimensions-census.md
"""
import json
import os
import re
import struct
import sys
import urllib.error
import urllib.request

# Defaults to the luminaclean-prod project, so only the key has to be supplied.
URL = (os.environ.get("SUPABASE_URL") or "https://tebdkqpgjjypdethpezo.supabase.co").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
BUCKET = os.environ.get("PHOTOS_BUCKET", "photos")
CAP = 1536  # Cloud AI's documented long-edge cap


def die(what, why, fix):
    """A check must say what it looked at, what is true now, and the way out."""
    sys.exit(f"error: {what}\n  found: {why}\n  fix:   {fix}")


if "<" in URL or ">" in URL:
    die("SUPABASE_URL still contains a placeholder", URL,
        "drop the SUPABASE_URL line entirely — the script already defaults to luminaclean-prod.")
if not KEY:
    die("SUPABASE_SERVICE_ROLE_KEY is not set", "empty",
        "Dashboard -> Project Settings -> API Keys -> service_role (click Reveal), then paste it into the command.")
if "<" in KEY or ">" in KEY:
    die("SUPABASE_SERVICE_ROLE_KEY still contains a placeholder", KEY[:24] + "...",
        "replace the whole <service role key> placeholder, angle brackets included, with the real key.")
if not re.match(r"^https://[a-z0-9-]+\.supabase\.(co|in)$", URL):
    die("SUPABASE_URL is not a Supabase project URL", URL,
        "it must look like https://<project-ref>.supabase.co")
if "127.0.0.1" in URL or "localhost" in URL:
    die("SUPABASE_URL points at a local stack", URL, "this check needs the PRODUCTION project.")
if not (KEY.count(".") == 2 or KEY.startswith("sb_secret_")):
    die("SUPABASE_SERVICE_ROLE_KEY does not look like a service-role key",
        f"{len(KEY)} chars, {KEY.count('.')} dots",
        "use the service_role secret, not the anon/publishable key.")


def api(path, data=None, extra_headers=None):
    headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    headers.update(extra_headers or {})
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(f"{URL}{path}", data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def dimensions(raw):
    """(width, height, kind) from the leading bytes of a PNG or JPEG."""
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", raw[16:24])
        return w, h, "png"
    if raw[:2] == b"\xff\xd8":
        i = 2
        while i < len(raw) - 9:
            if raw[i] != 0xFF:
                i += 1
                continue
            m = raw[i + 1]
            if 0xC0 <= m <= 0xCF and m not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack(">HH", raw[i + 5 : i + 9])
                return w, h, "jpeg"
            if m in (0xD8, 0xD9) or 0xD0 <= m <= 0xD7:
                i += 2
                continue
            i += 2 + struct.unpack(">H", raw[i + 2 : i + 4])[0]
    return None


try:
    jobs = api("/rest/v1/jobs?select=id,status,result_path,created_at&result_path=not.is.null&order=created_at.asc")
except urllib.error.HTTPError as e:
    die("the project rejected the request", f"HTTP {e.code} {e.reason}",
        "check the key is the service_role secret for THIS project.")
except urllib.error.URLError as e:
    die(f"could not reach {URL}", str(e.reason),
        "check the project ref in the URL and your network.")
print(f"{len(jobs)} stored jobs with a result\n")
print(f"{'created':<20} {'job':<10} {'result':>12} {'MP':>6}  verdict")

downscaled = passed = unreadable = 0
for j in jobs:
    signed = api(f"/storage/v1/object/sign/{BUCKET}/{j['result_path']}", {"expiresIn": 120})
    href = f"{URL}/storage/v1{signed['signedURL']}"
    try:
        req = urllib.request.Request(href, headers={"Range": "bytes=0-2047"})
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
    except urllib.error.URLError as e:
        print(f"{j['created_at'][:19]:<20} {j['id'][:8]:<10} {'—':>12} {'—':>6}  unreadable ({e})")
        unreadable += 1
        continue
    d = dimensions(raw)
    if not d:
        print(f"{j['created_at'][:19]:<20} {j['id'][:8]:<10} {'—':>12} {'—':>6}  header not recognised")
        unreadable += 1
        continue
    w, h, kind = d
    long_edge = max(w, h)
    if long_edge >= CAP:
        verdict, downscaled = "DOWNSCALED (source was larger)", downscaled + 1
    else:
        verdict, passed = "passed through (source ≤ 1536)", passed + 1
    print(f"{j['created_at'][:19]:<20} {j['id'][:8]:<10} {f'{w}×{h}':>12} {w*h/1e6:6.2f}  {verdict} [{kind}]")

print(f"\ndownscaled: {downscaled}   passed through: {passed}   unreadable: {unreadable}")
if downscaled == 0 and passed > 0:
    print("\n=> CONFIRMED: no production job has ever exercised Cloud AI at a real phone's resolution.")
elif downscaled > 0:
    print(f"\n=> {downscaled} job(s) DID hit the cap, so the corpus is not uniformly small. Worth listing them in S-17.")
