---
project: LuminaClean AI
version: 1
status: draft
created: 2026-05-26
updated: 2026-05-31
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: LuminaClean AI

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline (2026-05-26).
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Mobile night and low-light photos come out dark and grainy, and the existing fix (transfer to desktop, install editing software, learn the sliders) has so much workflow friction that most people just give up. LuminaClean AI removes the workflow entirely: upload a photo, see it fixed. The bet — the **core hypothesis**, i.e. the single assumption the whole product rides on — is that AI denoising/exposure models are now good enough for casual use, delivered as a one-click cloud enhancement, with a rough client-side engine as the free fallback and acquisition funnel.

## North star

**S-04: a signed-in user sees their Cloud-AI-enhanced photo appear in real time, without refreshing.** This is the validation milestone because it is the smallest end-to-end flow that proves the core hypothesis — that the cloud model produces a visibly better result and the async pipeline can deliver it within the latency budget.

> "North star" here means: the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as its Prerequisites allow, because everything else only matters if this works. Sequencing bias is `main_goal: market-feedback` (risk-first): the async Replicate pipeline + cold-start question is the **riskiest assumption** (the one unvalidated belief most likely to sink the product), so the order drives toward it rather than deferring it.

## At a glance

| ID    | Change ID                          | Outcome (user can …)                                                  | Prerequisites | PRD refs                                  | Status   |
| ----- | ---------------------------------- | --------------------------------------------------------------------- | ------------- | ----------------------------------------- | -------- |
| F-01  | photo-jobs-data-and-storage        | (foundation) private photo storage + job records with RLS in place    | —             | NFR: private source / 24h retention; Access Control | done     |
| S-01  | local-engine-enhance-flow          | upload a photo, enhance it locally, compare before/after, download    | —             | US-02; FR-001, FR-005, FR-008, FR-011, FR-012 | done     |
| S-02  | account-access-and-password-reset  | sign up, sign in, sign out, and reset a forgotten password            | —             | FR-002, FR-003, FR-004, FR-015            | done     |
| S-03  | gated-cloud-upload                 | switch to Cloud AI (sign-in gated) and submit a photo for processing  | F-01, S-01    | US-01; FR-005, FR-006, FR-007             | done     |
| S-04  | cloud-ai-realtime-result           | see the Cloud-AI result pushed in real time, before/after + download  | S-03          | US-01; FR-009, FR-010, FR-011, FR-012     | proposed |
| S-05  | cloud-daily-cap                    | get a clear message when the global daily cloud cap is reached        | S-04          | FR-014                                    | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                          | Chain                              | Note                                                                                          |
| ------ | ------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| A      | Cloud AI path (the core bet)   | `F-01` → `S-03` → `S-04` → `S-05`  | Risk-first spine; surfaces the pipeline + cold-start risk at `S-04` (north star). Reuses Stream B's UI shell at `S-03`. |
| B      | Local engine & shared UI shell | `S-01`                             | Anonymous funnel + builds the upload / before-after slider / download shell reused by `S-03`. Joins Stream A at `S-03`. |
| C      | Account access                 | `S-02`                             | Independent auth-completion track (adds the missing password reset); parallel with everything. |

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
- **Status:** proposed

### S-05: Cloud cost protection — global daily cap

