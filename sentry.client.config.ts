import * as Sentry from "@sentry/astro";
import { PUBLIC_SENTRY_DSN } from "astro:env/client";

/**
 * Browser SDK init for React 19 islands (client-side errors + light tracing).
 *
 * Auto-detected by `@sentry/astro` via filename convention. The DSN is the
 * public, `PUBLIC_`-prefixed value (same project as the server).
 *
 * Tracing is on, so the signed `result.*` fetch the browser performs would be
 * captured as an http span — hence the placeholder scrub runs on BOTH
 * `beforeSend` and `beforeSendTransaction`. Phase 3 replaces `stripObviousUrls`
 * with the shared scrub module.
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
  sendDefaultPii: false,
  tracesSampleRate: 0.05,
  integrations: [Sentry.browserTracingIntegration()],
  initialScope: { tags: { runtime: "client" } },
  beforeSend: (event) => stripObviousUrls(event),
  beforeSendTransaction: (event) => stripObviousUrls(event),
});
