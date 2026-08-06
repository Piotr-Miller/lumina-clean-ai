# Code Reviewer ToolLoopAgent Refactor — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

Convert the working single-file `packages/code-reviewer/src/index.ts` into a
modular code-review **library** built on the AI SDK's `ToolLoopAgent`, so a
follow-up change can run promptfoo evals against an importable reviewer
factory. The multi-agent future (per-lens fan-out + verifier) is designed into
the seams now so it becomes additive later — but this change ships a
deliberately clean **single-agent baseline**.

## Starting Point

`src/index.ts` (~60 lines, built and live-smoke-tested 2026-08-05) mixes env
validation with `process.exit`, provider setup, the zod schema, the prompt,
`reviewCode()`, and a top-level demo run — importing it executes the demo.
The package is standalone, but the root repo's tsconfig (`**/*`) and ESLint
currently swallow `packages/**`, which would break the pre-commit/pre-push
hooks once package files are committed.

## Desired End State

`createReviewer({ lens?, model?, source?, ... })` returns a reusable reviewer;
`reviewer.review({ kind: "file" | "diff" | "hunk", ... })` yields a normalized
`ReviewResult` with stable file+line finding keys. `index.ts` is a pure barrel
(side-effect-free import — promptfoo-safe), `npm run dev` still runs the
friendly demo, `npm test` guards the seam contracts, and the root repo's
hooks/graphs are untouched by the package.

## Key Decisions Made

| Decision             | Choice                                                                                                                                               | Why (1 sentence)                                                                                                                                                          | Source                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Agent architecture   | Single `ToolLoopAgent`, seams only                                                                                                                   | Clean baseline under promptfoo first; multi-agent later must be additive, not a rewrite                                                                                   | Task brief             |
| Tool surface         | One read-only `getFileContext` tool backed by a caller-injected `SourceProvider`                                                                     | Real tool loop worth evaluating, yet hermetic for evals; the injection point doubles as an orchestration seam                                                             | Plan Q&A               |
| Lens parameter       | Optional single lens, default `general` (enum: general/security/performance/correctness/style)                                                       | Usable out of the box and exactly the one-lens-per-agent shape fan-out needs                                                                                              | Plan Q&A               |
| Findings schema      | severity (critical/major/minor/nit) + lens-aligned category + file/startLine/endLine → `findingKey` = `file:line`                                    | Severity and lens stay orthogonal, so multi-agent merge keeps provenance and dedups cleanly                                                                               | Plan Q&A               |
| Entry point          | `index.ts` pure barrel; demo moved to `demo.ts`                                                                                                      | promptfoo imports the module — import-time env validation or `process.exit` would break eval runs                                                                         | Plan Q&A               |
| Testing              | Package-local vitest on pure logic only (keys, merge, schemas, prompts, factory)                                                                     | Locks the mergeable-schema contract before evals build on it; no LLM calls, no mock-model churn                                                                           | Plan Q&A               |
| Root-graph isolation | Exclude `packages/code-reviewer` (scoped, not `packages/**`) from root tsconfig + ESLint, phase 1                                                    | Root typecheck runs in pre-push, root ESLint in pre-commit — same failure class as the documented Edge Functions lesson; scoping makes future packages opt out explicitly | Plan research + review |
| Compensating gates   | Package-local ESLint (typed flat config) + dedicated CI job (`npm ci` + lint + typecheck + test); CI-only, pre-push untouched; not in `deploy.needs` | Excluded code needs its own durable gate (the lesson's second half — `deno check` precedent); pre-push must not require package node_modules                              | Codex review F1        |
| Monorepo strategy    | Standalone package — npm workspaces rejected                                                                                                         | Workspace merge has Astro/Cloudflare install+build blast radius with zero need here                                                                                       | Codex review F1        |
| Config handling      | Lazy `resolveConfig()` that throws; exits only in `demo.ts`                                                                                          | Library code must be embeddable; only the executable owns the process                                                                                                     | Plan research          |

## Scope

**In scope:** module split (schemas/findings/prompts/config/reviewer/demo),
`createReviewer` factory on `ToolLoopAgent`, lens + review-unit + provider
seams, stable finding keys + `mergeFindings` seam utility, root-graph
exclusions + compensating package gates (local ESLint, dedicated CI job),
package-local vitest for pure logic.

**Out of scope:** promptfoo/eval environment, any orchestration/fan-out/
verifier, CLI, built-in fs/git tools, mocked-model tests, repo-wide
lint/format normalization, npm workspaces, pre-push hook changes.

## Architecture / Approach

`schemas.ts` (zod vocabulary) ← `findings.ts` (key/merge seam) ←
`prompts.ts` (lens instructions + unit rendering) ← `reviewer.ts`
(`createReviewer` → `ToolLoopAgent` with `getFileContext` tool delegating to
the injected `SourceProvider`) ← `index.ts` (pure barrel) ← `demo.ts`
(runnable, owns process exit). Future multi-agent = plain TypeScript looping
`createReviewer` per lens + `mergeFindings` — no rewrite.

## Phases at a Glance

| Phase                           | What it delivers                                                                                            | Key risk                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Isolation + Package Gates    | Scoped root tsconfig/eslint excludes; package-local ESLint + lint script; hooks stay green                  | Missing a graph (e.g. lint-staged) and blocking later commits; verification must be mechanical (`tsc --listFilesOnly`), not "exit 0" |
| 2. Modular Extraction + Factory | The library: modules, factory, seams, barrel, demo                                                          | Import-time side effects sneaking back in; hunk line-number semantics breaking stable keys                                           |
| 3. Unit Tests + CI Gate         | Vitest locking keys/merge/schemas/prompts/factory; dedicated `code-reviewer` CI job (not in `deploy.needs`) | Tests accidentally depending on a real `.env` (must scrub env); CI job accidentally gating app deploys                               |

**Prerequisites:** none beyond the existing package (deps already installed); live key only needed for Phase 2 manual smoke.
**Estimated effort:** ~1 session; Phase 1 minutes, Phase 2 the bulk, Phase 3 small.

## Open Risks & Assumptions

- `ToolLoopAgent` + `Output.object` + a tool in the same run is assumed to
  behave like the docs describe (structured output counts as a step); the
  Phase 2 manual smoke is the checkpoint.
- Model compliance with the richer schema (category + lines) is assumed
  adequate for the baseline; promptfoo (next change) measures it properly.
- `anthropic/claude-sonnet-5` remains the default model; overridable via env
  or factory option, so churn is a config change.

## Success Criteria (Summary)

- Importing the barrel with no env configured is side-effect-free; the factory
  - `review()` round-trip returns schema-valid, stable-keyed findings.
- Root repo hooks (typecheck, lint-staged, unit tests) behave exactly as
  before the package existed — proven mechanically, not by "exit 0".
- Package `npm run lint` + `npm test` + `npm run typecheck` green locally and
  in the dedicated CI job; live demo smoke passes with lens visibly steering
  the review.
