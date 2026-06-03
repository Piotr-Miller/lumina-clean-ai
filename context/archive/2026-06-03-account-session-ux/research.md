---
date: 2026-06-03T00:00:00Z
researcher: Piotr Miller
git_commit: 8e2072a318084bf27a19b493b1b4f48b5aae6718
branch: feature/account-session-ux
repository: 10xaccount-session-ux
topic: "S-06 account/session UX — global sign-out, redirect authed off /auth/*, idle-timeout, cross-device password reset"
tags: [research, codebase, auth, middleware, session, password-reset, pkce, sign-out, layout]
status: complete
last_updated: 2026-06-03
last_updated_by: Piotr Miller
last_updated_note: "Added Context7 Supabase-Auth pass resolving Open Question #3 (generateLink vs resetPasswordForEmail + delivery)"
---

# Research: S-06 Account / session UX completion

**Date**: 2026-06-03
**Researcher**: Piotr Miller
**Git Commit**: 8e2072a318084bf27a19b493b1b4f48b5aae6718
**Branch**: feature/account-session-ux
**Repository**: 10xaccount-session-ux

## Research Question

Map the live codebase for the four bundled S-06 sub-items so each can be planned:
1. A global, always-reachable **Sign-out** control.
2. **Redirect already-authenticated users off `/auth/*`** (so a signed-in user never lands on the login form).
3. Optional **idle-timeout** / session hygiene.
4. **Cross-device password reset** (the current reset link is PKCE same-browser-only).

(The cross-device-reset *fix* additionally needs an external Context7 Supabase pass; this pass only maps the current code.)

## Summary

All four sub-items are low-risk, auth-UX / middleware / config changes with **zero overlap with the Cloud path** (no `jobs`, no Edge Function, no cap logic), confirming the roadmap's independence claim from S-05/S-07.

Key findings, with the one surprise first:

- **The roadmap's baseline is stale on sign-out reachability.** It says "Sign out renders only on `/` (the Topbar, mounted solely in `Welcome.astro`) and on `/dashboard`." In fact `Welcome.astro` is imported **nowhere** — `src/pages/index.astro` renders the `EnhanceWorkspace` island directly and never mounts `Welcome.astro`. So the Topbar (the only component carrying a Sign-out control besides the dashboard) renders in **no live route**. **The only reachable Sign-out today is the inline form on `/dashboard`** (`src/pages/dashboard.astro:17-24`). `Welcome.astro` + its `Topbar` are effectively dead code.
- **The shared `Layout.astro` is not a shell** — it's HTML boilerplate + an error `Banner` + `<slot />`, with no nav. So a global Sign-out means *adding* a nav to `Layout.astro` (or a new global nav component mounted there), not "moving" an existing one. `Astro.locals.user` is available in every `.astro` component via middleware, so a Layout-level nav can read auth state with no prop threading.
- **The middleware only guards *unauthenticated* access to `/dashboard`.** It has no logic for authenticated users on `/auth/*`. The fix is a small symmetric check in `src/middleware.ts:18-22`, and there's an existing in-repo precedent for top-level `return Astro.redirect()` guards (`reset-password.astro:7-11`) plus a documented lint caveat for it (see Historical Context).
- **Idle-timeout is a pure config change.** `[auth.sessions]` is commented out in `supabase/config.toml:262-267`; uncommenting `inactivity_timeout` enables it locally. No app code. ⚠️ It's a Supabase **Pro-plan** feature when hosted.
- **Cross-device reset has a proven in-repo fix path.** The emitted reset link is a `pkce_…` `token_hash` (default `@supabase/ssr` PKCE flow — no `flowType` is set anywhere) that only verifies in the requesting browser (code-verifier cookie). The ops script `scripts/generate-recovery-link.ts:57-60` already mints a **non-PKCE plain `hashed_token`** via admin `generateLink({ type: "recovery" })` that works in any browser and flows through the *same* `/auth/confirm` route unchanged. The load-bearing change is the **send leg** (`src/pages/api/auth/reset-password.ts:18`), not the confirm leg.

