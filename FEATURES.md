# LuminaClean AI — Feature List

> A night/low-light photo enhancement web app (denoise + exposure correction) with two
> interchangeable engines: a cloud AI model and a local in-browser fallback.
> Derived from `context/foundation/prd.md`, `context/foundation/tech-stack.md`, and
> `context/foundation/infrastructure.md`. Scope is the v1 MVP.

## Authentication & Access

- **Anonymous usage** — Visitors can use the app and run the Local engine without creating an account (FR-001).
- **Email + password sign-up** — Visitors can create an account with email and password (FR-002).
- **Email + password sign-in** — Returning users can sign in (FR-003).
- **Sign-out** — Signed-in users can sign out (FR-004).
- **Password reset** — Users can reset a forgotten password via an email-based flow (FR-015).
- **Two-tier access model** — Anonymous (Local engine only) vs. signed-in User (Local + Cloud AI within the daily cap).

## Image Upload & Processing

- **Image upload** — Upload a JPG, PNG, or HEIC image from the device (FR-005).
- **Engine toggle (Strategy pattern)** — Switch the processing engine between **Local** and **Cloud AI** without discarding the already-loaded source image (FR-006).
- **Cloud AI gating with sign-in prompt** — Anonymous visitors who pick Cloud AI are prompted to sign in rather than being silently denied; the Cloud option stays visible as the upgrade incentive (FR-007).
- **Local engine (client-side)** — Run an in-browser brightening + denoise transformation (Canvas API: gamma correction + Gaussian blur); no network round-trip after the image is loaded (FR-008).
- **Cloud AI engine** — Signed-in users run the cloud denoising/exposure-correction model (Bread on Replicate) on the uploaded image (FR-009).
- **Real-time result push** — The Cloud AI result is delivered to the page automatically when ready via Supabase Realtime — no manual refresh or polling (FR-010).

## Results & Output

- **Before/After comparison slider** — View the processed result against the original with a drag-reveal slider (FR-011).
- **Download** — Download the processed image at full quality (FR-012).
- **Job history** *(nice-to-have / deferred to v2 UI)* — Job data persists in v1 (needed for the result push); the user-facing history list view is deferred to v2 (FR-013).

## Cost Protection & Guardrails

- **Global daily cap** — Cloud AI requests that would exceed the global daily quota are rejected with a clear user-facing message before the model is invoked (FR-014).
- **Auth-gated cloud access** — No path (direct URL, API call, etc.) lets an unauthenticated request reach cloud processing.
- **Private source storage** — Uploaded source photos are not publicly readable; no anonymous URL exposes another user's source photo (RLS-gated storage).
- **24-hour source retention** — Source photos do not persist in operator-accessible storage beyond 24 hours after processing completes.
- **Bounded cloud latency** — End-to-end time from upload completion to result appearing targets ≤ ~30s at p95.

## Non-Functional Qualities

- **Fast local processing** — Local engine result visible within ~2s of invocation on a typical modern phone with a ~12MP photo.
- **Mobile-first** — Usable on phone-class browsers in portrait orientation (≤ ~400px logical width).
- **Desktop support** — Usable on the latest two major versions of the four mainstream desktop browsers.
- **Credential-stuffing resistance** — A user who mistypes their password a few times is not locked out, but credential stuffing at scale is rejected before reaching the auth check.

## Architecture Highlights

- **Astro 6 SSR + React 19 islands** — Server-rendered app with interactive React islands for the upload UI, engine toggle, and before/after slider.
- **Supabase backbone** — Auth, Postgres, private storage (RLS), and the Realtime push channel.
- **Async cloud pipeline** — Signed upload → database webhook → Supabase Edge Function → Replicate prediction with webhook callback → Supabase Realtime push to the frontend.
- **Cloudflare Workers deployment** — SSR frontend hosted on Cloudflare Workers (`@astrojs/cloudflare`); long-running inference runs externally on Replicate.

## Out of Scope (v1 Non-Goals)

- RAW format support (DNG / CR2 / NEF, etc.).
- Advanced local engine (OpenCV.js / WASM / Web Worker / CLAHE / NLM denoising / WebGPU).
- Native mobile apps (web only at launch).
- Social features (sharing galleries, public profiles, collaborative editing).
- Admin role / admin UI (operator tasks handled out-of-band; deferred to v2).
- Per-user rate limiting (v1 uses only the global daily cap; deferred to v2).
- History UI (data persists, but the list view is deferred to v2).
- Formal anti-bot defense (CAPTCHA / Turnstile / WAF).
- Committed offline functionality.
- Magic-bytes file validation in Edge Functions.
- Automatic raw-uploads retention cleanup (pg_cron).
- Multi-format import beyond JPG/PNG/HEIC (TIFF, etc.).
