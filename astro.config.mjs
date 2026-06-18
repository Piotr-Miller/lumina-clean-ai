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
  // generation + upload. Server capture is the custom workerd entry point
  // (sentry.server.config.ts via wrangler `main`), NOT this integration.
  // org/project/authToken come from the BUILD env (CI deploy job); absent
  // locally → upload is skipped (build still succeeds). When map generation is
  // left unconfigured, the SDK auto-enables `vite.build.sourcemap: "hidden"`
  // and deletes the emitted maps PER-BUILD after upload — so we deliberately do
  // NOT set `filesToDeleteAfterUpload`: a repo-wide glob raced the adapter's two
  // vite builds (client + server) and dropped maps before upload, leaving prod
  // frames minified (follow-up 3.7 — see context/changes/sentry-prod-sourcemaps).
  integrations: [
    react(),
    sitemap(),
    sentry({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Broad glob is the @sentry maintainer recommendation — the plugin
      // auto-filters to .js/.map and it covers both dist/client and dist/server.
      sourcemaps: {
        assets: ["./dist/**/*"],
      },
    }),
  ],
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
