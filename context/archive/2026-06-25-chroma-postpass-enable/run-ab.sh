#!/usr/bin/env bash
# One-command real-Bread A/B run (Phase 1 / F3 gate, Round 2+).
#
# Usage (from anywhere):
#   bash context/changes/chroma-postpass-enable/run-ab.sh <out-dir> <img1.jpg> [img2.jpg ...]
#
# Bundles the two gotchas hit in Round 1:
#   - installs BOTH decoders together (jpeg-js + pngjs — installing one alone with
#     --no-save prunes the other, ERR_MODULE_NOT_FOUND);
#   - reads REPLICATE_API_TOKEN from supabase/functions/.env (never echoed).
# Then runs bread-ab.ts: real Bread (PNG output, sniffed) -> real denoiseChroma ->
# metrics (maxΔY, shadow Cb/Cr reduction, highlight leak) + *-bread.* / *-postpass.png.
#
# Spends real Replicate credit: 1 prediction per NEW image. A *-bread.{png,jpg}
# already in <out-dir> is REUSED (no re-spend). Inputs: RGB JPG, ≤12 MP.
#
# Round-2 reminder: a qualifying sample must keep shadowPx(Y<64) ≳15–20% in the
# Bread OUTPUT (Round 1's NIND scenes collapsed to 1.5–6% — non-qualifying).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

OUTDIR="${1:?usage: run-ab.sh <out-dir> <img1.jpg> [img2.jpg ...]}"; shift
[ "$#" -ge 1 ] || { echo "error: provide at least one input image"; exit 1; }
mkdir -p "$OUTDIR"

ENVF="supabase/functions/.env"
TOKEN="$(grep '^REPLICATE_API_TOKEN=' "$ENVF" 2>/dev/null | head -1 | cut -d= -f2-)"
[ -n "$TOKEN" ] || { echo "error: REPLICATE_API_TOKEN missing in $ENVF"; exit 1; }

npm i --no-save jpeg-js pngjs >/dev/null 2>&1
REPLICATE_API_TOKEN="$TOKEN" npx tsx context/changes/chroma-postpass-enable/bread-ab.ts "$OUTDIR" "$@"
