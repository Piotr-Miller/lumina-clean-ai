<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Risk #3 — Cloud Daily-Cap Route Rejection Coverage

- **Plan**: context/changes/cap-rejection-coverage/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-06-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Stub query builder resolves every awaited chain to one combined object

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; no action needed now
- **Dimension**: Safety & Quality
- **Location**: tests/cloud-create-job.handler.test.ts:60-67
- **Detail**: The stub's thenable resolves BOTH the sweep chain and the cap-count chain to the same `{ data: [], count, error: null }`. It works today only because each consumer destructures the one field it reads (sweep → `data`, count → `count`). If a future refactor made the sweep read `count` (or the cap count read `data`), the stub would silently lie rather than fail. Forward-looking fidelity note, not a current defect — the handler's real call shape matches what the stub feeds.
- **Fix**: None now. If the handler's query usage changes, split the stub into per-call resolved values (sweep vs. count) so it can't answer a question the real client wouldn't.
- **Decision**: SKIPPED (no action needed — accepted as forward-looking note)

### F2 — New readBody/ResponseBody helper introduces a test-local pattern

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; no action needed now
- **Dimension**: Pattern Consistency
- **Location**: tests/cloud-create-job.handler.test.ts:5-17
- **Detail**: No existing test parses a Response body, so there was no prior pattern to match. The typed `readBody`/`ResponseBody` helper answers the repo's type-checked ESLint rules (`no-unsafe-assignment` on `res.json()`'s `any`) — consistent with the Windows-lint-discipline lesson. Clean and self-contained; noted only so the next route test reuses it rather than re-inventing.
- **Fix**: None. Consider lifting it to a shared `tests/helpers/` util when a second route test needs it (don't pre-abstract for one caller).
- **Decision**: SKIPPED (no action needed — accepted as forward-looking note)

## Notes

- Plan Adherence: all four boundary cases implemented exactly as specified (over-cap `N=cap`, above-cap `N=cap+1`, last-slot `N=cap-1` → 200 with full `CreatePhotoJobResponse` shape, `cap=0` kill-switch). Header rationale comment mirrors `photo-job.service.test.ts:4-9` as the plan required.
- The reject-before-insert guard (insert + createSignedUploadUrl not called) is present and was manually proven to have teeth via a reorder-mutation run (3 tests went red on the not-called assertions while status stayed 429).
- Scope: test 2 (above-cap) adds not-called assertions beyond the plan's literal "→ 429" — benign hardening, fully aligned with the change's thesis. Not flagged as drift.
- Success Criteria: `test:unit` 104/104 green; eslint clean on the new file; manual check 2.4 satisfied.
