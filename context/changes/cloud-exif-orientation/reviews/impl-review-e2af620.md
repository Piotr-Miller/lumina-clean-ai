<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Cloud EXIF Orientation Implementation Plan

- **Plan**: context/changes/cloud-exif-orientation/plan.md
- **Scope**: full — implemented phases 1–2 (plan phases 1–3)
- **Session**: fresh
- **Base**: a0ae08c34b0b527bcfd932a170133a2b7ba0b8fd (merge-base with origin/master)
- **Head**: e2af620e0c194748767e3cdfa85874fbc0961338
- **Worktree**: excluded
- **Checks ran at**: e2af620e0c194748767e3cdfa85874fbc0961338; deliberate-break variant ran in a disposable detached checkout of that revision
- **Manual acceptance**: 2 of 5 confirmed — pending: 3.5, 3.6, 3.7 (future phase 3); reviewed phases: 2 of 2 current
- **Date**: 2026-10-25
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

## Verification

Commands captured stdout/stderr to separate `/tmp/exif-full-review-*.log` files. Exit status was captured before reading the output; checks were not piped through another command.

| Progress | Command / check                                                                                                                                                | Exit        | Evidence                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1      | `npx vitest run tests/exif-orientation.test.ts tests/cloud-upload.client.test.ts`                                                                              | 0           | 2 files, 69 tests passed                                                                                                                             |
| 1.2      | `npm run test:unit`                                                                                                                                            | 0           | 32 files, 478 tests passed                                                                                                                           |
| 1.3      | `npm run typecheck`                                                                                                                                            | 0           | `tsc --noEmit`                                                                                                                                       |
| 1.4      | `npm run lint`                                                                                                                                                 | 0           | 0 errors, 86 warnings                                                                                                                                |
| 1.5, 2.4 | `npm run format:check`                                                                                                                                         | 0           | `All matched files use Prettier code style!`                                                                                                         |
| 2.1      | `npx playwright test tests/e2e/cloud-upload-orientation.spec.ts`                                                                                               | 0           | 3 passed: auth setup and both orientation fixtures                                                                                                   |
| 2.2      | `npm run test:e2e`                                                                                                                                             | 0           | All 8 tests passed against the production build on local workerd and Supabase                                                                        |
| 2.3      | Disposable checkout: replace `prepared = await prepare(file)` with identity, then `npx playwright test tests/e2e/cloud-upload-orientation.spec.ts --retries=0` | 1, expected | Both fixture tests failed; setup passed. Tag 6 retained its tag, landscape dimensions and top-left block. Tag 2 retained its tag and top-left block. |
| 1.6, 2.5 | `bash .agents/skills/rune-impl-review/scripts/acceptance-state.sh context/changes/cloud-exif-orientation/plan.md`                                              | 0           | Both rows `current`; accepted at 65a8548fca099e4fa7bc80baddf94738247f45e4 and 35dbbd5a1ced0103d3804cc6f33a4220d468afb8 respectively                  |

## Review Notes

- **Bookkeeping in diff**: context/changes/cloud-exif-orientation/change.md, follow-ups/review-fixes.md, frame.md, plan-brief.md, plan.md, reviews/impl-review-phase-1-65a8548.md and reviews/plan-review.md (all relative to the same change folder).
- **Excluded local changes**: temp_steps.md (untracked, unrelated). No in-scope worktree changes existed at the recorded boundary.
- **Lessons**: 35 of 39 entries apply to impl-review and were read. Relevant priors include consequence-bearing degradation warnings, checking real exit statuses, proving a guard observes its failure, and production-build browser verification.
- **Progress and scope**: phases 1–2 have suffixed Automated rows whose commits are ancestors of HEAD. No malformed n/a rows or unsuffixed completed Automated rows were found. Phase 3 has no implementation evidence and is outside this review: deployment, the live acceptance record, pointer corrections and production acceptance remain pending. No phase-3 commands or paid checks were run. Status remains `implementing`; `updated` is already today's date, 2026-10-25.
- **Plan adherence**: shared bounded JPEG traversal and TIFF parsing, IFD0-only detection, byte-identical unaffected uploads, shared canvas redraw, exact failure copy, pre-POST preparation/re-validation and prepared MIME/body all match. DOM access remains deferred; the existing two-argument hook call remains valid. No Local/result-path changes or other guardrail violations were found.
- **Extra helpers**: tests/helpers/jpeg-bytes.ts shares synthetic unit fixtures; tests/e2e/helpers/jpeg-exif.ts removes APP1 metadata before pixel inspection. Both support planned tests without extending product scope. The committed orientation fixtures are synthetic; their generation and provenance are recorded in tests/e2e/fixtures/README.md.
- **Prior finding verified**: phase-1 report F1 is fixed. The shared TIFF parser rejects non-singleton orientation component counts; SHORT/LONG and both byte orders have detector regressions, and upload regressions verify warning plus original-file preservation. This is a new full-scope report, not an appended round of the phase-1 report.
- **Independent passes**: separate read-only plan-drift and safety/quality reviewers inspected the actual changed files. No confirmed substantive findings remained after verification.
- **Cleanup investigation**: the timeout path awaits page.close before deleting storage. A local hanging-PUT probe confirmed server response/socket closure before page.close resolved, although Playwright emitted neither requestfinished nor requestfailed. The lead reproduced this result (`/tmp/exif-full-review-close-probe.log`). A continuing-upload race was not demonstrated, so the absent post-close tracker await is not reported as a defect; awaiting that tracker alone would hang in this probe. This probe establishes local cancellation behavior, not a guarantee about arbitrary server-side work after disconnection.
- **Build evidence**: the local built client bundle dist/client/_astro/EnhanceWorkspace.T13ItqHg.js contains the new preparation-failure copy. This is local build evidence only, not phase 3's deployed-bundle check.
- **Mutation check**: skipped: EXIF orientation preparation does not implement any failure scenario in test-plan.md §2 / Risk Response Guidance. The change does not alter auth, ownership, cap admission, retention, webhook handling or watchdog decisions; proximity to create-job does not map it to over-cap admission risk #3. The separately planned deliberate-break check was run and passed its expected-failure condition.
- **Lifecycle**: the negative-control checkout was removed after the run. No product code, Progress rows, archives or external trackers were changed, and nothing was committed. This report and change.md are recorded in the workflow carry record.

