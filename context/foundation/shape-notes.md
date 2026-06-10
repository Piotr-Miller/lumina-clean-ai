---
project: "LuminaClean AI"
context_type: greenfield
created: 2026-05-23
updated: 2026-05-24
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "workflow friction (fix exists but switching device + installing software + transferring files kills follow-through)"
    - topic: "core insight"
      decision: "AI denoising models recently got good enough for casual use — the model is the new thing, not the workflow"
    - topic: "primary persona scope"
      decision: "individual casual mobile photographers, broadly (parents / travelers / concert-goers / etc.)"
    - topic: "auth model"
      decision: "email + password"
    - topic: "role model (v1)"
      decision: "Anonymous + User only; Admin role deferred to v2"
    - topic: "admin capabilities (deferred to v2)"
      decision: "view per-user rate-limit usage; reset/override a user's rate limit; view global usage/cost dashboard; disable Cloud AI globally (kill switch) — all deferred; v1 operator tasks via Supabase dashboard"
    - topic: "anonymous-visitor capability"
      decision: "Local engine only; no Cloud AI; no persisted history"
    - topic: "MVP scope deferrals"
      decision: "Defer to v2: Admin role + admin screens; per-user SQL rate limiting (replaced in v1 by global daily cap enforced server-side + Replicate billing alert)"
    - topic: "MVP scope kept in v1"
      decision: "Both engines (Cloud + Local); engine toggle; before/after comparison slider; email+password auth; async cloud pipeline; Cloudflare Pages deploy"
    - topic: "timeline budget"
      decision: "3 weeks of after-hours work"
    - topic: "guardrails"
      decision: "(1) Cloud daily cap actually blocks; (2) Anonymous users cannot trigger Cloud AI; (3) Uploaded source photos not publicly readable; (4) Cloud result returns within reasonable wait (~30s p95)"
  frs_drafted: 15
  quality_check_status: accepted
---

# LuminaClean AI — Shape Notes

Source: `idea-notes.md` (seed idea provided 2026-05-23).

## Vision & Problem Statement

Mobile night and low-light photos suffer from heavy digital noise and underexposure. A casual mobile photographer takes what would have been a memorable shot — a concert, a child's birthday candles, a dim restaurant — reviews it on their phone moments later, and sees an unsalvageably dark, grainy image. Today they have two paths: give up on the shot, or transfer the file to a desktop, install editing software (Lightroom, Photoshop, dedicated noise-reduction plugins), and learn enough about curves and noise-reduction sliders to fix it. Most people pick "give up". The pain is **workflow friction**: the fix technically exists, but the switch from phone to desktop, the install, the file transfer, and the skill curve combine to make follow-through near-zero.

The insight worth betting on now: **AI denoising and exposure-correction models have recently become good enough for casual use**. What used to require a paid desktop NR plugin plus an expert eye can now be delivered as a single-click "upload → see the fix" experience. The product opportunity is not a new editing workflow — it is removing the workflow entirely and letting the model do the decision-making.

## User & Persona

**Primary persona — Casual mobile photographer.** Anyone with a phone who occasionally takes low-light shots they care about: parents capturing birthdays / school plays / candlelit moments, travelers shooting evening scenes, concert and nightlife attendees, hobbyists who never crossed into "real" photo editing. They are not photographers by trade. They have no Lightroom subscription, no NR plugin, and no patience for a settings panel. They reach for this product the moment they see a disappointing night photo in their camera roll and want it fixed in seconds.

## Access Control

The product has two tiers of access for v1. Sign-up and sign-in use **email + password** — the lowest-surface option that doesn't depend on an external identity provider.

**Roles (v1):**

| Role | Sees / can do |
|------|---------------|
| Anonymous visitor (no account) | Upload a photo, run the **Local engine** only, see before/after, download the result. Cannot use Cloud AI. No history is persisted across sessions. |
| User (signed in) | Everything Anonymous can do, plus: switch to the **Cloud AI engine**, run it within the global daily cap, see their own job history. |

**Gated routes**: when an Anonymous visitor attempts to switch the engine toggle to Cloud AI, they are prompted to sign in. The action is not silently denied.

**Admin role — deferred to v2.** In v1, operator concerns (inspecting daily cap consumption, watching Replicate spend, manually clearing a stuck job, pausing cloud processing) are handled out-of-band via direct Supabase dashboard access. Introducing a first-class Admin role and admin UI is deferred to v2 — see `## Non-Goals`. v2 will add: per-user usage view, manual override, cost dashboard, and Cloud AI kill switch.

