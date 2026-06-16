import * as Sentry from "@sentry/cloudflare";
import handler from "@astrojs/cloudflare/entrypoints/server";
import { scrubEvent } from "@/lib/observability/sentry-scrub";
import { setObservabilityWarnCapture } from "@/lib/services/photo-job.service";
import { setAuthErrorCapture } from "@/lib/services/reset-password.handler";

// Wire the shared job-service swallow sites to capture as Sentry warnings, and the
// auth-path send failures as scoped exceptions. Hooks are stored at module load and
// invoked at request time, when withSentry's per-request scope is active. The scrub
// (beforeSend) redacts email / error.message before anything is sent.
setObservabilityWarnCapture((message) => {
  Sentry.captureMessage(message, "warning");
});
setAuthErrorCapture((error, { tag }) => {
  Sentry.captureException(error, { tags: { route: tag } });
});

/**
 * Sentry-wrapped Worker entry point (workerd / Astro 6 + @astrojs/cloudflare v13).
 *
 * `wrangler.jsonc` `main` points here instead of the adapter default so the whole
 * fetch handler runs inside a Sentry request scope — established above
 * `src/middleware.ts`, which is left untouched.
 *
 * Light tracing (5%) is on. The shared `scrubEvent` runs on BOTH `beforeSend`
 * (errors) and `beforeSendTransaction` (spans) — `beforeSend` does not see
 * transaction events, so spans need their own hook or signed `result.*`/`source.*`
 * URLs leak via http spans. `release` auto-detects from the `CF_VERSION_METADATA`
 * binding when present.
 */
export default Sentry.withSentry(
  (env: { SENTRY_DSN?: string; PUBLIC_SENTRY_ENVIRONMENT?: string; CF_VERSION_METADATA?: { id?: string } }) => ({
    dsn: env.SENTRY_DSN,
    environment: env.PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    release: env.CF_VERSION_METADATA?.id,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    initialScope: { tags: { runtime: "server" } },
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
  }),
  handler,
);
