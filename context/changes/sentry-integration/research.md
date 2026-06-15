---
date: 2026-06-15T22:42:22+0200
researcher: Piotr Miller
git_commit: dd55e603a48aed3ce4062f828fa2da037b48d5f3
branch: master
repository: Piotr-Miller/lumina-clean-ai
topic: "Sentry error-tracking integration for Astro 6 (workerd) + Deno Edge Function"
tags: [research, codebase, sentry, observability, cloudflare-workers, deno, secrets, pii]
status: complete
last_updated: 2026-06-15
last_updated_by: Piotr Miller
---

# Research: Sentry integration (Astro 6 / workerd + Deno Edge Function)

**Date**: 2026-06-15T22:42:22+0200
**Researcher**: Piotr Miller
**Git Commit**: dd55e603a48aed3ce4062f828fa2da037b48d5f3
**Branch**: master
**Repository**: Piotr-Miller/lumina-clean-ai

## Research Question

How do we add Sentry error tracking (+ light tracing) to this Astro 6 SSR app on the `@astrojs/cloudflare` (workerd) runtime **and** the separate Supabase `enhance` Edge Function (Deno) — which SDKs, how to wire them on workerd, how secrets/config flow, and what privacy/quota constraints bound what we may capture? Scope (confirmed): **App + Edge Function**, **errors + light tracing** (no replay/profiling in v1).

## Summary

**The stack is squarely on Sentry's supported "Astro on Cloudflare (Workers)" path** — Astro `6.3.1` + `@astrojs/cloudflare ^13.5.0`, and the required `nodejs_compat` flag is **already set** in `wrangler.jsonc`. The integration is well-trodden, with three deliberate wrinkles for _this_ repo:

