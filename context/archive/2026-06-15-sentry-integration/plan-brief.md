# Sentry Integration — Plan Brief

> Full plan: `context/changes/sentry-integration/plan.md`
> Research: `context/changes/sentry-integration/research.md`

## What & Why

Add Sentry error tracking + light (~5%) tracing to the app across two runtimes — the Astro 6 SSR app on `@astrojs/cloudflare` (workerd) and the Deno `enhance` Edge Function — reporting to one env-tagged Sentry project. Closes the roadmap **Observability** baseline gap ("partial — no app-level logging or error-tracking library"); the silent stalls that motivated past config-failure debugging would have surfaced here first.

## Starting Point

No error tracking today — only `console.*` logs + platform `observability.enabled`. The Worker runs the adapter's default entry point (`wrangler.jsonc:4`); `astro.config.mjs` has no Sentry vars; the Edge Function is a separate Deno toolchain outside the Astro tsc/eslint graph. A strict privacy posture already exists (no PII, bounded error bodies, anti-enumeration auth path) that the integration must inherit.

## Desired End State

An unhandled error in the browser, the SSR worker, or the Edge Function lands as one issue in Sentry — env+runtime-tagged, source-mapped (readable trace), and scrubbed of all PII (no emails, no `error.message` on auth, no signed `source.*`/`result.*` URLs). The app still boots cleanly under both `npm run dev` and `wrangler dev`.

## Key Decisions Made

| Decision             | Choice                                                                                              | Why (1 sentence)                                                                 | Source   |
| -------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| SDK wiring (workerd) | Custom entry-point: `@sentry/astro` + `@sentry/cloudflare`, wrap adapter entrypoint, repoint `main` | The only supported path for Astro 6 / adapter v13 — auto-detect is the v12 path  | Research |
| Project topology     | One project, env+runtime tagged                                                                     | Simplest on 1-user Developer plan; quota is org-wide regardless                  | Plan     |
| Capture scope        | Edge + fatal as errors; intentional swallows as **warnings**                                        | High-value signal without alert noise or quota burn; preserves swallow-by-design | Plan     |
| Auth-path policy     | Capture server-side with **hard scrub**                                                             | Keeps auth-bug visibility while guaranteeing anti-enumeration                    | Plan     |
| Edge SDK             | `npm:@sentry/deno` (beta), manual capture                                                           | Proper SDK with least code; serve smoke de-risks beta                            | Plan     |
| Tracing              | Light, `tracesSampleRate ~0.05`                                                                     | Latency signal on the async pipeline without threatening span quota              | Plan     |
| Phasing              | App (verify) → Edge → capture-tuning                                                                | Clears the workerd entry-point + dev-crash landmines before widening surface     | Plan     |

## Scope

**In scope:** error capture (browser + SSR worker + Edge), light tracing, env/runtime tagging, PII scrub, source-map upload, release versioning.

**Out of scope:** Session Replay, Profiling, Cron/Uptime monitors, a second Sentry project, any `src/middleware.ts` change, `run_worker_first`/`overrides.vite` changes, capture in pure/fail-safe modules.

## Architecture / Approach

A custom worker entry (`sentry.server.config.ts`) wraps `@astrojs/cloudflare/entrypoints/server` with `Sentry.withSentry(env => ({...}), handler)` — request scope established above `src/middleware.ts`, untouched. The browser is initialized via `sentry.client.config.ts` + the `@sentry/astro` integration (which also handles source maps). The Edge Function initializes `@sentry/deno` independently and captures manually. One shared scrub passes through a **unified privacy lens** — applied via both `beforeSend` (errors) and `beforeSendTransaction` (spans) in all three inits, covering event body, request fields, transactions, and breadcrumbs. The same DSN serves client/server, a Supabase Edge secret serves the function, and a build-time `SENTRY_AUTH_TOKEN` drives app source-map upload in CI (Edge maps out of scope).

## Phases at a Glance

| Phase                       | What it delivers                                                               | Key risk                                                                     |
| --------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1. App wiring + verify      | Browser + SSR capture, entry-point swap, DSN env, baseline scrub               | `disable_nodejs_process_v2` × Sentry (unverified); React-dup dev crash (#15) |
| 2. Edge capture             | `@sentry/deno` init + manual captures in `enhance`                             | Beta SDK on Supabase Edge Runtime                                            |
| 3. Policy + scrub + CI maps | Swallows-as-warnings, auth hard-scrub, shared URL scrub, source maps + release | Scrub correctness (PII leak if incomplete); CI token plumbing                |

**Prerequisites:** Sentry account (exists, Developer plan); ability to set a GitHub repo secret (`SENTRY_AUTH_TOKEN`) and a Supabase Edge secret (`SENTRY_DSN`) out-of-band.
**Estimated effort:** ~2–3 sessions across 3 phases (Phase 1 carries the verification risk; 2–3 are smaller).

## Open Risks & Assumptions

- `disable_nodejs_process_v2` interaction with Sentry is unverified — confirmed by a `wrangler dev` smoke in Phase 1; fallback is to drop the flag if it conflicts.
- `@sentry/deno` is beta — acceptable, with a manual-`fetch` fallback if it misbehaves on the Edge runtime.
- Source-map upload assumes `@sentry/astro` uploads during `astro build` with only the build-env token (it should).
- Scrub completeness is the privacy-critical assumption — it must span event body, request fields, transactions/spans (`beforeSendTransaction`, not just `beforeSend`), and breadcrumbs; unit-tested in Phase 3, manually verified with a signed-URL-bearing error AND a client span.

## Success Criteria (Summary)

- A deliberate error in each runtime appears in Sentry: env+runtime-tagged, source-mapped, PII-free.
- Auth-path errors are captured server-side with no email / no `error.message`, client response unchanged.
- The app boots under both `npm run dev` and `wrangler dev` with no regression from the entry-point swap.