- **Outcome:** a Cloud AI request that would exceed the global daily cap is rejected before the cloud model is invoked, with a clear user-facing message; the bill is structurally bounded.
- **Change ID:** cloud-daily-cap
- **PRD refs:** FR-014; Access Control (cloud gated to signed-in users within the cap)
- **Prerequisites:** S-04
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Where the cap is enforced — SQL count on an RLS-gated table vs a check inside the Edge Function — Owner: TBD. Block: no.
- **Risk:** You cannot cap an invocation path that doesn't exist yet, so this follows S-04 — but it should land immediately after, because cloud cost is unbounded in the gap. Per-user limits are explicitly out of scope (v2); v1 enforces only this global cap plus the provider billing alert as backstop.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                          | Suggested issue title                                   | Ready for `/10x-plan` | Notes |
| ---------- | ---------------------------------- | ------------------------------------------------------- | --------------------- | ----- |
| F-01       | photo-jobs-data-and-storage        | Private photo storage + job records with RLS            | yes                   | Run `/10x-plan photo-jobs-data-and-storage`. Unlocks the Cloud AI path. |
| S-01       | local-engine-enhance-flow          | Local (Canvas) engine: upload → enhance → compare → download | yes              | Run `/10x-plan local-engine-enhance-flow`. Builds the shared UI shell. |
| S-02       | account-access-and-password-reset  | Complete account access incl. password reset            | yes                   | Run `/10x-plan account-access-and-password-reset`. Independent track. |
| S-03       | gated-cloud-upload                 | Gated engine toggle + Cloud AI submission               | done                  | Archived 2026-05-31 → `context/archive/2026-05-31-gated-cloud-upload/`. Issue #4. |
| S-04       | cloud-ai-realtime-result           | Async Cloud AI pipeline + Realtime result delivery      | no                    | North star. Blocked on S-03; central cold-start risk. |
| S-05       | cloud-daily-cap                    | Global daily cap on Cloud AI requests                   | no                    | Blocked on S-04; land immediately after to bound cost. |

This table is the clean handoff to a backlog tool. One row per `F-NN` / `S-NN`; it does not duplicate the detailed body.

## Open Roadmap Questions

1. **HEIC decoding strategy.** FR-005 accepts HEIC, but browser-native HEIC support is uneven. Owner: tech-stack-selector / early spike. Block: shapes S-01 and S-03 accepted-format behavior; not blocking (detect-and-reject is a safe default).
2. **Cloud model cold-start vs the ≤30s p95 guardrail.** The Replicate "Bread" model's cold-start may consume most of the latency budget. Owner: early prototype measurement. Block: gates the S-04 SLA and is the single biggest risk to the core hypothesis; resolve by measuring on the real model, then warm-up / model swap / relaxed SLA. **Resolved (S-04):** Phase-0 measured cold ≈ 118–135s and chose **relaxed SLA** (≤30s p95 = warm-path; cold first-run is a known ~2 min wait). S-04 Phase 5 implements a **two-phase client watchdog** (30s `queued→processing` re-checked by a read, 180s `processing→terminal`) + a catch-up read on subscribe + a progressive "first run can take ~2 min" affordance, so cold boots no longer false-timeout. Residual: cold boots >300s can still expire the source signed-URL (see Parked → "Source signed-URL TTL vs cold-boot expiry"); keep-warm remains the only true latency fix and is deferred (cost vs S-05's bound).

## Parked

