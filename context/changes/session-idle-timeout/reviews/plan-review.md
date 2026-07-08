<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Idle Session Logout Implementation Plan

- **Plan**: `context/changes/session-idle-timeout/plan.md`
- **Mode**: Deep
- **Date**: 2026-07-08
- **Verdict**: REVISE → **RESOLVED (2026-07-08)** — both warnings triaged, verified against installed library source, and folded into the plan
- **Findings**: 0 critical, 2 warnings, 0 observations (both resolved)

## Resolution (2026-07-08)

- **F1 — CONFIRMED → Fix A applied (refined).** Verified in `node_modules/@supabase/auth-js/src/GoTrueClient.ts` (`_signOut`): an unexpected error (not 401/403/404/session-missing) returns **before** `_removeSession()`, so `SIGNED_OUT` never fires and `@supabase/ssr` never deletes the auth cookies — the review's claim holds exactly. Plan amended: the expire branch now adds a **fallback purge of every request cookie with the `sb-` prefix** on unexpected signOut failure. The prefix approach resolves Fix A's own "chunked cookie shape" blind spot — it covers the base `sb-<ref>-auth-token`, chunked `.0`/`.1`… variants (`@supabase/ssr` chunker), and the `-code-verifier` sibling without coupling to exact names. Also recorded: `scope: "local"` revokes the refresh token server-side (why signOut stays primary), and the accepted residual that the fallback path skips that revocation. Fix B rejected — fail-open idle enforcement during auth outages weakens the shared-device protection exactly when it's least observable.
- **F2 — FIXED.** Added a two-browser/profile manual verification (Phase 2 criteria, Manual Testing step 5, Progress item 2.9): expire session A, confirm session B still reaches `/dashboard` — an implementation that forgets `{ scope: "local" }` now fails a listed criterion.

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 6/6 referenced paths verified, 6/6 supporting symbols verified, `plan-brief.md` matches `plan.md`, and the `## Progress` section satisfies the parser contract.

## Findings

### F1 - Unexpected signOut failures do not satisfy the plan's fail-closed expiry contract

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details; Phase 2 - Middleware
- **Detail**: The plan says middleware should catch `supabase.auth.signOut({ scope: "local" })` failures and still delete only `lc-last-activity` plus `locals.user`. That does not actually guarantee a browser logout. In the installed `@supabase/auth-js`, unexpected logout errors return before `_removeSession()` runs (`node_modules/@supabase/auth-js/src/GoTrueClient.ts:3794-3820`), and in this repo's SSR client that auth-state removal is what drives cookie deletion through `SIGNED_OUT`/`setAll` (`node_modules/@supabase/ssr/src/createServerClient.ts:167-190`, `src/lib/supabase.ts:13-27`). So on a transient 5xx/network failure, the activity cookie dies but the Supabase auth cookies can remain, and the next request may still authenticate the user. That contradicts the plan's statement that "the browser-side session must die regardless."
- **Fix A ⭐ Recommended**: Add an explicit fallback that purges the Supabase SSR auth cookies by storage-key prefix when `signOut({ scope: "local" })` returns an unexpected error, then clear `locals.user` and the activity cookie.
  - Strength: Preserves the plan's local-browser fail-closed behavior even when the auth API is unhealthy.
  - Tradeoff: Couples the middleware to Supabase SSR cookie naming/chunking (`sb-<project-ref>-auth-token*` per `node_modules/@supabase/supabase-js/src/SupabaseClient.ts:294-299`).
  - Confidence: MEDIUM - the storage-key convention is verified locally, but this repo's exact chunked-cookie shape was not inspected yet.
  - Blind spot: The fallback still needs a precise delete strategy for chunked auth cookies.
- **Fix B**: Narrow the contract: if `signOut` returns an unexpected error, keep the session alive, log it, and retry expiry on the next request instead of pretending logout succeeded.
  - Strength: Avoids coupling middleware to Supabase's cookie internals.
  - Tradeoff: Idle enforcement becomes best-effort during auth outages, which weakens the shared-device protection exactly when the API is unhealthy.
  - Confidence: HIGH - this matches the current library behavior directly.
  - Blind spot: The plan does not currently include telemetry or an operator signal for repeated expiry failures.
- **Decision**: **RESOLVED — Fix A applied (prefix-purge refinement).** See Resolution (2026-07-08).

### F2 - The local-only signout guarantee is promised but never verified

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State; Phase 2 - Success Criteria / Manual Verification
- **Detail**: The plan promises that "other devices' sessions are untouched" and correctly calls out that `signOut()` defaults to global scope (`src/pages/api/auth/signout.ts:7-10`, `node_modules/@supabase/auth-js/src/GoTrueClient.ts:3759-3766`). But every listed verification stays inside one browser session: unit tests cover only the pure helper, the Playwright gate never backdates `lc-last-activity`, and manual steps 2.5-2.8 use only one browser/profile. An implementation that forgets `{ scope: "local" }` could still satisfy every current success criterion while logging the user out everywhere else.
- **Fix**: Add one manual verification step that signs the same user in from a second browser/profile (or equivalent second session), expires session A, and confirms session B still reaches `/dashboard`.
- **Decision**: **RESOLVED — FIXED.** Added as Phase 2 manual criterion + Manual Testing step 5 + Progress 2.9. See Resolution (2026-07-08).
