# Fix Prod Sentry Source Maps (3.7) Implementation Plan

## Overview

Production Sentry stack traces resolve to **minified** code on both runtimes (browser + workerd server) even though debug IDs are injected and source maps upload in CI. The root cause is **not** missing debug IDs or wrong secrets — it's the `@sentry/astro` source-map config in `astro.config.mjs`. We correct the config so the SDK manages map generation + per-build cleanup itself (eliminating a cross-build delete race), then prove both runtimes de-minify with a **temporary** guarded verify route deployed through CI, and remove the route once verified.

## Current State Analysis

From `research.md` (internal 4-agent sweep + local experiments + cited deep-research):

- **Debug IDs are injected** into both bundles: 14/14 client `dist/client/_astro/*.js` and 36/36 server `dist/server/**/*.mjs`. The original §3.7 "debug IDs not injected" diagnosis is **disproven**.
- **Maps upload in CI** — §3.7 itself logged "33 client maps uploaded"; the build step has `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT` (`.github/workflows/ci.yml` deploy job). The failure is **downstream of upload**.
- **Prime suspect:** `astro.config.mjs:35-38` sets `sourcemaps.filesToDeleteAfterUpload: ["dist/**/*.map"]` — a **repo-wide** glob. The `@astrojs/cloudflare` adapter runs **two separate vite builds** (client, then server); the first build's `writeBundle` deletion can strip maps the second build's upload needs → the deploy warning `Didn't find any matching sources for debug ID upload` and unmatched maps.
- **Config shape:** `org/project/authToken` are nested under `sourceMapsUploadOptions` (deprecated in 10.x but still honored as a fallback — not itself the bug; should be hoisted to canonical top-level).
- **`assets: ["dist/**/\*"]`is correct** — it's the Sentry-maintainer-recommended broad glob; the plugin auto-filters to`.js`/`.map`. Do not narrow it.
- **Generation is token-gated:** local builds (no token) emit **0 maps**, so the fix **cannot be validated locally** — verification must run through CI (build step has the token) + manual Sentry inspection.
- **Server re-bundle risk (#14841)** — where `wrangler deploy` re-bundles into `.wrangler/tmp/` and strips debug IDs — is **likely mitigated** here: generated `dist/server/wrangler.json` has `"no_bundle": true` and server chunks retain `_sentryDebugIds`. Must confirm live.
- **Unexplained client residual (expectation-setting):** §3.7 logged "33 client maps uploaded" yet client frames stayed minified — and the client bundle is **not** re-bundled. The delete-race fix (Phase 1) cleanly explains the _warning_ and a server/whichever-build map loss, but does **not** obviously explain a client that uploaded maps yet stayed minified. So Phase 1 may be **necessary-but-not-sufficient for the client**; the likely residual client cause (deployed-vs-instrumented debug-id mismatch, or maps uploaded under a non-matching release) would surface at Phase 2's client check (2.5/2.6) and route into Phase 3. Do not assume Phase 1 alone closes the client.

## Desired End State

A real error thrown from app code in production produces a Sentry event whose stack frames resolve to **original sources** — `*.tsx`/`*.astro`/`*.ts` with real function names and line numbers — for **both** the browser (client island) and the workerd server runtime. The deploy log no longer warns `Didn't find any matching sources for debug ID upload`. No `.map` files are publicly served from the deployed site. The temporary verify route is removed after confirmation.

### Key Discoveries:

- `astro.config.mjs:22-39` — the `sentry()` integration block; manual `filesToDeleteAfterUpload` (PR #43) is the prime suspect; `sourceMapsUploadOptions` wrapper is deprecated.
- `@sentry/astro` auto-enables `vite.build.sourcemap: "hidden"` **and auto-deletes maps per-build after upload** _only when map generation is left unconfigured_ (research finding [2], v8→v9 migration doc). Leaving `vite.build.sourcemap` unset is the intended way to get safe per-build cleanup.
- `dist/server/wrangler.json` `"no_bundle": true` — wrangler ships the adapter's server output as-is (no re-bundle), so server debug IDs are preserved (likely sidesteps #14841).
- Verify-route harness source is preserved verbatim in `research.md` (History section) — `src/pages/sentry-verify.astro` + `src/components/SentryVerifyClient.tsx`, guarded by a secret `?key=` with 404 on mismatch.
- Lesson [[adding-a-vite-plugin-re-triggers-the-dev-only-more-than-one-copy-of-react-ssr-crash]]: verify any vite-config change under `npm run build && npx wrangler dev`, **not** `npm run dev`.
- CI `deploy` runs only on push to master (`.github/workflows/ci.yml`), and master is PR-only — so each deploy-verify cycle is a PR→merge.

## What We're NOT Doing

- NOT narrowing `sourcemaps.assets` (it's already the recommended broad glob).
- NOT setting `vite.build.sourcemap` explicitly (we _want_ the SDK's auto-enable + auto-delete path; explicit setting disables auto-delete and, per local Exp 2, doesn't even reach the client build).
- NOT re-testing the privacy scrub (3.8/3.9/3.11) — already unit-tested + verified. Verify route carries source-map cases only.
- NOT making the verify route a permanent fixture (security: query-string-secret throw-endpoint leaks via logs/history). Temporary only; fixture preserved in docs.
- NOT changing CI secrets, the wrangler `no_bundle` setting, or `@sentry/cloudflare` runtime wiring unless Phase 3 contingency proves it necessary.
- NOT touching Cloudflare's own `upload_source_maps` (orthogonal — CF dashboard, not Sentry).

## Implementation Approach

One small config change is the hypothesis-driven fix (Phase 1). Because it can only be proven in CI, Phase 2 bundles a temporary guarded verify route into the same deploy and inspects both runtimes in Sentry. If either runtime is still minified, Phase 3 applies the next hypothesis (server/`no_bundle` debug-id path or glob scoping) reusing the still-deployed harness — bounded to ~2 deploy-verify cycles total. Phase 4 removes the route, redeploys clean, and closes the change.

## Critical Implementation Details

- **Token-gated generation → CI-only verification.** Local `astro build` emits zero maps without `SENTRY_AUTH_TOKEN`, so "does it de-minify" is only answerable from a CI-built prod deploy. Do not attempt to validate the source-map fix via local `wrangler deploy` (it ships a tokenless, map-less, dev-flavored bundle — the exact trap hit during the 3.10 session).
- **Two vite builds, one cleanup owner.** The whole point of Phase 1 is to stop hand-managing deletion across the client+server builds; let the SDK delete per-build after each build's own upload.
- **Master is PR-only.** Each deploy-verify cycle = branch → PR → merge → CI `deploy`. The temporary verify route therefore rides master briefly; it stays guarded (secret `?key=`, 404 on mismatch) and is removed in Phase 4.
- **Verify the vite-config change under `wrangler dev`, not `npm run dev`** (lessons.md — the dev-only React-dup SSR crash is expected and irrelevant).

## Phase 1: Correct the source-map config

### Overview

Edit `astro.config.mjs` so the SDK owns map generation + per-build cleanup, removing the cross-build delete race and modernizing the config shape.

### Changes Required:

#### 1. Sentry integration config

**File**: `astro.config.mjs`

**Intent**: Remove the repo-wide `filesToDeleteAfterUpload` (the cross-build delete race), hoist `org/project/authToken` to the canonical top-level form, and keep the recommended broad `assets` glob. Leave `vite.build.sourcemap` unset so the SDK auto-enables `hidden` and auto-deletes maps per-build after upload.

**Contract**: The `sentry()` integration call loses the `sourceMapsUploadOptions` wrapper and the `filesToDeleteAfterUpload` key; gains top-level `org`/`project`/`authToken`. No `vite.build.sourcemap` key is added. Target shape:

```js
sentry({
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    assets: ["./dist/**/*"],
  },
}),
```

Update the now-stale explanatory comment (the `dist/_astro`/`dist/_worker.js` paths are wrong; the layout is `dist/client` + `dist/server`).

### Success Criteria:

#### Automated Verification:

- Production build succeeds: `npm run build`
- Type checking passes: `npm run typecheck`
- Linting passes on the touched file: `npx eslint astro.config.mjs`
- No `.map` files shipped to the client locally: `find dist/client -name '*.map'` returns nothing (local **privacy guard** — passes trivially since tokenless local builds emit no maps; this does NOT validate the fix, which is only provable in Phase 2 via CI deploy + Sentry)
- Unit suite unaffected: `npm run test:unit`

#### Manual Verification:

- Config matches the canonical 10.x shape (top-level org/project/authToken; no `sourceMapsUploadOptions`, no `filesToDeleteAfterUpload`).
- Islands still hydrate under prod parity: `npm run build && npx wrangler dev` → `GET /` renders with `astro-island`s (NOT `npm run dev`, per lessons.md).

---

## Phase 2: Temporary verify harness + CI deploy + live verification

### Overview

Re-add the guarded verify route (source-map cases only), ship it with the Phase 1 fix through CI, trigger real client + server errors in prod, and confirm both de-minify in Sentry. **Phase 1 + Phase 2 land in a single PR/deploy** — Phase 1 has no standalone deploy or runtime verification, so the config fix and the verify harness merge together.

### Changes Required:

#### 1. Guarded verify route

**File**: `src/pages/sentry-verify.astro` (new, temporary)

**Intent**: A secret-guarded route that deliberately throws a server-side error (`case=ssr`) and renders a client island that throws a real app-frame error (`case=client`), so Sentry receives genuine frames to symbolicate. 404 on missing/wrong key so it isn't publicly discoverable.

**Contract**: `export const prerender = false`. Reads `Astro.url.searchParams` `key` (compared to a freshly-generated secret — do NOT reuse the old committed `sv_…` value) and `case`. `case=ssr` → `throw new Error(...)`; `case=client` → render the island. Mirror the preserved harness in `research.md` (History section), minus the `signedurl`/`warning` scrub cases.

#### 2. Client throw island

**File**: `src/components/SentryVerifyClient.tsx` (new, temporary)

**Intent**: A hydrated React island that throws a real uncaught error from component code on click (not a console throw), so the captured event carries a `SentryVerifyClient.tsx` frame.

**Contract**: Synchronous `throw` in a `useEffect` armed by a button click (per the preserved original — a timer throw would lose the app frame).

#### 3. Lint scoping for the temporary files

**File**: `astro.config.mjs` / eslint as needed

**Intent**: Ensure the temporary route doesn't trip the typed-eslint `.astro` top-level-return crash or other gates (see lessons.md). Only if needed.

**Contract**: No-op unless lint fails on the new files.

#### 4. Pre-deploy no-client-map guard

**File**: `.github/workflows/ci.yml` (deploy job)

**Intent**: Gate the deploy so hidden `.map` files can never ship publicly if the SDK's auto-delete fails to fire. The check runs on the token-bearing CI build (the only build that generates maps), **before** the deploy command, so any exposure is blocked rather than detected post-fact.

**Contract**: In the `wrangler-action` `preCommands`, after `npm run build`, assert `dist/client` contains zero `.map` and fail the step otherwise — e.g. `npm run build && ! find dist/client -name '*.map' -print -quit | grep -q .`. Deploy does not run if the assertion fails.

### Success Criteria:

#### Automated Verification:

- Build + typecheck + lint pass with the route present: `npm run build`, `npm run typecheck`, `npx eslint src/pages/sentry-verify.astro src/components/SentryVerifyClient.tsx`
- CI pipeline green on the PR (lint, unit, integration, e2e).
- Pre-deploy guard passes: the token-bearing CI build leaves zero `.map` in `dist/client` (gates the deploy before any exposure).

#### Manual Verification:

- Deploy lands via CI `deploy` (merge PR to master); deploy log shows **no** `Didn't find any matching sources for debug ID upload` warning.
- `case=ssr`: trigger the server error → Sentry event frames resolve to `src/pages/sentry-verify.astro` / real `*.ts` sources (not `chunks/*.mjs:NN`).
- `case=client`: click to throw → Sentry event frames resolve to `SentryVerifyClient.tsx` (not `_astro/*.js:1:NNN`).
- Public assets carry no maps: fetching a deployed `/_astro/<chunk>.js.map` returns 404.
- Record outcomes (per-runtime resolved/minified) in `research.md` follow-up + `change.md`.

**Implementation Note**: Pause after Phase 2 for human confirmation of the Sentry inspection before deciding Phase 3 vs Phase 4.

---

## Phase 3: Contingency — only if a runtime is still minified

### Overview

Conditional. If Phase 2 shows residual minification on either runtime, apply the next hypothesis and re-verify with the still-deployed harness. Hard stop at ~2 total deploy-verify cycles. **If neither hypothesis resolves it by then, terminate cleanly regardless**: run Phase 4 cleanup (remove the route), park 3.7 in memory with the documented findings, and open a focused follow-up change. The change must never end with the verify route still deployed or the loop left open.

### Changes Required:

#### 1. Server path (if server frames still minified)

**File**: `wrangler.jsonc` / `astro.config.mjs` (as diagnosed)

**Intent**: Address the `@sentry/cloudflare`-on-workerd debug-id-stripping path (#14841) if `no_bundle: true` proves insufficient — e.g. confirm the deployed worker chunk retains `_sentryDebugIds`, align the uploaded artifact, or adjust the upload scope.

**Contract**: Diagnosis-driven; determined from the Phase 2 Sentry event's `debug_meta` and the deployed chunk contents. No pre-committed edit.

#### 2. Client path (if client frames still minified)

**File**: `astro.config.mjs`

**Intent**: If the delete-race removal didn't fix the client, investigate the next cause (deployed-vs-instrumented mismatch, asset glob edge case) per research's open questions.

**Contract**: Diagnosis-driven.

### Success Criteria:

#### Automated Verification:

- Build + CI green on the contingency PR.

#### Manual Verification:

- Re-triggered `case=ssr` and/or `case=client` now resolve to original sources in Sentry.

---

## Phase 4: Remove verify route + close

### Overview

Delete the temporary harness, deploy clean, and close the change.

### Changes Required:

#### 1. Remove temporary files

**File**: `src/pages/sentry-verify.astro`, `src/components/SentryVerifyClient.tsx` (delete)

**Intent**: Remove the throw-route from prod once both runtimes are verified. The harness remains re-creatable from `research.md`.

**Contract**: Files deleted; any Phase-2 lint scoping reverted.

#### 2. Close-out bookkeeping

**File**: `research.md`, `change.md`, memory `sentry-prod-followups`

**Intent**: Record the confirmed fix + final per-runtime outcome; flip 3.7 from open to resolved in memory; ready for `/10x-archive`.

**Contract**: Docs updated; `change.md` status advanced.

### Success Criteria:

#### Automated Verification:

- Build + CI green with the route removed: `npm run build`.
- Route gone: `test ! -f src/pages/sentry-verify.astro`.

#### Manual Verification:

- Deployed `/sentry-verify?...` returns 404 / not present.
- A subsequent real (non-harness) error in Sentry still resolves to original sources (sanity).
- Memory `sentry-prod-followups` reflects 3.7 resolved.

---

## Testing Strategy

### Unit Tests:

- No new unit tests — the change is build-config + a temporary harness. Existing `npm run test:unit` must stay green.

### Integration / CI:

- The PR exercises full CI (lint, unit, integration, e2e). The deploy log is itself a signal (presence/absence of the debug-ID warning).

### Manual Testing Steps:

1. Merge Phase 1+2 PR → watch CI `deploy`; confirm no debug-ID warning in the build log.
2. Hit `/sentry-verify?key=<secret>&case=ssr` → inspect the Sentry event's stack frames (server).
3. Hit `/sentry-verify?key=<secret>&case=client`, click the throw button → inspect the Sentry event's stack frames (client).
4. Confirm both resolve to original sources; confirm `/_astro/<chunk>.js.map` 404s.
5. After verification, merge Phase 4 PR removing the route; confirm 404.

## Migration Notes

No data migration. Build/deploy-config only. Rollback = revert the `astro.config.mjs` diff (the prior state is the current committed config).

## References

- Research: `context/changes/sentry-prod-sourcemaps/research.md`
- Original (disproven-injection) follow-up: `context/archive/2026-06-15-sentry-integration/follow-ups/review-fixes.md` §3.7
- Verify-harness source (preserved): `research.md` → "History / prior attempts"
- Key external: Sentry Astro source-maps docs; `getsentry/sentry-javascript` #14841 (workerd re-bundle), bundler-plugins #569/#620 (the warning).
- Memory: `sentry-prod-followups`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Correct the source-map config

#### Automated

- [x] 1.1 Production build succeeds: `npm run build` — 1508dd8
- [x] 1.2 Type checking passes: `npm run typecheck` — 1508dd8
- [x] 1.3 Linting passes on touched file: `npx eslint astro.config.mjs` — 1508dd8
- [x] 1.4 No `.map` files in `dist/client`: `find dist/client -name '*.map'` empty — 1508dd8
- [x] 1.5 Unit suite unaffected: `npm run test:unit` — 1508dd8

#### Manual

- [x] 1.6 Config matches canonical 10.x shape (top-level org/project/authToken; no `sourceMapsUploadOptions`/`filesToDeleteAfterUpload`) — 1508dd8
- [x] 1.7 Islands hydrate under `npm run build && npx wrangler dev` — 1508dd8

### Phase 2: Temporary verify harness + CI deploy + live verification

#### Automated

- [x] 2.1 Build + typecheck + lint pass with the route present — e7ebae6
- [ ] 2.2 CI pipeline green on the PR
- [ ] 2.3 Pre-deploy guard: zero `.map` in `dist/client` on the token-bearing build (gates deploy)

#### Manual

- [ ] 2.4 Deploy log shows no `Didn't find any matching sources for debug ID upload` warning
- [ ] 2.5 `case=ssr`: server frames resolve to original sources in Sentry
- [ ] 2.6 `case=client`: client frames resolve to `SentryVerifyClient.tsx` in Sentry
- [ ] 2.7 Deployed `/_astro/<chunk>.js.map` returns 404 (no maps shipped)
- [ ] 2.8 Per-runtime outcomes recorded in research.md + change.md

### Phase 3: Contingency — only if a runtime is still minified

#### Automated

- [ ] 3.1 Build + CI green on the contingency PR

#### Manual

- [ ] 3.2 Re-triggered case(s) now resolve to original sources in Sentry

### Phase 4: Remove verify route + close

#### Automated

- [ ] 4.1 Build + CI green with route removed: `npm run build`
- [ ] 4.2 Route file removed: `test ! -f src/pages/sentry-verify.astro`

#### Manual

- [ ] 4.3 Deployed `/sentry-verify` returns 404 / not present
- [ ] 4.4 A subsequent real error in Sentry still resolves to original sources
- [ ] 4.5 Memory `sentry-prod-followups` reflects 3.7 resolved
