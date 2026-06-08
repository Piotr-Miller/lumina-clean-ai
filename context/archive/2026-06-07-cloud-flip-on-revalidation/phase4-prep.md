# Phase 4 (prod flip-ON) — readiness notes for the focused session

Captured 2026-06-08 when Phase 4 was paused. Phases 1–3 are done/committed/reviewed; CI green on `master`. Start the focused session with these realities in hand.

## Auth state (checked 2026-06-08)

- **supabase CLI: logged in + linked to prod** (`luminaclean-prod` / `tebdkqpgjjypdethpezo` is the linked project). `supabase secrets set` + `supabase db push` against prod are drivable via the stored session. `SUPABASE_ACCESS_TOKEN` env is NOT set (CLI uses its stored login).
- **wrangler: logged in but INSUFFICIENT scopes** — token has only `account:read`, `email_routing:write`, `email_sending:write` (from the email setup). **Missing Workers write scope.** `wrangler secret put` / `wrangler deploy` will fail until `wrangler login` refreshes scopes. ⇒ **the Worker flip is a user step.**
- Live app verified serving the prod ref `tebdkqpgjjypdethpezo` (curl + grep) — flip targets the right project.

## GUC reality (supersedes the plan's "try direct-connection first")

Hosted Supabase denies `ALTER DATABASE postgres SET app.settings.*` for the `postgres` role **and** the migration role (not just the SQL editor) — `postgres` isn't superuser on hosted. So the direct-connection attempt only confirms the denial. **The native-webhook migration is the actual path, not a fallback:**
- Rewrite `public.handle_queued_job()` (migration `20260531120000_jobs_enqueue_webhook.sql`'s trigger) to read the target URL from `TG_ARGV[0]` (set in `CREATE TRIGGER … EXECUTE FUNCTION handle_queued_job('https://tebdkqpgjjypdethpezo.supabase.co/functions/v1/enhance')`) and the bearer secret from **Supabase Vault** (`vault.decrypted_secrets` / `vault.create_secret`), instead of `current_setting('app.settings.*')`.
- **Context7 check needed** on the current Supabase Vault API + native Database-Webhook pattern before writing.
- **Test locally first**: `supabase db reset` applies it cleanly + re-run `scripts/spikes/d1-retention-check.ts` (must stay green) before any `db push` to prod. Reversible via a follow-up migration.

## Safe division of labor (nothing bills until the Worker flip)

The Worker's `CLOUD_DAILY_CAP=0` keeps `create-job` rejecting every cloud submit, so the prep below does NOT serve cloud to users or incur Replicate cost:
1. **(drivable by assistant)** native-webhook migration → local test → `supabase db push` to prod.
2. **(drivable by assistant)** Edge Function secrets: `supabase secrets set --project-ref tebdkqpgjjypdethpezo CLOUD_PIPELINE_ENABLED=true REPLICATE_API_TOKEN=… REPLICATE_WEBHOOK_SIGNING_SECRET=… DB_WEBHOOK_SECRET=…` (DB_WEBHOOK_SECRET must equal the value baked into the migration's Vault secret).
3. **(USER — billable ON gate)** `wrangler login` (refresh scopes) → `wrangler secret put CLOUD_DAILY_CAP` = `3`, `wrangler secret put CLOUD_PIPELINE_ENABLED` = `true`; redeploy if needed.
4. **Verify (4.3/4.4/4.5):** one prod cloud job `queued→processing→succeeded` (source gone, result present); a submit beyond cap 3 → `daily_cap_reached` 429; a watchdog-timed-out job's source removed.
5. **Operator gate (4.6):** leave-ON (go-live) vs kill-switch back (`CLOUD_DAILY_CAP=0`).
6. **Record (4.7):** `results.md` + `production-config.md` (flip-ON state) + roadmap.

## Carry-along (unrelated, near-term)

- **wrangler-action Node-20 deprecation** in `.github/workflows/ci.yml` deploy job — GitHub forces Node 24 on **2026-06-16**; bump the action or set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`. Separate chore, not D.1.
- **dev-SSR crash** on the enhance page — see `dev-ssr-known-issue.md` (own change; not a D.1 blocker since Phase 3 used the script path).
