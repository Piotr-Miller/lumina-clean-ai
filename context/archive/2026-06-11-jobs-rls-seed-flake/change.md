---
change_id: jobs-rls-seed-flake
title: Harden jobs.rls.test.ts seedJob against transient gateway 502
status: archived
created: 2026-06-11
updated: 2026-08-20
archived_at: 2026-08-20T06:44:52Z
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

---

## Implemented 2026-08-19 — and the triage answer changed since this was drafted

Re-opened to decide fix-or-close on a 2.5-month-old draft. **Fix**, and the reason is new: as of today
`integration` is a **required check** under branch protection, so a false failure no longer merely annoys
— it **blocks the merge**. This session watched that exact cost play out twice with the `e2e` flakes.

### What shipped

`withGatewayRetry`, applied to the **four** admin setup inserts (the draft named `seedJob`; the same
exposure exists in the RLS test's inline insert and in `insertProcessingJob`, which is duplicated across
two describe blocks).

**Matched narrowly on purpose.** It retries only the gateway's exact wording — `invalid response was
received from the upstream server` — and nothing else. A retry that swallows any error is how a real
regression gets masked: a unique-violation or an RLS denial must still fail instantly. If a new transient
shape appears it fails loudly, and we learn its signature rather than having it absorbed silently. This
is the same discipline `e2e-webserver-boot-flake` applies to blanket CI retries.

Three attempts, 100 ms linear backoff — the observed failure is a momentary gateway hiccup, not a cold
start, so a long backoff would only slow the suite.

**Scoped to setup.** Assertions about application behaviour stay strict and single-shot.

### One implementation note worth keeping

The helper takes `() => PromiseLike<T>`, not `() => Promise<T>`. supabase-js returns a
`PostgrestFilterBuilder`, which is a **thenable rather than a real Promise**, so a `Promise` signature
rejects every call site with a confusing "missing catch, finally" error.

### Not verified, honestly

The flake has been observed **once**, on 2026-06-11, and has not recurred since. So this is hardening
against a rare event, and **there is no way to confirm the retry works short of the 502 recurring** —
the helper is exercised by every run, but its retry branch is not. That is acceptable for test-setup
hardening; it would not be for application code.
