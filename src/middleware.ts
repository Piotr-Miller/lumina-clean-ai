import { defineMiddleware } from "astro:middleware";
import { parseCookieHeader } from "@supabase/ssr";
import { createClient } from "@/lib/supabase";
import { ACTIVITY_COOKIE, IDLE_SIGNOUT_MESSAGE, decideIdleAction } from "@/lib/idle-session";

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

  // Idle-session enforcement (change `session-idle-timeout`): a session with no
  // server-visible activity for IDLE_TIMEOUT_MS is signed out on its next
  // request. Policy lives in @/lib/idle-session (pure, unit-tested); this block
  // is a mechanical switch. Deleting the cookie on anon requests (`cleanup`)
  // makes stale-cookie carryover into a fresh session structurally impossible —
  // the signin POST itself passes through here as anon.
  let idleExpired = false;
  const nowMs = Date.now();
  const idleAction = decideIdleAction(context.locals.user !== null, context.cookies.get(ACTIVITY_COOKIE)?.value, nowMs);
  switch (idleAction) {
    case "cleanup":
      context.cookies.delete(ACTIVITY_COOKIE, { path: "/" });
      break;
    case "start":
    case "refresh":
      // Persistent maxAge (not a session cookie) on purpose: the idle window
      // must survive a browser restart — the sb-* auth cookies do.
      context.cookies.set(ACTIVITY_COOKIE, String(nowMs), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      break;
    case "expire": {
      if (supabase) {
        try {
          // `scope: "local"` — this browser only (also revokes this session's
          // refresh token server-side). The supabase-js default is `global`,
          // which would sign the user out of every device.
          const { error } = await supabase.auth.signOut({ scope: "local" });
          if (error) throw error;
        } catch (err) {
          // Fail-closed fallback (plan-review F1): on an unexpected error,
          // auth-js returns BEFORE removing the session, so the SSR client
          // never deletes the sb-* auth cookies and the next request would
          // re-authenticate. Purge them by prefix (covers the base auth-token
          // cookie, its chunked .0/.1… variants, and the code-verifier).
          // eslint-disable-next-line no-console
          console.error(`idle-session: signOut failed, purging sb-* cookies: ${String(err)}`);
          for (const { name } of parseCookieHeader(context.request.headers.get("Cookie") ?? "")) {
            if (name.startsWith("sb-")) {
              context.cookies.delete(name, { path: "/" });
            }
          }
        }
      }
      context.cookies.delete(ACTIVITY_COOKIE, { path: "/" });
      context.locals.user = null;
      idleExpired = true;
      break;
    }
    case "noop":
      break;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect(
        idleExpired ? `/auth/signin?error=${encodeURIComponent(IDLE_SIGNOUT_MESSAGE)}` : "/auth/signin",
      );
    }
  }

  if (context.locals.user && REDIRECT_WHEN_AUTHED.some((route) => context.url.pathname.startsWith(route))) {
    return context.redirect("/");
  }

  return next();
});
