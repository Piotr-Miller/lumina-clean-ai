<!-- PLAN-REVIEW-REPORT -->
# Plan Review: S-09 Source signed-URL TTL fix (cold-boot reliability)

- **Plan**: context/changes/cloud-source-url-ttl-fix/plan.md
- **Mode**: Deep
- **Date**: 2026-06-06
- **Verdict**: SOUND (was REVISE; both warnings F1+F2 fixed in plan.md 2026-06-06)
- **Findings**: 0 critical · 2 warnings · 0 observations (both FIXED)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

4/4 paths exist (`enhance/index.ts`, `useCloudJob.ts`, `EnhanceWorkspace.tsx`, `photo-job.service.ts`); symbols confirmed (`SOURCE_URL_TTL_SECONDS:40`, `PROCESSING_WATCHDOG_MS:67`, `SLOW_HINT_MS:69`, cold-start copy `EnhanceWorkspace.tsx:260`). Blast radius clean: `SOURCE_URL_TTL_SECONDS` referenced only in `enhance/index.ts`; the watchdog/hint constants only in `useCloudJob.ts` — exporting them is collision-free, value changes contained. brief↔plan consistent.

## Findings

### F1 — Phase 1's `deno check` isn't runnable in the local dev env

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria (Automated 1.1)
- **Detail**: Phase 1's only automated check is `deno check supabase/functions/enhance/index.ts`, but `deno` is not on the local PATH (confirmed this session — the repo runs deno only via CI's `setup-deno` step in the deploy job). An implementer running `/10x-implement … phase 1` cannot satisfy 1.1 locally and may get blocked or skip verification.
- **Fix**: Note in Phase 1 that `deno check` runs in CI's deploy job (green there); locally, either install deno or use the Supabase-bundled deno. Keep `npm run lint`/`build` as the locally-runnable gate.
- **Decision**: FIXED (2026-06-06)

### F2 — Deferred D.1 sits in Progress as `- [ ]` (perpetually pending)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: ## Progress — "### Deferred (flip-ON gate)" D.1
- **Detail**: D.1 (live >300s cold-boot re-validation) is a `- [ ]` under a Progress subsection with no matching `## Phase` block, and it will never be checked in this change (it's a flip-ON gate step). As written it (a) deviates from the Progress↔Phase mechanical contract and (b) will trip the `/10x-archive` pending-Progress gate indefinitely — exactly the case where `production-deployment` used the `[~]` deferred marker (2.4 / 1.7).
- **Fix**: Mark D.1 as `- [~]` (deferred) and label it the S-09 flip-ON closure criterion, so it reads as intentionally-deferred (not pending) and the archive gate doesn't flag it.
- **Decision**: FIXED (2026-06-06)
