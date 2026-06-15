import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { resetPasswordResponse } from "@/lib/services/reset-password.handler";

export const prerender = false;

// Thin env shell: build the request-scoped client (reads astro:env) and delegate
// the entire request→redirect decision to the env-free core so it stays
// unit-testable. No redirect logic of its own — every outcome (sent / send-error /
// not-configured / malformed-form) is decided by resetPasswordResponse.
export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  const path = await resetPasswordResponse({ supabase, request: context.request });
  return context.redirect(path);
};
