#!/usr/bin/env bash
# Fetch the freely-licensed test photos into test-photos/licensed/.
#
# Every entry below is CC-licensed with its author recorded in the label, so the
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
