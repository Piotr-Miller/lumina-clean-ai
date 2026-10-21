# Re-enable advisory AI review with the ported finder fix — Implementation Plan

## Overview

The owner decided on 2026-10-21 to turn `ai-review` back on. This reverses the 2026-10-19 close-out of change
`advisory-review-analysis`, which ended the work and kept the job off. The plan:

- **Port the finder serialization fix** from `feat/finder-serialization-outage` (`87ba5da`) onto `master`. It makes
  the finder two-stage: gathering with the tool, then a tool-less finalization with no `response_format`, parsed and
  strictly validated on our side with at most one format repair. It routes the finder to `["novita"]` by default.
- **Add T2**, a bounded, escaped CI log line of each finder request's model text.
- **Correct the live pointers** in `.github/workflows/review.yml` and `AGENTS.md`.
- **Remove the `false &&` guard**, only after the owner has raised the OpenRouter key limit. The first live run on
  this change's own PR is the probe. If it fails, the guard goes back before merge.

The finder model stays `z-ai/glm-4.6`.

## Current State Analysis

- **The job is off.** `.github/workflows/review.yml:32` holds `false &&`. The comment at `:23-30` says the search
  ended on 2026-10-19 and that re-entry needs a new owner decision and a new change. This change is both
  (origin: user, 2026-10-21).
- **The production finder still depends on provider-side structured output.** On `master`,
  `packages/code-reviewer/src/reviewer.ts:169` uses `tolerantReviewOutput`, an `Output.object` wrapper. OpenRouter
  routes glm-4.6's `json_schema` requests to Venice, and Venice stopped applying `response_format` on 2026-09-20:
  35 of 35 finder runs failed (`context/archive/2026-09-24-finder-serialization-outage/change.md:53-63`).
- **The fix exists and was measured, but was never merged.**
  - `feat/finder-serialization-outage` tip `87ba5da`, archive commit `1917728`, which is not an ancestor of
    `master`.
  - G1 parsed 10 of 10 on z-ai, novita and venice.
  - No endpoint passed the whole G1–G4 gate (`change.md:124-136`). novita passed every automated gate but failed
    G3's hand-read: 10 of 50 #269 findings rejected, 40 unresolved. z-ai and deepinfra hit HTTP 429.
  - The owner accepts that quality risk for an advisory job (2026-10-21).
- **The port is mechanical.** On `master`, `packages/code-reviewer` is unchanged since the branch's merge-base
  `a4f4d34`: only `.github/workflows/review.yml` changed on `master`'s side. The branch's `src/` and `evals/` can
  therefore be taken byte-for-byte. Origin: `code` (a git fact, checked on 2026-10-21).
- **`evals/` must move with `src/`.** `evals/finder-provider.ts` imports from `../src/index.js`. The package's
  `tsconfig.json` includes `evals/**/*.ts`, and `vitest.config.ts` includes `evals/**/*.test.ts`.
- **No `master` script imports a removed export.** The fix removes `tolerantReviewOutput`, `repairParsedOutput`,
  `repairReviewResultShape` and `REPAIRED_SUMMARY_PLACEHOLDER`. `scripts/fabrication-grade.mjs:33` imports
  `asStepCost` from `../src/pipeline.js`, and the branch still exports it from there.
- **The branch has no CI run or PR on record.** Its only test evidence is the local runs in its phase reviews.
  The package gate (`npm run lint`, `npm run typecheck`, `npm test` in `packages/code-reviewer`, as the
  `code-reviewer` CI job runs them) is this plan's gate.
- **`review.yml` needs a hand merge.**
  - The branch rewrote the root-cause comment (`master` `:218-226`) with its own account.
  - `master` rewrote the same lines in `82776c5`.
  - The branch also adds a fifth diff exclusion, `':(exclude,glob)**/*.jsonl'`, with its rationale: twelve
    `gate-*.jsonl` files, 243,296 B, that would fill the 100 KB window. Those files are now under
    `context/archive/2026-09-24-finder-serialization-outage/` on `master`.
