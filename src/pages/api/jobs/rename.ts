import type { APIRoute } from "astro";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "unavailable" }), { status: 500 });
  }

  const body = (await request.json()) as { jobId: string; name: string };

  const admin = createAdminClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
  const { error } = await admin.from("jobs").update({ display_name: body.name }).eq("id", body.jobId);

  if (error) {
    // eslint-disable-next-line no-console
    console.log("rename failed", body.jobId, locals.user.email, error.message);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
