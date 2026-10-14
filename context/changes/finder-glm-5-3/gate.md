# finder-glm-5-3 — pre-registered gate

> Plan: `context/changes/finder-glm-5-3/plan.md`. Phase 4 writes the inputs freeze and the pre-registration and
> seals the pre-registration before any paid call. Phases 5–7 measure and decide against it.
> Owner decisions it carries (`change.md` § Notes): items 1–7 of 2026-10-11 (gate, reasoning, cost, routing, budget,
> valid run, amended budget) with their plan-review clarifications F1–F5, the 2026-10-13 G3-row decision, and the
> 2026-10-14 decisions on the auth/credit stop, the step summary, the `kind=` step field and the failed-impl-review
> comment.
>
> Predecessor gates: `context/archive/2026-10-02-finder-model-swap/gate.md` (G1–G5 structure, G3 cases, grader-error
> amendment A1), `context/archive/2026-10-05-finder-sonnet/gate.md` and
> `context/archive/2026-10-06-finder-sonnet-effort/gate.md` (per-run hand-read, D2, monthly cost, seal convention).

## Inputs freeze

Taken **2026-10-14** (Phase 4), before any paid call of this change. The `finder-sonnet` frozen inputs are reused.
Every file below was re-hashed on 2026-10-14, and every recipe was re-run at 2026-10-14T20:08:34Z. Each reproduced
the recorded bytes, and nothing was rebuilt.

The diffs, rules files, PR metadata and worktrees live in `~/.cache/finder-sonnet-gate/` (kept by the owner since
`finder-sonnet`) and are not committed. Their fingerprints are sealed in `gate-manifest.json` § `inputs`. **The runner
refuses a paid step whose inputs differ from the seal**, before anything is spent (`glm-gate.mjs run`, input check).

**Diff recipe** (the `EXCLUDES` of `.github/workflows/review.yml`):

```
git diff <base>...<head> -- . ':(exclude,glob)**/reviews/*.md' ':(exclude,glob)**/results/*.json' \
  ':(exclude,glob)**/ground-truth/*' ':(exclude,glob)**/*.md' ':(exclude,glob)**/*.jsonl'
```

**Rules recipe:** `git show <base>:.github/ai-review-rules.md`. For both PRs it is byte-identical to the head's copy
and to this branch's `.github/ai-review-rules.md` (re-checked 2026-10-14).

**PR metadata recipe:** `gh pr view <n> --json title,body > meta.json`. Re-read 2026-10-14: both PRs' current title
and body reproduce the frozen bytes.

**Source root:** a clean detached worktree at `<head>`.

### #247

- **Base** `d097949bf217ecafb3333f63e757af67cc7daf07`; **head** `dec09f8d77b2f1ee45073c194d6cd8239a7d35c7`.
- **Diff:** `247/pr.diff`, 10,838 B, sha256 `21973af35cc39f60488935583a85baf894a6c1a9b51069d16de86e701b5dc2e1`; the
  recipe reproduces it.
- **Rules:** `247/rules.md`, 2,929 B, sha256 `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f`.
- **Metadata:** `247/meta.json`, 2,059 B, sha256 `ec66879c3e33027ee2096677a4da060f5e68645c1fa3752ed376638cd9a24ff2`.
- **Source root:** `~/.cache/finder-sonnet-gate/wt-247`; `HEAD` = head, `git status --porcelain` empty.

### #269

- **Base** `3d0adc1b4910c31973c6ac98a7ce776fcb68d878`; **head** `fca2778742ec0bc02a84f42b23bf639fc32c7ad1`.
- **Diff:** `269/pr.diff`, 65,455 B, sha256 `1e4ec0882371989122f9e4254c93c4df1f51826a4f57dbfe04139175177e550f`; the
  recipe reproduces it.
