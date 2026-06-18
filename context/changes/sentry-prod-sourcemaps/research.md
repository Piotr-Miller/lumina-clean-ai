---
date: 2026-06-18T13:49:07+0200
researcher: Claude (10x-research)
git_commit: e8f1a725f3af51cfda63be9f148cca80ed9f8a7e
branch: test/sentry-span-redaction-integration
repository: Piotr-Miller/lumina-clean-ai
topic: "Why prod Sentry stack traces stay minified (follow-up 3.7) — client + server source maps"
tags: [research, codebase, sentry, source-maps, astro, cloudflare, build]
status: complete
last_updated: 2026-06-18
last_updated_by: Claude (10x-research)
---

# Research: Prod Sentry stack traces stay minified (3.7)

**Date**: 2026-06-18T13:49:07+0200
**Researcher**: Claude (10x-research)
**Git Commit**: e8f1a725f3af51cfda63be9f148cca80ed9f8a7e
**Branch**: test/sentry-span-redaction-integration
**Repository**: Piotr-Miller/lumina-clean-ai

## Research Question

Why do production Sentry stack traces resolve to **minified** code on both the client (browser) and server (workerd) runtimes, despite the Sentry integration being wired and source-map upload configured (follow-up 3.7)? Prior fix PR #43 (`sourcemaps.assets` glob) was insufficient. What is the true root cause and what does a correct fix require?

## Summary

The original §3.7 diagnosis — _"debug IDs aren't being injected into the served Cloudflare bundles"_ — is **DISPROVEN by the current build**. Debug IDs **are** injected into every chunk: **14/14** client `dist/client/_astro/*.js` and **36/36** server `dist/server/**/*.mjs` carry `_sentryDebugIds`.

The real gap is **source-map emission**: there are **0 `.map` files** anywhere under `dist/` and **0 `//# sourceMappingURL`** comments. Sentry therefore has debug IDs in the deployed code but **no maps to symbolicate against** → frames stay minified, and the deploy logs `Didn't find any matching sources for debug ID upload`.

There is **one unresolved conflict** between sub-agents that is the crux of the fix and is the primary question for external/canonical-docs research (next step):

- **Hypothesis A (maps generated then deleted):** `@sentry/astro` _does_ auto-enable `vite.build.sourcemap: "hidden"`, so maps **are** generated — but the project's manual `sourcemaps.filesToDeleteAfterUpload: ["dist/**/*.map"]` runs **unconditionally** in the bundler plugin's `writeBundle` `finally` block (even when no upload happens), deleting them. Repo-wide glob across **two** sequential vite builds (client, then server) can clobber one build's maps before/around the other's upload → the prod warning.
- **Hypothesis B (maps never generated):** No `vite.build.sourcemap` is set in `astro.config.mjs`, so vite never emits `.map` files at all; debug-ID injection is unconditional but map emission is gated on a setting that isn't on.

