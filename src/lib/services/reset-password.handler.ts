import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Env-free core of POST /api/auth/reset-password (the forgot-password form post).
 *
 * Owns the ENTIRE request→redirect-path decision so it can be unit-tested under
 * Node without `astro:env` (Lesson #4: the route imports `createClient` from
 * `@/lib/supabase`, which imports `astro:env/server` at module top and so cannot
 * load under Vitest). The thin route wrapper (`src/pages/api/auth/reset-password.ts`)
 * builds the request-scoped supabase client and calls `context.redirect(<path>)`.
 *
 * Anti-enumeration invariant (load-bearing): the success path is reached for BOTH
 * a real send and an unknown email — Supabase's `resetPasswordForEmail` returns no
 * error for a non-existent address by design. The error path is reached only for
 * account-independent infrastructure failures (rate-limit, SMTP, misconfig), so a
 * single fixed neutral message leaks nothing. NEVER branch the copy on the cause
 * and NEVER put `error.message` in the path.
 *
 * Keep this module free of `@/lib/supabase` and `astro:env` imports (the type-only
 * `SupabaseClient` import erases at build, so it does not pull the virtual module).
 */

const FORGOT_PASSWORD_PATH = "/auth/forgot-password";

// Observability seam (Phase 3 of sentry-integration). The app wires Sentry here at
// init so a real send failure (rate-limit / SMTP / misconfig) is captured
// server-side for visibility — WITHOUT changing the neutral client response
// (anti-enumeration) and WITHOUT pulling an SDK into this env-free, test-imported
// module (Lesson #4). Default is no-op. The shared scrub (sentry-scrub.ts) redacts
// email / error.message from the event body AND console breadcrumbs.
type AuthErrorCapture = (error: unknown, context: { tag: string }) => void;
let captureAuthError: AuthErrorCapture = () => undefined;
export function setAuthErrorCapture(fn: AuthErrorCapture): void {
  captureAuthError = fn;
}

/** Shown when the reset email genuinely fails to send (rate-limit / SMTP / misconfig). One fixed string for every cause. */
export const SEND_FAILURE_MESSAGE = "We couldn't send the reset email right now. Please try again in a few minutes.";

/** Shown when the POST body is not a parseable form (mirrors the pre-refactor route copy). */
export const INVALID_REQUEST_MESSAGE = "Invalid request. Please try again.";

function errorPath(message: string): string {
  return `${FORGOT_PASSWORD_PATH}?error=${encodeURIComponent(message)}`;
}

const SENT_PATH = `${FORGOT_PASSWORD_PATH}?sent=1`;

export interface ResetPasswordInput {
  /** Request-scoped SSR supabase client (built by the route); `null` when Supabase is not configured. */
  supabase: SupabaseClient | null;
  /** The inbound form POST. */
  request: Request;
}

/**
 * Decide where the forgot-password POST redirects. Returns a path string (not a
 * `Response`) so it is assertable under Vitest; the route wraps it in
 * `context.redirect`.
 *
 * - malformed/non-form body → `?error=` with INVALID_REQUEST_MESSAGE
 * - supabase not configured → `?error=` with SEND_FAILURE_MESSAGE (logged)
 * - send error → `?error=` with SEND_FAILURE_MESSAGE (logged; `error.message` never in the path)
 * - no error → `?sent=1` (also the unknown-email case — enumeration preserved)
 */
export async function resetPasswordResponse({ supabase, request }: ResetPasswordInput): Promise<string> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorPath(INVALID_REQUEST_MESSAGE);
  }

  const emailValue = form.get("email");
  const email = typeof emailValue === "string" ? emailValue : "";

  if (!supabase) {
    // eslint-disable-next-line no-console
    console.error("resetPasswordForEmail skipped: Supabase is not configured");
    captureAuthError(new Error("resetPasswordForEmail skipped: Supabase is not configured"), {
      tag: "reset_password.not_configured",
    });
    return errorPath(SEND_FAILURE_MESSAGE);
  }

  // Call with NO redirectTo/options — preserve the established behavior: the
  // recovery email template hardcodes the post-confirm target, so passing
  // redirectTo would pull in Supabase's redirect allowlist for no benefit.
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) {
    // Logged so a rate-limited / misconfigured send is observable server-side.
    // The message is NEVER surfaced to the user (anti-enumeration + no detail leak).
    // eslint-disable-next-line no-console
    console.error("resetPasswordForEmail failed:", error.message);
    // Capture server-side for visibility; the scrub strips email/error.message
    // from the event + breadcrumbs. Client response stays the neutral envelope.
    captureAuthError(error, { tag: "reset_password.send_failed" });
    return errorPath(SEND_FAILURE_MESSAGE);
  }

  return SENT_PATH;
}