- **`AGENTS.md:124` is stale twice.**
  - It opens with "`ai-review` is disabled".
  - It ends with "schema mismatches re-roll immediately". After the port that holds for the judge and the
    implementation review only. The finder fails with `FinderOutputError`, which is deliberately not retryable,
    and gets one format repair instead (branch `src/retry.ts:23-30`).
- **T2 has a seam.** The CLI prints one escaped line per finder request through `onFinderStep`
  (branch `src/cli.ts:303-310`, `formatFinderStepLine` at `:104-115`). `FinderStepInfo`
  (branch `src/pipeline.ts:363-386`) carries no model text today. A cap precedent exists:
  `REJECTED_OUTPUT_CAP_CHARS = 2_000` plus a truncation marker.
- **A PR can probe itself.** `pull_request` runs use the workflow from the PR's merge ref. Once this change's PR
  removes `false &&`, `ai-review` runs on this PR's own diff, which is about 2.7k lines of `packages/code-reviewer`
  code. The guards are unchanged: same-repo, non-draft, human author, labeled only for `ai-cr:review`. The trusted
  rules still come from the base branch.

### Carried from predecessor

`change.md` names `finder-serialization-outage` and `advisory-review-analysis`.

| Item                                                                                                 | Source (path + finding)                                                                                                                     | Disposition                                                                                             | Addressed in |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------ |
| Review findings of `finder-serialization-outage` (plan review F1–F5, impl reviews of p0, p2, p3, p4) | `context/archive/2026-09-24-finder-serialization-outage/reviews/*.md`                                                                       | resolved: every Decision `FIXED`, or `FIX` with its resolving commit (`b3a4a38` p3 F1, `0a584f6` p4 F1) | —            |
| T1, provider attribution on the rejected-output line                                                 | `…/follow-ups/review-fixes.md` T1                                                                                                           | resolved there in Phase 2 (ported as is)                                                                | Phase 1      |
| T2, bounded CI log of stage-1 text                                                                   | `…/follow-ups/review-fixes.md` T2; deferred again by `finder-model-swap` (`context/archive/2026-10-02-finder-model-swap/change.md:235-243`) | carried forward (owner, 2026-10-21)                                                                     | Phase 2      |
| G5, live scratch-PR run, never run                                                                   | `finder-serialization-outage/change.md:158-161`; `finder-model-swap/change.md:216`                                                          | carried forward: this change's own PR is the live run                                                   | Phase 4      |
| novita failed the G3 hand-read (10/50 rejected, 40 unresolved)                                       | `finder-serialization-outage/change.md:131-136`                                                                                             | superseded: owner accepts it for an advisory job (2026-10-21)                                           | —            |
| Report to OpenRouter/Venice (old 5.4)                                                                | `finder-serialization-outage/change.md:165`                                                                                                 | superseded: the port removes the dependency on `response_format`                                        | —            |
| The direction ended, `false &&` stays, re-entry needs a new change                                   | `context/archive/2026-10-17-advisory-review-analysis/close-out.md` § Decision, § Re-entry                                                   | superseded by the owner decision of 2026-10-21; this is that new change. The archive is not edited.     | Phase 4      |
| The dormant pilot criteria (five eligible PRs, W1-only scoring, $2 cap)                              | `advisory-review-analysis/close-out.md` § Dormant pilot criteria                                                                            | superseded: the owner chose to re-enable without the pilot                                              | —            |

## Definitions

