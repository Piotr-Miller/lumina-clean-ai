<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Adaptive Enhancement Parameters (S-12) - Phase 3

- **Plan**: `context/changes/adaptive-enhancement-parameters/plan.md`
- **Scope**: Phase 3 of 3 - Cloud/Bread parameter threading + cost-safe Apply
- **Date**: 2026-06-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | FAIL    |

## Grounding

- Reviewed the Phase 3 scope in `plan.md`, the current `change.md`, `context/foundation/lessons.md`, and the saved Phase 1 / Phase 2 implementation reviews.
- Reviewed the current worktree delta after the Phase 2 commit `d5b8876`.
- Changed Phase 3 files inspected:
  - `supabase/migrations/20260628190000_add_bread_params_to_jobs.sql`
  - `src/components/enhance/EnhanceWorkspace.tsx`
  - `src/components/enhance/ParameterPanel.tsx`
  - `src/components/hooks/useCloudSubmit.ts`
  - `src/lib/services/bread.ts`
  - `src/lib/services/cloud-create-job.handler.ts`
  - `src/lib/services/cloud-upload.client.ts`
  - `src/lib/services/photo-job.schema.ts`
  - `src/lib/services/photo-job.service.ts`
  - `src/types.ts`
  - `supabase/functions/enhance/index.ts`
  - `tests/bread.test.ts`
  - `tests/cloud-create-job-schema.test.ts`
  - `tests/cloud-create-job.handler.test.ts`
  - `tests/jobs.rls.test.ts`

## Verification

Commands were run via the working Windows/fnm path because plain `npm` / `npx` in this checkout cannot reliably find `node.exe`.

