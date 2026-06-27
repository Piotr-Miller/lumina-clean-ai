#!/usr/bin/env bash
# Sync the local DB-webhook GUCs + functions/.env EDGE_FUNCTION_URL to a fresh
# cloudflared tunnel — kills the "tunnel re-mints each run → callback null → row
# stalls in processing" footgun (research.md §C).
#
# Run AFTER:  cloudflared tunnel --url http://127.0.0.1:54321   (note its https URL)
# Usage:      bash context/changes/chroma-postpass-enable/local-ab-sync.sh https://<random>.trycloudflare.com
#
# LOCAL DEV ONLY. Reads DB_WEBHOOK_SECRET from supabase/functions/.env and pushes
# it into the DB GUC via psql stdin (not process args); never prints the secret.
set -euo pipefail

TUNNEL="${1:?usage: local-ab-sync.sh <https tunnel base url>}"
ENVF="supabase/functions/.env"
EDGE_URL="${TUNNEL%/}/functions/v1/enhance"

[ -f "$ENVF" ] || { echo "error: $ENVF not found (run from repo root)"; exit 1; }
SECRET="$(grep -E '^DB_WEBHOOK_SECRET=' "$ENVF" | head -1 | cut -d= -f2-)"
[ -n "$SECRET" ] || { echo "error: DB_WEBHOOK_SECRET missing/empty in $ENVF"; exit 1; }

DB="$(docker ps --format '{{.Names}}' | grep -i supabase_db | head -1)"
[ -n "$DB" ] || { echo "error: supabase_db container not running (npx supabase start)"; exit 1; }

# Set both GUCs. Secret travels via stdin heredoc, not the process arg list.
docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
alter database postgres set "app.settings.edge_function_url" = '${EDGE_URL}';
alter database postgres set "app.settings.db_webhook_secret" = '${SECRET}';
SQL

# Keep the served function's own EDGE_FUNCTION_URL in lockstep with the GUC.
tmp="$(mktemp)"
if grep -qE '^EDGE_FUNCTION_URL=' "$ENVF"; then
  sed "s#^EDGE_FUNCTION_URL=.*#EDGE_FUNCTION_URL=${EDGE_URL}#" "$ENVF" > "$tmp" && mv "$tmp" "$ENVF"
else
  cp "$ENVF" "$tmp" && { echo "EDGE_FUNCTION_URL=${EDGE_URL}" >> "$tmp"; } && mv "$tmp" "$ENVF"
fi

echo "✓ synced edge_function_url GUC + functions/.env EDGE_FUNCTION_URL = ${EDGE_URL}"
echo "✓ db_webhook_secret GUC set (from functions/.env)"
echo "→ next: re-serve the function so it picks up the new URL:"
echo "    npx supabase functions serve enhance --env-file ${ENVF}"
