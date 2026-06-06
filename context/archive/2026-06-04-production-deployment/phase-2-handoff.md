# Phase 2 handoff — provisioning checkpoint (2026-06-05)

Phase 2 is **partially complete and intentionally paused**. The DB/account provisioning that doesn't depend on a deployed Worker is done; the Worker-dependent items are carried to the **Phase 3 boundary** (right after the first `wrangler deploy`, when the prod Worker URL + script exist).

## Done in Phase 2
- **2.1** ✅ `supabase db push` — all 3 migrations applied to prod project `tebdkqpgjjypdethpezo`.
- **2.2** ✅ Auth resolves — `wrangler whoami` (account `9b645f82fe0122394111985d936e5844`, email pmiller.software@gmail.com) + Supabase login/link proven via the successful `db push`.
- **2.3** ✅ Schema verified — `public.jobs`, `photos` bucket, `jobs` in `supabase_realtime`.

## Known provisioning facts (non-secret — safe to record)
- Supabase **project-ref**: `tebdkqpgjjypdethpezo`
- Supabase **URL**: `https://tebdkqpgjjypdethpezo.supabase.co`
- Cloudflare **Account ID**: `9b645f82fe0122394111985d936e5844`
- `DB_WEBHOOK_SECRET`: generated this session (kept out of the repo — re-mint or reuse the value from the chat/your vault when needed).

## Deferred to the cloud flip-ON runbook (NOT this change)
- **2.4** DB-webhook settings — hosted-Supabase blocks custom-GUC `ALTER DATABASE`. See `deferred-2.4-db-webhook-settings.md`. Inert while cloud is OFF.

## Carried to the Phase 3 boundary (need the deployed Worker / URL)
- **2.5** Prod-auth — set `site_url` + `additional_redirect_urls` (incl. `/auth/confirm`) to the prod `*.workers.dev` URL; apply `supabase/templates/recovery.html`. (Needs the URL from the first deploy.)
- **2.6 (Worker half)** `wrangler secret put` for the Worker: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUD_PIPELINE_ENABLED=false`, `CLOUD_DAILY_CAP=0`. (`wrangler secret put` requires the Worker script to exist → after first deploy.)

## Can be done any time during Phase 3 (no Worker dependency)
- **2.6 (Edge Function half)** `supabase secrets set` (project-level): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DB_WEBHOOK_SECRET`, `REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET`, `CLOUD_PIPELINE_ENABLED=false`. **Needs Replicate credentials** — confirm availability.
- **2.6 (GitHub half)** repo secrets for CI: `CLOUDFLARE_API_TOKEN` (mint a **Workers Scripts: Edit**-scoped token), `CLOUDFLARE_ACCOUNT_ID=9b645f82fe0122394111985d936e5844`, `SUPABASE_ACCESS_TOKEN` (a Supabase PAT), `SUPABASE_PROJECT_REF=tebdkqpgjjypdethpezo`, plus the app/function secret values the CI injects.

## Open question for Phase 3
- Confirm whether Replicate credentials (`REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET`) are available now, or whether the Edge-Function-secrets step also defers (acceptable while cloud is OFF).
