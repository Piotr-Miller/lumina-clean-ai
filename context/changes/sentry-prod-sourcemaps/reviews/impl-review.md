<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Fix Prod Sentry Source Maps (3.7)

- **Plan**: context/changes/sentry-prod-sourcemaps/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-06-18
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations
- **Commits**: 1508dd8 (p1), e7ebae6 + 72647f1 (p2), 6f0016a (p3), c44fe49 (p4) — PRs #48/#49/#50/#53

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Summary

The change achieves its goal — client Sentry stack traces de-minify in prod (`case=client` → `src/components/SentryVerifyClient.tsx:17`, verified live). Net code surface: `astro.config.mjs` (sourcemap config) + `.github/workflows/ci.yml` (pre-deploy no-`.map` guard); the temporary `/sentry-verify` route was added (p2) and removed (p4), net absent on master. Automated criteria green on the final state (typecheck 0, eslint 0, guard PASS, maps not shipped → `.js.map` 404). Phase 3 correctly superseded Phase 1's disproven delete-race hypothesis via the plan's contingency path; the real fix was the Astro-6 client-environment sourcemap key.

## Findings

### F1 — Contradictory leftover comment in astro.config.mjs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: astro.config.mjs (integrations comment vs sourcemaps block)
- **Detail**: The Phase 1 comment block still says "we deliberately do NOT set `filesToDeleteAfterUpload`" (citing the delete-race), but Phase 3 re-added `filesToDeleteAfterUpload: ["./dist/**/*.map"]` two lines below with its own (contradicting) comment. Verified: file contains both the "NOT set" comment (1×) and the key (1×). Future readers get conflicting guidance, and the delete-race rationale was disproven (real bug = client-env map generation).
- **Fix**: Rewrite the integrations comment to match the final design — maps generated for BOTH builds (the two sourcemap settings), `filesToDeleteAfterUpload` deletes after upload, delete-race fear was unfounded. Bundle into the epilogue PR (no separate deploy).
- **Decision**: FIXED (Fix now — comment rewritten in astro.config.mjs; lands in epilogue PR)

### F2 — Two success criteria intentionally unmet (accepted)

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: Progress 2.4, 2.5
- **Detail**: 2.4 (no debug-ID warning) and 2.5 (server frames resolve) are `[ ]` — documented accepted residuals (benign warning; server left readable-but-unmapped per the explicit client-only scope). All automated criteria pass; client de-minify verified live.
- **Fix**: None — accepted + documented in research.md/memory; surface as informational warnings under /10x-archive (correct).
- **Decision**: ACCEPTED (documented residuals; no action)

### F3 — Verify-route secret lived in git history

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: git history (e7ebae6 → c44fe49), src/pages/sentry-verify.astro
- **Detail**: The temporary route's hardcoded key `sv_938765fb…` was committed and live on prod for ~hours, then removed. Now inert (route gone; it only gated a throw-route, protected no secret data). No rotation needed.
- **Fix**: None — note for awareness; don't reuse this exact key for a future harness.
- **Decision**: ACCEPTED (inert; note for awareness)
