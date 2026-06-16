// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";
import sentry from "@sentry/astro";

// https://astro.build/config
export default defineConfig({
  output: "server",
  // @sentry/astro wires the client SDK (sentry.client.config.ts) + source-map
  // upload. Server capture is the custom workerd entry point
  // (sentry.server.config.ts via wrangler `main`), NOT this integration.
  // Source-map auth-token wiring (sourceMapsUploadOptions) is added in Phase 3.
  integrations: [react(), sitemap(), sentry()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Cost guard for the S-04 cloud pipeline. OFF in prod until S-05's daily
      // cap lands; the Edge Function `/start` route no-ops when this is false.
      CLOUD_PIPELINE_ENABLED: envField.boolean({ context: "server", access: "secret", default: false }),
      // S-05 global daily cap: max Cloud AI jobs (across all users) per UTC day.
      // create-job rejects with 429 daily_cap_reached once reached. 0 disables
      // cloud entirely (operator kill-switch).
      CLOUD_DAILY_CAP: envField.number({ context: "server", access: "secret", default: 50 }),
      // Sentry DSN — public by design. Server entry point reads SENTRY_DSN from
      // the workerd env directly; the browser reads PUBLIC_SENTRY_DSN. Same value.
      SENTRY_DSN: envField.string({ context: "server", access: "secret", optional: true }),
      PUBLIC_SENTRY_DSN: envField.string({ context: "client", access: "public", optional: true }),
      // Sentry environment tag (not secret) — segments events by env so local
      // workerd dev / preview / production don't mix. Read by the client via
      // astro:env/client and by the server entry point via the workerd env.
      // Defaults to "development"; CI/prod must set it to "production".
      PUBLIC_SENTRY_ENVIRONMENT: envField.string({ context: "client", access: "public", default: "development" }),
    },
  },
});
