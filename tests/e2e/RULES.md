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
- The fixture server (`helpers/fixture-server.ts`) is pinned to port 8787 —
  its origin is baked into `E2E_ALLOWED_OUTPUT_ORIGIN` at serve startup, so
  only ONE spec in the suite may run it (under `fullyParallel` a second
  fixture-server spec would collide on the port). Today that spec is
  `north-star-cloud-result.spec.ts`; a new spec needing fixture bytes must
  share its flow, not start a second server.
- Ground every role/name in the actual app (read the component/page source or
  the rendered HTML) — never invent accessible names.

## House style — match the existing suite

Generated specs must look like the four that exist. Follow these concrete forms
(read any current spec, e.g. `cloud-stall-surfaces-timeout.spec.ts`, as a model).

### Naming (file → header → describe → test)

- **File**: `tests/e2e/<risk-in-brief>.spec.ts`, kebab-case, named after the risk
  or the guarantee (`cloud-stall-surfaces-timeout`, `anon-dashboard-redirects-to-signin`).
  (`seed.spec.ts` keeps its name as the exemplar lever — the only exception.)
- **Header docstring** (every spec opens with one): a `risk:` line (lowercase key)
  pointing at `context/foundation/test-plan.md §2 Risk #N — <one-line scenario>`,
  then a `seed: tests/e2e/seed.spec.ts` line. Note the stub boundary + hard-fail
  preconditions below it when the flow needs a served function or env.
- **`describe`**: `"Risk #N: <the risk in user/business terms>"` (e.g.
  `"Risk #2: anon request must not reach Cloud AI processing"`).
- **`test`**: a full user-flow sentence that **fails if the risk materializes** —
  not "test 1" (e.g. `"signed-in upload → Cloud AI → pipeline never advances →
timeout alert with retry actions replaces the spinner"`).

### Repo paths & scaffolding (reuse, don't reinvent)

- Specs in `tests/e2e/*.spec.ts`; helpers in `tests/e2e/helpers/`; committed
  fixture bytes in `tests/e2e/fixtures/`. Config: `playwright.config.ts`
  (`testDir: tests/e2e`, `fullyParallel`, `retries: 1` under CI, the `setup` →
  `chromium` storageState projects).
- **Service-role admin client ONLY via `tests/e2e/helpers/env.ts`** —
  `adminClient("<spec>.ts")` / `supabaseEnv(...)` (loopback-guarded; refuses a
  non-local `SUPABASE_URL`). Never construct `createClient` inline in a spec.
- Cloud-flow helpers, when stubbing the pipeline: `helpers/replicate-stub.ts`
  (`signCallback` + `flipToProcessing` + `resolveSigningSecret`),
  `helpers/fixture-server.ts` (the model-output bytes), and
  `helpers/realtime-ready.ts` (warm Realtime **before** the browser subscribes).
  See the port-8787 single-spec rule above.

### Cleanup correlation (load-bearing)

- The `storageState` account is **shared** across specs running in parallel.
  Correlate cleanup by the **captured id** — the `jobId` from the create-job
  `page.waitForResponse(...)`, or the unique `user_id` you created — and delete
  exactly that row + its storage prefix. **Never** "all rows for the user"; that
  would delete a sibling spec's data mid-run.
