<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: finder-glm-5-3-high

- **Plan**: context/changes/finder-glm-5-3-high/plan.md
- **Scope**: full — implemented phases 1–3; phases 4–7 resolved as n/a
- **Session**: fresh
- **Base**: 224e3ac3fc548c030aedc9e23bc6c063c6edd950 (merge-base)
- **Head**: 7dcb3e78d1b96ca391bcb3919bda7e163e08db85
- **Worktree**: excluded(temp_steps.md)
- **Checks ran at**: 7dcb3e78d1b96ca391bcb3919bda7e163e08db85
- **Manual acceptance**: 4 of 4 confirmed; 13 valid n/a rows excluded
- **Date**: 2026-10-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

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

### F1 — A symlink bypasses the sheet's dry-run write guard

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/glm-gate-sheet.mjs:285
- **Detail**: H8 and Phase 2 §4 require the sheet's `--dry-run` to refuse writes into the active change. `insideChange` compares lexical paths after `resolve()`, which does not resolve symlinks. A scratch directory symlink pointing into the change therefore passes the check at line 318. In `resolve --dry-run --out <alias>/<file>`, the write at line 368 would target a file inside the protected change. The same containment predicate protects `sheet`'s output directory and ledger. A safe reproduction used the symlinked directory itself as `--out`: execution reached `writeFileSync` and threw `EISDIR`, rather than refusing the path; no file was written. This requires an operator-supplied alias and did not occur in the screening, so it does not undermine the cost STOP or block close-out.
- **Fix**: Canonicalize the change directory and all dry-run write destinations before containment checks, resolving the nearest existing ancestor for destinations that do not exist yet. Add a hermetic symlink case for the shared guard; the existing `resolveFixtureRoot` realpath containment is a local precedent.
- **Decision**: FIXED — canonicalize existing targets and the nearest existing ancestor of new targets; refuse dangling/unresolvable symlinks. Siblings: sheet `--out-dir`, including both generated sheet-file destinations, fixed; sheet `--series` fixed; resolver `--out` fixed; `evals/finder-provider.ts` n/a (already canonicalizes its existing read roots with `realpathSync`). Reopened: none (acceptance script exited 0; all four checked rows remain current).

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-glm-5-3-high/change.md, context/changes/finder-glm-5-3-high/plan-brief.md, context/changes/finder-glm-5-3-high/plan.md, context/changes/finder-glm-5-3-high/research.md, context/changes/finder-glm-5-3-high/reviews/impl-review-phase-1-40217a6.md, context/changes/finder-glm-5-3-high/reviews/impl-review-phase-2-4211102.md, context/changes/finder-glm-5-3-high/reviews/plan-review.md, context/changes/finder-glm-5-3-high/screening.md, context/changes/finder-glm-5-3-high/screening/results/s247-01.review.json, context/changes/finder-glm-5-3-high/screening/results/sfix.fixture-rows.json, context/changes/finder-glm-5-3-high/screening/series.jsonl.
- **Boundary and inherited work**: The required merge-base boundary includes the predecessor's deliberately unmerged implementation and archived evidence. The plan identifies `ac6bbb1d58a9574945c6c787ab33c9737b22fe20` as this change's starting tree. Its 37 changed paths are planned implementation or bookkeeping. Inherited material was distinguished from additions in this change, rather than reported as scope creep. No archive file or workflow guard changed after that starting tree. Existing phase reviews were read as evidence, and settled owner choices were not re-raised.
- **Session**: This conversation advised the owner on rules and inspected acceptance examples, but did not execute `/rune-implement` for this scope. Two separate read-only passes checked plan drift and safety/patterns; the lead independently reproduced F1 and ran the checks below.
- **Lessons**: 35 of 38 ledger entries apply to `impl-review` or omit an applicability restriction. The selected entries were read; the most relevant cover checking cited evidence, generated artifacts and review truncation, canonical pointers, failure metadata, and output-cap behavior.
- **Progress**: All 16 completed Automated rows have ancestor commit suffixes. All 15 Automated n/a reasons match the STOP branch. The acceptance script exited 0 and returned `current` for 1.8, 2.6, 3.5 and 3.8, all accepted at `49e2ccdb0e8f63dc8de078cbd02c19f7d0db40e8`.
- **Manual n/a**: 3.6 and 3.7 are justified by the absence of any #269 start or screening pause. Rows 4.4, 4.5, 5.5–5.8, 6.3, 6.4 and 7.7–7.9 are justified by screening STOP and the dated close-out decision. There are no pending, stale, unverifiable or malformed Manual rows.
- **Scope guardrails**: The effort is `high`; timeout, output cap, routing, judge, weights and gate thresholds remain unchanged. H6/O4 are dated owner amendments made before spending. Phases 4–7 were not run. The draft PR remains unmerged and AI review remains disabled.
- **Mutation testing**: Skipped: none of the six application risks in `context/foundation/test-plan.md` §2 / Risk Response Guidance maps to this change. Those risks concern Cloud AI jobs, API authorization, the Replicate daily cap, ownership, source retention and the Realtime watchdog. The OpenRouter screening runner does not implement those behaviors. The configured Stryker setup targets the root application test graph, not this package's separate Vitest graph.
- **Measurement limit**: Committed fixture rows do not retain per-request token counts, as the run notes disclose. H11 instruments CLI stderr; fixture metadata has per-request reasoning counts but row-total output counts. This limits fixture diagnostics without invalidating the recorded stop metadata or the cost decision. No new paid measurement is needed to establish the present STOP.
- **Working tree**: The pre-existing edit to `temp_steps.md` was excluded and left untouched. Review analysis did not edit the plan, implementation, screening ledger or pinned results. Only this report and the change's review status are left uncommitted and recorded as carry.

