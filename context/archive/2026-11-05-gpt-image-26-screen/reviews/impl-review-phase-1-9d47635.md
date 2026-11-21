<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: GPT-Image-2.6 Sunburst screening test

- **Plan**: context/changes/gpt-image-26-screen/plan.md
- **Scope**: Phase 1 (phases 1–5)
- **Session**: fresh
- **Base**: a0193b0777589f497994b8d1c908344bb4f4817f (explicit)
- **Head**: 9d476358401f7a8b13662a3fb05f33c639a2a302
- **Worktree**: excluded — clean at review start; no local implementation changes
- **Checks ran at**: 9d476358401f7a8b13662a3fb05f33c639a2a302 (detached temporary checkout)
- **Manual acceptance**: 0 of 2 confirmed — pending: 1.4, 1.5
- **Date**: 2026-11-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

The three planned commands pass on the committed registration. F1 nevertheless breaks the
checker's required cost-verification invariant on a valid JSON representation of the same
dimensions, so these are substantive warnings and the overall verdict is NEEDS ATTENTION.
This review covers pre-registration only; it does not approve spend or later phases.

## Findings

### F1 — Float dimensions bypass cost-bound verification

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/gpt26/check_series.py:243
- **Detail**: Phase 1 requires every slot's cost bound to be recomputed from the config, with
  invalid registration data rejected. The comparison with Phase 5 at lines 239–241 accepts
  `[3840.0, 2560.0]` as equal to `[3840, 2560]`. The following `isinstance(d, int)` guard rejects
  those values for calculation, but has no diagnostic `else`, so it silently skips both size
  and cost verification. Changing only S17-03/1's `input_dimensions` to those float values
  and `cost_bound_usd` from `0.20` to `0.01` makes the CLI exit **0**, printing
  `first-attempt bounds total $1.01`. With integer dimensions and the same understated cost,
  it correctly exits 1: `cost_bound_usd is 0.01, the config gives 0.2`. Thus the verification
  result depends on the numeric JSON representation and can falsely certify a wrong bound.
  The committed six-slot registration itself contains integer dimensions and correct bounds;
  this is a defect in the verifier, not evidence that this run spent money or exceeded its cap.
- **Fix**: Validate source and request dimensions explicitly before calculation, reject invalid
  types with a slot-specific discrepancy, and ensure every accepted slot reaches cost-bound
  recomputation. Add a focused regression for float dimensions combined with an understated bound.
  - Strength: Restores the required invariant that no accepted slot escapes cost verification.
  - Tradeoff: Introduces an explicit numeric-shape validation boundary in the offline checker.
  - Confidence: HIGH — independently reproduced through the exact committed CLI in a disposable copy.
  - Blind spot: Phase 2 runner integration and its checker/formula parity tests do not exist yet.
- **Decision**: FIXED — explicit positive-integer validation of source and request dimensions before calculations; siblings: request_size validation fixed in scripts/gpt26/check_series.py, scripts/s19/run-candidate.py n/a (derives dimensions from decoded images, not the registration JSON), scripts/s19/make-series.py n/a (generates registration from image dimensions), scripts/s20 n/a (no equivalent registration cost-bound checker); reopened: none. Four offline CLI regression tests pass on the uncommitted fix at session HEAD 26b2a68; the reviewed verdict above still describes 9d47635.

### F2 — Invalid calculation fields suppress the discrepancy report

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/gpt26/check_series.py:274
- **Detail**: The Phase 1 checker contract promises exit 1 with a specific discrepancy for
  missing or invalid data. `check_config` collects missing-field errors, but `main` still calls
  `check_series` whenever `size_rule` and `cost_bound` are dictionaries. Deleting
  `cost_bound.rounding_usd` reaches line 129 and raises an uncaught
  `KeyError: 'rounding_usd'` before the collected errors print. Independently, changing
  S17-03/1's request width from `2336` to `"2336"` collects a dimension discrepancy, then
  reaches line 249 and raises a `TypeError` in `cost_bound`. Both CLI probes exit 1 but emit a
  traceback instead of the promised file/field/repair report. This fails closed; it does not
  admit a bad registration, but deprives the owner of the intended diagnostic.
- **Fix**: Validate required calculation keys and numeric shapes before invoking arithmetic;
  preserve and print collected discrepancies when dependent calculations cannot run. Cover the
  missing `rounding_usd` and string request-width cases with focused regressions.
- **Decision**: FIXED — validate required arithmetic fields before dependent series calculations; siblings: all seven cost_bound numeric fields and size_rule multiple/max_pixels/min_pixels/max_edge/max_aspect validated in scripts/gpt26/check_series.py, request_size string case fixed with F1, scripts/s19/run-candidate.py n/a (provider runner, not this offline discrepancy-report boundary), scripts/s19/make-series.py n/a (generates series rather than validating the screen registration), scripts/s20 n/a (no equivalent cost-bound registration checker); reopened: none. Eight offline CLI regression tests pass on the uncommitted combined fix at session HEAD 26b2a68.

