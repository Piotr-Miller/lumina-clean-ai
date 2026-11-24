<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: GPT-Image-2.6 wider comparison (eight tuning photos)

- **Plan**: `context/changes/gpt-image-26-wider/plan.md`
- **Scope**: Phase 1 (phases 1–5)
- **Session**: fresh
- **Base**: `0850b93f2a8d6d4c00c9ba55a099b814c375e7e9` (merge-base)
- **Head**: `3bce55e3a3f5cebae0849285802f9c0cb79e2e60`
- **Worktree**: included(`context/changes/gpt-image-26-wider/plan.md`, `context/changes/gpt-image-26-wider/evaluations/regression-baseline.md`)
- **Checks ran at**: `3bce55e3a3f5cebae0849285802f9c0cb79e2e60` (S-19 in a detached worktree at this revision)
- **Manual acceptance**: 0 of 1 confirmed — pending: 1.4
- **Date**: 2026-12-04
- **Verdict**: REJECTED
- **Findings**: 1 critical, 4 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | PASS    |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Git can pin a link while the paid runner uses its mutable target

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: `scripts/gpt26/run.py:134`, `scripts/gpt26/run.py:262`, `scripts/gpt26/study.py:146`, `scripts/gpt26/study.py:181`
- **Detail**: `check_registration()` checks the Git entry and pins its blob. A tracked symlink has its own blob, which stores the link destination. The config, series, viewer and approval readers follow the link and use the target's bytes. Containment of a config, series or viewer path still permits a link to another file inside the allowed directory. The derived `change.md` passes through the same Git check and its target can supply an approval absent from the committed contents. A viewer target can also change while the pinned viewer blob stays the same. This breaks both committed spend approval and content binding for the new configurable study paths.
- **Fix**: Require regular Git files at the actual resolved registration, rule and approval paths, and verify that the bytes consumed match the checked Git entries. Add regression coverage for aliased approvals and viewer files.
  - **Strength**: The approval check and frozen evidence bind the same content the tools consume.
  - **Tradeoff**: Intentionally aliased registration and approval files need to move to canonical paths.
  - **Confidence**: HIGH. The Git checks and filesystem reads operate on different objects for a symlink.
  - **Blind spot**: Reviewed the source path. Paid admission was exercised only through the existing synthetic suite.
- **Decision**: FIXED — Require unaliased regular Git files, match the exact bytes consumed, and verify approval before each reservation. Siblings: `run.py`, `study.py`, `check_series.py`, `blind.py`, and `gate.py` fixed. The standalone S-19 approval belongs to the separate S-19 protocol. Reopened: none.

### F2 — Derived write destinations can escape the study or overwrite its records

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH
- **Dimension**: Plan Adherence
- **Location**: `scripts/gpt26/study.py:170`, `scripts/gpt26/blind.py:432`, `scripts/gpt26/gate.py:520`, `scripts/gpt26/run.py:414`, `scripts/s19/run-candidate.py:521`
- **Detail**: Phase 1 requires containment after symlink resolution before a tool writes. The descriptor validates the configured roots. The blind builder and gate then create files under `evaluations/` without checking its resolved location or the report destinations. An active change can therefore write into an archive through an aliased evaluations directory. The `--report` guard checks the whole active-change directory, so a leaf symlink to another file inside the change can still redirect its write. The runner's sidecar, ledger and lock paths and the private diagnostic logs have the same missing descendant check. `config.name` is also used as a directory component for paid outputs and is only compared with the series value by `check_series.py:294`.
- **Fix**: Validate the actual write destinations and path components against the expected evaluations or private root before any write, and before a paid reservation. Reject aliased write destinations and require safe single-component output names.
  - **Strength**: Preserves the archive and study boundaries at the point the files are used.
  - **Tradeoff**: The shared S-19 write helpers need review so GPT26 containment preserves existing S-19 callers.
  - **Confidence**: HIGH. The current writes use lexical children of validated roots and follow symlinks.
  - **Blind spot**: Source review established the reachable writes. No private evidence or archive writes were performed.
- **Decision**: FIXED — Guard the actual destinations for run state, locks, output, seal, logs, and reports. Validate output path components before admission. Siblings: `study.py`, `run.py`, `blind.py`, `gate.py`, and GPT26's context in `scripts/s19/run-candidate.py` fixed. Reopened: none.

### F3 — The paid runner trusts unpinned S-19 reference files

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Plan Adherence
- **Location**: `scripts/gpt26/run.py:222`, `scripts/gpt26/check_series.py:43`, `scripts/gpt26/check_series.py:188`, `scripts/gpt26/check_series.py:275`, `scripts/gpt26/study.py:47`
- **Detail**: The S-19 Phase 5 config and series are read from the working tree. Their values decide whether the registered endpoint, prompt, cost parameters and input identities pass validation. Both files are absent from `Study.binding_files`. In a disposable fixture, changing the reference prompt changed the registration result while every binding stayed identical. A dirty reference can therefore influence first-run admission and a changed reference can affect resume or gate verification independently of the pinned identities. The fixed screen runner already had this omission. Phase 1 carries it into the study binding contract.
- **Fix**: Add the two S-19 references to the study's binding inventory and require their verified bytes for validation in the runner, builder and gate.
  - **Strength**: Reproduces the acceptance decision from the same committed reference data.
  - **Tradeoff**: A later edit to either reference blocks verification on that checkout. The evidence revision retains the original data.
  - **Confidence**: HIGH. Both JSON files are read on the registration load path and neither appears in the inventory.
  - **Blind spot**: The fixture checked the prompt comparison offline. It did not exercise a provider request.
