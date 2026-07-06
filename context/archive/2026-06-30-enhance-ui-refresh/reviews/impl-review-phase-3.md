<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Enhance Screen UI Refresh - Phase 3

- **Plan**: `context/changes/enhance-ui-refresh/plan.md`
- **Scope**: Phase 3 of 5 - State Cards for the Winning Direction
- **Date**: 2026-07-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

## Grounding

- Reviewed the Phase 3 scope in `context/changes/enhance-ui-refresh/plan.md` and the active change record in `context/changes/enhance-ui-refresh/change.md`.
- Reviewed the dedicated Phase 3 commit `e62559a` (`chore(enhance-ui-refresh): state cards for the winning direction (p3)`). The current worktree also contains unrelated local settings and a post-commit `plan.md` modification, which were treated as out of scope for the phase verdict.
- Changed Phase 3 files inspected:
  - `context/changes/enhance-ui-refresh/design-kit/tools/build-boards.mjs`
  - `context/changes/enhance-ui-refresh/design-kit/templates/partials/hybrid.css`
  - `context/changes/enhance-ui-refresh/design-kit/templates/foundations/tokens.html`
  - `context/changes/enhance-ui-refresh/design-kit/templates/states/01-idle-banner.html`
  - `context/changes/enhance-ui-refresh/design-kit/templates/states/02-drag-over.html`
  - `context/changes/enhance-ui-refresh/design-kit/templates/states/03-validation-error.html`
  - `context/changes/enhance-ui-refresh/design-kit/templates/states/04-local-result.html`
  - `context/changes/enhance-ui-refresh/design-kit/templates/states/05-cloud-gate.html`
  - `context/changes/enhance-ui-refresh/design-kit/templates/states/06-processing.html`
  - `context/changes/enhance-ui-refresh/design-kit/templates/states/07-failed-rgba.html`
  - `context/changes/enhance-ui-refresh/design-kit/templates/states/08-cloud-result.html`
  - `context/changes/enhance-ui-refresh/plan.md`
- Live UI structure used for comparison:
  - `src/components/enhance/EnhanceWorkspace.tsx`
  - `src/components/enhance/{ParameterPanel,CloudSignInPrompt,ImageUploader}.tsx`
  - `src/lib/enhance-strings.ts`

## Verification

Commands were run via the working Windows/fnm path because this checkout pins Node `22.14.0`.

| Check                             | Command                                                                                                                     | Result                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------- | ----------- | ------------ | ---------------- | ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------- | ---------------------------- | ----------- | ------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Local card build                  | `fnm exec --using 22.14.0 cmd /c node context/changes/enhance-ui-refresh/design-kit/tools/build-boards.mjs`                 | PASS - built `states/*` + `foundations/tokens.html`; output ended with `OK: all cards self-contained` |
| State count                       | `(Get-ChildItem context/changes/enhance-ui-refresh/design-kit/templates/states/*.html).Count`                               | PASS - 8 state templates present                                                                      |
| Freeze-list / coverage spot-check | `Select-String -Path context/changes/enhance-ui-refresh/design-kit/templates/states/\*.html -Pattern 'Fix your night photos | Upload an image                                                                                       | Process with Cloud AI | Download    | Try again    | Start over       | Cloud AI           | Enhancing in the cloud… | Cloud processing took too long. Please try again.                                                         | Sign in to use Cloud AI | Before and after comparison — drag or use arrow keys to compare | Convert to RGB and try again | Converting… | Restore Auto | · adjusted'` | WARNING - most frozen strings are present, but no state template contains the pre-submit CTAs `Enhance` or `Process with Cloud AI` |
| Mobile / alert / panel coverage   | `Select-String -Path context/changes/enhance-ui-refresh/design-kit/templates/states/\*.html -Pattern '375px                 | stack                                                                                                 | mobile                | provisional | role="alert" | Denoise strength | Smoothing \(blur\) | Brightness \(gamma\)'`  | PASS - mobile stacking, `role="alert"` lines, and Local/Cloud param labels are represented where expected |

Mutation testing was skipped correctly: the reviewed Phase 3 files are design-kit artifacts and do not touch any risk-critical runtime module from `context/foundation/test-plan.md` section 4.

## Findings

