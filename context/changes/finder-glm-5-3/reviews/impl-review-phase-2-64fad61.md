<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: finder-glm-5-3 Implementation Plan

- **Plan**: context/changes/finder-glm-5-3/plan.md
- **Scope**: Phase 2 (phases 1–7)
- **Session**: fresh
- **Base**: 9782f38 (Progress — the Phase 1 commit)
- **Head**: 64fad610c6c688f9104af8c620e877c99743ebb4
- **Worktree**: excluded — `context/changes/finder-glm-5-3/plan.md` (Progress SHA write-back, bookkeeping) and `temp_steps.md` (outside scope) not reviewed
- **Checks ran at**: 64fad61 (= HEAD)
- **Manual acceptance**: 0 of 1 confirmed — pending: 2.7
- **Date**: 2026-10-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — `<think` anywhere fails correct reviews of this package, G5's own PR included

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/output-repair.ts:79 (used at src/reviewer.ts:376-421)
- **Detail**: `containsInlineReasoning = /<think/iu.test(text)` matches `<think` anywhere, including inside a JSON string value or a stage-1 note that quotes code. This follows A2 to the letter ("text contains `<think`"), so it is a plan flaw rather than drift. The false-positive class sits in this repository's own diffs: any PR touching the guard (`output-repair.ts`, `reviewer.ts`, `cli.ts`, or the tests full of `<think>REASONING-SENTINEL`) invites a finding or note that quotes it. G5 runs on PR #292, which is exactly such a PR. `FinderOutputError` is never retried, so a correct answer exits 1 as `reason=inline-reasoning`, the redacted log line leaves nothing to diagnose, and G5 is not green. No test covers `<think` inside a JSON string. The code is sealed at Phase 4, so this must be decided before the seal.
- **Fix A ⭐ Recommended**: Narrow the guard to the shape inline reasoning actually takes — `<think` at the start of the text (after whitespace), `/^\s*<think\b/iu` — and add tests that a `<think` quoted inside a finding description or a mid-text note passes. Amend A2 in the plan to match.
  - Strength: Keeps fail-closed on the known upstream shape (`<think>…</think>` prefixed to `content`) while letting the package review its own code; G5 on #292 no longer depends on whether the model quotes the guard.
  - Tradeoff: A model that emitted reasoning mid-text would pass the guard; A2 changes after the owner's 2026-10-11 decisions (it is an agent assumption, owner-overturnable at Phase 4).
  - Confidence: MED — inline-reasoning upstreams prefix `content`; the screening saw no such response at all.
  - Blind spot: Not verified against a live upstream that emits inline reasoning.
- **Fix B**: Keep the broad guard and record the risk in the pre-registration as an accepted consequence of A2, including that a G5 technical failure from it is not green.
  - Strength: No code change; maximal fail-closed.
  - Tradeoff: G5 and every later review of this package can fail on a correct answer; the failure is opaque by design.
  - Confidence: HIGH — the behaviour is deterministic.
  - Blind spot: How often glm-5.3 quotes code verbatim in notes on this diff.
- **Decision**: FIXED — Fix A, modified by the owner: rejection and redaction separated. Rejection uses `startsWithInlineReasoning` (`/^\s*<think/iu`, no `\b` so a leading `<thinking>` is still refused); log redaction keeps the broad `containsInlineReasoning` (`/<think/iu`). Regression tests in output-repair, reviewer (quoted `<think` in a stage-1 note, finalization, repair is used) and cli (quoted review exits 0; an unparsable text quoting `<think>REASONING-SENTINEL` fails as `parse` and is still redacted); deliberate breaks of each regex fail 7 and 2 tests respectively. A2 amended in plan.md (Definitions, A2, Phase 2 § 3, Testing Strategy) and plan-brief.md. vitest 761 pass, tsc, eslint, prettier exit 0; siblings: none (only rejection site is `refuseUnusable` in reviewer.ts, covering step, finalization and repair; `git grep InlineReasoning` over packages/code-reviewer); reopened: none