## Re-review 2 (2026-10-25)

- **Scope**: full — the report's scope; the new work in this round is Phase 3 (phases 1–3)
- **Session**: fresh
- **Base**: e2af620e0c194748767e3cdfa85874fbc0961338 (previous round)
- **Head**: 5e5daa6c36bbe994481eb2626dc1cfe04e6ba22e
- **Worktree**: excluded
- **Checks ran at**: 5e5daa6c36bbe994481eb2626dc1cfe04e6ba22e (current HEAD)
- **Manual acceptance**: 0 of 5 confirmed — pending: 3.5, 3.6, 3.7; unverifiable: 1.6, 2.5
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations
- **Closes**: none (round 1 had no findings)

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

### F1 — New pointers will break once this change is archived

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:339, context/changes/cloud-model-comparison/change.md:31-32
- **Detail**: Phase 3 § Pointer corrections replaced the "outstanding" statements with a path, `context/changes/cloud-exif-orientation/live-acceptance.md`. This change's next step is `/rune-archive`. It moves the folder to `context/archive/<date>-cloud-exif-orientation/` and does not repoint references; its roadmap edit is limited to the matched item (`.claude/skills/rune-archive/SKILL.md:352`), and this change has no roadmap item. Both lines will then point to a file that no longer exists. That is the defect this same phase fixed in `change.md`, where `context/changes/cloud-quality-below-local/calibration.md` went stale on S-17's archive. The implementation follows the plan's wording, so the flaw is in the plan. The pointer lesson ("Writing a fact into its canonical home…") says to point at a home that cannot go stale.
- **Fix**: In the archive commit, point both lines at `context/archive/<archived-folder>/live-acceptance.md`. Then check with `grep -rn 'changes/cloud-exif-orientation' context/foundation context/changes` after the move.
- **Decision**: QUEUED — Fix now (owner, 2026-10-25), deferred to the archive commit because the target path does not exist until the move; tracked in `follow-ups/review-fixes.md` § Round 2 F1. Siblings: none — `exif`/`orientation`/`cloud-exif-orientation` searched across `context/foundation`, `context/changes`, `idea-notes.md` and `AGENTS.md`, and only these two lines outside the change folder point into it; reopened: none (no edit made).

### F2 — Phase 3 Progress rows cite a branch commit that the merge will rewrite

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/cloud-exif-orientation/plan.md:454-457
- **Detail**: Rows 3.1–3.4 carry `— ccecd53`, a commit on `chore/cloud-exif-orientation-live-acceptance`. `master` requires linear history, so this PR's rebase-merge will rewrite that commit, and the suffix will no longer be an ancestor of master. The same thing happened to `65a8548`/`d81db0d`, which `ccecd53` itself had to repoint. The epilogue commit `5e5daa6` held back the Manual rows for exactly this reason but still wrote the Automated suffixes. `progress-format.md` ("`<sha>` not an ancestor of `HEAD`") lets a reader recover the commit through its `(p3)` subject, so no evidence is lost, but the archive check will hit the stale suffix.
- **Fix**: On the archive branch, repoint 3.1–3.4 to the master SHA of `docs(cloud-exif-orientation): Ship and accept in production (p3)`, in the same commit that records 3.5–3.7.
- **Decision**: QUEUED — Fix now (owner, 2026-10-25), deferred to the archive branch because the master SHA exists only after the merge; tracked in `follow-ups/review-fixes.md` § Round 2 F2. Siblings: none — 1.1–2.4 already carry master SHAs (`687e436`, `c112198`, both ancestors of HEAD), and 1.6/2.5/3.5–3.7 are held for re-confirmation on the same branch; reopened: none (no edit made).

