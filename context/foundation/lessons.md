# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Revoke Supabase's blanket grants from anon + authenticated, but never from service_role

- **Context**: Any new table in `public.*` created via a Supabase migration where RLS will be the primary defense.
- **Problem**: Supabase's bootstrap applies default-privilege grants (SELECT/INSERT/UPDATE/DELETE/REFERENCES/TRIGGER/TRUNCATE) to `anon`, `authenticated`, **and** `service_role` on every new public table. Without an explicit REVOKE, anon has grant-layer access (only RLS stops it) — one stray RLS policy unlocks the data. But if the REVOKE also covers `service_role`, every admin-client code path breaks with `permission denied for table X`: service_role has BYPASSRLS, but Postgres grants and RLS are orthogonal gates.
- **Rule**: In every new-table migration, `revoke all on <table> from anon, authenticated;` then re-grant only the minimum the RLS policies act on (typically `select, insert` for owner-scoped tables). Do NOT revoke from `service_role` — leave its blanket grants intact so admin-client code paths keep working.
- **Applies to**: plan, plan-review, implement, impl-review

## Tables broadcasting RLS-scoped UPDATE/DELETE via Realtime need REPLICA IDENTITY FULL

- **Context**: Any table added to the `supabase_realtime` publication that has RLS AND will broadcast UPDATE or DELETE events to user-JWT-scoped subscribers.
- **Problem**: Supabase Realtime evaluates the RLS SELECT policy against BOTH the old and new row state before delivering an UPDATE/DELETE event. The default `REPLICA IDENTITY` carries only primary-key columns in the WAL, so Realtime can't reconstruct the old row's full state to run the RLS check — and silently drops the event. Subscribers see SUBSCRIBED, then nothing.
- **Rule**: In the same migration that adds a table to `supabase_realtime`, also run `alter table <table> replica identity full;` if user-JWT subscribers will ever receive UPDATE or DELETE events. INSERT-only broadcasts don't need it.
- **Applies to**: plan, implement, impl-review

## supabase-js HTTP-header auth alone does NOT authenticate the Realtime WebSocket

- **Context**: Any supabase-js client constructed with `global.headers.Authorization = Bearer <jwt>` (the common pattern for sharing a user JWT across REST calls) that will also subscribe to a Realtime channel.
- **Problem**: PostgREST reads the HTTP Authorization header on each request, so REST calls run as the user (RLS applies). But supabase-js maintains a SEPARATE auth channel for the Realtime WebSocket — without explicit auth, it connects as anon, RLS sees `auth.uid() = null`, and the SELECT policy excludes every row from delivery. Subscriptions appear to succeed (SUBSCRIBED status) but never receive events.
- **Rule**: After building a JWT-scoped supabase-js client, always `await client.realtime.setAuth(jwt)` before subscribing to channels. Alternatively, use `auth.setSession({access_token, refresh_token})` which propagates auth to both REST and Realtime in one step.
- **Applies to**: plan, implement, impl-review

## Server-only service-role clients live in their own module, not next to `astro:env/server` importers

