# S-19 replacement photo collection log

Collected 2026-10-28 by the agent, on the owner's instruction ("commons"), under
`holdout-replacement-decision.md`. Inputs only: no Cloud, Local or candidate engine was run on any
photo examined here. Thumbnails of originals were viewed to judge the criteria.

## Procedure

1. One ordered Wikimedia Commons search per slot (CirrusSearch via the MediaWiki API, `generator=search`,
   namespace File, results taken in API rank order, 50 per page).
2. Machine checks, in this order of precedence: MIME `image/jpeg`; EXIF make/model of a phone
   (Apple iPhone, Samsung SM-, Google Pixel, Xiaomi, Huawei, Honor, OnePlus, Oppo, vivo, Motorola,
   realme, HMD/Nokia TA-, Sony Xperia, ASUS, Fairphone, Nothing); long edge > 1536 px; ≤ 25 MB; free
   licence (CC0, public domain, CC BY / BY-SA 2.0–4.0).
3. Visual qualification of the machine-passing candidates in rank order against the slot criteria;
   the **first** qualifying candidate is taken and no later candidate is judged.
4. Exclusion of any photo already in `s17-v1` or previously evaluated.

The listing script is reproduced at the end of this log. Commons ranking can change over time, so a
rerun need not reproduce the same ranks; the ranks below are the ones observed on 2026-10-28.

## Slot A — replacement for S17-05

Query: `neon night filemime:image/jpeg`. 200 results examined, 21 passed the machine checks.

|   Rank | Candidate                                                                                                            | Outcome                                                                                                                                                                                           |
| -----: | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1–14 | (no result passed the machine checks)                                                                                | —                                                                                                                                                                                                 |
|     15 | Elmwood Avenue, Buffalo, New York - "Neon, Not the Night" - 20191008.jpg (iPhone 6s Plus, 4032 × 3024, CC BY-SA 4.0) | **Qualifies → S19-V01.** Night facade; saturated blue neon sign; wall-washer highlights; fine siding and window detail; large dark sky. Weak lettering is covered by the "or fine detail" clause. |
| 16, 22 | Neon Museum.jpg; Talad Neon Night Market Signage, Dec 2017.jpg                                                       | Thumbnails were downloaded together with rank 15 and viewed; not judged, because rank 15 already qualified.                                                                                       |
|    130 | Walgreens Neon, New Orleans at night, April 2023.jpg                                                                 | Would be rejected: this is S17-05 itself (exposed).                                                                                                                                               |

## Slot B — replacement for S17-06

Query: `street lamp night trees filemime:image/jpeg`. 150 results examined, 17 passed the machine checks.

| Rank | Candidate                                                                                                                                                           | Outcome                                                                                                                                                                                   |
| ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  1–9 | (no result passed the machine checks)                                                                                                                               | —                                                                                                                                                                                         |
|   10 | HK YTMD YMT 上海街 Shanghai Street 公園 garden 榕樹 Chinese Banyan tree 氣根 air roots n 街燈 lamp night November 2022 Px3 01.jpg (Xiaomi M2102J20SG, CC BY-SA 4.0) | **Qualifies → S19-V02.** Night; street lamp; banyan foliage and aerial-root fine texture; lit areas already legible, which keeps the no-harm challenge. EXIF orientation 6 is incidental. |
|   11 | the same scene, frame 02                                                                                                                                            | Not considered: adjacent burst frame of rank 10.                                                                                                                                          |

## Result

| ID      | File                                                          | SHA-256                                                            | Source revision                                              |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| S19-V01 | `test-photos/licensed/23-phone-neon-elmwood-iphone6splus.jpg` | `f8f44af6fb5c69ee5b0bda62bec5885d82de3867bc1917b1d130cd1e0741c368` | <https://commons.wikimedia.org/w/index.php?oldid=1228216405> |
| S19-V02 | `test-photos/licensed/24-phone-banyan-lamp-xiaomi.jpg`        | `62e4c8f0cc907f46aa5db41cf18f9c668feef4e9ab9bb3e675e4cece13c53479` | <https://commons.wikimedia.org/w/index.php?oldid=1289803229> |

Both files are the Commons originals, unchanged; their SHA-1 matches the value Commons reports. Both
SHA-256 values are distinct from every file in `test-photos/licensed/` and `test-photos/private/`.
Frozen in `test-photos/s19-benchmark.json` (6 tuning, 12 validation, 2 diagnostic cases) with
`test-photos/s19-benchmark.sha256`; `s17-v1` is unchanged.

## Listing script

```python
# Ordered, reproducible Commons candidate listing for one slot. Prints candidates that pass the
# MACHINE checks (JPEG, phone EXIF make/model, long edge > 1536, <= 25 MB, free licence), in API order.
import json, sys, time, urllib.parse, urllib.request, re
query, pages_max = sys.argv[1], int(sys.argv[2])
API = "https://commons.wikimedia.org/w/api.php"
def get(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json", "maxlag": 5})
    for attempt in range(6):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "lumina-clean-ai-test-photos/1.0 (pmiller.software benchmark collection)"}), timeout=90))
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(20 * (attempt + 1)); continue
            raise
    raise SystemExit("rate limited")
PHONE = re.compile(r"(?i)^(apple\s+iphone|samsung\s+sm-|google\s+pixel|xiaomi|redmi|huawei|honor|oneplus|oppo|vivo|motorola|realme|hmd|nokia\s+ta-|sony\s+(xperia|so-|xq-|g\d|h\d|j\d)|asus_|fairphone|nothing)")
FREE = re.compile(r"(?i)^(cc0|public domain|cc by(-sa)? [1-4]\.0|cc by(-sa)? 2\.5|pd)")
off = 0; rank = 0
for _ in range(pages_max):
    r = get({"action": "query", "generator": "search", "gsrsearch": query, "gsrnamespace": 6, "gsrlimit": 50, "gsroffset": off,
             "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata|metadata|sha1", "iiextmetadatafilter": "LicenseShortName|Artist"})
    pages = sorted(r.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    for p in pages:
        rank += 1
        ii = p["imageinfo"][0]; em = ii.get("extmetadata", {})
        md = {m["name"]: m["value"] for m in (ii.get("metadata") or []) if isinstance(m.get("value"), (str, int))}
        make, model = str(md.get("Make", "")).strip(), str(md.get("Model", "")).strip()
        cam = (model if model.lower().startswith(make.lower().split()[0] if make else "~") else f"{make} {model}").strip()
        lic = em.get("LicenseShortName", {}).get("value", "")
        ok = ii.get("mime") == "image/jpeg" and PHONE.search(cam or "") and max(ii["width"], ii["height"]) > 1536 and ii["size"] <= 25_000_000 and FREE.search(lic or "")
        if ok:
            print(f"{rank:>4} | {p['title'][5:]} | {ii['width']}x{ii['height']} | {ii['size']//1024}KB | {cam} | {lic} | orient {md.get('Orientation','-')} | sha1 {ii['sha1'][:10]}")
    if "continue" not in r: break
    off = r["continue"]["gsroffset"]; time.sleep(3)
print(f"# examined {rank} results for: {query}")
```
