<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: finder-sonnet — full change

- **Plan**: context/changes/finder-sonnet/plan.md
- **Scope**: full — Phases 1–4 and epilogue; Phase 5 assessed as conditional and not applicable
- **Base**: 4c3fc87eb004ea79318d7a4c24d9663d8994612e (explicit)
- **Head**: de63b54f7651d4de74de49b67bef15da3cb0a0b8
- **Commits**: 33fdb79, 624a936, 3d7b9aa, e01f622, 05b5068, 67cbe37, 375dc13, 30b6ef1, de63b54
- **Worktree**: excluded — unrelated context/changes/cloud-exif-orientation/change.md; no other pre-existing local changes
- **Checks ran at**: de63b54f7651d4de74de49b67bef15da3cb0a0b8 (current HEAD; committed records read with git show)
- **Manual acceptance**: 7 of 7 applicable checks recorded complete; Phase 5's 3 manual and 4 automated checks intentionally inapplicable under NOT ADMITTED
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

APPROVED with one minor documentation warning under the skill's verdict rules. This approves execution of the plan's measurement-and-rejection path, not admission or deployment of the model. The owner's experiment verdict remains exactly `NOT ADMITTED (reliability)`.

## Findings

### F1 — Projection notes present assumptions as proven cost bounds

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/finder-sonnet/gate.md:438
- **Detail**: The projection correctly uses the settled invalid finder-only m269, but lines 438–439 claim a complete #269 run would necessarily cost more and could only raise the projection. The invalid finder emitted 19,686 output tokens across two steps, including a generation exhausted at 16,384; another, successful run could use fewer finder tokens. Missing judge cost proves incomplete pass coverage, not a lower bound on a different successful run. Lines 444–445 similarly call the size assignment conservative on the strength of byte counts alone. The TSV's #247 bucket contains 39 diffs smaller than its representative, 1 equal and 13 larger; byte size alone does not establish a cost bound. These directional claims are unsupported by the measurements, although all recorded costs and the sealed calculation are correct. Neither qualification changes the verdict: at the observed m247, 53 × m247 + the impl-review term already totals $11.227382 before any #269 allowance.
- **Fix**: Replace the guaranteed-increase claim with “m269 covers an invalid finder attempt only; a successful finder-plus-judge cost was not measured,” and describe conservatism of the size assignment as an assumption. Preserve the sealed formula, measured projection, and gate outcomes.
- **Decision**: FIXED — owner selected Fix now on 2026-10-06. Results now states that a successful finder-plus-judge cost was not measured and that the missing judge cost does not establish a higher/lower total. The size-bucket note records the 39 smaller / 1 equal / 13 larger distribution and labels conservatism as an assumption. The sealed formula, measured projection and gate outcomes are preserved. This fix is uncommitted and outside the reviewed head; the original verdict remains unchanged.

## Triage outcome

- **Completed**: 2026-10-06; F1 fixed via the owner's explicit Fix now choice.
- **Verification**: the Pre-registration section remains byte-identical to the reviewed head and seal tag; its sha256 is `434ffe5f5f70959b6331b22e53042e7276abf118396885420a8b0ac8ad403b76`. The projection still recomputes to $13.902662 from settled costs, the TSV confirms the 39 / 1 / 13 distribution, and edited files pass formatting.
- **Commit state**: gate.md, this report, follow-ups/review-fixes.md and the existing change.md review stamp remain uncommitted and carried for the next workflow commit. The review verdict continues to describe de63b54; the owner's `NOT ADMITTED (reliability)` decision is unchanged.

## Verification

### Commands and results

All final checks below exited 0. Package checks ran in `packages/code-reviewer`; formatting ran at repository root. Each check's stdout/stderr was captured before inspecting its output, and the command's own exit status was preserved.

| Command                                                  | Result                                                                                                                    | Evidence log                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| npm test                                                 | 22 files, 667 tests passed, including hermetic runner tests                                                               | /tmp/finder-sonnet-full-package-tests.log |
| npm run typecheck                                        | tsc --noEmit passed                                                                                                       | /tmp/finder-sonnet-full-typecheck.log     |
| npm run lint                                             | eslint passed                                                                                                             | /tmp/finder-sonnet-full-lint.log          |
| npm run format:check                                     | All matched files use Prettier style                                                                                      | /tmp/finder-sonnet-full-format.log        |
| ./node_modules/.bin/tsx scripts/schema-dump.mjs          | Finder wire schema hash matches seal                                                                                      | /tmp/finder-sonnet-full-schema.log        |
| ./node_modules/.bin/tsx scripts/sonnet-gate.mjs describe | Effective configuration and code fingerprints equal manifest.global                                                       | /tmp/finder-sonnet-full-describe.json     |
| git ls-remote --tags origin finder-sonnet/seal           | Origin lists annotated tag object f4c774cc403cd4026836f315b9b1856caf46081e                                                | /tmp/finder-sonnet-full-remote-tag.log    |
| python3 /tmp/finder-sonnet-full-verify.py                | Seal, inputs, pre-flight, records, costs, hand-read coverage, TSV and cross-phase assertions pass                         | /tmp/finder-sonnet-full-evidence.log      |
| Offline node --import tsx --input-type=module probe      | Actual SDK NoOutputGeneratedError is not retryable; withOneRetry invokes once; both max-counter/settled-sum branches pass | /tmp/finder-sonnet-full-retry.log         |

