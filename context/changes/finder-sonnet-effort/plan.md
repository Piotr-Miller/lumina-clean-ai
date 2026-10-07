# finder-sonnet-effort — sonnet-5 as the finder at reasoning effort low and medium Implementation Plan

## Overview

Measure `anthropic/claude-sonnet-5` as the production finder at OpenRouter `reasoning.effort` **low** and
**medium**, under a gate sealed before the first paid call. If either arm passes every gate, put the cheaper passing
arm into production and turn `ai-review` back on. This is the owner's decision of 2026-10-06 (`change.md` § Notes).
It succeeds `finder-sonnet`, whose high-effort default was `NOT ADMITTED (reliability)`.

## Current State Analysis

- **The predecessor's result** (`context/archive/2026-10-05-finder-sonnet/gate.md` § Results). Sonnet-5 at the
  endpoint default, effort `high`:
  - `247-r1` was valid, with 5 findings, 2 of them rejected by the owner.
  - `269-r1` was invalid. Finder step 2 produced 16,384 output tokens, ended `finish=length` and wrote no JSON. The
    AI SDK threw `NoOutputGeneratedError`, which `withOneRetry` does not retry.
  - Projected cost: $13.902662 per month, against a $10 gate.
  - Spend: $0.497284.
  - Origin: archived measurement.
