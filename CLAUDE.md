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

## 10xDevs AI Toolkit - Module 3, Lesson 2

Lesson 2 is about **writing tests that actually protect code** — not just maximise coverage. The oracle problem and vibe-testing anti-patterns explain why LLM-generated tests fail on real code; the risk-first quality contract from Lesson 1 is the fix.

```
context/foundation/test-plan.md (§3 Phased Rollout)
        │
        ▼  (one rollout phase at a time)
   /10x-research  ──►  research.md  (oracle source: what code should do, not what it does)
        │
        ▼
   /10x-plan  ──►  plan.md  (cost × signal, two-layer strategy, ordered phases)
        │
        ▼
   /10x-implement  or  /10x-tdd   ──►  working tests + §6 cookbook update
```

`/10x-tdd` is an **optional test-first mode**, not a replacement for the chain. It reads the same `plan.md`, writes to the same `## Progress` section, and covers the same phases as `/10x-implement`. Use it only when you can name the first failing assertion before writing any code.

### Task Router — Where to start

| Skill / Prompt | Use it when |
| --- | --- |
| `/10x-research` | Before writing any test for a risk. Research produces the oracle — what behaviour a test must prove — from sources (PRD, tech-stack, docs), not from the implementation shape. Also reveals whether a risk is already covered or has two separate faces (one safe, one real). |
| `/10x-plan` | Research is done. Plan decomposes the risk into ordered phases: environment setup first, then rules that depend on it, then hermetic stubs for failures that real infra cannot trigger, then cookbook update. Each phase names the behaviour it asserts and the regression it catches. |
| `/10x-implement` | Default executor for plan phases. Use for environment setup, existing code, scaffolding, and any phase where you cannot define a red test before writing code. |
| `/10x-tdd` | Optional. Use instead of `/10x-implement` for a phase where you can name the first red test in one sentence. Agent writes the failing test first, then the minimal code to green it, then refactors. Stops at the assertion before touching the implementation — that pause is the point. |
| `m3l2-ad-hoc-testing` prompt | You have a single file and want tests now, without the full research→plan→implement cycle. The prompt forces oracle-from-sources (reads PRD + TECH_STACK before asserting), behavioural assertions, edge cases from risk, and a regression table. Use it knowing you are trading depth for speed. |

### When to use `/10x-tdd` vs `/10x-implement`

The deciding question: *Can you name the first red test in one sentence?*

Good conditions for `/10x-tdd`:
- "promuje wyłącznie drafty w stanie `accepted`, a `pending`/`rejected` nigdy nie trafiają do talii"
- "zwraca `ok: true` i loguje `orphan_review_state`, gdy upsert stanu powtórek padnie w trakcie zapisu"
- "zwraca 401, gdy użytkownik nie ma dostępu do kursu"
- "resetuje interwał powtórki do jednego dnia, gdy ocena wynosi 0"

Each of these names an observable outcome, not an internal detail. If you cannot produce a sentence like this, stay on `/10x-implement` or return to `/10x-research`.

`/10x-tdd` is **not suited** for: environment setup, CI/CD config, documentation, thin wiring where the test would just rewrite the implementation, or a spike where you are still discovering the contract.

You can mix both modes in one plan:

```
/10x-implement <change-id> phase 1   # environment
/10x-tdd       <change-id> phase 2   # contract (new code)
/10x-tdd       <change-id> phase 3   # contract (API endpoint)
/10x-implement <change-id> phase 4   # cookbook + plan sync
```

Both write progress to the same `## Progress` section in `plan.md`.

### Two-layer test strategy (cost × signal)

For each risk, pick the **cheapest test that gives a real signal**. Do not default to e2e "because it's safest", and do not chase coverage percentage.

| Layer | When to use | When NOT to use |
| --- | --- | --- |
| Integration (real DB / real infra) | The rule involves DB constraints, cascades, real SQL, or unique constraints that a mock would lie about. | Auth flows gated by RLS that belong to a separate phase; anything where setup cost exceeds signal value. |
| Hermetic (stub client) | Partial failures that real infra cannot trigger easily (e.g. second operation in a sequence fails). | Rules that depend on actual DB state — a stub will lie about constraint violations and cascades. |

A non-atomic save sequence (multiple independent operations without a transaction) means: write hermetic tests for partial-failure branches, not integration tests that force a mid-sequence error.

### Oracle rules

- The oracle — what the code *should* do — must come from sources: PRD, docs, tech-stack constraints, domain knowledge. It must **not** come from reading the implementation.
- If the implementation has a bug, copying its output as the expected value produces a mirror test that passes against the bug.
- When sources do not resolve the expected behaviour unambiguously, **stop and ask** rather than guessing.
- Research's job is to surface the oracle before any test is written.

### Vibe-testing anti-patterns to avoid

| Anti-pattern | How it looks | What to do instead |
| --- | --- | --- |
| Mirror implementation | Assertion computes the expected value with the same logic as the tested code. | Assert against a value derived from the oracle (PRD / domain rule), not from the implementation. |
| Happy paths only | Tests only pass valid inputs; edge cases absent. | Add at least one edge case per risk: `null`, empty, dependency error, invalid input. |
| Redundant copies | Six nearly identical tests checking the same absence of a sentinel. | One parameterised test (`it.each`) per property; each test catches a different regression. |

### Mutation testing (Stryker) — selective quality gate

Coverage says "this line was executed". Mutation score says "would a test fail if I broke this line?" Use Stryker as a **selective gate** after a risk phase, not as a CI gate on every commit.

Workflow:
1. Tests pass for the risk phase.
2. Run `npx stryker run --mutate "path/to/file.ts"` (narrow scope to the changed module).
3. Open the HTML report; find survived mutants.
4. For each survived mutant ask: "Would this change hurt a user or the business?"
   - Yes → add an assertion that kills the mutant.
   - No (equivalent mutant or cosmetic change) → ignore consciously.
5. Do not chase 100% mutation score. A test that pins implementation details to kill a cosmetic mutant is itself a vibe test.

The integration gate can stay **ad hoc** (not on every commit) when running local infra is expensive. Mark it accordingly in `test-plan.md §4`.

### Lesson boundaries

- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch. That is Module 1 Lesson 5 / Module 2 Lesson 5.
- Do not run `/10x-test-plan` to change the risk strategy. That is Lesson 1. Use `/10x-test-plan --status` to read current state.
- Do not write tests without a research step unless using the ad-hoc prompt with full awareness of its trade-offs.

### Paths used by this lesson

- `context/foundation/test-plan.md` — §3 rollout state; §6 cookbook (filled in as phases ship)
- `context/changes/<change-id>/research.md` — oracle source per rollout phase
- `context/changes/<change-id>/plan.md` — ordered phases with `## Progress` as execution state
- `.claude/prompts/m3l2-ad-hoc-testing.md` — ad-hoc file-level testing prompt

<!-- END @przeprogramowani/10x-cli -->