The temporary evidence checker initially used shortened TSV class names and split the plan on a prose mention of `## Progress`; correcting those checker assumptions produced the final passing run. Neither failure required a repository edit or exposed a product failure.

### Seal and frozen configuration

The requested inclusive extraction was run at both revisions with pipeline failure detection enabled:

```sh
git show de63b54:context/changes/finder-sonnet/gate.md |
  sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' | sha256sum
git show finder-sonnet/seal:context/changes/finder-sonnet/gate.md |
  sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' | sha256sum
```

Both return `434ffe5f5f70959b6331b22e53042e7276abf118396885420a8b0ac8ad403b76`. The 218-line sections are byte-identical, not merely text-equivalent. No amendment changed the measured arm.

- Manifest sha256: `274984fa942fcd66515a7eee950b781817aa5c4f1a0b764913b906d053893512`.
- Source tree: `a6dd42ab3885ed6ce0208b9ddc486e949036a0b1`.
- Fresh finder wire schema: `a6e98d41add5055074b2a5556c512ddc9f5c6b5b1c3b0ad2eedb54cc43d095bf`.
- All five sealed code-file hashes match HEAD and both JSONL records. `git diff e01f622 de63b54 -- packages/code-reviewer` is empty.
- Both frozen diffs were independently regenerated using the exclusion recipe; diff/rules/metadata hashes and byte sizes match all six pins. Source worktrees remain clean at dec09f8d77b2f1ee45073c194d6cd8239a7d35c7 and fca2778742ec0bc02a84f42b23bf639fc32c7ad1.

### Retained pre-flight evidence and earlier fixes

The correction to Phase 3 F2 is substantiated by the supplied files, rather than repeating the earlier “not retained” conclusion:

| Cached file under ~/.cache/finder-sonnet-gate/preflight/ | Bytes   | Full sha256                                                      | File mtime in UTC           |
| -------------------------------------------------------- | ------- | ---------------------------------------------------------------- | --------------------------- |
| endpoints.json                                           | 11,516  | 690e37b183aab4e56423e03fd4cae6eda5a02ceac44c1435d6eece44cb87a6cb | 2026-10-05T21:26:38.288506Z |
| models.json                                              | 772,839 | f94862511530e3b851a73325407b06cdcd7c9c328a7f571763eb4e95d941defa | 2026-10-05T21:26:47.115944Z |
| describe.json                                            | 1,350   | 445c37e18d22ec35bd4c234863700cef91dc50807d0db1bc1c5cffe223fbbc4f | 2026-10-05T21:26:38.204939Z |

The Anthropic endpoint in endpoints.json has the cited model name/status, tools/structured_outputs/response_format/reasoning parameters, and prompt/completion prices 0.000002/0.00001. The matching models.json row has reasoning mandatory=false, default_enabled=true, default_effort=high. Historical describe.json equals the sealed global manifest. These artifacts support the values; mtimes are consistent with the recorded sequence but are not cryptographically authenticated capture timestamps.

The account-credit/daily-usage figures and October 6 counter reading remain explicitly marked as manual observations without retained responses. They are not upgraded into verified observations. This correctly resolves the earlier findings' wording concerns. The ledger's split-table formatting is also corrected. Earlier reports retain their original verdicts and decisions at their own heads; follow-ups records the endpoint correction.

### Series execution, settlement and Phase 4 arithmetic

The JSONL contains exactly nine lines: one T0; one started and one record for each of two unique executions; two reconciliation entries per execution, first unsettled and then settled. Repeated run IDs in reconciliation lines are references, not duplicated runs. No paid start follows 269-r1.

