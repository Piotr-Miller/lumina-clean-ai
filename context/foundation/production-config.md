# Production Configuration & Manual Setup Record

Durable inventory of all **external / dashboard configuration** for LuminaClean
production — the things that live in Cloudflare, Supabase, Resend, GitHub, and Google,
**not** in the codebase. Keep this updated when prod config changes.

> ⚠️ **These are runtime prerequisites for the MVP, not after-the-fact notes.** The
> deployed Worker serves, but without this external configuration the production **MVP**
> does **not** function — auth redirects, email (sign-up confirmation + password reset),
> the branded domain/TLS, and CI deploy all depend on it. A fresh clone of the repo is
> **not** enough to run the prod MVP; this file is the missing half. Treat it as required
> reading before touching or re-provisioning production.

> **No secret values here.** Only names, locations, and non-sensitive identifiers
> (refs, account IDs, hostnames, URLs). Actual keys/tokens/passwords live in their
> respective vaults (Worker secrets, Supabase secrets, GitHub secrets, Resend, a
> password manager) — never in the repo.

> **Companion:** [`manual-setup-runbook.md`](./manual-setup-runbook.md) is the _procedure_
> (ordered "do this, then this" wire-up actions per service). This file is the _state record_
> (the concrete refs/IDs and what's currently set). Use them together.

Last updated: **2026-08-04**.

---

## 1. Domain & Cloudflare

- **Domain:** `luminacleanai.com` — registered at **Cloudflare Registrar** 2026-06-06; DNS managed in Cloudflare. Exact brand match for "LuminaClean AI".
- **Cloudflare account ID:** `9b645f82fe0122394111985d936e5844`
- **Worker:** `lumina-clean-ai`
  - **Custom domain:** `luminacleanai.com` (root) — attached 2026-06-06, Cloudflare auto-created proxied DNS + TLS. `www` **not yet** attached (optional).
  - **workers.dev alias:** ~~`lumina-clean-ai.pmiller-software.workers.dev`~~ — **DISABLED 2026-08-07** (issue #14 closed, PR #113): `workers_dev: false` + `preview_urls: false` in `wrangler.jsonc` (config-as-code — reapplied on every deploy). Trigger: GSC "Alternate page with proper canonical tag" (the alias served a full site duplicate). Plain-HTTP additionally 301s to HTTPS in `src/middleware.ts`. Live-verified: https 200 / http→301 / workers.dev 404.
  - **Bindings:** `SESSION` (KV namespace), `IMAGES` (Images), `ASSETS` (static `./dist`). `observability.enabled = true`. Config in `wrangler.jsonc`.
- **DNS records** (added by Resend "Auto configure", DNS-only):
  | Host                        | Type      | Purpose              | Value (summary)                                                          |
  | --------------------------- | --------- | -------------------- | ------------------------------------------------------------------------ |
  | `send`                      | TXT       | SPF                  | `v=spf1 include:amazonses.com ~all`                                      |
  | `resend._domainkey`         | TXT       | DKIM                 | `p=MIGf…` (Resend/SES key)                                               |
  | `send`                      | MX        | bounce/return-path   | `10 feedback-smtp.eu-west-1.amazonses.com`                               |
  | `_dmarc`                    | TXT       | DMARC                | **not set** — optional, add `v=DMARC1; p=none;` later for deliverability |
  | `luminacleanai.com` / `www` | (managed) | Worker custom domain | proxied → Worker `lumina-clean-ai`                                       |

## 2. Supabase — environments

Two separate projects (same org `cqbfrshdnawpivbapygc`). The deployed app uses **prod only**.

### Prod — `luminaclean-prod`

- **Ref:** `tebdkqpgjjypdethpezo` · **Region:** eu-west-3 · URL `https://tebdkqpgjjypdethpezo.supabase.co`
- **Auth → URL config:** Site URL `https://luminacleanai.com`; Redirect URLs `https://luminacleanai.com/**`
- **Auth email:** **custom SMTP via Resend** (see §3). Recovery template = contents of `supabase/templates/recovery.html` pasted into the **Reset Password** template (editing unlocked once custom SMTP was set).
- **Edge Function `enhance`:** ACTIVE, v1, `verify_jwt = false` (id `e0ab0a25`).
- **Worker runtime secrets** (set via `wrangler secret put`, names only):
  `CLOUD_PIPELINE_ENABLED=true`, `CLOUD_DAILY_CAP=3` (**cloud flipped ON 2026-06-08 — D.1**; was `false`/`0`), `SUPABASE_URL`, `SUPABASE_KEY` (publishable `sb_publishable_…`), `SUPABASE_SERVICE_ROLE_KEY`.
  - ⚠️ **`SUPABASE_URL`/`KEY`/`SERVICE_ROLE_KEY` MUST point to `tebdkqpgjjypdethpezo` (prod).** They were initially set in May against the dev project (before prod existed), and the deployed app silently used **dev** until they were **repointed to prod on 2026-06-06**. Build-time `SUPABASE_URL`/`KEY` (GitHub/CI) are separate and do NOT drive runtime. **Verify:** `curl https://luminacleanai.com/ | grep -o '[a-z]\{20\}\.supabase\.co'` must show `tebdkqpgjjypdethpezo`. See `lessons.md` ("A new prod Supabase project does NOT repoint the deployed Worker").
- **Edge Function secrets (SET 2026-06-08, flip-ON / D.1):** `CLOUD_PIPELINE_ENABLED=true`, `DB_WEBHOOK_SECRET`, `REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET` (= Replicate's **real account** default webhook secret from `GET /v1/webhooks/default/secret`, NOT the local-test value — D.1 finding F1), and **`EDGE_FUNCTION_URL=https://tebdkqpgjjypdethpezo.supabase.co/functions/v1/enhance`** (REQUIRED: the in-function auto-injected `SUPABASE_URL` is not the public https URL, so without this explicit override `/start` creates predictions with no webhook → jobs stall — D.1 finding F2). **Since `edge-function-url-hardening` (2026-08-19) this is enforced in code**: `/start` refuses to create a webhook-less prediction and fails the job with a message naming the missing secret, instead of stalling silently. Do NOT set `ALLOW_WEBHOOKLESS_PREDICTION` in production — it restores the old silent-stall behaviour (local/CI-only seam, same class as `E2E_ALLOWED_OUTPUT_ORIGIN`).
- **DB-webhook secret/URL:** moved off custom GUCs (hosted denies `ALTER DATABASE SET app.settings.*`) to **Supabase Vault** via migration `20260608120000_jobs_webhook_vault.sql`. Prod Vault holds `edge_function_url` + `db_webhook_secret` (set 2026-06-08). See `deferred-2.4-db-webhook-settings.md` + `cloud-flip-on-revalidation/results.md`.
- **Retention reaper (`pg_cron`, change `retention-reaper`):** migration `20260614130000_reaper_schedule.sql` schedules an hourly `cron.job` `reaper-hourly` that POSTs the `enhance` `/reap` route. **Zero new prod config** — the tick reuses the SAME `edge_function_url` + `db_webhook_secret` Vault entries above (no new secret). **One-time prod step:** `pg_cron` must be enabled (Dashboard → Integrations → Cron, or the migration's `create extension` if the migration role may create it); the migration self-skips with a NOTICE where `pg_cron` is unavailable. **Verify** the schedule (`select * from cron.job where jobname='reaper-hourly'`) and that the first tick lands (`select * from cron.job_run_details order by start_time desc limit 5`). **Applied + verified live 2026-06-15:** both reaper migrations applied to prod (via Supabase MCP, recorded in `schema_migrations` under the exact repo versions), `pg_cron` enabled, `reaper-hourly` scheduled, and the hourly tick confirmed healthy — every run `succeeded` and `/reap` returns `200 {"swept":0}` (`net._http_response`), 0 lingering `source.*` >23h. Both reaper functions are anon-locked.

### Dev — `luminaclean-dev` (renamed from `lumina-clean-ai` on 2026-06-06)

- **Ref:** `gwaviaozehxmyjjcioxy` · **Region:** eu-central-2
- **Auth → URL config:** Site URL `http://localhost:4321`; Redirect URLs `http://localhost:4321/**`, `http://127.0.0.1:4321/**`, `http://127.0.0.1:8787/**`
- **Vestigial / paused-by-design (verified 2026-06-15).** Nothing in the current workflow depends on this remote project: local dev + tests run against the **local Docker Supabase** (`npx supabase start`; `.dev.vars` → `SUPABASE_URL=http://127.0.0.1:54321`), CI `integration`/`e2e` boot an **ephemeral local Supabase**, and the deployed app + CI build/deploy use **prod** (`tebdkqpgjjypdethpezo`). The only live references to this ref are documentation (here + `lessons.md`). It's the original pre-prod project (renamed from `lumina-clean-ai`), superseded by prod.
- **Free-tier auto-pause is harmless here.** Supabase pauses free projects after 7 days idle (mail received 2026-06-15). Leave it paused, or delete it (data downloadable for 90 days first) to cut the noise — do **not** upgrade to Pro just to keep an unused dev project awake. If a remote dev/staging is ever needed, unpause on-demand (≤90 days) rather than always-on. **Prod won't auto-pause:** the hourly retention reaper (`pg_cron reaper-hourly`) plus live traffic keep it active.

## 3. Resend (transactional / auth email)

- **Domain:** `luminacleanai.com` — **Verified** (Auto configure via Cloudflare). Sending region **eu-west-1**.
- **API key:** name `supabase-smtp` (value stored in Supabase prod SMTP config; not here).
- **SMTP settings** (used by Supabase prod custom SMTP):
  - Host `smtp.resend.com` · Port `465` · Username `resend` · Password = the Resend API key
  - From `no-reply@luminacleanai.com` · Sender name `LuminaClean AI`
- **Logs:** Resend → Emails (delivery/bounce status) for debugging.
- Default Supabase auth rate limit after custom SMTP (~30/h) — adjust in Auth → Rate Limits if needed.

## 4. GitHub repo secrets (CI deploy — `Piotr-Miller/lumina-clean-ai`)

Names only (Settings → Secrets and variables → Actions):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (`9b645f82fe0122394111985d936e5844`),
`SUPABASE_ACCESS_TOKEN` (Supabase PAT, named `luminaclean-prod`, expires **2026-07-05** — rotate before),
`SUPABASE_PROJECT_REF` (`tebdkqpgjjypdethpezo`), `SUPABASE_URL`, `SUPABASE_KEY`.

## 5. Google Safe Browsing / Search Console

- `luminacleanai.com` flagged **"Deceptive pages"** (social engineering) on first login — assessed **false positive** (new domain + login form; Search Console listed **no sample URLs**).
- Domain **verified in Google Search Console** (DNS TXT). Review requested 2026-06-06; **PASSED 2026-06-07** — Google confirmed the site no longer contains links to harmful sites or downloads and is **removing the user-visible warnings** (propagates over a few hours, browsers clear within ~72h). The "Deceptive pages" flag was a confirmed **false positive**, now cleared.

## 6. Local dev environment

- Node via **fnm**; PowerShell profile now auto-activates it (`fnm env --use-on-cd`). Project Node pinned by `.nvmrc` (24.x — switched from 22.x in PR #107).
- `wrangler` `4.118.0` (devDependency — bumped from 4.98.0 in PR #106).

---

## 7. Replicate — cost controls & spend ceiling

**Verified 2026-08-26** (account billing page, read-only; change `atomic-cloud-daily-cap`). Recorded here because S-05 named a "provider billing alert" as the daily cap's operational backstop and nothing in this file has ever described one.

**There is no self-service spend limit or billing alert on Replicate, and there was none when S-05 named it.** The monthly spend limit was deprecated on **2025-07-01** — _"The ability to set a monthly spend limit on your account has been deprecated"_ ([changelog](https://replicate.com/changelog/2025-07-01-set-a-monthly-spend-limit)) — eleven months before S-05 (2026-06) recorded it as the backstop. It survives only as a support request. The billing page carries no limit/budget/alert/threshold control of any kind, and the docs describe no low-balance notification. **Do not go looking for this alert again; it does not exist as a self-service feature.**

**What actually bounds spend — observed state 2026-08-26:**

| Signal              | Value                                                                |
| ------------------- | -------------------------------------------------------------------- |
| Billing mode        | **Prepaid credit**                                                   |
| Credit remaining    | **$19.77**                                                           |
| **Auto-reload**     | **DISABLED** ← this is what makes the bound real                     |
| Outstanding balance | $0.00                                                                |
| Usage this month    | $0.00 (4 cap-counted jobs in Aug; rounds to zero at cent resolution) |

Prepaid credit with auto-reload off is a **hard ceiling, and a stronger control than the alert S-05 wanted** — it stops work rather than reporting after the fact: _"As soon as your balance hits zero, we will prevent any new work from starting and shut down any infrastructure we're running for you"_ ([prepaid credit docs](https://replicate.com/docs/topics/billing/prepaid-credit)). A single prediction may slightly overshoot the balance and is charged at month end, so the ceiling is hard but not cent-exact.

**Verify** (no CLI — this is console-only): https://replicate.com/account/billing → confirm **Credit remaining** and that **Manage auto-reload** still reads disabled.

**Four limits of this backstop — it does not make the daily cap correct:**

1. It bounds **total lifetime spend**, not per-day overrun. FR-014 promises that an over-cap request is _rejected_; a ceiling on the eventual bill is not that promise.
2. It is **incidental, not designed**. Auto-reload-off is the default state; nothing ties it to the cap contract, and no one chose it as a cost control.
3. It **fails silently**. There are no documented low-balance emails, so exhaustion surfaces to users as failed cloud jobs, not to the operator as a warning.
4. It is **one click from gone** — "Add credit" or enabling auto-reload removes it, with nothing in the repo connecting that action to FR-014.

Treat it as defence in depth. The enforcing control is the daily cap itself — since S-16 (#191) a guarded database write, `public.admit_cloud_job`, holding a transaction-scoped advisory lock across count-and-insert; the handler's `countCloudJobsToday` check is a non-authoritative fast path (see `AGENTS.md`). The date it is applied to `luminaclean-prod` is recorded below (Phase 4, before this PR merges).

**Applied to `luminaclean-prod` on 2026-08-29** (S-16 `atomic-cloud-daily-cap`, #191)
via `npx supabase db push --linked`, **before** the implementing PR merges. Migration
`20260828120000_atomic_cloud_daily_cap.sql`; prod migration history now 11/11 in parity
with `supabase/migrations/`, recorded under the file's own version.

Order matters: CI deploys the Worker and the Edge Function on merge to master but **not**
migrations. The function is additive and inert until the new Worker calls it, so applying
first is safe; merging first would 500 every cloud submission (the S-11 failure mode).

Verification run immediately after apply (read-only, against prod):

| Check                                                      | Result                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Function signature                                         | `admit_cloud_job(uuid,uuid,text,double precision,double precision,integer)`                                                          |
| `prosecdef`                                                | `false` — SECURITY INVOKER, not DEFINER                                                                                              |
| `proconfig`                                                | `search_path=""`                                                                                                                     |
| EXECUTE — `PUBLIC`                                         | `false` (checked explicitly; `anon`/`authenticated` inherit from it)                                                                 |
| EXECUTE — `anon`, `authenticated`                          | `false`, `false`                                                                                                                     |
| EXECUTE — `service_role`                                   | `true`                                                                                                                               |
| Raw ACL                                                    | `{postgres=X/postgres,service_role=X/postgres}` — no `PUBLIC` entry                                                                  |
| Partial index `jobs_billable_created_at_idx`               | present; predicate `(status <> 'failed') OR (replicate_prediction_id IS NOT NULL)` — the complement of the count's exclusion         |
| `service_role` on `public.jobs` (the INVOKER precondition) | INSERT `true`, SELECT `true`, `rolbypassrls = true`; `authenticated` INSERT `false`, `anon` INSERT `false`; RLS enabled on the table |
| INSERT target columns present + typed                      | `id:uuid`, `user_id:uuid`, `status:USER-DEFINED`, `source_path:text`, `gamma:double precision`, `strength:double precision`          |

Baseline before the push confirmed the function, its ACL, and the index were all absent,
and that prod's `jobs` table carried every column the signature and predicate need.

The last two rows matter because the function is `SECURITY INVOKER`: it can only write
because `service_role` **independently** holds INSERT/SELECT on `public.jobs` — the
reason `SECURITY DEFINER` was dropped in Phase 1. That grant is not implied by a
successful `CREATE FUNCTION`, and this project has already been bitten by prod/local
grant divergence (`20260804212000_explicit_service_role_grants_on_jobs.sql` exists
because CLI 2.111+ stopped seeding those grants). plpgsql also compiles statement
bodies lazily, so creation alone does not prove the INSERT resolves against prod's
schema — hence the explicit column/type row. Nothing has yet **executed** the function
in production; that is Phase 5's smoke.

**Still outstanding (Phase 5, post-merge follow-up PR):** one real cloud job succeeding on
production after the deploy, a `CLOUD_DAILY_CAP=0` rejection with the cap restored to `3`
afterwards, and that smoke result recorded here.

---

## Credential inventory (names + location, NEVER values)

| Credential                                           | Where it lives                                                        | Notes                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| Cloudflare API token (CI)                            | GitHub secret `CLOUDFLARE_API_TOKEN`                                  | scoped for Workers deploy                              |
| Supabase PAT                                         | GitHub secret `SUPABASE_ACCESS_TOKEN`                                 | name `luminaclean-prod`, expires 2026-07-05            |
| Supabase service-role key (prod)                     | Worker secret `SUPABASE_SERVICE_ROLE_KEY` + Edge Function auto-inject | RLS bypass — high privilege                            |
| Supabase publishable key (prod)                      | Worker secret `SUPABASE_KEY` + GitHub secret                          | `sb_publishable_…`, safe to expose                     |
| Resend API key                                       | Supabase prod SMTP password; Resend dashboard                         | name `supabase-smtp`                                   |
| Replicate token + webhook secret + DB webhook secret | **set 2026-06-08** — Edge Function secrets + Vault (flip-ON / D.1)    | webhook secret = Replicate's real account default (F1) |

## Pending / follow-ups

- ~~**Replicate billing alert (the S-05 backstop)**~~ — **CLOSED 2026-08-26 as NOT AVAILABLE:** the self-service monthly spend limit was deprecated 2025-07-01, so the backstop S-05 promised never existed. Effective replacement already in place: prepaid credit **$19.77** with **auto-reload disabled** = hard ceiling. Full record + its four limits in §7. Optional, not taken: request a spend limit from Replicate support.

- ~~**Safe Browsing review**~~ — **RESOLVED 2026-06-07**: Google review passed, "Deceptive pages" false positive cleared, warnings being removed.
- ~~**#14** — disable workers.dev once branded domain is established~~ — **DONE 2026-08-07** (PR #113): `workers_dev:false` + `preview_urls:false` in `wrangler.jsonc`, plus http→https 301 in middleware. Archived → `context/archive/2026-06-06-disable-workers-dev-subdomain/`.
- **DMARC** — optional TXT for deliverability.
- ~~**Flip-ON** (S-05+S-08+S-09)~~ — **DONE 2026-06-08 (D.1)**: cloud LIVE, `CLOUD_DAILY_CAP=3`; GUC→Vault migration; Edge/Worker secrets set. Kill-switch: `wrangler secret put CLOUD_DAILY_CAP` → `0`. See `context/changes/cloud-flip-on-revalidation/results.md`.
- **`www`** subdomain — optionally attach + redirect to apex.
- ~~**Reaper pg_cron enablement (prod)**~~ — **RESOLVED 2026-06-15:** migrations applied to prod, `pg_cron` enabled, `reaper-hourly` scheduled + ticking (8+ hourly runs `succeeded`; `/reap` → `200 {"swept":0}`; 0 lingering sources). See §2 Prod.
