<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-20 Step 1a — Shared decode and matched arms

- **Plan**: context/changes/cloud-classical-denoise/plan.md
- **Scope**: Phase 1 (phases 0–6)
- **Session**: fresh
- **Base**: f6b28003605b1c281ac7e951413cc67125227dbb (previous phase commit; phase-1 boundary)
- **Head**: e79b80dd05fbf1032ba8f6430424c50d1f31df82
- **Worktree**: included(context/changes/cloud-classical-denoise/plan.md)
- **Checks ran at**: e79b80dd05fbf1032ba8f6430424c50d1f31df82, with the included Progress SHA write-back
- **Manual acceptance**: none planned for Phase 1
- **Date**: 2026-11-05
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

- **Bookkeeping in diff**: context/changes/cloud-classical-denoise/plan.md (committed phase progress and included local SHA suffixes).
- **Excluded local changes**: temp_steps.md; unrelated hand edit. No local source changes were present.
- **Context**: 35 of 39 lessons entries matched the skill's applicability rule and were read. No existing phase-1 implementation review was present. The two review passes ran in this session because the implementation surface is three files.
- **Progress**: Phase 1 Automated rows 1.1–1.4 name e79b80d, an ancestor of HEAD. Phase 0 Automated rows name 595c87a. Phases 2–6 remain pending; their missing implementation is outside this review's scope. No malformed n/a rows or unsuffixed completed Automated rows remain in the included plan.
- **Acceptance script**: `bash .agents/skills/rune-impl-review/scripts/acceptance-state.sh context/changes/cloud-classical-denoise/plan.md` exited 0. Phase 1 has no Manual rows. Prior phase rows 0.3 and 0.4 are current at f6b28003605b1c281ac7e951413cc67125227dbb; all later Manual rows are pending.
- **Plan drift pass**: MATCH for the shared RGB decode and metadata-free PNG, its common/pixel/dimension/decoder bindings, the full-resolution control, the NLM output and decoded-pixel checks, both arms' Auto-file and LUT hashes, the NLM source record, output paths and valued `--nlm-k` flag. All three planned source/test files are in the diff; no extra implementation file was added.
- **Safety and patterns pass**: traced `guard(args)` before the new render branches and `guardPaths` before sidecar, Auto, decoded, NLM, common-image and output-path access. The new arms reject validation mode. Existing arms retain their rendering path. Compared the fixtures/CLI tests with `scripts/s19/tests/test_curve.py` and the record/refusal structure with the existing arms and `scripts/s19/s19.ts`; no substantive mismatch found.
- **1.1 — PASS, exit 0**: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests -p 'test_arms.py'`. Output: `Ran 13 tests in 49.935s`, `OK`. Covers identity-denoiser byte equality, changed Auto-file bindings, tampering, dimension and pixel-hash mismatches, the synthetic holdout read trap, flag validation and existing arms. Phase 4's pair refusal remains scheduled for Phase 4.
- **1.2 — PASS, exit 0**: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s19/tests`. Output: `Ran 85 tests in 76.688s`, `OK`. Expected refusal messages came from negative fixtures; the suite also emitted a ResourceWarning for an unclosed fixture image. No failure occurred.
- **1.3 — PASS, exit 0**: `npm run typecheck`. Output: `tsc --noEmit`; no diagnostics.
- **1.4 — PASS, exit 0**: `npx eslint scripts/s19/local-arms.ts scripts/s19/s19.ts`. Output: `6 problems (0 errors, 6 warnings)`, all `no-console` in the CLI. These warnings do not fail the criterion.
- **Check capture**: commands wrote stdout and stderr to `/tmp/s20-review-{arms,s19,typecheck,lint}.log`; exit status was captured before reading excerpts, without piping the check itself.
- **Mutation check**: skipped. The Risk Map and Risk Response Guidance in `context/foundation/test-plan.md` cover callbacks/stalls, API authentication, cap admission, job ownership, retention and Realtime/watchdog behavior. This phase changes an offline decode/arm harness and touches none of those behaviors.
- **Scope limit**: evidence uses synthetic inputs. NLM rendering, calibration, pair validation, seals, blind ratings and the quality verdict belong to later phases.
- **Lifecycle**: change.md remains `implementing`; its `updated` stamp is already 2026-11-05. A phase review does not set `impl_reviewed`. No commit or external tracker mutation was made.
