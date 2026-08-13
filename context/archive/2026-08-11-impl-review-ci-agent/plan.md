# Plan-Aware Implementation Review in the CI Review Agent — Implementation Plan

## Overview

Give `packages/code-reviewer` a third pass that judges a PR against the plan it claims to implement, alongside the existing diff-only code review. The judgment criteria are ported from `.claude/skills/10x-impl-review-ci/references/impl-review-instructions.md` — the lesson's "criteria are portable, mechanics are not" — but every mechanic is written fresh here, and deliberately kept **out of the model's hands**: the plan is resolved by deterministic shell, injected as fenced untrusted data, and the result is published by the same deterministic action that publishes today.

## Current State Analysis

`.github/workflows/review.yml` runs an advisory two-pass review on same-repo, non-draft, human-authored PRs to `master`:

1. **Workflow** computes the three-dot diff (`review.yml:53-59`) and stages trusted review rules from the **base** branch (`review.yml:61-72`).
2. **Composite action** (`.github/actions/ai-review/action.yml`) runs the CLI, upserts a marker-scoped sticky comment, and flips `ai-cr:passed`/`ai-cr:failed`.
3. **Package** runs finder (`z-ai/glm-4.6`, diff + diff-scoped `getFileContext` tool, 5-step cap) → judge (`anthropic/claude-sonnet-5`, findings only, owns the verdict) and writes `review.json` + `comment.md` (`cli.ts:196-198`). **The package never publishes.**

What is missing: nothing in this pipeline knows what the PR was _supposed_ to do. A PR can quietly drop a planned phase, contradict its own "What We're NOT Doing" list, or ship a plan's declared test file as an empty stub, and the review will happily pass it — every criterion it scores is derived from the diff alone.

Three constraints already hold and must survive:

- **Trust gradient** — `projectContext` is trusted and base-sourced (`reviewer.ts:61-66`); the diff and tool results are documented as untrusted and fenced (`prompts.ts:49-51`).
- **Publishing is deterministic** and twice-hardened: the upsert matches only our bot's comment, and the verdict label is added before its opposite is removed (`action.yml:91-127`).
- **Exit-code contract** — exit 0 for any produced verdict (including `failed`, which is advisory data), exit 1 for technical failure only (`cli.ts:204-211`).

## Desired End State

On a PR that carries a plan **and changes code**, the sticky comment gains an **Implementation Review** section: an overall verdict (`APPROVED` / `NEEDS ATTENTION` / `REJECTED`), the findings that produced it, and a collapsed seven-dimension grade table. `review.json` carries the same data under a new `implReview` key. On a PR with no plan, the section says so in one neutral line. If the pass itself fails, the section says _that_ — never silence, and never a shape that reads like a clean pass.

**One PR class is deliberately outside that promise** (plan-review F4): a PR whose only content is a plan and/or review documents. After the Phase 1 exclusions that leaves an exactly-empty diff, which `cli.ts:136` rejects before the pipeline runs — and an implementation review with no implementation to compare against could only conclude that every planned change is `MISSING`, a loud and wrong verdict on a legitimate PR. Those PRs are skipped visibly in the workflow, before the review step runs.

`ai-cr:passed` / `ai-cr:failed` continue to mean exactly what they mean today: the code-review judge's verdict. Nothing about the implementation review can flip a label, block a check, or turn exit 0 into exit 1.

Verify by opening a plan-bearing PR: the run log names the resolved plan path, the comment carries a populated Implementation Review section, and `review.json` has an `implReview` block whose grades are traceable to its findings.

### Key Discoveries:

- **This repo archives before merge, so plans land under `context/archive/`.** Verified across the last seven plan-bearing merges: #111, #115, #118, #119, #120, #126 all carry the plan at `context/archive/<YYYY-MM-DD>-<change-id>/plan.md`; only #103 (pre-practice) used `context/changes/`. The skill's Step 0 glob (`SKILL.md:57`) targets `context/changes/` only and would resolve **nothing** on 6 of the last 7 — the feature would ship inert.
- **`sort -r` gives the right precedence for free.** `context/changes` sorts above `context/archive` (`ch` > `ar`), so an active plan outranks an archived one; within the archive tree the date-prefixed slugs make newest-first meaningful rather than alphabetical luck. Confirmed against `e8ebb66`, `bf15246`, and `f6e51f3` (correctly empty).
- **Git pathspec exclusion does the diff filtering with no parser.** `git diff <range> -- . ':(exclude,glob)**/reviews/*.md' ':(exclude)<plan>'` on `e8ebb66` drops exactly the 6 review docs and the plan (39 → 32 files).
- **Two sections of the criteria layer are mechanics wearing criteria clothing.** `impl-review-instructions.md:87` and `:95` mandate _running_ the plan's Automated Verification commands — from a file on the attacker-controlled PR head, in a job holding `OPENROUTER_API_KEY` and `pull-requests: write`.
- **A model-invoked tool cannot be load-bearing here.** `z-ai/glm-4.6` made 0 tool calls on 0/6 fixtures and 0/4 live runs; `glm-5.2` inherits it; `deepseek-v4-flash` went 6/6 fixtures → 0/3 live (`context/archive/2026-08-10-finder-tool-loop-evals/decision.md`). A declined call is indistinguishable from "nothing found".
- **A side-effecting tool would fire at the wrong time.** The agent is a structured-output agent (`reviewer.ts:146`); a tool can only execute mid-loop, _before_ the result object exists — so a model-invoked `postPrComment` would publish before the review is finalized.
- **Real plans are 20–31 KB** (largest observed: 30,874 chars, `finder-tool-loop-evals/plan.md`). `PROJECT_CONTEXT_CAP_CHARS` (10,000) would truncate every one of them.
- **The judge already proves the shape.** `createJudge` (`judge.ts:32-60`) is a tool-less, single-generation, `Output.object` agent with `maxRetries: 0`, wrapped by the pipeline's `withOneRetry`. The third pass is that shape again.
- **A filesystem read of the plan is a secret-exfiltration vector** (plan-review F1). A regular-file check follows symlinks, and the process that would read the plan is the CLI — the one holding `OPENROUTER_API_KEY`. A PR-added `plan.md -> /proc/self/environ` would put that key into the prompt as untrusted data, from where a compliant model can echo it into a public PR comment. This is the Defender `/proc/self/environ` finding the research cites, reproduced in our own pipeline. `source-provider.ts:146` already documents that a regular-file check is insufficient.
- **Git already exposes the safe read.** `git show "<sha>:<path>"` reads the blob, never the working tree, so no symlink in the path can be followed; `git ls-tree` reports mode `120000` for a symlink and `100644`/`100755` for a regular blob. This is the same idiom `review.yml:69` already uses to stage base-branch rules — the hardened form is _more_ consistent with the existing workflow, not less.
- **The criteria layer contradicts itself on exclusions** (plan-review F2). `impl-review-instructions.md:40` says an implemented item on the exclusions list is _not_ scope creep; `:104` says substantive changes contradicting the exclusions list are a Scope Discipline FAIL. Both cannot hold, and this plan's own value proposition depends on the second reading.

