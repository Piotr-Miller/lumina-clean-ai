import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

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

/**
 * Build a Supabase client authenticated with the service-role key.
 *
 * The factory takes env as a parameter (rather than importing from
 * `astro:env/server` directly) so it stays callable from a Vitest Node
 * environment where the Astro virtual module does not resolve. Astro
 * production callers resolve `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
 * from `astro:env/server` at the call site and pass them in; tests resolve
 * the same names from `process.env`.
 *
 * Deliberately asymmetric with {@link createClient} — that factory returns
 * `null` when env is missing so anonymous routes degrade gracefully; this
 * one throws because admin operations have no anon-equivalent fallback and
 * a missing service-role key is a configuration error, not a graceful
 * degradation case.
 *
 * **SECURITY WARNING**: this client BYPASSES Row Level Security. Never
 * invoke it from a code path that takes user input without explicit
 * authorization on the caller side (in particular: a `userId` argument to
 * the photo-job.service.ts helpers must come from `context.locals.user.id`,
 * never from a client-supplied value).
 */
export function createAdminClient(env: { url: string; serviceRoleKey: string }) {
  // Return type is inferred from createSupabaseClient rather than annotated
  // explicitly — declaring `SupabaseClient` here triggers a generic-defaults
  // mismatch (supabase-js's exported type uses different generic positions
  // than the createClient overload returns), and inferring keeps the
  // schema-typing path open if a generated Database type is ever wired up.
  if (!env.url || !env.serviceRoleKey) {
    throw new Error(
      "createAdminClient: env.url and env.serviceRoleKey are required (admin client has no graceful-degradation path)",
    );
  }
  return createSupabaseClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
