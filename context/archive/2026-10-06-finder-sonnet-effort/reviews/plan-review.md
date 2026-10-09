<!-- PLAN-REVIEW-REPORT -->

# Plan Review: finder-sonnet-effort

- **Plan**: context/changes/finder-sonnet-effort/plan.md
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: SOUND after triage (2026-10-07)
- **Original verdict**: REVISE (2026-10-06)
- **Findings**: 1 critical, 6 warnings, 1 observation
- **Reviewed state**: feat/finder-sonnet-effort, HEAD 9c73c03; uncommitted plan, brief and change identity. Unrelated cloud-exif-orientation work excluded.

The low/medium experiment and the owner's decisions are workable. All eight findings were fixed in the plan
through owner-directed triage; the plan is now sound to implement and seal. This is plan approval, not model
admission or permission for a paid call before the remaining owner seal requirements. No owner decision was
reopened.

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | PASS    |
| End-State Alignment    | PASS    |
| Lean Execution         | PASS    |
| Architectural Fitness  | PASS    |
| Blind Spots            | PASS    |
| Plan Completeness      | PASS    |

The table reflects the plan after triage. Finding details and verification below preserve the original review
evidence; each Decision records its resolution.

## Grounding

Canonical plan path is inside context/changes/. Read plan.md, plan-brief.md and change.md; predecessor plan, gate Pre-registration/Results and full review's reuse prerequisites; installed provider and AI SDK; workflow/action and production call chain. Lessons: 28 of 38 entries apply to plan-review, and those blocks were read. No contract-surfaces.md exists.

Named modification paths resolve under packages/code-reviewer (the plan abbreviates package-relative src/scripts paths); runner and schema-dump are introduced by the port. Definitions distinguish owner decisions, code artifacts confirmed by the owner, and assumptions to confirm at sealing. Progress has exactly one terminal block, matching five phase names and all 28 phase verification bullets, with no checkboxes in phase bodies. Brief and plan match except for the qualifications below.

One focused read-only analysis delegate checked the port, configuration, runner and enable path. Its disposable detached worktree was removed. The actual two-commit cherry-pick test was clean; clean application does not establish correct scope (F4).

## Findings

### F1 — Effort is not specified through the production pipeline

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3, plan.md:192–212
- **Detail**: The listed changes cover config.ts, reviewer.ts and cli.ts, but the CLI invokes runReviewPipeline through its runPipeline dependency. At current HEAD, PipelineInput has finderMaxSteps and onFinderStep (pipeline.ts:466–469), and createFinder receives neither an effort option nor an override (pipeline.ts:534–547). The port changes telemetry there, but adds no effort. Parsing the flag and testing createReviewer directly can therefore succeed while the production runner measures the undefined/high default for both arms. TypeScript would expose an attempted new pipeline field, but the plan does not require that field or its propagation.
- **Fix**: Add pipeline.ts and pipeline.test.ts explicitly: CLI resolved finderReasoningEffort → PipelineInput → createFinder({ reasoningEffort }). Forward it independently of source/tool availability. Require a hermetic CLI/pipeline/request-body test for low, medium and omission, including a tool-less call; judge remains unchanged.
- **Decision**: FIXED — owner selected Fix in plan on 2026-10-06. Phase 1 §3 now names pipeline.ts/pipeline.test.ts, specifies CLI → PipelineInput → createFinder effort forwarding independently of source/tool availability, and requires hermetic production-path request-body tests for low, medium and omission. Testing Strategy carries the same requirement. Progress titles are unchanged; verification item 1.3 covers the expanded effort tests. No implementation code was changed.

### F2 — Missing reasoning telemetry becomes zero before the proposed guard sees it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Definitions “Effort applied”; Phase 1 §4–5; Phase 3 verification; G5
- **Detail**: Installed @openrouter/ai-sdk-provider 3.0.0 dist/index.js:2671 defaults absent completion_tokens_details.reasoning_tokens to 0; :2682 puts that value into outputTokens.reasoning. ai 7.0.52 dist/index.js:2610 maps it to outputTokenDetails.reasoningTokens. Consequently the proposed normalized-usage-only log prints reasoning=0 rather than ?, and the missing-count stop does not fire. An offline fake-fetch probe of these installed packages confirmed that missing and explicit-zero raw fields both produce normalized zero. Provider metadata preserves the distinction: dist/index.js:3854–3857 only emits openrouter.usage.completionTokensDetails.reasoningTokens when the response supplied it. G5's numeric-count requirement is likewise satisfiable with absent raw telemetry.
- **Fix**: Establish raw count presence from the per-step OpenRouter provider metadata (or preserved raw response) before using the normalized value. Log ? and flag when absent; preserve a genuinely reported zero. Add actual-provider fake-fetch regression cases for absent, explicit zero and positive reasoning counts, plus the failed-final-step log path.
- **Decision**: FIXED — owner selected Fix in plan on 2026-10-06. Phase 1 §4 now requires presence-aware metadata extraction in describeFinderStep, forwarding through FinderStepInfo.usage, explicit-zero preservation and ? for absent/unusable counts. Provider/SDK fake-fetch tests cover absence, zero, positive counts and failed-final-step logging. The runner records missing counts as null plus a flag, and G5 requires a genuinely reported numeric count. Testing Strategy is aligned; Progress titles are unchanged. No implementation code was changed.