## What We're NOT Doing

- **No `readPlan`, `postPrComment`, or any other model-invoked tool on the new pass.** This is narrower than `change.md` decision #4 suggested: `finder-file-context`'s "no readPlan / write-tools / git-show provider" guardrail is reversed only in the sense that the agent becomes _plan-aware_ — the tool-shaped part of that guardrail stands, and is now backed by the eval evidence and the Agents Rule of Two.
- **No execution of plan-derived commands.** The Success Criteria dimension is graded from declared-vs-observable evidence, never from a shell.
- **No file-reading tool on the new pass.** The `SourceProvider` parameter exists on the factory but stays unwired; enabling it is a later change gated on a live probe.
- **No reverse drift or decision drift** (Spec Kit CI Guard). We just accepted one vendored copy of the criteria; adding classes the reference does not carry widens that divergence on day one. Forward drift + `EXTRA` stays the model.
- **No committed report file and no `contents: write`.** The interactive skill commits `reviews/impl-review.md`; doing that here would need write access to an attacker-controlled branch, `[skip ci]` recursion guards, and would feed the very echo bug Phase 1 closes.
- **No change to `ai-cr:*` labels, the upsert, the exit-code contract, or the finder's budget.**
- **No parallelization of the judge and impl-review passes.** They are independent and could overlap, but the error-isolation gain from running them sequentially is worth more than the latency.
- **No `ci.yml` / cross-workflow check-status reads.** Rejected: `review.yml` runs concurrently with `ci.yml`, so at read time the checks are almost always still in flight.
- **No review at all on plan-only PRs** — a PR whose entire content is a plan and/or review documents is skipped visibly rather than reviewed (plan-review F4). This is a deliberate narrowing of the end state, recorded above.
- **No literal port of the criteria layer's exclusion semantics.** Where the reference contradicts itself (`impl-review-instructions.md:40` vs `:104`), the vendored copy takes the `:104` reading and says so. The port is faithful in judgment content, not word-for-word.

## Implementation Approach

Split the work along the trust boundary. **The workflow owns everything deterministic** — resolving which plan this PR implements, staging it, and filtering the diff. **The package owns judgment only** — one more tool-less structured call whose entire input arrives pre-resolved and fenced. **The composite action's publishing is untouched.**

That split is what keeps every capability an injected instruction could reach out of the model's hands, and it is why "no plan found" is a _known state_ with its own rendered output rather than an ambiguous silence.

The new pass mirrors `createJudge` deliberately: same factory shape, same `maxRetries: 0`, same `withOneRetry` wrapping, same `Output.object`. Its model resolves independently (`OPENROUTER_IMPL_REVIEW_MODEL`) so it can be retuned without touching finder or judge.

## Critical Implementation Details

**Timing & lifecycle.** Plan resolution must happen in the workflow _before_ the composite action runs, because the resolved path is needed twice: to stage the plan file, and to exclude it from the diff the same step computes. The diff step and the plan-resolution step therefore have to be ordered resolve → diff, which inverts today's order (`review.yml:53` computes the diff first).

**The plan path is untrusted display data.** It arrives either from git's file list (PR-controlled filenames) or from the PR-body override (fully attacker-controlled). It is rendered into the comment and must go through the same `codeSpan` / `MAX_PATH_CHARS` treatment as a finding's file path — never interpolated raw.

**Debug & observability.** "No plan resolved" and "the pass failed" must be distinguishable in the Actions log too, not only in the comment. Without an explicit log line naming the resolved plan (or its absence), a silently-inert feature looks identical to a working one — the failure mode `change.md` §5 names.

**Cost.** This adds one `claude-sonnet-5` call over the plan (≤40 KB) plus the diff (≤100 KB) on every plan-bearing PR — the single most expensive call in the pipeline. It is bounded by being tool-less: exactly one generation per attempt, at most two with the retry.

---

## Phase 1: Plan resolution + CLI seam

### Overview

Everything deterministic, with no model change: the workflow resolves and stages the plan, filters the diff, and the CLI learns to accept and cap a plan file. `review.json` output is byte-unchanged when no plan is present.

### Changes Required:

#### 1. Plan resolution step

**File**: `.github/workflows/review.yml`

**Intent**: Resolve which plan this PR implements, deterministically, before anything else runs — so that "no plan" is a known state rather than an ambiguous one. Emits the repo-relative path (or empty) for the later steps.

**Contract**: A new step placed **before** the diff step, exporting `PLAN_PATH` to `$GITHUB_ENV` (empty when unresolved). Convention lookup globs both trees out of the merge-base diff and takes the reverse-lexicographic first; an anchored PR-body override wins. The override regex must accept both roots, and any candidate containing a `..` segment is rejected — the PR body is attacker-controlled and the anchoring is the only thing standing between it and a path-traversal primitive.

