<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: GPT-Image-2.6 Sunburst screening test

- **Plan**: context/changes/gpt-image-26-screen/plan.md
- **Scope**: full (phases 1–5)
- **Session**: fresh
- **Base**: a0193b0777589f497994b8d1c908344bb4f4817f (merge-base master)
- **Head**: 727264fe1dd1a6d0bd90a573507ad86d24f9b1c3
- **Worktree**: excluded — clean at the review boundary
- **Checks ran at**: 727264fe1dd1a6d0bd90a573507ad86d24f9b1c3; historical regressions ran in disposable checkouts of their recorded revisions
- **Manual acceptance**: 0 of 8 confirmed — pending: 1.4, 1.5, 2.4, 3.4, 4.2, 5.3, 5.4, 5.5
- **Date**: 2026-11-21
- **Verdict**: REJECTED
- **Findings**: 1 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

The required GPT26 suite is red at the final lifecycle state (F1), so this review cannot approve completion. The independently recomputed, sealed evaluation verdict still matches its committed PASS; the test-fixture failure is not evidence of a broken rendered image or a billing-cap breach.

## Findings

### F1 — The final lifecycle status makes the required test suite fail

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/gpt26/tests/test_gate.py:620
- **Detail**: The full required command exited 1: `Ran 147 tests in 369.968s`, `FAILED (failures=1)`. `SixTest.test_later_change_md_edits_and_a_rebase_keep_the_verdict` copies the live change.md through `Screen.setUp` (`test_run.py:105–112`), then replaces `status: implementing` with `status: implemented`. The epilogue already set the live status to implemented, so the replacement writes identical bytes. The real `git commit -q -am lifecycle` at line 621 fails with no diff, before either the gate assertion or rebase checks run. This affects the phase 2/3/5 combined-suite criteria on the reviewed final HEAD. Critical here means a required automated acceptance gate fails, not that a production security defect was found.
- **Evidence**: The captured full-suite failure and an independent read-only check confirm zero occurrences of `status: implementing` and equality before/after the exact replacement at this revision. A separate reviewer confirmed the root cause without running or opening any real image.
- **Fix**: Make this synthetic mutation unconditional, such as appending a benign lifecycle-bookkeeping note to its copied change.md, while retaining the real commit and both verdict/history assertions. Do not use an empty commit, skip the test, weaken its assertions or roll back the actual change status.
- **Decision**: FIXED — Fix now. The synthetic lifecycle edit appends a note regardless of the live status. All 147 GPT26 tests passed with this fix. Siblings: none affected (checked lifecycle mutations and rebase tests in GPT26, S-19 and S-20); reopened: none.

### F2 — The pointer check reports success despite incomplete live tracking

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/gpt26/pointers.py:197
- **Detail**: Phase 5 requires every selected pointer, including the #359 mapping row, to link the canonical verdict and permits old wording in dated history. The actual mapping Status at github-issues.md:139 is only `screened: PASS`; the checker explicitly exempts mapping from link validation, yet prints that all seven blocks link the verdict. It also joins all later #359 history rows (lines 149–154) and applies current-status exclusions to that combined history. A legitimate 2026-11-17 historical `proposed screen; planning completed` row makes the check fail even when the valid current outcome row remains. In addition, the selected current queue paragraph in temp_steps.md:109 still says `Zostało: epilog`, although commit 727264f completed the epilogue; the current check accepts it.
- **Evidence**: On the real checkout, `links_verdict(mapping)` returned false while `stale(all_blocks, "PASS")` returned an empty list and the CLI exited 0. In the existing synthetic pointer fixture, adding only the dated historical row caused `old wording 'proposed'`. The epilogue commit and current queue text independently establish the stale remaining-work claim.
- **Fix**: Add the canonical verdict link to the mapping Status and validate it; validate the designated new outcome-log row rather than rejecting preserved historical wording; add missing/wrong mapping-link and same-issue historical-row regressions. Remove the completed epilogue from the current queue's remaining-work text.
- **Decision**: FIXED — Fix now. The mapping Status links the canonical verdict, the checker validates the designated outcome row, and the queue drops the completed epilogue. All 13 pointer tests passed and all seven live pointers passed. Siblings: `context/foundation/github-issues.md` and `temp_steps.md` fixed; the roadmap, idea notes and change outcome already link the verdict and use their own selectors; reopened: none.

