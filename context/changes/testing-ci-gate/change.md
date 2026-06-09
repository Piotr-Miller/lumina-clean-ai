---
change_id: testing-ci-gate
title: Gate the floor — wire the existing Vitest suite (incl. Docker/RLS) into CI
status: implementing
created: 2026-06-09
updated: 2026-06-09
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Gate the floor — wire existing suite into CI".
Risks covered: #1 (silent cloud stall), #4 (IDOR), #5 (failed/abandoned source not deleted), #6 (Realtime watchdog false-fail/never-render) — this phase is a REGRESSION LOCK on coverage that already exists in tests/, not new test logic.
Test types planned: CI wiring only (no new test logic) — run the existing 11 Vitest files on every push, including the Docker/RLS integration suite via an ephemeral or hosted Supabase for CI; consider adding a `deno check` step for supabase/functions/**.
Risk response intent:
- #1: the existing replicate-webhook + watchdog/timing tests must run in CI so the silent-stall guardrails cannot regress unnoticed.
- #4: the jobs.rls + photo-job.service tests (owner-scoping / RLS) must run in CI.
- #5: the jobs.rls retention-contract test (markJobSucceeded source delete) must run in CI against a real Supabase.
- #6: the cloud-timings + cloud-job-render watchdog tests must run in CI.
The constraint to ground: tests/jobs.rls.test.ts needs Docker + a live Supabase (the suite deliberately does NOT mock the client); CI today (.github/workflows/ci.yml) runs only lint+build. The user chose to wire the FULL suite (RLS included) into CI.
After creating the folder, follow the downstream continuation rule (suggest /10x-research next).
