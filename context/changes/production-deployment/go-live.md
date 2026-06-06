# LuminaClean AI — Go-Live Record (S-07)

Production cutover record for the `production-deployment` change. Cloud AI pipeline
ships **OFF**; the local engine + auth are live. Flip-ON is a separate, gated event
(see below).

> 📋 **Manual / external configuration** (Cloudflare, Supabase, Resend, GitHub, Google) —
> the dashboard setup the app **requires to run** — is recorded in
> [`context/foundation/production-config.md`](../../foundation/production-config.md).
> That file is the durable home for it (survives this change's archival); this go-live
> record is the point-in-time cutover log.

## Production endpoints

| Surface | Value |
| --- | --- |
| App — primary domain | **https://luminacleanai.com** (custom domain on the Worker, added 2026-06-06; HTTP 200 + valid TLS verified) |
| App — workers.dev alias | https://lumina-clean-ai.pmiller-software.workers.dev (same Worker; teardown tracked in issue #14) |
| Worker name | `lumina-clean-ai` |
| Worker Version ID (go-live) | `8e0ad338-aa0a-4875-b616-55b3f84849a0` (CI deploy); current live `c8273695` after the 4.6 rollback drill re-deploy. Future master pushes mint new versions. |
| Supabase project (prod) | `luminaclean-prod` — ref `tebdkqpgjjypdethpezo` (`https://tebdkqpgjjypdethpezo.supabase.co`) |
| Edge Function | `enhance` — ACTIVE, v1 (`verify_jwt = false`), id `e0ab0a25` |
| First prod deploy | CI run [27033884831](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/27033884831), commit `dd7f1d3` |

## Domain, DNS & environments (2026-06-06)

- **Domain purchased:** `luminacleanai.com` — registered at **Cloudflare Registrar** on 2026-06-06 (exact brand match for "LuminaClean AI"). DNS managed in Cloudflare.
- **Custom domain on the Worker:** `luminacleanai.com` attached to Worker `lumina-clean-ai` (Cloudflare auto-created the proxied DNS record + TLS cert). Verified serving the app (HTTP 200, valid cert; `/dashboard` → 302 `/auth/signin` on the new host). `www` not yet attached (optional). The `workers.dev` URL stays an alias of the same prod Worker — disabling it is a follow-up chore (**issue #14**, `disable-workers-dev-subdomain`).
- **Supabase environments (renamed for clarity 2026-06-06):**

  | Env | Project name | Ref | Site URL | Redirect URLs |
  | --- | --- | --- | --- | --- |
  | Dev | `luminaclean-dev` (was `lumina-clean-ai`) | `gwaviaozehxmyjjcioxy` | `http://localhost:4321` | `localhost:4321/**`, `127.0.0.1:4321/**`, `127.0.0.1:8787/**` |
  | Prod | `luminaclean-prod` | `tebdkqpgjjypdethpezo` | `https://luminacleanai.com` ⚠️ confirm switched from the temporary workers.dev value set in 2.5 Step A | `https://luminacleanai.com/**` |

  The dev project is **not** wired to production — the deployed app uses only `luminaclean-prod`. (Project *name* is a display label; ref/URL/keys are unchanged by the rename.)
- **Auth email (prod) — still deferred, now unblocking:** the default Supabase sender can't edit templates (free-tier project created after the **2026-06-03** template-lock change) and only delivers to team addresses. With the domain now in hand, the path is **Resend custom SMTP** (verify `luminacleanai.com` → SMTP in Supabase → unlocks template editing → save `recovery.html` → real password-reset email). **In progress.** Interim admin/test reset works via `scripts/generate-recovery-link.ts` (no email).
- **Google Safe Browsing:** on first login, `luminacleanai.com` was flagged **"Deceptive pages"** (social engineering) — a **false positive** (new domain + login form; Search Console Security Issues listed **no sample URLs**). Domain verified in Search Console; **review requested 2026-06-06** (deceptive/phishing reviews ~1 day; warnings clear within ~72h). Don't re-submit while pending; hold off sharing the URL widely until cleared.

## Cloud state at go-live: OFF

- **Worker** secrets (set once via `wrangler secret put`, persist across deploys):
  `CLOUD_PIPELINE_ENABLED=false`, `CLOUD_DAILY_CAP=0` (operator kill-switch),
  plus `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Edge Function** secrets (verified `supabase secrets list` 2026-06-05): only the
  **auto-injected** Supabase defaults are present (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`,
  `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`). The custom
  cloud-pipeline secrets (`CLOUD_PIPELINE_ENABLED`, `DB_WEBHOOK_SECRET`,
  `REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET`) are **NOT set** —
  intentionally deferred to the flip-ON runbook (deferred-ledger 2.6c). Safe because
  `/start` checks `Deno.env.get("CLOUD_PIPELINE_ENABLED") !== "true"`, so an **unset**
  flag → `{skipped: "cloud_pipeline_disabled"}` no-op (`index.ts:183`). **Flip-ON must
  set all four.**
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
