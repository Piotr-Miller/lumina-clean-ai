<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: finder-sonnet — sonnet-5 as the production finder

- **Plan**: context/changes/finder-sonnet/plan.md
- **Scope**: Phase 2 of 5
- **Base**: 624a936b0630e04efb961f784855aa1bd3d5a622 (Progress — Phase 1's last commit, `624a936`)
- **Head**: e01f62227614d3f66ffbad0c1a45b521b6b106ef
- **Worktree**: included(context/changes/finder-sonnet/plan.md)
- **Checks ran at**: e01f62227614d3f66ffbad0c1a45b521b6b106ef (current HEAD; `packages/code-reviewer/src` clean)
- **Manual acceptance**: 2 of 2 confirmed in Progress (2.4 owner confirmations and approval are written into the seal section with dates; 2.5 push time 2026-10-05T21:09:36Z recorded, no T0 read, no ledger, no `gate-sonnet-runs.jsonl` exists)
- **Date**: 2026-10-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

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

### F1 — At the research HIGH estimates the sealed budget rule cannot admit the fourth run

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/finder-sonnet/gate.md:245 (§8 Budget and P) and :199 (§5 run order)
- **Detail**: P for a later run is 2 × the largest reconciled cost of that PR's earlier runs, and the sealed order ends with `269-r2`. If the three earlier runs land at the research HIGH estimates ($0.33, $0.73, $0.33), the pre-run check for `269-r2` reads T $1.39 + P $1.46 + reserve $0.50 = $3.35 > $3.00, so the series stops as `INCOMPLETE (budget)` with about $1.40 actually spent. With both #247 runs at $0.33, `269-r1` must cost at most about $0.61 for the fourth run to fit; at the research mid estimates (about $0.15 and $0.36) all four runs fit with margin. This is the protocol's designed failure direction (under-spend, never over-spend) and the owner confirmed P at the seal, so nothing is wrong with the implementation; it is recorded so the outcome does not surprise anyone in Phase 3.
- **Fix**: No change now. If `269-r1` reconciles above about $0.61, decide before `269-r2` whether to accept `INCOMPLETE (budget)` or to amend P for later runs under §11 (a dated, hashed amendment pushed before that run). The decision is the owner's.
- **Decision**: ACCEPTED — owner, 2026-10-05: no change now; if `269-r1` reconciles above about $0.61, the owner decides before `269-r2` between `INCOMPLETE (budget)` and a §11 amendment of P.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-sonnet/change.md, context/changes/finder-sonnet/plan-brief.md, context/changes/finder-sonnet/plan.md, context/changes/finder-sonnet/gate.md, context/changes/finder-sonnet/gate-manifest.json, context/changes/finder-sonnet/gate-window-runs.tsv
- Excluded local work: context/changes/cloud-exif-orientation/change.md (foreign, untracked). The included plan.md worktree edit only appends `— e01f622` to rows 2.1–2.3 and flips 2.5; it matches the carry record (`a682efb`), so it is `/rune-implement`'s own write-back.
- Phase 2 produces only documents, so both review passes were done in this session without delegation (small diff). `gate-manifest.json` and `gate-window-runs.tsv` are not named in the plan's Phase 2 file list, but the manifest is what Phase 1's runner contract requires (`--manifest`, sealed input and global manifests) and the TSV is the per-run data behind §2's counts; neither is scope creep.
- Applicable lessons: 34 of 37 entries read (those whose `Applies to` names impl-review).
- **Automated 2.1** — frozen inputs: the diff recipe re-run from this repository reproduces #247 (10,838 B, `21973af3…2e1`) and #269 (65,455 B, `1e4ec088…550f`); the cached `pr.diff`, `rules.md` (2,929 B, `34d5fcac…b48f`) and `meta.json` (2,059 B / 1,701 B) hash as recorded; `git show <base>` and `<head>` rules are byte-identical for both PRs; `wt-247` HEAD = `dec09f8d…`, `wt-269` HEAD = `fca27787…`, both with empty `git status --porcelain`. D2 verified by reading `wt-269/scripts/spikes/bread-spike.ts`: `localInput` 167–196, the missing-URL `process.exit(1)` at 193 before the `uploadedFileId` return at 195, `deleteUpload` 199–214 — the plan's `:178–214` / `:189–195` and the gate's ranges agree with the file.
- **Automated 2.2** — the sealed section (`## Pre-registration` … `_End of Pre-registration._`, 218 lines) hashes to `434ffe5f…3b76` both at HEAD and at the seal commit `3d7b9aa`; `gate-manifest.json` hashes to `274984fa…3512` at both; `gate-window-runs.tsv` hashes to `45037f72…6efb`; `npx prettier --check context/changes/finder-sonnet/` exit 0. The five code hashes equal `sha256sum` at HEAD and at `624a936`; `git rev-parse HEAD:packages/code-reviewer/src` = `a6dd42ab…` as sealed; `./node_modules/.bin/tsx scripts/schema-dump.mjs` (exit 0) prints the finder wire schema with sha256 `a6e98d41…5bf` as sealed. No placeholder text remains (the only `<…>` tokens are the recipe commands).
- **Automated 2.3** — `git ls-remote --tags origin finder-sonnet/seal` shows tag object `f4c774cc…` peeled to `3d7b9aa`; the tag is annotated, tagged 2026-10-05T21:09:42Z, and its message carries the seal hash and time.
- Seal timeline, from the repository activity API: seal hash taken 21:08:58Z → branch push `0000000..3d7b9aa` 21:09:36Z → tag 21:09:42Z → push `3d7b9aa..e01f622` 21:10:40Z. Every step precedes any paid call (none has been made).
- Window counts re-checked: the TSV has 90 unique run ids over 62 distinct PRs; classes 48 observed + 13 observed+plan = 61, 26 docs-only, 3 job-level; buckets 53 × #247 and 8 × #269 with every assignment matching the 38,146 B rule; 61 observed runs by step outcome 23 success / 37 failure / 1 cancelled; 40 distinct PRs observed. `gh pr list` over the window returns 62 PRs and the `review.yml` run list since 2026-09-05 returns 103 runs, matching §6. The run-to-PR matching (90 of 103) and the per-run diff bytes were not independently re-derived; the two frozen PRs' own runs show 10,838 B and 65,455 B, equal to the frozen diffs. Arithmetic: 13 × $0.199620 = $2.595060, remainder $7.404940, single-mean break-even $0.121392, midpoint 38,146.5 B.
- Cost gate feasibility, information only: with the impl-review term fixed, `53 × m247 + 8 × m269 ≤ $7.404940` passes at the research LOW estimates (about $5.0) and fails at the mid estimates (about $10.8); with m269 at its mid ($0.36) m247 must average about $0.085 or less. The owner saw the single-mean break-even before choosing the size-assigned formula; this is the same information under that formula.
- Mutation testing skipped: Phase 2 changes no source file, so no `test-plan.md` §2 risk maps to it.
- No paid calls, no external mutations, no code edits and no commits were made by this review. `change.md` already carries `updated: 2026-10-05`; `status` stays `implementing` (phase review).
