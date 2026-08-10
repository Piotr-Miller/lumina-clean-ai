---
date: 2026-08-09T21:26:30+02:00
researcher: Claude Fable 5 (Claude Code)
git_commit: a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4
branch: master
repository: lumina-clean-ai
topic: "Eval-readiness of packages/code-reviewer + eval-toolkit selection (promptfoo vs alternatives)"
tags: [research, codebase, code-reviewer, evals, promptfoo, evalite, vitest-evals, autoevals, model-selection]
status: complete
last_updated: 2026-08-09
last_updated_by: Claude Fable 5 (Claude Code)
---

# Research: Eval-readiness of `packages/code-reviewer` + eval-toolkit selection

**Date**: 2026-08-09T21:26:30+02:00
**Researcher**: Claude Fable 5 (Claude Code)
**Git Commit**: a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4
**Branch**: master
**Repository**: lumina-clean-ai (Piotr-Miller/lumina-clean-ai)

## Research Question

Analyze the current state of `packages/code-reviewer` in the context of potential eval introduction — reusability of prompts, importability of agent, etc. First pick for the eval toolkit is promptfoo, but that is an assumption to check thoroughly against current docs. Check what is aligned with the stack and go in that direction; otherwise analyze other OSS tools for evaluating prompts and agents. (Fresh docs via web search / context7; researched 2026-08-09.)

## Summary

**The promptfoo assumption holds — and it was never really an assumption.** The package was _purpose-built_ for promptfoo embedding across three prior changes: the barrel is side-effect-free specifically so "promptfoo imports this" works (`src/index.ts:1-2`), config resolution is lazy/throwing for the same reason (`src/config.ts:1-4`), prompts are centralized so "promptfoo prompt variants never touch agent wiring" (`src/prompts.ts:3-4`), and `SourceProvider` was designed so "promptfoo can wire it to eval fixtures" (`src/reviewer.ts:17-19`). Fresh-docs verification (v0.122.0, 2026-08-04) confirms current promptfoo matches the need precisely: first-class TypeScript custom providers that can call `runReviewPipeline`/`createReviewer` directly (no HTTP), a provider×prompt×test matrix for multi-model comparison, `--repeat`/`--no-cache` for flake-rate measurement, model-graded assertions with an OpenRouter grader, local viewer + JSON/HTML outputs, MIT, weekly releases, Node ≥22.22 / ESM / zod-v4 / tsx — all matching this stack exactly.

The strongest alternative on paper, **Evalite v1** (vitest-based, variants matrix, `trialCount`, AI SDK response caching), is disqualified in practice: pre-1.0 beta with no visible main-branch activity since Nov 2025 and unverified AI SDK v7 compatibility. **vitest-evals (Sentry)** is the credible fallback (active, vitest-native, AI SDK judges) but lacks the two primitives this change centers on — multi-model matrix runs and repeat-count flake measurement. A plain-vitest DIY harness gives up the comparison viewer and matrix ergonomics for no offsetting benefit. **autoevals** is a complement (TS scorer library, OpenRouter-configurable via `init({client})`), not a competitor.