| Term              | Decided meaning                                                                                                                                                                                                                                                                | Origin                                                  | On degenerate data                                                                                                                                                                                                                                                    | Verified by                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| The fix (ported)  | `packages/code-reviewer/src/` and `packages/code-reviewer/evals/` byte-identical to `87ba5da`, plus the T2 addition. The gate tooling `scripts/finder-gate.mjs` and `scripts/finder-wire-dump.mjs` is not ported.                                                              | user ("apply this fix", the branch named on 2026-10-21) | A file that exists on `master` but not on the branch under those two directories is deleted by the port. None exists on 2026-10-21.                                                                                                                                   | 1.1                                                 |
| Budget raised     | The owner states that the limit and credit of the OpenRouter key behind the CI secret `OPENROUTER_API_KEY` were raised. The flip waits for that statement.                                                                                                                     | user (2026-10-21)                                       | A confirmation without a figure is recorded as `confirmed, figure not stated`. No confirmation means no flip, and Phase 4 waits.                                                                                                                                      | Phase 4 precondition, recorded in `change.md` Notes |
| Live probe passes | The first `ai-review` run on this change's PR after the flip: the finder ends without `FinderOutputError` and without 429 exhaustion, the sticky comment is posted, and exactly one `ai-cr:*` label is set. `findings: []` still passes. Quality is the owner's separate read. | user (2026-10-21)                                       | A run cancelled by a newer push does not count; the next run does. A green run that took the `SKIP_REVIEW` branch is not a pass, because it reviewed nothing. A failure in the implementation-review pass alone does not fail the probe: it is advisory and isolated. | 4.5, `probe.md`                                     |
| On probe failure  | Put `false &&` back in the same PR, record the failing run in `probe.md`, and rewrite the pointers to say the job is off with this change as the record. Merge the port, T2 and the pointers only.                                                                             | user (2026-10-21)                                       | A failure caused by an exhausted key limit is still a failure. `probe.md` names the cause, and the owner may top up and re-run once, with `ai-cr:review`, before the guard is restored.                                                                               | 4.6, `probe.md`                                     |
| Enabled           | The `ai-review` job's `if:` without `false &&`. The other four guards are byte-identical to today.                                                                                                                                                                             | product (`review.yml` guards, AGENTS.md)                | —                                                                                                                                                                                                                                                                     | 4.1, 3.3                                            |

## Desired End State

- `master`'s finder runs two-stage with its own parser, routed to novita, and every finder request leaves one
  bounded, escaped text line in the Actions log.
- `ai-review` runs on same-repo, non-draft, human PRs. If the probe failed, the job is off again with a recorded
  reason.
- `review.yml` and `AGENTS.md` describe the actual state and name this change.
- `probe.md` records the first live run: its URL, each finder step's provider, the parse outcome, the comment URL,
  the label and the cost.

### Key Discoveries:

- `packages/code-reviewer` on `master` is unchanged since `a4f4d34`, so the port is a checkout of two directories
  (`git diff --stat a4f4d34 origin/master -- packages` is empty).
- The branch's `retry.ts` documents why `FinderOutputError` is not retryable. `AGENTS.md` must not keep promising a
  finder re-roll.
- A self-probing PR needs no scratch PR: G5 runs on this change's own diff, as `finder-model-swap` planned
  (`context/archive/2026-10-02-finder-model-swap/plan.md:490-495`).

## What We're NOT Doing

- **No model change.** `OPENROUTER_REVIEW_MODEL` stays `z-ai/glm-4.6`, and `OPENROUTER_JUDGE_MODEL` and the
  implementation-review model stay as they are.
- **No routing change.** The branch default `["novita"]` stays. `OPENROUTER_FINDER_PROVIDERS` is not set.
- **No new quality gate.** The owner reads the comments. Making `ai-review` a required check is out of scope: it
  stays advisory and outside `deploy.needs`.
- **Not porting** `scripts/finder-gate.mjs` and `scripts/finder-wire-dump.mjs`, the dormant measurement tooling, or
  anything from `feat/finder-model-swap`, `feat/finder-verification` or `feat/finder-glm-5-3*`.
- **No edit under `context/archive/`.** The archived close-out keeps its 2026-10-19 decision as history. This
  change records the reversal.
