import type { APIRoute } from "astro";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EDGE_FUNCTION_URL, DB_WEBHOOK_SECRET } from "astro:env/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { cancelCloudJobResponse, json } from "@/lib/services/cancel.handler";

export const prerender = false;

/**
 * Thin env-coupled shell for POST /api/enhance/cloud/cancel.
 *
 * Reads the `astro:env/server` values, keeps the env-presence 500 guard, builds
 * the service-role admin client, and delegates the full request→response logic to
 * the env-free `cancelCloudJobResponse` core. Splitting the core out of this
 * `astro:env/server` importer lets Vitest exercise the route-boundary contract
 * (incl. cross-user IDOR) under Node (Lesson #4); this wrapper stays manually
 * verified. Mirrors `timeout.ts`.
 *
 * `edge` carries the Replicate compute-cancel proxy config. When
 * `EDGE_FUNCTION_URL` + `DB_WEBHOOK_SECRET` are set the handler stops the running
 * prediction via the Edge Function; unset → `null` → cancel degrades to DB-flip +
 * source-delete only (never an error).
 */
export const POST: APIRoute = async (context) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // eslint-disable-next-line no-console
    console.error("cancel: Supabase admin env is not configured");
    return json({ error: { code: "internal_error", message: "Cloud processing is unavailable." } }, 500);
  }

  const admin = createAdminClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
  const edge = EDGE_FUNCTION_URL && DB_WEBHOOK_SECRET ? { url: EDGE_FUNCTION_URL, secret: DB_WEBHOOK_SECRET } : null;

  return cancelCloudJobResponse({
    user: context.locals.user,
    request: context.request,
    admin,
    edge,
  });
};
