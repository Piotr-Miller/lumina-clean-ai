<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: GPT-Image-2.6 Sunburst screening test

- **Plan**: context/changes/gpt-image-26-screen/plan.md
- **Scope**: Phase 2 (phases 1–5)
- **Session**: fresh
- **Base**: 1a8ae5698d3156a195be022f7f1b2d17f6bd30e0 (explicit)
- **Head**: d69ec557e0b93576b8337220f15adc53013f07ef
- **Worktree**: excluded
- **Checks ran at**: d69ec557e0b93576b8337220f15adc53013f07ef (temporary detached checkout)
- **Manual acceptance**: 0 of 1 confirmed — pending: 2.4
- **Date**: 2026-11-20
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Non-finite monetary values bypass the approved cap

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/gpt26/run.py:174; scripts/gpt26/run.py:346; scripts/gpt26/state.py:247; scripts/s19/run-candidate.py:286
- **Detail**: `argparse` accepts `--cap nan`. Both `abs(approved_cap - cap) > tolerance` and the admission comparison `committed + bound > cap` are false for NaN. An independent synthetic reproduction with the existing fake provider, a committed $1.50 approval and moderation errors made 12 fake calls, committed $2.40, exited 0 and printed `protocol ok`. The cost boundary has the same defect: a first successful response whose usage contains a NaN image-token count, followed by moderation errors, made 11 fake calls under ordinary `--cap 1.50`, accumulated $2.00 in subsequent unknown-cost reservations and exited 0 with `$nan committed ... protocol ok`. `state.reconcile` treats any non-Boolean int/float as a known cost, including NaN or a negative number; generic S-19 admission uses its own weaker total. The plan requires agreement with the owner's cap and conservative accounting before every reservation. The two-attempt/six-slot limit remains, but the monetary authorization does not hold.
- **Fix**: Validate finite, positive caps before any persistent write and at admission; make approval comparison fail closed. Accept only finite, nonnegative costs and valid usage components, retain the reservation for unreadable provider usage, BLOCK malformed persisted money fields, and use consistent validated accounting for admission. Add no-reservation/no-provider-call cases for invalid caps and adversarial usage/ledger-cost cases.
  - Strength: Closes both demonstrated routes through the same monetary invariant and prevents accounting disagreement between the validator and admission.
  - Tradeoff: Touches the generic S-19 helper as well as GPT26; preserve unknown-cost behavior and rerun its regression suite.
  - Confidence: HIGH — both bypasses were reproduced independently with synthetic inputs and no network.
  - Blind spot: No claim that the real provider emits NaN; the malformed-response case verifies the promised fail-closed boundary.
- **Decision**: FIXED — proposed fix, owner selected Fix now on 2026-11-20; siblings: scripts/s19/protocol.py fixed (S-19 approval, including open-validation), scripts/s19/run-candidate.py fixed (both admission contexts, usage conversion and ledger totals), scripts/gpt26/state.py fixed (costs, bounds and refusal amounts), scripts/s19/feasibility.py n/a (spike record, no cap/admission), scripts/s19/historical.py n/a (historical metadata conversion, no budget admission); reopened: none (acceptance script exit 0; all Manual rows already pending). Applied and verified in the worktree over 83851c7; uncommitted.

### F2 — Shared reconciliation accepts missing or false run bindings

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: scripts/gpt26/state.py:217; scripts/gpt26/run.py:375
- **Detail**: Phase 2 item 3 requires the shared offline reconciler to match registration and executable-rule identities and classify incomplete evidence as BLOCKED. `reconcile` checks sidecar version, series, config and terminal entries, but never reads `bindings` and permits no sidecar even when attempts exist. After a valid six-output synthetic run, direct calls with (a) no sidecar, (b) empty bindings and (c) false registration-commit/file-blob identities each returned `complete`, `errors=[]`. The paid CLI separately calls `check_bindings`, which protects its resume path; that protection is absent from the shared validator intended for the builder and gate. This is a missing phase-2 contract, not a claim about unimplemented phase-3 callers.
- **Fix**: Make reconciliation require a complete run binding once attempts or terminal records exist, and verify it against explicitly supplied expected registration/rule identities. Retain the legal pristine pre-run state. Add direct reconciler tests for missing, incomplete and mismatched bindings, independent of CLI preflight.
  - Strength: Gives runner, builder and gate one authoritative integrity result rather than relying on every caller to recreate preflight.
  - Tradeoff: Requires passing expected identities into the offline core; avoid importing the runner back into `state.py` or introducing a dependency cycle.
  - Confidence: HIGH — all three incomplete/false binding cases returned a complete state in independent probes.
  - Blind spot: The phase-3 builder/gate are not implemented at this revision; their eventual wiring must also be reviewed.