- **No change to the implementation-review gate or its cost.** It costs about $0.20 per PR with a plan, and only
  after a passing code review.

## Implementation Approach

1. Port the code first, while the job is off, so `master`-bound commits never run an unproven finder.
2. Add T2 test-first.
3. Correct the pointers that are true either way.
4. Flip last, after the owner's budget confirmation. The probe is this PR's first post-flip run.

## Critical Implementation Details

- **Spend per push.** Once the guard is removed on the branch, every push to the PR is a paid review: about $0.02
  for the finder and judge, plus about $0.20 for the implementation review while the code review passes.
  Concurrency cancels superseded runs. Push the flip together with Phase 4's own bookkeeping where possible, and
  expect one more run for the epilogue and archive pushes.
- **Hand merge in `review.yml`.** Take `master`'s current text as the base. The branch's version of the root-cause
  comment is not applied verbatim, because it says the model swap continues in `finder-model-swap`, which has been
  archived since 2026-10-03.

## Phase 1: Port the two-stage finder

### Overview

Bring the measured serialization fix onto this branch exactly as the outage change left it.

### Changes Required:

#### 1. The package source and evals

**Files**:

- `packages/code-reviewer/src`, `packages/code-reviewer/evals` checked out from `87ba5da`

**Intent**: The finder stops sending `response_format`, parses its own output and routes to novita. That is the
fix the gate measured at 10 of 10 parsed, Venice included.

**Contract**: Both directories end up byte-identical to `87ba5da`. No other path under `packages/` changes. The
public exports that `evals/` and `master`'s `scripts/` import still resolve.

### Success Criteria:

#### Automated Verification:

- The two directories are byte-identical to the branch tip:
  `git diff --quiet 87ba5da -- packages/code-reviewer/src packages/code-reviewer/evals` — at planning: exit 1 —
  expected until Phase 1
- Package lint passes: `npm --prefix packages/code-reviewer run lint` — at planning: exit 0
- Package typecheck passes: `npm --prefix packages/code-reviewer run typecheck` — at planning: exit 0
- Package tests pass: `npm --prefix packages/code-reviewer test` — at planning: exit 0 (608 tests)
- Repository formatting stays clean: `npm run format:check` — at planning: exit 0

**Implementation Note**: Manual checks are acceptance. `/rune-implement` commits a phase once its automated
verification passes, then asks the human about these; a pending manual check is reported, not a blocker for the next
phase. Phase 1 has none: the ported code was reviewed phase by phase on its branch.

---

## Phase 2: T2, a bounded log of each finder request's text (test-first)

### Overview

Make an empty or dropped stage-1 answer visible in the public Actions log, without a temporary runner.

### Changes Required:

#### 1. The step description and its log line

**Files**:

- `packages/code-reviewer/src/pipeline.ts`, `packages/code-reviewer/src/pipeline.test.ts` `FinderStepInfo` gains
  the request's model text, taken from the SDK step
- `packages/code-reviewer/src/cli.ts`, `packages/code-reviewer/src/cli.test.ts` one stderr line per observed
  finder request, printed right after its `finder step N:` line

**Intent**: Each gathering request, the finalization and the format repair leave their text in the log, so a
future `findings: []` can be attributed to stage 1 or to the finalization (`follow-ups/review-fixes.md` T2 of the
outage archive).

**Contract**:

- **Observer wiring:** register `onFinderStep` and its monotonic CLI step index independently of context-source
  construction, including when `--source-root` is absent or the diff contains only deletions. Only `source` and
  `finderMaxSteps` remain conditional on a usable source. Finalization and format repair still emit step and T2
  text lines without a source; update the existing CLI tests that expect the callback to be absent.
- **Line format:** `finder step <N> text: <chars> chars "<escaped text>"`. `<N>` is the same CLI-maintained index
  as the step line, and `<chars>` is the original character count before any cap.
