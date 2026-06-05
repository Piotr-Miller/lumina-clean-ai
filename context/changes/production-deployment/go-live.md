# LuminaClean AI — Go-Live Record (S-07)

Production cutover record for the `production-deployment` change. Cloud AI pipeline
ships **OFF**; the local engine + auth are live. Flip-ON is a separate, gated event
(see below).

## Production endpoints

| Surface | Value |
| --- | --- |
| App (Cloudflare Worker) | https://lumina-clean-ai.pmiller-software.workers.dev |
| Worker name | `lumina-clean-ai` |
| Worker Version ID (go-live) | `8e0ad338-aa0a-4875-b616-55b3f84849a0` (CI deploy); current live `c8273695` after the 4.6 rollback drill re-deploy. Future master pushes mint new versions. |
| Supabase project | `tebdkqpgjjypdethpezo` (`https://tebdkqpgjjypdethpezo.supabase.co`) |
| Edge Function | `enhance` — ACTIVE, v1 (`verify_jwt = false`), id `e0ab0a25` |
| First prod deploy | CI run [27033884831](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/27033884831), commit `dd7f1d3` |

## Cloud state at go-live: OFF

- **Worker** secrets (set once via `wrangler secret put`, persist across deploys):
  `CLOUD_PIPELINE_ENABLED=false`, `CLOUD_DAILY_CAP=0` (operator kill-switch),
  plus `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Edge Function** secrets: `CLOUD_PIPELINE_ENABLED=false` (+ `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DB_WEBHOOK_SECRET`, `REPLICATE_API_TOKEN`,
  `REPLICATE_WEBHOOK_SIGNING_SECRET`).
- **Behavior with cloud OFF:** a cloud submission inserts a `queued` job; the Edge
  Function `/start` reads `CLOUD_PIPELINE_ENABLED`, returns
  `200 {skipped: "cloud_pipeline_disabled"}`, and leaves the job `queued`. No
  Replicate call is made → zero spend. `CLOUD_DAILY_CAP=0` independently rejects
  cloud submissions pre-insert in `create-job`.

## Flip-ON runbook (documented, NOT executed)

> **Gated on S-05 (done) + S-08 (#9) + S-09 (#12).** Do not flip until S-08 and
> S-09 are merged/archived. This is a future ops event, out of scope for S-07.

1. **DB webhook settings** (prereq — silent failure mode if unset): confirm
   `app.settings.edge_function_url = 'https://tebdkqpgjjypdethpezo.supabase.co/functions/v1/enhance'`
   and `app.settings.db_webhook_secret` are set on the prod DB.
2. **Edge Function:** `supabase secrets set CLOUD_PIPELINE_ENABLED=true` and confirm
   `REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET`, `DB_WEBHOOK_SECRET` are
   present and valid.
3. **Worker:** `wrangler secret put CLOUD_PIPELINE_ENABLED` → `true`;
   `wrangler secret put CLOUD_DAILY_CAP` → the desired cap (> 0).
4. **Verify:** submit one cloud job; confirm it transitions `queued → processing →
   done` via Realtime, and that the daily cap rejects beyond the limit.
5. **Reverse (kill-switch):** set Worker `CLOUD_DAILY_CAP=0` (instant pre-insert
   reject) and/or `CLOUD_PIPELINE_ENABLED=false` on both Worker and Edge Function.

## Rollback procedure

Reverts the **Worker + static assets ONLY** — NOT migrations or the Edge Function
(those are a separate ops surface; see `infrastructure.md:83`).

```bash
npx wrangler versions list            # find a prior Version ID
npx wrangler rollback [<version-id>]  # roll back to it
# re-deploy forward to confirm the path:
npm run build && npx wrangler deploy
```

**Drill result (4.6):** ✅ performed 2026-06-05. Rolled back from `8e0ad338` → prior same-day version `63a951b7` (`wrangler rollback`, SUCCESS, 100% traffic); live URL served HTTP 200. Re-deployed forward (`npm run build && wrangler deploy`) → new version `c8273695`, live URL HTTP 200 with correct title + auth redirect intact. Confirms the rollback + recover path works. (Rollback reverted Worker+assets only; secrets/bindings unaffected.)

## Verification status (S-07 Phase 4)

| # | Check | Status |
| --- | --- | --- |
| 4.1 | No errors during smoke (HTTP smoke + Supabase logs) | ✅ |
| 4.2 | Anon local-engine E2E on prod | ⏳ operator (browser) |
| 4.3 | Auth lifecycle incl. password-reset link on prod domain | ⏳ operator (browser + email) |
| 4.4 | Cloud submit stays `queued` (`cloud_pipeline_disabled`), zero Replicate spend | ⏳ operator (authed session) |
| 4.5 | Realtime subscribes without 1102 | ⏳ operator (browser) |
| 4.6 | `wrangler rollback` performed + re-deploy forward | ✅ (63a951b7 → c8273695) |
| 4.7 | This document | ✅ |
