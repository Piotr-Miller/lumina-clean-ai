---
change_id: dev-ssr-dep-optimizer
title: "Fix issue #15 — dev SSR crash from mid-request Vite dep re-optimization"
status: archived
archived_at: 2026-08-23T22:05:00Z
created: 2026-08-23
updated: 2026-08-23
---

## Notes

Issue [#15](https://github.com/Piotr-Miller/lumina-clean-ai/issues/15), the
repo's only open bug, parked since 2026-06-08. Diagnosis and the one untried
knob were recorded in
`context/archive/2026-06-07-cloud-flip-on-revalidation/dev-ssr-known-issue.md`
(three approaches already tried and reverted — do not repeat).

## Reproduction (2026-08-23, before any change)

`rm -rf node_modules/.vite && npm run dev`, then GET `/`. The request hangs and
the dev log shows **two** sequential mid-request re-optimizations:

```
23:35:11 [vite] ✨ new dependencies optimized: astro/env/runtime
23:35:11 [vite] ✨ optimized dependencies changed. reloading
23:35:19 [vite] ✨ new dependencies optimized: astro/zod
23:35:19 [vite] ✨ optimized dependencies changed. reloading
23:35:19 [vite] [vite] An error happened during full reload
The file does not exist at ".../node_modules/.vite/deps_ssr/chunk-VXYXIWAI.js?v=6bcb5bb8"
which is in the optimize deps directory.
```

**New fact vs the archived note:** the trigger is not only `astro/env/runtime`
— `astro/zod` is a SECOND, later trigger, and it is the one whose reload
invalidated the in-flight chunk. The documented one-knob fix
(`ssr.optimizeDeps.include: ['astro/env/runtime']`) would have left this race
open, which is very likely why the issue looked unfixable.

The 2026-06-08 symptom ("more than one copy of React", `useState` of null) and
this one (missing `deps_ssr/chunk-*.js?v=`) are two faces of the same race:
the SSR optimizer re-emits chunks under fresh `?v=` hashes while an in-flight
render still holds the old ones.

## Fix

`astro.config.mjs` — `vite.ssr.optimizeDeps.include` listing every dep observed
being discovered mid-request, so all are pre-bundled at startup and nothing
re-optimizes while a render is in flight:

```js
["astro/env/runtime", "astro/zod", "@sentry/astro/middleware", "zod"];
```

The list was built by iteration, not guesswork: run → read the log → add the
deps it names → re-run, until a request produces no `new dependencies
optimized` line at all. Two rounds were needed — the second round is the
important one, because after round 1 the page already returned **200 while
still re-optimizing mid-request**. A passing render is not proof the race is
gone; only a clean log is.

Why `ssr.*` and not top-level `optimizeDeps` (confirmed against Vite 7.3.6
docs): top-level dep-optimization applies to the **client** environment only
and is deliberately not inherited by server environments — which is exactly
why the archived attempt #2 (client-side `optimizeDeps.include`) had no
effect. Vite merges `ssr.optimizeDeps` into `environments.ssr.optimizeDeps`.

Dev-only by construction: the dep optimizer does not run during `astro build`,
so production output is unaffected.

## Verification (2026-08-23, this machine)

| Round                     | Result                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Baseline (no fix)         | request hangs; `deps_ssr/chunk-*.js?v=` not-found crash; 2 mid-request re-optimizations; ready in **305s**          |
| Round 1 (2 deps included) | 200 OK — but **still 2 mid-request re-optimizations** (`@sentry/astro/middleware`, `zod`): race present, merely won |
| Round 2 (4 deps included) | 200 OK, **log completely clean** — zero `new dependencies optimized` lines; ready in **33s**                        |

Round 2, after `rm -rf node_modules/.vite`:

- `/` → 200, 94,909 bytes, H1 + enhance island + uploader all SSR-rendered (15.8s cold, 7.3s warm)
- `/auth/signin` 200, `/auth/signup` 200, `/guides/what-ruins-night-photos` 200, `/dashboard` → redirect (correct for protected)
- Across all 6 requests: no `new dependencies optimized`, no `An error happened`, no `does not exist`, no "more than one copy" — the issue's signature is gone

Production unaffected, as the dev-only reasoning predicts:

- `npm run build` (detached) → `[build] Complete!`, exit 0; prerendered guides + sitemap emitted normally
- `npm run typecheck` clean, `npm run lint` 0 errors, `npm run test:unit` 341 passed

## Closes

Issue #15. The E2E gate already serves a production build (`wrangler dev`), so
nothing in CI depended on the broken path — this restores `npm run dev` as a
usable local workflow rather than unblocking a gate.
