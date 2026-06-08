# Cloud flip-ON re-validation (D.1) — Plan Brief

> Full plan: `context/changes/cloud-flip-on-revalidation/plan.md`

## What & Why

Close the deferred **D.1** flip-ON criterion shared by the archived **S-08** (retention cleanup) and **S-09** (source-URL TTL). The cloud code is flip-ON-ready (S-05 cap + S-08 retention/F8/F9 + S-09 TTL all landed); D.1 is the live re-validation that those invariants actually hold end-to-end — done **local-first, then a controlled prod flip**.

## Starting Point

Cloud ships OFF in prod. Locally, most prerequisites exist: the Replicate webhook signing secret is already in `supabase/functions/.env`, local `app.settings` GUCs are settable (the hosted-Supabase block is prod-only), and three harness scripts exist (a signed `/callback` driver is the key one). Missing: the Replicate API token (user provides), a public tunnel, and any documented local cloud-run runbook.

## Desired End State

D.1 closed with recorded evidence: locally a failed job deletes its source, the create-job sweep reclaims a stale row, and a late-`/callback` race leaves no orphaned result; a live warm Bread submit completes `queued→processing→succeeded` with correct retention; the cap rejects beyond its limit; and a controlled prod flip (cap 3) runs one real job before an explicit leave-ON-vs-OFF operator decision.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Sequencing | Local first, then prod (all 4 phases planned now) | Escalate cheap→costly; prod gated at execution | Change scaffold + Plan |
| Deterministic assertions | Harness-driven (signed-callback + service/DB) | Fast, repeatable, zero Replicate cost, deterministic race | Plan |
| Cold-boot depth | Opportunistic single cold hit | Real proof at minimal cost; TTL-margin fallback | Plan |
| Prod GUC blocker | Try direct-connection first; native-webhook migration fallback | Cheapest path, no migration if it works | Plan |
| Prod cap | `CLOUD_DAILY_CAP=3` | Proves cap + cap-reject at trivial spend | Plan |
| Tunnel | cloudflared quick tunnel | Zero-config HTTPS, on-brand with CF stack | Plan |
| Recording | `results.md` + foundation/roadmap notes | Durable, archivable evidence | Plan |
| Done bar | Deterministic blocking, live best-effort | Closes on solid evidence without cold-boot hostage | Plan |
| Credentials | User provides `REPLICATE_API_TOKEN` (gitignored env / prod secrets) | Not in repo | Change scaffold |

## Scope

**In scope:** local pipeline bring-up + runbook; deterministic 2a/2b/2c assertions; live happy-path + cap + cold-boot; controlled prod flip + retention spot-check + D.1 record.

**Out of scope:** changing S-08/S-09 app code (except a fallback-only prod webhook migration); editing archived plans; committing secrets; forcing a cold boot / lowering TTL; auto-deciding go-live.

## Architecture / Approach

Four escalating phases: (1) local Supabase stack + GUCs + Edge Function + flag ON + runbook; (2) a token-free deterministic harness (`scripts/spikes/d1-retention-check.ts`) asserting the three retention invariants via storage-object oracles — the blocking evidence; (3) real Bread via a cloudflared tunnel for the warm happy-path + opportunistic cold boot; (4) prod GUC resolution + bounded-cap flip + spot-check + operator gate + close-out.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Local bring-up | Working local pipeline + local-runbook.md | Local GUC/tunnel wiring fiddly; undocumented before now |
| 2. Deterministic assertions | `d1-retention-check.ts` proving 2a/2b/2c | Faithfully simulating the watchdog race |
| 3. Live + cold-boot | Warm happy-path + cap + cold-boot proof | Cold boot nondeterministic; tunnel per-session URL |
| 4. Prod flip + close-out | Controlled flip, spot-check, D.1 recorded | GUC may need the migration fallback; outward-facing/billable |

**Prerequisites:** Docker running, `cloudflared` installed, `REPLICATE_API_TOKEN` (+ Bread access). Signing secret already present.
**Estimated effort:** ~2–3 sessions (Phase 2 deterministic; Phases 3–4 gated on creds + your go-ahead).

## Open Risks & Assumptions

- Prod direct-connection `ALTER DATABASE SET` may be denied → native-webhook migration fallback (adds a trigger rewrite + re-validation).
- A cold boot may not trigger in a reasonable window → TTL-margin reasoning recorded instead of live proof.
- cloudflared mints a new URL per session → `EDGE_FUNCTION_URL` + the DB GUC must be re-synced each run (runbook covers this).
- Interactive auth needed (Supabase CLI, wrangler) + the user-supplied Replicate token.

## Success Criteria (Summary)

- The deterministic harness exits 0 on all three retention invariants (re-runnable).
- A warm live Bread submit completes via Realtime with the source deleted + result present; the cap returns 429 beyond its limit.
- A controlled prod job + cap-reject + retention spot-check pass; the leave-ON/OFF decision is applied and D.1 is recorded as closed.
