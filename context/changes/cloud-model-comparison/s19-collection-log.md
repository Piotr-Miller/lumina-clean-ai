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

## Owner amendment and slot A re-collection (2026-10-28)

After seeing both originals, and before any engine had run on either, the owner rejected the slot-A
pick: "23 i 24 wyglądają jak już obrobione" (they look already processed). The owner then
clarified that part of the set must be in good condition, to show that enhancement does not make it
worse, and decided to **keep S19-V02 (banyan) as the no-harm slot**. Slot B is unchanged.

**Amended slot-A criterion (owner decision 2026-10-28):** in addition to the original criteria, the
photo must clearly need enhancement. Underexposure is measured on a 400 px rendition as mean
Rec. 709 luma ≤ 0.25, fixed before any new candidate was viewed. A 100 % crop of the shadows must
show visible grain or chroma noise, and the photo must not have a night-mode/HDR look. The
Elmwood photo (old rank 15, mean luma 0.110) is dark but has clean, black shadows; it was rejected
on that visual criterion and removed from `test-photos/licensed/`.

The same listing (`neon night filemime:image/jpeg`) was re-walked in rank order:

| Rank | Mean luma | Candidate                                                                             | Outcome                                                                                                                                                  |
| ---: | --------: | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   15 |     0.110 | Elmwood Avenue … "Neon, Not the Night"                                                | Rejected by the owner: looks already processed (clean shadows).                                                                                          |
|   16 |     0.151 | Neon Museum.jpg                                                                       | Rejected: a 15060 × 3628 stitched panorama, not a single phone frame. Bread's 1536 px cap would leave a strip about 370 px tall. Its shadows are grainy. |
|   22 |     0.274 | Talad Neon Night Market Signage                                                       | Above the luma threshold.                                                                                                                                |
|   25 |     0.188 | Neon signs of Dotombori at night 20150920-4.JPG (iPhone 5, 3074 × 2305, CC BY-SA 4.0) | **Qualifies → S19-V01.** Dark facades with visible grain in a 100 % crop; saturated neon/LED signs and dense lettering.                                  |

The other Dotonbori frames of the same evening (ranks 31, 93, 109) were not considered, because they
are near-duplicate scenes of the pick. Ranks 62 and 83 were downloaded and rank 62 was viewed
alongside rank 25; neither was judged, because rank 25 already qualified.

## Second owner rejection and selection from a sheet (2026-10-28)

The owner rejected the Dotonbori pick as well: "zdjęcie wygląda jakby nie potrzebowało żadnej
poprawki" (it looks like it needs no correction). Its file was deleted before any commit. Because the
agent's reading of "needs enhancement" twice differed from the owner's, the owner chose from a sheet
instead. The sheet held the seven phone candidates with mean luma ≤ 0.15 from the slot-A query and
from a second query, `shop sign street night filemime:image/jpeg` (200 results examined, 58 passed the
machine checks). The sheet showed originals only.

| Sheet # | Query, rank | Mean luma | Candidate                                               | Owner                |
| ------: | ----------- | --------: | ------------------------------------------------------- | -------------------- |
|       1 | q1, 62      |     0.056 | Tracy, California … Liquor Store with neon at night.jpg | not chosen           |
|       2 | q1, 126     |     0.075 | 20231021 184556 weźże wyluzuj neon sign.jpg             | **chosen → S19-E01** |
|       3 | q1, 146     |     0.135 | Neon Italy.jpeg                                         | not chosen           |
|       4 | q1, 176     |     0.065 | Night Frickers.jpg                                      | **chosen → S19-E02** |
|       5 | q1, 195     |     0.112 | Those red neon tubes. (24562365970).jpg                 | not chosen           |
|       6 | q2, 145     |     0.149 | 銅鑼灣 Causeway Bay … Woo Cheong Pawn Shop … 2020.jpg   | **chosen → S19-E03** |
|       7 | q2, 178     |     0.088 | MakerSoul in Yu Chau Street at night.jpg                | **chosen → S19-V01** |

The owner chose four photos for one slot and then decided: **one goes into the twelve, and the other
three form a separate needs-enhancement set.** That set is shared by every candidate, reported
separately and kept outside the 8/12 threshold (owner decision 2026-10-28). The agent put #7 into the
twelve, as the decision option suggested; it has the darkest, muddiest subject among the four. Slot B
keeps S19-V02 as the good-condition no-harm case (owner decision 2026-10-28).

## Result

| ID      | File                                                                   | SHA-256                                                            | Source revision                                              |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| S19-V01 | `test-photos/licensed/25-phone-makersoul-yuchau-galaxys9plus.jpg`      | `1fef450095fc03b1bff4c3acab1fb2b8beae961727c36a52d5af99552c9f3cd5` | <https://commons.wikimedia.org/w/index.php?oldid=745373130>  |
| S19-V02 | `test-photos/licensed/24-phone-banyan-lamp-xiaomi.jpg`                 | `62e4c8f0cc907f46aa5db41cf18f9c668feef4e9ab9bb3e675e4cece13c53479` | <https://commons.wikimedia.org/w/index.php?oldid=1289803229> |
| S19-E01 | `test-photos/licensed/26-phone-neon-wyluzuj-honor.jpg`                 | `8aa7da59315415c4b565dff0264ce788222cd6fd9d8ad7e28f131f68ca8af1a2` | <https://commons.wikimedia.org/w/index.php?oldid=1187104333> |
| S19-E02 | `test-photos/licensed/27-phone-neon-frickers-iphone8plus.jpg`          | `526c52c34224593825e882ce0dd704a55066539dc151cb46ab7b7ebf62c8c0b4` | <https://commons.wikimedia.org/w/index.php?oldid=1135249156> |
| S19-E03 | `test-photos/licensed/28-phone-neon-pawnshop-causewaybay-iphone6s.jpg` | `2639188f6f6b7237e6772e5ccd01605541a427c73d32ae1ce417a14d03f9236d` | <https://commons.wikimedia.org/w/index.php?oldid=829040601>  |

Every file is the Commons original, unchanged, and its SHA-1 matches the value Commons reports. All
SHA-256 values are distinct from every file in `test-photos/licensed/` and `test-photos/private/`.
Frozen in `test-photos/s19-benchmark.json` (6 tuning, 12 validation, 3 supplementary and 2 diagnostic
cases) with `test-photos/s19-benchmark.sha256`; `s17-v1` is unchanged. The rejected Elmwood file was committed once on the S-19 branch and deleted in the next commit; the Dotonbori file was never committed. No engine ran on any photo in this log.

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