### F2 — Refused inline-reasoning error still carries the raw text

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/output-repair.ts:145 (`this.text = details.text`), thrown from src/reviewer.ts:386-394
- **Detail**: Decision 2 keeps reasoning out of logs and published artifacts, but the guarantee lives in one consumer: only the CLI's `formatRejectedOutputLine` redacts. `FinderOutputError.text` holds the full `<think…` text, and `scripts/fabrication-probe.mjs:453-454` and `scripts/fabrication-grade.mjs:338-339` write `error.text` unredacted into result JSON under `context/changes/` (committable, public repo). `config.ts` notes these scripts inherit the finder settings.
- **Fix**: For `reason === "inline-reasoning"`, store `text: ""` plus a `chars` count in `FinderOutputError` itself, make `formatRejectedOutputLine` print that count, and assert in `output-repair.test.ts` that `.text` holds no sentinel.
- **Decision**: FIXED — Fix now: `FinderOutputError` stores `text: ""` and `chars` (original length) for `inline-reasoning`, other reasons keep their text; `formatRejectedOutputLine` redacts on `reason === "inline-reasoning"` or `<think` anywhere and prints `chars`. Tests in output-repair (no sentinel on the error, `chars` kept) and cli (blank-text inline error still prints `reason=inline-reasoning chars=33`); deliberate break (text kept) fails the new test. vitest 762, tsc, eslint, prettier exit 0; siblings: scripts/fabrication-probe.mjs and scripts/fabrication-grade.mjs fixed at the source (they now receive ""), scripts/judge-diagnose.mjs n/a (judge errors only, never a FinderOutputError); reopened: none

