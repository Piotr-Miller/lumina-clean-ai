<!-- PLAN-REVIEW-REPORT -->

# Plan Review: AI Review Weekly Report

- **Plan**: context/changes/ai-review-weekly-report/plan.md
- **Mode**: Deep
- **Date**: 2026-10-21
- **Plan sha256**: 5801cc860297cd0e2d69e96e7ab00936ed4a6058d47a8956c03a31b0244318ac
- **Plan sha256 after triage**: 0d71d44aefc324c51d0cd2f2a88e2eba9670626c3a80cb97656cd4fd439926f2
- **Verdict**: RETHINK
- **Findings**: 3 critical, 3 warnings, 0 observations

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | FAIL    |
| End-State Alignment    | FAIL    |
| Lean Execution         | PASS    |
| Architectural Fitness  | PASS    |
| Blind Spots            | WARNING |
| Plan Completeness      | FAIL    |

## Grounding

14/14 planned file paths are valid: three existing files and eleven proposed new files with existing parents. Referenced telemetry types, sticky-comment predicate and thin-shell pattern are confirmed. Phase titles, verification counts and Progress structure match. Four unique baseline commands were re-run: package typecheck, package lint, all 716 package tests, and Prettier over `.github/workflows` and `AGENTS.md`; all exited 0, matching the eight recorded baseline rows. Commands requiring implementation output, external access or publication were not re-run. Read 29/39 applicable lessons in full. The brief and plan agree on the approach but share the assumptions identified below. No contract-surfaces document exists.

Independent degenerate walkthrough: PR #801 has two reviewed runs at the same timestamp, with different findings and no plan; aggregation into one PR is decided, latest-run selection is not, and blanket absent-cost logic incorrectly marks both partial. PR #802 has a legacy artifact without telemetry: unknown spend is correctly specified. An empty week renders zero runs. Sunday 23:59:59Z versus Monday 00:00:00Z membership is decided. An old workflow ID re-run on Monday leaves attempt accounting unresolved. A focused read-only analysis delegate verified producer and workflow contracts; no code, commits or external state were changed.

## Findings

