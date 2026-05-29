import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const INVALID_LINK_MESSAGE = "That reset link is invalid or has expired. Please request a new one.";

function invalidLink(context: Parameters<APIRoute>[0]) {
  return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(INVALID_LINK_MESSAGE)}`);
}

export const GET: APIRoute = async (context) => {
  const params = context.url.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  // Require the recovery token. `type` is only a sanity check: the template
  // hardcodes `type=recovery`, so anything else is a malformed/forged link.
  if (!tokenHash || (type && type !== "recovery")) {
    return invalidLink(context);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return invalidLink(context);
  }

  // verifyOtp establishes the recovery session by setting cookies via the SSR
  // adapter. Only after this succeeds does Astro.locals.user populate.
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });

  if (error) {
    return invalidLink(context);
  }

  // Fixed internal destination — never honor a query-param `next` here (the
  // template hardcodes it; trusting a URL `next` would be an open redirect).
  return context.redirect("/auth/reset-password");
};