- **Empty text:** prints `finder step <N> text: empty (0 chars)`, so it is distinguishable from a missing line.
- **Cap:** the text is cut at 2,000 characters and followed by an explicit truncation marker, with the same cap and
  marker discipline as `REJECTED_OUTPUT_CAP_CHARS`.
- **Escaping:** control characters are escaped with the same `\p{Cc}` rule as `logSafePath`. Newlines become
  visible, never real line breaks. The model text is untrusted and the log is public.
- **What it does not touch:** the text never reaches `comment.md`, the step summary or `review.json`.
  `finderTelemetry` is unchanged.

### Success Criteria:

#### Automated Verification:

- The new tests fail first and then pass:
  `npm --prefix packages/code-reviewer test -- -t "finder text line"` — not run: needs Phase 2 output. Red first,
  with assertion failures on empty, capped, escaped and multi-step cases, plus finalization and format repair
  for a deletions-only diff and an invocation without `--source-root`.
- Package lint passes: `npm --prefix packages/code-reviewer run lint` — at planning: exit 0
- Package typecheck passes: `npm --prefix packages/code-reviewer run typecheck` — at planning: exit 0
- Package tests pass: `npm --prefix packages/code-reviewer test` — at planning: exit 0
- The log line is not written to the comment or the review JSON. The renderers never format a finder step line:
  `! git grep -n -F 'finder step' -- packages/code-reviewer/src/render.ts packages/code-reviewer/src/scorecard.ts`
  — at planning: exit 0. Plus a named T2 test asserting that the text is absent from the rendered comment and the
  serialized review.

---

## Phase 3: Correct the pointers that hold either way

### Overview

Bring in the branch's JSONL exclusion, replace the root-cause comment with the outcome of the outage change, and
fix `AGENTS.md`'s retry sentence. The guard stays in place.

### Changes Required:

#### 1. The workflow's diff step

**File**: `.github/workflows/review.yml`

**Intent**: The reviewed diff must not spend its 100 KB window on JSONL records, and the root-cause comment must
say what fixed the outage instead of pointing at an archived successor.

**Contract**:

- `':(exclude,glob)**/*.jsonl'` is added as the fifth entry of `EXCLUDES`, with the branch's rationale paragraph.
- The root-cause comment keeps its historical point: the break was not a content effect. It now says the cause was
  Venice ignoring `response_format`, and that change `finder-serialization-outage`, ported by change
  `ai-review-reenable`, removed `response_format` from the finder.
- The `if:` block, including `false &&`, is untouched in this phase.

#### 2. The agent rules

**File**: `AGENTS.md`

**Intent**: The retry sentence at the end of the `AI Code Review` paragraph must describe the ported behaviour.

**Contract**:

- "schema mismatches re-roll immediately" becomes: the judge's and the implementation review's schema mismatches
  re-roll immediately; the finder gets at most one format repair, and its `FinderOutputError` is not retried.
- The status sentence at the start of the paragraph is Phase 4's.

### Success Criteria:

#### Automated Verification:

- The JSONL exclusion is present: `grep -qF -- "':(exclude,glob)**/*.jsonl'" .github/workflows/review.yml` — at
  planning: exit 1 — expected until Phase 3
- The guard still holds: `grep -qxF '      false &&' .github/workflows/review.yml` — at planning: exit 0
- The other four guards are byte-identical:
  `test "$(git show origin/master:.github/workflows/review.yml | sed -n '/^    if: >-/,/^    runs-on:/p' | grep -vxF '      false &&')" = "$(sed -n '/^    if: >-/,/^    runs-on:/p' .github/workflows/review.yml | grep -vxF '      false &&')"`
  — at planning: exit 0
- The workflow still parses:
  `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/review.yml','utf8'))"` — at
  planning: exit 0
- The finder re-roll claim is gone: `! grep -qF 'schema mismatches re-roll immediately' AGENTS.md` — at planning:
  exit 1 — expected until Phase 3
