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
- **When it runs:** on demand, plus a conditional step in `/10x-impl-review` (Step 3 "Verify success criteria") that fires a scoped `stryker run --mutate <file>` **only** when the reviewed change touches a §4 risk module, and surfaces qualifying survived mutants as Safety & Quality findings. This trigger is recorded here too because `10x get` can overwrite the managed skill (`.claude/skills/10x-impl-review/SKILL.md`); if the skill is re-fetched without it, re-add the step from this note.

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

GitHub Actions workflow (`.github/workflows/ci.yml`) — three jobs:

- `ci` (push + PR) — lint, unit tests (`npm run test:unit`), `deno check` on the Edge Function, SSR build. Requires `SUPABASE_URL`/`SUPABASE_KEY` repo secrets for the build step.
- `integration` (push + PR) — full Vitest suite incl. `tests/jobs.rls.test.ts` against an ephemeral local Supabase (Docker). Uses no GitHub secrets (local keys are generated), so it also runs on fork PRs. Supabase Docker images are cached across runs (`actions/cache`) and `supabase start`/`db reset` retry once — anonymous pulls from `public.ecr.aws` get rate-limited on shared runners (see lessons.md).
- `deploy` (push to master only, gated by `needs: [ci, integration]`) — Worker via `wrangler-action` + `enhance` Edge Function via the pinned supabase CLI.

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

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
