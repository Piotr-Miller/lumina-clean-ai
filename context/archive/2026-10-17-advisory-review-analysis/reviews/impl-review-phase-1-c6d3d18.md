<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Close out the advisory AI review direction

- **Plan**: context/changes/advisory-review-analysis/plan.md
- **Scope**: Phase 1 (phases 1–4)
- **Session**: fresh
- **Base**: 1b15eb33986dc19ec69b758837e0d5253e6b6e7c (merge-base with `origin/master`; local `master` is stale at `224e3ac`)
- **Head**: c6d3d1834e4d67385d5bf9403380f34f4ca34de3
- **Worktree**: excluded
- **Checks ran at**: c6d3d1834e4d67385d5bf9403380f34f4ca34de3 (current `HEAD`; no Phase 1 surface file is dirty)
- **Manual acceptance**: 0 of 1 confirmed — pending: 1.3
- **Date**: 2026-10-19
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations

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

None.

## Review Notes

- **Bookkeeping in diff**: context/changes/advisory-review-analysis/change.md, context/changes/advisory-review-analysis/plan.md, context/changes/advisory-review-analysis/plan-brief.md, context/changes/advisory-review-analysis/research.md, context/changes/advisory-review-analysis/worth-fix-sheet.md
- **Plan drift: MATCH for all three planned items.**
  - `scripts/prod-fetch-results.py:52-55` and `scripts/prod-result-dimensions.py:56-59` now build `found:` as `f"{len(KEY)} chars, still containing < or >"`. That is the plan's own example, and it follows the shape precedent at `scripts/prod-result-dimensions.py:65-68`.
  - In both scripts the `what` and `fix` texts are byte-identical, and the check order is unchanged. Each diff is one line removed and two added, all inside the placeholder branch.
  - `key-echo-check.py` is byte-identical to the plan's code block (`diff` against the extracted block: no output).
- **Automated checks, run at the head:**
  - 1.1 `python3 -I context/changes/advisory-review-analysis/key-echo-check.py` → exit 0. All four lines print `exit 1, leaked: none -> ok`.
  - 1.2 the `ast.parse` one-liner → exit 0, no output.
- **Negative control, re-run by this review.** The same check file ran in a temporary checkout at `0580974`, the phase commit's parent. It exited 1. Both placeholder cases leaked all 8 distinct windows (`['4KQZ', '7W4K', 'JX7W', 'KQZJ', 'QZJX', 'W4KQ', 'X7W4', 'ZJX7']`) and were marked FAIL. Both empty-key cases passed. The checkout was then removed.
- **Siblings searched, none affected.**
  - Searched for `KEY[`, `[:N]` and `.slice(0, N)` on key, token, secret, hash or auth names across `scripts/`. The other service-role users (`scripts/generate-recovery-link.ts` and `scripts/spikes/*`) print no key material.
  - The only other hit is `scripts/local-reset-smoke.ts:110,118`, a 24-character prefix of a local `token_hash`. The plan already checked it and left it alone (local-only, throwaway user).
- **Leftover leak paths in both scripts:** the remaining error messages print the URL, the HTTP code and reason, or the `URLError` reason. None of them prints the key.
- **Frozen evidence untouched.** The only archived sha256 that names these scripts (`context/archive/2026-08-31-cloud-quality-below-local/defaults-experiment.md:200`) hashes a downloaded `result.png`, not the script. Archived hand-reads cite line numbers at the PR #247 head `dec09f8`, so the one-line shift here does not move them.
- **Known limit of the check, not a finding.** It detects a leak as any 4-character window of the 16-character synthetic secret. A future regression that printed 3 or fewer characters of the secret part would still pass. So would one that printed only the non-secret `<sb_secret_` prefix. The Desired End State's "any character" is therefore enforced by the Manual row 1.3 read, not by 1.1 alone.
- **Durability, as planned.** `key-echo-check.py` runs from the repo root against the live `scripts/` paths, so it still works from the archived folder. Nothing runs it automatically. The plan accepts this (Testing Strategy: no Python test setup exists).
- **Committed diff outside Phase 1.** `temp_steps.md` changed in the change-opening commit `ece2fa6`. That edit predates the plan, so it is not Phase 1's work.
- **Worktree excluded:** `change.md`, `plan.md` and `temp_steps.md` are dirty, and the carry record holds all three with unchanged hashes. They are the Progress SHA write-back, the owner's trailing-period decision and the resume-file refresh. None is a Phase 1 surface.
- **Mutation check skipped.** No `test-plan.md` §2 risk covers the maintainer `prod-*` scripts, and the configured Stryker scope is `src/lib/**/*.ts`. Nothing covers Python.
- **Lessons:** 35 of 38 entries apply to impl-review. The priors used: _A check that cannot say what it found is a safety defect_ — the new message still names the subject, the state and the way out — and _Writing a fact into its canonical home leaves every pointer to it stale_ (no live pointer to these lines exists outside the change folder).
- `change.md` already reads `updated: 2026-10-19`. `status` stays `implementing`, because a phase review does not stamp `impl_reviewed`.