## Detailed Findings

### Sub-item 1 — Global, always-reachable Sign-out

**The Sign-out mechanism** — `src/pages/api/auth/signout.ts:1-12`
- `POST` handler: builds the SSR client, calls `supabase.auth.signOut()`, then **302 redirects to `/`**. No JSON; it's a form-submission contract.
- Callers (only two, both `.astro` forms, not `fetch`):
  - `src/components/Topbar.astro:16-20` — `<form method="POST" action="/api/auth/signout">`
  - `src/pages/dashboard.astro:17-24` — identical inline form.

**The Topbar** — `src/components/Topbar.astro:1-37`
- Reads `const { user } = Astro.locals` (`:2`); conditionally renders email + Dashboard link + Sign-out form when authenticated, else Sign in / Sign up links.
- **Mounted only in `src/components/Welcome.astro:2,28`.**

**`Welcome.astro` is dead code** — grep for `Welcome|Topbar` across `src/**/*.astro` returns only the self-import inside `Welcome.astro` and a literal "Welcome," string in `dashboard.astro:14`. `src/pages/index.astro:1-43` imports `EnhanceWorkspace` + `Layout` only — **no `Welcome.astro`**. ⇒ Topbar renders nowhere live.

**The Layout is not a shell** — `src/layouts/Layout.astro:1-50`
- Renders `<head>`, an error `Banner` (`:22-37`), and `<slot />` (`:38`). No nav, no Topbar, no global shell.
- All pages use `Layout` but each owns its own (absent) nav.

**Auth-state exposure pattern** — middleware sets `context.locals.user` (see sub-item 2); `App.Locals.user` typed in `src/env.d.ts:2-4`. `.astro` components read `Astro.locals.user` directly; **React islands do not** — `index.astro:34-40` explicitly passes `isAuthenticated={Boolean(user)}` as a prop. ⇒ A Layout-level nav should be `.astro` (free access to `locals.user`), not a React island.

**Implication:** the cleanest fix is a small nav in `Layout.astro` (or a `Nav.astro` mounted there) that renders the existing Sign-out form when `Astro.locals.user` is set. This makes Sign-out reachable on every `Layout`-using page in one place and retires the dead `Welcome.astro`/`Topbar` path (decide: reuse Topbar as the global nav, or replace it).

### Sub-item 2 — Redirect already-authenticated users off `/auth/*`

**Current middleware** — `src/middleware.ts:1-25` (runs on every request; no matcher config):
```ts
const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }
  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }
  return next();
});
```
- User resolved via `supabase.auth.getUser()` (`:12`) on every request; client from `src/lib/supabase.ts:9-28` (`createServerClient` + cookie adapter, env from `astro:env/server`).
- **No authenticated-user logic** — the only redirect is unauthenticated → `/auth/signin`. This is the gap.

**Auth route inventory** under `src/pages/auth/`:
| Path | File | Note for the redirect rule |
| --- | --- | --- |
| `/auth/signin` | `signin.astro` | redirect authed → `/` (or `/dashboard`) |
| `/auth/signup` | `signup.astro` | redirect authed |
| `/auth/forgot-password` | `forgot-password.astro` | redirect authed |
| `/auth/confirm-email` | `confirm-email.astro` | redirect authed |
| `/auth/confirm` | `confirm.ts` (API) | **do NOT redirect** — recovery token exchange; an authed redirect would break reset |
| `/auth/reset-password` | `reset-password.astro` | **do NOT blanket-redirect** — see below |

