---
date: 2026-06-09T16:53:42+0200
researcher: Piotr Miller
git_commit: 755065a3585754e30aaf582f633af152dad46b32
branch: master
repository: LuminaClean_AI
topic: "Phase 1 (testing-ci-gate): wire the existing Vitest suite — incl. the Docker/RLS integration suite — into CI"
tags: [research, codebase, ci, github-actions, supabase, vitest, rls, deno-check]
status: complete
last_updated: 2026-06-09
last_updated_by: Piotr Miller
---

# Research: Wire the existing Vitest suite (incl. Docker/RLS) into CI

**Date**: 2026-06-09T16:53:42+0200
**Researcher**: Piotr Miller
**Git Commit**: 755065a3585754e30aaf582f633af152dad46b32
**Branch**: master
**Repository**: LuminaClean_AI

## Research Question

Phase 1 of `context/foundation/test-plan.md` ("Gate the floor — wire existing suite into CI"). The change brief (`context/changes/testing-ci-gate/change.md`) asks to run the existing 11 Vitest files on every push — **including** the Docker/RLS integration suite (`tests/jobs.rls.test.ts`) via an ephemeral local Supabase — and to consider adding a `deno check` step for `supabase/functions/**`. This is a **CI-wiring** change (a regression lock on coverage that already exists), **not** new test logic.

User decisions taken before research (locked):

1. **CI Supabase = ephemeral local (Docker)** — `npx supabase start` + `db reset` on the runner. Not a hosted CI project.
2. **`deno check` = add to the PR-gating job** so PRs static-check the Edge Function too.

## Summary

**The premise in `change.md` and `tests/README.md` — "CI today runs only lint + build" — is stale.** The live `.github/workflows/ci.yml` already does substantially more. The _actual_ Phase 1 gap is narrow and precise:

1. **Only one test file is excluded from CI**: `tests/jobs.rls.test.ts` (the integration suite needing Docker + a live Supabase). The `ci` job already runs `npm run test:unit`, which runs the other 10 files. → Phase 1 = stand up an **ephemeral local Supabase** in CI and run the **full** suite (`npm test`).
2. **`deno check` already exists but only on push-to-master** (in the `deploy` job, `ci.yml:46`), so **PRs never static-check `supabase/functions/**`**. → Phase 1 = also run `deno check`in the PR-gating`ci` job.

The integration suite is **self-contained and ephemeral-friendly**: it creates its own GoTrue users at runtime (`email_confirm: true`, no SMTP), uses one storage bucket (`photos`) that a **migration** creates, needs **no seed file**, and requires exactly **three env vars** (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). `npx supabase start` + `npx supabase db reset` on `ubuntu-latest` (Docker is preinstalled) reproduces the documented dev flow exactly.

**One non-obvious implementation hazard** (the biggest finding for the plan): the canonical way to export local keys — `supabase status -o env >> $GITHUB_ENV` — **persists those values to all later steps in the same job**. The current `ci` job's `build` step deliberately uses the **production** `SUPABASE_URL`/`SUPABASE_KEY` secrets (`ci.yml:25-28`). If local keys are written to `$GITHUB_ENV` _before_ `build`, the build silently runs against the local stack. Mitigation options in §Open Questions — the cleanest is a **separate `integration` job** so the two env regimes never share a process.

**Risk-coverage honesty check**: Phase 1 is a regression lock on _existing_ coverage. That coverage genuinely locks risks **#1** (signature verifier) and **#6** (timing invariants) at the unit layer, and **#5 success-path** + **#4 RLS-table-isolation** at the integration layer. It does **NOT** close the route-level IDOR gap (#4) or the failure-path source-deletion gap (#5) — those are real holes the existing tests don't cover, explicitly deferred to Phase 2/3. The plan must describe Phase 1 as "lock what we have," not "cover risks #1/#4/#5/#6."

## Detailed Findings

### A. Current CI state — what already runs (the corrected baseline)

`.github/workflows/ci.yml` (single workflow file; 69 lines) has **two jobs**:

**`ci` job** (`ci.yml:10-28`) — triggers on push to `master` **and** PRs to `master`:

