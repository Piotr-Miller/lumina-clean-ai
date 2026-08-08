# CI/CD PR Code Review Workflow — Implementation Plan

## Overview

Introduce an advisory AI code review on every PR to `master`: a **two-pass
pipeline** in `packages/code-reviewer` — a cheap **finder** (the existing
`createReviewer`, full diff in) producing normalized findings, then a
quality-model **judge** scoring six named criteria strictly from those
findings — with a **model-owned verdict** (the judge emits `verdict` +
`verdictReason`; user decision), a sticky scorecard comment, and
mutually exclusive `ai-cr:passed`/`ai-cr:failed` labels. Delivered as a
composite action + `review.yml`, following `requirements.md` and grounded in
`research.md`.

## Current State Analysis

- `packages/code-reviewer` provides the finder as-is: `createReviewer` →
  `review({ kind: "diff", diff })`, `<review-unit>` fencing, `maxSteps` cap,
  normalized findings with stable file:line keys (research §A). No scorecard,
  no judge, no CI entry.
- One workflow exists (`ci.yml`) with documented conventions: workflow-level
  concurrency, fork-safe jobs, `deploy.needs` isolation, major-tag action
  pinning, `code-reviewer` package job pattern (working-directory + npm cache
  on the package lockfile) (research §B).
- GitHub side: no `ai-cr:*` labels, no `OPENROUTER_API_KEY` secret (user-only
  provisioning via UI — recorded empty-secret incident), no Actions
  variables; default token permissions `read` (research §C).
- Reference guard patterns available locally in the `10x-impl-review-ci`
  workflow template: fork block, per-PR concurrency, label-event guard,
  marker-based comment lifecycle (research §D).

## Desired End State

Every same-repo, non-draft, human-authored PR to `master` receives within one
run: a sticky comment (verdict, six named 1–10 scores, top findings) and the
correct `ai-cr:*` label. Adding `ai-cr:review` re-runs the review. A
technical failure (provider/API) retries the failed pass once (timeout/429/
5xx only), then fails the job red with the cause in the GH Actions job
summary — leaving the last valid comment and labels untouched. Deliberately
flawed code scores low and gets `ai-cr:failed`. Nothing blocks a merge.

### Key Discoveries:

- Finder needs no loop redesign — the two-pass design isolates all new model
  work in a judge that never sees the diff (user design decision). One
  settings-level exception: `reviewer.ts` must gain `maxRetries: 0` so the AI
  SDK's internal default (2 provider retries + `RetryError` wrapper) doesn't
  break the one-retry contract (see Retry classification).
- The judge can only score what the finder surfaces → the finder's
  instructions must explicitly flag missing/weak tests and missing docs, and
  `categorySchema` needs additive `testing` + `documentation` categories —
  otherwise the test-coverage and documentation criteria have no signal.
- `.github/workflows/ci.yml:317-339` is the exact invocation pattern for the
  package in CI (setup-node 24, cache on `packages/code-reviewer/package-lock.json`,
  working-directory `npm ci`).
- Sticky-comment upsert = hidden marker + find→PATCH else POST
  (`gh api`), per the local reference template's marker lifecycle.

## What We're NOT Doing

- **No merge gate** — advisory only; the verdict blocks nothing (hard DoD
  gate parked in requirements).
- **No promptfoo/eval harness** — next change (`code-review-evals`); but the
  finder/judge split and named-score schema are designed for it.
- **No Claude Code Action path** — this is the SDK path; the skill-based
  variant stays a separate track.
- **No inline per-line PR comments** — sticky summary only in this version.
- **No fork-PR reviews** — skipped by design (secret safety).
- **No SHA pinning of first-party actions** — repo convention is major tags;
  the workflow uses only first-party actions.
- **No judge access to the diff** — the judge scores the finder's findings,
  rubric, and PR metadata; it never re-reviews code (user constraint).

## Implementation Approach

Phase 1 lands everything model- and logic-side inside the package (hermetic,
independently mergeable, covered by the existing `code-reviewer` CI job).
Phase 2 adds the composite action and workflow — pure YAML/bash glue over the
package's CLI contract. Phase 3 provisions GitHub (labels, variables — me;
secret — user via UI) and verifies live on real PRs, using this change's own
PR as the first test subject.

