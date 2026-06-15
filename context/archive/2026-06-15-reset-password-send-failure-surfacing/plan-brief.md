# Surface password-reset send failures — Plan Brief

> Full plan: `context/changes/reset-password-send-failure-surfacing/plan.md`

## What & Why

`POST .../auth/reset-password` swallows every `resetPasswordForEmail` failure — it logs the error but always redirects to `?sent=1`, so a user whose reset email failed to send (rate-limit, SMTP error, misconfig) is told "check your inbox" when nothing was sent. We surface a neutral, enumeration-safe error on the failure branch instead.

## Starting Point

The route's generic-success redirect is a deliberate anti-enumeration measure (don't reveal which emails have accounts). But it over-swallows: per Supabase docs, `resetPasswordForEmail` returns **no error for unknown emails**, so a returned error is always an account-independent infra failure — safe to surface neutrally. The page (`forgot-password.astro`) already renders `?error=`, so the UX surface exists.

## Desired End State

A failed send re-renders the forgot-password form with a neutral, retry-able message ("We couldn't send the reset email right now. Please try again in a few minutes."); a normal or unknown-email request still shows the neutral `?sent=1` view. The branch decision is covered by a hermetic unit test.

## Key Decisions Made

| Decision              | Choice                                                  | Why                                                                                                                  | Source            |
| --------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Test layer            | Extract env-free core + hermetic unit test              | Route can't load under Vitest (`@/lib/supabase` pulls `astro:env`, Lesson #4); mirrors `cloud-create-job.handler.ts` | Plan              |
| Error copy            | One fixed neutral string, retry-worded                  | Enumeration-safe (identical for any email); fits the common rate-limit cause                                         | Plan              |
| Not-configured branch | Same neutral message as send-error                      | User can't act differently on either; a second string adds surface for no benefit                                    | Plan              |
| Page changes          | None                                                    | `forgot-password.astro:5,30` already renders `?error=` and a neutral `?sent=1`                                       | Change            |
| Enumeration safety    | No `error.message` pass-through; success path unchanged | Supabase returns no error for unknown emails, so output stays uniform                                                | Change + Context7 |

## Scope

**In scope:** new `reset-password.handler.ts` env-free core; thin the `reset-password.ts` route; neutral `?error=` on failure/not-configured; hermetic unit test.

**Out of scope:** page/form changes; distinguishing failure causes; echoing `error.message`; other auth routes; E2E.

## Architecture / Approach

Route = thin env shell (reads `astro:env`, builds the supabase client, calls `context.redirect`). Core = pure `({ supabase, request }) → redirect-path string`, returning `?sent=1` only on a clean send and `?error=<neutral>` on any error or null client. Test drives the core with a stub client.

## Phases at a Glance

| Phase                                               | What it delivers                                       | Key risk                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1. Surface send failures via a tested env-free core | Neutral error on failed sends + hermetic 3-branch test | Accidentally weakening anti-enumeration (mitigated: one fixed string, no `error.message`, success path unchanged) |

**Prerequisites:** none.
**Estimated effort:** ~1 session, single phase.

## Open Risks & Assumptions

- Assumes Supabase continues to return no error for unknown emails (current documented behavior); if that ever changes, the success/error split would need re-checking against enumeration.
- Assumes `forgot-password.astro`'s `?error=` rendering reads acceptably for a transient failure (it currently shows `serverError` above the form).

## Success Criteria (Summary)

- Failed send → neutral, retry-able error (no false "sent"); normal/unknown-email → `?sent=1`.
- `?error=` carries only the fixed neutral string.
- Hermetic test asserts all three branches + no message leakage and passes under `npm run test:unit`.