- **Context**: Astro projects where some server modules import from `astro:env/server` and a server-only utility (e.g. service-role Supabase client) is added that needs to be callable from a Vitest Node environment.
- **Problem**: JS module loading is all-or-nothing. Co-locating the new utility with existing `astro:env/server` importers means any test importing the utility loads the whole module — and Vitest's Node environment can't resolve `astro:env/server` (it's an Astro build-time virtual module). The test suite fails at module load with "Cannot find package 'astro:env/server'", even when the utility itself doesn't depend on the virtual module.
- **Rule**: When adding a server-only utility that tests will import (admin clients, signing helpers, etc.), put it in its own file with NO `astro:env/server` imports. Pass env in as a parameter at the call site (production callers resolve from `astro:env/server`; tests resolve from `process.env`). Don't try to make a single module work for both contexts.
- **Applies to**: plan, plan-review, implement

## The Windows checkout has a pre-existing Prettier CRLF baseline — adapt phase-1.2 lint, don't bundle the fix

- **Context**: Any `/10x-implement` phase on a Windows checkout of this repo where `npm run lint` is a success criterion.
- **Problem**: The repo's existing files are CRLF (Windows default) but Prettier expects LF — `npm run lint` reports ~1022 pre-existing `Delete ␍` errors regardless of what the current phase touched. Treating this as a phase-blocking failure either stalls the phase or invites a 1000+ file CRLF-normalization commit unrelated to the phase's intent.
- **Rule**: On Windows, treat the lint success criterion as "no NEW errors from this phase's files". Verify by running `npx eslint <touched-files>` after a targeted `npx prettier --write <touched-files>` to normalize the new/modified files only. Do NOT run `npm run lint:fix` on the whole repo as part of a feature phase — it bundles unrelated normalization into the commit. Repo-wide CRLF cleanup is its own change, with its own plan.
- **Applies to**: implement

## Astro 6 + @astrojs/cloudflare runs dev SSR in workerd — `run_worker_first: true` breaks Vite dev asset serving and island hydration

- **Context**: This project's `astro dev` (Astro 6 with `@astrojs/cloudflare`, `output: "server"`). In Astro 6 the adapter runs dev SSR inside workerd via `@cloudflare/vite-plugin` — dev is no longer a plain Node/Vite server, and `wrangler.jsonc`'s `assets` routing config applies in dev too.
- **Problem**: `wrangler.jsonc` `assets.run_worker_first: true` makes the workerd dev runtime invoke the SSR app for **every** request, including Vite's dev-only asset routes (`/@vite/client`, `/@id/...`, `/src/...`). Those match no SSR route, so Astro returns its 404 page and React islands never hydrate (only page HTML is 200). The tempting-but-wrong diagnosis is to blame `overrides: { vite: ^7.3.2 }` in `package.json` — but that override is the **documented fix** for the adjacent Astro-6 + adapter Vite-8 crash (`require_dist is not a function`); removing it regresses, not helps.
- **Rule**: For an Astro SSR app on `@astrojs/cloudflare`, keep Cloudflare's default **assets-first** routing (omit `run_worker_first`) unless a specific route genuinely needs worker-first — then use the array form (`run_worker_first: ["/route/*"]`), never a blanket `true`. Assets-first still routes SSR pages and `/api/*` to the Worker (middleware runs); only real assets (incl. Vite's dev routes) skip it. Never remove `overrides.vite` to "fix" hydration. Verify a dev-mode change against both `npm run dev` (hydration) and `npm run build && npx wrangler dev` (prod parity + auth middleware).
- **Applies to**: frame, plan, plan-review, implement, impl-review

## Typed ESLint rules crash on `.astro` frontmatter top-level `return` — scope-disable per `.astro`