### F3 — Inline reasoning in a tool-calling step keeps the paid loop running

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/reviewer.ts:421
- **Detail**: The stage-1 check runs after `agent.generate` returns. A step whose text carries `<think` alongside a tool call does not stop the loop: up to `maxSteps − 1` more paid requests follow, re-sending that text as assistant history, before the run fails anyway. Matches the plan's letter ("before it enters the transcript"); nothing reaches logs, transcript or parser. Same for a `length` step, which cannot carry a tool call, so only inline reasoning is affected.
- **Fix**: Check each step in `stopWhen` / `prepareStep` and abort on the first offending step; or record it as accepted spend on a doomed run.
- **Decision**: FIXED — Fix now: `stopWhen: [isStepCount(maxSteps), <last step opens with <think or ends finish=length>]` in reviewer.ts, so the loop ends on the first unusable step and the existing post-loop `refuseUnusable` throws as before. Test: a tool-calling step opening with `<think` sends exactly 1 request and fails as `inline-reasoning`, `step:1`; deliberate break fails it. vitest 763, tsc, eslint, prettier exit 0; siblings: none (the finder's `ToolLoopAgent` is the only loop the A2 guard covers; judge and impl-review have no such guard, out of scope); reopened: none

### F4 — `attempt: 2` labelling has no test through the real reviewer

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/pipeline.ts:621-626
- **Detail**: The Testing Strategy asks for per-request telemetry "retries included". The attempt counter and the shared telemetry are tested only with a fake finder; no test drives the real reviewer + fetch observer through a retryable failure and checks that attempt-1 entries survive and attempt-2 entries carry `attempt: 2` with their own reported fields. Phase 3's validity classification reads exactly these records.
- **Fix**: Add one stub-backed pipeline test: first finder request times out / 5xx, second succeeds; assert the `requests` array's `attempt` values and reported fields.
- **Decision**: FIXED — Fix now: cli.test.ts e2e test through the real reviewer and fetch observer — attempt 1 runs two loop steps, its finalization gets HTTP 502 (retryable), attempt 2 succeeds; `review.json` `finderTelemetry.requests` keeps both attempt-1 steps and labels attempt 2's steps and finalization `attempt: 2`, each with its own reported provider, model and reasoning tokens; the failed request adds no entry. Deliberate break (`finderAttempt = 1`) fails it. vitest 764, tsc, eslint, prettier exit 0; siblings: none (judge and impl-review telemetry carry no per-request attempt label); reopened: none

### F5 — One observer slot per reviewer instance is unsafe for concurrent `review()`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: packages/code-reviewer/src/provider-metadata.ts:111-127
- **Detail**: `createResponseObserver` keeps a single mutable `last` slot per `createReviewer` instance. Within one `review()` requests are sequential, so attribution is correct. But `createReviewer` is exported (`src/index.ts:47`), and two concurrent `review()` calls on one instance would attribute responses to the wrong request. No in-repo caller does this today (every script creates a reviewer per call).
- **Fix**: Create the observer per `review()` call, or document "one review at a time per instance" on `createReviewer`.
- **Decision**: FIXED — Fix now (documentation, no behaviour change): `createReviewer` JSDoc states "one review at a time per instance" and why, pointing at the shared observer slot; siblings: src/provider-metadata.ts `createResponseObserver` doc fixed (cross-reference added); reopened: none

### F6 — Provider telemetry read through two paths; routing resolved twice

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/src/pipeline.ts:570; src/cli.ts:134-136
- **Detail**: `model` and `reasoningTokens` flow through `describeFinderStep`, but `provider` is read straight from `request?.reported.provider`, while the step line's provider comes from SDK metadata. They agree today only because the SDK maps `""` and `asStepProvider` drops it. Separately, `formatFinderConfigurationLine()` calls `resolveFinderProviderRouting()` again, so a malformed `OPENROUTER_FINDER_PROVIDERS` warns twice per run.
- **Fix**: Add `reportedProvider` to `FinderStepInfo` so all three reported fields come from one place, and pass the resolved routing into the configuration line instead of resolving it again.
- **Decision**: FIXED — Fix now: `FinderStepInfo.reportedProvider` (raw response, from `describeFinderStep`) feeds `finderTelemetry.requests[].provider`, so provider, model and reasoning tokens share one source; the SDK's `provider` stays for the step line (format unchanged). The CLI resolves the finder routing once and passes it to both `formatFinderConfigurationLine(routing)` and the pipeline (new `PipelineInput.finderProviderRouting` → `createReviewer({providerRouting})`). Tests: describeFinderStep carries the reported provider / missing without metadata; a malformed `OPENROUTER_FINDER_PROVIDERS` warns exactly once and the configuration line equals the wire `provider.order`; deliberate break (routing not passed) fails it. vitest 766, tsc, eslint, prettier exit 0; siblings: none (`git grep` for `reported.provider` and `resolveFinderProviderRouting()` outside tests: the reviewer's own fallback for non-CLI callers is intended); reopened: none

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-glm-5-3/plan.md, context/changes/finder-glm-5-3/research.md, context/changes/finder-glm-5-3/reviews/impl-review-phase-1-9782f38.md
- Lessons: 35 of 38 entries apply to impl-review; used as priors: "A per-step output cap hit…", "A best-effort integration that degrades silently…", "A guard metric that only exists on success…", "A check that cannot say what it found…", "Writing a fact into its canonical home…".
- Automated checks at 64fad61: `vitest run` exit 0 (747 tests); `tsc --noEmit` exit 0; `eslint .` exit 0; `vitest run -t "REASONING-SENTINEL"` exit 0 (6 tests); `git grep -n "enabled: false" packages/code-reviewer/src` prints nothing (exit 1); root `prettier --check .` exit 0; stale-pointer grep hits are exactly the ones the Phase 2 commit message lists as deliberately kept.
- Plan drift: all six Changes Required items MATCH; scope guardrails respected (judge / impl-review models, routing and timeouts, `MAX_OUTPUT_TOKENS`, `REVIEW_FINDER_MAX_STEPS`, diff cap untouched; no `reasoning.exclude`). Benign extras: `FinderOutputError.request`, the stub's default model `z-ai/glm-5.3`, a `no include_reasoning key` assertion.
- Mutation check skipped: `context/foundation/test-plan.md` § 2 maps no risk to `packages/code-reviewer`, and Stryker is configured for the root app only.
- Operational, already tracked by the plan (Phase 7 § 3.1): `OPENROUTER_REVIEW_MODEL = z-ai/glm-4.6` is still set. Until it is deleted, the restored workflow would run glm-4.6 on the new two-stage finder with `effort: low` and the new routing; the `finder configuration:` line would show it.

