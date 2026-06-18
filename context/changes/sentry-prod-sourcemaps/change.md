---
change_id: sentry-prod-sourcemaps
title: Fix prod Sentry stack traces resolving to minified code (follow-up 3.7)
status: implementing
created: 2026-06-18
updated: 2026-06-18
archived_at: null
---

## Notes

Fix prod Sentry stack traces resolving to minified code (3.7). Debug IDs not injected into served Cloudflare bundles; client (dist/\_astro) maps not generated and server (workerd) bundle re-bundled by wrangler after astro build so @sentry/astro injection is invalidated. Two runtimes: client @sentry/astro + server @sentry/cloudflare. Prior attempt PR #43 (sourcemaps.assets glob) insufficient.

Early evidence (2026-06-18 internal research, see research.md): debug IDs **ARE** injected into both client (`dist/client/_astro/*.js`, 14/14) and server (`dist/server/**/*.mjs`, 36/36) bundles — the original §3.7 "debug IDs not injected" diagnosis is **disproven**. (My first-pass grep hit `dist/_astro`, which doesn't exist on this adapter — files live under `dist/client/_astro`.) The real gap: **0 `.map` files** emitted anywhere in `dist/` and **0 `sourceMappingURL`** comments, so Sentry has debug IDs but no maps to symbolicate against. `upload_source_maps: true` in the resolved wrangler config ships maps to Cloudflare's store, NOT Sentry. Open conflict for external research: whether `@sentry/astro` auto-enables `build.sourcemap: "hidden"` (one agent read its source and says yes) and the manual `filesToDeleteAfterUpload: ["dist/**/*.map"]` deletes maps unconditionally, vs. maps simply never being generated. See memory `sentry-prod-followups` and archived `context/archive/2026-06-15-sentry-integration/follow-ups/review-fixes.md` §3.7.
