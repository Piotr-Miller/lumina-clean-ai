---
change_id: sentry-integration
title: Integrate Sentry error tracking (Astro 6 + Cloudflare Workers)
status: impl_reviewed
created: 2026-06-15
updated: 2026-06-17
archived_at: null
---

## Notes

Add Sentry error tracking to the app. Closes the baseline gap the roadmap notes under **Observability** ("partial — platform-level `observability.enabled` is set; no app-level logging or error-tracking library").

### Context (from the discussion that produced this change)

- **Plan/tier:** Sentry's free **Developer** plan is permanent (not just a trial) — a new account starts on a 14-day Business trial that auto-reverts to Developer. Developer free limits (2026): 1 user, 5K errors/mo, 5M spans, 50 replays, 5GB logs, 1 cron + 1 uptime monitor, ~30-day retention. Sufficient for the MVP; the only real constraint is **1 user** (solo). Account already created.
- **Runtime constraint (the load-bearing research question):** the app is **Astro 6 SSR on `@astrojs/cloudflare` (workerd)**, not Node. Sentry integration must work in the Worker runtime — likely `@sentry/astro` for the client/SSR + `@sentry/cloudflare` for the Worker, with care around the workerd request lifecycle (`Sentry.withSentry` / the Cloudflare handler wrapper), source maps upload at build, and the existing `wrangler.jsonc` (`disable_nodejs_process_v2`, `observability.enabled`). Verify exact SDK + setup against current docs (Context7) — Node-oriented Sentry guides won't match workerd.
- **Secrets/config:** Sentry DSN (public, client-safe) + auth token for source-map upload (build-time secret, GitHub Actions + `.dev.vars`/wrangler). Mind the project's secrets pattern and the "Worker runtime secrets vs CI build-time env" lesson.

### Open considerations for planning

- Where to capture: client islands (React 19), Astro SSR, the **Supabase Edge Function** (`enhance` — Deno runtime, separate from the Astro graph; may need `@sentry/deno` or manual capture), and API routes.
- PII/privacy: scrub source image URLs, signed URLs, emails, and auth tokens from events (we already bound error text elsewhere; mirror that discipline). Don't let Sentry breadcrumbs capture the private `source.*` signed URLs.
- Sampling/quota: 5K errors/mo free cap — set sensible `sampleRate` / `tracesSampleRate` and filtering so a noisy bug doesn't burn the monthly quota.
- Tie-in with the existing swallowed-error discipline (e.g. the best-effort `console.warn`/`console.error` sites in `photo-job.service.ts`, `enhance/index.ts`) — decide which deserve a Sentry capture vs staying log-only.
- Scope guard: error tracking only (+ maybe lightweight tracing). NOT session replay / profiling / cron+uptime monitors in v1 unless cheap.

Likely post-MVP / observability hardening (MVP scope was delivered 2026-06-08), but low-risk and additive.

### Runtime prerequisites (out-of-band, additive — none block the build/deploy)

- **Worker (app):** `SENTRY_DSN` + `PUBLIC_SENTRY_DSN` (same DSN value) and `PUBLIC_SENTRY_ENVIRONMENT` (set to `production` in prod) — local in `.dev.vars`, prod via `wrangler secret put` / GitHub build env. `SENTRY_AUTH_TOKEN` (source-map upload) is Phase 3, CI-only.
- **Edge Function (`enhance`, Deno):** `SENTRY_DSN` is a **Supabase Edge secret** (`supabase secrets set SENTRY_DSN=…`), NOT a Worker secret — same project/DSN as the app. Optional `SENTRY_ENVIRONMENT` (defaults to `development`; set `production` for the prod project). Local: `supabase/functions/.env` (gitignored). DSN absent → the Deno SDK no-ops, so capture degrades gracefully.
