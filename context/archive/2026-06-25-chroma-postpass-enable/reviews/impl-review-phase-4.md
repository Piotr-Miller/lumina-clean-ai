<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Enable chroma post-pass - Phase 4 (ON-path E2E)

- **Plan**: context/changes/chroma-postpass-enable/plan.md
- **Scope**: Phase 4 of 5 (local/CI-only ON-path E2E seam + Playwright spec)
- **Date**: 2026-06-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Grounding

Reviewed Phase 4 against `plan.md` and current uncommitted changes:

- `src/pages/index.astro` adds `E2E_CHROMA_OVERRIDE` + `?chroma=1` override.
- `astro.config.mjs` declares the local/CI-only `E2E_CHROMA_OVERRIDE` env field.
- `.github/workflows/ci.yml` writes `E2E_CHROMA_OVERRIDE=true` into CI `.dev.vars`.
- `tests/e2e/chroma-postpass-on.spec.ts` mirrors the north-star cloud flow and asserts the processed `blob:` after-image.

Automated verification this session:

- PASS: `npm run typecheck`
- PASS: `npm run lint` (0 errors, 51 pre-existing script console warnings)
- PASS: `npm run test:unit` (19 files, 208 tests)
- PASS: `npm run build` after rerun outside the sandbox. First sandboxed attempt failed only because Wrangler/Miniflare could not write under `AppData\Roaming\xdg.config\.wrangler`.
- FAIL/ENV: `npm test` reached `tests/jobs.rls.test.ts` and failed because `SUPABASE_URL` was not exported; this is the expected local integration precondition, but it means integration was not actually proven locally.
- PASS/discovery only: `playwright test tests/e2e/chroma-postpass-on.spec.ts --project=chromium --list` lists the new spec plus setup.
- NOT RUN: full `npm run test:e2e`; current local session did not have the full local Supabase + served Edge Function harness established. Progress already leaves 4.1 and 4.4 unchecked.

Mutation check skipped: Phase 4 touched the page seam, E2E spec, CI/env config, and plan docs; no `context/foundation/test-plan.md` risk-critical service module was under review.

## Findings

### F1 - E2E override is documented CI-only but not technically production-proof

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/index.astro:28
- **Detail**: The plan contract says the browser-provided override must be guarded so production never honors it. Current code honors `?chroma=1` in any runtime where `E2E_CHROMA_OVERRIDE` is true. CI sets that secret only in `.dev.vars`, and comments say never set it in production, so the normal path is safe. But a copied/mis-set production secret would create the browser-flippable feature the plan explicitly excludes.
- **Fix**: Add a runtime locality guard before honoring the param, for example require `E2E_CHROMA_OVERRIDE === true` AND `Astro.url.hostname` to be `localhost`, `127.0.0.1`, or `::1`. CI still works via Playwright's localhost base URL; production ignores the param even if the seam secret is accidentally set.
- **Decision**: PENDING

### F2 - ON-path spec does not prove download works

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/e2e/chroma-postpass-on.spec.ts:132
- **Detail**: Phase 4's contract says the spec should assert the processed path and that download works. The test asserts the processed after-image is a `blob:` URL, which is the important real-adapter proof, but it only checks that the Download button is visible. It never clicks the button or waits for a browser download event.
- **Fix**: After the `blob:` assertion, wrap the click in `const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "Download" }).click(); const download = await downloadPromise;` and assert the suggested filename matches the expected `luminaclean-e2e-chroma-on-*.jpg` shape, with `await download.failure()` null.
- **Decision**: PENDING

### F3 - Progress marks integration green before integration evidence exists

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/chroma-postpass-enable/plan.md:423
- **Detail**: Progress item 4.2 is checked as "Full unit + integration suite stays green", but only the unit half is locally proven. The full `npm test` command failed before integration because the local Supabase env was not exported (`SUPABASE_URL` missing). That is an environment precondition, not a code regression, but it means this checkbox is ahead of the evidence. By contrast, 4.1 and 4.4 are correctly left pending for the Docker/E2E harness.
- **Fix**: Change 4.2 back to unchecked until CI/local integration actually passes, preserving the unit evidence inline: "unit 208 passed locally; integration pending CI/local Supabase harness." Check it only after the integration job is green.
- **Decision**: PENDING

## Note on change.md status

Left `status: implementing` (phase-4-of-5 review; mid-implementation). The skill's default `impl_reviewed` flip is for full-plan reviews and would misrepresent the in-progress state.
