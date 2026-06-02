---
date: 2026-05-31T00:00:00Z
researcher: Piotr Miller
git_commit: 0af05bdce0b43f290f2b5392ab1ce2ed8af431b7
branch: master
repository: lumina-clean-ai
topic: "S-04 cloud-ai-realtime-result — async Replicate pipeline + Realtime result delivery (north star)"
tags: [research, codebase, edge-functions, database-webhooks, replicate, realtime, supabase-storage, north-star]
status: complete
last_updated: 2026-05-31
last_updated_by: Piotr Miller
last_updated_note: "Internal codebase research + external research (Replicate predictions/webhooks + Bread model via Context7/exa; Supabase Edge Functions/Database Webhooks/Realtime)"
---

# Research: S-04 `cloud-ai-realtime-result` (north star)

**Date**: 2026-05-31T00:00:00Z
**Researcher**: Piotr Miller
**Git Commit**: 0af05bdce0b43f290f2b5392ab1ce2ed8af431b7
**Branch**: master
**Repository**: lumina-clean-ai

## Research Question

What does the codebase already provide for roadmap slice **S-04** (`cloud-ai-realtime-result`, the north star), and what must be built — the async pipeline (Database Webhook → Supabase Edge Function → Replicate "Bread" prediction with webhook callback) that updates the job row and pushes the enhanced result to the browser via Supabase Realtime, rendering it in the before/after slider with download, within ~30s p95? Plus external research on Replicate + Supabase Edge Functions / Database Webhooks / Realtime.

## Summary

S-04 is the **largest new backend surface in the MVP** and the riskiest slice, but the landing zone is well-prepared. F-01 pre-wired the data layer (jobs table with `replica identity full` + `supabase_realtime` membership, `markJobSucceeded`, the status enum) and S-03 leaves a `queued` job + source in the private `photos` bucket. **Nothing of the pipeline itself exists yet:** no `supabase/functions/`, no Database Webhook, no Replicate integration, and no browser-side Supabase client.

The end-to-end flow S-04 must build:
1. S-03's `queued` job-row insert fires a **Database Webhook** (pg_net, async) → POSTs to a **Supabase Edge Function**.
2. The Edge Function sets the job `processing`, mints a **signed READ URL for the source** (Replicate must fetch a public URL; the source is private), calls `replicate.predictions.create({ version: <bread>, input, webhook: <callback>, webhook_events_filter: ["completed"] })`, and stores `replicate_prediction_id`.
3. Replicate runs Bread (~3s typical), then calls back the **webhook**; the handler verifies the signature, downloads the `output` URL, uploads it to `photos` as the result, and calls `markJobSucceeded` (status→`succeeded`, `result_path`, `completed_at`, deletes source) or `markJobFailed`.
4. The `jobs` UPDATE is pushed via **Supabase Realtime** to the browser, which (subscribed with `realtime.setAuth(jwt)`) mints a signed READ URL for `result_path` and renders it in the existing `BeforeAfterSlider` + `DownloadButton`.

