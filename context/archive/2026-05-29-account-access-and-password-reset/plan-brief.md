# Account Access — Email-Based Password Reset — Plan Brief

> Full plan: `context/changes/account-access-and-password-reset/plan.md`

## What & Why

Sign-up, sign-in, and sign-out already work; the one missing piece of account access is password recovery (FR-015). Without it, a forgetful user is locked out forever — a churn risk the PRD explicitly called out. This slice adds an email-based forgot-password → reset flow and verifies the credential-stuffing NFR.

## Starting Point

The repo has a working SSR Supabase auth setup: a cookie-based `createClient`, middleware that resolves `locals.user`, three form-POST→redirect auth endpoints, and React auth forms built on shared `FormField`/`SubmitButton`/`ServerError` primitives. No password-reset route, no recovery email template, and no usage of `resetPasswordForEmail`/`verifyOtp`/`updateUser` exist yet.

## Desired End State

A user who forgot their password clicks "Forgot password?" on sign-in, enters their email, receives a recovery email, clicks the link (which establishes a recovery session server-side), sets a new password, and is auto signed-in and dropped on the home page. Invalid or expired links route back to request a fresh one, and the request step never reveals whether an email is registered.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| API/error pattern | Match existing form-POST → redirect-`?error` (not zod/JSON) | These are browser form handlers like signin/signup; the API hard rule targets JSON APIs | Plan |
| Recovery token mechanism | `token_hash` + `verifyOtp` at a new `/auth/confirm` route | Supabase's documented SSR pattern; server-consumable, no client hash parsing | Plan |
| Production email | Plan a phase for custom SMTP (e.g. Resend) | Built-in email is rate-capped (~2-4/hr) and unreliable for prod reset delivery | Plan |
| Email template | Minimal custom recovery template only | Required for the token_hash link to target our confirm route; avoids scope creep | Plan |
| Email enumeration | Always generic success | Prevents enumeration; standard security practice | Plan |
| Post-reset behavior | Auto sign-in → redirect to `/` | Recovery session becomes a full session after updateUser; smoothest UX | Plan |
| Extra scope | Reset flow only (no logged-in change-pw, no signup confirmation) | Matches roadmap S-02; keeps the slice tight | Plan |
| Rate limiting | Rely on Supabase built-in limits; verify + document | No app code; per-user limiting parked to v2 | Plan |
| Password rules | Match signup (min 6) | Consistent with existing signup + `minimum_password_length` | Plan |
| Testing | Manual via inbucket + light unit tests | Matches repo's low-ceremony posture; covers the real email loop | Plan |

## Scope

**In scope:** forgot-password request page + endpoint; recovery email template + redirect-allowlist config; `/auth/confirm` token verification; set-new-password page + endpoint; "Forgot password?" link; production SMTP config; credential-stuffing NFR verification.

**Out of scope:** logged-in "change password"; signup email-confirmation toggle; app-layer rate limiting; zod/JSON refactor of existing endpoints; automated E2E harness; full branded template set; OAuth/magic-link.

## Architecture / Approach

Two HTTP legs over the existing auth pattern. **Leg 1 (request):** `forgot-password.astro` → `ForgotPasswordForm` → POST `/api/auth/reset-password` → `resetPasswordForEmail(email)` (no `redirectTo` — the template owns the destination), always generic success. The recovery email (custom template) links to `/auth/confirm?token_hash=…&type=recovery&next=/auth/reset-password`. **Leg 2 (consume):** `/auth/confirm.ts` runs `verifyOtp` (sets session cookies) → `reset-password.astro` (guarded on the recovery session) → `ResetPasswordForm` → POST `/api/auth/update-password` → `updateUser({ password })` → redirect to `/` signed in. All endpoints reuse `createClient(headers, cookies)` so the session flows automatically; all forms reuse the shared form primitives + `bg-cosmic` shell.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Request leg + email wiring | Forgot-password page/form/endpoint + recovery template; correctly-linked email in inbucket | `site_url` must point at the live dev origin (set to `:4321`) or `{{ .SiteURL }}` is dead |
| 2. Confirm + set-new-password leg | `/auth/confirm` verifyOtp + set-password page/form/endpoint; full local loop works | Recovery-session timing; expired/used-link handling |
| 3. Production email + NFR | Custom SMTP + mirrored template; documented rate-limit verification | External SMTP provider provisioning + domain verification |

**Prerequisites:** none for Phases 1–2 (local Supabase + inbucket). Phase 3 needs an SMTP provider account + verified sender domain and Supabase dashboard access.
**Estimated effort:** ~2 sessions across 3 phases (Phases 1–2 are the bulk; Phase 3 is config + verification).

## Open Risks & Assumptions

- `site_url` must match the real dev origin — Phase 1 sets it to `http://127.0.0.1:4321` (the astro dev default); the template hardcodes `next`, so no path allowlisting is needed.
- The reset endpoint always shows generic success, so a user who exceeds the global `email_sent` rate cap gets no email and no signal (swallowed error is logged server-side); prod SMTP limits must have headroom — verified in Phase 3.
- Assumes the custom recovery template renders correctly in both `config.toml` (local) and the production dashboard, kept in sync by hand.
- Assumes Supabase's built-in rate limits satisfy the credential-stuffing NFR for MVP volumes (revisit if abuse appears).

## Success Criteria (Summary)

- A user who forgot their password can request a link, set a new password, and end up signed in — end-to-end, verified locally via inbucket and in production via real SMTP.
- The request step never discloses whether an email is registered; expired/used links guide the user to request a fresh one.
- The credential-stuffing NFR holds (rapid wrong attempts throttled without locking out a legit user) and the rate-limit posture is documented.
