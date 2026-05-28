import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Build a Supabase client authenticated with the service-role key.
 *
 * Lives in its own module (not alongside the SSR `createClient` in
 * `supabase.ts`) because tests need to import this factory under a Vitest
 * Node environment where `astro:env/server` does not resolve. Keeping the
 * admin client free of that import means the whole module graph stays
 * loadable from Node.
 *
 * The factory takes env as a parameter rather than reading it itself —
 * Astro production callers resolve `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
 * from `astro:env/server` at the call site and pass them in; tests resolve
 * the same names from `process.env`.
 *
 * Deliberately asymmetric with the SSR `createClient` (in `./supabase`) —
 * that factory returns `null` when env is missing so anonymous routes
 * degrade gracefully; this one throws because admin operations have no
 * anon-equivalent fallback and a missing service-role key is a
 * configuration error, not a graceful degradation case.
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
