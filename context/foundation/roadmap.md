---
project: LuminaClean AI
version: 1
status: draft
created: 2026-05-26
updated: 2026-07-09
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: LuminaClean AI

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline (2026-05-26).
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.
> **Phase tag:** every Foundation/Slice carries a `- **Phase:**` field — `phase:mvp` (the launch scope, fully delivered 2026-06-08) or `phase:post-mvp` (hardening / iteration added after launch). New slices must set it.

## Vision recap

Mobile night and low-light photos come out dark and grainy, and the existing fix (transfer to desktop, install editing software, learn the sliders) has so much workflow friction that most people just give up. LuminaClean AI removes the workflow entirely: upload a photo, see it fixed. The bet — the **core hypothesis**, i.e. the single assumption the whole product rides on — is that AI denoising/exposure models are now good enough for casual use, delivered as a one-click cloud enhancement, with a rough client-side engine as the free fallback and acquisition funnel.

## North star

**S-04: a signed-in user sees their Cloud-AI-enhanced photo appear in real time, without refreshing.** This is the validation milestone because it is the smallest end-to-end flow that proves the core hypothesis — that the cloud model produces a visibly better result and the async pipeline can deliver it within the latency budget.

> "North star" here means: the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as its Prerequisites allow, because everything else only matters if this works. Sequencing bias is `main_goal: market-feedback` (risk-first): the async Replicate pipeline + cold-start question is the **riskiest assumption** (the one unvalidated belief most likely to sink the product), so the order drives toward it rather than deferring it.

## At a glance

| ID   | Change ID                         | Outcome (user can …)                                                                                                                      | Prerequisites    | PRD refs                                                   | Status |
| ---- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------- | ------ |
| F-01 | photo-jobs-data-and-storage       | (foundation) private photo storage + job records with RLS in place                                                                        | —                | NFR: private source / 24h retention; Access Control        | done   |
| S-01 | local-engine-enhance-flow         | upload a photo, enhance it locally, compare before/after, download                                                                        | —                | US-02; FR-001, FR-005, FR-008, FR-011, FR-012              | done   |
| S-02 | account-access-and-password-reset | sign up, sign in, sign out, and reset a forgotten password                                                                                | —                | FR-002, FR-003, FR-004, FR-015                             | done   |
| S-03 | gated-cloud-upload                | switch to Cloud AI (sign-in gated) and submit a photo for processing                                                                      | F-01, S-01       | US-01; FR-005, FR-006, FR-007                              | done   |
| S-04 | cloud-ai-realtime-result          | see the Cloud-AI result pushed in real time, before/after + download                                                                      | S-03             | US-01; FR-009, FR-010, FR-011, FR-012                      | done   |
| S-05 | cloud-daily-cap                   | get a clear message when the global daily cloud cap is reached                                                                            | S-04             | FR-014                                                     | done   |
| S-06 | account-session-ux                | sign out from anywhere; never land on the login form while already signed in                                                              | S-02             | FR-004; session-hygiene NFR                                | done   |
| S-07 | production-deployment             | use the live app on Cloudflare (Local + auth public; cloud behind a flag)                                                                 | S-04             | MVP success: deployed & accessible                         | done   |
| S-08 | cloud-job-retention-cleanup       | trust uploaded sources are gone within 24h even on failed/abandoned jobs                                                                  | F-01, S-04       | NFR: source not retained beyond 24h                        | done   |
| S-09 | cloud-source-url-ttl-fix          | (reliability) cloud jobs survive a slow Replicate cold boot without source-URL expiry                                                     | S-04             | MVP success: cloud flow works end-to-end (NFR reliability) | done   |
| S-10 | retention-reaper                  | (post-MVP hardening) sources stay gone within 24h even for legacy/abandon-never-return/best-effort-fail jobs — scheduled pg_cron backstop | F-01, S-08, S-07 | NFR: source not retained beyond 24h (backstop)             | done   |
| S-11 | bread-chroma-postpass             | (post-MVP quality) get cleaner shadow colors from Bread without sacrificing luminance detail                                              | S-04, S-07       | Post-MVP cloud enhancement quality                         | done   |
| S-12 | adaptive-enhancement-parameters   | (post-MVP UX/quality) tune Local or Bread in a right-side panel, start from Auto recommendations, and override any slider manually        | S-01, S-04       | Post-MVP enhancement control; extends US-01, US-02         | done   |

> **Status (2026-06-08): MVP live on luminacleanai.com with Cloud AI ON.** All slices F-01–S-09 are done and the S-05 + S-08 + S-09 flip-ON gate has cleared via **D.1** (`cloud-flip-on-revalidation`): `CLOUD_PIPELINE_ENABLED=true`, `CLOUD_DAILY_CAP=3` (kill-switch `=0`), webhook config moved GUC→Vault. The roadmap's MVP scope is fully delivered — see `## Done`.

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                          | Chain                             | Note                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Cloud AI path (the core bet)   | `F-01` → `S-03` → `S-04` → `S-05` | Risk-first spine; surfaces the pipeline + cold-start risk at `S-04` (north star). Reuses Stream B's UI shell at `S-03`. `S-08` (24h-retention cleanup) and `S-09` (source-URL TTL fix) both hang off this spine — prereq `F-01`/`S-04` (S-09: `S-04`), independent of and parallel with `S-05`. |
| B      | Local engine & shared UI shell | `S-01`                            | Anonymous funnel + builds the upload / before-after slider / download shell reused by `S-03`. Joins Stream A at `S-03`.                                                                                                                                                                         |
| C      | Account access                 | `S-02` → `S-06`                   | Auth-completion + UX polish (global sign-out, redirect authed off `/auth/*`, optional idle-timeout). Independent of the Cloud path; parallel with everything.                                                                                                                                   |
| D      | Release / infra                | `S-07`                            | Production deployment / go-live on Cloudflare + prod Supabase. Prereq `S-04`; shipped cloud behind a flag (OFF until `S-05`, `S-08`, **and** `S-09`). **Flip-ON executed 2026-06-08 (D.1) — cloud now LIVE** (`CLOUD_DAILY_CAP=3`). Parallel with `S-05` and `S-06`.                            |

> **Planned execution (2026-06-03; updated 2026-06-04):** the one concurrent pair is **S-05 ∥ S-06** (zero shared files → collision-free). **S-07** then **S-08** follow **sequentially** — both touch the Edge Function `/callback`, so they are deliberately not parallelized with each other. **S-09** (source-URL TTL fix) is independent of `/callback` (it touches the source-signing path) and so does not collide with S-07/S-08, but it is a **go-live prerequisite for the cloud path**: it must land and re-validate before `CLOUD_PIPELINE_ENABLED` flips ON (alongside S-05 and S-08 in that flip-ON gate). (The `Parallel with` fields in each slice denote dependency-independence — what _could_ run together — not the chosen order.)

## Baseline

