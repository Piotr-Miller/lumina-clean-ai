# Phase 1 implementation-review fixes

Source: `../reviews/impl-review-phase-1-9d47635.md`.

- 2026-11-17 — F1: owner selected Fix now. Applied explicit validation of both
  `input_dimensions` and `request_size` in `scripts/gpt26/check_series.py`; accepted values
  are lists of two positive integers, excluding booleans. Every accepted slot proceeds to
  size and cost verification. Added offline CLI regressions in
  `scripts/gpt26/tests/test_check_series.py`; 4 tests pass after reproducing failures before
  the fix. Changes remain uncommitted; no commit or push is authorized.
- 2026-11-17 — F2: owner selected Fix now and approved all recommended fixes. Validated
  required arithmetic fields in the cost bound and size rule before dependent calculations;
  invalid fields produce a discrepancy report with exit 1 rather than a traceback. Tests
  cover missing cost fields, invalid numeric types/values, missing/invalid size fields and
  invalid calculation blocks. The expanded offline CLI suite passes all 8 tests. F1 and F2
  are FIXED; no triage remains pending. Changes remain uncommitted and unpushed.

## Phase 2 implementation-review fixes

Source: `../reviews/impl-review-phase-2-d69ec55.md`.

- 2026-11-20 — F1: owner selected Fix now. Applied numeric validation before GPT26/S-19
  approval and admission, finite nonnegative provider usage/cost validation with full-bound
  fallback, and rejection of malformed ledger monetary amounts. Fixed the sibling S-19
  approval/accounting paths in `scripts/s19/protocol.py` and `scripts/s19/run-candidate.py`
  as well as `scripts/gpt26/run.py` and `scripts/gpt26/state.py`. Added eight regression
  tests in `scripts/gpt26/tests/test_run.py`; the initial six reproduced the defects before
  the fix. Final checks: GPT26 69 tests / exit 0; S-19 85 tests / exit 0. Acceptance script
  exit 0, all Manual rows pending, none reopened. Changes are verified in the worktree over
  83851c7 and remain uncommitted for the next implementation commit. F2 and F3 remain
  pending triage; the original review verdict still covers d69ec55.
- 2026-11-20 — F2: owner selected Fix now. `state.reconcile` now requires complete recorded
  and independently supplied `expected_bindings` for started records, including the exact
  registration/rule inventory and matching file identities. The runner supplies checkout
  identities during initial reconciliation and locked admission; mutable approval bookkeeping
  is excluded from identity-only comparison while paid preflight retains its approval checks.
  Existing direct reconciler tests now supply real bindings. Seven added regressions reproduced
  the gap before the fix; final combined GPT26 suite: 76 tests / exit 0. Acceptance script
  exit 0, all Manual rows pending, none reopened. F1 and F2 are fixed and uncommitted over
  83851c7; F3 remains pending triage. When implementing the phase-3 builder/gate, supply
  independent expected checkout identities to the shared reconciler; never use the sidecar's
  own bindings as its expected identities. Review that caller wiring in phase 3.
- 2026-11-20 — F3: owner selected Fix now. Budget-refusal evidence is written under the
  admission lock in both S-19 context variants. GPT26 validates each refusal against its
  historical ledger prefix and registered bound, requires a real breach for breach-stop
  terminals, and requires failed/exhausted history for technical terminals. Resume finalizes
  interrupted budget terminals without buying another attempt. Six added regressions failed
  before the fix and pass afterwards. Final combined checks: GPT26 82 tests / exit 0;
  S-19 85 tests / exit 0. Acceptance script exit 0; all Manual rows pending, none reopened.
  **F1, F2 and F3 are FIXED; no triage remains pending.** All code and review records remain
  uncommitted over 83851c7 for the next implementation commit; the original review verdict
  continues to cover d69ec55.