These differ in fix: A → fix/remove the manual `sourcemaps` block (esp. `filesToDeleteAfterUpload` + the broad `assets` glob, both added by PR #43); B → add an explicit `vite.build.sourcemap`. **They are not mutually exclusive** — the likely correct fix combines "ensure hidden sourcemaps are on" with "stop the unconditional/broad deletion," verified by an actual build. The decisive empirical test is cheap: build locally and check whether `.map` files survive with the `sourcemaps` block removed vs. present.

**Severity remains low (MVP):** server frames already show readable function names (server bundle isn't minified), and the privacy scrub — the load-bearing part — is verified. This is quality-of-debugging only.

## Detailed Findings

### Build / runtime architecture (two runtimes, one upload owner)

- **Client**: Astro Vite client build → `dist/client/_astro/*.js`. Source-map upload owned by `@sentry/astro` (wraps `@sentry/vite-plugin`).
- **Server (workerd)**: `wrangler.jsonc` `main: "./sentry.server.config.ts"` (`sentry.server.config.ts:31` `Sentry.withSentry(...)` from `@sentry/cloudflare`, wrapping `@astrojs/cloudflare/entrypoints/server`). The astro/vite **server build** (via the adapter) produces `dist/server/entry.mjs` + `dist/server/chunks/*.mjs`.
- **`wrangler deploy` does NOT re-bundle.** Generated `dist/server/wrangler.json` has `"no_bundle": true`, `"main": "entry.mjs"`, and an ESModule `rules` glob. Wrangler ships the adapter's output as-is. _This kills the earlier "wrangler re-bundle invalidates debug IDs" hypothesis_ — evidence: `dist/server/entry.mjs:4-6` and `chunks/*.mjs` already contain the Sentry `SENTRY_RELEASE` + `_sentryDebugIds` banner, preserved verbatim by wrangler.
- `@sentry/cloudflare@10.58.0` provides **no** source-map upload mechanism (no vite/wrangler plugin, no sentry-cli) — it is purely the runtime SDK. Upload is entirely `@sentry/astro`'s job, and its `assets: ["dist/**/*"]` glob covers `dist/server/**`, so server chunks get debug IDs from the same plugin.

### The injected-but-mapless state (the actual symptom)

- `find dist -name "*.map"` → **0**. `grep -r sourceMappingURL dist` → **0**.
- `_sentryDebugIds` present in **14/14** client `.js` and **36/36** server `.mjs`.
- So: debug-ID **injection works**; map **emission does not** survive into `dist/`.

### Hypothesis A evidence (`@sentry/astro` auto-enables hidden maps; unconditional delete)

From the agent that read `@sentry/astro` source:

- `node_modules/@sentry/astro/build/esm/integration/index.js:74-77` — `updateConfig({ vite: { build: { sourcemap: computedSourceMapSettings.updatedSourceMapSetting } } })`.
- `:241-247` — `_getUpdatedSourceMapSettings` returns `"hidden"` when the project leaves `vite.build.sourcemap` unset (our case).
- `:58-118` — the whole sourcemap+plugin block is gated by `shouldUploadSourcemaps && command !== "dev"`, where `shouldUploadSourcemaps` defaults to `true` even **without** an auth token (auth token only gates the _upload_, not generation/injection).
- `node_modules/@sentry/rollup-plugin/dist/esm/index.mjs:76-94` — `writeBundle` runs `deleteArtifacts()` in a `finally`, **unconditional**.
- `@sentry/bundler-plugin-core/dist/esm/index.mjs:5927-5945` — `deleteArtifacts` globs `filesToDeleteAfterUpload` and `fs.rm`s matches, gated only by `filesToDelete !== undefined` (never by `canUploadSourceMaps`). Upload short-circuits at `:5797` when `!authToken` (`:5959-5961`), but deletion still runs.
- Net (local, no token): maps generated (`"hidden"`) → upload skipped → `dist/**/*.map` deleted anyway → 0 maps. In CI the broad repo-wide delete across the two builds plausibly removes map-bearing assets around upload time → `"Didn't find any matching sources for debug ID upload"`.

### Hypothesis B evidence (no `build.sourcemap` → maps never emitted)

Two agents independently noted there is **no** `vite.build.sourcemap` in `astro.config.mjs` (only the Sentry `sourcemaps` upload block at `:35-38`), inferred maps are never emitted, and proposed adding `vite: { build: { sourcemap: "hidden" } }`. This conflicts with Hypothesis A's source reading (which says `@sentry/astro` sets it programmatically). **Unresolved without an empirical build or canonical docs.**

### CI is correctly positioned to upload (not the gap)

- `.github/workflows/ci.yml` `deploy` job (`needs: [ci, integration, e2e]`, master push only) runs `npm run build` via `cloudflare/wrangler-action@v4` `preCommands`, with build-time env including `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `PUBLIC_SENTRY_DSN`, `PUBLIC_SENTRY_ENVIRONMENT: production` (ci.yml ~:321-341). So the token IS present at build → upload runs in CI. The failure is map _retention/emission_, not secrets.
- `package.json` `build` is just `astro build` — no sentry-cli/postbuild; upload is entirely via the integration.

### Server-side conclusion

What's needed for SERVER frames to resolve: (1) emit server `.map` files at build time (the missing piece — injection already works), and (2) let the already-wired `@sentry/astro` upload them to Sentry in CI (token already present). No new tool needed. Cloudflare's `upload_source_maps: true` is orthogonal (CF dashboard only) and can stay. Symbolication uses **debug-ID matching** (primary), with `release` (CF_VERSION_METADATA id / baked `SENTRY_RELEASE`) as legacy fallback.

### History / prior attempts (what to respect)

- **PR #43** (`c1280f5`, merged `1e55713`) added exactly the manual `sourcemaps: { assets: ["dist/**/*"], filesToDeleteAfterUpload: ["dist/**/*.map"] }` block. Per `review-fixes.md` §3.7 it did **not** change the deploy warning or de-minify events. Given Hypothesis A, this block may itself be implicated (unconditional/broad delete) — i.e. the prior "fix" might be part of the problem, not just inert.
- **Verify harness** existed and was removed (added `4d94d37`, removed `4ac599e`): `src/pages/sentry-verify.astro` + `src/components/SentryVerifyClient.tsx`. Guarded by a secret `?key=` (404 on mismatch), with cases `ssr` (server throw), `client` (island throws a real app-frame error on click), `signedurl`/`warning` (scrub tests). Manual `captureMessage` paths used `await Sentry.flush(2000)` (Edge isolates freeze post-response). **Re-adding a guarded version is the validation mechanism** for any fix.

## Code References

- `astro.config.mjs:22-39` — `sentry()` integration; manual `sourcemaps.assets` + `filesToDeleteAfterUpload` (PR #43); **no** explicit `vite.build.sourcemap`.
- `sentry.client.config.ts:16-25` — browser SDK init (`browserTracingIntegration`, scrub hooks).
- `sentry.server.config.ts:31-43` — workerd entry, `withSentry`, `release: env.CF_VERSION_METADATA?.id`.
- `wrangler.jsonc:3-28` — `main: ./sentry.server.config.ts`, assets, vars, version_metadata.
- `dist/server/wrangler.json` — generated: `no_bundle: true`, `upload_source_maps: true`, `main: entry.mjs`, ESModule rules.
- `dist/server/entry.mjs:4-6` + `dist/server/chunks/*.mjs` — debug IDs present, no maps.
- `node_modules/@sentry/astro/build/esm/integration/index.js:58-118,241-247` — sourcemap setting + plugin wiring.
- `node_modules/@sentry/rollup-plugin/dist/esm/index.mjs:76-94` — unconditional `deleteArtifacts` in `writeBundle` finally.
- `node_modules/@sentry/bundler-plugin-core/dist/esm/index.mjs:5797,5927-5945,5959-5961` — upload gate vs. deletion gate.
- `.github/workflows/ci.yml:~321-341` — deploy job build-time Sentry env.

## Architecture Insights

- **Versions**: `@sentry/astro ^10.58.0`, `@sentry/cloudflare ^10.58.0`, `@astrojs/cloudflare ^13.5.0`, `astro ^6.3.1`, vite pinned `^7.3.2` (overrides).
- The `@astrojs/cloudflare` output layout is `dist/{client,server}` — NOT `dist/_astro` / `dist/_worker.js`. Globs and any path assumptions must use `dist/client/**` + `dist/server/**`.
- Debug-ID matching (not release) is the modern symbolication path; both runtimes already carry debug IDs.
- The fix surface is the **build config** (`astro.config.mjs` vite/sentry block), not CI secrets and not wrangler bundling.

## Historical Context (from prior changes)

- `context/archive/2026-06-15-sentry-integration/follow-ups/review-fixes.md` §3.7 — original (now-disproven on injection) diagnosis + the explicit "needs a dedicated change: investigate vite `build.sourcemap` and/or workerd bundle handling; validate by re-adding a guarded verify route."
- `context/archive/2026-06-15-sentry-integration/reviews/impl-review*.md`, `plan.md`, `research.md` — Sentry integration build-up (Phases 1-3), incl. the `await Sentry.flush()` Edge-isolate discovery.
- Lessons: [[adding-a-vite-plugin-re-triggers-the-dev-only-more-than-one-copy-of-react-ssr-crash]] — verify any vite-config change under `npm run build && npx wrangler dev`, NOT `npm run dev`. Relevant because this fix edits the vite/Sentry config.

## Related Research

- `context/changes/sentry-prod-sourcemaps/change.md` (this change)
- Memory: `sentry-prod-followups` (3.7 still open; 3.10 closed-by-test)

## Empirical Experiments (2026-06-18, local — NO auth token)

Two controlled local builds resolved the A-vs-B conflict and exposed a sharper third finding. (Local builds have no `SENTRY_AUTH_TOKEN`, which itself turned out to matter.)

**Experiment 1 — remove `filesToDeleteAfterUpload`, rebuild:**

- Result: **0 `.map` files** (client + server). Build log: `No auth token provided. Will not upload source maps.`
- Conclusion: **Hypothesis A refuted.** Deletion was not what removed the maps — they were never generated locally. Map generation appears tied to the upload being possible (token present) via `@sentry/astro`'s auto-setting; with no token, `build.sourcemap` is effectively off.

**Experiment 2 — explicit `vite: { build: { sourcemap: "hidden" } }`, rebuild (still no token):**

- Result: **36 maps — ALL server** (`dist/server/chunks/*.mjs.map`), **0 client maps**.
- Breakdown: client `dist/client/_astro` = 14 `.js` / **0 `.map`** / 0 `sourceMappingURL` (but 14/14 debug IDs); server `dist/server` = 36 `.mjs` / **36 `.map`** / 13 `sourceMappingURL`.
- Conclusion: **The client island build ignores `vite.build.sourcemap`.** Explicit `"hidden"` generates server maps but never client maps. The browser frames therefore cannot de-minify via this knob — Astro's client build needs a different mechanism. Server-side, explicit `build.sourcemap` _does_ produce maps even without a token.

**Refined diagnosis (supersedes A/B):**

- **Server side**: maps generate when `build.sourcemap` is set; in CI (token present) `@sentry/astro` likely sets it and uploads. Lower risk.
- **Client side**: `vite.build.sourcemap` does NOT reach the client island build → client maps never generated → **client prod frames stay minified regardless**. This is the load-bearing unknown: how does `@sentry/astro` (or Astro) enable CLIENT source maps for the `@astrojs/cloudflare` adapter? (→ external research Q2/Q4.)
- Local builds cannot fully reproduce CI because generation is token-gated; **CI-faithful verification (real token, deploy, re-added verify route) is required** to confirm any fix.

## External Research synthesis (deep-research, 2026-06-18 — 17 sources, 21/25 claims confirmed)

Cited primarily to Sentry docs + `getsentry/sentry-javascript` source/issues. Reconciled against the local experiments above.

**Confirmed:**

1. **Config shape** — `sourceMapsUploadOptions: { org, project, authToken }` is **deprecated but still honored** (resolution: top-level → `sourceMapsUploadOptions` → `SENTRY_*` env). Our nested config does **NOT** silently break upload — but should be **hoisted to top-level** `sentry({ org, project, authToken, sourcemaps })`. (10.58.0 `integration/index.ts` + `types.ts` `@deprecated`.) _Not the root cause._
2. **Auto-generation is token-conditioned, reconciling my experiments.** The SDK auto-sets `vite.build.sourcemap: "hidden"` and uploads — but only inside the `shouldUploadSourcemaps && command !== "dev"` block, which is effectively gated on an upload config being resolvable. Locally (no `SENTRY_*`) → no auto-enable → **0 maps** (Exp 1 ✓). Crucially, the SDK enables maps via the **Sentry vite plugin on BOTH client+server builds**, which is why §3.7's CI run reported **"33 client maps uploaded"** — whereas my manual `vite.build.sourcemap` only reached the **server** build (Exp 2: client build ignores it). ⇒ In CI, client+server maps almost certainly **do** generate+upload; **the failure is downstream of upload.**
3. **`assets: ["./dist/**/*"]`is the Sentry-recommended broad glob** (plugin auto-filters to`.js`/`.map`); covers `dist/client`+`dist/server`. The adapter is NOT special-cased (only Vercel gets a dual glob). PR #43's `assets` value is *correct\*; a narrower `.map`-only glob would be wrong. (maintainer lforst, bundler-plugins #569.)
4. **The warning** _"Didn't find any matching sources for debug ID upload"_ fires when the `assets` glob matches **zero map-bearing files at upload time** — wrong glob **OR files moved/deleted after generation**. (bundler-plugins #569/#620.)
5. **`filesToDeleteAfterUpload` is NOT unconditional** (a claim I'd entertained — **refuted 0-3**): deletion is inside the same `shouldUploadSourcemaps` gate. BUT a **repo-wide `["dist/**/\*.map"]`across the adapter's TWO separate vite builds is risky** — the first (client) build's`writeBundle` deletion can strip maps the second (server) build's upload needs → a plausible cause of the warning. Recommendation: **omit it / let the SDK default scope handle cleanup**, or scope per-build. (#556 historical delete-before-upload regression was 2.19/2.20, fixed in 2.20.1; we ship vite-plugin v3/v4, so that exact bug does **not** apply.)
6. **Debug-ID matching is sufficient** — no `release`/`dist` association required (modern format, SDK ≥7.47). `debug_meta` is populated **at runtime from the deployed file's `_sentryDebugIds` snippet**; if the deployed bundle lacks/differs from the instrumented one, frames won't de-minify even with maps uploaded. (debug-ids docs.)
7. **Server-side dominant risk (caveated):** a documented `@sentry/cloudflare`-on-workerd failure where `wrangler deploy` does a **second build into `.wrangler/tmp/…` that strips injected debug IDs** (#14841, SvelteKit+CF #15622). **BUT** our generated config has **`no_bundle: true`**, and internal research confirmed `dist/server/**/*.mjs` **retain** `_sentryDebugIds` (36/36) — so this failure mode is likely **mitigated** here. Must confirm empirically (these issues are standalone-`@sentry/cloudflare`/SvelteKit, not Astro-adapter + `no_bundle`).

**Refuted (do NOT act on):** unconditional deletion regardless of upload (0-3); "assets must be `.map`-only / is too narrow" (0-3); per-worker `.vite/<worker>/**` glob (0-3); a specific client/server default-delete glob (1-2, unverified at tag).

**Recommended config direction (deep-research synthesis, medium confidence):** (1) hoist `org/project/authToken` to top-level; (2) keep `sourcemaps.assets: ["./dist/**/*"]`; (3) **drop the repo-wide `filesToDeleteAfterUpload`** (or scope it) to avoid the cross-build race; (4) leave `vite.build.sourcemap` unset (SDK auto-`hidden`) or set explicitly; (5) ensure the deployed server bundle keeps its debug IDs (likely already true via `no_bundle: true` — verify).

## Open Questions (→ resolve in the plan, CI-faithfully)

The decisive remaining unknowns can only be answered with a **real-token CI build + deploy + a re-added guarded `/sentry-verify` route**, since local builds can't reproduce token-gated generation/upload:

1. **Client isolation:** After hoisting config + dropping the repo-wide delete glob, do **CLIENT** frames de-minify in Sentry? (§3.7 said maps uploaded yet frames stayed minified — is the cause the cross-build delete race, or a deployed-vs-instrumented mismatch?)
2. **Server end-to-end:** Does `no_bundle: true` truly preserve server debug IDs so uploaded maps match at runtime (sidestepping #14841)? Confirm with a deployed server error.
3. Is the **repo-wide `filesToDeleteAfterUpload`** the actual trigger of _"Didn't find any matching sources"_ by racing the two builds? (Removing it is the cheapest test.)
4. Are 10.58.0-tag behaviors byte-identical to the `develop` source the research read? (Low risk; the empirical builds anchor this for our installed version.)
