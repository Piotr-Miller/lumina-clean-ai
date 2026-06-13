---
change_id: usecloudjob-watchdog-unit
title: Deterministic unit test for useCloudJob's catch-up/re-read decision (R6)
status: impl_reviewed
created: 2026-06-13
updated: 2026-06-13
archived_at: null
---

## Notes

Deterministic unit test for the useCloudJob #6 decision logic (catch-up read after SUBSCRIBED, re-read-before-fail at the queued deadline, idempotent/monotonic out-of-order apply). Closes the test-plan §2 R6 gap ("Unit — watchdog/timing state machine with injected clock + out-of-order events"), which today has no deterministic test (cloud-timings.test.ts covers only budget invariants; cloud-job-render.test.ts only loadCloudResult; the north-star E2E covers the render path only non-deterministically). Likely needs extracting the decision state machine out of the effect closures in src/components/hooks/useCloudJob.ts into a pure reducer so it is testable without React/Realtime mocking. Surfaced by the five-anti-patterns review of the E2E suite (variant B was infeasible — the UI has no resume/deep-link path by jobId, so the catch-up branch can't be forced at the browser level).