The F1 fix resolves the string request-width case through explicit dimension validation.
The F2 fix resolves the missing `cost_bound.rounding_usd` case through calculation-config
validation; the final verification is recorded under Triage complete below.

## Review Notes

- **Bookkeeping in diff**: context/changes/gpt-image-26-screen/change.md,
  context/changes/gpt-image-26-screen/evaluations/vendor-facts.md,
  context/changes/gpt-image-26-screen/plan-brief.md,
  context/changes/gpt-image-26-screen/plan.md,
  context/changes/gpt-image-26-screen/reviews/plan-review.md. These paths were not treated as
  unplanned additions; planned evidence inside them was still reviewed.
- **Boundary**: The implementation commit is `9d47635`. Session HEAD is
  `26b2a68eed1d920bf73c01299f1e754fa2b989d9`; `44a88c8` records SHA write-back and
  `temp_steps.md`, and `26b2a68` records owner confirmations. Their changes to `plan.md`,
  `change.md`, and `temp_steps.md` are later bookkeeping, not part of the implementation diff.
  Config, series, checker and vendor-facts bytes are unchanged between the reviewed commit
  and session HEAD. No pre-existing dirty paths were included or excluded individually.
- **Progress**: Current plan rows 1.1–1.3 carry `9d47635`, which is an ancestor of session HEAD.
  At the phase commit those rows were checked without SHA suffixes; the three checks were
  therefore re-run rather than inferred from their marks. Phases 2–5 remain pending and were
  not reviewed as missing implementation. No malformed n/a rows were found.
- **Manual acceptance**: The shared `acceptance-state.sh` ran in the detached checkout and
  exited 0, reporting `pending` for 1.4 and 1.5. Current `change.md` records the owner's
  confirmations at `9d47635`; vendor-facts SHA-256 is
  `51f6c37b8dfcdcf0b08ff2c3256362b1a809d2253d89996a2c7392f28697e5cd` and config SHA-256 is
  `bda91bfbcc01e25635b563ed80dfc19d1e638eeb3612b7e8d904e2d7683bb95d`, matching its notes.
  Per the owner's instruction, Manual Progress rows stay unchecked until merge, then receive
  `accepted at <master SHA>`. Pending formal recording is not a finding or a verdict penalty.
  No Manual n/a, stale, or unverifiable rows exist in this scope. Analysis changed no Progress rows.
- **Lessons**: Read all 35 of 39 entries selected by `impl-review`/`all` or absent applicability.
  The directly relevant priors concern success-only guards, actionable check diagnostics,
  verifying cited evidence, and stale pointers. F1 and F2 are supported by executions, not
  merely by a lesson's wording.
- **Review passes**: Two independent read-only delegates examined plan drift and
  safety/quality/patterns. Plan drift found all five planned artifacts present and matching.
  The main reviewer independently reproduced both safety findings before reporting them.
  Pattern comparisons used S-19 `tally.py` and S-20 `pointers.py`; no substantive pattern
  mismatch was found. No delegate edited repository files.
- **Registration**: Prompt, size rule, retry and original cost fields match Phase 5. All ten
  Definitions rows are present in the gate, along with the repeated-Local risk and two-pass
  controls. The series binds six slots to the config hash, copies Phase-5 inputs and sizes,
  has no prerequisites, and records $0.20 per first attempt, $1.20 total. The approvals section
  contains only its commented grammar; it grants no spend approval.
