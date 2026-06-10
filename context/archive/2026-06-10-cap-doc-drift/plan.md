# Cloud Daily-Cap Doc-Drift Correction Implementation Plan

## Overview

Three live (non-archived) sites describe the cloud daily cap as a never-implemented
**per-user 20-ops/24h** limit. Correct them to the shipped oracle — a **global**
(cross-user) cap, **default 50** (`astro.config.mjs:28`), reset at **00:00 UTC**,
configured via the **`CLOUD_DAILY_CAP`** secret with **`0` = kill-switch** (PRD FR-014).
Docs/comments only: no behavior, schema, migration DDL, or cap-value change.

## Current State Analysis

The implementation is correct and consistent in 44+ places (PRD, roadmap, test-plan,
production-config, `.env.example`, `astro.config.mjs`, source, tests). The drift is
isolated to three sites, all asserting a per-user model that never shipped (the cap was
global from the start per PRD FR-014 + `idea-notes.md`):

- **`CLAUDE.md:31`** — "auth-gated and rate-limited (20 ops/user/24h via SQL on RLS-gated tables)". Wrong on scope (per-user→global), value (20→default 50), and reset (24h rolling→00:00 UTC).
- **`context/foundation/shape-notes.md:239`** — "RLS-gated cloud access + SQL-side rate limiting (20 AI ops / user / 24h)". Same stale model; internally inconsistent with its own `:34`/`:202` "global … per-user deferred to v2" lines.
- **`supabase/migrations/20260528120000_create_jobs_table.sql:49-52`** — the `jobs_user_id_created_at_idx` comment claims it "Also serves the S-05 daily-cap query: COUNT(*) WHERE user_id = $1 …". The shipped `countCloudJobsToday` (`src/lib/services/photo-job.service.ts:113-127`) is global (no `user_id` predicate), so this `user_id`-leading index does **not** serve that count. The DDL (`:53-54`) is correct and stays.

### Key Discoveries:

