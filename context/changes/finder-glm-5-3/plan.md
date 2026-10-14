# finder-glm-5-3 Implementation Plan

## Overview

Port the two-stage finder (without the verifier) and its finder-specific routing from `feat/finder-verification` to
master. Configure it for `z-ai/glm-5.3` at `reasoning: {enabled: true, effort: "low"}`, routed to Z.AI, Fireworks
and Together only. Measure it under a sealed gate built from the owner's decisions of 2026-10-11 (`change.md`
items 1–7). If and only if the gate admits it, remove the `false &&` line from `.github/workflows/review.yml` and
run G5, the real `AI Code Review` workflow, on this change's own PR. That restores AI review, which has been off
since 2026-10-04 (R11).

## Current State Analysis

- **Master's finder is the single-stage one.** It is a `ToolLoopAgent` with `Output.object`, so the SDK sends
  `response_format` (`packages/code-reviewer/src/reviewer.ts:169`, `output-repair.ts:228-253`). The default model is
  `z-ai/glm-4.6` (`config.ts:14`). Routing is the global `{require_parameters: true}` (`config.ts:105`). No reasoning
  setting exists. Screening pass 1 showed this path cannot parse glm-5.3's answer.
- **AI review is disabled** by `false &&` at `.github/workflows/review.yml:28-29`. The comment above it (`:23-27`)
  names "the change that deploys a finder which passes those gates" as the one that removes it.
- **Repository variable `OPENROUTER_REVIEW_MODEL = z-ai/glm-4.6`** is still set (`gh variable list`, 2026-10-11).
  It overrides any code default (`config.ts:134-145`).
- **The two-stage finder lives on `feat/finder-verification` and is separable from the verifier.**
  `2e2ae19`, `802a1e0`, `15b3f71`, `e5be9ff` and `b3a4a38`, restricted to `packages/code-reviewer`, apply cleanly to
  master in sequence; the test count goes from 608 to 699. Details are in `research.md` § 2 and the delegate notes
  below.
- **Gaps against the owner's decisions, measured on `b3a4a38`:**
  - A stage-1 step ending `finish=length` fails nothing; its partial text enters the transcript. Finalization and
    repair check `length` only after a failed parse (`reviewer.ts:359-390` @15b3f71).
  - The served model id, the served provider and reasoning tokens are not in `review.json`. The provider appears
    only on the CLI stderr step line (`cli.ts:114` @b3a4a38).
  - Reasoning text cannot reach the transcript, parser, logs, `review.json` or `comment.md`, because code reads only
    `.text`, which the SDK keeps separate from reasoning parts (`ai@7.0.52` dist `:4403-4415`). The exception is an
    upstream that puts reasoning inline in `content` (for example `<think>…</think>`). Nothing guards that today.
- **No existing harness fits.**
  - `finder-gate.mjs` (`29b15b8`) skips the judge, feeds a raw diff and fails every reasoning request under A3.
  - `sonnet-gate.mjs` (`feat/finder-sonnet-effort`) does not load against the two-stage finder: it imports the
    removed `tolerantReviewOutput`, and seven other breaks are listed in the delegate report.
- **The frozen inputs are intact and verified (2026-10-11):**
  - `~/.cache/finder-sonnet-gate/{247,269}/{pr.diff,rules.md,meta.json}`;
  - worktrees `wt-247` at `dec09f8` and `wt-269` at `fca2778`, both clean;
  - `pr.diff` sha256: #247 `21973af3…5dc2e1`, #269 `1e4ec088…7e550f`; rules `34d5fcac…b48f`.
- **OpenRouter credit:** $7.40 remaining (2026-10-11T18:07:46Z).
- **Baseline at planning** (`packages/code-reviewer`):
  - `vitest run`: 608 tests pass; `tsc --noEmit` exits 0; `eslint .` exits 0.
  - Root `prettier --check .` exits 1, solely because of the 9 raw files under `screening/`.

### Carried from predecessor

none — no Predecessor line

The related archives (`finder-serialization-outage`, `finder-model-swap`, `finder-verification`, `finder-sonnet`,
`finder-sonnet-effort`, `finder-verifier-frozen`, `finder-verifier-frozen-sonnet`) are summarised in `research.md` §
Historical Context. Two of their open follow-ups land here:

- **Model-swap T2** (log stage-1 text): superseded. Owner decision 2 keeps model text out of logs, and the per-request
  telemetry of Phase 2 traces an empty result to its request instead.
- **Model-swap T1** (series summary only on stdout): resolved. The Phase 3 runner writes every attempt and every stop
  to the JSONL.

## Definitions

| Term                 | Decided meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Origin                                                                                | On degenerate data                                                                                                                                                                                                                                                                                              | Verified by                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| finder request       | One OpenRouter call made by the finder: a stage-1 loop step, the finalization, or the format repair. The judge and impl-review are not finder requests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | user (decision 2: "throughout the finder")                                            | A run with no source root has no stage 1: finalization (+ repair) only                                                                                                                                                                                                                                          | wire test 2.1                  |
| reasoning shape      | Every finder request carries exactly `reasoning: {enabled: true, effort: "low"}` and no `extraBody.reasoning`; judge and impl-review requests carry no `reasoning`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | user (decision 2)                                                                     | Repair request included                                                                                                                                                                                                                                                                                         | wire test 2.1                  |
| reasoning text       | Reasoning returned by the provider, either as `reasoning` / `reasoning_details` or inline in `content` inside `<think>…</think>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | user (decision 2) + plan                                                              | A leading inline `<think` fails the attempt (assumption A2); reasoning parts are never read                                                                                                                                                                                                                     | tests 2.3, 2.4                 |
| truncation           | Any finder request ending `finishReason === "length"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | user (decision 2)                                                                     | Fails the attempt with `FinderOutputError`, which is never retried, even if the text would parse                                                                                                                                                                                                                | tests 2.2                      |
| attempt / run        | One invocation of the production CLI (`npm run review`) on one input, including its single `withOneRetry`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | product (`pipeline.ts:574-577`)                                                       | A retry inside the run is the same run; its cost counts                                                                                                                                                                                                                                                         | runner test 3.1                |
| valid run            | CLI exit 0, `review.json` carries findings and a judge verdict; every finder request has a **provider-reported** listed provider and a **provider-reported** accepted model; no truncation, no inline reasoning, no timeout after the retry. A technical judge failure (no completed verdict) makes the run **invalid**. A completed `verdict: "failed"` does not invalidate the run; all other validity and hand-read criteria still apply                                                                                                                                                                                                                                                           | user (decision 6, clarified by review F1) + product                                   | A wrong, missing or fallback-only provider or model = invalid, never "measurement error". An invalid run may have no `review.json`; it is still recorded (§ Phase 3 runner)                                                                                                                                     | runner test 3.1                |
| auth/credit stop     | **Confirmed** = the CLI's `api error: status=<n>` line, from the typed APICallError status (cause chain included), shows 401 or 402; for a G3 row, the finder error's typed status recorded by the adapter. A confirmed OpenRouter HTTP 401 or 402 stops further paid steps immediately as INCOMPLETE (auth/credit). The attempt remains recorded, and any incurred cost counts toward the spend budget. It does not consume a G2, #247 or G1 sample. No automatic replacement is allowed; resumption requires an explicit owner decision under a dated amendment recorded before further spending. Timeouts, truncation, parse failures and provider/model mismatches keep the invalid-run treatment | user (decision of 2026-10-14)                                                         | OpenRouter auth/credit text without a status line is **suspected**: an ordinary invalid run that stays unsettled, never confirmed. `OPENROUTER_API_KEY is missing` is a local configuration error. A grader 401/402 is a grader error (re-grade path). A stopped run is not a sample and stays out of m247/m269 | runner tests 3.1, G3 row tests |
| listed providers     | Request `provider: {order: ["z-ai","fireworks","together"], only: [same], allow_fallbacks: true, require_parameters: true}`; served names accepted: `Z.AI`, `Fireworks`, `Together`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | user (decision 4) + docs (2026-10-11)                                                 | `fireworks/fast` also reports `Fireworks` and is indistinguishable; Fireworks' plain endpoint showed `status -2`                                                                                                                                                                                                | routing tests 2.5, G2-01 probe |
| accepted model       | The `model` field **reported in the raw OpenRouter response** is `z-ai/glm-5.3` or a dated canonical form `z-ai/glm-5.3-YYYYMMDD`; never `-flash`, `-flashx`, `-prime`, `:batch`. The SDK's `response.modelId` is not evidence: it substitutes the requested id when the field is absent                                                                                                                                                                                                                                                                                                                                                                                                              | plan (A3, corrected after review)                                                     | Field absent → `model.source = "missing"` → invalid run; G2-01 stops and asks on the first such request                                                                                                                                                                                                         | telemetry test 2.6, G2-01      |
| N                    | The number of **published** findings of one valid run: `review.json` `findings`, after production's within-run `mergeFindings`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | user (decision 1) + product (`pipeline.ts:580`)                                       | No deduplication across runs. N = 0 on #247 passes; N = 0 on #269 fails (no D2)                                                                                                                                                                                                                                 | resolver test 3.3              |
| rejected             | The owner classifies a finding as not identifying a real defect in that PR's diff at its head; **unresolved = rejected**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | user (decision 1)                                                                     | A finding the owner does not classify is rejected                                                                                                                                                                                                                                                               | resolver test 3.3              |
| run passes hand-read | rejected ≤ **ceil(0.05 × N)**; for #269, additionally at least one finding owner-approved as a D2 match                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | user (decision 1)                                                                     | N = 1..20 → at most 1 rejected; N = 21..40 → 2                                                                                                                                                                                                                                                                  | resolver test 3.3              |
| D2 match             | A finding cites `bread-spike.ts` within `localInput`'s upload path or `main`'s cleanup **and** claims the uploaded file is not deleted (or leaks) on the missing-URL exit. The agent proposes; the owner approves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | product (`finder-sonnet/gate.md:149-153`)                                             | Cleanup only in `finally` is not a match (`finder-model-swap/hand-read-269.md:96-128`)                                                                                                                                                                                                                          | sheet flags, owner             |
| monthly cost         | **53 × m247 + 8 × m269 + 13 × I ≤ $10.00**. m247 / m269 = mean settled cost per executed run (valid and invalid) of finder + judge, retries included. I = $0.199620 (impl-review, run 31735830016); after G5, I = mean of $0.199620 and G5's impl-review cost **only when G5's impl-review ran**; when G5's verdict skipped it, I stays $0.199620 and the skip is recorded. Before G5 the projection is provisional; once m247 and m269 are final, early cost rejection uses only **53 × m247 + 8 × m269 + 13 × ($0.199620 / 2) > $10.00**                                                                                                                                                            | user (decision 3, clarified by review F2) + product (`finder-sonnet/gate.md:218-231`) | Equivalent to 53 × m247 + 8 × m269 ≤ $7.404940 with the initial I. 53 × m247 is a lower bound that no later measurement can lower (m269, I ≥ 0)                                                                                                                                                                 | outcome test 3.2               |
| T (spend)            | max(key-counter delta since T0, sum of settled per-step costs). A paid step = one CLI run, one G3 promptfoo batch, or one G3 re-grade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | product (`finder-sonnet/gate.md:243-264`)                                             | The counter lags; settlement re-reads it ≥ 180 s apart. A step without complete cost telemetry is settled from the counter only                                                                                                                                                                                 | runner test 3.1                |
| P vs cap             | **P** is an _estimate_ used only to refuse a start: a paid step starts only if every earlier step is settled and T + P ≤ $3.50. P does **not** bound a step's spend. The **enforced** bounds are: that admission rule at step boundaries, and (optional, owner) an OpenRouter key limit, the only provider-enforced one                                                                                                                                                                                                                                                                                                                                                                               | plan (corrected after review)                                                         | A step that ends above $3.50 ends the series `INCOMPLETE (budget)` and its overshoot is recorded                                                                                                                                                                                                                | runner test 3.1                |
| G5 green             | The `AI Code Review` job concludes `success`, uploads `review.json` + `comment.md`, applies one `ai-cr:*` label, and every G5 criterion of § Phase 7 holds. The verdict may be `passed` or `failed`; the owner reads it before merging                                                                                                                                                                                                                                                                                                                                                                                                                                                                | plan (A4)                                                                             | A technical failure (no output) is not green                                                                                                                                                                                                                                                                    | Phase 7 manual                 |

