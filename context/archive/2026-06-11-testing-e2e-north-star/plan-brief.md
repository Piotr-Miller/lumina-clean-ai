# E2E North-Star (risks #1+#6) — Plan Brief

> Full plan: `context/changes/testing-e2e-north-star/plan.md`
> Research: `context/changes/testing-e2e-north-star/research.md`

## What & Why

Browser-level proof of the product's north-star: a signed-in upload goes through Cloud AI and the result **renders without refresh** — and a stuck job **never hangs as an eternal spinner**. These are test-plan §2 risks **#1** (High×High: silent stall / permanent spinner) and **#6** (Realtime result never renders), inseparable in the browser, protected by Phase 4 of the test rollout.

## Starting Point

Playwright infra exists (config + storageState setup + seed/RULES levers + two risk-#2 specs from the standalone run); browsers not yet installed. The stub seam is proven in-repo (svix-signed `/callback` against local `functions serve` — the phase3 harness), with one gap: the success-path output URL must pass the SSRF allowlist and is really fetched by the function.

## Desired End State

`npm run test:e2e` and a new CI `e2e` job run the full gate green: north-star spec (seconds — stubbed completion) + stall spec (~30 s — real watchdog budget) + the existing #2 specs. `deploy` is gated on `[ci, integration, e2e]`. Live cold-boot verification is a documented manual smoke catching the F1/F2 config class (real signing secret, `EDGE_FUNCTION_URL`).

## Key Decisions Made

| Decision           | Choice                                                                    | Why (1 sentence)                                                                                          | Source   |
| ------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| Stub seam          | Signed `/callback` vs local `functions serve`                             | Zero-code, proven twice in-repo; covers verification, result materialization, retention                   | Research |
| Success output URL | Env-gated extra allowed origin (`E2E_ALLOWED_OUTPUT_ORIGIN`, default-off) | Fully offline deterministic PR gate; pinned external asset = the flake class we just purged from CI       | Plan     |
| PR-gate scope      | Happy path **and** stall→terminal                                         | Both halves of #1 gated; +~35 s wall-clock accepted over silent un-gating                                 | Plan     |
| CI shape           | Dedicated `e2e` job, `deploy.needs` += e2e                                | Cache isolation (browsers vs images), clean triage, parallel to `integration`                             | Plan     |
| Live smoke         | Manual runbook (`cloud-live-smoke.md`)                                    | The only layer that can catch prod-config faults; automation would spend the prod cap (3/day)             | Research |
| Risk #3 rider      | Out of scope                                                              | 429 spec needs a second webServer with `CLOUD_DAILY_CAP=0`; cap core already covered hermetic+integration | Plan     |
| Watchdog budgets   | Keep hardcoded (no test knobs)                                            | Stall spec pays the real 30 s instead of adding test-only branches to prod client code                    | Plan     |

## Scope

**In scope:** seam env (1 call site in `enhance/index.ts`), Node helpers (signer / flip / fixture server) + hermetic round-trip test, RGB JPG fixture, two specs (north-star, stall), CI `e2e` job + deploy gating, docs sync (CLAUDE.md, test-plan §6.3/§5/§3, live-smoke doc).

**Out of scope:** live Replicate in CI, scheduled smoke, risk-#3 browser spec, `/start` mock coverage, #15's hardening itself, risks #4/#5.

## Architecture / Approach

```
real UI submit (create-job → signed PUT; webhook unwired → row queued)
  → capture jobId (waitForResponse) → service-role flip to processing  [< 30 s!]
  → helper-signed POST /callback (output = local fixture server, env-allowed origin)
  → function fetches output, uploads result, marks succeeded, deletes source
  → Realtime UPDATE → slider + Download render, no refresh        ← the assertion
Stall spec = same submit, no flip, nothing: 30 s queued watchdog → role=alert timeout copy
```

## Phases at a Glance

| Phase                                     | What it delivers                                        | Key risk                                                               |
| ----------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Pipeline harness (→ /10x-implement)    | Env seam + signer/flip/fixture helpers + hermetic proof | Seam must stay default-off; #15 touches the same file                  |
| 2. North-star spec (→ /10x-e2e)           | The #1+#6 happy-path gate                               | < 30 s flip choreography; container→host reachability                  |
| 3. Stall spec (→ /10x-e2e)                | The "never hangs forever" gate                          | Requires unwired webhook (CI default; local precondition)              |
| 4. CI `e2e` job + docs (→ /10x-implement) | Third deploy gate + cookbook/smoke docs                 | `host.docker.internal` absent on Linux runners (fallback `172.17.0.1`) |

**Prerequisites:** Docker + local stack, `npx playwright install chromium` (first run), `functions serve` for phases 1-2.
**Estimated effort:** ~3-4 sessions across 4 phases.

## Open Risks & Assumptions

- Edge-runtime container can reach a host-bound fixture server in CI (probed, with bridge-IP fallback) — verified in Phase 4, fallback documented.
- The local edge runtime's per_worker flake (one observed early-terminated callback — archived review) may need a single retry tolerance in CI; watch for it.
- Stall spec assumes the webhook stays unwired in the gate environment — documented precondition, guaranteed in CI.

## Success Criteria (Summary)

- A regression that leaves the user on an eternal spinner (either half: never-completes or never-renders) turns a PR red before merge.
- The whole E2E gate is deterministic and offline — no external network in CI.
- A maintainer can verify the live pipeline config (F1/F2 class) by following one document.