- **Decision**: FIXED — proposed fix, owner selected Fix now on 2026-11-20; siblings: scripts/gpt26/run.py fixed (initial reconciliation and locked admission supply independent checkout identities; paid preflight retains approval checks), scripts/gpt26/state.py fixed (shared comparison validates both binding schemas and the complete runtime inventory), scripts/gpt26/tests/test_run.py fixed (direct callers supply real sidecars and expected identities so other guards are still exercised), phase-3 builder/gate n/a (not implemented; their required caller contract is recorded in follow-ups/review-fixes.md), S-19 approval/ledger paths n/a (do not use GPT26 run-state bindings); reopened: none (acceptance script exit 0; all Manual rows already pending). Applied and verified in the worktree over 83851c7; uncommitted.

### F3 — Terminal reason labels are accepted without supporting evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/gpt26/state.py:222; scripts/gpt26/state.py:271
- **Detail**: The validator accepts recognized terminal reason strings without checking that the ledger establishes those reasons. With valid current bindings and no ledger rows, six sidecar entries labelled `stopped_after_bound_breach` produce a complete state, no errors, no breaches and zero spend. `main --resume --cap 1.50` then exits 0 with no fake calls and prints `protocol ok`, even though its own reason says a breach occurred. Six `not_attempted_budget` entries have the same result despite no refusal and $1.20 of first attempts fitting the $1.50 cap. S-19 technical-terminal rows likewise lack a check that attempt history justifies termination. The plan distinguishes consistent terminal FAIL evidence from incomplete/corrupt evidence that must remain BLOCKED; accepting a label alone defeats that distinction and loses the persistent-breach signal.
- **Fix**: Validate each terminal transition against its supporting history: retain a real persistent breach for a breach stop, require matching budget-refusal evidence for a budget stop, and require exhausted attempts or a non-retryable result for a technical terminal. Preserve legitimate reserve-only crashes and interruption recovery; add direct reconciler and CLI rejection cases for unsupported terminals.
  - Strength: Prevents an incomplete or contradictory record from being certified as a resolved compliant run.
  - Tradeoff: Budget-refusal evidence must capture enough state to validate the historical decision; do not infer it only from a later final total, which may release headroom.
  - Confidence: HIGH — both sidecar reason variants reproduced completion and exit 0 independently.
  - Blind spot: No real private run-state was modified; probes cover synthetic corruption, not an observed production incident.
- **Decision**: FIXED — proposed fix, owner selected Fix now on 2026-11-20; siblings: scripts/s19/run-candidate.py fixed (both admission contexts durably log refusals under the decision lock; removed the later duplicate write), scripts/gpt26/run.py fixed (resume finalizes an interrupted budget terminal without another send), scripts/gpt26/state.py fixed (budget, breach-stop and technical terminal evidence checks; later reservations cannot follow a terminal/refusal decision), scripts/s19/run-candidate.py technical-terminal writer n/a (already writes only after exhaustion/non-retryable failure), scripts/s19/tally.py n/a (legacy visual gate forces STOP for non-ok slots at lines 301–305 and 348–368; it is not the GPT26 protocol/cost reconciler), phase-3 builder/gate n/a (not implemented; inherit shared validation); reopened: none (acceptance script exit 0; all Manual rows already pending). Applied and verified in the worktree over 83851c7; uncommitted.

## Review Notes

