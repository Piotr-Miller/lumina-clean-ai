# Photo Jobs Data and Storage Implementation Plan

## Overview

Establish the data + storage foundation for the LuminaClean Cloud AI path: a private Supabase Storage bucket and a `jobs` table with per-user RLS, signed-upload capability, a `markJobSucceeded` contract that enforces the 24h source-retention NFR, shared entity/DTO types, and a regression net (automated RLS + signed-URL tests). Not user-visible; unlocks S-03 (gated upload), S-04 (Realtime result delivery), and S-05 (daily cap).

## Current State Analysis

- `supabase/migrations/` is empty — no application tables and no Storage buckets configured beyond the commented-out example in `supabase/config.toml`.
- `src/types.ts` does not exist; the project hard rule requires it as the home for entities and DTOs.
- `src/lib/services/` does not exist — the service-layer convention is documented in `CLAUDE.md` but unused so far.
- `src/lib/supabase.ts` exposes only the SSR cookie-bound client (`createClient`) and uses the anon key. The service-role key is not wired to the Astro/Workers runtime.
- `astro.config.mjs` declares `SUPABASE_URL` and `SUPABASE_KEY` as `astro:env/server` secrets (both `optional: true`). `SUPABASE_SERVICE_ROLE_KEY` is absent from the schema.
- Auth + middleware (`src/middleware.ts`) are in place; the SSR session is available as `context.locals.user` and gates `/dashboard`. Anonymous requests are tolerated globally — middleware just sets `user = null`.
- No test framework is installed (only ESLint + Prettier in devDependencies).
- CI (`.github/workflows/ci.yml`) runs lint + build only.
- `wrangler.jsonc` already has the two Workers fixes applied per `infrastructure.md` (`disable_nodejs_process_v2`, `run_worker_first: true`).
- `supabase` CLI 2.23.4 is already a devDependency, so `npx supabase migration new`, `npx supabase start`, and `npx supabase db reset` are immediately available.

## Desired End State