1. **Workerd needs the custom-entry-point pattern, not auto-wrap.** For Astro 6 / adapter v13 you install **both** `@sentry/astro` (client + Vite/source-maps) and `@sentry/cloudflare` (server), create a `sentry.server.config.ts` that wraps `@astrojs/cloudflare/entrypoints/server` with `Sentry.withSentry(env => ({…}), handler)`, and repoint `wrangler.jsonc` `main` at it. (The simpler "`@sentry/astro` detects the adapter" flow is the Astro 3–5 / adapter-v12 path only.)
2. **No middleware-ordering problem.** The worker-level `withSentry` wrap sits _above_ `src/middleware.ts`, so the existing auth middleware is untouched. (The "Sentry must be the first middleware" doc note applies only to the Cloudflare **Pages** path, which we don't use.)
3. **The Edge Function is a separate runtime + separate toolchain.** Capture there is `npm:@sentry/deno` (beta), manual `Sentry.captureException`, and validated only by `deno check` + a `supabase functions serve` smoke (it's excluded from the Astro tsc/eslint graph).

Privacy is the main design constraint: the codebase already bounds error text that "can echo the signed source URL" (`MAX_ERROR_DETAIL_CHARS = 300`), enforces anti-enumeration on the auth path, and treats signed `source.*`/`result.*` URLs as private. Sentry config must mirror that: `sendDefaultPii: false` + a `beforeSend` scrub, low `tracesSampleRate` (5K errors / 5M spans free quota).

## Detailed Findings

### A. SDK selection & wiring (verified against Sentry's official Astro-on-Cloudflare guide + Context7 `/getsentry/sentry-docs`)

**Packages**

- Workerd app: `@sentry/astro` **and** `@sentry/cloudflare` (≥ 10.40.0 — the floor for the entry-point flow). One DSN serves client + server.
- Edge Function: `import * as Sentry from "npm:@sentry/deno"` (beta; Supabase Edge Runtime is Deno-based, use the `npm:` specifier).

**Files to add/change** (from the docs recipe — not yet applied):

1. **New `sentry.server.config.ts`** (repo root):
   ```ts
   import * as Sentry from "@sentry/cloudflare";
   import handler from "@astrojs/cloudflare/entrypoints/server";
   export default Sentry.withSentry(
     (env) => ({ dsn: env.SENTRY_DSN, sendDefaultPii: false, tracesSampleRate: 0.05 }),
     handler,
   );
   ```
2. **New `sentry.client.config.ts`** (repo root): `Sentry.init({ dsn: import.meta.env.PUBLIC_SENTRY_DSN, sendDefaultPii: false, tracesSampleRate: 0.05, integrations: [Sentry.browserTracingIntegration()] })`.
3. **`astro.config.mjs`** (`astro.config.mjs:12`): add `sentry({ org, project, authToken: process.env.SENTRY_AUTH_TOKEN })` to the `integrations` array (currently `[react(), sitemap()]`). The Astro integration wraps `@sentry/vite-plugin` — do **not** add `sentryVitePlugin` separately.
4. **`wrangler.jsonc`**: change `main` to `"./sentry.server.config.ts"` (currently the adapter's default entrypoint). **`nodejs_compat` already present (`wrangler.jsonc:6`) — no flag change.**
5. **`supabase/functions/enhance/index.ts`**: `Sentry.init({ dsn, sendDefaultPii:false, beforeSend, tracesSampleRate })` at top + `Sentry.captureException(e)` in catch blocks.
6. **`src/middleware.ts`** — **no change** (worker wrap is above it).

**Compatibility verdict:** Astro 6 + adapter v13 are listed as supported prerequisites. `nodejs_compat` is required (SDK uses `AsyncLocalStorage`) and present. **`nodejs_als` is NOT needed** — no Sentry doc mentions it; `nodejs_compat` suffices. **`disable_nodejs_process_v2` interaction is UNVERIFIED** — no Sentry doc addresses it; it's unrelated to ALS (it concerns the `process` polyfill), so likely benign — verify with a `wrangler dev` smoke and watch for `process`-related runtime errors.

### B. Error-capture surfaces (current handling — where Sentry calls would go)

Map of surfaces and how they handle errors today (so the plan can decide capture-vs-leave-log-only):

- **API handler cores** (`{ error: { code, message } }` envelope, 500 on unexpected):
  - `src/lib/services/cloud-create-job.handler.ts:124-128` — outer catch → `console.error` + 500. Inner best-effort sweep catch at `:91-99` (`console.warn`, swallowed).
  - `src/lib/services/timeout.handler.ts:94-97` — outer catch → `console.error` + 500.
  - `src/lib/services/reset-password.handler.ts:65-68,74-80` — **anti-enumeration**: `console.error` server-side, neutral message to user, **never** `error.message` in the response. ⚠️ Capture must not undo this (no email-existence/raw-message leakage).
- **API route env guards**: `create-job.ts:20`, `timeout.ts:21` — `console.error` + 500 on missing admin env.
- **Service layer** (`src/lib/services/photo-job.service.ts`): throwers with contextual prefixes (`createPhotoJob:81,92`, `countCloudJobsToday:130`, `markJob*`, `createSignedReadUrl:520`) and **best-effort swallows** that only `console.warn` — `bestEffortRemove:45-46`, `sweepStalePendingJobsForOwner:397-403`, `sweepAbandonedSourcesGlobally:460-468,496-500`. These swallow sites are the natural "should we Sentry this?" candidates.
- **Edge Function** (`supabase/functions/enhance/index.ts`): structured envelopes; catches at `handleStart:268-278` (→500, best-effort `markJobFailed` swallow) and `handleCallback:462-481` (→200 ack to Replicate, best-effort cleanup + `markJobFailed`). `console.warn` at replay-guard `:357`, prediction-id cross-check `:396`. These are the highest-value captures (churniest file; silent-stall history).
- **Client hooks**: `useCloudSubmit.ts:52-54` (catch→setError), `useLocalEnhance.ts:107-109` (catch→generic message), `useCloudJob.ts` — realtime `console.warn` at `:266`, best-effort timeout `fetch().catch` at `:163-171`, result-load catch at `:320-322`. Browser-side captures via the client SDK.
- **No-capture zones** (pure, fail-safe by design — leave alone): `bread.ts`, `replicate-webhook.ts` (verification returns `false`), `cloud-job-decisions.ts`.

### C. Secrets & config flow (where Sentry's DSN + auth token go)

- **`astro.config.mjs` `env.schema`** (`astro.config.mjs:17-30`) declares all server-secret vars (`SUPABASE_URL/KEY/SERVICE_ROLE_KEY`, `CLOUD_PIPELINE_ENABLED`, `CLOUD_DAILY_CAP`). Add:
  - `SENTRY_DSN` — `context:"server", access:"secret"` (read in the entry point via the workerd `env` object).
  - `PUBLIC_SENTRY_DSN` — client; Astro only exposes `PUBLIC_`-prefixed vars to the browser. **Same DSN value** as server; DSNs are public-by-design (shipping it to the client is expected).
- **`SENTRY_AUTH_TOKEN`** — build-time only (source-map upload). Add as a **GitHub repo secret** and inject in the **`deploy` job's `env:` block** (`.github/workflows/ci.yml:321-323`, where `SUPABASE_URL/KEY` already are) — the build runs there via `preCommands: npm run build` (`ci.yml:319`). ⚠️ Vite does **not** auto-load `.env` into `process.env` at config-eval time, so the token must be in the real shell/CI env (or `.env.sentry-build-plugin`).
- **Local dev**: `.dev.vars` (workerd reads this, NOT `.env`) gets `SENTRY_DSN`; `.env`/`.env.example` documents it for Node/Vite. `astro:env/server` is the virtual module the app imports (`src/lib/supabase.ts:3`).
- **Three secret flows stay distinct** (lessons.md): build-time GitHub-secret env (baked into the SSR bundle) vs Worker runtime secrets (`wrangler secret put`, persist across deploys) vs `astro:env/server` (build-time inlined). The Sentry **auth token = build-time**; the **DSN** is build-baked (client) / env-read (server entry point).

### D. Edge Function (Deno) specifics

- `supabase/functions/enhance/index.ts` is **excluded from the Astro tsconfig + eslint graph** — adding `@sentry/deno` there gets **no** static coverage from `npm run lint`/`astro check`. Validate via `deno check supabase/functions/enhance/index.ts` + a `supabase functions serve enhance` smoke (lessons.md).
- Deno SDK is **beta** — capture is manual (`Sentry.captureException`), not auto-instrumented. Same `sendDefaultPii:false` + `beforeSend` scrub as the app.
- Deploy is a separate step (`ci.yml:328`, `supabase functions deploy enhance`); the function's `SENTRY_DSN` is a Supabase Edge **secret** (`supabase secrets set`), not a Worker secret.

## Code References

- `astro.config.mjs:11-30` — `output:"server"`, `cloudflare()` adapter, `integrations:[react(),sitemap()]`, full `env.schema`.
- `wrangler.jsonc:5-14` — `compatibility_date 2026-05-08`, `compatibility_flags:["nodejs_compat","disable_nodejs_process_v2"]`, assets, `observability.enabled:true`.
- `src/lib/supabase.ts:3` — the `astro:env/server` import pattern (Lesson #4 reference point).
- `src/lib/services/cloud-create-job.handler.ts:124-128` / `timeout.handler.ts:94-97` — API outer-catch 500 pattern.
- `src/lib/services/reset-password.handler.ts:65-80` — anti-enumeration capture constraint.
- `src/lib/services/photo-job.service.ts:45-46,397-403,460-500` — best-effort `console.warn` swallow sites (capture candidates).
- `supabase/functions/enhance/index.ts:62-64` — `MAX_ERROR_DETAIL_CHARS=300` ("body can echo the signed source URL"); catches at `:268-278`, `:462-481`.
- `src/components/hooks/useCloudJob.ts:163-171,266,320-322` — client-side best-effort + realtime + result-load error sites.
- `.github/workflows/ci.yml:319-323,328` — deploy build env injection + Edge Function deploy (where SENTRY_AUTH_TOKEN / Edge DSN go).

## Architecture Insights

- **Custom-entry-point > middleware**: on workerd the whole fetch handler is wrapped, so request isolation/async context is established before Astro routing — cleaner than middleware and zero-touch to `src/middleware.ts`.
- **One project, one DSN** covers browser + worker SSR; the Deno function can share the same DSN or a separate Sentry project (org-wide quota either way). Decision deferred to plan.
- **Error-envelope uniformity** (`{ error: { code, message } }`) already gives a clean tagging axis (`error.code`) for Sentry events.
- **Privacy posture is pre-existing and strict** — the integration inherits it (scrub signed URLs, no `error.message` on auth, bound bodies), rather than inventing new rules.

## Historical Context (from prior changes / lessons)

- `roadmap.md:69` (Baseline → Observability): _"partial … no app-level logging or error-tracking library"_ — this is the exact gap Sentry closes. **Net-new** work: no Sentry item in `github-issues.md`, roadmap Parked, or Backlog Handoff.
- `lessons.md:103-108` — build-time env ≠ runtime Worker secrets; verify which project the live app talks to. Applies to any runtime Sentry secret.
- `lessons.md:96-100` — `wrangler secret put` needs an existing deployed Worker (moot — prod Worker exists); GitHub repo secrets have no such dependency.
- `lessons.md:26-31` (Lesson #4) — a server-init helper imported by tests must not statically import `astro:env/server`. The entry-point file isn't test-imported, so it's fine; keep any shared Sentry-config helper env-injected.
- `lessons.md:68-73` — `supabase/functions/**` excluded from the Astro graph → `deno check` + serve smoke for the Edge Function capture.
- `lessons.md:40-45` + roadmap Parked **issue #15** (`roadmap.md:266`) — don't touch `run_worker_first`/`overrides.vite`; a known `npm run dev` SSR re-optimizer crash ("more than one copy of React") exists — verify the new Vite integration against **both** `npm run dev` and `npm run build && npx wrangler dev`.
- `context/archive/2026-06-15-reset-password-send-failure-surfacing/` — anti-enumeration precedent: no `error.message` pass-through on the auth path; Sentry must respect this.
- **Mutation-testing tie-in** (CLAUDE.md): the capture candidates in `photo-job.service.ts` + `enhance/index.ts` are test-plan §4 risk modules → `/10x-impl-review` may fire scoped Stryker on them if touched.

## Related Research

- None prior on observability/Sentry. Adjacent: `context/archive/2026-06-07-cloud-flip-on-revalidation/` (config-only failure modes that Sentry would have surfaced earlier — silent stalls from wrong signing secret / missing `EDGE_FUNCTION_URL`).

## Open Questions

1. **One Sentry project or two** (app vs Edge Function)? Same DSN works for app client+server; the Deno function could share or get its own project. Free Developer is 1 user but quota is org-wide — likely one project, environment-tagged (`production`/`preview`).
2. **Capture the best-effort swallow sites** (`sweep*`, `bestEffortRemove`, `markJobFailed` swallows) or leave them log-only? They're intentionally non-fatal; capturing as warnings (not errors) may be the right call to avoid quota burn + alert noise.
3. **`disable_nodejs_process_v2` × Sentry** — unverified; confirm with a `wrangler dev` smoke before trusting prod.
4. **Source-map upload in CI** — confirm `@sentry/astro` uploads during `astro build` (it should, via the wrapped vite-plugin) so only the build-env token is needed; decide whether to also delete emitted maps from `dist` (the integration handles cleanup by default).
5. **Auth-path capture policy** — exclude `/api/auth/*` from capture entirely, or capture with an aggressive scrub? (Enumeration + credential-stuffing surface.)
6. **Release/versioning** — ≥10.35 auto-detects release via `CF_VERSION_METADATA`; confirm the binding is available or pass `release` explicitly.
7. **Deno SDK beta risk** — acceptable for the Edge Function? Fallback is manual `fetch` to Sentry's store endpoint if the SDK misbehaves on Supabase Edge Runtime.
