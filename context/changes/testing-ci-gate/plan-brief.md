# Gate the floor — wire the existing Vitest suite into CI — Plan Brief

> Full plan: `context/changes/testing-ci-gate/plan.md`
> Research: `context/changes/testing-ci-gate/research.md`

## What & Why

Phase 1 of the test-plan rollout: a **regression lock**, not new test logic. The 11-file Vitest suite already encodes the cloud-pipeline and privacy guardrails, but the one suite needing Docker + a live Supabase (`tests/jobs.rls.test.ts`) is excluded from CI, and `deno check` runs only on push-to-master. This change makes the **full** suite run on every push and PR so those guardrails cannot silently regress.

## Starting Point

The live `ci.yml` already does more than the docs claim: the `ci` job runs `lint → test:unit → build` (prod secrets), and the push-only `deploy` job runs `deno check`. The **only** test file excluded from CI is the RLS integration suite, and PRs get **zero** static coverage of `supabase/functions/**`.

## Desired End State

Every push/PR runs the `ci` job (lint → test:unit → deno check → build) **and** a parallel `integration` job (boot ephemeral local Supabase → `db reset` → `npm test`, full suite incl. RLS). `deploy` runs only after both pass. Docs and `test-plan.md` reflect the wired gates.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| CI Supabase | Ephemeral local (Docker) | Suite is reset-per-run friendly; no hosted project, no new secrets | Research |
| Env-bleed hazard | Separate `integration` job | Prod-secret build and local keys never share a process — bug is structurally impossible | Plan |
| Suite scope | Full `npm test` | Simplest; no new script; RLS suite runs with its peers | Plan |
| `deno check` | Move to `ci`, drop deploy copy | PRs gain static coverage; `deploy needs: ci` makes the copy redundant | Plan |
| Image caching | None — accept ~1-2 min pull | Actions Docker-layer caching is finicky and often net-neutral | Plan |
| Cleanup | Fix stale docs + `deploy needs: [ci, integration]` + sync test-plan | Keep repo self-consistent; let the lock actually gate prod | Plan |

## Scope

**In scope:** add `integration` job; move `deno check` to `ci`; `deploy needs: [ci, integration]`; fix stale "CI = lint+build only" docs; advance `test-plan.md` §3/§5/§6/§8.

**Out of scope:** any new test logic; route-IDOR (#4) and failure-path source-deletion (#5) gaps (Phase 2/3); Vault/webhook secrets in CI; Docker-image caching; hosted CI Supabase.

## Architecture / Approach

Three top-level jobs in one workflow. `ci` (lint/unit/deno-check/build with **prod** secrets) and `integration` (local Supabase + full suite, **no** secrets) run in parallel as separate processes — the key invariant, since `supabase status -o env >> $GITHUB_ENV` is job-global and would otherwise poison the prod-secret build. `deploy` (push-to-master only) gates on both.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Wire the CI workflow | `integration` job + `deno check` on PR gate + `deploy needs: [ci, integration]` | Env bleed (mitigated by job isolation); exact `supabase status` key-export syntax for 2.23.x CLI (verify at impl; `-o json` fallback) |
| 2. Sync docs + state | Corrected `tests/README.md`/`change.md`; `test-plan.md` §3 Phase 1 `complete`, §5 gates wired | None — doc-only |

**Prerequisites:** none (local keys generated; no new GitHub secrets; Docker preinstalled on `ubuntu-latest`).
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- The 2.23.x `supabase status` env/override-name keys are unconfirmed; implementer must verify against the installed CLI, with `-o json` + `jq` as the robust fallback.
- `supabase start` adds ~1-2 min per run (uncached by choice); acceptable given parallel jobs.
- **Deploy reliability coupling (F1):** `deploy needs: [ci, integration]` puts Supabase boot on the critical path to prod. A bounded `supabase start` retry absorbs transient boot hiccups; a real RLS regression still blocks deploy by design. Fallback if boot proves flaky: demote `integration` to a PR/push gate (drop from `deploy.needs`).
- **Honesty:** Phase 1 locks #4 RLS-isolation + #5 success-path retention (integration) and #1/#6 (already unit-locked). It does **not** close route-IDOR or failure-path deletion — those are Phase 2/3.

## Success Criteria (Summary)

- A PR shows `ci` + `integration` green; `deploy` doesn't run on PR events.
- The `integration` job runs all 11 test files incl. `jobs.rls.test.ts` against ephemeral Supabase.
- Push to master gates `deploy` on both jobs; `ci`'s build still uses production secrets (no env bleed).
