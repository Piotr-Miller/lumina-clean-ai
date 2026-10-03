<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Finder model swap — pre-registered gate and measurement

- **Plan**: context/changes/finder-model-swap/plan.md
- **Mode**: Deep
- **Date**: 2026-10-03
- **Verdict**: SOUND (re-review 2026-10-03; first pass: REVISE)
- **Findings**: first pass 1 critical, 3 warnings, 1 observation — all decided and applied; re-review 0 critical, 1 warning, 1 observation (F6, F7) — both decided 2026-10-03 and applied

## Verdicts

| Dimension              | Verdict                                       |
| ---------------------- | --------------------------------------------- |
| Requirement Definition | PASS                                          |
| End-State Alignment    | PASS (first pass: FAIL — F1 closed)           |
| Lean Execution         | PASS                                          |
| Architectural Fitness  | PASS                                          |
| Blind Spots            | WARNING (F3, F4 closed; F6 new)               |
| Plan Completeness      | PASS with observation (F2, F5 closed; F7 new) |

## Re-review (2026-10-03)

Scope: confirm F1–F5 are closed in `plan.md` after the owner's triage, and look for new findings the edits
introduced. Deep mode on the changed sections only; the unchanged sections keep the first pass's verdicts.

| Finding | Status | Where it is closed                                                                                                                                                                                   |
| ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | CLOSED | Current State (variable outranks `DEFAULT_MODEL`, `                                                                                                                                                  |     | `at`config.ts:209`, decision B); Desired End State; NOT Doing (no restore); Phase 4 §1 (two code pointers, comments to rewrite) and §1a (owner deletes the variable, `gh variable list`confirms); §3 G5 reads`models.finder`from`review.json` (`pipeline.ts:634`); Progress 4.3–4.5 |
| F2      | CLOSED | Phase 0 §1 (G2 invocation, rules = `fca2778` copy, sha256 `34d5fcac…b48f`, byte-identical to `3d0adc1`'s, `--source-root evals/fixtures/clean-change`); Phase 0 §3 and 0.2; Phase 2 §2 steps 2, 3, 5 |
| F3      | CLOSED | Definitions › Budget (origin now user); Phase 0 §1 (G5 rule: ≤ $0.25 and ≤ 2.00 − T, else `not measured (budget)`); Phase 4 §3 preconditions                                                         |
| F4      | CLOSED | Critical Implementation Details (seal section, UTC time, push to `origin`, GitHub push time; no SHA pointer); Phase 0 §4; 0.6; Phase 2 §1 precondition                                               |
| F5      | CLOSED | Phase 4 §1 (`config.test.ts:154-157` comment) and §2 (`pipeline.ts:533`, `observeFinderStep`)                                                                                                        |

Grounding of the new references: `config.ts:6-13`, `:198-209` ✓; `config.test.ts:31-36`, `:154-157` ✓;
`pipeline.ts:533`, `:634` ✓; `action.yml:25,86` ✓; `review.yml:13,292` ✓; `OPENROUTER_MODEL` is set nowhere in
`.github/` ✓; `OPENROUTER_REVIEW_MODEL` is described as the model's source only in `config.ts` and
`config.test.ts` comments (not in `AGENTS.md`, `agent-env-setup.md` or `review.yml`) ✓. Progress↔Phase: 5 phases,
25 rows, every criterion mapped (0.6, 4.3–4.5 new) ✓. Side effect of F1 checked: deleting the variable changes
nothing for PRs on `master` today, whose `DEFAULT_MODEL` is the same `z-ai/glm-4.6` the variable holds.

No new critical findings.

### F6 — G5 will most likely not fit the $0.25 cap

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 0 §1 (G5 rule), Phase 4 §3
- **Detail**: The first pass's F3 assumed the scratch PR carries no `Plan:` line, so no impl review runs. That is
  wrong: `review.yml:72-74` resolves a plan from any `context/{changes,archive}/**/plan.md` the PR's diff touches,
  and `review.yml:13` reviews only PRs into `master`. A scratch PR that runs this branch's code must target
  `master`, so its diff is this branch vs `master` — 49 files, ~5,100 changed lines today, including this
  change's `plan.md` and the predecessor's archived one. The plan resolves, and if the code review passes the impl
  review runs (measured $0.1996 per run, AGENTS.md) on top of the finder over a large diff and the
  `claude-sonnet-5` judge. The plan now writes this into the estimate honestly, so the protocol is sound — but the
  likely outcome is `not measured (budget)`, and G5 is the one live check the lessons require.
- **Fix A ⭐ Recommended**: Decide now, before Phase 0 is sealed, what G5's cap is (e.g. raise it for G5 only
  within the $2.00, or keep $0.25 and accept that G5 probably falls to a later owner decision).
  - Strength: settled before any number is seen, like every other threshold here.
  - Tradeoff: an owner decision now on a cost not yet measured.
  - Confidence: MEDIUM — the plan resolution is read from code; the finder's cost on this diff is not measured.
  - Blind spot: the branch's diff will grow by Phases 1–4 before G5.