- **Bookkeeping in diff**: context/changes/gpt-image-26-screen/change.md, context/changes/gpt-image-26-screen/evaluations/regression-baseline.md, context/changes/gpt-image-26-screen/plan.md.
- **Boundary**: Phase 2's implementation commit is d69ec55. Current branch HEAD at review start was 83851c7; subsequent commits f6cef55, 6fba5d9 and 83851c7 add regression evidence and handoff notes. They contain no further scripts/gpt26 or scripts/s19 code changes. They are outside this phase boundary. The existing uncommitted change.md note records the owner's 2.4 confirmation at 83851c7 and is excluded from the reviewed surface, preserved verbatim when stamping updated. This review creates no acceptance mark.
- **Progress**: The current canonical plan records Automated 2.1–2.3 at ancestor d69ec55. No malformed n/a rows or unresolved Automated rows occur in this phase. Manual acceptance script exited 0 in the reviewed checkout and reports 2.4 pending; later owner-confirmation prose does not change the canonical row. No phase-2 manual n/a rows.
- **Lessons**: Read 35 of 39 ledger entries selected by impl-review/all or omitted applicability. Particularly relevant priors were conservative failure accounting, atomic admission, useful refusal diagnostics, and checking cited evidence rather than trusting claims.
- **Review passes**: Separate read-only plan-drift and safety/pattern reviewers inspected the exact phase revision. The lead checked source and independently reproduced the retained findings. No substantive architecture or sibling-pattern mismatch was found.
- **Plan mapping**: Generic S-19 context hooks, separate roots, request-field protection, guarded fcntl, retry limits, PNG validation, crash accounting, dry-run output and regression harness match their phase intents. protocol.py needed no edit: explicit caller context implements the extension while keeping its parser unchanged. Shared reconciliation drifts as F2/F3 describe; tests miss F1–F3.
- **Historical compatibility**: `git diff --quiet 1a8ae56 d69ec55 -- scripts/s19/protocol.py scripts/s19/inputs.py scripts/s19/configs scripts/s19/series` exited 0. Historical pins and archived artifacts were unchanged. The regression harness only materializes its documented fixture overlay in disposable checkouts.
- **Mutation check**: Skipped — no mapped risk behavior in test-plan.md §2/Risk Response Guidance is touched. Risk #3 concerns the production Replicate global daily-cap SQL/API behavior, which these offline experiment scripts do not change. The configured Stryker/Vitest tool is not a Python runner.
- **Paid work**: None performed. The real dry-run verified pinned private inputs read-only. All defect probes used generated synthetic images and the existing fake provider with its socket guard; no real approval, key or private run-state was changed. Phase 4 is outside scope.
- **S-20 baseline**: Its documented red baseline and four-file overlay insufficiency are deferred to Phase 3 by the dated owner decision in the plan; 3.2 was not run or represented as green here.

### Verification evidence

All phase criteria were executed from the detached d69ec55 checkout. The live Node dependencies were linked only after byte-identical package-lock.json verification; the lockfile SHA-256 was `120849f1603f584d1275797b809201f09960ac95fdc4adf97c913b57ef1896a6`. Private S-19 prepared inputs were linked read-only for the dry-run. Commands were captured to log files before excerpts were read; exit status was not taken from a pipeline.

| Progress      | Command                                                                                               | Exit | Actual result                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1           | `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests`                                  | 0    | `Ran 61 tests in 23.550s`; `OK`                                                                                                                |
| 2.2 candidate | `python3 scripts/gpt26/regression.py --suite s19 --revision HEAD`                                     | 0    | resolved d69ec557e0b93576b8337220f15adc53013f07ef; `Ran 85 tests in 52.604s`; `OK`; `exit 0`                                                   |
| 2.2 pre-hook  | `python3 scripts/gpt26/regression.py --suite s19 --revision 1a8ae5698d3156a195be022f7f1b2d17f6bd30e0` | 0    | `Ran 85 tests in 52.232s`; `OK`; `exit 0`                                                                                                      |
| 2.3           | `python3 -B scripts/gpt26/run.py --dry-run --cap 1.50`                                                | 0    | Six pending slots, $0.20 each, $1.20 total; all six input hashes verified; registration clean; paid operation would refuse absent approval/key |

Environment: Python 3.15.2, Pillow 12.3.0, NumPy 2.5.4, distro cv2 4.13.0, scikit-image 0.26.0, PyWavelets 1.8.0. Both regression revisions ran in the same Linux environment. Baseline and candidate were launched independently after implementation; these review reruns do not claim to recreate the original pre-edit chronology.

Dry-run sizes were S17-03 2336×1552, S17-04 2192×1648 and S17-07 2320×1552, two slots each. Its output ended:

```text
dry run: 6 pending slot(s) bounded at $1.20 on $0.00 committed → fits the $1.50 cap. No network access, nothing reserved, no file changed, no consent implied
```

The independent synthetic probe at this exact revision exited 0 and printed:

```text
NaN cap: 0 calls 12 committed 2.4
  spend $2.40 committed of the $nan cap; protocol ok
NaN usage: 0 calls 11 committed nan
  spend $nan committed of the $1.50 cap; protocol ok
Bindings missing : complete errors []
Bindings empty : complete errors []
Bindings wrong : complete errors []
Unsupported terminal stopped_after_bound_breach : exit 0 calls 0 status complete errors [] breaches []
  spend $0.00 committed of the $1.50 cap; protocol ok
Unsupported terminal not_attempted_budget : exit 0 calls 0 status complete errors [] breaches []
  spend $0.00 committed of the $1.50 cap; protocol ok
```

Host-local reproduction script and logs: `/tmp/gpt26-p2-probes.py`, `/tmp/gpt26-p2-probes.log`, `/tmp/gpt26-p2-unit.log`, `/tmp/gpt26-p2-s19baseline.log`, `/tmp/gpt26-p2-s19candidate.log`, `/tmp/gpt26-p2-dry.log`, `/tmp/gpt26-p2-acceptance.log`. Temporary checkout cleanup occurs after review; these log paths are diagnostic conveniences, not durable publication artifacts.

### Triage verification — F1 (2026-11-20)

The owner selected Fix now for F1. Fixes are in the uncommitted worktree over 83851c7, not the original reviewed d69ec55. The original verdict and revision above are unchanged; F2 and F3 remain pending.

- Both CLI entry points reject non-finite, non-positive and Boolean caps before writes; both approval parsers compare amounts fail-closed. Generic admission also validates cap/bound before acquiring a lock.
- Provider usage components and the resulting cost must be finite, nonnegative numbers, excluding Booleans. Unreadable usage keeps a null cost and the full reserved amount while preserving the paid output.
- The GPT26 reconciler blocks invalid persisted costs, reservation bounds, series bounds and budget-refusal amounts. S-19 accounting rejects malformed persisted amounts rather than using a weaker total. Valid known/unknown accounting agrees between the two paths.
- The first six regression tests ran against the broken code: `Ran 6 tests in 2.415s`, `FAILED (failures=48, errors=15)`, exit 1. In particular the malformed-usage case observed 11 calls instead of the affordable seven. After the fix, all eight numeric regression tests passed (`Ran 8 tests in 3.742s`, `OK`, exit 0).
- Final GPT26 check: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests` → `Ran 69 tests in 23.145s`, `OK`, exit 0.
- S-19 regression check: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s19/tests` → `Ran 85 tests in 41.647s`, `OK`, exit 0. This executes the uncommitted fixed code; the revision-only regression harness would test the old HEAD and is not substituted for it.
- `bash .agents/skills/rune-impl-review/scripts/acceptance-state.sh context/changes/gpt-image-26-screen/plan.md` exited 0 after all source edits. Every Manual row remains pending, including 2.4; none needed reopening and no confirmation was written.
- Sibling search covered monetary admission/approval/accounting paths under scripts/s19 and scripts/gpt26. S-19 open-validation inherits the fixed shared approval check; historical conversion and the feasibility spike have no matching spend-admission behavior. Historical configs/series, inputs.py and archived files were not changed.
- No paid calls, commits or pushes. All added tests use synthetic inputs and the fake provider/socket guard. Host-local logs: `/tmp/gpt26-f1-red.log`, `/tmp/gpt26-f1-green.log`, `/tmp/gpt26-f1-suite.log`, `/tmp/gpt26-f1-s19.log`, `/tmp/gpt26-f1-acceptance.log`.

### Triage verification — F2 (2026-11-20)

The owner selected Fix now for F2. F1 and F2 are now fixed in the uncommitted worktree over 83851c7; F3 remains pending. The original verdict still speaks for d69ec55.

