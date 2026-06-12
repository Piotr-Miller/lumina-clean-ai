# E2E Testing Rules

Read together with `seed.spec.ts` (the exemplar) before generating any E2E test
in this directory. Source: `.claude/skills/10x-e2e/references/e2e-quality-rules.md`.

- Use `getByRole`, `getByLabel`, `getByText` as primary locators.
  Fall back to `getByTestId` only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use `page.waitForTimeout()`. Wait for specific conditions:
  `toBeVisible()`, `waitForURL()`, `waitForResponse()`.
- Assert the business outcome, not implementation details.
- Use unique identifiers (timestamp + random suffix) for test data
  to avoid collisions in parallel runs. Clean up in `afterEach` —
  delete exactly what the test created (this repo: service-role admin
  client for users/jobs; setup/cleanup only, never in assertions).
- Authenticate without driving the sign-in UI. The default is `storageState`:
  the `setup` project (`auth.setup.ts`) recreates the dedicated e2e account and
  saves `playwright/.auth/user.json`; every `chromium`-project test starts
  signed in. A spec that must START anonymous opts out with
  `test.use({ storageState: { cookies: [], origins: [] } })`. For flows needing
  their own throwaway user, create it via the admin API and POST the real form
  endpoint (auth endpoints under `src/pages/api/auth/`; cloud contracts in
  `src/lib/services/photo-job.schema.ts`).
- Name the test after the risk it protects (`context/foundation/test-plan.md` §2),
  not "test 1". The assertion must FAIL if that risk materializes.
- Internal boundaries (auth, routing, DB) stay REAL against the local Supabase
  stack. Mock only expensive or non-deterministic external APIs (Replicate) at
  the network layer — and never submit a real cloud job from a test.
- Ground every role/name in the actual app (read the component/page source or
  the rendered HTML) — never invent accessible names.
