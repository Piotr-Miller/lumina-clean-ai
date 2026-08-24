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

> ⚠️ **Read "Post-merge smoke" at the bottom before citing this section.** The
> premise below is the one this change was written against, and the smoke
> DISPROVED it on the current stack: a `pkce_` token verifies cross-device fine
> today. What remains true is the mechanism (SSR forces PKCE; the fix emits a
> portable token); what is NOT true is that a reproducible user-facing bug was
> fixed.

**The premise (as recorded, since disproved):** request a reset on a laptop,
open the mail on a phone, and `/auth/confirm` fails with "invalid or expired"
and bounces to forgot-password. Cause: `@supabase/ssr`'s `createServerClient`
**hardcodes `flowType: "pkce"`** (verified against the library source via
Context7 — it overrides any value the caller passes; this part still holds).
PKCE binds the emailed token to a code verifier held in the requesting browser,
so the link mints as `token_hash=pkce_…` — and the claim was that `verifyOtp`
then succeeds only in that same browser.

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

**Not verified end-to-end at merge time:** see the post-merge smoke below, which
closed this — and corrected the premise.

## Post-merge smoke (2026-08-24) — the premise was STALE

Run with `scripts/local-reset-smoke.ts` against the local stack: it sends a real
recovery mail per client configuration, reads the token out of Mailpit, and
verifies it from a **fresh `createServerClient` with an empty cookie jar** —
which is exactly what `/auth/confirm` builds, and exactly what a second device
has.

| Arm                                                           | Result                                            |
| ------------------------------------------------------------- | ------------------------------------------------- |
| A — SSR send (pre-fix path)                                   | emits `pkce_…` — **device-bound token confirmed** |
| B — fixed send                                                | emits a plain hash — **portable token confirmed** |
| C — verify B from a fresh SSR client                          | no error, **usable session**, correct user        |
| D — CONTROL: verify A's `pkce_` token from a fresh SSR client | **no error, session PRESENT, correct user**       |

**Arm D is the finding.** The archived S-06 note (and this change's own premise)
held that a `pkce_` token fails `verifyOtp` on another device. On the current
stack it does **not**: the pre-fix token verifies cross-device and returns a
full session. So the user-facing bug this change was written to fix **does not
reproduce today** — GoTrue/supabase-js evidently now accept a `pkce_` hashed
token without the code verifier.

**Why the change still stands (not reverted):**

- It is a genuine simplification: the send leg no longer needs cookies, a
  session, or the PKCE machinery it never used.
- It makes portability **explicit** instead of depending on GoTrue continuing to
  be lenient about verifier-free `pkce_` verification — a behaviour we do not
  control and which arm D shows has already changed once.
- Arms B and C prove the shipped path works end-to-end. Nothing regressed.

**What must NOT be claimed:** that this fixed a reproducible user-facing bug.
The honest statement is that it removes a fragile coupling and makes the
emitted token portable by construction.

**Caveat:** this measured the LOCAL stack. Hosted GoTrue may run a different
version, so prod could still behave as the original diagnosis described. Re-run
arm D's reasoning there if the question ever matters; the expected result on the
current evidence is "both work".
