<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Cloud EXIF Orientation Implementation Plan

- **Plan**: context/changes/cloud-exif-orientation/plan.md
- **Scope**: Phase 1 (phases 1–3)
- **Session**: fresh
- **Base**: e4814d4acf2ee5cfe7ed1fac52fb598dc49dd802 (merge-base; also phase 1 commit parent)
- **Head**: 65a8548fca099e4fa7bc80baddf94738247f45e4
- **Worktree**: included(context/changes/cloud-exif-orientation/plan.md)
- **Checks ran at**: 65a8548fca099e4fa7bc80baddf94738247f45e4 (current HEAD, with the listed worktree inclusion)
- **Manual acceptance**: 1 of 1 confirmed (1.6 current)
- **Date**: 2026-10-25
- **Verdict**: APPROVED
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

### F1 — Malformed orientation counts trigger a redraw

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/engines/exif-orientation.ts:60
- **Detail**: `parseTiffOrientation` reads an orientation entry's type and inline value but ignores its component count at `entry + 4`. A read-only Node probe changed the count of the synthetic big-endian orientation-6 entry to 0 and 3. Both `detectOrientation` and `readOrientation` returned `{ kind: "orientation", value: 6 }`, and `isOriented` returned true for both. Count 0 declares no value; SHORT count 3 requires an out-of-line value, whose slot in this fixture is the out-of-range offset `0x00060000`. Interpreting those bytes as a scalar selects redraw/re-encoding rather than the plan's unreadable-metadata behavior of warning and preserving the original file. This can unnecessarily re-encode a malformed input, or stop its upload if redraw fails. The existing malformed-metadata tests do not vary the orientation entry count.
- **Fix**: Require exactly one orientation component before interpreting the inline value; return `unreadable` for other counts. Add count-0/count-3 cases for both detector entry points and verify that default submission warns and PUTs the identical original file for those malformed entries.
- **Decision**: FIXED — require a singleton orientation component and add malformed-count detector/upload regressions; siblings: detectOrientation and readOrientation fixed through shared parseTiffOrientation, SHORT and LONG fields in both byte orders covered, no separate parser found by searching src/ and tests/ for ORIENTATION_TAG, 0x0112 and parseTiff; reopened: none.

## Verification

Each command's stdout/stderr was captured to a separate file under `/tmp/cloud-exif-review-*.log`; the command's own exit status was retained before reading its output.

| Progress | Command                                                                                                           | Exit | Output excerpt                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- |
| 1.1      | `npx vitest run tests/exif-orientation.test.ts tests/cloud-upload.client.test.ts`                                 | 0    | `Test Files 2 passed (2)`; `Tests 55 passed (55)`                                   |
| 1.2      | `npm run test:unit`                                                                                               | 0    | `Test Files 32 passed (32)`; `Tests 464 passed (464)`                               |
| 1.3      | `npm run typecheck`                                                                                               | 0    | `tsc --noEmit`                                                                      |
| 1.4      | `npm run lint`                                                                                                    | 0    | `86 problems (0 errors, 86 warnings)`                                               |
| 1.5      | `npm run format:check`                                                                                            | 0    | `All matched files use Prettier code style!`                                        |
| 1.6      | `bash .agents/skills/rune-impl-review/scripts/acceptance-state.sh context/changes/cloud-exif-orientation/plan.md` | 0    | `1.6 current 65a8548fca099e4fa7bc80baddf94738247f45e4 src/lib/enhance-strings.ts -` |

## Review Notes

- **Bookkeeping in diff**: context/changes/cloud-exif-orientation/change.md, context/changes/cloud-exif-orientation/frame.md, context/changes/cloud-exif-orientation/plan-brief.md, context/changes/cloud-exif-orientation/plan.md, context/changes/cloud-exif-orientation/reviews/plan-review.md.
- **Excluded local changes**: temp_steps.md (untracked, unrelated to the reviewed phase).
- **Lessons**: 35 of 39 ledger entries apply to impl-review and were read. Relevant priors include consequential degradation warnings, command exit-status evidence, and verification that a guard sees its failure.
- **Progress**: phase 1's five Automated rows name the current, reachable phase commit. Row 1.6 is current per the acceptance script. Phases 2 and 3 remain pending and outside this review; no malformed n/a rows were found.
- **Scope**: tests/helpers/jpeg-bytes.ts is a justified extra file sharing synthetic fixtures between the two planned unit test files. No unrelated product changes or guardrail violations were found.
- **Architecture and patterns**: one shared JPEG walker serves byte and Blob entry points; the existing canvas implementation was extracted without changing flatten behavior; preparation and re-validation precede request derivation and POST. MIME and PUT body use the prepared file. DOM access remains deferred.
- **Independent review passes**: read-only plan-drift and safety/quality agents independently reported the same count-validation gap; the lead reproduced it before recording F1.
- **Mutation check**: skipped because the changed behavior does not implement a failure scenario in test-plan.md §2 / Risk Response Guidance. Orientation preparation does not change cap enforcement, authentication, ownership, retention, webhook handling, or watchdog decisions; proximity to the create-job POST is not a mapping to risk #3's over-cap admission scenario.
- **Limits**: browser pixel/dimension/tag verification belongs to phase 2; live acceptance belongs to phase 3. Neither was run or claimed here. No paid checks or external mutations were performed.
- **Lifecycle**: phase-scoped review leaves change.md status as implementing; updated is already 2026-10-25. No code or Progress changes were made, and nothing was committed.

## Triage completion (2026-10-25)

- **Fixed**: F1, by the owner's explicit Fix now choice. Changes remain uncommitted; the recorded review verdict still describes its original boundary.
- **Files**: src/lib/engines/exif-orientation.ts, tests/helpers/jpeg-bytes.ts, tests/exif-orientation.test.ts, tests/cloud-upload.client.test.ts.
- **Regression evidence**: the 14 new cases failed against the original parser (exit 1; 14 failed, 55 passed). After the guard, both focused files pass (exit 0; 69 tests). Counts 0, 2 and 3 are covered across both TIFF byte orders and supported field types; upload cases for counts 0 and 3 verify original-File identity, no redraw and one consequential warning.
- **Post-fix checks**: npm run test:unit (exit 0; 478 tests across 32 files), npm run typecheck (exit 0), npm run lint (exit 0; 0 errors, 86 warnings), npm run format:check (exit 0). Output captured under /tmp/cloud-exif-f1-*.log.
- **Acceptance**: acceptance-state.sh exited 0 after all code edits; 1.6 remains current at 65a8548fca099e4fa7bc80baddf94738247f45e4. Other Manual rows remain pending. No checked Manual row was invalidated, so no Progress reopening or change.md reopening note was needed.
- **Follow-up record**: context/changes/cloud-exif-orientation/follow-ups/review-fixes.md.
