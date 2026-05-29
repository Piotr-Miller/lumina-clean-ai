# Frame Brief: npm run dev 404s Vite client assets → islands never hydrate

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Running `npm run dev` (= `astro dev`), the page HTML returns **200** but the
browser network tab shows **404** for `/@vite/client`,
`/@id/astro:scripts/before-hydration.js`, and `/src/styles/global.css`. As a
result **no React island hydrates** — auth forms and the local-engine UI alike.
Workaround in use: `npm run build && npx wrangler dev` (workerd), which serves
real hashed bundles and hydrates correctly. Affects all islands, not
feature-specific.

## Initial Framing (preserved)

- **User's stated cause or approach**: Likely the `overrides: { vite: ^7.3.2 }`
  in package.json clashing with the Vite that Astro 6.3.1 expects, **or** the
  `@astrojs/cloudflare` adapter's dev behavior.
- **User's proposed direction**: Investigate and restore working dev-server
  hydration.
- **Pre-dispatch narrowing**: (1) dev-server hydration was **never verified
  until now** — not confirmed as a regression from a previously-working state;
  (2) the 404s are observed in the **browser devtools network tab**; (3) origin
  of the vite override is **unknown** to the user.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Vite version override mismatch** — `overrides: { vite: ^7.3.2 }` forces a
   Vite incompatible with Astro 6.3.1's dev pipeline.  ← initial framing
2. **`@astrojs/cloudflare` adapter dev behavior** — adapter alters the dev
   server so Vite's client middleware (`/@vite/`, `/@id/`, `/src/`) is not
   served.  ← initial framing (alt)
3. **Astro 6 generic dev-server / `output:"server"` bug** — a dev-mode issue in
   Astro 6.3.x independent of the adapter.
