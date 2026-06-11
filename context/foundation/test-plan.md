# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-09 (§3 Phase 1 → complete: testing-ci-gate wired into CI)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

This is a **live, fully-shipped MVP** (luminacleanai.com; Cloud AI ON,
`CLOUD_DAILY_CAP=3`). Every risk below is a _regression_ risk on working
behavior — the rollout locks in guardrails that already passed once, not
greenfield feature coverage. A real but single-directory test base exists
(`tests/`, 11 Vitest files hitting a live local Supabase) and is **now wired
into CI** (Phase 1 complete — the full suite runs on every push/PR via an
ephemeral local Supabase) — the regression floor is locked before any new
test is written.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                                                                                            | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A cloud job stalls in `processing` with no surfaced error — a bad/replayed webhook signature is silently rejected, or callback config (signing secret / `EDGE_FUNCTION_URL` / source-URL TTL) is wrong — so a cost-incurring prediction runs but the user sees a permanent spinner | High   | High       | 4 lessons.md rules (self-signing harness; hosted `SUPABASE_URL` not public-https; source-URL TTL vs cold boot; async fire-and-forget needs a timeout backstop); hot-spot dir `supabase/functions/enhance/` (11 commits/30d); interview Q1 |
| 2   | An anonymous or otherwise unauthorized request reaches Cloud AI processing because the gate is enforced only in the UI toggle, not in the API                                                                                                                                      | High   | Medium     | PRD Guardrail "no path by which an unauthenticated request reaches cloud processing"; FR-007; hot-spot dir `src/pages/api/` (18 commits/30d); interview Q1; abuse-lens (authorization/access)                                             |
| 3   | The global daily cap fails to reject the over-cap job (off-by-one, race, or wrong row scope) → unbounded Replicate spend                                                                                                                                                           | High   | Medium     | FR-014; PRD Guardrail "cloud daily cap actually blocks"; `CLOUD_DAILY_CAP=3` live; hot-spot dirs `src/lib/services/` (19), `src/pages/api/` (18); interview Q1; abuse-lens (resource abuse)                                               |
| 4   | IDOR — a user reads or advances another user's job via a client-supplied jobId routed through an id-only service-role helper (which bypasses RLS)                                                                                                                                  | High   | Medium     | lessons.md "client-supplied jobId must route through owner-scoped mutations"; hot-spot dir `src/lib/services/` (19 commits/30d); interview Q1; abuse-lens (authorization/IDOR)                                                            |
| 5   | A source photo is not deleted on a failed or abandoned job → breach of the 24h-retention / private-source privacy guardrail (the success path deletes; the failure path is the gap)                                                                                                | High   | Medium     | NFR "source not retained beyond 24h"; roadmap S-08; `tests/README.md` (only `markJobSucceeded` retention asserted today); interview Q1                                                                                                    |
| 6   | The Realtime watchdog false-fails a healthy cold-boot job, or a result that landed before the channel was SUBSCRIBED never renders → north-star flow appears broken                                                                                                                | High   | Medium     | lessons.md "watchdog must catch up on subscribe and re-read before failing"; hot-spot dir `src/components/hooks/` (9 commits/30d); interview Q1                                                                                           |

**Impact × Likelihood rubric.** Both axes scored High / Medium / Low.
High impact = user loses access, data, or money, or the failure is publicly
visible; High likelihood = area changes weekly or we have already been
burned here. All six are High-impact regressions on a live product. R1 is
High × High because the callback surface is the single churniest file in the
repo and has already produced multiple silent-stall incidents (lessons.md);
the rest are High × Medium.

