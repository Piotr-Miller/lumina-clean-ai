---
date: 2026-10-03T21:17:37Z
researcher: Claude Fable 5.1 (for the owner, Piotr Miller)
git_commit: 573ee33
branch: feat/finder-verification
repository: lumina-clean-ai
topic: "Finder verification: can a verify-before-publish step, fed with code excerpts, bring luna's false-finding rate under the G3 threshold — and what does the pipeline, the gate and the budget need for that?"
tags: [research, codebase, code-reviewer, judge, finder, verification, gate, openrouter]
status: complete
last_updated: 2026-10-03
last_updated_by: Claude Fable 5.1
---

# Research: Finder verification — judge contract, code excerpts, cost, an unseen gate case

**Date**: 2026-10-03T21:17:37Z
**Researcher**: Claude Fable 5.1 (for the owner)
**Git Commit**: 573ee33
**Branch**: feat/finder-verification
**Repository**: lumina-clean-ai

No model was called and nothing was spent. Sources: the code at `573ee33` (which carries the two-stage finder
of `finder-serialization-outage`), the archives of `finder-model-swap` and `finder-serialization-outage`,
OpenRouter's public endpoint listings (read 2026-10-03T21:00:40Z, unauthenticated) and, for §9, the public
typesafe.ai documentation (read 2026-10-03 ~21:11Z). `src/` below means `packages/code-reviewer/src/`.
Lessons: 1 of 37 entries applies to research (`context/foundation/lessons.md:166–171`, "a fixture that fails
to reproduce a live defect is evidence about the fixture"); it shapes §5.

## Research Question

The owner's scope of 2026-10-03 (`change.md` § Owner decision): (1) the judge's contract today and what must
change for it to verify and drop findings while render, review.json, labels and exit code stay put; (2) where the
verifier's code excerpts come from — diff or source root — with limits; (3) the verifier's response shape and the
treatment of "unverifiable"; (4) cost and latency of the main arm (judge verifies) and the control arm (luna
verifies its own findings), with re-read prices; (5) an unseen case for the new gate and criteria against fitting
the verifier to #269; (6) prompt-injection fencing for code reaching the judge; (7) a cost-free backward check —
do luna's 20 #269 findings carry enough `file:line` for a verifier to get the right code; (8) a proposal for a new
cost criterion in place of the old G4. Added on the owner's request during the research: (9) Jev (typesafe.ai) as a
cheap verifier.

## Summary

- **The judge is blind by contract, and the pipeline downstream of it is indifferent to how many findings it
  gets.** `buildJudgeInstructions` says "you never see the code itself" (`src/prompts.ts:116`); the judge
  receives `<findings>` JSON and `<pr-metadata>` only (`src/prompts.ts:131–145`). review.json's `findings` is
  the finder's merged list verbatim (`src/pipeline.ts:594, 615`), the comment renders exactly that list
  (`src/render.ts:222–231`), and the `ai-cr:*` label and the exit code depend on the judge's `verdict` alone
  (`.github/actions/ai-review/action.yml:139–144`, `src/cli.ts:389`). Filtering findings before the judge
  therefore changes nothing structural downstream. **The smaller change is a separate verification call** that
  leaves the judge, its schema and its five test files byte-identical and serves both arms with a model-id
  swap (§1).
- **Excerpts must come from the source root, through the diff-scoped provider the CLI already builds, never
  from the diff text.** CI always passes `--source-root` (`action.yml:97`); the provider's allowlist, symlink
  containment and refusals exist (`src/source-provider.ts:129–173`); the diff has no `@@` parser in the package,
  cuts D20's evidence from its function header across a hunk gap, and its hunk header names the pre-image
  function (§2). Reuse needs one structural fix: refusals are prose and the delivered/refused signal is a
  construction-time callback the pipeline cannot reach (`src/source-provider.ts:87–97`).
- **A cited `file:line` alone would have given the verifier the right code for 1 of 38 findings.** ±10 lines:
  4; ±25: 16; the enclosing function: 9; the whole cited file: 35, but only 15 of those are decidable without a
  fact from another file, a data file, a library or the PR file list. Six citations point at unrelated code.
  A policy of module header + identifier-snapped enclosing function + one-hop same-file callers + cross-file
  identifier resolution serves 10 of 20 rows fully; D1, D15, D17 need Pillow semantics, D3 and D11 a fact from
  another file, D4–D8 the PR file list (§7, `backcheck-269.py`).
- **Cost.** Measured: luna on #269 $0.0048 median / $0.0128 max per attempt, 13 s / 24 s, ~4 findings per
  attempt; fixture rows $0.00018 / $0.00080, 3.4 s / 6.8 s. The judge has one recorded cost point (PR #132:
  3,852 in / 940 out = $0.017104 on sonnet-5) and one latency band (120–300 s+ on 10 findings). Estimated at
  40-line excerpts: **main arm** +$0.006 (4 findings) … +$0.032 (20) per review on a $0.018–0.028 judge call,
  total $0.030–0.065 per attempt; **control arm** +$0.0005–0.0023 per review and +3–8 s. The old G4 ceiling
  ($0.00301653 per fixture row, finder only) is exceeded 4.7× by a sonnet-5 call on zero findings, so the main
  arm fails it by construction while the control arm still fits (§4).
- **Unseen case: PR #240** (S-18 resolution disclosure, 18.7 KB, `src/` React/TS + tests, a different area
  from #269; its live review fell into the finder outage, so no finder output for it exists anywhere). Backup:
  #247 (same class as #269). Six holdout/freeze criteria follow the archived gate's seal and seed procedure (§5).
- **Jev (typesafe.ai)** is real, cheap ($0.042 per M input, output free, 64k context) and returns calibrated
  probabilities or choices — not quotations. It can answer "does the claim follow from this code?" with a
  probability, which is a different construction from the owner's hypothesis; it is not on OpenRouter's chat
  path, so it would be a second provider with its own secret and data flow (§9).
- **Two gate-design points the scope did not ask for but the data forces:** the G3 rate on published findings
  needs a recall floor beside it (a verifier that drops almost everything passes G3; `lessons.md` "an
  intervention can satisfy its own guard"), and the fixture rows never run the judge today, so main-arm
  verification cannot be measured on fixtures without new tooling (§8).

## Detailed Findings

### 1. The judge contract today, and the minimal verify-and-drop change

**Contract.**

- `src/prompts.ts:101–104` (section comment): "It never sees the diff (user constraint) and owns the verdict
  (user decision)". `buildJudgeInstructions` `:114–122` — five sentences: the role with "you never see the code
  itself" (`:116`), the six-criterion `RUBRIC` (`:106–112`), "score ONLY from the provided findings and PR
  metadata … never invent, merge, or re-interpret findings" (`:118`), the `passed`/`failed` verdict guidance
  (`:119`), and the untrusted-data clause for `<findings>` and `<pr-metadata>` (`:120`).
- `buildJudgePrompt` `:131–145`: `fence("findings", JSON.stringify(findings, null, 2))` and
  `fence("pr-metadata", title + diff stats + body)`; `JudgePromptInput` `:124–129`.
- `createJudge` `src/judge.ts:51–95`: tool-less `ToolLoopAgent` on `DEFAULT_JUDGE_MODEL =
"anthropic/claude-sonnet-5"` (`src/config.ts:15`), `usage.include`, provider routing `require_parameters`
  (`judge.ts:7–10`), `maxOutputTokens` 16,384 (`:67`), `tolerantJudgeOutput` repair (`:72`), `maxRetries: 0`
  (`:73–75`), one generation per attempt; `validateJudgeReferences` strips unknown `findingIds`
  (`src/scorecard.ts:38–49`) — the only code-side filtering, and it filters references, never findings.
- Schema `src/schemas.ts:117–125`: `{ scores (six × {score: "1".."10" string enum, justification, findingIds}),
verdict, verdictReason, summary }`; the string enum exists because `.int()/.min()/.max()` emit
  `minimum`/`maximum`, which the provider rejects (`:53–75`); `schemas.test.ts:110–122` pins **no
  `minimum`/`maximum`/`anyOf`** in the emitted judge schema. The repair path re-validates against the strict
  schema (`src/output-repair.ts:191`), so any new required field is enforced there too.

**Downstream.** `src/pipeline.ts:588–599`: finder → `assignFindingIds(mergeFindings(...))` (`:594`) → judge
(`:596–599`, `withOneRetry`, 300 s timeout `:56`). review.json keys (`:613–641`, `schemas.ts:227–283`):
`summary, findings, preDedupFindingCount, scores, verdict, verdictReason, diffStats, diffTruncated,
offDiffFindingPaths, bodyTruncated, planTruncated?, droppedFindingIdRefs, models, finderTelemetry?,
judgeTelemetry?, implReview?, implReviewTelemetry?` — optional keys spread-absent. The impl pass consumes only
`codeReviewVerdict` (`:604, 680–687`). `render.ts:204–277` prints the verdict, the criterion table, the top 5
findings by severity (`:16, 222–228`) and footnotes; a "dropped finding" has no rendering because the category
does not exist. Labels: `action.yml:139–144` reads `.verdict`; exit code: 0 for any verdict, 1 for technical
failure (`cli.ts:8–11, 389`).

**Two designs.**

- (a) **One judge call that verifies and grades**: `judgeOutputSchema` gains a required `verifications`
  array; `JudgePromptInput` gains `excerpts?`; `buildJudgePrompt` appends `<code-excerpt>` fences;
  `judge.ts` filters the kept set and runs `validateJudgeReferences` against the kept ids; `pipeline.ts` builds
  excerpts from `input.source` and publishes `findings: kept`. It moves every judge fixture
  (`schemas.test.ts:66–73`, `judge.test.ts:34–41, 102–114`, `prompts.test.ts:112–195`, `scorecard.test.ts:21–26`,
  `output-repair.test.ts:202–220`, `pipeline.test.ts:68–75, 188–230, 347–365`), rewrites `prompts.ts:116, 118,
120, 139`, enlarges the most expensive call and pushes it toward its 300 s timeout (output is the judge's
  stated bottleneck, `pipeline.ts:51–56`).
- (b) **A separate verification call, judge unchanged**: new `src/verifier.ts` mirroring `createJudge`;
  `verificationOutputSchema` + `VerifierTelemetry` + optional `PipelineResult` keys (keep `models: { finder,
judge }` — `pipeline.test.ts:229` pins it; record the verifier model in a new block);
  `buildVerifierInstructions/Prompt` in `prompts.ts`; `DEFAULT_VERIFIER_MODEL` + `OPENROUTER_VERIFIER_MODEL` in
  `config.ts:186–215`; in `pipeline.ts` a timeout, the retry label, a deps seam, telemetry and the call between
  `:594` and `:596`; `REVIEW_VERIFIER_TIMEOUT_MS` in `cli.ts` beside `:347–351`; an optional `verifier-model`
  action input. Judge, schema, `validateJudgeReferences`, repair and their tests stay byte-identical. The
  control arm is this design with `verifierModel = finder model`; the main arm is this design with
  `verifierModel = judge model` (a second sonnet-class call) — or design (a).

**Rules both designs need**, decided in code, not in the prompt:

- **No source → pass-through** (the pass is skipped, findings publish as today), or every legacy/no-source
  run would be zeroed: the evals never run the judge (`evals/README.md:119`), `scripts/judge-diagnose.mjs:88–92`
  calls the judge directly, and the CLI has no provider when the diff has no post-change path (`cli.ts:298`).
- **`offDiffFindingPaths` stays computed on the pre-verification set** (`pipeline.ts:625–628`), otherwise the
  warning that caught PRs #175–#177 (`findings.ts:29–42`, `render.ts:241–248`) disappears, because off-diff
  findings are exactly the ones the source refuses.
- **The quote check is deterministic**: whether `quote` is a verbatim substring of the delivered excerpt is
  string containment, not natural-language grading (the regex lesson at `lessons.md:201–206` does not apply);
  code refuses a "confirmed" whose quote is not in the excerpt, so the model cannot confirm by fabricating.
- **`scripts/schema-dump.mjs:5–15`** dumps only the finder and impl schemas; add the verification schema and
  check for `oneOf`/`anyOf`/`minimum`/`maximum` before any paid call (lesson `lessons.md:208–213`).

### 2. Where the excerpts come from

- **Finding locations**: `file` required, `startLine`/`endLine` optional (`src/schemas.ts:33–41`), "omit for
  file-level findings" (`:35`); `normalizeFindings` drops `endLine < startLine` (`src/findings.ts:116–128`);
  dedup identity is `file:startLine|category`, file-level keys to line 0 (`findings.ts:63–65, 135–150`). There
  is no `locus` on finder findings; the explicit `code | file | absent` locus exists only on the impl-review
  schema (`schemas.ts:358, 391–431`).
- **The diff** (`ReviewUnit`, `pipeline.ts:589`): capped at `DIFF_CAP_BYTES = 100_000` (`:41, 118–123`) after
  source-before-prose ordering (`:248–277`); the workflow excludes `**/reviews/*.md`, `**/results/*.json`,
  `**/ground-truth/*`, `**/*.md`, `**/*.jsonl` and the plan (`review.yml:250–257`); three-dot diff at `:258`.
  The finder is told to report post-change line numbers "from the @@ hunk headers" (`prompts.ts:308`), but the
  package has no `@@` parser (`computeFileSegments` is byte offsets per file). On #269 every cited line sits in
  a hunk (six `scripts/s17` files are wholly new; `bread-spike.ts` has seven hunks, `measure-hue-shares.py` five),
  yet the diff would cut D20's evidence (`bread-spike.ts:117–121`) from the `runPrediction` header (99–105) across
  the un-hunked lines 109–110, and the hunk header `@@ -69,12 +111,13 @@ async function main()` names the
  pre-image function — the exact confusion D20 encodes.
- **The source root**: `SourceProvider` (`src/reviewer.ts:38–42`), `fetchBoundedContext` (`:119–132`, clamp to
  `MAX_CONTEXT_LINES = 400` only when both bounds are present, truncation at `MAX_CONTEXT_CHARS = 20_000`),
  `createDiffScopedSource` (`src/source-provider.ts:129–173`: exact-match allowlist from `+++ b/` headers
  outside hunk bodies `:54–72`, realpath containment + regular-file check `:146–153`, prose refusals `:104–120,
157, 165–170`), and `createDiffScopedSourceForDiff` (`:191–201`). **CI always builds it**: `action.yml:97`
  passes `--source-root "$GITHUB_WORKSPACE"` unconditionally; the checkout is the PR merge ref with
  `fetch-depth: 0` and no `ref:` (`review.yml:36–41`), so line numbers are the head's while content is the merge
  commit's — identical unless master touched the file after branching (`source-provider.ts:24–28`). The CLI
  constructs the provider once (`cli.ts:284–313`) and the pipeline forwards it only to the finder
  (`pipeline.ts:553`); `input.source` is in scope between `:594` and `:596`.
- **What blocks reuse as-is**: the provider returns prose for refusals and the module forbids inferring
  delivery from the string (`:87–97`); the only reliable signal, `onResult`, is fixed at construction and the
  CLI does not wire it (`cli.ts:291–297`). Proposal: split `createDiffScopedSource` into a structured reader
  `(request) => { delivered: true; lines; total } | { delivered: false; reason }` with the string adapter on
  top; a new pure `src/excerpts.ts` (`planExcerpts` → windows, span cap, per-file merge, budget order;
  `collectExcerpts`) so both arms consume the same excerpts; `excerptTelemetry` and a
  `preVerificationFindingCount` next to `preDedupFindingCount` (`schemas.ts:236`) so the G3 denominator is
  readable from review.json.
- **Policy numbers (first cut, before §7's correction)**: window `[startLine − 15, (endLine ?? startLine) + 15]`,
  cited span capped at 30 lines, 4,000 chars per finding, 40,000 chars per review after merging overlapping
  windows per file (D2's eight findings all sit in `bread-spike.ts:163–229`), allocation in F-id order; a budget
  miss is `excerpt: { status: "budget" }`, an off-diff path `{ status: "off-diff" }`, both passed as
  unverifiable rather than refuted. Measured at `fca2778`: a ±15 window is 31–38 lines ≈ 250–480 tokens per
  finding; all 38 findings at ±15 ≈ 14.4k tokens, 6.2k after per-file merging; a 20-finding review ≈ 7–10k input
  tokens. **§7 shows this window is too small for the evidence**; the numbers above are the floor, not the policy.

### 3. The verifier's response shape and "unverifiable" — proposal

- **Shape**: one flat object per finding, every field required — `{ id: string, verdict: "confirmed" |
"refuted", quote: string, reason: string }` — in a required array keyed by the code-assigned `F<n>` ids;
  `superRefine` for the combinations (a non-empty quote for both verdicts; a refutation quotes the line that
  contradicts the claim). Measured with zod 4.4.3: `quote: string.optional()` or `.nullable()` emits `anyOf`
  (fails the `schemas.test.ts:121` pin and the optional-field lesson, `lessons.md:180–185`); a
  `discriminatedUnion` emits `oneOf` (the Anthropic-subset lesson, `lessons.md:208–213`); the flat required
  shape is clean. Precedent: `implFindingWireSchema` + `normalizeImplFinding` (`schemas.ts:372–431, 454–468`).
- **"Unverifiable" is a state code assigns, never a value the model picks.** The model only sees findings that
  have an excerpt and answers on a yes/no axis (a taxonomy value the model never selects makes the mechanism
  inert, `lessons.md:215–220`). Code marks a finding unverifiable when: the path is off-diff or directory-level
  (`scripts/s17`), the provider refused, the excerpt budget was exhausted, the finding is file-level with no
  line and no header excerpt rule applies, or the returned quote is not a verbatim substring of the excerpt
  (fail closed). The review record carries the reason.
- **Publication rule — recommendation**: confirmed → published; refuted → not published, kept in review.json as
  `rejectedFindings` with the quote and reason; **unverifiable → not published, kept in review.json with its
  reason** (the owner's hypothesis: "a finding without confirmation is dropped"). Consequence the owner must
  accept knowingly: every `category: testing` claim at directory or file level (D4–D8, 24% of luna's findings on
  #269) and every claim whose evidence is in another file (D3, D19) drops unless a dedicated check exists; for
  the testing class a code-side file-list check (does the diff add a test file for the cited area?) could
  replace the excerpt, which the owner's 2026-10-03 ruling ("missing tests for maintainer tooling are not a
  defect") makes a low-value addition. **Alternative**: publish unverifiable findings marked "unverified" and
  exclude them from the G3 denominator — weaker, and it keeps the false-finding problem visible in the comment.
- **Library-semantics rows** (D1, D15, D17 were decided by Pillow's `draft()` rule and a 24-case experiment):
  the verifier should be allowed to answer "the excerpt does not settle this" — which under the rule above is a
  refusal to confirm, i.e. not published. That is the correct G3 outcome for those three rows and the price is
  a real finding of the same shape being dropped too; a recall guard (§8) is what bounds that price.

### 4. Cost and latency of both arms

Measured (`context/archive/2026-10-02-finder-model-swap/gate-openai-pr269.jsonl`, `gate-openai-promptfoo.jsonl`;
prices re-read 2026-10-03T21:00:40Z: luna 0.10/0.50/0.01 cache, sonnet-5 2.00/10.00/0.20, sol 2.00/10.00/0.20,
gemini-3.1-pro 2.00/12.00 per M):

| Series                             | Cost per attempt / row              | Latency                                           | Findings                                        | Note                                                                                             |
| ---------------------------------- | ----------------------------------- | ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| luna, #269 × 10                    | median $0.004783, max $0.012821     | median 13.0 s, max 24.0 s                         | median 4, max 6; 20 dedup rows over 10 attempts | finalization request (~25k in / ~470 out, fresh prefix, billed ~1.16× list) ≈ 68% of the attempt |
| luna, 12 fixture rows              | median $0.00018176, max $0.00080244 | median 3.4 s, max 6.8 s                           | not recorded                                    | no judge in promptfoo rows (`evals/finder-provider.ts:7–11`)                                     |
| judge, PR #132 (only cost point)   | $0.017104 = 3,852 in / 940 out      | —                                                 | ~2 (estimated)                                  | `context/archive/2026-08-11-impl-review-ci-agent/verification.md:93–102`                         |
| judge, PR #127 (only latency band) | —                                   | 120–300 s+ on 10 findings; 1 in 4 failed at 120 s | 10                                              | `src/pipeline.ts:51–56`; `JudgeTelemetry` has no latency field (`schemas.ts:209–215`)            |
| grader (gemini), 12 rows           | $0.00549–0.00553 per row            | —                                                 | —                                               | `gate.md` § Spend: 24 calls $0.132652                                                            |

Estimates (assumptions: 40-line excerpt ≈ 500 tokens per finding — measured median 406 on the 38 #269 findings;
finding JSON ≈ 150 tokens; verdict + quote ≈ 60 output tokens per finding; judge input ≈ 3,552 + 150/finding and
output ≈ 940 + 30/finding beyond 2, calibrated on #132; a separate call is a fresh prefix at list × 1.16):

| Per #269 attempt          | finder today | finder + judge today (est.) | MAIN, one combined call | MAIN, separate sonnet call (total) | CONTROL (finder + luna verify) | CONTROL ÷ finder | MAIN Δ ÷ finder |
| ------------------------- | ------------ | --------------------------- | ----------------------- | ---------------------------------- | ------------------------------ | ---------------- | --------------- |
| 4 findings                | $0.0048      | $0.0231                     | **$0.0295**             | $0.0317                            | **$0.0053**                    | 1.10×            | 1.3×            |
| 6 findings                | $0.0048      | $0.0243                     | $0.0339                 | $0.0367                            | $0.0055                        | 1.15×            | 2.0×            |
| 20 findings (pessimistic) | $0.0048      | $0.0327                     | $0.0647                 | $0.0717                            | $0.0070                        | 1.47×            | 6.7×            |

Per fixture row: MAIN $0.014 (0 findings) – $0.029 (6), i.e. 4.7–9.7× the old G4 ceiling; CONTROL
$0.00018–0.0009 (0.06–0.30×). Latency: CONTROL +3–8 s per review (one luna request of 2–24k tokens); MAIN
combined adds 240–1,200 output tokens to a call already near its 300 s timeout — no tokens-per-second figure
for sonnet-5 is on record, so no seconds can be derived; MAIN separate adds a second call of the judge's class.

Budget ($2.00, stop at $1.60; today's full gate G1×10 + 12 rows + grader = $0.125): MAIN one full gate ≈ $0.61
(4 findings) – $0.96 (20); with the required unseen series and G5 ($0.50) it fits only at measured finding
counts ($1.41); CONTROL ≈ $0.12–0.14 per gate, everything fits with ~$1.2 to spare; both arms on #269×10 +
unseen + fixtures ≈ $1.12 without G5.

### 5. An unseen case for the gate

- **Inventory of what models have seen**: PR #115–#132 live or scratch probes, #127's diff as the fabrication
  baseline, #143, #146, #162, #175–#177, 42 stored review.json of #135–#186 (replayed, no new calls), the five
  eval fixtures, and **#269** (×10 per endpoint, hand-read twice). The live review has existed since PR #115
  (`context/archive/2026-08-07-ci-cd-code-review/verification.md:30`) and covers every non-draft PR to master; its
  review.json is deleted after 14 days but the sticky comment stays on the PR. Rule proposed: a PR is **seen** if
  any finder output for it exists anywhere (a comment included); **used** if an archived experiment fed it to a
  model. The finder failed 15 of 15 runs from 2026-09-20 to 2026-09-24
  (`context/archive/2026-09-24-finder-serialization-outage/change.md:15–25`), so code PRs merged in that window
  have no finder output at all.
- **Candidates** (merged, code-bearing, under the 100 KB cap, unused by any experiment):

| Rank | PR                                              | Size                                                                                                       | Area                                | Different from #269     | Finder output exists      | Hand-read                                                              |
| ---- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------- | ------------------------- | ---------------------------------------------------------------------- |
| 1    | **#240** S-18 resolution disclosure (`f8a514b`) | 18,718 B; 8 files (`result-scaling.ts`, `EnhanceWorkspace.tsx`, `BeforeAfterSlider.tsx`, unit + e2e tests) | `src/` React/TS                     | yes                     | **none** (outage)         | yes; spec in `context/archive/2026-09-20-cloud-result-resolution-gap/` |
| 2    | #247 prod diagnostics (`14762bc`)               | 10,838 B; 2 new Python files                                                                               | `scripts/`                          | no — same class as #269 | none (outage)             | yes, small; weak test of generalisation                                |
| 3    | #170 password reset (`a2c2987`)                 | 8,938 B; 5 files                                                                                           | `src/lib/services`, `src/pages/api` | yes, security-relevant  | glm-4.6 comment (one nit) | yes                                                                    |
| 4    | #171 Deno test harness (`8f61cfa`)              | 21,572 B                                                                                                   | `supabase/functions/`               | yes                     | glm comment, passed       | yes                                                                    |
| 5    | #166 e2e worker-restart retry                   | 13,281 B                                                                                                   | `tests/e2e`                         | yes, test-only          | glm comment               | yes                                                                    |

A diff spanning two historical commits adds nothing over #240; the next real PR is unseen by construction
but cannot be pre-registered by sha; a synthetic diff is the pattern `lessons.md:166–171` warns against (start
from an artifact that reproduces and ablate, never build up).

- **Criteria against fitting**: (1) a holdout rule in the pre-registration — #269 and the fixtures for
  development, the unseen case only for the gate, no model run on it before the seal; (2) freeze the case
  before the prompt exists — PR number, diff recipe, byte count, sha256 of the diff, rules file, source-root
  commit, as `gate.md:42–55` did; (3) seal the verifier prompt's sha256 inside the hashed section (§10
  procedure, `gate.md:197–216`), pushed before the first paid call; (4) no prompt edit after the first run on the
  unseen case — a change is a dated, hashed amendment and a new construction needs a new unseen case; (5) with
  more than one candidate, select by a recorded seed over a frozen list (the `gate.md:149–153` method) or the
  owner names the case before the seal and records why; (6) the owner writes the defects they know of in the
  unseen PR before any run (a recall anchor the output cannot shape).
- **Hand-read**: the §6 procedure unchanged — blind dedup, owner approves merges and splits only, freeze → sha →
  seed → draw → row-by-row classification against the PR head, unresolved = rejected — computed on published
  findings. #269 took 7 minutes for approve/freeze/draw and one session for 20 rows; #240 is 3.5× smaller and
  recent owner code, so 8–15 rows is the expectation (not measured). Note N ≤ 19 → limit 0.

### 6. Prompt-injection fencing for code reaching the judge

- `fence(tag, content, attributes)` (`src/prompts.ts:94–97`) rewrites every `</` that precedes its own tag name
  to `<\/`, so content can never close its fence; attributes must be pre-escaped by the caller (`:93`).
  `escapeModelPath` (`:383–387`) neutralises newline, `<` and `"` in a model-chosen path so it can neither close
  the attribute nor forge a sibling block; `fileContextFence` = `fence("file-context", content, path="…")`
  (`:394–395`); `planMetadata` does the same for the plan path (`:243–250`).
- The judge prompt today declares `<findings>` and `<pr-metadata>` untrusted (`:120, 139`), pinned by
  `prompts.test.ts:142–147, 162–188`. **Gap that matters for excerpts**: `JSON.stringify` does not escape `<` and
  the fence defuses only `</findings`, so a finding description can carry a literal `<code-excerpt …>…</code-excerpt>`
  inside the findings fence. The instructions must say that only top-level `<code-excerpt>` blocks are evidence and
  anything excerpt-shaped inside `<findings>` is data — the "appearance vs provenance" point the impl pass makes
  about the plan (`:216–221`).
- Build: `fence("code-excerpt", text, for="F3" path="<escapeModelPath>" lines="a-b")` with the id code-assigned
  (`scorecard.ts:24–26`), the numbers formatted by code, every line prefixed with its absolute number and the
  cited lines marked; the system text names the excerpt "the same untrusted PR content as the diff" (mirror
  `:367`). `fence` and `escapeModelPath` are module-private (`src/index.ts` exports neither), so the builder
  lives in `prompts.ts`. Sentences that change under design (a): `:116` ("never see the code" goes), `:118`
  (score only from confirmed findings), `:120` (add `<code-excerpt>` and the top-level-only clause), `:139`
  ("every fenced block"); comments to keep truthful: `prompts.ts:101–104`, `judge.ts:16–19`, `schemas.ts:12–16`,
  `pipeline.ts:36–37, 432–433`. Under design (b) the judge text stays and the verifier gets its own.

### 7. Backward check: would the verifier have received the right code?

Script and raw results: `backcheck-269.py`, `backcheck-269-results.json` (beside this file). Inputs: the 38 raw
findings (`gate-openai-pr269.jsonl`), the D-row mapping (`hand-read-openai.json`), the owner-classified evidence
lines (`hand-read-269-presort.md`), the code at `fca2778`, the #269 hunks.

| Coverage of the evidence lines        | findings (38)                      | rows (20, any contributing finding)         |
| ------------------------------------- | ---------------------------------- | ------------------------------------------- |
| cited range alone                     | 1 (a whole-file citation)          | 1 (D4)                                      |
| ±10 lines                             | 4                                  | 3 (D3, D4, D18)                             |
| ±25 lines                             | 16                                 | 9 (D1, D3, D4, D6, D11, D16, D18, D19, D20) |
| enclosing top-level function          | 9                                  | 5 (D1, D3, D15, D18, D19)                   |
| whole cited file                      | 35 (all but the 3 directory-level) | 19                                          |
| whole file AND no evidence outside it | 15                                 | 8 (D2, D9, D10, D12, D13, D14, D16, D20)    |

- Six citations point at unrelated code: 3.1 `decode-inputs.py:117–118` (`to_srgb`'s tail), 10.3 `:154`
  (`.rgba` write), 5.3 `:167` (meta dict), 9.2 `:55–57` (imports), 10.1 `contact-sheet.py:130` (`figure()`),
  5.1 `bread-spike.ts:214` (a blank line). Three cite unchanged context lines (10.2 `:115`, 9.3
  `measure-hue-shares.py:34–35`, 5.1). Nine are directory- or file-level testing claims (D4–D8) whose evidence is
  the PR file list and the rules' Testing bar — no window decides them.
- The deciding lines are often **outside the cited function**: in the caller (D13 — `build_photo:140–141` cited,
  the guard at `main:208–211` refutes; an excerpt of `build_photo` alone **confirms the false claim**; D2 —
  `main:78–80` awaits `localInput` outside the `try/finally` at 91–96; D20 — `main:91–96`), in the module
  docstring (D9, D10 exit-status contract `desktop-stats.ts:18–23`; D12 "NO colour-profile conversion"
  `measure-hue-shares.py:37–41`; D14 no-enlargement rule `contact-sheet.py:20–24`), in another file (D3
  `bread-spike.ts:233`, D19 `harness.ts:43–51`, D11 the manifest ROI values, D18 sibling-script validation), or
  outside the repo (D1, D15, D17: Pillow's `draft()` rule, settled by `hand-read-269-checks.py`).
- Backticked identifiers in the descriptions (`img.draft()`, `prediction_id`, `process.exitCode`, `--all`) land
  on an evidence line for 22 of 35 range/file findings; 12 descriptions carry no identifier (all six of attempt
  09, the testing claims, 1.3, 7.3).
- **What an excerpt policy must do**: treat `startLine`/`endLine` as a locator, never a boundary; snap to a
  code unit by identifier when the line is wrong, with the enclosing function as fallback; include one hop of
  same-file callers; always prepend the module header; divert `category: testing` claims to a file-list check;
  resolve identifiers across the diff's other files; do not restrict excerpts to `+` lines; and let the
  verifier say the excerpt does not settle a library-semantics claim. That policy serves 10 of 20 rows fully;
  ±25 alone serves 9 and serves D13 on the wrong side. The §2 numbers (4,000 chars per finding, 40,000 per review)
  are compatible with it only if the per-finding cap grows to a function plus one caller (≈ 100–150 lines,
  ~1.5–2.5k tokens) and the per-review cap is applied after per-file merging.

### 8. A new cost criterion in place of G4 — proposal

**What the old G4 measured**: the median `finderCost` of the 12 promptfoo rows — loop, finalization and repair of
the finder only — against 3× the matched glm-4.6 baseline median ($0.00100551 → $0.00301653, `gate.md:74–79`;
the 12 baseline rows in `context/archive/2026-08-10-finder-tool-loop-evals/results/2026-08-11-tool-loop-matrix.json`
were single-call, tool-less, 1,082–1,857 prompt tokens). It has no slot for a second model, a sonnet-5 call on
zero findings already costs 4.7× its ceiling, and its driver (diff size) is not verification's driver (findings ×
excerpt size). It cannot compare the arms.

**Proposal (owner decides; reasoning follows):**

1. **Keep the old G4 unchanged for the finder on the fixture rows** — same numerator (finder requests only),
   same ceiling. It still catches a finder cost regression and needs no new tooling. Do not run the judge or
   the verifier on the fixture rows for cost (saves ≈ $0.25 per gate; see the recall caveat below).
2. **Add G4b — total review cost on the PR-sized series**: for each #269 attempt and each unseen-case attempt,
   the sum of every request of finder + verifier + judge (the main arm's combined call counts as judge);
   **median ≤ $0.063 = 3 × $0.021087**, the one measured production finder+judge review (PR #132, run
   31735830016, `AGENTS.md` § ai-review). A request with incomplete cost telemetry fails the attempt's G4b, as
   the old rule did for rows. The 3× multiplier is the same construction the owner approved twice for G4; the
   baseline is now the whole review, which is what verification changes. Implied: CONTROL ≈ $0.024–0.035 with
   the unchanged judge, passes; MAIN ≈ $0.030–0.034 at measured finding counts, passes; MAIN at the pessimistic
   20 findings per attempt ($0.065–0.072) fails — a verifier that makes the review 3× dearer than the measured
   production review is the thing this criterion exists to refuse. Caveat stated plainly: $0.021087 is one data
   point (~2 findings); the #269-calibrated estimate of today's finder+judge is $0.023–0.033, so if the owner
   prefers a baseline measured on #269, G4b must first measure today's judge on #269 (≈ $0.20 for ×10) and take
   3× of that median.
3. **Report, never gate**: verification cost ÷ finder cost per attempt (CONTROL 0.10–0.47×, MAIN 1.3–6.7× at 40
   lines), marginal cost per verified finding, and latency per attempt; **gate** "0 judge/verifier timeouts in
   10 attempts at the configured timeout".
4. **Tooling the gate needs**: `scripts/finder-gate.mjs` records finder requests only — it must run the whole
   pipeline (or the verifier + judge) per attempt and record `judgeTelemetry`/`verifierTelemetry` with the
   completeness flag; `JudgeTelemetry` gains a latency field (`schemas.ts:209–215`).

**Recall guard (not asked, but the data forces it)**: G3 on published findings is satisfied by a verifier that
drops almost everything (N=0 fails, but N=2 with 0 rejected passes at limit 0); `lessons.md` ("an intervention
can satisfy its own guard", `:194–199`) names this shape. The fixtures' planted-defect metrics (`issue_recall`,
`flaw_*`, `review_fails`) are computed on the finder's output today and the rows never run the judge. The new
gate needs the same required metrics computed on **published** findings — which means running verification on
the fixture rows (CONTROL: ≈ $0.005 per gate; MAIN: ≈ $0.25 per gate and new promptfoo tooling) — and a clause
that the metrics must still be 3/3 after verification. The budget consequence for the main arm: one full gate
≈ $0.86–1.2, so the unseen series plus G5 no longer fit under $1.60 unless G1 is ×5 or the main arm is measured
on #269 only.

### 9. Checked on the owner's request: Jev (typesafe.ai) as a cheap verifier

Looked for: the API's return type, input shape and context limit, the prices, availability through OpenRouter,
and what `jev-review` does. Routes and dates: `https://docs.typesafe.ai/api` and `https://docs.typesafe.ai/models`
(fetched 2026-10-03 ~21:11Z, real documentation text), `https://github.com/NiazMorshed2007/jev-review` (README),
`https://openrouter.ai/api/v1/models` (public, 21:11:30Z).

- **API**: `POST https://api.typesafe.ai/v1/systemone` with `state` (string or JSON) and a map of typed
  `questions`; answers are `noul` (a 0–1 yes/no probability), `choice` (one of ≤ 255 options with probabilities)
  or `score` (≤ 10 ordered levels with a distribution). Bearer key; custom endpoint, not `/v1/chat/completions`;
  429/529 with backoff. No mention of code review or claim verification in the API text.
- **Model and price**: `jev-1.13.0`, "TypeSafe's flagship model and the first System One model", trained "with
  RLCD to return calibrated decisions"; **$0.042 per M input tokens, output free**; 64k tokens per request, 32k
  for `state` plus the longest question; text only. A 20-finding review at ~1.5k tokens per finding ≈ $0.0013.
- **OpenRouter**: one listing, `typesafe/jev-router`, priced `-1/-1` (a router, no normal chat path) — so Jev is
  a second provider: its own secret in CI, PR code sent to a third party outside OpenRouter, no AI SDK provider.
- **`jev-review`**: a local MCP stdio server that sends task/diff/files to the same endpoint and returns 1–10
  scores with confidence per quality dimension; the author's caveat verbatim: "The coding agent—not Jev—must
  determine the actual cause and appropriate code change." 232 stars, MIT.
- **Assessment**: Jev cannot quote code, so it does not implement the owner's hypothesis (confirmation by
  quotation); it fits a different construction — "does this claim follow from the shown code?" as a `noul`
  with a threshold — and the threshold is one more parameter that must be fixed before the unseen case. No
  independent evaluation of Jev on code-claim verification was found (only vendor pages and blogs). Possible
  place: option 4b, in reserve beside sol, for the owner's decision; nothing here measures it.

## Code References

- `packages/code-reviewer/src/prompts.ts:94–97, 101–145, 366–369, 383–395, 415–423` — fence helpers, judge
  instructions and prompt, file-context framing.
- `packages/code-reviewer/src/judge.ts:7–10, 51–95` — judge factory, routing, repair, reference validation.
- `packages/code-reviewer/src/schemas.ts:33–41, 53–82, 117–167, 209–215, 227–283, 358–468` — finding, judge
  wire/trusted types, telemetry, pipeline result, impl-review locus precedent.
- `packages/code-reviewer/src/scorecard.ts:24–49` — id assignment, reference validation.
- `packages/code-reviewer/src/output-repair.ts:181–216` — judge repair re-validates strictly.
- `packages/code-reviewer/src/pipeline.ts:41–56, 118–123, 248–277, 459–463, 553, 561–571, 588–641` — caps,
  timeouts, source forwarding, judge telemetry, the finder → judge sequence, review.json.
- `packages/code-reviewer/src/findings.ts:29–59, 63–65, 99–150` — off-diff detection, identity, dedup.
- `packages/code-reviewer/src/reviewer.ts:23–24, 38–42, 119–132` — context caps, SourceProvider, fetchBoundedContext.
- `packages/code-reviewer/src/source-provider.ts:24–28, 54–72, 87–97, 104–120, 129–201` — merge-ref nuance,
  allowlist, delivery signal, refusals, containment, assembly.
- `packages/code-reviewer/src/render.ts:16, 204–277` — comment rendering.
- `packages/code-reviewer/src/cli.ts:8–11, 278–313, 347–351, 376–399` — exit contract, provider construction,
  timeouts, outputs.
- `.github/actions/ai-review/action.yml:97, 139–144`; `.github/workflows/review.yml:36–41, 250–258, 268–272` —
  source root, labels, checkout, exclusions.
- `packages/code-reviewer/scripts/schema-dump.mjs:5–15`, `scripts/finder-gate.mjs`, `scripts/judge-diagnose.mjs:88–92`,
  `evals/finder-provider.ts:7–11`, `evals/README.md:119` — tooling that the gate change touches.

## Architecture Insights

- The pipeline already separates "the pass that sees the code" (finder) from "the pass that judges" and keeps
  every optional result key spread-absent; a verification pass fits as a third stage between `:594` and `:596`
  without touching render, labels or exit code, provided it passes through when there is no source.
- Everything model-chosen is treated as untrusted at the boundary where it becomes a capability (paths at the
  provider, finding ids at the scorecard); the verifier's `quote` is the same kind of value and gets the same
  treatment — a deterministic substring check, not trust.
- Schema shape is a wire concern decided by the provider's subset: flat objects, string enums, required fields;
  rich types begin after validation.
- The one-hop-caller and module-header requirements of §7 are the first time an excerpt policy must know code
  structure (function spans, callers); `backcheck-269.py` already derives top-level spans for Python and TS by
  regex and is the cheapest instrument to re-run against any policy before a paid call.

## Historical Context (from prior changes)

- `context/archive/2026-10-02-finder-model-swap/gate.md` — the sealed gate (§4 G3 hand-read, §6 dedup/freeze/
  seed, §10 seal), Results (luna G1 $0.0048 / 13 s; G4 $0.00018 per row; Spend reconciliation), § Hand-read
  (19 of 20 rejected; D13 and D20 checked by the owner), § Decision 4.4.
- `context/archive/2026-10-02-finder-model-swap/hand-read-269-presort.md` — the per-row evidence lines §7 is
  measured against; `hand-read-269-checks.py` — the Pillow experiment behind D1/D15/D17.
- `context/archive/2026-09-24-finder-serialization-outage/` — the two-stage finder (gathering loop, tool-less
  finalization, one repair), the outage window 2026-09-20..24 (15/15 failures) that left #237, #240, #247 without
  finder output, and the Novita hand-read precedent (10 rejected, 40 unresolved).
- `context/archive/2026-08-11-impl-review-ci-agent/verification.md:93–102` — the only recorded judge cost
  (PR #132).
- `context/archive/2026-08-10-finder-tool-loop-evals/` — the old G4 baseline rows and the `sonnet-5`-as-finder
  cost ($0.04338 per row, 48× glm) that set the "3× matched baseline" construction.
- `context/archive/2026-08-13-finder-security-vocabulary-bias/` — the fixture lesson (#127 reproduced 2/8,
  synthetic 0/50) behind §5's rejection of a synthetic unseen case.
- `context/archive/2026-08-24-review-offdiff-detection/` — why `offDiffFindingPaths` reports rather than drops.

## Related Research

- `context/archive/2026-10-02-finder-model-swap/research.md` — the predecessor's candidate and cost research
  (its sol estimate ≈ $0.011 per row ≈ 3.6× G4 anticipates §8).
- `backcheck-269.py` (beside this file) — the backward check of §7, re-runnable against any excerpt policy;
  `backcheck-269-results.json` — its raw per-finding output (38 entries).

## Open Questions — the owner's decisions before any plan or seal

1. **Design (a) or (b)** for the main arm — one combined judge call, or a separate verification call (the
   smaller blast radius; serves both arms with a model id). Research leans (b).
2. **Cost criterion** (§8): keep G4 for the finder on fixtures + G4b ≤ $0.063 on the PR-sized series, with the
   #132 baseline or a freshly measured #269 judge baseline; which finding count and excerpt size the number assumes.
3. **Recall guard**: required fixture metrics computed on published findings (needs verification on the rows —
   cheap for CONTROL, ≈ $0.25 per gate and tooling for MAIN), or accept that recall after verification is
   measured only by the hand-read.
4. **"Unverifiable"**: not published and recorded (recommended), or published as "unverified"; and the treatment
   of `category: testing` claims (file-list check vs drop) and of library-semantics claims.
5. **Excerpt policy scale**: ±15 lines (floor) vs header + identifier-snapped function + one-hop caller +
   cross-file identifiers (what §7 needs), with the per-finding and per-review caps that implies.
6. **No-source rule** (pass-through recommended) and **`offDiffFindingPaths` on the pre-verification set**
   (recommended).
7. **Unseen case**: #240 (recommended), the seed-over-list alternative, and the holdout/freeze rules of §5.
8. **Reasoning for the verifier** (open (b) of the owner decision): A3 applied to the finder; a verifier with
   reasoning costs output tokens that are free on Jev and priced on sonnet/luna — decide per arm before the seal.
9. **ai-review on master until the result** (open (c)).
10. **Jev**: in reserve as option 4b (a probability-threshold construction, a second provider), or out.
11. **Judge latency on #269 is unmeasured** (only the #127 band exists); whether to spend ≈ $0.20 on measuring
    today's judge on #269 ×10 before sealing a G4b baseline.
