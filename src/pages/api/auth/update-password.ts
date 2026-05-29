import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { validateNewPassword } from "@/lib/auth-validation";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const password = form.get("password") as string;
  const confirmPassword = form.get("confirmPassword") as string;

  // Server-side mirror of the client validation (shared pure helper).
  const errors = validateNewPassword(password, confirmPassword);
  const firstError = errors.password ?? errors.confirmPassword;
  if (firstError) {
    return context.redirect(`/auth/reset-password?error=${encodeURIComponent(firstError)}`);
  }

  // Carries the recovery-session cookies set at /auth/confirm.
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/reset-password?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return context.redirect(`/auth/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  // The recovery session is now a full session — leave the user signed in.
  return context.redirect("/");
};
