import type { APIRoute } from "astro";
import { createPasswordResetClient } from "@/lib/supabase";
import { resetPasswordResponse } from "@/lib/services/reset-password.handler";

export const prerender = false;

// Thin env shell: build the client (reads astro:env) and delegate the entire
// request→redirect decision to the env-free core so it stays unit-testable. No
// redirect logic of its own — every outcome (sent / send-error / not-configured
// / malformed-form) is decided by resetPasswordResponse.
//
// Uses createPasswordResetClient, NOT the request-scoped SSR client: the SSR
// client forces the PKCE flow, which binds the emailed recovery link to this
// browser and breaks the reset when the mail is opened on another device
// (FR-015). This leg needs no session or cookies at all.
export const POST: APIRoute = async (context) => {
  const supabase = createPasswordResetClient();
  const path = await resetPasswordResponse({ supabase, request: context.request });
  return context.redirect(path);
};
