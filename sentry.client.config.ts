import * as Sentry from "@sentry/astro";
import { PUBLIC_SENTRY_DSN, PUBLIC_SENTRY_ENVIRONMENT } from "astro:env/client";

/**
 * Browser SDK init for React 19 islands (client-side errors + light tracing).
 *
 * Auto-detected by `@sentry/astro` via filename convention. The DSN is the
 * public, `PUBLIC_`-prefixed value (same project as the server).
 *
 * Tracing is DISABLED in Phases 1-2 (`tracesSampleRate: 0`). The placeholder
 * `stripObviousUrls` only redacts the error-event request URL/query — it does NOT
 * walk `event.spans[]` or breadcrumbs, so the signed `result.*` fetch the browser
 * performs (an http span carrying the tokened URL) would leak if tracing were on.
 * Phase 3 re-enables tracing together with the shared scrub module that covers
 * spans + breadcrumbs. The `beforeSendTransaction` hook stays wired for then.
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

Sentry.init({
  dsn: PUBLIC_SENTRY_DSN,
  environment: PUBLIC_SENTRY_ENVIRONMENT,
  sendDefaultPii: false,
  tracesSampleRate: 0, // tracing off until Phase 3's span/breadcrumb scrub lands
  integrations: [Sentry.browserTracingIntegration()],
  initialScope: { tags: { runtime: "client" } },
  beforeSend: (event) => stripObviousUrls(event),
  beforeSendTransaction: (event) => stripObviousUrls(event),
});
