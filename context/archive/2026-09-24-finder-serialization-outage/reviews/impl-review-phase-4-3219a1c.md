<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder output without `response_format`

- **Plan**: context/changes/finder-serialization-outage/plan.md
- **Scope**: Phase 4 of 6 (phases 0–5)
- **Base**: e5be9ff663596a5ca859cb20c55a0c87a380cfdc (Progress: previous phase)
- **Head**: 3219a1c3d1f504642ca18d5f75e7105a8201c1bf
- **Worktree**: included(context/changes/finder-serialization-outage/plan.md, context/changes/finder-serialization-outage/change.md); bookkeeping only
- **Checks ran at**: 3219a1c3d1f504642ca18d5f75e7105a8201c1bf (temporary detached checkout; artifact checks used Git objects)
- **Manual acceptance**: 0 of 2 confirmed — pending: 4.3 owner hand-read, 4.4 endpoint-list acceptance
- **Date**: 2026-10-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

## Findings

### F1 — Fixture gate cannot detect reasoning text

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: packages/code-reviewer/evals/finder-provider.ts:251
- **Detail**: Phase 4 Amendment A3 rejects requests returning reasoning tokens OR reasoning text. The promptfoo adapter records only SDK reasoning tokens, with no reasoning-text length or raw OpenRouter token fallback. All 48 saved fixture rows have `stepReasoningTokens`, but no reasoning-text evidence. A response with reasoning text and zero/absent token counts can therefore be recorded as `reasoningLeak: false`. The gate.md claim of no reasoning text on every request is not established for the fixture attempts. The G1/G2 runner correctly checks both channels; the defect is confined to fixture telemetry and the resulting G3/G4 evidence.
- **Fix**: Capture reasoning text length and raw token counts per step, cover a text-only reasoning response with a hermetic test, and reassess the fixture attempts using retained full responses; repeat affected measurements only if those responses are unavailable. Correct the gate claim until that evidence exists.
  - Strength: Implements the same A3 check already used by finder-gate.mjs and prevents an endpoint from passing on an unverified request shape.
  - Tradeoff: Recovering evidence may require additional paid measurements and owner budget approval.
  - Confidence: HIGH — the adapter and saved JSONL rows omit the required text channel.
  - Blind spot: Full original promptfoo/provider responses may survive outside the committed artifacts; their availability was not established.
- **Decision**: FIX — the owner, 2026-10-02: Novita's admission to production depends on its G3/G4
  fixture result, and A3 requires checking both reasoning tokens and reasoning text. The adapter therefore
  records both channels, and Novita's fixture rows get A3 evidence. The other endpoints fail other gates,
  so for them a corrected statement is enough, with no re-measurement.

## Verification

- Artifact validator: PASS, exit 0. Read all 12 JSONL files from the recorded Git object. Each endpoint has 10 PR269 attempts, 5 clean attempts, and 12 fixture rows; PR269/clean attempt IDs are consecutive. Fixture provider arrays match their pins and step counts; all fixture rows report complete cost telemetry.
- Recomputed G1/G2: z-ai 10/10 and 2/5; novita 10/10 and 5/5; deepinfra 5/10 and 4/5; venice 10/10 and 3/5. All match gate.md.
- Recomputed fixture cost medians: z-ai $0.00180328, novita $0.00162580, deepinfra $0.00121460, venice $0.00078374. Required fixture metric totals match the reported table, including stale-closure misses on z-ai and Venice. This checks the recorded scores, not a fresh model grading.
- `npm test > /tmp/finder-phase4-review-test.log 2>&1`: PASS, exit 0; `Test Files 21 passed (21)`, `Tests 700 passed (700)`.
- `npm run lint > /tmp/finder-phase4-review-lint.log 2>&1`: PASS, exit 0; `eslint .`.
- `npm run typecheck > /tmp/finder-phase4-review-types.log 2>&1`: PASS, exit 0; `tsc --noEmit`.
- Prescribed live promptfoo repeat for each endpoint: NOT RUN. Phase 4 has an explicit $2.30 owner-authorized total cap and records $1.442655 spent, leaving $0.857345. A repeat of the four matrices has no established bound within that remainder (the previous fixture finder calls plus grading cost about $0.367595, but future cost is variable). The complete original Phase 4 rerun would exceed the remainder at its recorded cost. Existing evidence was inspected instead; this is not a fresh verification of the prescribed live commands. Additional paid work requires a bounded spend decision. F1 independently prevents the saved artifacts from establishing the full A3 condition.
- Mutation testing: skipped. The foundation test-plan risks #1–#6 concern the photo-processing/auth/storage pipeline; this tooling change does not touch their behavior.

## Review Notes

- **Bookkeeping in diff**: the 12 gate JSONL files, gate.md, hand-read-269.md, and reviews/impl-review-phase-3-e5be9ff.md under context/changes/finder-serialization-outage/.
- Lessons: 34 of 37 ledger entries apply to impl-review; applied the rules concerning failed-attempt denominators, live evidence, and guards that cannot establish what they report.
- The range includes b3a4a38, the explicit phase-3 F1 fix in config.ts/provider-routing.test.ts. It is a documented follow-up, with targeted tests, rather than unplanned phase-4 scope.
- finder-provider.ts and its test extend telemetry to support A3 and are justified supporting changes to the planned gate runner.
- Excluded local work: .claude/settings.local.json, temp_steps.md, and context/changes/cloud-exif-orientation/change.md. The later HEAD 5d724580ed27326f1fa6cfb7889589891bddf560 changes review.yml and is outside this phase review.
- The owner hand-read material is present with deduplicated defects and contributing attempt IDs. No manual acceptance is asserted or substituted by this review. Novita remains a candidate, not an admitted production endpoint.
- Temporary checkout removed and stale registration pruned. No implementation fixes applied and no commit created.
