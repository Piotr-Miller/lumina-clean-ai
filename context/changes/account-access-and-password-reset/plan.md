# Account Access — Email-Based Password Reset Implementation Plan

## Overview

Add the missing email-based password-reset flow (FR-015) to complete the account-access capability (S-02). Sign-up, sign-in, and sign-out already work; this plan delivers a two-legged reset flow — (1) a user requests a reset link by email, (2) the link establishes a recovery session and the user sets a new password — built over the existing form-POST → redirect auth pattern, then hardened for production with custom SMTP and a credential-stuffing NFR verification.

## Current State Analysis

The baseline auth is partial (per `context/foundation/roadmap.md` Baseline):

- **SSR client** (`src/lib/supabase.ts`) — `createClient(headers, cookies)` via `@supabase/ssr` `createServerClient` with a cookie adapter (`parseCookieHeader` in, `cookies.set` out). Returns `null` if env unset. No `flowType`, no `emailRedirectTo` configured.
- **Middleware** (`src/middleware.ts`) — resolves `context.locals.user` via `supabase.auth.getUser()` on every request; redirects to `/auth/signin` only for `PROTECTED_ROUTES = ["/dashboard"]`. `/auth/*` is open.
- **Auth API endpoints** (`src/pages/api/auth/{signin,signup,signout}.ts`) — parse raw `formData()`, call a `supabase.auth.*` method, and on error **redirect back with `?error=<message>`**, on success redirect to a page. No zod, no JSON envelope.
- **Auth pages** (`src/pages/auth/{signin,signup,confirm-email}.astro`) — static Astro shells hosting hydrated React forms (`client:load`). `confirm-email.astro` branches on `import.meta.env.DEV` for an auto-confirmed message.
- **React auth components** (`src/components/auth/`) — `SignInForm`, `SignUpForm`, and shared `FormField`, `SubmitButton` (uses React 19 `useFormStatus`), `ServerError`, `PasswordToggle`. Forms submit via plain `method="POST" action="/api/auth/..."`, with `useState` client validation (regex email, min-6 password) that `preventDefault`s on invalid input.
- **Supabase config** (`supabase/config.toml`) — `[auth].site_url = "http://127.0.0.1:3000"`, `additional_redirect_urls = ["https://127.0.0.1:3000"]`, `minimum_password_length = 6`; `[auth.email].enable_confirmations = false`, `max_frequency = "1s"`, `otp_expiry = 3600`; `[auth.rate_limit].email_sent = 2` (per hour), `sign_in_sign_ups = 30`. Inbucket email-testing UI on `:54324`. All email templates are commented-out defaults.
- **Env** (`astro.config.mjs`) — `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are all server-only optional secrets. No `SITE_URL`/public URL var.
- **Production** — deployed Worker at `https://lumina-clean-ai.pmiller-software.workers.dev`; Supabase dashboard URL config points there. No production SMTP configured.

**No usages exist** of `resetPasswordForEmail`, `verifyOtp`, `exchangeCodeForSession`, `updateUser`, or `emailRedirectTo` anywhere in the repo — this flow is entirely new.

## Desired End State

A visitor who forgot their password can:

1. Click "Forgot password?" on the sign-in page → land on a forgot-password page.
2. Enter their email → always see a generic "if an account exists, we've sent a link" confirmation (no enumeration).
3. Receive an email (inbucket locally; real SMTP in prod) whose link targets `/auth/confirm?token_hash=…&type=recovery&next=/auth/reset-password`.
4. Click it → the recovery session is established server-side via `verifyOtp` → they land on a set-new-password page.
5. Enter and confirm a new password (min 6) → it is saved via `updateUser` → they are auto signed-in and redirected to `/`.
6. An invalid/expired/used link routes them back to forgot-password with a clear `?error` prompting a fresh request.

Verify by completing the full loop against local inbucket, and by confirming the production reset email delivers via the configured SMTP provider.

### Key Discoveries:

- The repo's auth endpoints deviate from the CLAUDE.md API hard rule by design (form handlers, not JSON APIs) — `src/pages/api/auth/signin.ts:1`. New endpoints match this, not the rule.
- Supabase's documented SSR reset pattern is `token_hash` + `verifyOtp({ token_hash, type: 'recovery' })` at a server confirm route, which **requires a custom recovery email template** pointing at that route (Context7: `/supabase/supabase`, `apps/docs/.../passwords.mdx`).
- Local auth URL config currently points at the wrong origin (`site_url = "http://127.0.0.1:3000"`, `additional_redirect_urls = ["https://127.0.0.1:3000"]`), while `astro dev` serves on `http://127.0.0.1:4321`. Phase 1 reconciles this by setting the local origin to `http://127.0.0.1:4321`; because the recovery template hardcodes `next=/auth/reset-password`, this reset flow does **not** require a path-specific `/auth/reset-password` Supabase redirect allowlist entry.
- The set-new-password page is **not** a `PROTECTED_ROUTE`; it must self-guard on the recovery session (`Astro.locals.user`) rather than rely on middleware.
- Built-in rate limits already exist in `config.toml` (`email_sent = 2/hr`, `sign_in_sign_ups = 30`) — the NFR is satisfied by verifying and documenting these, not by new code.

## What We're NOT Doing

- **No logged-in "change password"** form (updateUser while already authenticated) — out of FR-015 scope.
- **No signup email-confirmation toggle** — `enable_confirmations` stays `false`; existing signup behavior unchanged.
- **No app-layer rate limiting** — per-user/per-IP throttling is parked to v2; we rely on Supabase's provider-level limits.
- **No zod/JSON refactor** of existing auth endpoints — the new endpoints match the existing form-POST pattern.
- **No automated E2E (Playwright) harness** — none exists; introducing one is out of scope.
- **No full branded template set** — only the recovery template is customized.
- **No OAuth/social login**, no magic-link passwordless sign-in.

## Implementation Approach

Build the flow as two HTTP legs that mirror the proven signup→confirm-email shape, plus a production-hardening phase:

- **Leg 1 (request):** `forgot-password.astro` → `ForgotPasswordForm` (React) → POST `/api/auth/reset-password` → `supabase.auth.resetPasswordForEmail(email)` → always redirect to a generic confirmation. The recovery email template owns the destination and carries a `token_hash` link to `/auth/confirm?token_hash=…&type=recovery&next=/auth/reset-password`.
- **Leg 2 (consume):** `/auth/confirm.ts` GET handler validates the recovery link and runs `verifyOtp({ token_hash, type: "recovery" })`, which sets the session cookies via the SSR adapter, then redirects to `/auth/reset-password`. That page (guarded on the recovery session) hosts `ResetPasswordForm` → POST `/api/auth/update-password` → server-side password/confirm validation → `supabase.auth.updateUser({ password })` → redirect to `/` (now fully signed in).
- **Hardening:** configure custom SMTP + mirror the template in the production dashboard; verify and document the credential-stuffing rate-limit posture.

Each new endpoint reuses `createClient(context.request.headers, context.cookies)` so cookies (and thus the recovery session) flow automatically. Each new form reuses `FormField`, `SubmitButton`, `ServerError`, `PasswordToggle`, and the dark `bg-cosmic` page shell.

## Critical Implementation Details

**`site_url` correctness (load-bearing — the email link breaks silently if wrong).** The recovery email's link is built from `{{ .SiteURL }}/auth/confirm?...&next=/auth/reset-password` with the `next` path **hardcoded in the template**. So the only Supabase-side requirement is that `[auth].site_url` resolves to the origin where the app actually serves — the post-confirm `next` is an internal app redirect, not a Supabase `.RedirectTo`, and needs no path-specific `additional_redirect_urls` entry. **Dev-port resolution:** `astro dev` serves on `4321` (no `--port` override in the `dev` script), but `site_url` is currently `http://127.0.0.1:3000`. Phase 1 #1 sets `site_url`/`additional_redirect_urls` to `http://127.0.0.1:4321` to match the running dev server, so `{{ .SiteURL }}` resolves to a live origin.

