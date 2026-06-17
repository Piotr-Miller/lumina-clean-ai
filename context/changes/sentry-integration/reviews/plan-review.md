<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Sentry Integration (Astro 6 / workerd + Deno Edge Function)

- **Plan**: context/changes/sentry-integration/plan.md
- **Mode**: Deep
- **Date**: 2026-06-16
- **Verdict**: REVISE → **SOUND after fixes** (all 4 findings fixed in plan, 2026-06-16)
- **Findings**: 1 critical, 2 warnings, 1 observation — all FIXED

## Verdicts

| Dimension             | Verdict (initial) | After fixes |
| --------------------- | ----------------- | ----------- |
| End-State Alignment   | WARNING           | PASS        |
| Lean Execution        | PASS              | PASS        |
| Architectural Fitness | PASS              | PASS        |
| Blind Spots           | FAIL              | PASS        |
| Plan Completeness     | PASS              | PASS        |

## Grounding

8/8 paths ✓, 4/4 npm scripts ✓ (`test:unit`/`typecheck`/`lint`/`build`), swallow-site symbols ✓ (`bestEffortRemove`, `sweepStalePendingJobsForOwner`, `sweepAbandonedSourcesGlobally`), brief↔plan ✓. No `docs/reference/contract-surfaces.md` (check skipped). No existing Sentry deps; `astro@^6.3.1` + `@astrojs/cloudflare@^13.5.0` match plan prerequisites.

Deep verification (sub-agent + Context7):

- Entry-point pattern matches the official Sentry Astro-on-Cloudflare recipe exactly; `@astrojs/cloudflare/entrypoints/server` has a default export; no existing `sentry.server.config.ts`/`sentry.client.config.ts`; no code/test references `wrangler.jsonc` `main` (blast radius = the one config line).
- Edge catch sites confirmed (`handleStart` 268-279 → 500; `handleCallback` 462-482 → 200 ack); `MAX_ERROR_DETAIL_CHARS = 300` at line 64 (comment notes "body can echo the signed source URL").
- Auth anti-enumeration catch confirmed (`reset-password.handler.ts:75-81`: `console.error(error.message)` server-side, neutral `SEND_FAILURE_MESSAGE` to client).
- Client signed-URL exposure confirmed: `useCloudJob.ts:306-308` mints a signed `result.*` URL → `cloud-result.client.ts:48` `fetch(afterUrl)`.
- No existing observability/Sentry helper (no duplication risk for `sentry-scrub.ts`).
- Context7: `beforeSend` filters error/message events only (not transactions); `sendDefaultPii:false` suppresses cookies+IP but RequestData still captures `url`/`query_string`/`headers`/`data` by default.

## Findings

### F1 — Tracing data bypasses beforeSend; signed URLs leak via spans

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 #2/#3 (tracing enabled) + Phase 3 #1 (scrub = `beforeSend` only)
- **Detail**: The plan's sole privacy seam is `beforeSend` (Phase 3 #1). Per Sentry docs (Context7), `beforeSend` runs on error/message events only — NOT transaction (tracing) events, which need `beforeSendTransaction`. Tracing is enabled at 5% on both client and server (Phase 1 #2/#3). Verified: the browser fetches a signed `result.*` URL (`useCloudJob.ts:306-308` → `cloud-result.client.ts:48`), so the http client span carries the full token query string, unscrubbed by `beforeSend`. Violates the stated "no signed `source.*`/`result.*` URLs" invariant. Phases 1-2 ship tracing-on with only a "minimal beforeSend," so the leak exists from first deploy.
- **Fix A ⭐ Recommended**: Add a `beforeSendTransaction` scrub alongside `beforeSend` in all three inits (mirror the URL redaction).
  - Strength: Keeps the latency signal tracing was chosen for; closes the leak at the event type Sentry uses for spans; documented hook.
  - Tradeoff: Scrub lives in two hooks × runtimes; span URLs hide in several fields (span description, data, breadcrumbs), not just `http.url`.
  - Confidence: HIGH — Sentry docs confirm `beforeSend` excludes transactions.
  - Blind spot: client resource/navigation spans may carry URLs in fields beyond `http.url` — needs one real client-trace check.