### F3 — The control's record has no dimensions or downloaded file

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/cloud-exif-orientation/live-acceptance.md:46-51
- **Detail**: Phase 3 §1 asks the record to give, "for each photo", the BEFORE / AFTER / downloaded-file orientation and dimensions. The control section has only the owner's "unchanged, upright portrait" and says that no file was downloaded. Its job id is assigned by elimination. The control's contract line ("orientation and aspect are unchanged") is met by that observation, and the slider box takes the result's dimensions, so a 90° turn would have shown as a landscape box. Still, the record holds less than the plan asked for.
- **Fix**: When the owner confirms 3.6, either add the control result's dimensions (if its output object is still stored) or state in `live-acceptance.md` that they were not measured and that the slider observation stands in for them.
- **Decision**: FIXED — Fix now; added a `Dimensions` line to the control section of `live-acceptance.md`, stating they were not measured and why the slider observation covers them. Siblings: S17-06 section n/a (it already records 1152 × 1536 from the downloaded file); reopened: none (3.5–3.7, whose surface is `live-acceptance.md`, are still `pending`).

### Verification

Each check's stdout and stderr went to a scratchpad log. Exit statuses were read directly, not through a pipe.

| Progress | Command / check                                                                                                   | Exit | Evidence                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1      | (paid) not run — artifact `live-acceptance.md` checked                                                            | —    | Records PR #313 with `ci`, `integration`, `e2e` and `code-reviewer` green, plus master run `40211523214` at `53f5178` with `deploy` succeeding at 16:31:14 UTC |
| 3.2      | `curl -sS https://luminacleanai.com/`, fetch every referenced `/_astro/*.js`, `grep -lF` for the copy             | 0    | `EnhanceWorkspace.fWz-JT1f.js` contains `Couldn't prepare this photo for Cloud AI`. This is the file the record names                                          |
| 3.3      | The plan's `grep -nF -e 'S-17 Phase 5 waits' -e … -e 'precondition for any in-app run'` over the three files      | 1    | No output                                                                                                                                                      |
| 3.4      | `npm run format:check`                                                                                            | 0    | `All matched files use Prettier code style!`                                                                                                                   |
| —        | `bash .claude/skills/rune-impl-review/scripts/acceptance-state.sh context/changes/cloud-exif-orientation/plan.md` | 0    | 1.6 and 2.5 `unverifiable` (revision not in current history); 3.5–3.7 `pending`                                                                                |

- **Notes**:
  - **Bookkeeping in diff**: context/changes/cloud-exif-orientation/change.md, live-acceptance.md, plan.md, reviews/impl-review-e2af620.md (all in the change folder), and context/foundation/roadmap.md. The one other path, `context/changes/cloud-model-comparison/change.md`, is a planned pointer edit and matches the plan.
  - **Boundary**: `e2af620` is not an ancestor of HEAD. PR #313's rebase-merge rewrote it, and its tree equals master `53f5178` apart from the round-1 report. `git log e2af620..HEAD` therefore lists p1/p2 again as rewritten copies, but the tree diff contains only `context/` files. No product code changed in this round.
  - **Excluded local change**: `temp_steps.md` (untracked owner notes, unrelated).
  - **Lessons**: 35 of 39 entries apply to impl-review. The pointer lesson was applied by grepping the old claim's wording, not the new one. No live document outside this change still calls the fix outstanding: `context/foundation`, `context/changes`, `idea-notes.md` and `AGENTS.md` were searched for `exif`/`orientation`.
  - **Acceptance record**: the full post-merge master SHA, the check date, both job ids and the S17-06 download (1152 × 1536, no tag, full frame upright) are all present. Exactly the three planned passages changed; the S-19 `Status` and `context/archive/` were not touched. Production was not queried in this review; job ids and dimensions come from the record.
  - **Pending acceptance**: 3.5–3.7 are unconfirmed. 1.6 and 2.5 were accepted at pre-merge branch commits `65a8548`/`35dbbd5` and now read `unverifiable`. Commit `5e5daa6` defers all five to the archive branch, so the revisions will be master commits.
  - **Mutation check**: skipped. This round changes only documentation, and no `test-plan.md` §2 risk is touched.