| Measurement             | Verified value and source                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0                      | 52.877178781 at 2026-10-05T21:26:54.156Z; JSONL line 1                                                                                            |
| 247-r1                  | Started 21:27:19.385Z; 140.412 seconds; valid, five findings, verdict failed; JSONL lines 2–3 and cached review.json                              |
| 247 budget              | T=0, P=0.33, reserve=0.50; sum=0.830000 ≤ 3                                                                                                       |
| 247 settlement          | Counter 52.877178781 → 53.040052781; stable second reconciliation ends 21:35:50.087Z; settled $0.162874 equals $0.127380 finder + $0.035494 judge |
| 269-r1                  | Started 21:36:24.534Z; 201.050 seconds; invalid/model-attributable, exit 1, no retry; JSONL lines 6–7                                             |
| 269 budget              | T=0.162874, P=0.73, reserve=0.50; sum=1.392874 ≤ 3; prior cost already settled                                                                    |
| 269 settlement          | Counter 53.040052781 → 53.374462781; stable second reconciliation ends 21:46:02.467Z; settled $0.334410, telemetry absent                         |
| Token price cross-check | (32,371 + 36,404) × $2/M + (3,302 + 16,384) × $10/M = $0.334410; cached 269 stderr                                                                |
| Total and ceiling       | T=max(counter − T0, settled sum)=$0.497284; observed maximum 53.374462781 < ceiling 55.877178781                                                  |

All ledger timestamps, reconciliation intervals, provider/finish fields, retry counts, durations and displayed costs agree with the JSONL and cited stderr/review artifacts. Dollar figures round to six decimals and displayed times omit fractional seconds. Decimal assertions allow 1e-11 for JavaScript floating-point subtraction artifacts; there is no unexplained money discrepancy or double-counted telemetry. Step token counts and tool-call names live in stderr, not the JSONL.

The sealed TSV reproduces sha256 `45037f72e55b0ffafa4eade71a4b023b75b160f5f825502ff1d68c4bb0946efb`: 90 unique runs over 62 PRs, 48 observed plus 13 observed-with-plan, 26 docs-only and 3 job-level skips. The 61 observed rows split 53/8 at the 38,146-byte threshold; step outcomes split 23 success/37 failure/1 cancelled. Assignments, range endpoints and counts recompute. Historical $0.615247 spend remains the separately cited §6 log-derived figure; this review did not re-download every historical GitHub log or treat it as new series spend.

| Projection term                        | Recomputed value                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| m247                                   | $0.162874, one valid finder-plus-judge run                                       |
| m269                                   | $0.334410, one invalid finder-only run; explicitly described that way in Results |
| 53 × m247                              | $8.632322                                                                        |
| 8 × m269                               | $2.675280                                                                        |
| Run term                               | $11.307602, above $7.404940 allowance                                            |
| 13 × 0.199620                          | $2.595060; no G5 cost enters the mean                                            |
| Sealed monthly projection              | $13.902662, above $10.00                                                         |
| Unweighted information mean/projection | $0.248642 / $17.762222                                                           |
| m247 thresholds                        | $0.089239 at observed m269; $0.139716 with m269 excluded                         |

Using the serialized settled costs gives 13.90266200000010194, which rounds to the recorded projection. Missing judge telemetry is not zero-cost telemetry; the series settles it through the counter. Under §6, both PRs have an executed run, so the projection is computable despite the reliability failure. F1 qualifies only the extrapolation commentary.

### Hand-read, decision and Progress

All five findings in the one valid run match cached review.json and occur exactly once as R1–R5; F3 and F5 remain separate because they concern different files. The owner's recorded reasons are preserved verbatim:

- R1 **real** — the script copies customers' production photos out of the system that enforces retention, and its safety contract never says when to delete them.
- R2 **rejected** — the URL regex at `:55` already blocks localhost, and a wrong key still ends in a clear HTTP-error exit (anon is revoked on `jobs`), so only an earlier message is missing, no wrong result.
- R3 **real** — the unpaginated query is a true latent defect: past `max_rows` (1000; 18 results today) a wanted job would be falsely reported "NOT found".
- R4 **rejected** — the code contradicts the claim: the loop guard at `:86` keeps every JPEG unpack full-length, so an SOF past the range returns `None`; only a PNG under 24 bytes can raise.
- R5 **real** — a truncated census would still print `CONFIRMED` on a subset; latent at 18 results, and the severity is minor rather than major (the line is `:102`).

These are owner classifications, not this review's replacement judgments. R1/R3/R5 real and R2/R4 rejected agree with the request, hand-read-247, Results and change.md. Two rejected findings correctly fail #247's zero-rejected hand-read rule. The 18-result figure is inherited from the dated census cited in the pre-sort; it is not a live production count re-read here.

No valid #269 output exists: stdout is empty, review.json absent, and stderr ends in `No output generated.`. hand-read-269 correctly contains no classification rows or proposed D2 match. It cannot pass the positive D2 requirement; the absence of output is not evidence that D2 is absent from the source.

Results' selected verdict section contains exactly one label, `NOT ADMITTED (reliability)`, with the owner's October 6 choice. It reports the other gate outcomes alongside it. change.md records the same decision, spend, cost failure, 2-of-5 hand-read rejection and stopped series. Historical Notes describe the original October 5 intent; the later Decision governs the completed outcome.

