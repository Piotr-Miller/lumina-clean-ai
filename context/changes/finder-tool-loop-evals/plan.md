# Finder Tool-Loop Evals + Model Decision Implementation Plan

## Overview

Teach the promptfoo finder matrix to exercise the `getFileContext` tool loop against real fixture
files, add a case whose defect is knowable **only** from outside the hunk, measure tool usage and
cost per model, and use that data to pick the production finder — validated on one real PR before
the default changes.

The feature shipped in `finder-file-context` (PR #120) is wired but inert: glm-4.6 made **zero**
tool calls in 4/4 live runs, and again zero in the CI run on PR #122. This change builds the
instrument that answers "which finder actually uses the tool, at what quality gain and cost"
offline, instead of the seven-CI-run scratch-PR cycle phase 3 had to burn.

## Current State Analysis

The eval harness (`packages/code-reviewer/evals/`, from PR #119) is a promptfoo matrix that calls
the production factory directly:

- **Deliberately tool-less.** `finder-provider.ts:60` calls `createReviewer({model, lens,
projectContext})` with no `source`, so `hasSource` is false and the agent is single-generation.
  The README states the boundary: "no file-context tool — and swapping the production finder model
  remains a separate decision to be made from this data, not by this harness." This change is that
  later decision.
- **The existing cases cannot discriminate.** All three planted flaws in `react-migration.diff`
  are in-hunk, visible in the diff alone. In the 2026-08-10 run, glm-4.6 and sonnet-5 both scored
  **1.0 on every metric, on both cases, across all three repeats** — the matrix separates nothing.
- **Only recall is scored.** `scoreIssueRecall` (`assertions.mjs:38`) regex-matches planted ground
  truth; `reviewMustFail` (`assertions.mjs:8`) is a severity proxy. There is no precision or
  false-positive measure, so a model that finds every flaw and invents three more scores the same
  as one that is simply right.
- **Cost is unmeasurable today.** The provider deliberately leaves `tokenUsage`/`cost` unpopulated
  (deferred in #119), so per-row spend reads 0. Phase 3's cost figures came from live CI logs and
  were confounded by a model swap.
- **Tool-attachment already destabilized production.** The tool is not merely inert: with
  `--source-root` set, glm-4.6 drifts off `reviewResultSchema` three ways at once — a bare findings
  ARRAY instead of the wrapped object, `path` (the tool's own input field) instead of `file`, and
  report-style severities (`WARNING`, `OBSERVATION`) instead of the enum. Tool-less runs of the same
  diff pass, and it only began failing once `--source-root` shipped; production survives today only
  because PR #122's repair layer catches it (`src/output-repair.ts:5-22`). Envelope stability under
  tool-attachment is therefore a first-class model-selection signal, not a footnote.
- **Two models are excluded for provider-API reasons, not quality.** `qwen3-coder-flash` lacks
  `structured_outputs`, degrades to `json_object`, and Alibaba then rejects the request because the
  prompt lacks the literal word "json". `gpt-5.4-mini` is rejected by OpenAI strict structured
  outputs, which demands every property appear in `required` — while `startLine`/`endLine` are
  `.optional()` precisely for Anthropic compatibility (`schemas.ts:29-44`). Neither ever reached a
  model. Both exclusions are structural, and `gpt-5.4` would hit the identical wall.

### Key Discoveries:

- **The production source provider is already public.** `createDiffScopedSource`, `parseDiffPaths`
  and `describeFinderStep` are all exported from `src/index.ts`, so the eval can drive the _shipped_
  provider against a fixture root and exercise the real allowlist and symlink containment rather
  than a stand-in.
- **Telemetry has a route that avoids the closed schema.** `review-result.schema.json` is
  `additionalProperties: false` at both levels and pinned to draft-07 (promptfoo's bundled Ajv
  cannot load 2020-12), so nothing new may ride on the finder output. Verified in promptfoo
  0.122.0: `AssertionValueFunctionContext` exposes `metadata` as a shortcut to
  `providerResponse.metadata` (`node_modules/promptfoo/dist/src/index.d.ts:2425-2436`), so
  provider metadata is readable by JavaScript assertions.
- **`prepareFinalStep` bounds the loop** (`reviewer.ts:105`): the final allowed step carries no
  tools, so a fetch-happy model cannot spend the whole budget fetching and die with "No output
  generated". This is exercised for the first time by these evals.
- **Capability and price data (OpenRouter, checked 2026-08-11):** glm-4.6 $0.55/$2.20 per M
  (tools + structured outputs both supported — it _can_ call tools, it simply does not);
  claude-haiku-4.5 $1.00/$5.00; deepseek-v3.2 $0.27/$0.40; claude-sonnet-5 $2.00/$10.00.
- **Standing lesson that governs the flip**: "A synthetic-ground-truth A/B 'GO' is a
  GO-to-merge-OFF, not a GO-to-enable" (`context/foundation/lessons.md`). A fixture win is not by
  itself grounds to change what runs on every PR.
- **Never read pass/fail from `<cmd> | tail`** — a pipeline returns the last command's exit code
  (same lessons file). Applies to every verification command below.

## Desired End State

`npm run eval` runs a four-model matrix in which the finder has a real, diff-scoped
`getFileContext` tool backed by fixture files. Each row reports how many times the model called the
tool, which paths it fetched, and what it cost. One case is unsolvable without the tool and fails
any model that never receives the context; one case contains no defect and fails any model that
invents a critical or major finding on it (minor/nit findings are tolerated — see
`no_false_alarms`). Both new cases are tool-enabled.
The run is exported into `results/`, the finder-model decision is written down with its cost delta,
and the production default is changed only after the winner has been observed working on a real PR.

Verify by: a full matrix run whose snapshot shows non-zero `tool_calls` and non-zero cost for at
least one model, the cross-hunk case passing for that model and failing for any zero-call model, and
either a changed default model backed by a live PR observation or a recorded no-change decision.

## What We're NOT Doing

- **Not touching the production prompt or `findingSchema` to unblock qwen / gpt-5.4-mini.** Their
  exclusions are structural; the optionality of `startLine`/`endLine` exists for Anthropic
  compatibility and is not eval-driven collateral.
- **Not adding a judge pass or pipeline-level evals.** This harness isolates the finder; judge
  verdict consistency remains a later suite.
- **Not wiring evals into CI.** Paid, on-demand, manual — the Stryker governance template.
- **Not adding determinism knobs** (`temperature`/`seed` plumbing into `createReviewer`).
- **Not resolving the F3 dedup-identity question.**
- **Not scoring line-number accuracy, severity calibration, or full precision** — one clean-diff
  case is the precision signal, not an exhaustive labelling of acceptable findings.
- **Not committing run results under `packages/`** — snapshots go to the change folder.
- **Not building the `readPlan` / impl-review tooling** — that is `impl-review-ci-agent`, which
  depends on this change's model decision.

## Implementation Approach

Extend the existing harness rather than build a parallel one: the same provider file gains an
optional source, the same assertions file gains tool and precision checks, and the same config swaps
two dead providers for two live candidates and gains two cases. The eval drives the production
`createDiffScopedSource` so the security seam is exercised — and to make that true of the _whole_
seam, the fs injection currently inlined in `cli.ts` is extracted to a shared
`createFsDiffScopedSource` so CI and the evals cannot drift apart. All new observability rides in
promptfoo provider `metadata`, leaving the closed output schema untouched.

## Critical Implementation Details

**Fixture paths must satisfy the real allowlist.** `createDiffScopedSource` serves only paths that
`parseDiffPaths` extracted from the diff, then requires `realpath(join(root, path))` to equal
`join(realpath(root), path)` and the target to be a regular file. The fixture tree must therefore
mirror the diff's `+++ b/<path>` entries exactly. The equality resolves the ROOT on both sides, so a
canonicalized or symlinked fixture root is fine (pinned by an existing `source-provider.test.ts`
case); what breaks it is a symlink in the served FILE or in any path component BENEATH the root —
every such fetch returns a refusal, which would read as "the model did not use the tool".

**The fixture tree lands inside the package's own gates.** `tsconfig.json` is `include: ["src",
"evals/**/*.ts"]` and `eslint.config.js` is `files: ["src/**/*.ts", "evals/**/*.ts"]` under
`strictTypeChecked`, so every `.ts` fixture would be compiled and typed-linted by `npm run
typecheck` / `npm run lint` — this plan's own criteria AND the `code-reviewer` CI job. The filename
cannot dodge the glob: it is forced by the diff's `+++ b/<path>`. Exclude the tree from both gates
before authoring it (`"exclude": ["evals/fixtures/**"]` in `tsconfig.json`, a matching `ignores`
entry in `eslint.config.js`). Never edit a fixture to appease a lint rule — that silently breaks the
byte-for-byte diff↔disk contract and the tool starts serving content the diff contradicts.

**Tool-call counting must survive the tool-less final step.** `prepareFinalStep` strips
`activeTools` on the last allowed step, so the final generation legitimately reports zero tool
calls. Accumulate across all steps via `onStepEnd` + `describeFinderStep`; never read only the last.

## Phase 1: Fixture tree + source wiring

### Overview

Give the eval provider a real, diff-scoped source backed by fixture files, and surface tool usage
and cost as promptfoo metadata.

### Changes Required:

#### 1. Cross-hunk fixture

**File**: `packages/code-reviewer/evals/fixtures/cross-hunk/` (new tree) plus
`packages/code-reviewer/evals/fixtures/cross-hunk.diff`

**Intent**: Author a case whose defect is invisible in the diff: the hunk overrides or contradicts a
constant or documented contract that lives in the unchanged region of the same changed file. Port
the shape proven live in phase 3 (the `JPEG_QUALITY`-style contract sonnet-5 caught via the tool and
glm-4.6 missed without it).

**Contract**: The diff's `+++ b/<path>` entries must correspond exactly to files present under the
fixture root, byte-for-byte consistent with the post-change state. The contradicted contract must
appear **only** outside the hunk. Record the planted flaw's post-change line number in a comment
next to the case, as the existing React fixture does. Exclude `evals/fixtures/**` from
`tsconfig.json` and `eslint.config.js` in this step, **before** the tree exists (see Critical
Implementation Details).

#### 2. Clean-diff fixture

**File**: `packages/code-reviewer/evals/fixtures/clean-change.diff` + its backing file under the
fixture root (this case IS tool-enabled)

**Intent**: A small, genuinely defect-free change (e.g. a mechanical rename or an added test) that a
healthy reviewer should pass without manufacturing critical or major findings.

**Contract**: No planted flaw; `expectedIssues` omitted — which is exactly why `scoreIssueRecall`
must stop being a `defaultTest` assertion (Phase 2 §3): promptfoo prepends default assertions to
every case and `assertions.mjs` fails outright when `expectedIssues` is absent, so as a default it
would fail this case by construction. The case is tool-enabled (fixture root + backing file) because
the risk it measures is tool-INDUCED over-reporting — without a source `createReviewer` drops the
tool entirely and the case measures nothing of the kind. Its grading is precision-only (Phase 2).

#### 3. Provider gains an optional source and telemetry

**File**: `packages/code-reviewer/evals/finder-provider.ts`

**Intent**: When the case declares a fixture root, build the production `createDiffScopedSource`
over that root and pass it to `createReviewer`, so the finder runs tool-enabled; accumulate per-step
tool calls and token usage and report them to promptfoo. Cases without a fixture root keep today's
exact tool-less behavior.

**Contract**: A per-case `fixtureRoot` **var** — not provider config, which is per-model while
tool-enablement is per-case — resolved relative to the evals directory. Build the source with the
shared `createFsDiffScopedSource({ diff, root })` extracted in §4, then `createReviewer({..., source,
maxSteps, onStepEnd, onOutputRepair })` where `maxSteps` is the CI default of 5.

Telemetry must distinguish _requested_ from _delivered_: `describeFinderStep` reports the paths the
model ASKED for, while `createDiffScopedSource` answers an unlisted path, a symlinked component or
an unreadable file with a refusal STRING — so a refused call still looks like a successful fetch.
Wrap the source to record, per call, the requested path and whether the result was real content or a
refusal. `metadata` therefore carries at least `{ toolCalls, requestedPaths, deliveredPaths,
refusedPaths, steps, repairs }`.

Cost: `describeFinderStep` exposes tokens but drops the exact provider-reported figure, which lives
at `step.providerMetadata.openrouter.usage.cost`. Promptfoo's `tokenUsage` wants
`prompt`/`completion`/`total`/`numRequests` — not the AI SDK's field names — so map explicitly.
Accumulate across ALL steps, and report telemetry on the error path too, not only on success.

The reported `prompt` must switch to `buildInstructions(lens, { fileContextTool: true,
projectContext })` when a source is active, or the viewer will show a prompt that was never sent.
Keep the single-provider-attempt contract — do not add retries.

#### 4. Shared fs injection + exact cost in the production helpers

**Files**: `packages/code-reviewer/src/source-provider.ts`, `src/cli.ts`, `src/pipeline.ts`,
`src/index.ts` (+ their tests)

**Intent**: Make "the eval drives the production provider" true of the _whole_ seam, and give both
consumers one typed reader for OpenRouter's exact cost.

**Contract**: Extract the fs injection currently inlined in `cli.ts` (`parseDiffPaths` +
`readFileSync(p, "utf8")`, `realpathSync`, `statSync().isFile()`) into an exported
`createFsDiffScopedSource({ diff, root })`, and have `cli.ts` call it instead of wiring the
primitives itself — so a future hardening of that layer reaches CI and the evals together. Extend
`FinderStepInfo` / `describeFinderStep` with an optional `cost` parsed from
`step.providerMetadata.openrouter.usage.cost`, degrading safely when the metadata is absent (it is
optional by contract). Both changes are behavior-preserving; the review contract is unchanged.

### Success Criteria:

#### Automated Verification:

- Config still validates: `npx promptfoo validate config -c evals/promptfooconfig.yaml`
- Package typecheck passes with the fixture tree present: `npm run typecheck`
- Targeted lint clean on touched eval files: `npx eslint evals/finder-provider.ts`
- Package unit tests pass, incl. `createFsDiffScopedSource` and the cost parser: `npm test`

#### Manual Verification:

- Single-provider smoke run on the cross-hunk case reports non-zero `toolCalls` metadata for the
  known tool-capable anchor (sonnet-5). PAID, hence manual, per this repo's eval governance:
  `npm run eval -- --env-file .env --no-cache --filter-providers premium-claude-sonnet-5`
- Fixture tree read back through `createDiffScopedSource` serves the unchanged region (not a
  refusal) — confirm no symlink/realpath mismatch on this Windows checkout
- Viewer shows the tool-enabled instruction variant for tool-enabled cases

---

## Phase 2: Grading surface

### Overview

Turn tool usage and precision into graded signal, and keep the free hermetic gates covering the new
assertion logic.

### Changes Required:

#### 1. Tool-usage assertions

**File**: `packages/code-reviewer/evals/assertions.mjs`

**Intent**: Add an assertion that reads tool telemetry from assertion-context metadata and reports
it as a metric on every tool-enabled case, plus a strict variant that fails when a case that is
unsolvable without context was answered with zero tool calls.

**Contract**: Named exports following the existing `(output, context) => GradingResult` shape,
reading `context.metadata` (promptfoo 0.122 exposes `providerResponse.metadata` there). Metric names
`tool_calls` (observational — raw invocation count, refusals included) and `tool_required` (gating).
`tool_required` must NOT pass on invocation alone: it requires at least one DELIVERED result — a
refusal is not evidence — for the fixture path carrying the out-of-hunk contract. Absent metadata
fails closed. Return `componentResults` where useful so the viewer names what was missed, matching
`scoreIssueRecall`'s style.

#### 2. Precision assertion

**File**: `packages/code-reviewer/evals/assertions.mjs`

**Intent**: For the clean-diff case, fail the row when the review manufactures a critical or major
finding — the inverse of `reviewMustFail`.

**Contract**: A `reviewMustPass`-style export, metric `no_false_alarms`. Nits and minors are
acceptable; only critical/major count as false alarms.

#### 3. Config wiring

**Files**: `packages/code-reviewer/evals/promptfooconfig.yaml`, `packages/code-reviewer/evals/README.md`

**Intent**: Register the two new cases with their assertions, and swap the two dead providers for
the two new candidates.

**Contract**: **Delete** the `cheap-qwen3-coder-flash` and `middle-gpt-5.4-mini` provider blocks —
their exclusions are structural, and leaving them in makes this a six-model, 72-row matrix of which
24 rows are known-dead error rows polluting `decision.md`. Add `mid-claude-haiku-4.5`
(`anthropic/claude-haiku-4.5`) and `cheap-deepseek-v3.2` (`deepseek/deepseek-v3.2`), keeping
`baseline-glm-4.6` first as the anchor.

Move `scoreIssueRecall` OUT of `defaultTest.assert` and onto each defect-bearing case: promptfoo
prepends default assertions to every case and `assertions.mjs` fails when `expectedIssues` is
absent, so as a default it fails the clean case by construction. `defaultTest` keeps the `is-json`
schema check and the neutral Gemini grader — no candidate is from the grader's family, which the
deepseek/haiku picks preserve. The cross-hunk case carries explicit `expectedIssues`,
`tool_required`, and an `llm-rubric` naming the out-of-hunk contract; the clean-diff case carries
`no_false_alarms` and no recall assertion.

`evals/README.md` is part of this step, not Phase 4: its matrix table, case list and the "4 models x
2 cases x 3 repeats" cost line all go stale here.

#### 4. Free hermetic gates

**Files**: `packages/code-reviewer/evals/assertions.test.ts`, `evals/recall-selfcheck.mjs`,
`evals/assertions.d.mts`

**Intent**: Cover the new assertions with the same zero-cost tests the recall gate already gets, so
a broken grader is caught before any paid row is spent.

**Contract**: Unit cases for zero-call vs multi-call metadata, **a call whose result was a refusal**
(must fail `tool_required`), missing metadata (fails closed), and the false-alarm boundary (a
`minor`-only review must pass `no_false_alarms`). `assertions.d.mts` is hand-maintained and must
declare every new export, or the package typecheck breaks on the test file.

### Success Criteria:

#### Automated Verification:

- Package unit tests pass: `npm test`
- Assertion self-check passes: `node evals/recall-selfcheck.mjs`
- Assertions file parses: `node --check evals/assertions.mjs`
- Config validates: `npx promptfoo validate config -c evals/promptfooconfig.yaml`

#### Manual Verification:

- A deliberately zero-call row fails `tool_required` with a readable reason, and so does a row whose
  only tool call was refused
- The clean-diff case passes for the baseline model (no false alarms on a defect-free change)

---

## Phase 3: Run the matrix and decide

### Overview

Spend the paid run, export a citable snapshot, and write the finder-model decision with its cost
delta.

### Changes Required:

#### 1. Matrix run + snapshot

**File**: `context/changes/finder-tool-loop-evals/results/<date>-tool-loop-matrix.json`

**Intent**: Run the full matrix at step budget 5 with `--no-cache --repeat 3`, then export the run
into the change folder so the comparison is citable without rerunning.

**Contract**: `npx promptfoo export eval latest -o ../../context/changes/finder-tool-loop-evals/results/<date>-tool-loop-matrix.json`. Inspect before committing — prompts and full model outputs land in it verbatim. Estimated 4 models x 4 cases x 3 repeats = 48 finder calls plus grading — four, not six, because Phase 2 §3 deletes the dead qwen/gpt-5.4-mini providers. Expect roughly $1–2, above #119's $0.30–0.60 because tool loops add both steps and input tokens.

#### 2. Decision record

**File**: `context/changes/finder-tool-loop-evals/decision.md`

**Intent**: State which model should run as the production finder and why, in terms of tool
adoption, cross-hunk recall, false alarms, and cost per review.

**Contract**: The run is `--repeat 3`, so every cell is a RATE over three rows, not a single value —
decide the statistic _before_ spending the money. Per model: tool-call rate, delivered-context rate,
cross-hunk pass rate, recall, `no_false_alarms`, **envelope-repair rate**, and cost/row. Adoption
threshold, declared up front: a candidate must deliver context on the cross-hunk case in at least
2 of 3 repeats.

The repair-rate column exists because today's production finder is schema-stable only via
`output-repair.ts` (see Current State) — a "keep glm-4.6" recommendation has to argue against that
explicitly rather than omit it.

Plus an explicit recommendation and the runner-up. If no model both calls tools and stays
affordable, say so — "keep glm-4.6, tool stays inert" is a valid, recordable outcome.

### Success Criteria:

#### Automated Verification:

- Snapshot file exists and is valid JSON
- Snapshot contains non-zero `tool_calls` metadata for at least one model
- Snapshot contains non-zero cost for at least one row (proves Phase 1's telemetry landed)

#### Manual Verification:

- Snapshot scanned for secrets/PII before committing
- Decision recorded with the cost delta against the glm-4.6 baseline and a repair-rate column
- Cross-hunk case discriminates BETWEEN MODELS: the best model's delivered-context rate is at least
  2/3 while the worst model's is 0/3 — one model's own 2-of-3 sampling noise is not discrimination

---

## Phase 4: Live validation and flip

### Overview

Convert the fixture result into a production change only after seeing the winner work on a real PR.

### Changes Required:

#### 1. Live observation

**File**: `.github/workflows/review.yml` on a throwaway scratch branch only — never merged
(observation recorded in `verification.md`)

**Intent**: Run the winning model against one real PR and confirm it calls the tool, actually
receives context, and produces a sane review on a real diff.

**Contract**: The composite action's `review-model` input is fed from the repository variable
`vars.OPENROUTER_REVIEW_MODEL`, currently `z-ai/glm-4.6`. That variable outranks `DEFAULT_MODEL`, so
editing `config.ts` changes nothing live, and `review.yml` has no `workflow_dispatch` to pass a
one-off override. Use the probe method proven in `finder-file-context` phase 3: open a scratch PR
whose branch pins `review-model:` to the candidate literal in `review.yml`, observe the run, then
close the PR and delete the branch WITHOUT merging. Record the run id, the per-step telemetry lines,
the verdict, and the cleanup evidence.

#### 2. Default change (conditional)

**Files**: the `OPENROUTER_REVIEW_MODEL` repository variable (the actual control),
`packages/code-reviewer/src/config.ts`, `AGENTS.md`

**Intent**: If and only if the live observation holds, change the model production actually uses;
otherwise record a no-change decision and leave everything alone.

**Contract**: The live change is the repository variable — an outward-facing mutation, so **ask
before setting it**, and note that `! gh variable set` from a non-interactive shell writes an empty
value (same trap as the recorded `gh secret set` lesson): prefer the GitHub UI or the user's own
terminal. Then synchronize the checked-in fallback so it stops lying: `DEFAULT_MODEL` in `config.ts`
(today `anthropic/claude-sonnet-5`, already divergent from the live `z-ai/glm-4.6`), its
`config.test.ts` expectation, and `AGENTS.md`'s CI section. A no-change outcome still updates
`decision.md` and the README scope note.

### Success Criteria:

#### Automated Verification:

- Package unit tests pass: `npm test`
- Typecheck passes: `npm run typecheck`
- Config-default test reflects the chosen model (or is untouched on a no-change outcome)

#### Manual Verification:

- Live PR run shows non-zero `getFileContext` calls AND delivered (non-refused) context in the
  Actions log for the chosen model
- The live review's verdict and findings are sane on a real diff (no envelope repair fired, no
  runaway cost)
- Cost of the live run recorded against the glm-4.6 baseline
- Scratch probe branch closed and deleted unmerged; `OPENROUTER_REVIEW_MODEL` reflects the intended
  model and the checked-in fallback matches it

---

## Testing Strategy

### Unit Tests:

- New assertions: zero-call vs multi-call metadata, a call whose result was a refusal, absent
  metadata, false-alarm boundary at `minor` vs `major`
- `createFsDiffScopedSource` extraction leaves `cli.ts` behavior unchanged (`cli.test.ts`,
  `source-provider.test.ts`)
- Cost parsing from `providerMetadata`, incl. the absent-metadata path (`pipeline.test.ts`)
- Existing recall/severity assertions remain green (`assertions.test.ts`, `recall-selfcheck.mjs`)

### Integration Tests:

- Single-provider smoke run against the cross-hunk case (paid but cheap) validates provider wiring,
  fixture containment, and metadata plumbing end to end before the full matrix

### Manual Testing Steps:

1. Read a served fixture back through the provider and confirm content, not a refusal
2. Run one provider on the cross-hunk case and inspect `toolCalls` / `fetchedPaths` in the viewer
3. Run the full matrix, then open the viewer and confirm the cross-hunk case separates models
4. Scan the exported snapshot for secrets before committing

## Performance Considerations

Cost, not latency, is the constraint. Tool loops raise both step count and input tokens per row, so
the matrix roughly doubles #119's spend even at the same provider count. Step budget stays at the CI
default of 5 so figures transfer to production; `prepareFinalStep` guarantees the last step is
tool-less, bounding the worst case.

## Migration Notes

Phase 1 §4 touches production modules, but behavior-preservingly: `createFsDiffScopedSource` is an
extraction of fs wiring already inlined in `cli.ts`, and `cost` on `FinderStepInfo` is optional and
additive. The eval harness itself stays off the production path. Phase 4's production artifact is
the `OPENROUTER_REVIEW_MODEL` repository variable (plus the checked-in fallback it should match),
guarded by a live observation.

## References

- Prior harness + matrix: `context/archive/2026-08-09-code-review-evals/` (plan, results snapshot)
- Tool feature + live probe evidence: `context/archive/2026-08-10-finder-file-context/verification.md`
- Envelope repair and its telemetry hook: `packages/code-reviewer/src/output-repair.ts` (PR #122)
- Harness docs and governance: `packages/code-reviewer/evals/README.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fixture tree + source wiring

#### Automated

- [x] 1.1 Config still validates (promptfoo validate) — edf3982
- [x] 1.2 Package typecheck passes with the fixture tree present — edf3982
- [x] 1.3 Targeted lint clean on touched eval files — edf3982
- [x] 1.4 Package unit tests pass (createFsDiffScopedSource + cost parser) — edf3982

#### Manual

- [x] 1.5 Paid single-provider smoke run reports non-zero toolCalls for sonnet-5 — edf3982
- [x] 1.6 Fixture tree serves content through createDiffScopedSource (no realpath/symlink refusal) — edf3982
- [x] 1.7 Viewer shows the tool-enabled instruction variant for tool-enabled cases — 90dee42

### Phase 2: Grading surface

#### Automated

- [x] 2.1 Package unit tests pass — 90dee42
- [x] 2.2 Assertion self-check passes — 90dee42
- [x] 2.3 Assertions file parses (node --check) — 90dee42
- [x] 2.4 Config validates — 90dee42

#### Manual

- [x] 2.5 A zero-call row and a refused-fetch row both fail tool_required with a readable reason — 90dee42
- [x] 2.6 Clean-diff case passes for the baseline model — 90dee42

### Phase 3: Run the matrix and decide

#### Automated

- [x] 3.1 Snapshot file exists and is valid JSON — b24e65d
- [x] 3.2 Snapshot contains non-zero tool_calls for at least one model — b24e65d
- [x] 3.3 Snapshot contains non-zero cost for at least one row — b24e65d

#### Manual

- [x] 3.4 Snapshot scanned for secrets/PII before committing — b24e65d
- [x] 3.5 Decision recorded with cost delta against the glm-4.6 baseline and a repair-rate column — b24e65d
- [x] 3.6 Cross-hunk discriminates between models (best delivered-context rate >= 2/3, worst 0/3) — b24e65d

### Phase 4: Live validation and flip

#### Automated

- [x] 4.1 Package unit tests pass — 2caf9b8
- [x] 4.2 Typecheck passes — 2caf9b8
- [x] 4.3 Config-default test reflects the chosen model (or untouched on no-change) — no-change outcome: config.ts + config.test.ts untouched — 2caf9b8

#### Manual

- [x] 4.4 Live PR run shows non-zero getFileContext calls and delivered context for the chosen model — 2caf9b8
- [x] 4.5 Live review verdict and findings are sane (no envelope repair, no runaway cost) — 2caf9b8
- [x] 4.6 Live-run cost recorded against the glm-4.6 baseline — 2caf9b8
- [x] 4.7 Scratch probe branches closed/deleted unmerged; OPENROUTER_REVIEW_MODEL unchanged, matching the no-change decision — 2caf9b8