- `actions/checkout@v5`, `actions/setup-node@v5` (`node-version: 22`, npm cache) — `ci.yml:13-16`
- `npm ci` → `npx astro sync` → `npm run lint` — `ci.yml:18-20`
- `npm run test:unit` — `ci.yml:24` — runs all tests **except** `jobs.rls.test.ts` (the comment at `ci.yml:21-23` says the integration suite "needs Docker + a local Supabase and is excluded — it stays developer-local")
- `npm run build` with **production** secrets `SUPABASE_URL`/`SUPABASE_KEY` — `ci.yml:25-28` (step-scoped `env:`)

**`deploy` job** (`ci.yml:30-69`) — `if: github.ref == 'refs/heads/master' && github.event_name == 'push'` (push-to-master only, never PRs) — `ci.yml:32`:

- `denoland/setup-deno@v2` (`deno-version: v2.x`) → **`deno check supabase/functions/enhance/index.ts`** — `ci.yml:43-46`
- `cloudflare/wrangler-action@v4` (build + deploy) — `ci.yml:51-58`
- `npx supabase functions deploy enhance --use-api --project-ref …` — `ci.yml:66-68`

**All 6 GitHub secrets referenced**: `SUPABASE_URL`, `SUPABASE_KEY` (`ci.yml:27-28,60-61`), `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (`ci.yml:55-56`), `SUPABASE_PROJECT_REF` (`ci.yml:66`), `SUPABASE_ACCESS_TOKEN` (`ci.yml:68`). The `SUPABASE_URL`/`SUPABASE_KEY` secrets are **production** values (prod project, publishable anon key — safe to expose; see `context/foundation/production-config.md`).

**Node parity**: `.nvmrc` = `22.14.0`; CI uses `node-version: 22` — match. ✓

**Stale docs to fix while here** (so the repo stops contradicting itself):

- `tests/README.md` "Why this is not in CI" section claims "CI currently runs only lint + build" — false; it now runs `test:unit` + build, and `deno check` on deploy.
- `context/changes/testing-ci-gate/change.md:20` repeats the same stale "CI today runs only lint+build."

### B. What the integration suite needs in an ephemeral CI Supabase

**Three env vars** (validated at module init, throws if missing — `tests/env.ts:5-15`):

| Var                         | Local value               | Source                                     |
| --------------------------- | ------------------------- | ------------------------------------------ |
| `SUPABASE_URL`              | `http://127.0.0.1:54321`  | `supabase status` "Project URL" / `-o env` |
| `SUPABASE_KEY`              | publishable (anon) key    | `supabase status` "Publishable" / `-o env` |
| `SUPABASE_SERVICE_ROLE_KEY` | secret (service-role) key | `supabase status` "Secret" / `-o env`      |

These feed the shared admin client (`tests/env.ts:21` → `src/lib/supabase-admin.ts` `createAdminClient({ url, serviceRoleKey })`).

**Runtime-created test users — no SMTP, no email confirmation** (`tests/helpers/test-users.ts:19-54`): `auth.admin.createUser({ email_confirm: true })` then `signInWithPassword`. This works because `supabase/config.toml:209` sets `enable_confirmations = false`. Teardown deletes `photos/{userId}/**` objects then the auth row (`tests/helpers/test-users.ts:62-101`) — storage does not cascade.

**One storage bucket `photos`, created by migration** (not by config, not by seed):

- `supabase/migrations/20260528120100_create_photos_storage.sql:22-33` — creates the private `photos` bucket (25 MB cap, jpeg/png/heic) plus prefix-scoped `storage.objects` RLS for `authenticated` (`:46-84`).
- Hardcoded bucket name `"photos"` in `tests/jobs.rls.test.ts:7`, `src/lib/services/photo-job.service.ts:12`.

**Migrations applied by `supabase db reset`** (4 files; `npx supabase db reset` runs them all):

