# Code Reviewer ToolLoopAgent Refactor — Implementation Plan

## Overview

Convert `packages/code-reviewer/src/index.ts` from a single-file demo into a
modular, importable code-review library built on the AI SDK's `ToolLoopAgent`
(`ai@7.0.52` + `@openrouter/ai-sdk-provider@3.0.0` + `zod@4.4.3`), exporting a
reviewer **factory** that promptfoo evals can consume in a later change. The
multi-agent seams (lens, review unit, injected source provider, mergeable
findings) are designed in but deliberately left unexercised — this change ships
a clean **single-agent baseline**.

## Current State Analysis

- `packages/code-reviewer/src/index.ts` (~60 lines) mixes five concerns:
  module-level env validation with `process.exit(1)`, OpenRouter provider
  construction, the `reviewSchema` zod schema, inline instructions/prompt, and
  a top-level-await demo run. Importing the module today runs the demo.
- Uses the current v7 API correctly (`generateText` + `Output.object`,
  `instructions` — not the deprecated `system`), verified against the bundled
  docs in `node_modules/ai/docs/`. `ToolLoopAgent` accepts the same options
  (`model`, `instructions`, `tools`, `output`, `stopWhen`) and
  `agent.generate({ prompt })` returns the typed `output`
  (`node_modules/ai/docs/03-agents/02-building-agents.mdx:296-314`).
- The package is standalone (own `package.json`, `tsconfig.json`,
  `node_modules`) but the **root** repo graph currently swallows it:
  root `tsconfig.json:3` includes `**/*` without excluding `packages`, and
  `eslint.config.js` has no `packages/**` ignore. The root `npm run typecheck`
  runs in the **pre-push hook** and lint-staged runs root ESLint on staged
  `*.ts` in the **pre-commit hook** — same failure class as the
  "Deno Edge Functions must be excluded from the Astro tsc/eslint graph"
  lesson (`context/foundation/lessons.md`).
- Root `vitest.config.ts:9` includes only `tests/**/*.test.ts` — package tests
  will NOT leak into root test runs. No change needed there.
- **No existing gate covers the package** (Codex plan-review F1): CI
  (`.github/workflows/ci.yml`) installs only the root lockfile and never enters
  `packages/code-reviewer`; pre-push runs root typecheck + unit tests only; the
  package has `typecheck` but no lint script. Excluding it from the root graphs
  without compensation would leave it with no durable quality gate at all.
- Working `.env` with `OPENROUTER_API_KEY` exists locally (live-smoke-tested
  2026-08-05); `.env.example` documents it.

## Desired End State

`packages/code-reviewer` is a library-first package:

- `import { createReviewer } from "./src/index.ts"` works with **zero
  import-time side effects** (no env reads, no network, no process.exit).
- `createReviewer({ lens: "security" }).review({ kind: "file", path, content })`
  returns a `ReviewResult` whose findings carry stable file+line identity.
- `npm run dev` still gives the friendly runnable demo (moved to
  `src/demo.ts`), `npm test` runs hermetic unit tests, `npm run typecheck`
  passes, and the root repo's typecheck/lint/hooks are unaffected by the
  package's existence.

### Key Discoveries:

- `ToolLoopAgent` constructor accepts `generateText` settings incl. `output`
  and `stopWhen: isStepCount(n)`; default loop cap is 20 steps
  (`node_modules/ai/docs/03-agents/02-building-agents.mdx:215`).
- Tools are declared with `tool({ description, inputSchema, execute })`; the
  execute function can close over factory options — that closure is the
  source-provider injection point.
- v7 renamed `system` → `instructions` (deprecated alias remains); structured
  output is `output: Output.object({ schema })` and the result exposes
  `.output` typed from the zod schema.
- Root graphs must exclude the package (tsconfig `exclude`, eslint `ignores`)
  — mirrors the existing `supabase/functions` exclusions at
  `tsconfig.json:4` and `eslint.config.js:100`. The lesson's **second half**
  applies too: excluded code needs a compensating dedicated check (the Edge
  Function got `deno check` in CI) — here, package-local lint + a dedicated CI
  job. Exclusions are scoped to `packages/code-reviewer` (not a blanket
  `packages/**`) so any future package must opt out — and compensate —
  explicitly.
