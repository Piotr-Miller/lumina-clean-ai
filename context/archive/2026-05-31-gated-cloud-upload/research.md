---
date: 2026-05-31T00:00:00Z
researcher: Piotr Miller
git_commit: e0699416478f1071d95a404d30ab6cb1397ef503
branch: master
repository: lumina-clean-ai
topic: "S-03 gated-cloud-upload — engine toggle, sign-in gating, signed upload + job creation"
tags: [research, codebase, enhance-ui, strategy-engine, supabase-storage, rls, auth-gating, api-routes]
status: complete
last_updated: 2026-05-31
last_updated_by: Piotr Miller
last_updated_note: "Added External Research section (Supabase signed-upload semantics via Context7 + exa.ai ecosystem best practices)"
---

# Research: S-03 `gated-cloud-upload`

**Date**: 2026-05-31T00:00:00Z
**Researcher**: Piotr Miller
**Git Commit**: e0699416478f1071d95a404d30ab6cb1397ef503
**Branch**: master
**Repository**: lumina-clean-ai

## Research Question

What does the existing codebase already provide for roadmap slice **S-03** (`gated-cloud-upload`), and what are the exact reuse seams, constraints, and open decisions for a plan that delivers: an engine toggle (Local/Cloud AI), sign-in gating of the Cloud option (FR-007, prompt — never silent deny), and a signed-in user's submit that uploads the source to the private bucket and creates a `queued` job row?

**Scope (confirmed with user):** strictly S-03 — stop at the `queued` job row. The Replicate pipeline + Realtime result push is **S-04**, out of scope here. Internal codebase research only (external Replicate research belongs to S-04).

## Summary

S-03 is **mostly route + UI glue over an already-built data layer**. F-01 built the entire storage/jobs/RLS substrate and the `createPhotoJob` service helper; S-01 built the reusable upload → slider → download UI shell and a deliberate (synchronous, canvas-centric) `ImageEngine` Strategy seam; S-02 built auth. **No HTTP route exists yet for job creation — F-01 explicitly left "the public HTTP shape" to S-03.**

What S-03 must build:
1. **A new JSON API route** (e.g. `POST /api/enhance/cloud/create-job`) that authenticates via `context.locals.user`, builds the service-role admin client, and calls `createPhotoJob(admin, { userId, fileExtension, mimeType })`. This is a *real* JSON API → must follow the CLAUDE.md hard rule (`prerender = false`, zod validation, `{ error: { code, message } }` envelope) — **unlike** the auth endpoints, which are form-POST/redirect handlers.
2. **A client-side two-step upload flow**: call the route → receive `{ uploadUrl, uploadToken, jobId, sourcePath }` → PUT the file with `uploadToSignedUrl`. The signed URL is **one-shot** → retry requires a fresh mint.
3. **An engine toggle** in `EnhanceWorkspace`, gated for anonymous users. Auth state currently does **not** reach the React island — it must be passed as a prop from `index.astro` (`const { user } = Astro.locals`).
4. **A sign-in prompt** for anonymous users selecting Cloud. There is **no redirect-after-login mechanism** in the codebase and the in-browser loaded photo will not survive a full redirect round-trip — a real UX decision for the plan.

The biggest design tension: S-01's `ImageEngine` interface is **synchronous and returns an `EnhanceResult` Blob in-browser**, but the cloud path is async (upload → DB row → S-04 pipeline → Realtime). The plan must reconcile this — likely by widening the `EngineId` union and **forking the orchestration** rather than literally implementing `enhance()` for cloud.

## Detailed Findings

### Area 1 — UI shell + engine Strategy toggle

**Engine Strategy contract** (`src/lib/engines/types.ts`):
```ts
export type EngineId = "local" | "cloud";              // "cloud" already reserved
export interface EnhanceResult { blob: Blob; width: number; height: number; mimeType: string; }
export interface ImageEngine {
  id: EngineId;
  enhance(source: HTMLImageElement | ImageBitmap, opts: { mimeType: string }): Promise<EnhanceResult>;
}
```
- `EngineId` already includes `"cloud"` — no widening needed (the historical note about `id: "local"` was superseded; current type is the union).
- **No registry/factory.** `localEngine` is a direct singleton export (`src/lib/engines/local-engine.ts:45`). The contract is **canvas-centric**: `enhance()` takes a decoded image and returns a Blob synchronously-ish. The cloud path cannot satisfy this (its result arrives async in S-04), so the cloud submit should **not** be shoehorned into `ImageEngine.enhance()` — fork the orchestration instead.

