import type { SupabaseClientOptions } from "@supabase/supabase-js";

/**
 * Client options for the password-reset SEND leg (FR-015 cross-device fix).
 *
 * WHY THIS EXISTS AT ALL: `@supabase/ssr`'s `createServerClient` hardcodes
 * `flowType: "pkce"` and overrides any value the caller passes. PKCE binds the
 * emailed recovery token to a code verifier stored in the requesting browser,
 * so the link mints as `token_hash=pkce_…` and `verifyOtp` succeeds ONLY in
 * that same browser. Open the mail on a phone — the common case, since people
 * request the reset on a laptop and read mail on a handset — and `/auth/confirm`
 * fails and bounces to forgot-password with "invalid or expired".
 *
 * The send leg needs no session and no cookies: it is one anonymous server-side
 * call that asks Supabase to mail a link. Building it with plain supabase-js
 * under the IMPLICIT flow mints a plain OTP `hashed_token`, which verifies from
 * any device — exactly what the ops script `scripts/generate-recovery-link.ts`
 * has been producing by hand all along.
 *
 * `flowType` is set EXPLICITLY rather than left to the library default (which
 * is implicit today): this value is the entire point of the module, so a future
 * upstream default change must not silently re-break cross-device reset.
 *
 * Session options are off because there is no session here — `persistSession`
 * would have this server-side client write to storage it must never own, and
 * `autoRefreshToken` would start a timer in a Worker request context.
 *
 * Exported from an env-free module (no `astro:env` import) so it is assertable
 * under Vitest, following the same split as reset-password.handler.ts.
 */
export const PASSWORD_RESET_CLIENT_OPTIONS = {
  auth: {
    flowType: "implicit",
    persistSession: false,
    autoRefreshToken: false,
  },
} as const satisfies SupabaseClientOptions<"public">;
