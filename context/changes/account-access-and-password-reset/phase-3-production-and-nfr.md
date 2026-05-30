# Phase 3 — Production email + NFR verification

Configuration, verification, and documentation for taking the password-reset flow to
production. No application code changes in this phase. This note is the in-repo artifact
for Phase 3 Change #1 (production SMTP + template) and Change #2 (rate-limit / NFR
verification).

---

## 1. Production SMTP + URL configuration (dashboard)

These are **Supabase dashboard** settings (Authentication → Email / SMTP and
Authentication → URL Configuration). They mirror the local `supabase/config.toml`
wiring established in Phases 1–2. They must be applied by the project owner; they are
not expressible in the repo.

### 1.1 SMTP provider

- **Provider:** Resend (recommended — agent-friendly docs, simple verified-domain flow).
  Any SMTP provider with a verified sending domain works (Postmark, SendGrid, AWS SES).
- **Why a custom provider is required:** Supabase's built-in email service is
  rate-capped (and intended for testing only). Without custom SMTP, production reset
  emails throttle almost immediately and may not deliver at all.
- **Settings to enter** (Authentication → Email → SMTP Settings → *Enable Custom SMTP*):
  - Sender email: a `no-reply@<verified-domain>` address on the verified domain.
  - Sender name: `LuminaClean AI`.
  - Host / Port / Username / Password: from the provider (Resend: `smtp.resend.com`,
    port `465`, username `resend`, password = Resend API key).
- **Domain verification:** add the provider's SPF/DKIM DNS records to the sending
  domain before first send, or mail lands in spam / is rejected.

### 1.2 Recovery email template (dashboard)

Mirror the local template at `supabase/templates/recovery.html`. In the dashboard:
Authentication → Email Templates → **Reset Password**, set the body so the link is:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password
```

This is the load-bearing contract — the `token_hash` + `type=recovery` query is what
`/auth/confirm` consumes via `verifyOtp`, and `next` is hardcoded to the in-app
set-new-password page. Keep it byte-identical to the local template.

### 1.3 URL configuration (dashboard)

Authentication → URL Configuration:

- **Site URL:** `https://lumina-clean-ai.pmiller-software.workers.dev` (the deployed
  Worker origin). `{{ .SiteURL }}` in the template resolves to this, so the email link
  points at the live app.
- **Redirect allowlist:** **no entry is required for this flow.** The reset flow does
  not pass `redirectTo` / does not use `{{ .RedirectTo }}` — `next` is hardcoded in the
  template and the post-`verifyOtp` redirect to `/auth/reset-password` is an internal
  app redirect. Add allowlist entries only for *future* flows that use `redirectTo`.

---

## 2. Rate-limit / NFR verification (credential stuffing)

**NFR:** a few mistyped passwords must not lock out a legitimate user, but
credential stuffing at scale must be rejected. This is satisfied by Supabase's
built-in, provider-level limits — **no app-layer limiter** is added.

### 2.1 Effective values (from `supabase/config.toml`, local; mirror in dashboard for prod)

| Setting | Value | Scope | Role in the NFR |
| --- | --- | --- | --- |
| `[auth.rate_limit].sign_in_sign_ups` | `30` | per 5-min window, per IP | Primary credential-stuffing guard. 30 sign-in attempts / 5 min / IP throttles automated brute force while leaving a legit user who mistypes a few times unaffected. |
| `[auth.rate_limit].email_sent` | `2` | per hour | Caps reset-email sends (see silent-swallow tradeoff below). |
| `[auth.email].max_frequency` | `1s` | min gap between sends | Prevents rapid duplicate reset requests. |
| `[auth.email].otp_expiry` | `3600` | seconds | Recovery link valid 1h, then expires → forces a fresh request. |
| `[auth].minimum_password_length` | `6` | — | Floor enforced client- and server-side in the reset form/endpoint. |

**No values were tuned in this phase** — verification found no gap, so `config.toml` is
unchanged. The limits as shipped from Phases 1–2 satisfy the NFR.

### 2.2 Why this satisfies the NFR

- **Legit user, fat-fingered password:** a handful of wrong attempts is well under
  30 / 5 min / IP — never locked out, and a later correct attempt succeeds.
- **Credential stuffing at scale:** an attacker hammering sign-in from one IP hits the
  30 / 5 min cap and is throttled; the cap is per-IP and time-windowed (not a permanent
  account lock), so it degrades the attack without creating a denial-of-service against
  the real account owner.

### 2.3 Silent-swallow tradeoff (carried from Phase 1 #2)

`/api/auth/reset-password` always redirects to generic success (anti-enumeration), so a
user who exceeds `email_sent` gets **no email and no UI signal**. Mitigations:

- **Prod SMTP raises the effective cap** — the built-in `email_sent = 2/hr` is a
  local/built-in-service constraint; with custom SMTP enabled the practical send rate is
  the provider's (Resend free tier ≫ 2/hr), so normal use never hits it.
- **Server-side error log** — the endpoint logs swallowed send errors
  (`console.error`), so a rate-limited or misconfigured send is diagnosable from Worker
  logs even though the user sees generic success.

Confirm before launch that the chosen provider's send limit is comfortably above any
realistic per-user reset frequency.

---

## 3. Manual verification checklist (run against production)

1. Trigger a password reset on the deployed URL → a real email arrives via the
   configured SMTP provider; complete the full loop (link → set new password → signed in).
2. Make repeated rapid wrong-password sign-in attempts from one IP → eventually
   throttled; then a correct attempt by the legitimate user still succeeds (no permanent
   lockout).
3. This document records the rate-limit posture and the SMTP/URL settings (✓ on write).