```bash
PLAN=$(git diff --name-only "origin/${BASE_REF}...${HEAD_SHA}" \
  -- ':(glob)**/context/changes/**/plan.md' ':(glob)**/context/archive/**/plan.md' \
  | sort -r | head -1)
```

#### 2. Symlink-safe plan staging

**File**: `.github/workflows/review.yml`

**Intent**: Read the plan from the Git object rather than the working tree, so no symlink in the path can be followed (plan-review F1). A `[ -f ]` check follows symlinks, and the reader is the process holding `OPENROUTER_API_KEY` — a `plan.md -> /proc/self/environ` would land that key in the prompt, and from there in a public comment.

**Contract**: Before staging, `git ls-tree` must report a regular blob mode for the candidate at `HEAD_SHA` — mode `100644` or `100755`, never `120000` (symlink) or `160000` (submodule). Only then is the content staged with `git show`, which binds it to the reviewed commit and never touches the checkout. A missing entry, a rejected mode, or a failed read all resolve to "no plan" rather than to an error. This is the idiom `review.yml:69` already uses for base-branch rules.

```bash
MODE=$(git ls-tree "$HEAD_SHA" -- "$PLAN_PATH" | awk '{print $1}')
case "$MODE" in 100644|100755) git show "${HEAD_SHA}:${PLAN_PATH}" > "$RUNNER_TEMP/plan.md" ;;
  *) PLAN_PATH="" ;; esac
```

#### 3. Diff computation with exclusions

**File**: `.github/workflows/review.yml`

**Intent**: Stop feeding the reviewer its own past output and the plan it is about to be handed separately. Committed review documents get echoed back as if they were current findings (`change.md` closing note) — a bug that gets worse once a pass is explicitly hunting plan-shaped prose.

**Contract**: The existing diff step gains pathspec exclusions for `**/reviews/*.md` and, when resolved, the plan path itself. Because the `getFileContext` allowlist derives from this diff (`cli.ts:151`), the exclusions correctly narrow the tool's reach too. `diffStats` consequently describes the reviewed diff, not the raw PR — the intended meaning.

```bash
git diff "origin/${BASE_REF}...${HEAD_SHA}" -- . \
  ':(exclude,glob)**/reviews/*.md' ${PLAN_PATH:+":(exclude)${PLAN_PATH}"} > "$RUNNER_TEMP/pr.diff"
```

#### 4. Empty-diff skip guard

**File**: `.github/workflows/review.yml`

**Intent**: Stop the exclusions from turning a legitimate plan-only PR into a red run (plan-review F4). `cli.ts:136` throws `Empty diff — nothing to review` before the pipeline is ever constructed, so an exactly-empty filtered diff means exit 1, no output directory, no artifact, and no comment.

**Contract**: After the diff step, an empty filtered diff sets a skip flag; the AI review step and the artifact upload become conditional on it. The skip is **visible** — a step-summary line naming that the PR carries no reviewable code — and it is a genuine no-op: no provider call, no comment upsert, no label touched, so the last valid verdict on the PR survives untouched. Note this class of PR reviews fine today; the guard exists precisely because the exclusions introduce the regression.

#### 5. Composite action inputs

**File**: `.github/actions/ai-review/action.yml`

**Intent**: Carry the plan through to the CLI — its content by path, and its repo-relative location as display metadata.

**Contract**: Two new optional inputs, `plan-file` (absolute path to read; empty = no plan) and `plan-path` (repo-relative, display only). `plan-file` appends `--plan-file` to the `ARGS` array exactly as `project-context-file` does; `plan-path` maps to a `PLAN_PATH` env var alongside `PR_TITLE`/`PR_BODY` — untrusted metadata passed via env, never interpolated into a script.

#### 6. CLI flag, read, and cap

**File**: `packages/code-reviewer/src/cli.ts`

**Intent**: Accept the plan on the CLI boundary and bound it before it reaches any model, mirroring how `--project-context-file` is accepted and capped.

**Contract**: `CliArgs` gains `planFile?: string`; `parseArgs` gains the `--plan-file` branch and the usage string is extended. When present, the file is read and passed to the pipeline together with `env.PLAN_PATH`. The plan is **not** required to be non-empty — an empty staged file behaves as "no plan", matching the `project-context-file` convention.

#### 7. Plan cap

**File**: `packages/code-reviewer/src/pipeline.ts`

**Intent**: An unbounded plan would dominate the context window and dilute attention exactly as the diff cap prevents; a truncated plan must never read as a complete one.

**Contract**: `PLAN_CAP_CHARS = 40_000` and `PLAN_TRUNCATION_MARKER`, applied by a `capPlan` helper shaped like `capProjectContext`, with a `planTruncated` boolean surfacing on the result. 40,000 is chosen against measurement — the four largest real plans in this repo run 20,784–30,874 chars — so it fits every current plan with headroom while still bounding a pathological one.

### Success Criteria:

#### Automated Verification:

- Lint passes: `cd packages/code-reviewer && npm run lint`
- Type checking passes: `cd packages/code-reviewer && npm run typecheck`
- Unit tests pass: `cd packages/code-reviewer && npm test`
- `parseArgs` accepts `--plan-file`, rejects it valueless, and leaves `planFile` undefined when absent
- `capPlan` returns input unchanged under the cap and appends the marker over it, with `planTruncated` set accordingly
- With no `--plan-file`, `runReviewCli` produces a `review.json` with no `implReview` key and byte-identical shape to today

#### Manual Verification:

