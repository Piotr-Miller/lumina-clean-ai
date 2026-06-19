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
  // locally → upload is skipped (build still succeeds). Source-map generation is
  // configured explicitly in the `vite` block below for BOTH the SSR build and
  // the client island build (Astro 6 needs the client env key — see that
  // comment). `filesToDeleteAfterUpload` below deletes the emitted maps AFTER
  // upload so they never ship publicly (follow-up 3.7 — see
  // context/changes/sentry-prod-sourcemaps).
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
        // Delete the emitted maps AFTER upload so they never ship publicly. Each
        // of Astro's two sequential builds uploads (in writeBundle `try`) before
        // this deletion (`finally`), so the repo-wide glob is safe — no cross-build
        // race. Set explicitly (not left to @sentry/astro's auto-inject) so it
        // applies even though `vite.build.sourcemap` is now configured.
        filesToDeleteAfterUpload: ["./dist/**/*.map"],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    // Source-map generation for BOTH builds (follow-up 3.7). Astro 6 reads the
    // CLIENT island build's sourcemap ONLY from `vite.environments.client.build`
    // (astro core static-build.js — the client env defaults to `false` and does
    // NOT inherit `vite.build.sourcemap`); `vite.build.sourcemap` drives the SSR
    // build. `@sentry/astro` only sets `vite.build.sourcemap`, so without the
    // client-env key the client never emits maps → prod client frames stay
    // minified. Setting `vite.build.sourcemap` here also flips @sentry/astro off
    // its "unset" path so it does NOT auto-inject a delete glob (we set our own).
    build: { sourcemap: "hidden" },
    environments: {
      client: {
        build: { sourcemap: "hidden" },
      },
    },
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
