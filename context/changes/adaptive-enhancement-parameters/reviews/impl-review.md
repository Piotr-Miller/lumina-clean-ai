<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Adaptive Enhancement Parameters (S-12)

- **Plan**: `context/changes/adaptive-enhancement-parameters/plan.md`
- **Scope**: Full plan (Phases 1–3 of 3)
- **Date**: 2026-06-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success Criteria

All automated gates re-run fresh at review time:

- `npx tsc --noEmit` → PASS
- `deno check --config supabase/functions/enhance/deno.json supabase/functions/enhance/index.ts` → PASS
- `npm run test:unit` → PASS (21 files / 269 tests)
- Integration (`tests/jobs.rls.test.ts` vs local Supabase) → PASS (17 tests)
- Migration (`npx supabase db reset`) → PASS (`20260628190000_add_bread_params_to_jobs.sql` applies)
- `npm run build` → PASS
- Manual (3.8 params persist live / 3.9 cost-safety / 3.10 Bread Auto provisional, + Phase 1/2 manual) → confirmed by user
- Mutation (§4 risk file `photo-job.service.ts`, scoped to `createPhotoJob`): the new insert mapping + failure contract are killed (handler test pins `insert` with `gamma`/`strength`/`null`; O1 fail-closed tests pin the `signError`/`insertError` throws). The 40 file-wide survivors are pre-existing, in functions this change did not touch — not a finding for S-12.

## Cross-cutting invariants (verified by both sub-agents)

- **Cost-safety**: Bread params reach the prediction ONLY via the single create-job POST. `handleParamChange` / `applyAuto` / `handleToggleAuto` / the analyze effect are pure state/compute — no `fetch`. Only `submitCloudJob` POSTs, reached from the explicit "Process with Cloud AI" / "Try again" buttons. INSERT-only webhook; no UPDATE re-kickoff.
- **strength ≤ 0.2** at all three layers: UI (`PARAM_RANGES.cloud.strength.max`), zod (`.max(0.2)`), Auto (`clamp(…, 0, 0.2)`).
- **Migration safety**: additive nullable columns, no backfill, no RLS/grant change; INSERT stays service-role-only (`20260621185226`) so clients can't forge `gamma`/`strength`.
- **`bread.ts` dependency-free** across the Deno boundary (no `@/`, no `astro:env`, no Deno globals); Edge null → locked-default fallback correct end-to-end.
- **Scope discipline**: nothing from "What We're NOT Doing" implemented (no ML/vision, no live Cloud preview, no UPDATE re-prediction, no extra Bread params, no strength>0.2 / gamma>1.5, no chroma-postpass change). Oracle is 9 images (seed range, full 30–50 set deferred as planned).

## Findings

### F1 — buildBreadInput relies solely on upstream zod for bounds

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/bread.ts:38
- **Detail**: `buildBreadInput` forwards `job.gamma`/`strength` without re-clamping — bounds are enforced once, at the create-job zod gate. Correct today (service-role is the only writer and it goes through the schema), but a future second jobs-write path that skips the route would send unbounded values to Replicate.
- **Fix**: If a second jobs-write path is ever added, add a defensive clamp (gamma 1.0–1.5, strength 0.0–0.2) in `buildBreadInput`. No action needed now.
- **Decision**: SKIPPED

### F2 — Source image decoded twice (analyze + enhance)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/enhance/EnhanceWorkspace.tsx:42 (dup of src/components/hooks/useLocalEnhance.ts:22)
- **Detail**: The workspace re-implements `decodeImage` and decodes the source once to sample luma (Auto) and again inside `useLocalEnhance` to enhance. Harmless (analyze decode feeds a ≤512px sample; full-res main-thread decode is by-design), just redundant work + a copied helper.
- **Fix**: Optional — extract `decodeImage` to a shared util. Not worth a change on its own.
- **Decision**: SKIPPED

### F3 — ParameterPanel value read via double cast

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/enhance/ParameterPanel.tsx:55
- **Detail**: `params as unknown as Record<string, number>` to index by key. Safe in practice (keys come from `ranges`, which only holds numeric param keys — never `provisional`), but it bypasses type-checking on the value read.
- **Fix**: Optional — narrow per engine instead of the double cast. Cosmetic.
- **Decision**: SKIPPED