## Verification Evidence

Commands were captured to separate log files with their own exit statuses; no check was piped through a summarizer. Logs are session-local scratch artifacts, not committed measurement samples.

| Criteria               | Check / artifact                                                                                                                                            | Result                                                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1, 2.1–2.3           | `cd packages/code-reviewer && npx vitest run`                                                                                                               | Exit 0: `Test Files 29 passed (29)`; `Tests 1197 passed (1197)`. Includes the screening and D2 test files under the package's explicit `scripts/**/*.test.mjs` include; separate duplicate runs were unnecessary.               |
| 1.2, 2.4               | `cd packages/code-reviewer && npx tsc --noEmit`                                                                                                             | Exit 0.                                                                                                                                                                                                                         |
| 1.2, 2.4               | `cd packages/code-reviewer && npx eslint .`                                                                                                                 | Exit 0.                                                                                                                                                                                                                         |
| 1.3, 2.4               | `npx prettier --check .`                                                                                                                                    | Exit 0: `All matched files use Prettier code style!`                                                                                                                                                                            |
| 1.4                    | `git grep -nE '[Ee]ffort[^a-z]{0,4}low\|reasoning=low' -- packages/code-reviewer .github AGENTS.md ':!*.test.*'`                                            | Exit 1, expected for zero matches. Test-only matches are the mismatch case, historical Sonnet cost record, and two deliberately wrong reasoning shapes.                                                                         |
| 1.5                    | `git grep -nE 'finder-glm-5-3[/"]' -- packages/code-reviewer/scripts`                                                                                       | Exit 1, expected for zero matches.                                                                                                                                                                                              |
| 1.5                    | `git grep -nE 'changes/finder-glm-5-3/\|change .?finder-glm-5-3([^-]\|$)' -- .prettierignore AGENTS.md`                                                     | Exit 1, expected for zero matches.                                                                                                                                                                                              |
| 1.6                    | `run --case clean --run-id dry-high --dry-run` through the real CLI in a fresh scratch cache                                                                | Exit 0; configuration says `reasoning=high`; step lines report `provider=Z.AI model=z-ai/glm-5.3 reasoning=16`, without model text.                                                                                             |
| 1.7                    | Not run (paid-marked/external) — artifact: [draft PR #295 checks](https://github.com/Piotr-Miller/lumina-clean-ai/pull/295/checks)                          | Artifact checked with `gh pr view`: open draft at reviewed HEAD; `ci`, `integration`, `e2e`, `code-reviewer` all `SUCCESS`, run `39062766876`. Advisory AI review and deployment are skipped. No push or PR mutation performed. |
| 2.5                    | Stubbed `preflight --screening`, `run --screening` for #247 and #269, `d2 --screening --run s269-01 --list`, all with `--dry-run` and a fresh scratch cache | All exit 0. The listing includes the canned `bread-spike.ts` F1 candidate, its run/hash, and owner decision instructions. No real key counter or paid inference was used.                                                       |
| 3.1                    | Not run (paid-marked/external) — artifact: `screening.md` § Rules / Push record, pre-spend commit `9376d1a`, ledger preflight                               | Artifact checked: rules above Push record are unchanged from the pre-spend commit; recorded push `18:46:02Z` precedes preflight `18:46:36Z` and first paid start `18:52:51Z`.                                                   |
| 3.2                    | Not run (paid) — artifact: `screening/series.jsonl`, `screening/results/sfix.fixture-rows.json`, `screening/results/s247-01.review.json`                    | Both pinned result hashes match; all 40 manifest file hashes and frozen inputs match the recorded tree digest. `sfix` then `s247-01` were admitted and settled. No #269 step started after H4 fired.                            |
| 3.3                    | Existing `reconcile` records plus pure ledger/outcome replay; external counter settlement was not re-run                                                    | Last two reads `19:05:53Z` and `19:08:53Z` are equal at `$59.395361753`; ledger status is `checked`. Counter delta and settled total both equal `$0.20896336`, below `$0.75`.                                                   |
| 3.4                    | Committed `screening.md` outcome block plus `outcome --screening --dry-run --series <committed-ledger>` (without `--write`)                                 | Exit 0; reproduces `STOP (c: cost)`, `$7.417286` against `$7.404940`, and settled spend `$0.208963`. Replay intentionally does not re-read the external counter or rewrite the accepted document.                               |
| 4.1–4.3, 5.1–5.4       | Not run — n/a: screening STOP; no seal or paid series                                                                                                       | Reasons verified against the plan branch, ledger and owner decision.                                                                                                                                                            |
| 6.1–6.2, 7.1–7.6       | Not run — n/a: no paid series or admission; AI review stays off                                                                                             | Reasons verified. Absent sheets, G5, model-variable deletion and workflow enablement are expected.                                                                                                                              |
| Manual 1.8/2.6/3.5/3.8 | `bash .agents/skills/rune-impl-review/scripts/acceptance-state.sh context/changes/finder-glm-5-3-high/plan.md`                                              | Exit 0; all four `current`. Review evidence is not used to invent new owner acceptance.                                                                                                                                         |

### Safe reproduction of F1

Run from the repository root. It creates a scratch symlink and attempts to use the aliased directory itself as a file, so `EISDIR` prevents any write into the change. The scratch directory is removed in `finally`.

```js
import { mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./packages/code-reviewer/scripts/glm-gate-sheet.mjs";

const scratch = mkdtempSync(join(tmpdir(), "glm-sheet-path-review-"));
try {
  const alias = join(scratch, "change-alias");
  symlinkSync(join(process.cwd(), "context/changes/finder-glm-5-3-high"), alias, "dir");
  const logs = [];
  try {
    main(
      ["resolve", "--dry-run", "--series", join(scratch, "missing.jsonl"), "--sheets-dir", scratch, "--out", alias],
      { log: (line) => logs.push(line) },
    );
  } catch (error) {
    console.log({
      guardRefused: false,
      reachedWriteInsideChange: error.code === "EISDIR",
      errorCode: error.code,
      logs,
    });
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
```

Observed independently by both the safety reviewer and the lead:

```text
{ guardRefused: false, reachedWriteInsideChange: true, errorCode: 'EISDIR', logs: [] }
```

## Triage Verification (2026-10-17)

- The owner chose to fix F1. The fix and tests are in the working tree on top of the reviewed `7dcb3e7`; the review header and original verification evidence continue to describe that committed head.
- `canonicalWritePath` resolves existing symlinks and walks to the nearest existing ancestor for new destinations. A dangling symlink is refused rather than treated as a nonexistent filename. The check covers the sheet directory, both generated sheet filenames, the ledger, and resolver output, before any write starts. The guard's protected directory can be injected for hermetic tests; the CLI still protects `CHANGE_DIR` by default.
- Test-first evidence: the new protected-destination cases produced 9 failures before the fix. After the fix, all 41 sheet/resolver tests passed. The 10 added cases cover directory/file aliases, new nested destinations, dangling aliases, each generated sheet file, and a permitted scratch alias with a similar path prefix. Tests use and clean up temporary files only, and assert that protected evidence and the ledger stay unchanged on refusal.
- Post-fix verification: `npx vitest run` in the package exited 0, with 29 test files and 1,207 tests passing; package `npx tsc --noEmit` and `npx eslint .` both exited 0. The touched files were formatted with Prettier.
- Acceptance was checked after the implementation and sibling fixes: the shared script exited 0; 1.8, 2.6, 3.5 and 3.8 are still `current`. No criterion, surface declaration or Progress row was changed, and no acceptance was invented or reopened.
- This is a post-STOP tooling fix, not a new screening sample. `glm-gate-sheet.mjs` is a manifest input, so the working tree now differs from the recorded screened tree. The original baseline, ledger, pinned result bytes and STOP outcome remain historical evidence for the pre-fix tree; no paid step or new preflight was run.
- Triage complete: Fixed F1 (1); pending findings: none. The implementation, tests, report and change note are left uncommitted as workflow carry.