## Critical Implementation Details

- **Verdict ownership (user decision)**: the judge model owns `verdict` +
  `verdictReason`; the ≥4-per-criterion / avg-≥6 thresholds from requirements
  are rubric **guidance in the prompt**, not a code rule. Code validates the
  schema and reference integrity only — there is no `deriveVerdict`.
- **Judge reference integrity**: finding IDs (`F1..Fn`) are assigned AFTER
  `normalizeFindings` + `mergeFindings` (dedup + the deterministic
  file/line/category sort — `normalizeFindings` alone preserves model output
  order), so IDs are stable per run. The judge's `findingIds` references are
  validated post-parse; unknown IDs are stripped and counted (pure, testable)
  — the judge can never mint findings.
- **Retry classification**: retry exactly once, per failed pass only. Both
  passes run with `maxRetries: 0` (the AI SDK defaults to 2 internal provider
  retries and throws a `RetryError` wrapper after exhaustion — either would
  break the one-retry cost contract and the classifier), so the complete
  policy lives in ONE outer `withOneRetry`. Retryable: timeout aborts
  (DOMException named `TimeoutError`) and `APICallError` with HTTP 429/5xx.
  External cancellations (plain `AbortError`) and config/auth/schema-mismatch
  errors never retry. After exhaustion: exit 1, cause appended to
  `$GITHUB_STEP_SUMMARY` when set; the action's posting steps run only on
  success, so comment/labels stay untouched.
- **Exit-code contract of the CLI entry**: verdict `failed` is still exit 0
  (advisory data, not an error); exit 1 means technical failure only. The
  composite action relies on this to sequence posting.
- **Model resolution chains (backward compatible)**: finder = override →
  `OPENROUTER_REVIEW_MODEL` → `OPENROUTER_MODEL` → `DEFAULT_MODEL`; judge =
  override → `OPENROUTER_JUDGE_MODEL` → `DEFAULT_JUDGE_MODEL`
  (`anthropic/claude-sonnet-5`). Existing demo/env behavior unchanged.
- **`labeled` trigger guard**: the job-level `if` must pass `labeled` events
  ONLY for `ai-cr:review` (other labels would otherwise burn a review run);
  label removal at run start is its own `continue-on-error` step.

---

## Phase 1: Package — Judge, Scorecard, CI Entry

### Overview

All new logic lands in `packages/code-reviewer`: schema extensions, the
judge, verdict derivation, retry classification, the pipeline, the comment
renderer, and the `npm run review` CLI entry — with hermetic unit tests.

### Changes Required:

#### 1. Schema extensions

**File**: `packages/code-reviewer/src/schemas.ts`

**Intent**: Model the two-pass output. Findings gain the `testing` and
`documentation` categories (additive); scores are an object with six NAMED
criterion fields (user decision — no positional arrays); the judge owns the
verdict (user decision).

