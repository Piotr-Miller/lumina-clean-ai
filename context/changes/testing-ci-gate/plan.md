# Gate the floor — wire the existing Vitest suite (incl. Docker/RLS) into CI — Implementation Plan

## Overview

Phase 1 of `context/foundation/test-plan.md`. The 11-file Vitest suite already encodes the cloud-pipeline and privacy guardrails, but the one suite that needs Docker + a live Supabase (`tests/jobs.rls.test.ts`) is excluded from CI, and `deno check` runs only on push-to-master. This change makes the **full** suite run on every push and PR by standing up an **ephemeral local Supabase** in a **separate `integration` CI job**, moves `deno check` onto the PR gate, and gates `deploy` on both jobs — then syncs the docs and the orchestrator state that the change makes stale.

This is **CI wiring — a regression lock on coverage that already exists**. No new test logic is written.

## Current State Analysis

The live `.github/workflows/ci.yml` (69 lines, two jobs) already does more than the change brief and `tests/README.md` claim:

- **`ci` job** (`ci.yml:10-28`, push + PR to `master`): `checkout@v5` → `setup-node@v5` (node 22, npm cache) → `npm ci` → `npx astro sync` → `npm run lint` → **`npm run test:unit`** (`ci.yml:24` — all tests **except** `jobs.rls.test.ts`) → `npm run build` with **production** `SUPABASE_URL`/`SUPABASE_KEY` secrets (`ci.yml:25-28`, step-scoped `env:`).
- **`deploy` job** (`ci.yml:30-69`, `if: ref==master && event==push` — never PRs): `setup-deno@v2` → **`deno check supabase/functions/enhance/index.ts`** (`ci.yml:46`) → `wrangler-action@v4` build+deploy → `npx supabase functions deploy enhance --use-api`.

So the **actual** gap is narrow and precise (research §A, §32-41):

1. **`tests/jobs.rls.test.ts` is the only test file excluded from CI.** `test:unit` (`package.json:14`, `vitest run --exclude '**/jobs.rls.test.ts'`) runs the other 10. → Stand up an ephemeral Supabase and run the **full** suite (`npm test`, `package.json:13`).
2. **`deno check` never runs on PRs** — only in the push-only `deploy` job. `supabase/functions/**` is excluded from the Astro tsc/eslint graph (lessons.md), so the churniest file gets **zero** static coverage on PRs.

### Key Discoveries:

- **The env-bleed hazard is the single load-bearing constraint** (research §39, §148). `supabase status -o env >> $GITHUB_ENV` persists values to **every later step in the same job**. The `ci` job's `build` step deliberately uses **production** secrets (`ci.yml:25-28`); if local Supabase keys land in `$GITHUB_ENV` before `build`, the build silently runs against the local stack. Process isolation (a separate job) makes this structurally impossible.
- **The integration suite is ephemeral-friendly** (research §B): exactly 3 env vars (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, validated at `tests/env.ts:5-15`); no SMTP (runtime users via `auth.admin.createUser({ email_confirm: true })`, `tests/helpers/test-users.ts:19-54`, works because `config.toml:209` `enable_confirmations=false`); the `photos` bucket is created by **migration** (`20260528120100_create_photos_storage.sql`), not seed; **no `seed.sql` exists**. `npx supabase start` + `npx supabase db reset` + `npm test` reproduces the documented dev flow (`tests/README.md`).
- **No GitHub secrets needed** for the integration job — local keys are generated, so it runs on fork PRs (research §173). The prod-secret build already gates fork PRs separately.
- **`npx supabase`** (devDependency `^2.23.4`, `package.json:56`) keeps the CLI version-pinned, consistent with the existing `deploy` step (`ci.yml:66`).
- **`supabase status -o env` override-name keys for the 2.23.x CLI are not yet confirmed** (research §C, §171); `supabase status -o json` is the robust fallback. This is the one detail to verify at implementation time — see Critical Implementation Details.

## Desired End State

Every push and PR to `master` runs:

- the `ci` job: lint → `test:unit` → `deno check` → build (prod secrets); and
- a parallel `integration` job: boot local Supabase → `db reset` → `npm test` (full suite incl. RLS).