- **Vendor grounding, re-read 2026-11-17**: The model and request fields remain documented by
  the [model page](https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst),
  [edits reference](https://developers.openai.com/api/reference/resources/images/methods/edit),
  and [image guide](https://developers.openai.com/api/docs/guides/image-generation).
  [Pricing](https://developers.openai.com/api/docs/pricing) agrees with the recorded standard
  rates and Batch discrepancy. The guide grants custom dimensions to Sunburst/Flare while the
  edits reference's explicit custom-size model list omits 2.6; vendor-facts already records
  that ambiguity and the undelivered-result risk. This is documentation verification, not a
  live acceptance test of the provider or the account.
- **Mutation check**: Not applicable. The Risk Map and Risk Response Guidance in
  `context/foundation/test-plan.md` cover production Replicate stalls, authorization, global
  daily cap, IDOR, retention and Realtime/watchdog behavior. This phase changes none of those
  behaviors; its offline experimental bound is distinct from the production cap. Configured
  Stryker targets TypeScript, not this checker. No full mutation run was attempted.
- **Lifecycle stamp**: `change.md.updated` is already `2026-11-17`; the phase review leaves
  `status: implementing` unchanged. The report and unchanged lifecycle file are recorded in
  the workflow carry record. No commit, push, issue mutation, paid request or production action
  was performed. The temporary checkout is removed after verification.

## Verification Evidence

All three planned checks ran at the recorded head in a detached checkout. Existing installed
dependencies were reused through a temporary `node_modules` symlink; no package was downloaded.
Each command's stdout/stderr was redirected to a log and its actual exit captured separately.

| Progress row | Command                                                                                                                                                                                                                                         | Exit | Observed output                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------- |
| 1.1          | `python3 -c "import json;a=json.load(open('scripts/gpt26/configs/gpt26-low.json'));b=json.load(open('scripts/s19/configs/phase5-gpt.json'));assert a['prompt']==b['prompt'] and a['request_fields']=={'complexity':'low','moderation':'auto'}"` | 0    | No output; both assertions passed.                                          |
| 1.2          | `python3 scripts/gpt26/check_series.py`                                                                                                                                                                                                         | 0    | `check_series: OK` — all six named slots; first-attempt bounds total $1.20. |
| 1.3          | `npx --no-install prettier --check context/changes/gpt-image-26-screen scripts/gpt26`                                                                                                                                                           | 0    | `All matched files use Prettier code style!`                                |

The `--no-install` option uses the installed Prettier for the plan's exact paths. Prettier
checks the supported Markdown/JSON files, not Python correctness.

Adversarial CLI probes used disposable copies of only the checker and its four repository JSON
inputs; no tracked file or private corpus was changed. Each subprocess exit was captured directly.

| Probe                                                  | Exit | Actual output or exception                                                 |
| ------------------------------------------------------ | ---- | -------------------------------------------------------------------------- |
| Original registration                                  | 0    | `first-attempt bounds total $1.20`                                         |
| Integer source dimensions, first slot bound `0.01`     | 1    | `cost_bound_usd is 0.01, the config gives 0.2`                             |
| F1: float source dimensions, first slot bound `0.01`   | 0    | `check_series: OK` and `first-attempt bounds total $1.01`                  |
| F2: remove config `cost_bound.rounding_usd`            | 1    | Uncaught `KeyError: 'rounding_usd'`, no collected discrepancy report       |
| F2: change first slot request width to string `"2336"` | 1    | Uncaught `TypeError: unsupported operand type(s) for /: 'str' and 'float'` |

For the missing-config-field probe, the disposable series' config hash references were updated
to match the modified config, isolating the missing calculation field. F1 needs no config or
hash change. No later-phase or paid criteria were executed.

## Triage verification (2026-11-17)

- The owner selected Fix now for F1. The fix and new
  `scripts/gpt26/tests/test_check_series.py` remain uncommitted on session HEAD `26b2a68`.
- Before the fix, `python3 -B -m unittest discover -s scripts/gpt26/tests` exited 1
  (4 tests, 15 failing assertions/subtests), reproducing the float-dimension bypass and
  missing dimension diagnostics. After the fix the same command exited 0: `Ran 4 tests`, `OK`.
- Coverage exercises the original registration, understated cost with integer dimensions,
  float source dimensions plus understated cost, and both dimension fields with float,
  string, boolean, zero, negative, wrong-length and null values. Invalid dimensions must
  produce an exit-1 slot-specific diagnostic without a traceback.
- The Phase 1 config/prompt assertion and `python3 scripts/gpt26/check_series.py` both
  exited 0; the registered total remains `$1.20` and the config hash is unchanged.
- `acceptance-state.sh` exited 0 after the fix. Manual rows 1.4 and 1.5 remain pending;
  no checked Manual row was invalidated and no Progress row was edited.
- F2 is still PENDING: dimension validation fixes its string-width example, while validation
  of missing calculation-config keys remains to be decided. No paid or later-phase check ran.
- Scoped Prettier check exited 0 (`All matched files use Prettier code style!`);
  `git diff --check` also exited 0. These checks ran on the uncommitted fix at session HEAD,
  without changing the original review boundary or verdict.

## Triage complete (2026-11-17)

- **Fixed**: F1, F2. The owner approved Fix now for each and then instructed applying all
  recommended fixes. No findings remain pending triage.
- F2 adds explicit validation of calculation blocks, required positive-integer size-rule
  fields, finite positive aspect, and finite nonnegative cost fields. Invalid configuration
  prints collected discrepancies and explicitly states that dependent series checks did not
  run; it cannot print a successful registration or proceed into unsafe arithmetic.
- New CLI regressions rebind the disposable series to each modified config hash. They cover
  every required cost field missing, invalid cost shapes/values, missing or malformed size
  fields (including equal-valued floats), and invalid calculation blocks. No private corpus,
  repository config/series edit, network access or paid call is involved.
- Before F2, the expanded suite exited 1 (`Ran 8 tests`, 56 failing subtests); after the fix,
  `python3 -B -m unittest discover -s scripts/gpt26/tests` exited 0 (`Ran 8 tests`, `OK`).
  Both the Phase 1 config assertion and checker exited 0; the registered total is still
  `$1.20`, with the original config hash unchanged.
- The post-fix acceptance script exited 0. All Manual rows remain pending, including 1.4/1.5;
  no acceptance was reopened or recorded. The report's original boundary and verdict remain
  historical; fixes are uncommitted on session HEAD `26b2a68`, not a newly reviewed commit.
- Report, follow-ups, checker and tests are carried for the next authorized commit. No commit
  or push was performed or authorized.
- The final scoped Prettier check and `git diff --check` both exited 0.