**Contract**: `categorySchema` += `"testing" | "documentation"`. New:
`criterionScoreSchema = { score: int 1–10, justification: string,
findingIds: string[] }`; `scoresSchema = z.object({ implementation_correctness,
idiomaticity, complexity, test_risk_coverage, documentation, security_safety })`
(each a `criterionScoreSchema`); `verdictSchema = z.enum(["passed", "failed"])`;
`judgeOutputSchema = { scores, verdict, verdictReason: string, summary }`
(model-owned verdict — the judge-authored `summary` is the scorecard summary;
the finder's internal summary is not surfaced). Types:
`IdentifiedFinding = Finding & { id: string }`; pipeline result type
`{ summary, findings: IdentifiedFinding[], scores, verdict, verdictReason,
diffStats, truncation flags, droppedFindingIdRefs,
models: { finder: string, judge: string } }`. The finding schema itself stays
id-free (IDs are assigned in code, not by the model).

#### 2. Scorecard core

**File**: `packages/code-reviewer/src/scorecard.ts`

**Intent**: Pure, unit-testable scorecard plumbing: criteria metadata, ID
assignment, judge-reference validation. (No verdict rule — the verdict is
model-owned, user decision; the thresholds live in the rubric prompt as
guidance.)

**Contract**: `CRITERIA` (six entries: schema key + human label);
`assignFindingIds(findings) → IdentifiedFinding[]` (`F1..Fn`) — the pipeline
calls it on the output of `mergeFindings(normalizeFindings(...))` so ordering
is deterministic regardless of model output order;
`validateJudgeReferences(judgeOutput, knownIds)` strips unknown `findingIds`,
returns the cleaned output + dropped count.

#### 3. Prompts: finder addendum + judge rubric

**File**: `packages/code-reviewer/src/prompts.ts`

**Intent**: (a) The finder must feed the rubric — instruct it to flag
missing/weak tests (`testing`) and missing docs (`documentation`) where
relevant; (b) all judge-facing text lives here like every other prompt.

**Contract**: extend the shared finder core with one sentence covering the
two new categories. New: `buildJudgeInstructions()` — the six-criterion
rubric (from `requirements.md`, incl. 1/10 anchors), plus hard rules: score
ONLY from the provided findings/metadata, reference findings by their `id`,
never invent findings, empty `findingIds` is valid when nothing supports a
deduction; verdict guidance: the judge emits `verdict` + a 1–2 sentence
`verdictReason`, with the ≥4-per-criterion / avg-≥6 thresholds stated as
guidance (not a mechanical rule — user decision).
`buildJudgePrompt({ findings, prTitle, prBody, diffStats })` — renders
findings with IDs inside a `<findings>` fence AND PR metadata (title/body)
inside a separate `<pr-metadata>` fence; both blocks explicitly classified
as untrusted data (same discipline as review units).

#### 4. Judge module

**File**: `packages/code-reviewer/src/judge.ts`

**Intent**: Second-pass factory mirroring `createReviewer`'s shape: a
tool-less structured call on the quality model.

**Contract**: `createJudge({ model?, apiKey?, timeout-related opts? })` →
`{ judge(input: { findings: IdentifiedFinding[], prTitle, prBody, diffStats },
callOptions?) → Promise<JudgeResult>, model }` where `JudgeResult =
{ scores, verdict, verdictReason, summary, droppedFindingIdRefs }`. Uses
`Output.object({ schema: judgeOutputSchema })` (object-parameter API, as in
`reviewer.ts`); sets `maxRetries: 0` (retry policy is owned by the pipeline's
`withOneRetry`); applies `validateJudgeReferences` before returning. No
tools, no source provider.

#### 5. Config extension

**File**: `packages/code-reviewer/src/config.ts`

**Intent**: Split model resolution for the two passes with explicit
fallbacks (user decision), backward compatible.

**Contract**: `DEFAULT_JUDGE_MODEL = "anthropic/claude-sonnet-5"`;
`resolveConfig` gains `reviewModel`/`judgeModel` resolution per the chains in
Critical Implementation Details; existing `model` behavior (demo) unchanged.

#### 6. Retry helper

**File**: `packages/code-reviewer/src/retry.ts` (+ one-line change in
`src/reviewer.ts`)

**Intent**: The user's retry rule as pure code: classify, retry once,
per-pass — with SDK-internal retries disabled so this is the single
authority.

**Contract**: `isRetryableError(err): boolean` — true only for timeout
aborts (DOMException named `TimeoutError`) and `APICallError` with status
429 or 5xx; false for external cancellations (plain `AbortError`) and
everything else; `withOneRetry(fn)` — one re-invocation on retryable
failure, rethrow otherwise/after. `reviewer.ts` gains `maxRetries: 0` in the
`ToolLoopAgent` settings (mirrored by the judge) so raw provider errors —
not `RetryError` wrappers — reach the classifier and total provider attempts
per pass are exactly ≤ 2.

#### 7. Pipeline

**File**: `packages/code-reviewer/src/pipeline.ts`

**Intent**: Orchestrate finder → IDs → judge → verdict in plain code; own
the truncation caps so they're testable.

**Contract**: `runReviewPipeline({ diff, prTitle?, prBody?, overrides?,
deps? })` — applies `DIFF_CAP_BYTES` (100 000) and `BODY_CAP_CHARS` (2 000)
with truncation flags; computes `diffStats` (files/additions/deletions from
the diff text); orders findings via `mergeFindings` before
`assignFindingIds`; finder and judge invocations each wrapped in
`withOneRetry`; `deps` allows injecting finder/judge functions for hermetic
tests. Returns the full pipeline result, incl. the judge's verdict fields,
`droppedFindingIdRefs` (from `JudgeResult`), and `models: { finder, judge }`
(the factories' resolved model ids — feeds the manual model-resolution
check).

#### 8. Sticky-comment renderer

**File**: `packages/code-reviewer/src/render.ts`

**Intent**: Package-side markdown rendering (testable) — the action posts
what the package produced.

**Contract**: `STICKY_MARKER = "<!-- ai-cr:sticky -->"`;
`renderStickyComment(result, { runUrl? }) → string` — verdict headline
(verdict + `verdictReason`), six-score table (named labels), top ≤ 5
findings by severity rank (`[severity/category] file:line — description /
fix`), `…and N more` line, truncation notes when flags set, run link line
only when `runUrl` is provided (optional — local runs have none), marker at
the end.

#### 9. CLI entry

**File**: `packages/code-reviewer/src/review-pr.ts` (+ `package.json` script)

**Intent**: The `npm run review` contract the composite action calls.

**Contract**: input: `--diff-file <path>` (or stdin), env `PR_TITLE`,
`PR_BODY`, OpenRouter vars; `runUrl` derived from `GITHUB_SERVER_URL` +
`GITHUB_REPOSITORY` + `GITHUB_RUN_ID` when all are present (Actions sets all
three), omitted otherwise (local runs); output: `--out-dir` (default
`.review-out/`) with `review.json` (full result) and `comment.md` (rendered
sticky body); prints a one-line summary. Exit 0 on any produced verdict; exit 1 on
technical failure, appending the cause to `$GITHUB_STEP_SUMMARY` when the
env var exists (plus stderr). Process-exit lives only here (library rule).

#### 10. Barrel + tests

**File**: `packages/code-reviewer/src/index.ts`, `src/*.test.ts`

**Intent**: Export the new public surface; pin the new contracts.

**Contract**: barrel += scorecard/judge/pipeline/render/retry surface. Tests
(hermetic, no network): judge output schema validation (verdict enum,
non-empty `verdictReason`), ID assignment determinism (identical findings
supplied in different orders → identical IDs, via the `mergeFindings` sort),
reference validation strips unknown IDs, retry classification matrix
(timeout/429/500 retry; 401/config/schema/external-abort no) counting
PROVIDER attempts via an injected fake (≤ 2 per pass — not just wrapper
invocations), judge prompt fences both `<findings>` and `<pr-metadata>`
(prompt-injection fixture in the PR body stays inside the fence), truncation
caps + flags, renderer caps + marker presence + no run-link when `runUrl`
absent, config chains (incl. legacy `OPENROUTER_MODEL` fallback and empty-
string handling), judge factory offline construction + env scrubbing (extend
the existing `reviewer.test.ts` patterns).

### Success Criteria:

#### Automated Verification:

- Package `npm test` exits 0 (new suites included)
- Package `npm run typecheck` and `npm run lint` exit 0
- Barrel import side-effect-free without env key (existing purity check still passes)
- Root `npm run typecheck` + `npm run test:unit` unaffected (exit 0)

#### Manual Verification:

- Live local run: `npm run review -- --diff-file <synthetic.diff>` with the real key produces `review.json` + `comment.md`; scores are named-field, findingIds reference real IDs, verdict + non-empty `verdictReason` come from the judge output (model-owned)
- Judge model resolution confirmed in the result's `models` metadata (finder=glm, judge=sonnet via local env)

**Implementation Note**: pause after this phase for manual confirmation
before Phase 2.

---

## Phase 2: Composite Action + Workflow

### Overview

YAML/bash glue over the Phase-1 CLI: a local composite action encapsulating
setup→review→post, and `review.yml` with the full guard set.

### Changes Required:

#### 1. Composite action

**File**: `.github/actions/ai-review/action.yml`

**Intent**: Encapsulate the review so the workflow stays one readable job
(requirements). First entry in `.github/actions/`.

**Contract**: inputs: `api-key` (required), `review-model`, `judge-model`,
`pr-title`, `pr-body`, `diff-file`, `github-token`. Steps (composite,
`shell: bash` everywhere): setup-node@v5 (node 24, npm cache keyed on
`packages/code-reviewer/package-lock.json`) → `npm ci` + `npm run review`
in the package (env-mapped inputs) → on success only: sticky upsert (find
comment by `STICKY_MARKER` via `gh api` list → PATCH, else POST, body from
`comment.md`) → label flip (`gh pr edit --add-label` verdict label,
`--remove-label` the opposite; tolerate absent labels). `GH_TOKEN` from the
`github-token` input.

#### 2. Review workflow

**File**: `.github/workflows/review.yml`

**Intent**: The trigger/guard shell around the action, per requirements +
the reference template's patterns.

**Contract**: `on.pull_request.types: [opened, synchronize, reopened,
labeled]`; workflow-level `permissions: {}`; job `ai-review`: `if:` same-repo
(`head.repo.full_name == github.repository`) AND not draft AND (event action
≠ `labeled` OR `github.event.label.name == 'ai-cr:review'`) AND actor is not
a bot; job `permissions: contents: read, pull-requests: write`;
`concurrency: group: ai-review-${{ PR number }}, cancel-in-progress: true`.
Steps: checkout `fetch-depth: 0` → remove `ai-cr:review` label
(`continue-on-error`, only on the labeled trigger) → compute diff
`origin/$BASE...HEAD` to a file → invoke the local composite action with
`secrets.OPENROUTER_API_KEY` + `vars.OPENROUTER_REVIEW_MODEL` /
`vars.OPENROUTER_JUDGE_MODEL`. No `workflow_dispatch` (retry = label). Not
referenced by `deploy.needs`.

#### 3. CI documentation

**File**: `AGENTS.md` (CI section)

**Intent**: Keep the workflow inventory accurate.

**Contract**: one bullet describing `review.yml` (advisory AI review,
secret-bearing therefore same-repo-only, not in `deploy.needs`).

### Success Criteria:

#### Automated Verification:

- Both YAML files parse (js-yaml load in a one-liner)
- Package gates still green (`npm test`, `typecheck`, `lint`)
- Root `npm run typecheck` exits 0

#### Manual Verification:

- Dry-run of the exact action command chain locally: `npm ci && npm run review -- --diff-file …` from a clean state produces the artifacts the action's posting steps consume
- Read-through of `review.yml` guards against requirements' guardrail list (fork/draft/bot/label/concurrency/permissions — all six present)

**Implementation Note**: pause for manual confirmation before Phase 3.

---

## Phase 3: Provisioning + Live E2E

### Overview

Provision GitHub-side prerequisites, then verify the whole loop on real PRs
— using this change's own PR as the first subject.

### Changes Required:

#### 1. Labels (agent-executed, idempotent)

**Intent**: The three `ai-cr:*` labels per requirements.

**Contract**: `gh label create --force`: `ai-cr:passed` `#0e8a16`,
`ai-cr:failed` `#d73a4a`, `ai-cr:review` `#5319e7`, with descriptions.

#### 2. Actions variables (agent-executed)

**Intent**: The two model knobs (user decision).

**Contract**: `gh variable set OPENROUTER_REVIEW_MODEL --body "z-ai/glm-4.6"`;
`gh variable set OPENROUTER_JUDGE_MODEL --body "anthropic/claude-sonnet-5"`.

#### 3. Secret (USER-executed, manual gate)

**Intent**: `OPENROUTER_API_KEY` repo secret — must be set by the user via
the GitHub UI (recorded incident: `gh secret set` through the assistant
shell writes an empty secret).

**Contract**: Settings → Secrets and variables → Actions → new repository
secret. Verification: the first live run authenticates (a run failing with
401 = empty/missing secret).

#### 4. Live verification

**Intent**: The requirements' Verification list, executed.

**Contract**: (a) this change's PR gets reviewed on open (scorecard comment

- label); (b) push a follow-up commit → sticky comment updates in place, no
  duplicate; (c) add `ai-cr:review` → re-run, label auto-removed; (d) scratch
  PR with deliberately flawed code (planted IDOR-style flaw + missing tests) →
  low scores on the targeted criteria, `ai-cr:failed`; (e) confirm `deploy`
  unaffected and merge remains possible with `ai-cr:failed` (advisory).

