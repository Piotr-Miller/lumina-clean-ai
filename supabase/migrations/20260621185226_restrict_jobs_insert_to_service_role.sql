-- Jobs are created only through the server-side createPhotoJob flow, which
-- uses service_role. Keep authenticated access read-only so clients cannot
-- forge lifecycle state or server-owned audit fields such as model_version.

drop policy if exists jobs_insert_own on public.jobs;
revoke insert on public.jobs from authenticated;
