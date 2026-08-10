# Finder File Context (getFileContext in CI) Implementation Plan

## Overview

Wire the code-reviewer finder's dormant `getFileContext` tool into the live CI review pipeline. The tool, its cost gate, and its prompt toggle already exist in `createReviewer`; what's missing is the delivery path — a diff-scoped, fs-backed `SourceProvider` built in the CLI, a seam through `runReviewPipeline`, the composite-action flag that activates it, and telemetry so the added cost is measured rather than guessed.

## Current State Analysis

- `src/reviewer.ts:104-129` — `createReviewer` accepts `source` (a `SourceProvider`) and `maxSteps`; when `source` is present it registers the `getFileContext` tool and the prompt sentence instructing its use. `fetchBoundedContext` (`reviewer.ts:66-79`) clamps requested ranges to `MAX_CONTEXT_LINES` (400) and truncates responses to `MAX_CONTEXT_CHARS` (20 KB).
- `src/pipeline.ts:129-135` — `runReviewPipeline` builds the finder **without** `source`, so CI runs tool-less and single-generation (a deliberate cost ceiling, impl-review-phase-1 F3). `PipelineInput` has no `source`, `maxSteps`, or step-telemetry seam.
- `src/cli.ts` — the tested CLI contract (`runReviewCli`) with an injectable `CliIo` (including `readFile`); `review-pr.ts` is a thin process shell. Timeout envs (`REVIEW_FINDER_TIMEOUT_MS`) and `onRetry` stderr telemetry establish the patterns to mirror.
- `.github/actions/ai-review/action.yml` — runs `npm run review` with `working-directory: packages/code-reviewer`; diff paths are repo-root-relative, so the CLI needs an explicit source root.
- `.github/workflows/review.yml` — checkout is the PR **merge ref** (`actions/checkout` default, `fetch-depth: 0`); the diff is three-dot `origin/BASE...HEAD_SHA`. The checkout persists the job token in `.git/config` (`persist-credentials` default) — nothing later in the job needs it (the `gh` steps authenticate via `GH_TOKEN`).
- Security contract already recorded (`reviewer.ts:21-27` + archived `tool-loop-agent` change): model-chosen paths are untrusted; fs-backed providers MUST allowlist. The diff-derived allowlist is the recorded future work this change closes.
- `DEFAULT_FINDER_TIMEOUT_MS` (300 s, `pipeline.ts:24`) was already sized for "up to 8 tool-loop steps" — no timeout change needed.

## Desired End State

Every advisory CI review runs the finder with the `getFileContext` tool live, restricted to exactly the files in the PR diff, capped at 5 loop steps (env-overridable), with per-step stderr telemetry in the Actions log and a finder-telemetry summary persisted in the `review.json` artifact. Verified end-to-end by a planted-flaw scratch PR whose flaw is only detectable by fetching surrounding context.

### Key Discoveries:

- The agent layer needs zero changes beyond an `onStepEnd` pass-through and a one-line `getFileContext` description fix (plan-review F2) — tool, caps, prompt toggle, and `maxSteps` validation all shipped in the `tool-loop-agent` change.
- `CliIo.readFile` is already the injectable fs boundary, so the provider can be built and tested hermetically with no new IO seam (`cli.ts:11-21`).
- `PipelineDeps.finder` (the test seam) bypasses `createReviewer`, so existing pipeline tests are unaffected; telemetry fields must be optional.
- Merge-ref vs head nuance: the checkout tree is the merge commit while diff line numbers refer to head. Identical for diffed files unless master touched the same file after branching — rare, low-impact (slightly stale context), documented rather than engineered around.

## What We're NOT Doing

- **No eval-harness wiring** — `evals/finder-provider.ts` stays tool-less (`fileContextTool: false`); a fixture-backed source for the model matrix is a recorded follow-up change.
- **No `readPlan` tool** — deferred entirely (overlaps `10x-impl-review-ci`; untrusted-plan fencing needs its own design).
- **No write-tools** (PR comment, labels, tickets) — rejected; deterministic workflow code keeps those.
- **No `git show`-based provider** — fs reads from the merge-ref checkout are accepted; the head-vs-merge nuance is documented.
- **No allowlist expansion beyond diff files** (e.g. following imports) — future work if telemetry shows the model wanting it.
- **No changes to** the judge pass, retry policy, timeouts, or `demo.ts`/local usage (local runs stay tool-less unless `--source-root` is passed explicitly).

