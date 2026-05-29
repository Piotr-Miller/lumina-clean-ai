<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Dev-Server Vite Assets 404 → Restore Island Hydration

- **Plan**: `context/changes/dev-server-vite-assets-404/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-29
- **Verdict**: SOUND (post-triage — all 3 findings fixed in plan; was REVISE)
- **Findings**: 0 critical · 2 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

5/5 paths ✓, 3/3 symbols ✓, brief↔plan ✓, blast radius: contained (`run_worker_first` appears only in `wrangler.jsonc`; no code importers). Central safety claim verified against code: `src/middleware.ts:18-21` redirects `/dashboard`→`/auth/signin` when unauthenticated; top-level routes (`api`, `auth`, `dashboard`, `index`) do not collide with `/_astro/` or public files (`favicon.png`, `template.png`), so assets-first routing shadows no SSR route.

## Findings

### F1 — Success criterion 2.5 tests a route that doesn't exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Manual Verification (2.5)
- **Detail**: 2.5 says "An authenticated /api/* route executes Worker logic (not served as static asset)." The only API routes are `src/pages/api/auth/{signin,signup,signout}.ts` — none are auth-gated (no `locals.user` / 401 checks). There is no "authenticated /api/*" route to exercise; the implementer cannot run this step as written.
- **Fix**: Reword 2.5 to use an existing endpoint — e.g. "POST `/api/auth/signin` returns a JSON response (proving the Worker executed, not a static asset served)." The intent (confirm `/api/*` hits the Worker under assets-first routing) is preserved with a route that actually exists.
- **Decision**: FIXED (Fix in plan)

### F2 — Phase 1.1 verification command is garbled and fragile

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Automated Verification (1.1)
- **Detail**: 1.1 reads: "`npx wrangler types` (or `node -e "require('jsonc-parser')"` is not available — instead) parse-check via `npx wrangler deploy --dry-run --outdir /tmp/wr-dryrun`." The prose is broken, and `wrangler deploy --dry-run` bundles the worker entry (`@astrojs/cloudflare/entrypoints/server`) and expects `assets.directory: ./dist` to exist — neither is true before a build, so it can fail for reasons unrelated to this one-line edit (false negative). Authoritative config validation already happens when the dev server starts (1.2/1.3 require it running) and at `npm run build` (2.1).
- **Fix**: Replace 1.1 with a lightweight check — confirm the key is gone and the file is valid JSONC: `grep -q run_worker_first wrangler.jsonc` returns non-zero (absent), and the dev server starts without a config error. Drop the wrangler-dry-run.
- **Decision**: FIXED (Fix in plan)

### F3 — 2.2 runs eslint on file types it doesn't lint

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Automated Verification (2.2)
- **Detail**: 2.2 prescribes `npx eslint wrangler.jsonc`. The ESLint flat config targets `*.{ts,tsx,astro}` (lint-staged confirms: eslint only on those; prettier on `*.{json,css,md}`). eslint won't meaningfully lint `.jsonc` or `.md` — the command is a no-op or "no matching files" noise. Touched files here are only `wrangler.jsonc` and `lessons.md`.
- **Fix**: Drop eslint from 2.2; `npx prettier --write wrangler.jsonc context/foundation/lessons.md` (or `--check`) is the right and sufficient check for these file types.
- **Decision**: FIXED (Fix in plan)
