# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Hard rules

- **RLS** — always enable Row Level Security on new Supabase tables with granular per-operation, per-role policies.
- **API routes** — must export `const prerender = false`. Use uppercase `GET`, `POST` exports. Validate input with zod.
- **API errors** — return `{ error: { code: string, message: string } }`. `code` is snake_case (e.g. `invalid_body`, `internal_error`). HTTP 400 for validation, 500 for unexpected. Do NOT include `status` in the body.
- **Path alias** — `@/*` maps to `./src/*` (tsconfig paths).
- **Tailwind class merging** — use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **Supabase migrations** — naming format `YYYYMMDDHHmmss_short_description.sql` under `supabase/migrations/`.
- **Shared types** — entities, DTOs go in `src/types.ts`.
- **React** — no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Skills must not write to `context/archive/`**. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

## Mutation testing

Repo uses Stryker (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`) for **selective** mutation testing on risk-critical modules — a quality gate run on demand, never in CI.

- **Run it only** for code covered by the current change or a risk from `context/foundation/test-plan.md` §4. Prefer narrowed scope: `npx stryker run --mutate "src/lib/services/photo-job.service.ts"` or a line range `--mutate "path/to/file.ts:12-48"`. `npm run test:mutation` runs the default scope (`src/lib/**`).
- **Config:** `stryker.config.json`. Mutation runs use `vitest.config.stryker.ts`, which excludes `jobs.rls.test.ts` (needs live local Supabase — too slow per mutant). HTML report: `reports/mutation/mutation.html`.
- **Do not chase 100%.** Review survived mutants one by one: add an assertion only when the mutant represents a user-visible or business-relevant bug. Ignore equivalent/cosmetic mutants consciously — pinning implementation detail to kill a cosmetic mutant is itself a vibe test.

## Project: Astro + Supabase + Cloudflare

Scaffolded from `10x-astro-starter`. The sections below describe the application that lives in `src/`, `public/`, `supabase/`, etc.

### Product

LuminaClean AI — night/low-light photo denoise + exposure-correction MVP. Two engines behind a Strategy toggle: cloud AI (Bread on Replicate via async pipeline: signed upload → DB webhook → Edge Function → Replicate prediction → webhook callback → Supabase Realtime push) and a local Canvas fallback (gamma + Gaussian blur). Cloud is auth-gated and protected by a global daily cap (across all users) on Cloud AI ops — enforced in SQL on RLS-gated tables and configurable via `CLOUD_DAILY_CAP` (default 50, reset 00:00 UTC; `0` = kill-switch). See @idea-notes.md for full MVP scope and explicit non-goals.

### Commands

- `npm run dev` — start Astro dev server (Node/Vite — **not** the Cloudflare workerd runtime; use `npm run build && npx wrangler dev` for workerd fidelity)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

### Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

#### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. (See Hard rules for the `const prerender = false` requirement on API routes.)

#### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

#### Key conventions

- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/<feature>.service.ts` for extracted business logic, e.g. `src/lib/services/photo-upload.service.ts`).

(See Hard rules above for `cn()` usage, the `@/*` path alias, API route conventions, Supabase migration naming, `types.ts`, and React directives.)

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)
- **Production manual config** (custom domain + DNS, Supabase auth URLs + custom SMTP, Resend, GitHub secrets) is a **runtime prerequisite for the MVP, not in the repo** — the deployed Worker serves, but the MVP (accounts, auth email, branded domain) does not function without it. Full required setup: `context/foundation/production-config.md`.

### CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint + build on every push and PR to master. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step.

## 10x-cli profile & workflow

- Active profile is **Claude Code**: skills live under `.claude/skills/` and this `CLAUDE.md` is the canonical rules file. Verify with `10x doctor`. To switch profiles (e.g. Codex CLI under `.agents/`), re-run `10x get <ref> --tool <name>`; the CLI will prompt to migrate existing artifacts.
- Lesson artifacts (skills, prompts, rules, config templates) are managed via the CLI, not edited by hand. `10x list` browses; `10x get <ref>` (e.g. `10x get m1l1`) fetches and applies a bundle; `10x get <ref> --dry-run` previews; `10x doctor` diagnoses auth, API, config, and tool-directory issues.
- Re-fetching a different lesson cleans up artifacts from the previous lesson that aren't in the new one. Hand-editing files under `.claude/skills/` will be overwritten on the next `10x get` for the same lesson.
- **Upstream README is authoritative** for install/usage: `https://raw.githubusercontent.com/przeprogramowani/10x-cli/refs/heads/master/README.md`. If memory and the README disagree, follow the README.
- **Run `10x doctor` before guessing** at CLI failures — it covers auth, API reachability, config, version, and tool-directory presence.
- **Auth is interactive (magic link).** If a shell can't accept input, ask the user to run `10x auth` themselves via the `!` prefix.
- Deeper guidance: `.claude/skills/10x-cli-setup/SKILL.md` (first-time install / re-auth / tool reconfiguration) and `.claude/skills/10x-cli-guide/SKILL.md` (daily-usage reference, troubleshooting matrix, platform tips).

### Archive workflow extensions (durable fallback)

These behaviors were added to `.claude/skills/10x-archive/SKILL.md` (step 6) but live here too because a `10x get` re-fetch can overwrite the managed skill. **When archiving a change** (via `/10x-archive` or equivalent), after the base move + stamp + roadmap-item close, also:

- **Refresh status across the other tracking md files** (best-effort, never blocks): in `context/foundation/roadmap.md` flip the matching **Backlog Handoff** table row to `done` with an `Archived <date> → <archive-path>. Issue #<n>.` note; in `context/foundation/github-issues.md` set the final-mapping **Status** cell for the change to `done` and append a row to its `## Status updates` log (`| date | roadmap-id | #issue | action |`). These follow `github-issues.md`'s own note that issue state should stay in sync with the roadmap `Status` on archive.
- **Sync the matching GitHub issue** (outward-facing → confirm first): resolve the issue number from `github-issues.md` (or `gh issue list`), then **ask once** before mutating; on approval `gh issue close <n> --comment "Archived <date> → <archive-path> (commit <sha>)."`. `gh` failures are non-fatal; never close/comment without explicit consent. Pattern precedent: issues #1–#4 were closed on archive.

## Repository status

This repository is a **10xDevs course workspace** that has been bootstrapped with an Astro 6 application (Supabase + Cloudflare Workers). Two layers of artifacts coexist:

- **Course artifacts** managed by `@przeprogramowani/10x-cli`:
  - `skills-lock.json` — pins the skills fetched from the course CLI (source: `przeprogramowani/10x-cli` on GitHub) with content hashes.
  - `.claude/skills/<name>/SKILL.md` — skill bundles pulled in by `10x get`.
- **Application code** scaffolded from `10x-astro-starter` — see "Project: Astro + Supabase + Cloudflare" above for commands, architecture, and conventions. Bootstrap audit trail lives at `context/changes/bootstrap-verification/verification.md`.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 3

Lesson 3 is about **hooks** — turning the quality gates from Lesson 1 and the tests from Lesson 2 into automatic, deterministic checks that fire while the agent works. A hook runs outside the model, so it survives context compression, instruction changes, and the model "forgetting". The payoff for agentic hooks specifically: a `PostToolUse` check can feed its result back into the agent's context, so the agent fixes trivial errors (formatting, a missing import, a wrong type) on its own in the next iteration instead of you discovering them minutes later.

```
context/foundation/test-plan.md  (§4 Quality Gates: which check, required when)
        │
        ▼  (assign each gate to the cheapest layer that still gives signal)
   per-edit (agent hooks)  →  pre-commit (git hooks)  →  pre-push  →  CI
        │ lint, format, scoped tests          │ staged       │ heavier    │ integration
        ▼
   exit code + stdout  →  additionalContext  →  agent reacts next turn
```

### Task Router — Which layer for this check

| You want to | Do this |
| --- | --- |
| React the instant the agent edits a file | A per-edit hook (`PostToolUse` matcher `Write\|Edit` in Claude Code). Right for fast checks: lint/format, and scoped tests on risk-area files. This is the **only** layer that can hand feedback to the agent mid-session. |
| Run only the tests that depend on the edited file | Parse the path from the hook's stdin (`jq -r .tool_input.file_path`) and run your runner's related-tests mode (`vitest related "$FILE" --run`, `jest --findRelatedTests $FILE`). Gate it on whether the file is a risk area in `test-plan.md`; don't run tests on every helper or config edit. |
| Catch changes that bypassed the agent (manual edits, a teammate's commit) | A pre-commit git hook (Lefthook or Husky+lint-staged) over staged files: lint + typecheck, and tests on staged risk files. |
| Run heavier checks before code leaves the machine | Pre-push: full typecheck or a broader test set. Anything too slow for per-edit moves here. |
| Decide where a given gate belongs | Ask: is it fast enough (a few seconds) for per-edit, or should it wait for commit/push/CI? Slow checks block the agent loop on every edit — push them up a layer. |
| Use the same hook across tools | The trigger → matcher → handler → signal pattern is the same in Cursor, Codex, Windsurf, and Copilot; only the config file and event names change. See the cross-tool table below. |

### Hook lifecycle — the universal pattern

Every tool's hooks follow four steps:

1. **Trigger** — an event in the tool (e.g. the agent just saved a file: `PostToolUse`).
2. **Matcher** — a filter deciding whether this hook runs (tool name like `Write`/`Edit`, file type, or a name pattern).
3. **Handler** — the action that runs, usually a shell command.
4. **Signal** — the result returns to the tool. The exit code says pass/fail; stdout can flow into the agent's context as feedback.

### Exit codes and the feedback loop

- **0** — success; the hook passed, continue.
- **2** — blocking error; the agent sees the feedback and should react.
- **anything else** — non-blocking error; logged, but does not interrupt work.

On a blocking failure, stdout flows into the agent's context (in Claude Code via `additionalContext`, capped at 10,000 characters; other tools have similar mechanisms with their own limits). That is why the agent can self-correct: it sees the concrete message — missing type, unimported module, badly formatted line — not just "something failed".

The boundary: the agent reliably fixes **trivial** corrections on its own. When a test fails because of wrong business logic, the hook surfaces it but the agent may not diagnose the real cause — it says "something is off" and tries a trivial fix. If that does not resolve in one or two tries, the signal comes back to you, and the problem may deserve its own change-id with the full `/10x-new → /10x-research → /10x-plan → /10x-implement` workflow.

### Three local layers (plus CI)

| Layer | Catches | Timing |
| --- | --- | --- |
| Per-edit (agent hooks) | Formatting, simple type errors, failing unit tests on risk files. Only layer that feeds the agent mid-work. | ms–s |
| Pre-commit (git hooks) | What slipped past per-edit: manual edits, files changed outside the hook, checks too slow for per-edit. Operates on staged files. | s |
| Pre-push | Heavier checks before pushing to remote (full typecheck, broader test set). | s–min |
| CI | Integration problems, cross-module dependencies, checks needing infra unavailable locally. | min |

Local layers do **not** replace CI — CI stays the key verification for shared repo state and environments you don't control. But each local layer that catches an error is one fewer CI round-trip. You don't need all layers from day one: start with one per-edit hook (lint) and one commit gate, add layers as you see what escapes. The quality gates in `test-plan.md §4` decide which checks are worth automating and when; a plan may legitimately defer per-edit hooks if the cost/signal ratio isn't there yet.

### Key rules

- Keep per-edit hooks fast. If a check takes more than a few seconds, move it to commit, push, or CI — a slow per-edit hook blocks the agent loop on every edit. Lint/format are ideal per-edit; full typecheck is often a commit gate in larger projects.
- Run scoped tests, not the whole suite, per edit — only tests related to the edited file, and only when that file is a risk area in `test-plan.md`.
- `related` is a subcommand, not a flag (`vitest related`, not `--related`). Use `--run` so the hook terminates instead of entering watch mode.
- `PostToolUse` fires once per tool use; three edits in one turn fire it three times independently — there is no built-in aggregation.
- The git hook tool (Lefthook vs Husky+lint-staged) is an implementation detail; the rule is the same — run checks on staged files before commit. If Husky already works, don't migrate.
- **Context injection is not universal.** Claude Code, Cursor, Codex, and Copilot (in VS Code) can pass a hook's result to the agent; Windsurf cannot — it can block (exit 2) but can't tell the agent what went wrong.

### The same pattern in every tool

| Tool | Events | Handlers | Context injection | Config |
| --- | --- | --- | --- | --- |
| Claude Code | ~30 | command, http, mcp_tool, prompt, agent | yes | `.claude/settings.json` |
| Cursor | ~18 | command, prompt | yes | `.cursor/hooks.json` |
| Codex | 10 | command | yes | `.codex/hooks.json` |
| Windsurf | 12 | command | **no** | `.windsurf/hooks.json` |
| Copilot | ~13 | command, http, prompt | yes (VS Code) | `.github/hooks/*.json` |

### Lesson boundaries

- This lesson configures hooks and local quality layers only. The hook JSON, `lefthook.yml`, and the per-edit/commit/push layering are the scope.
- Do not write E2E tests, configure Playwright/MCP, or run browser scenarios. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test debugging workflow. That is Lesson 5.
- Do not change the risk strategy or quality-gate definitions. That is Lesson 1 (`/10x-test-plan`); read current state with `/10x-test-plan --status`.
- Do not write unit/integration test code from scratch here. That is Lesson 2 — hooks only *run* the tests those lessons produced.
- Do not author CI/CD pipelines. That is Module 1 Lesson 5 / Module 2 Lesson 5; hooks are the local layers in front of CI.

### Paths used by this lesson

- `.claude/settings.json` — hook configuration (`~/.claude/settings.json` global, `.claude/settings.json` project, `.claude/settings.local.json` local overrides). Other tools use their own config file (see the table).
- `lefthook.yml` — pre-commit git hook config (lint + typecheck + tests on `{staged_files}`).
- `context/foundation/test-plan.md` — §4 quality gates decide which checks to automate and at which layer; risk areas decide which edits warrant scoped tests.

<!-- END @przeprogramowani/10x-cli -->