**Workspace + state** (`src/components/enhance/EnhanceWorkspace.tsx`):
- All state lives in the `useLocalEnhance()` hook, instantiated at `EnhanceWorkspace.tsx:14`. This line is the toggle seam.
- State shape (`src/components/hooks/useLocalEnhance.ts:45-141`): `status: "idle"|"processing"|"done"|"error"`, `sourceUrl`, `resultUrl`, `resultBlob`, `resultWidth`, `resultHeight`, `downloadName`, `error`, plus `onAccepted(file, objectUrl)`, `enhance()`, `reset()`.
- **Source image** is held as an object URL (`URL.createObjectURL(file)`), with the `File` retained separately only for `file.type` (`useLocalEnhance.ts:47, 67-80`). `enhance()` decodes the object URL into an `HTMLImageElement`, enforces `MAX_IMAGE_DIMENSION` (8000px), then calls `localEngine.enhance(img, { mimeType })` (`useLocalEnhance.ts:91-97`).
- **Object-URL lifecycle** is carefully managed via `urlsRef` — revoked on unmount and on state replacement (`useLocalEnhance.ts:58-65, 68-70, 99-100, 114-115`). If the plan forks the hook for cloud, it must preserve this ownership discipline.

**Reusable, prop-driven, engine-agnostic components** (all reusable verbatim by the cloud path):
- `ImageUploader.tsx` — emits `(file: File, objectUrl: string)` via `onAccepted` (`ImageUploader.tsx:6-10, 31`). `accept="image/jpeg,image/png"` (`:68`); validation via `validateImageFile` (see below).
- `BeforeAfterSlider.tsx` — props `{ beforeSrc, afterSrc, width, height, alt? }` (`:4-15`); uses `width/height` for `aspect-ratio` (`:63-65`). Consumes any image URLs.
- `DownloadButton.tsx` — props `{ blob: Blob, filename: string }` (`:4-10`). Fully generic.

**Validation/helpers** (`src/lib/engines/image-helpers.ts`):
- `ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png"]`, `MAX_FILE_BYTES = 25_000_000`, `MAX_IMAGE_DIMENSION = 8000` (`:12-23`).
- `validateImageFile(file)` — **detects and rejects HEIC** with a friendly convert message (`:35-58`). `deriveDownloadName()` (`:83-92`).
- **Mismatch to resolve:** the F-01 bucket *allows* `image/heic`, but this client validator *rejects* it (see Open Questions).

**Mount point + auth gap** (`src/pages/index.astro`):
- `<EnhanceWorkspace client:load />` at `index.astro:15`, hydrated immediately.
- **The island receives NO auth props today.** `index.astro` frontmatter does not destructure `user`. To gate the toggle, pass `user={user}` from `const { user } = Astro.locals` (Approach A — recommended; cleaner than a client-side `/api/me` fetch).

### Area 2 — Storage, jobs table, RLS, signed upload (F-01, already built)

