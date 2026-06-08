# Manual Setup Runbook — wiring up the external services

**Ordered, do-this-then-this actions** to provision and wire LuminaClean AI's external
services (Cloudflare, Supabase, Replicate, Resend, GitHub, Google) from scratch — the
configuration that lives **outside the codebase** and that a fresh clone cannot reproduce.

> **This file is the _procedure_; [`production-config.md`](./production-config.md) is the
> _state record_** (the concrete refs, IDs, hostnames, and what is currently set). Read them
> together: follow the steps here, look up the actual identifiers there. **No secret values in
> either file** — keys/tokens live in their vaults (Worker/Edge/GitHub secrets, Supabase Vault,
> a password manager).

> The original execution log of the first go-live is the archived, read-only
> `context/archive/2026-06-04-production-deployment/go-live.md` (and its flip-ON runbook).
> This file is the live, reusable version.

---

## 0. Prerequisites

- Accounts: **Cloudflare**, **Supabase**, **Replicate**, **Resend**, **GitHub**, **Google
  Search Console**.
- Local tooling: Node 22.x via `fnm`/`.nvmrc`; `npx supabase` + `npx wrangler` (both
  devDependencies); `git`/`gh`; Docker (only for local Supabase).
- Auth the CLIs once: `npx supabase login` and `npx wrangler login` (interactive — run them
  yourself via the `!` prefix if a shell can't accept input).

**Dependency order** (later steps consume earlier outputs):
`Supabase project → Cloudflare Worker+domain → Replicate creds → wire cloud pipeline → Resend email → GitHub CI → Google` .

---

## 1. Supabase (prod project)

Identifiers (ref, region, URL) → `production-config.md` §2.

1. **Create the project** in the Supabase dashboard (region close to users). Note its **ref**.
2. **Link + push schema** from the repo:
   ```bash
   npx supabase link --project-ref <PROD_REF>
   npx supabase db push          # applies supabase/migrations/* (tables, RLS, storage bucket, jobs webhook trigger)
   ```
3. **Deploy the Edge Function:**
   ```bash
   npx supabase functions deploy enhance --project-ref <PROD_REF>
   ```
   (`verify_jwt = false` — it authenticates the DB webhook itself via the bearer secret.)
4. **Auth → URL configuration** (dashboard): Site URL = `https://<your-domain>`; Redirect URLs
   = `https://<your-domain>/**`. (Local dev project uses `http://localhost:4321` instead.)
5. **Enable Realtime** on the `photo_jobs` table (Database → Replication / Realtime) — the
   frontend subscribes to job-row updates for the live result push.

> Edge Function **secrets** and the **DB-webhook wiring** are deliberately deferred to §4
> (cloud pipeline) — the app runs Local-only + auth without them.

---

## 2. Cloudflare (domain + Worker)

Identifiers (account ID, Worker name, bindings) → `production-config.md` §1.

1. **Register / add the domain** (Cloudflare Registrar or move DNS to Cloudflare).
2. **Create the Worker bindings** declared in `wrangler.jsonc` — KV namespace (`SESSION`),
   Images (`IMAGES`), static assets (`ASSETS` → `./dist`). `observability.enabled = true`.
3. **First deploy:**
   ```bash
   npm run build && npx wrangler deploy
   ```
4. **Attach the custom domain** to the Worker (Workers → your Worker → Domains & Routes →
   add `your-domain.com`). Cloudflare auto-creates the proxied DNS record + TLS.
5. **Worker runtime secrets** (prompt-based, persist across deploys):
   ```bash
   npx wrangler secret put SUPABASE_URL                 # https://<PROD_REF>.supabase.co
   npx wrangler secret put SUPABASE_KEY                 # publishable sb_publishable_…
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY    # high-privilege, RLS bypass
   npx wrangler secret put CLOUD_PIPELINE_ENABLED       # "false" until flip-ON (§4)
   npx wrangler secret put CLOUD_DAILY_CAP              # "0" until flip-ON (kill-switch)
   ```
   ⚠️ **These MUST point at the prod Supabase ref**, not dev. Verify after deploy:
   ```bash
   curl https://<your-domain>/ | grep -o '[a-z]\{20\}\.supabase\.co'   # must show <PROD_REF>
   ```
   (See `lessons.md` — "a new prod Supabase project does NOT auto-repoint the Worker".)

---

## 3. Replicate (model credentials)

The cloud engine runs **`mingcv/bread`** on Replicate via the async webhook pipeline.

1. **API token:** Replicate → Account → API tokens → create one (starts `r8_…`). Store in a
   password manager — it goes into an Edge secret in §4, never the repo.
2. **Webhook signing secret** — the account-default secret Replicate uses to sign callbacks
   (svix HMAC). Fetch it with the token from step 1:
   ```bash
   curl -s -H "Authorization: Bearer <REPLICATE_API_TOKEN>" \
     https://api.replicate.com/v1/webhooks/default/secret      # → {"key":"whsec_…"}
   ```
   ⚠️ **Use this REAL account secret**, not a self-generated local-test value — a self-signing
   local harness can't detect a wrong provider secret, so a mismatch only surfaces in prod as
   silent 401s on `/callback` → jobs stuck `processing` (D.1 finding F1; `lessons.md`).

---

## 4. Wire the cloud pipeline (the flip-ON sequence)

Gated until the cloud-readiness slices are in (cost cap, retention, cold-boot). Do all of
this together — a half-wired pipeline stalls jobs silently. Names/locations → `production-config.md` §2.

1. **DB-webhook config in Supabase Vault** (hosted Supabase denies `ALTER DATABASE SET
   app.settings.*`, so config moved to Vault — migration `20260608120000_jobs_webhook_vault.sql`
   makes `handle_queued_job()` read these). In the prod **SQL Editor**:
   ```sql
   select vault.create_secret('https://<PROD_REF>.supabase.co/functions/v1/enhance', 'edge_function_url');
   select vault.create_secret('<DB_WEBHOOK_SECRET>', 'db_webhook_secret');   -- random 24-byte hex
   ```
   (To rotate later: `vault.update_secret((select id from vault.secrets where name='…'), '<NEW>')`.)
2. **Edge Function secrets** — set all of these on the prod project:
   ```bash
   npx supabase secrets set --project-ref <PROD_REF> \
     CLOUD_PIPELINE_ENABLED=true \
     REPLICATE_API_TOKEN=<r8_…> \
     REPLICATE_WEBHOOK_SIGNING_SECRET=<whsec_… from §3.2> \
     DB_WEBHOOK_SECRET=<same value as the Vault db_webhook_secret> \
     EDGE_FUNCTION_URL=https://<PROD_REF>.supabase.co/functions/v1/enhance
   ```
   - `DB_WEBHOOK_SECRET` here **must equal** the Vault `db_webhook_secret` (step 1) — they're
     the two ends of the same bearer; a mismatch makes `/start` 401 the webhook.
   - `EDGE_FUNCTION_URL` is **REQUIRED**: the in-function auto-injected `SUPABASE_URL` is not the
     public https URL in the hosted runtime, so without this override `/start` builds predictions
     with **no webhook** → Replicate never calls back → jobs stall (D.1 finding F2; `lessons.md`).
   - Confirm with `npx supabase secrets list --project-ref <PROD_REF>`.
3. **Worker secrets** — flip the flags on:
   ```bash
   npx wrangler secret put CLOUD_PIPELINE_ENABLED   # "true"
   npx wrangler secret put CLOUD_DAILY_CAP          # desired cap, e.g. "3"
   ```
4. **Verify end-to-end:** submit one cloud job → it should go `queued → processing → succeeded`
   via Realtime, source deleted, result present. Submit beyond the cap → `daily_cap_reached`
   (429). Check a Replicate prediction has `webhook` set (not `NONE`).
5. **Kill-switch (instant reverse):** `npx wrangler secret put CLOUD_DAILY_CAP` → `0` (pre-insert
   reject), and/or `CLOUD_PIPELINE_ENABLED=false` on **both** Worker and Edge Function.

---

## 5. Resend (transactional / auth email)

SMTP values → `production-config.md` §3.

1. **Add + verify the sending domain** in Resend ("Auto configure" writes SPF/DKIM/MX into
   Cloudflare DNS). Wait for **Verified**.
2. **Create an API key** (e.g. named `supabase-smtp`).
3. **Wire into Supabase prod** — Auth → SMTP Settings → enable custom SMTP:
   Host `smtp.resend.com`, Port `465`, Username `resend`, Password = the Resend API key,
   From `no-reply@<your-domain>`, sender name `LuminaClean AI`.
4. **Recovery email template:** once custom SMTP is on, the template editor unlocks — paste the
   contents of `supabase/templates/recovery.html` into Auth → Email Templates → **Reset
   Password**. (Required for the reset link to resolve via `/auth/confirm`.)
5. Optional: raise Auth → Rate Limits above the ~30/h default; add a `_dmarc` TXT for
   deliverability.

---

## 6. GitHub (CI deploy)

The `.github/workflows/ci.yml` workflow lints, tests, builds, and deploys on push to `master`.
Set these repo secrets (Settings → Secrets and variables → Actions) — names only in
`production-config.md` §4:

- `CLOUDFLARE_API_TOKEN` (scoped for Workers deploy), `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_ACCESS_TOKEN` (a Supabase PAT — **note its expiry and rotate before it lapses**),
  `SUPABASE_PROJECT_REF`
- `SUPABASE_URL`, `SUPABASE_KEY` (build-time; **separate from** the Worker runtime secrets in §2)

Uses `cloudflare/wrangler-action@v4` for the deploy step.

---

## 7. Google Search Console (optional but recommended)

1. **Verify the domain** (DNS TXT record).
2. A brand-new domain with a login form can get a **"Deceptive pages"** false-positive flag —
   if so, confirm it's a false positive and **request a review** in Search Console; it typically
   clears within a day, browser warnings within ~72h.

---

## 8. Verify, roll back, recover

- **Smoke:** `curl https://<your-domain>/` → 200 + correct title; auth redirect intact; Supabase
  logs clean.
- **Worker rollback** (reverts Worker + assets ONLY — NOT migrations or the Edge Function):
  ```bash
  npx wrangler versions list
  npx wrangler rollback [<version-id>]
  npm run build && npx wrangler deploy     # re-deploy forward to confirm the path
  ```
- **Migrations / Edge Function** are a separate ops surface — roll those back via their own
  `supabase db` / `functions deploy` flow, not `wrangler rollback`.

---

## Cross-references

- **State record (what's set now):** `production-config.md`
- **First go-live execution log + flip-ON runbook (archived):** `context/archive/2026-06-04-production-deployment/go-live.md`
- **Recurring config pitfalls:** `context/foundation/lessons.md` (Worker-repoint, signing-secret, `EDGE_FUNCTION_URL`)
- **Local cloud-pipeline run:** archived `context/archive/2026-06-07-cloud-flip-on-revalidation/local-runbook.md`