- The offline `state.reconcile` accepts explicit `expected_bindings`. Once any ledger evidence exists, a missing sidecar is BLOCKED. Every present sidecar must have complete recorded bindings and independent expected bindings: full HEAD/registration commit hashes and exactly the registration plus `RULE_FILES` inventory, with valid blob hashes. The registration commit and every file identity must match. Two empty inventories cannot validate each other.
- `Screen.reconcile` obtains expected identities from the executing checkout and supplies them both at initial reconciliation and inside locked admission. The shared core imports neither the runner nor Git helpers and introduces no dependency cycle. Paid preflight still requires a clean committed approval file; identity-only reconciliation excludes mutable `change.md` bookkeeping. A later unrelated HEAD is permitted when registration/rule identities are unchanged.
- Existing direct reconciler tests now pass real sidecars and expected identities. Their positive complete-record case still passes; malformed-ledger, PNG and terminal-shape assertions are not hidden behind an unrelated missing-binding failure.
- Seven binding regression tests first ran against the old behavior: `Ran 7 tests in 5.411s`, `FAILED (failures=38)`, exit 1. After the fix: `Ran 7 tests in 8.681s`, `OK`, exit 0. Cases include missing sidecar, absent/false/malformed bindings, each required field and inventory path, missing expected identities, two empty inventories, resume rejection before sending, and unrelated commits/mutable notes remaining valid.
- Final combined check: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests` → `Ran 76 tests in 48.704s`, `OK`, exit 0. No S-19 source changed during F2; its 85-test passing F1 result remains the applicable regression evidence.
- Acceptance script exited 0 after all F2 source edits, with every Manual row pending. No Progress row or human confirmation was changed. Future phase-3 builder/gate callers must provide independent expected identities; their implementation and terminal-evidence validation remain outside this fix.
- No paid calls, commits or pushes. Host-local logs: `/tmp/gpt26-f2-red.log`, `/tmp/gpt26-f2-green.log`, `/tmp/gpt26-f2-suite.log`, `/tmp/gpt26-f2-acceptance.log`.

### Triage verification — F3 (2026-11-20)

The owner selected Fix now for F3. All three findings are now FIXED in the uncommitted worktree over 83851c7. The original review verdict and revision remain unchanged; this triage record is not a fresh implementation review.

- Budget refusals are now appended inside the same admission lock as their count/check in both S-19 context variants. The event schema is unchanged; the old later write in the slot driver was removed. Its stored committed amount therefore corresponds to its exact ledger prefix.
- The GPT26 reconciler replays the conservative amount at each refusal, verifies the registered bound, and requires that the next attempt would exceed that row's cap. A sidecar budget terminal needs a justified matching refusal. Later known costs may release headroom without invalidating the earlier decision.
- Breach-stop sidecar terminals require an actual persistent ledger breach. Technical terminal rows require existing failed/exhausted attempt history, with no delivered result. Reserve-only crashes that used both attempts remain valid exhaustion evidence. New reservations after a terminal/refusal decision are blocked.
- A justified refusal remains visible in normalized slot state before its sidecar terminal is written. Admission will not buy another attempt, and resume finishes that interrupted terminal write directly.
- Six new terminal regression tests first ran against the old behavior: `Ran 6 tests in 3.987s`, `FAILED (failures=9)`, exit 1. After the fix: `Ran 6 tests in 3.598s`, `OK`, exit 0. They cover unsupported sidecar/technical claims, false historical budget amounts, later cost release, interrupted terminal recovery without a send, and refusal logging under the decision lock.
- Final combined check: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests` → `Ran 82 tests in 53.465s`, `OK`, exit 0. This includes the existing moderation, invalid PNG, reserve-only crash and first/last bound-breach cases.
- Shared-runner regression: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s19/tests` → `Ran 85 tests in 44.190s`, `OK`, exit 0. Both suites ran against the fixed uncommitted worktree, with no paid provider calls.
- Acceptance script exited 0 after all source edits; all Manual rows remain pending and none were reopened. No Progress confirmation, archive, commit or push was made. Host-local logs: `/tmp/gpt26-f3-red.log`, `/tmp/gpt26-f3-green.log`, `/tmp/gpt26-f3-suite.log`, `/tmp/gpt26-f3-s19.log`, `/tmp/gpt26-f3-acceptance.log`.

## Triage summary

- **Fixed**: F1, F2, F3.
- **Pending decisions**: none.
- **Skipped / accepted / lessons**: none.
- **Commit state**: all fixes and review records remain uncommitted and carried for the next implementation commit.