- **Decision**: FIXED — Include both S-19 Phase 5 references in the binding inventory. Paid validation and the builder and gate consume verified reference bytes. Siblings: `study.py`, `check_series.py`, `run.py`, and the builder and gate's shared registration loader fixed. Reopened: none.

### F4 — The offline report can present a working-tree approval as committed evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: `scripts/gpt26/run.py:270`, `scripts/gpt26/run.py:407`, `scripts/gpt26/run.py:477`
- **Detail**: `--report` dispatches before the paid path's Git preflight. When there is no sidecar, reconciliation bypasses the registration and rule cleanliness check. In every report, the approval renderer reads the working tree and treats any valid matching line as usable. Disposable fixtures confirmed exit 0 and a normal approval line for an uncommitted approval. They also confirmed exit 0 for a dirty config and series with no sidecar, where the report printed the dirty config's hash and claimed committed registration. A report intended to diagnose an interrupted or blocked run can then misstate what was committed.
- **Fix**: Read the report's registration and approval from verified committed contents, or explicitly label unverifiable provenance while still reporting the blocked or unresolved state.
- **Decision**: FIXED — Keep the diagnostic report and explicitly surface unverified registration or unusable approval. Siblings: dry-run readiness and the gate and builder's approval reader use the shared verification. Reopened: none.

### F5 — Duplicate issue mapping sections suppress the issue outcome check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: `scripts/gpt26/pointers.py:175`
- **Detail**: `section()` raises `Missing` for zero or multiple matches. `issue_blocks()` converts both to an empty list. In a disposable fixture, the CLI returned exit 1 for a mapped issue with a missing outcome. Adding a second `## Final mapping` heading changed the exit to 0 and dropped the two issue checks. Phase 5 §2 makes verification optional only when the study has no numbered mapping.
- **Fix**: Propagate ambiguity from the mapping selector and add a duplicate-heading case with a numbered study issue to the pointer suite.
- **Decision**: FIXED — Refuse ambiguous issue mapping headings while allowing checks for studies with no numbered mapping. Siblings: the same section selector already refuses ambiguity for mandatory pointer blocks. Reopened: none.

### F6 — Manual check 1.4 describes a narrower code change than the plan

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria
- **Location**: `context/changes/gpt-image-26-wider/plan.md:282`, `context/changes/gpt-image-26-wider/plan.md:696`
- **Detail**: The wording “only paths moved” conflicts with the planned change from registration-commit equality to blob equality and the addition of `--report`. The source preserves slot admission, conservative spend, retry limits and breach handling for a valid study. Resume after a history rewrite with identical content is intentionally newly allowed. This finding concerns the criterion text. The separate owner decision remains pending.
- **Fix**: State the paid-run invariants the owner should inspect and acknowledge blob-based resume as part of Phase 1. Keep 1.4 pending for owner review against the revised criterion.
- **Decision**: FIXED — Clarified approval, locked reservation, retry, breach, and blob-based resume in the Phase 1 manual criterion and linked all four relevant files. Siblings: the acceptance-state check reports 1.4 pending. Reopened: none.

## Verification

| Row | Check                                                                                               | Result                                                                    |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1.1 | `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests`                                | PASS on Fedora, exit 0, `Ran 180 tests in 336.162s`, `OK`                 |
| 1.2 | `git grep -n "gpt-image-26-screen" -- scripts/gpt26/*.py`                                           | PASS, exit 1 with no matches in top-level GPT26 tool files                |
| 1.3 | `python3 -B scripts/gpt26/regression.py --suite s19 --rev 3bce55e3a3f5cebae0849285802f9c0cb79e2e60` | PASS, exit 0, `Ran 85 tests in 48.011s`, `OK`                             |
| 1.4 | `acceptance-state.sh`                                                                               | Pending, exit 0, surface `scripts/gpt26/run.py`, `scripts/gpt26/state.py` |

## Review Notes

- **Bookkeeping in diff**: `context/changes/gpt-image-26-wider/change.md`, `context/changes/gpt-image-26-wider/evaluations/regression-baseline.md`, `context/changes/gpt-image-26-wider/frame.md`, `context/changes/gpt-image-26-wider/plan-brief.md`, `context/changes/gpt-image-26-wider/plan.md`, `context/changes/gpt-image-26-wider/reviews/plan-review.md`. The earlier `7387271` commit also updates `temp_steps.md` for the Fedora handoff. It is outside the Phase 1 implementation commit.
- The pre-existing working-tree changes add Phase 1 SHA suffixes in the plan and an S-19 candidate rerun in the baseline. Code checks used the recorded Phase 1 commit. The report probe used a temporary synthetic repository.
- The full-gate history rewrite test covers the registration commit and verifies that a changed rule blob blocks evaluation. The committed viewer fixture has the same Git blob as the archived viewer. The wider viewer and registration are scheduled for Phases 2 and 3.
- Phase 5 will need to consolidate the three matching `## Teraz` entries and add the wider `## Kolejka` entry. Phase 3 already schedules adding the ID to the roadmap bullet.
- 36 of 40 lessons apply to implementation review. The content-hash and canonical-pointer lessons drove the evidence and pointer checks.
- Mutation testing was skipped because the change affects local evaluation tooling. `context/foundation/test-plan.md` §2 maps Stryker's scope to live application risks. Its cap risk covers the production Replicate/Postgres gate, which this phase leaves unchanged.

## Triage verification

- The recorded verdict covers `3bce55e`. The six decisions above cover the applied working-tree fixes.
- GPT26 discovery suite passed on Fedora with 189 tests. The single output-directory name test added after discovery started passed in a separate run.
- S-19 regression passed with 85 tests in the working tree, including the shared runner changes.
- The top-level GPT26 tool path check passed and the acceptance script reported 1.4 pending. The tests used synthetic data and provider stubs.
