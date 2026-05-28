---
change_id: photo-jobs-data-and-storage
title: Private photo storage + job records with RLS
status: implementing
created: 2026-05-28
updated: 2026-05-28
review_round: 3
archived_at: null
---

## Notes

Roadmap entry F-01. Establishes the data + storage foundation for the Cloud AI path: a private Supabase Storage bucket, a `jobs` table with per-user RLS, a 24h on-success source-retention contract, a service-role-backed signed-upload helper, and shared entity/DTO types. Not user-visible; unlocks S-03 (gated upload), S-04 (Realtime result), and S-05 (daily cap).

### Implementation notes

- **2026-05-28, Phase 1**: `npm run lint` produces ~1022 pre-existing `Delete ␍` (CRLF) Prettier errors on the Windows checkout, baseline of master. Verified by stashing the Phase 1 changes — error count identical with and without them. SQL migrations are outside ESLint's globs, so Phase 1 contributes zero new errors. Success criterion 1.2 satisfied under the adapted intent "no new lint errors from Phase 1"; baseline CRLF cleanup tracked as a separate concern (out of F-01 scope).
- **2026-05-28, Phase 1 (grants tightening)**: First migration draft used `grant select, insert on public.jobs to authenticated;` and relied on the absence of an explicit `grant ... to anon` to mean "anon has nothing". Schema verification (psql) found that Supabase's bootstrap applies blanket SELECT/INSERT/UPDATE/DELETE/REFERENCES/TRIGGER/TRUNCATE to `anon`, `authenticated`, **and** `service_role` on tables created in `public` by default — the explicit grant line is additive, not displacing. The anon sanity check still passed (RLS blocked the INSERT with code 42501), but the plan's intent was defense-in-depth (no anon grants at all). Migration now does `revoke all on public.jobs from anon, authenticated, service_role;` then `grant select, insert ... to authenticated;`. After the revoke, anon SELECT also fails at the grant layer (HTTP 401 `permission denied for table jobs`) before RLS evaluates — two independent gates instead of one. Worth capturing as a recurring rule for any future migration in this repo (see lessons backlog).