## Implementation Approach

Build inside-out along the existing seams: a new pure module (`source-provider.ts`) owns diff-path parsing and the allowlisted provider; `reviewer.ts` gains an `onStepEnd` pass-through plus a `getFileContext` description fix (repo-relative paths, no `a/`/`b/` prefix); `pipeline.ts` gains optional `source`/`finderMaxSteps`/`onFinderStep` inputs and a `finderTelemetry` output block; `cli.ts` composes it all behind a new `--source-root` flag; the composite action passes `--source-root "$GITHUB_WORKSPACE"`. Every layer mirrors an established pattern (timeout envs, `onRetry` telemetry, optional `PipelineInput` fields), and the tool-less default is preserved at every layer so nothing changes for callers that don't opt in.

## Critical Implementation Details

- **Tool-less default is a contract, not an accident**: when `--source-root` is absent (all local/legacy invocations), the pipeline must keep passing no `source` and no `maxSteps`, preserving the single-generation cost ceiling (impl-review-phase-1 F3). `REVIEW_FINDER_MAX_STEPS` is only honored when a source is active.
- **The provider never throws**: unlisted path, unreadable file, empty file — every failure returns a model-facing refusal string. A tool `execute` throw would error the paid run (the same failure class F1 fixed in the evals).
- **Security property = exact-match allowlist + symlink-free containment, no normalization**: allowed paths are the literal `+++ b/<path>` strings parsed from the diff; requests containing `..`, absolute paths, backslashes, or any non-matching string simply miss the set and get refused. Do not "helpfully" normalize requested paths — normalization is where traversal bugs live. The allowlist only guarantees the requested _name_ is in the diff, not that the content served is that file: a PR can add a symlink (`evil.ts -> ../.git/config` — an in-root target, so containment alone is insufficient). After an allowlist hit the provider therefore verifies the resolved target — no symlink in the file or any path component, regular file inside `realpath(root)` — and reads the verified resolved path; any verification failure returns the refusal string.
- **Telemetry accumulates across retry attempts** — it measures real spend for the run, not the last attempt's shape, so `steps` may exceed the per-attempt `finderMaxSteps` cap. With an injected `deps.finder`, telemetry is absent (fields optional).
- **Allowlist derives from the full (uncapped) diff** read by the CLI; `capDiff` truncation happens later inside the pipeline. A superset allowlist is harmless; a truncated one would refuse legitimate requests.

## Phase 1: Library — diff-scoped source + pipeline seam

### Overview

All package-internal plumbing: the provider module, the reviewer's step callback, and the pipeline's new input/output fields — fully hermetic-tested, nothing activated yet.

### Changes Required:

#### 1. Diff-scoped source provider (new module)

**File**: `packages/code-reviewer/src/source-provider.ts`

**Intent**: Own the two pure pieces the CLI will compose: parsing the set of reviewable paths from a unified diff, and a `SourceProvider` that serves bounded file content for exactly those paths and refuses everything else.

**Contract**: `parseDiffPaths(diff: string): Set<string>` — collects post-change paths from `+++ b/<path>` lines; excludes `/dev/null` (deletions); git-quoted paths (special characters) are simply not collected (they'll be refused — degrade, don't decode). `createDiffScopedSource(options: { allowedPaths: Set<string>; root: string; readFile: (path: string) => string; realpath: (path: string) => string; isRegularFile: (path: string) => boolean }): SourceProvider` — exact-match allowlist check first (miss → refusal string that names the path as outside the reviewed diff, repeats the required format — repository-relative, no `a/`/`b/` prefix — and enumerates a deterministic, capped list of the allowed paths, noting any omitted count, so the model self-corrects on its next step; plan-review F2); then symlink-free containment: `realpath(join(root, path))` must equal `join(realpath(root), path)` (rejects a symlinked file or any symlinked path component) AND be a regular file — any mismatch or fs error → refusal string; reads the **verified resolved path** via the injected `readFile`; any read error → refusal string, never a throw; slices `startLine`/`endLine` as 1-based inclusive (missing `startLine` → line 1; missing `endLine` → to end of file — note `fetchBoundedContext`'s range clamp fires only when BOTH are present, so single-sided requests reach the provider unclamped and `MAX_CONTEXT_CHARS` is the bound; range/size caps stay `fetchBoundedContext`'s job). Docstring records the merge-ref vs head nuance and the symlink property (plan-review F1: the allowlist guarantees the name, the containment check guarantees the content).

