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

> **MVP launch decision (2026-05-30).** Custom SMTP is **deferred to a future
> deployment/infrastructure slice** and is **not** a blocker for S-02. For MVP launch the
> reset flow is proven end-to-end against **Supabase's built-in email sender** — a single
> one-off reset is enough to verify the loop (link → set new password → signed-in session).
> The built-in sender's ~2–4 emails/hr cap is the accepted known constraint until the infra
> slice lands; combined with the silent-swallow tradeoff (§2.3), a normal one-off reset is
> unaffected, while sustained/high-frequency reset volume must wait for custom SMTP. The §1.1
> SMTP settings below are therefore the **target for that future slice**, not a Phase-3
> done-criterion. (Manual check 3.2 is verified via the built-in sender accordingly.)

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

> **Required even with the built-in sender — not part of the SMTP deferral.** This
> template lives in the dashboard (Authentication → Email Templates → Reset Password) and
> is configured independently of *who sends* the mail. The built-in sender is fine; the
> default *template* is not.
>
> **Symptom if not applied (observed 2026-05-30, manual check 3.2):** the recovery link
> resolves to `{{ .SiteURL }}/?code=<uuid>` — i.e. the deployed app **home page** (the
> "Fix your night photos" slider), with no set-new-password form. That is Supabase's
> **default** recovery template (`{{ .ConfirmationURL }}`, the PKCE `?code=` flow landing
> on the site root), which this app does **not** handle — there is no code-exchange route
> at `/`, so no recovery session is established and the user just sees the landing page.
>
> **Fix:** set the dashboard Reset-Password template body to the exact `token_hash` link
> above so the link targets `/auth/confirm?...&type=recovery&next=/auth/reset-password`.
> No application code change is needed — the token_hash flow (`/auth/confirm` →
> `verifyOtp` → `/auth/reset-password`) is already deployed and was verified locally in
> Phase 2. Re-run check 3.2 after applying the template.

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

### 2.4 Observed production behavior (2026-05-30, manual check 3.3)

> **Local `config.toml` ≠ production.** The `[auth.rate_limit]` values in §2.1 govern the
> **local** `supabase start` stack only. The deployed (hosted) project enforces the rate
> limits configured in its **dashboard** (Authentication → Rate Limits), which default
> higher and differ by plan/region. So the prod thresholds are not the §2.1 numbers.
>
> **Result:** rapid wrong-password sign-in attempts on the deployed app were eventually
> rejected with **"Request rate limit reached"** — the credential-stuffing guard **is
> enforced in production**. It did not trip within the first ~10 attempts; the effective
> threshold is higher than the local `sign_in_sign_ups = 30` value, consistent with the
> hosted plan's larger window. A legitimate user who mistypes a few times is unaffected
> (no early lockout), and the cap is time-windowed/per-IP, not a permanent account lock —
> **the NFR holds**: a few mistakes don't lock anyone out, brute force at scale is rejected.
>
> **Action:** if the hosted threshold is judged too permissive for launch, lower
> `sign_in_sign_ups` (and related limits) in the **dashboard** Rate Limits section — this
> is a hosted setting, not a `config.toml` change. No app code is involved.

---

## 3. Manual verification checklist (run against production)

1. Trigger a password reset on the deployed URL → a real email arrives via the
   configured SMTP provider; complete the full loop (link → set new password → signed in).
2. Make repeated rapid wrong-password sign-in attempts from one IP → eventually
   throttled; then a correct attempt by the legitimate user still succeeds (no permanent
   lockout).
3. This document records the rate-limit posture and the SMTP/URL settings (✓ on write).

---

## 4. Verification outcome (2026-05-30)

**3.2 — PASS (via built-in sender).** After the dashboard Reset-Password template was
switched from the default `{{ .ConfirmationURL }}` to the `token_hash` link (§1.2), the
full production loop completed: emailed recovery link → `/auth/confirm` (`verifyOtp`) →
`/auth/reset-password` form → new password saved → signed-in redirect. Verified on the
deployed Worker using Supabase's **built-in email sender** (no custom SMTP), consistent
with the MVP launch decision in §1.

Observations from the run:

- **Built-in email rate cap was actually hit** mid-verification — repeated test requests
  during template iteration exhausted the ~2–4/hr built-in allowance, and (per the §2.3
  silent-swallow tradeoff) the endpoint still showed generic success while no mail was
  sent. Concrete evidence that the custom-SMTP infra slice (Parked in `roadmap.md`) is
  the right call before real user volume.
- **Emailed link is `token_hash=pkce_…`** (the `@supabase/ssr` PKCE flow). It verified
  successfully **in the same browser** that requested the reset (the code-verifier cookie
  was present). **Known limitation:** clicking the emailed link on a *different*
  device/browser has no verifier cookie and will fail `verifyOtp` → bounce to
  forgot-password. A future improvement (with the SMTP slice) can move to a non-PKCE
  emailed token or an explicit code-exchange route. For no-email / cross-browser testing,
  use `scripts/generate-recovery-link.ts` (Admin `generateLink` → plain-hash token).
- **Trailing-slash Site URL** produced a `…workers.dev//auth/confirm` double slash in the
  link; routing **tolerated** it (the loop still completed), so it is cosmetic, not fatal.
  Recommend trimming the Site URL trailing slash anyway for clean links.
- **Link reuse** → "That reset link is invalid or has expired. Please request a new one."
  Correct one-time-use behavior (matches Phase 2 manual check 2.7).

**3.3 — PASS.** Credential-stuffing throttle confirmed in production ("Request rate limit
reached" after sustained wrong-password attempts), with no early lockout of a legitimate
user — see §2.4. NFR satisfied.
