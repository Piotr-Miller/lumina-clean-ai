import * as Sentry from "@sentry/cloudflare";
import handler from "@astrojs/cloudflare/entrypoints/server";

/**
 * Sentry-wrapped Worker entry point (workerd / Astro 6 + @astrojs/cloudflare v13).
 *
 * `wrangler.jsonc` `main` points here instead of the adapter default so the whole
 * fetch handler runs inside a Sentry request scope — established above
 * `src/middleware.ts`, which is left untouched.
 *
 * Tracing is enabled from this phase, so BOTH `beforeSend` (errors) and
 * `beforeSendTransaction` (spans) carry a scrub. This is a minimal placeholder:
 * Phase 3 replaces `stripObviousUrls` with the shared
 * `src/lib/observability/sentry-scrub.ts` covering event body, request fields,
 * spans, and breadcrumbs. The placeholder exists now so signed URLs in spans are
 * not shipped unscrubbed before Phase 3 lands.
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
  (env: { SENTRY_DSN?: string }) => ({
    dsn: env.SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    initialScope: { tags: { runtime: "server" } },
    beforeSend: (event) => stripObviousUrls(event),
    beforeSendTransaction: (event) => stripObviousUrls(event),
  }),
  handler,
);
