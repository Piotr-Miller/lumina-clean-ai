---
name: run-local-stack
description: "Start the LuminaClean AI app locally — Astro dev server on :4321 plus the local Supabase stack — and drive it in a browser to confirm a change really works. Carries the Fedora/rootless-podman workarounds this repo needs: the SELinux relabel that stops Postgres crash-looping on `FATAL: invalid secret key`, and the `-x edge-runtime` exclusion that works around a podman volume double-create. Use when asked to run, start, serve, or screenshot the app locally, when `npx supabase start` fails or hangs, or when Postgres restart-loops under podman."
metadata:
  tags: run-app, local-stack, supabase, podman, selinux, fedora, playwright, luminaclean
---

# Run the local stack

Verified end-to-end on Fedora 7.1 + rootless **podman 5.8.4** (where `docker` is the
podman-docker shim), Node v24.19.0, supabase CLI 2.111.0 — 2026-08-27.

On Docker-proper hosts the two workarounds below are unnecessary but harmless.

## Quick path

```bash
npx supabase start -x edge-runtime     # see "Two podman landmines" if this fails
npm run dev                            # http://localhost:4321
```

Then **drive it** — a served page is not a working page. See "Drive it" below.

## Two podman landmines

Both cost real time to rediscover. Neither is a Supabase bug.

### 1. SELinux → Postgres crash-loops on `invalid secret key`

**Symptom.** `supabase start` sits at "starting" until it times out with
`LegacyHealthCheckTimeoutError`. `podman logs supabase_db_<project>` repeats:

```
/usr/lib/postgresql/bin/pgsodium_getkey.sh: line 8: /etc/postgresql-custom/pgsodium_root.key: Read-only file system
od: write error
FATAL:  invalid secret key
```

**Cause.** The CLI bind-mounts a generated key from
`supabase/.temp/start-secrets/<container>/secret-0`, read-only. Fedora labels anything under the
repo `user_home_t`, so the container process cannot read it, decides the key is missing, and takes
the "generate one" branch — against a read-only mount. Forever. The CLI does not pass `:z`.

**Fix** — relabel the directory, not the file. New files created under it inherit the type, so this
survives the CLI regenerating `.temp` on each start:

```bash
chcon -t container_file_t supabase
```

No root needed (you own the files). Labels are not stored in git, so the repo is unaffected.
Revert with `restorecon -R supabase/`.

**Confirm before fixing** — the label is the tell:

```bash
getenforce                                        # Enforcing
ls -Zd supabase                                   # ...:user_home_t:...  → this is your bug
```

### 2. podman → `volume already exists`, start aborts

**Symptom.** Migrations apply cleanly, then the whole start dies:

```
{"code":"LegacyStartVolumeCreateError","message":"failed to create volume: Error: volume with name supabase_edge_runtime_<project> already exists"}
```

**Cause.** The CLI creates that volume and then creates it again. Docker treats a repeat create as
idempotent; podman returns a hard error. It is deterministic — retrying reproduces it exactly.

**Fix.** Exclude the service:

```bash
npx supabase start -x edge-runtime
```

**What you give up.** `edge-runtime` serves the `enhance` Edge Function, so the Cloud-AI pipeline
cannot complete locally: the engine toggle appears and jobs enqueue, but nothing serves `/start`.
That path needs a real `REPLICATE_API_TOKEN` anyway, so it is not locally reachable regardless — see
`context/foundation/cloud-live-smoke.md` for the manual live smoke. Everything else (auth, DB, RLS,
storage, Realtime, Studio) runs.

## Cleaning up a failed start

`npx supabase stop --no-backup` fails under podman with `failed to prune volumes`, leaving stale
volumes that abort the *next* start. Remove them by hand:

```bash
podman volume ls --format '{{.Name}}' | grep supabase | xargs -r podman volume rm
```

⚠️ This deletes the local dev database. Check `podman volume ls --format '{{.Name}}\t{{.CreatedAt}}'`
first and confirm with the user before dropping a volume you did not just create — a half-initialized
volume announces itself as `role "postgres" does not exist` in the DB log.

## Wiring the app to the stack

`supabase start` prints the keys as JSON on its last line (`ANON_KEY`, `SERVICE_ROLE_KEY`); re-read
them any time with `npx supabase status -o env`. Write `.env` (gitignored):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
CLOUD_PIPELINE_ENABLED=false
CLOUD_DAILY_CAP=50
PUBLIC_SENTRY_ENVIRONMENT=development
```

The local keys are the fixed Supabase demo keys — not secrets, but `.env` stays gitignored.

Every Supabase var is `optional: true` in the `astro.config.mjs` env schema, so **the dev server
boots with no `.env` at all** — the landing page and the local Canvas engine work fully anonymous.
You only need `.env` for auth and anything cloud. `npm run dev` logs `Using secrets defined in .env`
when it picked the file up; restart it after writing `.env`.

Useful ports: app `4321`, API `54321`, DB `54322`, Studio `54323`, Mailpit `54324`.

## Drive it

`npm run dev` is Node/Vite, **not** workerd — for runtime fidelity use
`npm run build && npx wrangler dev` (and note the stale-`dist/` trap in AGENTS.md: verify a build by
grepping `dist/client/_astro/`, never by exit code).

Write the driver **to the repo root** — a script under a temp dir cannot resolve `@playwright/test`,
and there is no bare `playwright` package here. Import from `@playwright/test`, delete the script
when done.

```js
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
p.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await p.goto("http://localhost:4321/", { waitUntil: "networkidle" });
await p.getByLabel("Upload an image").setInputFiles("tests/e2e/fixtures/night-rgb.jpg");
await p.getByRole("button", { name: "Enhance" }).click();
await p.getByRole("slider", { name: /Before and after comparison/ }).waitFor({ timeout: 60000 });
await p.screenshot({ path: "/tmp/result.png" });
await b.close();
```

**Look at the screenshot.** The enhance flow passes through an "Enhancing…" state in which a
`Download` button is already matchable — waiting on that alone screenshots a spinner and reads as
success. Wait for the **comparison slider**; it only exists once a result rendered.

Known-good handles (these mirror `tests/e2e/*.spec.ts` — reuse, don't invent):

| What | Locator |
|---|---|
| file input | `getByLabel("Upload an image")` |
| run local engine | `getByRole("button", { name: "Enhance" })` |
| result rendered | `getByRole("slider", { name: /Before and after comparison/ })` |
| engine toggle | `getByRole("group", { name: "Processing engine" }).getByRole("button", { name: "Cloud AI" })` |

Fixture night photo: `tests/e2e/fixtures/night-rgb.jpg`.

### Auth, locally

`supabase/config.toml` sets `enable_confirmations = false`, so **signup signs the user straight in**.
The post-signup redirect to `/auth/confirm-email` is UX chrome, not a gate — do not go hunting in
Mailpit for a confirmation link, and do not then try `/auth/signin`, which has no form to fill
because the session already exists. Go straight to `/dashboard`.

Sanity checks worth asserting: anonymous `/dashboard` → 302; signed-in `/dashboard` → 200; the
`Cloud AI` engine button appears only once signed in.

## Routes

There is **no `/enhance` page** — the enhance island is mounted on `/` (`src/pages/index.astro`).
Guides are `/guides/<slug>` with slugs from `src/content/guides/` (`/guides` itself is 404).