- **Rules:** `269/rules.md`, 2,929 B, sha256 `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f`.
- **Metadata:** `269/meta.json`, 1,701 B, sha256 `00b7b21bd2d48b73442796a257feafc21689a296584ba1989b6f406374da82e7`.
- **Source root:** `~/.cache/finder-sonnet-gate/wt-269`; `HEAD` = head, `git status --porcelain` empty.
- **D2 re-confirmed at the head (2026-10-14):** in the worktree's `scripts/spikes/bread-spike.ts`, `localInput`
  (`:167–196`) calls `process.exit(1)` at `:193` when the upload response has no `urls.get`, before returning
  `uploadedFileId: file.id` at `:195`, so `deleteUpload` (`:199–213`) never sees the file. The diff references
  `bread-spike.ts` 5 times.

### Clean case (G2)

- **Diff:** `packages/code-reviewer/evals/fixtures/clean-change.diff`, sha256
  `8b326f6db0622096194e79a12dab7500c35eb6af5a7ba16f6f194f15607108cd`.
- **Rules:** `.github/ai-review-rules.md`, sha256 `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f`
  (the same bytes as the frozen rules).
- **Source root:** `packages/code-reviewer/evals/fixtures/clean-change/`. No PR metadata: `PR_TITLE` and `PR_BODY`
  are empty.
- All three are sealed files as well (§ Run manifest).

### Run manifest

`context/changes/finder-glm-5-3/gate-manifest.json` is what `glm-gate.mjs` checks before every paid step (`run`,
`g3`, `g3 --regrade`) and what `preflight --manifest-only` checks at G5. It was written by
`node scripts/glm-gate.mjs manifest` from the tree that the seal commit carries, and holds:

- `files`: the sha256 of all **40** sealed files. That is 19 non-test `packages/code-reviewer/src/**/*.ts` files and
  the 7 files of `packages/code-reviewer/evals/fixtures/**`. The other 14 are named:
  - `packages/code-reviewer/package.json` and `package-lock.json`;
  - `scripts/glm-gate.mjs`, `glm-gate-core.mjs`, `glm-gate-sheet.mjs` and `glm-gate-dry-run-stub.mjs`;
  - `scripts/promptfoo-gate-rows.mjs` and `promptfoo-regrade-config.mjs`;
  - `evals/finder-provider.ts`, `evals/assertions.mjs`, `evals/promptfooconfig.yaml` and
    `evals/review-result.schema.json`;
  - `.github/ai-review-rules.md` and `.github/actions/ai-review/action.yml`.
- `inputs`: the fingerprints of `clean`, `pr247` and `pr269` above (diff, rules, metadata; head and clean state of the
  two worktrees).
- `configurationLine`: the one `finder configuration:` line every run must print (§ Pre-registration §1).

A sealed file the tree adds, removes or changes is a mismatch, and so is a different configuration line.

It is Prettier-formatted before hashing (`prettier --write` leaves its bytes unchanged), so the pre-commit hook
cannot change them.

- sha256 `12989509b4d846a1cb9a88196a92138a426bff4a6a9f581e734d19fcab9272ee`, 5,941 B.
- `node packages/code-reviewer/scripts/glm-gate.mjs preflight --manifest-only` on 2026-10-14 printed
  `MANIFEST MATCHES: 40 sealed file(s) unchanged.`

## Pre-registration

### 1. What is measured

One configuration: the production pipeline as sealed, with no arm and no override.

- **Finder:** the two-stage finder (`createReviewer`) on `z-ai/glm-5.3` (`DEFAULT_MODEL`).
  - Stage 1 is a `ToolLoopAgent` with `getFileContext` and at most 5 steps (`DEFAULT_FINDER_MAX_STEPS`).
  - Stage 2 is one tool-less finalization, followed by at most one format repair.
  - Every finder request carries `reasoning: {enabled: true, effort: "low"}` and the routing
    `provider: {order: ["z-ai","fireworks","together"], only: [same], allow_fallbacks: true, require_parameters: true}`.
  - Output cap 16,384 tokens per request (`MAX_OUTPUT_TOKENS`); one 300 s budget for the whole finder pass
    (`DEFAULT_FINDER_TIMEOUT_MS`).