**Recovery-session timing.** `verifyOtp` at `/auth/confirm` is what establishes the session — only after it succeeds does `Astro.locals.user` populate on the subsequent request. The set-new-password page therefore guards on `Astro.locals.user` (redirect to forgot-password if absent), and `/api/auth/update-password` relies on that same cookie session being present when it calls `updateUser`.

## Phase 1: Request-reset leg + Supabase email wiring

### Overview

Stand up the "I forgot my password" entry point: the Supabase config/template that makes the recovery email point at our confirm route, the request page + form, the endpoint that sends the email, and the sign-in link that gets users there. End state: requesting a reset deposits a correctly-linked email in inbucket.

### Changes Required:

#### 1. Supabase auth config + recovery email template

**File**: `supabase/config.toml`

**Intent**: Make recovery emails link to our server confirm route and ensure `{{ .SiteURL }}` resolves to the running local app, so the `token_hash` flow works locally against inbucket.

**Contract**: Under `[auth]`, set `site_url = "http://127.0.0.1:4321"` (the `astro dev` default port) and update `additional_redirect_urls` to the same `http://127.0.0.1:4321` origin (the current `https://127.0.0.1:3000` is wrong in scheme and port). The redirect **allowlist does NOT need the `/auth/reset-password` path** — the template hardcodes `next`, so only `{{ .SiteURL }}` resolution matters. Add an `[auth.email.template.recovery]` section pointing the link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password`. Template body can be inline `content` or a `content_path` to a new file under `supabase/templates/`.

#### 2. Reset-request API endpoint

**File**: `src/pages/api/auth/reset-password.ts`

**Intent**: Send the recovery email for the submitted address, always redirecting to a generic success regardless of whether the account exists (no enumeration).

**Contract**: `export const prerender = false; export const POST: APIRoute`. Reads `email` from `formData()`, builds `createClient(...)`, calls `supabase.auth.resetPasswordForEmail(email)` — **no `redirectTo` arg**: the recovery email template (change #1) hardcodes the post-confirm `next` target, so Supabase's `.RedirectTo` and the redirect allowlist are not involved in this flow. On any outcome (success, error, or unset client) redirect to `/auth/forgot-password?sent=1` — do NOT branch the user-visible result on the error. **Log the swallowed error server-side** (e.g. `console.error`) so a rate-limited or misconfigured send is observable even though the user always sees generic success. Note the deliberate tradeoff: under the global `email_sent = 2/hr` cap, a legitimate 3rd reset request in an hour shows success but delivers no email — accepted for MVP and revisited in Phase 3's NFR doc (higher prod SMTP limits mitigate it). Mirrors the redirect style of `src/pages/api/auth/signin.ts`.

#### 3. Forgot-password page

**File**: `src/pages/auth/forgot-password.astro`

**Intent**: Host the email-entry form and render the generic confirmation state after submission.

**Contract**: Static Astro shell matching `signin.astro` (`bg-cosmic` card, `Layout`). Reads `Astro.url.searchParams` for `error` and `sent`; when `sent` is present, render the generic "if an account exists, we've sent a reset link" message instead of (or above) the form. Mounts `<ForgotPasswordForm serverError={error} client:load />`.

#### 4. Forgot-password form component

**File**: `src/components/auth/ForgotPasswordForm.tsx`

**Intent**: Single-field email form reusing the shared form primitives and submission pattern.

**Contract**: `method="POST" action="/api/auth/reset-password"`, `noValidate`. One `FormField` (email, with the same regex validation as `SignInForm`), `ServerError`, `SubmitButton` (pending text e.g. "Sending link…"). Props `{ serverError?: string | null }`.

#### 5. Sign-in "Forgot password?" link

**File**: `src/components/auth/SignInForm.tsx` (or `src/pages/auth/signin.astro`)

**Intent**: Give users an entry point to the reset flow from the sign-in screen.

**Contract**: Add a `<a href="/auth/forgot-password">Forgot password?</a>` link styled like the existing cross-links (e.g. the sign-up link in `signin.astro`).

### Success Criteria:

#### Automated Verification:

- Type checking passes (touched files): `npx tsc --noEmit` (or `npm run build`)
- Linting passes on touched files: `npx prettier --write <touched>` then `npx eslint <touched>` (Windows CRLF baseline — see `context/foundation/lessons.md`; do not run repo-wide `lint:fix`)
- `supabase/config.toml` parses: `npx supabase start` (or `npx supabase config` validation) succeeds with the new template section

#### Manual Verification:

- From `/auth/signin`, the "Forgot password?" link navigates to `/auth/forgot-password`.
- Submitting a known email shows the generic success state.
- Submitting an unknown email shows the **same** generic success state (no enumeration).
- The recovery email appears in inbucket (`http://127.0.0.1:54324`) and its link targets `/auth/confirm?token_hash=…&type=recovery&next=/auth/reset-password` with the correct origin.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the inbucket email link is correct before proceeding to Phase 2.

