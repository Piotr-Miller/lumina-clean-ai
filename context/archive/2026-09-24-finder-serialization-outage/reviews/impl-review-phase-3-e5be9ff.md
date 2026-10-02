<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: The finder's own routing

- **Plan**: context/changes/finder-serialization-outage/plan.md
- **Scope**: Phase 3 of 5
- **Base**: 802a1e0ca0d59ccc73b7578c44032d74e466bf3b (Progress: preceding phase)
- **Head**: e5be9ff663596a5ca859cb20c55a0c87a380cfdc
- **Worktree**: included(context/changes/finder-serialization-outage/plan.md); excluded(.claude/settings.local.json, temp_steps.md, context/changes/cloud-exif-orientation/change.md)
- **Checks ran at**: e5be9ff663596a5ca859cb20c55a0c87a380cfdc
- **Manual acceptance**: none planned
- **Date**: 2026-09-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Empty entry in a populated provider list bypasses malformed fallback

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/config.ts:167
- **Detail**: Phase 3 says a malformed `OPENROUTER_FINDER_PROVIDERS` value falls back to the provisional default rather than accepting a partial list. `parseFinderProviders` filters empty entries before validating, so `novita,,deepinfra` silently produces a two-provider override instead of the default. The specified all-blank values still need to use the default without warning.
- **Fix**: Check for an all-blank value first, then treat any empty entry in a populated list as malformed and test that case.
- **Decision**: FIX — Phase 4 pins candidates through `OPENROUTER_FINDER_PROVIDERS`, so a typo such as `novita,,deepinfra` must fall back to the default list with a warning instead of silently routing the gate to a different, partial list.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-serialization-outage/follow-ups/review-fixes.md, context/changes/finder-serialization-outage/plan.md, context/changes/finder-serialization-outage/reviews/impl-review-phase-2-802a1e0.md
- The intermediate commit `15b3f71` carries Phase 2 review fixes in `prompts.ts` and `reviewer.test.ts`; these are not Phase 3 scope additions.
- Applicable lessons: 34 of 37 entries (entries naming `impl-review`, the equivalent stage, or omitting `Applies to`).
- `npm test -- provider-routing config`: exit 0; 3 files and 76 tests passed.
- `npm test`: exit 0; 21 files and 693 tests passed.
- `npm run lint`: exit 0.
- `npm run typecheck`: exit 0.
- Mutation check skipped: `context/foundation/test-plan.md` §2 risks concern the photo pipeline; Phase 3 changes only AI reviewer provider routing.
