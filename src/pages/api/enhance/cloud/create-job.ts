import type { APIRoute } from "astro";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUD_DAILY_CAP } from "astro:env/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createCloudJobResponse, json } from "@/lib/services/cloud-create-job.handler";

export const prerender = false;

/**
 * Thin env-coupled shell for POST /api/enhance/cloud/create-job.
 *
 * Reads the three `astro:env/server` values, keeps the env-presence 500 guard,
 * builds the service-role admin client, and delegates the full request→response
 * logic to the env-free `createCloudJobResponse` core. Splitting the core out of
 * this `astro:env/server` importer lets Vitest exercise the route-boundary
 * contract under Node (Lesson #4); this wrapper stays manually verified.
 */
export const POST: APIRoute = async (context) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // eslint-disable-next-line no-console
    console.error("create-job: Supabase admin env is not configured");
    return json({ error: { code: "internal_error", message: "Cloud processing is unavailable." } }, 500);
  }

  const admin = createAdminClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

  return createCloudJobResponse({
    user: context.locals.user,
    request: context.request,
    admin,
    cap: CLOUD_DAILY_CAP,
  });
};