## Desired End State

**If the gate admits glm-5.3:**

- master runs the two-stage finder with `z-ai/glm-5.3` at `effort: low`, routed only to Z.AI / Fireworks / Together.
- `review.json` records each finder request's provider, model, finish reason and reasoning-token count. It never
  records reasoning text.
- `OPENROUTER_REVIEW_MODEL` is deleted.
- `.github/workflows/review.yml` no longer carries `false &&`, and its comment points to this change's sealed gate.
- G5 has run green on this change's own PR.
- AI review runs on every eligible PR again.

**If it does not admit glm-5.3:**

- The gate outcome, the series and the hand-read are committed in this change folder.
- The PR is closed unmerged, and AI review stays disabled.
- The change is archived with `outcome: not admitted`.

Either way, the raw screening files stay outside git, and the committed record contains no absolute local paths.

### Key Discoveries:

- `transcriptFromSteps` reads only `step.text` plus `getFileContext` calls and results (`reviewer.ts:152-181`
  @15b3f71). Reasoning parts never enter it.
- `FinderOutputError` is not retryable (`retry.ts:32-40` @15b3f71); `TimeoutError` is. A timed-out run can therefore
  take 2 × 300 s.
- `@openrouter/ai-sdk-provider@3.0.0`:
  - exposes `providerMetadata.openrouter.provider` and `usage.completionTokensDetails.reasoningTokens`;
  - maps `response.model` to `step.response.modelId` (dist `:3865`). The `ai` SDK substitutes the requested id when
    `response.model` is absent (`:5617`), and reasoning tokens default to `0`. Hence the fetch observer in Phase 2
    § 6;
  - types `reasoning.effort` without `'max'` (`index.d.ts:388-395`), but `"low"` is in the type;
  - shallow-spreads `extraBody` last (`:3604-3648`), so an `extraBody.reasoning` would override a typed one.
- `@openrouter/ai-sdk-provider` re-sends a step's `reasoning_details` to the next stage-1 request (dist
  `:3157-3207`). That is on the wire only, and it adds input tokens.
- The workflow triggers on `opened, synchronize, reopened, labeled` (`review.yml:14`), **not** `ready_for_review`.
  Marking the PR ready does not start a review; adding `ai-cr:review` does. Pushes to a draft are skipped by the
  `draft == false` guard (`:31`).
- `actions/checkout@v5` with no `ref` checks out the PR merge ref (`review.yml:42-47`), so G5 runs this change's
  code and composite action.
- The reviewed diff excludes `**/*.md`, `**/results/*.json`, `**/reviews/*.md` and `**/ground-truth/*`
  (`review.yml:243-250`). `5d72458` adds `**/*.jsonl`.
- Cost estimates:
  - #269 run (finder + judge): ≈ $0.14–0.20; worst case ≈ $0.38.
  - #247 run: ≈ $0.06–0.11.
  - Measurement series: ≈ $2.1–2.7.
  - G5: ≈ $0.45–0.95.
  - Monthly projection: ≈ $6.7 at m247 $0.06 / m269 $0.13. It fails once m247 > $0.111 at m269 $0.19.
  - Arithmetic: delegate report, summarised in `research.md` § 6 and § "What the screening measured".

## What We're NOT Doing

- Porting or merging the verifier (`2c4ae34` and later, `excerpts.ts`, `verifier.ts`) or its gate tooling.
- Porting `finder-gate.mjs` / `finder-gate-core.mjs` or `sonnet-gate.mjs`. A new thin runner replaces both (A1).
- Porting `scripts/finder-wire-dump.mjs` (`6e37867`, `271bee2`) or any `context/` path from the source branches.
- Sending `reasoning.exclude: true`, or any reasoning body other than the one the owner decided.
- A separate reasoning-token cap. The 16,384 per-request output cap stays, and reasoning counts against it.
- Changing the judge or impl-review models, their routing, or the 300 s timeouts.
- Changing `MAX_OUTPUT_TOKENS`, `REVIEW_FINDER_MAX_STEPS` (5) or the diff cap.
- Re-deriving the 53 / 8 / 13 size weights. AI review was off since 2026-10-04, so no newer window exists.
- Committing raw screening artifacts, console logs, or anything carrying absolute local paths.
- A promptfoo matrix beyond G3's 12 rows, or more live probes than G5.

## Implementation Approach

Seven phases.

- **Phases 1–3 are free and local.** Port, configure, and build the measurement tooling, each with hermetic tests.
- **Phase 4 is the owner's approval of the pre-registration**, followed by its seal (hash, push, tag). Nothing paid
  runs before it.
- **Phase 5 is the paid series.** It runs at the sealed commit in a fixed order and stops on the first decisive
  failure.
- **Phase 6 is the hand-read and the outcome.**
- **Phase 7 runs only on `ADMITTED (pending G5)`.** It touches no manifest file, so G5 measures exactly the sealed
  code. It flips the workflow, corrects the stale pointers outside the manifest, and runs G5.

**Assumptions made without asking.** Each one is written into the pre-registration, so the owner sees and can
overturn it at the Phase 4 approval.

- **A1. Harness.** A new thin runner, `packages/code-reviewer/scripts/glm-gate.mjs`, runs the production CLI exactly
  as `action.yml` does. It adapts the proven counter / settlement / series pieces from `sonnet-gate.mjs` without
  importing it. G3 runs through promptfoo, with an amended port of `promptfoo-gate-rows.mjs`
  (`29b15b8`) and `promptfoo-regrade-config.mjs`. Reason: it measures the production path, judge included, at about
  a quarter of the porting cost of the alternatives (delegate report § 3).
- **A2. Inline reasoning.** A finder response whose text **opens** with `<think` (case-insensitive, after optional
  whitespace) fails the attempt with `FinderOutputError` (reason `inline-reasoning`). A `<think` further in is quoted
  code, not reasoning, and is used. Redaction is separate and broader: a rejected-output log line whose text carries
  `<think` **anywhere** prints only `reason=inline-reasoning` and the character count, never the text. _Amended
  2026-10-13 by owner decision on Phase 2 review F1: the original "contains `<think`" would fail correct reviews of
  this package, G5's own PR included._ This is fail-closed and keeps reasoning out of parsing and logs. The screening saw
  no such response.
- **A3. Accepted model ids** are as in § Definitions, judged only on values the provider reported in the raw
  response. SDK fallbacks (the requested model id substituted for a missing `model`, a `0` substituted for missing
  reasoning tokens) are never evidence. Telemetry marks every value `reported` or `missing`. The G2-01 probe stops
  the series if any finder request lacks a reported model or provider.
- **A4. G5 green** is as in § Definitions. The verdict label may be either value. Because a `failed` verdict skips the
  impl-review, G5 requires an impl-review cost only when that pass ran (§ Phase 7).
- **A5. #247 reliability.** Both #247 runs must be valid, as in `finder-sonnet`'s "every run valid". An invalid
  #247 run fails the gate as `FAIL (reliability #247)`.
