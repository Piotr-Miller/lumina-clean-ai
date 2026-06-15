# Surface password-reset send failures (swallowed-error fix) Implementation Plan

## Overview

`POST /api/enhance/.../auth/reset-password` currently swallows every `resetPasswordForEmail` failure: it logs the error server-side but **always** redirects to `/auth/forgot-password?sent=1`, telling the user "check your inbox" even when no email was sent (rate-limit, SMTP failure, or Supabase-not-configured). This plan surfaces a **neutral, enumeration-safe** error on the failure branch instead, and locks the branch logic with a hermetic unit test by extracting an env-free core (the route can't load under Vitest today).

## Current State Analysis

- **The bug** — `src/pages/api/auth/reset-password.ts:22-37`: on `{ error }` from `resetPasswordForEmail` (and on `supabase === null`) the code `console.error`s and falls through to `return context.redirect("/auth/forgot-password?sent=1")`. The failure is observable only in logs; the user is misled.
- **Why the swallow exists** — the generic-success redirect is a deliberate **anti-enumeration** measure (don't reveal which emails have accounts). That intent is correct and must be preserved.
- **Why it over-swallows** — verified against Supabase docs (Context7, 2026-06-15): `resetPasswordForEmail` returns **no error for a non-existent email** (anti-enumeration by design). The errors it _does_ return are infrastructure-class (rate-limit 429, SMTP/transport, misconfig) and are **independent of whether the account exists**. So a neutral failure message does not leak enumeration.
- **UX surface already exists** — `src/pages/auth/forgot-password.astro:5,30` already reads `?error=` and passes it as `serverError` into `ForgotPasswordForm`; `?sent=1` renders the neutral "If an account exists for that email, we've sent a link…" view. **No page change is needed**, and the success copy is already enumeration-safe.
- **Testability constraint (Lesson #4)** — `reset-password.ts` imports `createClient` from `@/lib/supabase`, which imports `astro:env/server` at module top (`src/lib/supabase.ts:3`). That virtual module does not resolve under Vitest, so the route cannot be unit-tested as-is. The codebase's established fix is the env-free-core split used by `src/lib/services/cloud-create-job.handler.ts` and `src/lib/services/timeout.handler.ts` (route = thin env shell; core = pure request→response logic driven by a stub client). Auth routes currently have **no** route-level tests (only the pure `validateNewPassword` helper in `tests/auth-validation.test.ts`).

## Desired End State

A user who submits the forgot-password form when the email send **fails** lands on `/auth/forgot-password?error=<neutral message>` and sees a retry-able error, instead of a false "email sent" screen. A user whose email simply doesn't exist still sees the neutral `?sent=1` view (Supabase returns no error → enumeration preserved). The branch decision is covered by a hermetic unit test that runs under `npm run test:unit` (no Docker, no live Supabase).

Verify: `npm run test:unit` passes including the new test; `npm run lint` and `tsc --noEmit` pass; manual check that a forced send failure shows the error and a normal request still shows "sent".

### Key Discoveries:

- Swallow site: `src/pages/api/auth/reset-password.ts:22-37`.
- `?error=` already rendered: `src/pages/auth/forgot-password.astro:5,30` (`serverError` prop).
- Lesson #4 env coupling: `src/lib/supabase.ts:3` (`import … from "astro:env/server"`).
- Pattern to mirror: `src/lib/services/cloud-create-job.handler.ts` (env-free core taking the already-built client; thin wrapper reads env) and its test `tests/cloud-create-job.handler.test.ts`.
- Supabase behavior (Context7): no error returned for unknown emails; returned errors are infra/rate-limit → neutral surfacing is enumeration-safe.

## What We're NOT Doing

- **Not** changing `forgot-password.astro` or `ForgotPasswordForm` — the `?error=` / `?sent=1` surface already exists.
- **Not** distinguishing rate-limit vs SMTP vs misconfig to the user — one fixed neutral string for all failure causes (incl. `supabase === null`).
- **Not** echoing `error.message` into the response (it can carry specifics; would erode the uniform-output guarantee).
- **Not** changing the success path (`?sent=1`) or removing the server-side `console.error` logging.
- **Not** touching the other auth routes (`signin`/`signup`/`update-password`) — they already propagate via `?error=`.
- **Not** adding an E2E test — a real Supabase send failure can't be triggered deterministically, and test-plan §7 excludes auth-provider internals.

## Implementation Approach

Mirror the established env-free-core split. Extract the request→redirect decision into `src/lib/services/reset-password.handler.ts` as a pure function that receives the already-built `supabase` client (or `null`) plus the request, and returns a **redirect path string**. The route (`reset-password.ts`) stays the thin env shell: parse form, build the client via `createClient` (which reads `astro:env`), call the core, and `context.redirect(path)`. The core returns `?sent=1` only when `resetPasswordForEmail` returns no error; on any error or a null client it returns `?error=<neutral message>`. A hermetic Vitest test drives the core with a stub client across the three branches.

## Critical Implementation Details

- **Anti-enumeration invariant (load-bearing):** the core must return a response that is **indistinguishable by an attacker** between "email exists" and "email doesn't exist". Since Supabase returns no error for unknown emails, the success branch (`?sent=1`) covers both "sent" and "unknown email" — that must not change. The error branch is reached only for account-independent infra failures. Use **one fixed string** for every error cause; never branch the copy and never include `error.message`.
- **Redirect-path contract:** the core returns a path string (e.g. `/auth/forgot-password?sent=1` or `/auth/forgot-password?error=<encoded>`) rather than a `Response`, because `context.redirect` is Astro-context-coupled; keeping the core's output a plain string is what makes it assertable under Vitest. The message is `encodeURIComponent`-encoded in the path exactly as the existing route does it.

## Phase 1: Surface send failures via a tested env-free core

### Overview

Extract the env-free core, thin the route, change the failure branch to a neutral `?error=`, and add a hermetic unit test for all three branches.

### Changes Required:

#### 1. Env-free core

**File**: `src/lib/services/reset-password.handler.ts` (new)

**Intent**: Hold the pure request→redirect-path decision for the forgot-password POST so it can be unit-tested under Node without `astro:env`. Decides `?sent=1` vs `?error=<neutral>` and owns the anti-enumeration invariant.

**Contract**: Export an async function taking `{ supabase: SupabaseClient | null, request: Request }` and returning a redirect **path** `string`. This function owns **all** redirect outcomes (F1): parse `email` from form data and, on a malformed/non-form body, return the existing "Invalid request. Please try again." `?error=` path; if `supabase` is `null` → return the neutral `?error=` path (log via `console.error`); else call `supabase.auth.resetPasswordForEmail(email)` and return `?sent=1` on no error, or the neutral `?error=` path on error (log `error.message` server-side, but never put it in the path). **Invariant (F2): call `resetPasswordForEmail(email)` with NO `redirectTo`/options** — preserve the existing `reset-password.ts:18-21` behavior (the recovery email template hardcodes the post-confirm target; passing `redirectTo` would pull in Supabase's redirect allowlist). The neutral message constant: `"We couldn't send the reset email right now. Please try again in a few minutes."`. Reuse `encodeURIComponent` for the `error` value, matching the current route. Keep this module free of `@/lib/supabase` and `astro:env` imports (type-only `SupabaseClient` import is fine).

#### 2. Thin route wrapper

**File**: `src/pages/api/auth/reset-password.ts`

**Intent**: Reduce the route to the env-coupled shell that delegates the decision to the core, preserving `export const prerender = false` and the `POST` contract.

**Contract**: Build the client with `createClient(context.request.headers, context.cookies)` (may be `null`), call the core with `{ supabase, request: context.request }`, and `return context.redirect(<path the core returned>)`. No behavior on any reachable path changes except the failure branch now yields `?error=` instead of `?sent=1`. The wrapper contains **no redirect logic of its own** beyond delegating — every redirect outcome (success, send-error, not-configured, malformed-form) is decided by the core (F1), so the malformed-form `?error=` path is unit-tested too.

#### 3. Hermetic unit test

**File**: `tests/reset-password.handler.test.ts` (new)

**Intent**: Lock the branch decision — the regression guard for the swallowed-error fix.

**Contract**: Drive the core with a stub `supabase` whose `auth.resetPasswordForEmail` is a `vi.fn()`. Assert: (a) no-error → path is `/auth/forgot-password?sent=1`; (b) returned error → path starts with `/auth/forgot-password?error=` AND does not contain the stub error's message text (no leakage); (c) `supabase === null` → same neutral `?error=` path, and `resetPasswordForEmail` is never called; (d) the returned path is **independent of the email argument** (output depends only on the send outcome, not the address). Note (F3): this unit proves path-mapping + no-message-leakage — it does NOT prove enumeration safety end-to-end. That safety rests on Supabase returning no error for unknown emails (a documented assumption — see `plan-brief.md` Open Risks) plus the no-`error.message` guarantee, both outside this unit's reach; don't claim the test proves enumeration. Prove the fix has teeth: a one-off revert of the error branch to `?sent=1` should turn case (b) red.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- New test present and asserts all three branches + no message leakage: `tests/reset-password.handler.test.ts`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- A normal forgot-password submit for any email still lands on `?sent=1` (neutral "If an account exists…" view).
- With the send forced to fail (e.g. temporarily point at a misconfigured/unconfigured Supabase, or trip the rate limit), the form re-renders with the neutral error message and is retry-able — no false "sent" screen.
- The `?error=` value in the URL is the fixed neutral string only — no raw Supabase error text.

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- The three-branch decision in `reset-password.handler.ts` (success / send-error / not-configured), driven by a stub client — see Phase 1 change #3.
- Enumeration invariant: identical output for different emails given the same send outcome; no `error.message` in the path.

### Integration Tests:

- None. The behavior is a pure branch decision over the client's return; a real Supabase send failure can't be triggered deterministically and the success path is already E2E-adjacent. (Consistent with test-plan §7 excluding auth-provider internals.)

### Manual Testing Steps:

1. Submit forgot-password with a normal email → expect the `?sent=1` neutral view.
2. Force a send failure (unconfigure Supabase locally or trip the email rate limit) → expect the form with the neutral error, retry-able; URL carries only the fixed string.
3. Submit with an email that has no account → still `?sent=1` (enumeration preserved).

## Migration Notes

None — no schema, no data, no config changes. Pure code refactor + branch behavior.

## References

- Change: `context/changes/reset-password-send-failure-surfacing/change.md`
- Swallow site: `src/pages/api/auth/reset-password.ts:22-37`
- UX surface: `src/pages/auth/forgot-password.astro:5,30`
- Env-coupling (Lesson #4): `src/lib/supabase.ts:3`
- Pattern mirrored: `src/lib/services/cloud-create-job.handler.ts` + `tests/cloud-create-job.handler.test.ts`
- Supabase `resetPasswordForEmail` anti-enumeration behavior: Supabase docs via Context7 (`/supabase/supabase`, 2026-06-15)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Surface send failures via a tested env-free core

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:unit` — e5421a4
- [x] 1.2 New test present and asserts all three branches + no message leakage: `tests/reset-password.handler.test.ts` — e5421a4
- [x] 1.3 Type checking passes: `npx tsc --noEmit` — e5421a4
- [x] 1.4 Linting passes: `npm run lint` — e5421a4

#### Manual

- [x] 1.5 Normal submit still lands on `?sent=1` (neutral view) — e5421a4
- [x] 1.6 Forced send failure re-renders the form with the neutral error, retry-able — no false "sent" — e5421a4
- [x] 1.7 `?error=` carries only the fixed neutral string (no raw Supabase error text) — e5421a4