- `20260528120000_create_jobs_table.sql` — `public.jobs` + status enum + RLS (`authenticated` SELECT/INSERT own rows; `anon` revoked) + indexes + Realtime publication.
- `20260528120100_create_photos_storage.sql` — `photos` bucket + storage RLS.
- `20260531120000_jobs_enqueue_webhook.sql` and `20260608120000_jobs_webhook_vault.sql` — the DB-webhook trigger (GUC → Vault migration). **Vault secrets are NOT required for the RLS suite** — the trigger no-ops if unset, and these tests don't exercise the webhook.

**No `seed.sql` exists** — `config.toml:65` references `./seed.sql` but the file is absent; all test data is created at runtime. (`supabase db reset --no-seed` is therefore equivalent; default is fine.)

**`package.json` scripts**: `test: "vitest run"` (all), `test:unit: "vitest run --exclude '**/jobs.rls.test.ts'"` (`package.json:13-14`). `supabase` CLI is a devDependency, **`^2.23.4`** (`package.json:56`) — invoke via `npx supabase` for a pinned, deterministic version (no global install).

**Runner needs**: Docker (preinstalled on `ubuntu-latest`), Node 22, ports 54321-54324 + 54320/54322 (`config.toml`), and a one-time image pull (~1-2 min, cacheable). `vitest.config.ts` sets `testTimeout: 30_000` and a serial-friendly model (UUID-suffixed users avoid cross-file clashes).

### C. The CI mechanism for ephemeral local Supabase (grounded via Context7 — `/supabase/cli`)

Canonical CI sequence (matches `tests/README.md`):

```bash
npx supabase start          # boots Postgres+Auth+Storage+PostgREST in Docker
npx supabase db reset        # applies all migrations (creates jobs table + photos bucket)
# export the three keys (see hazard below), then:
npm test                     # full suite incl. jobs.rls.test.ts
```

**Key extraction** — `supabase status` supports machine output:

- `supabase status -o env` emits sourceable `KEY=value` lines (historically `SUPA_API_URL`, `SUPA_ANON_KEY`, `SUPA_SERVICE_KEY`, `SUPA_DB_URL`; exact names should be confirmed against the 2.23.x CLI at implementation time).
- `supabase status -o env --override-name api.url=SUPABASE_URL --override-name auth.anon_key=SUPABASE_KEY --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY` maps internal names to **our** env var names directly. The documented example is `--override-name api.url=NEXT_PUBLIC_SUPABASE_URL`. (Exact override keys for anon/service-role to be verified during implementation — `supabase status -o json` is the fallback to read them.)
- `supabase status -o json` is the robust fallback (parse with `jq`).

Both the official `supabase/setup-cli` action and the pinned `npx supabase` devDependency are valid; **`npx supabase` is preferred here** for version-pinning consistency with the existing `deploy` job (`ci.yml:66` already uses `npx supabase`).

### D. `deno check` on the PR gate (user decision: yes)

Today `deno check supabase/functions/enhance/index.ts` runs only in the push-only `deploy` job (`ci.yml:46`). `supabase/functions/**` is deliberately excluded from the Astro tsc/eslint graph (`context/foundation/lessons.md` rule "Deno Edge Functions must be excluded from the Astro tsc/eslint graph … compensate with `deno check`"), so PRs currently get **zero** static coverage of the churniest file in the repo. Adding `denoland/setup-deno@v2` + the `deno check` line to the `ci` job closes that — and matches `test-plan.md §5` ("Edge Function `deno check` — recommended after §3 Phase 1"). The `deploy`-job copy can stay (cheap belt-and-suspenders) or be removed once the `ci` job is a hard `needs:` predecessor of `deploy`.

### E. Risk → existing-test mapping (the regression-lock reality)