| Check                    | Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Result                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration                | `fnm exec --using 22.14.0 cmd /c npx supabase db reset`                                                                                                                                                                                                                                                                                                                                                                                                                                                  | PASS - new `gamma` / `strength` columns applied locally                                                                                                         |
| Typecheck                | `fnm exec --using 22.14.0 cmd /c npm run typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                      | PASS                                                                                                                                                            |
| Targeted lint            | `fnm exec --using 22.14.0 cmd /c npx eslint src/components/enhance/EnhanceWorkspace.tsx src/components/enhance/ParameterPanel.tsx src/components/hooks/useCloudSubmit.ts src/lib/services/bread.ts src/lib/services/cloud-create-job.handler.ts src/lib/services/cloud-upload.client.ts src/lib/services/photo-job.schema.ts src/lib/services/photo-job.service.ts src/types.ts tests/bread.test.ts tests/cloud-create-job-schema.test.ts tests/cloud-create-job.handler.test.ts tests/jobs.rls.test.ts` | PASS                                                                                                                                                            |
| Unit tests               | `fnm exec --using 22.14.0 cmd /c npm run test:unit`                                                                                                                                                                                                                                                                                                                                                                                                                                                      | PASS - 21 files / 267 tests                                                                                                                                     |
| Integration script       | `fnm exec --using 22.14.0 cmd /c npm run test:integration`                                                                                                                                                                                                                                                                                                                                                                                                                                               | FAIL - `package.json` defines no `test:integration` script                                                                                                      |
| Equivalent integration   | `fnm exec --using 22.14.0 cmd /c npx vitest run tests/jobs.rls.test.ts` (with local Supabase env vars exported from `supabase status`)                                                                                                                                                                                                                                                                                                                                                                   | PASS - 17 tests; the intended RLS/job-row coverage passes once run directly                                                                                     |
| Edge Function type check | `C:\Users\prmi\AppData\Local\Microsoft\WinGet\Packages\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\deno.exe check supabase/functions/enhance/index.ts`                                                                                                                                                                                                                                                                                                                                           | FAIL - `TS2307` for `@sentry/deno` plus implicit-`any` errors on `beforeSend` / `beforeSendTransaction`                                                         |
| SSR build                | `fnm exec --using 22.14.0 cmd /c npm run build`                                                                                                                                                                                                                                                                                                                                                                                                                                                          | PASS after escalation; sandboxed run first failed on Wrangler/Miniflare writes under the user profile                                                           |
| Scoped mutation gate     | `fnm exec --using 22.14.0 cmd /c npx stryker run --mutate "src/lib/services/photo-job.service.ts:101-109" --reporters clear-text`                                                                                                                                                                                                                                                                                                                                                                        | PASS as a run; the phase-specific insert mapping is exercised, but the report still shows surviving / uncovered `createPhotoJob` failure-path mutants at 97-111 |

## Findings

### F1 - The Edge Function no longer satisfies the documented `deno check` gate

- **Severity**: WARNING
- **Impact**: HIGH - the Phase 3 success criteria are not reproducible today, and the Cloud path's Deno-side static check fails before this slice can be called cleanly green.
- **Dimension**: Success Criteria
- **Location**: `supabase/functions/enhance/index.ts:23`, `supabase/functions/enhance/index.ts:138`, `supabase/functions/enhance/index.ts:139`
- **Detail**: The planned verification explicitly requires `deno check supabase/functions/enhance/index.ts`, but that command currently fails on the reviewed branch. `@sentry/deno` is imported as a bare specifier that Deno does not resolve in this repo, and the two Sentry callback parameters are left implicit-`any`. This is a real code/tooling issue, not the Windows sandbox problem; the unsandboxed check fails the same way.
- **Fix**: Switch the Sentry import to a Deno-resolvable form for this repo boundary and type the two callback parameters so `deno check` returns cleanly.
  - Strength: Restores the documented Phase 3 gate and protects the Edge Function's runtime boundary from silent drift.
  - Tradeoff: Small repo-level Deno wiring cleanup before the slice can be closed.
  - Confidence: HIGH - reproduced directly with the real `deno check` command.
- **Resolution**: DISMISSED (false positive). `deno check` passes — the review ran it WITHOUT the required `--config supabase/functions/enhance/deno.json` flag. The `@sentry/deno` dep is in the function's own import map, so `--config` is mandatory (lessons.md / `deno-check-needs-config-flag`, PR #38; CI uses it). Verified both ways: no-config → 3 errors; with `--config` → exit 0. The recommended Sentry-import change would regress the established setup, so no code change. The plan's documented command (3.6) was the imprecise part — corrected (see F2 resolution).

### F2 - The saved integration gate is out of sync with the repo's runnable commands

- **Severity**: WARNING
- **Impact**: MEDIUM - the underlying coverage is present, but the claimed automation path cannot be reproduced from the documented command, which weakens future review / CI handoff.
- **Dimension**: Pattern Consistency
- **Location**: `context/changes/adaptive-enhancement-parameters/plan.md:272`, `package.json:6`
- **Detail**: Phase 3 marks `npm run test:integration` as the integration check, but `package.json` does not define that script. I could still prove the intended coverage by running `tests/jobs.rls.test.ts` directly against the local Supabase stack, and that passed, so this is not evidence that the product path is broken. It is evidence that the saved success criterion is currently inaccurate.
- **Fix**: Either add a real `test:integration` script that wraps the intended local-Supabase Vitest run, or update the plan / test docs to the exact command reviewers should execute.
  - Strength: Makes the review gate reproducible without one-off command translation.
  - Tradeoff: Small docs/tooling sync task.
  - Confidence: HIGH - `npm run test:integration` fails immediately from the current `package.json`, while the direct Vitest equivalent passes.
- **Resolution**: FIXED (plan-text drift, no script added). The repo's canonical integration command is `npm test` (full Vitest suite incl. `tests/jobs.rls.test.ts`) against a local Supabase stack — not a separate script. Corrected the plan's automated-verification list: 3.5 → `npm test` against local Supabase; 3.6 → `deno check --config supabase/functions/enhance/deno.json supabase/functions/enhance/index.ts` (also resolves F1's documentation kernel). Coverage was already proven (17 integration tests pass).

## Observation

### O1 - Scoped mutation still does not pin `createPhotoJob`'s failure contract

- **Severity**: OBSERVATION
- **Impact**: MEDIUM - not a present defect, but a future regression could relax Storage/DB failure handling without a test catching it.
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/photo-job.service.ts:97-111`
- **Detail**: The narrowed Stryker run over the new insert slice confirmed that the happy-path Bread-param persistence is tested, but it also surfaced surviving / uncovered mutants that skip the `signError` and `insertError` throws in `createPhotoJob`. In other words: Phase 3 proves the params are written when job creation succeeds, but it still does not pin the fail-closed behavior if signed upload URL creation or job-row insertion breaks.
- **Follow-up**: Add negative-path tests at the handler or service boundary for signed-upload failure and insert failure.
- **Resolution**: FIXED. Added two fail-closed unit tests to `tests/photo-job.service.test.ts`: `createPhotoJob` throws on a signed-URL mint error (and does NOT proceed to insert a dangling row) and throws on a job-row insert error. Pins the `signError`/`insertError` throw paths the scoped Stryker run surfaced. (Behavior was pre-existing — not a Phase 3 regression — but now regression-protected.)

## Notes

- The Phase 3 implementation itself is disciplined: the Cloud panel is reintroduced together with the actual submit threading, the request schema/service row persist `gamma` / `strength`, and the Edge Function uses the stored per-job params when building Bread input.
- I did not independently re-run the paid/manual browser checks in this review (live Cloud Apply result, network-panel proof that slider moves issue zero `create-job` requests). The plan currently marks those as done; this review focused on the code path and automated evidence.