4. **Environment/runtime interference** — stale service worker from a prior
   `wrangler dev`, wrong port, or Windows proxy/AV intercepting asset requests.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Vite override mismatch (initial framing) | `node_modules/astro/package.json` declares its OWN dep `"vite": "^7.3.2"`; installed Vite is **7.3.3**; single `vite` install. The override pins *exactly* what Astro wants. Moreover `overrides: { vite: ^7 }` is the **documented fix** for the adjacent Astro 6 + adapter v13 crash `require_dist is not a function` (cloudflare/workers-sdk#13063, withastro/astro#16029/#16062) — removing it would *regress*. | **NONE** |
| 2. `@astrojs/cloudflare` adapter dev behavior | **Reproduced.** `/auth/signin` (7 `astro-island` markers) references `/@vite/client`, `/@id/@astrojs/react/client.js`, `/@id/astro:scripts/before-hydration.js`, `/src/...`; each returns **Astro's own SSR "404: Not Found" page** — proving the request reached the workerd SSR app, not Vite. Astro 6 runs the Cloudflare adapter's SSR inside **workerd via `@cloudflare/vite-plugin`** in dev (confirmed: dev log `[@astrojs/cloudflare] Enabling image processing… / sessions with KV`; withastro/astro#16529, #16248, #15946; migration writeup). Adapter `dist/index.js` sets `cfVitePlugin({ viteEnvironment: { name: "ssr" } })`. **Root trigger:** `wrangler.jsonc:11` `"run_worker_first": true` forces the Worker to handle *every* request first — including Vite's dev asset routes — before the asset layer; unmatched → `not_found_handling: "404-page"`. | **STRONG** |
| 3. Astro 6 generic dev-server bug | Plain Astro SSR dev serves `/@vite/client` for thousands of projects; the failure is specific to the workerd dev runtime, not Astro core. The Explore agent's "core Astro bug" reading (SSR handler missing the `/@`,`/__` bypass) is incomplete — Vite's middleware normally runs *before* `astroDevHandler`; here the worker-first routing pre-empts it. | **WEAK** |
| 4. Environment/runtime interference | Clean reproduction on a freshly-started dev server; the 404 body is Astro's styled SSR 404, not a service-worker/proxy artifact. No SW registration in play. | **NONE** |

## Narrowing Signals

- **"Never verified until now"** ruled out "a recent change broke a working
  setup" and pointed at a config that has been wrong since the Cloudflare
  adapter was wired up — focusing the search on dev-mode architecture, not a
  regression bisect.
- **404 body is Astro's own SSR 404 page** (not Vite's, not a blank/proxy 404):
  decisive — the asset request is being *served by the worker*, so Vite's dev
  middleware is being bypassed entirely. This is the single observation that
  pinned dimension 2 and killed dimension 4.
- **Astro 6.3.1 itself depends on `vite ^7.3.2`** and the override is the
  documented fix for an adjacent bug: decisive against dimension 1.
- **`run_worker_first: true` in `wrangler.jsonc`**: the concrete config line
  that makes the worker pre-empt Vite's asset routes.

## Cross-System Convention

In Astro 6, `@astrojs/cloudflare` deliberately runs dev SSR in workerd so dev
matches production. The convention for that runtime is that the asset/static
layer (or Vite's dev middleware) must handle non-app routes, and the Worker
should run first only for *app* routes — not for every path. `run_worker_first:
true` (blanket) violates that, swallowing Vite's dev-only routes. Community
guidance uses a route-scoped form (e.g. an array that excludes the asset path)
rather than a blanket `true`. The leading hypothesis matches this convention.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: in Astro 6 the `@astrojs/cloudflare`
> adapter runs the dev SSR inside workerd via `@cloudflare/vite-plugin`, and
> `wrangler.jsonc`'s blanket `run_worker_first: true` makes that worker
> intercept Vite's dev-only asset routes (`/@vite/`, `/@id/`, `/src/`) and
> return the SSR 404 page — so the client runtime and hydration scripts never
> load and no island hydrates.

The initial framing was **wrong on the cause**: it is *not* the Vite override
(that override is correct and is the documented fix for a different Astro 6 +
Cloudflare crash — removing it would regress). It *is* the adapter's workerd dev
runtime, but specifically because of the `run_worker_first: true` routing
directive, not the adapter being inherently broken. Fixing the request-routing
so Vite's dev asset middleware serves `/@vite/`, `/@id/`, `/src/` (rather than
the worker swallowing them) is what restores hydration.

## Confidence

**HIGH** — root cause reproduced end-to-end (page 200, three named asset routes
404 with Astro's SSR 404 body, island page references those exact routes);
contradicting evidence for the override theory is concrete (Astro's own dep
constraint + documented-fix status); the trigger is isolated to a single config
line (`wrangler.jsonc:11`); and the mechanism is corroborated by upstream
issues and the dev-server log showing the Cloudflare workerd runtime active.

## What Changes for /10x-plan

Plan should target the **dev-mode request routing**, not the Vite override
(leave `overrides: { vite: ^7.3.2 }` intact). The fix space centers on
`wrangler.jsonc`'s `run_worker_first: true` / asset-routing config so Vite's dev
middleware serves `/@vite/`, `/@id/`, `/src/` while the worker still handles app
routes — to be confirmed against `@cloudflare/vite-plugin` / adapter v13.5.0
docs during planning. Success criterion: `npm run dev` serves those three asset
routes as 200 and islands hydrate without a build step.

## References

- Source files: `wrangler.jsonc:7-12` (`run_worker_first: true`,
  `not_found_handling: "404-page"`); `package.json:62-64` (vite override);
  `astro.config.mjs:16` (`adapter: cloudflare()`);
  `node_modules/astro/package.json` (`"vite": "^7.3.2"`);
  `node_modules/@astrojs/cloudflare/dist/index.js` (`cfVitePlugin … viteEnvironment: "ssr"`).
- Reproduction: `astro dev` on :4321 — `GET /@vite/client` → 404 (Astro SSR 404
  page); `GET /auth/signin` → 200 with 7 `astro-island` markers referencing the
  404ing routes.
- External: withastro/astro#16529, #16248, #15946; cloudflare/workers-sdk#13063
  (override is the documented fix); Astro 5→6 Cloudflare island migration
  writeup (workerd dev + `run_worker_first` routing caveat).
- Related research: none (`research.md` not present for this change).
- Investigation tasks: 1 Explore sub-agent (adapter dev hooks) + external
  research (exa, Context7) + local reproduction.
