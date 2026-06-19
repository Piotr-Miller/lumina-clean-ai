<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Fix Prod Sentry Source Maps (3.7)

- **Plan**: context/changes/sentry-prod-sourcemaps/plan.md
- **Mode**: Deep
- **Date**: 2026-06-18
- **Verdict**: REVISE
- **Findings**: 1 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

5/5 paths ✓ (new harness files correctly absent), config symbols ✓ (`sourceMapsUploadOptions`/`filesToDeleteAfterUpload`/`sourcemaps.assets` at `astro.config.mjs:23-37`), brief↔plan ✓. Deep codebase claims previously verified empirically during the research phase (4 agents + 2 build experiments).

## Findings

### F1 — Phase 3 heading mismatch breaks the Progress contract

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 body (plan.md:149) vs Progress (plan.md:288)
- **Detail**: Body heading "## Phase 3: Contingency — only if a runtime is still minified" does not match Progress "### Phase 3: Contingency (conditional)". The Progress contract requires exact-match phase names; `/10x-implement` parses Progress against the body and this mismatch will mis-associate or drop the phase. Phases 1/2/4 match correctly.
- **Fix**: Rename the Progress heading to match the body exactly: `### Phase 3: Contingency — only if a runtime is still minified`.
- **Decision**: FIXED

### F2 — Client causal chain is unexplained; Phase 1 may not fix the client

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Current State Analysis / Phase 1 framing
- **Detail**: The plan leads with the cross-build delete race as "the fix." That explains the deploy warning and a server/whichever-build map loss. But §3.7 recorded "33 client maps uploaded" AND client frames stayed minified — and the client bundle is NOT re-bundled. If client maps genuinely uploaded with matching debug IDs, the client should already resolve; that it didn't points to a SECOND client-side cause the delete-race fix doesn't address (deployed-vs-instrumented debug-id mismatch, or maps uploaded under a non-matching release). Phase 2's criterion 2.5 will catch this, but the plan frames Phase 1 as likely-sufficient when the client evidence says it may be necessary-but-not-sufficient.
- **Fix**: Add an explicit note in Current State Analysis that "33 client maps uploaded yet minified" is unexplained by the delete-race, so Phase 1 may not fix the client — set the expectation that Phase 2 likely routes a residual client cause into Phase 3. Documentation/expectation-setting only; no phase restructure.
- **Decision**: FIXED

### F3 — Source-map exposure window: privacy check runs only post-deploy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 (remove filesToDeleteAfterUpload) + Phase 2 (criterion 2.6)
- **Detail**: Removing `filesToDeleteAfterUpload` relies on the SDK's auto-delete firing in CI — a default behavior research flagged as likely but NOT verified (the specific default-glob claim was refuted 1-2). If auto-delete doesn't fire, hidden `.map` files land in `dist/client` and Cloudflare serves them as public static assets (source exposure). The only guard (2.6, "deployed .js.map returns 404") runs AFTER the prod deploy — so any exposure is already live when detected.
- **Fix**: Add an automated pre-deploy assertion that the built artifact contains no client `.map` before/at merge — e.g. a CI step (or deploy-log asset-list inspection) asserting `dist/client` has zero `*.map` after the token-bearing build, gating the deploy. Keep 2.6 as the live backstop.
- **Decision**: FIXED

### F4 — Phase 1 has no standalone verification; 1.4 passes trivially

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 success criteria (1.4) / Phase 1↔2 boundary
- **Detail**: Local builds emit 0 maps (token-gated), so 1.4 ("no .map in dist/client") passes regardless of the config — it validates nothing about the fix locally. And Phase 1 can't be deployed or verified alone; it only becomes testable bundled with Phase 2's route. An implementer could "complete" Phase 1 and expect a deploy.
- **Fix**: Note that Phase 1 + Phase 2 land in ONE PR/deploy (Phase 1 has no standalone deploy), and label 1.4 explicitly as a local privacy guard, not fix-validation.
- **Decision**: FIXED

### F5 — No concrete terminal fallback if both hypotheses fail

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 (~2-cycle bound → "reassess")
- **Detail**: Acceptance is "both must resolve" and Phase 3 bounds to ~2 cycles then "reassess with the user." If neither hypothesis is the cause, there's no defined exit — risk of an open-ended loop or an abandoned, still-deployed verify route.
- **Fix**: Name a concrete fallback at the bound — remove the route (run Phase 4 cleanup regardless), park 3.7 with findings, and open a focused follow-up — so the change always terminates clean.
- **Decision**: FIXED