Three practical constraints shape the harness: (1) the package has **no exports map, no build, no workspace link** — the harness must live _inside_ `packages/code-reviewer` (an external import would also risk a second `ai` copy breaking `NoObjectGeneratedError.isInstance` brand checks); (2) there is **no ground-truth dataset yet** — but ready-made seeds exist (PR #117's planted-flaws diff, still fetchable via `gh api`; an untracked `.review-out/` dry-run artifact on disk that should be harvested before it's overwritten; `demo.ts`'s seeded-bug diff); (3) evals are **paid, on-demand, never CI-gated** — the mutation-testing precedent (`AGENTS.md`: "on demand, never in CI") is the governance template, and the hermetic `code-reviewer` CI job must stay secret-free.

Live priors the eval inherits: the finder (`z-ai/glm-4.6`) has ~4 schema flakes across 12 live review runs (~25–33% run-level) while the judge (`anthropic/claude-sonnet-5`) has never flaked — the sharpest starting hypothesis for the model-comparison matrix.

## Detailed Findings

### 1. Package eval-readiness — seams (ready) and gaps (to close)

**Ready — the deliberate seams:**

- **Side-effect-free public barrel** (`src/index.ts`): exports everything an eval needs — prompt builders (`buildInstructions`, `buildPrompt`, `buildJudgeInstructions`, `buildJudgePrompt`), agent factories (`createReviewer`, `createJudge`), the full pipeline (`runReviewPipeline` + `PipelineDeps`/`PipelineInput` types), all zod schemas, and the pure helpers (`mergeFindings`, `findingKey`, `normalizeFindings`, `assignFindingIds`, `validateJudgeReferences`, `computeDiffStats`, `renderStickyComment`). No import-time env reads or exits (`src/config.ts:1-4` — lazy, throwing).
- **Injectable factories**: `createReviewer({ lens, model, apiKey, source, maxSteps, projectContext })` (`src/reviewer.ts:86-141`) and `createJudge({ model, apiKey })` (`src/judge.ts:32-60`) — model id per instance is exactly the knob a multi-model matrix needs; the factory returns `{ review, agent, lens, model }` ("promptfoo will want them for run labeling" — tool-loop-agent plan). `SourceProvider` lets an eval wire `getFileContext` to in-memory fixtures (`src/reviewer.ts:28-32`), with clamps (`MAX_CONTEXT_LINES` 400, `MAX_CONTEXT_CHARS` 20k) as defense in depth.
- **Pipeline injection seams**: `PipelineDeps.finder/judge/retrySleep` + `PipelineInput.onRetry/timeouts/overrides` (`src/pipeline.ts:92-113`) — an eval can run the _real_ two-pass pipeline with real models, or isolate one pass.
- **Pure deterministic-assertion surface**: `mergeFindings` (dedup key `file:startLine|category`, higher severity wins, code-point-stable sort — `src/findings.ts:43-58`), `assignFindingIds` (`F1..Fn` post-merge — `src/scorecard.ts:24-26`), `validateJudgeReferences` (judge can never mint findings — `src/scorecard.ts:38-52`), `preDedupFindingCount` on `PipelineResult` (`src/schemas.ts:126-131` — "deferred to code-review-evals with live collapse data").
- **Cost guards already structural**: `maxSteps` ≤ 8 loop cap (`src/reviewer.ts:89-94`, recorded as "a cost guard for future eval batches"), `maxRetries: 0` + single `withOneRetry` ⇒ ≤ 2 provider attempts per pass (pinned by `src/provider-attempts.test.ts:11-15`), per-attempt timeouts (`src/pipeline.ts:24-25`).
- **Reusable test-fixture patterns**: factories for findings/scores/judge results (`pipeline.test.ts:31-52` and siblings), the real-constructor `NoObjectGeneratedError` pattern (`retry.test.ts:22-42` — isInstance checks a private constructor brand, so fixtures must use the real constructor, and a harness must not import a second `ai` copy), the `MockLanguageModelV3` + `vi.mock` pattern for running the real ToolLoopAgent loop against canned output (`judge.test.ts:12-15`, `provider-attempts.test.ts:16-22`), and env-scrub hygiene (`vi.stubEnv` of all four `OPENROUTER_*` vars — an eval harness must replicate this or a shell-exported key leaks in).

**Gaps — what the change must add or accept:**

1. **No package entry point**: `package.json` has no `exports`/`main`/`types`, no build (`noEmit: true`), `"private": true`, and the root repo has no npm workspaces — the root actively excludes the package (root `tsconfig.json:7`, root `eslint.config.js:107`). ⇒ The harness lives in `packages/code-reviewer/evals/` with relative imports under tsx — zero packaging changes needed there; any other location fights the packaging and risks dual-`ai`-copy hazards.
2. **No ground-truth dataset**: no test anywhere feeds real flawed code to a real finder and asserts on findings. The only seeded-bug artifact is `src/demo.ts:28-42` (`SIMULATED_DIff` with off-by-one, `==` coercion, `var`) — unannotated with expected findings. No `evals/`, no golden `review.json`.
3. **No determinism knobs**: neither agent sets `temperature`/`seed`/`providerOptions`, and there is no plumbing to pass them (`src/reviewer.ts:104-129`, `src/judge.ts:37-44`) — a small source change if the eval wants temperature-0 experiments.
4. **Usage/cost discarded**: `result.usage` from `agent.generate` is dropped in both passes (`src/reviewer.ts:137`, `src/judge.ts:52-56`); `PipelineResult` has no token/cost fields. Promptfoo's cost columns need the provider wrapper to populate `tokenUsage`/`cost` itself.
5. **`evals/` is outside every config glob**: vitest `include: ["src/**/*.test.ts"]`, tsconfig `include: ["src"]`, eslint `files: ["src/**/*.ts"]`. Good news: eval runs can't accidentally ride the hermetic CI `npm test`; cost: typecheck/lint coverage for eval code needs deliberate config widening.
6. **Judge verdict is model-owned** with prose-only thresholds (`src/prompts.ts:79`) — no code oracle exists; pass/fail ground truth must be authored per-case (this is by design, per the recorded user decision).
7. **Provider hardcoded at the factory**: `createOpenRouter` is fixed in both factories (`src/reviewer.ts:95`, `src/judge.ts:35`) — fine for OpenRouter-based evals (model id is injectable); module-mocking is the only way to swap the provider entirely.

### 2. Inherited commitments and live priors (project history)

**Decisions this change owns (recorded, quoted in the archives):**

- **F3 dedup identity** — "The widen-or-keep call is deferred to the `code-review-evals` change, decided on that data plus the promptfoo harness" (`context/archive/2026-08-08-review-pipeline-reliability/change.md:36-42`; plan-brief: the evals change "**owns the call**"). The identity under test: `file:startLine|category`, higher severity wins (`src/findings.ts:43-58`); the datum: `preDedupFindingCount − findings.length` per live run.
- **Judge-verdict consistency** — user decision from the ci-cd-code-review planning Q&A: "Verdict consistency gets measured by the eval harness (`code-review-evals`, next change) **before the verdict ever becomes a blocking gate**" (`context/archive/2026-08-07-ci-cd-code-review/requirements.md:43`). The judge owning the verdict was chosen _against_ the recommendation, with the recorded tradeoff "the verdict becomes nondeterministic and needs later evaluation."
- **Flake-rate reduction** — "Not changing models or prompts to reduce the flake rate — that's evals territory" (`.../2026-08-08-review-pipeline-reliability/plan.md:74-75`).
- **Per-pass testability** — the two-pass split and named-score schema were designed "so that change can test finder, judge, and pipeline **separately**" (`.../2026-08-07-ci-cd-code-review/plan-brief.md:78-80`); positional score arrays were rejected because they're "fragile for models and evals alike."

**Live priors (quantified):**

| Prior                                                 | Value                                                                                                                   | Source                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Finder schema-flake rate (`z-ai/glm-4.6`)             | ~4 flakes / 12 live runs (~25–33% run-level), incl. the PR #118 double-flake                                            | archive verification.md tallies + `gh run list` 2026-08-09                          |
| Judge schema-flake rate (`anthropic/claude-sonnet-5`) | 0 observed flakes, all runs                                                                                             | same sweep                                                                          |
| Model-split rationale                                 | "Cost scales with diff size on the cheap pass; quality where the decision is made; evals can test each pass separately" | `.../2026-08-07-ci-cd-code-review/plan-brief.md:38` (user decision)                 |
| Judge-score variance on the same defect set           | security 1 vs 2, correctness 2 vs 4, tests 2 vs 3; 4 vs 7 findings; different `F<n>` ids for the same defect            | PR #117 sticky comment vs the local `.review-out/` dry-run artifact                 |
| Known collapse case for F3                            | 3 findings sharing `src/users.js:5`+`security` collapse to 1                                                            | `context/archive/2026-08-05-tool-loop-agent/reviews/phase-2-live-evidence.md:54-61` |

**Ground-truth seeds already in existence:**

1. **PR #117 flawed diff** (`scratch/ai-review-flawed-clean`, closed, branch deleted — patch still fetchable via `gh api repos/:owner/:repo/pulls/117/files --jq '.[].patch'`): one file, 27 lines, four planted defects (IDOR via unscoped admin update, missing zod validation, wrong error shape, PII logging) + missing tests. The live run scored it: verdict failed, security 1, correctness 2, findings F1 IDOR critical / F3 zod critical / F2 error-shape minor / F4 PII minor — a complete annotated case.
2. **Untracked local artifact** `packages/code-reviewer/.review-out/{review.json,comment.md}` (2026-08-08): same defect set + a `cn()` violation over 2 files, **7 findings**, different scores — the judge-consistency counterpart. ⚠️ Gitignored (`**/.review-out/`) and overwritten by any local `npm run review` — **harvest it into the change folder early**. Live run artifacts (`ai-review-output`) expire after 14 days.
3. **`src/demo.ts` SIMULATED_DIFF** — off-by-one + `==` + `var`, with an in-memory `SourceProvider` pattern to copy for `getFileContext` fixtures.
4. **`.github/ai-review-rules.md`** — the trusted rules the finder receives; its "repo red flags" list (e.g. `E2E_ALLOWED_OUTPUT_ORIGIN` in prod config = critical) is a ready-made generator for negative/positive rule-adherence cases, including untested ones.

**Where evals may run (constraints):** the review workflow is advisory and never in `deploy.needs`; secrets never reach fork PRs; the `code-reviewer` CI job is deliberately hermetic ("no network, no secrets — fork-PR-safe") and must stay so. The governance template is mutation testing: "a quality gate run on demand, never in CI" (`AGENTS.md`). Precedent exists for leaving paid steps optional/unchecked (review-pipeline-reliability 2.4) and for rejecting oracles whose "cost exceeds its signal" (test-plan §7 — scoped to image-quality judging, but it is the standard an eval budget will be read against).

### 3. Promptfoo — current state (verified 2026-08-09)

Version **0.122.0** (2026-08-04), MIT, ~24.1k stars, weekly-to-biweekly releases; Node `>=22.22.0` (Node 24 recommended — ours exactly); ESM-native with dual CJS; zod v4 as a regular dependency; bundles tsx (also our executor). Sources: promptfoo.dev docs (live), github.com/promptfoo/promptfoo, npm.

Capabilities mapped to this change's needs:

- **TS custom providers, first-class**: `providers: [{ id: file://./finderProvider.ts, label: 'finder:glm-4.6', config: { model: 'z-ai/glm-4.6' } }]` — a class with `id()` + `async callApi(prompt, context)`; `context.vars` carries the test case (e.g. the diff), provider `config` carries the model id. The provider ignores HTTP entirely and calls `createReviewer({ model }).review(...)` or `runReviewPipeline(...)` directly. Promptfoo transpiles TS providers itself. The same provider file listed N times with different `config.model` = the model matrix.
- **Node API + vitest story**: `promptfoo.evaluate(testSuite, { maxConcurrency })` with inline function providers/asserts; a documented jest/vitest integration exposes `assertions.matchesLlmRubric` etc. as custom matchers. (CLI+YAML remains the paved road for matrix runs + viewer.)
- **Assertions**: `javascript` (custom fn → pass/score/reason — where recall/precision vs ground truth lives; TS files supported), `is-json` with JSON-Schema validation (zod v4's `z.toJSONSchema()` bridges our schemas in one line), model-graded (`llm-rubric`, `g-eval`, `factuality`, `select-best`...) with **grader override at defaultTest/assertion level accepting any provider id — `openrouter:<model>` works** (use built-in provider ids as graders; custom-JS-providers-as-graders have open issues #1807/#5378). Named `metric:` labels aggregate in the UI.
- **Matrix + repeats**: full cartesian providers × prompts × tests; `--repeat <n>` for flake measurement (combine with `--no-cache`); `--filter-providers/-pattern/-sample/-failing` to slice; aggregate pass-rate env thresholds with distinct exit codes.
- **Cost control**: disk cache exists but **does not auto-apply to custom JS providers** (they'd opt in via `promptfoo.cache.fetchWithCache`; our AI-SDK calls bypass it) — for flake stats that's what you want anyway; control spend via `maxConcurrency`, sampling filters, and small case counts. `tokenUsage`/`cost` per response only if the provider populates them (map the AI SDK `usage` — currently discarded in our code, see gap #4).
- **Outputs/CI/privacy**: `promptfoo view` local web viewer (SQLite in `~/.promptfoo`), `--output` json/html/junit/csv; GitHub Action exists (geared to prompt-diff PRs; plain `npx promptfoo eval -o results.json` fits model benchmarking better); fully local by default, sharing opt-in, telemetry opt-out via `PROMPTFOO_DISABLE_TELEMETRY=1`.
- **Agent/trace support**: OTLP receiver + `traceparent` into providers → span timelines in the viewer; trajectory assertions (`trajectory:tool-used`, `trace-span-count`...) can assert the finder actually called `getFileContext`. Custom-provider wrapping remains the standard pattern for bespoke agents.
- **Known pain points**: 0.x weekly churn (pin the version); tsconfig path aliases fail in TS providers (#8116 — we use relative imports, low risk); provider `config` passthrough had bugs (#6492 — smoke-test on 0.122); heavy dependency tree (keep it a devDependency of the package, not the root).

### 4. Alternatives — why they don't displace promptfoo here

| Tool                                                 | Fit summary                                                                                                                                                        | Disqualifier for this change                                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Evalite v1 beta** (MIT, ~1.6k★)                    | Best feature map on paper: vitest-based, `evalite.each` variants matrix, `trialCount` flake primitive, `wrapAISDKModel` response caching, local UI + static export | Pre-1.0 beta; main branch dormant since **Nov 2025**; AI SDK v7 compat of `wrapAISDKModel` unverified. Betting the change's infrastructure on a stalled beta contradicts the reliability posture. |
| **vitest-evals** (Sentry, Apache-2.0, ~326★, active) | Credible fallback: stays in vitest 4, AI-SDK-native judges (OpenRouter-friendly), tool-call-aware, `vitest-evals serve` viewer, GH Action                          | No multi-model matrix primitive, no repeat/trial primitive, no response cache — the two core needs (model matrix + flake rates) fall back to hand-rolled loops, i.e. DIY with extra steps.        |
| **Plain vitest DIY** (+ autoevals)                   | Zero new risk, hermetic-culture-native, deterministic scoring is plain assertions                                                                                  | Gives up the comparison viewer, matrix ergonomics, repeat/report tooling — everything promptfoo provides out of the box; most code to own.                                                        |
| **autoevals** (MIT, ~1k★, active)                    | TS-native scorer library; `init({ client })` with an OpenAI-compatible client makes every model-graded scorer run through OpenRouter                               | Not a runner — a complement to whichever runner wins, if subjective scoring beyond promptfoo's built-ins is ever needed.                                                                          |
| **Braintrust Eval()**                                | Nice runner                                                                                                                                                        | Requires braintrust.dev SaaS account — no local-only mode. Out.                                                                                                                                   |
| **Langfuse self-host** (MIT, ~32.8k★)                | LLM-as-judge + datasets now fully OSS                                                                                                                              | Wrong shape: observability/persistence infrastructure (Postgres+ClickHouse+Redis+S3 standing stack), not a local dataset-eval runner; you still write the loop.                                   |
| **Mastra evals** (Apache-2.0)                        | Good scorers                                                                                                                                                       | Runners are framework-bound (need Mastra agents/instance); wrapping ToolLoopAgent in Mastra is pointless indirection.                                                                             |
| **DeepEval / Ragas / OpenAI Evals**                  | —                                                                                                                                                                  | Python-first; DeepEval's TS package is a SaaS client; Ragas is RAG-centric; OpenAI Evals is effectively legacy (platform product shutting down Nov 2026).                                         |

**Decision logic**: promptfoo is the only actively-maintained option that provides the model matrix, repeat runs, local viewer, and report formats natively — and the package's own seams were built for it, with the F3 decision _recorded_ as "decided on that data plus the promptfoo harness". The alternatives either lack the core primitives (vitest-evals, DIY), are dormant (Evalite), SaaS-tied (Braintrust, DeepEval-TS), or the wrong shape (Langfuse, Mastra).

### 5. Recommended harness shape (input to `/10x-plan`)

- **Location**: `packages/code-reviewer/evals/` — in-package (forced by the packaging gaps; also keeps one `ai` copy for `isInstance` brands). Add an `eval` npm script; widen tsconfig/eslint includes deliberately; keep vitest's `include` untouched so CI stays hermetic.
- **Config**: YAML `promptfooconfig.yaml` (the paved road) + TS custom providers via `file://` — one provider file per pass: a finder provider wrapping `createReviewer({ model: config.model, source: fixtureSource }).review(...)` and a judge provider wrapping `createJudge({ model }).judge(...)` with canned findings inputs; optionally a third pipeline provider wrapping `runReviewPipeline` for end-to-end cases. Matrix = the same provider listed once per candidate model. Pin the promptfoo version exactly; `PROMPTFOO_DISABLE_TELEMETRY=1`.
- **Scoring**: deterministic `javascript` assertions computing recall/precision against per-case expected findings **keyed on `file:startLine + category` (never `F<n>` — ids are per-run)**; `is-json` + `z.toJSONSchema(reviewResultSchema)` for shape; named `metric:` labels per dimension; judge stability = `--repeat` over the judge provider with score-variance post-processing; schema-flake rate = `--repeat N --no-cache` on the finder counting `NoObjectGeneratedError` (surface it via the provider's `error` field).
- **F3 methodology**: a scoring function that re-runs candidate identity keys (`file:startLine|category` vs +normalized-description variants) against ground-truth cases with known distinct-same-line defects, combined with the live `preDedupFindingCount` collapse counts.
- **Cost governance**: mutation-testing template — on-demand npm script, never a CI job; small curated case set; `maxConcurrency` low; document expected per-run cost. Populate `tokenUsage`/`cost` in the provider from AI SDK `usage` (requires the small source change to stop discarding it, or read it inside the provider wrapper via the factory's returned `agent`).

## Code References

Permalink base: `https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/`

- [`packages/code-reviewer/src/index.ts:1-2`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/src/index.ts#L1-L2) — "Pure barrel … promptfoo imports this"
- [`packages/code-reviewer/src/config.ts:1-4`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/src/config.ts#L1-L4) — lazy/throwing config for embedders; model resolution chain at `:25-37`
- [`packages/code-reviewer/src/prompts.ts:3-4`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/src/prompts.ts#L3-L4) — all model-facing text centralized; judge rubric `:66-72`; verdict guidance `:79`
- [`packages/code-reviewer/src/reviewer.ts:17-19`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/src/reviewer.ts#L17-L19) — "promptfoo can wire it to eval fixtures"; factory `:86-141`; no temperature/seed plumbing `:104-129`
- [`packages/code-reviewer/src/judge.ts:32-60`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/src/judge.ts#L32-L60) — judge factory; usage discarded `:52-56`
- [`packages/code-reviewer/src/pipeline.ts:92-113`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/src/pipeline.ts#L92-L113) — `PipelineDeps` + `PipelineInput` seams
- [`packages/code-reviewer/src/schemas.ts:126-131`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/src/schemas.ts#L126-L131) — `preDedupFindingCount`: "deferred to code-review-evals with live collapse data"
- [`packages/code-reviewer/src/findings.ts:43-58`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/src/findings.ts#L43-L58) — the dedup identity under F3 evaluation
- [`packages/code-reviewer/src/demo.ts:28-49`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/src/demo.ts#L28-L49) — seeded-bug diff + in-memory SourceProvider pattern
- [`packages/code-reviewer/src/retry.test.ts:22-42`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/src/retry.test.ts#L22-L42) — real-constructor `NoObjectGeneratedError` pattern (isInstance brand)
- [`packages/code-reviewer/src/provider-attempts.test.ts:11-15`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/src/provider-attempts.test.ts#L11-L15) — ≤ 2 provider attempts per pass invariant
- [`packages/code-reviewer/package.json`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/package.json) — no exports/main/build; tsx-only
- [`packages/code-reviewer/vitest.config.ts`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/packages/code-reviewer/vitest.config.ts) — `include: ["src/**/*.test.ts"]` (evals invisible to CI tests)
- [`.github/workflows/review.yml:71-101`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/.github/workflows/review.yml#L71-L101) — live models (finder `z-ai/glm-4.6`, judge `anthropic/claude-sonnet-5` via repo vars) + 14-day `ai-review-output` artifact retention
- [`.github/ai-review-rules.md`](https://github.com/Piotr-Miller/lumina-clean-ai/blob/a45a1e4c9476f951fde21293a42b5bbcbf1f4ae4/.github/ai-review-rules.md) — trusted finder rules; red-flags list = eval-case generator

## Architecture Insights

- **The package is an eval-first design executed before the eval existed** — four in-code seam comments, import-purity as a recorded "load-bearing constraint", factories exposing `lens`/`model` for run labeling, and the schema shaped so "models and evals both address criteria by name". The eval change consumes seams; it should not need to redesign any.
- **The finder/judge asymmetry is the eval's organizing principle**: cheap model reads the big diff (flaky), quality model decides on a short context (stable). The matrix should vary each pass independently — finder candidates against recall/precision + flake rate, judge candidates against score stability + verdict consistency.
- **Determinism boundaries**: everything after the model call is deterministic and code-point-stable (merge → sort → ids), so eval assertions can be exact once keyed correctly (`file:startLine+category`). The nondeterminism is confined to model outputs — by design, and that is precisely what gets measured.
- **The retry contract is part of the measured surface**: schema mismatch → 0ms re-roll, ≤ 2 attempts per pass — an eval measuring flake rates per-attempt must run with retries visible (count `onRetry` firings or provider errors), not hidden behind the recovery.

## Historical Context (from prior changes)

- `context/archive/2026-08-05-tool-loop-agent/` — built the library "so promptfoo evals can import a reviewer factory later"; single-agent baseline "to put under promptfoo first"; promptfoo config explicitly out of scope, "separate change; consumes the factory export".
- `context/archive/2026-08-07-ci-cd-code-review/` — requirements.md:59 parks "prompt/model evaluation harness (promptfoo) — separate change (code-review-evals)"; requirements.md:43 records the user decision that verdict consistency gets measured here before any blocking gate; plan-brief.md:38 records the model-split cost rationale; verification.md:45 the original 2/7 flake tally.
- `context/archive/2026-08-08-review-pipeline-reliability/` — change.md:36-42 the F3 deferral ("decided on that data plus the promptfoo harness"); plan.md:74-75 flake-reduction-is-evals-territory; change.md:44-50 the PR #118 double-flake live evidence.
- `context/foundation/test-plan.md` §7 — the "cost exceeds its signal" oracle-rejection precedent (image-quality scope, but the budget standard).
- `AGENTS.md` mutation-testing section — the on-demand/never-CI governance template for paid quality gates.

## Related Research

- `context/archive/2026-08-05-tool-loop-agent/reviews/phase-2-live-evidence.md` — live lens-run outputs incl. the 3-into-1 dedup collapse case.
- `context/archive/2026-08-07-ci-cd-code-review/verification.md` — live-run evidence log (flake tallies, dry-run scorecard).
- No prior `research.md` exists for the eval topic; this document is the first.

## Open Questions

1. **Harvest urgency**: `packages/code-reviewer/.review-out/{review.json,comment.md}` (the 7-finding dry-run scorecard) is gitignored and overwritten by any local `npm run review` — copy into `context/changes/code-review-evals/` (e.g. `fixtures/`) before it's lost. Similarly, PR #117's patch + sticky comment should be captured now (fetchable today; artifacts age out and branches are deleted).
2. **Determinism knobs**: add optional `temperature`/`providerOptions` plumbing to `createReviewer`/`createJudge` (small source change), or accept provider defaults for v1 of the harness?
3. **Usage/cost surface**: stop discarding `result.usage` (thread it into `ReviewResult`/`JudgeResult` or expose via the returned `agent`) so providers can populate promptfoo's `tokenUsage`/`cost` — in-scope for this change or deferred?
4. **Model candidate list + budget**: which finder candidates (glm-4.6 baseline vs. which cheap/mid OpenRouter models?) and judge candidates (sonnet-5 baseline vs. ?); expected cost per full matrix run; how many ground-truth cases is enough signal (the defect taxonomy in `.github/ai-review-rules.md` suggests ~8-12 seeded cases across IDOR/RLS/zod/error-shape/cn()/secrets/tests/docs).
5. **Where results live**: promptfoo's SQLite history is local-only — decide what gets committed (eval configs + fixtures + a results snapshot per decision? the F3 decision record needs citable numbers).
6. **F3 acceptance criteria**: what collapse-rate / duplicate-noise threshold flips the identity decision? Should be fixed before running, not after seeing the numbers.