### F1 - The kit skips the loaded-photo pre-submit CTA states

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: N/A (missing cards; compare `src/components/enhance/EnhanceWorkspace.tsx:343` and `src/components/enhance/EnhanceWorkspace.tsx:399`)
- **Detail**: Phase 3's overview says the state-card set should cover "every E2E-visible state", and the freeze list explicitly includes the load-bearing buttons `Enhance` and `Process with Cloud AI` (`plan.md:43-49`). The live UI has two distinct loaded-photo pre-submit states: Local before first enhance (`Enhance` + `Choose another`) and authenticated Cloud before submit (`Process with Cloud AI` / `Submitting…` + `Choose another`) at `EnhanceWorkspace.tsx:343-427`. None of the eight Phase 3 state templates includes either CTA row: the kit jumps from uploader idle to Local result, and from anonymous Cloud gate to processing/failed/result. That leaves Phase 4 without an approved card for two frozen action states the implementation still has to restyle.
- **Fix A - Recommended**: Add one explicit pre-submit card for Local and one for signed-in Cloud, or a single paired card if the shared stage/panel shell is intentional but the CTA row differs.
  - Strength: Restores the "every E2E-visible state" contract and gives Phase 4 a concrete reference for the frozen `Enhance` / `Process with Cloud AI` action rows.
  - Tradeoff: Reopens the design kit briefly and likely requires another lightweight project sync / approval pass.
  - Confidence: HIGH - the missing states are directly observable in `EnhanceWorkspace.tsx`, and a string scan across `templates/states/*.html` shows the cards never represent those CTAs.
  - Blind spot: I did not inspect any remote-only Claude Design files beyond what the commit message disclosed.
- **Fix B**: Amend the Phase 3 contract to say those pre-submit states are intentionally derived from the approved direction board(s) and do not get dedicated state cards.
  - Strength: Avoids reworking the current card set if the team is comfortable implementing those rows by inference.
  - Tradeoff: Phase 4 keeps more visual interpretation in code for frozen E2E CTAs, which is exactly the ambiguity the state-kit phase was meant to reduce.
  - Confidence: MEDIUM - it is a coherent scope choice, but it contradicts the current "every E2E-visible state" wording.
  - Blind spot: I did not inspect the final remote direction-board variants to confirm they give enough card-level detail for both pre-submit states.
- **Decision**: RESOLVED — Fix A applied 2026-07-04. Two pre-submit cards added on the shared hybrid skin (`templates/states/09-local-pre-enhance.html`, `templates/states/10-cloud-pre-submit.html`), each with the frozen CTA (`Enhance` / `Process with Cloud AI`), the busy variant (`Enhancing…` / `Submitting…`), and the engine-correct panel. Built self-contained (`build-boards.mjs` green) and pushed to the Claude Design project (`states/01…10` verified via `list_files`); user re-approval of the two new cards pending alongside the fix commit.

## Notes

- The core Phase 3 artifact work is otherwise strong: the generalized `build-boards.mjs` successfully walks templates recursively, resolves `{{CSS:*}}` / `{{IMG:*}}` / `{{FONT:*}}` tokens, and emits a self-contained local bundle under `design-kit/boards/`.
- `context/changes/enhance-ui-refresh/reviews/impl-review-phase-2.md` and the `change.md` updated-date bump were bundled into the Phase 3 commit even though they are not Phase 3 design artifacts. I treated those as benign bookkeeping, not a review finding.
- Automated success criterion `3.1` (`DesignSync list_files`) and manual success criterion `3.2` (user approval) were not re-executed live in this review because the Claude Design remote toolchain is not available here. I relied on the checked progress items plus the detailed Phase 3 commit message for those two pieces of evidence.
- Secondary review notes were intentionally folded into a Phase 4 checklist rather than promoted to findings:
  - If the uploader keeps the beam accent, clarify the kit rule text that the uploader counts as the primary action on idle / drag / validation states.
  - Decide whether the `BEFORE` / `AFTER` chips in the result cards are shipped UI. If yes, add them to `enhance-strings.ts`; if not, remove them from the cards before implementation.
  - Phase 4 still needs to wire the real runtime accessibility surfaces from code (`role="slider"` + aria-label on the comparison control, the hidden file input's `Upload an image` label, and the timeout `role="alert"` state). Those are implementation checklist items, not Phase 3 design-kit defects.
- `change.md` remains `status: implementing` because Phases 4-5 are still open. Its `updated` date was already current (`2026-07-04`), so no metadata change was needed when saving this report.
