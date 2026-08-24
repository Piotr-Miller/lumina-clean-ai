import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { PASSWORD_RESET_CLIENT_OPTIONS } from "./services/password-reset-client.options";

// The service-role admin client lives in ./supabase-admin so tests can
// import it without dragging this module's `astro:env/server` import into
// a Vitest Node environment (where that virtual module does not resolve).

/**
 * Client for the password-reset SEND leg ONLY (FR-015 cross-device fix).
 *
 * Deliberately NOT the SSR client: `createServerClient` forces `flowType:
 * "pkce"`, which binds the emailed recovery token to the requesting browser.
 * See PASSWORD_RESET_CLIENT_OPTIONS for the full reasoning. Cookie-less by
 * design — this call establishes no session, it only asks Supabase to send
 * mail (delivered by the project's configured SMTP, unchanged by this).
 *
 * Do not reuse it for anything that needs the caller's session: it reads and
 * writes no cookies, so it is permanently anonymous.
 */
export function createPasswordResetClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createSupabaseClient(SUPABASE_URL, SUPABASE_KEY, PASSWORD_RESET_CLIENT_OPTIONS);
}

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}
