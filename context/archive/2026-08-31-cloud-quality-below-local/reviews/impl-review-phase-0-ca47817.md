<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Calibrate Cloud Auto exposure and verify quality against Local

- **Plan**: context/changes/cloud-quality-below-local/plan.md
- **Scope**: Phase 0 of 7
- **Base**: 3d0adc1b4910c31973c6ac98a7ce776fcb68d878 (Progress)
- **Head**: ca478176e9ace23abe1b928fbfc30976b3149e24
- **Worktree**: included(context/changes/cloud-quality-below-local/plan.md); excluded(.claude/settings.local.json)
- **Checks ran at**: ca478176e9ace23abe1b928fbfc30976b3149e24 (current HEAD, with the included Progress suffixes)
- **Manual acceptance**: 0 of 1 confirmed — pending: 0.4
- **Date**: 2026-09-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — The model-fault conclusion exceeds the reproduced evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .agents/skills/gauntlet-loop/references/bars.md:142
- **Detail**: The new heading says “No green → magenta model fault” and line 146 says a cast in Bread output belongs to the input until shown otherwise. The cited `defaults-experiment.md` proves pixel correspondence for one byte-reproduced job; the other two source files match by scene and size, but their job inputs and Bread outputs were not reproduced (lines 417–423). Its conclusion is that the original Bread-specific diagnosis is unsupported on these sources, with Local only emulated in Python. The categorical bar could make a future critic dismiss a genuine output-specific cast before comparing the source and actual engine outputs.
- **Fix**: In both `bars.md` copies, title the bullet “The reported green → magenta model-fault diagnosis is unsupported on these sources” and replace the input-cast presumption with an instruction to compare each source with both outputs before assigning cause.
- **Decision**: FIXED 2026-09-27 — both `bars.md` copies reworded as proposed: the bullet now reads "unsupported on these sources", separates the one byte-reproduced job from the two scene-matched ones, and the input-cast presumption is replaced by comparing each source with both engines' outputs (also in freeze step 1).

## Review Notes

- **Bookkeeping in diff**: context/changes/cloud-quality-below-local/change.md, context/changes/cloud-quality-below-local/plan-brief.md, context/changes/cloud-quality-below-local/plan.md, context/changes/cloud-quality-below-local/reviews/plan-review.md, context/foundation/roadmap.md
- Phase change matched the plan: only the two `bars.md` copies changed outside bookkeeping; their diff is byte-identical and confined to § B's warning and freeze guidance.
- Applicable lessons: 34 of 37 entries. The evidence-premise and stale-pointer lessons were relevant here.
- Automated 0.1: `npm run check:skills` passed outside the sandbox: “OK: no drift (9 file pairs byte-compared).” The first sandbox attempt failed before the check ran because `tsx` could not open `/tmp/tsx-1000/14.pipe` (EPERM).
- Automated 0.2: `cmp .claude/skills/gauntlet-loop/references/bars.md .agents/skills/gauntlet-loop/references/bars.md` passed (exit 0, no output).
- Automated 0.3: `npm run format:check` passed: “All matched files use Prettier code style!”
- Mutation check skipped: Phase 0 changes documentation only; no behavior behind a `context/foundation/test-plan.md` § 2 risk was touched.
- Manual 0.4 is pending maintainer acceptance, not a review finding.