### F3 — A token threshold cannot establish that adaptive effort was applied

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Current State Analysis; Definitions “Effort applied”; brief risk table
- **Detail**: The ratios and shared max_tokens accounting are documented, but the ratios are not an endpoint-specific hard bound for adaptive Sonnet-5. OpenRouter describes percentages as approximate and as a translation for budget-based models, and describes native adaptive thinking separately. An ignored low setting that runs high but uses 2,500 reasoning tokens passes the 3,604 threshold; correctly applied adaptive low using 4,000 would flag. The same ambiguity holds for medium. Neither threshold proves application or diagnoses silent ignoring. The plan acknowledges that a flag is not an automatic verdict, but the name “Effort applied” and brief “Effort ignored or adaptive (flagged)” still imply a detection capability it lacks. See [OpenRouter Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), sections Reasoning Effort Level and Reasoning with the Anthropic Messages API.
- **Fix**: Describe this as a reasoning-volume anomaly heuristic; retain the owner's stop for review, but explicitly state that no flag does not prove effort was honored. Seal and record requested effort/request-body evidence separately from observed token counts. Do not introduce a new paid control arm or change the decided gates.
  - Strength: Preserves the chosen experiment and useful anomaly signal without claiming endpoint attestation.
  - Tradeoff: Provider-side silent ignoring remains an explicitly unverified risk.
  - Confidence: HIGH — opposite endpoint behaviors can produce identical below-threshold usage.
  - Blind spot: No provider-side effective-effort acknowledgement was verified.
- **Decision**: FIXED — owner selected Fix in plan on 2026-10-06. Plan and brief now describe approximate reference values and a reasoning-volume anomaly heuristic, retaining the thresholds and owner stop while stating that no flag proves nothing about provider compliance. The runner/ledger contract records resolved requested effort and a safe projection of actual outbound finder settings separately from observed tokens, including retries and requests without step results; hermetic tests cover that evidence. No extra paid arm or gate change was introduced. Progress titles are unchanged; no implementation code was changed.

### F4 — The literal port restores stale active predecessor documents

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1 §1, plan.md:169–174
- **Detail**: A real cherry-pick --no-commit of 33fdb79 and 624a936 onto 9c73c03 succeeds. Besides the requested package/action/workflow code it adds context/changes/finder-sonnet/{change.md,plan-brief.md,plan.md,research.md,reviews/plan-review.md,reviews/impl-review-phase-1-33fdb79.md}. Master already has the completed predecessor under context/archive/2026-10-05-finder-sonnet/. The literal recipe resurrects stale active lifecycle/progress records and adds unrelated prose to the new PR. Code/action/workflow content is sufficient and matches the reviewed predecessor; Phase 1 §2 explicitly satisfies the admission-comment refresh prerequisite.
- **Fix**: Specify a source/action/workflow-only port: apply the commits without committing, remove only the six newly introduced predecessor document paths, and commit the intended port with original commit provenance/authorship recorded. Do not modify the archive.
- **Decision**: FIXED — owner selected Fix in plan on 2026-10-06. Phase 1 §1 now specifies a no-commit application, an absence check for all six excluded paths, explicit-path restoration to pre-port HEAD, and scope/content verification before further phase edits. The phase commit records original SHAs, authors and co-author attribution. The brief reflects the scoped port; unrelated workspace work and the archive are preserved. No port was executed in this triage turn and no commit was made.