- **Judge:** production `anthropic/claude-sonnet-5` (`DEFAULT_JUDGE_MODEL`), routing `{require_parameters: true}`,
  300 s, no `reasoning` key.
- **Retries:** `withOneRetry`, one retry per pass on `TimeoutError`, `NoObjectGeneratedError` or HTTP 429/5xx.
  `FinderOutputError` is never retried; this includes truncation and inline reasoning (A7).
- **Implementation review:** not run in G2, #247 or G1, because no plan file is passed. Its cost enters only
  through I (§2, "monthly cost"). It runs in G5.
- **Entry point:** `npm run review` in `packages/code-reviewer`, driven by `scripts/glm-gate.mjs run`, with the
  arguments `action.yml` passes: `--diff-file`, `--out-dir`, `--source-root` and `--project-context-file`, plus
  `PR_TITLE` and `PR_BODY` from `meta.json`.
- **Code under test:** every file of the manifest (§ Run manifest), sha256
  `12989509b4d846a1cb9a88196a92138a426bff4a6a9f581e734d19fcab9272ee`.
- **Expected configuration line:** every run prints exactly one
  `finder configuration: model=z-ai/glm-5.3 reasoning=low providers=z-ai,fireworks,together`. The CLI prints it
  from the constants the requests use. A missing, repeated or different line makes the run invalid.
- **Forbidden environment:** none of `OPENROUTER_REVIEW_MODEL`, `OPENROUTER_FINDER_PROVIDERS`, `OPENROUTER_MODEL`,
  `OPENROUTER_JUDGE_MODEL`, `OPENROUTER_IMPL_REVIEW_MODEL`, `OPENROUTER_REQUIRE_PARAMETERS`,
  `REVIEW_FINDER_MAX_STEPS`, `REVIEW_FINDER_TIMEOUT_MS`, `REVIEW_JUDGE_TIMEOUT_MS` or
  `REVIEW_IMPL_REVIEW_TIMEOUT_MS` may be set, in the shell or in `packages/code-reviewer/.env`. The runner refuses
  every step, `preflight` included, while one is set.
- **What a CLI run cannot show:** it does not capture request bodies. The reasoning shape of G2, #247 and G1 requests
  rests on two things: the configuration line, printed from the constants every finder request uses, and the
  hermetic wire tests of plan Phase 2. G3's rows capture each finder request's `reasoning` key on the wire.

### 2. Definitions

Restated from `plan.md` § Definitions as of the seal. After the seal, this section and its amendments govern; a
later edit to `plan.md` does not change the gate.

- **Finder request:** one OpenRouter call made by the finder: a stage-1 loop step, the finalization or the format
  repair. Judge and impl-review requests are not finder requests.
- **Reasoning shape:** every finder request carries exactly `reasoning: {enabled: true, effort: "low"}` and no
  `extraBody.reasoning`. Judge and impl-review requests carry no `reasoning`.
- **Reasoning text:** reasoning returned by the provider, as `reasoning` / `reasoning_details` or inline in `content`
  inside `<think>…</think>`. Reasoning parts are never read. A leading inline `<think` fails the attempt (A2).
- **Truncation:** any finder request ending `finishReason === "length"`. It fails the attempt with
  `FinderOutputError`, which is never retried, even if the text would parse.
- **Attempt / run:** one invocation of the production CLI on one input, including its single `withOneRetry`. A retry
  inside the run is the same run, and its cost counts.
- **Valid run:** CLI exit 0, and `review.json` carries findings and a judge verdict. Every finder request must have a
  **provider-reported** listed provider and a **provider-reported** accepted model, with no truncation, no inline
  reasoning and no timeout after the retry.
  - A technical judge failure (no completed verdict) makes the run **invalid**.
  - A completed `verdict: "failed"` does not invalidate the run; all other validity and hand-read criteria still
    apply.
  - A wrong, missing or fallback-only provider or model makes the run invalid; it is never a "measurement error".
  - How the sealed runner decides it (`classifyRun`): a run **with an artifact** is exit 0 with a parsable
    `review.json`. It is invalid if any of these holds:
    - the configuration line is not exactly one expected line;
    - `review.json` lacks a `findings` array, a `verdict` string or a `scores` object;
    - `models.finder` ≠ `z-ai/glm-5.3`;
    - `finderTelemetry.requests` is empty;
    - any request lacks a reported listed provider or a reported accepted model, or ended `length`.
  - Every other run is recorded **without an artifact** and is invalid. Its reasons are classified from the CLI's
    stderr metadata lines only, never from model text.