`deploy` runs only after **both** jobs pass (`needs: [ci, integration]`). The docs no longer claim "CI = lint+build only," and `test-plan.md` reflects the wired gates. Verify by opening a PR and observing both jobs green, then a push to master gated on both before deploy.

## What We're NOT Doing

- **No new test logic.** Not closing the route-level IDOR gap (#4) or the failure/abandon-path source-deletion gap (#5) — those are explicitly Phase 2/3 (research §E, §129). The plan must not imply Phase 1 "covers" #1/#4/#5/#6 beyond the regression lock it actually provides.
- **No Vault/webhook secrets in CI** — the enqueue trigger no-ops without secrets and the RLS suite doesn't exercise it (research §89, §150).
- **No Docker-image caching** — accept the ~1-2 min pull; note it in the workflow.
- **No `test:integration` script** — run the full `npm test`; a few seconds of unit-test redundancy is cheaper than a glob to maintain.
- **No hosted CI Supabase project** — ephemeral local only (reverses the original `context/archive/2026-05-28-photo-jobs-data-and-storage/plan.md:44` decision deliberately).

## Implementation Approach

Add a third job, `integration`, parallel to `ci`. Keep the two env regimes (prod secrets vs local keys) in **separate processes** so they can never cross. Move `deno check` to the `ci` job (the PR gate) and delete its `deploy` copy now that `deploy` will `needs:` the `ci` job anyway. Gate `deploy` on `[ci, integration]`. Then correct the stale docs and advance the orchestrator state in `test-plan.md`.

## Critical Implementation Details

- **`supabase status` key export — verify the exact mechanism at implementation.** Research could not confirm the 2.23.x `-o env` variable names / `--override-name` keys for the anon + service-role keys (`-o env` historically emits `SUPA_ANON_KEY`/`SUPA_SERVICE_KEY`). Confirm against the installed CLI; if `--override-name api.url=SUPABASE_URL --override-name auth.anon_key=SUPABASE_KEY --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY` does not map cleanly, fall back to `supabase status -o json` parsed with `jq` to set the three vars. The three target names are fixed by `tests/env.ts:5-15`.
- **Env isolation is the whole point.** In the `integration` job, writing keys to `$GITHUB_ENV` is fine — that job has no prod-secret step. Do **not** add local-key export to the `ci` job under any approach.

## Phase 1: Wire the CI workflow

### Overview

Rewrite `.github/workflows/ci.yml` to add the `integration` job, move `deno check` to `ci`, and gate `deploy` on both jobs.

### Changes Required:

#### 1. Add the `integration` job

**File**: `.github/workflows/ci.yml`

**Intent**: Run the full Vitest suite — including the Docker/RLS integration suite — against an ephemeral local Supabase, in a job that never shares a process with the prod-secret build. This is the regression lock that newly protects #4 RLS-isolation and #5 success-path retention.

**Contract**: A new top-level job `integration` (sibling of `ci`), `runs-on: ubuntu-latest`, triggered by the same push+PR events (no `if:` guard, no GitHub secrets). Steps: `checkout@v5` → `setup-node@v5` (node 22, npm cache) → `npm ci` → `npx supabase start` (wrap in a bounded retry — one re-attempt after `npx supabase stop` on a non-zero boot — so a transient Docker/image-pull hiccup doesn't false-fail the job; see F1 below) → `npx supabase db reset` → export the 3 local keys to `$GITHUB_ENV` (see Critical Implementation Details for the exact command + `-o json` fallback) → `npm test`. Include a one-line comment that `supabase start` adds ~1-2 min (image pull, uncached by design).

#### 2. Move `deno check` onto the `ci` job

**File**: `.github/workflows/ci.yml`

**Intent**: Give PRs static coverage of `supabase/functions/**`, which today only runs on push-to-master.

**Contract**: Add `denoland/setup-deno@v2` (`deno-version: v2.x`) + `deno check supabase/functions/enhance/index.ts` to the `ci` job (after lint/test, before or after build — order within `ci` is immaterial as it touches no prod env). **Remove** the duplicate `setup-deno` + `deno check` lines from the `deploy` job (`ci.yml:43-46`), since `deploy` will `needs: ci`.

#### 3. Gate `deploy` on both jobs

**File**: `.github/workflows/ci.yml`

**Intent**: A failing RLS suite must block prod, not just surface on the PR.

**Contract**: Change `deploy`'s `needs: ci` (`ci.yml:31`) to `needs: [ci, integration]`. The existing `if: github.ref == 'refs/heads/master' && github.event_name == 'push'` guard is unchanged.

> **Tradeoff (F1):** this is intentional — the regression lock now gates prod, not just PR visibility — but it also couples deploy reliability to `npx supabase start`: a Docker/image-pull hiccup or a transient RLS-suite flake can block a deploy even when the app is fine. The boot retry in change #1 absorbs transient boot failures so that only a _real_ test regression blocks deploy. Accepted cost: deploy waits on the integration job (~2-4 min) on every master push.

### Success Criteria:

#### Automated Verification:

- Workflow YAML is valid (no parse error on push; Actions tab shows the run): a push/PR triggers `ci` and `integration` in parallel
- `integration` job boots Supabase, applies migrations, and `npm test` passes all 11 files including `jobs.rls.test.ts`
- `ci` job runs `deno check` and it passes
- `deploy` job does not start until both `ci` and `integration` succeed (push to master only)

#### Manual Verification:

- Open a PR: both `ci` and `integration` report green; `deploy` does not run (PR event)
- Confirm the `build` step in `ci` still resolves the **production** `SUPABASE_URL`/`SUPABASE_KEY` (not local) — i.e. no env bleed
- Push to master: `deploy` waits on both jobs, then deploys as before
- Total `integration` wall-clock is acceptable (~2-4 min incl. image pull)

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation that a real PR/push run was observed green before proceeding to Phase 2.

---

## Phase 2: Sync docs + orchestrator state

### Overview

The workflow change makes several on-disk claims false and advances the rollout. Correct the docs and update `test-plan.md` — the mandated cookbook-update sub-phase of the rollout chain. Doc-only; no test logic.

### Changes Required:

#### 1. Fix stale "CI = lint+build only" claims

**File**: `tests/README.md`

**Intent**: The "Why this is not in CI" section is now false — the suite **is** in CI.

**Contract**: Rewrite that section (`tests/README.md:86-90`) to state the suite now runs in CI via an ephemeral local Supabase in the `integration` job; keep the local dev-run instructions.

**File**: `context/changes/testing-ci-gate/change.md`

**Intent**: `change.md:20` repeats the stale "CI today runs only lint+build."

**Contract**: Correct that line to reflect the corrected baseline (CI already ran `test:unit`+build; this change adds the integration job + PR-gate `deno check`).

#### 2. Advance the test-plan orchestrator state

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect that the gates are now wired and the cookbook run command moved from developer-local to CI + local.

**Contract**:

- `§5` quality-gates table: `unit + integration` row → wired (note `ci.yml integration` job); `Edge Function deno check` row → wired (note PR-gating `ci` job).
- `§6.2` integration-test run command: note it now runs in CI (`integration` job) as well as locally.
- `§3` Phase 1 row: `Status` → `complete`.
- `§8` freshness ledger + the top "Last updated" line: stamp `2026-06-09`, Phase 1 `complete`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` / prettier pass on the edited Markdown (pre-commit `prettier --write` on `*.md`)
- `grep -r "lint + build" tests/README.md context/changes/testing-ci-gate/change.md` returns no stale "only lint+build" claim

#### Manual Verification:

- `test-plan.md §3` shows Phase 1 `complete` and §5 gates marked wired
- `tests/README.md` no longer contradicts the live workflow
- A reader can follow `§6.2` to run the integration suite both locally and understand it gates CI

**Implementation Note**: Doc-only phase; no app behavior changes. Confirm the rendered Markdown reads cleanly before marking complete.

---

## Testing Strategy

This change **is** test infrastructure; it adds no test code. Verification is observational:

### Unit Tests:

- Unchanged. `test:unit` continues to run in the `ci` job.

### Integration Tests:

- `tests/jobs.rls.test.ts` (and the full suite) now runs in the `integration` job against ephemeral local Supabase. The proof is a green `integration` job on a real PR.

### Manual Testing Steps:

1. Push the branch / open a PR; watch the Actions tab — `ci` and `integration` run in parallel.
2. Confirm `integration` boots Supabase, applies migrations, and all 11 test files pass.
3. Confirm `ci`'s `deno check` runs and the `build` step still uses production secrets.
4. Merge/push to master; confirm `deploy` waits on both jobs before deploying.
5. Trigger a fork PR (or simulate by removing secrets) to confirm `integration` runs without any GitHub secret.

## Performance Considerations

`npx supabase start` adds ~1-2 min (one-time image pull per run; uncached by deliberate choice). The `integration` job re-runs the 10 unit files (a few seconds of redundancy) — accepted for the simplicity of a single `npm test`. Net PR latency rises by roughly the Supabase boot time, mitigated by `ci` and `integration` running in parallel.

**Reliability coupling (F1):** because `deploy needs: [ci, integration]`, the integration job's boot now sits on the critical path to production on every master push. A bounded retry on `npx supabase start` (Phase 1 change #1) keeps a transient Docker/image-pull hiccup from false-blocking a deploy; a genuine RLS-suite regression still blocks it, by design. If boot flakiness ever proves material in practice, the fallback is to demote `integration` to a PR/push gate only (drop it from `deploy.needs`) — a one-line reversal.

## Migration Notes

This reverses the original `context/archive/2026-05-28-photo-jobs-data-and-storage/plan.md:44` decision ("No hosted-Supabase CI integration … CI continues running lint + build only") — intentionally, and via ephemeral local Supabase rather than a hosted project, so no new secrets or shared CI state are introduced.

## References

- Research: `context/changes/testing-ci-gate/research.md`
- Test plan: `context/foundation/test-plan.md` (§3 Phase 1, §5, §6.2)
- Current workflow: `.github/workflows/ci.yml:10-69`
- Suite prerequisites: `tests/README.md`; `tests/env.ts:5-21`; `tests/helpers/test-users.ts:19-54`
- Scripts: `package.json:13-14`, `:56` (`supabase ^2.23.4`)
- Risk→test mapping: research §E (`research.md:118-129`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Wire the CI workflow

#### Automated

- [x] 1.1 Push/PR triggers `ci` and `integration` in parallel (valid YAML) — 7bf7ebb
- [x] 1.2 `integration` job boots Supabase, applies migrations, `npm test` passes all 11 files incl. `jobs.rls.test.ts` — a7086aa
- [x] 1.3 `ci` job runs `deno check` and it passes — a7086aa
- [x] 1.4 `deploy` does not start until both `ci` and `integration` succeed (push to master) — 7bf7ebb

#### Manual

- [x] 1.5 PR shows `ci` + `integration` green; `deploy` does not run on PR event — a7086aa (accepted structurally: PR triggers the same green ci+integration jobs; `if: github.event_name == 'push'` provably blocks deploy on PRs — see 1.4)
- [x] 1.6 `ci` build step still resolves production `SUPABASE_URL`/`SUPABASE_KEY` (no env bleed) — a7086aa
- [x] 1.7 Push to master: `deploy` waits on both jobs, then deploys — a7086aa
- [x] 1.8 `integration` wall-clock acceptable (~2-4 min incl. image pull) — a7086aa

### Phase 2: Sync docs + orchestrator state

#### Automated

- [x] 2.1 Lint/prettier pass on edited Markdown — 4ea2cbc
- [x] 2.2 No stale "only lint+build" claim remains in `tests/README.md` / `change.md` — 4ea2cbc

#### Manual

- [x] 2.3 `test-plan.md §3` Phase 1 `complete`, §5 gates marked wired — 4ea2cbc
- [x] 2.4 `tests/README.md` no longer contradicts the live workflow — 4ea2cbc
- [x] 2.5 `§6.2` run command reflects CI + local — 4ea2cbc
