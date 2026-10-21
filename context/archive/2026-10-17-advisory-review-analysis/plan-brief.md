# Close out the advisory AI review direction — Plan Brief

> Full plan: `context/changes/advisory-review-analysis/plan.md`
> Research: `context/changes/advisory-review-analysis/research.md`
> Decisions: `context/changes/advisory-review-analysis/worth-fix-sheet.md` § Delegated owner decisions

## What & Why

The recorded finder results answer the change's question: **0 of 55 accepted glm-5.3 low findings warranted a fix**.
20 were optional improvements, 32 were noise and 3 were false. No other candidate and no production history showed
better value. One cause is that this repository's PRs rarely change product code. The owner's delegated decision
(2026-10-19) is to **end the work, run no paid pilot, and keep `ai-review` disabled**. This plan makes that close-out
true everywhere it is stated, and fixes the one fix-worthy defect the analysis found.

## Starting Point

- `ai-review` has been off since 2026-10-04 (`false &&` in `.github/workflows/review.yml`). Its comment still says a
  successor change "measures a verified finder" and that deploying one removes the guard.
- `AGENTS.md` describes the workflow as if it were running.
- Issue #235 (the outage of 2026-09-20) is still open.
- Both `scripts/prod-*.py` print `KEY[:24]` when the key still contains `<` or `>`. That is `247-I5`, the only W1,
  raised by glm-5.3 high and sonnet-5 low but never by glm-5.3 low.

## Desired End State

- Neither script prints any character of a mistyped key, and a key-echo check proves it without network access.
- `close-out.md` holds the decision, the adopted numbers, what stays, how to re-enter, and dormant pilot criteria for
  a later owner decision.
- `research.md` carries the adopted numbers as a dated follow-up.
- `lessons.md` has one new rule.
- The workflow comment and `AGENTS.md` state the real status and name the change. #235 is closed as not planned with
  a permalink. `temp_steps.md` points at `/rune-archive`.

## Key Decisions Made

| Decision                       | Choice                                                                                                                             | Why (1 sentence)                                                                            | Source                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| What counts as "worth a fix"   | W1 only; W2 is optional                                                                                                            | Counting W2 would erase the distinction the change was opened to measure                    | Research → owner (Codex)   |
| Direction                      | End the work; no paid pilot; `ai-review` stays off                                                                                 | No fix-worthy yield from glm-5.3 low, and no shown value beyond CI plus `/rune-impl-review` | Owner (Codex)              |
| `247-I5`                       | Fix it in this change (Phase 1)                                                                                                    | The only W1; a few lines in two files; follow-ups in archives get missed (D2 still open)    | Plan (owner)               |
| Issue #235                     | Close as not planned, with a permalink comment                                                                                     | An open `bug` for a deliberately disabled job is itself a stale pointer                     | Plan (owner)               |
| Lesson                         | One new `lessons.md` entry                                                                                                         | Several changes measured "is it real" on frozen tooling PRs instead of "is it worth fixing" | Plan (owner)               |
| Pilot eligibility (dormant)    | Diff changes ≥ 1 non-test file under `src/`, `supabase/functions/` or `supabase/migrations/`; refactors count; first five by merge | Objective and sealable; checkable with `git diff --name-only`                               | Plan (owner)               |
| Pilot shape (dormant)          | glm-5.3 low, local from a `feat/finder-glm-5-3` worktree; score only W1 not already caught by CI or `/rune-impl-review`            | No experimental reviewer code merged into CI; measures marginal value, not redundancy       | Owner (Codex)              |
| Pilot decision rule (dormant)  | ≥ 1 uncaught W1 in five PRs → consider re-enabling; 0 → stays ended                                                                | The one question the gates never asked; FA/W2/W3 and cost reported only                     | Plan (A3, owner-confirmed) |
| Settings, package and branches | Secret, variables, `packages/code-reviewer`, its CI job and both glm branches stay                                                 | "End" stops spending and experimenting; it does not dismantle a dormant capability          | Plan (A1, owner-confirmed) |

## Scope

**In scope:**

- The two placeholder branches of `scripts/prod-*.py`, plus `key-echo-check.py`.
- `close-out.md`, a `research.md` follow-up and one lesson.
- Comment-only edits to `review.yml`, and one status sentence in `AGENTS.md`.
- Closing #235, and refreshing `temp_steps.md`.

**Out of scope:**

- Any model call, pilot or settings change.
- Deleting the workflow, the package or the branches.
- The W2 fixes, D2 among them.
- Any edit under `context/archive/`.
- Sealing the pilot's pre-registration.

## Architecture / Approach

The phases run code first, then the record, then the pointers, then outward actions:

1. The executable fix.
2. The record that everything else points to.
3. The two live documents, which name the change so they survive the archive move to
   `context/archive/2026-10-17-advisory-review-analysis/`.
4. The tracker and the resume file, after the branch is pushed, so the issue comment can link a pushed commit.

`/rune-archive` follows as its own step.

## Phases at a Glance

| Phase                                     | What it delivers                                                   | Key risk                                                        |
| ----------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1. Stop printing the supplied key         | Placeholder errors describe the key by shape; `key-echo-check.py`  | Changing a check's order or its message beyond the branch       |
| 2. Record the close-out                   | `close-out.md`, research follow-up, one lesson                     | Numbers drift from the adopted sheet (20/55, not 21/55)         |
| 3. Correct the live pointers              | Comment-only `review.yml` edit and the `AGENTS.md` status sentence | A non-comment line changes, or the guard is touched             |
| 4. Close #235 and refresh the resume file | #235 closed as not planned; `temp_steps.md` names `/rune-archive`  | Outward action before the branch is pushed or the text approved |

**Prerequisites:** the owner pushes the branch (or approves the push) before Phase 4, and approves the #235 comment
text.
**Estimated effort:** one short session, four small phases.

## Open Risks & Assumptions

- **A1:** keeping the secret and the variables leaves an unused credential configured. The guard and the key's credit
  limit bound the exposure.
- **A3** is a proposal. A reopening change must confirm it, or replace it, before sealing.
- **The dormant pilot may take months to fill.** About one product-code PR merged in seven weeks.

## Success Criteria (Summary)

- A mistyped key never reaches the terminal, and the check that proves it fails on today's code.
- Anyone reading the workflow, `AGENTS.md` or the tracker learns that AI review is off by decision, why, and what
  re-entry takes.
- The change folder holds a decision record a later owner can act on without re-reading 200 findings.