Note on out-of-scope failure modes: a Replicate provider outage or a
Cloudflare/Supabase platform outage is High-impact × Low-likelihood and
belongs to observability/alerting and the deploy-smoke checklist, not a
test — they are not given risk rows.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                     | Must challenge                                                                                             | Context `/10x-research` must ground                                                                                                                                                               | Likely cheapest layer                                                                                                          | Anti-pattern to avoid                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #1   | A callback whose signature fails verification is rejected, AND a job that never receives a valid terminal callback surfaces a terminal failure within the watchdog budget (never hangs forever) | "401-ignore is safe" — it leaves a cost-incurring prediction unrecorded and the row stalled with no signal | The callback entry point, signature-verification path, the terminal-state transition, and which config values are runtime-only (secret, `EDGE_FUNCTION_URL`, TTL) and therefore not unit-testable | Unit (signature verifier) + integration (stall → terminal-flip). Config-only failures → **deploy-smoke gate, not a unit test** | Self-signing the test webhook with the verifier's own secret and asserting only the happy accept — a green test that structurally cannot catch a wrong prod secret |
| #2   | A request without a valid authenticated session to the cloud create-job API is rejected **before** any storage or model work                                                                    | "logged-in ⇒ authorized for this action"; "UI toggle hidden ⇒ API gated"                                   | The API entry point, where the session/user is resolved, and the order of the auth check relative to storage/model side-effects                                                                   | Integration (API route, server-side)                                                                                           | Testing only the client toggle that hides the Cloud option; asserting on the UI instead of the API boundary                                                        |
| #3   | The job submitted when the cap is already reached is rejected at the API boundary with the user-facing message; the count is global and scoped to the UTC day                                   | "cap is checked ⇒ no off-by-one / no race"; "the count rule counts the right rows"                         | Where the count is computed, the row/time scope it uses, and whether the check precedes the insert/model call                                                                                     | Integration (create-job route + count helper)                                                                                  | Asserting the count helper returns N (implementation mirror) instead of asserting the route rejects the over-cap submission                                        |
| #4   | User B cannot read, advance, or fail user A's job by supplying A's jobId to the **route** (not just the helper)                                                                                 | "an id-only service-role helper is safe because RLS protects it" — service-role **bypasses** RLS           | Which routes accept a client-supplied id, which helper each calls, and whether the ownership filter is in the same write                                                                          | Integration (route with a foreign jobId → 403/404 and no mutation)                                                             | Testing the owner-scoped helper in isolation while the route under test actually calls the id-only one                                                             |
| #5   | On a `failed` job and on an abandoned `queued` job, the source object is verifiably **gone** from storage and not retained past 24h                                                             | "success-path deletion ⇒ all paths delete the source"                                                      | The failure/abandon transitions, the timeout/watchdog trigger, and the storage-delete call on each path                                                                                           | Integration (real Supabase storage; extend the `jobs.rls` suite)                                                               | Mocking storage — the real delete against a real bucket is the whole point of the guardrail                                                                        |
| #6   | The watchdog does **not** fail a job that has already advanced (re-read before failing), and a result that committed before SUBSCRIBED is still folded in and rendered (catch-up read)          | "the timer fired ⇒ the job is dead"                                                                        | The watchdog state machine, its budget split across `queued→processing→terminal`, and how late/out-of-order Realtime events are applied                                                           | Unit (watchdog/timing state machine with an injected clock + out-of-order events)                                              | Asserting the timer's numeric value instead of the _decision_ (fail vs re-read vs render) under a late or out-of-order event                                       |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                                    | Goal (one line)                                                                                                                                                                          | Risks covered                                         | Test types                                                                        | Status      | Change folder                               |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- | ----------- | ------------------------------------------- |
| 1   | Gate the floor — wire existing suite into CI  | Run the 11 tests that already encode the cloud/privacy guardrails on every push (incl. the RLS integration suite via an ephemeral/hosted Supabase) so they cannot silently regress       | #4, #5, #1, #6 (regression lock on existing coverage) | CI wiring (no new test logic)                                                     | complete    | context/archive/2026-06-09-testing-ci-gate/ |
| 2   | Close top-risk coverage gaps                  | Prove gate-bypass, cost-cap-boundary, IDOR, and failure-path source deletion are caught at the cheapest real-signal layer                                                                | #2, #3, #4, #5                                        | integration (real Supabase)                                                       | not started | —                                           |
| 3   | Harden silent-stall + watchdog                | Prove a bad/replayed webhook is rejected without over-trust, a stalled job surfaces a terminal failure within budget, and the watchdog re-reads before failing + catches up on subscribe | #1, #6                                                | unit (state machine / verifier) + deploy-smoke checklist for config-only failures | not started | —                                           |
| 4   | E2E on the north-star flow + gating guardrail | Prove end-to-end that a signed-in upload → Cloud AI → Realtime result appears without refresh, and that an anonymous visitor cannot reach cloud                                          | #2, #1, #6, #3                                        | e2e (Playwright, new tooling)                                                     | not started | —                                           |

**Status vocabulary** (fixed — parser literals): `not started` →
`change opened` → `researched` → `planned` → `implementing` → `complete`.

Ordering rationale: Phase 1 is the cheapest signal — the tests exist and
just don't run, so locking them into CI (your chosen full-suite gate)
protects the most behavior for the least work before any new test is
written. Phases 2–3 close the gaps the existing suite misses, cheapest
layer first (integration against real Supabase, then pure unit state
machines). Phase 4 (E2E) is last because it is the most expensive and
flakiest layer: the cloud path's cold boot runs ~2 min and depends on
external Replicate, so the PR-gating E2E should target the warm or stubbed
pipeline, with the live cold-boot path left to a scheduled/manual smoke.

There is **no AI-native rollout phase**: the one obvious candidate (a vision
model judging "is the result actually better") was explicitly excluded by
the team as an unstable oracle whose cost exceeds its signal (see §7).