- **Fix B**: Keep $0.25 and add one sentence that a G5 `not measured (budget)` blocks the merge until the owner
  decides.
  - Strength: no new number; makes the consequence explicit.
  - Tradeoff: likely defers the live check to an unplanned decision.
  - Confidence: HIGH — only states what already follows.
  - Blind spot: none significant.
- **Decision**: **Fix A, refined** (owner, 2026-10-03) — G5 limit $0.50 inside the $2.00 (runs only if 2.00 − T ≥ $0.50, else `not measured (budget)`), run on this change's own PR to `master` opened as a draft rather than a scratch PR, and a G5 that is not measured or not green blocks the merge until the owner decides; every PR of this branch into `master` carries the same diff and pays the same review at merge, so a scratch PR would pay for it twice.

### F7 — Where later amendments go is not stated, and the seal check could break on them

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details; Phase 2 §1
- **Detail**: Phase 2 §1 requires the seal's sha256 to "still match" the Pre-registration bytes, and the plan
  allows dated amendments "before the measurement it affects" — but not where. An amendment written inside the
  Pre-registration would fail the check; one written nowhere specific is hard to find.
- **Fix**: State that amendments go in a `## Amendments` section after the seal, each dated, with its own sha256
  and pushed before the measurement it affects.
- **Decision**: **Accepted** (owner, 2026-10-03) — amendments go into `## Amendments` after the seal, each dated, with its own sha256 and pushed before the measurement it affects, and the Phase 2 seal check covers only the Pre-registration section, so an amendment can never break the seal.

## Grounding (first pass)

Paths 9/9 ✓ (modify: `scripts/finder-gate.mjs`, `evals/promptfooconfig.yaml`, `src/config.ts`, `src/config.test.ts`,
`src/pipeline.ts`, `change.md`; create: `finder-gate-core.mjs`, `promptfoo-gate-rows.mjs`, `hand-read-sample.mjs` —
absent, parent exists). Symbols 7/7 ✓ (`ENDPOINT_NAMES` :47, `MODEL` :49, `DEFAULT_MODEL` config.ts:14 + test :38,
`DEFAULT_FINDER_PROVIDERS` config.ts:130 + test :158, `DEFAULT_FINDER_MAX_STEPS` cli.ts:78,
`DEFAULT_FINDER_TIMEOUT_MS` pipeline.ts:50, `describeFinderStep` pipeline.ts:401/533). Brief↔plan ✓.
Progress↔Phase ✓ (5 phases, 22 steps, every bullet mapped; titles are abbreviated forms of the bullets).
Definitions 14/14 user (one plan assumption flagged in the row itself: G5 inside the $2.00). Lessons: 32 of 37 apply
to `plan-review`. Service-tier claim re-verified against OpenRouter docs 2026-10-03; grader
`google/gemini-3.1-pro-preview` is listed with no expiration date (models API, 2026-10-02T21:38Z).

## Findings (first pass)

### F1 — G5 runs before the repository variable moves, so it would review with `glm-4.6`

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 4 — §1 Production pointers, §3 G5, Manual 4.4
- **Detail**: `review.yml:292` passes `review-model: ${{ vars.OPENROUTER_REVIEW_MODEL }}` to the action, and the
  finder resolves override → `OPENROUTER_REVIEW_MODEL` → … → `DEFAULT_MODEL` (`config.ts` resolveModels). The
  variable reads `z-ai/glm-4.6` and is repository-wide. The plan has the owner set it "at merge time" (4.4), after
  G5 (4.3). A scratch PR built from this branch would therefore run the new code (`actions/checkout` on a
  `pull_request` checks out the PR merge ref, and the action is `./.github/actions/ai-review`) **with the old model**:
  G5 would pass or fail on `glm-4.6` and say nothing about the admitted candidate. All Phase 4 criteria could go
  green while the admitted model never ran live — exactly what the "fixtures do not predict live behaviour" lesson
  makes G5 for.
- **Fix A ⭐ Recommended**: The owner sets `OPENROUTER_REVIEW_MODEL` to the admitted model immediately before G5, and
  the plan records the side effect.
  - Strength: G5 measures the production path exactly; `master`'s finder is already non-functional (no admitted
    endpoint), so the switch costs open PRs nothing that works today.
  - Tradeoff: an outward, repository-wide change before merge; until merge, PRs on `master`'s old code would run the
    new model against the old pipeline (and the `["novita"]` routing on master would not serve it).
  - Confidence: HIGH — the resolution chain and the workflow input are read from code.
  - Blind spot: whether any other open PR would be reviewed in that window is not checked.
- **Fix B**: Clear the variable for G5 so the PR's own `DEFAULT_MODEL` governs, then set it at merge.
  - Strength: the scratch PR's code alone decides the model, so G5 tests the branch as it will merge.
  - Tradeoff: also repository-wide while cleared — `master` PRs would fall back to master's `DEFAULT_MODEL`
    (`glm-4.6`), harmless but two outward edits instead of one.
  - Confidence: MEDIUM — the empty-input path is documented in `action.yml:25`; not exercised recently.
  - Blind spot: an empty `vars` value vs an unset one in the action mapping.
