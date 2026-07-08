<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Landing 2.0 - Content, Guides, Tooltips, Brand Lockup

- **Plan**: `context/changes/landing-content/plan.md`
- **Scope**: Phase 2 of 5
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
| Success Criteria    | PASS    |

## Success Criteria Verification

- **2.1 `npm run typecheck`**: PASS
- **2.2 `npm run build`**: PASS after rerun outside the sandbox; the initial failure was Wrangler/AppData write permissions, not an implementation error. Build emitted all three prerendered guide pages.
- **2.3 Lint clean on touched files**: PASS via `npx prettier --check` on the touched Phase 2 files and `npx eslint src/content.config.ts src/pages/guides`
- **2.4 User approves image set + licenses**: marked complete in Progress; repo-local evidence supports Pexels-licensed assets recorded in article frontmatter
- **2.5 User copy-review of all three articles**: marked complete in Progress; not independently re-verified in CLI
- **2.6 Guide pages verified desktop + 375px**: marked complete in Progress; not independently re-verified in CLI
- **Mutation check**: skipped; Phase 2 touches no `test-plan.md` section 4 risk-critical module

## Findings

### F1 - Phase 2 under-ships the article imagery contract still stated in the plan

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/landing-content/plan.md:130`, `src/content/guides/what-ruins-night-photos.md:43`, `src/content/guides/what-ruins-night-photos.md:44`, `src/content/guides/shoot-better-night-photos.md:66`, `src/content/guides/shooting-in-difficult-light.md:6`
- **Detail**: Phase 2's imagery contract still says `3-5 images per article`, but the shipped guides only satisfy that for the first article. `what-ruins-night-photos` has the cover plus the before/after pair, `shoot-better-night-photos` has only the cover plus one in-body image, and `shooting-in-difficult-light` has only the cover. The leaner editorial scope may be intentional, but the source-of-truth plan still describes a materially larger asset set than what shipped.
- **Fix**: Either add the missing images to the second and third guide, or amend Phase 2 so the imagery contract explicitly allows the lighter per-article image count that was actually shipped.
- **Decision**: RESOLVED — amended the plan contract to the shipped lean count (see Resolution below)

### F2 - The 3-article amendment was not swept through the full Phase 2 and Phase 3 plan body

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/landing-content/plan.md:110`, `context/changes/landing-content/plan.md:147`, `context/changes/landing-content/plan.md:153`, `context/changes/landing-content/plan.md:164`, `context/changes/landing-content/plan.md:172`, `context/changes/landing-content/plan.md:349`, `context/changes/landing-content/plan.md:355`
- **Detail**: The top-level amendment correctly records the scope increase from two guides to three, and the Progress section also says `all three`, but the body still contains conflicting pre-amendment text: the Phase 2 heading still says `Two Articles`, one success criterion still says `both prerendered guide pages`, another still says `both articles`, and the Phase 3 overview still says `2 cards` even though its intent block already says `3 teaser cards`. Future review work will read contradictory scope from the same plan file.
- **Fix**: Sweep the Phase 2 and Phase 3 body text so every remaining `two` / `both` / `2 cards` reference matches the approved 3-article amendment.
- **Decision**: RESOLVED — swept (see Resolution below)

## Resolution (Claude, 2026-07-06)

Both warnings fixed in `plan.md` — doc-only, no code or asset change:

- **F1** — amended the Phase 2 imagery contract from "3–5 images per article" to the lean editorial count actually shipped (cover always; before/after + illustrative only where warranted: guide #1 cover + before/after pair, #2 cover + one in-body shot, #3 cover-only). The lighter set was the intentional "modern & uncluttered" choice; the contract now matches what shipped.
- **F2** — swept every leftover pre-amendment reference: Phase 2 heading (block + Progress), the intent block (now lists all three articles), automated/manual success criteria (`both`→`all three`), the "two above" slug contract, Desired End State (`two real guides`→`three`), Phase 3 overview (`2 cards`→`3 cards`), and Phase 5 sitemap criteria. Grep for `Two Articles | both …guide | 2 cards | two above | 3–5 images` now returns nothing.

Net: both were LOW / doc-only; no code, tests, or assets touched. Phase 2 implementation stands as committed (`e4b92ab`, `565625c`).