**Caveats the rule must respect:**
- `/api/auth/*` (incl. `signout`) is **not** under `/auth/*`, so a `startsWith("/auth/")` rule won't catch sign-out — good.
- `/auth/confirm` and `/auth/reset-password` are part of the recovery flow and *require* working while a (recovery) session is active. `reset-password.astro:7-11` already self-guards on `!Astro.locals.user` (bounces to forgot-password). A naive "authed on `/auth/*` → redirect home" rule would redirect a recovery-session user *away* from reset-password. ⇒ The redirect must **exclude `/auth/confirm` and `/auth/reset-password`** (or whitelist only signin/signup/forgot-password/confirm-email).

**Existing precedent** for frontmatter redirects — `src/pages/auth/reset-password.astro:7-11`:
```ts
// Self-guard: this page is NOT a PROTECTED_ROUTE, so middleware won't gate it.
if (!Astro.locals.user) {
  return Astro.redirect(`/auth/forgot-password?error=...`);
}
```
⇒ Both middleware-level and page-level guards are viable; middleware is DRY-er and is where `PROTECTED_ROUTES` already lives.

### Sub-item 3 — Idle-timeout (optional)

`supabase/config.toml`:
- `[auth.sessions]` **commented out** (`:262-267`): `# timebox = "24h"`, `# inactivity_timeout = "8h"`.
- `jwt_expiry = 3600` (`:158`); `enable_refresh_token_rotation = true` (`:164`); `refresh_token_reuse_interval = 10` (`:167`). ⇒ Cookie session auto-refreshes indefinitely until explicit Sign-out — no idle expiry today.
- No cookie `maxAge`/session override in `src/lib/supabase.ts` (options pass through from `@supabase/ssr`) or middleware.

**To enable:** uncomment `[auth.sessions]` and set `inactivity_timeout` (optionally `timebox`) for local; mirror in the hosted dashboard (Auth → Sessions). **No app code.** ⚠️ Session timeboxing / inactivity timeout is a Supabase **Pro-plan** feature when hosted (works locally regardless) — decide the idle window with product before enabling. This sub-item is deferrable without blocking the other three.

### Sub-item 4 — Cross-device password reset (PKCE → non-PKCE)