- **Decision**: **Variant B, permanent** (owner, 2026-10-03) — the owner deletes `vars.OPENROUTER_REVIEW_MODEL` immediately before G5 and does not restore it; `DEFAULT_MODEL`, set by Phase 4, is the single source of the finder model. Reason: `config.ts:209` uses `||`, so an unset variable falls through to `DEFAULT_MODEL`, and the scratch PR then tests exactly the code and model that will merge, while `master` keeps its own (already non-functional) default and never sends the old `response_format` pipeline to the new model — one outward change instead of two.

### F2 — G2's inputs are not pinned, and the archive does not record them

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 step 2; Phase 0 §1
- **Detail**: The runner requires `--diff`, `--rules` and `--source-root` (`finder-gate.mjs` `required(...)`), but
  the G2 command in the plan passes none. "Same data as the archive" cannot be checked: the archived `gate.md:36`
  names only `evals/fixtures/clean-change.diff`, tool-enabled — not the rules file or the source root. An
  implementer will guess, and a different rules text is a different G2.
- **Fix**: In Phase 0 §1, pre-register G2's exact invocation — `--diff evals/fixtures/clean-change.diff`,
  `--source-root evals/fixtures/clean-change`, and the rules file — stating that the archive does not record the
  rules and which one this gate uses (the #269 base rules, as G1, unless the owner chooses otherwise).
- **Decision**: **Accepted** (owner, 2026-10-03) — G2's invocation is registered in Phase 0 with the same rules file as G1 (`fca2778:.github/ai-review-rules.md`, 2,929 B, sha256 in `gate.md`) and `--source-root evals/fixtures/clean-change`, because a different rules text would be a different G2.

### F3 — No reserve for G5 inside the $2.00

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Definitions (Budget); Phase 2 §2 step 1; Phase 4 §3
- **Detail**: The plan puts G5 inside the $2.00 but lets Phase 2 run to $1.60 plus one attempt. A G5 review runs
  the finder plus the judge on `claude-sonnet-5` (and the impl review if a plan resolves — measured $0.1996 per run,
  AGENTS.md). If Phase 2 ends near $1.60, G5 may not fit, and no rule says what happens then.
- **Fix**: Add a rule: G5 needs 2.00 − T ≥ its pre-registered estimate (the scratch PR carries no `Plan:` line so no
  impl review runs); if it does not fit, G5 is "not measured (budget)" and goes to the owner — never run past $2.00.
- **Decision**: **Accepted** (owner, 2026-10-03) — G5 counts toward the $2.00 and runs only if the remaining budget covers its estimate (≤ $0.25); otherwise `not measured (budget)` and the owner decides, so $2.00 is never crossed.

### F4 — The pre-registration's proof of timing is a branch commit SHA

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — "Ordering of the pre-registration"
- **Detail**: The plan proves the gate predates the first call by a commit SHA noted in `change.md`. `master` is
  linear-history and lands PRs by rebase/squash, which rewrites branch SHAs at merge (observed on PR #210). The
  pointer would be dead after the merge, leaving the timing claim unverifiable from the merged record.
- **Fix**: Record the sha256 of the Pre-registration section and a UTC timestamp in `gate.md` (at the price re-read,
  before the first call); keep the commit, drop the SHA pointer.
- **Decision**: **Accepted with an addition** (owner, 2026-10-03) — sha256 of the Pre-registration and a UTC timestamp in `gate.md`, and the Phase 0 commit pushed to `origin` before the first paid call, because GitHub's push time is independent evidence of order that survives the rebase at merge.

### F5 — Two loose ends in Phase 4

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §1, §2
- **Detail**: T2's site is "`pipeline.ts` (or where `describeFinderStep` is logged)" — it is `pipeline.ts:533`. And
  `config.test.ts:154-157` says the provider list is provisional "until Phase 5 of `finder-serialization-outage`"; the
  literal-assertion edit should rewrite that comment too, or it becomes a stale pointer.
- **Fix**: Name `pipeline.ts:533` for T2; add the `config.test.ts` comment to Phase 4 §1.
- **Decision**: **Accepted** (owner, 2026-10-03) — Phase 4 names `pipeline.ts:533` for T2 and rewrites the stale `config.test.ts` comment, so no pointer is left dangling.

## Triage (2026-10-03)

All five findings decided by the owner on 2026-10-03 and applied to `plan.md` (uncommitted). The plan assumption
"G5 counts toward the $2.00" is **confirmed** by the owner (see F3). The re-review is above.

## Triage of the re-review (2026-10-03)

F6 and F7 decided by the owner and applied to `plan.md` (uncommitted). No further re-review: the edits touch only
F6/F7's sections. One factual detail was added while applying F6: `review.yml:23-26` skips draft PRs and
`review.yml:14` has no `ready_for_review` event, so G5 is triggered by marking the PR ready **and** adding the
`ai-cr:review` label.
