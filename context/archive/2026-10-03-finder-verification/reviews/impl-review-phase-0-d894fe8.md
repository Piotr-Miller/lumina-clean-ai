<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder verification — verify-before-publish pass, pre-registered gate and measurement

- **Plan**: context/changes/finder-verification/plan.md
- **Scope**: Phase 0 of 9 (Phases 0–8)
- **Base**: 573ee3373cfd548fcbda9c1575b17684423a1b58 (change base: the branch point named in `change.md`; parent of the earliest `(finder-verification)` commit)
- **Head**: d894fe821a056dbb95813df90f395a0a26ab8e7e
- **Worktree**: included(context/changes/finder-verification/plan.md — the Progress 0.6 tick); excluded `.claude/settings.local.json`, `temp_steps.md`, `context/changes/cloud-exif-orientation/` (outside scope)
- **Checks ran at**: d894fe8 (current HEAD)
- **Manual acceptance**: 1 of 1 confirmed (0.6; push time independently re-read from the activity API)
- **Date**: 2026-10-04
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — MAIN's A_max values do not follow the stated formula

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/finder-verification/gate.md § Pre-registration §7 (copied from plan.md:688)
- **Detail**: A_max is defined as "2 × pessimistic per attempt, floor $0.02". From the same table, CONTROL fits it: #269 2 × $0.49/10 = $0.098 → $0.10, and #240 2 × $0.042 = $0.084 → $0.09. MAIN does not: #269 gives 2 × $0.091 = $0.182, but $0.23 is recorded, and #240 gives 2 × $0.079 = $0.158, but $0.20 is recorded. The error is on the safe side, because a larger A_max lowers `--max-spend`. Still, a sealed number that can't be rebuilt from its own rule is the kind of gap a post-hoc reader will question. The draft marks the per-series table as recomputed in Phase 3 but does not mark A_max that way.
- **Fix**: In Phase 3 §3, recompute A_max from the recomputed table using the stated formula (or state the extra factor MAIN uses), and mark the A_max line _(Phase 3)_ in the draft.
- **Decision**: FIXED (owner, 2026-10-04): A_max rule restated in plan.md Phase 3 §3 (no extra factor for MAIN; planning values MAIN $0.19 / $0.16); gate.md §7 A_max line marked _(Phase 3)_.

### F2 — The freeze commit is cited by SHA, but the tag is not pushed until Phase 8

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/finder-verification/gate.md § Inputs freeze → "Rebase protection"
- **Detail**: The proof that the freeze came before the prompt is `c3b2f1c` together with its activity-API push event at 2026-10-04T11:25:02Z (re-verified). `refs/tags/finder-verification/freeze` does not exist yet, and the plan pushes it only in Phase 8 §2, right before the rebase. Any rebase or force-push before then would leave `c3b2f1c` unreachable and liable to GC, while the gate still cites it. Examples: catching up with `master` during Phases 1–7, or a history clean-up. The activity event would survive, but the content it points at might not (memory: rebase-merge rewrites SHAs).
- **Fix**: Push the tag `finder-verification/freeze` on `c3b2f1c` now. It costs nothing, and Phase 8 §2 then only has to confirm the tag exists.
- **Decision**: FIXED (owner, 2026-10-04): annotated tag `finder-verification/freeze` (object `4dcb1cc`) pushed on `c3b2f1c`, verified with `git ls-remote --tags origin`; recorded in gate.md § Inputs freeze → Rebase protection; plan.md Phase 8 §2 now only confirms it.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-verification/change.md, plan.md, plan-brief.md, research.md, reviews/plan-review.md, backcheck-269.py, backcheck-269-results.json, gate.md. `gate.md` is this phase's deliverable, so its content was reviewed against Phase 0 §1, §3 and §5 even though the path is bookkeeping.
- **Automated checks, re-run 2026-10-04 at d894fe8** (all pass):
  - 0.1: the diffs reproduce exactly: #269 65,455 B `1e4ec088…550f`, 17 files; #240 18,718 B `4487c2b0…221e`, 8 files; #247 10,838 B `21973af3…c2e1`, 2 files. All three rules files hash to `34d5fcac…b48f`.
  - 0.2: `git log e8ebb66..d894fe8` on the clean-change paths is empty, and `clean-change.diff` hashes to `8b326f6d…08cd`.
  - 0.3: the README's post-image script exits 0 (9/9 and 50/50 lines, no shared identifiers). The `sed | grep -c` check prints `0`. Both tree hashes equal those in `gate.md` and the README.
  - 0.4: `git grep buildVerifierInstructions c3b2f1c -- packages/` exits 1 (it also exits 1 at d894fe8).
  - 0.5: `gate.md` has `## Inputs freeze`, an UNSEALED `## Pre-registration` closed by `_End of Pre-registration._`, and no `## Results`.
- **Manual 0.6 evidence**: the activity API shows `push 573ee33→c3b2f1c` at 2026-10-04T11:25:02Z, matching `gate.md`. `origin/feat/finder-verification` points at `d894fe8`, and `c3b2f1c` is an ancestor of it.
- **Pre-commit reformat claim verified**: the parsed JSON of committed blob `0173c31` equals the carried blob `2216bcb`.
- **Fixture trees vs. CI gates**: `packages/code-reviewer` ESLint and tsconfig both exclude `evals/fixtures/**`, and `prettier --check` passes on both trees and the README. The deliberately flawed `users.js` (`var`, `<=`, `==`) therefore breaks neither the `code-reviewer` job nor `format:check`. No script or test enumerates `evals/fixtures/`.
- **Budget arithmetic**: the arm totals in §7 add up: CONTROL $0.583 / $1.05, MAIN $1.333 / $2.12. CONTROL's P plus the $0.50 G5 cap is $1.55, within $1.60.
- `change.md` `status: implementing` differs from the "`plan_reviewed`" written in Phase 0 §4's contract. That is the expected state change by `/rune-implement`, not drift.
- Mutation check skipped: Phase 0 touches no code behind a `test-plan.md` §2 risk.