- Prettier CRLF lesson applies: verify lint on touched files only; never run
  repo-wide `lint:fix` as part of this change.

## What We're NOT Doing

- **No promptfoo config, eval harness, or eval scripts** — explicitly out of
  scope (next change).
- **No multi-agent orchestration, fan-out, router, or verifier** — the seams
  are exported but nothing calls them in parallel. Future direction is
  recorded in `change.md`.
- **No CLI** — `demo.ts` stays a demo, not an argv-driven tool.
- **No built-in fs/git tools** — the agent's context tool only sees what the
  injected source provider exposes; the demo wires a trivial provider.
- **No mocked-model agent tests** — unit tests cover pure logic only.
- **No repo-wide lint/format normalization** (CRLF lesson).
- **No npm workspaces** (Codex F1 Fix B rejected) — merging the package into
  the root dependency graph has Astro/Cloudflare install+build blast radius
  this change doesn't need; the package stays standalone with its own gates.
- **No pre-push additions** — package checks are CI-only (gate-placement
  decision); `.husky/pre-push` is untouched.

## Implementation Approach

Three phases, isolation first: (1) fence the root repo's tsc/eslint graphs off
from `packages/code-reviewer` AND stand up the compensating package-local
gates (lint + typecheck) so the git hooks stay green while the package churns
and the excluded code is never gate-less; (2) extract modules and build the
`ToolLoopAgent` factory with the agreed seams; (3) pin the seam contracts
(finding keys, merge, schemas, prompts) with hermetic vitest tests inside the
package and wire the dedicated CI job (the remote gate, CI-only by decision).

Decisions locked during planning (all ⭐-recommended options accepted):
injected read-only context tool · optional lens defaulting to `general` ·
severity + lens-aligned category + file/line fields with derived stable key ·
pure-barrel `index.ts` + `demo.ts` · vitest for pure logic.

## Critical Implementation Details

- **Import-time purity is the load-bearing constraint.** promptfoo will import
  the barrel; any module-level `process.env` read, zod parse, or provider
  construction breaks eval runs with confusing errors. All env resolution
  happens lazily inside `createReviewer` (or `resolveConfig`) and **throws**
  (never `process.exit`) — only `demo.ts` may exit the process.
- **Phase ordering matters for the git hooks.** Until root tsconfig/eslint
  exclude `packages/code-reviewer`, committing package `.ts` files triggers
  root typed ESLint on them (pre-commit) and root `tsc` compiles them
  (pre-push). Land Phase 1 before any Phase 2 file is committed.
- **Line-number semantics for stable keys**: for `file` and `diff` units the
  model reports lines as given; for `hunk` units the prompt must state the
  hunk's `startLine` so reported lines are absolute file lines, not
  hunk-relative — otherwise keys from different agents reviewing different
  units of the same file can't merge.

---

## Phase 1: Root-Graph Isolation + Compensating Package Gates

### Overview

