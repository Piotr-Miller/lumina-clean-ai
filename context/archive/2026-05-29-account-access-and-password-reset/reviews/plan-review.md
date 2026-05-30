<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Account Access — Email-Based Password Reset

- **Plan**: context/changes/account-access-and-password-reset/plan.md
- **Mode**: Deep
- **Date**: 2026-05-29
- **Verdict**: REVISE → SOUND after triage (all 4 findings FIXED)
- **Findings**: 0 critical, 2 warnings, 2 observations — all FIXED

## Verdicts

| Dimension | Verdict (post-triage) |
|-----------|-----------------------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS (F2, F3 fixed) |
| Plan Completeness | PASS (F1, F4 fixed) |

## Grounding

5/5 existing paths ✓ (`src/lib/supabase.ts`, `src/middleware.ts`, `src/components/auth/SignInForm.tsx`, `src/pages/api/auth/signin.ts`, `supabase/config.toml`), 7/7 new paths absent ✓ (no route collision), symbols ✓, brief↔plan ✓. Confirmed: no `--port` override (astro dev → 4321 vs `site_url` 3000, real mismatch); `createServerClient` sets no `flowType` (PKCE default; token_hash + verifyOtp still works via custom template); existing "Sign up" cross-link at `signin.astro:18` is the anchor for "Forgot password?". Blast radius small — additive new files + the only shared change (`site_url`) affects email links only (existing auth uses relative redirects).

## Findings

### F1 — `next` vs `redirectTo` mechanism is double-specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 #1 + #2, and Critical Implementation Details
- **Detail**: The recovery template contract hardcodes `next=/auth/reset-password` in the email link, while the reset-password endpoint ALSO passes `resetPasswordForEmail(email, { redirectTo: <site>/auth/reset-password })`. Two mechanisms for the same hop. With a hardcoded `next`, Supabase's `.RedirectTo` (and thus the allowlist) is never consulted — yet Critical Implementation Details insists the allowlist must include `/auth/reset-password` "or the next hop is dropped." Only one is true depending on which mechanism is authoritative. Implementer can't tell whether the allowlist edit is required or dead.
- **Fix A ⭐ Recommended**: Hardcode `next` in template, drop the redirectTo arg
  - Strength: Simplest correct path — link fully determined by template; only `site_url` must be right (no path allowlisting). Matches the docs' token_hash example which hardcodes `next`.
  - Tradeoff: `next` fixed at template level, not per-call (fine — one reset destination).
  - Confidence: HIGH — Supabase token_hash template example hardcodes the next target; `.RedirectTo` only populates from a passed, allowlisted redirectTo.
  - Blind spot: None significant.
- **Fix B**: Use `{{ .RedirectTo }}` in template + keep redirectTo + allowlist it
  - Strength: Reset destination controlled at the call site, not the template.
  - Tradeoff: Requires `/auth/reset-password` on the allowlist AND keeping template+endpoint+config in sync — more moving parts.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — endpoint drops the `redirectTo` arg; template hardcodes `next`; allowlist needs only the origin (Critical Impl Details rewritten).

### F2 — `/auth/confirm` open-redirect via unvalidated `next`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 #1 (confirm route)
- **Detail**: The confirm route "reads `next` from query params … on success redirect to `next`." `next` is attacker-controllable. Without a same-origin check, `/auth/confirm?token_hash=…&next=https://evil.com` becomes an open redirect after a successful verifyOtp. Low exploitability (needs a valid recovery token) but a standard hardening miss. If F1 Fix A is taken (hardcoded `next`), the route can stop honoring a query `next` entirely.
- **Fix**: Validate `next` is a relative same-origin path (starts with "/", rejects "//" and "/\\") before redirecting; default to `/auth/reset-password` otherwise. Add to Phase 2 #1's contract.
- **Decision**: FIXED — confirm route now redirects to a fixed `/auth/reset-password` and ignores any query `next`; same-origin guard noted if a dynamic `next` is reintroduced.

### F3 — Rate-limit error silently swallowed by generic success

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 #2 (reset-password endpoint)
- **Detail**: The endpoint redirects to generic success "on any outcome (success, error, or unset client)" — correct for anti-enumeration. But `[auth.rate_limit].email_sent = 2/hr` is global; the 3rd legitimate reset request in an hour returns an error that's now invisible: user sees "we've sent a link" but no email arrives. Brushes against the FR-015 NFR ("don't lock out a legit user"). Acceptable for MVP, but should be a conscious documented choice.
- **Fix**: Note the tradeoff in the plan (and log the swallowed error server-side for observability); tie it to the Phase 3 NFR doc.
- **Decision**: FIXED — Phase 1 #2 now logs the swallowed error + documents the tradeoff; Phase 3 NFR doc cross-references it and checks prod SMTP limit headroom.

### F4 — Dev-port reconciliation left as an in-plan TBD

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details
- **Detail**: Confirmed real: no `--port` override, so `astro dev` serves on 4321 while `site_url` is 3000. The plan says "reconcile 3000 vs 4321" but doesn't commit to a value — a lingering decision the no-open-questions rule says to settle now.
- **Fix**: Decide in the plan — set `site_url`/allowlist to `http://127.0.0.1:4321` (astro dev default), or add `--port 3000` to the `dev` script. Pick one.
- **Decision**: FIXED — Phase 1 #1 sets `site_url`/`additional_redirect_urls` to `http://127.0.0.1:4321` (astro dev default); Critical Impl Details updated.
