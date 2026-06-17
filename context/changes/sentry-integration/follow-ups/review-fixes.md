# Review follow-ups: sentry-integration

Deferred items from the impl review (`reviews/impl-review.md`, 2026-06-17).

## F4 — Regenerate the Edge function deno.lock

- **Source**: impl-review F4 (OBSERVATION, reliability).
- **Why deferred**: standalone Deno is not installed on the dev machine, so a complete
  integrity-pinned lock can't be generated this session.
- **Action when Deno is available**:
  ```bash
  cd supabase/functions/enhance && deno cache index.ts
  git add supabase/functions/enhance/deno.lock && git commit
  ```
  This re-pins `npm:@sentry/deno@^10.58.0` (currently caret-only, no lockfile) with
  integrity hashes so a future 10.x minor can't silently drift into the build.
- **Guard**: CI runs `deno check --config supabase/functions/enhance/deno.json …`. If a
  regenerated lock is committed, confirm CI's deno check still passes (a stale/partial
  lock re-breaks it — see lessons.md / memory deno-check-needs-config-flag).

## 3.7 — Source maps don't resolve in prod (client AND server)

- **Source**: manual verification 2026-06-17 (the `/sentry-verify` harness). Both runtimes
  produced **minified** stacks despite the deploy's "Uploaded files to Sentry" (33 client
  maps). Recurring deploy-log warning: `[sentry-vite-plugin] Didn't find any matching
sources for debug ID upload. Please check the sourcemaps.assets option.`
  - Client event frame: `/_astro/SentryVerifyClient.DrFOipla.js:1:634`, single-letter fns.
  - Server event frame: `chunks/sentry-verify_wVBDjGKS.mjs:45` (readable fn names — workerd
    server bundle isn't minified — but NOT mapped to `src/pages/sentry-verify.astro`).
- **Diagnosis**: debug IDs aren't being injected into / matched against the built bundles for
  the `@astrojs/cloudflare` output layout, so Sentry can't link the uploaded maps to events.
  `sourceMapsUploadOptions.sourcemaps.assets` likely needs to point at the real output dirs.
- **Candidate fix (UNTESTED — found in the working tree during cleanup, NOT yet deployed):**
  in `astro.config.mjs`, inside `sentry({ sourceMapsUploadOptions: { … } })`:
  ```js
  sourcemaps: {
    assets: ["dist/**/*", ".wrangler/**/*"],
  },
  ```
  Needs its own change: apply → deploy → re-run a real error via a verify harness → confirm
  frames resolve to `*.tsx` / `*.astro` originals. Verify the build still cleans emitted maps
  and the bundle size/output isn't shipped with maps. (A `SENTRY_VERIFY_KEY` env field was
  also drafted alongside — only needed if the verify route is reintroduced env-keyed.)
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