---

## Phase 2: Confirm + set-new-password leg

### Overview

Consume the recovery link: establish the session at `/auth/confirm`, present the set-new-password form, persist the new password, and auto sign the user in. Handle invalid/expired/used links gracefully. End state: the full local loop works end-to-end.

### Changes Required:

#### 1. Recovery confirm route

**File**: `src/pages/auth/confirm.ts`

**Intent**: Exchange the recovery `token_hash` for a session (set via cookies) and forward the user to the set-new-password page; on failure, route them back to request a fresh link.

**Contract**: `export const prerender = false; export const GET: APIRoute`. Reads search params from the APIRoute context (`context.url.searchParams` or `new URL(context.request.url).searchParams`), not the Astro page global. Require `token_hash`; if it is missing, redirect to `/auth/forgot-password?error=<friendly message>`. Treat query `type` only as a sanity check: if present and not `recovery`, fail with the same friendly redirect; otherwise call `supabase.auth.verifyOtp({ token_hash, type: "recovery" })`. On success redirect to a **fixed `/auth/reset-password`** — do NOT honor a query-param `next` (the template hardcodes the destination; trusting a URL `next` would be an open redirect). If a dynamic `next` is ever reintroduced, validate it is a same-origin relative path (starts with `/`, rejects `//` and `/\`). On error/invalid/expired redirect to `/auth/forgot-password?error=<friendly message>`. (Code snippet — the verifyOtp call is the non-obvious contract other steps depend on:)

```ts
const { error } = await supabase.auth.verifyOtp({
  token_hash: params.get("token_hash")!,
  type: "recovery",
});
```

#### 2. Set-new-password page

**File**: `src/pages/auth/reset-password.astro`

**Intent**: Host the new-password form, guarded so it's only usable with an active recovery session.

**Contract**: Static Astro shell matching the auth card style. Guard: if `Astro.locals.user` is null, redirect to `/auth/forgot-password?error=<link expired, request a new one>`. Reads `error` from query params. Mounts `<ResetPasswordForm serverError={error} client:load />`.

#### 3. Set-new-password form component

**File**: `src/components/auth/ResetPasswordForm.tsx`

**Intent**: New-password + confirm-password form reusing signup's validation UX.

**Contract**: `method="POST" action="/api/auth/update-password"`, `noValidate`. Two password `FormField`s (new + confirm) with `PasswordToggle`, min-6 + match validation copied from `SignUpForm`, `ServerError`, `SubmitButton` ("Updating password…"). Props `{ serverError?: string | null }`.

#### 4. Password-update API endpoint

**File**: `src/pages/api/auth/update-password.ts`

**Intent**: Persist the new password against the recovery session, then leave the user signed in.

**Contract**: `export const prerender = false; export const POST: APIRoute`. Reads `password` and `confirmPassword` from `formData()`; before calling Supabase, validate server-side that password is present, at least 6 characters, confirm password is present, and both values match. On validation error, redirect to `/auth/reset-password?error=<message>`. Then build `createClient(...)` (carries the recovery-session cookies) and call `supabase.auth.updateUser({ password })`. On Supabase error redirect to `/auth/reset-password?error=<message>`; on success redirect to `/` (session is now a full session). Mirrors `src/pages/api/auth/signin.ts` redirect style.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit` (or `npm run build`)
- Linting passes on touched files: `npx prettier --write <touched>` then `npx eslint <touched>`
- Unit tests pass for any extracted validation/helper logic: `npx vitest run`

#### Manual Verification:

- Clicking the inbucket recovery link lands on `/auth/reset-password` with an active session.
- Setting a valid new password (min 6, matching confirm) redirects to `/` signed in; the new password works on a subsequent `/auth/signin`.
- Mismatched or too-short passwords are blocked client-side and (if forced) server-side.
- An expired/used/invalid link redirects to `/auth/forgot-password` with a clear error, not a dead end.
- Visiting `/auth/reset-password` directly without a recovery session redirects to forgot-password.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation of the full local loop before proceeding to Phase 3.

---

## Phase 3: Production email + NFR verification

### Overview

Make the flow real in production (custom SMTP so reset emails deliver past the built-in rate cap, with the recovery template mirrored), and verify + document the credential-stuffing NFR. No new application code expected — this is configuration, verification, and documentation.

### Changes Required:

#### 1. Production SMTP + template configuration

**File**: Supabase dashboard (Authentication → Email / SMTP + URL Configuration) — documented in `context/changes/account-access-and-password-reset/plan.md` references and/or `context/deployment/`

**Intent**: Configure a real SMTP provider (e.g. Resend) so production reset emails deliver reliably, and mirror the recovery template + URL settings from `config.toml`.

**Contract**: SMTP sender configured with a verified domain; the recovery email template mirrors the local `[auth.email.template.recovery]` token-hash link; production `site_url` is the deployed app origin (`https://lumina-clean-ai.pmiller-software.workers.dev`). The reset flow does not require a path-specific `/auth/reset-password` redirect allowlist entry because it does not use `redirectTo`/`{{ .RedirectTo }}`; add redirect allowlist entries only for future flows that do. Document the chosen provider and the exact dashboard settings.

#### 2. Rate-limit / NFR verification + documentation

**File**: `supabase/config.toml` (verify; tune only if needed) + a short note in `context/changes/account-access-and-password-reset/` or `context/foundation/`

**Intent**: Demonstrate the NFR holds — a few mistyped passwords don't lock out a legit user, but credential stuffing at scale is rejected — using Supabase's built-in limits.

**Contract**: Document the effective values (`[auth.rate_limit].sign_in_sign_ups`, `email_sent`, `[auth.email].max_frequency`, `otp_expiry`) and how they satisfy the NFR; tune only if the verification reveals a gap. No app-layer limiter. Explicitly call out the **silent-swallow tradeoff** from Phase 1 #2: because the reset endpoint always shows generic success, a legitimate user who exceeds `email_sent` gets no email and no signal — confirm the prod SMTP limit is high enough that normal use never hits it, and rely on the Phase 1 server-side error log for diagnosis.

### Success Criteria:

#### Automated Verification:

- `supabase/config.toml` still parses if any values were tuned: `npx supabase start`

#### Manual Verification:

- A production-mode password reset delivers a real email via the configured SMTP provider and completes the full loop on the deployed URL.
- Repeated rapid sign-in attempts with a wrong password are eventually throttled (credential-stuffing path) without permanently locking a legitimate user who then succeeds.
- The rate-limit posture and SMTP/URL settings are documented.

**Implementation Note**: This phase depends on external provisioning (SMTP provider account + verified domain) the user must complete. Pause for that before final verification.

---

## Testing Strategy

### Unit Tests:

- Any extracted client-side validation helper (email regex, min-6 + confirm-match) — Vitest, mirroring the posture used for S-01's pure helpers.

### Integration Tests:

- None automated (no E2E harness). The integration surface — email → token → session — is covered by the manual loop below.

### Manual Testing Steps:

1. `/auth/signin` → "Forgot password?" → `/auth/forgot-password`.
2. Submit a registered email → generic success; check inbucket for the email; confirm the link shape.
3. Submit an unregistered email → identical generic success (no enumeration).
4. Click the recovery link → lands on `/auth/reset-password` with a session.
5. Set a valid new password → redirected to `/` signed in; sign out; sign in with the new password.
6. Reuse the same (now consumed) link → redirected to forgot-password with an error.
7. Visit `/auth/reset-password` directly with no session → redirected to forgot-password.
8. (Phase 3) Repeat 1–5 in production against real SMTP; exercise the rate limit.

## Performance Considerations

Negligible — all operations are single Supabase auth round-trips on form submit. Built-in rate limits are the only throughput constraint and are intentional.

## Migration Notes

No data migration. Config changes to `supabase/config.toml` apply on `npx supabase start`; production changes are dashboard settings. No schema or RLS changes (auth.users is Supabase-managed).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-02)
- PRD requirements: `context/foundation/prd.md` (FR-002, FR-003, FR-004, FR-015; credential-stuffing NFR)
- Lessons: `context/foundation/lessons.md` (Windows CRLF lint baseline)
- Existing pattern to match: `src/pages/api/auth/signin.ts`, `src/pages/auth/signin.astro`, `src/components/auth/SignInForm.tsx`
- Supabase SSR reset docs: Context7 `/supabase/supabase` — `apps/docs/content/guides/auth/passwords.mdx` (token_hash + verifyOtp at confirm route)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Request-reset leg + Supabase email wiring

