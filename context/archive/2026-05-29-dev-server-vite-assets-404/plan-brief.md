# Dev-Server Vite Assets 404 → Restore Island Hydration — Plan Brief

> Full plan: `context/changes/dev-server-vite-assets-404/plan.md`
> Frame brief: `context/changes/dev-server-vite-assets-404/frame.md`

## What & Why

`npm run dev` serves page HTML (200) but 404s Vite's dev client assets
(`/@vite/client`, `/@id/astro:scripts/before-hydration.js`, `/src/...`), so no
React island hydrates. **Root cause (frame, HIGH confidence): `wrangler.jsonc`'s
`run_worker_first: true` makes the Astro 6 Cloudflare adapter's workerd dev
runtime invoke the SSR app for every request — including Vite's internal asset
routes — which match no route and return Astro's 404 page.** Removing the
directive restores assets-first routing and lets Vite serve those routes.

## Starting Point

Astro 6 `output: "server"` app with `@astrojs/cloudflare` (dev SSR runs in
workerd via `@cloudflare/vite-plugin`). `wrangler.jsonc:7-12` sets
`run_worker_first: true` (added in commit `861e6da`, "Lesson m1l5", no recorded
rationale). The `overrides: { vite: ^7.3.2 }` is correct and unrelated — it's the
documented fix for a separate Vite-8 crash. Today devs work around the bug with
`npm run build && npx wrangler dev`.

## Desired End State

`npm run dev` serves the three asset routes as 200 and islands (auth forms,
local-engine UI) hydrate with no build step. Production is unchanged: `build +
wrangler dev` still renders SSR pages, serves `/_astro/*` assets, and the auth
middleware still gates protected routes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Root cause | `run_worker_first: true` swallows Vite dev routes | 404 body is Astro's own SSR 404 page; toggling the flag fixed it live | Frame |
| Vite override | Leave intact | It's the documented fix for the Astro-6+CF Vite-8 crash, not this bug | Frame |
| Fix form | Remove `run_worker_first` (default assets-first) | Simplest; SSR/`api` still hit the Worker, only real assets skip it; no dev-path leakage into prod config | Plan |
| Scope | Routing fix + thorough verification only | Adjacent dep-optimizer hydration races aren't observed here — avoid cargo-culting | Plan |
| Verification | Dev hydration **and** prod parity (build + wrangler dev + auth) | The only real risk is a production routing regression | Plan |

## Scope

**In scope:** delete `run_worker_first` from `wrangler.jsonc`; verify dev
hydration; verify production SSR + asset serving + auth-middleware parity; record
a `lessons.md` entry.

**Out of scope:** the Vite override; React dep-optimizer hardening
(dedupe/optimizeDeps/edge alias); `not_found_handling` / `disable_nodejs_process_v2`
changes; the selective-array `run_worker_first` form.

## Architecture / Approach

One-line config deletion. Routing reverts to Cloudflare's default: a request
matching a static asset (`/_astro/*`, public files, and in dev Vite's `/@vite/`,
`/@id/`, `/src/` routes) is served directly; everything else (SSR pages, `/api/*`)
falls through to the Worker, where the auth middleware runs. Astro namespaces
client assets so they never shadow SSR page routes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Apply fix & restore dev hydration | `run_worker_first` removed; dev asset routes 200; islands hydrate | None material — fix already proven during framing |
| 2. Verify prod parity & capture lesson | `build + wrangler dev` SSR/assets/auth confirmed; `lessons.md` entry | Assets-first inadvertently bypassing SSR/middleware for an app route (mitigated by Astro's `/_astro/` namespacing) |

**Prerequisites:** local dev runnable (`npm run dev`); Docker/Supabase not
required for the routing check; for Phase 2 auth check, the usual env/secrets.
**Estimated effort:** ~1 short session, 2 phases.

## Open Risks & Assumptions

- **Assumption**: the m1l5 `run_worker_first: true` was not added to satisfy a
  deliberate need to run middleware on asset requests (no evidence it was; assets
  are public). Phase 2's auth-middleware check guards against a surprise.
- **Assumption**: no SSR route path collides with a static-asset path (true given
  Astro's `/_astro/` + `public/` namespacing).

## Success Criteria (Summary)

- `npm run dev`: the three asset routes return 200 and islands hydrate — no build step.
- `build + wrangler dev`: SSR pages render, `/_astro/*` assets load, islands hydrate.
- Unauthenticated `/dashboard` still redirects to sign-in (middleware intact).