### F5 — Runner acceptance does not yet enforce the sealed schedule or ended arms

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §5 refusals/tests; Phase 2 run order; Phase 3 criterion 3.1
- **Detail**: On feat/finder-sonnet, sonnet-gate.mjs:72 accepts arbitrary PR/r numbers; commandRun:312–326 checks syntax, PR input, uniqueness and T0, while :349–356 compares configuration. It does not refuse an out-of-order run, r3, or an arm already ended by an invalid run. The successor explicitly promises unknown-arm/configuration refusals but leaves schedule enforcement unstated. Testing Strategy:567 DOES include an early-ended arm with later skips and the other arm unaffected; this is not a missing test. A test driver voluntarily skipping calls, however, does not prove the runner cannot execute a forbidden call.
- **Fix**: Pin the allowed ordered run-id list and derive terminal-arm state from recorded outcomes. Refuse unsealed/out-of-order ids and direct calls to ended arms before spawning. State what budget-ended arms skip. Extend the fake-CLI tests to verify zero invocations for those refusals, both low-first and medium-first invalidations, and continuation in the remaining sealed order.
- **Decision**: FIXED — owner selected Fix in plan on 2026-10-06. The manifest now seals runOrder; the runner derives next eligible run and ended-arm state from series records, rejects unsealed/out-of-order ids and ended-arm requests before spawning, and records non-paid budget_skip events that end only their own arm. Tests cover zero-call refusals, either arm ending through invalidity or budget, continuation in sealed order and restart reconstruction. Existing unresolved-spend and owner-stop rules remain. Phase 2, Testing Strategy and brief are aligned; Progress titles are unchanged. No implementation code was changed.

### F6 — Mixed budget and failure outcomes lack an explicit label precedence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Definitions Winner/Reliability/Budget; Phase 2 verdict labels; Phase 4 §3
- **Detail**: The winner behavior is decided: a passing arm wins even if the other is incomplete. With neither passing, the plan both says “Neither → NOT ADMITTED” and lists INCOMPLETE (budget). It does not map low FAIL plus medium INCOMPLETE, or two incomplete arms, to exactly one label. This is a reporting ambiguity rather than an unresolved choice of model, but the sealed record needs a deterministic outcome. Multiple failed gates also need a stated label reason selection or listing rule.
- **Fix**: Add a small outcome table: any PASS → ADMITTED(winner); no PASS and a budget-incomplete arm → INCOMPLETE(budget), with per-arm failed/incomplete reasons alongside; both conclusively failed → NOT ADMITTED with per-arm reasons. Confirm that reporting convention at the seal without changing the gates or winner rule.
- **Decision**: FIXED — owner selected Fix in plan on 2026-10-06. Phase 4 §3 now carries the outcome/precedence table: any passing arm wins; otherwise any budget-incomplete arm yields INCOMPLETE (budget); otherwise both conclusively failed arms yield NOT ADMITTED with all established failed gates in a fixed order. Unmeasured gates remain distinct from failures. Definitions, Phase 2's sealed-label contract and brief are aligned; the gates, winner rule and measurement-error stop are unchanged. No implementation code was changed.

### F7 — G5 does not fully establish configuration and settled budget equivalence

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 5 §3–4, plan.md:514–536
- **Detail**: No env/action input is planned for effort, and the routing pin is immutable, but the broad configuration claim does not hold for the entire finder. action.yml:24–39,86–89 still permits model and finder-max-steps inputs; review.yml supplies repository variables, and the CLI/config resolvers honor them. The measurement runner compares effective configuration to the seal, whereas G5 checks model/provider and a reasoning count without checking winner effort or the sealed five-step limit. G5 also only requires spend “in the ledger,” weaker than the predecessor reuse requirement of reconciled spend. Pushing the G5 ledger or later review fixes triggers synchronize (review.yml:14), spending again after the single reserved G5; unrelated ready PR activity can also consume the shared counter. Finally “with G5's impl-review in the mean” must be conditional: a valid code review can fail its advisory verdict and skip impl-review.
- **Fix**: Before G5, compare live resolved finder/judge settings to the admitted arm (winner effort, routing, five steps, unchanged caps/timeouts/retry). Require valid comment/label publication and a genuinely reported reasoning count per step. Record pre/post counters and settle G5 before projection/merge; average $0.199620 with G5 impl-review cost only if that pass actually ran. Specify how subsequent synchronize-triggered reviews are prevented or checked, settled and charged against the same $4 total before spending; blocked G5/failed G5 blocks merge. No trigger change is required merely to state a safe execution procedure.
  - Strength: Proves production uses the measured arm and retains the owner's fixed budget and enable path.
  - Tradeoff: Requires coordination of post-enable pushes and account activity.
  - Confidence: HIGH — existing action inputs and synchronize trigger are visible in installed repository code.
  - Blind spot: Actual G5 cost and whether its third pass runs are unknown until execution.