### F1 — Missing artifacts can turn paid runs into $0

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Requirement Definition
- **Location**: Definitions — Run class; Phase 2 — collectWeek and tests
- **Detail**: `success` plus no artifact is classified as a docs-only no-review run at $0. Since 2026-09-24 GitHub omits expired artifacts from REST responses, so a successful paid historical run can satisfy this predicate and avoid the unreported alarm. The fixture expecting a listed expired artifact does not cover the real response. See [GitHub changelog](https://github.blog/changelog/2026-09-24-expired-github-actions-artifacts-no-longer-shown-in-ui-and-api/). The current docs-only path sets SKIP_REVIEW in `.github/workflows/review.yml:275-279` and skips AI review at line 294. Live run 39661423430 confirms skipped AI review and upload steps on a successful run.
- **Fix**: Classify no-review only after positive evidence that the review was skipped; otherwise a missing artifact is unreported. Add a job-step lookup and tests for successful paid runs whose expired/deleted artifacts are absent from the response, and for unreadable skip evidence.
  - Strength: Prevents false $0 and preserves the unreported alarm.
  - Tradeoff: Additional job-step reads when no artifact exists.
  - Confidence: HIGH — confirmed by workflow code, a live run and the platform changelog.
  - Blind spot: Missing job history cannot prove a skip and must remain unreported.
- **Decision**: FIXED — positive same-attempt skip evidence required for $0; edited: Current State Analysis, Definitions — Run class and dataset, What We're NOT Doing — Backfilling, Critical Implementation Details — Missing artifacts require positive skip evidence, Phase 1 — Tests, Phase 2 — GitHub IO and Tests, Performance Considerations, plan-brief — Open Risks & Assumptions; reopened: none

### F2 — The collector has no PR identity resolution contract

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — collectWeek, plan.md:182-186
- **Detail**: The collector jumps from workflow runs to per-PR calls without specifying PR resolution. All 25 checked runs returned `pull_requests: []`, including required baseline run 39653424585 for PR #300. PipelineResult has no PR number (`packages/code-reviewer/src/schemas.ts:227-282`); the existing publisher instead uses event context (`.github/actions/ai-review/action.yml:113,137`). The per-PR table, labels and reactions cannot rely on the run response alone.
- **Fix**: Specify and verify a commit/ref-to-PR fallback, disambiguation and the outcome for unmapped runs, and test an empty pull_requests response using the baseline run's shape.
  - Strength: Covers the real acceptance data instead of only synthetic PR associations.
  - Tradeoff: Extra API calls and explicit ambiguity handling.
  - Confidence: HIGH — the missing association is confirmed by live read-only API responses.
  - Blind spot: The proposed fallback needs its own API verification.
- **Decision**: FIXED — unique repository/ref association with commit-associated PR fallback; verified: baseline run 39653424585 maps to closed PR #300 despite its advanced current head SHA; edited: Current State Analysis — Run-to-PR identity, Definitions — PR association and dataset, Desired End State, Critical Implementation Details — PR identity, Phase 1 — Tests, Phase 2 — GitHub IO and Tests, Phase 3 — local dry-run criterion, Performance Considerations, plan-brief — Key Decisions Made and Desired End State and Open Risks & Assumptions; reopened: none

### F3 — dry-run=false still adds --dry-run

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — workflow Steps, plan.md:269
- **Detail**: `${DRY_RUN:+--dry-run}` tests for a nonempty string. The env value `false` is nonempty and therefore adds --dry-run; a local Bash reproduction confirmed the argument. The default manual dispatch would not publish. See also [GitHub expression string conversion](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions).
- **Fix**: Build arguments with a Bash array and add --dry-run only when DRY_RUN equals true. Verify true, false and an absent value through the actual workflow argument construction.
- **Decision**: FIXED — Bash argument array, --dry-run only for literal true, and a planned test of the actual YAML command; verified: the plan's Bash block passed all 12 local dry-run/week argument combinations with a stub npm and a path containing spaces; edited: Phase 3 — Scheduled workflow, Workflow invocation tests and Automated Verification, Testing Strategy — Unit Tests, plan-brief — Architecture / Approach; reopened: none

### F4 — Actions re-run attempts have no accounting definition

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Requirement Definition
- **Location**: Definitions — Week and Run cost; Phase 2 — artifact collection
- **Detail**: The runs API exposes one workflow ID with run_attempt, but telemetry starts anew for each process (`packages/code-reviewer/src/pipeline.ts:537,569,699`). Live runs 35917150627, 34277863262 and 31707888975 have multiple attempts. Downloading one review.json does not account for prior attempts. A new attempt after the week boundary also retains the workflow's original created_at. The plan never decides whether the accounting unit is a workflow ID or an execution attempt. See [workflow-runs API](https://docs.github.com/en/rest/actions/workflow-runs).
- **Fix A ⭐ Recommended**: Keep workflow IDs as the unit, explicitly expose prior unobserved attempts and display their spend as a lower bound; decide their alarm treatment.
  - Strength: Preserves the current collector's scope.
  - Tradeoff: Does not reconstruct complete per-attempt spend.
  - Confidence: HIGH — run_attempt exposes the known gap.
  - Blind spot: Alarm treatment still requires an explicit decision.
- **Fix B**: Account for every attempt separately and define its week membership.
  - Strength: More complete execution and spend accounting.
  - Tradeoff: A broader collector, artifact association and time-window design.
  - Confidence: MEDIUM — attempt metadata is available, but historical artifact association was not verified.
  - Blind spot: Availability of earlier attempts' artifacts.
- **Decision**: FIXED — Fix A accepted 2026-10-22: one observed snapshot per workflow ID, original created_at cohort, observation timestamp, explicit unobserved/unknown attempts, and coverage alarm over the union of affected workflow IDs (each ID once); edited: Overview, Current State Analysis — Actions attempts, Definitions — Week and Run class and Run accounting and Weekly / per-PR spend and Alarm and independent fixtures, Desired End State, Critical Implementation Details — One observed snapshot per workflow ID, Phase 1 — Markdown rendering and Tests, Phase 2 — GitHub IO and Tests, Phase 3 — AGENTS.md pointer contract, Testing Strategy, plan-brief — Desired End State and Key Decisions Made and Scope and Open Risks & Assumptions and Success Criteria; reopened: none

### F5 — Missing and present costs do not establish pass completeness

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Definitions — Run cost and Weekly / per-PR spend
- **Detail**: A planless run returns no impl fields (`packages/code-reviewer/src/pipeline.ts:684`), and a gated impl pass is skipped with no telemetry (lines 688-695). Those are not missing spend, but the blanket absent-field rule marks the run partial. Conversely, a present cost sum does not prove every request reported cost: the accumulators skip undefined costs (lines 547-550, 569-576 and 704-713). Existing artifacts cannot establish complete request coverage merely from cost-field presence.
- **Fix**: Treat absent/skipped impl as not applicable; distinguish missing spend from an executed pass; describe totals as observed provider-reported spend and do not promise full coverage without additional telemetry.
  - Strength: Gives honest semantics without extending production telemetry in this change.
  - Tradeoff: More conservative completeness and amount labels.
  - Confidence: HIGH — both counterexamples follow directly from producer code.
  - Blind spot: Missing individual request costs cannot be recovered from the aggregate artifact.
- **Decision**: FIXED — accepted 2026-10-22: not-run versus unknown executed-pass cost, explicit reported zero, observed provider-reported labels and per-request completeness caveat; F4 coverage alarm retained; edited: Current State Analysis — review.json cost semantics, Definitions — Run cost and Weekly / per-PR spend, Desired End State — per-pass spend, Critical Implementation Details — Pass applicability and reported cost, Phase 1 — runCost contract and Markdown rendering and Tests, Testing Strategy — Unit Tests, plan-brief — Key Decisions Made and Desired End State and Open Risks & Assumptions and Success Criteria; reopened: none

### F6 — Latest reviewed run has no tie rule

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Requirement Definition
- **Location**: Definitions — Finding counts, plan.md:33
- **Detail**: Two reviewed runs for one PR can share created_at while having different verdicts and findings. No secondary ordering is specified, so the per-PR row can depend on input/API ordering.
- **Fix**: Decide a deterministic ordering, for example created_at followed by numeric run ID, and test tied timestamps with reversed input ordering.
- **Decision**: FIXED — accepted 2026-10-22: greatest original created_at, then greatest numeric workflow run ID; verdict and finding counts use the same snapshot; edited: Definitions — Finding counts and independent latest-selection fixture, Desired End State — per-PR row, Phase 1 — Tests, plan-brief — Key Decisions Made; reopened: none

## Triage summary (2026-10-22)

- **Fixed**: F1, F2, F3, F4 (Fix A), F5, F6 — 6/6.
- **Skipped / Accepted / Dismissed**: none.
- **Verdict after fixes**: SOUND (original review: RETHINK).
- **Verification**: All four phase names match Progress; all Automated/Manual criterion counts match the 20 unique Progress rows; all 15 declared file paths exist or have existing parents. Prettier passes for the four edited documents. The acceptance-state script succeeds and all six Manual rows remain pending; no Progress rows were changed by triage. The planned Bash invocation was locally exercised in 12 argument combinations during F3 with a stub npm.
- **Implementation state**: No implementation files were created and no implementation progress or manual acceptance was claimed. The original findings/verdict above remain the review history; this section records their triage outcome.
