# Review follow-ups: sentry-integration

Deferred items from the impl review (`reviews/impl-review.md`, 2026-06-17).

## F4 — Regenerate the Edge function deno.lock — ✅ RESOLVED (2026-06-17, PR #44)

- **Source**: impl-review F4 (OBSERVATION, reliability).
- **Done**: Deno 2.8.3 installed; `deno cache --config deno.json index.ts` regenerated
  `supabase/functions/enhance/deno.lock` with the full `npm:@sentry/deno@10.58.0` tree
  (integrity-pinned). Verified `deno check --config deno.json index.ts` passes with the lock
  present (no stale-lock re-break). Bonus: stabilizes CI — the local edge-runtime now boots
  from locked deps instead of fetching `@sentry/deno` + `deno.land/std` fresh each cold boot
  (root cause of the recent `supabase_edge_runtime` 502 health-check flakes).

## 3.7 — Source maps don't resolve in prod (client AND server)

- **Source**: manual verification 2026-06-17 (the `/sentry-verify` harness). Both runtimes
  produced **minified** stacks despite the deploy's "Uploaded files to Sentry" (33 client
  maps). Recurring deploy-log warning: `[sentry-vite-plugin] Didn't find any matching
sources for debug ID upload. Please check the sourcemaps.assets option.`
  - Client event frame: `/_astro/SentryVerifyClient.DrFOipla.js:1:634`, single-letter fns.
  - Server event frame: `chunks/sentry-verify_wVBDjGKS.mjs:45` (readable fn names — workerd
    server bundle isn't minified — but NOT mapped to `src/pages/sentry-verify.astro`).
- **Diagnosis**: debug IDs aren't being **injected into the served `@astrojs/cloudflare`
  bundles**, so events carry no debug ID to match the (successfully) uploaded maps. The maps
  upload fine; the deployed JS just doesn't reference them.
- **Attempted, INSUFFICIENT (PR #43, merged 2026-06-17)**: added to `astro.config.mjs`
  `sentry({ … sourcemaps: { assets: ["dist/**/*"], filesToDeleteAfterUpload: ["dist/**/*.map"] } })`.
  Deploy log was **unchanged** — same `Didn't find any matching sources for debug ID upload`
  warning, events still minified. The `assets` glob fixes upload discovery, not the debug-ID
  **injection** stage, which is the actual gap. The config was kept (harmless; the
  `filesToDeleteAfterUpload` is good hygiene) but it is NOT the fix.
- **Still OPEN — needs a dedicated change**: investigate `@astrojs/cloudflare` +
  `@sentry/astro` debug-ID injection (likely a vite `build.sourcemap` setting and/or the
  workerd `_worker.js` bundle needing separate handling). Validate by re-triggering a real
  error (re-add a guarded verify route) and confirming frames resolve to `*.tsx`/`*.astro`.
- **Severity**: low for an MVP — server traces already name the failing component, and the
  privacy scrub (the load-bearing part) is verified working. Quality-of-debugging only.

## 3.10 — Client result-fetch span URL redaction not verified live

- **Source**: manual verification 2026-06-17. The signed `result.*` fetch span is only
  sampled at `tracesSampleRate: 0.05`, so it's hard to force on prod; not exercised by the
  `/sentry-verify` harness (no transaction span).
- **Coverage today**: the shared scrub's span path (`beforeSendTransaction` → spans[].data /
  description / contexts.trace.data) IS unit-tested (`tests/sentry-scrub.test.ts` — the
  "transaction/span events" case). So the redaction logic is proven; only the live wiring is
  unconfirmed.
- **Action**: confirm opportunistically on the next real cloud job whose client trace gets
  sampled (look for an `http.client` span to a `…/result.*` URL and verify the query is
  `?[redacted]`), or temporarily raise the client sample rate once to capture one.