- **Decision**: FIXED — owner selected Fix in plan on 2026-10-06. Phase 1 requires a safe configuration snapshot tied to actual pipeline values. Phase 5 compares live settings and outbound finder evidence to the winning arm, requires new comment/label publication and settled counter-attributed spend before merge, and makes the impl-review mean conditional on execution. It prevents subsequent paid synchronize runs by returning the PR to draft before ledger/documentation pushes, then making ready without a retry label; changed reviewable code or unexpected spend blocks merge for owner resolution. Plan and brief qualify existing model/step overrides. All spend remains within the original $4 total; no extra run, trigger change or budget increase is authorized. No implementation code was changed.

### F8 — The cost reuse and affordability rationale overstate their evidence

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: What We're NOT Doing; brief Budget/Starting Point; Phase 4 projection
- **Detail**: Reusing the predecessor's sealed workload is justified as a comparable historical baseline. Being off since October 4 does not mean a newer rolling 30-day window has no observed runs: it overlaps the historical window. It means recent disabled days provide no new active-review workload evidence. Likewise $3.55 before run 8 is a correct scenario calculation, not a worst-case guarantee: P is expressly an estimate, and actual/retry costs may exceed it. The brief's “fits all 8” wording is stronger than that evidence.
- **Fix**: State “same sealed historical workload for comparability; recent disabled days cannot measure demand after re-enable,” and qualify affordability as conditional on the assumed costs. Keep 53/8/13, the $0.199620 term, the $10 gate, and the $4/$0.50 budget unchanged.
- **Decision**: FIXED — owner selected Fix in plan on 2026-10-07. Plan and brief describe the reused counts as a sealed historical comparison baseline and distinguish overlapping rolling windows from recent disabled days without active-review observations. The pre-registration contract includes the conditional $3.55 run-eight check and $3.10 eight-run-plus-reserve scenario, explicitly not worst-case bounds. Counts, prices, projection gate and budget/reserve are unchanged. No implementation code was changed.

## Triage outcome

- **Completed**: 2026-10-07; owner selected Fix in plan for F1–F8.
- **Fixed**: F1, F2, F3, F4, F5, F6, F7, F8.
- **Skipped / accepted / dismissed / pending**: none.
- **Verdict after fixes**: REVISE → SOUND.
- **Scope**: plan.md, plan-brief.md, this report and change.md lifecycle timestamp; implementation, Progress
  titles/marks and unrelated cloud-exif-orientation work unchanged. No commit or model call.
- **Validation**: targeted formatting, phase/Progress correspondence, unchanged owner decisions, corrected
  terminology/label precedence and carry hashes checked after the final edits. Paid execution still requires
  the plan's owner-confirmed pre-registration and seal.

## Verification of the eight requested checks

1. **Mechanism**: Provider dist/index.js:3636–3637 copies settings.reasoning to the body; JSON serialization omits undefined. Usage parser and AI SDK mapping are as cited, with the missing→zero caveat in F2. Installed versions are exactly 3.0.0 and 7.0.52. OpenRouter documents approximate 0.8/0.5/0.2 allocation and reasoning within the combined output cap; it does not establish an adaptive endpoint token ceiling. These facts explain why lower effort is a plausible experiment, not a proven fix. F3 addresses the flag's false-negative/false-positive cases.
2. **Port**: Clean actual disposable-worktree application of both commits; reviewed production code is sufficient as a starting point. Exclude resurrected documents (F4). Comment refresh is explicitly covered, not missing.
3. **Safety**: Undefined dark effort yields no wire reasoning field; flag plus code constant is a reasonable pattern. There is no planned env variable/action input for effort. Model/steps remain configurable, with runner mismatch protection; require G5 equivalence (F7). F1 closes the actual CLI path.
4. **Runner/tests/hash**: Arms, per-arm/per-PR P, token records and configuration refusal are appropriately specified. Early-arm skipping IS listed. Add refusal/real SDK presence/path tests per F1/F2/F5. cli.ts belongs in individual byte hashes because its log is a parsed contract; the existing src tree and dirty-src guard also cover it. This is useful explicit coverage, not a previously unprotected file.
5. **Budget**: Recalculation below confirms the chat arithmetic under its cost assumptions. No paid cost was incurred in this review.
6. **Gates/winner/blindness**: Rules work for executed runs. The key can preserve blindness if memberships/arm identifiers are withheld from the presented rows and only revealed after all classifications; contradictory claims should remain separate under the inherited dedup rule. Tests/checker should map (run-id, finding index) identities, not just text, so equal findings in multiple runs remain accounted for. Mixed terminal labels need F6.
7. **Formula**: 13 × $0.199620 = $2.595060, leaving $7.404940 for 53 × m247 + 8 × m269. Counts are sealed historical observations, not current or future demand guarantees. Reuse is reasonable; byte-based representativeness remains explicitly an assumption, as required by the predecessor review. Failed-arm invalid costs can be reported, but cannot make reliability or D2 pass.
8. **Enable/G5**: Winner constant/literal test, deletion of OPENROUTER_REVIEW_MODEL by owner, unchanged judge variable, removal of false &&, green required checks and owner merge are present. Making ready does not trigger this workflow (no ready_for_review event); adding ai-cr:review does. G5's code-review verdict remains advisory; output/publication/configuration and settled-cost checks are distinct. See F2/F7 for missing-count, actual-effort and post-G5 spend/projection details.