- **A6. Early cost stop, on a bound that cannot decrease.** After the two #247 runs, m247 is final. The series stops
  before G1 as `FAIL (cost)` only if **53 × m247 > $10.00**, i.e. m247 > $0.188679. Neither m269 nor I is included,
  because I can still fall when G5's impl-review cost is averaged in. Below that bound the series continues and the
  agreed formula is applied unchanged after G5. Once m247 and m269 are both final, the only pre-G5 cost rejection
  is **53 × m247 + 8 × m269 + 13 × ($0.199620 / 2) > $10.00**. This is the lowest possible final projection,
  because a measured G5 impl-review cost is non-negative and a skipped impl-review keeps the larger original I.
  Equality does not reject. The initial projection is recorded as provisional, even when it exceeds $10.00.
- **A7. Truncation and inline reasoning use the existing `FinderOutputError`.** They are not retried. That matches
  "truncation fails the attempt" and `lessons.md` § "A per-step output cap hit…".
- **A8. Routing semantics.** Keep the ported shape: `order` = `only` = the list, `allow_fallbacks: true`. `only` is
  the documented allow-list, so fallback can only reach another listed provider. The served provider of every
  request is checked against the list.

## Critical Implementation Details

**Ordering and sealing.** `gate-manifest.json` lists, by exact path, every file the paid series or G5 executes or
reads as configuration. That covers:

- `packages/code-reviewer/src/**/*.ts` (tests excluded), `package.json`, `package-lock.json`;
- `scripts/glm-gate.mjs`, `scripts/glm-gate-core.mjs`, `scripts/glm-gate-sheet.mjs`, `scripts/promptfoo-gate-rows.mjs`,
  `scripts/promptfoo-regrade-config.mjs`;
- `evals/finder-provider.ts`, `evals/assertions.mjs`, `evals/promptfooconfig.yaml`, `evals/fixtures/**`;
- `packages/code-reviewer/evals/review-result.schema.json` (G3's `is-json` schema);
- `.github/ai-review-rules.md` (the actual project-context input read by G3);
- `.github/actions/ai-review/action.yml`.

The manifest stores each file's sha256, and the runner checks it before every paid step. **Every edit to a manifest
file, comments included, lands before the seal.** That is why the `config.ts` comment and `.env.example` updates
belong to Phase 2, not Phase 7. Phase 7 may change only files outside the manifest: `.github/workflows/review.yml`,
`AGENTS.md`, `packages/code-reviewer/evals/README.md` and this change folder. Its check verifies exactly the manifest
files (`glm-gate.mjs preflight --manifest-only`), not the whole package. A stale pointer found in a manifest file
after the seal is recorded as a follow-up, never edited before G5.

**Commit pointers.** This repo rebase-merges, which rewrites SHAs. Evidence pointers to branch commits are therefore
written after the merge, never before (memory: `rebase-merge-rewrites-shas-twice`). The seal is identified by its
sha256, the GitHub push time and the tag `finder-glm-5-3/seal`, not by a SHA. Every attestation records the date
the check happened.

**Paths.** The runner never writes an absolute path into anything committed. Inputs are named by their recorded
sha256, and per-run console logs stay in `~/.cache/finder-glm-5-3/`.

## Phase 1: Port the two-stage finder and its routing

### Overview

Bring the five finder commits and the JSONL exclusion onto a new branch `feat/finder-glm-5-3`. Behaviour stays as
ported: glm-4.6, reasoning off, Novita default. Also move the raw screening out of the tree and commit its sanitized
record.

### Changes Required:

#### 1. Branch and port

**Files**:

- `packages/code-reviewer/evals/finder-provider.test.ts`
- `packages/code-reviewer/evals/finder-provider.ts`
- `packages/code-reviewer/src/cli.test.ts`
- `packages/code-reviewer/src/cli.ts`
- `packages/code-reviewer/src/config.test.ts`
- `packages/code-reviewer/src/config.ts`
- `packages/code-reviewer/src/openrouter-stub.ts`
- `packages/code-reviewer/src/output-repair.test.ts`
- `packages/code-reviewer/src/output-repair.ts`
- `packages/code-reviewer/src/pipeline.test.ts`
- `packages/code-reviewer/src/pipeline.ts`
- `packages/code-reviewer/src/prompts.ts`
- `packages/code-reviewer/src/provider-attempts.test.ts`
- `packages/code-reviewer/src/provider-metadata.ts`
- `packages/code-reviewer/src/provider-routing.test.ts`
- `packages/code-reviewer/src/retry.test.ts`
- `packages/code-reviewer/src/retry.ts`
- `packages/code-reviewer/src/reviewer.test.ts`
- `packages/code-reviewer/src/reviewer.ts`

**Intent**: Apply `2e2ae19`, `802a1e0`, `15b3f71`, `e5be9ff` and `b3a4a38` with `git cherry-pick -n`, in order,
keeping only `packages/code-reviewer/**`. Commit them as one port commit whose body lists the source SHAs.

**Contract**: The file set and the +91 tests match `b3a4a38` restricted to `packages/code-reviewer`. No file from
`scripts/finder-wire-dump.mjs`, `context/**`, the verifier or the gate tooling is staged.

#### 2. JSONL exclusion

**Files**:

- `.github/workflows/review.yml`

**Intent**: Apply `5d72458`, which adds `':(exclude,glob)**/*.jsonl'` to `EXCLUDES`, so the gate series never enters
a reviewed diff.

**Contract**: `EXCLUDES` gains that one entry. The `false &&` guard and its comment stay untouched in this phase.

#### 3. Screening record

**Files**:

- `context/changes/finder-glm-5-3/screening-config.md`

**File notes**: New. Raw screening/ moves to ~/.cache/finder-glm-5-3/screening/ outside the repository.

**Intent**: Owner decision 5: raw screening stays out of git; the reproducible configuration and the sanitized
metadata are committed.

**Contract**: `screening-config.md` holds:

- the commands;
- the promptfoo eval ids;
- the routing env;
- the three-line wrapper delta (two path relocations and `timeoutMs: 900_000`);
- the fetch patch that sets `reasoning: {enabled: true, effort: "low"}`;
- per-row provider, tokens, reasoning tokens and cost from the wire logs.

All paths are relative to `<repo>`, `<fv-seal>` and `<scratch>`. `glm-screening-results.md` updates its pointer to
"raw artifacts kept outside git; configuration in `screening-config.md`". The `screening/` directory no longer exists
in the tree.

### Success Criteria:

#### Automated Verification:

- Port tests pass: `cd packages/code-reviewer && npx vitest run` (699 tests) — at planning: exit 0 with 608 tests —
  expected 699 after Phase 1
- Typecheck: `cd packages/code-reviewer && npx tsc --noEmit` — at planning: exit 0
- Lint: `cd packages/code-reviewer && npx eslint .` — at planning: exit 0
- Repo formatting: `npx prettier --check .` — at planning: exit 1 — expected until Phase 1 (only `screening/` fails)
- No verifier or wire-dump file came along:
  `git diff --name-only master... | grep -E 'verifier|excerpts|finder-wire-dump|^context/archive'` prints nothing — not
  run: needs Phase 1 output
- No absolute paths in the change folder: `grep -rnE "/home/[a-z]" context/changes/finder-glm-5-3/` prints nothing — at
  planning: exit 0 with matches — expected until Phase 1 (the `screening/` files)
- (paid) Branch push and draft PR open; PR CI `ci`, `integration`, `e2e`, `code-reviewer` green:
  `git push -u origin feat/finder-glm-5-3 && gh pr create --draft` — artifact: PR checks page — not run: external

#### Manual Verification:

- The owner confirms that `screening-config.md` is enough to reproduce the screening and contains nothing they
  consider sensitive — surface: context/changes/finder-glm-5-3/screening-config.md

---

## Phase 2: Configure for glm-5.3 and close the gaps

### Overview

Switch the finder to glm-5.3 with the decided reasoning and routing. Make truncation and inline reasoning fail the
attempt, and record the served provider, model and reasoning tokens per request. All of it is pinned by hermetic
wire-level tests.

### Changes Required:

#### 1. Model and reasoning

**Files**:

- `packages/code-reviewer/src/config.ts`
- `packages/code-reviewer/src/reviewer.ts`
- `packages/code-reviewer/src/reviewer.test.ts`
- `packages/code-reviewer/src/config.test.ts`
- `packages/code-reviewer/.env.example`

**Intent**:

- Set `DEFAULT_MODEL = "z-ai/glm-5.3"`, and rewrite its comment: the repository variable must be unset, not matched.
- Update every other stale pointer **inside the manifest files** now, because they are sealed afterwards:
  - the `config.ts` comments (Novita, Z.AI 429s, `OPENROUTER_REVIEW_MODEL` "must match");
  - `packages/code-reviewer/.env.example`.

  Run `git grep -nE "glm-4\.6|enabled: false|novita|OPENROUTER_REVIEW_MODEL" -- packages/code-reviewer/src
packages/code-reviewer/.env.example`; every hit is either updated or deliberately kept (test fixtures that pin
  history).

- Replace `extraBody: {reasoning: {enabled: false}}` with the typed model setting
  `reasoning: {enabled: true, effort: "low"}` on the one finder `languageModel`, so loop, finalization and repair all
  carry it.

**Contract**:

- The wire test (`reviewer.test.ts:235-242` @15b3f71) asserts that every captured finder body has
  `reasoning` deep-equal to `{enabled: true, effort: "low"}` and no `extraBody`-originated override.
- A judge and an impl-review wire test assert that those bodies carry no `reasoning` key.

#### 2. Truncation

**Files**:

- `packages/code-reviewer/src/reviewer.ts`
- `packages/code-reviewer/src/output-repair.ts`
- `packages/code-reviewer/src/reviewer.test.ts`
- `packages/code-reviewer/src/output-repair.test.ts`
- `packages/code-reviewer/src/retry.test.ts`

**Intent**: Any finder request ending `finishReason === "length"` fails the attempt.

**Contract**:

- **Stage 1:** after the loop, if any step's `finishReason === "length"`, throw `FinderOutputError` (reason `length`,
  step index) before finalization. No finalization request is sent.
