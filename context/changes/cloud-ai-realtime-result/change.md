---
change_id: cloud-ai-realtime-result
title: "Async Cloud AI pipeline + Realtime result delivery"
status: implementing
created: 2026-05-31
updated: 2026-06-02
review_round: 2
---

## Notes

Roadmap entry **S-04** — the **north star** (`context/foundation/roadmap.md:119-131`). Prerequisite **S-03** (gated-cloud-upload) done + archived. Parallel with S-02 (done).

**Outcome:** once a photo is submitted (S-03 leaves a `queued` job + source in the private bucket), the async pipeline runs — Database Webhook → Supabase Edge Function → Replicate "Bread" prediction with webhook callback → Edge Function updates the job row → Supabase Realtime pushes the `succeeded` row to the browser, which renders the enhanced result in the before/after slider with download, no manual refresh — within ~30s p95. Delivers PRD **US-01; FR-009, FR-010, FR-011, FR-012**.

**The riskiest slice** (north star): surfaces the async-pipeline + cold-start question. Two ops surfaces (Supabase pipeline vs Cloudflare frontend). `/10x-plan` will likely split into (a) pipeline + Replicate integration and (b) Realtime push + result render.

Internal + external research: `research.md` (plan-ready deep dive, 2026-05-31).

## Phase 5 addendum — cold-start handling (implemented) + follow-ups

**Implemented (deviation from the plan's literal "~60s watchdog", per Phase-0 spike-finding #1 which the plan text contradicted):**

- **Two-phase client watchdog** in `useCloudJob.ts` instead of a single 60s timer: `QUEUED_WATCHDOG_MS = 30s` for `queued→processing` (genuine-stall fast-fail) and `PROCESSING_WATCHDOG_MS = 180s` for `processing→terminal` (absorbs Bread's ~135s cold boot). A single fixed timeout can't both fail real stalls fast and tolerate cold boots.
- **Re-check before failing**: the queued deadline does NOT fire blindly — it re-reads the row authoritatively and only times out if it's still `queued`. This fixes a race where the `queued→processing` Realtime event lands in the subscribe gap (the channel only delivers future events) and the watchdog would otherwise kill a cold job mid-boot.
- **Catch-up read on `SUBSCRIBED`**: folds in any transition that committed before the channel went live (also re-syncs on reconnect), so a missed `processing` doesn't false-fail and a pre-subscription `succeeded` still renders.
- **Progressive cold-start affordance**: `coldStartHint` after ~25s shows "first run after idle can take up to ~2 minutes"; warm runs (~5s) never see it.
- **Unified timeout copy**: the `/timeout` route's stored `error_message` matches the client `TIMEOUT_MESSAGE` so there's no flicker between two strings.

Generalized into `lessons.md` (two new lessons: Realtime-driven watchdog catch-up/re-check; sizing timeouts + signed-URL TTLs to the cold-boot ceiling).

**Follow-ups (parked in `roadmap.md` → Parked; none block S-04):**

1. **Source signed-URL TTL vs cold-boot expiry** (recommended next, real prod reliability gap): the Edge Function signs the source READ URL for 300s; a cold boot >300s (observed under load) expires it before Replicate fetches → prediction dies at source-fetch (400). Raise `SOURCE_URL_TTL_SECONDS` (~900s) in `supabase/functions/enhance/index.ts`.
2. Replicate burst-limit (429) bounded retry/backoff in `/start` (optional).
3. Cancel-in-flight on "Start over" (new owner-scoped cancel route + Replicate cancel + a terminal state; deferred, negligible cost today).
4. Keep-warm (provider min-instances) — only true cold-latency fix; cost decision, deferred (tension with S-05).