- **Auth/credit stop (owner decision 2026-10-14):**
  - **Confirmed:** the CLI's `api error: status=<n>` line shows 401 or 402. That line comes from the typed
    `APICallError` status, cause chain and `RetryError.lastError` included. For a G3 row, the finder error's typed
    status recorded by the adapter counts instead.
  - **Suspected:** OpenRouter auth/credit text without that status line. It is an ordinary invalid run and always
    stays unsettled; it is never confirmed.
  - `OPENROUTER_API_KEY is missing` is a local configuration error. A grader 401/402 is a grader error, handled by
    the re-grade path.
  - A stopped run is not a sample and stays out of m247 and m269. Timeouts, truncation, parse failures and
    provider/model mismatches keep the invalid-run treatment.
- **Listed providers:** the request routing of §1. The accepted served names are `Z.AI`, `Fireworks` and
  `Together`. `fireworks/fast` also reports `Fireworks` and cannot be told apart.
- **Accepted model:** the `model` field **reported in the raw OpenRouter response** is `z-ai/glm-5.3` or a dated
  canonical form `z-ai/glm-5.3-YYYYMMDD` (`^z-ai/glm-5\.3(-\d{8})?$`). It is never `-flash`, `-flashx`, `-prime` or
  `:batch`. The SDK's `response.modelId` is not evidence. A missing field gives `model.source = "missing"`, which
  makes the run invalid.
- **N:** the number of **published** findings of one valid run: `review.json` `findings`, after production's
  within-run `mergeFindings`. There is no deduplication across runs.
- **Rejected:** the owner classifies a finding as not identifying a real defect in that PR's diff at its head.
  **Unresolved = rejected.**
- **Run passes hand-read:** rejected ≤ **ceil(0.05 × N)**. For #269, at least one finding must also be
  owner-approved as a D2 match. N = 1..20 allows 1 rejected and N = 21..40 allows 2. N = 0 on #247 passes; N = 0 on
  #269 fails (no D2).
- **D2 match:** a finding cites `bread-spike.ts` within `localInput`'s upload path or `main`'s cleanup **and**
  claims the uploaded file is not deleted (or leaks) on the missing-URL exit. Cleanup only in `finally` is not a
  match. The agent proposes; the owner approves.
- **Monthly cost:** **53 × m247 + 8 × m269 + 13 × I ≤ $10.00.**
  - m247 / m269 = the mean settled cost per executed run (valid and invalid) of finder + judge, retries included.
  - I = $0.199620, the impl-review cost of run 31735830016.
  - After G5, I = the mean of $0.199620 and G5's impl-review cost, **only when G5's impl-review ran**. When G5's
    verdict skipped it, I stays $0.199620 and the skip is recorded.
  - Before G5 the projection is provisional. Early rejection follows A6.
  - The 53 / 8 / 13 weights are the `finder-sonnet` sealed figures, reused unchanged.
- **T (spend):** max(key-counter delta since T0, sum of settled per-step costs). A paid step is one CLI run, one G3
  promptfoo batch or one G3 re-grade.
- **P vs cap:** P is an _estimate_, used only to refuse a start: a paid step starts only if every earlier step is
  settled and T + P ≤ $3.50. P does **not** bound a step's spend. The **enforced** bounds are that admission rule at
  step boundaries and, optionally, an OpenRouter key limit set by the owner, the only provider-enforced bound.
