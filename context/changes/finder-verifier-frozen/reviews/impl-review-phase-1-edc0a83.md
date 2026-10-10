<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Sealed verifier on frozen findings

- **Plan**: context/changes/finder-verifier-frozen/plan.md
- **Scope**: Phase 1 (phases 1–4)
- **Session**: fresh — this conversation reviewed the plan but did not implement Phase 1
- **Base**: cf719bca36e80342127cc837bf5edc0c1351c596 (Progress — parent of Phase 1 commit)
- **Head**: edc0a83e6a60dc49b2b48e051477f775fc8dde45
- **Worktree**: excluded — plan.md's seven Progress SHA write-backs are bookkeeping; the working plan was read to resolve canonical execution state
- **Checks ran at**: edc0a83e6a60dc49b2b48e051477f775fc8dde45; sealed dependency code at finder-verification/seal, 9c85aa27f418c6d8cb669b1bedddbb333799fa02, in a separate temporary worktree
- **Manual acceptance**: 0 of 1 confirmed — pending: 1.8
- **Date**: 2026-10-10
- **Verdict**: REJECTED
- **Findings**: 1 critical, 3 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | PASS    |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Observable request violations do not stop subsequent sends

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/changes/finder-verifier-frozen/harness.mjs:587
- **Related locations**: harness.mjs:600, harness.mjs:647, harness.mjs:508
- **Detail**: Definitions requires checking assumptions A1–A3 after each request and stopping after the violating request, limiting the unprevented excess to that request. The fetch wrapper reads usage/provider/reasoning and then returns without checking violations. The SDK step observer also only records telemetry. Classification runs after the verifier's complete repair/retry sequence. A malformed response with an already observable violation therefore triggers another request. Scratch probes against otherwise unchanged implementation observed (a) two requests after the first reported excessive prompt_tokens and (b) two requests after the first reported cost above its bound: reported costs $0.02 and $0.90, cap $0.80, final T $0.92. This is a stub reproduction, not real spend. In addition, budgetStopped is classified before recorded violations: a malformed Azure response followed by a blocked repair becomes budget-stopped, not condition-violation. Consequently that slot is permanently completed rather than receiving the owner's fresh attempt on resume. The existing Azure/5xx precedence case verifies only the final class and does not assert that subsequent sends are prevented.
- **Fix**: Detect and latch violations as soon as wire or SDK metadata becomes available, refuse every subsequent send, and preserve account/recorded-violation precedence ahead of budget-stopped. Add malformed-response tests asserting exactly one outgoing request for a known violation, plus the mixed violation/budget classification case.
  - Strength: Implements the already accepted per-request stop rule through the existing fetch/callback seams without changing the sealed verifier or its request body.
  - Tradeoff: The latch must preserve the original cause, request accounting and final classification across SDK wrapping and retry handling.
  - Confidence: HIGH — both excess sends and misclassification were reproduced through the real sealed verifier with stubbed HTTP.
  - Blind spot: No live provider behavior was exercised; the finding depends only on metadata already available locally.
- **Evidence**: /tmp/fv-impl-review-t5lyn_vv/logs/review-probes.log; probes cost violation, prompt token violation, and provider violation before budget stop.
- **Decision**: FIXED (2026-10-10) — the first observable violation (wire: provider, reasoning, prompt_tokens/cost above bound, 401/402; SDK step: provider, reasoning) is latched at once, and every later send of the attempt is refused (`ViolationStop`); account and recorded violations now outrank `budget-stopped`. New self-tests: four malformed-answer violations each send exactly one request; a violation followed by a blocked repair classifies as `condition-violation` and the slot is re-run on resume. Mutants "no send refusal" and "budget before violations" fail. Commit `fix(finder-verifier-frozen): address phase 1 review (p1)`.

### F2 — The report drops per-finding outcomes and quote evidence distinctions

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: context/changes/finder-verifier-frozen/harness.mjs:1001
- **Related locations**: harness.mjs:925, harness.mjs:985, harness.mjs:1040
- **Detail**: Phase 1 promises per-finding × repeat × arm tables, and Definitions requires distinguishing refuted without evidence from an off-target refutation. buildReport emits member-level outcomes only for the 14 true/code-refutable findings. The other 61 are reduced to aggregate distributions in both Markdown and JSON. It also computes refutedNoEvidence but renders verified and invalid/empty-quote refutations with the same refuted cell before grading. The report does not expose per-repeat quote validation/match and reason fields retained in the raw series. A stub series for openai-pr269-05 has four findings; the rendered report omits members #5.3 and #5.4. An empty-quote D13 refutation renders as refuted even though its automatic aggregate correctly fails.
- **Fix**: Add the promised complete per-member/repeat/arm view to the report, including quote validation, quote match, reason and execution cause; annotate refutations without evidence independently of hand-read grades, keeping aggregate distributions alongside it.
  - Strength: Makes the result auditable from the report and preserves the planned separation between delivery, judgement and execution outcomes.
  - Tradeoff: The complete table is larger; a separate detailed table or JSON records can carry long quote/reason fields.
  - Confidence: HIGH — the missing member rows were reproduced and the corpus census confirms 61 findings fall outside the emitted member tables.
  - Blind spot: Full three-repeat report layout was not produced because no paid series exists; the omission is already visible with one repeat.
