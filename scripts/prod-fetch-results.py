#!/usr/bin/env python3
"""
READ-ONLY production diagnostic: download stored Cloud AI results by job id, so
their output can be inspected locally.

Written to fetch the three jobs whose source was LARGER than the 1536px cap -
the only production evidence of the model's output on a genuinely large source -
but it takes any job-id prefixes as arguments.

Safety contract, and the reason this file is prefixed `prod-`:

  * It performs NO writes against the project. It selects, signs short-lived
    URLs, and downloads.
  * The service-role key is read from the environment at run time. It is never
    stored, logged or printed, and MUST NOT be committed anywhere.
  * Downloaded photos land OUTSIDE the repo by default. Do not move them into
    test-photos/licensed/ - see AGENTS.md for why that folder is licence-gated.

Usage, from the repo root:

    SUPABASE_SERVICE_ROLE_KEY='<key>' python3 scripts/prod-fetch-results.py [jobprefix ...]

With no arguments it fetches bcff4e39, c560b9d4 and 3f219e67 (the three
downscaled jobs). OUT_DIR overrides where files land.
"""
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request

URL = (os.environ.get("SUPABASE_URL") or "https://tebdkqpgjjypdethpezo.supabase.co").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
BUCKET = os.environ.get("PHOTOS_BUCKET", "photos")
# Outside the repo by default: these are production photographs with no stated licence.
OUT = os.environ.get("OUT_DIR") or os.path.join(tempfile.gettempdir(), "lumina-prod-results")
DEFAULT_JOBS = ("bcff4e39", "c560b9d4", "3f219e67")
WANTED = tuple(sys.argv[1:]) or DEFAULT_JOBS


def die(what, why, fix):
    sys.exit(f"error: {what}\n  found: {why}\n  fix:   {fix}")


if "<" in URL or ">" in URL:
    die("SUPABASE_URL still contains a placeholder", URL, "drop the SUPABASE_URL line; the default is luminaclean-prod.")
if not KEY:
    die("SUPABASE_SERVICE_ROLE_KEY is not set", "empty",
        "use the same key you ran the census with.")
if "<" in KEY or ">" in KEY:
    die("SUPABASE_SERVICE_ROLE_KEY still contains a placeholder", KEY[:24] + "...",
        "replace the whole placeholder, angle brackets included.")
if not re.match(r"^https://[a-z0-9-]+\.supabase\.(co|in)$", URL):
    die("SUPABASE_URL is not a Supabase project URL", URL, "it must look like https://<project-ref>.supabase.co")


def api(path, data=None):
    headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(f"{URL}{path}", data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


try:
    jobs = api("/rest/v1/jobs?select=id,result_path,created_at&result_path=not.is.null&order=created_at.asc")
except urllib.error.HTTPError as e:
    die("the project rejected the request", f"HTTP {e.code} {e.reason}", "check the key is the service_role secret.")
except urllib.error.URLError as e:
    die(f"could not reach {URL}", str(e.reason), "check the project ref and your network.")

os.makedirs(OUT, exist_ok=True)
found = 0
for j in jobs:
    short = j["id"][:8]
    if short not in WANTED:
        continue
    signed = api(f"/storage/v1/object/sign/{BUCKET}/{j['result_path']}", {"expiresIn": 300})
    href = f"{URL}/storage/v1{signed['signedURL']}"
    with urllib.request.urlopen(href, timeout=120) as r:
        raw = r.read()
    dest = os.path.join(OUT, f"{short}-{j['created_at'][:10]}.png")
    with open(dest, "wb") as f:
        f.write(raw)
    print(f"saved {short}  {len(raw)/1024:8.1f} KB  -> {dest}")
    found += 1

missing = [w for w in WANTED if not any(f.startswith(w) for f in os.listdir(OUT))]
print(f"\n{found} of {len(WANTED)} saved into {OUT}")
if missing:
    print(f"NOT found in the jobs table: {', '.join(missing)}")
