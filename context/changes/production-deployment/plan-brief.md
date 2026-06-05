# S-07: Production Deployment / Go-Live — Plan Brief

> Full plan: `context/changes/production-deployment/plan.md`

## What & Why

Take LuminaClean AI live on Cloudflare Workers + a fresh production Supabase project so real users can use the Local engine and accounts. The Cloud AI pipeline ships **flag-OFF** — Local + auth go live now, while cloud stays bounded and inert until its separate gates (S-05 done, S-08, S-09) land. Before go-live exposes the public Replicate `/callback`, harden it.

## Starting Point

The app is Workers-ready: `wrangler.jsonc` already has the Astro #15434 fix and correct assets-first routing, and `CLOUD_PIPELINE_ENABLED` already defaults to `false` (read only in the Edge Function `/start`, which no-ops). CI runs lint+build but has **no deploy job**. No prod Supabase project exists yet; the DB-webhook trigger reads its target URL from a DB setting that prod must populate. The `/callback` has three open hardening gaps (no replay window, no fetch bounds, no SSRF allowlist).

## Desired End State

A public Workers URL where anon visitors run the Local engine and visitors can sign up / in / out and reset their password (link resolving on the prod domain). A cloud submit is accepted but correctly stays `queued` with zero Replicate spend. CI deploys app + Edge Function on every master push. `wrangler rollback` is proven. Flipping cloud ON later is one documented runbook step.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Cloud-OFF enforcement | Flag `false` **and** cap `0` | Two independent gates on an irreversible spend path | Plan |
| `/callback` hardening | Keep in S-07 | Harden the public callback before go-live exposes it | Frame/Roadmap |
| Prod-auth config | Full (site_url + redirects + recovery template) | Password-reset links 404 on the live domain otherwise | Plan |
| App deploy | CI job on master via `wrangler-action@v3` | Reproducible, agent-runnable, matches slice outcome | Plan |
| Edge Function deploy | CI `supabase functions deploy`, gated on `deno check` | Recovers the static coverage tsc/eslint can't give Deno | Plan |
| Preview deploys | Skip for MVP | Not a launch criterion; validate locally via `wrangler dev` | Plan |
| Provisioning boundary | Runbook for interactive steps; automate the rest | Logins/dashboard/secrets can't be agent-run | Plan |
| Replay window | ±5 min (svix default) | Standard tolerance; closes replay without false-rejects | Plan |
| Fetch bounds | 30s timeout + 25 MB cap | Generous for a CDN image; mirrors the bucket limit | Plan |
| SSRF allowlist | `*.replicate.delivery` host-suffix, https-only | Scopes the fetch to Replicate's real output CDN | Plan |

## Scope

**In scope:** `/callback` hardening; prod Supabase provisioning (migrations, DB-webhook settings, prod-auth); Cloudflare Worker + scoped token; all secrets (cloud OFF); CI deploy for app + Edge Function; go-live smoke test + rollback.

**Out of scope:** flipping cloud ON; S-09 source-URL TTL fix; S-08 retention cleanup; preview deploys; custom SMTP; per-user limits / history / admin (v2).

## Architecture / Approach

Four sequential phases: **(1)** harden `/callback` (pure code + tests, locally green) → **(2)** you run the provisioning runbook (logins, project create, migrations, DB settings, prod-auth, secrets) → **(3)** commit the CI deploy job (app via wrangler-action, Edge Function via supabase CLI behind `deno check`) → **(4)** smoke-test the live cutover and prove rollback. Cloud stays OFF throughout.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harden /callback | Replay window, fetch bounds, SSRF allowlist + tests | Edge Function has no tsc/eslint coverage — rely on `deno check` |
| 2. Provision prod (runbook) | Live Supabase + Cloudflare, all secrets, cloud OFF | Silent DB-webhook no-op if settings unset; interactive steps need you |
| 3. CI deploy pipeline | App + Edge Function deploy on master | `verify_jwt` must stay false; PRs must not deploy |
| 4. Go-live + cutover | Verified live app, rollback proven | 10ms CPU 1102 under login spikes (→ $5 plan if seen) |

**Prerequisites:** S-04 (done). Cloudflare account, Supabase account, Replicate token (you provision). Interactive logins run by you via the `!` prefix.
**Estimated effort:** ~2–3 sessions across 4 phases (Phase 1 code is the bulk; Phases 2/4 are guided runbooks).

## Open Risks & Assumptions

- DB-webhook settings unset → queued jobs silently never enqueue (harmless while cloud OFF, but must be set before the eventual flip-ON).
- `wrangler rollback` reverts only Worker + assets, not migrations / Edge Function — those revert independently.
- Built-in Supabase email sender (~2–4/hr cap) is the accepted MVP constraint; custom SMTP is parked.

## Success Criteria (Summary)

- Public URL: anon Local engine works; full auth lifecycle incl. password reset resolves on the prod domain.
- A cloud submit stays `queued` with a logged `cloud_pipeline_disabled` no-op and zero Replicate spend.
- CI deploys app + Edge Function on master; one `wrangler rollback` performed and re-deploy forward confirmed.
