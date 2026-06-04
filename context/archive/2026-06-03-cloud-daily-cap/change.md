change_id: cloud-daily-cap
title: "Global daily cap on Cloud AI requests"
status: archived
created: 2026-06-03
updated: 2026-06-04
archived_at: 2026-06-04T20:26:54Z
---

## Notes

Roadmap entry **S-05** — cloud cost protection (`context/foundation/roadmap.md:139-150`). Prerequisite **S-04** (cloud-ai-realtime-result) done + archived. Parallel with S-02 (done), S-06, S-07. Land immediately after S-04 to bound cloud spend (until this ships, real Replicate calls are uncapped).

**Outcome:** a Cloud AI request that would exceed the **global** daily cap is rejected in the `create-job` route — before any storage/Replicate work — with a clear user-facing message (HTTP `429 daily_cap_reached`); the bill is structurally bounded. Delivers PRD **FR-014**.

**Scope (per /10x-plan questioning, 2026-06-03):**

- **Global** cap, not per-user (PRD FR-014 + Non-Goals; per-user is explicitly v2). The "20 ops/**user**/24h" phrasing in `idea-notes.md`, `CLAUDE.md`, and the F-01 migration index comment is **stale** vs the PRD.
- Cap **value** is an env var `CLOUD_DAILY_CAP` (default 50); `0` doubles as an operator kill-switch.
- Window: **calendar day, UTC**.
- A job counts toward the cap **unless it is a pre-model failure** — predicate `NOT (status = 'failed' AND replicate_prediction_id IS NULL)`. Failures that never reached Replicate cost nothing and don't burn quota.
- Enforcement: **best-effort** count-then-insert in the `create-job` route (TOCTOU overrun bounded by concurrency, accepted at v1 scale; provider billing alert is the backstop). No new migration, no Edge/DB function — keeps collisions with S-07/S-08 at zero.

Plan: `plan.md` / `plan-brief.md` (2026-06-03).