- **How effort works on Anthropic** (OpenRouter docs, "Reasoning tokens", read 2026-10-06). Origin: provider
  documentation.
  - OpenRouter documents approximate effort fractions of `max_tokens`: high 0.8, medium 0.5, low 0.2, used
    when translating effort for budget-based models. The documented Anthropic token-budget minimum is 1,024.
  - Reasoning tokens count against `max_tokens` and are billed as output.
  - At the finder's `MAX_OUTPUT_TOKENS = 16_384`, those fractions correspond to about 13,107 (high), 8,192
    (medium) and 3,277 (low) tokens. These are reference values, not established hard reasoning ceilings for
    adaptive Sonnet-5 or guarantees of how much output remains for the answer.
  - This makes "high left too little room for the JSON" a **hypothesis**, not a finding. The predecessor's logs
    give only total output tokens (the predecessor's full review, § Lesson recommendation).
  - The model reports adaptive thinking (`default_enabled: true`, `default_effort: high`,
    `supported_efforts: [max, xhigh, high, medium, low]`). Whether effort becomes a hard budget or an adaptive
    target on this endpoint is not documented. The measurement observes token volume, which cannot by itself
    establish whether the provider honored the requested effort.
- **The wire path exists** (`@openrouter/ai-sdk-provider` 3.0.0, `ai` 7.0.52). Origin: code.
  - `openrouter(model, { reasoning: { effort } })` becomes the request body's `reasoning` field
    (`dist/index.js:3636-3637`).
  - The usage parser reads `completion_tokens_details.reasoning_tokens` (`:2671-2682`).
  - Each step's `usage.outputTokenDetails.reasoningTokens` is exposed (`ai` `dist/index.d.ts:349-357`).
- **Master has none of the finder code.** The predecessor's Phase 1 is only on `feat/finder-sonnet`: `33fdb79` and
  its fix `624a936`.
  - It contains the sonnet-5 default, the `anthropic` pin, provider and finish logging, the failure notice, the
    `*.jsonl` exclusion, the schema dump and the measurement runner.
  - `git merge-tree` of that branch into `HEAD` is clean. Master changed only `.ai-toolkit/config.json`,
    `AGENTS.md` and docs since the branch point (checked 2026-10-06).
- **The predecessor's comments overstate its status.** `config.ts:6-21` on that branch says the finder is admitted.
  The predecessor's full review requires refreshing them before reuse (§ Dark code, item 3).
- **The step log has no reasoning split.** `formatFinderStepLine` (`cli.ts:106-116` on that branch) prints
  `tokens in=… out=… total=…`, provider and finish.
- **`ai-review` is off** through `false &&` (`.github/workflows/review.yml`).
- **Credit:** $6.63 remained on the OpenRouter account on 2026-10-06 (`total_credits` 60, `total_usage`
  53.374463).

### Carried from predecessor

| Item                                                                                                                                                           | Source (path + finding)                                                                            | Disposition     | Addressed in                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| Seal a new arm that shows valid final output under its actual reasoning and output limits; changing cap, effort, loop or retry each needs its own measured arm | `context/archive/2026-10-05-finder-sonnet/reviews/impl-review-full-de63b54.md` § Dark code, item 1 | carried forward | Phases 2–3 (effort is the only variable; cap, loop and retry unchanged)                              |
| Pass reliability, hand-read/D2 and cost under the new pre-registration; re-measure costs rather than reusing the invalid $0.334410 as a bound                  | same, item 2                                                                                       | carried forward | Phases 3–4                                                                                           |
| Refresh `config.ts`'s admission comments before reusing the dark code                                                                                          | same, item 3                                                                                       | carried forward | Phase 1 §2                                                                                           |
| Complete the enable path only after a new ADMITTED: owner deletes `OPENROUTER_REVIEW_MODEL`, `false &&` removed, G5, post-G5 projection, checks, owner merge   | same, item 4                                                                                       | carried forward | Phase 5                                                                                              |
| Phase 2 F1: at high P estimates the budget rule cannot admit the fourth run (ACCEPTED)                                                                         | `…/reviews/impl-review-phase-2-e01f622.md` F1                                                      | superseded      | That series stopped at run 2. This plan sizes the budget for that case ($4.00, § Definitions Budget) |
| The size-bucket assignment is an assumption, not a demonstrated cost bound                                                                                     | `…/reviews/impl-review-full-de63b54.md` F1 (FIXED)                                                 | carried forward | Phase 4 §2 restates it beside the projection                                                         |
| Lesson: a cap hit is `NoOutputGeneratedError` and is not retried                                                                                               | `context/foundation/lessons.md`, last entry                                                        | resolved        | Written 2026-10-06; this plan applies it (reasoning tokens logged per step)                          |
| Follow-ups F1/F2 (Phase 3) and full-review F1                                                                                                                  | `…/follow-ups/review-fixes.md`                                                                     | resolved        | All FIXED in the archive                                                                             |

## Definitions

Inherited from `finder-sonnet` § Definitions unless changed here. Each row is restated in the pre-registration.

| Term                             | Decided meaning                                                                                                                                                                                                                                                                                                                                                                                                       | Origin                                                        | On degenerate data                                                                                                                                                                          | Verified by |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Arm                              | One finder configuration: sonnet-5 @ `anthropic`, finder `reasoning: {effort: <arm>}`, `<arm>` ∈ {`low`, `medium`}. Everything else is production as sealed: judge unchanged, 16,384 cap, 5 steps, `withOneRetry`.                                                                                                                                                                                                    | user (2026-10-06)                                             | —                                                                                                                                                                                           | 1.3, 2.2    |
| Run                              | One production pipeline pass (finder → judge) through the production CLI for one arm and one PR, **including** its single built-in retry per pass. No outer retry. Run id `<arm>-<pr>-r<k>`.                                                                                                                                                                                                                          | user (predecessor); id: plan                                  | A run that hit a retry is still one run. An interrupted run is failed, never re-run.                                                                                                        | 3.1         |
| Valid run                        | `review.json` produced, with parsed finder **and** judge output.                                                                                                                                                                                                                                                                                                                                                      | user (predecessor)                                            | Exhausted retries, 4xx/5xx after the retry, `NoObjectGeneratedError`/`NoOutputGeneratedError` → invalid. OpenRouter 401/402 or a runner crash → **measurement error**: stop, owner decides. | 3.1         |
| Reliability gate                 | Every executed run **of the arm** valid; each PR run twice per arm.                                                                                                                                                                                                                                                                                                                                                   | user                                                          | One invalid run → that arm FAILS and ends; **the other arm continues**. A run not executed for budget → the arm is INCOMPLETE, never PASS.                                                  | 4.3         |
| Published finding                | A finding in `review.json` `findings`.                                                                                                                                                                                                                                                                                                                                                                                | code (`pipeline.ts`), confirmed by the owner (predecessor)    | `findings: []` → N = 0.                                                                                                                                                                     | 4.1         |
| Hand-read acceptance (per run)   | The owner classifies **every** published finding; **zero rejected**; unresolved = rejected. **#247:** N = 0 passes. **#269:** the run's findings must include D2.                                                                                                                                                                                                                                                     | user (2026-10-06: unchanged from the predecessor)             | Applied to every valid run of the arm.                                                                                                                                                      | 4.1, 4.4    |
| Blind classification             | The owner classifies rows without seeing which arm produced them; the arm key is revealed after every row is classified.                                                                                                                                                                                                                                                                                              | plan (assumption, stated)                                     | A finding produced by both arms is one row with both memberships.                                                                                                                           | 4.3         |
| D2                               | `scripts/spikes/bread-spike.ts:178–214` (`localInput`): the missing-`urls.get` exit leaks the uploaded file. Match: cites `bread-spike.ts` in `localInput`'s upload path or `main`'s cleanup **and** claims the file is not deleted or leaks on that exit. The agent proposes, the owner approves.                                                                                                                    | user (predecessor)                                            | —                                                                                                                                                                                           | 4.4         |
| Per-run cost                     | Finder + judge cost incl. retries, settled as the counter delta (`reconcile`, two reads ≥ 180 s apart).                                                                                                                                                                                                                                                                                                               | user (predecessor)                                            | Unsettled or unexplained → blocks the next paid call.                                                                                                                                       | 3.2         |
| Projected monthly cost (per arm) | **53 × m247 + 8 × m269 + 13 × $0.199620**, with m = the arm's mean per-run cost over executed runs on that PR, valid and invalid. Gate **≤ $10.00**, i.e. 53 × m247 + 8 × m269 ≤ $7.404940. Counts and the impl-review mean are the predecessor's sealed figures, reused unchanged (`gate.md` § Pre-registration §6). The size assignment remains an assumption.                                                      | user (formula, predecessor); reuse: plan (assumption, stated) | A PR with no executed run in the arm → that arm INCOMPLETE.                                                                                                                                 | 4.2         |
| Winner                           | If both arms pass all gates, the arm with the **lower projected monthly cost**; within $0.50 → `low`.                                                                                                                                                                                                                                                                                                                 | user (2026-10-06)                                             | One arm passes → it wins even if the other is incomplete. Neither passes → use Phase 4 §3 verdict precedence.                                                                               | 4.5         |
| Budget                           | **$4.00 in total** (all runs, retries, G5); **$0.50 reserved for G5**. Before each run: T + P + $0.50 ≤ $4.00. Before G5: T + $0.50 ≤ $4.00. No automatic increase.                                                                                                                                                                                                                                                   | user (2026-10-06)                                             | T = max(counter − T0, Σ settled). Does not fit → that run is not executed; its arm INCOMPLETE.                                                                                              | 3.2, 3.3    |
| P                                | First run of an arm on a PR: **#247 $0.20**, **#269 $0.45** (the predecessor's high-effort costs, rounded up, plus about $0.10 judge for #269). Later run: 2 × that arm's largest settled cost on that PR.                                                                                                                                                                                                            | plan (owner confirms at the seal)                             | An estimate, not a cap.                                                                                                                                                                     | 3.2         |
| Reasoning-volume anomaly         | Heuristic per finder step: a `low` step above 3,277 + 10% or a `medium` step above 8,192 + 10% is **flagged to the owner** before the next run. Missing reasoning count is flagged too. Thresholds and the owner stop are unchanged. A flag is not an automatic verdict; no flag does not prove the provider honored effort. Requested effort and request-body evidence are recorded separately from observed tokens. | plan (owner confirms at the seal)                             | Ignored effort can remain below the threshold; correctly applied adaptive effort can exceed it.                                                                                             | 3.4         |

## Desired End State

- `context/changes/finder-sonnet-effort/gate.md`:
  - an inputs freeze and a pre-registration sealed (hash + tag `finder-sonnet-effort/seal`) before the first paid
    call;
  - Results: up to 8 run records, the ledger with per-step reasoning tokens, the blind hand-read, per-arm
    projections, and exactly one verdict:
    - `ADMITTED (<arm>)`;
    - `NOT ADMITTED (<reason per arm>)`;
    - `INCOMPLETE (budget)`.
- `packages/code-reviewer`, merged only if admitted:
  - the finder defaults to sonnet-5 @ `anthropic` with `reasoning: {effort: <winner>}`;
  - each finder step logs its provider, finish and reasoning tokens;
  - the judge and impl-review are unchanged.
- **If admitted:** the `false &&` line is gone, `OPENROUTER_REVIEW_MODEL` is deleted, and G5 has passed on this
  change's PR.
- **If not:** production is unchanged, `ai-review` stays off, and the record says why per arm.

### Key Discoveries:

- `feat/finder-sonnet:packages/code-reviewer/src/reviewer.ts:155-163`: the finder model is built as
  `openrouter(model, { usage, provider })`. `reasoning` joins that settings object for the finder only.
- `feat/finder-sonnet:packages/code-reviewer/src/cli.ts:78-86, 284`: `REVIEW_FINDER_MAX_STEPS` is the CLI's
  pattern for one validated finder setting. Effort follows it as a **flag**, not an env variable, because
  `action.yml:90-105` passes env from repository variables but no extra flags.
- `feat/finder-sonnet:packages/code-reviewer/scripts/sonnet-gate.mjs`:
  - `RUN_ID`, `STEP_LINE`, `describeGlobal` and `classifyRun` are the parts the arm and token changes touch;
  - the test suite (`sonnet-gate.test.mjs`) already covers refusals, records, reconciliation and log parsing with
    a fake CLI.
- The frozen inputs of both PRs are still in `~/.cache/finder-sonnet-gate/` (kept by the owner, 2026-10-06), with
  sha256 recorded in the predecessor's gate.

## What We're NOT Doing

- **No cap change.** `MAX_OUTPUT_TOKENS` stays 16,384.
- **No retry change.** `NoOutputGeneratedError` stays non-retryable.
- **No step-limit or loop change.**

  Each of these three is its own arm (the predecessor's full review, item 1). If the measurement shows the cap is
  still hit at low or medium, that is recorded and the arm fails.

- **No other effort level.** `high` is the predecessor's result; `minimal` and `none` are not in the endpoint's
  `supported_efforts`.
- **No judge or impl-review change**, including their reasoning.
- **No other model, no verifier stage.**
- **No new window count.** Reuse the predecessor's sealed historical workload for comparability. `ai-review`
  has been off since `68151b0`; recent disabled days provide no new active-review demand observations, but a
  newer rolling window can still overlap earlier active reviews. The baseline does not establish demand
  after re-enable.
- **No re-run** of an interrupted, invalid or recorded run, and no automatic budget increase.

## Implementation Approach

Bring the predecessor's dark code onto this branch unchanged first, then add the one variable: the finder's
reasoning effort, selectable by CLI flag and logged per step. The runner learns arms. Then the freeze and the seal
pin the code and both arms' effective configuration before any money moves.

Up to 8 paid runs follow, in the owner's balanced order, each budget-checked and settled before the next. The
owner hand-reads blind. Each arm gets its projection and gates, and the winner rule picks at most one. Enabling is
the last phase and happens only on `ADMITTED`. The winner's effort becomes the code default, and G5 is the live
probe.

## Critical Implementation Details

- **Seal after code, before money.**
  - The pre-registration pins:
    - the sha256 of `src/config.ts`, `src/reviewer.ts`, `src/prompts.ts`, `src/schemas.ts`, `src/cli.ts` and the
      runner;
    - the `src` git tree;
    - the wire schema;
    - each arm's resolved effective configuration.
  - `cli.ts` joins the hashed set because the step-log format is what the runner parses.
- **The dark default carries no effort.** Until Phase 5, `DEFAULT_FINDER_REASONING_EFFORT` is `undefined`, so a
  plain `npm run review` sends no `reasoning` field, exactly the predecessor's measured configuration. Only the
  flag sets an arm. Phase 5 sets the constant to the winner, so production needs no flag.

## Phase 1: Port the dark code and add the effort arm (no network)

### Overview

Everything the runs and production need, built dark. `false &&` stays.

### Changes Required:

#### 1. Port the predecessor's Phase 1

**File**: `packages/code-reviewer/**`, `.github/actions/ai-review/action.yml`, `.github/workflows/review.yml`

**Intent**: Start from the measured, reviewed code rather than rebuilding it.

**Contract**: Port only the package/action/workflow changes from `33fdb79` and `624a936`, which apply cleanly.
Do not recreate the predecessor's active change folder; its completed record already lives in the archive.

1. Before applying, verify that all six excluded predecessor paths below are absent from both the index and
   working tree. If any exists, stop rather than removing pre-existing work.
2. Run `git cherry-pick --no-commit 33fdb79 624a936`.
3. Restore only these newly introduced paths to their absent state at this branch's pre-port `HEAD`, using
   `git restore --source=HEAD --staged --worktree -- <six explicit paths>`:
   - `context/changes/finder-sonnet/change.md`;
   - `context/changes/finder-sonnet/plan-brief.md`;
   - `context/changes/finder-sonnet/plan.md`;
   - `context/changes/finder-sonnet/research.md`;
   - `context/changes/finder-sonnet/reviews/plan-review.md`;
   - `context/changes/finder-sonnet/reviews/impl-review-phase-1-33fdb79.md`.
4. Before this phase's further edits, verify that the port's diff contains only the package/action/workflow
   paths named above and that their contents match the predecessor at `624a936`. Preserve unrelated workspace
   changes and do not modify `context/archive/`.
5. Include the scoped port in the phase commit. Its message records both original commit SHAs, their authors
   and original co-author attribution; the commits themselves are not reproduced as full cherry-picks.

#### 2. Refresh the admission comments

**File**: `packages/code-reviewer/src/config.ts` (comments only), `src/reviewer.ts` (comments only)

**Intent**: The comments must not claim an admission that did not happen (the predecessor's full review, item 3).

**Contract**:

- The `DEFAULT_MODEL` and `FINDER_PROVIDER_ROUTING` comments say:
  - `finder-sonnet` measured the default effort as NOT ADMITTED;
  - this change measures low and medium;
  - the constant takes effect only when `ai-review` is enabled.
- No value changes.

#### 3. Finder reasoning effort

**File**: `src/config.ts`, `src/reviewer.ts`, `src/cli.ts`, `src/pipeline.ts`, `src/provider-routing.test.ts`, `src/cli.test.ts`, `src/pipeline.test.ts`

**Intent**: Make the finder's effort one sealed, testable setting with no env/action-input override. Existing
model and loop-limit overrides remain, but measurement refuses a mismatch and G5 verifies equivalence.

**Contract**:

- `config.ts`:
  - `FINDER_REASONING_EFFORTS = ["low", "medium", "high"] as const`;
  - `DEFAULT_FINDER_REASONING_EFFORT: (typeof FINDER_REASONING_EFFORTS)[number] | undefined = undefined`.
- `createReviewer` takes `reasoningEffort?`. When it resolves to a value, the finder model gets
  `reasoning: { effort }`; when `undefined`, no `reasoning` key at all.
- `cli.ts` gains `--finder-reasoning-effort <low|medium|high>`.
  - Any other value is a usage error naming the allowed values.
  - Omitted → `DEFAULT_FINDER_REASONING_EFFORT`.
  - No environment variable is read for it.
- The CLI passes its resolved `finderReasoningEffort` to `runReviewPipeline` through a new optional
  `PipelineInput.finderReasoningEffort` field. The pipeline forwards it to
  `createFinder({ reasoningEffort: input.finderReasoningEffort })`, independently of whether a source/tool
  provider is present. The judge receives no effort setting.
- Emit a safe resolved-configuration snapshot for the runner and G5: finder/judge models and routing,
  finder effort and loop limit, output cap, timeouts and retry policy. Exclude credentials and prompt content.
  Tests establish that the snapshot uses the same resolved values passed into the production pipeline.
- Tests:
  - the finder request body carries `reasoning: {effort: "low"}` / `"medium"` with the flag, and no `reasoning`
    key without it;
  - hermetic tests exercise the production CLI → pipeline → reviewer → request-body path for `low`, `medium`
    and omission, including a tool-less call; direct reviewer tests alone do not satisfy this requirement;
  - the judge's body never carries `reasoning`;
  - an invalid flag value exits with the usage error;
  - the `anthropic` pin is unchanged in every case.

#### 4. Reasoning tokens in the step log

**File**: `src/pipeline.ts`, `src/pipeline.test.ts`, `src/cli.ts`, `src/cli.test.ts`

**Intent**: Show the reasoning/answer split per step, for failed runs as well as valid ones (lesson: "A per-step
output cap hit is a NoOutputGeneratedError…").

**Contract**:

- The line becomes `… (tokens in=<n> out=<n> reasoning=<n|?> total=<n>) provider=<p> finish=<f>`.
- `describeFinderStep` checks whether the step's OpenRouter provider metadata actually reports
  `openrouter.usage.completionTokensDetails.reasoningTokens`. Narrow the metadata shape and require a finite,
  non-negative integer. Extend `FinderStepInfo.usage` with an optional `reasoningTokens` field carrying this
  reported count to the CLI; absent or unusable metadata leaves the field absent.
- A reported zero logs `reasoning=0`; an absent or unusable count logs `reasoning=?` and raises the missing-count
  effort flag. Do not infer presence from `usage.outputTokenDetails.reasoningTokens`: the installed provider
  normalizes missing raw reasoning counts to zero.
- The rest of the line is unchanged, so `provider=` and `finish=` stay last.
- Hermetic fake-fetch tests using the installed OpenRouter provider and AI SDK cover absent raw reasoning count,
  explicit zero and a positive count through the step-description/logging path. Also verify that a final
  `finish=length` step is logged with its reported count or `?` before `NoOutputGeneratedError` ends the run.

#### 5. Runner arms and token record

**File**: `packages/code-reviewer/scripts/sonnet-gate.mjs`, `scripts/sonnet-gate.test.mjs`

**Intent**: One sealed runner for both arms, recording what the predecessor could not: tokens and reasoning per
step.

**Contract**:

- **Run id** `<arm>-<pr>-r<k>`, where `<arm>` ∈ the manifest's arms. The runner passes
  `--finder-reasoning-effort <arm>` to the child CLI.
- **Manifest shape:** `global` (code hashes incl. `src/cli.ts`, `src` tree, wire schema, base effective
  configuration), `arms` (per arm: its resolved effective configuration including `finderReasoningEffort`),
  `runOrder` (the exact eight run ids in Phase 2's owner-decided order), `inputs` (per PR, unchanged shape) and
  `budget` (`total 4`, `reserve 0.5`, `firstRunEstimate {247: 0.20,
269: 0.45}`).
- **`describe --arm <arm>`** prints the effective configuration exactly as the child CLI resolves it with that
  flag.
- **P** is computed per arm and PR.
- **Requested-setting evidence**, separate from token observations: record the resolved requested effort and a
  projection of each actual outbound finder request containing only `model`, `provider`, `reasoning` and
  `max_tokens`. Capture this through the reviewer → pipeline → CLI observation path, including retries and
  requests that fail before a step result exists. Preserve omission of `reasoning` for the dark default. Do not
  retain headers, credentials, messages or tool content in this evidence. Hermetic request-body tests verify
  the projection. This proves what the client sent, not what the provider applied.
- **The record** adds, per finder step, `{step, inputTokens, outputTokens, reasoningTokens, provider, finish}`, and
  an `effortFlag` list of steps whose reasoning exceeds the arm's reference value + 10% or is missing. This is
  the reasoning-volume anomaly heuristic, not an effort-compliance verdict.
  `reasoning=?` is recorded as `reasoningTokens: null` and a missing-count flag, never as zero; an explicitly
  reported zero remains `reasoningTokens: 0`.
- **Schedule and arm state:** derive the next eligible run from sealed `runOrder` and the append-only series
  records. An invalid run permanently ends its arm with reliability FAIL. A budget check that cannot admit
  the next eligible run writes a non-paid `budget_skip` event for that run id and permanently ends its arm as
  INCOMPLETE (budget). Neither event permits a replacement run. Skip every later entry of an ended arm in
  place; preserve the order of the remaining arm's entries. A started run without a terminal result remains
  blocking under the predecessor's unresolved-run rules; it is never treated as an eligible replacement.
- **Refusals**, all before the paid call: unknown arm; arm configuration ≠ sealed; run id absent from sealed
  `runOrder` (including `r3`); a run id other than the next eligible scheduled entry; a direct request for an
  ended arm; plus every predecessor refusal. Refusals identify the requested run, reason and next eligible
  run (or series completion). Budget-skip events record no started run or paid cost and are distinct from
  measurement run records. Settlement and owner-stop requirements still apply before the other arm resumes.
- **Tests:**
  - arm run ids are accepted and refused correctly;
  - a different effective effort refuses before the CLI starts;
  - the token parse reads `reasoning=`, including `?`;
  - a `low` step over 3,604 tokens is flagged;
  - P is tracked per arm and PR;
  - the balanced order runs end to end with a fake CLI;
  - unsealed ids, `r3`, out-of-order ids and direct calls to an ended arm all refuse with zero child CLI
    invocations;
  - an invalid run ending either low or medium skips that arm's later entries while the other continues in
    sealed order; a budget-ended arm behaves the same way, with a non-paid `budget_skip` event;
  - replaying the series records reconstructs the same next eligible run and ended-arm state; an unresolved
    started run blocks further calls and cannot be replaced.

#### 6. Wire-schema dump

**File**: `scripts/schema-dump.mjs` (ported unchanged)

**Intent**: The seal records the finder schema hash. Effort does not change the schema, so the hash should equal
the predecessor's `a6e98d41…95bf`; a difference is explained before the seal.

### Success Criteria:

#### Automated Verification:

- Package tests, typecheck and lint pass: `npm test`, `npm run typecheck`, `npm run lint` (in `packages/code-reviewer`)
- Root format check passes: `npm run format:check`
- The effort tests pass: flag → finder `reasoning`, no flag → no field, judge never, invalid value refused, pin unchanged
- The `false &&` line is still present in `review.yml`
- `./node_modules/.bin/tsx scripts/sonnet-gate.mjs describe --arm low` and `--arm medium` print effective configurations that differ only in `finderReasoningEffort`

#### Manual Verification:

- The owner reads the refreshed `config.ts` comments and agrees they claim no admission

**Implementation Note**: Manual checks are acceptance. `/rune-implement` commits a phase once its automated
verification passes, then asks about these. Phase blocks use plain bullets; the checkboxes live in `## Progress`.

---

## Phase 2: Inputs freeze, pre-registration and seal (no paid calls)

### Overview

Pin every byte, both arms, the gates and the arithmetic before any money moves.

### Changes Required:

#### 1. Inputs freeze

**File**: `context/changes/finder-sonnet-effort/gate.md` § Inputs freeze

**Intent**: Reuse the predecessor's frozen inputs, proven unchanged.

**Contract**:

- For #247 and #269, the diff, rules and metadata in `~/.cache/finder-sonnet-gate/` reproduce the predecessor's
  sha256 and byte counts.
- `wt-247` is at `dec09f8…` and `wt-269` at `fca2778…`, both clean.
- D2 is re-confirmed at the #269 head.
- Any mismatch is rebuilt from the recipe and explained before the seal.

#### 2. Pre-registration

**File**: `gate.md` § Pre-registration, `gate-manifest.json`

**Intent**: The sealed protocol.

**Contract**:

- The arms and their effective configurations (`describe --arm`).
- The code hashes.
- Every Definitions row.
- **Run order (owner, 2026-10-06):**
  - round 1: `low-247-r1` (probe) → `medium-247-r1` → `medium-269-r1` → `low-269-r1`;
  - round 2: `medium-247-r2` → `low-247-r2` → `low-269-r2` → `medium-269-r2`.
  - The exact list is sealed as manifest `runOrder` and enforced by the runner. An arm that has ended through
    an invalid run or a recorded budget skip is skipped in place; the order of the rest is unchanged.
- **Gates per arm:** reliability, hand-read (#247 and #269), cost.
- **Winner rule.**
- **Budget ($4.00 / $0.50) and P.**
  Record the conditional affordability calculation: if each #247 run settles at $0.20 and each #269 run at
  $0.45, the balanced order reaches run 8 with T = $2.15 and that arm/PR's P = $0.90, so
  T + P + $0.50 = $3.55 ≤ $4.00. The eight runs total $2.60; with $0.50 for G5, $3.10. This scenario is not a
  worst-case bound: P is an estimate, not a provider spending cap, and retries/outliers may require budget
  skips or exceed an estimate. Actual settled spend controls every admission check; no automatic increase.
- **Stop rules:**
  - an invalid run ends its arm; the owner is told, with the raw error text, before the next run;
  - a measurement error stops the series;
  - an effort flag stops for the owner;
  - unsettled spend blocks the next run;
  - budget → record a non-paid `budget_skip`; that run's arm ends as INCOMPLETE and its later entries are skipped.
- **Verdict labels and precedence:** `ADMITTED (low|medium)`,
  `NOT ADMITTED (low: <failed gates>; medium: <failed gates>)`, `INCOMPLETE (budget)`.
  Restate Phase 4 §3's outcome table in the sealed pre-registration. A passing arm takes precedence over the
  other arm's budget-incomplete state; without a passing arm, any budget-incomplete arm takes precedence over
  the NOT ADMITTED label. Record each arm's outcomes alongside the single overall label.

#### 3. Seal

**File**: `gate.md` § Pre-registration seal

**Intent**: Prove the protocol predates every result.

**Contract**:

1. The owner confirms the plan-chosen terms one by one: P, blind classification, reasoning-volume anomaly flagging.
2. The owner approves.
3. The section's sha256 is recorded with its UTC time, then committed and pushed.
4. GitHub's push time is recorded, and the annotated tag `finder-sonnet-effort/seal` is pushed before any paid
   call.
5. The seal is never recomputed.

### Success Criteria:

#### Automated Verification:

- Each frozen input reproduces its recorded sha256; each worktree `HEAD` equals its head and is clean
- `gate.md` § Pre-registration has no placeholder; its code hashes, `src` tree and wire schema match a fresh `describe --arm low|medium` at HEAD
- `git ls-remote --tags origin finder-sonnet-effort/seal` shows the tag

#### Manual Verification:

- The owner confirms the plan-chosen terms and approves the pre-registration
- The seal's push time is recorded before any paid call

---

## Phase 3: Measurement (paid)

### Overview

Up to 8 runs in the sealed order, each budget-checked and settled before the next.

### Changes Required:

#### 1. Pre-flight

**File**: `gate.md` § Results

**Intent**: Prove the seal holds and the endpoint has not moved, keeping the evidence (the predecessor's
review, Phase 3 F2).

**Contract**:

- The seal, code, `src` tree and inputs re-verify.
- The endpoint and model responses are saved with sha256: `anthropic` lists `tools`, `structured_outputs`,
  `response_format` and `reasoning`; $2 / $10 per M; `supported_efforts` includes `low` and `medium`.
- T0 is recorded with `t0`, and the raw `/key` and `/credits` responses are saved.
- A change → stop and ask.

#### 2. Runs

**Files**: `gate-effort-runs.jsonl`, `gate.md` § Results (ledger)

**Intent**: Measure under the sealed rules.

**Contract**:

- Before each run, the budget check is written to the ledger.
- Each run is followed by `reconcile` until settled.
- Each run gets a ledger row with:
  - counter before → after;
  - telemetry per pass;
  - retries;
  - per-step provider, finish, output and reasoning tokens;
  - resolved requested effort and the outbound finder-request settings evidence, separate from observed tokens;
  - the effort flag;
  - valid or invalid;
  - T carried.
- After each run, the JSONL line and the ledger row are committed by explicit path and pushed.
- Run artifacts go to `~/.cache/finder-sonnet-effort-gate/runs/<run-id>/`, outside the repo.
- Long runs go in the background.

### Success Criteria:

#### Automated Verification:

- `gate-effort-runs.jsonl` has one record per started run, no run-id twice, and only run-ids from the sealed order
- Every ledger row shows T + P + $0.50 ≤ $4.00 at its start
- The counter never exceeded T0 + $4.00
- Every record carries per-step reasoning tokens or an explicit effort flag

#### Manual Verification:

- The owner confirmed every stop (invalid run, effort flag, measurement error) before anything more was spent

---

## Phase 4: Blind hand-read, projections, decision

### Overview

The owner's quality read, each arm's cost, the winner rule, one verdict.

### Changes Required:

#### 1. Blind hand-read

**File**: `hand-read-247.md`, `hand-read-269.md`, `hand-read-key.json`, `gate.md`

**Intent**: Apply the per-run rule without arm bias.

**Contract**:

1. The agent lists every published finding of every valid run of both arms and deduplicates blind into rows.
   Row membership goes only into `hand-read-key.json`, and the agent proposes D2 matches.
2. The owner approves the dedup and the D2 matches.
3. The agent may pre-sort each row against the head.
4. The owner classifies every row with a one-sentence reason.
5. The key is then joined, and each run's result is computed.

#### 2. Projections

**File**: `gate.md` § Results

**Intent**: The sealed formula, per arm.

**Contract**:

- m247 and m269 per arm, then 53 × m247 + 8 × m269 + 13 × $0.199620.
- Describe 53/8/13 as the same sealed historical workload, reused for comparison, not a measurement of
  demand after re-enable. Retain the impl-review baseline $0.199620 and the unchanged $10/month gate.
- Reported for information alongside:
  - the size-assignment caveat;
  - each arm's mean reasoning and answer tokens;
  - the high-effort predecessor's figures.

#### 3. Verdict

**File**: `gate.md`, `change.md`

**Intent**: One label; the owner records the decision.

**Contract**:

- Per arm: reliability, hand-read #247, hand-read #269, cost.
- The winner rule picks at most one arm.
- `ADMITTED (<arm>)` only if that arm passes everything.
- Choose the overall label by this precedence table:

  | Per-arm outcomes                                                   | Overall label                                                | Required accompanying record                                                                                                                       |
  | ------------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
  | At least one arm passes all gates                                  | `ADMITTED (<winner>)`                                        | Apply the existing winner rule; record the other arm's outcomes, including budget incompleteness                                                   |
  | No arm passes all gates, and at least one arm is budget-incomplete | `INCOMPLETE (budget)`                                        | Record which arm is incomplete and all established failures of either arm                                                                          |
  | Both arms conclusively fail                                        | `NOT ADMITTED (low: <failed gates>; medium: <failed gates>)` | List every established failed gate per arm in order: reliability, hand-read #247, hand-read #269, cost; distinguish unmeasured gates from failures |

- An invalid run conclusively fails its arm's reliability even when later scheduled runs are skipped. Missing
  valid #269 output cannot satisfy D2; do not turn absent cost data into a zero or a passing cost gate. Budget
  skipping establishes INCOMPLETE for that arm, not a retrospective PASS. A measurement error still stops
  the series for the owner under the existing rule; this table does not authorize resumption or new runs.
- **Not admitted:** production is unchanged and Phase 5 does not run.

### Success Criteria:

#### Automated Verification:

- Every published finding of every valid run appears in exactly one row, and the key maps every row back to its runs (script check)
- Each arm's projection recomputes from the settled costs

#### Manual Verification:

- The owner approved the dedup and D2 matches before classifying, without seeing the key
- The owner classified every row
- The owner records the decision; exactly one verdict label

---

## Phase 5: Enable the winner and G5 (only on ADMITTED)

### Overview

Make the winning effort the production default, turn the review on, and prove it live.

### Changes Required:

#### 1. Default effort

**File**: `src/config.ts`, `src/config.test.ts`, `src/provider-routing.test.ts`

**Intent**: Production uses the admitted arm with no flag.

**Contract**:

- `DEFAULT_FINDER_REASONING_EFFORT = "<winner>"`, with a literal test.
- The request-body test without the flag now expects `reasoning: {effort: "<winner>"}`.
- The comment records the admission (`gate.md`).

#### 2. Remove the skip

**File**: `.github/workflows/review.yml`

**Intent**: Turn the review on, as the skip's comment prescribes.

**Contract**: Remove only `false &&`, and rewrite only the comment's first sentence.

#### 3. Repository variable

**Contract**:

- The **owner** deletes `OPENROUTER_REVIEW_MODEL` in the GitHub UI.
- `gh variable list` then shows it absent.
- `OPENROUTER_JUDGE_MODEL` stays.
- Record the effective action inputs/repository variables, including `REVIEW_FINDER_MAX_STEPS`, and verify
  that the live resolved finder/judge settings match the winning sealed arm: winner effort, Anthropic pin,
  five steps, unchanged output cap, timeouts and retry policy. Do not infer equivalence from deletion of the
  finder-model variable alone; any mismatch blocks G5 until corrected within the existing scope.

#### 4. PR and G5

**Contract**:

1. Open a draft PR to master with a `Plan:` line.
2. Complete and push all enable/code changes while draft. Verify the configuration comparison above and that
   earlier spend is settled; record a fresh pre-G5 counter and check T + $0.50 ≤ $4.00. Coordinate use of the
   shared key/account so unrelated spend cannot make G5 attribution ambiguous. No fit → G5 not measured
   (budget), merge blocked; no automatic budget increase.
3. Mark the PR ready, and add `ai-cr:review` once. Making ready alone is not a workflow trigger. Make no pushes
   or additional retry-label requests while G5 runs; the eight measurement runs have no replacements.
4. **G5** is the first `AI Code Review` run. It passes when:
   - the run is valid and its new sticky comment and verdict label are published; the advisory code-review
     verdict itself may be failed and does not fail this probe;
   - the live resolved-configuration snapshot equals the winning arm's effective settings, and actual
     outbound finder settings confirm the winning `reasoning.effort`, model, pin and output cap;
   - every finder step logs `provider=Anthropic` and a numeric `reasoning=` count actually reported by the
     provider; `?` or a zero synthesized from absent metadata does not satisfy this requirement;
   - `models.finder` is sonnet-5;
   - finder and judge cost telemetry are present;
   - its pre/post counter readings, retries and settled spend are in the ledger. Use the same reconciliation
     standard as measurement: two counter reads at least 180 s apart, stable and attributable, or explicit
     owner resolution of an unresolved delta. Include failed attempts and any impl-review spend in T; do not
     add telemetry and the same counter delta twice. Unsettled/unexplained spend or T > $4.00 blocks merge.
5. After settlement, recompute the winner's projection. Keep m247/m269 from the sealed representative runs;
   G5 is a different input and does not join either PR mean. If G5 actually ran impl-review, use
   `($0.199620 + G5 impl-review cost) / 2` for the impl-review mean; if skipped or absent, retain $0.199620.
   Missing cost for an executed pass is unresolved, never zero. Above $10 → `NOT ADMITTED (cost)`, recorded,
   and the merge is blocked. Invalid G5 or missing required evidence also blocks merge.
6. Prevent unbudgeted post-G5 synchronize reviews without changing workflow triggers: once G5 finishes,
   return the PR to draft before pushing its ledger, report or archive/documentation updates. Verify no paid
   review is running, keep it draft during all remaining pushes/rebases and required checks, and then mark
   ready without adding `ai-cr:review` before the owner's merge. Record that resulting workflow runs skipped
   the paid review. The final reviewable code and resolved configuration must match G5; a subsequent code
   change or unexpected paid review blocks merge and goes to the owner. Any unexpected spend is settled and
   charged to the same $4 total; this procedure authorizes no extra probe or budget increase.

### Success Criteria:

#### Automated Verification:

- Package tests, typecheck, lint and the root format check pass on the rebased branch
- The `review.yml` diff against master removes exactly the `false &&` line and rewrites the comment's first sentence (plus the ported `*.jsonl` lines)
- PR checks `ci`, `integration`, `e2e` and `code-reviewer` are green
- The post-G5 projection recomputes and is ≤ $10/month before merge

The existing verification items cover the expanded contracts: package checks validate the safe configuration
snapshot, and post-G5 projection verification includes settled spend and the conditional impl-review mean.
G5 manual acceptance includes publication, configuration equivalence, settlement, draft-guarded subsequent
pushes and unchanged final reviewable code. Progress step titles remain unchanged.

#### Manual Verification:

- The owner deleted `OPENROUTER_REVIEW_MODEL` before G5
- G5 is recorded in `gate.md` and passes
- The owner merges

---

## Testing Strategy

### Unit Tests:

- Effort reaches the finder's request body only, and only when set. An invalid flag value is refused.
- Hermetic CLI/pipeline/request-body tests prove effort forwarding for `low`, `medium` and omission,
  including calls without a source/tool provider; the judge receives no effort setting.
- The step log carries provider-reported reasoning tokens or `?`. Actual-provider fake-fetch tests distinguish
  absent raw counts, explicit zero and positive counts, and cover the failed final `finish=length` step before
  `NoOutputGeneratedError`; the runner records missing counts as null plus a flag rather than zero.
- Runner:
  - sealed arm/run ids and schedule enforcement;
  - arm-configuration mismatch refusal;
  - token parsing;
  - anomaly flagging at the reference value + 10% boundary, with no inference of provider effort compliance;
  - requested-effort/request-body evidence separate from token counts, including requests without step results;
  - P per arm and PR;
  - the balanced order with an arm ended early (its later runs skipped, the other arm unaffected);
  - zero child CLI invocations for unsealed/out-of-order ids, `r3` and direct ended-arm requests;
  - either arm ending on invalidity or budget, non-paid budget-skip records, and state reconstruction after
    restart; unresolved started runs remain blocking and have no replacement;
  - all predecessor tests still pass.

### Integration Tests:

- None new. The failure-notice step is exercised on G5 only if G5 fails.

### Manual Testing Steps:

1. Read the refreshed comments (Phase 1).
2. Hand-read every row blind (Phase 4).
3. Watch G5's comment, log and label (Phase 5).

## Performance Considerations

- Reasoning tokens are billed as output at $10/M, so lower effort is a plausible cost lever. The low reference
  value is ~3.3k tokens, against ~11.1k total output observed on #247 at high; it is not an established adaptive
  thinking ceiling. Neither lower token volume nor absence of a flag proves effort was honored.
- The 300 s finder timeout and the single retry stay. A timeout is an invalid run.

## Migration Notes

- **If admitted:**
  - the owner deletes `OPENROUTER_REVIEW_MODEL`;
  - the code defaults (sonnet-5, `anthropic`, winner effort) take over.
- **Rollback:** restore `false &&`.
- Until Phase 5 the dark code changes nothing in production.

## References

- Predecessor: `context/archive/2026-10-05-finder-sonnet/` (gate.md, plan.md, reviews/impl-review-full-de63b54.md)
- Lesson: `context/foundation/lessons.md`, "A per-step output cap hit is a NoOutputGeneratedError, and withOneRetry
  does not retry it"
- OpenRouter reasoning tokens: https://openrouter.ai/docs/use-cases/reasoning-tokens
- Ported code: `feat/finder-sonnet` `33fdb79`, `624a936`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Port the dark code and add the effort arm (no network)

#### Automated

- [x] 1.1 Package tests, typecheck and lint pass — 56983a2
- [x] 1.2 Root format check passes — 56983a2
- [x] 1.3 The effort tests pass — 56983a2
- [x] 1.4 The false && line is still present — 56983a2
- [x] 1.5 describe --arm low and medium differ only in finderReasoningEffort — 56983a2

#### Manual

- [x] 1.6 Owner agrees the refreshed comments claim no admission

### Phase 2: Inputs freeze, pre-registration and seal (no paid calls)

#### Automated

- [x] 2.1 Frozen inputs reproduce their sha256 and heads — 794cfbe
- [x] 2.2 Pre-registration has no placeholder and its hashes match HEAD — 794cfbe
- [x] 2.3 The seal tag is on origin — 794cfbe

#### Manual

- [x] 2.4 Owner confirms the plan-chosen terms and approves the pre-registration
- [x] 2.5 Seal push time recorded before any paid call

### Phase 3: Measurement (paid)

#### Automated

- [x] 3.1 One record per started run, no duplicate or unsealed run-id — 0d17e81
- [x] 3.2 Every ledger row satisfies the budget rule at its start — 0d17e81
- [x] 3.3 The counter never exceeded T0 + $4.00 — 0d17e81
- [x] 3.4 Every record carries per-step reasoning tokens or an effort flag — 0d17e81

#### Manual

- [x] 3.5 Owner confirmed every stop before more was spent

### Phase 4: Blind hand-read, projections, decision

#### Automated

- [x] 4.1 Every published finding in exactly one row, key complete — 30c9ae7
- [x] 4.2 Each arm's projection recomputes — 30c9ae7

#### Manual

- [x] 4.3 Owner approved dedup and D2 matches before classifying, blind
- [ ] 4.4 Owner classified every row
- [x] 4.5 Owner records the decision; exactly one verdict label

### Phase 5: Enable the winner and G5 (only on ADMITTED)

#### Automated

- [ ] 5.1 Package checks pass on the rebased branch
- [ ] 5.2 review.yml diff removes only the false && line and rewrites the comment's first sentence
- [ ] 5.3 PR required checks green
- [ ] 5.4 Post-G5 projection recomputes and is ≤ $10/month before merge

#### Manual

- [ ] 5.5 Owner deleted OPENROUTER_REVIEW_MODEL before G5
- [ ] 5.6 G5 recorded and passes
- [ ] 5.7 Owner merges
