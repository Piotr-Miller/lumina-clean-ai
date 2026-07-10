# LuminaClean AI – MVP Ideas

### Main Problem

Night and low-light photos taken on mobile devices suffer from heavy digital noise and underexposure. Fixing them manually requires desktop software and expertise, discouraging casual photographers from salvaging otherwise memorable shots.

### Minimum Feature Set

- AI-powered image enhancement via a cloud model (Bread on Replicate) — single upload, automatic denoising + exposure correction. **✅ LIVE in prod since 2026-06-08** (luminacleanai.com; `CLOUD_PIPELINE_ENABLED=true`, `CLOUD_DAILY_CAP=3`, kill-switch `=0`). Augmented with an adaptive **YCbCr chroma-denoise post-pass** that reduces colored shadow noise — flag enabled 2026-06-27 (change `bread-chroma-postpass`, S-11).
- Instant client-side processing as a free fallback (Canvas API: gamma correction + Gaussian blur)
- Dedicated toggle to switch between Cloud AI and Local engine (Strategy Pattern)
- Simple user account system for storing jobs and gating cloud usage (Supabase Auth + RLS)
- Before / After comparison slider for the processed result
- Async cloud pipeline: signed upload → Database Webhook → Edge Function → Replicate prediction with webhook callback → Supabase Realtime push to frontend
- Basic cost protection: RLS-gated cloud access + SQL rate limiting (global cap of 50 cloud AI ops / day across all users, resetting at 00:00 UTC; configurable via `CLOUD_DAILY_CAP`). **Set conservatively to 3 in prod; `0` = kill-switch.**

**Added after MVP launch (post-MVP, already shipped):**

- **Adaptive parameters (Auto + manual sliders)** — after selecting a photo, a right-side panel (moved below the image on narrow screens) lets the user adjust Local `gamma` + blur intensity or Bread `gamma` + `strength`, starting from Auto-recommended values with the ability to override any slider manually (change `adaptive-enhancement-parameters`, S-12, PR #81).
- **Hard-cancel of an in-flight cloud job** — "Start over" during processing cancels the running Cloud AI job (flip `failed` / `error_code:"canceled"` + delete the orphaned source + best-effort Replicate `predictions.cancel` via a new Edge `/cancel` sub-path) (change `cloud-job-cancel`, PR #93).
- **Retention backstop (pg_cron)** — an hourly reaper deletes lingering `source.*` objects past the 24h window (change `retention-reaper`, S-10, PR #30). See also "What is NOT in MVP Scope".
- **Landing 2.0 + SEO** — below-the-fold growth: How-it-works / FAQ sections, three photography guides under `/guides/*`, sitemap (incl. guides), meta/OG/canonical, robots.txt, a 1200×630 OG card (change `landing-content`, PR #89).
- **Idle-session logout** — a signed-in user's session expires after 30 min of inactivity, enforced in middleware (change `session-idle-timeout`).
- **Custom production SMTP (Resend)** — transactional email (password reset, notifications) scaled past the built-in Supabase sender's cap; live in prod.

### What is NOT in MVP Scope

- RAW format support (requires a dedicated server-side decoder and a RAW-domain model — separate Cog pipeline) — **now signalled as "coming soon"** (landing FAQ, 2026-07-07): still out of the current MVP for the reasons noted, but on the public post-MVP roadmap rather than a hard non-goal.
- Advanced local engine (OpenCV.js / WASM / Web Worker / CLAHE / NLM denoising)
- WebGPU shader-based processing
- Magic bytes file validation in Edge Functions
- Cloudflare Turnstile / WAF bot protection
- ~~Automatic raw-uploads retention cleanup (pg_cron)~~ — **now implemented** (change `retention-reaper`, Risk #5): an hourly pg_cron sweep deletes lingering `source.*` objects past the 24h-retention NFR window, backstopping the inline on-failure deletion. Reversed after a live prod breach (two source photos lingered ~7.7 days).
- Newer AI models (e.g. Retinexformer) requiring custom Cog deployment — still out of scope; considered as a parked Premium path (S-13). _(Note: the shipped chroma-denoise post-pass is a lightweight programmatic quality add-on to the Bread result, not a new model.)_
- Multi-format import (TIFF, etc.) — **except HEIC, now signalled as "coming soon"** (landing FAQ, 2026-07-07): HEIC is on the public post-MVP roadmap; TIFF and the rest stay out of scope.
- Social features (sharing galleries, public profiles)
- Mobile apps (web only at launch)

_Signalled as "coming soon" (outside the current MVP):_ UI localization to 7 languages (EN + DE, PL, FR, ES, UKR, ZH) — slice **S-15** is ready (UI copy already externalized) but **deliberately on hold** (user decision, 2026-07-10).

### Success Criteria

- ✅ End-to-end cloud flow works: upload JPG → Bread processes → result appears via Realtime push without page refresh
- ✅ Local engine produces a visible improvement (brighter, less noisy) on a sample night photo
- ✅ Toggle switches between engines seamlessly — cloud result is noticeably better than local
- ✅ Unauthenticated users can use the local engine; cloud requires login
- ✅ Rate limit correctly blocks the 51st cloud request within a UTC day (global cap, all users combined; prod threshold set conservatively to 3)
- ✅ Deployed and accessible on Cloudflare ~~Pages~~ **Workers** (SSR via `@astrojs/cloudflare`), on the branded domain **luminacleanai.com**
