---
date: 2026-06-10T21:11:10+0200
researcher: Piotr Miller
git_commit: 1c1c99d5daa088f3d49e68c2c2c010e23147642d
branch: master
repository: LuminaClean_AI
topic: "Stale daily-cap phrasing in docs vs. the live global CLOUD_DAILY_CAP behavior"
tags: [research, codebase, cloud-daily-cap, doc-drift, FR-014, CLOUD_DAILY_CAP]
status: complete
last_updated: 2026-06-10
last_updated_by: Piotr Miller
---

# Research: Stale daily-cap phrasing in docs vs. the live global CLOUD_DAILY_CAP behavior

**Date**: 2026-06-10T21:11:10+0200
**Researcher**: Piotr Miller
**Git Commit**: 1c1c99d5daa088f3d49e68c2c2c010e23147642d
**Branch**: master
**Repository**: LuminaClean_AI

## Research Question

Where across the (non-archived) codebase is the cloud daily cap described, what is the
authoritative ground-truth behavior, and which descriptions drift from it? This grounds a
docs-only correction change (`cap-doc-drift`) deferred by `cap-rejection-coverage`.

## Summary

The cloud daily cap is, and has always been by design, a **global / cross-user** cap:
**default `50`** (`astro.config.mjs:28`), live prod **`3`** (operator override), reset at a
**fixed 00:00 UTC calendar-day boundary**, configured via the `CLOUD_DAILY_CAP` server
secret with **`0` as kill-switch**. The route rejects an over-cap submission with **HTTP 429
`daily_cap_reached`** before any insert / signed-URL / Replicate work (PRD **FR-014**).

The codebase is overwhelmingly consistent with this (44+ correct mentions across PRD,
roadmap, test-plan, production-config, source, tests, `.env.example`, `astro.config.mjs`).
**Three** live (non-archived) locations drift, all asserting a **per-user 20-ops/24h** model
that was **never implemented**:

1. **`CLAUDE.md:31`** — "rate-limited (20 ops/user/24h …)" — wrong on scope, value, and reset.
2. **`context/foundation/shape-notes.md:239`** — "SQL-side rate limiting (20 AI ops / user / 24h)" — same stale model. **(Not in the original `change.md`; found by this research.)**
3. **`supabase/migrations/20260528120000_create_jobs_table.sql:49-52`** — index comment describes the cap query as per-user `COUNT(*) WHERE user_id = $1 …` and claims the `user_id`-leading index serves it. Both are false for the shipped global query.

`idea-notes.md:15` is **correct** (already global/50/UTC-day) and is **not** a target — it
was one of the files the 2026-06-03 cap design flagged as stale and has since been fixed.

A secondary, deeper finding on the migration comment (see Architecture Insights): the
`jobs_user_id_created_at_idx` index does **not** efficiently serve the global cap COUNT query
(the query has no `user_id` predicate to anchor the composite index). So the comment is not
merely stale phrasing — its performance reasoning is wrong for the query that actually ships.

## Detailed Findings

### Ground truth (the oracle)

- **`astro.config.mjs:25-28`** — declaration + inline doc:
  > `// S-05 global daily cap: max Cloud AI jobs (across all users) per UTC day.`
  > `// create-job rejects with 429 daily_cap_reached once reached. 0 disables cloud entirely (operator kill-switch).`
  > `CLOUD_DAILY_CAP: envField.number({ context: "server", access: "secret", default: 50 })`
- **`src/lib/services/photo-job.service.ts:113-127`** (`countCloudJobsToday`) — the query has
  **no `user_id` filter**; it is a global count via the service-role admin client. "Today" is
  `Date.UTC(year, month, date)` = 00:00 UTC of the current day (`:115`), predicate
  `created_at >= utcDayStart` (`:121`) AND `status.neq.failed OR replicate_prediction_id.not.is.null`
  (`:122`). Counts every `queued`/`processing`/`succeeded` row plus `failed` rows that retain a
  `replicate_prediction_id`; excludes only pre-model `failed AND prediction_id IS NULL`.
- **`src/lib/services/photo-job.service.ts:135-137`** (`isOverDailyCap`) — `count >= cap`, so
  `cap = 0` rejects the first request (kill-switch); `cap - 1` is the last allowed slot.
- **`src/lib/services/cloud-create-job.handler.ts:100-110`** — enforcement: 429 `daily_cap_reached`
  with the exact user message, before `createPhotoJob`. **`src/pages/api/enhance/cloud/create-job.ts:2,38`**
  reads `CLOUD_DAILY_CAP` from `astro:env/server` and threads it in as `cap`.