#### 2. Reviewer step callback pass-through

**File**: `packages/code-reviewer/src/reviewer.ts`

**Intent**: Let callers observe each agent loop step (for telemetry) without changing the review contract, and fix the tool description so the model requests paths in the allowlist's format.

**Contract**: `ReviewerOptions.onStepEnd?: (step: <SDK step result>) => void`, forwarded to the underlying `ToolLoopAgent`'s `onStepEnd` (NOT `onStepFinish`, which installed `ai@7.0.52` marks as a deprecated alias — plan-review F3). The callback exposes at minimum the step's tool calls and token usage (consult the installed `ai` package types for the exact step shape). `review()` signature unchanged. The `getFileContext` `path` description (currently "File path exactly as given in the review unit", `reviewer.ts:122`) changes to require a repository-relative path without git's `a/`/`b/` prefix (example: `src/x.ts`) — the review unit's diff headers show `b/`-prefixed paths while the allowlist stores stripped ones (plan-review F2).

#### 3. Pipeline seam + telemetry summary

**File**: `packages/code-reviewer/src/pipeline.ts` (types in `packages/code-reviewer/src/schemas.ts` as needed)

**Intent**: Thread `source`, a finder step cap, and step observation through to `createReviewer`, and aggregate a small cost summary into the result so the artifact records what the loop spent.

**Contract**: `PipelineInput` gains `source?: SourceProvider`, `finderMaxSteps?: number` (forwarded as `maxSteps`; only forwarded when `source` is set), and `onFinderStep?: (info) => void`. `PipelineResult` gains optional `finderTelemetry: { steps: number; toolCalls: number; inputTokens?: number; outputTokens?: number; totalTokens?: number }`, accumulated across both finder attempts of a retried run — so `steps` counts generations across attempts and MAY exceed `finderMaxSteps` (intended: it measures real spend; the SDK's `stepNumber` resets to 0 per attempt, `StepResult.callId` uniquely identifies each — plan-review F5); absent when `deps.finder` is injected or no steps were observed. `render.ts`/`scorecard.ts` must ignore the new field (verify their tests don't assert exhaustive result shapes).

### Success Criteria:

#### Automated Verification:

- Package unit tests pass (`npm run test` in `packages/code-reviewer`) including new `source-provider.test.ts` and pipeline/reviewer wiring tests
- Typecheck passes (`npm run typecheck` in the package)
- Lint clean on touched files (targeted `npx eslint <files>` per the CRLF lesson; CI runs the full gate on Linux)

#### Manual Verification:

- Read through `source-provider.ts` confirming the never-throw and exact-match-allowlist invariants hold on every code path

---

## Phase 2: Delivery — CLI flag, env knob, telemetry lines, composite action

### Overview

Activate the provider in CI: the CLI composes it behind `--source-root`, the step budget becomes an env knob defaulting to 5, per-step lines go to stderr, and the composite action opts in with the workspace root. `review.yml` gets one hardening line (`persist-credentials: false` on checkout — plan-review F1 defense-in-depth).

### Changes Required:

#### 1. CLI composition

**File**: `packages/code-reviewer/src/cli.ts`

**Intent**: When (and only when) `--source-root <path>` is passed, build the diff-scoped provider over `io.readFile` and run the finder with the tool live, a validated step budget, and step telemetry.

