import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];

// Auth pages a signed-in user has no business seeing — visiting them while
// authenticated redirects home. Deliberately a NARROW allow-list: do NOT
// broaden to a blanket `/auth/*` startsWith. A recovery session presents as
// `locals.user`, so a broad match would bounce users off `/auth/confirm` +
// `/auth/reset-password` and silently break password reset (and would also
// need a `/api/auth/*` carve-out). `/auth/confirm-email` (post-signup) is
// likewise intentionally excluded. This exclusion has no automated regression
// guard — keep the list explicit.
const REDIRECT_WHEN_AUTHED = ["/auth/signin", "/auth/signup", "/auth/forgot-password"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  if (context.locals.user && REDIRECT_WHEN_AUTHED.some((route) => context.url.pathname.startsWith(route))) {
    return context.redirect("/");
  }

  return next();
});