Fence the root Astro repo's typecheck/lint graphs off from
`packages/code-reviewer` — and, per the exclusion lesson's second half,
stand up the package's own local gates (lint alongside the existing
typecheck) in the same phase. The remote (CI) gate lands in Phase 3 once the
test script it runs exists. Gate placement decision: **CI-only**, not
pre-push (pre-push stays fast and must not fail on machines without the
package's `node_modules`).

### Changes Required:

#### 1. Root TypeScript graph

**File**: `tsconfig.json` (repo root)

**Intent**: Keep the root `tsc --noEmit` (pre-push hook, CI) from compiling
the package's differently-configured module graph.

**Contract**: Add `"packages/code-reviewer"` to the existing `exclude` array
(alongside `supabase/functions`) — scoped, not `packages/**`, so a future
package's exclusion is an explicit decision paired with its own gates. The
package keeps its own `tsconfig.json`.

#### 2. Root ESLint graph

**File**: `eslint.config.js` (repo root)

**Intent**: Keep root typed linting (lint-staged pre-commit, `npm run lint`)
off package files that live outside the root tsconfig project.

**Contract**: Add `{ ignores: ["packages/code-reviewer/**"] }` next to the
existing `supabase/functions/**` ignore block, with a one-line comment
mirroring the existing rationale AND naming the compensating gate (package
has its own eslint config + CI job — see the `deno check` precedent).

#### 3. Package-local ESLint

**File**: `packages/code-reviewer/eslint.config.js`

**Intent**: The compensating lint gate for the excluded graph — the package
owns its lint story.

**Contract**: Minimal flat config: `eslint` + `typescript-eslint`
type-checked recommended preset over `src/**/*.ts`, wired to the package's
own `tsconfig.json` (`projectService`). No prettier plugin (root lint-staged
already formats `json/md`; `.ts` formatting stays out of scope here).

#### 4. Package scripts + dev dependencies

**File**: `packages/code-reviewer/package.json`

**Intent**: Make the lint gate runnable and pin its toolchain.

**Contract**: devDependencies += `eslint`, `typescript-eslint` (latest);
scripts += `"lint": "eslint ."`.

### Success Criteria:

#### Automated Verification:

- Isolation is mechanically proven: `npx tsc --listFilesOnly` at repo root lists **zero** paths under `packages/code-reviewer` (F2 fix — "exit 0" alone proves nothing since root typecheck already passes with the package included)
- Root ESLint ignores the package: `npx eslint packages/code-reviewer/src/index.ts` from repo root reports the file as ignored (warning, exit 0)
- Root typecheck still passes: `npm run typecheck` (repo root) exits 0
- Compensating lint gate is green: `npm run lint` inside `packages/code-reviewer` exits 0
- Package typecheck still passes: `npm run typecheck` inside `packages/code-reviewer` exits 0

#### Manual Verification:

- (none — proceed directly to Phase 2 once automated checks pass)

---

## Phase 2: Modular Extraction + ToolLoopAgent Factory

### Overview

Split `index.ts` into focused modules and rebuild the reviewer on
`ToolLoopAgent` with the agreed seams: lens, review unit, injected source
provider, factory export, pure barrel, relocated demo.

### Changes Required:

#### 1. Schemas module

**File**: `packages/code-reviewer/src/schemas.ts`

**Intent**: Single home for all zod schemas + inferred types — the shared
vocabulary every future agent/orchestrator/eval speaks.

**Contract**: Exports:

- `lensSchema = z.enum(["general", "security", "performance", "correctness", "style"])` and `type Lens`
- `severitySchema = z.enum(["critical", "major", "minor", "nit"])` and `type Severity`
- `categorySchema = z.enum(["security", "performance", "correctness", "style"])` and `type Category` (no `general` — every finding attributes a concrete dimension; the general lens may emit any category)
- `findingSchema`: `{ file: string(min 1), startLine?: int ≥1, endLine?: int ≥1, severity, category, description, suggestion }` with `.describe()` annotations guiding the model (file = path as given in the review unit; startLine = absolute file line)
- `reviewResultSchema`: `{ summary: string, findings: findingSchema[] }` and `type ReviewResult`, `type Finding`
- `reviewUnitSchema = z.discriminatedUnion("kind", ...)` over `{ kind: "diff", diff }`, `{ kind: "file", path, content }`, `{ kind: "hunk", path, content, startLine }` and `type ReviewUnit`

#### 2. Findings seam utilities

**File**: `packages/code-reviewer/src/findings.ts`

**Intent**: The mergeable-findings seam: stable identity + deterministic merge,
pure functions, no AI SDK imports. Nothing in this change fans out — these
exist so multi-agent later is additive.

**Contract**:

- `findingKey(f: Finding): string` → `` `${f.file}:${f.startLine ?? 0}` `` (file-level findings key to line 0)
- `mergeFindings(...lists: Finding[][]): Finding[]` → concatenates, dedups by `findingKey` + `category` (same key + same category = duplicate; keep the higher-severity one), returns sorted by file, then startLine, then category for deterministic output

#### 3. Prompts module

**File**: `packages/code-reviewer/src/prompts.ts`

**Intent**: All model-facing text in one place so prompt iterations (and later
promptfoo prompt variants) never touch agent wiring.

**Contract**:

- `buildInstructions(lens: Lens): string` — shared reviewer core (strict-but-pragmatic tone from the current file, report-only-worthwhile-issues rule, "attribute every finding to file + absolute line from the review unit", "use getFileContext when surrounding context would change the verdict") + a per-lens focus paragraph (record keyed by `Lens`)
- `buildPrompt(unit: ReviewUnit): string` — renders each unit kind; the `hunk` renderer states the absolute `startLine` so the model reports absolute lines (see Critical Implementation Details)

#### 4. Config module

**File**: `packages/code-reviewer/src/config.ts`

**Intent**: Lazy, throwing env/config resolution usable from library context —
replaces today's module-level `safeParse` + `process.exit`.

**Contract**: `resolveConfig(overrides?: { apiKey?: string; model?: string }): { apiKey: string; model: string }` —
overrides win; falls back to `process.env.OPENROUTER_API_KEY` /
`process.env.OPENROUTER_MODEL`; default model `anthropic/claude-sonnet-5`
(verified live in OpenRouter's catalog); throws `Error` with the current
actionable message (openrouter.ai/keys pointer) when no key is resolvable.
No module-level env reads.

#### 5. Reviewer factory

**File**: `packages/code-reviewer/src/reviewer.ts`

**Intent**: The heart of the change — `createReviewer` builds a configured
`ToolLoopAgent` with the injected context tool and returns a reusable reviewer.

**Contract**:

- `type SourceProvider = (req: { path: string; startLine?: number; endLine?: number }) => string | Promise<string>`
- `type ReviewerOptions = { lens?: Lens; model?: string; apiKey?: string; source?: SourceProvider; maxSteps?: number }`
- `createReviewer(options?: ReviewerOptions): { review(unit: ReviewUnit): Promise<ReviewResult>; agent: ToolLoopAgent }` — a factory, never a singleton; each call constructs a fresh agent.
- Internals: `resolveConfig` → `createOpenRouter({ apiKey })` → `new ToolLoopAgent({ model, instructions: buildInstructions(lens ?? "general"), output: Output.object({ schema: reviewResultSchema }), stopWhen: isStepCount(maxSteps ?? 8), tools: { getFileContext } })`. The `getFileContext` tool (`tool({ description, inputSchema: zod object mirroring SourceProvider req, execute })`) delegates to `options.source` and returns a fixed "No additional context available." string when no provider was injected — the tool must always exist and respond gracefully so prompts/evals are stable with or without a provider.
- `review(unit)` = `agent.generate({ prompt: buildPrompt(unit) })` → return `result.output` (already schema-validated by the SDK).

#### 6. Barrel entry point

**File**: `packages/code-reviewer/src/index.ts`

**Intent**: Pure re-export surface for library consumers (promptfoo next
change). Zero import-time side effects.

**Contract**: Re-exports: `createReviewer`, `SourceProvider`, `ReviewerOptions`
(reviewer.ts); all schemas + types (schemas.ts); `findingKey`, `mergeFindings`
(findings.ts); `buildInstructions`, `buildPrompt` (prompts.ts);
`resolveConfig` (config.ts). Nothing else — no executable statements.

#### 7. Demo runner

**File**: `packages/code-reviewer/src/demo.ts`

**Intent**: Preserve today's runnable UX (`npm run dev` reviews the buggy
sample and prints findings) on top of the new library.

**Contract**: Imports from `./index.ts` only (proves the barrel suffices).
Creates a reviewer with default lens and a trivial in-memory `SourceProvider`,
and reviews a **simulated unified diff** (`{ kind: "diff" }`) that introduces
the buggy `getUserAge` sample — a hard-coded fixture, agent-generated once
(course-task requirement: basic review prompt over a simulated diff). The
`SourceProvider` serves the full post-change file so the model can pull
surrounding context through `getFileContext`, exercising the tool loop.
Prints summary + findings including `findingKey` prefixes. Catches config
errors → friendly message + `process.exit(1)` (process-exit lives ONLY here).

#### 8. Package scripts

**File**: `packages/code-reviewer/package.json`

**Intent**: Point runnable scripts at the demo; keep typecheck.

**Contract**: `dev`/`start` → `tsx --env-file-if-exists=.env src/demo.ts`.
(`test` script lands in Phase 3.)

### Success Criteria:

#### Automated Verification:

- Package typecheck passes: `npm run typecheck` in `packages/code-reviewer` exits 0
- Barrel import is side-effect-free: with `OPENROUTER_API_KEY` unset, `npx tsx -e "import('./src/index.ts').then(() => console.log('ok'))"` prints `ok` and exits 0 (no env error, no exit 1)
- Demo still guards env: `npm run dev` with no `.env`/key exits 1 with the actionable missing-key message

#### Manual Verification:

- Live demo run with the real key (`npm run dev`) returns a schema-valid review of the sample; findings carry `file` + `startLine` and sensible `category` values
- A second run with `lens: "security"` (temporary demo tweak or scratch script) produces visibly security-focused output — confirms the lens parameter reaches the instructions

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation of the live-run checks
before proceeding to Phase 3.

---

## Phase 3: Seam-Contract Unit Tests + CI Gate

### Overview

Pin the contracts that the future eval/orchestration work builds on, with
hermetic vitest tests inside the package (no LLM calls, no env) — then wire
the compensating **remote** gate: a dedicated CI job running the package's
full check suite (deferred to this phase so the `test` script it invokes
exists).

### Changes Required:

#### 1. Vitest dev dependency + script

**File**: `packages/code-reviewer/package.json`

**Intent**: Package-local test runner; root vitest doesn't see these files
(root include is `tests/**` only).

**Contract**: devDependency `vitest` (latest); script `"test": "vitest run"`.
No vitest config file unless needed — default include covers
`src/**/*.test.ts`.

#### 2. Findings seam tests

**File**: `packages/code-reviewer/src/findings.test.ts`

**Intent**: Lock stable-key derivation and merge semantics — the contract
multi-agent merging will rely on.

**Contract**: Cover: key format for line-bearing and file-level findings;
merge dedups same key+category keeping higher severity; different categories
at the same key both survive; deterministic output ordering.

#### 3. Schema tests

**File**: `packages/code-reviewer/src/schemas.test.ts`

**Intent**: Guard the normalized shape promptfoo asserts against.

**Contract**: Valid finding/result/unit fixtures parse; invalid severity,
category, zero/negative startLine, and unknown unit kind are rejected.

#### 4. Prompt + factory tests

**File**: `packages/code-reviewer/src/prompts.test.ts`, `packages/code-reviewer/src/reviewer.test.ts`

**Intent**: Prove lens selection and unit rendering without network; prove the
factory constructs (and fails) correctly.

**Contract**: `buildInstructions` output differs per lens and embeds the lens
focus; `buildPrompt` for a `hunk` embeds the absolute `startLine`;
`createReviewer({ apiKey: "test-key" })` returns a reviewer exposing `review`
and `agent` without any network call; `createReviewer()` with no key in env
throws the actionable error (test must scrub `process.env.OPENROUTER_API_KEY`
via vitest env stubbing to stay hermetic on machines with a real `.env`
loaded shell).

#### 5. Dedicated CI job (compensating remote gate)

**File**: `.github/workflows/ci.yml`

**Intent**: The durable quality gate for the excluded package (Codex F1,
Fix A) — CI-only per the gate-placement decision; pre-push is untouched.

**Contract**: New independent job `code-reviewer` (push + PR, same triggers
as `ci`): checkout → setup-node from `.nvmrc` with npm cache keyed on
`packages/code-reviewer/package-lock.json` → `npm ci` → `npm run lint` →
`npm run typecheck` → `npm test`, all with
`working-directory: packages/code-reviewer` (defaults block). Deliberately
**NOT** added to the `deploy` job's `needs` — the package is not part of the
deployed Worker, and a red package job must not block app deploys. Lives
under the existing workflow-level `concurrency` block like every other job.

### Success Criteria:

#### Automated Verification:

- Package tests pass: `npm test` in `packages/code-reviewer` exits 0
- Package typecheck passes: `npm run typecheck` exits 0
- Root repo unaffected: `npm run typecheck` and `npm run test:unit` at repo root exit 0
- CI `code-reviewer` job passes on the change's PR (lint + typecheck + test, clean `npm ci` from the package lockfile)

#### Manual Verification:

- Confirm on the PR's checks page that `deploy` does NOT wait on `code-reviewer` (needs unchanged)

---

## Testing Strategy

### Unit Tests:

- Pure-logic only (Phase 3): finding keys, merge semantics, schema
  validation, prompt/lens selection, factory construction + config errors.
- Deliberately no mocked-model agent-loop tests (decision: mock APIs churn;
  promptfoo covers behavior next change).

### Integration Tests:

- None automated in this change — the live path is covered by the manual demo
  smoke (Phase 2) and by promptfoo in the follow-up change.

### Manual Testing Steps:

1. `npm run dev` in `packages/code-reviewer` with the real key → schema-valid
   review of the sample, findings show `file:line` keys.
2. Temporarily switch the demo (or a scratch call) to `lens: "security"` →
   output focus visibly shifts.
3. Delete/rename `.env` → `npm run dev` exits 1 with the friendly key message.

## Performance Considerations

`stopWhen: isStepCount(8)` (configurable via `maxSteps`) caps loop cost well
under the SDK's default 20 — a review with one context tool rarely needs more
than 2-3 steps; the cap is a cost guard for future eval batches.

## Migration Notes

Nothing depends on the current `reviewCode` export (package is untracked, one
session old). The demo's user-visible behavior (`npm run dev`) is preserved;
`reviewCode(code: string)` is superseded by
`createReviewer().review({ kind: "file", ... })` with no compatibility shim.

## References

- Change doc (incl. future direction): `context/changes/tool-loop-agent/change.md`
- Current implementation: `packages/code-reviewer/src/index.ts`
- ToolLoopAgent guide: `packages/code-reviewer/node_modules/ai/docs/03-agents/02-building-agents.mdx`
- ToolLoopAgent reference: `packages/code-reviewer/node_modules/ai/docs/07-reference/01-ai-sdk-core/16-tool-loop-agent.mdx`
- Root-graph exclusion precedent: `tsconfig.json:4`, `eslint.config.js:100`, and the Deno Edge Functions lesson in `context/foundation/lessons.md`
- Plan review: Codex deep review 2026-08-05 (F1 critical — compensating gates, Fix A adopted CI-only; F2 warning — mechanical isolation proof). Both incorporated in this revision.

## Addenda

Approved deviations from the locked contracts, per impl-review-phase-2 triage
(2026-08-06; see `reviews/impl-review-phase-2.md`):

- **Factory result** additionally exposes `lens` and `model` (read-only
  resolved values; the demo prints them, promptfoo will want them for run
  labeling). (F4)
- **Barrel** additionally exports `DEFAULT_MODEL`, `ConfigOverrides`,
  `ResolvedConfig`, and `Reviewer` — config surface embedders need. (F4)
- **Demo** accepts one positional lens argument (`npm run dev -- security`) as
  the sanctioned affordance for manual criterion 2.5; this is a demo argument,
  not CLI design — the "No CLI" boundary otherwise stands. (F5)
- **Review-fix surface** from the same triage: `normalizeFindings` exported
  from the barrel (F3) and `ReviewCallOptions` (`abortSignal`/`timeoutMs`) on
  `review()` (F2).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Root-Graph Isolation + Compensating Package Gates

#### Automated

- [x] 1.1 Root `tsc --listFilesOnly` lists zero `packages/code-reviewer` paths — d8e479c
- [x] 1.2 Root ESLint reports package file as ignored (exit 0) — d8e479c
- [x] 1.3 Root `npm run typecheck` exits 0 — d8e479c
- [x] 1.4 Package `npm run lint` exits 0 — d8e479c
- [x] 1.5 Package `npm run typecheck` exits 0 — d8e479c

### Phase 2: Modular Extraction + ToolLoopAgent Factory

#### Automated

- [x] 2.1 Package `npm run typecheck` exits 0 — dac4626
- [x] 2.2 Barrel import side-effect-free without env key — dac4626
- [x] 2.3 Demo without key exits 1 with actionable message — dac4626

#### Manual

- [x] 2.4 Live demo run returns schema-valid review (file + startLine + category present) — dac4626
- [x] 2.5 `lens: "security"` run visibly shifts review focus — dac4626

### Phase 3: Seam-Contract Unit Tests + CI Gate

#### Automated

- [x] 3.1 Package `npm test` exits 0
- [x] 3.2 Package `npm run typecheck` exits 0
- [x] 3.3 Root `npm run typecheck` + `npm run test:unit` exit 0
- [ ] 3.4 CI `code-reviewer` job green on the PR

#### Manual

- [ ] 3.5 `deploy` job `needs` confirmed unchanged (does not wait on `code-reviewer`)
