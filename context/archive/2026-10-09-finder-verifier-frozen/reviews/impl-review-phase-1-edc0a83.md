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

## Re-review 1 (2026-10-10)

- **Scope**: Phase 1 (phases 1–4)
- **Session**: fresh — this conversation did not implement the phase or its fixes
- **Base**: edc0a83e6a60dc49b2b48e051477f775fc8dde45 (previous round)
- **Head**: a05ef268971fd18577fbcb736d2dbc5f0c37d395
- **Worktree**: excluded — clean at the recorded head; no local changes to include
- **Checks ran at**: a05ef268971fd18577fbcb736d2dbc5f0c37d395 in a temporary checkout; sealed dependency code at `finder-verification/seal`, `9c85aa27f418c6d8cb669b1bedddbb333799fa02`, in a separate scratch worktree
- **Manual acceptance**: 0 of 1 confirmed — pending: 1.8
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations
- **Closes**: F1, F2, F3, F4

None.

### Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

### Fix verification

- **F1 closed**: `harness.mjs:538–600` refuses subsequent sends with `ViolationStop` before body parsing, accounting or journaling; it latches the first observable wire violation before returning the response to the SDK. `onStepEnd` at lines 613–619 also latches SDK metadata before forwarding the callback. `classifyAttempt` at lines 513–522 preserves account → latched → recorded → budget precedence (the existing unbounded-request precondition stays first). Each attempt gets a fresh context. The original cost, prompt-token and provider/budget probes now observe exactly one send and `condition-violation`; the cost probe records T = $0.02, not $0.92, entirely simulated. The new resume case retains the violated attempt and gives that slot its fresh attempt. Additional scratch probes inject SDK-only reasoning metadata with clean wire metadata: both base and O stop before repair, each with one send. A direct precedence probe confirms account-402 outranks the latch, which outranks recorded provider-Azure and budget.
- **F2 closed**: `memberOutcome` at lines 943–950 preserves quote, quote validation/match, reason, reasonCode and modelVerdict. `buildReport` at lines 1095–1119 emits `detail` for every selected finding × repeat × arm, including policy, ambiguous and descriptive members; execution causes are retained. Markdown includes every member with quote check/match and a reason excerpt; JSON preserves full quote/reason text. Refutation cells at lines 1009–1016 distinguish `refuted (quote verified)` from `refuted without evidence`, independently of grades. The original four-member probe reports `expected=4 missing=`. The three-repeat stub report has 12 detail records, including members #5.3 and #5.4; D13 shows verified, empty and absent quotes separately.
- **F3 closed**: Report-level assertions at lines 2181–2231 exercise valid, empty and absent quotes (automatic 1/1, 0/1, 0/1), plus three mixed repeats (automatic 1/3 unstable; blind-key hand-read pass 1/3 versus off-target 0/3, with no-evidence grades on the other repeats). The original substantive `autoMet` mutation now fails both report-scoring cases. The independent CLI stub report agrees: D13 automatic 1/3 unstable, majority fail, hand-read pending without supplied grades.
- **F4 closed**: The FS seam at lines 389–401 preserves write → fsync → close, with close in `finally`. The durability cases at lines 2234–2311 observe zero unsynced lines at the actual HTTP stub boundary, a preceding start and the corresponding request as the last write; an injected request-line fsync failure sends nothing and records a condition violation. Removing `FS.fsyncSync(fd)` now fails both cases: four unsynced lines at send, and one send when a failed flush should prevent it. This proves the journal/send ordering contract, not a storage device's behavior under power loss.

### Automated verification

All checks captured stdout/stderr to scratch log files and used the actual exit status. Every shell command began with `env -u OPENROUTER_API_KEY`; child commands inherited that removal. Network was used only for `npm ci` in the sealed package. Every npx invocation used `--no-install --offline`. Harness series operations occurred only inside self-test with injected HTTP/counter stubs; no CLI `run` or `reconcile` was invoked.

For harness commands below, the prefix was `env -u OPENROUTER_API_KEY FV_OUT=/tmp/fv-rereview-gp1ickb2 FV_PKG=/tmp/fv-rereview-gp1ickb2/fv-seal/packages/code-reviewer npx --no-install --offline tsx context/changes/finder-verifier-frozen/harness.mjs`, from the temporary checkout at a05ef26. Formatting and git commands also removed the API key.