- **Finalization and repair:** check `length` **before** parsing.
- **Retries:** `isRetryableError` stays unchanged.
- **Tests:**
  - a stage-1 length step → throw, exactly the stage-1 bodies sent;
  - a finalization length response with parseable JSON → throw, no repair;
  - a repair length response → throw;
  - `withOneRetry` does not retry any of these.

#### 3. Inline reasoning guard

**Files**:

- `packages/code-reviewer/src/reviewer.ts`
- `packages/code-reviewer/src/output-repair.ts`
- `packages/code-reviewer/src/cli.ts`
- `packages/code-reviewer/src/reviewer.test.ts`
- `packages/code-reviewer/src/output-repair.test.ts`
- `packages/code-reviewer/src/cli.test.ts`

**Intent**: A2. Text opening with `<think` (case-insensitive) in any finder response fails the attempt, and no log
line ever prints a rejected text carrying `<think` anywhere (amended 2026-10-13, Phase 2 review F1).

**Contract**:

- `FinderOutputError` gains a reason `inline-reasoning`. Stage-1 note text is checked before it enters the transcript.
- `formatRejectedOutputLine` prints only `reason=inline-reasoning chars=<n>` for any rejected text carrying `<think`
  anywhere, whatever the error's reason.
- A `<think` quoted mid-text (a stage-1 note, a finding or summary in the finalization or the repair) is not rejected
  (tests pin both checks).
- **Mixed-condition tests:** for each request kind (step, finalization, repair), a response containing
  `<think>REASONING-SENTINEL</think>` and ending `finishReason: "length"` throws `FinderOutputError` without retry.
  The sentinel is absent from captured CLI stderr and step summary regardless of which guard classifies the
  failure first; truncation must not bypass inline-reasoning redaction.

#### 4. Reasoning never leaves the wire

**Files**:

- `packages/code-reviewer/src/openrouter-stub.ts`
- `packages/code-reviewer/src/reviewer.test.ts`
- `packages/code-reviewer/src/cli.test.ts`
- `packages/code-reviewer/src/pipeline.test.ts`

**Intent**: Prove decision 2 with a sentinel.

**Contract**:

- The stub can emit `model`, `provider`, `reasoning`, `reasoning_details` (type `reasoning.text`) and
  `completion_tokens_details.reasoning_tokens`.
- One end-to-end test puts the sentinel string `REASONING-SENTINEL-7f3a` in every response's reasoning. It asserts
  that the sentinel is absent from:
  - the finalization request body (the transcript);
  - the parser input;
  - captured CLI stderr;
  - the serialized `review.json`;
  - `comment.md`.

#### 5. Routing

**Files**:

- `packages/code-reviewer/src/config.ts`
- `packages/code-reviewer/src/config.test.ts`
- `packages/code-reviewer/src/provider-routing.test.ts`

**Intent**: Decision 4.

**Contract**:

- `DEFAULT_FINDER_PROVIDERS = ["z-ai", "fireworks", "together"]`; its comment is rewritten (no Novita and no
  Z.AI-429 rationale).
- The finder sends `{order: [...], only: [...], allow_fallbacks: true, require_parameters: true}`.
- Judge and impl-review routing are unchanged (asserted).
- Other `createReviewer` callers (`demo.ts`, `scripts/finder-distribution.mjs`, `scripts/judge-diagnose.mjs`) inherit
  the finder routing. This is accepted and noted in the comment.

#### 6. Per-request telemetry

**Files**:

- `packages/code-reviewer/src/provider-metadata.ts`
- `packages/code-reviewer/src/reviewer.ts`
- `packages/code-reviewer/src/pipeline.ts`
- `packages/code-reviewer/src/schemas.ts`
- `packages/code-reviewer/src/cli.ts`
- `packages/code-reviewer/src/reviewer.test.ts`
- `packages/code-reviewer/src/pipeline.test.ts`
- `packages/code-reviewer/src/cli.test.ts`

**Intent**: The served model and providers must be verifiable in telemetry (decision 4), and the volume of reasoning
must be visible without its text. Only values the provider actually reported count as evidence (A3). The SDK
substitutes the requested model id for a missing `model` (`ai` dist `:5617`), and a `0` for missing reasoning
tokens, so SDK-level values cannot tell "reported" from "absent".

**Contract**:

- **Fetch observer.** The finder's OpenRouter client gets a fetch wrapper (the existing `fetch` injection point that
  `openrouter-stub.ts` uses). For each finder response, it clones the body, parses the JSON in memory, and keeps only
  three fields: top-level `model`, top-level `provider`, and `usage.completion_tokens_details.reasoning_tokens`. It
  never stores, logs or returns anything else from the body, so reasoning stays out. A non-JSON or failed response
  yields `missing` for all three.
- **`FinderTelemetry.requests`:** `Array<{kind: "step" | "finalization" | "repair", attempt: 1 | 2, provider:
{value: string | null, source: "reported" | "missing"}, model: {value: string | null, source: "reported" |
"missing"}, finishReason: string, reasoningTokens: {value: number | null, source: "reported" | "missing"}, cost:
number | null}>`. `value` is `null` exactly when `source` is `missing`, so a missing count is never shown as `0`.
- **CLI step line:** gains `kind=<step|finalization|repair>` before `provider=`, and
  `model=<id|missing> reasoning=<n|missing>` at the end. `kind` is the same value as `requests[].kind` (owner
  decision 2026-10-14): a failed run uploads no `review.json`, and without it the finalization and the repair print
  exactly like a loop step that made no tool call.
- **Configuration line:** a `finder configuration: model=<id> reasoning=low providers=z-ai,fireworks,together` stderr
  line is printed once per run, from the same constants the request uses.
- **Step summary on a provider error (owner decision 2026-10-14):** when the failure's chain carries an
  `APICallError` with a status, `$GITHUB_STEP_SUMMARY` gets only
  `<error name>: api error: status=<n> (provider message only in the job log)`. The error message, which is the
  provider's response body text, stays on the stderr message line only. Found by the stubbed 402 run of Manual
  2.7: the body sentinel reached the summary. Any other SDK error in the chain (an `AISDKError`, same
  `cause`/`lastError` walk) gets only `<error name>: SDK error (message only in the job log)`: in ai@7.0.52
  `TypeValidationError` quotes `Value: <JSON>` and `JSONParseError` quotes `Text: <text>`, so their messages can
  carry model output (owner decision 2026-10-14; the MODEL-SENTINEL tests failed before the fix). A non-SDK
  failure, `FinderOutputError` included, keeps its message, which never quotes the response.
- **PR comment on a failed implementation review (owner decision 2026-10-14):** the same rule as the step summary,
  from one shared function (`publicErrorSummary` in `retry.ts`). The failed block carries `publicError`, the only
  text `comment.md` shows; `error` keeps the full message for the stderr `impl review: FAILED` line and
  `review.json`. Before the fix, a stubbed HTTP 402 on the impl-review request put the provider body into
  `comment.md`. It landed before the Phase 4 seal, because the seal covers every `packages/code-reviewer/src/**/*.ts`.
- **Schema:** retry attempts are included. No text field exists.

### Success Criteria:

#### Automated Verification:

- Unit and wire tests pass: `cd packages/code-reviewer && npx vitest run` — not run: needs Phase 1 output
- Typecheck, lint: `npx tsc --noEmit && npx eslint .` (in `packages/code-reviewer`) — at planning: exit 0
- Sentinel absent everywhere: the test of § 4 by name (`npx vitest run -t "REASONING-SENTINEL"`) — not run: needs
  Phase 2 output
- The old reasoning shape is gone: `git grep -n "enabled: false" packages/code-reviewer/src` prints nothing — not run:
  needs Phase 1 output (on master it already prints nothing; after the port it prints `reviewer.ts`)
- Repo formatting: `npx prettier --check .` — not run: needs Phase 1 output
- Stale pointers inside manifest files resolved before the seal:
  `git grep -nE "glm-4\.6|novita|must match" -- packages/code-reviewer/src packages/code-reviewer/.env.example`
  shows only hits listed as deliberately kept in the Phase 2 commit message — not run: needs Phase 1 output

#### Manual Verification:

- The owner reads the new `finder configuration:` line and one step line from a stubbed CLI run, and agrees that they
  show model, provider and reasoning volume without any model text — surface: packages/code-reviewer/src/config.ts, packages/code-reviewer/src/reviewer.ts, packages/code-reviewer/src/cli.ts

---

## Phase 3: Build the measurement tooling

### Overview

A thin runner over the production CLI for G2, #247 and G1. A G3 row checker for the promptfoo rows. A hand-read sheet
generator, a resolver, and the automatic outcome. Everything is hermetic-tested with the stub before any paid call
exists.

### Changes Required:

#### 1. Runner

**Files**:

- `packages/code-reviewer/scripts/glm-gate.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.mjs`
- `packages/code-reviewer/scripts/glm-gate-core.test.mjs`

**File notes**: New runner and pure core, with hermetic tests.

**Intent**: Run `npm run review -- --diff-file <d> --out-dir <o> --source-root <wt> --project-context-file <rules>`
with `PR_TITLE` / `PR_BODY` from `meta.json`, exactly as `action.yml` does. Classify each run, enforce the budget, and
keep a series ledger.

