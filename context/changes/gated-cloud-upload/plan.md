# Gated Cloud AI Submission (S-03) Implementation Plan

## Overview

Deliver the gated Cloud-AI submission path on the existing home-page enhance workspace. A signed-in user can switch the engine toggle to Cloud AI and submit the loaded photo: the source uploads to the private `photos` bucket via a server-minted signed URL, and a `queued` job row is created. Anonymous visitors see the Cloud option but are prompted to sign in (never silently denied). The flow stops at the `queued` row — the Replicate pipeline and Realtime result push are S-04.

This slice is route + UI glue over an already-built data layer (F-01: `createPhotoJob`, jobs table, private bucket, RLS) and UI shell (S-01: uploader / slider / download / `validateImageFile`).

## Current State Analysis

- **Data layer is complete (F-01).** `createPhotoJob(admin, { userId, fileExtension, mimeType })` mints a one-shot signed upload URL and inserts a `queued` row (`src/lib/services/photo-job.service.ts:20-48`). The `photos` bucket is private with per-user-prefix RLS; the `jobs` table has owner-scoped `select`/`insert` RLS and the two-gate grant model. DTOs `CreatePhotoJobCommand` / `CreatePhotoJobResponse` exist (`src/types.ts:35-47`). `createAdminClient({ url, serviceRoleKey })` is a parameter-injected factory (`src/lib/supabase-admin.ts:29-46`).
- **UI shell is complete (S-01).** `EnhanceWorkspace.tsx` composes `ImageUploader` → action → `BeforeAfterSlider` → `DownloadButton`, all prop-driven and engine-agnostic. State lives in `useLocalEnhance` (`src/components/hooks/useLocalEnhance.ts`). `validateImageFile` detects-and-rejects HEIC (`src/lib/engines/image-helpers.ts:35-58`).
- **Auth is complete (S-02).** Middleware resolves `context.locals.user` every request (`src/middleware.ts:6-16`); `/` is intentionally NOT protected. SSR client factory `createClient(headers, cookies)` (`src/lib/supabase.ts:9-28`).
- **Gaps S-03 fills:**
  - No HTTP route for job creation — F-01 deliberately left "the public HTTP shape" to S-03.
  - `EnhanceWorkspace` takes no props and has no engine-selection or auth awareness (`EnhanceWorkspace.tsx:13-14`); `index.astro` doesn't destructure `user` (`index.astro:1-4`).
  - **`zod` is not installed** (absent from dependencies + devDependencies) — the CLAUDE.md "validate input with zod" rule means this slice introduces it. The auth routes are form handlers and never needed it.
  - **`/` has no auth affordance** — `Layout.astro` is just `<slot />` (`:38`); the Topbar lives only in the retired `Welcome.astro`. There is no dialog/modal component (`src/components/ui/` has only `button.tsx`).
  - `SUPABASE_SERVICE_ROLE_KEY` **is** already declared (`astro.config.mjs:21`) — no env work needed.

## Desired End State

- A signed-in user on `/` loads a JPG/PNG, toggles to Cloud AI, clicks Submit, and sees a "Submitted for Cloud processing" success state; a row exists in `jobs` with `status='queued'` and the source object exists at `{user_id}/{job_id}/source.{ext}` in the private bucket.
- An anonymous visitor on `/` can toggle to Cloud AI and sees an inline "Sign in to use Cloud AI" panel (with the photo still loaded); there is no client or API path by which they reach cloud submission — `POST /api/enhance/cloud/create-job` returns 401 without a session.
- The Local engine flow is unchanged.

**Verification:** manual E2E (anon gating + signed-in submit, confirming the bucket object + `queued` row via Supabase dashboard) + unit tests on the zod schema and the client upload helper + `npx astro check`, `npm run build`, and lint clean on touched files.

### Key Discoveries:

- Server-mint + client-direct-PUT is the established pattern; the Worker never proxies bytes (research §Architecture Insights; F-01 `plan.md:33,369`).
- `createSignedUploadUrl` requires `service_role` and the client upload uses a raw **PUT** to the absolute signed `uploadUrl` — POST returns 403 (research §External, [storage-js#186](https://github.com/supabase/storage-js/issues/186)).
- Retry is settled: each submit mints a fresh `jobId` → unique path → no 409; re-mint on failure (research §External, OQ#4 resolved).
- The `ImageEngine` interface is the wrong abstraction for cloud (sync/Blob-centric) — fork the orchestration, reuse the components (research §Architecture Insights).
- Pass a minimal `isAuthenticated` boolean to the island, not the full `User` object (avoids serializing user data to the client).

## What We're NOT Doing

- No Replicate call, Edge Function, Database Webhook, or Realtime subscription — that is S-04. The job stops at `queued`.
- No cloud result render — the "Submitted" state is the S-03 terminal; S-04 will replace it with the live before/after result.
- No daily-cap / rate limiting — that is S-05.
- No `returnTo` / redirect-after-login mechanism — the inline prompt keeps the photo in memory instead.
- No HEIC support — `validateImageFile`'s existing detect-and-reject applies to both engines (PRD Open Question #1 stays deferred).
- No modal/dialog component, no toast system — the prompt and submitted state are inline.
- No cleanup of abandoned `queued` rows / orphaned source objects (failed PUT) — accepted v1 limitation, cleanup is S-04/S-05 territory.
- No global nav / Topbar restoration on `/` — out of scope (roadmap Parked item).

## Implementation Approach

Two phases, server then client. Phase 1 builds and locks the API contract (auth gate, validation, error envelope) in isolation so the security guardrail is verifiable before any UI depends on it. Phase 2 builds the client flow against that contract: thread auth into the island, add the always-visible toggle with the inline gate, and fork a `useCloudSubmit` hook that calls the route then PUTs to the signed URL. The existing Local flow and shared components are untouched except for adding the toggle and engine-selection state in `EnhanceWorkspace`.

## Critical Implementation Details

- **Upload is a raw `fetch` PUT to the absolute `uploadUrl`** — `createPhotoJob` returns `uploadUrl = signed.signedUrl`, an absolute URL with the upload token already in its query string, so the client does `fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file })`. No `supabase-js` client, no `SUPABASE_URL`/anon key on the client (both are server-only secrets — there is no `astro:env/client` exposure). POST returns 403; use PUT. This is the pattern already proven in `tests/jobs.rls.test.ts:124-184` and `scripts/f01-smoke.ts:124`. The `uploadToken` field is redundant for this path (the token rides inside `uploadUrl`).
- **`userId` is authoritative from `context.locals.user.id`** — never read from the request body. The body carries only `fileExtension` + `mimeType`, treated as advisory and zod-validated against the allow-list; the server derives the path.
- **Lesson #4:** the route resolves `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `astro:env/server` at the call site and passes them into `createAdminClient`. Keep any unit-testable validation logic in a module with no `astro:env/server` import.
- **Lesson #5 (Windows CRLF):** verify lint with `npx prettier --write <touched>` then `npx eslint <touched>` — do not run repo-wide `lint:fix`.
- **Lesson #6:** verify the new route + island under both `npm run dev` and `npm run build && npx wrangler dev`.

---

## Phase 1: Server — cloud-submit API route

### Overview

Add `zod`, then create the authenticated JSON endpoint that validates the request, delegates to `createPhotoJob`, and returns the signed-upload payload — following the CLAUDE.md API hard rule (not the auth routes' form-redirect pattern).

### Changes Required:

#### 1. Add zod dependency

**File**: `package.json`

**Intent**: Introduce `zod` as a runtime dependency so API routes can validate input per the CLAUDE.md hard rule. First zod usage in the repo.

**Contract**: Add `zod` to `dependencies`. Install so the lockfile updates.

#### 2. Request-body schema + type

**File**: `src/lib/services/photo-job.schema.ts` (new), `src/types.ts`

**Intent**: A zod schema for the create-job request body that validates `fileExtension` + `mimeType` against the same allow-list F-01's `CreatePhotoJobCommand` uses, in a module free of `astro:env/server` so it is unit-testable. Add a `CreatePhotoJobRequest` DTO to `src/types.ts` mirroring the schema.

**Contract**: `createPhotoJobRequestSchema` validates `{ fileExtension: "jpg"|"png", mimeType: "image/jpeg"|"image/png" }` (HEIC excluded — matches the client validator and S-03's HEIC decision; F-01's command type permits heic but S-03 never sends it). Export the inferred type or add `CreatePhotoJobRequest` to `src/types.ts`.

#### 3. The API route

**File**: `src/pages/api/enhance/cloud/create-job.ts` (new)

**Intent**: Authenticated POST endpoint: reject anonymous callers (401), validate the body (400), build the admin client, call `createPhotoJob` with the server-resolved `userId`, return `CreatePhotoJobResponse` (200). Wrap unexpected failures as 500.

**Contract**: `export const prerender = false;` + `export const POST: APIRoute`. Reads `context.locals.user` (401 `{ error: { code: "unauthorized", message } }` if null). **Parses the body defensively: wrap `await context.request.json()` so a malformed/non-JSON body returns `400 { error: { code: "invalid_body", message } }` — NOT 500** (do not let the parse throw fall into the generic catch). Then validates the parsed object through `createPhotoJobRequestSchema` (400 `invalid_body` on failure). Resolves `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` from `astro:env/server`, calls `createAdminClient(...)`, then `createPhotoJob(admin, { userId: user.id, fileExtension, mimeType })`. Returns the response JSON with 200; only unexpected service/config failures reach the outer catch → 500 `{ error: { code: "internal_error", message } }`. Error bodies never include `status`. A small `json(body, status)` helper is acceptable inline.

### Success Criteria:

#### Automated Verification:

- `zod` resolves: `npm ls zod` shows it installed
- Type checking passes: `npx astro check` (the real type gate — `npm run build`/`astro build` strips types without checking them)
- Build succeeds: `npm run build`
- Linting passes on touched files: `npx prettier --write` then `npx eslint` on the new/changed files
- Unit tests pass (target the new pure-logic file, not full `vitest run` — the suite includes `tests/jobs.rls.test.ts` which needs a running local Supabase): `npx vitest run tests/cloud-create-job-schema.test.ts` — schema accepts valid jpg/png bodies, rejects missing fields, rejects HEIC and unknown MIME types

#### Manual Verification:

- `POST /api/enhance/cloud/create-job` with no session returns 401 and the `{ error: { code, message } }` envelope (no `status` field)
- A malformed body (missing/invalid `fileExtension`) returns 400 `invalid_body`
- With a signed-in session + valid body, returns 200 with `{ jobId, uploadUrl, uploadToken, sourcePath }`, and a `queued` row appears in `jobs` (Supabase dashboard)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Client — engine toggle, sign-in gating, cloud orchestration

### Overview

Make the workspace auth-aware, add an always-visible Local/Cloud toggle, gate Cloud for anonymous users with an inline sign-in panel, and add the cloud-submit orchestration that calls the Phase-1 route, PUTs the file to the signed URL, and shows the "Submitted" terminal state. The Local flow is preserved.

### Changes Required:

#### 1. Thread auth state into the island

**File**: `src/pages/index.astro`, `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: Pass whether the visitor is signed in to the React island so it can gate Cloud. Use a minimal boolean, not the `User` object, to avoid serializing user data to the client.

**Contract**: `index.astro` frontmatter destructures `const { user } = Astro.locals` and renders `<EnhanceWorkspace client:load isAuthenticated={!!user} />`. `EnhanceWorkspace` gains an `isAuthenticated: boolean` prop.

#### 2. Engine-selection state + toggle UI

**File**: `src/components/enhance/EnhanceWorkspace.tsx`, optionally `src/components/enhance/EngineToggle.tsx` (new)

**Intent**: Hold the selected engine (`"local" | "cloud"`, default `"local"`) in the workspace and render an always-visible two-option toggle so the Cloud option is visible to everyone (PRD funnel; FR-006/FR-007). The toggle drives which action UI shows.

**Contract**: New `useState<EngineId>("local")`. A toggle built from the existing `Button` (variant-based selected/unselected styling via `cn()`); extract to `EngineToggle.tsx` if it keeps `EnhanceWorkspace` readable. Reuses the `EngineId` type from `src/lib/engines/types.ts`. **Always visible** — rendered above the uploader/action area so the Cloud option is on screen even before a photo is loaded (the sign-up funnel; FR-006/FR-007). Selecting Cloud while anonymous surfaces the inline sign-in panel; submit is gated after selection, not the toggle itself.

#### 3. Cloud-submit orchestration hook + upload helper

**File**: `src/components/hooks/useCloudSubmit.ts` (new), `src/lib/services/cloud-upload.client.ts` (new)

**Intent**: A hook that owns the cloud flow state (`idle | submitting | submitted | error`) separate from `useLocalEnhance`, plus a pure-ish extracted helper that performs the two-step upload (POST to the route → raw PUT to the returned `uploadUrl`) so it can be unit-tested without the island. The hook reuses `validateImageFile` before submitting (HEIC stays rejected).

**Contract**: `cloud-upload.client.ts` exports e.g. `submitCloudJob(file): Promise<{ jobId }>` — derives `fileExtension`/`mimeType` from the file, `fetch`es `POST /api/enhance/cloud/create-job` with the JSON body, parses the `{ error: { code, message } }` envelope on non-2xx (mapping 401/400/500 to user-facing messages per research §Error mapping), then uploads via a **raw `fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file })`** (the returned `uploadUrl` is an absolute, token-bearing signed URL — no supabase-js client or client-side Supabase env needed; maps the PUT's 413/403 to friendly messages). `useCloudSubmit(file)` exposes `{ status, error, submit() }`. On success → `submitted`. Object-URL ownership stays with the existing source state; this hook does not create result URLs.

#### 4. Wire the action UI per engine + auth state

**File**: `src/components/enhance/EnhanceWorkspace.tsx`, `src/components/enhance/CloudSignInPrompt.tsx` (new)

**Intent**: When a photo is loaded, render the action area based on engine + auth: Local → existing Enhance button; Cloud + signed-in → Submit-to-Cloud button (uses `useCloudSubmit`); Cloud + anonymous → inline `CloudSignInPrompt`. After a successful cloud submit, show the "Submitted" terminal state with a Start-over button. Preserve the loaded photo across toggling and across the anon prompt.

**Contract**: `CloudSignInPrompt` is a small panel: heading "Sign in to use Cloud AI", links to `/auth/signin` and `/auth/signup`, styled for the dark theme with `cn()`. The submitted state mirrors the existing done-state layout (centered, with the source image still shown) but with the explanatory copy "Submitted for Cloud processing — your enhanced result will appear here once ready" instead of the slider. Cloud errors render through the existing error line pattern (`role="alert"`). The Local "done" branch (slider + download) is unchanged and only reachable via the Local engine.

**State-reset rule:** the action area renders purely from `engine` + `isAuthenticated` + the *active* engine's status. Flipping the toggle **preserves the loaded source** but clears the other engine's terminal/error state — i.e. switching away from Local discards a finished slider result, and switching away from Cloud discards a "submitted"/error state — so a stale result from one engine never renders alongside the other engine's action. (Concretely: `reset()` the inactive hook, or gate every result/submitted/error branch on `engine ===` the owning engine.)

#### 5. Refresh the stale engine-seam comment

**File**: `src/lib/engines/types.ts`

**Intent**: The current doc-comment says S-03 will plug Cloud in behind the `ImageEngine` contract; the plan instead forks the cloud orchestration. Update the comment so it doesn't mislead future readers. Comment-only — no behavior change.

**Contract**: `EngineId` stays the shared `"local" | "cloud"` union; clarify in the comment that `ImageEngine` is the Local-style synchronous Blob-returning contract and that the cloud path uses a separate (forked) submit-then-wait orchestration, not an `ImageEngine` implementation.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build succeeds: `npm run build`
- Linting passes on touched files: `npx prettier --write` then `npx eslint` on the new/changed files
- Unit tests pass (target the new file: `npx vitest run tests/cloud-upload.client.test.ts`): the helper builds the correct body/extension from a File, surfaces the error envelope, and PUTs to `uploadUrl` with the right `Content-Type` (global `fetch` mocked). Run the pre-existing `tests/auth-validation.test.ts` + `tests/image-helpers.test.ts` to confirm no regressions; reserve full `npm test` (incl. `tests/jobs.rls.test.ts`) for when local Supabase is up

#### Manual Verification:

- **Anon gating:** signed-out, load a photo, toggle to Cloud → inline sign-in panel shows, no Submit button, photo stays loaded; toggling back to Local restores the Enhance button
- **Signed-in submit:** signed in, load a JPG, toggle to Cloud, Submit → "Submitted" state appears; a `queued` row + source object exist (Supabase dashboard)
- **Local unchanged:** Local enhance → before/after slider + download still works
- **HEIC:** selecting a `.heic` file shows the existing reject message (both engines)
- **No-bypass:** confirm there is no UI path for an anon user to trigger a cloud submit (toggle gates it; route returns 401 regardless)
- **Dev + workerd parity:** flow works under `npm run dev` and under `npm run build && npx wrangler dev` (island hydration + route reachable, Lesson #6)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- `createPhotoJobRequestSchema`: accepts valid jpg/png bodies; rejects missing/extra-invalid fields; rejects HEIC + unknown MIME types.
- `cloud-upload.client` helper: derives correct `fileExtension`/`mimeType` from a `File`; posts the right JSON body; parses and surfaces the `{ error: { code, message } }` envelope; PUTs the file to the returned `uploadUrl` with the right `Content-Type` (global `fetch` mocked — both the route call and the PUT; no supabase-js mock needed).

### Integration Tests:

- None automated this slice (route mostly delegates to already-tested F-01 code; per the testing decision). The route's auth/validation behavior is covered by manual verification.

### Manual Testing Steps:

1. Signed-out: load photo → toggle Cloud → see inline sign-in panel; toggle back → Enhance button returns; photo preserved throughout.
2. Sign in → return to `/` → load JPG → toggle Cloud → Submit → "Submitted" state.
3. Verify in Supabase dashboard: a `jobs` row with `status='queued'` and `source_path = {user_id}/{job_id}/source.jpg`, and the object present in the private `photos` bucket.
4. Local engine still produces the before/after slider + working download.
5. Select a `.heic` file → friendly reject message.
6. Re-run the signed-in submit under `npm run build && npx wrangler dev`.

## Performance Considerations

Bytes go browser → Supabase directly via the signed URL; the Worker only issues the token, so the 25 MB image never transits the Worker (avoids request-size/CPU pressure). No new server compute on the hot path.

## Migration Notes

No schema or data migration — S-03 reuses F-01's tables, bucket, and RLS unchanged. New runtime dependency: `zod`.

## References

- Research: `context/changes/gated-cloud-upload/research.md`
- Service helper: `src/lib/services/photo-job.service.ts:20-48`
- Admin client: `src/lib/supabase-admin.ts:29-46`
- Workspace + toggle seam: `src/components/enhance/EnhanceWorkspace.tsx:13-14`
- Auth route convention (form pattern, NOT this slice's JSON pattern): `src/pages/api/auth/signin.ts`
- Lessons: `context/foundation/lessons.md` (#4 admin client, #5 CRLF lint, #6 workerd parity)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Server — cloud-submit API route

#### Automated

- [x] 1.1 `zod` resolves: `npm ls zod` shows it installed — 9a25805
- [x] 1.2 Type checking passes: `npx astro check` — 9a25805
- [x] 1.3 Build succeeds: `npm run build` — 9a25805
- [x] 1.4 Linting passes on touched files (prettier --write then eslint) — 9a25805
- [x] 1.5 Unit tests pass (`npx vitest run tests/cloud-create-job-schema.test.ts`): schema accepts valid jpg/png, rejects missing fields / HEIC / unknown MIME — 9a25805

#### Manual

- [x] 1.6 No-session POST returns 401 with `{ error: { code, message } }` (no `status` field) — 9a25805
- [x] 1.7 Malformed body (non-JSON or invalid fields) returns 400 `invalid_body` — 9a25805
- [x] 1.8 Signed-in valid body returns 200 with `{ jobId, uploadUrl, uploadToken, sourcePath }` + `queued` row appears — 9a25805

### Phase 2: Client — engine toggle, sign-in gating, cloud orchestration

#### Automated

- [x] 2.1 Type checking passes: `npx astro check` — d0e4578
- [x] 2.2 Build succeeds: `npm run build` — d0e4578
- [x] 2.3 Linting passes on touched files (prettier --write then eslint) — d0e4578
- [x] 2.4 Unit tests pass (`npx vitest run tests/cloud-upload.client.test.ts`): helper body/extension + error envelope + PUT Content-Type (global fetch mocked); auth-validation + image-helpers tests still green — d0e4578

#### Manual

- [x] 2.5 Anon gating: toggle to Cloud shows inline sign-in panel, no Submit, photo preserved; toggle back restores Enhance — d0e4578
- [x] 2.6 Signed-in submit: "Submitted" state appears; `queued` row + source object exist — d0e4578
- [x] 2.7 Local enhance unchanged (slider + download work) — d0e4578
- [x] 2.8 HEIC selection shows reject message (both engines) — d0e4578
- [x] 2.9 No anon bypass path to cloud submit (UI gate + route 401) — d0e4578
- [x] 2.10 Flow works under both `npm run dev` and `npm run build && npx wrangler dev` — d0e4578