- **RAW format support (DNG/CR2/NEF/…).** Why parked: PRD §Non-Goals — needs a dedicated decoder and a RAW-domain model, a separate pipeline.
- **Advanced Local engine (OpenCV.js / WASM / CLAHE / NLM / WebGPU).** Why parked: PRD §Non-Goals — the quality gap to Cloud is intentional; Local stays naive (gamma + Gaussian blur).
- **Native mobile apps.** Why parked: PRD §Non-Goals — web only at launch.
- **Social features (sharing galleries, public profiles, collaborative editing).** Why parked: PRD §Non-Goals — single-tenant by design in v1.
- **Admin role + Admin UI.** Why parked: PRD §Non-Goals — deferred to v2; v1 operator tasks handled out-of-band via the Supabase dashboard.
- **Per-user rate limiting.** Why parked: PRD §Non-Goals — v1 enforces only the global daily cap (S-05) plus a provider billing alert.
- **History UI (FR-013, nice-to-have).** Why parked: PRD §Non-Goals — job data persists (needed for the Realtime push in S-04), but the user-facing history list view is deferred to v2.
- **Formal anti-bot defense (Turnstile / WAF / CAPTCHA).** Why parked: PRD §Non-Goals — v1 relies on auth-gating + the daily cap + observation.
- **Offline functionality.** Why parked: PRD §Non-Goals — not a committed product property.
- **Custom production email / SMTP (Resend + verified domain).** Why parked: deferred from S-02 Phase 3 (2026-05-30). The password-reset flow is verified end-to-end on Supabase's built-in email sender for MVP launch; the built-in sender's ~2–4 emails/hr cap is the accepted known constraint. A future deployment/infra slice configures a custom SMTP provider (Resend) with a verified sending domain + SPF/DKIM so reset/notification email scales past that cap. Settings target documented in `context/changes/account-access-and-password-reset/phase-3-production-and-nfr.md` §1.1. NOTE: the custom recovery email **template** (§1.2) and prod URL config (§1.3) are NOT part of this deferral — they are required for the reset link to resolve at all and must be applied in the dashboard regardless of sender.
- **Global, always-reachable "Sign out" control.** Why parked: out of scope for S-02. Today Sign out renders only on `/` (the Topbar, mounted solely in `Welcome.astro`) and on `/dashboard` — it is unreachable from `/auth/*` and any page without the Topbar. A small follow-up either folds the Topbar into the shared `Layout` or adds a global nav so Sign out is reachable everywhere.
- **Source signed-URL TTL vs cold-boot expiry (S-04 reliability — recommended next).** Surfaced during S-04 Phase-5 E2E. The Edge Function (`supabase/functions/enhance/index.ts`) signs the source READ URL for `SOURCE_URL_TTL_SECONDS = 300`. A Replicate cold boot exceeding 300s (observed >300s under platform load, well past Phase-0's ~135s) expires the URL before the model fetches it → the prediction dies at the source-fetch step with a 400. This is a genuine prod reliability gap, **not** account-specific. Fix: raise the source TTL (~900s) and/or sign it lazily; re-validate against a slow cold boot. One-line change but lives in S-04's Edge Function (Phase 2/3 surface), so tracked here rather than reopening S-04. See [[size-client-timeouts-and-provider-fetched-signed-url-ttls-to-the-external-models-cold-boot-ceiling-not-its-warm-latency]] in `lessons.md`.
- **Replicate burst-limit backoff (S-04).** `predictions.create` can return 429 (per-account burst limit) under rapid resubmits. Add a bounded retry-with-backoff in `/start` so a transient burst limit doesn't surface as a `start_failed`. Small, optional; the S-05 daily cap is the structural cost bound, this is just smoothing.
- **Cancel in-flight cloud job on Start over (S-04).** Today "Start over" mid-`processing` only tears down the client subscription; the backend prediction runs to completion as an orphan (which self-cleans its source via `markJobSucceeded`). Negligible cost (~$0.0006/run). True cancellation needs a new owner-scoped `POST /api/enhance/cloud/cancel` route → Replicate `POST /v1/predictions/{id}/cancel` (only the service-role layer holds the token) + a terminal state (the `photo_job_status` enum has no `canceled`; reuse `failed` or add an enum value via migration, with a deliberate source-cleanup decision). Deferred — out of S-04 scope, no v1 success-criterion impact.

## Done

- **F-01: (foundation) a private Supabase Storage bucket and a jobs/predictions table exist with per-user RLS, signed-upload capability, a 24-hour source-retention policy, and shared entity/DTO types in `src/types.ts`. Not user-visible on its own.** — Archived 2026-05-29 → `context/archive/2026-05-28-photo-jobs-data-and-storage/`. Lesson: —.
- **S-01: an anonymous visitor can upload a photo (JPG/PNG), run the client-side Local engine (Canvas gamma correction + Gaussian blur), compare the result against the original with a before/after slider, and download it — entirely in the browser, no network round-trip after load.** — Archived 2026-05-29 → `context/archive/2026-05-28-local-engine-enhance-flow/`. Lesson: —.
- **S-02: a visitor can create an account with email + password, sign in and out, and recover a forgotten password via an email-based reset flow.** — Archived 2026-05-30 → `context/archive/2026-05-29-account-access-and-password-reset/`. Lesson: —.
- **S-03: a user can switch the engine toggle to Cloud AI (anonymous visitors are prompted to sign in, never silently denied), and a signed-in user can submit the loaded photo for cloud processing — the source is uploaded to the private bucket and a job record is created.** — Archived 2026-05-31 → `context/archive/2026-05-31-gated-cloud-upload/`. Lesson: —.
