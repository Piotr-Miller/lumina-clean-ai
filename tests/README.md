# tests/

Integration tests for the LuminaClean foundation. The suite hits a real
local Supabase instance (Postgres + Storage + GoTrue + PostgREST) — it does
**not** mock the Supabase client. The point is to lock in the privacy
guardrails (RLS on `public.jobs`, prefix-keyed RLS on `storage.objects`,
the on-success retention contract in `markJobSucceeded`) against a real
runtime, where a mock would silently miss the very behaviors being asserted.

## Prerequisites

- Docker Desktop running
- `npx supabase` available (already a devDependency)

## Running the tests

### 1. Start local Supabase

```bash
npx supabase start
```

First run pulls images (~1–2 minutes). Subsequent starts are seconds.

When it finishes, `npx supabase status` prints the local URLs and keys:

```
Project URL    http://127.0.0.1:54321
Publishable    sb_publishable_...   ← use this as SUPABASE_KEY
Secret         sb_secret_...        ← use this as SUPABASE_SERVICE_ROLE_KEY
```

(Newer Supabase CLI versions name them "Publishable" / "Secret"; they are
functionally the anon and service-role keys.)

### 2. Apply migrations

```bash
npx supabase db reset
```

This recreates the local database and applies every migration in
`supabase/migrations/`.

### 3. Export the three env vars

**bash / zsh:**

```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_KEY=sb_publishable_...
export SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

**PowerShell:**

```powershell
$env:SUPABASE_URL = "http://127.0.0.1:54321"
$env:SUPABASE_KEY = "sb_publishable_..."
$env:SUPABASE_SERVICE_ROLE_KEY = "sb_secret_..."
```

### 4. Run the suite

```bash
npm test
```

Use `npm run test:watch` during development.

## What the suite covers

`jobs.rls.test.ts` asserts the six privacy and lifecycle guardrails the
F-01 foundation owns:

1. **Cross-user SELECT isolation** — user A cannot read user B's job rows.
2. **Anon INSERT denied** — anonymous JWT cannot insert into `public.jobs`.
3. **Anon Storage read denied** — anonymous JWT cannot download a real
   photo object.
4. **Signed URL is one-shot** — second PUT to the same token fails.
5. **`createPhotoJob` happy path** — inserts the queued row and returns a
   usable signed URL the test then uses to PUT a file.
6. **`markJobSucceeded` retention contract** — updates the row to
   `succeeded` AND deletes the source object in the same call.

## How this runs in CI

This suite **is** wired into CI. The workflow's `integration` job
(`.github/workflows/ci.yml`) boots an **ephemeral local Supabase** on the
runner — the same `npx supabase start` → `npx supabase db reset` → `npm test`
flow documented above — and runs the full suite (including
`jobs.rls.test.ts`) on every push and PR to `master`. No GitHub secrets are
needed: `supabase start` generates the local keys, so the job also runs on
fork PRs. It is a **separate** job from the prod-secret `build`, so the local
credentials it exports can never bleed into the production build. `deploy`
gates on this job passing.

The steps above are still the way to run the suite **locally**.
