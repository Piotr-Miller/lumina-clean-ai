# Photo Jobs Data and Storage — Plan Brief

> Full plan: `context/changes/photo-jobs-data-and-storage/plan.md`

## What & Why

Establish the private data + storage foundation for LuminaClean's Cloud AI path — a `jobs` table with per-user RLS, a private `photos` Storage bucket, signed-upload capability, and an on-success retention contract. Not user-visible on its own; it unlocks S-03 (gated upload), S-04 (Realtime result delivery), and S-05 (daily cap). The roadmap places it first because RLS correctness and bucket privacy must be right before any cloud upload path touches them — getting this wrong is the most expensive thing to discover late.

## Starting Point

The repo has the SSR auth surface in place (`src/lib/supabase.ts`, `src/middleware.ts`) and the Workers deploy config tuned (per `infrastructure.md`), but no application tables, no Storage bucket, no `src/types.ts`, no `src/lib/services/`, no service-role wiring, and no test framework. `supabase/migrations/` is empty. The `supabase` CLI (2.23.4) is already a devDependency.

## Desired End State

A privacy-correct `jobs` table (states: `queued | processing | succeeded | failed`, RLS scoped to `auth.uid()`, in the `supabase_realtime` publication) and a private `photos` Storage bucket with prefix-as-RLS coexist with a typed `photo-job.service.ts` helper that mints one-shot signed upload URLs and enforces the ≤24h source-retention NFR via `markJobSucceeded`. An automated Vitest suite locks the privacy guardrails into a regression net, and a manual end-to-end smoke proves the contract holds through the real runtime (Realtime included).

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| F-01 vs S-03 scope boundary | Data + bucket + internal signed-URL helper (no HTTP route) | Keeps F-01 a pure foundation but lets it prove signed-upload capability end-to-end | Plan |
| Status lifecycle | `queued → processing → succeeded \| failed` (4 states) | Cleanly separates the three async hand-offs S-04's pipeline must observe | Plan |
| RLS shape | Authenticated SELECT/INSERT own rows; UPDATE/DELETE via service-role | Matches the async-pipeline write pattern and the granular-policy hard rule | Plan |
| Storage layout | Single `photos` bucket, `{user_id}/{job_id}/source\|result.{ext}` | One bucket = one RLS surface to audit; the `{job_id}` subprefix groups artifacts for retention cleanup | Plan |
| 24h source retention | Delete-on-success inside `markJobSucceeded` (no pg_cron in MVP) | Reconciles the PRD NFR with the `idea-notes.md` pg_cron deferral; failed-job sources are a documented operator-cleanup item | Plan |
| Signed-upload mechanism | `createSignedUploadUrl` (server-mint, client direct PUT) | Keeps service-role key server-side; avoids Worker body-size + CPU limits flagged in `infrastructure.md` | Plan |
| Daily-cap data shape | Partial index on `(created_at)` — S-05 counts rows directly | Zero extra schema; matches the roadmap's "cap counts rows on RLS-gated table" framing | Plan |
| Service-role wiring | New `SUPABASE_SERVICE_ROLE_KEY` env field + `createAdminClient()` factory | Aligns with the established `astro:env/server` secret pattern | Plan |
| Realtime publication | Add `public.jobs` in the F-01 migration | RLS + publication form one atomic privacy fact; surfaces interaction bugs in this change | Plan |
| Verification depth | Automated RLS tests (local Vitest) + manual signed-URL/Realtime smoke | Locks privacy guardrails into a regression net without committing to hosted-Supabase CI | Plan |

## Scope

**In scope:**
- `jobs` table + indexes + RLS + Realtime publication migration
- Private `photos` bucket + storage.objects RLS migration
- `SUPABASE_SERVICE_ROLE_KEY` env declaration + `createAdminClient()` factory
- `src/types.ts` with `PhotoJob`, `PhotoJobStatus`, and the three DTOs
- `src/lib/services/photo-job.service.ts` with `createPhotoJob()` and `markJobSucceeded()`
- Vitest harness + RLS + signed-URL integration tests
- `scripts/f01-smoke.ts` end-to-end smoke (including Realtime)

**Out of scope:**
- `/api/jobs` or any other HTTP route (S-03 owns the public shape)
- Any upload UI, engine toggle, slider, or download (S-01/S-03/S-04)
- pg_cron / scheduled retention cleanup (deferred per `idea-notes.md`)
- Failed-job source cleanup (documented v1 limitation)
- Per-user rate limiting (deferred to v2)
- Hosted-Supabase CI integration; tests are local-only
- Edge Function, Replicate, Database Webhook (all S-04)
- Daily-cap enforcement logic (S-05)
- History UI (deferred to v2)
- Magic-bytes file validation (bucket-level mime-type + size limits still apply)

## Architecture / Approach

```
[Astro Worker]                            [Supabase]
  createPhotoJob() ──signed-URL mint────> Storage.photos  (private, prefix-RLS)
  (admin client)   ──insert queued row──> public.jobs     (RLS: user SELECT/INSERT own)
                                            │
[Client]  ──PUT file to signed URL──────> Storage.photos/{uid}/{jid}/source.{ext}
                                            │
[S-04 Edge Fn]   ──markJobSucceeded─────> UPDATE jobs.status='succeeded'
  (admin client)                          DELETE Storage.photos/.../source.{ext}
                                            │
[Client (user JWT)] ◄──Realtime push──── public:jobs (RLS-filtered subscription)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB schema + RLS + Realtime | `jobs` table, statuses, indexes, publication | RLS policy too permissive (cross-user leak) |
| 2. Storage bucket + storage RLS | Private `photos` bucket with prefix-RLS | Anon policy accidentally granted |
| 3. Service-role wiring + types + service | `createAdminClient()`, `src/types.ts`, `photo-job.service.ts` | Admin client misused on a user-input path |
| 4. Vitest + RLS/signed-URL tests | Regression net for the privacy guardrails | Tests need local Supabase; setup friction for new contributors |
| 5. Manual end-to-end smoke | Real-runtime proof including Realtime | Realtime row-filtering subtleties surface only under user JWT |

**Prerequisites:** local Docker (for `npx supabase start`); the Supabase CLI is already a devDependency.
**Estimated effort:** ~1–2 after-hours sessions across the five phases (most of the work is in Phase 4's test-harness setup, since none exists yet).

## Open Risks & Assumptions

- **Failed-job source cleanup is a documented v1 limitation.** The on-success path is the only cleanup; failed jobs leak source until manual operator action. Re-evaluate alongside the Admin role in v2.
- **`createSignedUploadUrl` is one-shot.** A client retry requires a new mint; S-03 must plan its retry UX accordingly (documented in the helper's JSDoc).
- **Tests are local-only.** A future migration that relaxes RLS won't be caught by CI; relies on the developer running `npm test` locally before merging.
- **Realtime row-filtering under user JWT** is correct in current Supabase Realtime but is the kind of guarantee that needs the Phase 5 smoke to actively re-verify after any major upgrade.

## Success Criteria (Summary)

- A signed-in user can have a job row + signed-URL upload created on their behalf, and only they can SELECT it
- Anonymous URL guessing cannot retrieve any uploaded source
- When a job is marked `succeeded`, the source object is deleted in the same call
- A user-JWT-scoped Realtime subscription receives the row update within ~1–2 seconds
