---
change_id: cloud-flip-on-revalidation
title: Cloud flip-ON re-validation (D.1 — live retention + cold-boot checks)
status: new
created: 2026-06-07
updated: 2026-06-07
archived_at: null
---

## Notes

Owns the deferred **D.1** flip-ON closure criterion shared by **S-08** (`cloud-job-retention-cleanup`) and **S-09** (`cloud-source-url-ttl-fix`) — both archived/immutable, so their D.1 checkboxes can't be flipped; this change is D.1's new home.

**Goal:** with the cloud code now flip-ON-ready (S-05 ✓ spend cap, S-08 ✓ retention/F8/F9, S-09 ✓ source-URL TTL), exercise the live Replicate pipeline and confirm the retention + cold-boot behavior holds end-to-end.

**D.1 assertions to verify** (from S-08/S-09 plans):
- A `failed`/abandoned job's **source** object is gone (24h-retention NFR).
- A late-`/callback` race leaves **no orphaned result** (F5/F9).
- The **create-job sweep** reclaims a deliberately-stranded stale `queued`/`processing` row + its source.
- (S-09) A slow Replicate cold boot (>300s) does **not** expire the source READ URL before the model fetches it.
- Smoke: a cloud submit transitions `queued → processing → succeeded` via Realtime; the daily cap rejects beyond `CLOUD_DAILY_CAP`.

**Decisions (2026-06-07):**
- **Sequencing:** local re-validation FIRST (dev project `luminaclean-dev` + public tunnel for Replicate callbacks via `EDGE_FUNCTION_URL`), THEN a controlled prod flip-ON.
- **Credentials:** user provides/sets `REPLICATE_API_TOKEN` + `REPLICATE_WEBHOOK_SIGNING_SECRET` (+ `DB_WEBHOOK_SECRET`). Not in repo (`production-config.md` credential inventory: "not set yet").
- **Prod flip is the one outward-facing, billable, hard-to-reverse step** — gated behind explicit go-ahead + a low `CLOUD_DAILY_CAP`, with the `CLOUD_DAILY_CAP=0` kill-switch as instant reverse.

**Reference runbook (read-only, archived):** `context/archive/2026-06-04-production-deployment/go-live.md` → "Flip-ON runbook (documented, NOT executed)" (5 steps: DB-webhook GUCs → Edge Function secrets → Worker secrets → verify → kill-switch). Durable config inventory: `context/foundation/production-config.md` §2.

**Known blocker:** prod DB-webhook GUCs (`app.settings.edge_function_url` / `db_webhook_secret`) are unset due to a hosted-Supabase custom-GUC limitation — see `context/archive/2026-06-04-production-deployment/deferred-2.4-db-webhook-settings.md`. Needs a workaround before the prod webhook path fires. (Local can use the `EDGE_FUNCTION_URL` override instead.)