- **Evidence**: /tmp/fv-impl-review-t5lyn_vv/logs/review-probes.log; /tmp/fv-impl-review-t5lyn_vv/logs/invalid-refutation-original.log.
- **Decision**: FIXED (2026-10-10) — the report adds a complete `detail` table (JSON and Markdown) for every finding × repeat × arm with outcome, execution cause, quote check, quote match, reason (full text, quote included, in JSON); refutations are labelled `refuted (quote verified)` / `refuted without evidence` independently of hand-read grades. Self-test asserts all four openai-pr269-05 members appear; mutant "no evidence label" fails. Same commit.

### F3 — Refutation report scoring can regress while all self-tests pass

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/finder-verifier-frozen/harness.mjs:1572
- **Related locations**: harness.mjs:976, harness.mjs:1594, harness.mjs:1953
- **Detail**: Refutation tests inspect memberOutcome or raw records, but do not assert buildReport's automatic score. On a scratch copy, changing autoMet to accept refutedNoEvidence as well as refutedVerified still yields SELF-TEST PASS: 53/53, exit 0. Rendering the same empty-quote D13 series proves this is a relevant mutant: original automatic result is 0/1 fail; mutated result is 1/1 pass. The current implementation's scoring expression is correct; the finding is a missing regression assertion for the experiment's final answer.
- **Fix**: Assert report-level automatic scores for valid, empty and absent quotes, and hand-read outcomes for pass/off-target/no-evidence, including a three-repeat mixed case. Require this scoring mutation to fail.
- **Evidence**: /tmp/fv-impl-review-t5lyn_vv/logs/auto-refutation.log; /tmp/fv-impl-review-t5lyn_vv/invalid-refutation-original.json; /tmp/fv-impl-review-t5lyn_vv/invalid-refutation-mutant.json.
- **Decision**: FIXED (2026-10-10) — report-level assertions for the automatic refutation score (valid 1/1 pass, empty 0/1 fail, absent 0/1 fail) and a 3-repeat mixed case (automatic 1/3 unstable; hand-read via the blind key: pass 1/3, off-target 0/3). The reviewer's mutant (autoMet accepts refutedNoEvidence) now fails 2 cases. Same commit.

### F4 — Durability self-tests do not detect removal of fsync

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/changes/finder-verifier-frozen/harness.mjs:1864
- **Related locations**: harness.mjs:388, harness.mjs:392, harness.mjs:557
- **Detail**: The current appendLine implementation does fsync each line before sending, as required. However, removing its fsyncSync(fd) call on a scratch copy still yields SELF-TEST PASS: 53/53, exit 0. The simulated crash occurs after an ordinary write and checks filesystem-visible content, which does not distinguish buffered writes from durable ones. This mutant removes the prerequisite for proving request costs after a process/storage interruption and is therefore substantive, rather than cosmetic. No real power loss was simulated.
- **Fix**: Add a deterministic durability oracle at the journal/send boundary, recording which pending writes have been flushed when beforeSend runs. Verify that the start and corresponding request are durable before the HTTP stub is invoked, and that a failed flush prevents sending.
  - Strength: Checks the financial journal's actual ordering contract and detects the demonstrated mutant without relying on nondeterministic operating-system cache behavior.
  - Tradeoff: Needs a narrowly scoped journal/filesystem test seam or flush instrumentation.
  - Confidence: HIGH — the removed-fsync mutant survived, while the source establishes that this call provides the promised durability.
  - Blind spot: Such an oracle tests the harness ordering, not a filesystem or storage device's own durability guarantees.
- **Evidence**: /tmp/fv-impl-review-t5lyn_vv/logs/remove-fsync.log.
- **Decision**: FIXED (2026-10-10) — file operations go through an `FS` seam; the self-test instruments it and asserts, at the moment the HTTP stub is invoked, that the start and request lines were written and fsync'd (0 unsynced lines, last write = the request line), and that a failed fsync of the request line sends nothing. The reviewer's mutant (fsync removed) now fails 2 cases. Same commit.

## Automated Verification

Each check was captured to a file and judged by its exit status. All child commands ran with OPENROUTER_API_KEY removed. npx used --no-install to prevent dependency downloads; network access was used only by npm ci in the scratch sealed package.

