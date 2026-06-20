---
change_id: e2e-build-server
title: Serve a production build (wrangler dev) for the E2E gate instead of astro dev
status: new
created: 2026-06-20
updated: 2026-06-20
archived_at: null
issue: null
---

## Notes

Chore — hardens the Playwright E2E gate against the dev-only Vite SSR
"more than one copy of React" crash (**issue #15**).

### Problem

Playwright's webServer ran `npm run dev` (`astro dev`). Astro 6 +
`@astrojs/cloudflare` runs dev SSR in workerd, and Vite's SSR dep-optimizer
intermittently re-optimizes mid-request, re-emitting `react-dom/server` under a
fresh `?v=` hash that desyncs from the already-loaded React → null hooks
(`useState` on a `null` dispatcher) when SSR-rendering the enhance page
(`EnhanceWorkspace` → `useLocalEnhance`). On a fresh CI runner this crashes the
home/enhance SSR **before** the specs assert anything. Likely recent trigger:
the 2026-06-18 Vite/Sentry config change (a new Vite plugin forces a re-optimize).

### Change

- `package.json`: add `"test:e2e:serve": "npm run build && wrangler dev --port 4321"`.
- `playwright.config.ts`: webServer `command` → `npm run test:e2e:serve`,
  `timeout: 180_000`, `reuseExistingServer: false`. Port 4321 keeps the
  fixture-server's :8787 clear and leaves `baseURL` unchanged.
- `.github/workflows/ci.yml`: no separate build step — the webServer builds once
  and inherits the job env; comments updated.
- Docs: `CLAUDE.md`, `AGENTS.md`, `context/foundation/test-plan.md` §6.3,
  `context/foundation/roadmap.md` (#15 marked _mitigated for E2E_),
  `context/foundation/lessons.md` (existing #15 lesson extended).

### Why a full switch (not CI-only)

E2E is already a heavy gate (Supabase stack + a 30 s stall spec), so one build
per run is an acceptable cost for an **identical runtime locally and in CI** and
no remaining exposure to #15. The production build path is verified #15-free.

### Scope boundary — this is a mitigation, not a fix

`npm run dev` itself is still affected by #15. Keep issue #15 **open** until the
dev path is fixed (untried knob: `vite.ssr.optimizeDeps.include: ['astro/env/runtime']`)
or `astro dev` is deliberately declared unsupported for the enhance page.
`context/archive/2026-06-07-cloud-flip-on-revalidation/dev-ssr-known-issue.md`
holds the original diagnosis (archived — immutable, not edited by this change).