Progress records 13 applicable automated rows with phase SHAs and 7 manual acceptances checked. All seven Phase 5 rows are unchecked by design. The owner's explicit closeout choice and the conditional plan settle their applicability; no missing-Phase-5 finding is warranted. The epilogue's implemented status is consistent with completion of the rejection path.

## Dark code and requirements for a later attempt

Phase 1 follows its contracts: sonnet-5 default and literal test, immutable Anthropic finder pin, unchanged judge/impl-review routing, provider/finish logging, rejected-output logging, JSONL exclusion, schema dump, and the budget/input/configuration-guarded runner. The two earlier runner defects are fixed at 624a936: the dirty-source pathspec is top-anchored with a real-Git regression test; reconciliation requires a finite positive delay and leaves no-telemetry zero-delta spend unsettled. Those checks pass in the package suite.

The failure-notice action uses the same bot sticky marker, guards on failure plus a review outcome other than success, states no verdict, removes ai-cr:passed, and preserves a red job. It does not overwrite a successful review merely because a later posting step failed. This is code-reviewed behavior; no live GitHub posting or G5 was performed by this review. `.github/workflows/review.yml:29` still contains `false &&`; its only functional change in this range is the JSONL exclusion. The branch remains the dark implementation specified by the plan.

A successor cannot infer admission from passing local tests or rescue this experiment with an unregistered retry. Before any later admission:

1. Establish and seal a new measured configuration/protocol for the representative large input that demonstrates valid final output under its actual reasoning and output limits. Relevant code is config.ts's MAX_OUTPUT_TOKENS, reviewer.ts's generation configuration, and retry.ts's classifier. Changing cap, reasoning effort, loop structure or retry policy requires a new measured arm; the evidence does not establish which remedy works.
2. Pass reliability, the owner's finding-quality/D2 rules, and the cost gate under the new pre-registration. Retry changes alone do not address the cost or rejected findings. Re-measure costs rather than treating the invalid $0.334410 as a successful-run bound.
3. Refresh config.ts's forward-looking production/admission comments before reusing the dark code: they currently say the finder is admitted although this change was rejected. This is a reuse prerequisite, not a code finding against this deliberately dark branch.
4. Complete the conditional enable path only after a new ADMITTED decision: owner deletes OPENROUTER_REVIEW_MODEL in the UI, verify the resolved configuration, remove false && and update the workflow comment, pass G5 with the correct provider/model/telemetry and reconciled spend, recompute the post-G5 projection, pass required checks, then obtain the owner's merge.

## Lesson recommendation — do not write

Recommend one narrow entry: **Token-cap exhaustion is distinct from a retryable structured-output schema failure.**

For a structured-output tool loop, retain per-step output tokens and finish reasons for failed as well as successful attempts. `finish=length` at the configured cap can end as NoOutputGeneratedError, while retry.ts only recognizes NoObjectGeneratedError/schema mismatches, timeouts and retryable HTTP errors. Verify the actual class/policy before describing “one retry” as recovery for that failure. A changed token/reasoning/retry policy belongs to a newly sealed measurement with its costs accounted for; do not replay the recorded run as a transient failure.

Evidence: 269-r1 step 2 reports 16,384 output tokens and finish=length, then no output; the offline SDK probe confirms one invocation and no retry. This is more specific than the existing success-only-metric and provider-schema lessons. The logs do not expose a reasoning-token decomposition, so the lesson should not claim that high-effort thinking alone caused the failure or mandate increasing the cap. No lessons.md entry was written.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-sonnet/change.md, plan.md, plan-brief.md, research.md, follow-ups/review-fixes.md, and reviews/*.md. gate.md, gate-manifest.json, gate-window-runs.tsv, gate-sonnet-runs.jsonl and the hand-read files are planned measurement/evidence artifacts. No unrelated source additions were found.
- Earlier per-phase findings and their fixes were rechecked; historical reports are not rewritten or superseded by a differently scoped full report. One new warning concerns Phase 4 commentary that the earlier reports could not see.
- Lessons applicability: 34 of 37 entries apply to impl-review or omit a restriction. Existing rules about failed-attempt visibility, frozen evidence, live adoption gates and cost attribution informed the review. The proposed cap/error-class lesson is a recommendation only.
- Two independent read-only review passes covered plan drift and safety/quality/patterns. Neither found a new substantive source defect; the plan pass corroborated F1.
- Mutation testing skipped: none of the six photo-pipeline risk scenarios in test-plan.md maps to the review-tool changes. Root Stryker scope is not applicable. Phase 5 checks were not executed because the sealed outcome excludes Phase 5.
- No OpenRouter call, paid rerun, sealed-section edit, production mutation or commit was made. The sole remote check was read-only Git tag verification. Saving this full review stamps change.md from implemented to impl_reviewed under the skill; the report and stamp remain uncommitted and carried for the next workflow commit. The historical verdict and owner decision remain unchanged.