## Success Criteria

### Primary

- **End-to-end Cloud AI flow works.** A signed-in user uploads a low-light JPG, the Bread model processes it on Replicate, and the result appears in the frontend pushed via Realtime — no page refresh needed. The before/after slider shows a visibly cleaner image (less noise, better exposure) than the original.

### Secondary

- **Local engine produces visible improvement.** On a representative night photo, the Canvas-based Local engine (gamma correction + Gaussian blur) returns an output that is noticeably brighter and less noisy than the input — confirming the free fallback delivers real (if rougher) value.
- **Engine toggle is seamless.** Switching the toggle between Cloud and Local doesn't discard the uploaded source; the chosen engine just runs on what's already loaded.

### Guardrails

- **Cloud daily cap actually blocks.** Once the global daily Replicate quota is reached, further cloud jobs are rejected with a clear user-facing message. The bill is bounded; runaway cost is structurally impossible.
- **Anonymous users cannot trigger Cloud AI.** The engine toggle gates the Cloud option for anonymous visitors. There is no path — direct URL, API call, or otherwise — by which an unauthenticated request reaches Replicate.
- **Uploaded source photos are not publicly readable.** Storage and DB access are gated such that no anonymous URL exposes another user's source photo.
- **Cloud result returns within a reasonable wait.** End-to-end time from upload completion to result appearing in the frontend is ≤ ~30s at p95.

## Functional Requirements

### Authentication & access

- FR-001: Anonymous visitor can use the app and the Local engine without creating an account. Priority: must-have
  > Socrates: Counter considered — "anonymous use cannibalizes sign-ups; if Local is good enough, no one upgrades to Cloud." Resolution: kept. Local-as-acquisition is a deliberate funnel; the visible quality gap to Cloud is the upgrade incentive.

- FR-002: Visitor can sign up with email + password. Priority: must-have
  > Socrates: Counter considered — "password storage is its own risk surface; magic links eliminate the password entirely." Resolution: kept. Supabase Auth handles hashing, storage, and reset flows; reinventing this in v1 is not warranted.

- FR-003: Visitor can sign in with email + password. Priority: must-have
  > Socrates: Counter considered — "no 'forgot password' flow means a forgetful user is locked out forever; churn risk." Resolution: kept, and added FR-015 (password reset) as a new must-have FR.

- FR-004: Signed-in user can sign out. Priority: must-have
  > Socrates: Counter considered — "shared devices: without 'sign out from all sessions', a stolen token persists." Resolution: kept as written. Casual-photographer audience uses personal devices; shared-device risk is marginal in v1. Revisit if abuse appears.

- FR-015: Visitor can reset their password via an email-based reset flow. Priority: must-have
  > Socrates: (added during FR-003 Socrates round; the justification for its existence IS the FR-003 resolution above.)

### Upload & processing

- FR-005: Anonymous visitor or signed-in user can upload an image (JPG, PNG, or HEIC) from their device. Priority: must-have
  > Socrates: Counter considered — "JPG-only excludes HEIC (iPhone default) and PNG (screenshots); iOS users hit 'unsupported format' constantly." Resolution: REVISED. FR-005 now accepts JPG + PNG + HEIC. HEIC decoding strategy is non-trivial (browser HEIC support is uneven; may require libheif-js polyfill or server-side decode) — captured in Open Questions for the tech-stack-selector.

- FR-006: User can switch the processing engine via a toggle (Local / Cloud AI). Priority: must-have
  > Socrates: Counter considered — "two engines = twice the UI and test surface; ship one good one." Resolution: kept. The free/paid distinction IS the funnel; the toggle is the funnel hinge.

- FR-007: Anonymous visitor selecting the Cloud AI option is prompted to sign in. Priority: must-have
  > Socrates: Counter considered — "hide Cloud entirely for anonymous users; simpler UI." Resolution: kept. Visibility of Cloud-as-the-better-option is what motivates sign-up; gating-with-prompt is the funnel mechanism.

- FR-008: User can run the Local engine on the uploaded image and see the result client-side. Priority: must-have
  > Socrates: Counter considered — "gamma + Gaussian is naive; a blurry result isn't 'less noisy', may look worse than original." Resolution: kept. Local is the free taste — it should NOT be too good. The visible quality gap is the upgrade incentive for Cloud.

