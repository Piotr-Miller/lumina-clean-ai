<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Cloud flip-ON re-validation (D.1)

- **Plan**: context/changes/cloud-flip-on-revalidation/plan.md
- **Scope**: Full plan (Phases 1–4)
- **Date**: 2026-06-08
- **Verdict**: APPROVED
- **Findings**: 0 critical  0 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- Code/schema diff (this change): 4 files — `d1-retention-check.ts`, `d1-live-submit.ts` (spike harnesses), `20260608120000_jobs_webhook_vault.sql` (migration), `ci.yml` (+v4 bump). No app code (`enhance/index.ts` + service layer untouched) — scope held; the migration was the plan's sanctioned Phase-4 fallback.
- Migration: SECURITY DEFINER + empty search_path (hardened), reads Vault (server-controlled, no injection surface), no-op-if-missing fallback preserved, function-body-only replace (trigger intact), reversible. Proven live in prod (4.3/4.5 green).
- Phases 1–3 previously reviewed APPROVED (`impl-review-phase-1/2/3.md`); Phase 4 verified live (cloud ON, retention + cap + cold-boot green). The two flip-ON findings (F1 signing secret, F2 EDGE_FUNCTION_URL) were real prod bugs caught at the gate, fixed, and captured in lessons.md.

## Findings

### F1 — Harness 2c-i fails on re-run against a stale local functions-serve

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/spikes/d1-retention-check.ts (2c-i) + local-runbook.md
- **Detail**: After the F1 signing-secret fix to `supabase/functions/.env`, the still-running `functions serve` verifies callbacks with the OLD secret while the harness signs with the new one → 2c-i gets HTTP 401. Local-environment drift, not a code regression (2a/2b pass; 4.2 passed at commit time on consistent config; prod unaffected — the live job succeeded).
- **Fix**: Restart `supabase functions serve enhance --env-file supabase/functions/.env` after any `.env` change; add that note to `local-runbook.md`.
- **Decision**: FIXED (gotcha added to local-runbook.md)

### F2 — wrangler-action@v4 ci.yml bump rode alongside this change

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .github/workflows/ci.yml (commit 91c06e7)
- **Detail**: The Node-20-deprecation fix isn't in this plan — a deliberate, separately-committed CI chore done in the same session. Benign; noted so the plan isn't read as its source.
- **Fix**: None — intentional standalone chore.
- **Decision**: ACCEPTED (deliberate standalone CI chore)

### F3 — DB_WEBHOOK_SECRET value appeared in the chat transcript

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: session transcript (step C)
- **Detail**: The literal `DB_WEBHOOK_SECRET` was pasted during prod setup. It's a rotatable webhook bearer, not in the repo, but it lives in this transcript.
- **Fix**: If the transcript could be seen by others, rotate it (`vault.update_secret` on prod + re-set the Edge `DB_WEBHOOK_SECRET` with a fresh value).
- **Decision**: FIXED (rotated 2026-06-08 — fresh 48-char secret written to prod Vault `db_webhook_secret` + prod Edge `DB_WEBHOOK_SECRET`; old `73c5e31c…` value dead. Generated out-of-repo, value never in transcript/git.)
