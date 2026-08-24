# AGENTS.md

This file is the **single source of truth** for AI coding agents working with code in this repository — Codex CLI and friends read it natively; Claude Code pulls it in via the `@AGENTS.md` import in [`CLAUDE.md`](CLAUDE.md). Edit THIS file; `CLAUDE.md` is only a pointer. All paths below (e.g. `.claude/skills/`) are real on-disk locations and apply to every agent, regardless of its vendor.

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
- **Edge Function (Deno) tests** — `deno test --config supabase/functions/enhance/deno.json supabase/functions/enhance/` (and the matching `deno check` over the same directory). `supabase/functions/**` is outside the Astro tsc/eslint/Vitest graphs, so this is its ONLY behavioural coverage; both run in the `ci` job. **`index.ts` is not importable by a test** — it runs `Sentry.init()` + `Deno.serve()` at module top level and exports nothing, so testable logic must be extracted into a side-effect-free sibling module (see `replicate-create.ts`) that both `index.ts` and the test import — the same env-free-core split the app uses for `reset-password.handler.ts`. Inject `fetch`/`sleep` rather than hitting the network or really waiting out a backoff.
- `npm run check:skills` — read-only byte-parity check of the PUBLIC (git-tracked) skills across `.claude/skills` ↔ `.agents/skills`. The full course-workflow checker (manifest hashes, extension sentinels, adaptation allowlists) is local-only at `scripts/local/check-skills-sync.ts` (gitignored — its config quotes course-skill content); run THAT after every `10x get` and manual re-sync on a machine with the course environment.
- `npm run test:e2e` — Playwright E2E gate (`tests/e2e/*.spec.ts`). Playwright's webServer is `npm run test:e2e:serve` (`npm run build && wrangler dev --port 4321`) — it serves a **production build on workerd**, NOT `astro dev` (whose Vite SSR dep-optimizer hits dev-only issue #15 → "more than one copy of React" on the enhance page). Needs the local stack + a served `enhance` function with the seam env — see `context/foundation/test-plan.md` §6.3 for the run recipe. ⚠️ The stub seam `E2E_ALLOWED_OUTPUT_ORIGIN` is local/CI-only — **never set it in production** (it widens the Edge Function's SSRF output-fetch allowlist; see `context/foundation/cloud-live-smoke.md`). The same rule covers `ALLOW_WEBHOOKLESS_PREDICTION`: it lets `/start` create a Replicate prediction with no webhook (local dev without a public tunnel), and in production it would restore the silent-stall failure the HTTPS-callback guard exists to prevent.