- FR-009: Signed-in user can run the Cloud AI engine on the uploaded image. Priority: must-have
  > Socrates: Counter considered — "cloud-model cold-starts (often 30s+) can violate the ≤30s p95 guardrail by themselves, before the model even runs." Resolution: kept; logged as Open Question to revisit if it bites in practice. Pre-optimization (warm-up pings, model swap) is not warranted before measurement.

- FR-010: Signed-in user receives the Cloud AI result automatically when ready (push), without polling or refreshing. Priority: must-have
  > Socrates: Counter considered — "Realtime adds a complete subsystem (websockets, channel subscriptions, RLS on Realtime); polling is dumber but works." Resolution: kept. Push delivery is part of the 'modern web' feel; without it the wait feels broken. Subsystem cost is accepted.

### Results & history

- FR-011: User can view the processed result alongside the original via a before/after comparison slider. Priority: must-have
  > Socrates: Counter considered — "drag-slider is a UI gimmick; side-by-side or tap-to-toggle is equivalent." Resolution: kept. The drag-reveal IS the wow moment — the demo gesture worth building for shareability and the 'oh, it actually worked' reaction.

- FR-012: User can download the processed image. Priority: must-have
  > Socrates: Counter considered — "screenshot is sufficient on mobile." Resolution: kept. A screenshot is JPEG-recompressed at screen resolution; real download preserves the processed image at full quality.

- FR-013: Signed-in user can view their own past jobs (history). Priority: nice-to-have
  > Socrates: Counter considered — "history UI adds a list view + persisted thumbnails + RLS on history rows; significant work for a v1 nice-to-have." Resolution: REVISED. Job data still persists in v1 (it has to, for Realtime delivery in FR-010), but the history UI is deferred to v2. FR-013 demoted from must-have to nice-to-have; v1 surfaces only the current job.

### Cost protection

- FR-014: The system rejects any Cloud AI request that would exceed the global daily cap, with a clear user-facing message. Priority: must-have
  > Socrates: Counter considered — "a global cap hits all users when one goes wild; without per-user limits one bad actor DoSes the service for everyone." Resolution: kept. Acceptable risk for v1's small user base; per-user limits are already planned for v2. Per-IP soft throttle is not added now but available as a fast follow if abuse appears.

## User Stories

### US-01: Signed-in user enhances a low-light photo with Cloud AI

- **Given** a user who has signed in with email + password
- **When** they upload a low-light JPG and choose the Cloud AI engine
- **Then** the photo is processed by the cloud model and the enhanced result appears in the frontend pushed in real time without manual refresh, displayed in a before/after comparison slider

#### Acceptance Criteria

- The user does not need to refresh the page or poll for status; the result arrives via push
- End-to-end time from upload completion to result visible is ≤ ~30s at p95
- The processed image is visibly cleaner (less noise, better exposure) than the original on a representative night photo
- The user can download the processed image
- If the global daily cap has been reached, the system rejects the request with a clear message before invoking the cloud model

### US-02: Anonymous visitor enhances a photo with the Local engine

- **Given** an anonymous visitor who has not signed in
- **When** they upload a low-light JPG and run the Local engine
- **Then** the image is processed entirely client-side and the enhanced result appears in a before/after comparison slider

#### Acceptance Criteria

- No network round-trip is required after the image is loaded into the page
- The result is visibly brighter and less noisy than the input on a representative night photo
- The user can download the processed image
- The Cloud AI option is gated for anonymous visitors: clicking it prompts sign-in, never silently denied

## Business Logic

Given a low-light photo and a chosen engine, the app produces a visibly brighter, less noisy version of the same photo.

The rule consumes one user-facing input — a still photograph from the user's device — and one user-facing choice — which engine (Local or Cloud AI) to apply. The output is a single derived image that the user perceives as cleaner and better-exposed than the original; it preserves the framing, subject, and composition of the source. The user encounters the rule by uploading, choosing an engine, waiting, and seeing the result revealed against the original via the before/after slider. Quality is the contract: the output must be visibly *better*, not merely visibly *different*.

The decisions the app does NOT make — and explicitly delegates to the user — are: which engine to apply, whether to keep or discard the result, and what to do with the processed image after it appears. The app's responsibility is the transformation itself (fidelity to "brighter and less noisy") and the delivery experience around it.

## Non-Functional Requirements

- A user's uploaded source photo is not retrievable by any other user, by URL guessing or otherwise.
- Source photos do not persist in operator-accessible storage beyond 24 hours after processing completes.
- On a typical modern phone processing a representative 12MP photo, the Local engine result is visible within ~2s of the user invoking it.
- A legitimate user who mistypes their password three times in a row is not locked out, but credential stuffing at scale is rejected before reaching the auth check.
- The product is usable on phone-class browsers at typical mobile screen sizes (portrait orientation, ≤ ~400px logical width).
- The product remains usable on the latest two major versions of Chrome, Safari, Firefox, and Edge.