| Risk                 | Test (file:line)                                                           | Layer / in CI today?           | What it actually locks                                                                    | Gap (deferred)                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **#1** silent stall  | `replicate-webhook.test.ts:26-102` (signature verifier, 7 cases)           | unit — **yes** (`test:unit`)   | Bad/tampered/rotated signatures rejected by the verifier in isolation                     | No callback-handler integration proving a rejected/absent callback flips a `processing` row to terminal — Phase 3                       |
| **#1 / #6** timing   | `cloud-timings.test.ts:14-24` (3 invariants)                               | unit — **yes**                 | Budget ordering (SLOW_HINT < PROCESSING_WATCHDOG; QUEUED < PROCESSING; PROCESSING ≥ 300s) | Doesn't prove a timeout _fires_ or that cold-boot isn't false-failed — Phase 3 state machine                                            |
| **#6** render        | `cloud-job-render.test.ts:42-69` (`loadCloudResult`)                       | unit — **yes**                 | Result blob fetch + decode happy/΄404/decode-fail                                         | Not the watchdog re-read / out-of-order / pre-SUBSCRIBED catch-up logic — Phase 3                                                       |
| **#4** IDOR          | `jobs.rls.test.ts:59-80` (cross-user SELECT isolation, anon INSERT denied) | integration — **no (the gap)** | RLS **table-level** scoping by `auth.uid()`                                               | No **route-level** test that a foreign jobId is rejected before an id-only service-role mutation — Phase 2                              |
| **#4** owner helpers | `photo-job.service.test.ts`, `photo-job-helpers.test.ts` (mocked builders) | unit — **yes**                 | Owner-scoped helpers filter by `user_id`; id-only helpers filter by `id`                  | Mocked — can't prove the _route_ calls the owner-scoped one (the §2 R4 anti-pattern) — Phase 2                                          |
| **#5** retention     | `jobs.rls.test.ts:174-223` (`markJobSucceeded` deletes source)             | integration — **no (the gap)** | **Success-path** source deletion against real storage                                     | **Failure/abandon-path** deletion is only mock-tested (`photo-job-helpers.test.ts:116-137`); no real-storage integration test — Phase 2 |

**Takeaway for the plan**: wiring `jobs.rls.test.ts` into CI newly locks the **#4 RLS-isolation** and **#5 success-path retention** integration assertions (today they can regress unseen). #1/#6 are already CI-locked at the unit layer. The route-IDOR and failure-path-deletion holes are **out of Phase 1 scope** by design — do not let the plan imply otherwise.

## Code References