Git hooks (husky): **pre-commit** — lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}` (kept fast — no tests here); **pre-push** — `set -e`, blocks any push to `refs/heads/master` (**master is PR-only**: branch → PR → merge; emergency bypass `git push --no-verify`), then `npm run typecheck` (`tsc --noEmit`) + `npm run test:unit` for branch pushes. (Tests moved commit→push so commits stay fast; CI still runs the full suite.)

**Server-side branch protection is ON for `master`** (enabled 2026-08-19). Required checks: `ci`, `integration`, `e2e`, `code-reviewer` — the four repo-owned gates, matching `deploy.needs` plus the code-reviewer package's only CI coverage. `strict: true` (branch must be up to date), linear history required, force-pushes and deletions blocked, and **`enforce_admins: true`** so the owner is bound too. `ai-review` is deliberately NOT required: it is advisory, secret-bearing, and skipped on fork PRs, so requiring it would both contradict "a red review blocks nothing" and block fork contributions. The pre-push hook is now defence in depth rather than the sole enforcement — keep it, since it fails locally in seconds instead of after a push. An earlier note here claimed rulesets were "unavailable on private+Free"; that was true before the repo went public (PR #112) and is why this gap stayed open for months. Emergency override: temporarily disable protection in Settings → Branches, which is a deliberate, visible act.

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

- Node.js v24.19.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)
- **Production manual config** (custom domain + DNS, Supabase auth URLs + custom SMTP, Resend, GitHub secrets) is a **runtime prerequisite for the MVP, not in the repo** — the deployed Worker serves, but the MVP (accounts, auth email, branded domain) does not function without it. Full required setup: `context/foundation/production-config.md`.

### CI

GitHub Actions workflow (`.github/workflows/ci.yml`) — six jobs:

- `ci` (push + PR) — lint, unit tests (`npm run test:unit`), `deno check` **and `deno test`** over `supabase/functions/enhance/`, SSR build. Requires `SUPABASE_URL`/`SUPABASE_KEY` repo secrets for the build step.
- `code-reviewer` (push + PR) — the `packages/code-reviewer` gate (own lockfile: `npm ci` + lint + typecheck + hermetic unit tests). The package is excluded from the root tsc/eslint graphs, so this job is its only CI coverage. No secrets (fork-PR-safe); not in `deploy.needs`.
- `integration` (push + PR) — full Vitest suite incl. `tests/jobs.rls.test.ts` against an ephemeral local Supabase (Docker). Uses no GitHub secrets (local keys are generated), so it also runs on fork PRs. Supabase Docker images are cached across runs (`actions/cache`) and `supabase start`/`db reset` retry once — anonymous pulls from `public.ecr.aws` get rate-limited on shared runners (see lessons.md).
- `e2e` (push + PR) — Playwright browser gate (`npm run test:e2e`) on the north-star flow (risks #1+#6) and the stall→terminal spec. Boots the same ephemeral local Supabase (image cache + retry hardening shared with `integration`), backgrounds `supabase functions serve enhance` with a **generated** signing secret + the `E2E_ALLOWED_OUTPUT_ORIGIN` stub seam, and runs chromium (cached). The Cloud-AI pipeline is **stubbed** — a self-signed Replicate `/callback`, no token, no cold boot. No GitHub secrets (fork-PR-safe). The live cold-boot path is a manual smoke (`context/foundation/cloud-live-smoke.md`), never a PR gate.
- `deploy` (push to master only, gated by `needs: [ci, integration, e2e]`) — Worker via `wrangler-action` + `enhance` Edge Function via the pinned supabase CLI.
- `deploy-skipped-alarm` (master push only, `always()`) — fires when a gate fails and `deploy` is therefore SKIPPED, emitting a `::error::` plus a job summary that names the consequence: **the commit is on master but production still serves the previous one**. Added after run 32298488149, where a flaky `e2e` silently withheld a deploy and a session's merged work sat undeployed until spotted by chance — `deploy: skipping` is indistinguishable from the PR case where skipping is correct. It is an ALARM, not a gate change: it never deploys and never overrides `deploy.needs`. Not a required check.

All jobs run under a workflow-level `concurrency` block (`group` = workflow + ref, `cancel-in-progress` for any ref ≠ `refs/heads/master`): a new push to a PR branch cancels its in-flight runs to save Actions minutes, while runs on `master` are never cancelled (PR #72).

A separate workflow `.github/workflows/review.yml` (`AI Code Review`, PR-only) runs an **advisory** two-pass AI review (`packages/code-reviewer` finder + judge via OpenRouter, invoked through the local composite action `.github/actions/ai-review`): sticky scorecard comment + mutually exclusive `ai-cr:passed`/`ai-cr:failed` labels; re-run by adding the `ai-cr:review` label. Secret-bearing (`OPENROUTER_API_KEY`), therefore **same-repo, non-draft, human-authored PRs only** (fork PRs skip); per-PR concurrency with cancel-in-progress; **never in `deploy.needs`** — a red review blocks nothing. The finder's trusted project rules are sourced from the BASE branch's `.github/ai-review-rules.md` (never the PR head). The finder also carries a diff-scoped `getFileContext` tool: file reads restricted to exactly the diff's paths (exact-match allowlist + symlink containment), capped at 5 loop steps via `REVIEW_FINDER_MAX_STEPS`; per-step telemetry lands in the run log and a `finderTelemetry` cost block in `review.json`. Runs that produce output upload `review.json` + `comment.md` as the `ai-review-output` artifact (14-day retention; technical failures produce no output dir and upload nothing). A transient flake retries once before the manual `ai-cr:review` fallback: schema mismatches re-roll immediately, 429/5xx/timeouts wait a bounded `Retry-After`-aware backoff.

A **third pass — the plan-aware implementation review** — runs after the judge, but **only when a plan resolved** for the PR. It judges the diff against the plan it claims to implement, grading seven dimensions (plan adherence, scope discipline, safety & quality, architecture, pattern consistency, test coverage, success criteria) and emitting an `APPROVED`/`NEEDS_ATTENTION`/`REJECTED` verdict into its own section of the same sticky comment. Model override: `vars.OPENROUTER_IMPL_REVIEW_MODEL` (action input `impl-review-model`), defaulting to `DEFAULT_IMPL_REVIEW_MODEL`.

- **Plan resolution is deterministic, never a model tool call** — a model that declines to call `readPlan` is indistinguishable from "this PR has no plan", so the failure would render as a clean pass. The workflow looks in both change trees, active-first, and a `Plan: <path>` line in the PR body overrides the convention lookup. The candidate is staged from the Git object after a blob-mode check (never read through the checkout, so a symlinked `plan.md` is never followed by the process holding `OPENROUTER_API_KEY`).
- **The plan is UNTRUSTED.** It looks like a repository file but arrives on the PR head, so it is fenced as data alongside the diff — the trusted rules still come from the base branch's `.github/ai-review-rules.md` only.
- **Diff exclusions**: committed review prose (`**/reviews/*.md`) and the plan file itself are stripped from the reviewed diff — otherwise the finder echoes old review documents back as if they were current findings.
- **Gated on a passing code review.** The pass costs roughly **9.47×** the finder+judge review it rides alongside (measured: impl $0.199620 vs $0.021087, run 31735830016), so it runs only when the code-review verdict is `passed` — a PR whose code review already failed is going back for changes and will be reviewed again. The gate is CI policy set by the CLI (`implReviewGate: "code-review-passed"`), not a library default, so embedders and evals keep the ungated behavior. **Gotcha for anyone probing the third pass:** a deliberately-buggy fixture cannot verify it on CI. Bad code fails the _code_ review, and the gate then skips the implementation review — so the probe measures nothing. The phase-4 probe PR (#128) only worked because it predated the gate. Verify the pass either locally via `packages/code-reviewer/scripts/phase4-probe.mjs` (which bypasses the gate entirely), or on a PR whose code review genuinely passes while still deviating from its plan. A gated run is **stated, never silent**: `implReview` carries a `skipped` block with its reason and the comment says so, because rendering it as the no-plan section would tell the author something false about their own PR.
- **Never affects `ai-cr:*` labels or the exit code.** The pass is advisory and fully isolated: no plan → no third call and no `implReview` key at all (absence is the no-plan signal — there is no `skipped` variant); a failure → a warning block in the comment, with the code review above intact. Per-run spend lands in `implReviewTelemetry` in `review.json` and on one stderr line in the Actions log.

## 10x-cli profile & workflow

- The rules live in this `AGENTS.md`; `CLAUDE.md` (the Claude Code profile's canonical rules file) imports it via `@AGENTS.md`. If a `10x get` ever appends content to the `CLAUDE.md` shim, move it here.
- **Two synced skill trees exist in-repo — use the one for YOUR tool:** Claude Code reads `.claude/skills/<name>/SKILL.md`; Codex reads the adapted copies at `.agents/skills/<name>/SKILL.md` (same skills; per-tool path/filename references swapped). Codex runtime config/hooks live under `.codex/`. Every `.claude/skills/<name>` path mentioned elsewhere in this file has its Codex equivalent at `.agents/skills/<name>`.
- **Public-repo allowlist (course rule, lesson m5l3):** 10x-Workflow course skills are NOT published. In this public repo they are gitignored local artifacts (`.claude/skills/10x-*/`, `.agents/skills/10x-*/`, `.claude/prompts/`, the CLI manifest, `scripts/local/`) — restore them on a fresh clone with `10x get <lesson>` plus the re-sync procedure below. The single permitted public exception is **`10x-impl-review-ci`** (both trees, byte-identical — it powers the public CI reviewer); registry-sourced non-course skills (`code-review`, `documentation`, `learning`, `skill-optimizer`, `typescript-magician`) stay tracked too. Git history from before 2026-08-07 still contains the course skills; that exposure predates this rule.
- The 10x-cli's active profile is **Claude Code** (verify with `10x doctor` — it validates the `.claude/` tool dir), so `10x get` refreshes `.claude/skills/`; after a re-fetch, re-sync the `.agents/skills/` copies and run `npm run check:skills`. Run the same check after every manual re-sync. **Fresh machine, or the full re-sync procedure (keep-list vs adapt-list, verification): [`context/foundation/agent-env-setup.md`](context/foundation/agent-env-setup.md).** To switch the managed profile, re-run `10x get <ref> --tool <name>`; the CLI will prompt to migrate existing artifacts.
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
  - `skills-lock.json` — bootstrap artifact from `10x-astro-starter` in the vercel-labs `skills` CLI format; tracks 2 starter skills with CRLF-sensitive folder hashes and is not the `10x get` inventory.
  - `.claude/.10x-cli-manifest.json` — authoritative inventory and raw-byte sha256 baseline produced by `10x get` for managed skills and prompts.
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