## Re-review 2 (2026-10-13)

- **Scope**: Phase 2 (phases 1–7)
- **Session**: fresh
- **Base**: 64fad610c6c688f9104af8c620e877c99743ebb4 (previous round; explicit boundary)
- **Head**: b6afeb193255ff875a53e0e9254d68942c3f5730
- **Worktree**: excluded — `temp_steps.md` (uncommitted, outside scope); no uncommitted changes included
- **Checks ran at**: b6afeb193255ff875a53e0e9254d68942c3f5730 (temporary detached worktree; branch HEAD was also b6afeb1)
- **Manual acceptance**: 0 of 1 confirmed — unverifiable: 2.7
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations
- **Closes**: F1, F2, F3, F4, F5, F6

None.

- **Notes**: All six fixes hold against round 1's `Decision:` lines. The two independent passes found no plan drift, substantive pattern mismatch or regression introduced by `64fad61..b6afeb1`. Unchanged planned items retain round 1's evidence. This verdict covers Phase 2 at the recorded head only.

### Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

### Review Notes

- **Bookkeeping in diff**: `context/changes/finder-glm-5-3/change.md`, `context/changes/finder-glm-5-3/plan-brief.md`, `context/changes/finder-glm-5-3/plan.md`, `context/changes/finder-glm-5-3/reviews/impl-review-phase-2-64fad61.md`.
- **F1 verified**: `output-repair.ts:81` rejects through `startsWithInlineReasoning` (`/^\s*<think/iu`, no word boundary), while `:89` keeps broad `containsInlineReasoning` (`/<think/iu`) for redaction. `reviewer.ts:406` uses the leading check before transcript/parsing; `cli.ts:211` redacts any rejected text carrying the tag. Tests cover leading `<thinking>`, accepted quotes in gathering/finalization/repair, published quoted reviews, and redacted unparsable quoted sentinels (`output-repair.test.ts:204`, `reviewer.test.ts:480`, `cli.test.ts:1097`). This is the owner's modified decision, not the original broad rejection.
- **F2 verified**: `FinderOutputError` blanks inline-reasoning text and retains its original `chars` (`output-repair.ts:162`); CLI recognizes the reason even with empty text and prints that count (`cli.ts:211`). Tests assert sentinel-free serialized error and the original count (`output-repair.test.ts:177`, `cli.test.ts:1074`). Other reasons retain their text, as decided; broad CLI redaction still applies.
- **F3 verified**: the loop's additional `stopWhen` predicate stops after the first leading-tag or length step (`reviewer.ts:335`), then the existing post-loop guard rejects it before finalization. The real reviewer test with an inline-reasoning tool call sends exactly one request and reports step 1 (`reviewer.test.ts:466`).
- **F4 verified**: the added real CLI/pipeline/reviewer/fetch-observer test injects HTTP 502 in attempt 1's finalization, retains its two completed step records, and labels attempt 2's steps and finalization with their own reported fields (`cli.test.ts:965`). The failed HTTP request yields no completed-step record, as the decision states.
- **F5 verified**: `createReviewer` documents one review at a time per instance, the shared observer attribution risk and one instance per concurrent call (`reviewer.ts:257`); `createResponseObserver` cross-references it (`provider-metadata.ts:92`). The chosen fix is documentation only; concurrent calls on one instance remain unsupported.
- **F6 verified**: `describeFinderStep` supplies `reportedProvider` with the other raw reported fields (`pipeline.ts:444`), and request telemetry uses it (`:582`). CLI resolves routing once and passes the same object to its configuration line and pipeline (`cli.ts:390`), which forwards it to the reviewer (`pipeline.ts:602`). Tests cover raw-versus-SDK provider, missing metadata, one malformed-env warning and wire/configuration agreement (`pipeline.test.ts:598`, `cli.test.ts:496`).
- **Acceptance 2.7**: `bash .agents/skills/rune-impl-review/scripts/acceptance-state.sh context/changes/finder-glm-5-3/plan.md` exited 0 in the recorded checkout and returned `unverifiable` — `legacy mark (confirmed in b6afeb1): no acceptance revision; no surface change since`. It is pending acceptance, not a finding. The checked mark was neither changed nor treated as current confirmation. Other phases' acceptance is outside this review.
- **Lessons**: 35 of 38 entries apply to impl-review; applicable blocks were read in full. Relevant priors include per-step output-cap failures, raw reported telemetry rather than fallback evidence, informative failure output, live-probe limits and stale-pointer enumeration.
- **Scope guardrails**: judge/implementation-review models and routing, timeouts, token/step/diff caps, and retry classification are unchanged in the incremental diff. No Phase 3 implementation file was edited or reviewed for new findings; `scripts/glm-gate*`, `scripts/promptfoo-*` and `evals/**` remain outside the incremental review. The required package-wide checks still scan their configured scopes at b6afeb1.
- **Mutation check skipped**: none of the app's six failure scenarios in `context/foundation/test-plan.md` § 2 / Risk Response Guidance maps to this code-reviewer diff; Stryker is configured for the root app. No scoped risk gate applies.
- **Evidence**: each verification command's combined stdout/stderr was captured separately, with its exit status recorded immediately, without a pipeline. Logs and exit files remain outside git at `~/.cache/finder-glm-5-3/re-review-phase-2-b6afeb1-2026-10-13.N8idSM/`; no paid model calls were made. Dependencies were installed from both lockfiles in the isolated checkout with Node v24.19.0 / npm 12.0.2.