**The central risk (PRD Open Question #2) is substantially de-risked by external research:** `mingcv/bread` runs on a T4 GPU and "predictions typically complete within **3 seconds**" at ~$0.0006/run — leaving large headroom under the ≤30s p95. Cold-start of an idle model remains the one thing to *measure* early, but warm latency is a non-issue.

**The single thorniest internal decision:** how the browser obtains the user's **access-token JWT** for the Realtime subscription. The session is cookie-only (`@supabase/ssr`, likely httpOnly) and the JWT is never exposed client-side today; lesson #3 requires `realtime.setAuth(jwt)` before subscribe or the RLS-scoped event silently never arrives. Plus the anon key + URL aren't exposed to the client at all (server-only secrets, per S-03). Both must be surfaced to the island (recommend: SSR page passes `supabaseUrl` + anon key + `session.access_token` as props, bundled with the existing `isAuthenticated` prop).

## Detailed Findings

### Area 1 — Inherited contract + data layer + result render (F-01 / S-03)

**Jobs table** (`supabase/migrations/20260528120000_create_jobs_table.sql`): enum `photo_job_status = queued|processing|succeeded|failed` (`:19-24`); columns S-04 fills: `status` transitions, `result_path`, `replicate_prediction_id`, `error_code`, `error_message`, `completed_at` (`:30-42`). `updated_at` is auto-touched by trigger `jobs_set_updated_at` (`:62-75`) — **S-04 must NOT set it manually**. `replica identity full` + `supabase_realtime` membership present (`:134-135`, lesson #2 ✓). RLS: `jobs_select_own` `using (user_id = auth.uid())` (`:84-88`) scopes the Realtime subscription; **no UPDATE/DELETE policy** (`:97-99`) → all S-04 mutations go through the **service-role** admin client. `PhotoJob` entity in `src/types.ts:16-28` is already complete (no missing column).

**Service helpers** (`src/lib/services/photo-job.service.ts`): `markJobSucceeded` exists (`:66-98`) — updates status/result_path/replicate_prediction_id/completed_at, then deletes the source object (the ≤24h-retention enforcement; orphan→console.warn). **Gaps S-04 must add:** `markJobProcessing` (queued→processing), `markJobFailed` (status=failed + error_code/message + completed_at; no source cleanup per v1), a **fetch-job-by-id** helper (returns `PhotoJob` — needed by the Edge Function to read `source_path`), and a **signed-READ-URL helper** for `source_path` (Replicate input) and `result_path` (client render). New DTOs: `MarkJobProcessingCommand`, `MarkJobFailedCommand` in `src/types.ts`.

**Result render reuse** (`src/components/enhance/EnhanceWorkspace.tsx`): the `cloudSubmit.status === "submitted"` branch (`:172-184`, comment "S-04 will replace this with the live result") is the seam — replace the static "Submitted…" copy with the Realtime-driven slider + download, mirroring the Local `done` branch (`:70-126`). `BeforeAfterSlider` needs `beforeSrc, afterSrc, width, height` (`:4-15`); `DownloadButton` needs `blob, filename` (`:4-10`). **Two render mismatches:** (a) the cloud result is a **URL, not a Blob** → `fetch(signedUrl).then(r => r.blob())` to keep `DownloadButton` unchanged; (b) the cloud result carries **no intrinsic width/height** → decode client-side (`new Image()` → `naturalWidth/Height`, the `useLocalEnhance.ts:22-33` pattern) since before/after dimensions match the source. `deriveDownloadName()` (`image-helpers.ts:83`) reused for the filename.

**Clients**: `createAdminClient(env)` (`src/lib/supabase-admin.ts:29-46`) — service-role, env-as-param (lesson #4), used by the Edge Function + any SSR mutation route. `createClient(headers, cookies)` (`src/lib/supabase.ts:9-28`) — SSR cookie client for session resolution.

### Area 2 — Client Realtime subscription + the client-env / signed-read seam

- **Client-env gap is total.** `SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` are all `context:"server", access:"secret"` (`astro.config.mjs:19-21`), imported only from `astro:env/server`; **no `astro:env/client`, no `PUBLIC_`, no browser supabase client anywhere**. The browser needs URL + anon key + the user JWT, and has none. The anon key is *publishable by design* (RLS-gated) — safe to ship to the client, unlike the service-role key. **Recommended:** the SSR `index.astro` passes `supabaseUrl` + anon key as island props (mirrors the existing `isAuthenticated={Boolean(user)}` at `index.astro:17`).
- **Realtime auth (lessons #2 + #3).** DB layer is ready (`replica identity full`, publication, `jobs_select_own`). The client must build a `@supabase/supabase-js` `createClient(url, anonKey)` (NOT `@supabase/ssr`), then **`await client.realtime.setAuth(jwt)` before `.subscribe()`** or the JWT-scoped UPDATE silently never arrives (lesson #3). Proven sequence in `scripts/f01-smoke.ts:60-93` + `tests/helpers/test-users.ts:43-51`: `.channel(...).on("postgres_changes", { event:"UPDATE", schema:"public", table:"jobs", filter:`user_id=eq.${userId}` }, cb).subscribe(...)`. The payload delivers `payload.new.status` + `payload.new.result_path`.
- **THORNIEST DECISION — where the browser gets the JWT.** The session is cookie-only (`@supabase/ssr`, httpOnly); `middleware.ts:10-13` puts only the `User` (not the token) on `locals`. No `getSession`/access-token exposure exists client-side. Options: **(i)** SSR page calls `supabase.auth.getSession()` and passes `session.access_token` as an island prop (simplest; token in HTML, ~1h lifetime ≫ the seconds-to-a-minute watch window); **(ii)** a `GET /api/auth/token` route the island fetches. Recommend (i) for MVP, bundled with the URL/anon-key props.
- **Private result → signed READ URL.** The Realtime event carries `result_path` (a storage key), not a URL; the `photos` bucket is private with `photos_select_own` `using (... (storage.foldername(name))[1] = auth.uid()::text)` (`20260528120100_create_photos_storage.sql:46-53`). The browser (with its user-JWT client) can mint the read URL directly via `client.storage.from("photos").createSignedUrl(result_path, ttl)` — **no new route needed**, RLS authorizes the owner. Short TTL (60–300s), re-mint on demand. Keep the result in the **same `photos` bucket** (path `{uid}/{jobId}/result.ext`; `markJobSucceeded` already deletes only `source.*`).
- **Subscription-hook seam.** `useCloudSubmit.ts:46` currently discards the `{ jobId }` that `submitCloudJob` returns (`cloud-upload.client.ts:68,91` — explicitly "used by S-04"). S-04 captures `jobId`, adds a `useCloudJob`/extended hook that subscribes, and on `succeeded`→ mints the read URL + renders, on `failed`→ surfaces `error_code/message`. **Lifecycle:** the new hook owns a Realtime **channel** (the leaky resource analogous to `useLocalEnhance`'s object URLs) — must `channel.unsubscribe()` on unmount + on `reset()` (`f01-smoke.ts:169` pattern); `handleReset` (`EnhanceWorkspace.tsx:53-57`) already calls `cloudSubmit.reset()`.

### Area 3 — Edge Function / DB Webhook / secrets / deploy surface (all net-new)

- **Absent:** `supabase/functions/` does not exist. `[edge_runtime]` IS present/enabled in `supabase/config.toml:365` (Deno); `[edge_runtime.secrets]` is commented at `:376`; **no `[functions.*]`, no Database-Webhook config**. `[realtime]`, `[storage]`, `[auth]` enabled.
- **Database Webhook** = a convenience wrapper around a Postgres trigger using **pg_net** (async, non-blocking) — events INSERT/UPDATE/DELETE fired AFTER the row change, as POST+JSON. S-04 adds a webhook (or a trigger calling `net.http_post`) on `jobs` INSERT (status=queued) → targets the Edge Function. **Local gotcha:** Postgres runs in Docker, so the webhook URL must be `http://host.docker.internal:54321/functions/v1/<fn>` (not `localhost`); prod is `https://<project>.supabase.co/functions/v1/<fn>`.
- **Secrets — a 4th mechanism.** Edge Functions have their OWN secret store (`supabase secrets set …`), separate from Cloudflare Worker secrets (`wrangler secret put` / `.dev.vars`) and Astro `astro:env`. S-04 adds `REPLICATE_API_TOKEN` + `REPLICATE_WEBHOOK_SIGNING_SECRET` to the Edge Function store; `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are **auto-injected** into the Edge Function runtime (`Deno.env.get(...)`). Add placeholders to `.env.example` (currently 3 keys).
- **Two ops surfaces.** Frontend deploys via `wrangler` (`npm run build && wrangler deploy`); the pipeline deploys via the **supabase CLI** (`supabase functions deploy <fn>`, `supabase functions serve` locally) — `supabase` ^2.23.4 is already a devDependency. CI (`.github/workflows/ci.yml`) is lint+build only (no deploy of either surface). `wrangler.jsonc` keeps assets-first routing (no `run_worker_first`, lesson #6) + `disable_nodejs_process_v2`.
- **`replicate` npm is NOT installed** — irrelevant to the Edge Function (Deno imports via URL, e.g. `esm.sh`); only relevant if the webhook-callback handler lives on the Cloudflare Worker side.

## Code References

- `supabase/migrations/20260528120000_create_jobs_table.sql:19-24,30-42,62-75,84-99,134-135` — enum, columns S-04 fills, updated_at trigger, RLS (select-own; no update/delete), realtime publication + replica identity
- `supabase/migrations/20260528120100_create_photos_storage.sql:22-29,46-53` — private bucket + `photos_select_own` read RLS + `{uid}/{jobId}/…` path convention
- `src/lib/services/photo-job.service.ts:66-98` — `markJobSucceeded` (the S-04 success contract + 24h source delete); gaps: no `markJobProcessing`/`markJobFailed`/fetch-by-id/signed-read helpers
- `src/types.ts:16-28,59-64` — `PhotoJob` (complete), `MarkJobSucceededCommand`; needs `MarkJobProcessing/FailedCommand`
- `src/components/enhance/EnhanceWorkspace.tsx:172-184` — the "submitted" terminal S-04 replaces; `:70-126` Local result pattern to mirror
- `src/components/enhance/BeforeAfterSlider.tsx:4-15` / `DownloadButton.tsx:4-10` — render props (URL+width/height; Blob+filename)
- `src/components/hooks/useCloudSubmit.ts:46` — discards `jobId`; subscription-hook seam. `useLocalEnhance.ts:22-33,56-65` — image decode + URL/channel lifecycle discipline
- `src/lib/supabase-admin.ts:29-46` / `src/lib/supabase.ts:9-28` — admin vs SSR client
- `astro.config.mjs:19-21` — server-only secrets (the client-env gap); `src/middleware.ts:10-13` — user (not token) on locals; `src/pages/index.astro:5,17` — island-prop seam
- `supabase/config.toml:365,376` — `[edge_runtime]` enabled, `[edge_runtime.secrets]` commented
- `scripts/f01-smoke.ts:60-93,140,151-155,169` / `tests/helpers/test-users.ts:43-51` — proven subscribe + setAuth + unsubscribe + result-path payload

## Architecture Insights

- **Service-role for writes, user-JWT for reads/Realtime.** The Edge Function (service role, BYPASSRLS) is the only writer of job status/result. The browser subscribes + mints signed read URLs under the user's JWT (RLS authorizes own rows/objects). This split is already enforced by the schema (no user UPDATE policy).
- **Replicate needs a fetchable source URL.** Bread's `image` input is a URL; the source is private. The Edge Function must mint a short-TTL signed READ URL for `source_path` and pass it as the input — a new requirement not covered by F-01's upload-only signing.
- **Two webhook hops, two terminal transitions.** Webhook #1 = the Supabase Database Webhook (DB→Edge Function, starts the prediction). Webhook #2 = Replicate→callback (finishes it). The callback handler can be a second Edge Function endpoint (keeps the pipeline on the Supabase ops surface) or a Cloudflare `/api/webhooks/replicate` route — a plan decision. `webhook_events_filter: ["completed"]` keeps it to terminal events.
- **Failure/timeout path is mandatory** (infra pre-mortem): if Replicate never calls back, the job sits `processing` forever with no user-facing error. Need a timeout/dead-letter (e.g. mark `failed` after N seconds) + the client showing the `failed` state. The before/after slider + download already exist; the new surface is the *waiting* and *error* UX.
- **Cost is structurally unbounded until S-05** — keep S-04 behind a flag / non-public until the daily cap ships (roadmap note).

## External Research (2026-05-31)

Sources: Replicate JS client docs via Context7 (`/replicate/replicate-javascript`), the Bread model pages + Supabase docs via exa.ai.

### Replicate "Bread" model — `mingcv/bread`

- **Model + pinned version:** `mingcv/bread`, version `057a4e073829a8c50f2622206f71a8ed25331cd07a520bc264469389c7c11e54` ([api page](https://replicate.com/mingcv/bread/versions/057a4e07.../api)). Pin the version hash (it's an older 2023 community model — the roadmap's "Bread availability/behavior" blocker stands; pinning mitigates drift).
- **Input schema:** `image` (uri), `gamma` (number, default 1, **max 1.5**, brightness), `strength` (number, default 0.05, **max 0.2**, denoising). **Output:** a single **URI string** (the enhanced image URL on `replicate.delivery`).
- **Latency + cost (DE-RISKS PRD Open Question #2):** runs on **Nvidia T4**, "predictions typically complete within **3 seconds**", ~**$0.0006/run** (1666 runs/$1). Warm latency leaves ~27s of headroom under the ≤30s p95. **Only cold-start (idle-model boot) needs an early measurement** — but the warm path is comfortably within budget. `gamma`/`strength` map naturally to the local engine's gamma intuition.
- **⚠ Verify during the spike:** the `image` field is labelled "Grayscale input image" on the API page, yet the model is the low-light **photo** enhancer. Confirm it accepts a color JPG/PNG and returns a usable color result before committing (could need a format/mode decision). Flagged as an open question.

### Replicate async predictions + webhooks (JS client)

- **Create async prediction:** `replicate.predictions.create({ version, input, webhook: <callbackURL>, webhook_events_filter: ["completed"] })` returns immediately with `{ id, status, urls.get, … }`. Store `id` as `replicate_prediction_id`. (Deno Edge Function imports the client via `esm.sh`, or calls `POST /v1/predictions` with raw `fetch` + `Authorization: Bearer <token>`.)
- **Webhook payload on completion:** `{ id, status: "succeeded"|"failed", output, error, … }` — for Bread, `output` is the result URI string.
- **Signature verification:** Replicate signs every webhook; the JS client exposes `validateWebhook(request, secret)` (secret = `REPLICATE_WEBHOOK_SIGNING_SECRET`), which verifies the `webhook-id`/`webhook-timestamp`/`webhook-signature` (svix-style HMAC-SHA256) headers. Works with a `Request` object in Deno/Edge. The handler must read the **raw body** for verification before parsing.
- `webhook_events_filter: ["completed"]` avoids `start`/`output`/`logs` noise — one terminal callback.

### Supabase Edge Functions / Database Webhooks / Realtime (the proven 2025 pattern)

- **Database Webhooks** ([docs](https://supabase.com/docs/guides/database/webhooks)) are a wrapper around triggers using **pg_net** (async). Local: target `http://host.docker.internal:54321/functions/v1/<fn>` (Postgres-in-Docker can't see host `localhost`).
- **Edge Function webhook handler** (Deno) — canonical shape (ModelRiver/Supabase examples): `serve(async (req) => { … })`, verify HMAC with Web Crypto `crypto.subtle.importKey/sign`, build a service-role client `createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))` (bypasses RLS for the write), update the row, return 200. Deploy `supabase functions deploy <fn>`; secrets `supabase secrets set …`.
- **Webhook → DB → Realtime** is the documented event-driven-AI pattern: the function writes to Postgres and Realtime pushes to subscribed clients. RLS gates which clients receive what; service role is server-only (never client). Confirmed RLS gotcha: an external webhook has no authed user, so the write MUST use the service-role key (StackOverflow `42501` — exactly why our jobs table has no user UPDATE policy).
- **Frontend Realtime:** `createClient(URL, ANON_KEY).channel(...).on("postgres_changes", { event, schema, table }, cb).subscribe()` + `removeChannel(channel)` on cleanup — matches our `f01-smoke.ts` precedent (plus the mandatory `setAuth(jwt)` from lesson #3 for JWT-scoped rows).

## Historical Context (from prior changes)

- `context/foundation/infrastructure.md:64-69,96,98` — Pre-Mortem: the Edge Function + Replicate webhook chain is the **un-runbooked fragility** ("when a webhook silently failed, results stopped appearing with no error surfaced and no runbook"); Risk Register rows on webhook-failure handling (M/H) and cold-start vs ≤30s p95 (M/M), plus the "Cloudflare hosts only the frontend; the pipeline is a separate Supabase ops surface" point.
- `context/foundation/prd.md:110-121,184` — FR-009/010/011/012 + Open Question #2 (cold-start vs ≤30s p95).
- `context/foundation/roadmap.md:119-131` — S-04 block: outcome, blocker (Bread availability), unknowns (cold-start, webhook-failure UX), the cost-uncapped-until-S-05 note, and the suggested (a) pipeline / (b) realtime+render split.
- `context/archive/2026-05-28-photo-jobs-data-and-storage/plan.md:27,35,45,65` — F-01 explicitly left the Edge Function / Replicate / Database Webhook to S-04; the `markJobSucceeded` on-success retention contract is the S-04 caller's; failed-job source cleanup out of scope v1.
- `idea-notes.md:14,22,24` — the async pipeline description; non-goals: magic-bytes validation in Edge Functions, pg_cron retention cleanup.
- `context/foundation/lessons.md:12-24` — #2 (replica identity full ✓ done) and #3 (`realtime.setAuth` — the client-subscribe constraint).

## Related Research

- `context/archive/2026-05-31-gated-cloud-upload/research.md` — S-03 research (the client-env / server-only-secret finding that S-04's Realtime subscription must solve; the raw-PUT signed-URL pattern).
- `context/archive/2026-05-28-photo-jobs-data-and-storage/research.md` — F-01 data-layer research (jobs/RLS/realtime/storage).

## Open Questions

1. **Cold-start vs ≤30s p95 (PRD OQ#2).** Warm Bread ≈3s (de-risked). Measure idle-model cold boot once on the real model; if it ever threatens the budget, the roadmap's options stand (warm-up / model swap / relax SLA). Owner: early spike.
2. **Bread color/format.** API labels `image` "Grayscale input image" while it's a photo enhancer — verify it accepts color JPG/PNG and returns a usable color result; decide input handling. Owner: integration spike.
3. **Where the webhook-callback handler lives** — a 2nd Supabase Edge Function endpoint (keeps pipeline on the Supabase surface, service-role local) vs a Cloudflare `/api/webhooks/replicate` route. Plan decision.
4. **One Edge Function vs two** — one "start prediction" (DB-webhook-triggered) + one "callback" handler; or a single function routed by path/method. Plan decision.
5. **JWT-to-client mechanism** (the thorniest) — SSR page prop (recommended, MVP) vs a token route. Determines whether the subscription authenticates at all (lesson #3).
6. **Timeout / dead-letter** — what marks a stuck `processing` job `failed`, and the waiting/error UX. Needs a concrete mechanism (Edge Function timeout? a pg_cron sweep is a non-goal; a client-side timeout that calls a "mark failed" route?).
7. **Feature-flagging S-04** until S-05's daily cap lands (cost is uncapped) — how (env flag? non-public route?).
8. **Signed-read TTL** for source (Replicate fetch) and result (client render) — pick values; re-mint on demand for the result.