### Success Criteria:

#### Automated Verification:

- `gh label list` shows the three `ai-cr:*` labels
- `gh variable list` shows both model variables
- The `AI Code Review` workflow run on this change's PR concludes `success`

#### Manual Verification:

- Secret set by the user via UI (gate for everything below)
- Sticky update, retry label, flawed-PR `ai-cr:failed`, and advisory-merge checks from Change #4 all observed on live PRs

---

## Testing Strategy

### Unit Tests:

- All pure logic from Phase 1 (judge output schema validation, deterministic
  ID assignment, reference validation, retry classification incl. provider-
  attempt counting, truncation, rendering, config chains, prompt fencing) —
  hermetic, no network, env scrubbed via the established `vi.stubEnv`
  pattern. (No code-side verdict rule to test — the verdict is model-owned;
  its quality is measured by `code-review-evals`, the next change.)

### Integration Tests:

- None automated (live path verified manually in Phase 3; systematic
  model-quality measurement is the next change, `code-review-evals`).

### Manual Testing Steps:

1. Local `npm run review` on a synthetic diff (real key) — artifacts sane.
2. Phase 3 live checklist (a)–(e) above.

## Performance Considerations

Cost per PR ≈ one glm-4.6 call over ≤100 KB diff + one sonnet-5 call over a
findings list (short context — the expensive model reads little). Concurrency
cancellation prevents paying for superseded pushes; caps bound the worst
case.