After this change is complete:
- A `public.jobs` table exists with the four-state lifecycle (`queued | processing | succeeded | failed`), per-operation RLS (user can SELECT/INSERT their own rows; UPDATE/DELETE require service-role), an index on `created_at` (so S-05's daily-cap COUNT is cheap), and is added to the `supabase_realtime` publication.
- A private `photos` Storage bucket exists with RLS so users can only read/write objects under `{user_id}/` prefixes; anon cannot read or write anything.
- `SUPABASE_SERVICE_ROLE_KEY` is declared in the Astro env schema (server-only, secret) and a `createAdminClient()` factory in `src/lib/supabase.ts` builds a non-cookie client using it.
- `src/types.ts` exposes the `PhotoJob` entity, `PhotoJobStatus` enum, and DTOs (`CreatePhotoJobCommand`, `CreatePhotoJobResponse`, `MarkJobSucceededCommand`).
- `src/lib/services/photo-job.service.ts` exposes `createPhotoJob()` (mints a `createSignedUploadUrl` token + inserts a queued row) and `markJobSucceeded()` (updates status + result_path AND deletes the source object — the on-success retention contract S-04 will call from the Edge Function).
- An `npm test` script runs Vitest against a locally-running Supabase (`npx supabase start`); the suite asserts cross-user SELECT denied, anon INSERT denied, anon Storage read denied, signed URL works exactly once, and `markJobSucceeded` deletes the source.
- A documented manual smoke flow proves end-to-end: mint signed URL → client PUT → row visible under user JWT → Realtime subscription fires when `markJobSucceeded` writes the row → source object is gone from Storage.

### Key Discoveries:

- Supabase Storage v2 supports `createSignedUploadUrl()` returning a one-shot token; the client then calls `uploadToSignedUrl(path, token, file)` — keeps the service-role key server-only and avoids proxying bytes through the Worker (essential given the Cloudflare body-size and 10ms-free-tier CPU limits flagged in `infrastructure.md`).
- The project hard rule requires `RLS always enabled on new tables with granular per-operation, per-role policies` — codified in `CLAUDE.md` and re-affirmed in F-01's risk note in the roadmap.
- `idea-notes.md` excludes "Automatic raw-uploads retention cleanup (pg_cron)" from MVP scope, but the PRD commits to a ≤24h source-retention NFR. Resolution: enforce the policy via the on-success code path (`markJobSucceeded`) the foundation now owns; failed-job sources are out-of-scope-for-cleanup in v1 (documented).
- Supabase Realtime applies SELECT-policy row filtering when the subscriber's channel is authenticated with a user JWT — adding the table to `supabase_realtime` publication is necessary but not sufficient; the SELECT policy is what scopes which rows the client sees in the channel.

## What We're NOT Doing

- No `/api/jobs` HTTP route (or any new API route). The signed-URL minting + row insert is exposed only as a typed service helper; the public HTTP shape is S-03's responsibility.
- No engine toggle, no upload UI, no before/after slider, no download — those are S-01/S-03/S-04.
- No pg_cron, no scheduled cleanup, no retention enforcement for **failed** jobs (documented limitation; will be re-evaluated in v2 alongside the Admin role).
- No per-user rate limiting; daily-cap data shape is left ready (created_at partial index) but enforcement is S-05.
- No hosted-Supabase CI integration. The RLS test suite runs locally against `npx supabase start`; CI continues running lint + build only.
- No Edge Function, no Replicate integration, no Database Webhook — all S-04.
- No `cloud_usage` audit table; the daily cap counts rows on `jobs` directly.
- No history UI; v1 surfaces only the current job (per PRD FR-013 demoted to nice-to-have).
- No magic-bytes file validation; not in MVP scope per `idea-notes.md`. (Bucket-level mime-type + size limits still apply.)

## Implementation Approach

The change is split into five phases that mirror the dependency order of the artifacts:

1. **Schema first** — the `jobs` table is the load-bearing primitive; getting it landed (with RLS + publication) means everything downstream can be tested against a real schema.
2. **Storage second** — the bucket + its RLS policies are an independent surface; landing them in a separate migration keeps each migration small and easy to review for privacy correctness.
3. **Runtime wiring** — only once the database surface exists does the application code need a service-role client, shared types, and the signed-URL helper.
4. **Regression net** — automated tests against `npx supabase start` lock the privacy guardrails in place. This is the chosen verification depth.
5. **Manual end-to-end smoke** — proves the contracts hold under the real client (browser-style fetch + supabase-js subscription) before declaring F-01 done.

## Critical Implementation Details

- **`createSignedUploadUrl` is one-shot.** A retry by the client (flaky network on PUT) means the helper must mint a new token; surface this contract in the JSDoc on `createPhotoJob` so S-03 plans its retry UX accordingly.
- **Realtime + RLS subtlety.** Adding `public.jobs` to the `supabase_realtime` publication is necessary but not sufficient — Supabase Realtime applies SELECT-policy row filtering when the subscriber's channel is authenticated with a user JWT. The manual smoke (Phase 5) must subscribe under a user JWT (not anon, not service-role) for the test to be meaningful.
- **Service-role client must never reach a user-input boundary unfiltered.** `createAdminClient()` should live alongside `createClient()` in `src/lib/supabase.ts` with a JSDoc warning. `photo-job.service.ts` accepts a `userId` parameter (passed by the caller from `context.locals.user.id`) — it does not look it up from any client-supplied value.
- **On-success retention contract ordering.** `markJobSucceeded` must update the row first, then delete the source object. If the delete fails, log a warning but keep the row in `succeeded` — the result is the user-visible value; a missed source delete is an operator-cleanup concern, not a user-facing error.

## Phase 1: Database schema, RLS, and Realtime publication

### Overview

Create the `jobs` table with the four-state status enum, indexes, per-operation RLS policies, grants, and publication membership in one migration.

### Changes Required:

#### 1. Migration: `jobs` table + RLS + Realtime

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_jobs_table.sql` (generate the timestamp via `npx supabase migration new create_jobs_table`)

**Intent**: Land the `jobs` table as a privacy-correct, Realtime-observable primitive that every downstream change reads or writes. Includes the schema, indexes, RLS (per the project hard rule: granular per-operation/per-role), grants, the `updated_at` touch trigger, and publication membership.

**Contract**:
- Enum: `create type public.photo_job_status as enum ('queued','processing','succeeded','failed');`
- Table: `public.jobs(id uuid pk default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, status photo_job_status not null default 'queued', source_path text not null, result_path text, replicate_prediction_id text, error_code text, error_message text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz)`
- Indexes: `(user_id, created_at desc)` for owner queries; `(created_at desc) where status <> 'failed'` for S-05's daily cap.
- `updated_at` auto-touch trigger on UPDATE, scoped to this migration:
  `create function public.set_updated_at() returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;`
  `create trigger jobs_set_updated_at before update on public.jobs for each row execute function public.set_updated_at();`
- RLS enabled. Policies on the `authenticated` role: `select_own (USING user_id = auth.uid())`, `insert_own (WITH CHECK user_id = auth.uid())`. No UPDATE or DELETE policy for `authenticated` or `anon`. (Service-role bypasses RLS by design.)
- Grants: `grant select, insert on public.jobs to authenticated;` — no grants to `anon`.
- Publication: `alter publication supabase_realtime add table public.jobs;`

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the migration cleanly
- `npm run lint` passes
- `npm run build` passes
- A scripted psql sanity check confirms anon can neither SELECT nor INSERT into `jobs`

#### Manual Verification:

- The migration file diff is reviewed for: (a) RLS enabled, (b) only SELECT+INSERT for `authenticated`, (c) no `anon` grants, (d) publication line present

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual review was successful before proceeding to the next phase.

---

## Phase 2: Private Storage bucket + storage.objects RLS

### Overview

Create the private `photos` bucket and the RLS policies on `storage.objects` that scope user reads and writes to `{user_id}/...` prefixes.

### Changes Required:

#### 1. Migration: `photos` bucket + storage RLS

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_photos_storage.sql`

**Intent**: Establish the only Storage surface the Cloud AI path uses, with the prefix-as-RLS pattern that prevents URL guessing across users.

**Contract**:
- Insert into `storage.buckets`: `id='photos', name='photos', public=false, file_size_limit=25_000_000, allowed_mime_types='{image/jpeg,image/png,image/heic}'`. (Bucket-level enforcement keeps a misbehaving client from uploading 100MB PSDs.)
- RLS policies on `storage.objects` for the `authenticated` role, all keyed on `bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text`:
  - `photos_select_own` (SELECT, USING)
  - `photos_insert_own` (INSERT, WITH CHECK)
  - `photos_update_own` (UPDATE, USING + WITH CHECK)
  - `photos_delete_own` (DELETE, USING)
- No `anon` policies → anon cannot read or write.

(Service-role bypasses; `markJobSucceeded`'s source-delete runs as service-role and so isn't constrained by these.)

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies both migrations cleanly
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- The migration file diff is reviewed for: (a) bucket `public=false`, (b) `file_size_limit` + `allowed_mime_types` set, (c) all four RLS policies keyed on `(storage.foldername(name))[1] = auth.uid()::text`, (d) no anon policies

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 3: Service-role wiring, shared types, photo-job service

### Overview

Wire the service-role key into the Astro/Workers runtime; add `createAdminClient()`; establish `src/types.ts`; build the `photo-job.service.ts` helper with `createPhotoJob()` and `markJobSucceeded()`.

### Changes Required:

#### 1. Astro env schema: add `SUPABASE_SERVICE_ROLE_KEY`

**File**: `astro.config.mjs`

**Intent**: Declare the service-role key as a server-only secret so `astro:env/server` resolves it under workerd at runtime and flags it as missing at build time. Marked `optional: true` to match the existing `SUPABASE_URL` / `SUPABASE_KEY` pattern (so local-without-Supabase still builds).

**Contract**: New entry in `env.schema`: `SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true })`.

#### 2. Env scaffolding update

**File**: `.env.example`

**Intent**: Add the new variable so contributors know they need it for local Supabase service-role flows.

**Contract**: Append `SUPABASE_SERVICE_ROLE_KEY=###`.

#### 3. Admin Supabase client factory

**File**: `src/lib/supabase.ts`

**Intent**: Expose `createAdminClient()` returning a `SupabaseClient` constructed with the service-role key — no cookies, no auth persistence — for server-only privileged operations (signed URL mint, Storage admin, job-row mutations from background callers). The factory takes env as a **parameter** rather than importing from `astro:env/server` directly, so it stays callable from a Vitest Node environment (where `astro:env/server` doesn't resolve) without any shimming.

**Contract**: New named export `createAdminClient(env: { url: string; serviceRoleKey: string }): SupabaseClient` — pure factory; throws if either field is empty. Astro production callers resolve `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `astro:env/server` at the call site and pass them in; tests resolve from `process.env`. JSDoc warning that this client bypasses RLS and must never be invoked from a code path that takes user input without explicit authorization. **Deliberately asymmetric with `createClient`**, which returns `null` on missing env so anon routes degrade gracefully: admin operations have no anon-equivalent fallback, so a missing service-role key is a configuration error and the factory throws rather than silently returning null.

#### 4. Shared types

**File**: `src/types.ts` (new)

**Intent**: Establish the shared-types home per project hard rule, populated with the F-01 surface.

**Contract**:
- `export type PhotoJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';`
- `export interface PhotoJob` — entity mirroring the table columns; `created_at` / `updated_at` / `completed_at` as ISO strings.
- `export interface CreatePhotoJobCommand { userId: string; fileExtension: 'jpg' | 'png' | 'heic'; mimeType: 'image/jpeg' | 'image/png' | 'image/heic'; }`
- `export interface CreatePhotoJobResponse { jobId: string; uploadUrl: string; uploadToken: string; sourcePath: string; }`
- `export interface MarkJobSucceededCommand { jobId: string; resultPath: string; replicatePredictionId?: string; }`

#### 5. Photo-job service helper

**File**: `src/lib/services/photo-job.service.ts` (new)

**Intent**: Encapsulate the two privileged operations F-01 owns — minting a signed upload URL alongside its DB row, and marking a job succeeded while deleting its source object. Both functions take an explicit `userId` (authoritative caller context, never client input) and the admin `SupabaseClient` as an explicit parameter (caller-built via `createAdminClient(env)`), so the service module never imports from `astro:env/server` and is directly callable from Vitest.

**Contract**:
- `createPhotoJob(admin: SupabaseClient, cmd: CreatePhotoJobCommand): Promise<CreatePhotoJobResponse>` — generates `jobId = crypto.randomUUID()`, computes `sourcePath = \`${userId}/${jobId}/source.${fileExtension}\``, calls `admin.storage.from('photos').createSignedUploadUrl(sourcePath)`, then `admin.from('jobs').insert({id: jobId, user_id: userId, status: 'queued', source_path: sourcePath})`. Throws on either failure; the caller decides the HTTP shape.
- `markJobSucceeded(admin: SupabaseClient, cmd: MarkJobSucceededCommand): Promise<void>` — SELECT the row to read `source_path`, then UPDATE (status='succeeded', result_path, replicate_prediction_id, completed_at=now()); then `admin.storage.from('photos').remove([source_path])`. If the remove fails, log a warning but do not throw (per Critical Implementation Details).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes (proves the new env field type-checks)
- `npx astro check` reports no type errors

#### Manual Verification:

- `src/lib/supabase.ts` carries the JSDoc warning on `createAdminClient`
- `src/types.ts` is in place at the canonical location with the documented exports

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 4: Vitest harness + automated RLS and signed-URL tests

### Overview

Install Vitest and write the regression-net tests that lock in the privacy guardrails for as long as the migrations exist.

### Changes Required:

#### 1. Vitest install + config

**Files**: `package.json`, `vitest.config.ts` (new)

**Intent**: Add `vitest` as a devDependency, an `npm test` script, and a minimal Vitest config targeting Node and importing from `@/` via the same tsconfig paths alias the app uses.

**Contract**:
- `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- `vitest.config.ts`: `import { defineConfig } from 'vitest/config'; import tsconfigPaths from 'vite-tsconfig-paths'; export default defineConfig({ plugins: [tsconfigPaths()], test: { environment: 'node', globals: false, include: ['tests/**/*.test.ts'] } });`. Vitest inherits the `@/*` alias from the existing `tsconfig.json` (`"@/*": ["./src/*"]`) via the plugin — no parallel alias definition to drift.
- devDependency `vitest@^3` (Vite 7 support landed in Vitest 3.x; Vitest 2 peer-deps on Vite ^5 and would not resolve against the existing `overrides: { vite: "^7.3.2" }` in `package.json`).
- devDependency `vite-tsconfig-paths@^5` — Vitest plugin that resolves `@/*` imports from `tsconfig.json` paths, avoiding a duplicate alias declaration.
- devDependency `tsx@^4` — runner for the Phase 5 smoke script; declared here (alongside `vitest`) so `tsx` resolves locally instead of via on-demand `npx` install, and so the smoke script uses the same TypeScript resolver as the test suite.

#### 2. Test environment configuration

**File**: `tests/env.ts` (new)

**Intent**: Pull `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from `process.env` (set by the developer running `npx supabase start && export ...`) and fail-fast with a friendly message if missing.

**Contract**: Named exports `supabaseUrl`, `supabaseAnonKey`, `supabaseServiceRoleKey`, plus a pre-built `supabaseAdmin = createAdminClient({ url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey })` (so tests and helpers import a single shared admin instance instead of constructing it per file). Throws on missing in module init with a one-line hint pointing at `tests/README.md`.

#### 3. RLS + signed-URL integration tests

**File**: `tests/jobs.rls.test.ts` (new)

**Intent**: Assert the privacy and lifecycle guardrails that F-01 promises. Six cases:

- "user A cannot SELECT user B's job rows" — create two test users via admin signUp, insert one row as A via admin, attempt SELECT as B using their JWT; expect 0 rows.
- "anon cannot INSERT a job row" — anon client `.insert(...)` on `jobs` resolves with an error / 0 affected.
- "anon cannot read Storage objects" — anon `.storage.from('photos').download(<known path>)` errors with permission denied.
- "signed URL is one-shot" — mint via admin, PUT once succeeds, PUT again fails.
- "createPhotoJob inserts a queued row and a usable signed URL" — round-trip through the service helper.
- "markJobSucceeded updates the row and deletes the source object" — insert a job + upload a source, call `markJobSucceeded`, assert row status + result_path + that the source object is gone.

**Contract**: One `describe('jobs RLS + lifecycle')` with the six `it(...)` cases above; uses the helper from #4 for per-test user lifecycle.

#### 4. Test fixtures / cleanup helper

**File**: `tests/helpers/test-users.ts` (new)

**Intent**: Encapsulate test-user creation + teardown so each test starts from a known state; uses the admin client's user-management surface (`auth.admin.createUser` with `email_confirm: true` to skip the email-confirmation flow, then `signInWithPassword` to obtain a JWT; `auth.admin.deleteUser` for cleanup).

**Contract**: `createTestUser(email?: string): Promise<{ user, jwt }>` and `deleteTestUser(id: string)`. `deleteTestUser` first lists objects under `photos/{id}/` via the admin client and removes them, then calls `auth.admin.deleteUser` — Storage isn't FK-cascaded by user deletion, so without this step source objects would accumulate across runs. Called in `beforeEach` / `afterEach`.

#### 5. Developer-facing tests README

**File**: `tests/README.md` (new)

**Intent**: Document the exact commands to start local Supabase, export the three env vars, and run the tests. Avoids surprising contributors with hidden setup.

**Contract**: Plain markdown — `npx supabase start`, copy the printed keys, `export SUPABASE_URL=... SUPABASE_KEY=... SUPABASE_SERVICE_ROLE_KEY=...` (and the PowerShell equivalent for Windows), `npm test`.

### Success Criteria:

#### Automated Verification:

- `npm test` passes against `npx supabase start` on a developer machine, with all six test cases green
- `npm run lint` passes (test files conform to lint rules)
- `npm run build` still passes

#### Manual Verification:

- Walk through `tests/README.md` from a clean shell and confirm the documented commands produce a passing `npm test`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 5: Manual end-to-end smoke (including Realtime)

### Overview

Prove the foundation works in the real runtime — not just SQL-level RLS — by running a scripted browser-style flow that exercises signed-URL upload, RLS-scoped SELECT under a user JWT, Realtime subscription with row-level filtering, and the on-success source-delete.

### Changes Required:

#### 1. Smoke-test script

**File**: `scripts/f01-smoke.ts` (new)

**Intent**: A single Node script the developer runs after `npx supabase start` to exercise the end-to-end happy path. Not part of CI; it's an artifact that documents (and proves once) the contract.

**Contract**: The script:
1. Imports the shared admin client: `import { supabaseAdmin as admin } from '../tests/env'` (consistent with importing `deleteTestUser` from the same test fixtures; keeps env validation and admin construction in one place).
2. Creates a test user via the admin client (`auth.admin.createUser` with `email_confirm: true`); signs them in to get a JWT.
3. Builds a user-scoped supabase-js client with the JWT.
4. Calls `createPhotoJob(admin, { userId, fileExtension: 'jpg', mimeType: 'image/jpeg' })`.
5. PUTs a small JPG payload to the returned `uploadUrl` via `fetch`.
6. Subscribes (user JWT) to the `public:jobs` Realtime channel, filtered by `user_id=eq.<userId>`.
7. Calls `markJobSucceeded(admin, { jobId, resultPath: '<placeholder>' })`.
8. Awaits the Realtime event; asserts payload `status === 'succeeded'`.
9. Verifies the source object no longer exists in Storage; tears down the test user (via `deleteTestUser` so the source-prefix cleanup runs too).

Prints `OK ✓` and exits 0 on success; `FAIL ✗ <reason>` and exits 1 otherwise.

#### 2. Smoke-flow documentation

**File**: `context/changes/photo-jobs-data-and-storage/smoke.md` (new)

**Intent**: Capture the manual checklist (and the script command) so reviewers can re-run the smoke after any future change to the migrations or service.

**Contract**: Step-by-step walkthrough with expected output snippets and the equivalent Supabase Studio observations.

### Success Criteria:

#### Automated Verification:

- `npx tsx scripts/f01-smoke.ts` (or `node --import tsx scripts/f01-smoke.ts`) exits 0 against `npx supabase start`

#### Manual Verification:

- A reviewer (or the implementer in a fresh terminal) follows `smoke.md`, runs the script, sees `OK ✓`, and Supabase Studio confirms (a) no source object remaining in the `photos` bucket, (b) the test user's job row at status `succeeded`
- The reviewer checks the script's terminal output shows the Realtime event firing within ~1-2 seconds of the `markJobSucceeded` call (proves Realtime is wired correctly through the user-JWT-scoped subscription)

**Implementation Note**: After completing this phase and all automated verification passes, pause for the reviewer's confirmation. On success, F-01 is complete.

---

## Testing Strategy

### Unit Tests

The service helpers (`createPhotoJob`, `markJobSucceeded`) are intentionally tested as **integration** tests via Phase 4's Vitest suite — pure unit tests would mock the Supabase client and miss the very RLS surface this change exists to lock down. No standalone unit tests are added.

### Integration Tests

All six cases in `tests/jobs.rls.test.ts` (Phase 4) plus the end-to-end smoke in `scripts/f01-smoke.ts` (Phase 5).

### Manual Testing Steps

1. From a clean shell, `npx supabase start`; export the three env vars per `tests/README.md`.
2. Run `npm test`; expect all six tests green.
3. Run `npx tsx scripts/f01-smoke.ts`; expect `OK ✓`.
4. Open Supabase Studio at `http://localhost:54323`; confirm the `jobs` table contains the test user's row at status `succeeded`; confirm the `photos` bucket has the result placeholder but not the source.

## Performance Considerations

- Daily-cap counting (S-05) uses the `(created_at desc) where status <> 'failed'` partial index, so `COUNT(*) WHERE created_at >= date_trunc('day', now())` is bounded by the day's row count — microseconds at the projected MVP scale (target_scale = small).
- Signed-URL minting is one round-trip to Supabase Storage from the Worker; well within the 30ms paid-tier CPU budget called out in `infrastructure.md`.
- The Worker never proxies the photo bytes (chosen mechanism), so the Cloudflare body-size and CPU limits don't apply to the upload itself.

## Migration Notes

- This is the first application migration in the repo; no existing data to preserve.
- Both migrations are forward-only. Rollback is `npx supabase db reset` against the local stack; for a future hosted environment, rollback would be a new `drop` migration (out of F-01 scope).

## References

- Roadmap entry: `context/foundation/roadmap.md` (F-01)
- PRD: `context/foundation/prd.md` (FR-014; NFR: source not retrievable by others / 24h retention; Access Control)
- Infra notes (Workers CPU/body limits, secret handling): `context/foundation/infrastructure.md`
- Hard rules (RLS, API errors, types.ts location, services convention): `CLAUDE.md`
- Scope deferrals (no pg_cron, no magic-bytes validation): `idea-notes.md`
- Auth baseline: `src/middleware.ts`, `src/lib/supabase.ts`, `src/pages/api/auth/*`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database schema, RLS, and Realtime publication

#### Automated

- [x] 1.1 `npx supabase db reset` applies the migration cleanly
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run build` passes
- [x] 1.4 Scripted psql sanity check confirms anon can neither SELECT nor INSERT into jobs

#### Manual

- [ ] 1.5 Migration file diff reviewed for RLS, grants, and publication line

### Phase 2: Private Storage bucket + storage.objects RLS

#### Automated

- [ ] 2.1 `npx supabase db reset` applies both migrations cleanly
- [ ] 2.2 `npm run lint` passes
- [ ] 2.3 `npm run build` passes

#### Manual

- [ ] 2.4 Migration file diff reviewed for bucket privacy, mime types, prefix-RLS, no anon policies

### Phase 3: Service-role wiring, shared types, photo-job service

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes (env field type-checks)
- [ ] 3.3 `npx astro check` reports no type errors

#### Manual

- [ ] 3.4 `createAdminClient` carries the JSDoc warning
- [ ] 3.5 `src/types.ts` exports `PhotoJob`, `PhotoJobStatus`, and the three DTOs at the canonical path

### Phase 4: Vitest harness + automated RLS and signed-URL tests

#### Automated

- [ ] 4.1 `npm test` passes (all six cases green) against `npx supabase start`
- [ ] 4.2 `npm run lint` passes (tests conform to lint rules)
- [ ] 4.3 `npm run build` passes

#### Manual

- [ ] 4.4 `tests/README.md` walkthrough succeeds from a clean shell

### Phase 5: Manual end-to-end smoke (including Realtime)

#### Automated

- [ ] 5.1 `npx tsx scripts/f01-smoke.ts` exits 0 against `npx supabase start`

#### Manual

- [ ] 5.2 Supabase Studio confirms no source object remains and the row sits at status `succeeded`
- [ ] 5.3 Script output shows Realtime event firing within ~1-2 seconds of `markJobSucceeded`