- **Fix B**: Disable client-side tracing in v1 (client errors-only; keep server tracing with `beforeSendTransaction`).
  - Strength: Removes the largest unscrubbed-span surface (the confirmed signed `result.*` fetch) with the least scrub complexity.
  - Tradeoff: Loses client perf/latency + web-vitals visibility.
  - Confidence: HIGH — eliminates the client transaction stream entirely.
  - Blind spot: server transactions still need `beforeSendTransaction`, so B is incomplete unless paired with a server-side span scrub.
- **Decision**: FIXED (Fix A) — added `beforeSendTransaction` alongside `beforeSend` in all three inits (Phase 1 #2 placeholder + Phase 3 #1 contract), new SC/Progress 3.10, shared-scrub unit test now exercises transaction shape.

### F2 — Scrub spec targets storage URLs, not request url/query/headers/data

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 #1 (scrub contract)
- **Detail**: Context7: with `sendDefaultPii:false`, cookies + IP are suppressed (good — `sb-*` auth cookie safe), but the RequestData integration still captures request `url`, `query_string`, `headers`, and `data` by default. The plan's scrub contract names only "URL query/signature params on Supabase storage URLs, email, auth tokens" — not the request envelope fields, where a signed URL or sensitive param can also ride (on error events too).
- **Fix**: Broaden the Phase 3 #1 scrub contract to explicitly redact `request.url` / `query_string` / `headers` / `data`, and/or tighten `requestDataIntegration({ include: {...} })`. Name these fields so implementer + unit test cover them, not just storage URLs.
- **Decision**: FIXED (Fix in plan) — added "Request-envelope coverage" paragraph to Phase 3 #1 (redact request.url/query_string/headers/data + optional requestDataIntegration include; unit test asserts request-field redaction).

### F3 — "Readable traces for all runtimes" promised, but Edge has no map upload

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State vs Phase 3 #4
- **Detail**: Desired End State says "Stack traces are readable (source maps uploaded at build)." But Phase 3 #4 uploads maps only via `@sentry/astro` during `astro build` — the app bundle. The Edge Function deploys separately (`supabase functions deploy enhance`) and gets no map upload, so Edge traces won't be source-mapped through this plan — a promise gap for one of the three runtimes.
- **Fix**: Scope the "readable/source-mapped" end-state line to the app runtimes and add a one-liner that Edge traces rely on Supabase's near-source bundle (no separate upload), or mark Edge source maps explicitly out of scope.
- **Decision**: FIXED (Fix in plan) — Desired End State now scopes readable traces to app runtimes; Edge map upload marked out of scope (also added to "What We're NOT Doing").

### F4 — Console/breadcrumb capture of error.message + email on auth path

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 #3 (auth scrub)
- **Detail**: `reset-password.handler.ts:75-81` does `console.error("...", error.message)`. Sentry's default breadcrumbs / captureConsole attach console output to later events, and an email can appear in breadcrumb messages. Capturing the cause server-side is fine (operator-only dashboard), but the scrub must cover breadcrumbs, not just the event body. The Phase 3 unit-test list already mentions breadcrumbs — good; just make the auth-scrub contract say so explicitly.
- **Fix**: State in Phase 3 #3 that the scrub redacts email/`error.message` from breadcrumbs too (confirm captureConsole breadcrumb behavior).
- **Decision**: FIXED (Fix in plan) — added "Breadcrumb coverage" to Phase 3 #3 with a breadcrumb-redaction unit test, plus a "Unified privacy lens" statement that the same scrub spans event body + request fields + transactions + breadcrumbs (per user note).
