import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;

  const supabase = createClient(context.request.headers, context.cookies);

  // Always show a generic success to avoid leaking which emails have accounts.
  // No `redirectTo` is passed: the recovery email template hardcodes the
  // post-confirm `next` target, so Supabase's `.RedirectTo` / redirect
  // allowlist is not involved in this flow.
  if (supabase) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      // Swallowed from the user (anti-enumeration), but logged so a rate-limited
      // or misconfigured send is observable server-side. Note: under the global
      // email_sent cap, a legitimate over-cap request shows success yet delivers
      // no email — accepted for MVP, mitigated by higher prod SMTP limits.
      // eslint-disable-next-line no-console
      console.error("resetPasswordForEmail failed:", error.message);
    }
  } else {
    // eslint-disable-next-line no-console
    console.error("resetPasswordForEmail skipped: Supabase is not configured");
  }

  return context.redirect("/auth/forgot-password?sent=1");
};
