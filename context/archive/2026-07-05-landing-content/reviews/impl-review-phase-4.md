<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Landing 2.0 - Content, Guides, Tooltips, Brand Lockup

- **Plan**: `context/changes/landing-content/plan.md`
- **Scope**: Phase 4 of 5
- **Date**: 2026-07-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success Criteria Verification

- **4.1 `npm run typecheck`**: PASS
- **4.2 `npm run test:unit`**: PASS (21 files / 277 tests)
- **4.3 `npm run build`**: PASS on current `HEAD`; build completed successfully. The Phase 5 sitemap warning is still present, which is expected until the SEO phase lands.
- **4.4 Lint clean on touched files**: PASS via `npx prettier --check src/components/enhance/ParameterPanel.tsx src/components/ui/tooltip.tsx src/lib/enhance-strings.ts` and `npx eslint` on the same files
- **4.5 Freeze-list strings byte-identical (grep)**: PASS; the Phase 4 change in `src/lib/enhance-strings.ts` is additive-only (`panel.tooltips.*`), with no frozen label or aria-label drift
- **4.6 Full `npm run test:e2e` green locally**: PASS after rerun with the repo's intended local E2E env pair (`SUPABASE_KEY` + `SUPABASE_SERVICE_ROLE_KEY=sb_secret_...`). Earlier failures in this review were environment setup friction (Wrangler AppData sandbox, then a wrong legacy local JWT key), not a product regression.
- **4.7 Tooltips verified: hover, keyboard focus, touch; no layout shift**: marked complete in Progress; not independently re-run manually in this CLI pass
- **Mutation check**: skipped; Phase 4 touches no `test-plan.md` section 4 risk-critical module

## Findings

### F1 - Tooltip trigger nests a button inside a label

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/components/enhance/ParameterPanel.tsx:100`
- **Detail**: The per-parameter tooltip trigger is rendered as a `<button type="button">` inside `<label htmlFor="param-{key}">`. Browsers tolerate this, and the frozen contract still holds (`paramLabels`, slider `aria-label`, slider `id`, and E2E expectations are unchanged), but it is invalid HTML and likely changes label-click behavior from "focus the slider" to "open the tooltip". Because the slider already carries its own `aria-label`, the label wrapper is not needed for naming, only for click delegation.
- **Fix A ⭐ Recommended**: Replace the outer `<label>` with a non-label wrapper (`<div>`/`<span>`) and keep the dotted-underline tooltip trigger button as the visible affordance.
  - Strength: Removes the invalid nesting with the smallest code change while preserving the shipped visual affordance, keyboard focus behavior, and tooltip copy.
  - Tradeoff: Drops the explicit HTML label association, though the slider's accessible name already comes from its `aria-label`.
  - Confidence: HIGH - the accessible name path is already independent of the `<label>`.
  - Blind spot: I did not independently verify screen-reader behavior after the refactor in this review pass.
- **Fix B**: Keep `<label htmlFor>` but move the tooltip trigger to a sibling info affordance rather than wrapping the label text itself.
  - Strength: Preserves valid label-to-control behavior and full HTML validity.
  - Tradeoff: Changes the shipped dotted-underline-on-label design into a separate icon/trigger pattern.
  - Confidence: MEDIUM - structurally sound, but visually deviates from the current Phase 4 design.
  - Blind spot: Would need a small layout/design pass to keep the panel looking intentional.
- **Decision**: PENDING

## Summary

Phase 4 is otherwise clean and ship-ready:

- `src/components/ui/tooltip.tsx` follows the repo's existing unified `radix-ui` house pattern rather than adding a new per-primitive dependency
- `src/components/enhance/ParameterPanel.tsx` keeps frozen slider ids, aria-labels, and panel behavior intact apart from the tooltip wrapping
- `src/lib/enhance-strings.ts` adds only the planned tooltip copy

Net: one real, contained warning; all automated gates passed.

## Resolution (Claude, 2026-07-07)

**F1 — applied Fix A (⭐ recommended).** `ParameterPanel.tsx`: the per-param label wrapper `<label htmlFor="param-{key}">` → `<span>`, keeping the dotted-underline focusable `<button>` tooltip trigger. Removes the invalid `<button>`-inside-`<label>` nesting while preserving the shipped dotted-underline design, keyboard-focus tooltips, and the frozen slider `aria-label`/`id` (the slider's accessible name comes from its own `aria-label`, not the label). Dropped only the label→slider click-delegation, which the button-in-label activation carve-out had already effectively removed.

Re-verified after the change: `npm run typecheck`, `npx eslint`, freeze-grep (paramLabels + slider `aria-label`/`id` byte-identical), `npm run build`, and the **FULL local E2E gate — 6/6 green** (setup, both Risk #2 gates, north-star #1+#6, stall #1, chroma). Env note: the E2E webServer's in-process build hit the Cloudflare-adapter prerender loopback issue under the sandbox; ran green by pre-building + pre-serving `dist/` and reusing it (temporary `reuseExistingServer`, reverted).
