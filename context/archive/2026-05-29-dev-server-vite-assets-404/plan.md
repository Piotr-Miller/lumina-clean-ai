# Dev-Server Vite Assets 404 → Restore Island Hydration — Implementation Plan

## Overview

`npm run dev` (= `astro dev`) serves page HTML (200) but 404s Vite's dev-only
client asset routes (`/@vite/client`, `/@id/astro:scripts/before-hydration.js`,
`/src/...`), so no React island hydrates. The frame brief
(`frame.md`, HIGH confidence) traced this to `wrangler.jsonc`'s
`run_worker_first: true`, which makes the Cloudflare adapter's workerd dev
runtime invoke the Astro SSR app for **every** request — including Vite's
internal asset routes — which match no SSR route and return Astro's 404 page.

This plan removes that directive so routing reverts to Cloudflare's default
**assets-first** behavior, then verifies that dev hydration is restored **and**
production SSR + auth-middleware routing is unchanged.

## Current State Analysis

- `wrangler.jsonc:7-12` sets `assets.run_worker_first: true` (added in commit
  `861e6da` "Lesson m1l5", 2026-05-26, with no recorded rationale, alongside
  `disable_nodejs_process_v2`). The original bootstrap (`dcccc93`) did not have it.
- `astro.config.mjs` uses `output: "server"` (all pages SSR) with
  `adapter: cloudflare()`. In Astro 6 this adapter runs dev SSR inside **workerd**
  via `@cloudflare/vite-plugin` — dev is no longer a plain Node/Vite server.
- `src/middleware.ts` resolves `context.locals.user` on every request and
  redirects unauthenticated users away from `PROTECTED_ROUTES` (e.g. `/dashboard`).
- The `overrides: { vite: ^7.3.2 }` in `package.json` is **correct** — it is the
  documented fix for the adjacent Astro 6 + adapter Vite-8-resolution crash
  (`require_dist is not a function`). It is **not** part of this problem and must
  be left intact.

### Hypothesis Investigation (from frame brief — already settled)

| Hypothesis | Verdict |
| --- | --- |
| Vite override mismatch | **NONE** — override matches Astro's own `vite ^7.3.2` dep; it's the documented fix for a different bug. |
| `@astrojs/cloudflare` workerd dev runtime intercepts Vite asset routes via `run_worker_first: true` | **STRONG** — reproduced; 404 body is Astro's own SSR 404 page, proving the request reached the worker, not Vite. |
| Generic Astro 6 dev-server bug | **WEAK** — plain Astro SSR dev serves `/@vite/client` fine. |
| Environment/runtime interference (SW, port, AV) | **NONE** — clean reproduction; 404 body is Astro's, not a proxy/SW. |

### Key Discoveries:

- **`run_worker_first: true` = "unconditionally invoke the Worker for every
  request before serving assets"** (Cloudflare docs). The default (`false`/omitted)
  is assets-first. For an Astro SSR app the default is the correct config: SSR
  pages and `/api/*` don't match a static asset so they still hit the Worker (and
  middleware runs); only real assets (`/_astro/*`, public files, and — in dev —
  Vite's `/@vite/`, `/@id/`, `/src/` routes) are served without the Worker.
- **Empirically verified during framing**: clean `astro dev` start with
  `run_worker_first: true` → `/@vite/client` returns **404** (Astro SSR 404 page);
  with `run_worker_first: false` → **200 `text/javascript`** and `/auth/signin`
  (7 `astro-island` markers) is 200. The change is isolated to this one directive.
- The `@cloudflare/vite-plugin` dev runtime honors `wrangler.jsonc`'s asset
  routing config (the toggle changed dev behavior live), so removing the
  directive is sufficient — no Vite-config changes are required.

## Desired End State

`npm run dev` serves `/@vite/client`, `/@id/astro:scripts/before-hydration.js`,
and `/src/styles/global.css` as `200`, and React islands (auth forms, local-engine
UI) hydrate without a build step. Production behavior is unchanged: `npm run build
&& npx wrangler dev` still renders SSR pages, serves built assets, and the auth
middleware still gates protected routes. The `build + wrangler dev` workaround is
no longer necessary for day-to-day dev.

## What We're NOT Doing

- **Not** touching `overrides: { vite: ^7.3.2 }` — it is correct and load-bearing.
- **Not** adding React dep-optimizer hardening (`resolve.dedupe`,
  `optimizeDeps.include`, `react-dom/server.edge` alias). Those address adjacent
  Astro-6-on-Cloudflare hydration races (Invalid hook call / 504 reload churn)
  that are **not observed in this project**. Out of scope by decision.
- **Not** switching `not_found_handling` or changing `disable_nodejs_process_v2`.
- **Not** using the selective-array form of `run_worker_first` (rejected: it would
  leak dev-only Vite prefixes into a production config and opt out of
  `Sec-Fetch-Mode` navigation handling).

## Implementation Approach

Single-line config deletion + verification. The risk is entirely in *production
regression*, not in the dev fix (already proven), so the bulk of the work is
Phase 2's parity verification: confirm assets-first routing does not bypass the
SSR worker or the auth middleware for real app/SSR routes.

## Critical Implementation Details

- **Why removing (not setting `false`) is safe and preferred**: `false` is the
  documented default, so deleting the key and setting it `false` are functionally
  identical; deletion avoids pinning a redundant non-default value. Routing reverts
  to assets-first: asset match → served directly; no match → Worker (SSR +
  middleware). Astro namespaces client assets under `/_astro/` and `public/`, which
  never collide with SSR page routes, so no SSR route is shadowed by an asset.
- **JSONC trailing comma**: the `assets` block uses trailing commas (it's JSONC).
  After removing the `run_worker_first` line, ensure the preceding line
  (`"not_found_handling": "404-page",`) still ends with a valid comma and the block
  remains valid JSONC.

## Phase 1: Apply routing fix & restore dev hydration

### Overview

Delete the `run_worker_first` directive and confirm Vite's dev asset routes serve
and islands hydrate under `npm run dev`.

### Changes Required:

#### 1. Wrangler asset routing config

**File**: `wrangler.jsonc`

**Intent**: Remove `run_worker_first: true` so the Cloudflare adapter's dev
runtime (and production) uses default assets-first routing, letting Vite's dev
middleware serve `/@vite/`, `/@id/`, `/src/` instead of the workerd SSR app
swallowing them.

**Contract**: The `assets` object loses the `run_worker_first` key entirely;
`binding`, `directory`, and `not_found_handling: "404-page"` are unchanged. File
remains valid JSONC.

### Success Criteria:

#### Automated Verification:

- `run_worker_first` key is gone and the file is still valid JSONC:
  `grep -q run_worker_first wrangler.jsonc` exits non-zero (absent), and the dev
  server starts without a config-parse error (implied by 1.2/1.3 requiring it
  running). Full config validation is covered authoritatively by `npm run build`
  in Phase 2.1 — no `wrangler deploy --dry-run` needed here (it would bundle the
  worker and require a built `./dist`, causing false negatives pre-build).
- Asset routes serve under dev: with `npm run dev` running, `curl -s -o /dev/null
  -w "%{http_code} %{content_type}" http://localhost:4321/@vite/client` returns
  `200 text/javascript` (repeat for `/@id/astro:scripts/before-hydration.js` and
  `/src/styles/global.css`).
- Island page loads: `curl -s -o /dev/null -w "%{http_code}"
  http://localhost:4321/auth/signin` returns `200`.

#### Manual Verification:

- In a browser at `http://localhost:4321/auth/signin`, the sign-in form is
  interactive (typing, validation, submit handler fire) — i.e. the React island
  hydrated; no `/@vite/` or `/src/` 404s in the network tab.
- A second island (local-engine enhance UI / dashboard) also hydrates.
- No hydration or "Invalid hook call" errors in the dev server terminal or
  browser console.

**Implementation Note**: After Phase 1 automated verification passes, pause for
human confirmation that the browser hydration check succeeded before starting
Phase 2.

---

## Phase 2: Verify production parity & capture the lesson

### Overview

Confirm assets-first routing does not regress production SSR or auth middleware,
using the workerd-fidelity path, then record the gotcha in `lessons.md`.

### Changes Required:

#### 1. Lessons register entry

**File**: `context/foundation/lessons.md`

**Intent**: Append a lesson so the `run_worker_first` ⇄ Astro-6-Cloudflare-dev
interaction is a prior for future planning/implementation, preventing a repeat
mis-diagnosis (e.g. blaming the Vite override).

**Contract**: New `##` section following the existing append-only format
(Context / Problem / Rule / Applies to). Captures: on Astro 6 with
`@astrojs/cloudflare`, dev SSR runs in workerd via `@cloudflare/vite-plugin`;
`assets.run_worker_first: true` makes the worker intercept Vite's dev asset
routes (`/@vite/`, `/@id/`, `/src/`) → 404 → islands don't hydrate; keep
assets-first (default) for SSR apps unless a route genuinely needs worker-first;
the `overrides: { vite: ^7 }` is the documented fix for the Vite-8 crash and must
not be removed.

### Success Criteria:

#### Automated Verification:

- Production build succeeds: `npm run build`.
- Format clean on touched files only: `npx prettier --write wrangler.jsonc
  context/foundation/lessons.md` (or `--check`). ESLint does not apply — its flat
  config targets `*.{ts,tsx,astro}`, not `.jsonc`/`.md` (lint-staged confirms),
  and neither touched file is lintable. Do NOT run repo-wide `lint:fix`.

#### Manual Verification:

- `npx wrangler dev` on the built output: SSR pages render (e.g. `/`, `/auth/signin`),
  built client assets under `/_astro/*` load (200), and islands hydrate.
- Auth middleware still gates protected routes: hitting `/dashboard`
  unauthenticated redirects to sign-in (proves the Worker + middleware still runs
  for non-asset/SSR requests under assets-first routing).
- An existing API route runs in the Worker (not served as a static asset): e.g.
  `POST /api/auth/signin` with an empty/invalid body returns a JSON response from
  the endpoint, proving the Worker executed under assets-first routing.

**Implementation Note**: After Phase 2 automated verification passes, pause for
human confirmation of the `wrangler dev` SSR + auth-middleware checks before
considering the change complete.

---

## Testing Strategy

### Manual Testing Steps:

1. `npm run dev` → open `/auth/signin`, confirm the form hydrates and the network
   tab shows `/@vite/client`, `/@id/...`, `/src/...` all 200.
2. `npm run build && npx wrangler dev` → confirm SSR pages render, `/_astro/*`
   assets load, islands hydrate, and `/dashboard` (unauthenticated) redirects.
3. Confirm no console/terminal hydration errors in either mode.

There are no unit/integration tests for this change — it is a runtime routing
config fix verified by reproduction.

## Migration Notes

No data or schema migration. The only state change is one removed config key; the
prior `build + wrangler dev` workaround remains valid but is no longer required
for routine dev.

## References

- Frame brief: `context/changes/dev-server-vite-assets-404/frame.md`
- Source: `wrangler.jsonc:7-12`; `astro.config.mjs:16`; `src/middleware.ts`;
  `package.json:62-64`.
- Cloudflare docs: `run_worker_first` (boolean vs array) —
  developers.cloudflare.com/workers/static-assets/binding & /routing/worker-script;
  default is `false` (assets-first).
- Origin commit: `861e6da` ("Lesson m1l5").

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Apply routing fix & restore dev hydration

#### Automated

- [x] 1.1 run_worker_first absent (`grep -q` exits non-zero) and dev server starts without a config-parse error — b5d6d27
- [x] 1.2 `/@vite/client`, `/@id/astro:scripts/before-hydration.js`, `/src/styles/global.css` return 200 under `npm run dev` — b5d6d27
- [x] 1.3 `/auth/signin` returns 200 under `npm run dev` — b5d6d27

#### Manual

- [x] 1.4 Sign-in form hydrates and is interactive in browser; no /@vite or /src 404s in network tab — b5d6d27
- [x] 1.5 A second island (local-engine / dashboard) hydrates — b5d6d27
- [x] 1.6 No hydration / Invalid hook call errors in terminal or console — b5d6d27

### Phase 2: Verify production parity & capture the lesson

#### Automated

- [x] 2.1 `npm run build` succeeds — 9a27d24
- [x] 2.2 Prettier clean on touched files (wrangler.jsonc, lessons.md); eslint N/A for these file types — 9a27d24

#### Manual

- [x] 2.3 `npx wrangler dev`: SSR pages render, /_astro/* assets load, islands hydrate — 9a27d24
- [x] 2.4 Unauthenticated `/dashboard` redirects to sign-in (middleware still runs under assets-first) — 9a27d24
- [x] 2.5 Existing API route (POST /api/auth/signin) returns JSON from the Worker, proving Worker execution under assets-first routing — 9a27d24