- `.github/workflows/ci.yml:10-28` — `ci` job (lint, `test:unit`, build with prod secrets); `:21-24` exclusion comment; `:25-28` step-scoped prod env; `:32` deploy trigger; `:43-46` `setup-deno` + `deno check` (push-only); `:66-68` functions deploy
- `package.json:13-14` — `test` vs `test:unit` (exclude glob); `:56` — `supabase ^2.23.4` devDependency
- `vitest.config.ts:8-12` — `include: ["tests/**/*.test.ts"]`, `testTimeout: 30_000`, node env
- `tests/env.ts:5-21` — required env vars + shared admin client
- `tests/helpers/test-users.ts:19-54,62-101` — runtime user create (`email_confirm: true`) + teardown
- `tests/jobs.rls.test.ts:7` (`photos` bucket), `:59-80` (#4 isolation), `:174-223` (#5 success retention)
- `supabase/config.toml:209` — `enable_confirmations = false`; `:65` — absent `seed.sql`; `:5` — `project_id`
- `supabase/migrations/20260528120000_create_jobs_table.sql` — `public.jobs` + RLS + Realtime
- `supabase/migrations/20260528120100_create_photos_storage.sql:22-84` — `photos` bucket + storage RLS
- `src/lib/supabase-admin.ts` — `createAdminClient` factory
- `tests/README.md:11-12, "Why this is not in CI"` — prerequisites + stale CI claim to fix

## Architecture Insights

- **The suite is built for ephemeral reset-per-run**, which is exactly what an `ubuntu-latest` Docker runner gives. No hosted-project state management, no shared-DB contamination, no extra secrets — the local keys are deterministic, not sensitive. This is why the user's "ephemeral local (Docker)" choice is the low-friction fit.
- **`$GITHUB_ENV` is job-global, step env is step-local** (`ci.yml:25-28` proves the build step uses step-scoped `env:`). Any approach that writes Supabase keys to `$GITHUB_ENV` changes the environment for _every_ later step in that job — including a prod-secret build. Keep the local-Supabase work in a process that never also runs the prod-secret build.
- **`npx supabase` everywhere** keeps the CLI version pinned to the devDependency, consistent with the existing deploy step; avoids "works on my CLI" drift.
- **Vault/webhook is orthogonal** to these RLS tests — the trigger no-ops without secrets, so CI needn't seed Vault for Phase 1.

## Historical Context (from prior changes)

- `context/archive/2026-05-28-photo-jobs-data-and-storage/plan.md:44` — original decision: "No hosted-Supabase CI integration. The RLS test suite runs locally … CI continues running lint + build only." This is the decision Phase 1 deliberately reverses.
- `context/foundation/roadmap.md:67` — baseline "CI runs lint+build only (no deploy step)"; the deploy step + `deno check` were added later (S-07).
- `context/foundation/lessons.md` — (a) "Deno Edge Functions must be excluded from the Astro tsc/eslint graph; compensate with `deno check`" (justifies §D); (b) config-only failures (wrong Replicate signing secret, missing `EDGE_FUNCTION_URL`, source-URL TTL) are **not** unit-testable — they belong to the deploy/flip-ON smoke gate, surfaced at the D.1 flip-ON 2026-06-08 (`context/foundation/production-config.md`). Reinforces that Phase 1's CI gate cannot catch R1's config arm.
- `context/foundation/test-plan.md:35` — "real test base exists … not yet wired into CI — Phase 1 fixes that"; `§5:140-141` — "unit + integration required after §3 Phase 1", "`deno check` recommended after §3 Phase 1".

## Related Research

- `context/foundation/test-plan.md` §2 Risk Map + Risk Response Guidance (the source of risks #1/#4/#5/#6 and their "must challenge" framing)
- Phase 2/3/4 will produce their own `context/changes/<id>/research.md` for the gaps named in §E.

## Open Questions (decisions for `/10x-plan`)

1. **Job topology — the env-bleed hazard (highest priority).** Pick one:
   - **(Recommended) Separate `integration` job** running in parallel with `ci`: checkout → node → `npm ci` → `npx supabase start` → `npx supabase db reset` → export local keys to `$GITHUB_ENV` → `npm test`. The prod-secret `build` stays in the `ci` job and never shares a process with local keys. Cost: re-runs the unit tests too (cheap) and a second `npm ci`.
   - **In the `ci` job, after `build`**: export local keys _only after_ the build step has run, then run `npm test`. Fragile (ordering-dependent; one reorder reintroduces the bug).
   - **Step-scoped local env** on a single `npm test` step (don't use `$GITHUB_ENV`; pass `env:` on the step). Works but you must compute the keys inline (e.g. `eval $(npx supabase status -o env …)` inside the same `run`).
2. **Full suite vs integration-only in the new job.** Run `npm test` (all 11, simplest, slight redundancy) or add a `test:integration` script targeting only `jobs.rls.test.ts` (no redundancy, one more script to maintain)? Recommendation: `npm test` for simplicity unless runtime matters.
3. **Exact `supabase status -o env` variable / override-name keys for the 2.23.x CLI** — verify at implementation (`-o json` fallback). Don't hardcode `SUPA_*` names without checking.
4. **CI time budget** — `supabase start` adds ~1-2 min (image pull) per run; consider caching Docker layers / the Supabase images, or accept the cost. Worth a one-line note in the plan, not a blocker.
5. **Fork-PR secrets** — the new integration job needs **no GitHub secrets** (local keys are generated), so it runs fine on fork PRs; the existing prod-secret build already gates that separately. Confirm no secret is accidentally added.
6. **`deno check` de-dup** — keep the copy in `deploy` or rely solely on the new `ci`-job check once `deploy` `needs: [ci, integration]`?
7. **Doc-fix scope** — should Phase 1 also correct the stale "CI = lint+build only" lines in `tests/README.md` and `change.md`? Recommended yes (tiny, prevents future confusion). This is doc, not test logic, so it stays within the "no new test logic" constraint.

## Cookbook impact (test-plan §6)

Per the rollout chain, Phase 1's plan should end with a sub-phase updating `test-plan.md §6.2` (integration test run command) and `§5` quality-gates status (`unit + integration` → wired; `deno check` → wired) once the workflow lands. No new §6 _pattern_ is added (no new test code), but the **run command** for the integration suite moves from "developer-local only" to "CI + local."
