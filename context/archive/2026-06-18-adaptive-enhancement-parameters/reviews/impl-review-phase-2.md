<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Adaptive Enhancement Parameters (S-12) - Phase 2

- **Plan**: `context/changes/adaptive-enhancement-parameters/plan.md`
- **Scope**: Phase 2 of 3 - Parameter panel + Local engine end-to-end
- **Date**: 2026-06-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

## Grounding

- Reviewed the Phase 2 scope in `plan.md`, the current `change.md`, the saved Phase 1 implementation review, and the current worktree delta after Phase 1 commit `b08ee9b`.
- Changed Phase 2 files inspected:
  - `src/components/enhance/EnhanceWorkspace.tsx`
  - `src/components/enhance/ParameterPanel.tsx`
  - `src/components/enhance/param-panel-helpers.ts`
  - `src/components/hooks/useLocalEnhance.ts`
  - `src/components/hooks/useDebouncedValue.ts`
  - `src/components/ui/slider.tsx`
  - `src/lib/engines/local-engine.ts`
  - `src/lib/engines/types.ts`
  - `tests/param-panel-helpers.test.ts`
  - `package.json`
- Reference file inspected for Cloud wiring status:
  - `src/components/hooks/useCloudSubmit.ts`

## Verification

Commands were run via the working Windows/fnm path because plain `npm`/`npx` in this checkout cannot find `node.exe`.

| Check         | Command                                                                                                                                                                                                                                                                                                                                                                                    | Result                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Typecheck     | `fnm exec --using 22.14.0 cmd /c npm run typecheck`                                                                                                                                                                                                                                                                                                                                        | PASS                                                                                   |
| Targeted lint | `fnm exec --using 22.14.0 cmd /c npx eslint src/components/enhance/EnhanceWorkspace.tsx src/components/enhance/ParameterPanel.tsx src/components/enhance/param-panel-helpers.ts src/components/hooks/useLocalEnhance.ts src/components/hooks/useDebouncedValue.ts src/components/ui/slider.tsx src/lib/engines/local-engine.ts src/lib/engines/types.ts tests/param-panel-helpers.test.ts` | PASS                                                                                   |
| Unit tests    | `fnm exec --using 22.14.0 cmd /c npm run test:unit`                                                                                                                                                                                                                                                                                                                                        | PASS - 21 files / 256 tests                                                            |
| SSR build     | `fnm exec --using 22.14.0 cmd /c npm run build`                                                                                                                                                                                                                                                                                                                                            | PASS after escalation; first sandboxed run failed on Wrangler/Miniflare AppData writes |

Mutation testing was skipped correctly: none of the reviewed Phase 2 files are in the risk-critical module list from `context/foundation/test-plan.md` section 4.

## Findings

### F1 - Latest Local slider value can be dropped during an in-flight re-render

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/components/enhance/EnhanceWorkspace.tsx:151`
- **Detail**: The debounced Local effect only re-runs `enhance()` when `statusRef.current === "done"`. If the user changes a Local slider again while the previous debounced enhance is still processing, the new debounced value is observed once, skipped because the status is `"processing"`, and never replayed when the status returns to `"done"` because `debouncedLocalParams` is unchanged on that later render. The panel still exposes live slider callbacks during that processing window, so the UI can show a newer slider value while the before/after preview still reflects an older render. That contradicts the Phase 2 contract/manual check that Local slider changes re-render after the debounce.
- **Fix**: Either queue one pending Local rerender and flush it when the current enhance returns to `"done"`, or disable the Local sliders/Auto controls while processing so no dropped state can accumulate.
  - Strength: Keeps the rendered image aligned with the visible slider values.
  - Tradeoff: Requires a small state-machine tweak (queue) or a UX choice (temporary disable).
  - Confidence: HIGH - this follows directly from the dependency/guard combination at `EnhanceWorkspace.tsx:151-155` plus the always-live slider callbacks in `ParameterPanel.tsx:90-99`.
  - Blind spot: I did not reproduce this in a browser session during the review.
- **Decision**: FIXED (queue/flush) — debounce effect now deps on `enhancer.status` so a slider change made mid-process replays when status returns to "done"; a `lastEnhancedRef` guard (set on manual Enhance + reset on Start over) stops the status→done transition from looping on identical params. `EnhanceWorkspace.tsx` debounce effect.

### F2 - Cloud parameter controls are exposed a phase early, but submit still ignores them

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: `src/components/enhance/EnhanceWorkspace.tsx:414`
- **Detail**: Phase 2 is scoped as the Local vertical slice; the plan reserves visible Bread sliders and provisional Cloud Auto for Phase 3, together with wiring `useCloudSubmit.submit()` to accept `{ gamma, strength }`. The current workspace already renders the Bread controls whenever `engine === "cloud"`, including Auto recompute and the provisional note, but the Apply button still calls `cloudSubmit.submit()` with no params and `useCloudSubmit` still forwards only `file` to `submitCloudJob`. A signed-in user can therefore adjust Cloud sliders that have no effect on the submitted job, which is both scope drift and a misleading UI affordance.
- **Fix A - Recommended**: Hide or disable the Cloud-side parameter controls until Phase 3 threading lands.
  - Strength: Restores the planned phase boundary and removes the false affordance immediately.
  - Tradeoff: The UI becomes asymmetric between engines for one phase.
  - Confidence: HIGH - the Phase 3 contract explicitly reserves this wiring, and the current submit path still has a zero-argument `submit()`.
  - Blind spot: I did not inspect a browser network trace in this review.
- **Fix B**: Finish the Phase 3 client threading now and re-scope the change accordingly.
  - Strength: Makes the exposed controls truthful instead of removing them.
  - Tradeoff: Pulls backend/schema/Edge Function work into what was supposed to be a Phase 2 review checkpoint.
  - Confidence: MEDIUM - the client-side affordance already exists, but the remaining Phase 3 work is broader than a small patch.
  - Blind spot: This review did not assess the Phase 3 backend work in detail.
- **Decision**: FIXED (Fix A) — the parameter panel now renders only when `engine === "local"`; the grid collapses to a single column for Cloud. All Bread param state (`breadParams`/`breadOverridden`/`BREAD_DEFAULTS`) removed from Phase 2 to keep it a clean Local slice. Phase 3 re-introduces the Cloud panel together with the submit threading so the controls are truthful when shown.

## Notes

- The planned Phase 2 files are present: slider primitive, parameter panel, workspace layout/state, Local engine threading, Local hook changes, and the debounce helper.
- Automated checks are green, but manual progress items `2.6` and `2.8` are currently marked done in `plan.md` even though F1/F2 show the phase is not ready to claim those outcomes yet.
- `change.md` was left at `status: implementing` because Phase 3 is still pending; changing the whole slice to `impl_reviewed` here would hide the active workstream.