**Jobs table** (`supabase/migrations/20260528120000_create_jobs_table.sql`):
- Columns (`:30-42`): `id uuid pk`, `user_id uuid not null references auth.users(id) on delete cascade`, `status public.photo_job_status not null default 'queued'`, `source_path text not null`, `result_path text`, `replicate_prediction_id text`, `error_code text`, `error_message text`, `created_at`, `updated_at`, `completed_at`.
- Status enum (`:19-24`): **`queued | processing | succeeded | failed`**. **S-03 inserts at `queued`**; all other transitions + columns (`result_path`, `replicate_prediction_id`, `completed_at`, errors) are S-04.
- RLS (`:81-96`): `jobs_select_own` and `jobs_insert_own` for `authenticated` only, both keyed `user_id = auth.uid()`. **No UPDATE/DELETE policy, no anon policy.**
- Grants (`:113-120`): `revoke all ... from anon, authenticated;` then `grant select, insert ... to authenticated;`. **service_role grants left intact** (Lesson #1).
- Realtime (`:124-135`): `replica identity full` + added to `supabase_realtime` (Lesson #2). **S-04 territory** — S-03 does not subscribe.
- Index `jobs_user_id_created_at_idx (user_id, created_at desc)` (`:53-54`) — serves owner queries + the S-05 daily-cap count.

**Photos storage bucket** (`supabase/migrations/20260528120100_create_photos_storage.sql`):
- Bucket `photos`, `public=false`, `file_size_limit=25000000`, `allowed_mime_types={image/jpeg,image/png,image/heic}` (`:22-33`).
- Four `storage.objects` RLS policies for `authenticated`, all keyed `bucket_id='photos' AND (storage.foldername(name))[1] = auth.uid()::text` (select/insert/update/delete own) (`:46-84`). **No anon policies** → anon has zero storage access.
- **Path convention:** `{user_id}/{job_id}/source.{ext}` — first segment is the RLS key (`:42-44`).

**Service helper** (`src/lib/services/photo-job.service.ts`):
- `createPhotoJob(admin: SupabaseClient, cmd: CreatePhotoJobCommand): Promise<CreatePhotoJobResponse>` (`:20-48`):
  1. mint `jobId` (uuid) → `sourcePath = ${userId}/${jobId}/source.${fileExtension}` (`:24-25`),
  2. `admin.storage.from('photos').createSignedUploadUrl(sourcePath)` (`:27`) — **one-shot token**,
  3. insert `{ id, user_id, status:'queued', source_path }` via admin client (`:32-37`),
  4. return `{ jobId, uploadUrl, uploadToken, sourcePath }` (`:42-47`).
- Uses the **admin (service-role) client** passed in as a parameter; `userId` comes from the command (authoritative — from `context.locals.user.id`, never client body).
- `markJobSucceeded(...)` (`:66-98`) is **S-04's** call path (status→succeeded + source delete for 24h retention). Not used by S-03.

**Admin client** (`src/lib/supabase-admin.ts`):
- `createAdminClient(env: { url: string; serviceRoleKey: string })` (`:29-46`) — pure factory, **takes env as a parameter**, no `astro:env/server` import (Lesson #4). `persistSession:false`, `autoRefreshToken:false`. **Throws** on missing env (asymmetric with `createClient`, which returns null).

**Types** (`src/types.ts`):
```ts
export type PhotoJobStatus = "queued" | "processing" | "succeeded" | "failed";   // :13
export interface CreatePhotoJobCommand {                                          // :35-39
  userId: string;
  fileExtension: "jpg" | "png" | "heic";
  mimeType: "image/jpeg" | "image/png" | "image/heic";
}
export interface CreatePhotoJobResponse {                                         // :42-47
  jobId: string; uploadUrl: string; uploadToken: string; sourcePath: string;
}
```
Plus `PhotoJob` (row entity, `:16-28`) and `MarkJobSucceededCommand` (`:50-54`, S-04).

### Area 3 — Auth gating + API route conventions

**Middleware** (`src/middleware.ts`):
- Resolves user every request via `createClient(headers, cookies)` + `supabase.auth.getUser()` → `context.locals.user` (`:6-16`). Anonymous = `null`.
- `PROTECTED_ROUTES = ["/dashboard"]` (`:4`); unauthenticated hits redirect to `/auth/signin` (`:18-22`). **`/` is NOT protected** — correct, anon must reach it to see/be-prompted-by the Cloud option.
- **API routes are not middleware-gated** — the new route must check `context.locals.user` itself and return 401.

**SSR client** (`src/lib/supabase.ts`): `createClient(requestHeaders, cookies)` builds a cookie-bound `@supabase/ssr` server client from `SUPABASE_URL`/`SUPABASE_KEY` (`astro:env/server`); returns `null` if env missing (`:9-28`).

**Locals type** (`src/env.d.ts:3`): `user: import("@supabase/supabase-js").User | null`.

**API route convention** — verbatim pattern from auth routes (`src/pages/api/auth/{signin,signup,reset-password,update-password}.ts`):
- `export const prerender = false;` at file scope, line 4 (every route).
- Uppercase `POST`/`GET` handler exports.
- **Caveat:** the auth routes use **form-POST → redirect-with-`?error`** (browser form handlers) — they do **NOT** use the zod/JSON envelope. S-03's create-job endpoint is a genuine JSON API, so it must follow the **CLAUDE.md hard rule**: zod validation, `{ error: { code, message } }` (snake_case `code`, 400 validation / 500 unexpected, no `status` in body), 401 for unauthenticated.

**Recommended S-03 route skeleton** (`POST /api/enhance/cloud/create-job.ts`):
```ts
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase-admin";
import { createPhotoJob } from "@/lib/services/photo-job.service";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;                       // middleware-resolved
  if (!user) return json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
  // zod-parse { fileExtension, mimeType } from request body → 400 invalid_body on failure
  const admin = createAdminClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
  const job = await createPhotoJob(admin, { userId: user.id, fileExtension, mimeType });
  return json(job, 200);  // { jobId, uploadUrl, uploadToken, sourcePath }
};
```
> Note `SUPABASE_SERVICE_ROLE_KEY` must be declared in `astro.config.mjs` `env.schema` and present in `.dev.vars` / deployment secrets. Verify it's already declared (F-01 used it); if not, the plan adds it.

**Client auth-state delivery:** auth state reaches `.astro` via `Astro.locals.user` (e.g. `Topbar.astro:2`) but **not** React islands. The plan must pass `user` as an `EnhanceWorkspace` prop. The sign-in page (`src/pages/auth/signin.astro:5`) reads only `?error=`; **no `returnTo`/`next` support exists**.

### Area 4 — Historical decisions (F-01 / S-01 / S-02 archive)

Confirms and adds rationale to the above. Explicit hand-off notes aimed at S-03:
- **S-03 owns the public HTTP shape** — F-01 deliberately built no `/api/jobs` route (`context/archive/2026-05-28-photo-jobs-data-and-storage/plan.md:40`).
- **Signed URL is one-shot → S-03 designs retry UX** (re-mint on failed PUT) (F-01 `plan.md:62`, `plan-brief.md:86`).
- **Upload mechanism is server-mint + client-direct PUT** (not byte-proxying through the Worker) — chosen to keep the service-role key server-side and dodge Worker body-size/CPU limits (F-01 `plan.md:33, 369`).
- **Engine seam was left for S-03** but is synchronous/canvas-centric — the plan must reconcile cloud's async nature (S-01 `change.md:20`, `plan.md:42, 65`).
- **Components built to be reused "by swapping the result source"** (S-01 `change.md:21`).
- **Failed-job source objects leak** (documented v1 limitation; cleanup only on success) — relevant if S-03 surfaces submit errors (F-01 `plan.md:42`).
- **No redirect-after-login exists; `next` params were deliberately refused** to avoid open redirect (S-02 `plan.md:150`). Any return-URL S-03 introduces must be same-origin-validated.
- **Auth control may be absent on `/`:** the Topbar (with Sign out / auth affordance) is mounted in `Welcome.astro`, which S-01 retired from `/` (`roadmap.md:176`, S-01 `plan.md:180`). S-03's "prompt to sign in" likely needs to surface its own affordance. **Verify against current `index.astro` during planning.**

## Code References

- `src/lib/engines/types.ts` — `ImageEngine` / `EnhanceResult` / `EngineId` Strategy contract (`"cloud"` reserved)
- `src/lib/engines/local-engine.ts:45` — `localEngine` singleton (canvas gamma + blur)
- `src/lib/engines/image-helpers.ts:12-58` — shared validation constants + `validateImageFile` (rejects HEIC)
- `src/components/enhance/EnhanceWorkspace.tsx:14` — toggle seam (hook instantiation)
- `src/components/hooks/useLocalEnhance.ts:45-141` — flow state + `enhance()`/`reset()`/object-URL lifecycle
- `src/components/enhance/ImageUploader.tsx:6-10,68` — `onAccepted(file, objectUrl)`; `accept` MIME list
- `src/components/enhance/BeforeAfterSlider.tsx:4-15` / `DownloadButton.tsx:4-10` — generic, engine-agnostic props
- `src/pages/index.astro:15` — `<EnhanceWorkspace client:load />`, no auth prop today
- `supabase/migrations/20260528120000_create_jobs_table.sql:19-24,30-42,81-96,113-120,124-135` — enum, schema, RLS, grants, realtime
- `supabase/migrations/20260528120100_create_photos_storage.sql:22-33,42-84` — bucket config + path convention + storage RLS
- `src/lib/services/photo-job.service.ts:20-48` — `createPhotoJob` (mint signed URL + insert queued row)
- `src/lib/supabase-admin.ts:29-46` — `createAdminClient({ url, serviceRoleKey })` (env-as-parameter, throws on missing)
- `src/types.ts:13,16-28,35-47` — `PhotoJobStatus`, `PhotoJob`, `CreatePhotoJobCommand/Response`
- `src/middleware.ts:4,6-22` — user resolution, `PROTECTED_ROUTES`, redirect
- `src/lib/supabase.ts:9-28` — SSR cookie client factory
- `src/env.d.ts:3` — `App.Locals.user`
- `src/pages/api/auth/signin.ts` (+ signup/reset-password/update-password) — `prerender=false` + handler conventions (form-redirect pattern, NOT JSON)
- `src/components/Topbar.astro:2` — `.astro` auth-state read pattern
- `src/pages/auth/signin.astro:5` — reads `?error=` only (no `returnTo`)

## Architecture Insights

- **Server-mint + client-direct-PUT signed upload** is the established pattern: the Worker never proxies image bytes. S-03's client does `fetch(createJobRoute)` → `uploadToSignedUrl(uploadUrl/token, file)`.
- **Service-role for writes, RLS for reads:** `createPhotoJob` uses the admin client (it inserts a row owned by the authenticated caller and mints a storage token); `userId` is authoritative from `context.locals.user.id`. The two-gate defense (GRANT layer + RLS) means anon is blocked before RLS even runs.
- **The `ImageEngine` interface is the wrong abstraction for cloud.** It is synchronous and Blob-returning; cloud is fire-and-forget-then-await-Realtime. Treat the toggle as selecting a *flow* (local in-browser `enhance()` vs cloud submit-then-wait), not as two interchangeable `ImageEngine` impls. Reuse the *components* (uploader/slider/download), fork the *orchestration*.
- **Auth never reaches islands** in this codebase by convention — pass it as a prop from the `.astro` page.

## Historical Context (from prior changes)

- `context/archive/2026-05-28-photo-jobs-data-and-storage/plan.md:40,62,33,369,42` — HTTP shape deferred to S-03; one-shot signed URL retry hand-off; server-mint rationale; failed-job leak limitation.
- `context/archive/2026-05-28-local-engine-enhance-flow/change.md:20-21`, `plan.md:42,65,180` — engine seam + reusable components left for S-03; Welcome/Topbar retired from `/`.
- `context/archive/2026-05-29-account-access-and-password-reset/plan.md:12,150` — `/` open by design; no redirect-after-login; open-redirect avoidance.

## Lessons that constrain S-03 (`context/foundation/lessons.md`)

- **#1 (REVOKE anon/authenticated, keep service_role)** — applies only if S-03 adds a new table/migration (likely none; it reuses F-01's schema). The grant model on `jobs` already follows it.
- **#4 (server-only service-role client, env-as-parameter)** — **directly applies.** Import `createAdminClient` from `src/lib/supabase-admin.ts`, resolve env from `astro:env/server` at the route call site, pass it in.
- **#5 (Windows CRLF lint baseline)** — lint success = "no NEW errors from touched files"; `npx prettier --write <touched>` then `npx eslint <touched>`; never repo-wide `lint:fix`.
- **#6 (`run_worker_first` / Astro 6 + Cloudflare dev)** — verify the new `/api/*` route + island under both `npm run dev` (hydration) and `npm run build && npx wrangler dev` (Worker routing + middleware).
- **#7 (typed-ESLint `.astro` top-level `return`)** — applies only if S-03 adds an `.astro` page with a frontmatter guard/redirect; the rule is already scoped-off for `**/*.astro` — keep it, don't fight with inline disables.
- **#2 (REPLICA IDENTITY FULL) and #3 (`realtime.setAuth`)** — **S-04 only.** S-03 creates a `queued` row and does not subscribe to Realtime.

## Open Questions

1. **Cloud-path engine abstraction.** Do we widen/keep `ImageEngine` and add a `cloudEngine`, or model the toggle as flow-selection and fork the orchestration (recommended)? The plan must pick one — the interface is synchronous/Blob-centric and cloud is async.
2. **HEIC across the toggle.** Bucket allows `image/heic`; client `validateImageFile` rejects it; `ImageUploader` `accept` lists only jpeg/png. Pick a coherent behavior for the cloud path (reuse `validateImageFile` as-is = reject HEIC; or relax for cloud). Non-blocking; carried from S-01.
3. **Sign-in prompt UX + photo continuity.** No redirect-after-login exists, and the in-browser loaded photo won't survive a full sign-in round-trip. Options: client-side prompt/modal that keeps the photo in memory and only blocks the cloud submit; or a same-origin-validated `returnTo` (rebuilds the affordance, loses the loaded photo). Plus: is there any visible auth affordance on `/` at all (Topbar retired)? Verify current `index.astro`.
4. **One-shot signed-URL retry.** Define the retry UX: a failed PUT must trigger a fresh `create-job` call (new `jobId` + new `queued` row). Decide whether to surface this transparently or as an explicit "retry" affordance, and whether abandoned `queued` rows (PUT never completes) are acceptable in v1 (they are — cleanup is out of scope until S-04/S-05).
5. **`SUPABASE_SERVICE_ROLE_KEY` env wiring.** Confirm it is declared in `astro.config.mjs` `env.schema` (server-only) and present in `.dev.vars` + deployment secrets. F-01 used it, so likely yes — verify during planning.

## Related Research

- `context/archive/2026-05-28-photo-jobs-data-and-storage/research.md` — F-01 data-layer research (storage/RLS/signed upload).
- `context/archive/2026-05-28-local-engine-enhance-flow/research.md` — S-01 UI-shell + engine research.

---

## External Research (2026-05-31)

External-research leg of the planning chain — "what should we do?" Sources: Supabase official docs via Context7 (`/llmstxt/supabase_llms-full_txt`), Supabase JS API reference, the `supabase/storage` server source, and ecosystem write-ups via exa.ai. Confirms the F-01 design and resolves two open questions.

### Signed-upload SDK semantics (authoritative — Supabase docs)

- **`createSignedUploadUrl(path, { upsert? })` requires `service_role`.** Calling it with the anon/SSR key fails. This validates S-03's design: the route must use `createAdminClient` (Lesson #4), never the browser. Source: [Supabase docs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl), [SecureStartKit](https://securestartkit.com/blog/secure-file-uploads-nextjs-supabase-storage-2026) ("the footgun worth naming").
- **The signed URL/token is valid for 2 hours** — not literally expiry-"one-shot". The "single-use" property is enforced differently (see retry below).
- **Upload via HTTP `PUT`** to the signed URL, or via the SDK `uploadToSignedUrl(path, token, fileBody, { contentType })`. **Using `POST` returns 403/400** — a documented footgun ([storage-js#186](https://github.com/supabase/storage-js/issues/186): "You'll need to use PUT instead of POST"). The SDK method is the safer choice for S-03's client.
- **`upsert` only takes effect on `createSignedUploadUrl`, not on `uploadToSignedUrl`** (confirmed in the JS reference). For S-03, leave `upsert: false` — each submit mints a unique path, so overwrite is never wanted.
- **`contentType` must be passed to `uploadToSignedUrl`** so the stored object carries the right MIME; the bucket's `allowed_mime_types` (`image/jpeg|png|heic`) is the server-side backstop.

### Resolves Open Question #4 (one-shot signed-URL retry) ✅

The Supabase storage server's `signUploadObjectUrl` does a **superuser existence check and throws `409 Duplicate` if the object already exists** ([storage source](https://github.com/supabase/storage/blob/003d5f5d/src/http/routes/object/getSignedUploadURL.ts)). But S-03 mints a **fresh `jobId` (UUID) on every `createPhotoJob` call**, so `sourcePath = {userId}/{jobId}/source.{ext}` is **always unique** → a re-mint on a failed PUT can never collide. **Conclusion for the plan:** the retry path is simply "call `create-job` again" → new `jobId`, new `queued` row, new signed URL. No `upsert`, no 409 handling needed. The cost is an abandoned `queued` row + orphaned (never-written) path on a failed PUT — acceptable in v1 (cleanup is S-04/S-05 territory; failed-job source leak is already a documented F-01 limitation).

### Architecture validation — the planned pattern IS the 2026 best practice

[SecureStartKit's "Secure File Uploads" (2026-04)](https://securestartkit.com/blog/secure-file-uploads-nextjs-supabase-storage-2026) describes S-03's exact intended architecture as the **recommended default**:
> "signed upload URLs issued from a Server Action that runs `getUser()`, validates with Zod against a per-bucket schema, generates the object key from the user ID and a UUID, and writes the resulting path to a regular Postgres table that does have RLS policies. … **Authorization decisions ride on the application table, not on storage RLS guesswork.**"

That is precisely F-01 (`jobs` table + storage RLS) + S-03 (auth'd route mints URL, server picks path, zod-validates client metadata). Key reinforcements for the plan:
- **Server picks the path; client never does.** Even a hostile client "can't escape their user prefix, can't exceed the size limit, can't upload a banned MIME type." S-03 already derives `sourcePath` server-side from `user.id` + minted `jobId` — keep it that way; treat `fileExtension`/`mimeType` from the body as *advisory*, zod-validate against the allow-list.
- **Private bucket and RLS are separate switches** — both already set in F-01. Confirmed: a private bucket with *no* `storage.objects` policy is still readable by any authenticated user.
- **Client-direct PUT avoids routing bytes through the Worker** — validates F-01's rationale (`plan.md:33,369`). The Next.js framing is the 4 MB Server-Action limit; the LuminaClean analogue is the Cloudflare Worker request/CPU budget on 25 MB images. Bytes go browser→Supabase directly.

### Error mapping for the route + client (from docs/tutorials)

| Condition | HTTP | Where | S-03 handling |
| --- | --- | --- | --- |
| Unauthenticated cloud submit | 401 | API route | `{ error: { code: "unauthorized", … } }`; UI prompts sign-in |
| Bad/missing `fileExtension`/`mimeType` | 400 | API route (zod) | `{ error: { code: "invalid_body", … } }` |
| File exceeds bucket limit (25 MB) | 413 | Supabase on PUT | surface friendly "too large"; client also pre-checks via `validateImageFile` |
| RLS/token denied | 403 | Supabase on PUT | generic upload-failed; offer retry (re-mint) |
| Object already exists | 409 | Supabase on PUT | **N/A** for S-03 (unique path per job) |
| Expired/malformed token | 400 | Supabase on PUT | re-mint (token valid 2 h, so rare) |

### Retry / resumable — explicitly NOT needed for S-03

- `supabase-js` ≥ v2.102 auto-retries **PostgREST** calls, but **not storage uploads**; a `fetch-retry` wrapper would be required for automatic upload retries ([docs](https://supabase.com/docs/guides/api/automatic-retries-in-supabase-js)). For S-03's single 25 MB image, the simpler **re-mint-on-failure** path above is sufficient — no custom fetch wrapper.
- **Resumable/TUS uploads** (`tus-js-client`, 6 MB chunks, 24 h URL) are Supabase's answer for large/flaky uploads — **overkill for a single ≤25 MB photo** and not in MVP scope. Note for the record in case S-04/v2 revisits large files.

### Still open after external research

- **HEIC across the toggle (Open Question #2)** — external sources don't resolve this; it stays an internal product decision. The bucket allows `image/heic` but the client `validateImageFile` rejects it and `ImageUploader` `accept` lists only jpeg/png. Cheapest coherent v1 behavior: keep rejecting HEIC client-side for both engines (detect-and-reject, as S-01 chose); revisit if iOS friction shows up. No external blocker.