**Contract**: New optional arg `--source-root` in `parseArgs` (usage string updated). When present: `parseDiffPaths` on the full diff — an empty path set skips the source entirely (tool-less, same as today); otherwise pass `source`, `finderMaxSteps` (from `REVIEW_FINDER_MAX_STEPS`, validated positive integer via the `parseTimeoutEnv` pattern, default 5), and an `onFinderStep` that writes one stderr line per step via `io.logError` — including a CLI-maintained monotonic step index (NOT the SDK's `stepNumber`, which resets to 0 on the retry attempt — plan-review F5), tool target (path and range when a `getFileContext` call occurred), and token usage. Absent flag → behavior byte-identical to today.

#### 2. Composite action opts in

**File**: `.github/actions/ai-review/action.yml`

**Intent**: Activate the tool in CI by passing the repo checkout root.

**Contract**: The review step's `ARGS` gains `--source-root "$GITHUB_WORKSPACE"` (standard env, no new action input). Header comment updated to mention the finder's file-context tool and the `REVIEW_FINDER_MAX_STEPS` knob.

#### 3. Project docs

**File**: `AGENTS.md` (the `review.yml` paragraph in the CI section)

**Intent**: Keep the single-source-of-truth description accurate.

**Contract**: One–two sentences: the finder now carries a diff-scoped `getFileContext` tool (file reads restricted to diff paths, 5-step cap via `REVIEW_FINDER_MAX_STEPS`, per-step telemetry in the run log + `finderTelemetry` in `review.json`).

#### 4. Workflow hardening — drop persisted checkout credentials

**File**: `.github/workflows/review.yml`

**Intent**: Defense-in-depth companion to the provider's symlink containment (plan-review F1): stop persisting the job token in `.git/config` so the checkout holds no credential worth exfiltrating.

**Contract**: The checkout step gains `persist-credentials: false`. Nothing later in the job needs persisted git credentials — the `gh` commands authenticate via `GH_TOKEN`.

### Success Criteria:

#### Automated Verification:

- Package unit tests pass, including new `cli.test.ts` cases: `--source-root` parsing, provider wiring through fake `io`, empty-path-set fallback, `REVIEW_FINDER_MAX_STEPS` validation (invalid → exit 1), telemetry stderr lines
- Typecheck passes (`npm run typecheck`)
- Lint clean on touched files

#### Manual Verification:

- Re-read `action.yml` diff confirming the flag lands inside the existing `ARGS` array and nothing else moved
- Re-read `review.yml` diff confirming the checkout gains only `persist-credentials: false`

---

## Phase 3: Live verification — planted-flaw scratch PR + evidence

### Overview

Prove the loop end-to-end on the real workflow: the feature branch's own PR gives the plain live signal; a scratch PR branched off the feature branch plants a flaw only detectable via surrounding context. Record evidence, clean up.

### Changes Required:

#### 1. Live run on the feature PR

**File**: (no file — operational)

**Intent**: First real execution: confirm the review run is green, telemetry lines appear in the Actions log, and `finderTelemetry` lands in the `ai-review-output` artifact.

**Contract**: The feature PR's own `AI Code Review` run. Whether the model calls the tool on this diff is not a pass/fail criterion here — wiring evidence is.

#### 2. Planted-flaw scratch PR

**File**: (scratch branch — reverted, never merged)

**Intent**: Force the tool to matter: a diff whose flaw is only visible with surrounding context — e.g. a call site changed to pass arguments whose order/meaning contradicts the unchanged function signature elsewhere in the same file, outside the hunk.

**Contract**: Branch **off the feature branch** (a `pull_request` workflow runs from the merge ref — the base must already contain the new workflow/action wiring, per the PR #116 lesson). Verify in the run: (a) telemetry shows ≥1 `getFileContext` call, (b) the finding references the cross-context flaw, (c) requested paths stayed within the diff set. Close the PR and delete the branch afterward.

#### 3. Evidence record

**File**: `context/changes/finder-file-context/verification.md`

**Intent**: Preserve the live evidence beyond the 14-day artifact retention.

**Contract**: Short doc: both run URLs, the telemetry lines observed, the cross-context finding quoted, token cost of the tool-loop run vs a recent tool-less baseline, and any surprises.

### Success Criteria:

#### Automated Verification:

- `verification.md` exists in the change folder

#### Manual Verification:

- Feature-PR review run green with telemetry visible in log and artifact
- Scratch-PR run: tool called, cross-context flaw found, allowlist held
- Scratch PR closed and branch deleted
- Cost delta recorded and acceptable (rough budget: a tool-loop run should stay within ~3× a tool-less run's finder tokens)

---

## Testing Strategy

### Unit Tests:

- `parseDiffPaths`: modified/added/deleted/renamed files, `/dev/null` exclusion, quoted-path non-collection, empty diff
- Provider: allowlisted read (full file + ranges, 1-based inclusive, single-sided ranges: endLine-only → from line 1, startLine-only → to EOF), unlisted-path refusal (including `../`-shaped and absolute requests), refusal content (repeats required format + deterministic capped allowed-path listing with omitted count), symlink refusal via injected realpath/stat fakes (`src/evil.ts -> ../.git/config` — in-root target, allowlisted name — and an out-of-root symlink target), read-error refusal, never-throw property
- Reviewer: `onStepEnd` forwarded (existing mock-agent pattern in `reviewer.test.ts`)
- Pipeline: `source`/`finderMaxSteps` forwarded only together; `finderTelemetry` aggregation incl. across-retry accumulation; absent with injected `deps.finder`
- CLI: flag parsing, env validation, empty-path-set fallback, stderr telemetry lines, tool-less invocation unchanged

### Integration Tests:

- None new — the package suite is hermetic by design; live behavior is Phase 3's job.

### Manual Testing Steps:

1. Open the feature PR; watch the `AI Code Review` run's log for step lines; download `ai-review-output` and inspect `finderTelemetry`.
2. Create the scratch branch off the feature branch with the planted cross-context flaw; open a PR; verify tool call + finding + allowlist; record evidence.
3. Close scratch PR, delete branch, write `verification.md`.

## Performance Considerations

Worst-case finder generations per PR go from 2 (attempt × retry) to 10 (5 steps × 2 attempts); the 300 s per-attempt finder timeout already accommodates this. The 5-step default plus `REVIEW_FINDER_MAX_STEPS` keeps the ceiling tunable without a deploy. Telemetry makes the actual (not worst-case) cost visible per run.

## Migration Notes

None — all new inputs are optional; absent `--source-root` reproduces today's behavior exactly. Rollback = revert the one-line action change (the package support can stay dark; the `persist-credentials: false` hardening is independent and stays).

## References

- Change folder: `context/changes/finder-file-context/`
- Agent + tool mechanics: `packages/code-reviewer/src/reviewer.ts` (tool: 117–127, caps: 13–14, seam docstring: 16–27)
- Cost-ceiling decision being deliberately superseded: impl-review-phase-1 F3 (archived `tool-loop-agent` change)
- Patterns mirrored: timeout envs + `onRetry` telemetry (`packages/code-reviewer/src/cli.ts:56-110`)
- Merge-ref lesson for the scratch PR: memory `ci-cd-code-review-implemented-pr115` (PR #116 gotcha)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Library — diff-scoped source + pipeline seam

#### Automated

- [x] 1.1 Package unit tests pass incl. source-provider + wiring tests (`npm run test`) — 0cb4eb9
- [x] 1.2 Typecheck passes (`npm run typecheck`) — 0cb4eb9
- [x] 1.3 Lint clean on touched files (targeted eslint) — 0cb4eb9

#### Manual

- [x] 1.4 Never-throw + exact-match-allowlist invariants confirmed by read-through — 0cb4eb9

### Phase 2: Delivery — CLI flag, env knob, telemetry lines, composite action

#### Automated

- [x] 2.1 Package unit tests pass incl. new cli.test.ts cases (`npm run test`)
- [x] 2.2 Typecheck passes (`npm run typecheck`)
- [x] 2.3 Lint clean on touched files (targeted eslint)

#### Manual

- [x] 2.4 action.yml diff re-read: flag inside ARGS, nothing else moved
- [x] 2.5 review.yml diff re-read: checkout gains only persist-credentials: false

### Phase 3: Live verification — planted-flaw scratch PR + evidence

#### Automated

- [ ] 3.1 verification.md exists in the change folder

#### Manual

- [ ] 3.2 Feature-PR review run green; telemetry in log + finderTelemetry in artifact
- [ ] 3.3 Scratch-PR run: tool called, cross-context flaw found, allowlist held
- [ ] 3.4 Scratch PR closed + branch deleted
- [ ] 3.5 Cost delta recorded and within ~3× tool-less baseline
