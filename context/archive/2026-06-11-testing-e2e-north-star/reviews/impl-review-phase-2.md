<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: E2E North-Star (risks #1+#6) — Phase 2 (North-star spec)

- **Plan**: context/changes/testing-e2e-north-star/plan.md
- **Scope**: Phase 2 of 4
- **Date**: 2026-06-12
- **Commit**: d6ba832
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success criteria (re-verified post-commit)

- 2.1–2.3: full Playwright gate → 4 passed (13.7s) — setup + seed + anon-dashboard + north-star
- 2.4: `npx eslint tests/e2e playwright.config.ts` → clean; `npx tsc --noEmit` → clean
- 2.5: deliberate breaks run twice in-session (succeeded-wins derivation AND cloudResultReady render guard) — each red at the slider assertion, reverted, tree verified byte-clean
- 2.6: headed run with no-reload witness marker (survived submit→render), keyboard slider interaction (aria-valuenow 50→54), screenshots visually inspected
- Mutation check: skipped — commit touches no src/ risk module (tests + config only)

Drift summary: every planned step MATCH (flow, ordering, contract, locators verified against real components); no "What We're NOT Doing" boundary crossed; one justified EXTRA (F2).

## Findings

### F1 — Nothing enforces "local stack only" for the service-role E2E suite

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/auth.setup.ts:16 (+ adminClient() in 4 files)
- **Detail**: The setup account uses a committed deterministic password, and every spec builds a service-role client straight from SUPABASE_URL. Pointed at a remote project, the suite would create that account remotely and run admin deletes there. Bounded (deletes scoped to run-created IDs; operator must already hold the remote service-role key) — but the boundary is documentation, not code.
- **Fix**: Add tests/e2e/helpers/env.ts — one shared adminClient() that hard-fails unless the SUPABASE_URL hostname is localhost/127.0.0.1 (env escape hatch for intentional remote runs) — and reuse it in the four files.
  - Strength: Turns a doc-only convention into an enforced guard; also removes the 4× copy-paste.
  - Tradeoff: Touches all four spec files post-commit.
  - Confidence: HIGH — pure test-side change; gate re-run proves it.
  - Blind spot: None significant.
- **Decision**: ACCEPTED — APPLIED 2026-06-12. `tests/e2e/helpers/env.ts` added (`supabaseEnv` + `adminClient`, loopback-only with `E2E_ALLOW_REMOTE_SUPABASE=1` escape hatch); all four files rewired (also removed the north-star spec's duplicated inline env check). Verified: full gate green (4 passed), and a run with `SUPABASE_URL=https://example.supabase.co` hard-fails with the guard's message.

### F2 — Unplanned helper: tests/e2e/helpers/realtime-ready.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/e2e/helpers/realtime-ready.ts
- **Detail**: Phase 2 planned exactly one new file; this second one was born mid-phase from a real discovered flake (idle local Realtime tenant re-initializes on first join and drops postgres_changes events mid-warmup — would hit every fresh CI boot). Setup-only and justified by the "preconditions hard-fail loudly" contract's spirit, but it is not in the plan, and Phase 4's CI determinism now depends on it.
- **Fix**: Back-record it — addendum line in the plan's Phase 2 block + a note in Phase 4's contract that the e2e job relies on the warmup precondition.
- **Decision**: ACCEPTED — APPLIED 2026-06-12. Plan Phase 2 gained a "Realtime warmup helper (addendum)" entry; Phase 4's e2e-job contract now names the warmup precondition.

### F3 — Port-8787 single-instance rule missing from RULES.md

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/RULES.md
- **Detail**: The fixture server's fixed port (origin baked into E2E_ALLOWED_OUTPUT_ORIGIN at serve startup) means only ONE spec may use it; under fullyParallel a future second fixture-server spec would collide. The constraint lives only in helper comments — not in the generation lever future specs are built from.
- **Fix**: One line in RULES.md.
- **Decision**: ACCEPTED — APPLIED 2026-06-12. RULES.md now states the port-8787 single-spec rule (one fixture-server spec under `fullyParallel`; new specs share the north-star flow, never start a second server).

### F4 — 15s slider budget vs the app's 30s watchdog recovery

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: tests/e2e/north-star-cloud-result.spec.ts:221
- **Detail**: If Realtime drops the event despite the warmup, the app's next self-heal is the 30s queued-deadline re-read — outside the 15s budget, so it would surface as a flake. Already mitigated (warmup + CI retries: 1).
- **Fix**: None needed — recorded as the first place to look in any future flake triage.
- **Decision**: ACCEPTED 2026-06-12 — no action; this finding is the flake-triage pointer.

### F5 — Narrow orphaned-row window on create-job 500-after-insert

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (data safety)
- **Location**: tests/e2e/north-star-cloud-result.spec.ts:160
- **Detail**: jobId is captured only from a successful create-job response; a 500-after-insert would orphan a queued row under the shared storageState account (cleanup correctly refuses "all rows for the user"). Bounded residue on a dedicated local account.
- **Fix**: Accept — awareness only.
- **Decision**: ACCEPTED 2026-06-12 — no action; bounded residue on a dedicated local account.

### F6 — Setup-error label could mislabel a real function regression

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (diagnostics)
- **Location**: tests/e2e/north-star-cloud-result.spec.ts:198
- **Detail**: The post-callback row read (correctly setup-sanity — /callback deliberately answers 200 on failure) throws an error naming only harness causes; a genuine result-materialization regression in the Edge Function would be reported under that label. The test still goes red either way.
- **Fix**: Add "or a result-materialization regression in the Edge Function" to the error text.
- **Decision**: ACCEPTED — APPLIED 2026-06-12. Setup-error text now lists "a result-materialization regression in the Edge Function itself" as a likely cause.
