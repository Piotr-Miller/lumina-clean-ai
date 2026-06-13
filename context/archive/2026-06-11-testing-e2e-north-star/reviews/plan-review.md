<!-- PLAN-REVIEW-REPORT -->

# Plan Review: E2E North-Star (risks #1+#6)

- **Plan**: context/changes/testing-e2e-north-star/plan.md
- **Mode**: Deep
- **Date**: 2026-06-11
- **Verdict**: REVISE → SOUND (post-triage: all 6 findings fixed in plan, 2026-06-12)
- **Findings**: 1 critical, 3 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

8/8 paths ✓, 3/3 symbols ✓, brief↔plan ✓, contract-surfaces.md: absent (skipped). Deep verification (1 sub-agent): sweep-interference CLEARED (cutoff `STALE_PENDING_JOB_MS = 3_600_000` — photo-job.service.ts:22 — vs 5–25 s rows, 144× margin; owner-scope gives no protection under the shared user, the age cutoff is the only guard and it holds); disallowed-output behavior = HTTP 200 + row `failed`/`callback_failed` + source deleted (enhance/index.ts:419-421, 454-474); `isAllowedOutputUrl` is pure, 1-param (replicate-webhook.ts:229-237) — seam needs an additive optional param; blast radius: sole prod caller index.ts:419, unit tests pin behavior (tests/replicate-webhook.test.ts:133-159), only live `E2E_*` env is `E2E_BASE_URL` (playwright.config.ts:19,25) — no collision.

## Findings

### F1 — Progress↔Phase heading mismatch (parser contract)

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `## Phase 2` / `## Phase 3` body headings vs `## Progress`
- **Detail**: Body headings carry the suffix "(drive via /10x-e2e)" (Phases 2 and 3); the matching `### Phase N:` titles in Progress omit it. `/10x-implement` and `/10x-e2e` match phase titles exactly — the mismatch breaks Progress parsing.
- **Fix**: Drop "(drive via /10x-e2e)" from the body headings (the driver is already named in each phase's Overview and in Implementation Approach).
- **Decision**: FIXED

### F2 — Gate criterion 2.2 depends on never-executed #2 specs

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots / End-State Alignment
- **Location**: Phase 2 criterion 2.2 + "What We're NOT Doing"
- **Detail**: 2.2 requires a green full `npx playwright test`, which includes the seed + dashboard specs that have never been RUN (browsers not installed), while scope forbids changing them. First execution may surface out-of-scope breakage and strand the implementer. The plan also lacks a local `npx playwright install chromium` step (brief Prerequisites only).
- **Fix A ⭐ Recommended**: Add a Phase-2 setup step "install chromium + first green run of the existing specs", and amend scope: REVIEW-class fixes to the #2 specs are in scope for 2.2.
  - Strength: Leaner — no new phase; removes the criterion↔scope contradiction.
  - Tradeoff: Phase 2 may absorb debugging of pre-existing specs.
  - Confidence: HIGH — the specs passed static review; breakage risk is low but nonzero.
  - Blind spot: Actual live behavior of the #2 specs is unknown until run.
- **Fix B**: Move "browsers + first execution of the existing gate" to the end of Phase 1.
  - Strength: Clean sequencing — Phase 2 starts from a green base.
  - Tradeoff: Phase 1 gains a browser dependency its hermetic proof deliberately avoided.
  - Confidence: MED — mixes the phase's character.
  - Blind spot: Same as A.
- **Decision**: FIXED (Fix A)

### F3 — Stall spec exceeds Playwright's default 30 s test timeout

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Contract
- **Detail**: The spec waits ~30–35 s for the alert; `playwright.config.ts` sets no `timeout` (verified) → default 30 000 ms kills the test before the assertion can pass.
- **Fix**: State `test.setTimeout(60_000)` per-spec in the Phase 3 contract (not globally — the rest of the gate stays fast).
- **Decision**: FIXED

### F4 — Seam contract self-inconsistent ("keep pure" vs "passed into the check")

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — change #1
- **Detail**: Verified signature is 1-param `isAllowedOutputUrl(raw)` (replicate-webhook.ts:229, "Pure (no I/O)"). An origin cannot be "passed into the check" without changing the shared module's signature — the plan implies otherwise.
- **Fix**: Specify the additive optional param `isAllowedOutputUrl(raw, extraOrigin?)` — module stays pure/Vitest-testable; extend `tests/replicate-webhook.test.ts` with extraOrigin accept/reject cases; sole prod caller unchanged; env read stays Deno-side at the call site.
- **Decision**: FIXED

### F5 — Manual 1.5 mislabels the disallowed-output contract

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 1, manual criterion 1.5
- **Detail**: With the env unset, a disallowed output yields HTTP **200** (deliberate — stops Replicate retries) with the row `failed`/`callback_failed` and the source deleted (index.ts:454-474). "Rejected exactly as today" suggests a 4xx.
- **Fix**: Reword 1.5 to assert the real contract (200 + failed + `callback_failed` + source gone).
- **Decision**: FIXED

### F6 — Phase 3 cleanup omits the orphaned source object

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Contract
- **Detail**: The upload PUT lands; the timeout endpoint kills the job. Cleanup covers the row but not the storage prefix (whether the owner-scoped flip deletes the source is unverified).
- **Fix**: Phase 3 cleanup = job row + storage prefix (idempotent).
- **Decision**: FIXED