#### Automated

- [x] 1.1 Type checking passes (touched files) — 7c5b9ea
- [x] 1.2 Linting passes on touched files (CRLF-safe, scoped) — 7c5b9ea
- [x] 1.3 `supabase/config.toml` parses with the new recovery template section — 7c5b9ea

#### Manual

- [x] 1.4 "Forgot password?" link navigates to `/auth/forgot-password` — 7c5b9ea
- [x] 1.5 Known email shows generic success — 7c5b9ea
- [x] 1.6 Unknown email shows the same generic success (no enumeration) — 7c5b9ea
- [x] 1.7 Inbucket email link targets `/auth/confirm?token_hash=…&type=recovery&next=/auth/reset-password` — 7c5b9ea

### Phase 2: Confirm + set-new-password leg

#### Automated

- [x] 2.1 Type checking passes — 5fa5798
- [x] 2.2 Linting passes on touched files — 5fa5798
- [x] 2.3 Unit tests pass for extracted validation/helper logic — 5fa5798

#### Manual

- [x] 2.4 Recovery link lands on `/auth/reset-password` with an active session — 5fa5798
- [x] 2.5 Valid new password → redirect to `/` signed in; new password works on next sign-in — 5fa5798
- [x] 2.6 Mismatched/too-short passwords blocked — 5fa5798
- [x] 2.7 Expired/used/invalid link redirects to forgot-password with an error — 5fa5798
- [x] 2.8 Direct visit to `/auth/reset-password` without a session redirects to forgot-password — 5fa5798

### Phase 3: Production email + NFR verification

#### Automated

- [x] 3.1 `supabase/config.toml` still parses if values were tuned

#### Manual

- [ ] 3.2 Production reset email delivers via configured SMTP and completes the loop on the deployed URL
- [ ] 3.3 Rapid wrong-password attempts are throttled without locking out a legit user
- [x] 3.4 Rate-limit posture and SMTP/URL settings documented
