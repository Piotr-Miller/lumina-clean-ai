# Deferred & carried items — consolidated ledger

Single source of truth for every S-07 Progress item not completed in the phase that planned it. Re-check this at the **start of Phase 3** and again before **Phase 4 go-live** and **/10x-archive** so nothing ships silently incomplete.

**Key distinction:** some deferrals genuinely **block the cloud-OFF go-live**; others only matter at the future cloud **flip-ON**. Don't conflate them.

| Item | What | Lands at | Blocks cloud-OFF go-live? | Tracked in |
|---|---|---|---|---|
| **1.3** | `deno check supabase/functions/enhance/index.ts` | Phase 3 CI (`denoland/setup-deno` step) | **No** — static CI gate, not runtime | plan Progress; impl-review-phase-1 |
| **1.7** | Manual success-store verify (callback fetches real output → stores result) | Flip-ON / a real `*.replicate.delivery` output | **No** — success path only runs when cloud is ON | plan Progress; impl-review-phase-1 |
| **2.4** | DB-webhook GUC settings (`edge_function_url`, `db_webhook_secret`) | Flip-ON runbook (Vault / TG_ARGV / direct-conn) | **No** — trigger no-ops while unset; `/start` no-ops on OFF flag | `deferred-2.4-db-webhook-settings.md` |
| **2.5** | Prod-auth `site_url` + redirects + `recovery.html` | Phase 3, **after first deploy** (needs Worker URL) | **YES** — password-reset links must resolve on the prod domain (S-07 success criterion) | `phase-2-handoff.md` |
| **2.6a** | Worker secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUD_PIPELINE_ENABLED=false`, `CLOUD_DAILY_CAP=0` | Phase 3, **after first deploy** (`wrangler secret put` needs the Worker) | **YES** — the live app/auth needs these at runtime | `phase-2-handoff.md`; lessons.md (ordering) |
| **2.6b** | GitHub repo secrets: `CLOUDFLARE_API_TOKEN` (scoped), `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | Phase 3, **before the deploy job runs** | **YES** — CI deploy can't authenticate without them | `phase-2-handoff.md` |
| **2.6c** | Edge Function secrets: `REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET`, `DB_WEBHOOK_SECRET`, `CLOUD_PIPELINE_ENABLED=false` (+ SUPABASE_URL/SR) | Phase 3 or flip-ON | **No** — only the cloud path (`/start`, `/callback`) needs them; cloud is OFF | `phase-2-handoff.md` |

## Go-live-blocking subset (must be DONE before Phase 4 sign-off)
- **2.5** prod-auth (password-reset on prod domain)
- **2.6a** Worker runtime secrets
- **2.6b** GitHub CI secrets (to make the deploy happen at all)

## Non-blocking (fine to remain open through the cloud-OFF launch)
- **1.3** (CI gate — will run in Phase 3 anyway), **1.7** (cloud-ON only), **2.4** (flip-ON), **2.6c** (cloud-ON only; set opportunistically if Replicate creds are on hand).

> Known facts: ref `tebdkqpgjjypdethpezo`, CF account `9b645f82fe0122394111985d936e5844`. Authenticated `supabase`/`wrangler` commands run in an external (TTY) PowerShell, not the agent shell / `!` prefix.
