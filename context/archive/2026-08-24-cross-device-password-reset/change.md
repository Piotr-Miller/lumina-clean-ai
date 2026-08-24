---
change_id: cross-device-password-reset
title: "FR-015: make the emailed recovery link work on any device"
status: archived
archived_at: 2026-08-24T09:00:00Z
created: 2026-08-24
updated: 2026-08-24
---

## Notes

Closes the roadmap **Parked** item "Cross-device password reset (PKCE →
non-PKCE emitted token)", deferred from S-06 on 2026-06-03. It delivers the
remainder of **FR-015**.

**The bug:** request a reset on a laptop, open the mail on a phone, and
`/auth/confirm` fails with "invalid or expired" and bounces to
forgot-password. Cause: `@supabase/ssr`'s `createServerClient` **hardcodes
`flowType: "pkce"`** (verified against the library source via Context7 — it
overrides any value the caller passes). PKCE binds the emailed token to a code
verifier held in the requesting browser, so the link mints as
`token_hash=pkce_…` and `verifyOtp` only succeeds in that same browser. This is
the common real-world path, not an edge case.

## Correction to the recorded plan

Both the roadmap and `github-issues` recorded the fix as "switch the send leg
from `resetPasswordForEmail` to admin `generateLink({ type: "recovery" })`",
noting the prerequisite "the app must deliver the email itself" was met
because "custom SMTP/Resend is live on prod".

**That prerequisite is NOT met, and the two facts were conflated.** Resend is
configured as _Supabase's_ SMTP provider — Supabase sends auth mail through it.
The app has no transactional sender of its own: there is no `RESEND_API_KEY` in
`astro.config.mjs`'s env schema or anywhere in `src/` (Resend appears only in
ops docs). `generateLink` does **not** send email, so taking that route would
have required building an outbound-email capability: a Resend API client, a new
prod + CI secret, a template, and delivery-failure handling that preserves the
anti-enumeration invariant. That is a feature, not a bug fix.

The roadmap's _other_ recorded option — "move to a non-PKCE emailed token" —
needs none of that, and is what shipped.

## What changed

- `src/lib/services/password-reset-client.options.ts` (new, env-free):
  `PASSWORD_RESET_CLIENT_OPTIONS` — `flowType: "implicit"` set **explicitly**
  (not left to the library default, which is implicit today) plus
  `persistSession: false` / `autoRefreshToken: false`, since this leg holds no
  session and must not start a refresh timer in a Worker request.
- `src/lib/supabase.ts`: `createPasswordResetClient()` — plain supabase-js,
  anon key, cookie-less, built from those options.
- `src/pages/api/auth/reset-password.ts`: uses it instead of the SSR client.
- `reset-password.handler.ts`: unchanged logic; its `supabase` field now
  documents that an implicit-flow client is required.

The emailed link becomes a plain OTP `hashed_token` — device-portable, exactly
what `scripts/generate-recovery-link.ts` has produced by hand all along. The
`/auth/confirm` `verifyOtp` leg is untouched and becomes strictly more
permissive (it already accepts plain hashes; that is the script's premise).
Supabase still sends the mail through the configured SMTP — **no new secret, no
app-side sender, no email-template change**.

## Verification

- `npm run typecheck` clean; `npm run lint` 0 errors; `npm run test:unit`
  **345 passed** (28 files), including 4 new assertions pinning the flow type.
- New `tests/password-reset-client.options.test.ts` guards the regression
  directly, because it is otherwise **silent**: a reset that reverts to PKCE
  still passes any single-browser test and fails only for the real
  request-on-laptop / read-on-phone case.

**Not verified end-to-end here:** delivering a real reset mail and opening it on
a second device needs the prod project (local Supabase mail goes to Inbucket).
The token-shape change is the whole mechanism and is unit-pinned, but a prod
smoke — request a reset, open the link on a phone, land on set-new-password —
is the honest final confirmation and is not claimed by this change.
