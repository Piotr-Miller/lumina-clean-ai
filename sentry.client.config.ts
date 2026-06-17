import * as Sentry from "@sentry/astro";
import { PUBLIC_SENTRY_DSN, PUBLIC_SENTRY_ENVIRONMENT } from "astro:env/client";
import { scrubEvent } from "@/lib/observability/sentry-scrub";

/**
 * Browser SDK init for React 19 islands (client-side errors + light tracing).
 *
 * Auto-detected by `@sentry/astro` via filename convention. The DSN is the
 * public, `PUBLIC_`-prefixed value (same project as the server).
 *
 * Light tracing (5%) is on. The shared `scrubEvent` runs on BOTH `beforeSend`
 * (errors) and `beforeSendTransaction` (spans) — the browser performs the signed
 * `result.*` fetch, which becomes an http span carrying the tokened URL, so the
 * span hook is required, not just `beforeSend`.
 */
Sentry.init({
  dsn: PUBLIC_SENTRY_DSN,
  environment: PUBLIC_SENTRY_ENVIRONMENT,
  sendDefaultPii: false,
  tracesSampleRate: 0.05,
  integrations: [Sentry.browserTracingIntegration()],
  initialScope: { tags: { runtime: "client" } },
  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
});