**Contract**: Subcommands:

- **`preflight`** (free):
  - reads T0 from `/api/v1/key`;
  - reads glm-5.3 endpoint status for the listed providers;
  - verifies every input sha256 and the manifest hashes, including G3's
    `packages/code-reviewer/evals/review-result.schema.json` and `.github/ai-review-rules.md`;
  - checks that `OPENROUTER_REVIEW_MODEL` and `OPENROUTER_FINDER_PROVIDERS` are unset in the environment;
  - writes a `preflight` JSONL line.
- **Admission, common to every paid step** (`run`, `g3`, `g3 --regrade`):
  - refuses while any earlier step is unsettled;
  - refuses unless T + P ≤ $3.50;
  - refuses at T ≥ $3.00 until `continue` is recorded;
  - checks the manifest;
  - writes a `started` line before spending.

  P is the admission estimate of § Definitions, never a spending bound: 2 × the largest settled cost of that step
  kind so far. First-step P: clean $0.05, pr247 $0.25, pr269 $0.45, g3 $0.60, regrade $0.10.

- **`run --case clean|pr247|pr269 --run-id <id>`** writes exactly one terminal record per run. **The two record
  kinds differ in what they carry.**
  - **With an artifact.** CLI exit 0 and `review.json` exists. The record carries:
    - validity and reasons;
    - the published findings;
    - `finderTelemetry.requests`;
    - finder and judge cost, retries, wall time;
    - the `review.json` sha256.

    The runner copies `review.json` to `gate/results/<runId>.review.json`.
    A completed judge `verdict: "failed"` stays in this artifact-bearing branch and does not itself invalidate the
    run; the remaining validity and hand-read criteria still apply.

  - **Without an artifact.** A non-zero exit, a missing or unparsable `review.json`, a timeout, or a technical judge failure (no completed verdict).
    The record is `{valid: false, artifact: null, exitCode, reasons, telemetry}`:
    - `reasons` are classified from the CLI's stderr lines: error class and `FinderOutputError` reason (`length`,
      `inline-reasoning`, `parse`), timeout, judge error, provider or model mismatch. Never any model text.
    - **Auth/credit (owner decision 2026-10-14):** the CLI prints `api error: status=<n>` for every failed
      APICallError (cause chain and `RetryError.lastError` included), metadata only. A 401/402 on that line is a
      **confirmed** auth/credit failure: the run is recorded with `authCredit: "confirmed"`, the series stops
      `INCOMPLETE (auth/credit)` (exit 5), and the run is not a sample. Auth/credit text without that line is
      **suspected** (`authCredit: "suspected"`): an ordinary invalid run, always unsettled. `OPENROUTER_API_KEY is
missing` is a local configuration error with its own reason. Resumption is `continue --for auth-credit
--amendment <ref> --note <text>`, once per stop. G3 applies the same standard to the finder error's typed
      status recorded by `evals/finder-provider.ts`; a grader 401/402 stays a grader error.
    - `telemetry` holds whatever per-request lines were printed, each with its `kind` read off the line's `kind=`
      (owner decision 2026-10-14).
    - `cost: null` until settled.
  - **Settlement.** A run whose cost telemetry is incomplete, which includes every run without an artifact, is
    **unsettled**. The next paid step is refused until `reconcile` has settled it from the counter.
- **`g3 [--regrade]`:** the G3 step. It is a paid step under the same admission rules, so the finder calls, the
  grading and any re-grade all pass the budget checks. It runs exactly:

  ```
  npm run eval -- --env-file .env --no-cache -j 1 --repeat 3
    --filter-providers '^candidate-glm-5\.3$'
    --filter-pattern '^(Finds the material|React 16->19|Cross-hunk contract|Defect-free mechanical rename)'
    --output <export>
  ```

  That is 4 cases × 3 = 12 rows. Then it runs `promptfoo-gate-rows.mjs`. Grading cost is not in the export, so a G3
  step is always settled from the counter. `--regrade` re-grades only the rows the checker marks as grader errors,
  once.

- **`reconcile`:** two counter reads ≥ 180 s apart; tolerance max($0.005, 2 %). It assigns the delta to the unsettled
  step, and records any difference from the telemetry.
- **`continue --note`:** records the owner's go-ahead at the $3.00 pause.
- **`outcome`:** applies § Phase 5's rules to the JSONL plus the G3 verdict.

The JSONL lives at `context/changes/finder-glm-5-3/gate/series.jsonl`, and console logs at
`~/.cache/finder-glm-5-3/runs/`.

#### 2. G3 rows

**Files**:

- `packages/code-reviewer/scripts/promptfoo-gate-rows.mjs`
- `packages/code-reviewer/scripts/promptfoo-gate-rows.test.mjs`
- `packages/code-reviewer/scripts/promptfoo-regrade-config.mjs`
- `packages/code-reviewer/evals/promptfooconfig.yaml`
- `packages/code-reviewer/evals/finder-provider.ts`

**File notes**: Port the row checker and re-grade config from commit 29b15b8 and amend them; register the candidate-glm-5.3 provider.

**Intent**: Check the 12 G3 rows.

**Contract**:

- **Removed:** A3's `reasoningLeak` (inverted: a row is checked for the decided reasoning shape and for no inline
  reasoning) and G4.
- **Provider check:** the expected provider becomes the set {Z.AI, Fireworks, Together}.
- **Required metrics:** as `finder-model-swap/gate.md:67-73`.
- **Row count:** ≠ 12 rows, or any row from a case outside the four registered prefixes, is a failed run.
- **Re-grading:** a grader error is re-graded once via the regrade config (A1 of `finder-model-swap`).
- **Exit codes:** 0 pass, 1 fail or not a result, 2 usage.
- **One row = one production pass (owner decision 2026-10-13):** `finder-provider.ts` wraps the review in
  `withOneRetry`, as production does, and records each retry; `FinderOutputError` is still never retried.
- **Reasoning-shape evidence (owner decision 2026-10-13):** the adapter captures only the `reasoning` key of every
  outgoing finder request body on the wire; a row passes the shape check only when there is at least one and each
  deep-equals `{enabled: true, effort: "low"}`.
- **Accepted model (owner decision 2026-10-13):** a row whose finder requests include one without a
  **provider-reported** accepted model (§ Definitions) fails on its own, like a provider mismatch.

#### 3. Hand-read sheet and resolver

**Files**:

- `packages/code-reviewer/scripts/glm-gate-sheet.mjs`
- `packages/code-reviewer/scripts/glm-gate-sheet.test.mjs`

**File notes**: New sheet generator and resolver, with hermetic tests.

**Intent**: Decision 1: every finding of every valid #247 and #269 run is classified, with no cross-run
deduplication.

**Contract**:

- **`sheet`** writes `hand-read-247.md` and `hand-read-269.md`: one row per published finding, with id
  `<runId>#F<k>`, severity, category, `file:start-end`, description and suggestion verbatim, the review.json sha256,
  and an empty `verdict` cell. #269 rows citing `bread-spike.ts` are pre-flagged `D2?`. The sheet also records the
  sha256 of itself as generated.
- **`resolve`** reads the owner's verdicts (`accept`, `reject`, `D2`; blank = unresolved = rejected) and computes the
  per-run pass per § Definitions.

#### 4. Cost projection

**Files**:

- `packages/code-reviewer/scripts/glm-gate-core.mjs`

**Intent**: Decision 3.

**Contract**: `projectMonthly({m247, m269, I})` returns 53·m247 + 8·m269 + 13·I with every term reported. It is
tested against the sonnet-effort record (`low`: $6.628083). Before G5, `outcome` reports both the provisional
projection with the initial I and the lower bound with I = $0.099810. Once both run means are final, it may return
`FAIL (cost)` only if that lower bound exceeds $10.00. Otherwise cost remains provisional until Phase 7 measures G5
and applies the agreed final formula. The earlier A6 stop after #247 stays unchanged.

### Success Criteria:

#### Automated Verification:

- Hermetic tooling tests pass: `cd packages/code-reviewer && npx vitest run scripts/` — not run: needs Phase 3 output
- Stubbed dry run of one case end to end, with the runner pointed at the stub and no key:
  `node scripts/glm-gate.mjs run --case clean --run-id dry-1 --dry-run` — not run: needs Phase 3 output
- Projection reproduces the sonnet-effort record: covered by `glm-gate-core.test.mjs` — not run: needs Phase 3 output
- Typecheck, lint, format: `npx tsc --noEmit && npx eslint .` and root `npx prettier --check .` — not run: needs
  Phase 3 output

#### Manual Verification:

- The owner reviews the sheet format on the dry-run output and accepts it as the instrument for their hand-read — surface: packages/code-reviewer/scripts/glm-gate-sheet.mjs, packages/code-reviewer/scripts/glm-gate-sheet.test.mjs

---

## Phase 4: Pre-registration and seal

### Overview

Write the gate as a pre-registration from decisions 1–7 and A1–A8. Get the owner's approval, then seal it. No paid
call happens before the seal.

### Changes Required:

#### 1. Pre-registration

**Files**:

- `context/changes/finder-glm-5-3/gate.md`
- `context/changes/finder-glm-5-3/gate-manifest.json`

**File notes**: New pre-registration and manifest.

**Intent**: Freeze what will be measured, what passes, the order, the stop rules and the budget, before seeing any
result.

**Contract**: `## Pre-registration` … `_End of Pre-registration._` contains:

- **Gates:**
  - G2: `clean-change` × 5, tool-enabled, **5/5** valid with `findings: []`;
  - G3: 12 rows (the four registered cases × 3), 3/3 on each required metric;
  - #247 × 2, both valid (A5);
  - G1: #269 × 10, **≥ 9/10** valid;
  - hand-read per valid run (§ Definitions);
  - monthly cost **≤ $10.00**, decided finally after G5; before G5 the initial projection is provisional, and
    early rejection is allowed only by A6 or, once both run means are final, the lower bound
    **53 × m247 + 8 × m269 + 13 × ($0.199620 / 2) > $10.00**;
  - G5 (Phase 7).
- **Run order:**
  1. G2-01 alone, as the probe. It must show: reasoning shape logged, every request served by a listed provider and
     an accepted model (both **reported**, A3), reasoning tokens reported, cost present, no inline reasoning.
     Otherwise stop and ask.
  2. G2-02..05.
  3. G3.
  4. #247 × 2, then the A6 check (53 × m247 > $10.00 only).
  5. G1.
- **Stops:**
  - The first decisive failure ends the series as `FAIL (<gate>)`.
  - Pause at T ≥ $3.00 (reconcile, then owner `continue`); hard stop at $3.50, enforced at step boundaries by
    admission (§ Definitions, "P vs cap").
  - Exhaustion ends the series as `INCOMPLETE (budget)`.
  - **Auth/credit (owner decision 2026-10-14), pre-registered verbatim:** "A confirmed OpenRouter HTTP 401 or 402 stops further paid steps immediately as INCOMPLETE (auth/credit). The attempt remains recorded, and any incurred cost counts toward the spend budget. It does not consume a G2, #247 or G1 sample. No automatic replacement is allowed; resumption requires an explicit owner decision under a dated amendment recorded before further spending." Confirmed and
    suspected are as in § Definitions, "auth/credit stop". Timeouts, truncation, parse failures and provider/model
    mismatches retain their existing invalid-run treatment.
  - G5 reserve $1.00; total $4.50.
- **Verdicts:** `ADMITTED` only if every gate passes and G5 is green. Otherwise `NOT ADMITTED (<first failed
gate>)`.
- **Included assumptions:** A1–A8 verbatim.

`gate-manifest.json` lists the sha256 of every sealed file and every input, plus the expected configuration line.
It explicitly includes `packages/code-reviewer/evals/review-result.schema.json` and `.github/ai-review-rules.md`
used by G3. Their hashes are checked before every paid step, including `g3 --regrade`; a mismatch blocks spending.

#### 2. Seal

**Files**:

- `context/changes/finder-glm-5-3/gate.md`

**File notes**: Section: Seal.

**Intent**: The repository's seal convention (`finder-model-swap/gate.md:191-216`, `finder-sonnet/gate.md:282-335`).

**Contract**:

1. Run `npx prettier --check` on `gate.md`.
2. `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum`.
3. Record the UTC time.
4. Commit and push.
5. Record the GitHub push time from `GET /repos/{owner}/{repo}/activity?ref=feat/finder-glm-5-3`.
6. Create the annotated tag `finder-glm-5-3/seal` and push it.

An amendment after the seal carries its own hash and is pushed before the measurement it affects.

### Success Criteria:

#### Automated Verification:

- Pre-registration formatted: `npx prettier --check context/changes/finder-glm-5-3/gate.md` — not run: needs Phase 4
  output
- Manifest matches the tree: `node packages/code-reviewer/scripts/glm-gate.mjs preflight --manifest-only` — not run:
  needs Phase 3 output
- (paid) Seal commit, push and tag `finder-glm-5-3/seal` pushed:
  `git push origin feat/finder-glm-5-3 finder-glm-5-3/seal` — artifact: `gate.md` § Seal — not run: external

#### Manual Verification:

- The owner approves the pre-registration text, including A1–A8, **before** the seal — surface: context/changes/finder-glm-5-3/gate.md, context/changes/finder-glm-5-3/gate-manifest.json
- The owner confirms that the seal does not by itself authorize Phase 5 — surface: context/changes/finder-glm-5-3/gate.md

---

## Phase 5: The paid series

### Overview

Run the sealed series under the owner's authorization, at the sealed commit, in the sealed order.

### Changes Required:

#### 1. Series

**Files**:

- `context/changes/finder-glm-5-3/gate/series.jsonl`
- `context/changes/finder-glm-5-3/gate/results`
- `context/changes/finder-glm-5-3/gate.md`

**File notes**: Generated result files live in the results directory; gate.md section: Results.

**Intent**: Measure. Nothing in a sealed file changes during this phase.

**Contract**:

1. `preflight` (free) records T0 and endpoint status.
2. The owner authorizes the spend.
3. Run G2-01, then evaluate the probe.
4. Run the rest in order, honouring every stop.
5. `reconcile` after the last run.
6. `outcome` writes the automatic outcome into `gate.md` § Results:
   - each gate's verdict;
   - validity per run;
   - m247, m269, the provisional projection and the pre-G5 lower bound;
   - T against the caps.

The initial projection exceeding $10.00 alone never produces `FAIL (cost)`. After the full series, with both means
final, only the pre-G5 lower bound of A6 can fail cost. Otherwise it stays provisional until G5, subject to the
other gates and the spend budget.

### Success Criteria:

#### Automated Verification:

- (paid) Preflight and the series: `node packages/code-reviewer/scripts/glm-gate.mjs preflight`, then `run …` per the
  sealed order — artifact: `context/changes/finder-glm-5-3/gate/series.jsonl` — not run: paid
- (paid) G3 rows, through the runner's budget admission (12 rows: the four registered cases × 3):
  `node packages/code-reviewer/scripts/glm-gate.mjs g3` (and `g3 --regrade` only for grader errors) — artifact:
  `context/changes/finder-glm-5-3/gate/g3-rows.json` — not run: paid
- Automatic outcome recorded: `node packages/code-reviewer/scripts/glm-gate.mjs outcome` — not run: needs Phase 5
  output
- Settled spend within the cap: `node packages/code-reviewer/scripts/glm-gate.mjs reconcile` shows T ≤ $3.50 — not
  run: needs Phase 5 output

#### Manual Verification:

- The owner authorizes the paid series after reading the preflight. Optionally, the owner first sets an OpenRouter
  limit on the key used locally (usage at T0 + $3.50), the only provider-enforced bound
  - Without that limit, the cap is enforced only at step boundaries (§ Definitions, "P vs cap") — surface: context/changes/finder-glm-5-3/gate.md, context/changes/finder-glm-5-3/gate/series.jsonl
- The owner decides at the $3.00 pause, if it is reached — surface: context/changes/finder-glm-5-3/gate/series.jsonl
- The owner confirms the G2-01 probe before G2-02 starts — surface: context/changes/finder-glm-5-3/gate/results, context/changes/finder-glm-5-3/gate/series.jsonl

---

## Phase 6: Hand-read and outcome

### Overview

Produce the sheets, collect the owner's verdicts, compute the per-run results and the projection, and record the
final outcome.

### Changes Required:

#### 1. Hand-read

**Files**:

- `context/changes/finder-glm-5-3/hand-read-247.md`
- `context/changes/finder-glm-5-3/hand-read-269.md`
- `context/changes/finder-glm-5-3/gate.md`

**File notes**: gate.md section: Results › Hand-read.

**Intent**: Decision 1.

**Contract**:

1. `sheet` generates the files.
2. The owner fills every verdict; the agent may propose D2 matches but never classifies.
3. `resolve` computes the per-run pass/fail.
4. The pre-G5 outcome is written: `ADMITTED (pending G5)` or `NOT ADMITTED (<gate>)`, with cost recorded separately
   as provisional. The
   provisional initial projection exceeding $10.00 does not prevent Phase 7. Cost rejects here only when the
   pre-G5 lower bound exceeds $10.00; all other gates and budget limits still apply. This is not final admission.

#### 2. Record

**Files**:

- `context/changes/finder-glm-5-3/change.md`

**File notes**: Section: Notes.

**Intent**: The owner's next decision is recorded there.

**Contract**:

- On `NOT ADMITTED`: close the PR unmerged; Phase 7 does not run; the next step is `/rune-archive`.
- On `ADMITTED (pending G5)`: Phase 7.

### Success Criteria:

#### Automated Verification:

- Sheets generated from the recorded series: `node packages/code-reviewer/scripts/glm-gate-sheet.mjs sheet` — not run:
  needs Phase 5 output
- Per-run results computed: `node packages/code-reviewer/scripts/glm-gate-sheet.mjs resolve` — not run: needs owner
  verdicts

#### Manual Verification:

- The owner classifies every finding in both sheets — surface: context/changes/finder-glm-5-3/hand-read-247.md, context/changes/finder-glm-5-3/hand-read-269.md, context/changes/finder-glm-5-3/gate/results
- The owner approves each D2 match — surface: context/changes/finder-glm-5-3/hand-read-269.md, context/changes/finder-glm-5-3/gate/results
- The owner records the outcome and the next decision in `change.md` — surface: context/changes/finder-glm-5-3/gate.md, context/changes/finder-glm-5-3/hand-read-247.md, context/changes/finder-glm-5-3/hand-read-269.md

---

## Phase 7: Restore AI review and run G5

### Overview

**Runs only when Phase 6 recorded `ADMITTED (pending G5)`.** Remove `false &&`, correct the stale pointers outside the
manifest, then run G5 on this PR through the real workflow. No manifest file changes in this phase.

### Changes Required:

#### 1. Workflow

**Files**:

- `.github/workflows/review.yml`

**Intent**: Decision 1 and R11.

**Contract**:

- Delete only the `false &&` line.
- Rewrite the comment at `:23-27` to say AI review was restored by change `finder-glm-5-3` under its sealed gate
  (`gate.md`, seal tag `finder-glm-5-3/seal`). Name the change id, not a path, because the folder moves on archive.
- `:220` "currently z-ai/glm-4.6" becomes the new state.

#### 2. Stale pointers