## Migration Notes

Purely additive: no existing behavior changes (demo and lens API untouched;
`OPENROUTER_MODEL` keeps working as the finder fallback).

## References

- Requirements: `context/changes/ci-cd-code-review/requirements.md`
- Research: `context/changes/ci-cd-code-review/research.md`
- Package invocation pattern: `.github/workflows/ci.yml:317-339`
- Guard patterns: `.claude/skills/10x-impl-review-ci/references/workflow-template.yml` (local-only)
- Engine change: `context/archive/2026-08-05-tool-loop-agent/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Package — Judge, Scorecard, CI Entry

#### Automated

- [x] 1.1 Package `npm test` exits 0 — ca102ed
- [x] 1.2 Package `npm run typecheck` + `npm run lint` exit 0 — ca102ed
- [x] 1.3 Barrel import side-effect-free without env key — ca102ed
- [x] 1.4 Root `npm run typecheck` + `npm run test:unit` exit 0 — ca102ed

#### Manual

- [x] 1.5 Live local `npm run review` produces sane review.json + comment.md (named-field scores, valid findingIds, model-owned verdict + verdictReason) — ca102ed
- [x] 1.6 Judge model resolution confirmed in output metadata (finder=glm, judge=sonnet) — ca102ed

### Phase 2: Composite Action + Workflow

#### Automated

- [x] 2.1 Both YAML files parse cleanly — f8e7b83
- [x] 2.2 Package gates still green — f8e7b83
- [x] 2.3 Root `npm run typecheck` exits 0 — f8e7b83

#### Manual

- [x] 2.4 Local dry-run of the action's command chain produces posting artifacts — f8e7b83
- [x] 2.5 Guard read-through: all six requirement guardrails present in review.yml — f8e7b83

### Phase 3: Provisioning + Live E2E

#### Automated

- [x] 3.1 Three `ai-cr:*` labels exist
- [x] 3.2 Both model variables exist
- [ ] 3.3 `AI Code Review` run on this change's PR concludes success

#### Manual

- [ ] 3.4 Secret set by user via UI
- [ ] 3.5 Live checklist: sticky update, retry label, flawed-PR failed, advisory merge