| Progress | Check                                                                                                                                                                                                          | Exit      | Observed result                                                                                       | Scratch log                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Setup    | `npm ci` in sealed `packages/code-reviewer`                                                                                                                                                                    | 0         | Dependencies installed                                                                                | npm-ci.log                                 |
| 1.1      | `git rev-parse HEAD:packages/code-reviewer/src` in sealed package                                                                                                                                              | 0         | `9be9423531d08ec932f82db7683e97d4da5ddf5c`                                                            | src-pin.log                                |
| 1.1      | `sha256sum scripts/finder-gate-core.mjs` in sealed package                                                                                                                                                     | 0         | `e713226c84ce35d7f29fd2644660e823a91645c653761ee8f33e9a5f784bcb17`                                    | gate-core-pin.log                          |
| 1.2      | `npm test` in sealed package                                                                                                                                                                                   | 0         | 29 files; 1,086/1,086 tests passed                                                                    | package-tests.log                          |
| 1.3      | `dry-run`                                                                                                                                                                                                      | 0         | 19 batches, 38 requests, `failures: []`                                                               | dry-run.log                                |
| 1.4      | `self-test`                                                                                                                                                                                                    | 0         | `SELF-TEST PASS: 63/63`                                                                               | self-test.log                              |
| 1.5      | `report --series <self-test>/s38.jsonl --out <scratch>/report-interrupted.json`                                                                                                                                | 0         | Interrupted base 0/1 fail, O published, diagnosis lost to reliability; detail retains execution cause | report-interrupted.log                     |
| 1.5      | `report --series <self-test>/s57.jsonl --out <scratch>/report-mixed.json`                                                                                                                                      | 0         | Four members × three repeats; D13 automatic 1/3 unstable; quote/reason fields retained                | report-mixed.log                           |
| 1.6      | `plan`; `npx --no-install --offline prettier --write context/changes/finder-verifier-frozen/harness-plan-check.json`; `git diff --exit-code -- context/changes/finder-verifier-frozen/harness-plan-check.json` | 0 / 0 / 0 | Byte-identical pinned plan JSON: `d0743e843a67569459b0d204dfa950b4a48a517c723261233a22c54a5367c88c`   | plan.log; plan-prettier.log; plan-diff.log |
| 1.7      | `npx --no-install --offline prettier --check context/changes/finder-verifier-frozen`                                                                                                                           | 0         | All matched files formatted                                                                           | prettier.log                               |

### Original probes and mutations rerun

Each copy derives from a05ef26 in scratch; the four additional assertions were recovered verbatim from the first review's `review-probes.mjs`. Only self-test was executed on these copies.

| Scratch change / probe                                                      | Exit | Result                                                  | Interpretation                                                         |
| --------------------------------------------------------------------------- | ---- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Four original F1/F2 probes on fixed code                                    | 0    | 67/67; all four probes pass                             | Original defect reproductions confirm the fixes                        |
| `autoMet` also accepts `refutedNoEvidence`                                  | 1    | 61/63; both report-scoring cases fail                   | F3's previously surviving mutant is detected                           |
| Remove `FS.fsyncSync(fd)`                                                   | 1    | 61/63; both durability cases fail                       | F4's previously surviving mutant is detected                           |
| Remove request cap gate                                                     | 1    | 62/63; blocked-repair case becomes ok with two requests | Negative control remains detected                                      |
| Original probes plus SDK-only base/O latch, price-pin and precedence probes | 0    | 71/71                                                   | Callback latch and unchanged resume/classification contracts confirmed |

The extra price probe initially omitted required repeat/run/arm configuration and hit those earlier refusals. After supplying the unchanged series configuration, it reached the price check and observed `resume refused: the price priceIn differs from the header's 0.1`. These were scratch-probe setup failures, not implementation failures; logs retain every run.

### Regression verification and review notes

- **Bookkeeping in diff**: `context/changes/finder-verifier-frozen/change.md`, `context/changes/finder-verifier-frozen/plan.md`, `context/changes/finder-verifier-frozen/reviews/impl-review-phase-1-edc0a83.md`. The harness is the planned instrument under review. No extra implementation paths changed.
- **Prior matches retained**: Compared edc0a83 to a05ef26; the pins/corpus/evidence augmentation/frozen scoring inputs, series bookkeeping and cost bounds, base/O dispatch, seal and T0/price checks, hard/majority scoring, diagnosis priority and report scoring predicate are byte-unchanged. Base still calls sealed `runVerificationPass`; O still preserves base blocks and adds only frozen missing evidence before the same verifier/retry/apply path. The unchanged plan JSON and passing wire/publication dry-run independently confirm excerpt serving and verifier behavior. All five diagnosis rules, interrupted accounting, changed T0/harness/corpus/gate-core refusals and free seal cases still pass. Price-pin refusal was additionally exercised with a stubbed resume. No actual Phase 2 seal or paid provider behavior is claimed.
- **Lessons**: 35 of 38 ledger entries apply; selected blocks read fully. Attempt-based guard metrics, observable checks and output-limit/error distinctions remain relevant priors.
- **Mapped-risk Stryker gate**: skipped; the test plan's six app risks concern Cloud AI/Supabase/auth/retention/watchdog behavior, none touched by this harness change. The user-requested narrow scratch mutations above were performed offline.
- **Evidence**: `/tmp/fv-rereview-gp1ickb2/logs/`; exact command/exit records in `checks.json`, `mutation-checks.json`, `report-checks.json` and `step-price-check-final.json`; scratch copies in `mutants/`, stub series in `fv-selftest-Qj6gD8/`, rendered JSON reports and `regression-segments.json` alongside them. Recreate the sealed worktree and install dependencies to rerun retained copies; no secrets are needed.
- **Scope and writes**: Only this requested re-review round is appended. Earlier report bytes are preserved. The explicit user restriction overrides the skill's change.md stamp and carry-record writes; neither is changed. No code, plan, frozen JSON, archive, triage-fix, commit or push writes. Manual 1.8 remains pending and does not lower this phase verdict; Phases 2–4 remain outside this review.
- **Cleanup**: Both temporary worktrees removed successfully; scratch logs, reports, stubs and probes retained. Sealed source/gate-core were clean before removal. Original harness, plan, change.md and frozen JSON hashes remained unchanged.

**Verdict: APPROVED. Closes: F1, F2, F3, F4.**