**Files**:

- `AGENTS.md`
- `packages/code-reviewer/evals/README.md`

**File notes**: AGENTS.md CI section (line 98) and finder description; only files outside the manifest.

**Intent**: `lessons.md` § "Writing a fact into its canonical home…". Grep the **old** claims and fix every hit in the
same commit. Manifest files were already corrected in Phase 2, before the seal.

**Contract**:

- Run `git grep -nE "glm-4\.6|TEMPORARILY OFF|schema mismatches re-roll|enabled: false|OPENROUTER_REVIEW_MODEL|novita"`
  over `AGENTS.md`, `.github/`, `packages/code-reviewer/` (archives excluded).
- **A hit outside the manifest** is updated, or recorded in `gate.md` § G5 as deliberately historical (for example a
  dated evaluation outcome in `evals/README.md`).
- **A hit inside the manifest** is not edited. It is recorded as a follow-up.
- `AGENTS.md` describes the two-stage finder, glm-5.3 at `effort: low`, the finder-only routing, and that the finder
  is never retried on `FinderOutputError` (one format repair instead).

#### 3. G5

**Files**:

- `context/changes/finder-glm-5-3/gate.md`

**File notes**: Section: G5.

**Intent**: The live probe that offline evidence cannot replace (`lessons.md` § "An offline eval proves…").

**Contract**:

1. The owner deletes `OPENROUTER_REVIEW_MODEL` in the GitHub UI; `gh variable list` confirms it is absent.
2. Check that T + $1.00 ≤ $4.50, otherwise `not measured (budget)`.
3. Every push is made while the PR is a draft.
4. The owner marks the PR ready and adds `ai-cr:review`.

**G5** is the first `AI Code Review` run after that. It passes when:

- G5 green holds;
- the manifest files at the G5 head match the seal (`preflight --manifest-only`);
- every finder request in `review.json` `finderTelemetry.requests` has a **reported** provider in {Z.AI, Fireworks,
  Together} and a **reported** accepted model;
- `models.finder = z-ai/glm-5.3`;
- finder and judge costs are present;
- impl-review cost is present **if the impl-review ran**. If the verdict was `failed`, `implReview.skipped` is present
  instead: the skip is recorded and I stays $0.199620;
- the run's spend is in the ledger.

Then I is recomputed, only when the impl-review ran, and the projection is applied with the agreed formula. A
projection > $10.00 → `NOT ADMITTED (cost)`. A G5 that is not green or not measured blocks the merge until the owner
decides. Every later push to the ready PR is another paid review and is ledgered.

### Success Criteria:

#### Automated Verification:

- No `false &&` guard remains: `git grep -nE '^\s+false &&$' .github/workflows/review.yml` prints nothing — at
  planning: exit 0 with one match (`:29`) — expected until Phase 7
- Stale-pointer grep clean or every hit justified in `gate.md`:
  `git grep -nE "TEMPORARILY OFF|schema mismatches re-roll" -- AGENTS.md .github packages/code-reviewer` prints
  nothing — at planning: exit 0 with matches — expected until Phase 7
- Sealed files unchanged since the seal, checked file by file against the manifest:
  `node packages/code-reviewer/scripts/glm-gate.mjs preflight --manifest-only` — not run: needs Phase 4 output
- Variable deleted: `gh variable list` shows no `OPENROUTER_REVIEW_MODEL` — not run: external
- (paid) G5, the first `AI Code Review` run after `ai-cr:review` — artifact: the run's `ai-review-output`
  (`review.json`, `comment.md`), recorded in `gate.md` § G5 — not run: paid
- PR CI `ci`, `integration`, `e2e`, `code-reviewer` green — not run: external

#### Manual Verification:

- The owner deletes `OPENROUTER_REVIEW_MODEL`, marks the PR ready and adds `ai-cr:review` — surface: .github/workflows/review.yml, context/changes/finder-glm-5-3/gate.md
- The owner reads G5's comment and verdict, and decides whether to merge — surface: context/changes/finder-glm-5-3/gate.md
- After the merge, evidence pointers to commits are written with the master SHAs — surface: context/changes/finder-glm-5-3/gate.md

---

## Testing Strategy

### Unit Tests:

- **Wire shape:**
  - reasoning on every finder request (loop, finalization, repair) and on no judge or impl-review request;
  - routing object for the finder only.
- **Truncation:** at each of the three finder request kinds, fails without retry; parseable text does not rescue a
  `length` finalization.
- **Inline reasoning:** a leading `<think>` in a stage-1 note, in the finalization and in the repair each fail; the
  log shows no text. A `<think` quoted mid-text at each kind is used, and a rejected text quoting it is still
  redacted.
- **Inline reasoning with truncation:** step, finalization and repair each have a mixed response containing
  `<think>REASONING-SENTINEL</think>` and `finishReason: "length"`; it fails without retry, and the sentinel never
  reaches stderr or step summary regardless of guard ordering.
- **Sentinel:** reasoning text never reaches the transcript, parser, stderr, `review.json` or `comment.md`.
- **Telemetry:**
  - provider, model, finish and reasoning tokens per request, retries included;
  - a stub response without `model` gives `model.source = "missing"` (not the requested id) and an invalid run;
  - a stub response without `reasoning_tokens` gives `{value: null, source: "missing"}`, never `0`;
  - the fetch observer never retains reasoning (sentinel).
- **Runner:**
  - validity classification for each reason (technical judge failure, wrong or missing provider, wrong or missing model,
    length, inline reasoning, timeout after retry);
  - a completed judge `verdict: "failed"` with exit 0 and an artifact is valid when all other validity criteria
    pass and is included in hand-read;
  - a technical judge failure with no completed verdict is invalid and excluded from hand-read;
  - auth/credit (owner decision 2026-10-14): a CLI status line 401 or 402 is confirmed, stops the series and
    consumes no G2, #247 or G1 sample; 429 and a non-API error are not; a wrapped APICallError is found through its
    cause chain; text without a status line is only suspected (negative control: "can only afford 401 tokens");
    a finder 401/402 on a G3 row stops the series, a grader 401 stays a grader error, and "401" in error text
    without a typed status is not confirmed;
  - **a run with no `review.json`** writes an `artifact: null` record with its reasons, stays unsettled, and blocks
    the next step until `reconcile`;
  - budget admission (T + P) for `run`, `g3` and `g3 --regrade` alike, the $3.00 pause, the $3.50 stop;
  - changing `packages/code-reviewer/evals/review-result.schema.json` or `.github/ai-review-rules.md` independently
    fails preflight and blocks every paid-step kind before invocation (no model or grader calls);
  - reconcile tolerance;
  - A6 stops only when 53 × m247 > $10.00, and continues at m247 = $0.188 even when 53 × m247 + 13 × I > $10.00;
  - projection against the sonnet-effort record;
  - m247 = $0.118 and m269 = $0.155: the initial $10.08906 projection stays provisional (lower bound $8.79153),
    and a G5 impl-review cost of $0.04 produces a final $9.05153 projection that passes cost;
  - a pre-G5 lower bound exactly $10.00 does not reject; above $10.00 rejects once both means are final;
  - a skipped G5 impl-review retains I = $0.199620 and rejects the same example at the final cost gate;
  - the G3 command selects exactly the four registered cases (the filter pattern is asserted in a test).
- **Resolver:**
  - ceil(0.05 × N) at N = 0, 1, 20, 21;
  - an unresolved finding counts as rejected;
  - #269 without D2 fails;
  - #247 with N = 0 passes.
- **G3 rows:** a missing row, an 18-row export (six cases) rejected, a wrong provider, a missing metric, a grader
  error re-graded.

### Integration Tests:

- A stubbed end-to-end `glm-gate.mjs run --dry-run` on the clean fixture, through the real CLI.

### Manual Testing Steps:

1. Read one stubbed CLI run's stderr and confirm that no model text appears.
2. Read the dry-run hand-read sheet and confirm it is classifiable.
3. G5 on the real workflow (Phase 7).

## Performance Considerations

- Re-sent `reasoning_details` raise stage-1 input tokens. They are measured, not optimised, because they count in the
  cost gate.
- The 300 s timeout has never been exercised by glm-5.3 on #269. G1 measures it: a timeout after the retry is an
  invalid run.

## Migration Notes

- On merge, `OPENROUTER_REVIEW_MODEL` must already be deleted, otherwise glm-4.6 would come back on the single-stage
  path's successor. Phase 7 orders that deletion before G5.
- Rollback: re-add `false &&` (one line). The variable route no longer applies, because it would point the two-stage
  finder at another model without a gate.

## References

- Research: `context/changes/finder-glm-5-3/research.md`
- Screening: `context/changes/finder-glm-5-3/glm-screening-results.md`
- Owner decisions: `context/changes/finder-glm-5-3/change.md` (items 1–7)
- Gate precedents: `context/archive/2026-10-02-finder-model-swap/gate.md`, `context/archive/2026-10-05-finder-sonnet/gate.md`,
  `context/archive/2026-10-06-finder-sonnet-effort/gate.md`
