<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Adaptive Enhancement Parameters (S-12) - Phase 1

- **Plan**: `context/changes/adaptive-enhancement-parameters/plan.md`
- **Scope**: Phase 1 of 3 - Deterministic Auto analyzer + parameter contracts
- **Date**: 2026-06-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Grounding

- Reviewed Phase 1 planned scope from `plan.md`, the saved plan review, and the completed progress entries for commit `b08ee9b`.
- Changed Phase 1 files inspected:
  - `src/lib/engines/auto-params.ts`
  - `src/lib/engines/auto-params.client.ts`
  - `src/lib/engines/types.ts`
  - `tests/auto-params.test.ts`
  - `tests/fixtures/auto-params/*.json`
  - `scripts/gen_auto_params_fixtures.py`
- No Phase 2/3 implementation appears to have leaked into Phase 1; `ImageEngine.enhance` still accepts only `{ mimeType }`.

## Verification

Commands were run via the working Windows/fnm path because plain `npm`/`npx` could not find `node.exe`.

| Check         | Command                                                                                                                                                          | Result                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Typecheck     | `fnm exec --using 22.14.0 node C:\Users\prmi\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js run typecheck`                                                  | PASS                                                                                   |
| Targeted lint | `fnm exec --using 22.14.0 node node_modules\eslint\bin\eslint.js src/lib/engines/auto-params.ts src/lib/engines/auto-params.client.ts tests/auto-params.test.ts` | PASS                                                                                   |
| Unit tests    | `fnm exec --using 22.14.0 node C:\Users\prmi\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js run test:unit`                                                  | PASS - 20 files / 248 tests                                                            |
| SSR build     | `fnm exec --using 22.14.0 node C:\Users\prmi\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js run build`                                                      | PASS after escalation; first sandboxed run failed on Wrangler/Miniflare AppData writes |

Mutation testing was skipped correctly: Phase 1 does not touch the risk-critical modules listed in `context/foundation/test-plan.md` section 4.

## Findings

### F1 - Oracle "real" fixtures still come from montage halves

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `context/changes/adaptive-enhancement-parameters/plan.md:109`, `scripts/gen_auto_params_fixtures.py:9`
- **Detail**: The fixed plan explicitly says the oracle source must be raw single-image originals and that `*.local-ba.jpg` before/after montages stay visual evidence only. The implementation avoids mixing both halves, but `scripts/gen_auto_params_fixtures.py` still crops the left/before half from the montage via `before_half()` and labels the output as `provenance: "real"`. This means the oracle may inherit montage export, compression, cropping, or downscale artifacts instead of reflecting the actual raw selected image. The tests are useful, but the "real-image oracle" claim is weaker than planned.
- **Fix**: Regenerate the real fixture stats from raw originals, or downgrade these three fixture entries to "montage-derived proxy" and do not treat them as raw-real oracle evidence.
  - Strength: Aligns the regression oracle with the plan and keeps Phase 2 Auto validation anchored to true source images.
  - Tradeoff: Requires locating/recovering the raw originals or explicitly weakening the evidence label.
  - Confidence: HIGH - both review passes found the same drift and the script documents the montage-half source.
  - Blind spot: Raw originals were not located during this review.
- **Decision**: FIXED — relabeled the 3 montage-half fixtures `provenance: "real"` → `"montage-derived"` (proxy for raw source) in the fixtures, generator docstring/output, and the test's `Fixture` union; `source` field now says "proxy for raw source". Raw originals are unrecoverable (prior scratchpad), so the label is corrected rather than re-derived. Oracle behavior unchanged (assertions key off stats, not the label). Commit: <relabel-sha>.

## Notes

- `computeLumaStats`, `recommendParams`, overloads, clamps, `PARAM_RANGES`, the DOM sampler wrapper, synthetic buffer tests, p50 monotonicity sweep, and 8-12 JSON oracle loading all match the Phase 1 intent.
- A minor non-blocking observation from the safety pass: `recommendParams` assumes finite `LumaStats`; current producers are controlled (`computeLumaStats` or committed fixtures), so this was not raised as a finding.
