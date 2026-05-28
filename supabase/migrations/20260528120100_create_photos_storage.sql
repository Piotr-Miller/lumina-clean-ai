-- Migration: create the private 'photos' Storage bucket and RLS policies on
-- storage.objects that scope reads and writes to {user_id}/... prefixes.
--
-- Privacy invariants this migration is responsible for:
--   * The 'photos' bucket is not public; anon cannot read or write any object.
--   * An authenticated user can only read/write/update/delete objects whose
--     first path segment equals their auth.uid() (the {user_id}/ prefix).
--   * The bucket enforces a 25 MB size cap and a JPG/PNG/HEIC mime-type
--     allowlist so a misbehaving client cannot upload arbitrary blobs.
--   * Source-object cleanup on successful processing runs via the service-role
--     key in photo-job.service.ts (markJobSucceeded) and bypasses these RLS
--     policies by design.
--
-- See: context/changes/photo-jobs-data-and-storage/plan.md (Phase 2).

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------
-- Idempotent insert in case the bucket already exists from a manual create
-- (e.g., during local exploration). The settings here are authoritative.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,
  25000000,
  array['image/jpeg', 'image/png', 'image/heic']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- RLS policies on storage.objects
-- ---------------------------------------------------------------------------
-- storage.objects already has RLS enabled by the Supabase bootstrap.
-- Each policy is scoped to the 'photos' bucket and requires the first folder
-- segment of the object name to equal the caller's auth.uid().
--
-- (storage.foldername(name))[1] returns the first path segment of the object
-- name (e.g., for '<uid>/<jobid>/source.jpg' it returns '<uid>'). This is the
-- standard Supabase prefix-as-RLS pattern.

create policy photos_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy photos_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy photos_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy photos_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Deliberately NO policies for the anon role.
-- Service-role bypasses RLS, so the markJobSucceeded source-delete works
-- without an explicit policy here.