### Automated verification at b6afeb1

Package commands ran in `packages/code-reviewer`; grep, acceptance and Prettier commands ran at the checkout root.

| Progress | Command                                                                                                         | Exit | Actual output / judgment                                                                             | Captured output      |
| -------- | --------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| 2.1      | `npx vitest run`                                                                                                | 0    | `Test Files 21 passed (21)`; `Tests 766 passed (766)`                                                | `vitest.log`         |
| 2.2      | `npx tsc --noEmit`                                                                                              | 0    | No diagnostics                                                                                       | `typecheck.log`      |
| 2.2      | `npx eslint .`                                                                                                  | 0    | No diagnostics                                                                                       | `eslint.log`         |
| 2.3      | `npx vitest run -t "REASONING-SENTINEL"`                                                                        | 0    | `Test Files 2 passed, 19 skipped`; `Tests 7 passed, 759 skipped`                                     | `sentinel.log`       |
| 2.4      | `git grep -n "enabled: false" packages/code-reviewer/src`                                                       | 1    | Empty output; expected grep no-match status, so the criterion passes                                 | `old-reasoning.log`  |
| 2.5      | `npx prettier --check .`                                                                                        | 0    | `All matched files use Prettier code style!`                                                         | `prettier.log`       |
| 2.6      | `git grep -nE "glm-4\.6\|novita\|must match" -- packages/code-reviewer/src packages/code-reviewer/.env.example` | 0    | 12 hits; all deliberately kept history/fixtures listed in Phase 2 commit 64fad61's message, verified | `stale-pointers.log` |

The stale-pointer matches are `cli.test.ts:688`, `config.ts:21`, `impl-reviewer.ts:18,108`, `output-repair.test.ts:25`, `output-repair.ts:8,16`, `prompts.ts:327` and `provider-routing.test.ts:104,106,121,137`. The two shifted line numbers refer to the same preserved fixture/history, not new pointers; no `must match` hit remains. Matches were judged against the Phase 2 commit's explicit retained-hit list, not treated as an empty-grep requirement.