- Oracle: `astro.config.mjs:25-28` (global, default 50, UTC-day, `0`=kill-switch); `countCloudJobsToday` (`photo-job.service.ts:113-127`, no `user_id` filter, UTC-day boundary); PRD FR-014 (`context/foundation/prd.md:129`).
- `idea-notes.md:15` is already **correct** — explicitly NOT a target.
- The index-vs-query mismatch is **latent, not active**: at MVP table/cap size the cost is negligible; no index is added (per-user/index work is v2). The corrected comment records the accurate state.
- Settled decisions live in `research.md` "Resolved Decisions": migration comment edited **in place** (no new migration), shape-notes **fixed**, CLAUDE.md states the **design** (not the live `3`).
- **Formatting caveat (verified, plan-review F1):** `npx prettier --check CLAUDE.md context/foundation/shape-notes.md` already FAILS today (the files are LF — not CRLF — but don't conform to the repo prettier config; ~442-line prose-wrap reflow on CLAUDE.md alone, unrelated to this edit). So prettier is **not** a usable gate here, and `prettier --write` — even file-scoped — would bury the one-line edit in whole-file churn. Make minimal, line-scoped edits that preserve surrounding formatting; do **not** reformat. (Generalizes the repo's CRLF lesson: don't bundle unrelated normalization into a feature commit.)

## Desired End State

The three sites describe the cap accurately (global / default 50 / 00:00 UTC /
`CLOUD_DAILY_CAP` / `0` kill-switch). A grep sweep finds **zero** per-user cap phrasings
in them and the corrected terms present. Edits are minimal and line-scoped (no whole-file
reformatting). No source, schema, test, or cap-value change.

## What We're NOT Doing

- **No behavior, schema, migration DDL, or cap-value change** — prose/comment edits only.
- **No new migration** (`COMMENT ON INDEX` is rejected — it's a DB change, out of scope).
- **No index added** for the global cap query — the mismatch is documented, not fixed (v2).
- **Not touching `idea-notes.md:15`** — already correct.
- **No edits to the 44+ already-correct mentions**, archived docs, or the `cap-rejection-coverage` archive.
- **Not hard-coding the live `3`** into CLAUDE.md — it would re-drift on the next cap change.

## Implementation Approach

A single phase: three independent, minimal line-scoped edits, then grep-assertion
verification scoped to the touched files. (Prettier is intentionally **not** a gate — see
Key Discoveries: the files already fail it for pre-existing reasons, so it would false-fail
or force whole-file churn.) Each edit replaces the stale per-user phrasing with the global
design wording. The SQL comment additionally records that the `user_id`-leading index does
not serve the global cap count (accurate state for a future reader).

## Phase 1: Correct the three stale daily-cap descriptions

### Overview

Edit the three sites to the global oracle with minimal, line-scoped edits; verify stale
phrasings are gone and corrected terms present.

### Changes Required:

#### 1. CLAUDE.md product blurb

**File**: `CLAUDE.md` (line 31, the "Project: Astro + Supabase + Cloudflare" → Product paragraph)

**Intent**: Replace the per-user/20/24h clause with the global-cap design so the canonical rules file matches the shipped oracle, without baking in the operator-set live value.

**Contract**: The parenthetical "(20 ops/user/24h via SQL on RLS-gated tables)" becomes a global-cap description naming: global/cross-user scope, SQL enforcement on RLS-gated tables, `CLOUD_DAILY_CAP`, default 50, 00:00 UTC reset, `0` = kill-switch. State the design, not the live `3`. Suggested: "Cloud is auth-gated and protected by a global daily cap (across all users) on Cloud AI ops — enforced in SQL on RLS-gated tables, configurable via `CLOUD_DAILY_CAP` (default 50, reset 00:00 UTC; `0` = kill-switch)."

#### 2. shape-notes cost-protection bullet

**File**: `context/foundation/shape-notes.md` (line 239, the "Cost protection" bullet)

**Intent**: Correct the per-user/20/24h phrasing to the global model, resolving the internal inconsistency with this file's own `:34`/`:202` lines.

**Contract**: "(20 AI ops / user / 24h)" becomes a global-cap phrasing consistent with the oracle and with `idea-notes.md:15` (global, default 50, 00:00 UTC, configurable via `CLOUD_DAILY_CAP`). Keep the bullet's existing "RLS-gated cloud access + SQL-side …" framing.

#### 3. jobs index comment (SQL, in place)

**File**: `supabase/migrations/20260528120000_create_jobs_table.sql` (comment at lines 49-52; the `create index` DDL at 53-54 is unchanged; line 48 "Owner queries …" is unchanged)

**Intent**: Replace the stale per-user cap-query description with the accurate global-count behavior, and record that this `user_id`-leading index does not serve the global cap count (a `created_at`-leading index would) — acceptable at MVP scale; v2 concern.

**Contract**: Comment-only edit (no DDL). Remove the "COUNT(*) WHERE user_id = $1 …" daily-cap claim and the "leading user_id makes this a tight range scan [for the cap]" reasoning. New comment states: the S-05 daily cap is GLOBAL/cross-user (`countCloudJobsToday` filters only on `created_at >= today's UTC midnight` AND `status <> 'failed' OR replicate_prediction_id IS NOT NULL`, no `user_id`), so this index does not serve that count; it remains for the owner queries (history / current-job lookup); per-user scoping / a dedicated cap index are v2.

### Success Criteria:

#### Automated Verification:

- Stale per-user cap phrasings are gone: `grep -rn "ops/user\|20 ops\|20 AI ops" CLAUDE.md context/foundation/shape-notes.md` returns no matches.
- Stale per-user cap-query gone from the migration comment: `grep -n "user_id = \$1" supabase/migrations/20260528120000_create_jobs_table.sql` returns no match.
- Corrected terms present (each a 0→match signal — these tokens are absent in their target files today): `grep -l "global daily cap\|CLOUD_DAILY_CAP" CLAUDE.md` matches; `[ "$(grep -c "CLOUD_DAILY_CAP" context/foundation/shape-notes.md)" -ge 1 ]` (shape-notes has 0 today — note `grep "global"` is **not** valid here, it already appears 9×); and `grep -ni "global" supabase/migrations/20260528120000_create_jobs_table.sql` (index comment) matches.

#### Manual Verification:

- Read the three corrected sites: each reads accurately and matches the oracle; the migration comment correctly describes owner-query usage + the global-cap-not-served note; no over-correction or new inconsistency introduced.

**Implementation Note**: Make minimal, line-scoped edits — do **not** run `prettier --write` on these files (they already fail prettier for pre-existing reasons; reformatting would bury the edit in whole-file churn — see Key Discoveries). After the automated checks pass, pause for manual confirmation that the three sites read correctly before the phase-end commit.

---

## Testing Strategy

### Unit Tests:

- None — docs/comment-only change; no code paths touched.

### Integration Tests:

- None.

### Manual Testing Steps:

1. Open `CLAUDE.md:31`, `context/foundation/shape-notes.md:239`, and the migration comment; confirm each describes the global cap (default 50, 00:00 UTC, `CLOUD_DAILY_CAP`, `0` kill-switch) and that the SQL comment no longer claims a per-user cap query.
2. Confirm `idea-notes.md:15` was left untouched (already correct).

## Performance Considerations

None — documentation only. (The latent global-cap index mismatch is documented, not changed; negligible at MVP scale.)

## Migration Notes

No schema or data migration. The migration-file edit is comment-only (no DDL); the applied database schema is unchanged.

## References

- Related research: `context/changes/cap-doc-drift/research.md` (oracle + Resolved Decisions)
- Oracle: `astro.config.mjs:25-28`, `src/lib/services/photo-job.service.ts:113-137`, `context/foundation/prd.md:129`
- Already-correct reference: `idea-notes.md:15`
- History: `context/archive/2026-06-03-cloud-daily-cap/change.md:17` (drift first flagged); `context/archive/2026-06-09-cap-rejection-coverage/plan.md:56` (doc-drift deferred here)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Correct the three stale daily-cap descriptions

#### Automated

- [x] 1.1 Stale per-user phrasings gone from CLAUDE.md + shape-notes (`grep` ops/user|20 ops|20 AI ops → none) — 0c8c058
- [x] 1.2 Stale `user_id = $1` cap-query gone from the migration comment (`grep` → none) — 0c8c058
- [x] 1.3 Corrected terms present (CLAUDE.md global daily cap/CLOUD_DAILY_CAP; shape-notes CLOUD_DAILY_CAP present; migration comment global) — 0c8c058

#### Manual

- [x] 1.4 Three corrected sites read accurately; migration comment describes owner-query usage + global-cap-not-served note; no new inconsistency — 0c8c058