What's already in place in the codebase as of `2026-05-26` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present (framework) / absent (product UI) — Astro 6 + React 19 + Tailwind 4 + shadcn/ui scaffold (`package.json`, `src/components/ui/`). Zero product features: no upload, engine toggle, local engine, slider, or download anywhere in `src/`.
- **Backend / API:** partial — only auth endpoints (`src/pages/api/auth/{signin,signout,signup}.ts`); no zod validation, no `src/lib/services/`, no product API routes.
- **Data:** absent — no `supabase/migrations/`, no application tables (jobs/photos/usage), no active Storage bucket (`supabase/config.toml` has commented-out examples only), no entity types in `src/types.ts`.
- **Auth:** partial — SSR client (`src/lib/supabase.ts`), middleware with `PROTECTED_ROUTES=["/dashboard"]` (`src/middleware.ts`), sign-in/up/out endpoints and auth pages present; **password reset (FR-015) absent**.
- **Deploy / infra:** present — `wrangler.jsonc` with `disable_nodejs_process_v2` and `observability.enabled: true`; CI (`.github/workflows/ci.yml`) runs lint+build only (no deploy step). (`run_worker_first: true` was in the 2026-05-26 baseline but was removed in `dev-server-vite-assets-404` — it routed Vite's dev asset requests through the workerd SSR app, breaking client-asset serving and React island hydration under `npm run dev`.)
- **Observability:** partial — platform-level `observability.enabled` is set; no app-level logging or error-tracking library.

## Foundations

### F-01: Photo storage + job records (private, RLS-gated)

- **Phase:** `phase:mvp`
- **Outcome:** (foundation) a private Supabase Storage bucket and a jobs/predictions table exist with per-user RLS, signed-upload capability, a 24-hour source-retention policy, and shared entity/DTO types in `src/types.ts`. Not user-visible on its own.
- **Change ID:** photo-jobs-data-and-storage
- **PRD refs:** NFR (uploaded source not retrievable by others; source not retained beyond 24h); Access Control (Anonymous vs User tiers; cloud gated to signed-in users)
- **Unlocks:** S-03 (gated cloud upload writes to this bucket + creates a job row), S-04 (the pipeline reads the job, the Realtime push subscribes to job-row updates). Also reduces the "where is the cloud daily cap enforced" unknown for S-05 (cap counts rows on an RLS-gated table).
- **Prerequisites:** —
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the "invest deeply" data layer (per the framing interview): privacy and 24h retention are launch guardrails, so RLS correctness and bucket privacy must be right before any cloud upload path touches them. Sequenced first because the entire Cloud AI path depends on it; getting RLS wrong here is the most expensive thing to discover late.
- **Status:** done

## Slices

### S-01: Local engine end-to-end (anonymous)

- **Phase:** `phase:mvp`
- **Outcome:** an anonymous visitor can upload a photo (JPG/PNG), run the client-side Local engine (Canvas gamma correction + Gaussian blur), compare the result against the original with a before/after slider, and download it — entirely in the browser, no network round-trip after load.
- **Change ID:** local-engine-enhance-flow
- **PRD refs:** US-02; FR-001, FR-005, FR-008, FR-011, FR-012; NFR (Local result visible within ~2s on a 12MP photo; mobile-portrait usable)
- **Prerequisites:** —
- **Parallel with:** F-01, S-02, S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - HEIC decoding strategy (PRD Open Question #1) — Owner: TBD (early spike). Block: no. Ship JPG/PNG first; HEIC via detect-and-reject or a client polyfill can follow without blocking this slice.
  - Does gamma + Gaussian blur read as "less noisy" rather than just "blurrier"? (FR-008 Socrates note) — Owner: TBD (visual spike). Block: no. Local is intentionally rough; it only needs a visible improvement.
- **Risk:** Lowest-risk slice, sequenced first because it has zero prerequisites and builds the shared UI shell (upload control, before/after slider, download) that S-03/S-04 reuse — building it once here avoids duplicating it on the cloud path. Also delivers a Secondary success criterion and the anonymous-acquisition funnel, so it is not throwaway pre-pipeline work.
- **Status:** done

### S-02: Account access — sign-up, sign-in, sign-out, password reset

- **Phase:** `phase:mvp`
- **Outcome:** a visitor can create an account with email + password, sign in and out, and recover a forgotten password via an email-based reset flow.
- **Change ID:** account-access-and-password-reset
- **PRD refs:** FR-002, FR-003, FR-004, FR-015; NFR (a few mistyped passwords don't lock out a legit user, but credential stuffing at scale is rejected)
- **Prerequisites:** —
- **Parallel with:** F-01, S-01, S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** Sign-up/in/out are already present in the baseline; this slice's real work is the absent password-reset flow (FR-015) plus verifying the credential-stuffing NFR. Kept as one slice because it completes a single capability — account access — and is fully independent (parallel with the entire cloud path), so it can be picked up whenever a low-risk, self-contained unit of work is wanted.
- **Status:** done

### S-03: Gated Cloud AI submission

- **Phase:** `phase:mvp`
- **Outcome:** a user can switch the engine toggle to Cloud AI (anonymous visitors are prompted to sign in, never silently denied), and a signed-in user can submit the loaded photo for cloud processing — the source is uploaded to the private bucket and a job record is created.
- **Change ID:** gated-cloud-upload
- **PRD refs:** US-01; FR-005, FR-006, FR-007; NFR (source not publicly readable)
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - HEIC decoding for the cloud upload path (PRD Open Question #1) — Owner: TBD (shared with S-01). Block: no.
  - Replicate API token / account provisioning — Owner: user/team (self-resolvable, so an unknown, not a blocker). Block: no.
- **Risk:** Depends on S-01 for the upload/toggle UI shell and on F-01 for private storage + job records. The engine toggle (FR-006) only becomes meaningful once both engines coexist, so it lands here as Cloud joins Local. Splitting the cloud vertical at the upload boundary keeps this plannable and isolates the storage/RLS/gating concerns from the riskier pipeline in S-04.
- **Status:** done

### S-04: Cloud AI result delivered in real time (NORTH STAR)

- **Phase:** `phase:mvp`
- **Outcome:** once a photo is submitted, the async pipeline (Database webhook → Supabase Edge Function → Replicate prediction with webhook callback) runs, and the enhanced result is pushed to the page via Supabase Realtime — appearing in the before/after slider with download, no manual refresh — within ~30s p95.
- **Change ID:** cloud-ai-realtime-result
- **PRD refs:** US-01; FR-009, FR-010, FR-011, FR-012 (slider + download reused from S-01); NFR (≤30s p95 end-to-end; source not retained beyond 24h)
- **Prerequisites:** S-03
- **Parallel with:** S-02
- **Blockers:** Replicate "Bread" model availability and behavior (third-party inference) — external, outside the team's unilateral control.
- **Unknowns:**
  - Cloud model cold-start vs the ≤30s p95 guardrail (PRD Open Question #2) — Owner: TBD (measure on the real model early). Block: no, but this is the central risk: if violated, choose a warm-up strategy, a model swap, or relax the SLA.
  - Async webhook chain failure handling — what the user sees if a webhook never returns (infrastructure.md pre-mortem) — Owner: TBD. Block: no. Needs a timeout/dead-letter path + a user-facing error.
- **Risk:** This is the riskiest assumption and the north star — sequenced as early as its prerequisites allow so the pipeline + cold-start question is answered before more is built on top. The pipeline runs on Supabase (a separate ops surface from the Cloudflare frontend), so its failure modes need their own runbook. **Cost note:** until S-05 lands, real Replicate calls are uncapped — keep this slice behind a flag / non-public until the cap ships immediately after. `/10x-plan` will likely split this into (a) pipeline + Replicate integration and (b) Realtime push + result render.
- **Status:** done

### S-05: Cloud cost protection — global daily cap

- **Phase:** `phase:mvp`
- **Outcome:** a Cloud AI request that would exceed the global daily cap is rejected before the cloud model is invoked, with a clear user-facing message; the bill is structurally bounded.
- **Change ID:** cloud-daily-cap
- **PRD refs:** FR-014; Access Control (cloud gated to signed-in users within the cap)
- **Prerequisites:** S-04
- **Parallel with:** S-02, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Where the cap is enforced — SQL count on an RLS-gated table vs a check inside the Edge Function — Owner: TBD. Block: no. **Recommendation:** enforce in the `create-job` route (pre-insert `COUNT`), not the Edge Function — it rejects before any storage/model work AND keeps S-07's `/callback` hardening and S-08's `markJobFailed` cleanup collision-free (S-05 then only adds a count helper in `photo-job.service.ts`, a different function).
- **Risk:** You cannot cap an invocation path that doesn't exist yet, so this follows S-04 — but it should land immediately after, because cloud cost is unbounded in the gap. Per-user limits are explicitly out of scope (v2); v1 enforces only this global cap plus the provider billing alert as backstop.
- **Status:** done

### S-06: Account / session UX completion

- **Phase:** `phase:mvp`
- **Outcome:** a signed-in user can sign out from anywhere in the app (not only from `/` and `/dashboard`), is redirected to home instead of being shown the login form while already authenticated, is — optionally — signed out after a configured idle period, and can complete a password reset from a different device/browser than the one that requested it.
- **Change ID:** account-session-ux
- **PRD refs:** FR-004 (sign out reachable); FR-015 (cross-device password reset); session-hygiene NFR (idle timeout, optional)
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-05, S-07 (fully independent — touches no Cloud-path code)
- **Blockers:** —
- **Unknowns:**
  - Desired idle window, and whether to ship idle-timeout at all in v1 — Owner: product. Block: no. Supabase session timeboxing / `inactivity_timeout` is a hosted **Pro-plan** feature (works locally via `config.toml`); ship the global sign-out + auth-redirect fixes regardless and treat idle-timeout as a deferrable sub-item.
  - **Cross-device password reset (folded in 2026-06-03):** the S-02 reset link is PKCE same-browser-only — opening the email on another device/browser fails `verifyOtp` and bounces to forgot-password (documented in the archived S-02 phase-3 doc, untracked until now). Fix = move to a non-PKCE emailed token or an explicit code-exchange route. Owner: TBD. Block: no. Loosely tied to the parked prod-SMTP item but scoped here.
- **Risk:** Low. Pure auth-UX / middleware / config — touches the Topbar/Layout (or a global nav), `src/middleware.ts`, and optionally `supabase/config.toml`. **Zero overlap with the Cloud path** (no `jobs`, no Edge Function, no cap logic), so it is explicitly independent of and non-colliding with S-05. Bundles the parked S-02 follow-ups (global Sign-out reachability + redirect-authenticated-off-`/auth/*`) surfaced 2026-06-02; closes the "I'm logged in but staring at a login form" confusion before the product is shown to users.
- **Status:** done

### S-07: Production deployment / go-live

- **Phase:** `phase:mvp`
- **Outcome:** the app is deployed and publicly accessible on Cloudflare (Workers), with the prod Supabase project fully wired — migrations applied, Edge Function `enhance` deployed, Realtime enabled, secrets + DB-webhook settings set — plus a CI deploy step. The Cloud AI pipeline ships behind `CLOUD_PIPELINE_ENABLED=OFF`, so Local engine + auth are live immediately and cloud is switched on later by a single flag flip (once S-05's cap exists).
- **Change ID:** production-deployment
- **PRD refs:** MVP success criterion "Deployed and accessible on Cloudflare Pages"; deploy/infra NFR
- **Prerequisites:** S-04
- **Parallel with:** S-05, S-06
- **Blockers:** Cloudflare account + Supabase prod project + Replicate token provisioning (user/team — self-resolvable, so an unknown not a hard blocker).
- **Unknowns:**
  - Prod Realtime enablement + prod DB-webhook URL (`https://<ref>.supabase.co/functions/v1/enhance`) and `EDGE_FUNCTION_URL` config — Owner: TBD. Block: no.
  - Whether to flip `CLOUD_PIPELINE_ENABLED` ON at launch — gated on **S-05, S-08, AND S-09** (runbook sequencing, not a code dependency). S-05 bounds cloud spend (daily cap); S-08 closes the 24h source-retention privacy guardrail for failed/abandoned jobs; S-09 fixes the source-URL TTL so a slow cold boot doesn't fail the prediction. Flipping ON before S-08 ships would leak failed/abandoned sources past 24h in prod (privacy NFR); before S-09 ships, cold-boot cloud jobs fail at the source-fetch step (reliability).
- **Risk:** Separate ops surface (Supabase + Cloudflare) with its own runbook. **Independent of S-05**: different files (CI / `wrangler.jsonc` / prod-config + Edge Function deploy vs S-05's cap logic in the submit path + `jobs` count), no code dependency — only the flag-flip-to-ON is sequenced after S-05. The **source-URL-TTL fix** (a cold boot >300s expires the signed source URL → the prediction fails at the source-fetch step) is now tracked as its own slice **S-09** and is a go-live prerequisite for the cloud path — it must land (and the cloud flow re-validate against a slow cold boot) before `CLOUD_PIPELINE_ENABLED` flips ON. **Also folds in the never-resolved S-04 phase-3 `/callback` hardening cluster** (webhook-timestamp replay window; `AbortSignal.timeout` + a size cap on the output/create fetches; output-host allowlist for SSRF defense-in-depth) — pre-prod hardening of the publicly-exposed callback before the flag flips ON. (The result-object orphan on a late `/callback` failure is owned by **S-08**, not here.) The flag stays OFF in prod until **S-05 (spend bound), S-08 (24h-retention cleanup), and S-09 (source-URL TTL fix) all land** — S-05 alone bounds cost but leaves the failed/abandoned-source privacy gap (S-08) and the cold-boot source-expiry reliability gap (S-09) open, so the flip-ON gate requires all three.
- **Status:** done

### S-08: 24h-retention cleanup for failed / abandoned cloud jobs

- **Phase:** `phase:mvp`
- **Outcome:** an uploaded source object is removed within the 24h privacy window even when the job does NOT succeed — on a `failed` job (pipeline error / timeout) and on an abandoned `queued` job whose client upload never completed — closing the gap where today only the success path (`markJobSucceeded`) deletes the source.
- **Change ID:** cloud-job-retention-cleanup
- **PRD refs:** NFR (uploaded source not retained beyond 24h — a launch privacy guardrail); Access Control (private source)
- **Prerequisites:** F-01, S-04
- **Parallel with:** S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Abandoned-`queued` rows (client PUT never landed) have no terminal event — decide the trigger (reuse the existing client timeout/watchdog path, or a bounded lightweight sweep) — Owner: TBD. Block: no.
- **Risk:** Closes a privacy-NFR gap that THREE archived slices each punted and none owned: F-01 (`markJobFailed` deletes nothing — "re-evaluated in v2"), S-03 (abandoned `queued` rows + orphaned PUT objects hand-waved to "S-04/S-05", which never took it), and S-04 (result-object orphan if the row UPDATE fails after upload — phase-3 review F5). **Scope guard:** inline approach only — delete the source in `markJobFailed` + the timeout route, and delete the orphaned result on late-failure — **NOT** a `pg_cron` reaper (explicitly an MVP non-goal). Independent of S-05: shares only `photo-job.service.ts`, and a _different_ function (`markJobFailed`) from S-05's count helper — no hard collision (see S-05's enforcement-point recommendation).
- **Also fold in (residual hardening, cloud-ON only):** the `/start` `predictions.create` fetch still has **no `AbortSignal.timeout`** — the S-07 `/callback` hardening cluster bounded the _output_ fetch (S-07 F4) but the _create_ fetch was missed (the S-07 note scoped it to "output/create fetches"). Bound it here while touching `enhance/index.ts`. Surfaced by the 2026-06-07 abandoned-findings audit. (Also noted there but **not** tracked, as benign: `SUPABASE_KEY` is declared `access:"secret"` yet is the publishable anon key sent to the browser — RLS-safe; a naming/classification nit only, no action unless the env var is ever renamed.)
- **Status:** done

### S-09: Source signed-URL TTL fix (cold-boot reliability)

- **Phase:** `phase:mvp`
- **Outcome:** a Cloud AI job survives a slow Replicate cold boot — the source READ URL the Edge Function signs no longer expires before the model fetches it, so the prediction no longer dies at the source-fetch step with a 400 on cold starts that exceed the current `SOURCE_URL_TTL_SECONDS = 300`. The fix is re-validated against a real slow cold boot.
- **Change ID:** cloud-source-url-ttl-fix
- **PRD refs:** MVP success criterion "end-to-end cloud flow works" (reliability); NFR (cloud pipeline reliability under cold start)
- **Prerequisites:** S-04
- **Parallel with:** S-05, S-06, S-08 (independent — touches the source-signing path in the `enhance` Edge Function, not `/callback`, the cap logic, or `markJobFailed`)
- **Sequencing:** a **go-live prerequisite for the cloud path** — must land and re-validate before S-07 flips `CLOUD_PIPELINE_ENABLED` ON (see S-07's flip-ON gate: S-05 + S-08 + S-09). Does **not** block S-07's deploy itself (cloud ships OFF), only the flip-ON.
- **Blockers:** —
- **Unknowns:**
  - Fix shape — raise the source TTL (~900s) vs sign the source URL lazily (only once the model is about to fetch) — Owner: TBD. Block: no. Raising the TTL is the one-line option; lazy signing is more robust but larger. Re-validate either against a slow (>300s) cold boot.
  - Right TTL ceiling vs the privacy posture — a longer-lived signed READ URL is a (small) wider exposure window for the private source; keep it as short as the worst observed cold boot allows. Owner: TBD. Block: no.
- **Risk:** Low and surgical — surfaced during S-04 Phase-5 E2E. The Edge Function (`supabase/functions/enhance/index.ts`) signs the source READ URL for `SOURCE_URL_TTL_SECONDS = 300`; a Replicate cold boot exceeding 300s (observed under platform load, well past Phase-0's ~135s) expires the URL before the model fetches it → the prediction dies at the source-fetch step with a 400. A genuine prod reliability gap, **not** account-specific. Lives in S-04's Edge Function (Phase 2/3 surface), so it was tracked in Parked rather than reopening S-04; promoted to its own slice (2026-06-04) because it is a v1 go-live prerequisite for the cloud path, not optional polish. See [[size-client-timeouts-and-provider-fetched-signed-url-ttls-to-the-external-models-cold-boot-ceiling-not-its-warm-latency]] in `lessons.md`.
- **Status:** done

### S-10: Scheduled retention reaper (post-MVP privacy/reliability hardening)

- **Phase:** `phase:post-mvp`
- **Outcome:** no raw source object lingers in the private `photos` bucket past the ≤24h retention NFR, even in the cases S-08's inline on-failure delete structurally cannot reach — legacy already-terminal orphans, abandon-and-never-return, and best-effort-delete failures. An hourly `pg_cron` job POSTs the `enhance` `/reap` route → `sweepAbandonedSourcesGlobally` (storage-first delete of `source.*` older than 23h + a SQL flip of stale non-terminal jobs → `failed('abandoned')`).
- **Change ID:** retention-reaper
- **PRD refs:** NFR "source not retained beyond 24h" (backstop / hardening of F-01 + S-08)
- **Prerequisites:** F-01, S-08 (extends the inline-delete mechanism), S-07 (Vault + Edge Function infra)
- **Parallel with:** — (standalone post-MVP follow-up)
- **Sequencing:** **post-MVP** — added 2026-06-14, _after_ the roadmap's MVP scope was fully delivered (2026-06-08). Reverses `idea-notes.md`'s explicit "automatic raw-uploads retention cleanup (pg_cron)" non-goal, prompted by a live prod breach (two `source.jpg` lingered ~7.7 days). Reuses the Vault + pg_net pattern with **zero new secrets**; inert where unwired.
- **Blockers:** —
- **Risk:** Low / additive — backstops, never replaces, the inline delete. Storage-first delete keys on object age (status-agnostic = the literal NFR invariant); the SQL flip spares fresh in-flight jobs (pinned by a mutation-killed test). Both `security definer` reaper functions are anon-locked (execute revoked from public/anon/authenticated). Shipped PR #30; reaper live on prod (`pg_cron reaper-hourly`).
- **Status:** done

### S-11: Bread chroma-denoise post-pass and pinned version resolution (post-MVP quality)

- **Phase:** `phase:post-mvp`
- **Outcome:** a Cloud AI result keeps Bread's low-light enhancement while an adaptive programmatic YCbCr chroma-denoise post-pass reduces colored noise in dark and near-black regions without materially softening luminance detail. The Bread model version is **resolved at build/deploy time and pinned**: a controlled resolver records the resolved hash, runtime always calls that pinned hash, and rollback is reverting to the previous resolved hash — this replaces the manually-hardcoded hash **without introducing runtime "latest" drift**.
- **Contract:** Bread input must remain RGB; the chroma post-pass output must remain RGB or be deliberately normalized before any downstream write, UI, or future S-13 pipeline reuse.
- **Change ID:** bread-chroma-postpass
- **GitHub issue:** [#51](https://github.com/Piotr-Miller/lumina-clean-ai/issues/51)
- **PRD refs:** Post-MVP cloud enhancement quality; extends US-01 / FR-009 without changing the MVP user flow
- **Prerequisites:** S-04 (Bread pipeline + callback), S-07 (production Replicate integration)
- **Parallel with:** adaptive-enhancement-parameters only after their parameter contracts and ownership boundaries are reconciled
- **Sequencing:** **post-MVP**, after S-10. Research first: establish where the chroma-pass runs, its CPU/memory ceiling, supported image formats, and the exact build/deploy-time mechanism for resolving and pinning the current Bread release. Preserve auditability and rollback by recording the resolved Bread model version per deployment (and per prediction for audit).
- **Blockers:** representative low-light photo set for visual A/B validation; a confirmed Replicate mechanism to resolve the current Bread release at build/deploy time and pin it (no runtime "latest" following)
- **Risk:** Medium. An over-strong chroma-pass can bleed color across edges or desaturate shadows. Following "latest" at runtime would let output quality or the I/O contract change without a deploy — so the version is resolved-and-pinned at build/deploy instead, and resolved-version telemetry is an audit add-on, **not** the safeguard. The implementation must be adaptive, bounded, tested on real photos, and keep an explicit rollback to the previous pinned hash.
- **Status:** done

### S-12: Manual and Auto enhancement parameters (post-MVP UX/quality)

- **Phase:** `phase:post-mvp`
- **Outcome:** after selecting a photo, a user sees a responsive parameter panel to the right of the image (moved below it on narrow screens), can adjust Local `gamma` and blur intensity or Bread `gamma` and `strength`, and can start from Auto-recommended values while retaining the ability to override any recommendation by moving its slider.
- **Change ID:** adaptive-enhancement-parameters
- **GitHub issue:** [#52](https://github.com/Piotr-Miller/lumina-clean-ai/issues/52)
- **PRD refs:** Post-MVP enhancement quality and control; extends US-01 / US-02 and FR-008 / FR-009 without replacing the existing Local or Bread engines
- **Prerequisites:** S-01 (Local engine + shared image UI), S-04 (Bread pipeline + Cloud result flow)
- **Related slice:** S-11 `bread-chroma-postpass`; avoid parallel implementation until the Bread input contract and ownership boundary are reconciled. S-12 exposes only Bread `gamma`/`strength`, while S-11's chroma post-pass remains internal.
- **Sequencing:** **post-MVP**. Prefer before any future model-selection/fallback slice so later engines must adapt to an established parameter-panel contract. Research and plan the Auto recommendation mechanism, safe ranges, and Cloud preview/reprocessing cost before implementation.
- **Blockers:** representative low-light image set for validating over-brightening; decision on the Auto analyzer (deterministic image metrics, vision model, or hybrid); explicit Cloud slider apply/preview behavior so dragging does not accidentally create unbounded paid Bread jobs
- **Risk:** Medium. Auto can look authoritative while choosing poor values; frequent Cloud slider changes can multiply paid jobs; a desktop right-side panel can crowd mobile layouts. Recommendations must stay visible and editable, values must be bounded, and Cloud processing must require an intentional apply action or equivalent cost-safe interaction.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                         | Suggested issue title                                              | Ready for `/10x-plan` | Notes                                                                                                                                                                                                                            |
| ---------- | --------------------------------- | ------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01       | photo-jobs-data-and-storage       | Private photo storage + job records with RLS                       | yes                   | Run `/10x-plan photo-jobs-data-and-storage`. Unlocks the Cloud AI path.                                                                                                                                                          |
| S-01       | local-engine-enhance-flow         | Local (Canvas) engine: upload → enhance → compare → download       | yes                   | Run `/10x-plan local-engine-enhance-flow`. Builds the shared UI shell.                                                                                                                                                           |
| S-02       | account-access-and-password-reset | Complete account access incl. password reset                       | yes                   | Run `/10x-plan account-access-and-password-reset`. Independent track.                                                                                                                                                            |
| S-03       | gated-cloud-upload                | Gated engine toggle + Cloud AI submission                          | done                  | Archived 2026-05-31 → `context/archive/2026-05-31-gated-cloud-upload/`. Issue #4.                                                                                                                                                |
| S-04       | cloud-ai-realtime-result          | Async Cloud AI pipeline + Realtime result delivery                 | done                  | Archived 2026-06-02 → `context/archive/2026-05-31-cloud-ai-realtime-result/`. Issue #5.                                                                                                                                          |
| S-05       | cloud-daily-cap                   | Global daily cap on Cloud AI requests                              | done                  | Archived 2026-06-04 → `context/archive/2026-06-03-cloud-daily-cap/`. Issue #6.                                                                                                                                                   |
| S-06       | account-session-ux                | Account/session UX: global sign-out + redirect authed off /auth/\* | done                  | Archived 2026-06-03 → `context/archive/2026-06-03-account-session-ux/`. Issue #7.                                                                                                                                                |
| S-07       | production-deployment             | Production deployment / go-live (Cloudflare + prod Supabase)       | done                  | Archived 2026-06-06 → `context/archive/2026-06-04-production-deployment/`. Issue #8.                                                                                                                                             |
| S-08       | cloud-job-retention-cleanup       | 24h-retention cleanup for failed/abandoned cloud jobs              | done                  | Prereq F-01/S-04 (done). Closes privacy-NFR gap punted by F-01/S-03/S-04. Inline delete-on-failure, NOT pg_cron. Independent of S-05. Archived 2026-06-07 → `context/archive/2026-06-07-cloud-job-retention-cleanup/`. Issue #9. |
| S-09       | cloud-source-url-ttl-fix          | Source signed-URL TTL fix (cold-boot reliability)                  | done                  | Archived 2026-06-07 → `context/archive/2026-06-06-cloud-source-url-ttl-fix/`. Issue #12.                                                                                                                                         |
| S-10       | retention-reaper                  | Scheduled retention reaper backstop                                | done                  | `phase:post-mvp`. Archived 2026-06-14 → `context/archive/2026-06-14-retention-reaper/`. Shipped PR #30.                                                                                                                          |
| S-11       | bread-chroma-postpass             | Bread chroma-denoise post-pass + pinned version resolution         | done                  | `phase:post-mvp`. Archived 2026-06-25 → `context/archive/2026-06-18-bread-chroma-postpass/`. Issue #51. PRs #70 (p1–4) + #74 (p5).                                                                                               |
| S-12       | adaptive-enhancement-parameters   | Manual + Auto parameter panel for Local and Bread                  | done                  | `phase:post-mvp`. Archived 2026-07-01 → `context/archive/2026-06-18-adaptive-enhancement-parameters/`. Issue #52. PR #81.                                                                                                        |

This table is the clean handoff to a backlog tool. One row per `F-NN` / `S-NN`; it does not duplicate the detailed body.

**Status semantics.** The `change.md` frontmatter `status`, this roadmap's **Status**, and the GitHub issue **Status** describe different objects and can legitimately differ:

- `new` — a draft change exists; no research yet.
- `preparing` — research/framing/plan is actively being produced (e.g. a `frame.md` or research notes exist).
- GitHub `ready` — the next indicated step (`/10x-research` or `/10x-plan`) can begin.

So a slice may be `new`/`preparing` as a _change_ while its _issue_ is `ready` to start the next step. A slice that is **Parked** must not carry an issue `status:ready`; use `status:proposed` until it is promoted into the slice table.

## Open Roadmap Questions

1. **HEIC decoding strategy.** FR-005 accepts HEIC, but browser-native HEIC support is uneven. Owner: tech-stack-selector / early spike. Block: shapes S-01 and S-03 accepted-format behavior; not blocking (detect-and-reject is a safe default).
2. **Cloud model cold-start vs the ≤30s p95 guardrail.** The Replicate "Bread" model's cold-start may consume most of the latency budget. Owner: early prototype measurement. Block: gates the S-04 SLA and is the single biggest risk to the core hypothesis; resolve by measuring on the real model, then warm-up / model swap / relaxed SLA. **Resolved (S-04):** Phase-0 measured cold ≈ 118–135s and chose **relaxed SLA** (≤30s p95 = warm-path; cold first-run is a known ~2 min wait). S-04 Phase 5 implements a **two-phase client watchdog** (30s `queued→processing` re-checked by a read, 180s `processing→terminal`) + a catch-up read on subscribe + a progressive "first run can take ~2 min" affordance, so cold boots no longer false-timeout. Residual: cold boots >300s can still expire the source signed-URL (fixed by **S-09**; see Parked → "Resolved (formerly parked)" → "Source signed-URL TTL vs cold-boot expiry"); keep-warm remains the only true latency fix and is deferred (cost vs S-05's bound).

## Parked

> **Parked = genuinely future / not-yet-done work only.** When a parked item is implemented or promoted to a slice, move its bullet to **### Resolved (formerly parked)** at the end of this section — do not leave it inline. This keeps the list below a clean backlog: everything here is still to do.

- **RAW format support (DNG/CR2/NEF/…).** Why parked: PRD §Non-Goals — needs a dedicated decoder and a RAW-domain model, a separate pipeline.
- **Advanced Local engine (OpenCV.js / WASM / CLAHE / NLM / WebGPU).** Why parked: PRD §Non-Goals — the quality gap to Cloud is intentional; Local stays naive (gamma + Gaussian blur).
- **S-13 Premium Retinexformer enhancement path (`phase:post-mvp`).** Why parked: this is optional quality upside after the Standard cloud path, not an MVP success criterion. Prerequisite: **S-11 `bread-chroma-postpass`**. The target architecture keeps `Bread/Replicate → chroma-pass[bread]` as Standard and adds `Retinexformer self-hosted → chroma-pass[retinexformer]` as an explicitly selected, slower Premium path. Retinexformer is **not** an automatic fallback and is not chained after Bread. Its quality advantage is a hypothesis: begin with a 20-50-photo offline benchmark covering shadow chroma noise, color/skin fidelity, detail preservation, artifacts, latency, memory, cold start, and cost; proceed only after an explicit GO decision. First release requirements: persist `engine_requested`, `engine_used`, and resolved model version; separate Premium timeout and budget/entitlement policy; no cross-engine automatic retry; deliberate RGB/RGBA contract. Do not call the user-facing mode "HD" because this slice does not promise upscale or higher resolution. Provider and managed-endpoint availability must be revalidated during research. **Stays Parked + issue `status:proposed`** until the benchmark passes an explicit GO; only then promote it into the slice table and Backlog Handoff. Draft: `context/changes/premium-retinexformer-enhancement/`; historical provider/model seeds: `research-notes.md`; next step: `/10x-research premium-retinexformer-enhancement`.
- **S-14 Premium Max tier (`phase:post-mvp`).** Why parked: this is a higher application tier above Premium, not just another model toggle. It targets the hardest low-light photos and bundles a heavier processing path with product-tier benefits. Base architecture starts from **S-13** `Retinexformer self-hosted → chroma-pass[retinexformer]` and may add an optional heavy second denoise pass such as `NAFNet` for explicitly selected Max jobs only. Candidate tier contents: stronger hard-scene cleanup, Max-specific quality presets, higher file-size and quota limits, longer timeout budget, priority scheduling, batch processing for small sets, and saved presets. It must **not** silently auto-escalate Standard jobs into a heavier paid path, and it does **not** replace the separate Premium slice. Research first: decide whether Max is a standalone paid tier, a Premium add-on, or a per-job "Max quality" mode; validate benchmark quality gain versus over-smoothing, latency, queue isolation, and cost. **This is an epic, not an implementable vertical slice** — after research it must be split into at least: entitlement/billing, processing mode (heavy second pass), queue/priority policy, and batch workflow, each planned separately. Stays `status:proposed` (not `/10x-plan`-ready) until split. Draft: `context/changes/premium-max-tier/`; next step: `/10x-research premium-max-tier`.
- **Native mobile apps.** Why parked: PRD §Non-Goals — web only at launch.
- **Social features (sharing galleries, public profiles, collaborative editing).** Why parked: PRD §Non-Goals — single-tenant by design in v1.
- **Admin role + Admin UI.** Why parked: PRD §Non-Goals — deferred to v2; v1 operator tasks handled out-of-band via the Supabase dashboard.
- **Per-user rate limiting.** Why parked: PRD §Non-Goals — v1 enforces only the global daily cap (S-05) plus a provider billing alert.
- **Monetization / cloud-cost financing (v2).** Why parked: a post-validation business concern, not an MVP success criterion — build it only after S-04 (north star) and S-07 (go-live) prove users actually want the cloud result. **Cost reality:** variable inference is trivial and already bounded — Bread ≈ $0.0006/run (roadmap est., verify vs live Replicate GPU-second pricing), so the 50/day global cap (S-05) tops out at ~$0.90/mo total; the real bill is fixed platform cost (Supabase ~$0–25/mo Pro, Cloudflare ~$0–5/mo, domain ~$1/mo). The S-05 global cap is a _blast-radius guardrail, not a business model_ — it bounds cost but also caps growth (one global pool, so strangers' usage can block a paying user). **To monetize, swap the global cap for per-user entitlements** (couples to the parked **Per-user rate limiting** item above): `countCloudJobsToday` already exists; per-user is a `user_id` filter on it, and the `create-job` guard checks a per-user quota/credit balance instead of `CLOUD_DAILY_CAP`. **Candidate models** (architecture already fits — two-engine freemium funnel + per-job rows + auth are in place): (1) **Freemium** — anonymous Local free forever (S-01 funnel), signed-in free tier gets a small monthly cloud quota, paid tier larger; lowest friction. (2) **Credit packs / pay-per-use** — 1 job = 1 credit, Stripe Checkout + a credits/entitlements table. (3) **Subscription tiers** — $X/mo for Y runs; predictable revenue + per-user cost ceiling. (4) **BYO Replicate key** — user supplies own token, zero inference cost to us; niche. **Build cost:** per-user usage accounting (cheap — filter the existing count), a Stripe integration, and a credits/entitlements table the create-job guard reads. Do NOT build before the north star validates demand.
- **History UI (FR-013, nice-to-have).** Why parked: PRD §Non-Goals — job data persists (needed for the Realtime push in S-04), but the user-facing history list view is deferred to v2.
- **Formal anti-bot defense (Turnstile / WAF / CAPTCHA).** Why parked: PRD §Non-Goals — v1 relies on auth-gating + the daily cap + observation.
- **Offline functionality.** Why parked: PRD §Non-Goals — not a committed product property.
- **Session inactivity / max-lifetime timeout (S-02).** Surfaced 2026-06-02. No idle or max-session timeout was configured at that point: `[auth.sessions]` (`timebox`, `inactivity_timeout`) was commented out in `supabase/config.toml`, and `jwt_expiry = 3600` access tokens auto-refreshed via a rotating refresh token (`enable_refresh_token_rotation = true`), so a cookie session persisted indefinitely until an explicit Sign out. The hosted Supabase dashboard path stayed Pro-plan-gated, so the capability was later delivered as a separate post-MVP app-level middleware hardening change: `session-idle-timeout`, archived 2026-07-08 at `context/archive/2026-07-08-session-idle-timeout/`.
- **Cross-device password reset (PKCE → non-PKCE emitted token).** Deferred from S-06 (2026-06-03); delivers the rest of PRD **FR-015**. The recovery link uses the `@supabase/ssr` PKCE flow, so the emailed `token_hash=pkce_…` only verifies in the **same browser** that requested it — opening it on another device/browser fails `verifyOtp` and bounces to forgot-password. Fix (proven in `scripts/generate-recovery-link.ts`): switch the send leg (`src/pages/api/auth/reset-password.ts`) from `resetPasswordForEmail` to admin `generateLink({ type: "recovery" })`, which mints a non-PKCE plain `hashed_token` that works on any device; the `/auth/confirm` `verifyOtp` leg is unchanged. **Needs the app to deliver the email** — `generateLink` does NOT send the email, so the app must deliver the link itself (own transactional sender). That prerequisite is now met: custom SMTP/Resend is live on prod (see **Resolved (formerly parked)** below). Full analysis in the archived S-06 `research.md` (Follow-up Research, Context7 Supabase-Auth pass).
- **Replicate burst-limit backoff (S-04).** `predictions.create` can return 429 (per-account burst limit) under rapid resubmits. Add a bounded retry-with-backoff in `/start` so a transient burst limit doesn't surface as a `start_failed`. Small, optional; the S-05 daily cap is the structural cost bound, this is just smoothing.
- **`npm run dev` SSR crash on the enhance page (dev-only).** Surfaced during D.1 Phase 3 (2026-06-08); **dev-tooling only — `npm run build` + prod serve are unaffected.** On the first request that pulls `astro/env/runtime`, Vite's SSR dep optimizer re-optimizes mid-request and re-emits `react-dom_server` under a new `?v=` hash that desyncs from the already-loaded React → "more than one copy of React" → `useState` null in `useLocalEnhance` (`EnhanceWorkspace`). Single React copy confirmed installed (not a node_modules dup). Three fixes tried + reverted (`.vite` clear; client `dedupe`+`optimizeDeps.include`; `ssr.noExternal`). **Untried next:** `vite.ssr.optimizeDeps.include: ['astro/env/runtime']`, then a minimal repro + upstream issue. D.1 worked around it by driving the live pipeline via a script. Full diagnosis: `context/archive/2026-06-07-cloud-flip-on-revalidation/dev-ssr-known-issue.md`. Tracked as **issue #15**. **Mitigated for the E2E gate (2026-06-20, change `e2e-build-server`):** Playwright's webServer now serves a production build via `wrangler dev` (`npm run test:e2e:serve`) instead of `astro dev`, so the gate no longer hits this crash. This is a **mitigation, not a fix** — `npm run dev` itself is still affected; keep #15 open until the dev path is fixed (the untried knob above) or `astro dev` is deliberately declared unsupported for the enhance page.

### Resolved (formerly parked)

Items that were once parked but have since been implemented or promoted to a slice. Kept here (not deleted) for the audit trail; they are **not** pending work.

- **Source signed-URL TTL vs cold-boot expiry.** ➜ **Promoted to slice S-09 (2026-06-04)**, now **done/archived** (`context/archive/2026-06-06-cloud-source-url-ttl-fix/`, issue #12) — see `### S-09` above. Was the cold-boot source-expiry reliability gap; a v1 go-live prerequisite for the cloud path.
- **Custom production email / SMTP (Resend + verified domain).** ➜ **Done** — Custom SMTP (Resend) is **enabled on the prod Supabase project** (`luminaclean-prod`, confirmed in the dashboard 2026-06-19: Auth → Email → SMTP), so production reset/notification email scales past the built-in sender's ~2–4/hr cap. Configured manually in the dashboard, not via `supabase/config.toml` (whose `[auth.email.smtp]` block stays commented). Original deferral from S-02 Phase 3 (2026-05-30); settings target was `context/changes/account-access-and-password-reset/phase-3-production-and-nfr.md` §1.1. The recovery email **template** (§1.2) and prod URL config (§1.3) were always required and are applied.
- **Cancel in-flight cloud job on Start over (S-04).** ➜ **Delivered as non-roadmap change `cloud-job-cancel`** (2026-07-09) — the mid-processing "Start over" now hard-cancels the running Cloud AI job (flip `failed`/`error_code:"canceled"` + delete the orphaned source + best-effort Replicate `predictions.cancel` via a new Edge `/cancel` sub-path). Reused `failed` + a distinct `error_code` (no enum, no migration). Shipped PR #93; archived 2026-07-09 → `context/archive/2026-07-09-cloud-job-cancel/`. Post-deploy pending: set Worker secrets `EDGE_FUNCTION_URL` + `DB_WEBHOOK_SECRET` (else the compute-kill safely no-ops) + a prod smoke.

## Done

- **F-01: (foundation) a private Supabase Storage bucket and a jobs/predictions table exist with per-user RLS, signed-upload capability, a 24-hour source-retention policy, and shared entity/DTO types in `src/types.ts`. Not user-visible on its own.** — Archived 2026-05-29 → `context/archive/2026-05-28-photo-jobs-data-and-storage/`. Lesson: —.
- **S-01: an anonymous visitor can upload a photo (JPG/PNG), run the client-side Local engine (Canvas gamma correction + Gaussian blur), compare the result against the original with a before/after slider, and download it — entirely in the browser, no network round-trip after load.** — Archived 2026-05-29 → `context/archive/2026-05-28-local-engine-enhance-flow/`. Lesson: —.
- **S-02: a visitor can create an account with email + password, sign in and out, and recover a forgotten password via an email-based reset flow.** — Archived 2026-05-30 → `context/archive/2026-05-29-account-access-and-password-reset/`. Lesson: —.
- **S-03: a user can switch the engine toggle to Cloud AI (anonymous visitors are prompted to sign in, never silently denied), and a signed-in user can submit the loaded photo for cloud processing — the source is uploaded to the private bucket and a job record is created.** — Archived 2026-05-31 → `context/archive/2026-05-31-gated-cloud-upload/`. Lesson: —.
- **S-04: once a photo is submitted, the async pipeline (Database webhook → Supabase Edge Function → Replicate prediction with webhook callback) runs, and the enhanced result is pushed to the page via Supabase Realtime — appearing in the before/after slider with download, no manual refresh — within ~30s p95.** — Archived 2026-06-02 → `context/archive/2026-05-31-cloud-ai-realtime-result/`. Lesson: two-phase Realtime watchdog (catch-up read on SUBSCRIBED + re-check before failing) and cold-boot TTL sizing (see lessons.md).
- **S-06: a signed-in user can sign out from anywhere in the app (not only from `/` and `/dashboard`), is redirected to home instead of being shown the login form while already authenticated, is — optionally — signed out after a configured idle period, and can complete a password reset from a different device/browser than the one that requested it.** — Archived 2026-06-03 → `context/archive/2026-06-03-account-session-ux/`. Lesson: —.
- **S-05: a Cloud AI request that would exceed the global daily cap is rejected before the cloud model is invoked, with a clear user-facing message; the bill is structurally bounded.** — Archived 2026-06-04 → `context/archive/2026-06-03-cloud-daily-cap/`. Lesson: —.
- **S-07: the app is deployed and publicly accessible on Cloudflare (Workers) on a branded custom domain (luminacleanai.com), with the prod Supabase project (luminaclean-prod) wired — migrations applied, Edge Function `enhance` deployed, auth + Resend email live; the Cloud AI pipeline ships flag-OFF (`CLOUD_PIPELINE_ENABLED=false`, `CLOUD_DAILY_CAP=0`), flip-ON gated on S-05+S-08+S-09.** — Archived 2026-06-06 → `context/archive/2026-06-04-production-deployment/`. Lesson: a fresh prod Supabase project doesn't auto-repoint the Worker — verify which project the deployed app talks to (lessons.md); DB-webhook custom-GUC + callback success-path hardening (F8/F9) deferred to flip-ON.
- **S-09: a Cloud AI job survives a slow Replicate cold boot — the source READ URL the Edge Function signs (raised to `SOURCE_URL_TTL_SECONDS = 3600`) no longer expires before the model fetches it on cold starts that exceed the old 300s; the client processing watchdog is raised to 5 min to match.** — Archived 2026-06-07 → `context/archive/2026-06-06-cloud-source-url-ttl-fix/`. Lesson: size provider-fetched signed-URL TTLs + client watchdogs to the cold-boot ceiling, not warm latency (lessons.md); live >300s re-validation deferred to flip-ON (D.1).
- **S-08: an uploaded source object is removed within the 24h privacy window even when the job does NOT succeed — on a `failed` job (pipeline error / timeout) and on an abandoned `queued` job whose client upload never completed — closing the gap where today only the success path (`markJobSucceeded`) deletes the source.** — Archived 2026-06-07 → `context/archive/2026-06-07-cloud-job-retention-cleanup/`. Lesson: —.
- **S-10 (post-MVP hardening): a scheduled hourly `pg_cron` reaper deletes any lingering `source.*` object past the 24h retention window — backstopping S-08's inline on-failure delete for the gaps it can't reach (legacy terminal orphans, abandon-never-return, best-effort-delete failures). Reverses the `idea-notes.md` pg_cron-cleanup non-goal after a live 7.7-day prod breach; zero new secrets; reaper functions anon-locked.** — Shipped PR #30; Archived 2026-06-14 → `context/archive/2026-06-14-retention-reaper/`. Lesson: storage-first (status-agnostic, object-age) predicate is the complete ≤24h invariant; PostgREST doesn't expose `storage` + SQL can't delete the object → route reads via a `security definer` RPC and deletes via the Storage API.
- **Cloud flip-ON (D.1 — the S-05 + S-08 + S-09 gate) — executed 2026-06-08:** `CLOUD_PIPELINE_ENABLED` flipped ON in prod, `CLOUD_DAILY_CAP=3` (kill-switch `=0`); retention + cold-boot re-validated end-to-end on luminacleanai.com. GUC→Vault webhook migration; two config findings fixed (real Replicate account signing secret + a required explicit `EDGE_FUNCTION_URL`); `DB_WEBHOOK_SECRET` rotated. Archived 2026-06-08 → `context/archive/2026-06-07-cloud-flip-on-revalidation/`. Lesson: self-signing harness can't catch a wrong provider secret; hosted Edge `SUPABASE_URL` isn't public-https → set `EDGE_FUNCTION_URL` (lessons.md).
- **S-11: a Cloud AI result keeps Bread's low-light enhancement while an adaptive programmatic YCbCr chroma-denoise post-pass reduces colored noise in dark and near-black regions without materially softening luminance detail; the Bread model version is resolved-and-pinned at build/deploy time (no runtime "latest"), recorded per deployment and per prediction.** — Shipped PRs #70 (p1–4) + #74 (p5); Archived 2026-06-25 → `context/archive/2026-06-18-bread-chroma-postpass/`. Lesson: shipped flag-OFF (`CHROMA_POSTPASS_ENABLED=false`) with a recorded ✅ GO — production enable is a separate change; don't lint generated IIFE bundles.
- **S-12: after selecting a photo, a user sees a responsive parameter panel to the right of the image (moved below it on narrow screens), can adjust Local `gamma` and blur intensity or Bread `gamma` and `strength`, and can start from Auto-recommended values while retaining the ability to override any recommendation by moving its slider.** — Shipped PR #81; Archived 2026-07-01 → `context/archive/2026-06-18-adaptive-enhancement-parameters/`. Lesson: —.
- **Landing 2.0 (non-roadmap change `landing-content`): the landing grows below the fold with How-it-works / FAQ (5 items) / guide-teaser sections, three full photography guides ship at `/guides/<slug>` as the SEO surface, the parameter panel gains tooltips, the nav carries the LC brand lockup + favicon, and SEO basics go live (sitemap incl. guides, meta/OG/canonical, robots.txt, 1200×630 OG card); plus a Cloud AI single-job notice (inline hint + FAQ) with the shared-daily-cap caveat.** — Shipped PR #89; Archived 2026-07-08 → `context/archive/2026-07-05-landing-content/`. Lesson: —.
- **Idle session logout (non-roadmap change `session-idle-timeout`): a signed-in user idle for 30+ minutes is signed out on the next request; `/dashboard` lands on signin with an inactivity notice, while anon-capable pages silently downgrade to signed-out and the Local engine keeps working; the idle window is tracked by an httpOnly `lc-last-activity` cookie and enforced per browser session (`scope: "local"`).** — Archived 2026-07-08 → `context/archive/2026-07-08-session-idle-timeout/`. Lesson: —.
- **Cancel in-flight cloud job (non-roadmap change `cloud-job-cancel`): a signed-in user hard-cancels an in-flight Cloud AI job from the mid-processing "Start over" button — the job flips `failed`/`error_code:"canceled"`, its orphaned source object is deleted, and the running Replicate prediction is stopped (best-effort, via a new owner-scoped `POST /api/enhance/cloud/cancel` route that awaits an Edge `/cancel` sub-path holding the token); reuses `failed` + a distinct `error_code` (no enum, no migration).** — Shipped PR #93; Archived 2026-07-09 → `context/archive/2026-07-09-cloud-job-cancel/`. Lesson: CI runs only on PR-to-master (a feature-branch push runs nothing); a real-prediction cancel + the browser flow need a prod smoke (local pipeline blocked by stale keys + dead tunnel).
