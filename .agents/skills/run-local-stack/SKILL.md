---
name: run-local-stack
description: "Start the LuminaClean AI app locally — Astro dev server on :4321 plus the local Supabase stack — and drive it in a browser to confirm a change really works. Carries the host-specific landmines this repo needs: on Linux + rootless podman, the SELinux relabel that stops Postgres crash-looping on `FATAL: invalid secret key` plus the `-x edge-runtime` exclusion for the podman volume double-create; on Windows + Docker Desktop, the HNS port-exclusion range that makes 54321+ unbindable. Use when asked to run, start, serve, or screenshot the app locally, when `npx supabase start` fails or hangs, when Postgres restart-loops under podman, or when a port bind is refused as \"forbidden by its access permissions\"."
metadata:
  tags: run-app, local-stack, supabase, podman, selinux, fedora, windows, docker-desktop, playwright, luminaclean
---

# Run the local stack

Verified end-to-end on Fedora 7.1 + rootless **podman 5.8.4** (where `docker` is the
podman-docker shim), Node v24.19.0, supabase CLI 2.111.0 — 2026-08-27.

The Windows section below is recorded from a session that hit and fixed it on
Windows 11 + Docker Desktop (2026-08-03); it has not been re-verified since.

## Quick path

**Pick your host first** — the start command differs, and the difference is not cosmetic.

**Windows / macOS (Docker Desktop):**

```bash
npx supabase start                     # see "Windows landmine" if the ports refuse to bind
npm run dev                            # http://localhost:4321
```

**Linux + rootless podman:**

```bash
npx supabase start -x edge-runtime     # see the podman landmines below if this fails
npm run dev                            # http://localhost:4321
```

⚠️ **Do not carry `-x edge-runtime` onto a Docker host.** It is not a no-op: it drops the
Edge Function runtime (see "What you give up" under landmine 2), and the podman bug it works
around does not occur on Docker. The canonical Docker command is the plain `npx supabase start`
in `AGENTS.md` §Environment and `context/foundation/test-plan.md` §6.3.

Then **drive it** — a served page is not a working page. See "Drive it" below.

## Linux + rootless podman: two landmines

Both cost real time to rediscover. Neither is a Supabase bug. On Docker-proper hosts neither
occurs — skip this whole section.

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

This cost is the reason the flag is podman-only. On Docker you keep the runtime — do not pay it
for nothing.

## Windows (Docker Desktop): the port-exclusion landmine

**Symptom.** `supabase start` fails immediately on a bind, with nothing actually listening:

```
failed to start docker container "supabase_db_…": ports are not available:
listen tcp 0.0.0.0:54322: bind: An attempt was made to access a socket in a way
forbidden by its access permissions.
```

**Cause.** Windows reserved a dynamic TCP range covering every local Supabase port. Observed
range: **54295–54394**, which swallows 54321–54324. Confirm it:

```bash
netsh interface ipv4 show excludedportrange protocol=tcp
```

It is a *dynamic* reservation (the persistent store is empty) held by **hns** (Host Network
Service). An elevated `net stop winnat && net start winnat` releases other ranges but **not this
one** — even with Docker Desktop and WSL fully shut down. Restarting `winnat` alone is the trap.

**Fix sequence that worked** (steps 2–3 need an elevated shell / UAC):

1. `Stop-Process -Name 'Docker Desktop' -Force` and `wsl --shutdown`
2. Elevated: `Restart-Service hns -Force`, **then** `net stop winnat && net start winnat`
3. Verify: `netsh interface ipv4 show excludedportrange protocol=tcp` → the 54xxx range is gone
4. Start Docker Desktop, wait for the engine, then run `npx supabase start` **immediately** —
   bind the ports before anything re-reserves the range

**Agent gotchas.** Elevating from the agent shell (`Start-Process powershell -Verb RunAs -Wait`)
pops a UAC prompt the user must click, and a 120 s tool timeout backgrounds the wait — use
`timeout: 600000`. Elevated stdout is not captured, so have the elevated script log to a file;
elevated `powershell` is WinPS5, whose `Out-File` writes UTF-16 (read that log with the Read tool,
not `grep`).

**Aftershock.** The Docker engine may bounce later (observed ~20 min in): all supabase containers
restart and a running `npx supabase functions serve enhance` dies with
`failed to copy docker logs … wsarecv: connection forcibly closed`. Just re-run `functions serve`
— a healthy endpoint answers HTTP 404 on a bare GET; 503 means the runtime is gone.

**Also on Windows:** `npm run build` can exit 0 without building when a leftover `workerd` process
tree still holds `dist/`, and killing `wrangler` does not clear it — the children outlive the
parent. See the `npm run build` entry in `AGENTS.md` §Commands; verify a build by grepping
`dist/client/_astro/`, never by exit code.

## Cleaning up a failed start

**podman.** `npx supabase stop --no-backup` fails with `failed to prune volumes`, leaving stale
volumes that abort the *next* start. Remove them by hand:

```bash
podman volume ls --format '{{.Name}}' | grep supabase | xargs -r podman volume rm
```

**Docker.** `npx supabase stop --no-backup` prunes correctly; you should not need the manual step.
If you do, it is the same command with `docker` in place of `podman`.

⚠️ Either way this deletes the local dev database. Check
`podman volume ls --format '{{.Name}}\t{{.CreatedAt}}'` (or `docker volume ls`) first and confirm
with the user before dropping a volume you did not just create — a half-initialized volume
announces itself as `role "postgres" does not exist` in the DB log.

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
when done. Keep the screenshot beside it (a bare relative path) rather than `/tmp` — on Windows a
Node process resolves `/tmp/x.png` to `C:\tmp\x.png`. Delete both when done.

```js
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
p.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await p.goto("http://localhost:4321/", { waitUntil: "networkidle" });
await p.getByLabel("Upload an image").setInputFiles("tests/e2e/fixtures/night-rgb.jpg");
await p.getByRole("button", { name: "Enhance" }).click();
await p.getByRole("slider", { name: /Before and after comparison/ }).waitFor({ timeout: 60000 });
await p.screenshot({ path: "local-run-result.png" });
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
