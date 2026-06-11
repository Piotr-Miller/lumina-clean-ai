---
change_id: jobs-rls-seed-flake
title: Harden jobs.rls.test.ts seedJob against transient gateway 502
status: new
created: 2026-06-11
updated: 2026-06-11
archived_at: null
issue: 19
---

## Notes

`tests/jobs.rls.test.ts` intermittently fails in its **setup** (not an app-logic
assertion). `seedJob` does `await supabaseAdmin.from("jobs").insert(row)` then
`expect(error).toBeNull()` (line 301); against the ephemeral local Supabase stack
the insert occasionally returns a Kong/PostgREST 502
(`{ message: "An invalid response was received from the upstream server" }`), and
the helper has no retry tolerance, so the whole suite false-fails.

Transient infra flake, not a regression: 112/113 tests passed, the failure is in
the test's own data setup against the live stack, and it did not recur on re-run.

- GitHub issue: [#19](https://github.com/Piotr-Miller/lumina-clean-ai/issues/19)
- First seen: run [27338381004](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/27338381004) (PR #18, a docs-only change — environment, not code); passed on re-run.

## Proposed fix

Add a small bounded retry/backoff around the admin **setup** inserts in `seedJob`
(and sibling setup ops that hit the gateway) so a transient 502 during seeding
doesn't false-fail the suite. Keep it scoped to setup — assertions about app
behavior stay strict.

This is test code (Lesson 2 territory), deliberately deferred from the Lesson 3
hooks work where the flake surfaced. Non-roadmap maintenance chore.