## 4. Stack

The classic test base for this project. AI-native tools carry a `checked:`
date so future readers can see which lines need re-verification.

| Layer                      | Tool                        | Version | Notes                                                                                                                                                                                                             |
| -------------------------- | --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration         | Vitest                      | ^3.2.4  | Configured (`vitest.config.ts`, Node env). 11 tests in `tests/`; integration tests hit a **real local Supabase** (Docker), not mocks — deliberate, to lock RLS/storage/retention against a real runtime           |
| integration backend        | local Supabase (CLI)        | n/a     | `npx supabase start` + `db reset`; three env vars (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). CI equivalent stood up by §3 Phase 1                                                             |
| API / network mocking      | none yet                    | —       | No MSW today; integration tests use the real Supabase edge. Add only if a future test needs to stub Replicate — see §3 Phase 3                                                                                    |
| e2e                        | none yet — see §3 Phase 4   | —       | Playwright is the chosen tool; not yet installed. Phase 4 grounds the exact version + config via Context7                                                                                                         |
| Edge Function static check | `deno check` (recommended)  | n/a     | `supabase/functions/**` is excluded from the Astro tsc/eslint graph (lessons.md), so the churniest file gets no static coverage from `npm run lint`; a `deno check` step recovers it — candidate for §3 Phase 1/3 |
| (optional) AI-native       | none — deliberately omitted | n/a     | When NOT to use: judging output _quality_ (before/after improvement) has no stable oracle and was excluded by the team (§7). No AI-native layer in v1                                                             |

**Stack grounding tools (current session):**

- Docs: **Context7** — available; not queried during plan authoring (per-phase research will use it for exact Playwright/Vitest/Supabase-CLI-in-CI setup); checked: 2026-06-09
- Search: **Exa.ai** — available; not used during plan authoring; checked: 2026-06-09
- Runtime/browser: **no Playwright MCP exposed this session** — Playwright is planned as a Phase 4 dependency (test tool, not an MCP); checked: 2026-06-09
- Provider/platform: **Supabase MCP present but requires interactive auth** — not used for grounding; the suite already exercises Supabase via the CLI; checked: 2026-06-09

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that it is `planned`.

| Gate                       | Where                        | Required?                                                                   | Catches                                                                                                                 |
| -------------------------- | ---------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| lint                       | local (pre-commit) + CI      | required (wired in `ci.yml`)                                                | syntactic / type-aware lint drift                                                                                       |
| build (SSR)                | CI                           | required (wired in `ci.yml`)                                                | build / module-resolution breakage                                                                                      |
| unit + integration         | local + CI                   | required — **wired** (`ci.yml` `integration` job, ephemeral local Supabase) | logic regressions in services, schemas, RLS, retention, watchdog                                                        |
| Edge Function `deno check` | CI                           | recommended — **wired** (PR-gating `ci` job)                                | static breakage in `supabase/functions/` (excluded from the Astro graph)                                                |
| e2e on the north-star flow | CI on PR (warm/stubbed path) | required after §3 Phase 4                                                   | broken upload → Cloud AI → Realtime path; anon-cloud gating                                                             |
| post-edit hook             | local (agent loop)           | recommended after §3 Phase 3                                                | regressions at edit time (configured in a later module)                                                                 |
| pre-prod / flip-ON smoke   | between merge + prod         | recommended                                                                 | config-only failures no test can catch: wrong provider secret, missing `EDGE_FUNCTION_URL`, source-URL TTL (lessons.md) |
| multimodal visual review   | —                            | not used                                                                    | excluded by the team (§7)                                                                                               |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the
relevant rollout phase ships; before that it reads "TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: `tests/<subject>.test.ts` (flat `tests/` dir; `vitest.config.ts` `include: ["tests/**/*.test.ts"]`).
- **Naming**: `<subject>.test.ts`; client-only logic uses `.client.test.ts` (e.g. `cloud-upload.client.test.ts`).
- **Reference test**: TBD — see §3 Phase 3 (watchdog/verifier state-machine pattern). Existing examples: `cloud-timings.test.ts`, `cloud-job-render.test.ts`, `photo-job-helpers.test.ts`.
- **Run locally**: `npm run test:unit` (excludes the Docker-bound RLS suite).

### 6.2 Adding an integration test (real Supabase)

- **Location**: `tests/<subject>.test.ts`; reuse helpers in `tests/helpers/` and env in `tests/env.ts`.
- **Mocking policy**: do **not** mock the Supabase client — hit the real local instance so RLS, storage, and retention are exercised for real. Mock only a true external edge (e.g. Replicate) if unavoidable.
- **Reference test**: `tests/jobs.rls.test.ts` (cross-user isolation, anon denial, one-shot signed URL, retention contract).
- **Run locally**: `npx supabase start` → `npx supabase db reset` → export the three env vars (see `tests/README.md`) → `npm test`.
- **Runs in CI too**: the same flow runs on every push/PR in the `ci.yml` `integration` job against an ephemeral local Supabase (no GitHub secrets — local keys are generated). `deploy` gates on it.
- TBD additions — see §3 Phase 2 (gate-bypass, cap-boundary, IDOR, failure-path deletion patterns).

