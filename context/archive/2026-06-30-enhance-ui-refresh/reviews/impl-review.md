<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Enhance Screen UI Refresh

- **Plan**: `context/changes/enhance-ui-refresh/plan.md`
- **Scope**: Full change review across completed Phases 1-5
- **Date**: 2026-07-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | FAIL    |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

## Grounding

- Reviewed the full locked scope in `context/changes/enhance-ui-refresh/{change.md,plan.md}` plus the saved phase reports in `reviews/impl-review-phase-2.md` and `reviews/impl-review-phase-3.md`.
- Reviewed the implementation commits that landed the change: `7dc961c`, `4b27290`, `e62559a`, `5c1e8d9`, `aed096a`, `4822e81`, and the close-out metadata commit `8b55200`.
- Runtime files inspected:
  - `src/pages/index.astro`
  - `src/layouts/Layout.astro`
  - `src/styles/global.css`
  - `src/lib/enhance-strings.ts`
  - `src/components/enhance/{BeforeAfterSlider,CloudSignInPrompt,DownloadButton,EngineToggle,EnhanceWorkspace,ImageUploader,ParameterPanel}.tsx`
  - `src/components/ui/button.tsx`
- Verification harness files inspected:
  - `playwright.config.ts`
  - `tests/e2e/helpers/fixture-server.ts`
  - `tests/e2e/{north-star-cloud-result,chroma-postpass-on}.spec.ts`
- Out-of-scope local worktree noise (`.claude/*`, `README.md`, `context/mvp-check-report.md`) was ignored.

## Verification

Commands were run via the working Windows/fnm path because this checkout pins Node `22.14.0`.

