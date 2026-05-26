---
starter_id: 10x-astro-starter
package_manager: npm
project_name: lumina-clean-ai
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: true
  has_ai: true
  has_background_jobs: true
---

## Why this stack

A solo after-hours build with a 3-week MVP budget, gated email+password auth,
real-time push of async results, private file storage with 24-hour retention,
and a Cloud AI image-processing step. 10x Astro Starter is the recommended
default for `(web, js)` and bundles every load-bearing capability in one
opinionated piece: Supabase covers auth, Postgres, private storage with RLS,
and the realtime channel that satisfies FR-010 without bolting on a delivery
subsystem; Astro + React + TypeScript + Tailwind handle the upload UI, the
before/after slider, and the client-side Local engine; Cloudflare Workers is the
cheapest path to first deploy (the `@astrojs/cloudflare` adapter v13+ targets
Workers, not Pages). All four agent-friendly gates pass and
scaffolding confidence is first-class. One scaffolding-time watch-item: the
edge runtime constrains long-running tasks, so the Cloud AI denoising job will
need to run on an external worker (Cloudflare Worker, Fly machine, or
provider-hosted inference) with Supabase Realtime as the push channel back to
the page. CI lands on GitHub Actions with auto-deploy on merge — what the
starter ships with.
