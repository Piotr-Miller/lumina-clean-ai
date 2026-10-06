<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: finder-sonnet — Phase 3 measurement

- **Plan**: context/changes/finder-sonnet/plan.md
- **Scope**: Phase 3 of 5 only
- **Base**: e01f62227614d3f66ffbad0c1a45b521b6b106ef (explicit)
- **Head**: 375dc1313f201b47567010b3d7539411b1a8673b
- **Commits**: 05b5068, 67cbe37, 375dc13
- **Worktree**: excluded — finder-sonnet/plan.md SHA write-back, finder-sonnet/change.md updated stamp, and unrelated context/changes/cloud-exif-orientation/change.md
- **Checks ran at**: 375dc1313f201b47567010b3d7539411b1a8673b; committed documents read from Git, unchanged package code checked locally
- **Manual acceptance**: 1 of 1 recorded — 3.4 is checked at the reviewed head; gate.md records the owner's stop decision. No subsequent run appears in the series.
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

The measurement arithmetic and sealed stop behavior pass. The two warnings concern evidence retained for claims in Results, not a defective runner or an obligation to complete the two cancelled runs. The experiment's reliability failure is its result, not an implementation-review failure. Resolve the evidence gaps before treating every Results claim as independently verified.

## Findings

### F1 — The claimed October 6 final counter read has no retained supporting record

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/finder-sonnet/gate.md:409
- **Detail**: Results asserts a final counter read of $53.374463 at 2026-10-06T18:31:21Z and uses it to claim no other key spend since T0. The nine-line JSONL ends at 2026-10-05T21:46:02.467Z. Its last reading is indeed 53.374462781, but no October 6 observation is recorded. The available cache logs also do not substantiate that later read. All observed counters are below the budget ceiling; that does not independently prove the additional later observation. This is missing evidence, not evidence that the asserted read was false.
- **Fix**: Retain and reference the original dated counter response if available; otherwise limit the statement to the last recorded October 5 settlement and explicitly mark the October 6 read as an uncorroborated manual observation. Do not manufacture a historical observation or make a new paid call.
- **Decision**: FIXED — owner selected Fix now on 2026-10-06. Results now grounds verified spend and the counter ceiling in recorded October 5 observations, labels the October 6 read as manually recorded without a retained response, and limits the no-further-spend statement to no further paid run recorded. This fix is uncommitted and outside the original reviewed head; the original verdict is preserved.

### F2 — Required endpoint pre-flight and account figures are only asserted in prose

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: context/changes/finder-sonnet/gate.md:350
- **Detail**: Phase 3 requires proving the endpoint's price, supported parameters and reasoning policy still match the seal before spending. Results gives an exact read time (21:26:38Z), endpoint status/model ID, capabilities, prices and reasoning defaults, plus $60 total credits and $0.059070 daily usage at lines 357–358. None appears in the JSONL or the available cached run/check logs. T0 and its timestamp are supported, and the failed run's token arithmetic independently agrees with $2/$10 pricing, but neither proves the dated capability/account reads. A recorded assertion is weaker than retained response evidence; these figures cannot be traced as requested.
- **Fix**: Reference original, sanitized pre-flight responses if retained elsewhere; otherwise explicitly distinguish these manually recorded observations from independently verifiable measurements and acknowledge the evidence limitation. Keep the sealed section untouched.
  - Strength: Makes the evidence boundary explicit without changing the experiment after seeing its outcome.
  - Tradeoff: If historical responses were not retained, the pre-flight cannot now be independently reconstructed.
  - Confidence: HIGH — these fields are absent from the series and inspected cache artifacts.
  - Blind spot: The owner may hold the original response outside the supplied artifact locations.
- **Decision**: FIXED — owner selected Fix now on 2026-10-06. Results now explicitly labels the endpoint values/read time and account-credit/daily-usage figures as manually recorded without retained responses, states the historical pre-flight cannot be independently verified, and distinguishes the JSONL-supported T0. This wording fix acknowledges the evidence limitation; it does not reconstruct missing responses. The fix is uncommitted and outside the original reviewed head; the original verdict is preserved.

## Triage outcome

- **Completed**: 2026-10-06; F1 and F2 fixed via the owner's explicit Fix now choices.
- **Changes**: gate.md Results now states the evidence limits for both findings. The historical responses remain unavailable; the figures are preserved as qualified manual observations.
- **Verification**: sealed Pre-registration remains byte-identical with sha256 `434ffe5f5f70959b6331b22e53042e7276abf118396885420a8b0ac8ad403b76`; formatting passes on the edited files.
- **Commit state**: fixes, review decisions and follow-up record are uncommitted and carried for the next workflow commit. The verdict above continues to describe 375dc13.

## Verification evidence

### Seal and scope

An offline Python assertion check used `git show` to extract the inclusive `## Pre-registration` through `_End of Pre-registration._` section, preserving its terminating newline, at both the head and `finder-sonnet/seal`. Both 218-line byte sequences are identical and hash to:

`434ffe5f5f70959b6331b22e53042e7276abf118396885420a8b0ac8ad403b76`

`git diff e01f622 375dc13 -- packages/code-reviewer` is empty. The manifest reproduces `274984fa942fcd66515a7eee950b781817aa5c4f1a0b764913b906d053893512`; all five code hashes match it, as does source tree `a6dd42ab3885ed6ce0208b9ddc486e949036a0b1`. Frozen diff/rules/metadata files reproduce all six hashes and byte counts; both cached source worktrees are clean at their pinned heads.

### Phase 3 automated criteria and settlements

The offline assertion check exited **0**. It parsed the committed JSONL using decimal arithmetic and a 1e-11 tolerance for serialized JavaScript floating-point subtraction artifacts. Output included:

```text
PASS budget 247-r1 T=0 T+P+reserve=0.830000000
PASS budget 269-r1 T=0.16287400000000218 T+P+reserve=1.39287400000000218
PASS settlement 247-r1 0.16287400000000218
PASS settlement 269-r1 0.3344099999999983
PASS token cost 0.33441
PASS observed counter max 53.374462781 ceiling 55.877178781
```

| Check                 | Result and evidence                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Run identity      | PASS: one t0, two unique started IDs, exactly one matching record each; IDs are 247-r1 then 269-r1. Reconcile references intentionally repeat IDs and are not duplicate executions. |
| 3.2 Budget            | PASS: $0.830000 and $1.392874 are each ≤ $3.00. P is respectively $0.33/$0.73, with $0.50 reserved.                                                                                 |
| T carried             | PASS: each start equals max(counter − T0, prior settled sum); no next start precedes settlement. Final recorded T is $0.497284.                                                     |
| 3.3 Counter ceiling   | PASS for recorded observations: maximum 53.374462781 < T0 + 3 = 55.877178781. F1 limits the later-read claim.                                                                       |
| 247-r1 settlement     | PASS: exactly two reconcile lines, unsettled then settled. Stable reads at 21:32:49.840Z and 21:35:50.087Z; delta $0.162874 equals finder $0.127380 + judge $0.035494.              |
| 269-r1 settlement     | PASS: exactly two reconcile lines, unsettled then settled. Stable reads at 21:43:02.267Z and 21:46:02.467Z; delta $0.334410. Missing telemetry remains null, never zero.            |
| Failed-run token cost | PASS: (32,371 + 36,404) × $2/M + (3,302 + 16,384) × $10/M = $0.334410.                                                                                                              |

### Invalid classification and stop

Cached `runs/269-r1/stderr.log` matches the quoted three-line block after removing npm notices: step 1 finishes `tool-calls`; step 2 emits 16,384 output tokens and finishes `length`; the final message is `No output generated.`. `stdout.log` is empty and no `review.json` exists. The record has exit 1, no signal, outcome `invalid`, errorClass `model-attributable`, and no retries.

The class name is not serialized in the log: it is supported by the message and the installed SDK's `NoOutputGeneratedError` default message/source. `retry.ts:23–31` recognizes timeout, NoObjectGeneratedError and HTTP 429/5xx, but not this distinct class. An offline `node --import tsx --input-type=module` probe instantiated the SDK error and exercised `withOneRetry`: **exit 0**, `retryable=false, calls=1`. The same probe tested both branches of `seriesSpend` with synthetic counters: **PASS**, max(counter delta, settled sum). An initial `tsx -e` attempt exited 1 because its CJS transform rejected the imported runner's top-level await; the corrected ESM invocation passed. Neither invocation ran the CLI or made a network call.

The pipeline awaits the finder before invoking the judge (`pipeline.ts:599–607`). The error therefore prevents the judge from running. Sealed §4 explicitly names NoOutputGeneratedError as invalid, and §9 requires stopping after it. No retry is the sealed production behavior, not a measurement defect.

The owner's stop choice is recorded in Results § Series stop. The JSONL contains no started/record event after 269-r1, only its two reconciliation events. The two r2 runs were not executed; requiring them would contradict the sealed stop rule. Phase 4 hand-reading, projection and final admission are outside this review.

### Results traceability

- Both ledger rows' start times, counters, costs, T/P sums, durations (140.412/201.050 seconds, displayed as 140/201), finder-step providers/finish reasons, retry counts, outcomes, five findings and `failed` verdict trace to JSONL. Displayed timestamps truncate fractional seconds and monetary values round to six decimals.
- All four reconciliation intervals and their endpoint counter values match JSONL lines 4–5 and 8–9. The immediate post-run counter lag is also recorded.
- Step-token totals and tool-call names are **not in JSONL**. They are independently supported by the explicitly permitted cached stderr artifact. The report does not upgrade them to JSONL-backed fields. The 247 findings also exactly match its cached review.json.
- The 16,384 cap traces to config.ts; the 18,408 historical fixture statement traces to the plan, not this series. The record contains no reasoning-token breakdown: endpoint-default thinking is contextual explanation, not a measured decomposition of these output totals.
- T0, total executed runs, total settled spend and the budget ceiling trace to JSONL. The October 6 final read and pre-flight endpoint/account figures have the limitations in F1/F2.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-sonnet/plan.md and reviews/impl-review-phase-2-e01f622.md; gate.md and gate-sonnet-runs.jsonl are the planned measurement deliverables, not unplanned code.
- At the reviewed commit, automated 3.1–3.3 are checked without SHA suffixes. The explicitly excluded worktree adds 375dc13; verification above establishes their evidence independently. Manual 3.4 is checked with the recorded stop decision.
- Lessons selection: 34 of 37 entries name impl-review/all or omit an applicability restriction. Particularly relevant: count failed attempts, verify cited evidence, preserve raw errors, and do not turn missing evidence into verified absence.
- Independent read-only evidence audit agreed on both gaps and on the ledger/token arithmetic. The blank line splitting the second ledger row from its Markdown table is a presentation issue, not an additional substantive finding.
- No application behavior or mapped risk module changed in Phase 3. Mutation testing and unrelated package/application suites were therefore not run. This review used offline record assertions and focused probes only.
- No OpenRouter calls, commits, paid reruns, admission decisions or changes to sealed text were made. The existing change.md stamp already reads 2026-10-06; status remains implementing for this phase-only review. Report and stamp are carried for the next workflow commit.
