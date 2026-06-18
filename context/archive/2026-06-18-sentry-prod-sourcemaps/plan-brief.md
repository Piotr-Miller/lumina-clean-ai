# Fix Prod Sentry Source Maps (3.7) — Plan Brief

> Full plan: `context/changes/sentry-prod-sourcemaps/plan.md`
> Research: `context/changes/sentry-prod-sourcemaps/research.md`

## What & Why

Production Sentry stack traces resolve to **minified** code on both the browser and workerd server, making prod debugging painful. The cause is the `@sentry/astro` source-map config in `astro.config.mjs` — specifically a repo-wide `filesToDeleteAfterUpload` that races the Cloudflare adapter's two separate vite builds, so uploaded maps don't match the deployed bundles. We fix the config and prove both runtimes de-minify.

## Starting Point

Debug IDs are already injected (14/14 client, 36/36 server) and maps already upload in CI ("33 client maps uploaded") — so this is **not** a secrets or injection problem. The failure is downstream of upload, and `no_bundle: true` means the server bundle isn't re-bundled (its debug IDs are likely preserved). PR #43's earlier `sourcemaps.assets` fix was correct but insufficient; its sibling `filesToDeleteAfterUpload` is the prime suspect.

## Desired End State

A real error in prod yields a Sentry event whose frames resolve to original `*.tsx`/`*.astro`/`*.ts` sources with real names + lines, for **both** runtimes. The `Didn't find any matching sources for debug ID upload` deploy warning is gone, and no `.map` files are publicly served.

## Key Decisions Made

| Decision                 | Choice                                                                                                 | Why                                                                                                                       | Source                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Map generation + cleanup | Let the SDK auto-manage (remove manual `filesToDeleteAfterUpload`, leave `vite.build.sourcemap` unset) | SDK auto-enables `hidden` + deletes per-build after upload, killing the cross-build race and keeping maps off the browser | Plan (grounded in Research) |
| Config shape             | Hoist `org/project/authToken` to top-level                                                             | `sourceMapsUploadOptions` is deprecated in 10.x (still honored, but canonical form is top-level)                          | Research                    |
| `assets` glob            | Keep `["./dist/**/*"]`                                                                                 | Maintainer-recommended broad glob; plugin auto-filters — narrowing would break it                                         | Research                    |
| Verify route lifecycle   | Temporary add → verify → remove; fixture preserved in docs                                             | A query-string-secret throw-endpoint in prod leaks via logs/history — needless exposure                                   | Plan (user + GPT-5.5)       |
| Verify scope             | Source-map cases only (client throw + server throw)                                                    | Privacy scrub is already unit-tested + verified                                                                           | Plan                        |
| Acceptance bar           | Both runtimes must resolve                                                                             | Fully closes 3.7                                                                                                          | Plan (user)                 |
| Contingency              | Iterate within this change (~2 deploy cycles max)                                                      | Verify harness already deployed; drives to a real fix                                                                     | Plan (user)                 |

## Scope

**In scope:** `astro.config.mjs` source-map config fix; temporary guarded verify route; CI deploy + live Sentry verification of both runtimes; route removal + close-out.

**Out of scope:** narrowing `assets`; setting `vite.build.sourcemap` explicitly; re-testing the privacy scrub; a permanent verify fixture; CI-secret / `no_bundle` / `@sentry/cloudflare` changes (unless Phase 3 contingency requires).

## Architecture / Approach

Single config edit is the fix; because generation is token-gated, it's only provable in CI. So we bundle a temporary guarded verify route into the same deploy, inspect both runtimes in Sentry, and (if needed) iterate one more cycle for the server/`no_bundle` path before removing the route and closing.

## Phases at a Glance

| Phase                        | What it delivers                                                | Key risk                                     |
| ---------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| 1. Config fix                | `astro.config.mjs` corrected (SDK-managed maps, hoisted config) | Can't be validated locally (token-gated)     |
| 2. Verify + deploy           | Temporary route, CI deploy, both runtimes inspected in Sentry   | Requires PR→master; manual Sentry inspection |
| 3. Contingency (conditional) | Next-hypothesis fix if a runtime still minified                 | Server debug-id/`no_bundle` path uncertainty |
| 4. Remove + close            | Route deleted, clean deploy, 3.7 closed                         | None significant                             |

**Prerequisites:** CI deploy secrets present (already are); ability to view the Sentry project (manual step — Claude has no Sentry tool); master-PR-only workflow.
**Estimated effort:** ~1–2 sessions across 4 phases, gated by 1–2 CI deploy-verify cycles.

## Open Risks & Assumptions

- **Verification is human-in-the-loop**: Claude has no Sentry dashboard access — the de-minification check is the user's (same boundary as the 3.10 session).
- Assumes CI build (with token) generates + uploads client+server maps as research indicates; only the _matching_ was broken.
- Server side assumes `no_bundle: true` preserves debug IDs end-to-end (#14841 mitigated) — confirmed only at Phase 2.
- The temporary route rides master briefly (guarded); removed in Phase 4.

## Success Criteria (Summary)

- Both client and server prod frames resolve to original sources in Sentry.
- No `Didn't find any matching sources for debug ID upload` deploy warning; no public `.map` files.
- Verify route removed; 3.7 marked resolved in memory.