**Current flow (all on the SSR cookie client `src/lib/supabase.ts:9-28`, default PKCE):**
1. **Send leg** — `src/pages/api/auth/reset-password.ts:18` calls `resetPasswordForEmail(email)` with **no `redirectTo`** (template hardcodes `next`); always redirects to `/auth/forgot-password?sent=1` (anti-enumeration, `:32`; send errors swallowed/logged `:19-26`).
2. **Email** — `supabase/templates/recovery.html:6` link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password`. The built-in mailer emits `{{ .TokenHash }}` as a **`pkce_…`** token. Wired via `config.toml:238-240`.
3. **Confirm leg** — `src/pages/auth/confirm.ts:30-33` calls `verifyOtp({ token_hash, type: "recovery" })`; success → `redirect("/auth/reset-password")` (`:41`); failure → `invalidLink()` → `/auth/forgot-password?error=...` (`:8-10`). **This failure bounce is what masks the cross-device case.** (Note: `confirm.ts` ignores the URL `next` and hardcodes the target.)
4. **Set-new-password** — `reset-password.astro:7-11` guards on `Astro.locals.user`; `src/pages/api/auth/update-password.ts:28-37` re-confirms via `getUser()` then `updateUser({ password })`, redirect `/` signed-in.

**Why cross-device fails:** PKCE is the `@supabase/ssr` default (no `flowType` set anywhere — confirmed by grep). The `pkce_…` token requires the **code-verifier cookie** set on the requesting browser; another device has no verifier → `verifyOtp` fails → bounce to forgot-password.

**Proven in-repo fix path — `scripts/generate-recovery-link.ts:57-60`** (ops utility):
```ts
const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
// data.properties.hashed_token  -> a PLAIN (non-pkce_) OTP hash
// link: `${appOrigin}/auth/confirm?token_hash=${hashedToken}&type=recovery&next=/auth/reset-password`
```
- Uses the **admin/service-role** client `createAdminClient(env)` in `src/lib/supabase-admin.ts:29-46` (separate from the SSR client; `persistSession: false`). Its docstring (`:11-13`) states the admin `hashed_token` "works in ANY browser — it sidesteps the same-browser PKCE code-verifier constraint."

**Minimal change set (internal view; confirm against Context7 before planning):**
1. **Send leg (load-bearing):** switch `reset-password.ts:18` from SSR `resetPasswordForEmail` to admin `generateLink({ type: "recovery" })` and deliver the resulting plain-token link via your own email send. The admin token is non-PKCE → cross-device works.
2. **Confirm leg:** `verifyOtp({ token_hash, type: "recovery" })` at `confirm.ts:30-33` already works with a plain hashed token (the ops script flows through this exact route) — **no change strictly required**.
3. **Rejected alternative:** keeping PKCE but switching the template to the default `?code=` link + adding `exchangeCodeForSession` has the *same* code-verifier-cookie constraint, so it does **not** fix cross-device. The admin-token path is the one that works.

> **External dependency:** the send-leg switch changes who sends the email (admin `generateLink` returns a link to deliver yourself, vs `resetPasswordForEmail` which sends via Supabase). This intersects the **parked custom-SMTP** item and Supabase Auth's `generateLink` vs `resetPasswordForEmail` semantics — resolve via a Context7 Supabase-Auth pass during planning, not here.

## Code References

- `src/middleware.ts:1-25` — request middleware; `PROTECTED_ROUTES=["/dashboard"]`; sets `locals.user`; only redirects *unauthenticated* off `/dashboard`. **Add the authed-off-`/auth/*` check here.**
- `src/lib/supabase.ts:9-28` — SSR cookie client factory (`createServerClient` + cookie adapter, env from `astro:env/server`); default PKCE.
- `src/lib/supabase-admin.ts:29-46` — admin/service-role client (`createAdminClient`), `persistSession:false`; used by the recovery-link script.
- `src/pages/api/auth/signout.ts:1-12` — `POST` → `signOut()` → 302 `/`.
- `src/components/Topbar.astro:1-37` — the only Sign-out-bearing nav component; mounted only in dead `Welcome.astro`.
- `src/components/Welcome.astro:2,28` — sole Topbar mount; **imported nowhere** (dead code).
- `src/layouts/Layout.astro:1-50` — boilerplate + Banner + `<slot/>`; no nav (candidate host for a global nav).
- `src/pages/index.astro:1-43` — `/` renders `EnhanceWorkspace` island; no Topbar/nav.
- `src/pages/dashboard.astro:17-24` — **the only reachable Sign-out today** (inline form).
- `src/pages/auth/{signin,signup,forgot-password,confirm-email,reset-password}.astro`, `src/pages/auth/confirm.ts` — auth route set for the redirect rule.
- `src/pages/auth/reset-password.astro:7-11` — existing frontmatter `return Astro.redirect()` self-guard (precedent).
- `src/pages/api/auth/reset-password.ts:18,32` — send leg (`resetPasswordForEmail`, no `redirectTo`, generic-success). **Load-bearing change for cross-device.**
- `src/pages/auth/confirm.ts:30-33,41,8-10` — `verifyOtp` recovery + success/failure bounce.
- `src/pages/api/auth/update-password.ts:28-37` — `getUser()` re-guard + `updateUser({password})`.
- `scripts/generate-recovery-link.ts:57-60,11-13` — non-PKCE admin `generateLink` precedent.
- `supabase/templates/recovery.html:6` — `token_hash` recovery link.
- `supabase/config.toml:262-267` — `[auth.sessions]` (commented); `:158,164,167` jwt/refresh; `:238-240` recovery template wiring; `:154,156` site_url/redirect URLs.
- `src/env.d.ts:2-4` — `App.Locals.user` type.

## Architecture Insights

- **No global app shell.** `Layout.astro` is intentionally minimal; nav has always been per-page (and, for the Topbar, accidentally orphaned). A Layout-level `.astro` nav reading `Astro.locals.user` is the idiomatic fix and centralizes Sign-out reachability — it also fixes `/` having no auth affordance at all today.
- **Middleware is the auth-routing chokepoint.** It already resolves `locals.user` on every request and owns `PROTECTED_ROUTES`; both the authed-off-`/auth/*` redirect and any future route gating belong here. Symmetric guards (unauth→signin, authed→home) sit naturally side by side.
- **`.astro` vs island auth state.** `.astro` gets `Astro.locals.user` free; React islands must be handed `isAuthenticated` as a prop (`index.astro:34-40`). Keep the global nav as `.astro`.
- **Two Supabase clients, two flows.** SSR cookie client (PKCE, user-scoped, cookie-bound) vs admin service-role client (no session, RLS-bypassing). The cross-device reset fix is fundamentally about moving the *token-minting* from the cookie-bound PKCE client to the admin client — the repo already has both and a working precedent.
- **Recovery confirm route is flow-agnostic.** `verifyOtp({token_hash, type})` accepts either a `pkce_` or a plain hash, so the confirm leg is stable across the fix — lowering risk.

## Historical Context (from prior changes)

- `context/archive/2026-05-29-account-access-and-password-reset/phase-3-production-and-nfr.md:178-189` — documents the exact cross-device limitation: emailed link is `token_hash=pkce_…`, verifies same-browser only; "A future improvement … can move to a non-PKCE emailed token or an explicit code-exchange route. For … cross-browser testing, use `scripts/generate-recovery-link.ts`." Also: the **dashboard recovery template** must use the `token_hash` link (not the default `{{ .ConfirmationURL }}` `?code=` flow) — §1.2; and **custom SMTP** is parked to a future infra slice (§1) — relevant because the send-leg switch changes the send mechanism.
- `context/foundation/lessons.md` "Typed ESLint rules crash on `.astro` frontmatter top-level `return`" (lines 48-52) — **directly relevant** to both the page-guard option for sub-item 2 and the existing `reset-password.astro` guard: the typed rule `@typescript-eslint/no-misused-promises` is disabled scoped to `**/*.astro` in the flat config; an inline disable does NOT work (the rule crashes during AST traversal). If sub-item 2 is done with a *middleware* redirect (recommended) this doesn't bite; if done with per-page frontmatter guards, the `.astro` scope-disable must already be in place (verify it still is).
- `context/foundation/roadmap.md:152-164,226-228` — S-06 slice body + the three parked S-02 follow-ups it bundles. **Correction:** the line-226 claim that "Sign out renders only on `/`" is outdated — `Welcome.astro` is orphaned, so the only live Sign-out is on `/dashboard`.

## Related Research

- `context/archive/2026-05-31-cloud-ai-realtime-result/research.md` — S-04 (Cloud path; unrelated surface, confirms zero overlap).
- `context/archive/2026-05-31-gated-cloud-upload/research.md` — S-03 (Cloud path).

## Open Questions

1. **Global nav: reuse or replace the Topbar?** Fold the existing `Topbar.astro` into `Layout.astro` (and delete `Welcome.astro`), or build a fresh `Nav.astro`? Both read `Astro.locals.user`. Decision affects whether `Welcome.astro`/`Topbar.astro` survive.
2. **Redirect rule's allow-list.** Confirm the exact set: redirect authed off `signin/signup/forgot-password/confirm-email`, but **exclude `/auth/confirm` and `/auth/reset-password`** so recovery still works. Verify a recovery session presents as `locals.user` (it does — `reset-password.astro` relies on it) and pick the redirect target (`/` vs `/dashboard`).
3. ~~**Cross-device reset — send mechanism.**~~ **RESOLVED** by the Context7 pass below — `generateLink` does not send email; the app must deliver it itself, which couples this sub-item to email delivery (built-in mailer is not usable with `generateLink`). See Follow-up Research.
4. **Idle-timeout: ship in v1?** Pro-plan-gated when hosted; product must set the idle window. Deferrable without blocking sub-items 1–3.

## Follow-up Research 2026-06-03 — Context7 Supabase-Auth pass (Open Question #3)

External-docs pass on `generateLink` vs `resetPasswordForEmail` + delivery semantics. Sources: `/websites/supabase` (JS/admin SDK reference) and `/supabase/auth` (GoTrue server `/admin/generate_link` + `/verify`). The two corroborate.

### What the docs confirm

1. **`supabase.auth.resetPasswordForEmail(email, { redirectTo })`** — "supports the **PKCE flow**" (JS reference, verbatim) and **Supabase sends the email** via the project's configured mailer (built-in or custom SMTP). This is exactly today's path (`reset-password.ts:18`), and PKCE is *why* the emitted `token_hash` is `pkce_…` and only verifies in the requesting browser.
2. **`supabase.auth.admin.generateLink({ type: "recovery", email, options? })`** — "**This will NOT send links or OTPs to the end user. This function is for custom admin functionality.**" (verbatim). It *returns* the artifacts; **delivery is the app's responsibility**. Response carries `action_link`, `email_otp`, **`hashed_token`** (the plain, non-PKCE OTP-derived token the repo's `scripts/generate-recovery-link.ts:66` already reads), `verification_type`, `redirect_to`. `redirect_to` is an optional param (defaults to `SITE_URL`).
3. **`verifyOtp({ token_hash, type })`** — the GoTrue `/verify` endpoint accepts `token_hash` + `type` (`VerifyParams`); a plain `hashed_token` verifies with **no code-verifier cookie**, so it works in **any browser/device**. ⇒ The confirm leg (`confirm.ts:30-33`) needs **no change**; it already works for the script's plain-token links.

### The resolved tradeoff (this is the real decision for planning)

| | `resetPasswordForEmail` (today) | admin `generateLink` (cross-device fix) |
| --- | --- | --- |
| Token | PKCE `pkce_…` | **plain `hashed_token`** |
| Cross-device | ❌ same-browser only | ✅ works anywhere |
| **Who sends the email** | **Supabase** (built-in or custom SMTP) | **the app must send it** — Supabase does not |
| Client | SSR cookie client | admin/service-role client (`supabase-admin.ts`) |

**The fix is not free:** switching the send leg to `generateLink` **forfeits Supabase's built-in mailer** for the reset email — the app must now send the recovery email itself (own SMTP / transactional provider). That **couples sub-item 4 to the parked custom-SMTP infra item** (`roadmap.md` Parked; phase-3 §1). So cross-device reset is *not* a pure code change the way sub-items 1–2 are; it carries an email-delivery dependency.

### Recommendation for `/10x-plan`

- **Code change is small and proven:** send leg `reset-password.ts:18` → admin `generateLink({ type: "recovery", email })`, build the `/auth/confirm?token_hash=<hashed_token>&type=recovery&next=/auth/reset-password` link (mirror `generate-recovery-link.ts:71`), send via the app's mailer. Confirm leg unchanged.
- **But gate it on a delivery decision:** either (a) bundle a minimal transactional-email send here (pulls the custom-SMTP slice forward), or (b) keep `resetPasswordForEmail` for MVP launch (accept same-browser-only, already verified end-to-end in S-02 phase-3) and **defer cross-device to the infra slice** that lands SMTP anyway. Given S-06 is otherwise pure auth-UX/middleware with zero external deps, option (b) keeps the slice clean; option (a) only if cross-device reset is a launch requirement. **Surface this fork in the plan rather than assuming.**

### Code References (follow-up)

- `scripts/generate-recovery-link.ts:57-60,66,71` — the exact `generateLink` → `hashed_token` → `/auth/confirm` assembly to mirror in the send leg.
- `src/lib/supabase-admin.ts:29-46` — admin client the send leg would use instead of the SSR client.
- `src/pages/api/auth/reset-password.ts:18` — the single line that changes.