## Non-Goals

**Functional non-goals (capabilities v1 will NOT provide):**

- **No RAW format support** (DNG / CR2 / NEF / etc.). RAW requires a dedicated server-side decoder and a RAW-domain enhancement model — a separate pipeline outside v1's scope.
- **No advanced Local engine** (OpenCV.js / WASM / CLAHE / NLM denoising / WebGPU shaders). Local stays naive (gamma correction + Gaussian blur via Canvas API) in v1; the quality gap to Cloud is intentional.
- **No native mobile apps** in v1. Web only at launch; iOS/Android native are a separate product surface.
- **No social features** — no sharing galleries, no public profiles, no collaborative editing. Single-tenant by design in v1.
- **No Admin role or Admin UI in v1.** Deferred to v2. Operator tasks (inspecting daily-cap consumption, watching cloud spend, pausing cloud processing, manually clearing a stuck job) are handled out-of-band via direct Supabase dashboard access until v2.
- **No per-user rate limiting in v1.** Deferred to v2. v1 enforces only a global daily cap (FR-014) plus a billing alert from the cloud-model provider as backstop.
- **No history UI in v1.** Job data persists (it must, for Realtime delivery in FR-010), but the user-facing history list view is deferred to v2.

**Non-functional non-goals (quality dimensions v1 will NOT aim for):**

- **No formal anti-bot defense** (Turnstile / WAF / CAPTCHA). v1 relies on auth-gating + the global daily cap + observation to mitigate abuse. Real bot defense is fast-follow if it becomes necessary.
- **No offline functionality.** The app requires network for auth and Cloud AI; the Local engine technically works offline once the page is loaded, but offline is not a committed product property.

## Quality cross-check

All required elements present:

- ✓ Access Control (Anonymous + User tiers; email+password; v2-deferred Admin noted)
- ✓ Business Logic (one-sentence transformation rule; not empty-CRUD)
- ✓ Project artifacts (shape-notes.md with frontmatter, checkpoint, product_type, target_scale, timeline_budget)
- ✓ Timeline-cost acknowledged (mvp_weeks: 3 — at the discipline target)
- ✓ Non-Goals (7 functional + 2 non-functional, each with rationale)
- ✓ Preserved behavior — n/a (greenfield)

`quality_check_status: accepted`. No gaps surfaced.

## Open Questions (running list)

1. **HEIC decoding strategy.** FR-005 accepts HEIC, but browser HEIC support is uneven (Safari yes, Chrome/Firefox no). Owner: tech-stack-selector. Resolution path: pick between (a) `libheif-js` polyfill client-side, (b) server-side decode on upload, (c) detect-and-reject with a friendly conversion prompt.
2. **Cloud model cold-start risk vs. ≤30s p95 guardrail.** FR-009 + Guardrails commit to ≤30s p95 end-to-end. The chosen cloud model's typical cold-start may consume most or all of that budget. Owner: tech-stack-selector + early prototype measurement. Resolution path: measure on the real model; if violated, choose between warm-up ping strategy, model swap, or relaxing the SLA.

## Forward: tech-stack

> **Informational only — NOT part of PRD.** The user's seed notes proposed concrete technologies. These are captured here verbatim so they aren't lost; the actual stack selection happens downstream in `10x-tech-stack-selector` after `/10x-prd`.

User-volunteered stack hints from `idea-notes.md`:

- **Cloud AI**: Bread model on Replicate (denoising + exposure correction).
- **Local fallback**: client-side processing via Canvas API (gamma correction + Gaussian blur).
- **Engine toggle**: Strategy Pattern between Cloud AI and Local engine.
- **Auth & data**: Supabase Auth + Row-Level Security (RLS) for cloud usage gating.
- **Async cloud pipeline**: signed upload → Database Webhook → Edge Function → Replicate prediction with webhook callback → Supabase Realtime push to frontend.
- **Cost protection**: RLS-gated cloud access + a SQL-enforced global daily cap on Cloud AI ops across all users (default 50, reset 00:00 UTC; configurable via `CLOUD_DAILY_CAP`, `0` = kill-switch).
- **Hosting**: Cloudflare Pages.

These will be evaluated, accepted, or revisited downstream — they are NOT pre-committed by the PRD.