| Check                | Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Result                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------- | -------- | --------- | ---------- | -------- | ---------------------- | --------------------------------------------------- | ----------------------- | ----------------------------- | ---- |
| Typecheck            | `fnm exec --using 22.14.0 cmd /c npm run typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                            | PASS                                                                                                                      |
| Unit tests           | `fnm exec --using 22.14.0 cmd /c npm run test:unit`                                                                                                                                                                                                                                                                                                                                                                                                                                            | PASS - 21 files / 277 tests                                                                                               |
| Production build     | `fnm exec --using 22.14.0 cmd /c npm run build`                                                                                                                                                                                                                                                                                                                                                                                                                                                | PASS after rerun outside sandbox; the first sandboxed run failed on Wrangler AppData log/registry writes, not on app code |
| Targeted ESLint      | `fnm exec --using 22.14.0 cmd /c npx eslint src/components/enhance/BeforeAfterSlider.tsx src/components/enhance/CloudSignInPrompt.tsx src/components/enhance/DownloadButton.tsx src/components/enhance/EngineToggle.tsx src/components/enhance/EnhanceWorkspace.tsx src/components/enhance/ImageUploader.tsx src/components/enhance/ParameterPanel.tsx src/components/ui/button.tsx src/layouts/Layout.astro src/lib/enhance-strings.ts src/pages/index.astro`                                 | PASS                                                                                                                      |
| Targeted Prettier    | `fnm exec --using 22.14.0 cmd /c npx prettier --check src/styles/global.css src/components/enhance/BeforeAfterSlider.tsx src/components/enhance/CloudSignInPrompt.tsx src/components/enhance/DownloadButton.tsx src/components/enhance/EngineToggle.tsx src/components/enhance/EnhanceWorkspace.tsx src/components/enhance/ImageUploader.tsx src/components/enhance/ParameterPanel.tsx src/components/ui/button.tsx src/layouts/Layout.astro src/lib/enhance-strings.ts src/pages/index.astro` | PASS                                                                                                                      |
| Freeze-list grep     | `Select-String -Path src/lib/enhance-strings.ts -Pattern 'Fix your night photos                                                                                                                                                                                                                                                                                                                                                                                                                | Upload an image                                                                                                           | Enhance | Process with Cloud AI | Download | Try again | Start over | Cloud AI | Enhancing in the cloud | Cloud processing took too long\. Please try again\. | Sign in to use Cloud AI | Before and after comparison'` | PASS |
| Full E2E gate        | `$env:SUPABASE_URL='http://127.0.0.1:54321'; $env:SUPABASE_SERVICE_ROLE_KEY='<local secret>'; fnm exec --using 22.14.0 cmd /c npm run test:e2e`                                                                                                                                                                                                                                                                                                                                                | FAIL - 5/6 passed; `tests/e2e/chroma-postpass-on.spec.ts` failed with `EADDRINUSE 0.0.0.0:8787`                           |
| Focused chroma rerun | `$env:SUPABASE_URL='http://127.0.0.1:54321'; $env:SUPABASE_SERVICE_ROLE_KEY='<local secret>'; fnm exec --using 22.14.0 cmd /c npx playwright test tests/e2e/chroma-postpass-on.spec.ts --workers=1`                                                                                                                                                                                                                                                                                            | PASS - confirms the chroma ON path still works and the red was the shared-port test harness race                          |

Mutation testing was skipped correctly: this change is visual/UI-only plus string extraction, and it does not alter any risk-critical module logic that warrants scoped Stryker from `context/foundation/test-plan.md` section 4 / `AGENTS.md`.

## Findings

### F1 - The canonical `npm run test:e2e` gate is not reproducibly green

- **Severity**: WARNING
- **Impact**: HIGH - the product flow still works, but the change's claimed verification command is flaky and currently fails on a clean local rerun
- **Dimension**: Safety & Quality, Success Criteria
- **Location**: `context/changes/enhance-ui-refresh/plan.md:244-261`, `context/changes/enhance-ui-refresh/plan.md:357-361`, `playwright.config.ts:13-17`, `tests/e2e/helpers/fixture-server.ts:13-15`, `tests/e2e/helpers/fixture-server.ts:29-30`, `tests/e2e/helpers/fixture-server.ts:41-49`, `tests/e2e/helpers/fixture-server.ts:57-63`, `tests/e2e/north-star-cloud-result.spec.ts:171`, `tests/e2e/chroma-postpass-on.spec.ts:116`
- **Detail**: Phase 5 marks `5.1` complete as "`npm run test:e2e` — all specs green locally", but rerunning that exact command against the local stack produced `5 passed / 1 failed`. The failure is not a product regression: both cloud happy-path specs boot their own fixture server on the same fixed port `8787`, while Playwright is configured with `fullyParallel: true`. When `north-star-cloud-result` and `chroma-postpass-on` overlap, the second listener dies with `EADDRINUSE`; when the chroma spec is rerun alone with `--workers=1`, it passes in ~2.6 s. That means the shipped screen is fine, but the canonical gate the plan promises is still nondeterministic.
- **Fix A - Recommended**: Make the fixed-port cloud fixture specs run non-concurrently at the project level so `npm run test:e2e` matches the Phase 5 contract.
  - Strength: Restores a trustworthy one-command local gate with minimal product-code churn.
  - Tradeoff: Slightly longer E2E wall-clock time.
  - Confidence: HIGH - reproduced locally in this review, and the conflicting port ownership is explicit in the helper and config.
  - Blind spot: I did not inspect CI history to quantify how often this flakes remotely.
- **Fix B**: Rework the fixture seam so concurrent specs can avoid a shared fixed listener.
  - Strength: Preserves parallelism.
  - Tradeoff: More invasive because the function serve env currently needs a stable origin at startup.
  - Confidence: MEDIUM - feasible, but the current startup-time allowlist contract makes it a larger refactor.
  - Blind spot: I did not design the best replacement seam in this review.
- **Decision**: RESOLVED — user chose project-level serialization (a variant of Fix A) 2026-07-05. `playwright.config.ts` now splits the two fixed-port specs into chained projects (`cloud-northstar` → `cloud-chroma`, both ignored by the main `chromium` project), so they can never contend for port 8787 while everything else stays parallel. Verified: full `npm run test:e2e` rerun 6/6 green in 2.5m with the new ordering visible in the run log.

### F2 - Phase 5 bundled future landing-design artifacts into an Enhance-only change

- **Severity**: WARNING
- **Impact**: MEDIUM - no runtime regression, but it weakens scope lock and will archive unrelated design work under the wrong change history
- **Dimension**: Plan Adherence, Scope Discipline
- **Location**: `context/changes/enhance-ui-refresh/change.md:12-24`, `context/changes/enhance-ui-refresh/change.md:35-45`, `context/changes/enhance-ui-refresh/plan.md:32-39`, `context/changes/enhance-ui-refresh/design-kit/templates/proposals/landing2-hybrid.html:1-7`, `context/changes/enhance-ui-refresh/design-kit/templates/proposals/landing2-editorial.html:1-7`
- **Detail**: The locked change definition says this is a visual-only refresh of the Enhance screen and explicitly excludes new screens. The Phase 5 close-out commit nevertheless added two `Landing 2.0` proposal files under this change folder, and their own titles/frame make clear they are future landing-content artifacts, not Enhance runtime proof. Leaving them here makes the change less legible and will bury future landing-direction work inside the archive of an already-completed Enhance refresh.
- **Fix A - Recommended**: Move the two `templates/proposals/landing2-*.html` files into the future landing-content change (or a new change folder) before archive/hand-off.
  - Strength: Restores one-change/one-scope traceability without touching shipped code.
  - Tradeoff: Small bookkeeping move now.
  - Confidence: HIGH - the scope lock and the proposal titles point in the same direction.
  - Blind spot: I did not inspect whether another planned change folder for landing content already exists.
- **Fix B**: If these proposal boards are intentionally part of this change's deliverable, widen `change.md` and `plan.md` first so the archive tells the truth.
  - Strength: Keeps the files where they are.
  - Tradeoff: Reopens scope after implementation, which is the weaker option unless the user explicitly chose it.
  - Confidence: MEDIUM - structurally valid, but it contradicts the current locked scope.
  - Blind spot: I did not see evidence that the user re-approved a widened scope.
- **Decision**: RESOLVED — Fix A applied 2026-07-05 (user-chosen). Both proposal boards moved to the new change folder `context/changes/landing-content/design/` (git mv), with a fresh `landing-content/change.md` (status: idea) recording the chosen slim direction, the discipline rules, and the pointer to the built copies in the Claude Design project's Proposals group. The enhance-ui-refresh scope lock holds.

## Notes

- The earlier Phase 3 kit gap around the loaded-photo pre-submit CTA states is resolved in the live change: `5c1e8d9` added cards `09-local-pre-enhance.html` and `10-cloud-pre-submit.html`, and the current runtime still carries both CTA branches at `src/components/enhance/EnhanceWorkspace.tsx:359-385` and `src/components/enhance/EnhanceWorkspace.tsx:409-435`.
- The implementation side of Phase 4 is otherwise disciplined: the `?chroma=1` seam is preserved in `src/pages/index.astro:25-35`, the layout contract remains `max-w-5xl` + `md:grid-cols-[minmax(0,1fr)_320px]` in `src/components/enhance/EnhanceWorkspace.tsx:307-330`, and the new CTA variants are additive in `src/components/ui/button.tsx:20-25`.
- `change.md` was updated to `status: impl_reviewed` when saving this cumulative report; that status change means the review happened, not that the warnings above are waived.
