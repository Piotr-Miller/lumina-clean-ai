<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Landing 2.0 - Content, Guides, Tooltips, Brand Lockup

- **Plan**: `context/changes/landing-content/plan.md`
- **Scope**: Phases 1-5 of 5
- **Date**: 2026-07-08
- **Verdict**: NEEDS ATTENTION → **RESOLVED (2026-07-08)** — both warnings triaged and closed; see Resolution below
- **Findings**: 0 critical, 2 warnings, 0 observations (both now resolved)

## Resolution (2026-07-08)

- **F1 — WON'T FIX (false positive).** Re-verified against a clean detached `npm run build` (exit 0): the sitemap **does** ship. `dist/client/sitemap-index.xml` (188 B) and `dist/client/sitemap-0.xml` (625 B) are both present in the served asset directory alongside `dist/client/robots.txt`; `sitemap-0.xml` lists exactly `/` + the three guides with `/auth` and `/dashboard` filtered out, and `robots.txt` points at the file that exists. Source analysis confirms the mechanism: in `output: "server"` Astro hands `@astrojs/sitemap` `dir = getClientOutputDirectory()` = `config.build.client` (`dist/client/`), and with `base: "/"` the Cloudflare adapter never relocates that dir, so the file lands exactly where the Worker serves it. The original F1 was a flaky-build artifact — the machine's known detached-build requirement means the review paired a success log from one build with a `Get-ChildItem` against a stale/partial `dist` from another. **No code change.** Success Criteria therefore PASSES.
- **F2 — FIXED.** `plan.md` amended with a 2026-07-07 addendum block (FAQ 4 → 5 items + the inline `workspace.cloudSingleJobHint` surface in `EnhanceWorkspace.tsx`) plus a pointer at the Phase 3 FAQ line. The saved plan now describes the final shipped scope.

## Verdicts

| Dimension           | Verdict                                                           |
| ------------------- | ----------------------------------------------------------------- |
| Plan Adherence      | WARNING                                                           |
| Scope Discipline    | WARNING                                                           |
| Safety & Quality    | PASS                                                              |
| Architecture        | PASS                                                              |
| Pattern Consistency | PASS                                                              |
| Success Criteria    | ~~FAIL~~ → **PASS** (F1 resolved — sitemap ships; see Resolution) |

## Success Criteria Verification

- **`npm run typecheck`**: PASS
- **`npm run build`**: PASS. The old sitemap warning is gone and the build prerendered all three guide routes. ~~The expected sitemap artifact is still missing from the shipped output (see F1).~~ **Corrected 2026-07-08:** a clean detached build ships `dist/client/sitemap-index.xml` + `dist/client/sitemap-0.xml`; the earlier "missing" reading was a stale-`dist` false positive (see F1 Resolution).
- **Touched-file lint/format**: PASS via `npx prettier --check` and `npx eslint` on the changed landing-content files
- **`npm run test:unit`**: PASS (21 files / 277 tests)
- **Meta / OG / canonical wiring**: CONFIRMED by source inspection in `src/layouts/Layout.astro` and `src/pages/guides/[slug].astro`
- **`npm run test:e2e`**: not independently rerun to completion in this pass. The repo's current setup still requires the documented local Supabase + served-function stack (`context/foundation/test-plan.md:220-225`); `npx supabase status` could not reach the local Docker daemon on this machine, and Playwright's `webServer` exited during bootstrap before the specs ran. Existing repo evidence remains the saved Phase 4 review and the `change.md` note for the 2026-07-07 single-job copy amendment.
- **Mutation check**: skipped; none of the reviewed files are `test-plan.md` section 4 risk-critical modules

## Findings

### F1 - Phase 5 claims a sitemap that the current build does not actually ship

- **Severity**: WARNING
- **Impact**: HIGH - architectural stakes; think carefully before deciding
- **Dimension**: Success Criteria
- **Location**: N/A (missing `dist/client/sitemap-index.xml` after build; source intent at `astro.config.mjs:32`, `context/changes/landing-content/plan.md:267`, outbound reference at `public/robots.txt:4`)
- **Detail**: The current `npm run build` logs `[@astrojs/sitemap] sitemap-index.xml created at dist\client`, but `Get-ChildItem dist -Recurse -Filter *sitemap*` returns nothing, and the final asset tree under `dist/client` contains no sitemap file. The built worker serves static assets from `dist/client` (`dist/server/wrangler.json` points `assets.directory` at `../client`), so crawlers following `robots.txt` will request a sitemap that is not actually present in the shipped output. That breaks the core Phase 5 SEO proof even though the integration no longer prints the old warning.
- **Fix A ⭐ Recommended**: Make the sitemap physically present in the shipped asset set before closing the change - either by fixing the Cloudflare/Astro build path so the generated XML survives into `dist/client`, or by serving the sitemap explicitly as a route.
  - Strength: Restores the central Phase 5 promise (`/` + all guides indexable) without reopening unrelated landing work.
  - Tradeoff: Needs one more build/debug loop in the adapter/output layer, not just a copy tweak in page code.
  - Confidence: HIGH - the build log claims creation, but the final `dist` tree and asset directory do not contain the file.
  - Blind spot: I did not deploy the worker, so I have not proven whether some runtime-only route serves the sitemap despite the missing artifact; there is no repo-local evidence of such a route.
- **Fix B**: If the sitemap is intentionally not part of the shipped output for this adapter/runtime, remove the `robots.txt` pointer and update the plan/SEO claims until a real sitemap-serving path exists.
  - Strength: Makes the public contract truthful immediately and avoids pointing bots at a 404.
  - Tradeoff: Gives up the sitemap-based discovery benefit that Phase 5 explicitly set out to add.
  - Confidence: MEDIUM - safe as a truthfulness patch, but weaker than restoring the intended behavior.
  - Blind spot: Does not address why the integration claims success while shipping nothing.
- **Decision**: **RESOLVED — WON'T FIX (false positive).** Clean detached build ships the sitemap into `dist/client/`; robots.txt pointer is honest. Neither Fix A nor Fix B needed. See Resolution (2026-07-08).

### F2 - The late single-job copy amendment never got folded back into the saved plan

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/landing-content/plan.md:5`, `context/changes/landing-content/plan.md:164`, `context/changes/landing-content/change.md:90`, `src/lib/enhance-strings.ts:78`, `src/components/enhance/EnhanceWorkspace.tsx:503`
- **Detail**: After Phase 5, this change picked up a user-requested cloud single-job notice in two places: a fifth FAQ item and an inline processing hint in `EnhanceWorkspace.tsx`. `change.md` records that amendment, but `plan.md` still describes Phase 3 as an FAQ with 4 items and still frames the change as the original landing/guides/tooltips/nav/SEO package. The implementation is understandable and still content-oriented, but the saved plan no longer describes the final shipped scope, so future reviews will read the `EnhanceWorkspace.tsx` touch as unexplained drift.
- **Fix**: Amend `plan.md` with the 2026-07-07 addendum - note the FAQ growth from 4 to 5 items and the inline `workspace.cloudSingleJobHint` surface in `EnhanceWorkspace.tsx` - or move that copy change into its own follow-up change if the landing-content plan must remain exact.
- **Decision**: **RESOLVED — FIXED.** `plan.md` amended with the 2026-07-07 addendum block + Phase 3 FAQ pointer. See Resolution (2026-07-08).
