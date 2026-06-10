# Cloud Daily-Cap Doc-Drift Correction — Plan Brief

> Full plan: `context/changes/cap-doc-drift/plan.md`
> Research: `context/changes/cap-doc-drift/research.md`

## What & Why

Three live docs/comment sites describe the cloud daily cap as a never-implemented
**per-user 20-ops/24h** limit. The shipped cap is **global** (cross-user), **default 50**,
reset at **00:00 UTC**, configured via **`CLOUD_DAILY_CAP`** (`0` = kill-switch), per PRD
FR-014. Correct the three sites so the docs stop misleading readers. Docs-only — no
behavior, schema, or cap-value change.

## Starting Point

The implementation is correct and consistent in 44+ places. Drift is isolated to three
sites that predate/contradict the PRD's global model: `CLAUDE.md:31`,
`context/foundation/shape-notes.md:239`, and the `jobs_user_id_created_at_idx` comment in
`supabase/migrations/20260528120000_create_jobs_table.sql:49-52`. `idea-notes.md:15` is
already correct and out of scope.

## Desired End State

The three sites describe the cap accurately. A grep sweep finds zero per-user cap
phrasings in them; corrected terms are present; prettier is clean on the two markdown
files. The SQL comment also records that the `user_id`-leading index does not serve the
global cap count (accurate state for future readers) — without changing the DDL.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope | All three sites, docs-only | Coherent: fix the misleading prose/comments, no behavior/schema change | Research |
| Migration comment | Edit in place (no new migration) | A `COMMENT ON INDEX` migration would be a DB change, out of scope | Research |
| shape-notes.md:239 | Fix | One of the three live misleading sites; inconsistent with its own global lines | Research |
| CLAUDE.md wording | State the design, not live `3` | Hard-coding the operator value would re-drift on the next cap change | Research |
| Index mismatch | Document, don't fix | Latent only (negligible at MVP scale); per-user/index work is v2 | Research |
| Verification | Grep-assert + scoped prettier | Objective check that stale is gone / corrected present; format only touched files | Plan |
| Phasing | Single phase | Three trivial, independent edits; one commit | Plan |

## Scope

**In scope:** Correct `CLAUDE.md:31`, `shape-notes.md:239`, and the migration index comment (49-52) to the global-cap oracle.

**Out of scope:** Any behavior/schema/migration-DDL/cap-value change; a new migration; adding a cap index; `idea-notes.md` (already correct); the 44+ correct mentions; archived docs.

## Architecture / Approach

Three localized text edits, then verification scoped to the touched files: grep that the
per-user phrasings are gone and the global terms present, plus `npx prettier --check` on
the two markdown files (SQL isn't prettier-formatted). Formatting is deliberately scoped —
not repo-wide — to avoid the Windows CRLF baseline bundling ~1000 unrelated edits.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Correct the three stale descriptions | All three sites match the global oracle; verified | Over-correcting wording or missing one occurrence (grep-assert guards both) |

**Prerequisites:** None (the untracked `change.md`/`research.md` land with the phase commit).
**Estimated effort:** ~1 short session, single phase.

## Open Risks & Assumptions

- The migration-comment edit touches an already-applied migration file. Mitigated: comment-only, no DDL, no schema/version-hash change.
- `shape-notes.md` is a discovery artifact; correcting `:239` is intentional (it's internally inconsistent with its own global lines), not a rewrite of history.

## Success Criteria (Summary)

- A future reader of `CLAUDE.md`, `shape-notes.md`, or the jobs migration sees the cap described as global / default 50 / 00:00 UTC / `CLOUD_DAILY_CAP` / `0` kill-switch.
- No per-user cap phrasing remains in the three sites; prettier clean on the markdown.
- No source, schema, test, or cap-value change.