- Repository formatting stays clean: `npm run format:check` — at planning: exit 0

---

## Phase 4: Flip the guard and probe it live

### Overview

After the owner's budget confirmation: remove `false &&`, give both documents the enabled status, push, open the PR,
and record the first live run. On a failed probe, restore the guard.

### Changes Required:

#### 1. The guard and the status texts

**Files**:

- `.github/workflows/review.yml` the `if:` comment and the `false &&` line
- `AGENTS.md` the status sentence that opens the `AI Code Review` paragraph

**Intent**: The job runs again, and both documents say so and name this change.

**Contract**:

- **Precondition:** the owner states that the key limit and credit were raised (Definitions, "Budget raised"). The
  statement is recorded in `change.md` Notes with its date and any figure. Pushing and opening the PR also need the
  owner's go at this point.
- **`review.yml`:** the line `      false &&` is deleted, and no other non-comment line of the `if:` changes. The
  `if:` comment says the job was re-enabled on 2026-10-21 by owner decision (change `ai-review-reenable`). It says
  the 2026-10-04 R11 switch-off was caused by Venice ignoring `response_format` and that the port removed that
  dependency. It names novita routing and the probe record.
- **`AGENTS.md`:** the status sentence says the same in one sentence, including that `ai-review` stays advisory and
  outside `deploy.needs`.
- **On probe failure** (Definitions): the `false &&` line is restored byte-identically, and both texts are
  rewritten to say the job is off after a failed live probe, with `probe.md` as the record.

#### 2. The probe record

**File**: `context/changes/ai-review-reenable/probe.md`

**Intent**: The live run's evidence stays readable after the 14-day artifact retention.

**Contract**:

- The run's URL and head SHA.
- Each finder step's `provider=` and `finish=`, plus its T2 text line's character count.
- The parse outcome: pass, `FinderOutputError` or 429.
- The sticky comment's URL, the `ai-cr:*` label, and `finderTelemetry.cost` from the `ai-review-output` artifact's
  `review.json`.
- The verdict against "Live probe passes".
- On a technical failure, record the actual error and the last completed stage. For each unavailable field
  (step text, parse result, output artifact, comment, label or cost), record that it is unavailable and why;
  do not invent a value or require an artifact that the failed run did not produce.
- Record the disposition: leave the job enabled after a passing probe, or restore the guard and off-status
  texts after a failed probe, subject to the already defined one retry for exhausted credit.

### Success Criteria:

#### Automated Verification:

- The guard is removed (probe passed): `! grep -qxF '      false &&' .github/workflows/review.yml` — at planning:
  exit 1 — expected until Phase 4
- The workflow still parses:
  `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/review.yml','utf8'))"` — at
  planning: exit 0
- Both documents name the change:
  `grep -q 'ai-review-reenable' .github/workflows/review.yml && grep -q 'ai-review-reenable' AGENTS.md` — at
  planning: exit 1 — expected until Phase 4
- Repository formatting stays clean: `npm run format:check` — at planning: exit 0
- (paid) The first live run on this PR passes the probe: the `ai-review` run of the pushed flip, checked with
  `gh run view <id> --log` and the `ai-review-output` artifact when produced. The existing Progress title for
  4.5 is retained; completion means the probe was executed and its pass or failure, evidence and disposition
  were recorded, not that the probe passed. A failed probe is recorded as failed, never as n/a — artifact:
  `context/changes/ai-review-reenable/probe.md` — not run: paid
- The guard is restored (probe failed): `grep -qxF '      false &&' .github/workflows/review.yml` — not run: needs
  Phase 4 output. Run the final guard check only after the probe outcome and disposition are known: this row
  is n/a when the probe passes, and 4.1 is n/a when the probe fails. Cite the recorded outcome as the n/a reason;
  4.5 is completed on either outcome once the evidence and corresponding disposition are recorded.

#### Manual Verification:

- The owner confirmed the raised key limit before the flip, and reads the first posted comment and the finder lines
  in the run log, when produced; on failure the owner reads the error and the recorded reasons for unavailable
  evidence instead — surface: context/changes/ai-review-reenable/probe.md
- The owner reads both status texts. They describe the actual state, name this change, and keep `ai-review`
  advisory — surface: .github/workflows/review.yml, AGENTS.md

---

## Testing Strategy

### Unit Tests:

- **The ported tests** come with the port: the two-stage finder, the parser, the format repair, routing, the
  rejected-output line and retry classification. The package suite on the branch is the regression baseline.
- **T2 cases:** an empty text, a text over 2,000 characters (count plus marker), a text with control characters
  and newlines (escaped, one physical line), and several requests (one text line per step, same index).
  Finalization and format repair are also covered without a source, both for a deletions-only diff and an
  invocation without `--source-root`. Plus a check that nothing reaches the comment or `review.json`.

### Integration Tests:

- The live probe on this change's PR (Phase 4) is the only end-to-end check. Fixtures do not predict live behaviour
  (lesson: _An offline eval proves capability exists, not that it will be used_).

### Manual Testing Steps:

1. After the flip is pushed, open the PR's `AI Code Review` run and read the `finder step N:` and `finder step N text:`
   lines.
2. Read the sticky comment and check that exactly one `ai-cr:*` label is set.
3. Fill in `probe.md` from the run and the artifact.

## Performance Considerations

The finder is now 2–N requests per review, with one wall-clock budget for the whole review (branch
`src/reviewer.ts:185-193`). Expect slightly higher latency and cost per review than the single-request finder.

## References

- Fix branch: `origin/feat/finder-serialization-outage` `87ba5da`; its archive
  `context/archive/2026-09-24-finder-serialization-outage/` (`change.md`, `gate.md`, `follow-ups/review-fixes.md`)
- Reversed decision: `context/archive/2026-10-17-advisory-review-analysis/close-out.md`
- T2 and G5 as planned before: `context/archive/2026-10-02-finder-model-swap/plan.md:482-495`
- Guard and comments: `.github/workflows/review.yml:23-36`, `:216-227`; `AGENTS.md:124`

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append
> ` — <commit sha>` when a step lands. A Manual row takes ` — accepted at <full sha>` when a human confirms it. Do not
> rename step titles. See `references/progress-format.md`.

### Phase 1: Port the two-stage finder

#### Automated

- [x] 1.1 The two directories are byte-identical to the branch tip
- [x] 1.2 Package lint passes
- [x] 1.3 Package typecheck passes
- [x] 1.4 Package tests pass
- [x] 1.5 Repository formatting stays clean

### Phase 2: T2, a bounded log of each finder request's text (test-first)

#### Automated

- [ ] 2.1 The new tests fail first and then pass
- [ ] 2.2 Package lint passes
- [ ] 2.3 Package typecheck passes
- [ ] 2.4 Package tests pass
- [ ] 2.5 The log line is not written to the comment or the review JSON

### Phase 3: Correct the pointers that hold either way

#### Automated

- [ ] 3.1 The JSONL exclusion is present
- [ ] 3.2 The guard still holds
- [ ] 3.3 The other four guards are byte-identical
- [ ] 3.4 The workflow still parses
- [ ] 3.5 The finder re-roll claim is gone
- [ ] 3.6 Repository formatting stays clean

### Phase 4: Flip the guard and probe it live

#### Automated

- [ ] 4.1 The guard is removed (probe passed)
- [ ] 4.2 The workflow still parses
- [ ] 4.3 Both documents name the change
- [ ] 4.4 Repository formatting stays clean
- [ ] 4.5 (paid) The first live run on this PR passes the probe
- [ ] 4.6 The guard is restored (probe failed)

#### Manual

- [ ] 4.7 The owner confirmed the raised limit and reads the first comment and finder lines
- [ ] 4.8 The owner reads both status texts