### 6.3 Adding an e2e test

- TBD — see §3 Phase 4 (Playwright; warm/stubbed pipeline for the PR gate, live cold-boot path as a scheduled smoke).

### 6.4 Adding a test for a new API endpoint

- **Choose the layer by what the rule actually depends on** (cost × signal, §1):
  - **Hermetic (stub admin client)** when the new signal is _route wiring_ — the boundary decision, branch order, and side-effect sequencing — not a real DB constraint. Cheapest test that still proves the endpoint rejects/accepts at its boundary.
  - **Integration (real Supabase edge)** when the rule depends on actual DB state — RLS scoping, constraints, cascades, retention — where a stub would lie. Don't re-run real SQL through the route when the predicate is already integration-covered elsewhere.
- **Env-free-core pattern (load-bearing for hermetic)**: a route that imports `astro:env/server` can't load under Vitest (Lesson #4). Extract the request→response logic into an env-free core in `src/lib/services/<route>.handler.ts` that receives `{ user, request, admin, cap, … }` and returns a `Response`; leave the route a thin wrapper that reads env, builds the admin client, and delegates. The test drives the core directly with a stub admin (same isolation rationale as the "server-only service-role clients live in their own module" lesson).
- **Assert side-effects, not just status** (§2 R2/R4): make the mutating calls (`insert`, `createSignedUploadUrl`) `vi.fn()` spies and assert they were **not** called on a reject path — a status-only assertion misses a check-after-mutate reordering that returns the right code but still leaks a row / signed URL. Prove the guard has teeth with a one-off reorder (red) before trusting it.
- **Reference test**: `tests/cloud-create-job.handler.test.ts` (over-cap 429 + reject-before-insert, hermetic). Env-free core it drives: `src/lib/services/cloud-create-job.handler.ts`. Schema-level example: `cloud-create-job-schema.test.ts`.
- **Remaining Phase-2 endpoint patterns** (gate-bypass, IDOR, failure-path deletion): TBD — see §3 Phase 2.
- **Run locally**: `npm run test:unit` (hermetic; no Docker), or the integration flow in §6.2.

### 6.5 Adding a test for the cloud callback / pipeline

- TBD — see §3 Phase 3. Anchor: never sign the test callback with the verifier's own secret and assert only the happy accept (§2 R1 anti-pattern). Existing example: `replicate-webhook.test.ts`.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the phase taught.)

- **2026-06-10 — Phase 2 / Risk #3 (cloud daily-cap route rejection)**: shipped
  `tests/cloud-create-job.handler.test.ts` via the env-free-core + hermetic-stub-admin
  recipe now in §6.4. Surprise worth recording: the cap is _app-level_, not DB-enforced
  (no trigger/RPC/CHECK in `supabase/migrations/`), so a stub admin can't "lie" about it —
  hermetic was the right layer, and the only new signal is the route wiring (the count
  predicate is already integration-covered in `jobs.rls.test.ts`). The load-bearing
  assertion is _insert-not-called_ on the over-cap path (reject-before-insert), proven to
  have teeth by a one-off reorder mutation (status stayed 429; only the not-called
  assertions went red).

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Naive Local engine output quality** — the gamma + Gaussian-blur engine is _intentionally_ rough; "how good does it look" has no stable oracle and the quality gap to Cloud is a deliberate product choice. Re-evaluate if the Local engine is ever promoted beyond a free fallback. (Source: interview Q5.)
- **AI "is it actually better" visual evaluation** — a vision model judging before/after improvement is an unstable, expensive oracle; cost exceeds signal. This is why §3 has no AI-native phase. Re-evaluate only if a cheap deterministic image metric proves trustworthy. (Source: interview Q5.)
- **Auth-provider internals** — Supabase/GoTrue password hashing, session/refresh-token rotation, and email delivery are the provider's contract, not ours. We test _our_ gating and validation around them, not them. Re-evaluate if we move off Supabase Auth. (Source: interview Q5.)
- **Static / marketing / auth-page markup** — snapshot tests of static content are brittle and low-blast-radius. Re-evaluate if a page gains real interactive logic. (Source: interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-09
- Stack versions last verified: 2026-06-09
- AI-native tool references last verified: 2026-06-09
- Rollout state (§3) last advanced: 2026-06-09 — Phase 1 `complete` (suite + `deno check` wired into CI)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