- Two-stage design: `context/archive/2026-09-24-finder-serialization-outage/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append
> ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Port the two-stage finder and its routing

#### Automated

- [x] 1.1 Port tests pass (699) — 9782f38
- [x] 1.2 Typecheck — 9782f38
- [x] 1.3 Lint — 9782f38
- [x] 1.4 Repo formatting — 9782f38
- [x] 1.5 No verifier or wire-dump file came along — 9782f38
- [x] 1.6 No absolute paths in the change folder — 9782f38
- [x] 1.7 Branch push and draft PR open; PR CI green — 9782f38

#### Manual

- [x] 1.8 Owner confirms screening-config.md is sufficient and non-sensitive — accepted at 4432a70cb499ffd1e9e455bcd79d78dfeac55bd2

### Phase 2: Configure for glm-5.3 and close the gaps

#### Automated

- [x] 2.1 Unit and wire tests pass — 64fad61
- [x] 2.2 Typecheck, lint — 64fad61
- [x] 2.3 Sentinel absent everywhere — 64fad61
- [x] 2.4 The old reasoning shape is gone — 64fad61
- [x] 2.5 Repo formatting — 64fad61
- [x] 2.6 Stale pointers inside manifest files resolved before the seal — 64fad61

#### Manual

- [x] 2.7 Owner reads the configuration and step lines from a stubbed run — accepted at f2ccfddd25b5483cec2ea02237adaf2620eef86d

  Observed through the real CLI, pipeline, reviewer, judge and response observer with stubbed HTTP:

  ```text
  finder configuration: model=z-ai/glm-5.3 reasoning=low providers=z-ai,fireworks,together
  finder step 1: getFileContext src/a.ts (tokens in=10 out=5 total=15) provider=Z.AI finish=tool-calls model=z-ai/glm-5.3 reasoning=41
  ```

  The successful run exited 0 after four stubbed HTTP requests. Configuration appeared once and matched every
  finder request's model, routing and reasoning effort. The step showed the response's model, provider and
  reasoning-token count; neither the model's note nor its reasoning sentinel appeared in the log lines. A separate
  rejected run exited 1 after one request and printed `reason=inline-reasoning chars=44`, preserving the original
  count after F2 blanked the error text. `npx vitest run src/cli.test.ts` passed all 74 tests. No live API calls.

  Re-check after `8cf9194` (2026-10-14), through `npm run review` with a dummy key and a preloaded `fetch` that
  answers the chat endpoint HTTP 402 and refuses every other URL. Body:
  `{"error":{"code":402,"message":"Insufficient credits QX402-BODY-SENTINEL-9d41","metadata":{"hint":"QX402-BODY-SENTINEL-9d41"}}}`.
  Full stderr; exit 1 after one finder request (402 is not retried), no stdout, no `review.json`:

  ```text
  finder configuration: model=z-ai/glm-5.3 reasoning=low providers=z-ai,fireworks,together
  Insufficient credits QX402-BODY-SENTINEL-9d41
  api error: status=402
  ```

  Step summary: `## AI review failed` followed by
  `AI_APICallError: api error: status=402 (provider message only in the job log)`. The configuration line is
  byte-identical to the one above (`cmp`). `api error: status=402` appears once. The sentinel appears only on the
  message line, which existed before `8cf9194`, and nowhere in the step summary or on stdout. Before this fix, the
  same run put the sentinel into the step summary, which received the raw message; the fix landed in the commit that
  records this paragraph (owner decision 2026-10-14, Phase 2 § 6). No live API calls.

  Reopened 2026-10-14: the step line gained `kind=` (owner decision 2026-10-14, Phase 2 § 6 Contract). The lines
  read above were accepted at `20a3127` without it. Observed through the real CLI with the dry-run stub
  (`glm-gate.mjs run --case clean --run-id dry-kind --dry-run`, scratch cache, no key):

  ```text
  finder step 1: no getFileContext call (tokens in=100 out=20 total=120) kind=step provider=Z.AI finish=stop model=z-ai/glm-5.3 reasoning=16
  finder step 2: no getFileContext call (tokens in=100 out=20 total=120) kind=finalization provider=Z.AI finish=stop model=z-ai/glm-5.3 reasoning=16
  ```

  Apart from `kind=`, the two lines are byte-identical. The runner's `parseCliStderr` reads them as
  `kind: "step"` and `kind: "finalization"`. `kind` comes from the code's closed union, never from the response.
  No live API calls.

  Re-check after `eb5ea06` (2026-10-14), which changed the step summary for SDK errors without an HTTP status.
  Three runs of the real CLI (`tsx src/review-pr.ts`) with a dummy key and a preloaded `fetch` that refuses every
  URL except the chat endpoint:
  - The HTTP 402 stub above, same body: exit 1, no stdout, no `review.json`. stderr and the step summary
    (`AI_APICallError: api error: status=402 (provider message only in the job log)`) are identical to the
    `20a3127` re-check. The sentinel is only on the stderr message line.
  - The dry-run stub (`scripts/glm-gate-dry-run-stub.mjs`) with `--source-root`: exit 0. The configuration line and
    both `kind=` step lines above are byte-identical.
  - The new branch: the dry-run stub plus a wrapper that answers each judge request (the one carrying
    `response_format`) with HTTP 200 whose message content is the prose
    `I think this PR looks fine overall. MODEL-SENTINEL-7c2e`, with no JSON object. The SDK raised
    `AI_NoObjectGeneratedError` (no HTTP status). The judge was retried once, then the run exited 1:

    ```text
    finder configuration: model=z-ai/glm-5.3 reasoning=low providers=z-ai,fireworks,together
    retrying judge after AI_NoObjectGeneratedError in 0ms
    No object generated: could not parse the response.
    rejected output (AI_NoObjectGeneratedError, provider=Anthropic, finish=stop, 55 chars): I think this PR looks fine overall. MODEL-SENTINEL-7c2e
    ```

    Step summary: `## AI review failed` followed by
    `AI_NoObjectGeneratedError: SDK error (message only in the job log)`. The sentinel appears only on the
    stderr-only rejected-output line, never in the step summary or on stdout. No `api error:` line.

  No live API calls.

  Limit: a quoting SDK error (TypeValidationError, JSONParseError) is covered only by the three MODEL-SENTINEL tests
  in cli.test.ts, which call runReviewCli itself with a rejecting pipeline; no real-CLI run produced one. Nothing
  between the SDK and the CLI rewraps the error (retry.ts rethrows it unchanged; pipeline.ts does not catch and
  re-throw it), so the untested part is whether a real response raises those classes, not the summary decision.

  Re-check after `f2ccfdd` (2026-10-14), which moved the step-summary decision into `publicErrorSummary`
  (`retry.ts`) and applied it to a failed implementation review in `comment.md`. Five runs of the real CLI
  (`tsx src/review-pr.ts`, dummy key, preloaded `fetch`, the same diff, source root and plan) at both `eb5ea06` and
  `f2ccfdd`:
  - The HTTP 402 stub, the dry-run stub with `--source-root`, and the judge-prose wrapper: stderr, the step summary
    and stdout (output directory normalized) are byte-identical between the two revisions, including the
    configuration line and both `kind=` step lines above.
  - The dry-run stub plus `--plan-file`, with the impl-review request (the only one carrying the plan) answered
    HTTP 402 with the same body: exit 0 at both. `comment.md` differs in one line only: at `eb5ea06`
    `…skipped: Insufficient credits QX402-BODY-SENTINEL-9d41.`, at `f2ccfdd`
    `…skipped: AI_APICallError: api error: status=402 (provider message only in the job log).` The stderr line
    `impl review: FAILED (Insufficient credits QX402-BODY-SENTINEL-9d41) (no usage reported)` is identical at both.
    `review.json` carries `error` (the message) and `publicError` (the summary).
  - The dry-run stub plus `--plan-file`, unwrapped: the impl-review request gets the judge's canned answer, which
    fails its schema; exit 0 at both. `comment.md` again differs in one line only, from
    `No object generated: response did not match schema.` to
    `AI_NoObjectGeneratedError: SDK error (message only in the job log)`.

  No live API calls.

### Phase 3: Build the measurement tooling

#### Automated

- [x] 3.1 Hermetic tooling tests pass — 965ae3d
- [x] 3.2 Stubbed dry run of one case end to end — 965ae3d
- [x] 3.3 Projection reproduces the sonnet-effort record — 965ae3d
- [x] 3.4 Typecheck, lint, format — 965ae3d

#### Manual

- [x] 3.5 Owner accepts the sheet format — accepted at 674fb79d2ecf79553b0e5f83dbd0856f7f2e8d34

### Phase 4: Pre-registration and seal

#### Automated

- [x] 4.1 Pre-registration formatted — f231ff0
- [x] 4.2 Manifest matches the tree — f231ff0
- [x] 4.3 Seal commit, push and tag pushed — f231ff0

#### Manual

- [ ] 4.4 Owner approves the pre-registration including A1–A8
- [ ] 4.5 Owner confirms the seal does not authorize Phase 5

### Phase 5: The paid series

#### Automated

- [ ] 5.1 Preflight and the series
- [ ] 5.2 G3 rows
- [ ] 5.3 Automatic outcome recorded
- [ ] 5.4 Settled spend within the cap

#### Manual

- [ ] 5.5 Owner authorizes the paid series
- [ ] 5.6 Owner decides at the $3.00 pause
- [ ] 5.7 Owner confirms the G2-01 probe

### Phase 6: Hand-read and outcome

#### Automated

- [ ] 6.1 Sheets generated from the recorded series
- [ ] 6.2 Per-run results computed

#### Manual

- [ ] 6.3 Owner classifies every finding
- [ ] 6.4 Owner approves each D2 match
- [ ] 6.5 Owner records the outcome and next decision

### Phase 7: Restore AI review and run G5

#### Automated

- [ ] 7.1 No `false &&` remains
- [ ] 7.2 Stale-pointer grep clean or justified
- [ ] 7.3 Sealed files unchanged since the seal
- [ ] 7.4 Variable deleted
- [ ] 7.5 G5 run recorded
- [ ] 7.6 PR CI green

#### Manual

- [ ] 7.7 Owner deletes the variable, marks ready, adds ai-cr:review
- [ ] 7.8 Owner reads G5 and decides on the merge
- [ ] 7.9 Evidence pointers written with master SHAs after the merge