## Verification

| Criterion                            | Command or evidence                                                                                                                     | Result                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1.1                                  | Offline JSON assertion: phase-5 prompt equality, request_fields and preserved size/retry/quality/output/pins                            | PASS, exit 0                                                                                           |
| 1.2                                  | `python3 -B scripts/gpt26/check_series.py`                                                                                              | PASS, exit 0; six exact slots, $1.20 first-attempt bounds                                              |
| 1.3, 3.3                             | `npm run format:check` (includes both Phase 1 directories and the repo-wide gate)                                                       | PASS, exit 0                                                                                           |
| 2.1, 3.1, 5.2 suite                  | `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests`                                                                    | FAIL, exit 1; 147 tests, one failure (F1)                                                              |
| 2.2                                  | `python3 -B scripts/gpt26/regression.py --suite s19 --revision HEAD`                                                                    | PASS, exit 0; 85 tests in 94.634s                                                                      |
| 2.2 baseline                         | Same S-19 command at `1a8ae5698d3156a195be022f7f1b2d17f6bd30e0`                                                                         | PASS, exit 0; 85 tests in 96.292s                                                                      |
| 2.3                                  | `python3 -B scripts/gpt26/run.py --dry-run --cap 1.50`                                                                                  | PASS, exit 0 on the completed record: six delivered, zero pending, zero open bounds; no paid operation |
| 3.2                                  | `python3 -B scripts/gpt26/regression.py --suite s20 --revision HEAD`                                                                    | PASS, exit 0; 326 tests in 638.852s, four existing static skips                                        |
| 3.2 baseline                         | Same S-20 command at `1a8ae5698d3156a195be022f7f1b2d17f6bd30e0`                                                                         | PASS, exit 0; 326 tests in 637.781s, the same four static skips                                        |
| 4.1 (paid)                           | Not run (paid) — artifact `evaluations/run.md` checked against committed approval and ledger                                            | Six first-attempt deliveries; $0.484252 conservative usage accounting, no unknown costs or breach      |
| 5.1 (historical paid Progress label) | Not run under that label — artifacts `evaluations/verdict.md` and `verdict.json` checked; separate read-only offline verification below | Stored PASS reproduced exactly, 4/6; no provider or render operation                                   |
| 5.2 pointer CLI                      | `python3 -B scripts/gpt26/pointers.py`                                                                                                  | Exit 0, but false assurance demonstrated by F2                                                         |

The read-only offline gate call was `gate.evaluate("gpt26-screen", ratings_path, run.default_paths())`. Its result equals the committed verdict.json and its Markdown rendering equals verdict.md byte for byte. It checked strict seal/ratings history, the private first-pass checkpoint, frozen/live run records, independent rule identities, exact delivered-slot coverage and source/presentation/transform integrity. It wrote no verdict or source file and displayed no image.

The dedicated seal has one touching commit, c1fc7121cba30fb646f99f47f26df9fbf4d0c44d, which is a strict ancestor of ratings commit db86de4ffb93e8c6cd0622dbfc8bba6abee61363. Output decoding in this review happened only after verifying that committed order and after ratings were complete; the user's prohibition on opening outputs before the seal was respected.

The S-20 candidate overlay was `c15eee7265ab8643f0e6d04b18886588d990aae4` with parent `727264fe1dd1a6d0bd90a573507ad86d24f9b1c3`; the baseline overlay was `2ed062f81cd72f9c5443a377f4bc6f60352d2ef4` with parent `1a8ae5698d3156a195be022f7f1b2d17f6bd30e0`. Each changed exactly the same five metadata paths with verified archive-blob hashes. Both full suites passed and the disposable worktrees were removed; no tests were newly skipped. Environment: Python 3.15.2, Pillow 12.3.0, NumPy 2.5.4, distro cv2 4.13.0, scikit-image 0.26.0 and PyWavelets 1.8.0. Node dependencies were shared only with identical lockfile SHA-256 `120849f1603f584d1275797b809201f09960ac95fdc4adf97c913b57ef1896a6`.

