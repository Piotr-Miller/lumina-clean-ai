<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: finder-sonnet — sonnet-5 as the production finder

- **Plan**: context/changes/finder-sonnet/plan.md
- **Scope**: Phase 1 of 5
- **Base**: 4c3fc87eb004ea79318d7a4c24d9663d8994612e (Progress — parent of Phase 1 commit)
- **Head**: 33fdb794c26fd7edb1b9dd1e051bf434a67b3907
- **Worktree**: included(context/changes/finder-sonnet/plan.md)
- **Checks ran at**: 33fdb794c26fd7edb1b9dd1e051bf434a67b3907 (current HEAD; source clean)
- **Manual acceptance**: 1 of 1 confirmed in Progress; failure notice text observable in action.yml
- **Date**: 2026-10-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Dirty-source guard checks the wrong directory

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/scripts/sonnet-gate.mjs:319
- **Detail**: Phase 1 requires refusal on uncommitted package source. The guard passes `packages/code-reviewer/src` to Git while its working directory is already `packages/code-reviewer`, targeting a nonexistent nested directory. Real Git returns no matches. An isolated temporary repository with a modified committed `src/cli.ts` reproduced an empty result from this guard, while `-- src` detected the modification. Changes to cli.ts, pipeline.ts, judge.ts or output-repair.ts evade the individual file hashes; `srcTree` records committed HEAD, while the child executes working files. Paid measurement can therefore run unsealed code. The fake-Git test matches the incorrect command verbatim and hides the defect.
- **Fix**: Use `:(top)packages/code-reviewer/src` (or `src` from the package directory) and add a temporary real-Git regression test proving a dirty non-individually-hashed module prevents CLI execution.
- **Decision**: FIXED — pathspec anchored with `:(top)` via `uncommittedSrc()`; real-git regression test added (deliberate-break check: old pathspec fails only that test)

### F2 — Immediate counter readings can settle unknown spend at zero

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/sonnet-gate.mjs:499
- **Detail**: `--settle-seconds` accepts zero, negative and non-finite values without validation. With no review.json after a failed run, telemetry is absent and partial cost defaults to zero. Two identical immediate readings then reach the settled branch at lines 519–524. A hermetic invocation of main with a failed-run record, absent telemetry, counter readings 10/10 and `--settle-seconds 0` returned exit 0, appended `status: settled, cost: 0`, and requested sleepMs=0. seriesSpend consequently removes that run from unresolved spend, allowing another paid invocation even if the counter is lagging. This violates the requirement that immediate readings alone do not establish settlement and missing spend cannot be treated as zero. The existing lag test manually injects partial telemetry into JSONL, so it does not cover the actual no-telemetry failure path.
- **Fix**: Validate a finite positive settlement interval and retain unknown zero-delta spend as unresolved unless settlement evidence or explicit owner attribution establishes it; test the failed-run/no-telemetry path without rewriting its cost record.
  - Strength: Keeps unknown paid-attempt costs behind the existing refusal and owner-resolution boundary.
  - Tradeoff: Some genuinely free failures require explicit owner resolution.
  - Confidence: HIGH — the zero-delay, no-telemetry admission was reproduced without network calls.
  - Blind spot: Provider counter settlement latency was not measured; a positive delay alone is not proof of settlement.
- **Decision**: FIXED — `--settle-seconds` must be finite and positive (default 180); a zero counter delta with no telemetry now stays `unsettled` until a later reconcile or an owner `resolve`; three tests added (deliberate-break check: each guard removed fails exactly its test)

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-sonnet/change.md, context/changes/finder-sonnet/plan-brief.md, context/changes/finder-sonnet/plan.md, context/changes/finder-sonnet/research.md, context/changes/finder-sonnet/reviews/plan-review.md
- Excluded local work: context/changes/cloud-exif-orientation/change.md. The included plan update only adds Phase 1 commit suffixes and marks owner acceptance. Manual acceptance is the recorded owner assertion, not independently re-performed by this review.
- The merge-base is 7c645946f5569753819c3af47a23940862007584. Phase 1 starts at its commit parent 4c3fc87, excluding the preceding independent local-settings commit.
- Applicable lessons: 34 of 37 entries read; both delegated passes were read-only.
- Other Phase 1 requirements match: model default, immutable finder provider pin, unchanged judge/implementation-review routing, provider and finish logging, technical-failure notice, JSONL diff exclusion and schema dump. No substantive unplanned source additions.
- Verification commands captured stdout/stderr separately; all exited 0: package `npm test` (22 files, 663 tests), `npm run typecheck`, `npm run lint`; root `npm run format:check` (all matched files formatted); package `./node_modules/.bin/tsx scripts/schema-dump.mjs` (full wire schema, sha256 a6e98d41add5055074b2a5556c512ddc9f5c6b5b1c3b0ad2eedb54cc43d095bf). Logs: /tmp/finder-review-{tests,types,lint,format,schema}.log.
- Routing/default assertions passed in the package suite. review.yml:29 retains `false &&`.
- Mutation testing skipped: none of the six photo-pipeline scenarios in test-plan.md §2 / Risk Response Guidance maps to this review-tool change. Root Stryker scope is not applicable.
- No paid calls, external mutations, code fixes or commits performed. The report remains uncommitted; change.md updated already equals 2026-10-05 and status remains implementing for this phase review.
