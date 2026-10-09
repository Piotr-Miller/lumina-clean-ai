<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: finder-sonnet-effort

- **Plan**: context/changes/finder-sonnet-effort/plan.md
- **Scope**: Phase 1 of 5 — Port the dark code and add the effort arm (no network)
- **Base**: 9c73c034019cd4c5f17c60173acfe2f546979dfb (explicit)
- **Head**: 56983a29f89a91329ce3e357ba263a41445c2753
- **Worktree**: included(context/changes/finder-sonnet-effort/plan.md); excluded context/changes/cloud-exif-orientation/change.md
- **Checks ran at**: 56983a29f89a91329ce3e357ba263a41445c2753 (current HEAD; package/action/workflow files unchanged locally)
- **Manual acceptance**: 1 of 1 confirmed — Progress 1.6; refreshed comments explicitly state NOT ADMITTED
- **Date**: 2026-10-07
- **Verdict**: APPROVED (one minor warning; default settlement interval remains safe)
- **Findings**: 0 critical, 1 warning, 0 observations

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

### F1 — Settlement override can bypass the 180-second minimum

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/sonnet-gate.mjs:776
- **Detail**: The plan's Definitions require counter reads at least 180 seconds apart, and Phase 1 §5 retains settlement requirements before the other arm resumes. `commandReconcile` rejects only non-finite or non-positive `--settle-seconds`, so `0.001` is accepted. A hermetic call through the real `main` entry point, with counter-before 1, complete telemetry 0.1 and two counter responses of 1.1, returned exit 0, requested a 1 ms sleep, appended `status: "settled"` and cleared `seriesSpend.unsettled`. The next run's unsettled-spend guard therefore no longer blocks, despite lacking the required observation interval. This is an inherited production flag, not the test sleep seam: tests already inject `deps.sleep`. The default remains 180 seconds, so the defect requires an explicit shorter override.
- **Fix**: Reject `settleSeconds < 180`, update the refusal message, and extend the existing settlement test to refuse `0.001` and `179` while accepting `180`.
- **Decision**: FIXED — `MIN_SETTLE_SECONDS = 180` floor in `commandReconcile`; tests refuse `0.001` and `179`, accept `180` (2026-10-07)

## Verification

Commands captured stdout/stderr to separate temporary logs; each check's own exit status was 0.

| Check                        | Result | Output/evidence                                                    |
| ---------------------------- | ------ | ------------------------------------------------------------------ |
| Package `npm test`           | PASS   | `Test Files 23 passed (23)`; `Tests 733 passed (733)`              |
| Package `npm run typecheck`  | PASS   | `tsc --noEmit`; no diagnostics                                     |
| Package `npm run lint`       | PASS   | `eslint .`; no diagnostics                                         |
| Root `npm run format:check`  | PASS   | `All matched files use Prettier code style!`                       |
| Effort production-path tests | PASS   | Included in the 733 tests; actual provider and SDK with fake fetch |
| Dark workflow guard          | PASS   | `.github/workflows/review.yml:29` retains `false &&`               |
| Runner `describe --arm`      | PASS   | Low/medium differ only at `.resolved.finder.reasoningEffort`       |

The describe commands were `./node_modules/.bin/tsx scripts/sonnet-gate.mjs describe --arm low` and the same command with `--arm medium`, run in the package directory. Both exited 0; parsed outputs were compared recursively.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-sonnet-effort/change.md, context/changes/finder-sonnet-effort/plan-brief.md, context/changes/finder-sonnet-effort/plan.md, context/changes/finder-sonnet-effort/reviews/plan-review.md. Local plan edits are only the Phase 1 Progress SHA write-back and manual 1.6 acceptance; they are included as workflow state. `change.md` had no local diff at review start; its date was already today.
- **Lessons**: 35 of 38 entries applied under the skill's stage-selection rule (including entries without an Applies to field). Relevant priors include failed-attempt observability, live admission distinct from offline capability, schema compatibility, actual check exit status, and non-retryable output-cap failures.
- **Plan drift pass**: Phase 1 §§1–6 match, except the inherited settlement override in F1. No substantive scope additions. The new `finder-effort.test.ts` supplies planned production-path coverage. Commit attribution records both predecessor commits, their author and original co-author. The predecessor's active change folder was not introduced; archived changes were untouched.
- **Port verification**: action.yml, review.yml, schemas.ts and schema-dump.mjs are byte-identical to 624a936. The remaining package differences against that revision implement the planned effort, telemetry and runner changes. The intermediate pre-edit port state cannot be reconstructed from the final phase commit alone.
- **No flag**: Conditional spreads omit `reasoning` from reviewer provider settings and actual outbound bodies. Hermetic CLI → pipeline → reviewer → installed-provider tests cover low, medium and omission, with and without a source. Judge bodies omit reasoning and the Anthropic pin and 16,384 output cap remain unchanged.
- **Raw reasoning evidence**: `asStepReasoningTokens` reads only `providerMetadata.openrouter.usage.completionTokensDetails.reasoningTokens`, accepting non-negative safe integers. Absent/unusable counts stay absent and log `reasoning=?`; explicit zero logs `reasoning=0`. Actual-provider tests distinguish these cases. Runner parsing preserves missing counts as null and flags them.
- **Shared configuration**: Runner and CLI share `resolveCliFinderSettings` and `resolvePipelineConfiguration`, and the runner supplies the merged environment to its child. Both agree for the planned active-source PR inputs. Runner description assumes an active source; a deletion-only diff would cause the CLI to disable the tool loop and yield a different snapshot. This boundary does not affect the selected inputs, and successful-run classification checks the child's snapshot against the seal. Sharing a resolver guarantees consistent rules for identical inputs, not identical source availability for every possible diff.
- **Schedule replay**: Sealed order plus append-only records deterministically reconstruct next/ended/blocking/halted state and pending owner stops. Tests exercise both arms ending on invalidity, later entries skipped in place, budget skips returning 4 with no started record or child call, and permanently blocking started-only runs. Settlement and owner acknowledgment gate the continuing arm; F1 concerns the minimum interval used to establish settlement.
- **Cap failure**: The real-provider fake-fetch test logs the final `finish=length` step and its reasoning count before `NoOutputGeneratedError`; no retry or judge request follows. Retry policy, loop limits and caps were not changed.
- **Mutation testing**: Skipped. The foundation test plan maps risks #1–#6 to the photo-processing pipeline, auth, cap, ownership, retention and watchdog. This change touches the separate code-reviewer package and advisory review infrastructure, with no mapped app-risk behavior changed.
- **Boundary**: No paid calls, external mutations, commits or production enablement. Phase 1 is implemented; Phases 2–5 remain pending. `change.md.status` remains `implementing`; `updated` remains 2026-10-07. Report and change.md are recorded in the workflow carry file for the next authorized commit.