## Budget recomputation

Assume each #247 run actually settles at $0.20 and each #269 at $0.45, separately for each arm. First P uses those estimates; round-two P doubles that arm/PR's largest earlier settled cost.

| Scheduled run | T before |     P | T + P + reserve |
| ------------- | -------: | ----: | --------------: |
| low-247-r1    |    $0.00 | $0.20 |           $0.70 |
| medium-247-r1 |    $0.20 | $0.20 |           $0.90 |
| medium-269-r1 |    $0.40 | $0.45 |           $1.35 |
| low-269-r1    |    $0.85 | $0.45 |           $1.80 |
| medium-247-r2 |    $1.30 | $0.40 |           $2.20 |
| low-247-r2    |    $1.50 | $0.40 |           $2.40 |
| low-269-r2    |    $1.70 | $0.90 |           $3.10 |
| medium-269-r2 |    $2.15 | $0.90 |           $3.55 |

All eight actual costs in this scenario total $2.60; with $0.50 G5, $3.10. At predecessor #247 cost $0.162874 and hypothetical complete #269 cost $0.434410 (invalid finder cost plus assumed $0.10 judge), the run-eight check is $1.954726 + $0.868820 + $0.50 = $3.323546. The hypothetical #269 number is neither a measured successful-run bound nor a guaranteed cost. A costly retry/outlier can still force INCOMPLETE or overshoot an estimate; admission estimates do not impose a provider-side dollar cap.

## Independent edge-case walkthrough

| Independent case                                                              | Outcome under the decided rules                                                                                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| low complete/PASS, medium budget-INCOMPLETE                                   | ADMITTED(low); medium cannot block the passing arm                                                                                            |
| low $8.40/month, medium $8.05/month; both all gates PASS                      | low wins: difference $0.35                                                                                                                    |
| low $8.60, medium $8.10; both PASS                                            | low wins at the inclusive $0.50 boundary (“within”)                                                                                           |
| low $8.61, medium $8.10; both PASS                                            | medium wins                                                                                                                                   |
| First low #269 run invalid, medium complete/PASS                              | Skip later low runs; ADMITTED(medium); low reliability FAIL regardless of its calculated costs                                                |
| An arm has only an invalid #269 run                                           | It fails reliability; no valid D2 publication, so hand-read #269 cannot pass; an executed invalid cost may enter its informational projection |
| #247 valid empty findings; each #269 valid run contains approved real D2 only | Hand-read passes; reliability and cost still required                                                                                         |
| Identical finding in low and medium; another claim contradicts it             | One identity-preserving shared row for the identical claim, separate contradictory row; key restores every run membership                     |
| Duplicate run id / r3 / unsealed next id                                      | Duplicate already refused by predecessor; new schedule refusals need F5                                                                       |
| Raw reasoning absent vs explicitly zero                                       | Current installed provider normalizes both to 0; F2 needed to make absent stop and zero remain observed                                       |
| low reliability FAIL, medium budget-INCOMPLETE; neither PASS                  | Per-arm outcomes clear, overall label precedence needs F6                                                                                     |
| Neither arm executes #269                                                     | Projections incomplete; neither can pass; budget-incomplete reporting needs F6                                                                |

## Review execution notes

Only remote retrieval during the original review was the public OpenRouter documentation page. No OpenRouter
model call, account mutation, paid run, production enable, commit or archive write occurred during review or
triage. SDK probes used injected fake fetch and synthetic responses exclusively; the first synthetic response
lacked required total_tokens, was corrected, and the final three cases passed. No repository code/test suite
was changed or run as implementation validation. The initial report-only save left findings pending; subsequent
owner-directed triage fixed all eight in the plan and aligned the brief. change.md remains plan_reviewed with
the final triage date, and carry hashes are refreshed for the written files.
