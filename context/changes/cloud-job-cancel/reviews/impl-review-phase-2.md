<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Cloud Job Hard-Cancel Implementation Plan

- **Plan**: `context/changes/cloud-job-cancel/plan.md`
- **Scope**: Phase 2 of 3
- **Date**: 2026-07-09
- **Verdict**: NEEDS ATTENTION
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

### F1 - Non-OK Edge /cancel responses are silently treated as success

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/cancel.handler.ts:74`
- **Detail**: Phase 2's new Worker -> Edge proxy only logs rejected `fetch()` calls. A resolved HTTP failure from the Edge route (`401` wrong `DB_WEBHOOK_SECRET`, `500` thrown while resolving the prediction id, etc.) does not throw, so `fireEdgeCancel()` returns quietly and the API route still answers `200 { canceled: true }` with no local signal. That means the new "stop paid compute" seam can fail closed on the row flip but fail open on the provider cancel, and the miswire is invisible until a manual live smoke or production debugging session.
- **Fix**: Treat `!res.ok` as a failure inside `fireEdgeCancel()` and throw/log with status + a bounded response body before swallowing it.
  - Strength: Preserves the plan's best-effort semantics (`cancelCloudJobResponse` still returns the DB flip result) while surfacing the exact Worker-to-Edge failure cases this phase introduced.
  - Tradeoff: Minor - one helper change plus a unit test for a resolved non-2xx response.
  - Confidence: HIGH - `fetch()` rejects only on network-level failures; HTTP failures are currently silent by construction.
  - Blind spot: This does not replace the deferred live smoke for actual Replicate-side cancel behavior.
- **Decision**: PENDING

## Verification

- **Automated**:
  - `deno check supabase/functions/enhance/index.ts` - could not be re-run in this environment. Output: `Program 'deno.exe' failed to run: No application is associated with the specified file for this operation.`
  - `npm run typecheck` - PASS
  - `npm run test:unit` - PASS (`23` files, `307` tests)
  - `npx eslint astro.config.mjs src/lib/services/cancel.handler.ts src/pages/api/enhance/cloud/cancel.ts tests/cancel.handler.test.ts` - PASS
- **Manual**:
  - `2.5` and `2.6` remain unchecked in the plan. I found no evidence they were rubber-stamped.
- **Mutation check**:
  - Skipped. Phase 2 did not touch a Section 4 selective-mutation target such as `src/lib/services/photo-job.service.ts`.

## Notes

- Reviewed committed Phase 2 implementation `58a773a` (`feat(cloud-job-cancel): edge /cancel sub-path - stop Replicate compute (p2)`).
- The current worktree differs from `HEAD` only in local `.claude/settings.local.json` and Phase 2 plan-bookkeeping lines that append the commit SHA to already-checked automated steps; neither changes the reviewed Phase 2 code path.
