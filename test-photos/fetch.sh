#!/usr/bin/env bash
# Fetch the freely-licensed test photos into test-photos/licensed/.
#
# Every entry below has a free licence or public-domain basis with its author recorded in the label, so the
# fetched set is COMMITTED and re-runnable. Provenance is the whole point of this
# directory — see README.md for why.
#
# Wikimedia: use Special:FilePath?width= — the documented, encoding-tolerant
# redirect to a sized rendition (direct /thumb/ URLs 404 on some filenames).
#
# Run from the repo root:  bash test-photos/fetch.sh
set -uo pipefail
DIR="test-photos/licensed"
mkdir -p "$DIR"

# label (scene · why it is here · LICENCE Author)|filename|url
FETCH=(
  "aurora-fjord (saturated green aurora over dark water; the class that fails in S-17, at a source LARGER than Cloud AI's 1536px cap · CC BY-SA 4.0 Oliver Degener, uploaded by Chr Grundo)|01-aurora-fjord-kirkjufell.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Northern_Lights_over_Kirkjufell_seen_from_Grundarfj%C3%B6r%C3%B0ur.jpg?width=3840"
  "aurora-frozen-lake (saturated green aurora over a pale, near-neutral snow-and-ice lake shore filling ~40% of the frame; tests whether S-17's flip needs neutral ground beside saturated green · CC BY 4.0 Anthony's astro, own work)|02-aurora-frozen-lake-norway.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Aurora_mountain.jpg?width=3840"
  "aurora-reykjanes (green aurora over a snowy coastal flat with dark lava rocks, the darkest candidate, 3:2 like the failing 896x600 result · CC0 Sean O Riordan, via Flickr)|03-aurora-reykjanes-snow-lava.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Reykjanes_Geopark_Aurora_-_Flickr_-_Seanie2322.jpg?width=3840"
  "night facade, bright highlights and dark fence · CC BY-SA 4.0 56BeachyL|04-phone-whitehouse-iphone13pro.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/WhiteHouseNight.jpg"
  "saturated neon, lettering and dark surroundings · CC BY 2.0 edenpictures (Eden, Janine and Jim)|05-phone-walgreens-pixel7.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Walgreens_Neon%2C_New_Orleans_at_night%2C_April_2023.jpg"
  "rain, streetlamp and foliage, Expert RAW JPEG export · CC BY 4.0 Justauser13|06-phone-rain-galaxys24ultra.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Rain_at_night_captured_from_Expert_RAW%2C_Samsung_Galaxy_S24_Ultra.jpg"
  "S-17 Night Portrait (46464526805).jpg · CC BY 2.0 Garry Knight|07-night-portrait.jpg|https://upload.wikimedia.org/wikipedia/commons/6/6d/Night_Portrait_%2846464526805%29.jpg"
  "S-17 National Law Enforcement Officers Memorial Candle Light Vigil 2015 (17612131126).jpg · Public domain (US federal work) James Tourtellotte / U.S. Customs and Border Protection|08-candle-vigil.jpg|https://upload.wikimedia.org/wikipedia/commons/a/a2/National_Law_Enforcement_Officers_Memorial_Candle_Light_Vigil_2015_%2817612131126%29.jpg"
  "S-17 Temple Street Night Market, Kowloon, Hong Kong.jpg · CC BY-SA 3.0 Daniel Case|09-night-market-temple.jpg|https://upload.wikimedia.org/wikipedia/commons/7/71/Temple_Street_Night_Market%2C_Kowloon%2C_Hong_Kong.jpg"
  "S-17 Night market in Clementi, Singapore - 20070116-04.jpg · CC BY 2.0 alex.ch|10-night-market-clementi.jpg|https://upload.wikimedia.org/wikipedia/commons/9/98/Night_market_in_Clementi%2C_Singapore_-_20070116-04.jpg"
  "S-17 Nilgiris forest night time.JPG · CC BY-SA 3.0 Azad|11-nilgiris.jpg|https://upload.wikimedia.org/wikipedia/commons/f/f1/Nilgiris_forest_night_time.JPG"
  "S-17 Night (205566461).jpeg · CC0 Ioan Sendroiu|12-grundlsee.jpg|https://upload.wikimedia.org/wikipedia/commons/3/3f/Night_%28205566461%29.jpeg"
  "S-17 Night Portrait.jpg · CC BY-SA 4.0 Devid Salamon|19-night-portrait-darkroom.jpg|https://upload.wikimedia.org/wikipedia/commons/6/6b/Night_Portrait.jpg"
  "S-17 Asian woman playing with her smartphone outside at night.jpg · CC0 huweijie07170|20-woman-phone-night.jpg|https://upload.wikimedia.org/wikipedia/commons/c/c5/Asian_woman_playing_with_her_smartphone_outside_at_night.jpg"
  "S-17 Kangchenjunga at Night.jpg · CC BY 4.0 Sudipto2cool|21-kangchenjunga.jpg|https://upload.wikimedia.org/wikipedia/commons/6/6e/Kangchenjunga_at_Night.jpg"
  "S-17 Candle (29055009757).jpg · CC BY 2.0 Christopher Henry|17-candle.jpg|https://upload.wikimedia.org/wikipedia/commons/a/a0/Candle_%2829055009757%29.jpg"
  "S-17 National Museum Staircase2 at night (Prague).jpg · CC BY-SA 2.0 Mohamed Yahya|18-staircase.jpg|https://live.staticflickr.com/2685/4516172716_3ff704ce74_o.jpg"
  "S-17 Trisul by moonlight (3631259012).jpg · CC0 dr ashok kolluru|22-trisul.jpg|https://live.staticflickr.com/3417/3631259012_9b9303c845_o.jpg"
)

for entry in "${FETCH[@]}"; do
  IFS='|' read -r label fname url <<<"$entry"
  echo "→ $label"
  if ! curl -fsSL --globoff -A "Mozilla/5.0 lumina-test-photos" "$url" -o "$DIR/$fname"; then
    echo "   ** download failed (skipped) **"
    continue
  fi
  python3 - "$DIR/$fname" <<'PY'
import struct, sys, os
p = sys.argv[1]
d = open(p, "rb").read(200_000)
w = h = 0
if d[:8] == b"\x89PNG\r\n\x1a\n":
    w, h = struct.unpack(">II", d[16:24])
else:
    i = 2
    while i < len(d) - 9:
        if d[i] != 0xFF:
            i += 1
            continue
        m = d[i + 1]
        if 0xC0 <= m <= 0xCF and m not in (0xC4, 0xC8, 0xCC):
            h, w = struct.unpack(">HH", d[i + 5 : i + 9])
            break
        if m in (0xD8, 0xD9) or 0xD0 <= m <= 0xD7:
            i += 2
            continue
        i += 2 + struct.unpack(">H", d[i + 2 : i + 4])[0]
size = os.path.getsize(p)
note = ""
if max(w, h) <= 1536:
    note = "  ** long edge <= 1536: Cloud AI would PASS THIS THROUGH, not downscale it **"
if size > 25_000_000:
    note += "  ** over MAX_FILE_BYTES (25 MB): the app will reject this upload **"
print(f"   {os.path.basename(p)}  {w}x{h}  {w*h/1e6:.2f} MP  {size/1024/1024:.2f} MB{note}")
PY
done
echo "Done → $DIR"