- Plan resolution reproduces the verified results against real merges: resolves `context/archive/2026-08-10-finder-file-context/plan.md` on #120, and resolves empty on #122
- A PR-body `Plan:` line pointing at an archived plan wins over the convention lookup
- A PR-body candidate containing `..` or naming a path with no tree entry is rejected and treated as "no plan"
- A `plan.md` committed as a **symlink** (mode `120000`) is rejected by the mode check, resolves to "no plan", and its target is never read
- A PR whose only content is a plan and/or review documents skips the review step visibly, leaves labels and the prior comment untouched, and the run stays green
- Actions log shows the resolved plan path (or an explicit "no plan resolved") and the filtered diff's byte count

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: The implementation-review agent

### Overview

The package-side judgment layer, built hermetically and testable without wiring: vendored criteria, output schema, and the factory. Nothing calls it yet.

### Changes Required:

#### 1. Model resolution

**File**: `packages/code-reviewer/src/config.ts`

**Intent**: Let the new pass's model be chosen and retuned independently of finder and judge. It defaults to `claude-sonnet-5` because plan-vs-diff conformance is exactly the cross-context reasoning the finder-model evals measured `glm-4.6` failing (0/6 fixtures, 0/4 live) and `sonnet-5` passing.

**Contract**: `DEFAULT_IMPL_REVIEW_MODEL` as its own constant (not an alias of `DEFAULT_JUDGE_MODEL` — they must be retunable apart), plus `implReviewModel` on `ModelOverrides`/`ResolvedModels`, resolving override → `OPENROUTER_IMPL_REVIEW_MODEL` → default with `||` for the set-but-empty case. Pin it with a literal assertion in `config.test.ts`, the same guard `DEFAULT_MODEL` carries after the cleared-variable incident.

#### 2. Output schema

**File**: `packages/code-reviewer/src/schemas.ts`

**Intent**: Type the criteria layer's verdict vocabulary so grades and findings are validated rather than parsed out of prose.

**Contract**: Enums for dimension, grade (`PASS`/`WARNING`/`FAIL`), severity (`CRITICAL`/`WARNING`/`OBSERVATION`), impact (`LOW`/`MEDIUM`/`HIGH`), and overall verdict (`APPROVED`/`NEEDS_ATTENTION`/`REJECTED`). Grades are a **named-field object** over the seven dimensions, never a positional array — the same decision `scoresSchema` records. Findings carry dimension, severity, impact, title, optional file + line, detail, and fix. Line numbers reuse the existing `lineNumber` helper: `refine`, never `.int()/.min()`, because Anthropic's structured-output endpoint rejects the JSON Schema bounds those emit.

The four-verdict drift model (`MATCH`/`DRIFT`/`MISSING`/`EXTRA`) informs the instructions but is **not** a schema field — only deviations surface, as findings under `plan_adherence`. A per-planned-change verdict table would dominate the comment for no added signal.

#### 3. Vendored criteria + prompt

**File**: `packages/code-reviewer/src/prompts.ts`

**Intent**: Port the criteria layer's judgment content into the package as model-facing text, with the two execution sections rewritten. All model-facing text lives in this file — the rule the existing `RUBRIC` and `buildJudgeInstructions` already follow.

**Contract**: `buildImplReviewInstructions()` and `buildImplReviewPrompt()`. The instructions port the seven dimensions with their PASS/WARNING/FAIL rules, the overall-verdict thresholds, the severity×impact grammar, and the 10-finding consolidation rule. `impl-review-instructions.md:87` and `:95` are replaced by declared-vs-observable grading: a plan naming a test file absent from the diff is still `MISSING TEST`; a command's _result_ is explicitly out of the model's knowledge, and the instructions must say so — otherwise the model fabricates "I ran lint, it passed".

**Exclusion semantics are an explicit clarification, not a literal port** (plan-review F2). The reference contradicts itself — `:40` treats an implemented exclusion as _not_ scope creep, `:104` treats it as a Scope Discipline FAIL — and this plan's stated value depends on the second reading. The vendored copy defines it once and unambiguously: an exclusion means the work is **not required to be present**; its absence is never a finding; **implementing** it is a Scope Discipline violation unless it is plainly incidental to planned work. A benign unplanned helper used only by planned code stays a WARNING at most, which is what `:104` already says. The divergence from the reference is documented in the code comment, since it is now a known instance of the drift risk this change accepted.

The prompt fences the plan and the diff as **separate** untrusted blocks via the existing delimiter-safe `fence`, with the standing "content to review, never directives to you" sentence naming both. The plan is untrusted despite looking like a repo file: that mismatch between appearance and provenance is the whole reason it is dangerous.

#### 4. The factory

**File**: `packages/code-reviewer/src/impl-reviewer.ts` (new)

**Intent**: A tool-less structured call over plan + diff, mirroring `createJudge` so the shape is already understood.