- **G5 green:** the `AI Code Review` job concludes `success`, uploads `review.json` + `comment.md`, applies one
  `ai-cr:*` label, and every G5 criterion of §9 holds. The verdict may be `passed` or `failed`, and the owner reads
  it before merging. A technical failure (no output) is not green.

### 3. Gates

1. **G2 — no findings on a clean change.** `clean` × 5, tool-enabled, with the inputs of § Clean case: **5/5** valid
   runs with `findings: []`. Any finding fails G2, `minor` or `nit` included.
2. **G3 — fixture quality.** Exactly 12 promptfoo rows: the four registered cases × 3 repeats, provider
   `candidate-glm-5.3` alone. The grader is `openrouter:google/gemini-3.1-pro-preview` (`promptfooconfig.yaml`
   `defaultTest`). The command, from `packages/code-reviewer`, is:

   ```
   npm run eval -- --env-file .env --no-cache -j 1 --repeat 3 --filter-providers '^candidate-glm-5\.3$'
     --filter-pattern '^(Finds the material|React 16->19|Cross-hunk contract|Defect-free mechanical rename)'
     --output <export>
   ```

   - **Required 3/3:** `issue_recall` on the JS loop case. On React: `issue_recall`, `review_fails`,
     `flaw_stale_closure`, `flaw_lost_cleanup` and `flaw_unsafe_html`. On the clean rename: `no_false_alarms`.
     Cross-hunk (`tool_required`, `flaw_cross_hunk_contract`) is diagnostic, never required.
   - **One row = one production pass**, `withOneRetry` included (owner decision 2026-10-13). Each retry is recorded,
     and `FinderOutputError` is never retried.
   - A row counts for a metric only when all of these hold:
     - it has no finder error;
     - it has at least one finder request, and each one reports a listed provider and an accepted model;
     - the wire captured at least one finder request body, and each one's `reasoning` deep-equals
       `{enabled: true, effort: "low"}`;
     - it has no inline reasoning.
   - **G3 passes** only when every required metric is 3/3 **and** no row of any case, cross-hunk included, has a
     finder error, a provider or model mismatch, a wrong reasoning shape or inline reasoning.
   - **Not a gate result** (a failed run), each stopping for an owner decision before more spend:
     - a run with ≠ 12 rows, ≠ 3 rows per case, a row outside the four cases or a row from another provider label;
     - a re-grade problem, or a grader error again after the re-grade.
   - **Grader errors** follow `finder-model-swap` Amendment A1. They are not a candidate failure. Their stored finder
     output is re-graded once (`g3 --regrade`) with no new finder call.
   - **Auth/credit:** a confirmed finder 401/402 makes the run not a G3 result and stops the series INCOMPLETE
     (auth/credit).
   - Row cost and latency are recorded as information only. G3 has no cost criterion.

3. **Reliability #247 (A5).** `pr247` × 2: **both** valid. An invalid #247 run is `FAIL (reliability #247)`.
4. **G1 — reliability #269.** `pr269` × 10: **≥ 9/10** valid. A second invalid run decides `FAIL (G1)` at once.
5. **Hand-read.** Every published finding of every valid #247 and #269 run is classified by the owner, with no
   cross-run deduplication. Every such run must pass hand-read (§2). The gate fails if any valid #247 or #269 run
   fails.
6. **Cost.** Monthly cost ≤ $10.00 (§2). It is decided finally after G5. Before G5, the only rejections are A6 after
   #247 and, once m247 and m269 are both final, the lower bound
   **53 × m247 + 8 × m269 + 13 × ($0.199620 / 2) > $10.00**. Equality does not reject. The initial projection
   exceeding $10.00 alone never produces `FAIL (cost)`.
7. **G5 — live.** §9.

### 4. Run order and probe

Run ids follow `g2-01`…`g2-05`, `pr247-01`, `pr247-02` and `pr269-01`…`pr269-10`. The runner enforces the order by
case, not by id. A paid id is never reused, and a run is never re-run or replaced.

0. `preflight` (free): T0 from `GET /api/v1/key`, glm-5.3 endpoint status for the listed providers, every input and
   manifest hash, and the forbidden environment. Then the owner authorizes the spend (§10).