| Progress | Check                                                                                                 | Exit      | Observed result                                                                             | Log                                        |
| -------- | ----------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1.1      | git -C <scratch>/fv-seal rev-parse HEAD:packages/code-reviewer/src                                    | 0         | 9be9423531d08ec932f82db7683e97d4da5ddf5c                                                    | src-pin.log                                |
| 1.1      | sha256sum <sealed package>/scripts/finder-gate-core.mjs                                               | 0         | e713226c84ce35d7f29fd2644660e823a91645c653761ee8f33e9a5f784bcb17                            | gate-core-pin.log                          |
| 1.2      | npm test in <sealed package>                                                                          | 0         | 29 files, 1,086 tests passed                                                                | package-tests.log                          |
| 1.3      | FV_OUT=<scratch> FV_PKG=<sealed package> npx --no-install tsx <harness> dry-run                       | 0         | 19 batches, 38 requests, failures: []                                                       | dry-run.log                                |
| 1.4      | Same invocation, self-test                                                                            | 0         | SELF-TEST PASS: 53/53                                                                       | self-test.log                              |
| 1.5      | report --series <self-test>/s38.jsonl --out <scratch>/report-interrupted.json                         | 0         | Tables render; interrupted base slot 0/1, fail, lost to reliability                         | report-interrupted.log                     |
| 1.6      | plan, followed by prettier --write on harness-plan-check.json, then git diff --exit-code on that file | 0 / 0 / 0 | Byte-identical to edc0a83: d0743e843a67569459b0d204dfa950b4a48a517c723261233a22c54a5367c88c | plan.log, plan-prettier.log, plan-diff.log |
| 1.7      | npx --no-install prettier --check context/changes/finder-verifier-frozen                              | 0         | All matched files use Prettier code style                                                   | prettier.log                               |

Logs are under /tmp/fv-impl-review-t5lyn_vv/logs/. The formatting gate ran before this report was added; the report was separately formatted and checked when saved. Setup npm ci exited 0. The original harness, frozen plan JSON, working plan and change.md hashes were recorded before review and verified unchanged afterward.

## Mutation and Probe Evidence

These are user-requested targeted scratch copies, not mutations of the repository or sealed package. Only self-test and report modes were invoked; each series operation used injected stubbed fetch and counter functions. A failing added probe is evidence for a finding, not a failure of the original 53-case phase gate.

| Scratch change / probe                                                   | Exit | Result                                                        | Interpretation                                                |
| ------------------------------------------------------------------------ | ---- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| autoMet accepts refutedNoEvidence                                        | 0    | 53/53 pass; empty-quote D13 changes from 0/1 fail to 1/1 pass | Relevant survived mutant, F3                                  |
| Remove fsyncSync(fd)                                                     | 0    | 53/53 pass                                                    | Relevant survived mutant, F4                                  |
| Remove request cap gate                                                  | 1    | 52/53; repair-budget case fails with ok, requests=2           | Negative control detected; self-test is not uniformly vacuous |
| Four additional review assertions on an otherwise unchanged harness copy | 1    | Original 53 pass, four probes fail; 53/57 total               | Reproduces F1 and F2                                          |

The exact copies remain in /tmp/fv-impl-review-t5lyn_vv/mutants/. To rerun them, recreate the sealed worktree at /tmp/fv-impl-review-t5lyn_vv/fv-seal and install its package dependencies with npm ci, then use the same FV_PKG/FV_OUT and self-test/report commands. No CLI run or reconcile mode was invoked.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-verifier-frozen/change.md, context/changes/finder-verifier-frozen/plan.md, context/changes/finder-verifier-frozen/plan-brief.md, context/changes/finder-verifier-frozen/research.md. The uncommitted Progress SHA write-back is excluded from findings.
- **Applicable lessons**: 35 of 38 entries apply to impl-review by stage annotation; selected blocks were read. The most relevant priors were attempt-based guard metrics, observable checks, and output-limit/error distinctions.
- **Owner decision**: change.md's 2026-10-10 note is authoritative: a completed violated slot gets a fresh attempt on resume; an interrupted slot is never re-sent. Earlier discussion recommending a different policy is superseded and is not a finding.
- **Verified matches**: Base uses sealed runVerificationPass; O preserves base blocks and appends frozen evidence, then uses the same verifier/retry/apply path and telemetry seams. Hard score, majority, diagnosis priority, interrupted accounting, T0/price header pinning and seal comparisons match the plan. Parseable length output is scored and flagged; invalid length output fails without a new draw. Violated results remain in the journal and are excluded from scoring.
- **Mapped-risk Stryker gate**: skipped. test-plan.md's six risks concern the app's Cloud AI/Supabase/auth/retention/watchdog paths; this change touches none of those behaviors. The requested manual harness mutations above were still performed, narrowly and offline.
- **Manual acceptance**: 1.8 remains pending. This is recorded separately and does not itself lower the verdict.
- **Scope**: No Phase 2 seal, Phase 3 paid calls/pre-flight, or Phase 4 hand-read acceptance was attempted. Existing free checkSeal tests were verified as part of the Phase 1 instrument.
- **Writes**: Per the user's explicit write-only-report restriction, change.md was not stamped and the carry record was not updated. No code/plan edits or triage fixes were made; all findings remain PENDING. No commits or pushes were made.
- **Cleanup**: The temporary sealed worktree was removed successfully. Scratch logs, stub series, JSON reports and mutation copies remain outside the repository.
