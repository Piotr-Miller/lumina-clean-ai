import * as Sentry from "@sentry/cloudflare";
import handler from "@astrojs/cloudflare/entrypoints/server";

/**
 * Sentry-wrapped Worker entry point (workerd / Astro 6 + @astrojs/cloudflare v13).
 *
 * `wrangler.jsonc` `main` points here instead of the adapter default so the whole
 * fetch handler runs inside a Sentry request scope — established above
 * `src/middleware.ts`, which is left untouched.
 *
 * Tracing is DISABLED in Phases 1-2 (`tracesSampleRate: 0`). The placeholder
 * `stripObviousUrls` below only redacts the error-event request URL/query — it
 * does NOT walk `event.spans[]` or breadcrumbs, where signed `result.*`/`source.*`
 * URLs (incl. tokens) would land once tracing is on. So tracing stays off until
 * Phase 3 enables it (0.05) together with the shared
 * `src/lib/observability/sentry-scrub.ts` that covers event body, request fields,
 * spans, and breadcrumbs. The `beforeSendTransaction` hook is kept wired so it's
 * ready when tracing turns back on.
 */
function stripObviousUrls<T extends { request?: { url?: string; query_string?: unknown } }>(event: T): T {
  if (event.request) {
    if (typeof event.request.url === "string") {
      event.request.url = event.request.url.split("?")[0];
    }
    if (event.request.query_string != null) {
      event.request.query_string = "[redacted]";
    }
  }
  return event;
}

export default Sentry.withSentry(
  (env: { SENTRY_DSN?: string; PUBLIC_SENTRY_ENVIRONMENT?: string }) => ({
    dsn: env.SENTRY_DSN,
    environment: env.PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    sendDefaultPii: false,
    tracesSampleRate: 0, // tracing off until Phase 3's span/breadcrumb scrub lands
    initialScope: { tags: { runtime: "server" } },
    beforeSend: (event) => stripObviousUrls(event),
    beforeSendTransaction: (event) => stripObviousUrls(event),
  }),
  handler,
);
