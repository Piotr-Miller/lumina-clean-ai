---
project: LuminaClean AI
deployed_at: 2026-05-26
platform: cloudflare-workers
worker_name: lumina-clean-ai
live_url: https://lumina-clean-ai.pmiller-software.workers.dev
version_id: 2dd24bb5-d763-42a3-89cc-65403df0a5c1
account_id: 9b645f82fe0122394111985d936e5844
workers_dev_subdomain: pmiller-software
status: live
scope: frontend-only
---

# Deploy Plan — LuminaClean AI → Cloudflare Workers (first production deploy)

Audit trail of the project's first production deploy. Platform decision: see
`context/foundation/infrastructure.md` (Cloudflare Workers, runner-up Netlify).
Stack contract: `context/foundation/tech-stack.md`.

**Scope: frontend only.** The async cloud-AI pipeline (Supabase Edge Function → Replicate →
webhook callback → Supabase Realtime) is not implemented yet and was explicitly out of scope.

## What was deployed

- **App**: Astro 6 SSR + React 19 islands, `@astrojs/cloudflare` v13.5 adapter, `output: "server"`.
- **Live URL**: https://lumina-clean-ai.pmiller-software.workers.dev
- **Worker**: `lumina-clean-ai` (renamed from the starter default `10x-astro-starter`).
- **Version ID at first live deploy**: `2dd24bb5-d763-42a3-89cc-65403df0a5c1` (superseded by two
  later versions when the secrets were set — secrets each publish a new version).

## Config fixes applied before deploy (`wrangler.jsonc`)

Both flags were mandatory pre-deploy mitigations identified in `infrastructure.md`:

1. **Rename** `name`: `10x-astro-starter` → `lumina-clean-ai` (matches `project_name`; done before
   first deploy so no orphaned Worker was left behind).
2. **`disable_nodejs_process_v2`** added to `compatibility_flags` (now
   `["nodejs_compat", "disable_nodejs_process_v2"]`) — pre-empts Astro #15434, where Node "Process
   v2" + `nodejs_compat` makes SSR middleware render `[object Object]` under workerd. **Verified
   absent** in production (`GET /` returns real HTML).
3. **`run_worker_first: true`** added **inside the `assets` object** (verified against the wrangler
   4.94 config schema — it is a property of `Assets`, not a top-level key) — ensures auth middleware
   runs ahead of static-asset serving so protected routes don't leak. **Verified** in production
   (`GET /dashboard` while signed out → `302 → /auth/signin`).

## Resources provisioned on the account

- **SESSION KV namespace**: `lumina-clean-ai-session` (id `dc95602db92948bf82eefe3a216d6b6a`) —
  auto-provisioned by `wrangler deploy` because the `@astrojs/cloudflare` adapter enables
  KV-backed sessions. Bound as `env.SESSION`.
- **IMAGES** binding (Cloudflare Images) and **ASSETS** binding (static assets) — auto-configured
  by the adapter; no manual setup needed.
- **workers.dev subdomain**: `pmiller-software` — registered once via the dashboard onboarding
  page (`/workers/onboarding`). This was the only deploy blocker; a brand-new account has no
  subdomain and wrangler cannot register one non-interactively.

## Secrets

Set via `wrangler secret put` (Workers secret vault, stored as `secret_text`):

| Secret | Status | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | ✅ wired | `https://gwaviaozehxmyjjcioxy.supabase.co` (public value) |
| `SUPABASE_KEY` | ✅ wired | Supabase **publishable** key (`sb_publishable_…`; public, anon-equivalent) |
| `REPLICATE_API_KEY` | ⏳ deferred | Needed when the Replicate cloud pipeline lands |
| `SUPABASE_SERVICE_ROLE_KEY` | ⏳ deferred | `sb_secret_…`; **never paste in chat** — set directly via `wrangler secret put` |

Build does not require the secrets (`SUPABASE_URL`/`SUPABASE_KEY` are `optional: true` in the
`astro.config.mjs` env schema); they are runtime-only and apply live the moment they are set.

## Verification (all passed)

| Check | Result |
| --- | --- |
| Local workerd smoke (`wrangler dev`): `GET /` renders real HTML | ✅ no `[object Object]` |
| Local workerd smoke: `GET /dashboard` signed-out redirects | ✅ `302 → /auth/signin` |
| Production `GET /` | ✅ `200`, real HTML |
| Production `GET /dashboard` signed-out | ✅ `302 → /auth/signin` |
| Production CSRF: form `POST` with no/mismatched `Origin` | ✅ `403` (Astro origin check) |
| Production auth path: sign-in with matching `Origin` + bogus creds | ✅ `302 → /auth/signin?error=Invalid%20login%20credentials` (reached Supabase Auth; publishable key accepted) |

No `1102` (CPU-limit) errors observed exercising the auth hot path.

## Operations

- **Re-deploy**: `npm run build && npx wrangler deploy`
- **Rotate / update secrets**: `npx wrangler secret put <NAME>` (applies live, new version)
- **Live logs**: `npx wrangler tail` (filters: `--status error`, `--format json`)
- **Rollback** (reverts Worker code + static assets only — NOT Supabase schema/functions):
  ```
  npx wrangler versions list
  npx wrangler rollback [<version-id>]
  ```

## Hosted Supabase Auth configuration (production)

The hosted Supabase project (`gwaviaozehxmyjjcioxy`) is configured separately from the local
`supabase/config.toml`. For this MVP:

- **Email confirmation: DISABLED** (Authentication → Sign In / Providers → Email → "Confirm email"
  off). Rationale: Supabase's built-in email sender is rate-limited and not production-grade, so
  confirmation links were not delivered; disabling confirmation lets signups become active
  immediately. This matches the local config (`enable_confirmations = false`) and the MVP scope in
  `idea-notes.md` (email+password auth, no email-verification requirement). Resolves the
  local-vs-hosted config drift noted during the first deploy.
- **Site URL**: set to `https://lumina-clean-ai.pmiller-software.workers.dev` (Authentication →
  URL Configuration) so any auth redirects resolve to production, not localhost.
- **Future**: when real users arrive, re-enable "Confirm email" *and* configure custom SMTP
  (Authentication → Emails → SMTP Settings — e.g. Resend/Postmark/SES) so confirmation emails
  actually deliver. Confirmation-on without custom SMTP is the trap that blocked the first signup.

## Follow-ups / out of scope for this deploy

- **Real-account sign-in**: final human check in a browser (verified at the protocol level here,
- **Real-account sign-in**: final human check in a browser (verified at the protocol level here,
  not with a valid account).
- **CI auto-deploy**: `ci.yml` currently does lint + build only. tech-stack.md targets
  `auto-deploy-on-merge`; wiring `wrangler deploy` into CI needs `CLOUDFLARE_API_TOKEN` (scoped to
  this Worker) + `CLOUDFLARE_ACCOUNT_ID` as GitHub repo secrets.
- **Cloud-AI pipeline**: Supabase Edge Function + Replicate webhook chain — separate ops surface,
  not yet implemented; carries its own secrets (above) and needs its own runbook
  (per the pre-mortem in `infrastructure.md`).
- **Paid plan**: free tier is 10ms CPU; budget for the $5/mo plan (30ms) if `@supabase/ssr` JWT
  verification trips `1102` under load.