1. **G2-01 alone, as the probe.** It must show all of these:
   - a valid run with exactly the expected configuration line;
   - at least one finder request;
   - for every finder request, a **reported** listed provider and a **reported** accepted model (A3);
   - reported reasoning tokens, and a reported cost;
   - complete cost telemetry, and no inline reasoning.

   Otherwise stop and ask. Either way the owner's `continue --for probe` is recorded before G2-02 starts.

2. G2-02..05.
3. G3, then its one re-grade only when the checker reports grader errors.
4. #247 × 2. Once both are settled, the A6 check (53 × m247 > $10.00 only).
5. G1 (#269 × 10).
6. `reconcile` after the last run, then `outcome`. It writes into § Results each gate's verdict, validity per run,
   m247, m269, the provisional projection, the pre-G5 lower bound, and T against the caps.

The first decisive failure ends the series as `FAIL (<gate>)`, and nothing more is spent on it.

### 5. Budget, admission and settlement

- **Budget: $4.50 in total.** Measurement pauses at **T ≥ $3.00** and stops hard at **$3.50**. **$1.00 is reserved
  for G5.** There is no automatic increase.
- **T0** is read once, by the first `preflight`. Later preflights never move it.
- **Admission, before every paid step** (`run`, `g3`, `g3 --regrade`), in this order:
  1. the manifest and the inputs match the seal, and the forbidden environment is clean;
  2. no earlier step is unsettled;
  3. at T ≥ $3.00, the step is refused until the owner's `continue --for pause` is recorded (once, after
     `reconcile`);
  4. T + P ≤ $3.50. A step that fails this test is not started: the series ends `INCOMPLETE (budget)`, and nothing is
     spent;
  5. a `started` line is written before any spend.
- **P:** the first step of each kind is estimated at clean $0.05, pr247 $0.25, pr269 $0.45, g3 $0.60 and regrade
  $0.10. After that, P = 2 × the largest settled cost of that kind so far.
- **A step that ends above $3.50** ends the series `INCOMPLETE (budget)`, and its overshoot is recorded.
- **Settlement:**
  - A run settles from telemetry at once when every finder request is priced, the judge is priced, no
    timeout-triggered retry happened, and no auth/credit failure is suspected.
  - Every other step is unsettled until `reconcile` settles it from the key counter. That includes every run without
    an artifact and every G3 step, because grading cost is not in the export.
  - `reconcile` reads the counter twice, ≥ 180 s apart. It attributes cumulative usage since T0 minus what is already
    settled.
  - It refuses to settle while the counter still moves, lags behind the settled sum, or lags behind the step's known
    cost by more than max($0.005, 2 %). It also refuses when nothing shows the step was counted.
- **One key, no other spending.** Usage on the key outside the series cannot be told apart, so it is conservatively
  counted into T. The key used for the series carries no concurrent spending.
- **Optional, owner:** an OpenRouter limit on that key at usage(T0) + $3.50. It is the only provider-enforced bound.
  Without it, the cap is enforced only at step boundaries.
- **Before G5:** T + $1.00 ≤ $4.50, otherwise G5 is `not measured (budget)`.

### 6. Stops

- **First decisive failure:** G2, G3, reliability #247, A6 or G1 ends the series as `FAIL (<gate>)`.
- **Probe:** any G2-01 problem of §4 stops for the owner.
- **G3 not a gate result** (§3): stops for the owner.
- **Pause:** at T ≥ $3.00. `reconcile` first, then the owner's `continue --for pause`.
- **Budget:** a refused T + P, or a step ending above $3.50, gives `INCOMPLETE (budget)`.
- **Auth/credit (owner decision 2026-10-14), pre-registered verbatim:** "A confirmed OpenRouter HTTP 401 or 402 stops
  further paid steps immediately as INCOMPLETE (auth/credit). The attempt remains recorded, and any incurred cost
  counts toward the spend budget. It does not consume a G2, #247 or G1 sample. No automatic replacement is allowed;
  resumption requires an explicit owner decision under a dated amendment recorded before further spending."
  - Confirmed and suspected are as in §2. Timeouts, truncation, parse failures and provider/model mismatches retain
    their existing invalid-run treatment.
  - Resumption is `continue --for auth-credit --amendment <ref> --note <text>`, once per stop.