All check stdout/stderr was captured before inspecting excerpts; exit status was not taken from a pipeline. Logs are local, temporary evidence under `/tmp/gpt26-full-review-{unit,s19-head,s19-base,s20-head,s20-base,format,series,prompt,dry-run,gate,pointers,pointer-probe}.log`. No failing check was suppressed or fixed during analysis.

## Review Notes

- **Bookkeeping in diff**: context/changes/gpt-image-26-screen/ (change, plan, plan-brief, evaluations, follow-ups, viewer and prior reviews), context/foundation/roadmap.md, context/foundation/github-issues.md. The viewer and substantive evaluation records were reviewed for their behavior and evidence, not treated as scope-creep exceptions.
- This is the first full-scope report; the earlier phase reports do not make it a re-review. All 37 changed paths and all five implemented phases were included. Initial worktree was clean. No temporary checkout of the review head was needed because it was current HEAD.
- Plan bodies and definitions were read in this conversation; the current plan-body comparison shows only Progress completion/suffix changes since the earlier full read. All Automated rows have ancestor commit suffixes, with no malformed or n/a tokens. Those historical marks do not override the current F1 failure.
- The acceptance-state script exited 0: all eight Manual rows are canonically pending. Dated owner-confirmation notes are present and held for post-merge recording, but the review does not turn them into checked rows or infer human acceptance from passing checks. No Progress row was edited.
- Applicable lessons: 35 of 39, selected by impl-review/all or missing Applies-to. The ledger is unchanged from the earlier review in this conversation. Relevant priors include independent evidence, fixed denominators, meaningful checks and refreshing all live pointers.
- Two read-only delegates reviewed full-plan drift and safety/quality/patterns, including the S-19 generic hooks. Their candidate findings were checked against source and independent synthetic probes. F1 was independently confirmed after the full-suite result.
- Phase 1 registration, Phase 2 explicit context/locks/admission/retry/bindings and Phase 3 builder/gate/two-pass design substantially match the plan. Phase 4's completed run and Phase 5's mechanical verdict are consistent with their committed records. The prior ordinary stale-tab and seal-write rollback fixes are present; no production, archive, holdout, prompt or historical configuration changes appear.
- The published [#359 comment](https://github.com/Piotr-Miller/lumina-clean-ai/issues/359#issuecomment-7067536694) was read back and includes the generated-detail/minor-rating caveat, the wider-comparison-only boundary and Cloud-paused statement. The issue remains open. The connector was unavailable, so the read-only fallback used `gh api`; no GitHub mutation was performed.
- **Interpretation of PASS**: this is a mechanical result from the committed subjective levels, not an independent re-rating or proof of production quality. Every GPT side was rated minor despite crop prose describing redrawn identities, invented lettering and lost stars; the owner kept those levels. That limitation is disclosed in change.md, the roadmap and the published comment. No image was displayed or semantically re-rated in this review.
- **Cost interpretation**: $0.484252 is reported usage multiplied by frozen config rates, rounded to $0.4843 in the runner's “known billed” line, not an independently queried invoice. The config deliberately retains its conservative $10/M text rate. Cap accounting, unknown-cost retention and breach stops were reviewed separately; no billing-cap bypass was found.
- **Bounded publication interruption observation, not a blocking finding for the completed set**: an interrupt delivered on return from the real successful rename can leave the final directory and remove its owned seal. Independent synthetic probes reproduced this without images. This is the narrow post-success window of the existing rollback logic, not the ordinary seal-write failure already fixed in phase 3; today's sealed set and recomputed verdict are unaffected. It is a potential future publication-hardening follow-up. No frozen runtime bytes were changed or risk acceptance recorded on the owner's behalf.
- Mutation testing skipped: these offline Python/HTML evaluation tools do not implement a production failure scenario from the foundation Risk Map/Response Guidance; the configured TypeScript Stryker scope does not cover them.
- No paid calls, new renders, deployments, publishing or issue changes were made. Analysis leaves only this report and the change.md lifecycle/date stamp uncommitted, recorded in the workflow carry file. For this full review, implemented becomes impl_reviewed as the skill requires; that lifecycle stamp means reviewed, not APPROVED.
