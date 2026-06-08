# Known issue (DEFERRED): `npm run dev` SSR crash on the enhance page

Surfaced during D.1 Phase 3 setup (2026-06-08). **Not** caused by D.1 — a latent dev-tooling bug. Deferred to its own future investigation; D.1 works around it by driving Phase 3 via a script (no browser). Recorded here so the evidence isn't lost.

## Symptom

`npm run dev` → load `http://localhost:4321/` → SSR crash rendering the React island:

```
[vite] ✨ new dependencies optimized: astro/env/runtime
[vite] ✨ optimized dependencies changed. reloading
[ERROR] Invalid hook call ... more than one copy of React
[ERROR] TypeError: Cannot read properties of null (reading 'useState')
    at useState (node_modules/.vite/deps_ssr/chunk-*.js?v=AAAA)
    at useLocalEnhance (src/components/hooks/useLocalEnhance.ts:46)
    at EnhanceWorkspace (src/components/enhance/EnhanceWorkspace.tsx:41)
    at ... node_modules/.vite/deps_ssr/react-dom_server.js?v=BBBB
```

The two `deps_ssr` bundles carry **different** `?v=` hashes (React in `chunk-*?v=AAAA`, react-dom/server in `react-dom_server?v=BBBB`) — they desync, so React's internals are null in the renderer.

## Root cause (diagnosis, not yet fixed)

- **Single React copy installed** — `npm ls react react-dom` shows `19.2.6` deduped everywhere; `overrides.vite ^7.3.2` intact. So it is NOT a node_modules duplication.
- The crash is a **transient of Vite's SSR dep optimizer**: on the first request that pulls `astro/env/runtime`, Vite re-optimizes the SSR deps mid-request and reloads, re-emitting `react-dom_server` under a new `?v=` hash that no longer matches the already-loaded React → "more than one copy of React".
- Environment: Astro 6.3.1 + `@astrojs/cloudflare` (dev SSR in workerd) + React 19.2.6 + Vite 8 (via `overrides.vite ^7.3.2`).

## What was tried (all FAILED — do not repeat blindly)

1. Clear `node_modules/.vite` + restart → reproduces (it's request-time discovery, not stale cache).
2. `vite.resolve.dedupe: ['react','react-dom']` + client `vite.optimizeDeps.include: ['astro/env/runtime']` → no effect (wrong layer — crash is in the **SSR** optimizer `deps_ssr/`).
3. `vite.ssr.noExternal: ['react','react-dom']` (the Astro-documented fix for multiple-React-in-SSR, via Context7) → no effect; `react-dom_server` still lands in `deps_ssr/`.

All three reverted. Per `lessons.md` ("don't fight the Astro6+CF+Vite+React19 config"), stopped guessing.

## Next investigation (for a dedicated change)

- Try `vite.ssr.optimizeDeps.include: ['astro/env/runtime']` (the one knob aimed at the actual trigger — pre-bundle it in the **SSR** optimizer so no mid-request re-optimization fires). Untried.
- Build a minimal repro (Astro 6 + @astrojs/cloudflare + @astrojs/react + an island using a hook + an `astro:env` import) and search/ file an upstream issue (@astrojs/cloudflare or astro core) — this looks like a dev-SSR dep-optimizer ordering bug, likely upstream.
- Confirm whether removing the `astro:env` import from the home render path avoids the trigger (narrows the cause).

## Workaround in use

D.1 Phase 3's live submit is driven by a **script** (`createPhotoJob` + real source PUT → DB webhook → `/start` → Replicate → `/callback`), which exercises the full real pipeline without the dev-server UI. The browser UI is unaffected in **production** (the crash is dev-only; `npm run build` is green and prod serves fine).