- **Interrupted run:** a run interrupted by the operator is invalid, recorded and never re-run. A started step
  without a record blocks the series.
- **Refusals** (nothing spent; exit 2): a manifest or input mismatch, a forbidden variable, no preflight, an
  out-of-order step, a reused paid id.

### 7. Verdicts

The automatic outcome (`outcome`, Phases 5–6) carries exactly one label. The first matching rule wins:

1. `INCOMPLETE (budget)`: a budget stop, or settled spend above $3.50.
2. `INCOMPLETE (auth/credit)`: a confirmed 401/402 stop not resumed under an amendment.
3. `NOT ADMITTED (<gate>)`: the first failed gate of the sealed order (G2, G3, reliability #247, cost by A6, G1).
4. `NOT ADMITTED (cost)`: the measured series' pre-G5 lower bound exceeds $10.00.
5. `NOT ADMITTED (hand-read)` or `ADMITTED (pending G5)`: decided by the resolver's hand-read result. It must cover
   exactly the current valid #247 and #269 runs, with matching `review.json` sha256 and finding counts.

`ADMITTED (pending G5)` is never final admission. **`ADMITTED`** requires every gate to pass, G5 green, and the final
projection ≤ $10.00. A final projection above $10.00 is `NOT ADMITTED (cost)`. A G5 that is not green or not measured
blocks the merge until the owner decides. Without admission, production is unchanged, the PR closes unmerged and AI
review stays disabled.

### 8. Hand-read procedure (Phase 6)

1. `glm-gate-sheet.mjs sheet` writes `hand-read-247.md` and `hand-read-269.md`. Each published finding of each valid
   run gets one row, id `<runId>#F<k>`, with:
   - severity, category, `file:start-end`;
   - description and suggestion verbatim;
   - the run's `review.json` sha256;
   - an empty verdict.

   #269 rows citing `bread-spike.ts` are pre-flagged `D2?`, which is not a classification. Each sheet records its
   own sha256 as generated.

2. The owner fills every verdict: `accept`, `reject` or `D2` (#269 only). Blank or any other value is unresolved and
   counts as rejected. The agent may propose D2 matches; it never classifies.
3. `glm-gate-sheet.mjs resolve` reads the findings back from the stored `review.json` copies, each checked against
   its sha256, and computes each run's pass per §2.

### 9. G5 (Phase 7)

Runs only after `ADMITTED (pending G5)`, and touches no manifest file.

1. The owner deletes `vars.OPENROUTER_REVIEW_MODEL`, and `gh variable list` confirms it is absent.
2. Check T + $1.00 ≤ $4.50; otherwise `not measured (budget)`.
3. Every push is made while the PR is a draft.
4. The owner marks the PR ready and adds `ai-cr:review`.

**G5** is the first `AI Code Review` run after that. It passes when:

- G5 green holds (§2);
- the manifest files at the G5 head match the seal (`preflight --manifest-only`);
- every finder request in `review.json` `finderTelemetry.requests` has a **reported** provider in {Z.AI, Fireworks,
  Together} and a **reported** accepted model;
- `models.finder = z-ai/glm-5.3`;
- finder and judge costs are present;
- impl-review cost is present **if the impl-review ran**. If the verdict was `failed`, `implReview.skipped` is present
  instead: the skip is recorded and I stays $0.199620;
- the run's spend is in the ledger.

Then I is recomputed, only when the impl-review ran, and the projection is applied with the agreed formula. Every
later push to the ready PR is another paid review and is ledgered.

### 10. Seal and authorization

The seal authorizes no spending. Phase 5 begins only when the owner has read the free `preflight` and explicitly
authorized the paid series (plan Phase 5, Manual 5.5). The G2-01 probe and the $3.00 pause each need their own owner
go-ahead.

### 11. Included assumptions (A1–A8, verbatim from `plan.md`)

References to "§ Definitions" and "§ Phase 7" inside A1–A8 are to `plan.md`. Their content is restated in §2 and §9.

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

### 12. Amendments

- A protocol change after the seal goes into `## Amendments`, placed **after** the seal.
- Each amendment is dated and carries its own sha256, taken over its bytes from its `###` heading to its own
  `_End of …_` line. It is committed and pushed to `origin` **before** the measurement it affects.
- Amendments never edit this section; the seal check covers this section only.
- A change to any manifest file changes a hash, so the runner refuses every paid step until an amendment re-pins the
  manifest.
- A resumption after an auth/credit stop names its amendment (`--amendment <ref>`).

### 13. Seal procedure

1. The owner confirms the plan- and tooling-chosen terms one by one (§ Pre-registration seal) and approves this
   section, including A1–A8.
2. `npx prettier --check` passes on `gate.md`.
3. The sha256 of this section is taken as
   `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum`, with its UTC time.
4. The state is committed and pushed.
5. GitHub's push time is recorded from `GET /repos/{owner}/{repo}/activity?ref=refs/heads/feat/finder-glm-5-3`.
6. The annotated tag `finder-glm-5-3/seal` is created on the seal commit and pushed.
7. The seal is never recomputed. It is identified by its sha256, the push time and the tag, never by a branch SHA,
   which a rebase-merge rewrites.

_End of Pre-registration._

## Pre-registration seal

**Sealed 2026-10-14.** The owner confirmed the five plan- and tooling-chosen terms and approved the section as
written, with no edits before the seal. The hash below was then taken by §13 and is never recomputed. Nothing in this
section is part of the hashed bytes.

### Plan- and tooling-chosen terms (the owner confirms each one)

1. **Governance (§2):** after the seal, the pre-registration and its amendments govern; a later edit to `plan.md`
   does not change the gate. — Confirmed: owner (date: 2026-10-14)
2. **P (§5):** first-step estimates clean $0.05, pr247 $0.25, pr269 $0.45, g3 $0.60 and regrade $0.10; afterwards
   2 × the largest settled cost of that kind. — Confirmed: owner (date: 2026-10-14)
3. **Validity guards beyond the plan's wording (§1, §2):**
   - the exact configuration line;
   - the `models.finder` check;
   - the ten forbidden environment variables (the plan names two).

   — Confirmed: owner (date: 2026-10-14)

4. **Settlement (§5):** immediate settlement only from complete telemetry, and cumulative counter attribution in
   `reconcile`. The series key carries no concurrent spending. — Confirmed: owner (date: 2026-10-14)
5. **Order mechanics (§4, §6):**
   - the owner's `continue --for probe` before G2-02, whatever the probe showed;
   - G1 decided as soon as a second invalid run occurs;
   - a G3 run that is not a gate result stops for the owner;
   - run ids `g2-NN`, `pr247-NN`, `pr269-NN`.

   — Confirmed: owner (date: 2026-10-14)

### Approval and hash

- Owner approval: approved by the owner as written (date: 2026-10-14; no edits before the seal), including A1–A8
  and the five terms above.
- sha256 of `## Pre-registration` … `_End of Pre-registration._` (355 lines):
  **`1a34e2efa74771898d986c74f060fabf9b3d272816fd85ac10877aad2ea802f3`**, computed as
  `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum` after
  `npx prettier --check gate.md` passed.
- UTC time taken: **2026-10-14T20:16:36Z**.
- The hashed section binds `gate-manifest.json` by its sha256 `12989509…9272ee` (§1). No paid call of this change
  had been made when the hash was taken.
- GitHub's push time and the tag `finder-glm-5-3/seal` are recorded below once the push has happened. A commit
  cannot contain its own push time.

## Amendments

None.

## Results

<!-- glm-gate:outcome:start -->
<!-- glm-gate:outcome:end -->
