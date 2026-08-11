<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder File Context (getFileContext in CI)

- **Plan**: context/changes/finder-file-context/plan.md
- **Scope**: Phase 1 of 3
- **Reviewed commit**: 0cb4eb9
- **Date**: 2026-08-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

## Findings

### F1 — Diff content can forge an allowlist entry

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/source-provider.ts:40
- **Detail**: `parseDiffPaths` treats every line beginning with `+++ b/` as a file header, including lines inside a diff hunk. File content equal to `++ b/.git/config` appears in the unified diff as `+++ b/.git/config`; the executed reproducer returned `["safe.ts", ".git/config"]`. The provider can then read `.git/config` because it is now an exact allowlist match and a regular, non-symlinked file. This violates the central “only files in the PR diff” security contract. Existing tests do not cover header-like hunk content. Severity is limited to WARNING because Phase 1 does not activate the provider, the workflow accepts only same-repository human PRs, and Phase 2 removes persisted checkout credentials.
- **Fix**: Make `parseDiffPaths` structure-aware—accept `+++ b/...` only as the post-change header of a file block outside hunks—and add the adversarial case above to `source-provider.test.ts`.
  - Strength: Restores the exact diff-file boundary without normalizing model-requested paths.
  - Tradeoff: The parser becomes stateful; rename, deletion, binary, and CRLF fixtures must remain covered.
  - Confidence: HIGH — the bypass was reproduced against the committed implementation.
  - Blind spot: Combined-diff input has not been established as a supported CLI input.
- **Decision**: ACCEPTED — fixed 2026-08-10 (triage): `parseDiffPaths` is now structure-aware — `+++ b/` headers are accepted only OUTSIDE hunk bodies (between a file block's `diff --git` line and its first `@@`); hunk-body lines always carry a marker prefix, so `diff --git `/`@@` themselves cannot be forged from content. Reproducer re-run returns only `safe.ts`; two adversarial tests added (forged `.git/config` mid-hunk + header collection resuming on the next real file block). 254 tests green. Combined-diff input remains unsupported (CLI feeds plain `git diff` output only).

## Verification

- `npm run test` in `packages/code-reviewer`: PASS — 14 files, 252 tests.
- `npm run typecheck` in `packages/code-reviewer`: PASS.
- Targeted ESLint on all Phase 1 package files: PASS.
- Manual criterion 1.4: FAIL — marked complete, but the exact-diff allowlist invariant does not hold.
- Mutation testing: skipped; no project risk-map module was touched.
- No substantive scope creep or architecture/pattern mismatch found.
