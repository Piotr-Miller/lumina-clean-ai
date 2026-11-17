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
