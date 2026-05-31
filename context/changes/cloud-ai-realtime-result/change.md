---
change_id: cloud-ai-realtime-result
title: "Async Cloud AI pipeline + Realtime result delivery"
status: implementing
created: 2026-05-31
updated: 2026-05-31
review_round: 2
---

## Notes

Roadmap entry **S-04** — the **north star** (`context/foundation/roadmap.md:119-131`). Prerequisite **S-03** (gated-cloud-upload) done + archived. Parallel with S-02 (done).

**Outcome:** once a photo is submitted (S-03 leaves a `queued` job + source in the private bucket), the async pipeline runs — Database Webhook → Supabase Edge Function → Replicate "Bread" prediction with webhook callback → Edge Function updates the job row → Supabase Realtime pushes the `succeeded` row to the browser, which renders the enhanced result in the before/after slider with download, no manual refresh — within ~30s p95. Delivers PRD **US-01; FR-009, FR-010, FR-011, FR-012**.

**The riskiest slice** (north star): surfaces the async-pipeline + cold-start question. Two ops surfaces (Supabase pipeline vs Cloudflare frontend). `/10x-plan` will likely split into (a) pipeline + Replicate integration and (b) Realtime push + result render.

Internal + external research: `research.md` (plan-ready deep dive, 2026-05-31).
