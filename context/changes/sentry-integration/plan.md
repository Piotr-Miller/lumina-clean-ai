# Sentry Integration (Astro 6 / workerd + Deno Edge Function) Implementation Plan

## Overview

Add Sentry error tracking and light (~5%) performance tracing to the LuminaClean AI app across **two runtimes** — the Astro 6 SSR app on `@astrojs/cloudflare` (workerd) and the separate Supabase `enhance` Edge Function (Deno) — reporting to **one env-tagged Sentry project**. The integration inherits the codebase's strict privacy posture (no PII, scrub signed URLs, never leak auth `error.message`) and is sequenced app-first so the risky workerd entry-point swap and the known `npm run dev` re-optimizer crash are verified before widening surface.

This closes the roadmap **Observability** baseline gap (`roadmap.md` — "partial … no app-level logging or error-tracking library").

## Current State Analysis

- **No error tracking today.** Errors surface only as `console.error`/`console.warn` (visible in Worker tail / Supabase logs), plus `observability.enabled: true` at the platform level (`wrangler.jsonc:12-14`).
- **App entry point is the adapter default** — `wrangler.jsonc:4` `"main": "@astrojs/cloudflare/entrypoints/server"`. Sentry on workerd requires wrapping this in a custom entry file.
- **`astro.config.mjs`** (`:12`) has `integrations: [react(), sitemap()]` and an `env.schema` (`:17-30`) declaring server secrets via `astro:env`. No Sentry vars yet.
- **Compat flags present**: `["nodejs_compat", "disable_nodejs_process_v2"]` (`wrangler.jsonc:6`). `nodejs_compat` is the requirement for the SDK's `AsyncLocalStorage`; `disable_nodejs_process_v2` interaction with Sentry is **unverified**.
- **Edge Function** (`supabase/functions/enhance/index.ts`) is Deno, **excluded from the Astro tsconfig + eslint graph** — only `deno check` + a serve smoke validate it.
- **Privacy posture is pre-existing and strict**: `MAX_ERROR_DETAIL_CHARS = 300` because the body "can echo the signed source URL" (`enhance/index.ts:62-64`); anti-enumeration on `reset-password.handler.ts:65-80` (never returns `error.message`); signed `source.*`/`result.*` URLs are private.
- **CI deploy job** (`.github/workflows/ci.yml:315-331`) builds via `preCommands: npm run build` with an `env:` block currently carrying only `SUPABASE_URL`/`SUPABASE_KEY`; Edge Function deploys separately (`:328`).
- **Known landmine**: parked issue #15 — a `npm run dev` SSR re-optimizer crash ("more than one copy of React"); any new Vite plugin must be verified against both `npm run dev` and `npm run build && npx wrangler dev`.

## Desired End State

When complete:

- An unhandled error in the **browser**, the **SSR worker**, or the **Edge Function** appears as an issue in one Sentry project, tagged by environment (`production`/`preview`) and runtime (`client`/`server`/`edge`).
- Events carry **no PII**: no emails, no `error.message` on auth paths, no signed `source.*`/`result.*` URLs.
- **App** stack traces (browser + SSR worker) are **readable** — source maps uploaded at `astro build`, minified frames resolved. The **Edge Function** has no separate source-map upload (it deploys via `supabase functions deploy`, not the Astro build); its traces rely on Supabase's near-source bundle. Edge source-map upload is out of scope for v1.
- Light tracing (~5%) gives latency/throughput signal on the async pipeline without threatening the free-tier span quota.
- The app still runs cleanly under both `npm run dev` and `wrangler dev` (no regression from the entry-point swap or the new Vite plugin).

**Verification**: trigger a deliberate error in each runtime → confirm a scrubbed, env+runtime-tagged, source-mapped event lands in Sentry; confirm `npm run dev` and `wrangler dev` both boot; confirm `deno check` + serve smoke pass for the Edge Function.

### Key Discoveries:

- Custom-entry-point pattern is mandatory for Astro 6 / adapter v13 (`research.md:30`, §A) — wrap `@astrojs/cloudflare/entrypoints/server` with `Sentry.withSentry(env => ({…}), handler)` and repoint `main`. The "`@sentry/astro` auto-detects the adapter" flow is the Astro 3–5 / adapter-v12 path only.
- The worker-level `withSentry` wrap sits **above** `src/middleware.ts` — auth middleware is untouched; no "Sentry must be first middleware" concern (that's the Pages path) (`research.md:31`).
- DSN is public-by-design; the **same DSN value** serves server (`SENTRY_DSN`, env-read in the entry point) and client (`PUBLIC_SENTRY_DSN`, `PUBLIC_`-prefixed for browser exposure) (`research.md:79-80`).
- `SENTRY_AUTH_TOKEN` is **build-time only** and must be in the real CI/shell env (Vite does not auto-load `.env` into `process.env` at config-eval) (`research.md:81`).
- Three secret flows stay distinct (lessons.md): build-time GitHub env vs Worker runtime secret vs `astro:env/server`. Auth token = build-time; DSN = build-baked (client) / env-read (server).
- A server-init helper imported by tests must not statically import `astro:env/server` (Lesson #4); the entry-point file isn't test-imported, so it's safe — keep any shared Sentry-config helper env-injected (`research.md:115`).
- Edge Function `SENTRY_DSN` is a **Supabase Edge secret** (`supabase secrets set`), not a Worker secret (`research.md:89`).

## What We're NOT Doing

- **No Session Replay, no Profiling, no Cron/Uptime monitors** in v1 (scope: errors + light tracing only).
- **No changes to `src/middleware.ts`** — the worker wrap sits above it.
- **No touching `run_worker_first` / `overrides.vite`** (parked issue #15 territory).
- **No second Sentry project** — one env-tagged project (1-user Developer plan; quota is org-wide anyway).
- **No capture in pure/fail-safe modules** — `bread.ts`, `replicate-webhook.ts`, `cloud-job-decisions.ts` stay untouched (`research.md:74`).
- **No capturing every swallow as an error** — intentional non-fatal swallows become **warnings**, not errors.
- **No client-response changes** — auth responses stay neutral; capture is server-side only.
- **No separate source-map upload for the Edge Function** — only the app bundle gets maps via `astro build`; Edge traces rely on Supabase's near-source bundle.

## Implementation Approach

Three phases, each independently verifiable, in dependency order:

1. **App SDK wiring + verification** — get the app capturing on both runtimes-of-the-app (browser + SSR worker) with a baseline scrub, and clear the two landmines (`disable_nodejs_process_v2`, React-dup dev crash) before anything else builds on the entry-point swap.
2. **Edge Function capture** — add the Deno SDK and manual captures to the highest-value target (the churny `enhance` file with silent-stall history), validated by its separate toolchain.
3. **Capture policy + privacy hardening + CI source maps** — tune _what_ gets captured (swallows-as-warnings, auth hard-scrub), finalize the shared `beforeSend` URL scrub, and wire source-map upload + release versioning in CI.

A single shared scrubbing concept is authored once and applied in each runtime's init (the app server config, the client config, and the Deno init) via **both** `beforeSend` (error/message events) **and** `beforeSendTransaction` (tracing/span events) — Sentry runs `beforeSend` on error events only, so transactions need their own hook or signed URLs in spans bypass the scrub. It is the privacy seam; Phase 3 finalizes it. Phases 1–2 set `sendDefaultPii: false`, keep tracing disabled, and use a minimal request URL scrub for error events so signed URLs are not shipped in spans before the full scrub exists.

## Critical Implementation Details

- **Timing & lifecycle** — the workerd entry point must `export default Sentry.withSentry((env) => ({...}), handler)` where `handler` is the imported adapter entrypoint; this establishes request isolation/async context _before_ Astro routing. Repointing `wrangler.jsonc` `main` and creating the file must land together or the build breaks.
- **Debug & observability** — `disable_nodejs_process_v2` is unverified against Sentry (concerns the `process` polyfill, unrelated to `AsyncLocalStorage`, so likely benign). Verification is a `wrangler dev` smoke watching for `process`-related runtime errors; if it breaks, the fallback is to drop the flag (it is not load-bearing for current code) — but only after confirming nothing else depends on it.
- **User experience spec** — auth-path captures must never alter the neutral client response. The scrub happens in `beforeSend` (server-side event), not in the handler's return value; the handler keeps returning the existing neutral envelope.

---

## Phase 1: App SDK wiring + verification

### Overview

Install the app SDKs, create the Sentry config files, repoint the worker entry point, declare the DSN env vars, and verify the app boots and captures errors on both browser and SSR worker — clearing the two known landmines. Baseline privacy (`sendDefaultPii: false` + minimal scrub) is set here; full policy is Phase 3.

### Changes Required:

#### 1. SDK dependencies

**File**: `package.json`

**Intent**: Add the two app-side Sentry packages so the client/build and server wiring are available.

**Contract**: Add `@sentry/astro` and `@sentry/cloudflare` (≥ 10.40.0 — the floor for the entry-point flow) to `dependencies`. No other dependency changes.

#### 2. Server entry point (workerd wrap)

**File**: `sentry.server.config.ts` (new, repo root)

**Intent**: Wrap the Cloudflare adapter's server entrypoint with Sentry so the whole fetch handler runs inside a Sentry request scope on workerd.

**Contract**: Default-exports `Sentry.withSentry((env) => ({ dsn: env.SENTRY_DSN, sendDefaultPii: false, tracesSampleRate: 0, environment: <resolved>, ... }), handler)` where `handler` is the default import from `@astrojs/cloudflare/entrypoints/server`. DSN is read from the workerd `env` object (not `astro:env`). Set a `server`/runtime tag. Minimal `beforeSend` drops obvious request URL fields as a placeholder for the Phase 3 shared scrub. Tracing stays disabled until that scrub covers spans and breadcrumbs.

```ts
import * as Sentry from "@sentry/cloudflare";
import handler from "@astrojs/cloudflare/entrypoints/server";

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // environment + release resolved here; beforeSend scrub finalized in Phase 3
  }),
  handler,
);
```

#### 3. Client config

**File**: `sentry.client.config.ts` (new, repo root)

**Intent**: Initialize the browser SDK so client-island errors (React 19 hooks) are captured.

**Contract**: `Sentry.init({ dsn: import.meta.env.PUBLIC_SENTRY_DSN, sendDefaultPii: false, tracesSampleRate: 0, integrations: [Sentry.browserTracingIntegration()] })`. Client `environment` tag mirrors the server. Phase 3 may raise tracing after the shared scrub covers spans and breadcrumbs.

#### 4. Astro integration + env schema

**File**: `astro.config.mjs`

**Intent**: Register the `@sentry/astro` integration (which wraps `@sentry/vite-plugin` for client init + source maps) and declare the two DSN env vars in the existing `env.schema`.

**Contract**: Add `sentry({ sourceMapsUploadOptions: { org, project, authToken: process.env.SENTRY_AUTH_TOKEN } })` to `integrations` (now `[react(), sitemap(), sentry()]`). Do **not** add `sentryVitePlugin` separately. In `env.schema` add `SENTRY_DSN` (`context: "server", access: "secret", optional: true`) and `PUBLIC_SENTRY_DSN` (`context: "client", access: "public", optional: true`). Source-map auth-token wiring is finalized in Phase 3 — in Phase 1 it may be absent (uploads simply skip locally).

#### 5. Worker entry repoint

**File**: `wrangler.jsonc`

**Intent**: Point the Worker at the new Sentry-wrapped entry instead of the adapter default.

**Contract**: Change `main` from `"@astrojs/cloudflare/entrypoints/server"` to `"./sentry.server.config.ts"`. No compat-flag changes. Must land in the same change as file #2.

#### 6. Local + documented env

**File**: `.dev.vars` (local, gitignored), `.env.example`

**Intent**: Provide the DSN for local workerd dev and document it for Node/Vite.

**Contract**: `.dev.vars` gets `SENTRY_DSN=` (workerd reads `.dev.vars`, not `.env`). `.env.example` documents `SENTRY_DSN` and `PUBLIC_SENTRY_DSN` (same value). No real secret committed.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Production build succeeds (SSR + source-map step does not error): `npm run build`
- Unit tests pass: `npm run test:unit`

#### Manual Verification:

- App boots and the homepage React island hydrates under **`wrangler dev`** (production/build parity). ADAPTATION: plain `npm run dev` hits the known **dev-only** #15 "more than one copy of React" re-optimizer crash, now aggravated by the `@sentry/astro` Vite plugin — production/build is unaffected (verified via `wrangler dev`); see lessons.md.
- `npm run build && npx wrangler dev` boots with no `process`-related runtime error (`disable_nodejs_process_v2` × Sentry smoke).
- A deliberately thrown SSR error appears in Sentry, tagged with the correct `environment` + server runtime, with `sendDefaultPii:false` (no user PII).
- A deliberately thrown client (React island) error appears in Sentry from the browser SDK.
- Existing auth/middleware flows still work (sign in, protected redirect) — no regression from the entry-point wrap.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human (especially the two landmine smokes) before proceeding to Phase 2.

---

## Phase 2: Edge Function (Deno) capture

### Overview

Add Sentry to the `enhance` Edge Function — the highest-value capture target (churniest file, silent-stall history) — using the Deno SDK and manual capture at the existing catch sites, validated by the function's separate toolchain.

### Changes Required:

#### 1. Deno SDK init + manual captures

**File**: `supabase/functions/enhance/index.ts`

**Intent**: Initialize the Deno SDK at module load and capture exceptions at the two outer catches, so Edge failures (start + callback) become Sentry issues.

**Contract**: `import * as Sentry from "npm:@sentry/deno"` + `Sentry.init({ dsn: <Deno.env DSN>, sendDefaultPii: false, tracesSampleRate: 0, ... })` near the top. Add `Sentry.captureException(e)` in the `handleStart` catch (`:268-278`) and the `handleCallback` catch (`:462-481`), preserving existing behavior (500 / 200-ack to Replicate respectively, and the best-effort `markJobFailed`). Tag `runtime=edge`. Apply the same `sendDefaultPii:false` + minimal scrub as the app. Capture is **manual** (beta SDK, no auto-instrumentation). Tracing stays disabled until the Phase 3 shared scrub covers spans and breadcrumbs. The `console.warn` sites (replay-guard `:357`, prediction-id cross-check `:396`) are addressed in Phase 3 (warnings), not here.

#### 2. Edge secret

**File**: Supabase project config (no repo file) — documented in `change.md`/`production-config.md` as applicable

**Intent**: Provide the DSN to the Edge runtime.

**Contract**: `supabase secrets set SENTRY_DSN=…` for the project. Documented as a runtime prerequisite (mirrors the existing Edge secret pattern). Same DSN value as the app (one project).

### Success Criteria:

#### Automated Verification:

- Deno type check passes: `deno check supabase/functions/enhance/index.ts`

#### Manual Verification:

- `supabase functions serve enhance` boots with the Deno SDK initialized (no runtime error on `npm:@sentry/deno` load).
- A forced failure in the start path produces a Sentry event tagged `runtime=edge`, with no signed URL / PII in the payload.
- The existing success path and the Replicate callback path still behave identically (500 on start failure; 200 ack on callback failure; `markJobFailed` still attempted).

**Implementation Note**: After this phase and `deno check` + serve smoke pass, pause for human confirmation before Phase 3.

---

## Phase 3: Capture policy + privacy hardening + CI source maps

### Overview

Finalize _what_ gets captured and _how clean_ events are: best-effort swallows as warnings, auth-path hard scrub, the shared `beforeSend` URL scrub across both runtimes, and CI source-map upload + release versioning.

### Changes Required:

#### 1. Shared scrub (`beforeSend`)

**File**: a small shared scrub module (e.g. `src/lib/observability/sentry-scrub.ts`) + mirror in the Deno init

**Intent**: One scrubbing function that strips signed `source.*`/`result.*` URLs, emails, tokens, and bounds long strings — applied in all three inits via **both** `beforeSend` (errors) **and** `beforeSendTransaction` (spans/traces). `beforeSend` alone does not see transaction events, so without the transaction hook the confirmed client-side signed-`result.*` fetch span (`useCloudJob.ts:306-308` → `cloud-result.client.ts:48`) leaks its token query string.

> **Re-enable tracing here (Phase 1 finding F1):** Phases 1–2 ship with `tracesSampleRate: 0` (tracing OFF) because the placeholder scrub only covered the error-event request URL, not spans/breadcrumbs. This phase must set `tracesSampleRate` back to `0.05` in `sentry.server.config.ts` and `sentry.client.config.ts` **together with** the span/breadcrumb-covering shared scrub — never re-enable tracing before the scrub walks `event.spans[]`.

**Contract**: Pure function `(event) => event` reused by both hooks, redacting known-sensitive fields (URL query/signature params on Supabase storage URLs, `email`, auth tokens) — including span data/description and breadcrumbs, not just the event body — and truncating message/detail to a bound consistent with `MAX_ERROR_DETAIL_CHARS`. Must be env-free (no `astro:env/server` static import — Lesson #4) so it's safe to unit-test. The Deno function mirrors the same logic (separate runtime — cannot import app `src/`). Note: client resource/navigation spans may carry URLs in fields beyond `http.url` — verify against a real client trace.

**Request-envelope coverage**: `sendDefaultPii: false` suppresses cookies (the `sb-*` session cookie) and stops the SDK from _sending_ IP, but the server RequestData integration still captures `request.url`, `request.query_string`, `request.headers`, and `request.data` by default. The scrub must redact these request fields too (not only Supabase storage URLs), and/or tighten `requestDataIntegration({ include: { ... } })` to drop `query_string`/`headers`/`data` where not needed. The scrub unit test must assert a sensitive value in `request.query_string`/`headers` is redacted.

> **Phase 1 finding (IP backfill):** `sendDefaultPii: false` does NOT prevent Sentry's server-side IP backfill — the ingest endpoint fills `user.ip_address` from the envelope's origin IP. Verified in the Phase 1 SSR smoke: a curl request from `127.0.0.1` produced an event with `user → ip:<dev-machine egress IP>` (not read from the request; backfilled on receipt). In prod this would be Cloudflare's edge egress IP rather than the end-user's, but it's still unwanted. Phase 3 must explicitly set `user: { ip_address: null }` in `beforeSend` **and/or** disable "Store IP Addresses" in Project Settings → Security & Privacy. Add a scrub assertion that `user.ip_address` is nulled.

#### 2. Best-effort swallow sites → warnings

**File**: `src/lib/services/photo-job.service.ts` (`:45-46`, `:397-403`, `:460-500`), `supabase/functions/enhance/index.ts` (`:357`, `:396`)

**Intent**: Capture the intentional non-fatal swallow sites at **warning** level so silent degradation is visible without alert noise or quota burn.

**Contract**: At each existing `console.warn` swallow (`bestEffortRemove`, `sweepStalePendingJobsForOwner`, `sweepAbandonedSourcesGlobally`, Edge replay-guard, prediction-id cross-check), add a `Sentry.captureMessage(…, "warning")` (or `captureException` with `level: "warning"`) alongside the existing log. Keep the swallow behavior (non-fatal) unchanged.

#### 3. Auth-path hard scrub capture

**File**: `src/lib/services/reset-password.handler.ts` (`:65-80`), and the `/api/auth/*` capture policy

**Intent**: Capture real auth-path errors server-side for visibility while guaranteeing the anti-enumeration property (no email-existence/raw-message leakage).

**Contract**: Capture at the server-side catch with an aggressive scrub (no `error.message` pass-through into user-facing fields, no email, no enumeration signal) — the captured Sentry event may keep server diagnostic context, but the **client response stays the existing neutral envelope**. The scrub from change #1 covers the redaction. No new route behavior.

**Breadcrumb coverage**: `reset-password.handler.ts:75-81` does `console.error("...", error.message)`. Sentry's default console breadcrumbs (and `captureConsoleIntegration` if enabled) attach that output — which can include an email or the raw `error.message` — to whatever event fires next. The scrub must therefore redact email/`error.message` from **breadcrumbs**, not just the event body. Confirm console-breadcrumb behavior during implementation and add a unit test asserting a breadcrumb carrying an email is redacted. **Unified privacy lens**: the same scrub must apply across all four surfaces — event body, request fields (F2), spans/transactions (F1, via `beforeSendTransaction`), and breadcrumbs.

#### 4. CI source-map upload + token

**File**: `.github/workflows/ci.yml` (deploy job `env:`, `:321-323`)

**Intent**: Upload source maps during the deploy build so production stack traces are readable.

**Contract**: Add `SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}` to the `wrangler-action` `env:` block (where `SUPABASE_URL/KEY` already are) so it's present in `process.env` during `preCommands: npm run build`. Add `SENTRY_AUTH_TOKEN` as a GitHub repo secret (documented, set out-of-band). The `@sentry/astro` integration uploads during `astro build` and cleans up emitted maps by default. `org`/`project` provided to the integration (config-time, non-secret).

#### 5. Release versioning

**File**: `sentry.server.config.ts` / `sentry.client.config.ts` (init options)

**Intent**: Tag events with a release so regressions are attributable to a deploy.

**Contract**: Prefer auto-detect via `CF_VERSION_METADATA` binding (SDK ≥ 10.35); if the binding isn't available in this Worker, pass `release` explicitly (e.g. from the build commit sha). Confirm which path applies during implementation and wire the one that works.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass (incl. a scrub unit test): `npm run test:unit`
- Deno check passes: `deno check supabase/functions/enhance/index.ts`
- Build with source-map upload succeeds locally with a token present (or skips cleanly without): `npm run build`
- (Conditional) Scoped Stryker on touched §4 risk modules if `/10x-impl-review` fires it (`photo-job.service.ts`, `enhance/index.ts`): `npx stryker run --mutate "src/lib/services/photo-job.service.ts"`

#### Manual Verification:

- A production (or preview) Sentry event shows a **readable, source-mapped** stack trace.
- A forced auth-path error produces a Sentry event with **no email and no `error.message`** leakage, and the user still sees the neutral response.
- A forced signed-URL-bearing error shows the URL **redacted** in the Sentry payload.
- A captured **transaction/span** (e.g. the client trace of the signed `result.*` fetch) shows the URL **redacted** — confirms `beforeSendTransaction` scrubs spans, not just `beforeSend` on errors.
- A swallow-site trigger (e.g. a sweep failure) appears in Sentry as a **warning**, not an error, and does not change runtime behavior.
- Events carry the correct `release` tag after a deploy.

**Implementation Note**: After this phase, all automated verification passes, and manual privacy checks are confirmed, the change is ready to archive.

---

## Testing Strategy

### Unit Tests:

- Shared scrub (used by both `beforeSend` and `beforeSendTransaction`): redacts signed `source.*`/`result.*` URL params, strips email/tokens, truncates to the bound, and is a no-op on already-clean events. Exercise both an error-event shape and a transaction/span shape (span `data`/`description`). Edge cases: nested URLs in `extra`/`breadcrumbs`/span data, missing fields, very long messages.
- Existing service/handler tests still pass with the added `Sentry.capture*` calls (capture is additive, behavior unchanged).

### Integration Tests:

- No new integration tests required for capture wiring (Sentry transport is external). The RLS/integration suite must remain green (entry-point swap must not regress SSR).

### Manual Testing Steps:

1. Throw a test error in an SSR route → confirm env+runtime-tagged event in Sentry.
2. Throw a client-island error → confirm browser-SDK event.
3. Force an Edge `handleStart` failure → confirm `runtime=edge` event (after `supabase functions serve`).
4. Trigger a sweep/best-effort failure → confirm a **warning** event.
5. Force an auth-path error → confirm **no PII / no `error.message`** in the event and a neutral client response.
6. Deploy → confirm source-mapped trace + `release` tag.
7. Boot smokes: `npm run dev` (React-dup) and `wrangler dev` (`disable_nodejs_process_v2`).

## Performance Considerations

- `tracesSampleRate: 0.05` keeps span volume well under the 5M/mo free quota while giving latency signal on the async pipeline (cold boot, stalls).
- Errors are always captured (not sampled); warning-level swallow captures add volume — monitor against the 5K errors/mo cap and dial swallow captures down if noisy.
- The worker wrap adds negligible per-request overhead (async context already established by the runtime).

## Migration Notes

- **Entry-point swap is the one risky migration**: `wrangler.jsonc` `main` + `sentry.server.config.ts` must land together. Rollback = revert `main` to `@astrojs/cloudflare/entrypoints/server` and remove the config files.
- **Secrets are additive and out-of-band**: GitHub `SENTRY_AUTH_TOKEN`, Supabase Edge `SENTRY_DSN`, local `.dev.vars` — none block the build if absent (uploads/captures degrade gracefully).
- No data migration; no schema change; no RLS change.

## References

- Related research: `context/changes/sentry-integration/research.md`
- Worker entry point today: `wrangler.jsonc:4`
- Astro integrations + env schema: `astro.config.mjs:12,17-30`
- Privacy bound precedent: `supabase/functions/enhance/index.ts:62-64`
- Anti-enumeration precedent: `src/lib/services/reset-password.handler.ts:65-80`; `context/archive/2026-06-15-reset-password-send-failure-surfacing/`
- Swallow-site capture candidates: `src/lib/services/photo-job.service.ts:45-46,397-403,460-500`
- CI deploy env block: `.github/workflows/ci.yml:315-331`
- Landmine #15 (React-dup dev crash): `context/foundation/roadmap.md:266`, lessons.md:40-45

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: App SDK wiring + verification

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Production build succeeds: `npm run build`
- [x] 1.4 Unit tests pass: `npm run test:unit`

#### Manual

- [x] 1.5 App boots + island hydrates under `wrangler dev` (prod parity); npm-run-dev #15 is dev-only, documented (lessons.md) — dc25891; HTTP 200 + `astro-island`/`EnhanceWorkspace` served, and the React `SignInForm` island accepted input + submitted (hydration confirmed via 1.9)
- [x] 1.6 `wrangler dev` boots with no `process`-related error (`disable_nodejs_process_v2` smoke) — dc25891; `Ready on http://127.0.0.1:8787`, DSN bindings present, zero `process is not defined`
- [x] 1.7 Deliberate SSR error appears in Sentry, env+server-runtime tagged, no PII — dc25891; `GET /sentry-test 500` captured, event "Sentry SSR test" in Sentry (env+runtime tag + no-PII deep-check pending — see note)
- [x] 1.8 Deliberate client-island error appears via the browser SDK — dc25891; event "Sentry CLIENT test" in Sentry from the browser SDK
- [x] 1.9 Sign-in / protected-redirect still work (no entry-point-wrap regression) — dc25891; sign-in + `/dashboard` work against local Supabase under the workerd wrap (the earlier `AuthRetryableFetchError status:0` was local Supabase not running, not the wrap)

### Phase 2: Edge Function (Deno) capture

#### Automated

- [ ] 2.1 Deno type check passes: `deno check supabase/functions/enhance/index.ts`

#### Manual

- [ ] 2.2 `supabase functions serve enhance` boots with `@sentry/deno` initialized
- [ ] 2.3 Forced start-path failure produces a `runtime=edge` event, no URL/PII
- [ ] 2.4 Success path + Replicate callback path behave identically (500 / 200-ack / `markJobFailed`)

### Phase 3: Capture policy + privacy hardening + CI source maps

#### Automated

- [ ] 3.1 Type checking passes: `npm run typecheck`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Unit tests pass incl. scrub test: `npm run test:unit`
- [ ] 3.4 Deno check passes: `deno check supabase/functions/enhance/index.ts`
- [ ] 3.5 Build with source-map upload succeeds (or skips cleanly without token): `npm run build`
- [ ] 3.6 (Conditional) Scoped Stryker on touched §4 risk modules if `/10x-impl-review` fires it

#### Manual

- [ ] 3.7 Production/preview event shows a readable, source-mapped stack trace
- [ ] 3.8 Auth-path error event has no email / no `error.message`; client response stays neutral
- [ ] 3.9 Signed-URL-bearing error shows the URL redacted in the payload
- [ ] 3.10 Transaction/span (client signed-`result.*` fetch trace) shows the URL redacted (`beforeSendTransaction`)
- [ ] 3.11 Swallow-site trigger appears as a warning, behavior unchanged
- [ ] 3.12 Events carry the correct `release` tag after deploy
