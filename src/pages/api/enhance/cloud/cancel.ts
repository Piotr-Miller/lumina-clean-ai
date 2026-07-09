import type { APIRoute } from "astro";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { cancelCloudJobResponse, json } from "@/lib/services/cancel.handler";

export const prerender = false;

/**
 * Thin env-coupled shell for POST /api/enhance/cloud/cancel.
 *
 * Reads the two `astro:env/server` values, keeps the env-presence 500 guard,
 * builds the service-role admin client, and delegates the full request→response
 * logic to the env-free `cancelCloudJobResponse` core. Splitting the core out of
 * this `astro:env/server` importer lets Vitest exercise the route-boundary
 * contract (incl. cross-user IDOR) under Node (Lesson #4); this wrapper stays
 * manually verified. Mirrors `timeout.ts`.
 *
 * `edge: null` for now — Phase 2 fills it with `EDGE_FUNCTION_URL` +
 * `DB_WEBHOOK_SECRET` to proxy the Replicate compute-cancel to the Edge Function.
 */
export const POST: APIRoute = async (context) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // eslint-disable-next-line no-console
    console.error("cancel: Supabase admin env is not configured");
    return json({ error: { code: "internal_error", message: "Cloud processing is unavailable." } }, 500);
  }

  const admin = createAdminClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

  return cancelCloudJobResponse({
    user: context.locals.user,
    request: context.request,
    admin,
    edge: null,
  });
};