- **PRD `context/foundation/prd.md:129`** (FR-014) — "rejects any Cloud AI request that would
  exceed the **global** daily cap"; `:130` Socrates note explicitly keeps it global and defers
  per-user limits to v2.
- **Live value**: `CLOUD_DAILY_CAP=3` in prod (`context/foundation/production-config.md:54`,
  `roadmap.md:43`; memory `cloud-flip-on-live`), an operator override of the config default 50.

### Drift location 1 — `CLAUDE.md:31` (primary target)

> Cloud is auth-gated and rate-limited (20 ops/user/24h via SQL on RLS-gated tables).

Wrong on three counts: **scope** (per-user → should be global/cross-user), **value** (20 →
default 50), **reset** (24h rolling → fixed 00:00 UTC, configurable via `CLOUD_DAILY_CAP`).
This is a dev-facing instructions file, so the correction should describe the **design**
(global, default 50, UTC-day reset, `CLOUD_DAILY_CAP` with `0` kill-switch) rather than the
operator-set live value (3 is already documented in roadmap/production-config).

Suggested replacement phrasing (for the plan to refine):
> Cloud is auth-gated and protected by a **global daily cap** (across all users) on Cloud AI
> ops, enforced in SQL on RLS-gated tables and configurable via `CLOUD_DAILY_CAP` (default 50,
> reset 00:00 UTC, `0` = kill-switch).

### Drift location 2 — `context/foundation/shape-notes.md:239` (found by this research)

> - **Cost protection**: RLS-gated cloud access + SQL-side rate limiting (20 AI ops / user / 24h).

Same stale per-user/20/24h model. **Judgment call for the plan/frame**: `shape-notes.md` is the
`/10x-shape` discovery artifact that *fed* the PRD — a point-in-time snapshot the PRD later
corrected to "global". Options: (a) correct the line for consistency (no live doc should assert
the wrong model); (b) leave it as a frozen historical record since the PRD supersedes it. Note
the same file at `:34, :72, :202` already speaks correctly of "global daily cap" + "per-user …
deferred to v2", so `:239` is internally inconsistent with its own later lines — a point in
favor of (a).

### Drift location 3 — migration index comment (`20260528120000_create_jobs_table.sql:49-52`)

> -- Also serves the S-05 daily-cap query:
> --   COUNT(*) WHERE user_id = $1 AND created_at >= today AND status <> 'failed'.
> -- The leading user_id makes this a tight range scan; a separate non-user-scoped
> -- partial index would scan all users' rows in the time range before filtering.

The DDL (`:53-54`, `create index jobs_user_id_created_at_idx on public.jobs (user_id, created_at desc)`)
is correct and legitimately serves the **owner** queries (history, current-job lookup). But the
comment's claim that it "Also serves the S-05 daily-cap query" with a per-user `WHERE user_id = $1`
predicate is doubly wrong vs. the shipped `countCloudJobsToday` (global, no `user_id`, and uses
the `replicate_prediction_id` clause the comment omits). See Architecture Insights for why the
index cannot efficiently serve the global query. **Judgment call for the plan**: editing an
already-applied migration's comment (no DDL change) vs. an additive corrective approach — see
Open Questions.

## Code References

- `astro.config.mjs:25-28` — `CLOUD_DAILY_CAP` declaration, default 50, global/UTC-day/kill-switch doc.
- `src/lib/services/photo-job.service.ts:113-127` — `countCloudJobsToday` (global, no user_id, UTC-day).
- `src/lib/services/photo-job.service.ts:135-137` — `isOverDailyCap` (`count >= cap`).
- `src/lib/services/cloud-create-job.handler.ts:100-110` — 429 enforcement, reject-before-insert.
- `src/pages/api/enhance/cloud/create-job.ts:2,38` — reads + threads `CLOUD_DAILY_CAP`.
- `supabase/migrations/20260528120000_create_jobs_table.sql:48-54` — index comment (stale) + DDL (correct).
- `CLAUDE.md:31` — **stale** (per-user/20/24h).
- `context/foundation/shape-notes.md:239` — **stale** (per-user/20/24h).
- `idea-notes.md:15` — correct (global/50/UTC-day); `:36` correct (51st-request UTC-day test).
- `context/foundation/prd.md:43,62,129,130,158,173,178` — all correct (global, FR-014, v2 deferral).
- `.env.example:10-14` — correct (global, default 50, UTC-day, `0` kill-switch).
- `FEATURES.md:34,61` — correct (global cap; per-user deferred to v2).

