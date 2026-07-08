<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Landing 2.0 - Content, Guides, Tooltips, Brand Lockup

- **Plan**: `context/changes/landing-content/plan.md`
- **Scope**: Phase 1 of 5
- **Date**: 2026-07-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Success Criteria Verification

- **1.1 `npm run typecheck`**: PASS
- **1.2 `npm run build`**: PASS after rerun outside the sandbox; the initial failure was Wrangler/AppData write permissions, not an implementation error
- **1.3 Lint clean on touched files**: PASS via `npx prettier --check` on Phase 1 files and `npx eslint src/components/Nav.astro src/layouts/Layout.astro`
- **1.4 Nav + lockup verified on all pages**: marked complete in Progress; not independently re-verified in CLI
- **1.5 New favicon visible**: marked complete in Progress; not independently re-verified in CLI
- **1.6 Lockup propagated to kit cards in Claude Design**: marked complete in Progress, but repo-local evidence still points to an unsynced card variant
- **Mutation check**: skipped; Phase 1 touches no `test-plan.md` section 4 risk-critical module

## Findings

### F1 - Phase 1 shipped a different brand-asset contract than the plan still describes

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/landing-content/plan.md:61`, `context/changes/landing-content/plan.md:75`, `src/components/Nav.astro:18`, `src/layouts/Layout.astro:19`
- **Detail**: The Phase 1 plan still describes a lockup built from the card's beam-tile mark and a new `public/favicon.svg` with PNG fallback, but the implementation uses `public/images/brand-mark.png` for the nav mark and links only the PNG favicon. The repo-local spec documents that this was a conscious user decision, but the source-of-truth plan was not updated to match, so future reviews will read this as unexplained drift.
- **Fix**: Amend Phase 1 in `plan.md` to record the shipped `brand-mark.png` nav asset and PNG-only favicon contract, or restore the original `favicon.svg` implementation so code matches plan.
- **Decision**: RESOLVED 2026-07-06 — plan amended (the implementation was the user's explicit in-flight decision, so the plan follows the code): Phase 1 changes #1 and #3 now describe the shipped `brand-mark.png` mark and the PNG-only versioned favicon, each with a dated amendment note pointing at the spec.

### F2 - Manual step 1.6 is checked complete even though repo-local evidence says the design record still needs sync-back

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/landing-content/plan.md:331`, `context/changes/landing-content/design/brand-lockup-spec.md:61`
- **Detail**: Progress marks "Lockup propagated to kit cards in Claude Design" as complete, but the repo-local lockup spec says the shipped nav/favicon now use the original PNG mark while the kit cards still show the earlier beam-tile variant and need a sync-back during Phase 5. That means the manual success criterion is currently overstated in the repo's own evidence trail.
- **Fix A - Recommended**: Uncheck manual step 1.6 until the Claude Design cards match the shipped mark variant.
  - Strength: Keeps Progress aligned with observable evidence and prevents later reviews from treating an open visual sync task as done.
  - Tradeoff: Phase 1 remains partially open on paper until the design sync lands.
  - Confidence: HIGH - the contradiction is explicit in the repo-local spec.
  - Blind spot: The external Claude Design project may already have been updated again after the spec note was written, but that evidence is not captured in the repo.
- **Fix B**: Keep 1.6 checked, but update the repo-local spec immediately with proof that the card sync was completed after the original note.
  - Strength: Preserves the current Phase 1 closure if the external design record is actually already consistent.
  - Tradeoff: Requires adding fresh evidence into the repo now; without that, the checkbox still overclaims.
  - Confidence: MEDIUM - possible if the external project has moved on since the spec note, but unproven from the current checkout.
  - Blind spot: The CLI cannot inspect the external Claude Design project directly.
- **Decision**: RESOLVED 2026-07-06 — Fix B executed with fresh evidence: the pane agent replaced the beam-tile mark with the original mark image (data URI) on all 13 cards AND `foundations/brand-lockup.html` (its confirmation: "Edited 19 files"; extracted mark saved as `foundations/assets/lc-mark.png`). The repo-local spec's stale "sync at Phase 5" note replaced with the sync record. 1.6 stays checked, now truthfully.
