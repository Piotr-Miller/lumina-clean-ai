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

## Project: Astro + Supabase + Cloudflare

Scaffolded from `10x-astro-starter`. The sections below describe the application that lives in `src/`, `public/`, `supabase/`, etc.

### Product

LuminaClean AI — night/low-light photo denoise + exposure-correction MVP. Two engines behind a Strategy toggle: cloud AI (Bread on Replicate via async pipeline: signed upload → DB webhook → Edge Function → Replicate prediction → webhook callback → Supabase Realtime push) and a local Canvas fallback (gamma + Gaussian blur). Cloud is auth-gated and rate-limited (20 ops/user/24h via SQL on RLS-gated tables). See @idea-notes.md for full MVP scope and explicit non-goals.

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

## Repository status

This repository is a **10xDevs course workspace** that has been bootstrapped with an Astro 6 application (Supabase + Cloudflare Workers). Two layers of artifacts coexist:

- **Course artifacts** managed by `@przeprogramowani/10x-cli`:
  - `skills-lock.json` — pins the skills fetched from the course CLI (source: `przeprogramowani/10x-cli` on GitHub) with content hashes.
  - `.claude/skills/<name>/SKILL.md` — skill bundles pulled in by `10x get`.
- **Application code** scaffolded from `10x-astro-starter` — see "Project: Astro + Supabase + Cloudflare" above for commands, architecture, and conventions. Bootstrap audit trail lives at `context/changes/bootstrap-verification/verification.md`.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
