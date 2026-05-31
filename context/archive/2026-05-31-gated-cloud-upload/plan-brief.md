# Gated Cloud AI Submission (S-03) — Plan Brief

> Full plan: `context/changes/gated-cloud-upload/plan.md`
> Research: `context/changes/gated-cloud-upload/research.md`

## What & Why

Let a signed-in user switch the home-page engine toggle to Cloud AI and submit their loaded photo for cloud processing — the source uploads to the private bucket and a `queued` job row is created. Anonymous visitors see the Cloud option but are prompted to sign in (never silently denied). This is the upload boundary of the Cloud AI vertical (roadmap S-03); the async pipeline + Realtime result is S-04.

## Starting Point

The data layer (F-01: `createPhotoJob`, private `photos` bucket, `jobs` table, RLS) and the UI shell (S-01: uploader / before-after slider / download / `validateImageFile`) are done. Auth (S-02) resolves `context.locals.user` on every request; `/` is public. What's missing: the HTTP route (F-01 left "the public shape" to S-03), engine-selection + auth awareness in the workspace, `zod`, and any auth affordance on `/`.

## Desired End State

On `/`, a signed-in user loads a JPG/PNG, toggles to Cloud AI, clicks Submit, and sees a "Submitted for Cloud processing" state; a `queued` row + source object exist. An anonymous visitor toggling to Cloud sees an inline "Sign in to use Cloud AI" panel with the photo still loaded, and has no path — UI or API — to trigger cloud processing. The Local flow is unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Engine abstraction | Fork orchestration (new `useCloudSubmit`), reuse components | `ImageEngine` is sync/Blob-centric; cloud is async submit-then-wait | Research |
| One-shot signed-URL retry | Re-mint (new job) on failure; no upsert/409 handling | Fresh `jobId` per call → unique path → never collides | Research |
| Env wiring | None needed | `SUPABASE_SERVICE_ROLE_KEY` already in `astro.config.mjs:21` | Plan (verified) |
| Sign-in prompt | Inline panel, photo kept in memory | No modal/`returnTo` exists; photo wouldn't survive a redirect | Plan |
| Post-submit state | Distinct "Submitted" state with explanatory note | Honest about S-03's boundary; forward-compatible with S-04 | Plan |
| Engine toggle | Always visible; Cloud gated for anon | Cloud-as-better-option drives sign-ups (FR-006/FR-007 funnel) | Plan |
| HEIC | Keep rejecting (both engines) via `validateImageFile` | One coherent rule; HEIC decoding stays deferred (PRD OQ#1) | Plan |
| Validation | Add `zod`; route validates body per CLAUDE.md | First zod usage; hard rule for JSON API routes | Plan |
| Auth prop to island | Minimal `isAuthenticated` boolean, not `User` | Avoid serializing user data to the client | Plan |
| Testing | Unit on helpers + manual E2E | Cheap-to-test logic isolated; route delegates to tested F-01 code | Plan |

## Scope

**In scope:** `POST /api/enhance/cloud/create-job` (auth-gated, zod-validated, error envelope); add `zod`; engine toggle; inline anon sign-in gate; `useCloudSubmit` hook + extracted upload helper; "Submitted" terminal state; thread `isAuthenticated` into the island; unit tests + manual E2E.

**Out of scope:** Replicate/Edge Function/webhook/Realtime (S-04); cloud result render; daily cap (S-05); `returnTo`/redirect-after-login; HEIC support; modal/toast systems; cleanup of abandoned `queued` rows; Topbar/global nav on `/`.

## Architecture / Approach

Server-mint + client-direct-PUT. The browser POSTs `{ fileExtension, mimeType }` to the route; the route (service-role admin client) calls `createPhotoJob`, which mints a one-shot signed upload URL and inserts the `queued` row, returning `{ jobId, uploadUrl, uploadToken, sourcePath }`. The client then uploads with raw `fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file })` directly to Supabase Storage — bytes never transit the Worker and no browser Supabase client/public env is needed. `userId` is taken server-side from `context.locals.user.id`; the body is advisory and validated against the JPG/PNG allow-list.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Server route | `zod` + auth-gated, validated `create-job` endpoint returning the signed-upload payload | Getting the error envelope / 401 gate exactly right (CLAUDE.md rule, not the auth-route form pattern) |
| 2. Client flow | Auth-aware workspace, always-visible toggle, inline anon gate, `useCloudSubmit` + upload helper, "Submitted" state | Preserving the loaded photo across toggle/gate; correct raw signed-URL PUT (`Content-Type`, status handling) |

**Prerequisites:** F-01 + S-01 (done). `SUPABASE_SERVICE_ROLE_KEY` present in `.dev.vars` for local dev.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- A failed client PUT leaves an abandoned `queued` row + never-written path — accepted v1 limitation (cleanup is S-04/S-05).
- The "Submitted" state shows no enhanced image in S-03 (no S-04 yet) — copy must read as success, not a hang.
- Assumes `createPhotoJob` keeps returning an absolute, token-bearing `uploadUrl` that accepts raw PUT; this is already proven by the existing F-01 tests and smoke script.

## Success Criteria (Summary)

- Signed-in Cloud submit creates a `queued` row + private source object and shows the "Submitted" state.
- Anonymous users see the Cloud option, are prompted to sign in, and cannot reach cloud submission by any path (UI gate + route 401).
- Local engine flow and HEIC rejection are unchanged.
