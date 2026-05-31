import type { APIRoute } from "astro";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createPhotoJob } from "@/lib/services/photo-job.service";
import { createPhotoJobRequestSchema } from "@/lib/services/photo-job.schema";

export const prerender = false;

/** Minimal JSON responder. Error bodies follow the CLAUDE.md envelope and never include `status`. */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Mint a signed upload URL + create a `queued` job row for a signed-in user.
 *
 * Auth-gated (401 for anonymous). The body carries only `fileExtension` +
 * `mimeType` (zod-validated, advisory); the authoritative `userId` comes from
 * the session, never the body. The source path is derived server-side by
 * `createPhotoJob`. Cloud bytes are uploaded by the client directly to the
 * returned absolute `uploadUrl` (raw PUT) — this route never proxies them.
 */
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: { code: "unauthorized", message: "Sign in to use Cloud AI." } }, 401);
  }

  // Defensive parse: a malformed / non-JSON body is a client error (400),
  // not an unexpected server failure (500). Keep it out of the outer catch.
  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: { code: "invalid_body", message: "Request body must be valid JSON." } }, 400);
  }

  const parsed = createPhotoJobRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: { code: "invalid_body", message: "Expected fileExtension (jpg|png) and matching mimeType." } },
      400,
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // eslint-disable-next-line no-console
    console.error("create-job: Supabase admin env is not configured");
    return json({ error: { code: "internal_error", message: "Cloud processing is unavailable." } }, 500);
  }

  try {
    const admin = createAdminClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
    const result = await createPhotoJob(admin, {
      userId: user.id,
      fileExtension: parsed.data.fileExtension,
      mimeType: parsed.data.mimeType,
    });
    return json(result, 200);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("create-job failed:", err instanceof Error ? err.message : err);
    return json({ error: { code: "internal_error", message: "Could not create the cloud job." } }, 500);
  }
};