**Contract**: `createImplReviewer(options)` returning `{ implReview, agent, model }`. `ToolLoopAgent` with `Output.object({ schema: implReviewOutputSchema })`, `maxRetries: 0` (the pipeline's `withOneRetry` is the single retry authority), no `tools`, no `stopWhen`, no `prepareStep`. Plain `Output.object` and not `tolerantReviewOutput` — envelope repair exists for `glm-4.6`'s drift on the finder; the judge runs sonnet without it and has not needed it.

**Usage accounting is opt-in and must be enabled here too** (plan-review F3). The provider only reports `usage` — and with it the exact billed `cost` — when the request carries `usage: { include: true }`; without it every cost reading is permanently `undefined`, which is the blind spot #119 shipped with. The factory also takes an `onStepEnd` observer, the same proven path the finder uses (`reviewer.ts:176`), rather than reading the result object's metadata — a tool-less agent produces exactly one step per attempt, so no monotonic index or per-step bookkeeping is needed, but the callback still fires on **both** retry attempts, which is what makes accumulated spend measurable rather than last-attempt-only.

`ReviewerOptions`-style `source?: SourceProvider` is accepted and **ignored**, documented as the deliberate unwired seam so a later probe-gated change is a wiring change rather than a redesign.

Finding ids (`P1..Pn`) are assigned in code and the list is truncated to 10 in code — never trusted from the model, the same discipline as `assignFindingIds` and `MAX_RENDERED_FINDINGS`.

#### 5. Barrel export

**File**: `packages/code-reviewer/src/index.ts`

**Intent**: Keep the public surface complete for embedders (promptfoo imports this barrel).

**Contract**: Export `createImplReviewer`, its option/result types, the new schemas, the new prompt builders, and `DEFAULT_IMPL_REVIEW_MODEL`. Pure re-exports only — no import-time side effects.

### Success Criteria:

#### Automated Verification:

- Lint passes: `cd packages/code-reviewer && npm run lint`
- Type checking passes: `cd packages/code-reviewer && npm run typecheck`
- Unit tests pass: `cd packages/code-reviewer && npm test`
- `resolveModels` returns the impl-review default when the env var is unset, empty, or absent, and the override when set
- `config.test.ts` pins `DEFAULT_IMPL_REVIEW_MODEL` by literal assertion
- `buildImplReviewInstructions` contains no instruction to run commands, and states that command results are unavailable
- `buildImplReviewInstructions` states the clarified exclusion rule: absence of excluded work is never a finding, implementing it is a Scope Discipline violation
- `buildImplReviewPrompt` fences plan and diff separately, and a plan containing a literal closing fence tag cannot break out
- `implReviewOutputSchema` rejects an unknown dimension, an out-of-vocabulary grade, and a zero/fractional line number
- Findings are capped at 10 and ids are assigned in code regardless of what the model returns
- The model client is constructed with `usage: { include: true }`, pinned by a provider-attempt test the way the finder's is
- `onStepEnd` fires once per generation and surfaces token counts plus provider-reported cost when present, and `undefined` (never a fabricated 0) when absent

#### Manual Verification:

- The vendored criteria read as a faithful port: spot-check the seven dimensions and the verdict thresholds against `impl-review-instructions.md:99-115`
- The one deliberate divergence (exclusion semantics) is present, commented, and reads unambiguously
- A one-off local call against a real archived plan + its diff returns a plausible verdict with traceable findings, and reports a non-zero cost

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Pipeline wiring, render, and failure isolation

### Overview

Connect the pass, render its three states into the sticky comment, and guarantee it can never take the code review down with it.

### Changes Required:

#### 1. Pipeline third pass

**File**: `packages/code-reviewer/src/pipeline.ts`

**Intent**: Run the pass when a plan resolved, after the judge, isolated so its failure degrades to a rendered warning rather than a failed run.

**Contract**: `PipelineInput` gains `plan?: { text: string; path?: string }` and `timeouts.implReviewTimeoutMs`; `PipelineDeps` gains `implReviewer` for hermetic injection. ~~`DEFAULT_IMPL_REVIEW_TIMEOUT_MS = 120_000`, mirroring the judge's single-structured-call budget.~~ **Re-calibrated to `300_000` on live evidence** — the judge analogy was wrong. The judge sees findings plus PR metadata; this pass sees a full plan plus the capped diff and emits up to 10 findings of prose. On the first real run (PR #127, run [31703938953](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31703938953)) **both** attempts timed out at 120s, burning ~4 minutes for a failed pass with no telemetry. The finder's budget is the right reference class. Also adds a `REVIEW_IMPL_REVIEW_TIMEOUT_MS` override, which the other two passes always had — without it the only remedy for a bad budget was a release. The pass is wrapped in `withOneRetry` with a new `"impl-review"` arm on the `onRetry` pass union, and the whole thing in a try/catch that converts a terminal failure into an error record rather than a throw.

`PipelineResult` gains `implReview?: ImplReviewBlock` with exactly **two** shapes — reviewed, or failed. There is no `skipped` variant: absence of the key _is_ the no-plan signal (plan-review F5), matching the `finderTelemetry` convention so `in` checks and `review.json` stay clean, and leaving one canonical representation rather than two competing ones. The renderer interprets absence as the neutral no-plan section.

Provider spend rides along the same way (plan-review F3): an `implReviewTelemetry` block — tokens plus provider-reported cost, accumulated across both retry attempts so it measures real spend rather than the last attempt — sits beside `finderTelemetry`, absent when the pass did not run. `asStepCost` in this module is the extractor and gets exported for reuse rather than reimplemented. The CLI emits one stderr line per run mirroring `formatFinderStepLine`, because in an Actions log that line is the only live evidence of what the pass cost.

#### 2. Comment section

**File**: `packages/code-reviewer/src/render.ts`

**Intent**: Surface the verdict and findings where reviewers already look, without doubling the comment's visual weight or letting a skipped pass read as a clean one.

**Contract**: A section rendered after the code-review findings and before the model footer, in three distinct forms:

- **reviewed** (`implReview` present, reviewed shape) — an `####` heading carrying the verdict with its own emoji vocabulary (🟢/🟡/🔴, deliberately distinct from the code review's ✅/❌ so the two verdicts are never conflated), a one-line "Reviewed against `<plan path>`", up to 5 findings in the existing `renderFinding` style, and the seven-dimension grade table inside a `<details>` block.
- **no plan** (`implReview` absent) — one neutral line naming that no plan was found and how to point at one. Absence is the signal; there is no schema variant for it.
- **failed** (`implReview` present, failed shape) — a warning line naming that the pass failed and that the code review above is unaffected.

Every model-controlled field, **including the plan path**, goes through the existing `sanitizeInline` / `codeSpan` treatment. The plan path is untrusted: the PR body can name it. `planTruncated` joins the existing notes line. `MAX_COMMENT_CHARS` still governs, and the truncation suffix must still end with `STICKY_MARKER` or the upsert loses its anchor.

#### 3. Workflow and action wiring

**Files**: `.github/workflows/review.yml`, `.github/actions/ai-review/action.yml`

**Intent**: Pass the resolved plan through, and expose the model override the same way the other two models are exposed.

**Contract**: `review.yml` passes `plan-file` / `plan-path` from the Phase 1 resolution and `impl-review-model: ${{ vars.OPENROUTER_IMPL_REVIEW_MODEL }}`; the action maps it to `OPENROUTER_IMPL_REVIEW_MODEL`. Nothing in the upsert or label steps changes.

#### 4. Documentation

**File**: `AGENTS.md`

**Intent**: The CI section is the durable description of what `review.yml` does; a third pass that is not written down there is invisible to the next agent.

**Contract**: Extend the `review.yml` paragraph with the third pass, its model variable, the plan-resolution rule (both trees, active-first, body override), the diff exclusions, and the explicit statement that the implementation review never affects `ai-cr:*` labels or the exit code.

### Success Criteria:

#### Automated Verification:

- Lint passes: `cd packages/code-reviewer && npm run lint`
- Type checking passes: `cd packages/code-reviewer && npm run typecheck`
- Unit tests pass: `cd packages/code-reviewer && npm test`
- With no `plan`, the pipeline makes no third call and `implReview` is absent from the result — and no `skipped` variant exists in the type to represent it
- With a `plan`, an injected `implReviewer` result appears in `review.json` under `implReview`
- A throwing `implReviewer` still yields exit 0, a complete code-review verdict, and the failed-state block
- `onRetry` fires with `"impl-review"` on a retryable third-pass failure
- `implReviewTelemetry` accumulates across both attempts of a retried run and is absent when the pass did not run
- The CLI emits one stderr line carrying the pass's tokens and cost
- `renderStickyComment` produces all three states, and each is distinguishable by a stable string
- A plan path containing Markdown control characters or an `@mention` is escaped and cannot break the table or ping a user
- An over-long comment still terminates with `STICKY_MARKER`

#### Manual Verification:

- On a plan-bearing PR the comment shows a populated section and the `<details>` table expands correctly on GitHub
- On a PR with no plan the section is one neutral line and nothing else changed
- The two verdict vocabularies are visually distinct enough to not be misread at a glance
- `ai-cr:passed`/`ai-cr:failed` behave exactly as before, including on a run where the third pass failed

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Live probe and rollout

### Overview

`lessons.md` is explicit: an offline eval proves capability exists, not that it will be used. Before this pass is trusted, it gets a real PR with known ground truth and pre-registered falsification criteria.

### Changes Required:

#### 1. Pre-registered probe design

**File**: `context/changes/impl-review-ci-agent/verification.md` (new)

**Intent**: Decide what result would falsify the claim _before_ seeing the result — the discipline the finder-model evals established after two models were nearly adopted on fixture evidence.

**Contract**: Records the probe PR's construction, the injected ground truth, and the pass/fail bar written down in advance. The scratch PR carries a plan with four deliberate, known deviations:

- **MISSING** — a planned change absent from the diff. Must be flagged.
- **DRIFT** — implemented contrary to a stated architectural decision. Must be flagged.
- **PROHIBITED EXTRA** — a change explicitly listed under "What We're NOT Doing" and nevertheless implemented. **Must be flagged** as a Scope Discipline violation. This replaces the earlier must-not-flag formulation, which rewarded exactly the behavior the Desired End State promises to catch (plan-review F2).
- **BENIGN EXTRA** — a small unplanned helper used only by planned code, not named in the exclusions. May remain unflagged, or appear as a WARNING at most; a CRITICAL here is a false positive.

The bar: catch MISSING, DRIFT, and the prohibited EXTRA; do not raise the benign EXTRA above WARNING; and make no claim about having run or observed a command. The two EXTRA cases together are what distinguish a rubric that understands exclusions from one that merely pattern-matches "unplanned".

#### 2. Probe execution and cost record

**File**: `context/changes/impl-review-ci-agent/verification.md`

**Intent**: Capture what actually happened, including cost, so the model decision is revisitable on evidence rather than memory.

**Contract**: Records the run URL, the rendered section, the verdict against each pre-registered criterion, and the per-run cost read straight out of `implReviewTelemetry` in the uploaded `review.json` — the telemetry that Phases 2–3 now build, rather than a dashboard lookup that cannot be correlated across retries or concurrent runs (plan-review F3). Cost is compared against the finder+judge baseline from the same run so the increment is stated as a ratio, not an absolute nobody can calibrate.

#### 3. Outcome

**File**: `context/changes/impl-review-ci-agent/change.md`

**Intent**: Close the loop the same way `finder-tool-loop-evals` did — a stated outcome, whether or not it changes anything.

**Contract**: Status stamped, outcome recorded, and any residual risk named. A probe that fails the pre-registered bar is a legitimate outcome: the pass ships rendering its findings but the rollout note says so plainly, rather than the result being quietly reinterpreted.

### Success Criteria:

#### Automated Verification:

- Full package gate passes: `cd packages/code-reviewer && npm run lint && npm run typecheck && npm test`
- The probe PR's `ai-review` workflow run completes green (exit 0) and uploads the `ai-review-output` artifact

#### Manual Verification:

- The pass catches the injected MISSING deviation
- The pass catches the injected DRIFT deviation
- The pass flags the **prohibited** EXTRA — the change the plan explicitly excluded and the PR implemented anyway
- The pass does not raise the **benign** unplanned helper above WARNING
- The pass makes no claim about having run or observed a command
- Per-run cost is read from `implReviewTelemetry` in the uploaded `review.json`, stated as a ratio against the same run's finder+judge spend, and judged acceptable
- `verification.md` states the outcome against every pre-registered criterion, including any that failed

**Implementation Note**: This is the final phase — after manual verification, the change is ready for archive (before merge, per this repo's practice).

---

## Testing Strategy

### Unit Tests:

- `parseArgs` — `--plan-file` accepted, valueless rejected, absent leaves the field undefined
- `capPlan` — under cap unchanged, over cap marked and flagged
- `resolveModels` — impl-review model across override / set / set-but-empty / unset
- `buildImplReviewInstructions` — no run-commands instruction present; command-results-unavailable statement present; clarified exclusion rule present
- `buildImplReviewPrompt` — plan and diff separately fenced; fence-escape attempt defused
- `implReviewOutputSchema` — rejects unknown dimensions, out-of-vocabulary grades, invalid line numbers
- `createImplReviewer` — findings capped at 10, ids assigned in code, unwired `source` ignored, `usage: { include: true }` set
- `renderStickyComment` — all three states; path escaping; truncation still ends with the marker

### Integration Tests:

- Pipeline with no plan → no third call, no `implReview` key, byte-identical shape to today
- Pipeline with a plan and an injected reviewer → populated block, complete `review.json`
- Pipeline with a throwing reviewer → exit 0, full code-review verdict, failed-state block
- Retryable third-pass failure → `onRetry("impl-review", …)` fires exactly once, and telemetry accumulates across both attempts

### Manual Testing Steps:

1. Run the resolution shell against `bf15246`, `e8ebb66`, and `f6e51f3` and confirm the two hits and the one correct miss.
2. Commit a `plan.md` as a symlink on a scratch branch and confirm `git ls-tree` reports `120000`, the candidate is rejected, and the target's content never reaches `$RUNNER_TEMP`.
3. Run the filtered diff against `e8ebb66` and confirm the 6 review docs and the plan are gone (39 → 32 files).
4. Construct a branch whose only changes are a `plan.md` and a `reviews/*.md`, confirm the filtered diff is exactly empty, and confirm the workflow skips visibly and stays green.
5. Open the probe PR from Phase 4 and read the rendered section against all four pre-registered deviations.
6. Open a plan-free PR and confirm the neutral one-liner and that nothing else moved.
7. Force a third-pass failure (bad model id via the repo variable) and confirm the code review still posts, the labels still flip, and the run is green.

## Performance Considerations

The added cost is one `claude-sonnet-5` call per plan-bearing PR over up to 140 KB of input (100 KB diff cap + 40 KB plan cap). It is bounded by construction — tool-less means exactly one generation per attempt, at most two through `withOneRetry` — so the worst case is deterministic rather than budget-shaped. PRs with no plan cost nothing extra.

Latency grows by one sequential structured call (~10–40s observed for comparable judge calls). Running it concurrently with the judge would recover that, and is recorded above as deliberately not done.

The diff exclusions cut input on exactly the PRs that carry the most prose, so the added cost is partly offset on plan-bearing PRs.

## Migration Notes

Nothing to migrate. The feature is inert until `plan-file` is passed, so Phases 1–2 can land without changing any existing behavior, and Phase 3 activates it. Rollback is removing the `plan-file` input from `review.yml`; clearing `OPENROUTER_IMPL_REVIEW_MODEL` falls back to the pinned default rather than to an empty model id.

## References

- Change identity: `context/changes/impl-review-ci-agent/change.md`
- Research: `context/changes/impl-review-ci-agent/research.md`
- Plan review (all five findings applied): `context/changes/impl-review-ci-agent/reviews/plan-review.md`
- Symlink-containment precedent this borrows its threat model from: `packages/code-reviewer/src/source-provider.ts:146`
- Usage-accounting precedent for the cost telemetry: `packages/code-reviewer/src/reviewer.ts:136-141`
- Criteria layer being ported: `.claude/skills/10x-impl-review-ci/references/impl-review-instructions.md`
- Deterministic plan discovery this adapts: `.claude/skills/10x-impl-review-ci/SKILL.md:44-83`
- The factory shape being mirrored: `packages/code-reviewer/src/judge.ts:32-60`
- Publishing invariants that must not move: `.github/actions/ai-review/action.yml:91-127`
- Trust-boundary precedent (base-sourced rules): `.github/workflows/review.yml:61-72`
- Model evidence: `context/archive/2026-08-10-finder-tool-loop-evals/decision.md`
- Guardrail this narrows rather than reverses: `context/archive/2026-08-10-finder-file-context/plan.md`
- Live-probe rule: `context/foundation/lessons.md` → "An offline eval proves capability exists, not that it will be used"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Plan resolution + CLI seam

#### Automated

- [x] 1.1 Lint passes: `cd packages/code-reviewer && npm run lint` — 368672f
- [x] 1.2 Type checking passes: `cd packages/code-reviewer && npm run typecheck` — 368672f
- [x] 1.3 Unit tests pass: `cd packages/code-reviewer && npm test` — 368672f
- [x] 1.4 `parseArgs` accepts `--plan-file`, rejects it valueless, leaves it undefined when absent — 368672f
- [x] 1.5 `capPlan` behaves under and over the cap, setting `planTruncated` — 368672f
- [x] 1.6 No `--plan-file` → `review.json` has no `implReview` key and today's shape — 368672f

#### Manual

- [x] 1.7 Plan resolution reproduces the verified results on #120 and #122 — 368672f
- [x] 1.8 PR-body `Plan:` override wins over the convention lookup — 368672f
- [x] 1.9 Traversal-bearing or tree-absent override candidate is rejected as "no plan" — 368672f
- [x] 1.10 A symlink `plan.md` (mode `120000`) is rejected and its target is never read — 368672f
- [x] 1.11 A plan-only PR skips the review step visibly, leaves labels and prior comment untouched, run stays green — PR #130, run [31733492814](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31733492814): green; "No reviewable code in this PR after excluding the plan and review documents"; `AI review` + `Upload review output artifact` steps both `skipped`; no labels, and the only PR comment is Cloudflare's bot
- [x] 1.12 Actions log names the resolved plan (or its absence) and the filtered diff size — run [31631971640](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31631971640)

### Phase 2: The implementation-review agent

#### Automated

- [x] 2.1 Lint passes: `cd packages/code-reviewer && npm run lint`
- [x] 2.2 Type checking passes: `cd packages/code-reviewer && npm run typecheck`
- [x] 2.3 Unit tests pass: `cd packages/code-reviewer && npm test`
- [x] 2.4 `resolveModels` resolves the impl-review model across unset / empty / set / override
- [x] 2.5 `config.test.ts` pins `DEFAULT_IMPL_REVIEW_MODEL` by literal assertion
- [x] 2.6 Instructions carry no run-commands directive and state command results are unavailable
- [x] 2.7 Instructions state the clarified exclusion rule (absence never a finding; implementing one is a violation)
- [x] 2.8 Prompt fences plan and diff separately and defuses a fence-escape attempt
- [x] 2.9 Schema rejects unknown dimension, bad grade, and invalid line number
- [x] 2.10 Findings capped at 10 with ids assigned in code
- [x] 2.11 Model client constructed with `usage: { include: true }`, pinned by a provider-attempt test
- [x] 2.12 `onStepEnd` surfaces tokens and cost, with `undefined` (never 0) when the provider reports none

#### Manual

- [x] 2.13 Vendored criteria spot-checked as a faithful port of the seven dimensions and thresholds
- [x] 2.14 The one deliberate divergence (exclusion semantics) is present, commented, and unambiguous
- [x] 2.15 One-off local call against a real archived plan returns a plausible, traceable verdict and a non-zero cost — probe vs `bf15246` (finder-file-context): `NEEDS_ATTENTION`, 2 traceable findings (unplanned `finder-max-steps` action input; contradicted Progress claim 2.4), 51407/13327 tokens, cost $0.236084

### Phase 3: Pipeline wiring, render, and failure isolation

#### Automated

- [x] 3.1 Lint passes: `cd packages/code-reviewer && npm run lint`
- [x] 3.2 Type checking passes: `cd packages/code-reviewer && npm run typecheck`
- [x] 3.3 Unit tests pass: `cd packages/code-reviewer && npm test` — 18 files, 454 tests
- [x] 3.4 No plan → no third call, `implReview` absent, and no `skipped` variant exists in the type — runtime test + a `Record<ImplReviewBlock["status"], true>` compile-time guard, verified to fail when a third variant is added
- [x] 3.5 Plan + injected reviewer → populated `implReview` in `review.json` — asserted on the parsed artifact, not just the result object
- [x] 3.6 Throwing reviewer → exit 0, complete code review, failed-state block — plus a throwing CONSTRUCTION (unresolvable API key) degrading the same way
- [x] 3.7 `onRetry` fires with `"impl-review"` on a retryable failure
- [x] 3.8 `implReviewTelemetry` accumulates across both attempts and is absent when the pass did not run — also retained for a pass that ultimately failed, and `cost` key absent (never 0) when unreported
- [x] 3.9 CLI emits one stderr line carrying the pass's tokens and cost
- [x] 3.10 All three render states produced and distinguishable
- [x] 3.11 Plan path with Markdown control characters or an `@mention` is escaped
- [x] 3.12 Over-long comment still terminates with `STICKY_MARKER`

#### Manual

- [x] 3.13 Populated section renders on a plan-bearing PR and `<details>` expands on GitHub — verified on run [31723263888](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31723263888): `🟢 APPROVED`, plan path rendered in a code span, 2 findings, collapsed grade table. The two findings were substantively correct (an unplanned `onJudgeOutputRepair` callback, and Phase 4 scaffolding drafted before Phase 3's manual gate cleared), and the phase-2 consistency rules held on live output. Took three runs to get here: 120s timeout (31703938953), then two judge failures (31707888975).
- [x] 3.14 Plan-free PR shows the neutral one-liner and nothing else moved — PR #129, run [31733419168](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31733419168): `implReview` and `implReviewTelemetry` both ABSENT from review.json (absence is the signal), section renders "Implementation review — not run" with the how-to-opt-in line
- [x] 3.15 The two verdict vocabularies are visually distinct at a glance — verified offline via `scratchpad/render-preview.mjs` across all three states
- [x] 3.16 `ai-cr:*` labels behave as before, including on a failed-third-pass run — verified **naturally, not by forcing it**: run 31703938953 had a genuinely failed third pass; the run stayed green, the code review completed with 10 findings, `verdict=failed → +ai-cr:failed -ai-cr:passed` flipped from the CODE verdict alone, and the CLI exited 0

### Phase 4: Live probe and rollout

#### Automated

- [x] 4.1 Full package gate passes: `cd packages/code-reviewer && npm run lint && npm run typecheck && npm test` — lint clean, typecheck clean, 18 files / 467 tests
- [x] 4.2 Probe PR's `ai-review` run completes green and uploads the `ai-review-output` artifact — PR #128, run [31732703115](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31732703115): green, artifact carries review.json + comment.md, `REJECTED` with 6 findings, attempts=1, $0.057188

#### Manual

- [x] 4.3 Pass catches the injected MISSING deviation — P1 CRITICAL/plan_adherence, local probe (see verification.md)
- [x] 4.4 Pass catches the injected DRIFT deviation — P2 CRITICAL, quotes the plan's own decision
- [x] 4.5 Pass flags the prohibited EXTRA (excluded by the plan, implemented anyway) — P3 CRITICAL/scope_discipline, quotes the exclusion
- [x] 4.6 Pass does not raise the benign unplanned helper above WARNING — P6 OBSERVATION/LOW, reasoned as incidental
- [x] 4.7 Pass makes no claim about having run or observed a command
- [x] 4.8 Per-run cost read from `implReviewTelemetry` and stated as a ratio against the run's finder+judge spend — **9.47×** (impl $0.199620 vs finder $0.003983 + judge $0.017104 = $0.021087), run [31735830016](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31735830016). Required building the instrumentation first (PR #132): `finderTelemetry` had no `cost` key and the judge had no telemetry block nor usage accounting at all
- [x] 4.9 `verification.md` states the outcome against every pre-registered criterion, including 4.8, which could not be computed as written until PR #132 built the missing instrumentation
