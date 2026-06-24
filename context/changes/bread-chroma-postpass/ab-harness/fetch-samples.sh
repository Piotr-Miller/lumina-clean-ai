#!/usr/bin/env bash
# Fetch representative low-light A/B samples for the chroma-denoise Phase-5 tuning.
# All freely licensed; downloaded locally (gitignored) — NOT committed. Each is
# fetched at <=12 MP so the pass runs (the 12 MP guard rejects larger); the
# "mixed" frame is ~11 MP to also exercise the end-to-end perf budget.
#
# Run from repo root:  bash context/changes/bread-chroma-postpass/ab-harness/fetch-samples.sh
set -uo pipefail
DIR="context/changes/bread-chroma-postpass/ab-harness/samples"
mkdir -p "$DIR"

# label|filename|url   (CC BY 4.0 / CC BY-SA 4.0 / Unsplash License — see README)
# Wikimedia: use Special:FilePath?width= — the documented, encoding-tolerant
# redirect to a sized rendition (direct /thumb/ URLs 400 on these filenames).
FETCH=(
  "very-dark (ISO 160000 black-frame, extreme chroma noise; CC BY 4.0 Anil Öztas)|01-very-dark-iso160000.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Sony_Alpha_9_II,_ISO_160000_(EV_+1)_--_2024_--_0036.jpg?width=2560"
  "mixed (Copenhagen Kødbyen night scene, ~10 MP; CC BY-SA 4.0 Terragio67)|02-mixed-copenhagen-night.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Copenhagen,_Kødbyen_by_night,_September_2022.jpg?width=4000"
  "moderately-dark (night street, Olympus E-M1; Unsplash License, MChe Lee)|03-moderate-night-street.jpg|https://images.unsplash.com/photo-1779805071390-978d6f993c0b?fm=jpg&q=85&w=4000&fit=max"
)

for entry in "${FETCH[@]}"; do
  IFS='|' read -r label fname url <<<"$entry"
  echo "→ $label"
  if ! curl -fsSL --globoff -A "Mozilla/5.0 chroma-ab-harness" "$url" -o "$DIR/$fname"; then
    echo "   ** download failed (skipped) **"
    continue
  fi
  bytes=$(wc -c <"$DIR/$fname")
  # JPEG SOFx dimension probe.
  node -e '
    const fs=require("fs");const b=fs.readFileSync(process.argv[1]);
    let i=2;while(i<b.length){if(b[i]!==0xFF){i++;continue;}const m=b[i+1];
      if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC){
        const h=b.readUInt16BE(i+5),w=b.readUInt16BE(i+7);
        console.log("   "+process.argv[2]+"  "+w+"x"+h+"  "+(w*h/1e6).toFixed(2)+" MP  "+(process.argv[3]/1024|0)+" KB"
          +(w*h>12e6?"  ** OVER 12 MP guard **":""));break;}
      i+=2+b.readUInt16BE(i+2);}
  ' "$DIR/$fname" "$fname" "$bytes"
done
echo "Done → $DIR"
