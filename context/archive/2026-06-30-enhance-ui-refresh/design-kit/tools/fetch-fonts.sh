#!/usr/bin/env bash
# Fetch latin woff2 subsets from Google Fonts (OFL-licensed families) for board embedding.
set -e
DIR="$(cd "$(dirname "$0")/../assets/fonts" 2>/dev/null && pwd || true)"
mkdir -p "$(dirname "$0")/../assets/fonts"
DIR="$(cd "$(dirname "$0")/../assets/fonts" && pwd)"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

fetch() { # family_query outname
  local css url
  css=$(curl -sf -A "$UA" "https://fonts.googleapis.com/css2?family=$1&display=swap")
  # take the woff2 URL from the /* latin */ block (last labeled block)
  url=$(printf '%s' "$css" | awk '/\/\* latin \*\//{f=1} f && /url\(/{match($0, /url\(([^)]+)\)/, m); print m[1]; exit}')
  if [ -z "$url" ]; then url=$(printf '%s' "$css" | grep -o 'url([^)]*)' | tail -1 | sed 's/url(//;s/)//'); fi
  curl -sf -o "$DIR/$2.woff2" "$url"
  ls -la "$DIR/$2.woff2" | awk '{print "'"$2"'.woff2 -> " $5 " bytes"}'
}

fetch "Fraunces:opsz,wght@9..144,600" "fraunces-600"
fetch "Space+Grotesk:wght@700" "space-grotesk-700"
fetch "IBM+Plex+Mono:wght@500" "plex-mono-500"
fetch "Archivo:wght@800" "archivo-800"
echo DONE