## Architecture Insights

- **The index does not serve the global cap query (HIGH confidence).** A composite B-tree
  `(user_id, created_at desc)` can only range-scan `created_at` when `user_id` is equality-bound.
  The global cap query (`countCloudJobsToday`) constrains only `created_at` + status, with no
  `user_id`, so Postgres cannot use the leading column — it falls back to a full index/seq scan.
  The comment's own "a separate non-user-scoped partial index would scan all users' rows" is
  exactly backwards: a `(created_at)` (ideally partial on the billable predicate) index is what
  *would* serve the global query tightly. This is a **latent, not active** concern: at the MVP's
  tiny `jobs` table and small cap (3–50), the scan cost is negligible, so adding an index is **not**
  warranted now (and per-user scoping is a v2 item). It belongs in the docs correction as an
  accurate note, not a schema change.
- **The cap was global from the start.** Both `idea-notes.md` and PRD FR-014 specify global; no
  per-user implementation ever shipped. The per-user phrasing in CLAUDE.md / shape-notes / the
  migration comment is residue from early shaping language that the PRD corrected, never updated
  in those three spots.
- **`change.md` shape for a docs-only change is correct** — no behavior, schema, or cap-value
  change; this is purely aligning prose/comments to the shipped oracle.

## Historical Context (from prior changes)

- `context/archive/2026-06-03-cloud-daily-cap/change.md:17` — the S-05 design **already flagged**
  this drift during planning: "The '20 ops/user/24h' phrasing in `idea-notes.md`, `CLAUDE.md`,
  and the F-01 migration index comment is stale vs the PRD." (At that time `idea-notes.md` was
  stale too; it has since been corrected — leaving CLAUDE.md, the migration comment, and the
  separately-discovered shape-notes line.)
- `context/archive/2026-06-09-cap-rejection-coverage/plan.md:56` — explicitly deferred the
  doc-drift fix ("No doc-drift fix … left for a follow-up (decision: test-only scope)"), which is
  what `cap-doc-drift` now picks up.
- `roadmap.md:43,54` + `production-config.md:54,109` — the live `CLOUD_DAILY_CAP=3` was set as a
  conservative go-live value during the **2026-06-08 flip-ON (D.1)**; the config default stays 50.

## Related Research

- `context/archive/2026-06-09-cap-rejection-coverage/research.md` — the Risk #3 oracle for the
  cap rejection boundary; §"No SQL-level cap enforcement" and the Open Questions section already
  noted the stale per-user phrasing as a non-blocking follow-up.

## Resolved Decisions (settled 2026-06-10, carried into /10x-plan)

Scope confirmed by the user: **fix the three live misleading docs/comments; no behavior,
schema, or cap-value changes.** `/10x-frame` skipped — scope is coherent.

1. **Migration comment — edit in place.** Correct the `20260528120000_create_jobs_table.sql:49-52`
   comment directly (comment-only; no DDL). The additive `COMMENT ON INDEX` migration (option c)
   is **rejected** — it would be a DB/schema change, out of scope. Leaving it (option b) is
   **rejected** — the comment is one of the three target sites. The corrected comment should: (i)
   drop the per-user `WHERE user_id = $1` cap-query description, (ii) state the index serves the
   **owner** queries (history / current-job lookup), and (iii) note the **global** S-05 cap query
   (`countCloudJobsToday`, no `user_id` predicate) is not served by this index — acceptable at MVP
   scale; per-user scoping is a v2 item. No DDL touched.
2. **`shape-notes.md:239` — fix.** It is one of the three live misleading sites and is internally
   inconsistent with its own `:34/:202` "global … per-user deferred to v2" lines. Correct `:239`
   to the global model. (Not treated as a frozen snapshot.)
3. **`CLAUDE.md:31` — state the design, not the live value.** Replace with the global / default 50
   / 00:00 UTC reset / `CLOUD_DAILY_CAP` (`0` = kill-switch) description. Do **not** hard-code the
   operator-set live `3` (it would re-drift on the next cap change). See the suggested phrasing
   under "Drift location 1" above.

### Still-open (non-blocking, explicitly out of scope)

- The latent index-vs-query mismatch (global cap query is unindexed) is **documented, not fixed** —
  no index is added (negligible cost at MVP scale; per-user/index work is v2). The corrected
  migration comment records the accurate state so a future reader isn't misled.
