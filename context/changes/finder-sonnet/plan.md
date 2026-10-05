# finder-sonnet — sonnet-5 as the production finder Implementation Plan

## Overview

Make `anthropic/claude-sonnet-5` the production finder of the AI code review, pinned to OpenRouter's `anthropic`
endpoint. Measure it on two real PRs (#247, #269) against a gate written and sealed **before the first paid
call**, project the monthly cost from that measurement, and switch `ai-review` back on only if the owner admits
the result. This is the owner's decision of 2026-10-05 (`change.md` § Notes), a successor to
`finder-verification` (decision 4.4: none admitted).

## Current State Analysis

- **Master already runs this path.** The finder is one `ToolLoopAgent` with a strict `json_schema` output, a
  tool-less final step and `withOneRetry` (`packages/code-reviewer/src/reviewer.ts:144-198`, `pipeline.ts:574-577`).
  Sonnet-5 ran on it in August: 12/12 fixture rows, and the only live catch of the out-of-hunk defect
  (`context/archive/2026-08-10-finder-tool-loop-evals/decision.md:116, 228`). The judge runs on sonnet-5 on the
  same transport today. Origin: `code` + archived measurement.
- **The model is configuration.** `OPENROUTER_REVIEW_MODEL` outranks `DEFAULT_MODEL` (`config.ts:138-139`).
  - The variable reads `z-ai/glm-4.6`, checked with `gh variable list` on 2026-10-05.
  - `DEFAULT_MODEL = "z-ai/glm-4.6"` (`config.ts:14`), pinned as a literal by `config.test.ts:37`.
- **Routing.** Master routes every pass with `{require_parameters: true}` only (`config.ts:105-114`). The setting
  can be switched off by `OPENROUTER_REQUIRE_PARAMETERS=false`, which CI does not pass (`action.yml:86-89`).
  - `reviewer.ts` already has a `providerRouting` seam (`:68-71, :157`).
  - No finder-specific routing exists on master. The outage branch's resolver (`e5be9ff`, `b3a4a38`) defaults to
    `["novita"]`, and its `reviewer.ts` hunk conflicts with master, because it targets the two-stage finder
    (checked 2026-10-05).
- **Visibility.** The finder does not log the provider per step. `2e2ae19` adds that; its code part applies to
  master cleanly (checked 2026-10-05).
  - A failed run writes no `review.json` and no cost (`pipeline.ts:516-531`).
  - In CI the run step fails. The sticky comment and the `ai-cr:*` label keep the **previous** run's content
    (`action.yml:106-154`), so a failure can sit under an old "passed".
- **`ai-review` is off** through `false &&` (`.github/workflows/review.yml:23-29`, `68151b0`). Its comment names
  "the change that deploys a finder which passes those gates" as the one that removes it.
- **Measured facts** (`research.md` §2, §4): sonnet-5 @ `anthropic` lists `tools`, `structured_outputs` and
  `response_format`; it costs $2 / $10 per M; reasoning is on by default at `high`.
  - The strict schema carries `minLength`, which Anthropic's docs reject. August's successful run and today's
    judge carry it too, so it is a documented risk that has not been observed.
  - vercel/ai #21992 (2026-10-03) reports sonnet-5 not writing the final JSON in a tool loop.

## Definitions

| Term                               | Decided meaning                                                                                                                                                                                                                                                                                                           | Origin                                                                                             | On degenerate data                                                                                                                                                                                                                                         | Verified by |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Run                                | One production pipeline pass (finder → judge) through the production CLI, **including** its single built-in retry. No outer retry.                                                                                                                                                                                        | user (2026-10-05)                                                                                  | A run that hit a retry is still one run; retry use and its cost are recorded separately. An interrupted run is failed, never re-run.                                                                                                                       | 1.6, 3.x    |
| Valid run                          | The run produced `review.json` with a successfully parsed finder output **and** judge output.                                                                                                                                                                                                                             | user                                                                                               | Exhausted retries, a 4xx/5xx after the retry, `NoObjectGeneratedError`/`NoOutputGeneratedError` → invalid. An OpenRouter 401/402 or a runner crash is a **measurement error**, not a run result (stop, owner decides).                                     | 3.x         |
| Reliability gate                   | **Every** run valid. Each PR is run **twice**.                                                                                                                                                                                                                                                                            | user                                                                                               | One invalid run → FAIL. A run not executed for budget → evaluation **incomplete**, never pass.                                                                                                                                                             | 4.3         |
| Published finding                  | A finding in `review.json` `findings` (the finder's merged, deduplicated output; no verifier stage).                                                                                                                                                                                                                      | code (`pipeline.ts:594-641`), confirmed as the object of the owner's hand-read                     | `findings: []` → N = 0.                                                                                                                                                                                                                                    | 4.1         |
| Hand-read acceptance (per run)     | The owner classifies **every** published finding of the run. **Zero rejected**; unresolved = rejected.                                                                                                                                                                                                                    | user                                                                                               | **#247: N = 0 passes.** **#269: the run's published findings must include D2, confirmed to exist at the evaluated head; N ≥ 1 alone is insufficient.** Applied to **every** run.                                                                           | 4.1, 4.2    |
| D2                                 | `scripts/spikes/bread-spike.ts:178–214` (`localInput`): when the Files API accepts the upload but the response has no `urls.get`, the code exits before returning the uploaded file id, so `main`'s cleanup cannot delete the file and it stays in the Replicate account. Evidence `:189–195`.                            | user (owner classification of 2026-10-03, archived `finder-model-swap` `hand-read-269.md:23, :97`) | A finding matches D2 when it cites `bread-spike.ts` within `localInput`'s upload path or `main`'s cleanup **and** claims the uploaded file is not deleted (or leaks) on the missing-URL exit. The agent proposes matches; **the owner approves** each one. | 4.2         |
| Per-run cost                       | Finder + judge cost, including retries per pass, reconciled against the settled key-counter delta around the run. Telemetry provides the pass breakdown; missing costs remain unresolved until reconciliation.                                                                                                            | user; F4 triage                                                                                    | A failed or interrupted run still incurs spend. An unsettled or unexplained delta blocks the next paid run, including G5.                                                                                                                                  | 3.x         |
| Projected monthly cost             | **observed review runs** in the window × **measured mean per-run cost** (finder + judge, retries included) **+ review runs with a resolved plan** in the window × **measured mean impl-review cost**. Every plan-bearing run is assumed to pass code review: an explicit, conservative assumption. **Gate: ≤ $10/month.** | user (2026-10-05)                                                                                  | The outage's zero real impl-review executions must not zero the impl-review term. Actual historical spend is reported separately. The impl-review mean = #132's $0.199620, plus G5's impl-review cost if G5 actually runs one.                             | 2.2, 4.4    |
| Window                             | PRs created 2026-09-05 to 2026-10-04 (UTC), the owner's "62 PRs in the 30 days before 2026-10-05".                                                                                                                                                                                                                        | user                                                                                               | —                                                                                                                                                                                                                                                          | 2.2         |
| Observed review run                | A run of the `ai-review` job in the window that reached the review step (not the docs-only skip, not a job-level skip). Counted from the GitHub Actions run history in Phase 2.                                                                                                                                           | plan (owner-confirmed at the seal)                                                                 | The two research figures disagree (42 vs 72); Phase 2 counts once by this definition and records the query.                                                                                                                                                | 2.2         |
| Budget                             | **$3.00 in total**, covering all runs, retries and G5. **$0.50 is reserved for G5.** Before each measurement run: T + P(next run) + $0.50 ≤ $3.00; before G5: T + $0.50 ≤ $3.00. Otherwise stop as incomplete; no automatic increase.                                                                                     | user (2026-10-05); F4 triage                                                                       | T = max(key counter − T0, cumulative reconciled series spend), with both terms in USD since T0 and G5 included. Unresolved spend blocks further paid calls. The reserve is an estimate, not a cap.                                                         | 3.x, 5.x    |
| P (conservative next-run estimate) | First run on a PR: research HIGH estimate (#247 $0.33, #269 $0.73). Later run: 2 × its largest reconciled observed run cost.                                                                                                                                                                                              | plan (owner confirms at the seal); F4 triage                                                       | P is an estimate, not a guaranteed cap. Production permits one retry separately for finder, judge and impl-review; there is no single retry allowance for the whole pipeline.                                                                              | 3.x         |

## Desired End State

- `context/changes/finder-sonnet/gate.md` holds:
  - an **inputs freeze** and a **pre-registration sealed before the first paid call**, with the code-under-test
    hashes, definitions, gates, budget rule and run order;
  - **Results**: four run records, the ledger, the owner's hand-read, the cost projection, and exactly one verdict:
    `ADMITTED`, `NOT ADMITTED (<gate>)` or `INCOMPLETE (budget)`.
- `packages/code-reviewer`, merged to master only if admitted:
  - the finder defaults to `anthropic/claude-sonnet-5`, pinned to `only: ["anthropic"]`;
  - each finder step logs its provider;
  - the judge and impl-review routing are unchanged.
- `.github`:
  - a technical failure of the review replaces the sticky comment with a failure notice and removes
    `ai-cr:passed`;
  - `*.jsonl` is excluded from the reviewed diff;
  - **if admitted**, the `false &&` line is gone and G5 has passed on this change's own PR.
- **If not admitted:** production unchanged, `ai-review` stays off, and the record says why.

### Key Discoveries:

- `reviewer.ts:157` — `options.providerRouting ?? resolveProviderRouting()` is the seam a finder-specific resolver
  plugs into; the judge (`judge.ts:8`) keeps `resolveProviderRouting()`.
- `config.ts:112` — `resolveProviderRouting()` returns `undefined` when `OPENROUTER_REQUIRE_PARAMETERS=false`. The
  finder's pinned routing must **not** depend on that variable, so no environment setting can unpin it (the owner's
  "CI settings must not override").
- `action.yml:96-105` — production runs `npm run review` with `--diff-file`, `--out-dir`, `--source-root`,
  `--project-context-file` (the base branch's `.github/ai-review-rules.md`), and `PR_TITLE` / `PR_BODY` in the
  environment. The measurement drives this same entry point.
- `cli.ts:282-283` — a retry is logged as `retrying <pass> after …`. That is the runner's retry signal.
- `scripts/schema-dump.mjs` — the existing tool for printing the schema the provider receives (lesson "A provider's
  structured-output schema subset …").

## What We're NOT Doing

- **No verifier stage** and no F-b work. They stay on `feat/finder-verification` for later, if false alarms appear
  (owner, `change.md` § Notes).
- **No cheap-finder search** and no other model, sonnet-5.5 included (legacy status recorded in `research.md` §2.2).
- **Not porting the two-stage finder** (`802a1e0`, `15b3f71`). It is not needed for Anthropic, and it adds a
  request per review (`research.md` §3).
- **No `reasoning` field.** The production default is measured as is (owner). `effort: 'low'` is a possible
  **later** experiment with a new quality assessment, only if the cost gate fails.
- **No routing change** for the judge or impl-review.
- **No `cache_control`, no step-budget change, no trigger change.** These are cost levers held back for a later
  change, only if the measurement needs them.
- **Not fixing the `minLength` risk blind.** The first run is the probe. A 400 there is a recorded failure and goes
  to the owner.
- **Not bringing the three archived finder folders to master** (`research.md` Open Question 6).
- **No re-run** of an interrupted or recorded run, and no automatic budget increase.

## Implementation Approach

Code first, with no network: the production change ships dark behind `false &&`, together with the measurement
runner. Then the inputs freeze, the pre-registration and the seal, which hash the code under test, so the sealed
text describes exactly what gets measured. Only then are the paid runs made, one at a time, with a budget check
before each. The owner hand-reads, the cost is projected, and the owner decides. Enabling is the last phase and
happens only on `ADMITTED`. Its first CI run (G5) is the live probe on a real PR that the lesson "An offline eval
proves capability exists, not that it will be used" requires.

## Critical Implementation Details

- **Seal after code, before money.** The pre-registration includes the sha256 of `src/config.ts`, `src/reviewer.ts`,
  `src/prompts.ts`, `src/schemas.ts`, the emitted finder wire schema and the runner, plus the git tree of
  `packages/code-reviewer/src`. Any code change after the seal is a dated, hashed amendment pushed before the run
  it affects. The runner refuses to start when that tree has uncommitted changes.
- **The first paid run is the probe.** Run 1 is #247: it is cheap, and no finder has ever seen it. It is where a
  `minLength` 400, a missing final JSON (#21992) or "structured_outputs not supported in your workspace" would
  appear. Any of them makes run 1 invalid, so reliability FAILs. Stop, and report the raw error text first
  (lesson: capture the raw response before theorising).

## Phase 1: Production code and measurement runner (no network)

### Overview

Everything that will run in production, plus the runner, built dark. `false &&` stays.

### Changes Required:

#### 1. Finder model default

**File**: `packages/code-reviewer/src/config.ts`, `src/config.test.ts`, `src/schemas.ts` (comment only)

**Intent**: Make sonnet-5 the finder default. Update the comment's rule (default = repo variable) and the record
of why it changed, and the stale fallback comment at `schemas.ts:20-23`.

**Contract**: `DEFAULT_MODEL = "anthropic/claude-sonnet-5"`, with the literal assertion at `config.test.ts:37`
updated. Precedence unchanged.

#### 2. Finder routing pinned to `anthropic`

**File**: `src/config.ts`, `src/reviewer.ts`, `src/provider-routing.test.ts`

**Intent**: Pin the finder, and only the finder, to OpenRouter's `anthropic` endpoint in both measurement and
production. No environment variable can change or remove the pin.

**Contract**:

- **Resolver.** `resolveFinderProviderRouting()` returns
  `{only: ["anthropic"], order: ["anthropic"], allow_fallbacks: false, require_parameters: true}`. It is ported by
  hand from `e5be9ff`/`b3a4a38` **without** the `novita` default and **without** the `OPENROUTER_FINDER_PROVIDERS`
  override, and it does not read `OPENROUTER_REQUIRE_PARAMETERS`.
- **Wiring.** `createReviewer` uses it when no `providerRouting` override is passed. The judge and impl-review keep
  `resolveProviderRouting()`.
- **Tests:**
  - the finder request body carries exactly that `provider` object;
  - it is unchanged when `OPENROUTER_REQUIRE_PARAMETERS=false` or `OPENROUTER_FINDER_PROVIDERS` is set;
  - the judge's routing is unchanged.

#### 3. Provider and finish reason per finder step

**File**: `src/cli.ts`, `src/cli.test.ts`, `src/pipeline.ts`, `src/pipeline.test.ts`

**Intent**: Make the actual endpoint visible in the log, and the rejected output attributable (owner: "record the
actual provider when available").

**Contract**: the code part of `2e2ae19`, applied with a path-limited cherry-pick (`git show 2e2ae19 -- packages |
git apply --3way`). It applied cleanly on 2026-10-05. Its tests come with it.

#### 4. Diff exclusion for JSONL records

**File**: `.github/workflows/review.yml`

**Intent**: Keep this change's own run records out of its reviewed diff (lesson "A large committed artifact
silently blinds the AI review").

**Contract**: the code part of `5d72458`, which adds `**/*.jsonl` to the exclusion list.

#### 5. A technical failure cannot look like a result

**File**: `.github/actions/ai-review/action.yml`

**Intent**: Meet the owner's condition for pinning: "the error is visible and does not look like 'no remarks'".
Today a failed run leaves the previous sticky comment and the `ai-cr:passed` label in place.

**Contract**: when the review step fails, a step under `if: failure()`:

- upserts the sticky comment (same marker and same bot filter as the success path) with a fixed notice: the review
  did **not** run to completion, with no verdict, the run URL and a pointer to the `ai-cr:review` re-run label;
- removes `ai-cr:passed`, tolerating its absence;
- never adds `ai-cr:failed` (a failure is not a verdict);
- leaves the job red.

#### 6. Measurement runner

**File**: `packages/code-reviewer/scripts/sonnet-gate.mjs` (new) + `scripts/sonnet-gate.test.mjs`

**Intent**: Run one sealed measurement run through the production entry point, and record it whether it succeeds,
fails or is interrupted (lesson "A guard metric that only exists on success cannot detect failure").

**Contract**:

- **Arguments:** `--run-id <pr>-r<k>`, `--diff`, `--rules`, `--source-root`, `--pr-meta <json with title/body>`,
  `--out <series.jsonl>`. It runs `npm run review` with the production arguments and environment (no plan file,
  model and routing from the defaults).
- **Configuration pre-flight:** before any paid call, resolve the effective finder and judge models, finder
  routing and finder step limit using the same environment as the child CLI, including the package's `.env`
  loading and inherited environment precedence. Compare them with the sealed global configuration and refuse
  to start on any mismatch. Pass the checked effective environment to the child so the CLI cannot resolve a
  different configuration after the check.
- **Before the paid call** it writes a `started` line.
- **The record line** holds:
  - the date, the model id from `review.json` `models.finder` and `models.judge`, and the routing object sent;
  - every finder step's provider (from the step log);
  - retries counted separately per pass (`retrying <pass>` lines);
  - valid / invalid and the error class (model-attributable vs measurement error);
  - finder, judge and total cost, `costSource`, counter readings and their times, and reconciliation status;
  - `findings`, the run's verdict and its duration;
  - the sha256 of the inputs, and the code hashes and `src` tree.
- **It refuses to run** when:
  - the `run-id` is already recorded or started;
  - `packages/code-reviewer/src` has uncommitted changes;
  - an input hash differs from the sealed input manifest for the PR identified by `run-id`;
  - a code or effective configuration hash differs from the series' sealed global manifest;
  - any earlier paid run has unresolved or unsettled cost.
- **Exit codes:** 0 for a valid run, 1 for an invalid run, 3 for a measurement error, 2 for a usage error. Each one
  prints a one-line state, subject and way out (lesson "A check that cannot say what it found").
- **Tests:** a recorded run-id refuses; a dirty `src` refuses; a stub run with a retry line counts one retry; a
  stub run with no `review.json` is invalid; a stub 402 is a measurement error. All without network, using a fake
  CLI. Also test that `247-r1` → `269-r1` → `247-r2` accepts each PR's distinct sealed inputs, while a changed
  input for either PR is refused before the CLI starts.
  Test that an unexpected model override from inherited environment or the package's `.env` prevents CLI
  execution before any paid call.
  Test that partial telemetry after a retry and a lagging counter leave spend unresolved and block the next
  CLI invocation; reconciliation uses cumulative series totals without counting telemetry and counter twice.

#### 7. Wire-schema dump

**File**: `scripts/schema-dump.mjs` (extend)

**Intent**: Print the exact finder `review_result` schema the provider receives, with its sha256, so the seal can
record it and the probe can be read against it.

**Contract**: one extra block that prints the full finder output JSON Schema and its sha256. No other output
changes.

**Invocation**: from `packages/code-reviewer`, run `./node_modules/.bin/tsx scripts/schema-dump.mjs`.
Use this same command for verification and seal generation; plain `node` cannot resolve the script's `.js`
imports to the TypeScript sources.

### Success Criteria:

#### Automated Verification:

- Package tests, typecheck and lint pass: `npm test`, `npm run typecheck`, `npm run lint` (in `packages/code-reviewer`)
- Root format check passes: `npm run format:check`
- `config.test.ts` asserts `DEFAULT_MODEL === "anthropic/claude-sonnet-5"`, and the routing tests prove the pin survives both environment variables
- The `false &&` line is still present in `review.yml`
- `./node_modules/.bin/tsx scripts/schema-dump.mjs` (from `packages/code-reviewer`) prints the finder wire schema and its sha256

#### Manual Verification:

- The owner reads the failure-notice text and agrees it cannot be read as "no remarks"

**Implementation Note**: Manual checks are acceptance. `/rune-implement` commits a phase once its automated
verification passes, then asks about these. Phase blocks use plain bullets; the checkboxes live in `## Progress`.

---

## Phase 2: Inputs freeze, pre-registration and seal (no paid calls)

### Overview

Fix every byte the runs will see, the gate, and the arithmetic, before any money moves.

### Changes Required:

#### 1. Inputs freeze

**File**: `context/changes/finder-sonnet/gate.md` § Inputs freeze. The inputs live in a local scratch directory and
are not committed.

**Intent**: Pin the inputs exactly as production would build them.

**Contract**, per PR (#247: base `d097949…`, head `dec09f8…`; #269: base `3d0adc1…`, head `fca2778…`):

- the diff from the recipe of `review.yml`'s exclusions (as frozen in `finder-verification`), with its bytes and
  sha256, reproducing #247 10,838 B `21973af3…2e1` and #269 65,455 B `1e4ec088…550f`, or explaining a difference;
- the rules from `git show <base>:.github/ai-review-rules.md`, with bytes and sha256;
- the PR title and body from `gh pr view` saved as JSON, with sha256;
- the source root: a clean detached worktree at the head;
- a statement that no finder output exists for #247 (`finder-verification` `gate.md` § Inputs freeze).

#### 2. Window counts (free)

**File**: `gate.md` § Pre-registration §Cost

**Intent**: Turn the cost formula's two counts into recorded numbers before any cost exists.

**Contract**: using `gh api` over `review.yml` workflow runs for PRs created in the window, record:

- the query;
- **observed review runs**, by the Definitions rule;
- **review runs with a resolved plan** (the workflow's plan-resolution step found a plan);
- the docs-only and job-level skips;
- the actual historical review spend, reported separately as information.

The 42 / 72 discrepancy in `research.md` is resolved here and stated.

#### 3. Pre-registration

**File**: `gate.md` § Pre-registration

**Intent**: The sealed protocol.

**Contract**:

- **Arm:** finder `anthropic/claude-sonnet-5` @ `anthropic`, no `reasoning` field; judge production
  (`OPENROUTER_JUDGE_MODEL` = `anthropic/claude-sonnet-5`, routing unchanged).
- **Effective configuration:** record the resolved finder and judge models, finder routing and finder step
  limit, plus the environment-loading and precedence policy used by both the runner pre-flight and child CLI.
- **Code hashes** (Phase 1 §6–§7).
- **Every Definitions row.**
- **Run order:** `247-r1` (probe) → `269-r1` → `247-r2` → `269-r2`.
- **Gates:** reliability (every run valid); hand-read (per run, Definitions); cost (projected ≤ $10/month).
- **Budget rule and P.**
- **Stop rules:** an invalid run → stop after it, the owner decides whether the series continues as information; a
  measurement error → stop, fix by amendment; the budget → incomplete.
- **Verdict labels:** `ADMITTED`, `NOT ADMITTED (reliability | hand-read <PR> | cost)`, `INCOMPLETE (budget)`,
  `failed run — measurement error`.

#### 4. Seal

**File**: `gate.md` § Pre-registration seal

**Intent**: Prove the protocol predates every result.

**Contract**:

1. The owner confirms the plan-chosen terms one by one: P; the "observed review run" definition; the D2 match
   criterion; the stop rule after an invalid run.
2. The owner approves.
3. The sha256 of the section is recorded, with its UTC time, then committed and pushed.
4. GitHub's push time is recorded, and an annotated tag `finder-sonnet/seal` is pushed before any paid call.
5. The seal is never recomputed.

### Success Criteria:

#### Automated Verification:

- Each frozen diff, rules file and metadata file reproduces its recorded sha256; each worktree `HEAD` equals its recorded head
- `gate.md` § Pre-registration has no placeholder, and its hashes match a fresh `./node_modules/.bin/tsx scripts/schema-dump.mjs` invocation from `packages/code-reviewer` and `sha256sum` of the sealed code files at HEAD
- `git ls-remote --tags origin finder-sonnet/seal` shows the tag

#### Manual Verification:

- The owner confirms the plan-chosen terms and approves the pre-registration
- The seal's push time is recorded before any paid call

---

## Phase 3: Measurement (paid)

### Overview

Four runs in the sealed order, each one gated by the budget rule.

### Changes Required:

#### 1. Pre-flight

**File**: `gate.md` § Results

**Intent**: Prove that the seal holds and the world has not moved.

**Contract**:

- the seal hash recomputes; the code hashes and the `src` tree equal the seal; the inputs re-verify;
- the public endpoint list for sonnet-5 @ `anthropic` still lists `tools`, `structured_outputs` and
  `response_format`, prices are $2 / $10, and `reasoning.mandatory` is false;
- T0 is read from `GET /api/v1/key`, with its time.

A changed price, a lost parameter, `mandatory: true` or a seal mismatch → stop and ask.

#### 2. Runs

**Files**: `gate-sonnet-runs.jsonl`, `gate.md` § Results (ledger)

**Intent**: Measure under the sealed rules.

**Contract**:

- **Before each run:** check T + P + $0.50 ≤ $3.00 and write it to the ledger. If it does not fit, stop and the
  label is `INCOMPLETE (budget)`.
- **For each run:** read the counter before and after; write the ledger row (counter, telemetry by pass, retries,
  provider per finder step, T carried, valid or invalid); commit the JSONL line and the ledger row by explicit
  path, and push.
- **Cost reconciliation:** reconcile telemetry with the settled counter delta before another paid run,
  including G5. An immediate counter reading alone does not establish settlement. Record the evidence for
  settlement and explain discrepancies, including missing costs from failed attempts. If settlement or cost
  attribution cannot be established, stop and ask rather than treating missing cost as zero. Keep T cumulative
  from T0, including failed and interrupted runs and G5; never add telemetry to the same counter delta twice.
- **Long runs** go in the background.
- **The sealed stop rules apply**, and the first invalid run is reported to the owner with its raw error text.

### Success Criteria:

#### Automated Verification:

- `gate-sonnet-runs.jsonl` has one record per started run, and no run-id appears twice
- Every ledger row shows T + P + $0.50 ≤ $3.00 at its start
- The counter never exceeded T0 + $3.00

#### Manual Verification:

- The owner confirmed every stop before anything more was spent

---

## Phase 4: Hand-read, cost projection, decision

### Overview

The owner's quality read on every published finding, the sealed cost formula, and one verdict.

### Changes Required:

#### 1. Hand-read

**File**: `hand-read-247.md`, `hand-read-269.md`, `gate.md`

**Intent**: Apply the per-run acceptance rule.

**Contract**:

1. **Agent:** for each PR, list every published finding of every valid run. Deduplicate blind (same claim and
   location → one row; contradictory wordings split), keeping each run's membership. Propose D2 matches on #269.
2. **Owner:** approve the merges and the D2 matches.
3. **Agent (optional):** pre-sort the rows against the head.
4. **Owner:** classify **every** row as real or rejected, with a one-sentence reason; unresolved = rejected.
5. **Per run:** zero rejected; #247 may have N = 0; #269 must contain a finding matched to D2 that the owner
   confirmed.

#### 2. Cost projection

**File**: `gate.md` § Results

**Intent**: The sealed formula.

**Contract**:

- **Mean per-run cost** over the valid and invalid runs that were executed (retries included).
- **Projected monthly cost** = observed review runs × mean + plan-bearing runs × the impl-review mean ($0.199620,
  averaged with G5's impl-review only after G5 runs).
- The historical spend in the window is reported separately.
- A size-bucket breakdown is reported **for information**: the measured runs come from a 10.8 KB and a 65 KB diff,
  while most reviewable PRs have 50 lines or fewer, so the mean is likely conservative.

#### 3. Verdict and decision

**File**: `gate.md`, `change.md`

**Intent**: One label; the owner admits or not.

**Contract**:

- `ADMITTED` only when reliability, the hand-read on both PRs and cost all pass.
- If **cost is the only failure**, the record names the next experiment (`effort: 'low'` with a new quality
  assessment) as a separate change. Nothing changes automatically.
- `change.md` records the owner's decision.
- **Not admitted:** production unchanged and `ai-review` off; Phase 5 does not run, and the dark code from Phase 1
  stays unmerged on the branch.

### Success Criteria:

#### Automated Verification:

- Every published finding of every valid run appears in exactly one hand-read row (a script check over `gate-sonnet-runs.jsonl` and the tables)
- The projection recomputes from the recorded counts and costs

#### Manual Verification:

- The owner approved the dedup and D2 matches before classifying
- The owner classified every row
- The owner records the decision; exactly one verdict label

---

## Phase 5: Enable and G5 (only on ADMITTED)

### Overview

Turn the review back on, and prove it on this change's own PR.

### Changes Required:

#### 1. Remove the skip

**File**: `.github/workflows/review.yml`

**Intent**: The change whose finder passed the gates removes the `false &&` line, as its comment prescribes.

**Contract**: remove only the `false &&` line, and rewrite only the comment's first sentence to record the
re-enable and this change. Nothing else changes.

#### 2. Repository variable

**Intent**: Make the code default the one that runs (the 2026-08-12 ruling).

**Contract**:

- The **owner** deletes `OPENROUTER_REVIEW_MODEL` in the GitHub UI, never with `gh variable set` from a
  non-interactive shell, which writes an empty value (`decision.md:208-211`).
- `gh variable list` then shows no `OPENROUTER_REVIEW_MODEL`.
- `OPENROUTER_JUDGE_MODEL` stays.

#### 3. PR and G5

**Intent**: The live probe on a real PR (lesson "An offline eval proves capability exists, not that it will be
used").

**Contract**:

1. Open a draft PR to master. Its body has a `Plan:` line and names the predecessor changes.
2. Before marking it ready, check T + $0.50 ≤ $3.00; otherwise G5 is `not measured (budget)` and the merge is
   blocked until the owner decides.
   After the budget check, mark the PR ready and add the `ai-cr:review` label to trigger G5 through the existing
   `labeled` event. Marking a draft ready alone does not trigger this workflow.
3. **G5** is the first `AI Code Review` run on the PR. It passes when all of these hold:
   - the run is valid (comment and label rendered);
   - every finder step logs `provider=Anthropic`;
   - `models.finder` is `anthropic/claude-sonnet-5`;
   - `finderTelemetry.cost` and `judgeTelemetry.cost` are present;
   - the run's spend is in the ledger.

   Its verdict about this PR's own diff is advisory, not a gate.

4. If impl-review ran, its cost joins the impl-review mean. After G5, recompute the monthly projection and
   recheck the cost gate before merge. If the projection exceeds $10/month, replace the verdict with
   `NOT ADMITTED (cost)`, record the updated decision in `gate.md` and `change.md`, and block merge. The earlier
   `ADMITTED` decision does not override this final cost check.

### Success Criteria:

#### Automated Verification:

- Package tests, typecheck, lint and the root format check pass on the rebased branch
- The `review.yml` diff against master removes exactly the `false &&` line and rewrites the comment's first sentence (plus Phase 1's `*.jsonl` lines)
- PR checks `ci`, `integration`, `e2e` and `code-reviewer` are green
- The post-G5 monthly projection recomputes from the recorded costs and is ≤ $10/month before merge

#### Manual Verification:

- The owner deleted `OPENROUTER_REVIEW_MODEL` before G5
- G5 is recorded in `gate.md` and passes
- The owner merges

---

## Testing Strategy

### Unit Tests:

- Routing: the finder pin is exact, survives both environment variables, and the judge is unchanged.
- `DEFAULT_MODEL` literal.
- The `2e2ae19` tests, which come with the port.
- Runner: refusal on a recorded run-id and on a dirty tree, retry counting, invalid runs without `review.json`,
  402 as a measurement error, the exit codes. A fake CLI, no network.

### Integration Tests:

- The failure-notice step is exercised on G5 only if G5 fails. Otherwise its behaviour is covered by reading the
  action, which is a manual check in Phase 1.

### Manual Testing Steps:

1. Read the failure-notice text (Phase 1).
2. Hand-read every published finding (Phase 4).
3. Watch G5's comment, log and label on the PR (Phase 5).

## Performance Considerations

- Sonnet-5 with adaptive thinking can produce long outputs: one August fixture row wrote 18,408 tokens, against a
  per-step cap of 16,384.
- The finder's 300 s timeout and its single retry stay as they are. A timeout is a recorded invalid run.

## Migration Notes

- **If admitted:** the owner deletes `OPENROUTER_REVIEW_MODEL`, and the code default takes over.
- **Rollback:** restore the `false &&` line, or re-add the variable to a model id.
- The dark Phase 1 code changes nothing while `false &&` is present.

## References

- Research: `context/changes/finder-sonnet/research.md`
- Sonnet-5 decision trail: `context/archive/2026-08-10-finder-tool-loop-evals/decision.md`
- Hand-read method and D2: `feat/finder-verification:context/archive/2026-10-02-finder-model-swap/hand-read-269.md`
- Frozen #247/#269 recipes: `feat/finder-verification:context/archive/2026-10-03-finder-verification/gate.md` § Inputs freeze
- Routing source: `e5be9ff`, `b3a4a38`; log attribution `2e2ae19`; JSONL exclusion `5d72458`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Production code and measurement runner (no network)

#### Automated

- [x] 1.1 Package tests, typecheck and lint pass — 33fdb79
- [x] 1.2 Root format check passes — 33fdb79
- [x] 1.3 DEFAULT_MODEL literal and the routing pin tests pass — 33fdb79
- [x] 1.4 The false && line is still present — 33fdb79
- [x] 1.5 schema-dump prints the finder wire schema and its sha256 — 33fdb79

#### Manual

- [x] 1.6 Owner agrees the failure notice cannot read as "no remarks"

### Phase 2: Inputs freeze, pre-registration and seal (no paid calls)

#### Automated

- [ ] 2.1 Frozen inputs reproduce their sha256 and heads
- [ ] 2.2 Pre-registration has no placeholder and its code hashes match HEAD
- [ ] 2.3 The seal tag is on origin

#### Manual

- [ ] 2.4 Owner confirms the plan-chosen terms and approves the pre-registration
- [ ] 2.5 Seal push time recorded before any paid call

### Phase 3: Measurement (paid)

#### Automated

- [ ] 3.1 One record per started run, no duplicate run-id
- [ ] 3.2 Every ledger row satisfies the budget rule at its start
- [ ] 3.3 The counter never exceeded T0 + $3.00

#### Manual

- [ ] 3.4 Owner confirmed every stop before more was spent

### Phase 4: Hand-read, cost projection, decision

#### Automated

- [ ] 4.1 Every published finding appears in exactly one hand-read row
- [ ] 4.2 The projection recomputes from the recorded counts and costs

#### Manual

- [ ] 4.3 Owner approved dedup and D2 matches before classifying
- [ ] 4.4 Owner classified every row
- [ ] 4.5 Owner records the decision; exactly one verdict label

### Phase 5: Enable and G5 (only on ADMITTED)

#### Automated

- [ ] 5.1 Package checks pass on the rebased branch
- [ ] 5.2 review.yml diff removes only the false && line and rewrites the comment's first sentence
- [ ] 5.3 PR required checks green
- [ ] 5.7 Post-G5 monthly projection recomputes and is ≤ $10/month before merge

#### Manual

- [ ] 5.4 Owner deleted OPENROUTER_REVIEW_MODEL before G5
- [ ] 5.5 G5 recorded and passes
- [ ] 5.6 Owner merges
