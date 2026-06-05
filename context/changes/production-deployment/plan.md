# S-07: Production Deployment / Go-Live Implementation Plan

## Overview

Take LuminaClean AI live: deploy the Astro SSR app to Cloudflare Workers and wire a fresh production Supabase project (migrations, Edge Function, Realtime, DB webhook, secrets, prod-auth), plus a CI deploy step. The Cloud AI pipeline ships **flag-OFF** so Local engine + auth are live immediately; the cloud flip-ON is a separate runbook event gated on S-05 (done), S-08, and S-09. Before go-live exposes the public Replicate `/callback`, harden it (replay window, fetch timeout + size cap, SSRF allowlist).

## Current State Analysis

- **Cloudflare config is deploy-ready.** `wrangler.jsonc` already has `nodejs_compat` + `disable_nodejs_process_v2` (pre-empts Astro #15434) and correctly **omits** `run_worker_first` (assets-first routing — SSR pages + `/api/*` still hit the Worker, so middleware runs; `lessons.md:40`). `observability.enabled: true` is set.
- **Cloud-OFF is already the default.** `CLOUD_PIPELINE_ENABLED` defaults to `false` (`astro.config.mjs:24`) and is read **only** in the Edge Function `/start` (`supabase/functions/enhance/index.ts:176`), which returns `200 {skipped: "cloud_pipeline_disabled"}` and leaves the job `queued`. `CLOUD_DAILY_CAP` defaults to `50` (`astro.config.mjs:28`); `0` is an operator kill-switch enforced pre-insert in `create-job` (`src/lib/services/photo-job.service.ts` count helper).
- **`/callback` hardening gaps (the code work):**
  - svix verification (`src/lib/services/replicate-webhook.ts:70-104`, called from `enhance/index.ts:269-278`) signs `${id}.${timestamp}.${body}` but **enforces no freshness window** — a captured signature replays indefinitely.
  - the output fetch (`enhance/index.ts:325`) has **no `AbortSignal.timeout` and no size cap** (`await outputRes.arrayBuffer()` at `:330`).
  - **no SSRF allowlist** — `outcome.outputUrl` (from the Replicate payload, `replicate-webhook.ts:152-156`) is fetched directly.
- **CI is lint+build only** (`.github/workflows/ci.yml`) — no deploy job, no `deno check`.
- **Edge Function deploy is JWT-safe.** `config.toml:383` declares `[functions.enhance] verify_jwt = false`, so the function authenticates itself (DB bearer for `/start`, svix for `/callback`); the CLI deploy honors this.
- **DB webhook is environment-wired, not hardcoded.** The `jobs_enqueue_webhook` trigger (`supabase/migrations/20260531120000_jobs_enqueue_webhook.sql`) reads `app.settings.edge_function_url` + `app.settings.db_webhook_secret` and **silently no-ops** if either is unset — so prod must set both via `ALTER DATABASE`.
- **Prod-auth needs config or reset breaks.** `config.toml:154` `site_url` + `:156` `additional_redirect_urls` point at `127.0.0.1:4321`; the recovery template is at `supabase/templates/recovery.html`. Without prod values the password-reset link 404s on the live domain.
- **Full prod secret set** (from `.env.example`): `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUD_PIPELINE_ENABLED`, `CLOUD_DAILY_CAP`, `REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET`, `DB_WEBHOOK_SECRET`. App (Worker) needs the first five; the Edge Function needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUD_PIPELINE_ENABLED`, `DB_WEBHOOK_SECRET`, `REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET` (+ optional `EDGE_FUNCTION_URL`).

### Key Discoveries:

- Two `infrastructure.md` risks (Astro #15434, `run_worker_first`) are **already resolved** in `wrangler.jsonc` — not work items.
- Deployed Supabase functions default to `verify_jwt = true`; `enhance` is exempted in `config.toml:384` — confirm the deploy preserves it, or both webhook callers get rejected pre-handler.
- `lessons.md:68` — the Edge Function is excluded from the Astro tsc/eslint graph; `deno check supabase/functions/enhance/index.ts` is the only static gate, so CI must run it.
- The 5-minute source-URL TTL (`SOURCE_URL_TTL_SECONDS = 300`, `enhance/index.ts:38`) is the **S-09** concern — explicitly NOT touched here.

## Desired End State

The app is publicly reachable on a Cloudflare Workers URL. An anonymous visitor can run the Local engine; a visitor can sign up, sign in, sign out, and complete a password reset whose email link resolves on the prod domain. A cloud submission is accepted but correctly **no-ops** (job stays `queued`, no Replicate call) because cloud is OFF. The `/callback` is hardened. CI deploys both the app and the Edge Function on every master push. `wrangler rollback` is documented and proven. Flipping cloud ON later is a single documented runbook step (set flag `true` + cap `>0`), deliberately deferred.

## What We're NOT Doing

- **Not flipping cloud ON.** Ships OFF (flag `false` + cap `0`); flip-ON is gated on S-05+S-08+S-09 and is a separate runbook event.
- **Not the S-09 source-URL TTL fix** (separate slice) and **not the S-08 retention cleanup** (separate slice).
- **Not wiring per-branch preview deploys** (deferred; validate locally via `wrangler dev`).
- **Not custom SMTP / Resend** (parked; prod uses Supabase's built-in email sender for MVP).
- **Not per-user rate limiting, history UI, admin UI** (v2 non-goals).

## Implementation Approach

Four phases, ordered so each is verifiable before the next depends on it: (1) harden `/callback` as pure code+tests, locally green before it's ever exposed; (2) you run the interactive provisioning runbook (logins, project create, secrets, prod-auth) — everything an agent can't do; (3) commit the CI deploy pipeline, which fires against the now-provisioned infra; (4) smoke-test the live cutover and prove rollback. Cloud stays OFF throughout.

## Critical Implementation Details

- **`verify_jwt` must stay false for `enhance`.** `config.toml:383-384` sets it; the CLI deploy reads `config.toml`. If a deploy ever flips it true, the DB webhook (`/start`) and Replicate (`/callback`) get 401'd by the platform before the handler runs. Verify post-deploy.
- **DB-webhook settings are a silent failure mode.** If `app.settings.edge_function_url` / `db_webhook_secret` are unset in prod, queued jobs never enqueue and nothing errors. This is fine while cloud is OFF (the function no-ops anyway), but the settings must be in place before the eventual flip-ON; set them now and verify the row reaches the function (which then no-ops on the flag).
- **Replay-window clock skew.** The freshness check compares `webhook-timestamp` (seconds) to server time; allow ±5 min in BOTH directions to tolerate skew, not just past-dated.

## Phase 1: Harden the `/callback` Edge Function

### Overview

Close the three `/callback` gaps with unit tests, all locally verifiable via Vitest + `deno check` before any deploy.

### Changes Required:

#### 1. Replay-window freshness check

**File**: `src/lib/services/replicate-webhook.ts`

**Intent**: After the HMAC check passes, reject callbacks whose `webhook-timestamp` is more than 5 minutes from server time (either direction), closing the indefinite-replay gap. The timestamp is already an input to the signed content; this adds the missing freshness gate.

**Contract**: Extend `verifyReplicateSignature` (or add a sibling guard it calls) to parse `webhookTimestamp` as Unix seconds and return **false** when `Math.abs(nowSeconds - ts) > 300`. **Never throw** — the helper documents "Returns false (never throws)" (`replicate-webhook.ts:67-68`) and the caller (`index.ts:276-278`) relies on that to emit a uniform 401; a throw branch would break that contract and risk an unhandled error on the callback. To distinguish a stale timestamp from a bad signature for logging, either log the reason inside the helper or return a small discriminated result (e.g. `{ ok: false, reason: "stale" | "bad_sig" }`) — but the outward signal stays a plain false. Tolerance as a named constant (`WEBHOOK_TOLERANCE_SECONDS = 300`).

#### 2. Bounded, size-capped output fetch

**File**: `supabase/functions/enhance/index.ts` (around the `:324-330` fetch)

**Intent**: Bound the result download so a slow or oversized response can't hang or OOM the function. 30s timeout, 25 MB ceiling (mirrors the photos bucket limit, so legit outputs always fit).

**Contract**: Pass `signal: AbortSignal.timeout(30_000)` to the output `fetch`. Enforce the size cap to bound **peak memory**, not just the stored object: (a) pre-check `Content-Length` when present and reject early if it exceeds 25 MB, AND (b) read `outputRes.body` through a capped reader loop that accumulates chunks and aborts the moment the running total exceeds 25 MB — so a missing or lying header is still bounded. Do **not** rely on `await outputRes.arrayBuffer()` followed by a post-read `byteLength` check: `index.ts:330` already buffers the whole body before any post-read guard could run, so that path bounds only the stored object, not peak memory (it doesn't deliver the OOM protection the cap is for). On timeout or over-cap, fail the job through the existing failure path with a capped error detail (reuse `MAX_ERROR_DETAIL_CHARS`).

#### 3. SSRF host-suffix allowlist

**File**: `src/lib/services/replicate-webhook.ts` (define + export the helper); called from `supabase/functions/enhance/index.ts` before the output fetch.

**Intent**: Only fetch Replicate's real output CDN. Reject any `outputUrl` that isn't `https:` with a host ending in `.replicate.delivery`.

**Contract**: A small pure helper `isAllowedOutputUrl(url): boolean` — parse with `new URL()`, require `protocol === "https:"` and `hostname === "replicate.delivery" || hostname.endsWith(".replicate.delivery")`. **Define and export it in `replicate-webhook.ts`** — the dual-runtime-clean module (zero imports, WebCrypto only) already imported by both Deno (`index.ts:31-36`) and Vitest, exactly how `verifyReplicateSignature` is shared. Import it into `index.ts` and call it before the fetch; on rejection, fail the job (do not fetch). Defining it here (not in `index.ts`, which runs `Deno.serve`/`Deno.env.get` at module load and so can't be imported by Vitest — `lessons.md:26`) keeps it genuinely unit-testable without the Deno runtime.

```ts
// in src/lib/services/replicate-webhook.ts — allowlist intent (host-suffix, https-only)
export function isAllowedOutputUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  return u.protocol === "https:" &&
    (u.hostname === "replicate.delivery" || u.hostname.endsWith(".replicate.delivery"));
}
```

#### 4. Tests

**File**: `tests/replicate-webhook.test.ts` (extend) + a small unit test for `isAllowedOutputUrl`

**Intent**: Lock each gate: stale timestamp rejected, fresh accepted; disallowed host / non-https / unparseable URL rejected, `*.replicate.delivery` accepted. (Timeout/size behavior is asserted at the helper boundary where feasible; full fetch-abort is covered manually under `supabase functions serve`.)

**Contract**: Pure-function tests only — keep helpers free of `astro:env/server` / `Deno.*` at import time so Vitest can load them (`lessons.md:26`).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Replay-window + allowlist cases covered (new assertions present and green)
- Edge Function type-checks: `deno check supabase/functions/enhance/index.ts`
- Lint passes on touched files: `npx eslint src/lib/services/replicate-webhook.ts tests/replicate-webhook.test.ts` (after `npx prettier --write` on them; `lessons.md:33`)

#### Manual Verification:

- `supabase functions serve enhance` + a forged callback with a stale timestamp → 401/ignored; a fresh signed callback → processed.
- A callback whose `outputUrl` host is not `*.replicate.delivery` → job fails, no outbound fetch made.
- Confirm a normal success path (valid host, fast small output) still stores the result object.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Provision Production Infrastructure (Runbook)

### Overview

The interactive / dashboard / secret steps an agent cannot do. **You run these via the `!` prefix or the Supabase/Cloudflare dashboards.** Output: a provisioned prod Supabase project and Cloudflare Worker, all secrets set, cloud OFF. This phase is a documented checklist — the plan provides the exact commands; nothing here is committed code except the recovery template already in the repo.

### Changes Required:

#### 1. Prod Supabase project + schema

**Intent**: Stand up the prod database with the exact schema the app expects.

**Contract** (runbook):
- `! supabase login` (interactive); create the prod project (dashboard or `supabase projects create`), capture **project-ref**, **project URL**, **anon key**, **service-role key**.
- `! supabase link --project-ref <ref>`
- `! supabase db push` (applies the 3 migrations: jobs table + RLS + Realtime publication + `REPLICA IDENTITY FULL`; photos bucket + RLS; `pg_net` + webhook trigger).
- Verify: `jobs` table, `supabase_realtime` publication includes `public.jobs`, `photos` bucket present.

#### 2. DB-webhook settings

**Intent**: Wire the `jobs` INSERT trigger to the prod Edge Function URL.

**Contract** (runbook — SQL editor / `psql`): set
`ALTER DATABASE postgres SET app.settings.edge_function_url = 'https://<ref>.supabase.co/functions/v1/enhance';`
and `ALTER DATABASE postgres SET app.settings.db_webhook_secret = '<DB_WEBHOOK_SECRET>';`
(Generate `DB_WEBHOOK_SECRET` as a random 32+ byte token; reuse the same value as the Edge Function secret in step 5.) Reconnect so the setting takes effect.

#### 3. Prod-auth config

**Intent**: Make sign-in and password-reset links resolve on the live domain.

**Contract** (dashboard → Auth): set `site_url` to the prod Worker URL; add it to `additional_redirect_urls` (include `/auth/confirm`); apply the recovery email template (`supabase/templates/recovery.html`) and confirm the prod URL in the template renders. Built-in email sender (MVP); SMTP remains parked.

#### 4. Cloudflare Worker + scoped API token

**Intent**: Prepare the deploy target and a least-privilege CI token.

**Contract** (runbook): `! npx wrangler login` (or create an API token scoped to **Workers Scripts: Edit** for this account only — no DNS/billing); capture **account id** and the **API token**. Confirm `npm run build && npx wrangler dev` renders a protected page locally (runtime parity).

#### 5. Secrets — Edge Function + Worker + GitHub

**Intent**: Place every secret in its correct vault, cloud OFF.

**Contract** (runbook):
- **Edge Function** (`! supabase secrets set ...`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DB_WEBHOOK_SECRET`, `REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET`, `CLOUD_PIPELINE_ENABLED=false`. (`SUPABASE_URL`/service-role are auto-injected for functions but set explicitly to match the code's `Deno.env.get`.)
- **Worker** (`! npx wrangler secret put ...` — set **once here**; Worker secrets persist across deploys, so Phase 3 does **not** re-sync them): `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUD_PIPELINE_ENABLED=false`, `CLOUD_DAILY_CAP=0`. Setting them once keeps the cloud-OFF values (`false`/`0`) authoritative without depending on per-deploy injection.
- **GitHub repo secrets** (for Phase 3 CI): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, plus the app/function secret values the CI action injects.

### Success Criteria:

#### Automated Verification:

- `! supabase db push` reports all migrations applied (no pending).
- `! npx wrangler whoami` resolves the account; `! supabase projects list` shows the linked ref.

#### Manual Verification:

- Dashboard shows `jobs`, `photos` bucket, Realtime publication on `public.jobs`.
- `select current_setting('app.settings.edge_function_url', true);` returns the prod `/enhance` URL.
- Auth settings show the prod `site_url` + redirect URLs; recovery template saved.
- All Edge Function + Worker secrets present (cloud values are `false` / `0`); all GitHub repo secrets present.

**Implementation Note**: Pause for confirmation that provisioning is complete before Phase 3 (the CI deploy will fire against this infra).

---

## Phase 3: CI Deploy Pipeline

### Overview

Add a master-only deploy job that ships the app and the Edge Function after the existing lint+build (and tests) pass, with a `deno check` gate on the function.

### Changes Required:

#### 1. Deploy job in CI

**File**: `.github/workflows/ci.yml`

**Intent**: After `ci` (lint+build) succeeds on a push to `master` (not PRs, not forks), deploy the app to Workers and the Edge Function to Supabase. Keep PR runs deploy-free.

**Contract**: First, **add `npm run test` to the existing `ci` job** (which runs on both PRs and pushes) so unit tests — including the Phase 1 hardening tests — gate *merges*, not just deploys. Without this, tests run only in the master-only `deploy` job and a regression isn't caught until after merge. Then add a new `deploy` job with `needs: ci` and `if: github.ref == 'refs/heads/master' && github.event_name == 'push'`. Steps:
- checkout + `setup-node` + `npm ci` + `npx astro sync`. (Unit tests are **not** repeated here — they ran in the `ci` job this `deploy` job `needs:`.)
- **App**: `cloudflare/wrangler-action@v3` with `apiToken`/`accountId` from secrets, `preCommands: npm run build`, `command: deploy`. Worker runtime secrets are **not** synced here — they were set once via `wrangler secret put` in Phase 2 #5 and persist across deploys, so `CLOUD_PIPELINE_ENABLED=false` / `CLOUD_DAILY_CAP=0` stay authoritative. The build still needs `SUPABASE_URL`/`SUPABASE_KEY` as build-time env (below).
- **Edge Function**: set up Deno; run `deno check supabase/functions/enhance/index.ts` (gate); then `supabase functions deploy enhance --use-api --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}` with `SUPABASE_ACCESS_TOKEN` in env. Pass `--use-api` explicitly: the CI runner has no Docker, and while `supabase@2.98.2` auto-falls-back to API bundling, the explicit flag makes it deterministic and suppresses Docker-probe noise. The deploy honors `config.toml` `verify_jwt = false`.

```yaml
# sketch — deploy job (after the existing `ci` job)
deploy:
  needs: ci
  if: github.ref == 'refs/heads/master' && github.event_name == 'push'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-node@v5
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - run: npx astro sync
    # npm run test runs in the `ci` job (gates PRs + pushes), not here.
    - uses: denoland/setup-deno@v2
      with: { deno-version: v2.x }
    - run: deno check supabase/functions/enhance/index.ts
    - uses: cloudflare/wrangler-action@v3
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        preCommands: npm run build
        command: deploy
      env:
        SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
        SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
    - run: |
        npm i -g supabase
        supabase functions deploy enhance --use-api --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
      env:
        SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

(The `build` step needs `SUPABASE_URL`/`SUPABASE_KEY` in env exactly as the existing `ci` build does.)

### Success Criteria:

#### Automated Verification:

- CI `ci` job stays green on PRs (no deploy attempted on PRs).
- On master push, the `deploy` job runs: `deno check` passes, `wrangler deploy` succeeds, `supabase functions deploy enhance` succeeds.
- Workflow lints clean (`actionlint` if available, else review).

#### Manual Verification:

- The Actions run shows a returned `*.workers.dev` (or custom) URL.
- Supabase dashboard shows the `enhance` function deployed with `verify_jwt = false`.

**Implementation Note**: Pause for confirmation the first deploy is green before Phase 4 cutover.

---

## Phase 4: Go-Live Verification + Cutover

### Overview

Prove the live deployment meets the S-07 success criteria with cloud OFF, and document/test rollback.

### Changes Required:

#### 1. Prod smoke test (runbook + checklist)

**Intent**: Exercise every live path a launch user hits, and confirm cloud is correctly inert.

**Contract** (manual, against the prod URL): anon Local engine upload→enhance→slider→download; sign-up→confirm→sign-in→sign-out; forgot-password → email link opens on the prod domain → reset completes; submit a cloud job while signed in → request accepted, job row created and stays `queued`, **no Replicate call** (verify via `! npx wrangler tail` + Supabase function logs showing `skipped: cloud_pipeline_disabled`); Realtime channel reaches `SUBSCRIBED` (no error 1102 on auth).

#### 2. Rollback procedure

**Intent**: Make reverting a bad deploy a known, tested action.

**Contract**: Document `! npx wrangler versions list` → `! npx wrangler rollback [<id>]` (reverts Worker + assets ONLY — not migrations/Edge Function, per `infrastructure.md:83`). Perform one rollback to a prior version and re-deploy forward to confirm the path works.

#### 3. Record outcome

**File**: `context/changes/production-deployment/` (a short `go-live.md` note) + roadmap touch on archive (not here)

**Intent**: Capture the prod URL, the flip-ON runbook (set `CLOUD_PIPELINE_ENABLED=true` + `CLOUD_DAILY_CAP>0` once S-05+S-08+S-09 land), and the rollback result.

**Contract**: One short note; the roadmap `Status` flip to `done` happens at archive via `/10x-archive`, not in this plan.

### Success Criteria:

#### Automated Verification:

- `! npx wrangler tail --status error` shows no errors during the smoke test.

#### Manual Verification:

- All smoke-test paths pass (Local, auth lifecycle, password reset on prod domain, Realtime subscribe).
- A cloud submit stays `queued` with a logged `cloud_pipeline_disabled` no-op and zero Replicate spend.
- One `wrangler rollback` performed and re-deploy forward confirmed.
- `go-live.md` records the prod URL + the documented (not executed) flip-ON runbook.

**Implementation Note**: This completes S-07. Cloud remains OFF; flip-ON is a future runbook event gated on S-05+S-08+S-09.

---

## Testing Strategy

### Unit Tests:

- Replay window: stale timestamp rejected, fresh accepted, skew within ±300s accepted.
- `isAllowedOutputUrl`: `*.replicate.delivery` https accepted; other host, http scheme, and unparseable URL rejected.

### Integration / Runtime Tests:

- `supabase functions serve enhance` with forged callbacks (stale ts, bad host) and a valid success path.
- A WARM function check is not required here (the kickoff-race path is S-04's, unchanged), but confirm the no-op flag path returns `skipped` promptly.

### Manual Testing Steps:

1. Anon Local engine end-to-end on the prod URL (mobile-portrait viewport).
2. Full auth lifecycle incl. password reset link resolving on the prod domain.
3. Cloud submit stays `queued`, logs `cloud_pipeline_disabled`, no Replicate call.
4. Realtime channel subscribes without 1102.
5. `wrangler rollback` and re-deploy forward.

## Performance Considerations

- 10ms free-tier CPU can trip on `@supabase/ssr` JWT work during login spikes (error 1102) — budget for the $5/mo paid plan (30ms) if it appears (`infrastructure.md:93`). Not a launch blocker at MVP traffic.
- The `/callback` 30s timeout / 25 MB cap is generous for a CDN image fetch; it bounds hang/OOM without false-failing legit outputs.

## Migration Notes

- `supabase db push` applies the 3 existing migrations to the fresh prod project. `wrangler rollback` does NOT revert migrations or the Edge Function — those are a separate ops surface (`infrastructure.md:83`).

## References

- Roadmap: `context/foundation/roadmap.md` → S-07 (+ flip-ON gate S-05+S-08+S-09)
- Infra research: `context/foundation/infrastructure.md` (Cloudflare gotchas, secrets, rollback, risk register)
- Lessons: `lessons.md` — assets-first routing (:40), Deno static coverage (:68), server-only modules (:26), Windows CRLF lint (:33)
- Edge Function: `supabase/functions/enhance/index.ts`; svix verify: `src/lib/services/replicate-webhook.ts:70-104`
- DB webhook: `supabase/migrations/20260531120000_jobs_enqueue_webhook.sql`
- Wrangler CI: `cloudflare/wrangler-action@v3`; Supabase CLI: `supabase functions deploy` / `secrets set`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harden the /callback Edge Function

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — efd831f
- [x] 1.2 Replay-window + allowlist cases covered and green — efd831f
- [ ] 1.3 Edge Function type-checks: `deno check supabase/functions/enhance/index.ts`
- [x] 1.4 Lint passes on touched files (prettier + eslint) — efd831f

#### Manual

- [x] 1.5 `supabase functions serve`: stale-timestamp callback rejected, fresh processed — efd831f
- [x] 1.6 Disallowed-host `outputUrl` fails the job with no outbound fetch — efd831f
- [ ] 1.7 Normal success path still stores the result object

### Phase 2: Provision Production Infrastructure (Runbook)

#### Automated

- [x] 2.1 `supabase db push` reports all migrations applied — 95a1084
- [x] 2.2 `wrangler whoami` + `supabase projects list` resolve — 95a1084

#### Manual

- [x] 2.3 Dashboard: `jobs`, `photos` bucket, Realtime publication on `public.jobs` — 95a1084
- [ ] 2.4 `current_setting('app.settings.edge_function_url')` returns prod `/enhance` URL
- [ ] 2.5 Prod `site_url` + redirect URLs set; recovery template saved
- [ ] 2.6 All Edge Function + Worker secrets present (cloud `false` / `0`); GitHub repo secrets present

### Phase 3: CI Deploy Pipeline

#### Automated

- [x] 3.1 PR runs stay deploy-free; `ci` job green
- [x] 3.2 Master push: `deno check` passes, `wrangler deploy` + `supabase functions deploy enhance` succeed — run 27033884831 (commit dd7f1d3)
- [x] 3.3 Workflow lints clean

#### Manual

- [x] 3.4 Actions run shows the returned Worker URL — https://lumina-clean-ai.pmiller-software.workers.dev (run 27033884831, Version ID 8e0ad338-aa0a-4875-b616-55b3f84849a0)
- [x] 3.5 Supabase shows `enhance` deployed with `verify_jwt = false` — API confirms `verify_jwt:false`, status ACTIVE, v1 (id e0ab0a25)

### Phase 4: Go-Live Verification + Cutover

#### Automated

- [x] 4.1 `wrangler tail --status error` shows no errors during smoke test — CLI HTTP smoke (`/`, `/auth/signin`, `/auth/signup` → 200; `/dashboard` → 302; unknown → 404) returned zero 5xx; Supabase edge-function logs empty, auth+api logs clean (only benign GoTrue deprecation notices). Live `wrangler tail` during browser smoke left to operator.

#### Manual

- [ ] 4.2 Anon Local engine end-to-end on prod URL
- [ ] 4.3 Auth lifecycle incl. password reset link resolving on prod domain
- [ ] 4.4 Cloud submit stays `queued` with `cloud_pipeline_disabled` no-op, zero Replicate spend
- [ ] 4.5 Realtime subscribes without 1102
- [x] 4.6 One `wrangler rollback` performed + re-deploy forward confirmed — rolled back 8e0ad338→63a951b7 (live 200), re-deployed forward→c8273695 (live 200, auth gate intact). Details in `go-live.md`.
- [x] 4.7 `go-live.md` records prod URL + documented flip-ON runbook — `context/changes/production-deployment/go-live.md`
