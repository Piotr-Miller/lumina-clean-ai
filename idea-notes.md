# LuminaClean AI – MVP Ideas

### Main Problem

Night and low-light photos taken on mobile devices suffer from heavy digital noise and underexposure. Fixing them manually requires desktop software and expertise, discouraging casual photographers from salvaging otherwise memorable shots.

### Minimum Feature Set

- AI-powered image enhancement via a cloud model (Bread on Replicate) — single upload, automatic denoising + exposure correction
- Instant client-side processing as a free fallback (Canvas API: gamma correction + Gaussian blur)
- Dedicated toggle to switch between Cloud AI and Local engine (Strategy Pattern)
- Simple user account system for storing jobs and gating cloud usage (Supabase Auth + RLS)
- Before / After comparison slider for the processed result
- Async cloud pipeline: signed upload → Database Webhook → Edge Function → Replicate prediction with webhook callback → Supabase Realtime push to frontend
- Basic cost protection: RLS-gated cloud access + SQL rate limiting (global cap of 50 cloud AI ops / day across all users, resetting at 00:00 UTC; configurable via `CLOUD_DAILY_CAP`)

### What is NOT in MVP Scope

- RAW format support (requires a dedicated server-side decoder and a RAW-domain model — separate Cog pipeline)
- Advanced local engine (OpenCV.js / WASM / Web Worker / CLAHE / NLM denoising)
- WebGPU shader-based processing
- Magic bytes file validation in Edge Functions
- Cloudflare Turnstile / WAF bot protection
- ~~Automatic raw-uploads retention cleanup (pg_cron)~~ — **now implemented** (change `retention-reaper`, Risk #5): an hourly pg_cron sweep deletes lingering `source.*` objects past the 24h-retention NFR window, backstopping the inline on-failure deletion. Reversed after a live prod breach (two source photos lingered ~7.7 days).
- Newer AI models (e.g. Retinexformer) requiring custom Cog deployment
- Multi-format import (TIFF, HEIC, etc.)
- Social features (sharing galleries, public profiles)
- Mobile apps (web only at launch)

### Success Criteria

- End-to-end cloud flow works: upload JPG → Bread processes → result appears via Realtime push without page refresh
- Local engine produces a visible improvement (brighter, less noisy) on a sample night photo
- Toggle switches between engines seamlessly — cloud result is noticeably better than local
- Unauthenticated users can use the local engine; cloud requires login
- Rate limit correctly blocks the 51st cloud request within a UTC day (global cap, all users combined)
- Deployed and accessible on Cloudflare Pages