- **Context**: Any `.astro` page whose frontmatter does an early redirect/guard via a top-level `return Astro.redirect(...)` (e.g. a session guard on a page not covered by middleware's PROTECTED_ROUTES), linted under this repo's typed `typescript-eslint` config (`projectService: true`).
- **Problem**: `astro-eslint-parser` wraps frontmatter in an implicit function whose top-level `return` node has no parent in the produced AST. The typed rule `@typescript-eslint/no-misused-promises` (`checkReturnStatement`) calls `nullThrows` on that missing parent and *throws* — ESLint crashes ("Expected node to have a parent"), which is a hard failure, not a reportable lint error. An inline `// eslint-disable-next-line` does NOT help: the rule crashes during AST traversal before any disable directive is applied.
- **Rule**: Disable the crashing typed rule scoped to `**/*.astro` in the flat config's astro block (`"@typescript-eslint/no-misused-promises": "off"`), keeping it enabled for `.ts`/`.tsx`. `.astro` frontmatter runs server-side once per request, so the void-return footgun this rule guards (async handlers on DOM event attributes) doesn't apply there. Don't fight it with inline disables or by restructuring the guard.
- **Applies to**: implement, impl-review, plan-review

## Client-supplied jobId must route through owner-scoped (user_id-guarded) mutations, never id-only service-role helpers

- **Context**: A service-role (RLS-bypassing) job/resource layer where some helpers are id-only (trust the caller) because they run in trusted contexts (Edge Functions, webhooks), while user-facing API routes accept a client-supplied id. Example: `src/lib/services/photo-job.service.ts` — `getJobById` / `markJobProcessing` / `markJobFailed` are id-only; only `markPendingJobFailedForOwner` carries a `user_id` guard.
- **Problem**: The service-role client bypasses RLS, so an id-only mutation invoked from a user-facing route with a client-supplied `jobId` lets any authenticated user mutate another user's row (IDOR). The ownership check exists in the layer but is opt-in per helper — picking the wrong helper at the call site silently removes the only authorization gate.
- **Rule**: Any route that accepts a client-supplied resource id and mutates it through a service-role client MUST call an owner-scoped helper that filters on the session `user_id` in the SAME write (single atomic guarded UPDATE, e.g. `markPendingJobFailedForOwner`). Never call an id-only service-role mutation from a user-facing route. Keep ownership enforcement in the write, not a read-then-write check.
- **Applies to**: plan, plan-review, implement, impl-review

## Async fire-and-forget enqueue (pg_net / DB webhook) needs a client-side timeout backstop — rows stall silently otherwise

- **Context**: A pipeline where a row transition is driven by an asynchronous, fire-and-forget enqueue — e.g. a Postgres `pg_net` Database Webhook that POSTs to an Edge Function, or any "kick off work, return immediately" handoff with no synchronous ack. Example: S-04's `jobs_enqueue_webhook` trigger + the `/start` flag-off no-op, both of which leave the row `queued`.
- **Problem**: pg_net (and webhooks generally) don't block the INSERT and don't retry or dead-letter on delivery failure. If the POST never lands (worker down, network, non-HTTPS reject, feature flag off), the row sits in its initial state forever with no server-side signal — the UI hangs with no outcome. Server-side retry/dead-letter is explicitly out of scope (no pg_cron reaper here).
- **Rule**: When a user-visible state machine depends on an async fire-and-forget enqueue, there MUST be a client-side (or scheduled) timeout backstop that flips a still-pending row to a terminal `failed` state via an owner-scoped guarded update, covering EVERY non-terminal state the row can be stuck in (e.g. `queued` AND `processing`, not just the "in flight" one). Verify the watchdog's status filter matches all stall points. Relates to [[client-supplied-jobid-must-route-through-owner-scoped-mutations-never-id-only-service-role-helpers]].
- **Applies to**: plan, plan-review, implement, impl-review

## Deno Supabase Edge Functions must be excluded from the Astro tsc/eslint graph — which costs them static coverage; compensate with `deno check`

- **Context**: An Astro project (tsconfig `include: ["**/*"]`, typed eslint `projectService`) that also contains Supabase Edge Functions under `supabase/functions/`. The functions run under Deno — URL imports (`https://esm.sh/...`), a `deno.json` import map, and `Deno.*` globals.
- **Problem**: Left in the Astro graph, the Deno files break `astro check` (unresolved URL/`.ts`-extension imports, undefined `Deno`) and the eslint pre-commit hook (`projectService` can't place them in a tsconfig project). Excluding them (`tsconfig.json` "exclude" + an eslint `ignores` block) is necessary — but the side effect is that `enhance/index.ts` then gets NO static lint/type coverage from `npm run lint` / `astro check`; only the Deno runtime validates it at `supabase functions serve` / deploy time.
- **Rule**: Always exclude `supabase/functions/**` from both tsconfig and the eslint flat config (never try to make one graph serve both runtimes). To recover static coverage on the Deno side, run `deno check supabase/functions/<name>/index.ts` (or `deno lint`) as a separate CI / pre-commit step — using the Supabase-bundled Deno if standalone `deno` isn't on PATH. At minimum, smoke the function via `supabase functions serve` + a probe request so an import-resolution error surfaces before deploy.
- **Applies to**: implement, impl-review, plan

## An insert-triggered DB webhook can outrace the client's later upload — sign the artifact with bounded retry, and test WARM

- **Context**: A pipeline where a DB webhook (pg_net) fires an Edge Function on a row INSERT, but the object that function needs is written by a SEPARATE, later client step. Example: S-04's `jobs_enqueue_webhook` fires `/start` on the `queued` INSERT, while the browser PUTs the source to storage only AFTER `create-job` returns the signed upload URL.
- **Problem**: The webhook fires synchronously on INSERT; the client upload lands hundreds of ms–seconds later. A COLD function masks the race (boot latency lets the upload finish first), so it passes early manual tests — but a WARM function runs `/start` in ~80ms and beats the upload, so `createSignedReadUrl` returns "Object not found" and the job dies `start_failed` before the model is ever called. In prod the function is usually warm, so most submits would fail — yet cold-only testing reports green.
- **Rule**: When an async insert-triggered function depends on an artifact uploaded by a later client step, never assume the artifact exists on first touch. Sign/read it through a bounded retry that distinguishes "not there yet" (retry — upload in flight) from real errors (fail fast), with a budget comfortably under the webhook's async window (~5s). A genuinely-never-uploaded artifact then still fails after exhausting retries (correct). Always validate this path against a WARM function, not just the cold first invocation of a session. Relates to [[async-fire-and-forget-enqueue-pg-net-db-webhook-needs-a-client-side-timeout-backstop-rows-stall-silently-otherwise]].
- **Applies to**: plan, plan-review, implement, impl-review

## A Realtime-driven watchdog must catch up on subscribe and re-read before failing — never fire blindly on a timer

- **Context**: A browser client backstops an async pipeline with a timeout watchdog while driving its UI from Supabase Realtime status events (e.g. S-04's `useCloudJob`: subscribe to the `jobs` row, fail the job if no terminal event arrives in time). The watchdog's budget is split on a mid-state transition — a short window for `queued → processing`, a long one for `processing → terminal` (the cold-boot phase).
- **Problem**: A Realtime channel only delivers events that occur AFTER it is `SUBSCRIBED`. The `queued → processing` flip routinely lands in the gap between submit and subscription-active (and a read fired right after `.subscribe()` can run a hair before the flip commits), so the client never observes `processing`. A watchdog that blindly fires on the short timer then false-fails a job that is actually mid-cold-boot — exactly the case the long budget exists for. (Symptom: jobs that reached `processing` in the DB get killed at the short deadline; `secs_to_terminal ≈ short-budget`.) The same gap means a fast job that completes before subscription would never render.
- **Rule**: (1) Do a one-shot **catch-up read** of the row inside the `.subscribe((status) => …)` callback when `status === SUBSCRIBED` — fold the authoritative current state in, so any transition that landed before the channel went live is not lost (also re-syncs after a reconnect). (2) At a watchdog deadline, **re-read before failing** — only declare a timeout if the row is genuinely still in the pre-progress state; a row that has advanced is folded in (arming the next budget or rendering), never blindly failed. Keep the apply path idempotent + monotonic (a `terminal` guard, a `sawProcessing`-once guard). Relates to [[supabase-js-http-header-auth-alone-does-not-authenticate-the-realtime-websocket]] and [[async-fire-and-forget-enqueue-pg-net-db-webhook-needs-a-client-side-timeout-backstop-rows-stall-silently-otherwise]].
- **Applies to**: plan, plan-review, implement, impl-review

## Size client timeouts AND provider-fetched signed-URL TTLs to the external model's cold-boot ceiling, not its warm latency

- **Context**: A pipeline that calls a scale-to-zero external inference model (Replicate "Bread") which the provider fetches inputs for via a signed URL, and whose result a client watchdog waits on. Phase-0 measured warm ≈ 4s, cold boot ≈ 118–135s.
- **Problem**: Warm latency badly understates the tail. A 60s client watchdog false-fails every cold (scaled-to-zero) job. Worse, the SOURCE signed-read URL the Edge Function mints for the provider has its own TTL: under platform load cold boots were observed **>300s**, so a 300s source-URL TTL **expires before the provider fetches it** → the prediction dies at the source-fetch step (400) in ANY account, not just a throttled one. The ≤30s p95 in the PRD/plan is a WARM-path target; the cold first-request-after-idle is a known multi-minute wait (Phase-0 "relaxed SLA" decision).
- **Rule**: Set the client watchdog above the cold-boot ceiling with margin (S-04 uses 180s for the `processing` phase) and add a progressive "first run after idle can take ~N min" affordance instead of a silent spinner. Independently, sign any provider-fetched URL with a TTL that comfortably outlives the worst-case cold boot (NOT just the warm path) — the artifact must still be valid when a cold machine finally fetches it. Treat cold-start as variable: a fixed budget can still lose to an outlier, which is acceptable IF it surfaces a clear retry rather than hanging. Keep-warm (provider min-instances) is the only real latency fix and is a cost decision (tension with the daily-cap cost bound), deferred. Relates to [[a-realtime-driven-watchdog-must-catch-up-on-subscribe-and-re-read-before-failing-never-fire-blindly-on-a-timer]].
- **Applies to**: plan, plan-review, implement, impl-review
