<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Cloud AI Realtime Result (S-04) — round 2

- **Plan**: `context/changes/cloud-ai-realtime-result/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-31
- **Verdict**: REVISE → SOUND (round-2 F1–F3 all fixed in plan, 2026-05-31)
- **Findings**: 0 critical, 2 warnings, 1 observation — all FIXED
- **Round 1** (same date): F1 Deno import strategy, F2 pipeline config contract, F3 timeout race, F4 callback mapping — all FIXED. This round-2 report supersedes that record; round-2 findings below are second-order effects of the round-1 F1 fix plus grounding gaps.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | WARNING |
| Architectural Fitness | WARNING |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

7/7 paths ✓, brief↔plan ✓, Progress↔Phase ✓ (0.1–5.9 all map; phase blocks use plain bullets). Confirmed by grounding: `deno` is NOT on PATH; `tsx ^4.22.3` + `supabase ^2.23.4` present; `markJobSucceeded` has **0** app-side callers (only a `types.ts` doc-comment + tests/scripts); the `<name>` placeholder appears 9× despite the F2 contract locking `enhance`.

## Findings

### F1 — Round-1 Deno-boundary fix orphaned the app-side job helpers

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness (+ Lean Execution)
- **Location**: Critical Impl Details "Deno import boundary" vs Phase 1 §1 / Phase 2 §1 / Phase 3 §1
- **Detail**: The round-1 boundary fix says the Edge Function "issues job-status updates INLINE" and "imports ONLY bread.ts, never the @/-aliased photo-job.service". But Phase 1 §1 still builds `markJobProcessing`/`markJobFailed`/`getJobById`/`createSignedReadUrl` as app-side helpers "the Edge Function will call", and Phase 2/3 contracts call them by name. Contradiction. Grounding confirms the squeeze: `markJobSucceeded` (F-01) has zero app-side callers and the new helpers' only intended consumer is the Edge Function — which the boundary forbids from importing them. As written: Phase 1 builds + unit-tests app-side helpers with no app caller, while the Edge Function re-implements the same succeed/fail/processing + 24h-source-delete logic inline in Deno (two copies of retention-critical logic → drift risk). The only genuine app-side consumer is `markPendingJobFailedForOwner` (timeout route).
- **Fix A ⭐ Recommended**: Make the job-mutation helpers genuinely Deno-shared
  - Approach: keep them in a dependency-free, param-injected-client module (already the pattern) with type-only imports; map `@/types`→relative and `@supabase/supabase-js`→esm.sh in `deno.json` so the Edge Function imports the SAME helpers. Replace "inline updates" in Phase 2/3 with "call the shared helpers"; move the real Deno-import smoke check to Phase 2.
  - Strength: single source of truth for status + 24h-retention logic (no drift); honors the Fix-A intent chosen in round 1; Phase-1 unit tests cover the code the function runs.
  - Tradeoff: must prove type-only `@/types` + supabase-js types resolve under Deno via the import map (Phase-2 check covers it).
  - Confidence: MED — type-only imports usually map cleanly; verify Supabase's Deno import-map behavior in Phase 2.
  - Blind spot: F-01's `markJobSucceeded` must become Deno-importable (already takes the client as a param).
- **Fix B**: Embrace duplication, drop the orphans
  - Approach: Edge Function owns a Deno-local job-mutation module under `supabase/functions/enhance/`; Phase 1 builds ONLY `bread.ts` + `markPendingJobFailedForOwner`; note F-01's `markJobSucceeded` is superseded by the Deno copy.
  - Strength: clean runtime boundary, no import-map gymnastics; matches "self-contained Deno module" literally.
  - Tradeoff: two copies of succeed/fail + the retention delete that can drift; F-01's tested helper becomes app-dead.
  - Confidence: HIGH — simplest runtime shape.
  - Blind spot: drift control between the two copies over time.
- **Decision**: FIXED via Fix A — boundary bullet rewritten to "single source of truth: Edge Function calls the shared type-only `photo-job.service.ts` helpers + `bread.ts` via a `deno.json` import map"; Phase 1 §1/§2 note the type-only/shared requirement; Phase 2 §1 now "calls shared helpers" (no inline); the real Deno-import check moved to Phase 2 (serve `enhance` proves the import map resolves).

### F3 — Phase-1 `deno check` criterion is near-vacuous and assumes an uninstalled binary

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Automated 1.4
- **Detail**: 1.4 runs `deno check` on a tiny entry importing `bread.ts`. But `deno` is NOT on PATH (grounding) so it fails on a missing binary, and `bread.ts` is dependency-free so the check is near-vacuous — the real import-boundary risk (supabase-js via esm.sh + the `deno.json` import map) only exists once the function does, in Phase 2.
- **Fix**: Move the meaningful Deno-import verification to Phase 2 (function + import map exist there); drop or downgrade 1.4. If kept, note the `deno` install prerequisite or use the supabase-bundled runtime.
- **Decision**: FIXED in plan — Phase-1 1.4 removed (+ Progress renumbered to 1.1–1.5); a note points to the Phase-2 `supabase functions serve enhance` check as the real cross-boundary verification (moved there by the F1 fix).

### F2 — `<name>` placeholder vs the locked function name `enhance`

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 / Phase 2 §1-2 / Phase 3 §1 / Progress (9 occurrences)
- **Detail**: The F2 contract (round 1) locked the function name to `enhance`, but `supabase/functions/<name>/`, `functions serve <name>`, and `[functions.<name>]` still use `<name>` in 9 spots — drift between the locked contract and the phase bodies.
- **Fix**: Replace `<name>` with `enhance` throughout (or state `<name> = enhance` once).
- **Decision**: FIXED in plan — all `<name>`/`<fn>` normalized to `enhance` (the 2 remaining `<fn-url>` are the intentional env-specific base-URL placeholder defined in the F2 contract).
