---
project: LuminaClean AI
researched_at: 2026-05-26
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR) + React 19 islands
  runtime: Cloudflare Workers (workerd)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The app is already built on `@astrojs/cloudflare` v13.5 (which targets Workers, not Pages), so Cloudflare is the only candidate with **zero migration cost** — every alternative requires swapping the Astro adapter and re-auditing env-var access. It passes all five agent-friendly criteria, costs **$0** at this MVP's traffic (100k requests/day free), publishes the best agent-readable docs of any candidate (`llms.txt` + markdown-on-request), and matches the developer's stated familiarity. Two current Workers gotchas must be fixed in `wrangler.jsonc` before first deploy — the active middleware bug (Astro #15434) and the SSR `run_worker_first` requirement — both one-line changes captured in the risk register.

## Platform Comparison

Hard filter applied: the host is stateless request/response (Supabase Realtime holds the push channel; Replicate runs the long inference), so **no platform was dropped** for lacking persistent connections. Astro SSR runs on all six via an adapter — but only Cloudflare needs no adapter swap. Soft weights from the interview: minimize cost (penalizes pricey base tiers), Cloudflare familiarity (tie-break), single-region OK (edge not required), external providers fine — Supabase owns DB/auth/storage/realtime and Replicate owns inference (no co-location bonus).

| Platform | CLI-first | Managed/Serverless | Agent docs | Deploy API | MCP | Cost (MVP) | Migration |
|---|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass (llms.txt) | Pass | Pass (GA) | **$0** (100k req/day free) | **none** |
| **Netlify** | Pass | Pass | Pass (llms.txt) | Pass | Pass (GA) | $0 free | adapter swap |
| **Vercel** | Pass | Pass | Pass | Pass | Partial (beta) | $20/mo* | adapter swap |
| **Fly.io** | Pass | Partial (container) | Pass | Pass | Partial (experimental) | ~$2/mo (no free tier) | swap + Dockerfile |
| **Railway** | Partial (no CLI rollback) | Pass | Pass | Pass | Partial (WIP) | ~$5/mo (no free tier) | adapter swap |
| **Render** | Pass | Pass | Pass (llms.txt) | Pass | Pass (GA, no deploy-trigger) | $7/mo (free spins down ~60s) | adapter swap |

\* Vercel's free Hobby tier forbids commercial use; a real product lands on Pro (~$20/mo).

Per-platform notes:

- **Cloudflare Workers** — `wrangler` covers deploy/rollback/tail; fully managed edge (no Dockerfile, no OS); `llms.txt` + `Accept: text/markdown` docs; deterministic `wrangler deploy`/`wrangler rollback`; GA managed MCP suite (Workers Bindings, Builds, Observability, Logpush). Free tier (100k req/day, 10ms CPU) covers the MVP; the $5/mo paid plan (30ms CPU) is the realistic safety margin for SSR auth.
- **Netlify** — strongest fallback. Day-one Astro 6 support; **GA `@netlify/mcp` server**; `llms.txt`-native docs; commercial-friendly credit-based free tier (300 credits/mo covers ~100k req). Gaps: 10s function timeout (26s on Pro by request), serverless-only, adapter swap + `import.meta.env`→`process.env` runtime-secret audit.
- **Vercel** — most polished serverless DX; `@astrojs/vercel` v10 GA; 300s timeout (Fluid Compute). Dings: **MCP is beta**, the free Hobby tier **forbids commercial use** (→ $20/mo Pro), and Hobby log retention is just 1 hour with single-deployment rollback.
- **Fly.io** — true persistent-process model (unneeded here); requires `@astrojs/node` + a hand-maintained Dockerfile; **no free tier** (~$2/mo always-on; keep `min_machines_running = 1` to avoid ~5s cold starts); `fly mcp server` is **experimental**.
- **Railway** — clean managed buildpacks (Nixpacks GA / Railpack beta); **no free tier** (~$5/mo Hobby), and a server-side Supabase Realtime connection would keep it always-on (scale-to-zero won't engage); rollback is dashboard-only; MCP is WIP.
- **Render** — managed Node web service; **GA MCP server** and `llms.txt` docs; CLI rollback available. But the free tier spins down after 15 min (~60s cold start), making $7/mo Starter the realistic floor; MCP can't trigger deploys (use CLI/hooks).

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Wins on every axis that matters here: zero migration (already on the adapter; `wrangler.jsonc` is Workers-ready), $0 at MVP scale, best-in-class agent docs, deterministic CLI ops, GA MCP suite, and stated developer familiarity. The edge runtime is a bonus the single-region requirement doesn't demand but doesn't hurt.

#### 2. Netlify

The strongest fallback if Cloudflare became untenable. Fresh research upgraded it: its `@netlify/mcp` server is **GA** (ahead of Vercel's beta), docs are now `llms.txt`-native, and its free tier permits commercial use — all three reasons it now outranks Vercel. The gap vs. the recommendation is the adapter swap (`@astrojs/cloudflare` → `@astrojs/netlify` + `import.meta.env`→`process.env` re-audit), a 10s default function timeout, and serverless-only operation.

#### 3. Vercel

Excellent DX, GA Astro adapter, and a generous 300s function timeout. The gap: a **beta** MCP server, a Hobby tier that **bars commercial use** (a real product needs $20/mo Pro), 1-hour log retention on Hobby, and the same adapter-swap cost as every non-Cloudflare option.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Active middleware bug (Astro #15434).** With `nodejs_compat` + a `compatibility_date ≥ 2025-09-15` — this repo's `wrangler.jsonc` is at **2026-05-08** — SSR pages that run middleware can render `[object Object]` because Node "Process v2" makes Astro emit an async-iterable body workerd doesn't support. The app runs auth middleware on every request, so this is likely to hit. Fix: add `disable_nodejs_process_v2` to `compatibility_flags`. Undocumented in the starter; easy to miss until pages break in production.
2. **SSR needs `run_worker_first`.** Workers Static Assets serves static files first by default; SSR middleware (auth cookie resolution, protected-route redirects) needs `run_worker_first: true` (or an explicit route list) or it silently won't run for asset-pathed requests. The repo's `wrangler.jsonc` doesn't set it — a protected route could leak its shell to anonymous users.
3. **10ms free-tier CPU is tight for SSR auth.** `@supabase/ssr` cookie reassembly + JWT verification runs in middleware on every protected request. `await`ed fetches don't count, but synchronous JWT/zod/cookie work crossing 10ms throws error 1102. Budget for the $5/mo paid plan (30ms CPU).
4. **Service-role key handling + three secret mechanisms.** Minting signed upload URLs / Storage admin calls use the Supabase service-role key as a Worker secret; a mis-scoped binding is a credential-exposure risk. Secrets live in `wrangler secret put` (prod) and `.dev.vars` (local, `wrangler dev` only) — NOT `.env` at runtime — so it's easy to make local work while prod 500s.
5. **Cloudflare hosts only the frontend.** The async pipeline (DB webhook → Supabase Edge Function → Replicate → webhook callback → Realtime) runs on **Supabase**, a separate ops surface. Treating "deploy to Cloudflare" as the whole infra story leaves that chain without a runbook.

### Pre-Mortem — How This Could Fail

They shipped on Cloudflare and it mostly worked — until protected pages intermittently rendered `[object Object]` in production. Local `astro dev` never reproduced it (different runtime) and `wrangler dev` only sometimes did, so it sat un-diagnosed for days before someone found Astro #15434 and added `disable_nodejs_process_v2`. Before that, auth redirects had silently no-op'd on some asset-pathed routes because `run_worker_first` was never set, letting a few protected views leak their shell to anonymous visitors. As traffic grew, the 10ms free-tier CPU tripped on JWT verification during login spikes — sporadic 1102 errors no one could reproduce — and they upgraded to the paid plan reactively after user complaints. Meanwhile the real fragility, the Supabase Edge Function + Replicate webhook chain, was never in the infrastructure doc; when a webhook silently failed, results stopped appearing with no error surfaced to users and no runbook to consult. Cloudflare wasn't the problem; treating it as the *entire* problem was.

### Unknown Unknowns

- **Astro #15434 (Process v2) is live right now** for this repo's compat-date + middleware combo. Pre-empt it by adding `disable_nodejs_process_v2` to `compatibility_flags`.
- **`run_worker_first: true` is required** for SSR middleware to run ahead of static-asset serving on Workers Static Assets.
- **Prior risk resolved (good news):** Astro #13503 — the `astro:env/server` secret-resolution bug flagged in the earlier research — is now **fixed in `@astrojs/cloudflare` v13.5+**; no workaround flag needed for it anymore.
- **`npm run dev` is plain `astro dev` (Node/Vite), not workerd**, and reads `.env`. Runtime-specific bugs (including #15434) only appear under `npm run build && wrangler dev` (which reads `.dev.vars`) or in production.
- **Preview deploys differ from Pages.** Workers Static Assets does not give Pages' automatic per-branch preview URLs for free — create them with `wrangler versions upload` or the Workers Builds GitHub integration; gate with Cloudflare Access if they expose pre-release UI.

## Operational Story

- **Preview deploys**: not automatic like Pages. Create an unpromoted preview with `npx wrangler versions upload` (returns a versioned `*.workers.dev` preview URL) or enable the Workers Builds GitHub integration for per-push preview builds. Preview URLs are public unless protected with Cloudflare Access (Zero Trust); fork PRs won't have repo/CI secrets.
- **Secrets**: production via `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` (and the Replicate token + Supabase service-role key when that pipeline lands) — stored in the Workers secret vault, readable only by account members with Workers access. Local dev secrets live in `.dev.vars` (gitignored, used by `wrangler dev`); `astro dev` reads `.env`. CI deploy needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` as GitHub repo secrets. Rotation = re-run `wrangler secret put` (overwrites in place); rotate the API token in the Cloudflare dashboard.
- **Rollback**: `npx wrangler rollback [<version-id>]` reverts to a prior deployed version, near-instant; `npx wrangler versions list` to find IDs. Caveat: this reverts **only the Worker code + static assets** — it does NOT roll back Supabase schema migrations or Edge Functions, which are a separate ops surface and must be reverted independently.
- **Approval**: human-only (panel-by-hand) — rotating the Supabase service-role key, dropping/altering Postgres tables, deleting the Worker, and changing the Cloudflare API-token scope. An agent may run unattended: `wrangler deploy` to preview/non-prod, `wrangler versions upload`, `wrangler tail`, and read-only logs/analytics queries.
- **Logs**: `npx wrangler tail` streams live (`--status error`, `--format json`); structured runtime logs are also in the dashboard since `observability.enabled: true` is set in `wrangler.jsonc`. For structured agent queries, Cloudflare's GA managed MCP servers (Observability, Logpush) expose logs/analytics as typed tools.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Astro #15434: middleware + `nodejs_compat` + compat-date ≥ 2025-09-15 renders `[object Object]` on SSR pages | Devil's advocate / Unknown unknowns | H | H | Add `disable_nodejs_process_v2` to `compatibility_flags` in `wrangler.jsonc` before first deploy; smoke-test a protected page under `wrangler dev`. |
| SSR middleware silently skipped for asset-pathed routes (no `run_worker_first`) | Devil's advocate / Unknown unknowns | M | H | Set `run_worker_first: true` (or an explicit route list) in `wrangler.jsonc`; verify auth redirect fires on a protected route. |
| 10ms free-tier CPU trips on SSR auth → intermittent 1102 | Devil's advocate / Pre-mortem | M | M | Keep synchronous middleware lean; move heavy parsing off the hot path; budget for the $5/mo paid plan (30ms CPU). |
| Service-role / Replicate secret mis-scoped or leaked via Worker | Devil's advocate | L | H | Scope the Cloudflare API token to this Worker only (no DNS/billing); keep service-role usage server-side; use `wrangler secret put`, never commit to `.env`. |
| Local dev (`astro dev`) hides runtime bugs that only appear under workerd | Unknown unknowns | M | M | Validate auth/SSR with `npm run build && wrangler dev` and on a real preview before promoting; don't trust `npm run dev` alone. |
| Supabase Edge Function + Replicate webhook chain has no runbook | Devil's advocate / Pre-mortem | M | H | Document the async pipeline's failure modes separately; add a dead-letter/timeout path and a user-facing error when a webhook doesn't return within the ≤30s p95 budget. |
| Preview-deploy expectation mismatch (no free per-branch URLs) | Unknown unknowns | M | L | Wire Workers Builds GitHub integration or scripted `wrangler versions upload`; gate preview URLs with Cloudflare Access if they expose pre-release UI. |
| Replicate cold-start consumes the ≤30s p95 budget (PRD Open Question #2) | Research finding / PRD | M | M | Measure on the real model early; if violated, choose warm-up, model swap, or relax the SLA — Cloudflare is not the bottleneck (inference is external). |

## Getting Started

The repo is already Workers-ready (`wrangler.jsonc` has the correct `main`, `compatibility_date: 2026-05-08`, `nodejs_compat`, and `assets` config; `wrangler` ^4.94 is installed). Before first deploy:

1. **Apply the two Workers config fixes** in `wrangler.jsonc`: add `disable_nodejs_process_v2` to `compatibility_flags` (pre-empts Astro #15434) and set `"run_worker_first": true` (so auth middleware runs ahead of static-asset serving). Confirm with `npm run build && npx wrangler dev` that a protected page renders and redirects correctly.
2. **Authenticate wrangler** (interactive — run it yourself via the `!` prefix): `! npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` (scoped to Workers for this project) for non-interactive/CI use.
3. **Set production secrets**: `npx wrangler secret put SUPABASE_URL` then `npx wrangler secret put SUPABASE_KEY` (add the Replicate token + Supabase service-role key when the cloud pipeline lands).
4. **Build and deploy**: `npm run build && npx wrangler deploy`. Optionally add `"deploy": "astro build && wrangler deploy"` to `package.json` scripts so it's one command.
5. **Verify under the real runtime**: open the returned `*.workers.dev` URL, sign in to confirm `astro:env` secrets resolve under workerd, and tail logs with `npx wrangler tail`. For local high-fidelity testing use `npm run build && npx wrangler dev` — not `npm run dev`, which runs on Node and reads `.env`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration (not applicable to the Workers target)
- CI/CD pipeline setup (the existing `.github/workflows/ci.yml` runs lint+build; adding a deploy job with `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` is a separate task)
- Production-scale architecture (multi-region, HA, DR)
- The Supabase Edge Function + Replicate async pipeline's own deploy/secrets surface (separate ops surface; flagged in the risk register)
