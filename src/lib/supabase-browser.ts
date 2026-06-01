import { createClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client factory for the Realtime subscription (S-04).
 *
 * Deliberately a plain `@supabase/supabase-js` client, NOT `@supabase/ssr`:
 * the island only needs the Realtime WebSocket scoped to the user's JWT (the
 * REST/auth surface stays with the SSR cookie client on the server). The anon
 * key is publishable (RLS-gated); the user JWT is applied separately via
 * `client.realtime.setAuth(accessToken)` before subscribing (lesson #3) — not
 * here, so this factory stays a pure constructor.
 *
 * Auth persistence is disabled: this client carries no session of its own, it
 * is fed a short-lived access token by the caller for the lifetime of one job
 * subscription.
 *
 * Return type is inferred from `createClient` rather than annotated explicitly —
 * declaring `SupabaseClient` triggers a generic-defaults mismatch (the exported
 * type uses different generic positions than the `createClient` overload
 * returns). Same rationale as `createAdminClient` in `./supabase-admin`.
 */
export function createBrowserClient(url: string, anonKey: string) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
