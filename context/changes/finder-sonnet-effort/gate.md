# finder-sonnet-effort — pre-registered gate

> Plan: `context/changes/finder-sonnet-effort/plan.md`. Phase 2 writes the inputs freeze and the pre-registration
> and seals the pre-registration before any paid call. Phases 3–5 measure and decide against it.
> Owner decisions it carries (`change.md` § Notes and `plan.md` § Definitions): the 2026-10-06 choice to measure
> `anthropic/claude-sonnet-5` as the finder at OpenRouter `reasoning.effort` **low** and **medium**, the $4.00
> budget with a $0.50 G5 reserve, the balanced run order, the winner rule, and the unchanged ≤ $10/month cost gate.
>
> Predecessor gate: `context/archive/2026-10-05-finder-sonnet/gate.md` (verdict `NOT ADMITTED (reliability)` at
> the endpoint-default effort `high`).

## Inputs freeze

Taken **2026-10-07** (Phase 2), after Phase 1's code landed (`56983a2`, fixed in `26323d6`) and before any paid
call of this change. The predecessor's frozen inputs are reused: every file below was re-hashed and every recipe
re-run on 2026-10-07, and each reproduced the predecessor's recorded bytes and sha256. Nothing was rebuilt.

The diffs, rules files, PR metadata and worktrees live in `~/.cache/finder-sonnet-gate/` (kept by the owner since
the predecessor) and are not committed. **Any mismatch at measurement time stops the measurement** — the runner
refuses before the paid call (`sonnet-gate.mjs run`, input check).

**Diff recipe** (unchanged from the predecessor):

```
git diff <base>...<head> -- . ':(exclude,glob)**/reviews/*.md' ':(exclude,glob)**/results/*.json' \
  ':(exclude,glob)**/ground-truth/*' ':(exclude,glob)**/*.md' ':(exclude,glob)**/*.jsonl'
```

**Rules recipe:** `git show <base>:.github/ai-review-rules.md`. For both PRs it is byte-identical to the head's
copy (re-checked 2026-10-07).

**PR metadata recipe:** `gh pr view <n> --json title,body > meta.json`. Re-read 2026-10-07: both PRs' current
title and body reproduce the frozen bytes.

**Source root:** a clean detached worktree at `<head>`.

### #247

- **Base** `d097949bf217ecafb3333f63e757af67cc7daf07`; **head** `dec09f8d77b2f1ee45073c194d6cd8239a7d35c7`.
- **Diff:** `247/pr.diff`, 10,838 B, sha256 `21973af35cc39f60488935583a85baf894a6c1a9b51069d16de86e701b5dc2e1`;
  the recipe reproduces it.
- **Rules:** `247/rules.md`, 2,929 B, sha256 `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f`.
- **Metadata:** `247/meta.json`, 2,059 B, sha256
  `ec66879c3e33027ee2096677a4da060f5e68645c1fa3752ed376638cd9a24ff2`.
- **Source root:** `~/.cache/finder-sonnet-gate/wt-247`; `HEAD` = head, `git status --porcelain` empty.

### #269

- **Base** `3d0adc1b4910c31973c6ac98a7ce776fcb68d878`; **head** `fca2778742ec0bc02a84f42b23bf639fc32c7ad1`.
- **Diff:** `269/pr.diff`, 65,455 B, sha256 `1e4ec0882371989122f9e4254c93c4df1f51826a4f57dbfe04139175177e550f`;
  the recipe reproduces it.
- **Rules:** `269/rules.md`, 2,929 B, sha256 `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f`.
- **Metadata:** `269/meta.json`, 1,701 B, sha256
  `00b7b21bd2d48b73442796a257feafc21689a296584ba1989b6f406374da82e7`.
- **Source root:** `~/.cache/finder-sonnet-gate/wt-269`; `HEAD` = head, `git status --porcelain` empty.
- **D2 re-confirmed at the head (2026-10-07):** in the worktree's `scripts/spikes/bread-spike.ts`, `localInput`
  (`:167–196`) calls `process.exit(1)` at `:191–194` when the upload response has no `urls.get`, before
  returning `uploadedFileId: file.id` at `:195`, so `deleteUpload` (`:199–213`) never sees the file. The diff
  references `bread-spike.ts` 5 times.

### Run manifest

`context/changes/finder-sonnet-effort/gate-manifest.json` is what `sonnet-gate.mjs run --manifest` checks before
every paid call:

- `global`: the output of `sonnet-gate.mjs describe` at `26323d6`;
- `arms`: the outputs of `describe --arm low` and `describe --arm medium`;
- `runOrder`: the eight run ids of § Pre-registration §5;
- `inputs`: the per-PR hashes and heads above, unchanged from the predecessor's manifest;
- `budget`: `total 4`, `reserve 0.5`, `firstRunEstimate {247: 0.2, 269: 0.45}`.

It is Prettier-formatted before hashing, so the pre-commit hook cannot change its bytes.

- sha256 `ed78d1f4c32a1fb5cde3f00d20c09c2e24c3f09a62de90e9d0a4201acacb7ac0`.
- **Dry pre-flight, no network (2026-10-07).** `main(["run", …])` ran against this manifest with the real `git`,
  the package `.env`, a scratch series holding a placeholder T0, and a counter stub that throws.
  - `low-247-r1` passed every pre-network check and stopped at the first counter read: run id, sealed order,
    T0, clean `src`, inputs, clean source root, global manifest and arm configuration.
  - `medium-247-r1` refused as out of the sealed order. `low-247-r3` refused as not in the sealed order.
    `high-247-r1` refused as an unknown arm.
  - Child CLI invocations: 0. Nothing was spent.

## Pre-registration

### 1. Arms

Two arms, each one finder configuration. Everything except the finder's effort is production as sealed.

- **Finder:** `anthropic/claude-sonnet-5`, pinned to OpenRouter's `anthropic` endpoint
  (`resolveFinderProviderRouting()`), with request field `reasoning: {effort: <arm>}`, `<arm>` ∈ {`low`,
  `medium`}. It runs the production `ToolLoopAgent` with strict `json_schema` output, a tool-less final step,
  5 steps, a 16,384-token output cap per step and `withOneRetry`.
- **Judge:** production `anthropic/claude-sonnet-5` (`DEFAULT_JUDGE_MODEL`), routing unchanged
  (`resolveProviderRouting()`), with **no effort setting**.
- **No impl-review pass:** no plan file is passed. Its cost enters the projection only through §6.
- **Entry point:** `npm run review` in `packages/code-reviewer`, driven by `scripts/sonnet-gate.mjs run`. It
  passes the arguments `action.yml` passes plus `--finder-reasoning-effort <arm>`: `--diff-file`, `--out-dir`,
  `--source-root`, `--project-context-file`, and `PR_TITLE` / `PR_BODY` in the environment.
- **Dark default:** `DEFAULT_FINDER_REASONING_EFFORT` is `undefined`. Without the flag the CLI sends no
  `reasoning` field. Only the flag sets an arm.
- **Not varied:** the output cap, retry policy, step limit and loop. Each would be its own arm (predecessor's full
  review, § Dark code, item 1). A cap hit at low or medium is recorded and fails that arm.

### 2. Effective configuration

Resolved by `sonnet-gate.mjs describe --arm low|medium` at `26323d6` and pinned in `gate-manifest.json` §
`arms.<arm>`. The two arms are identical except `resolved.finder.reasoningEffort`:

- **finder:** model `anthropic/claude-sonnet-5`. Routing
  `{"only":["anthropic"],"order":["anthropic"],"allow_fallbacks":false,"require_parameters":true}`.
  `reasoningEffort` **`low`** or **`medium`**. Tool loop on, `maxSteps` 5, `maxOutputTokens` 16,384,
  `timeoutMs` 300,000.
- **judge:** model `anthropic/claude-sonnet-5`, routing `{"require_parameters":true}`, `maxOutputTokens` 16,384,
  `timeoutMs` 300,000.
- **implReview** (not run): model `anthropic/claude-sonnet-5`, `timeoutMs` 300,000, gate `code-review-passed`.
- **retry:** `withOneRetry`, one retry per pass on `TimeoutError`, `NoObjectGeneratedError` or HTTP 429/5xx. It
  never retries `NoOutputGeneratedError`. `sdkMaxRetries` 0.
- **Behaviour environment:** `REVIEW_FINDER_MAX_STEPS`, `REVIEW_FINDER_TIMEOUT_MS`, `REVIEW_JUDGE_TIMEOUT_MS`,
  `REVIEW_IMPL_REVIEW_TIMEOUT_MS`, `OPENROUTER_REQUIRE_PARAMETERS` are all unset. No `REVIEW_FINDER_MAX_STEPS`
  repository variable exists (`gh variable list`, 2026-10-07).
- **Environment policy** (runner pre-flight and child CLI alike): inherited environment >
  `packages/code-reviewer/.env` > code defaults. The runner resolves the arm under that merge with the CLI's and
  pipeline's own resolvers and hands the merged environment to the child.
- **Global manifest** (`describe` without `--arm`, § `global.effectiveConfig`): the same values with
  `reasoningEffort: null`, the dark default.
- **Child evidence, checked per run** (`classifyRun`):
  - The child's own `resolved configuration:` line must equal the sealed arm's `resolved`.
  - Every outbound finder request, including retries, must carry exactly the sealed `model`, `provider`,
    `reasoning: {effort: <arm>}` and `max_tokens` 16,384, as projected on the `finder request:` lines.
  - A missing or different line is a measurement error, not a run result.
  - This proves what the client sent, not what the provider applied.

### 3. Code under test

Taken at `26323d6`. Each equals `sha256sum` at that commit and `gate-manifest.json` § `global.codeHashes`:

| File                      | sha256                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| `src/config.ts`           | `16cb42e740f859f0d044997b9b16f8ceda4c085d4b16a4dbf45fede8c23cf65e` |
| `src/reviewer.ts`         | `d79c2e94281870f8dad5c5074b9f6139ac7688991f0ce4bb6f945b60ea42c289` |
| `src/prompts.ts`          | `fac7dc20fb3ae79d232e92e29a7a4dbcb4b40c509bffa3aba76a944f7e5ed3fa` |
| `src/schemas.ts`          | `fabb3f0bcc682d1489e7fdef66bdc2771465e30d24a07d0eb7cdc20387f34ec5` |
| `src/cli.ts`              | `776527240625a7cdfc44efffa5c330e40ea9eff036a3160daf3a5fd6fd60e690` |
| `scripts/sonnet-gate.mjs` | `869069b5a1ac33462184f4ee6f73681a8ec0faa0571b8d311972b1e668d1e8c1` |

- `src/cli.ts` is hashed because the runner parses its step, request and configuration lines.
- **Finder wire schema** (`review_result`, as `describe` computes it from `tolerantReviewOutput()`): sha256
  `a6e98d41add5055074b2a5556c512ddc9f5c6b5b1c3b0ad2eedb54cc43d095bf`. It **equals the predecessor's**: effort
  does not change the schema.
- **`packages/code-reviewer/src` git tree:** `bb21da6718c2f865295d8a8f61dadc9792923cbc`
  (`git rev-parse 26323d6:packages/code-reviewer/src`). The runner refuses to start when that directory has
  uncommitted changes.
- **Run manifest:** `gate-manifest.json`, sha256
  `ed78d1f4c32a1fb5cde3f00d20c09c2e24c3f09a62de90e9d0a4201acacb7ac0` (§ Inputs freeze).

### 4. Definitions

Restated from `plan.md` § Definitions; the plan's wording governs where the two differ.

- **Arm:** one finder configuration, sonnet-5 @ `anthropic` with finder `reasoning: {effort: <arm>}`, `<arm>` ∈
  {`low`, `medium`}. Everything else is production as sealed: judge unchanged, 16,384 cap, 5 steps,
  `withOneRetry`.
- **Run:** one production pipeline pass (finder → judge) through the production CLI for one arm and one PR.
  - It **includes** the single built-in retry per pass. There is no outer retry.
  - Run id `<arm>-<pr>-r<k>`.
  - A run that hit a retry is still one run; retry use is recorded.
  - An interrupted run is failed, never re-run.
- **Valid run:** `review.json` produced, with parsed finder **and** judge output.
  - Invalid: exhausted retries, a 4xx/5xx after the retry, `NoObjectGeneratedError` or `NoOutputGeneratedError`.
  - **Measurement error:** OpenRouter 401/402, a runner or CLI crash, or a child configuration or request that
    differs from the sealed arm. Stop; the owner decides. A measurement error is not a run result.
- **Reliability gate:** every executed run **of the arm** valid, with each PR run twice per arm.
  - One invalid run → that arm FAILS and ends; **the other arm continues**.
  - A run not executed for budget → the arm is INCOMPLETE, never PASS.
- **Published finding:** a finding in `review.json` `findings`. `findings: []` → N = 0.
- **Hand-read acceptance (per run):** the owner classifies **every** published finding. **Zero rejected**, and
  unresolved = rejected.
  - **#247:** N = 0 passes.
  - **#269:** the run's findings must include D2.
  - Applied to every valid run of the arm.
- **Blind classification:** the owner classifies rows without seeing which arm produced them. The arm key is
  revealed after every row is classified. A finding produced by both arms is one row with both memberships.
- **D2:** `scripts/spikes/bread-spike.ts:178–214` (`localInput`). The missing-`urls.get` exit leaks the
  uploaded file.
  - **Match:** the finding cites `bread-spike.ts` in `localInput`'s upload path or `main`'s cleanup, **and**
    claims the file is not deleted or leaks on that exit.
  - The agent proposes matches; **the owner approves** each one.
- **Per-run cost:** finder + judge cost, retries included, settled as the key-counter delta.
  - Settled by `reconcile`: two counter reads ≥ 180 s apart.
  - Unsettled or unexplained spend blocks the next paid call.
- **Projected monthly cost (per arm):** §6.
- **Winner:** if both arms pass all gates, the arm with the **lower projected monthly cost** wins; within
  $0.50, `low` wins.
  - If one arm passes, it wins even if the other is incomplete.
  - If neither passes, §10's precedence applies.
- **Budget** and **P:** §8.
- **Reasoning-volume anomaly:** a per-step heuristic, flagged to the owner before the next run. §9 gives the
  thresholds.
  - A flag is not an automatic verdict.
  - No flag does not prove the provider honoured the effort.
  - Requested effort and request-body evidence are recorded separately from observed tokens.
  - Ignored effort can stay below the threshold; correctly applied adaptive effort can exceed it.

### 5. Run order and probe

**Owner, 2026-10-06; sealed as `gate-manifest.json` § `runOrder`:**

1. Round 1: `low-247-r1` (probe) → `medium-247-r1` → `medium-269-r1` → `low-269-r1`.
2. Round 2: `medium-247-r2` → `low-247-r2` → `low-269-r2` → `medium-269-r2`.

How each run is carried out:

- One run at a time, through `sonnet-gate.mjs run` with this manifest.
- Series file: `--out context/changes/finder-sonnet-effort/gate-effort-runs.jsonl`.
- Artifacts: `--artifacts ~/.cache/finder-sonnet-effort-gate/runs/<run-id>/`, outside the repository.
- Inputs: the frozen files in `~/.cache/finder-sonnet-gate/` (§ Inputs freeze).
- Each run is reconciled before the next paid call: `sonnet-gate.mjs reconcile`, two counter reads ≥ 180 s apart.

How the runner enforces the order:

- It runs only the next eligible entry. An unsealed id (including any `r3`) is refused before the CLI starts, and
  so are an out-of-order id, a direct request for an ended arm, and an unknown arm.
- An arm that has ended, through an invalid run or a recorded budget skip, has its later entries skipped in place.
  The remaining arm keeps its sealed order.
- A started run without a terminal record blocks the series and is never replaced.

**The probe.** `low-247-r1` is the first run with an effort field on this endpoint. A provider rejection of
`reasoning.effort`, a missing final JSON or a `finish=length` would appear there. Any of them makes the run
invalid (or a measurement error), and the raw error text is reported to the owner first (the run's
`stderr.log`).

### 6. Cost

**Formula (per arm):** **53 × m247 + 8 × m269 + 13 × $0.199620**.

- **m247** and **m269** are the arm's mean per-run cost over its executed runs on that PR. Valid and invalid runs
  both count; finder + judge, retries included, settled.
- A PR with no executed run in the arm leaves that arm's projection INCOMPLETE. It is never zero and never
  passing.
- **Gate: ≤ $10.00/month**, which holds exactly when **53 × m247 + 8 × m269 ≤ $7.404940**. The impl-review term
  is 13 × $0.199620 = $2.595060.

**Reused, not re-measured** (assumption, stated). The counts 53 / 8 / 13 and the impl-review mean $0.199620 are
the predecessor's sealed figures (`context/archive/2026-10-05-finder-sonnet/gate.md` § Pre-registration §6, data
`gate-window-runs.tsv`, sha256 `45037f72e55b0ffafa4eade71a4b023b75b160f5f825502ff1d68c4bb0946efb`).

- They are the observed review runs of the window 2026-09-05 to 2026-10-04, size-assigned at the 38,146 B midpoint
  between the two frozen diffs.
- They are reused for comparability with the predecessor.
- The size assignment is an assumption, not a demonstrated cost bound.
- `ai-review` has been off since `68151b0`, so later days add no active-review demand observations. The baseline
  does not establish demand after re-enable.

**After G5** (plan Phase 5): the winner's projection is recomputed with m247/m269 unchanged.

- If G5 actually ran impl-review, the impl-review mean becomes `($0.199620 + G5 impl-review cost) / 2`;
  otherwise it stays $0.199620.
- Missing cost for an executed pass is unresolved, never zero.
- A breach replaces the verdict with `NOT ADMITTED (cost)`.

**Reported for information alongside the projection** (not gates): the size-assignment caveat; each arm's mean
reasoning and answer tokens; the high-effort predecessor's figures ($13.902662/month projected; m247 $0.162874).

### 7. Gates (per arm)

1. **Reliability:** every executed run of the arm valid, each PR run twice (§4).
2. **Hand-read #247:** every valid #247 run of the arm accepted (§4).
3. **Hand-read #269:** every valid #269 run of the arm accepted, including D2 (§4).
4. **Cost:** the arm's projected monthly cost ≤ $10.00 (§6).

An arm passes only when all four pass. The **winner rule** (§4) picks at most one passing arm. G5 (plan Phase 5)
is a further condition for merge, not for admission.

### 8. Budget and P

- **Budget: $4.00 in total**, covering all runs, retries and G5. **$0.50 is reserved for G5.**
- **Before each measurement run:** T + P(next run) + $0.50 ≤ $4.00.
- **Before G5:** T + $0.50 ≤ $4.00.
- No automatic increase.
- **T** = max(key counter − T0, Σ settled series spend), in USD since T0, G5 included.
  - Each run's settled cost is its counter delta, so telemetry and counter are never added for the same run.
  - Unresolved spend blocks further paid calls.
- **T0** is read once from `GET /api/v1/key` (`sonnet-gate.mjs t0`), with its time, in the Phase 3 pre-flight.
- **P**, computed per arm and PR. P is an estimate, not a cap.
  - **First run of an arm on a PR:** **#247 $0.20**, **#269 $0.45**. These are the predecessor's high-effort costs,
    rounded up, plus about $0.10 judge for #269.
  - **Later run:** 2 × that arm's largest settled cost on that PR.
- **A run that does not fit is not executed.** The runner records a non-paid `budget_skip` event for that run id.
  Its arm ends INCOMPLETE (budget), and its later entries are skipped.
- **Conditional affordability, not a worst-case bound.** Suppose each #247 run settles at $0.20 and each #269 run
  at $0.45.
  - The balanced order then reaches run 8 (`medium-269-r2`) with T = $2.15 and P = 2 × $0.45 = $0.90.
  - The check is T + P + $0.50 = $3.55 ≤ $4.00, so it fits.
  - The eight runs total $2.60; with $0.50 for G5, $3.10.
  - P is not a provider spending cap, and retries or outliers may force budget skips or exceed an estimate. The
    actual settled spend controls every admission check.
- Budget figures in `gate-manifest.json`: `total 4`, `reserve 0.5`, `firstRunEstimate {247: 0.2, 269: 0.45}`.

### 9. Stop rules

- **An invalid run** ends its arm: reliability FAILs and nothing later can change that. The owner is told, with the
  raw error text, before the next run (`sonnet-gate.mjs ack`). The other arm then continues in sealed order.
- **A measurement error** (exit 3) stops the series for the owner: an OpenRouter 401/402, a CLI crash, a
  finder-model mismatch, or a configuration or request mismatch against the sealed arm. Any fix needs a dated,
  hashed amendment pushed before the next run (§11). A measurement error is not a run result and does not by
  itself authorize resumption.
- **An effort flag** stops for the owner (`ack`) before the next run.
  - A step is flagged when its reported reasoning tokens exceed **3,604.7** for `low` (3,277 + 10%) or
    **9,011.2** for `medium` (8,192 + 10%).
  - A step is also flagged when its reasoning count is missing. `reasoning=?` is recorded as
    `reasoningTokens: null`, never as zero.
  - The reference values are OpenRouter's documented effort fractions (low 0.2, medium 0.5) of the 16,384 cap. They
    are not ceilings the provider promises for adaptive Sonnet-5.
- **Unsettled or unexplained spend:** no further paid call until `reconcile` settles it or the owner `resolve`s
  it.
- **Budget:** record a non-paid `budget_skip`. That run's arm ends INCOMPLETE (budget) and its later entries are
  skipped.
- **Phase 3 pre-flight:** stop and ask on any of these:
  - a seal, code, `src` tree or input mismatch;
  - a changed price (≠ $2 / $10 per M);
  - the `anthropic` endpoint losing `tools`, `structured_outputs`, `response_format` or `reasoning`;
  - `supported_efforts` no longer including `low` and `medium`.

### 10. Verdict labels and precedence

Exactly one overall label, chosen by this table. Each arm's outcomes are recorded alongside it:

| Per-arm outcomes                                                   | Overall label                                                | Required accompanying record                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| At least one arm passes all gates                                  | `ADMITTED (<winner>)`                                        | Apply the winner rule; record the other arm's outcomes, including budget incompleteness                                                            |
| No arm passes all gates, and at least one arm is budget-incomplete | `INCOMPLETE (budget)`                                        | Record which arm is incomplete and all established failures of either arm                                                                          |
| Both arms conclusively fail                                        | `NOT ADMITTED (low: <failed gates>; medium: <failed gates>)` | List every established failed gate per arm in order: reliability, hand-read #247, hand-read #269, cost; distinguish unmeasured gates from failures |

- A passing arm takes precedence over the other arm's budget-incomplete state. Without a passing arm, any
  budget-incomplete arm takes precedence over the NOT ADMITTED label.
- An invalid run conclusively fails its arm's reliability even when later scheduled runs are skipped.
- Missing valid #269 output cannot satisfy D2.
- Absent cost data never becomes a zero or a passing cost gate.
- A budget skip establishes INCOMPLETE for that arm, not a retrospective PASS.
- A run ending in a measurement error is recorded as `failed run — measurement error`; it is not a verdict, and
  this table does not authorize resumption or new runs.
- **Not admitted** (either non-ADMITTED label): production is unchanged and plan Phase 5 does not run.

### 11. Amendments

A protocol change after the seal goes into a `## Amendments` section placed **after** the seal.

- Each amendment is dated, carries its own sha256, and is committed and pushed to `origin` **before** the run it
  affects.
- Amendments never edit this section; the seal check covers this section only.
- A code change after the seal changes a code hash, so the runner refuses until an amendment re-pins the manifest.

### 12. Seal procedure

1. The owner confirms the three plan-chosen terms one by one (§ Pre-registration seal): P (§8), blind
   classification (§4), and the reasoning-volume anomaly flagging (§4, §9).
2. The owner approves this section.
3. The sha256 of this section is recorded with its UTC time, computed as
   `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum` after
   `npx prettier --check` passes on `gate.md` (the pre-commit hook must not change the hashed bytes). The state is
   then committed and pushed.
4. GitHub's push time is recorded (repository activity API). An annotated tag `finder-sonnet-effort/seal` on the
   seal commit is pushed before any paid call.
5. The seal is never recomputed.

_End of Pre-registration._

## Pre-registration seal

**Sealed 2026-10-07.** The owner confirmed the three plan-chosen terms one by one and approved the section. The
hash below was then taken by §12 and is never recomputed. Nothing in this section is part of the hashed bytes.

### Plan-chosen terms (the owner confirms each one)

1. P (§8): first run of an arm on a PR #247 $0.20 / #269 $0.45; later run 2 × that arm's largest settled cost on
   that PR. — Confirmed: owner (date: 2026-10-07)
2. Blind classification (§4): the owner classifies without seeing the arm; the key is revealed after every row
   is classified; a finding produced by both arms is one row. — Confirmed: owner (date: 2026-10-07)
3. Reasoning-volume anomaly flagging (§4, §9): thresholds 3,604.7 (`low`) and 9,011.2 (`medium`) reasoning tokens
   per step, or a missing count; a flag stops for the owner; it is not a verdict either way. — Confirmed: owner
   (date: 2026-10-07)

### Approval and hash

- Owner approval: approved by the owner as written (date: 2026-10-07; no edits before the seal).
- sha256 of `## Pre-registration` … `_End of Pre-registration._` (284 lines):
  **`9639b955e06e75244902b12348878196d534bc89aaba6e4f3db508a9b93a2c33`**, computed as
  `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum` after
  `npx prettier --check gate.md` passed.
- UTC time taken: **2026-10-07T19:15:53Z**.
- The seal commit, GitHub's push time and the tag `finder-sonnet-effort/seal` are recorded below once the push
  has happened. A commit cannot contain its own SHA.
- **Seal commit:** `794cfbe42ecf3889954d0df2a280ceec60ebdfa6`
  (`docs(finder-sonnet-effort): Inputs freeze, pre-registration and seal (no paid calls) (p2)`), on
  `origin/feat/finder-sonnet-effort`. Its committed `gate.md` reproduces the sha256 above, and its committed
  `gate-manifest.json` reproduces `ed78d1f4…acb7ac0`. Pre-push hook: typecheck and 418/418 unit tests passed.
- **GitHub push time: 2026-10-07T19:16:39Z.** Source:
  `GET /repos/Piotr-Miller/lumina-clean-ai/activity?ref=refs/heads/feat/finder-sonnet-effort`, event
  `branch_creation`, `0000000..794cfbe`, actor `Piotr-Miller`. `git ls-remote` showed `794cfbe` as the branch
  head. Recorded before any price re-read, T0 or paid call.
- **Rebase protection:** annotated tag **`finder-sonnet-effort/seal`** (tag object
  `c770b7b14b0e749a8f00843e3c7bd31d87098bcb`) on `794cfbe42ecf3889954d0df2a280ceec60ebdfa6`, pushed to `origin` on
  2026-10-07. `git ls-remote --tags origin 'finder-sonnet-effort/*'` shows it peeled to `794cfbe`. A later rebase
  or rebase-merge rewrites the seal commit's SHA; the tag keeps the sealed state reachable.

## Results

### Phase 3 pre-flight (2026-10-07, before any paid call)

- **Seal:** `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum` →
  `9639b955…a2c33`, both in the working tree and at the tag `finder-sonnet-effort/seal`. The tag is on `origin`
  (tag object `c770b7b…`, peeled to `794cfbe`). `gate-manifest.json` has no change against `HEAD` and reproduces
  `ed78d1f4…acb7ac0`.
- **Code:** at `794cfbe`, the six sealed files reproduce their §3 sha256 and
  `HEAD:packages/code-reviewer/src` is `bb21da67…3cbc`. `packages/code-reviewer/src` and `scripts` have no
  uncommitted changes. Fresh `sonnet-gate.mjs describe`, `describe --arm low` and `describe --arm medium` equal
  manifest `global`, `arms.low` and `arms.medium` as JSON.
- **Inputs:** all six frozen files in `~/.cache/finder-sonnet-gate/{247,269}/` reproduce their sha256 and byte
  counts (§ Inputs freeze). `wt-247` is at `dec09f8…` and `wt-269` at `fca2778…`, both clean.
- **Endpoint** (`GET /api/v1/models/anthropic/claude-sonnet-5/endpoints` and `GET /api/v1/models`, read
  2026-10-07T19:47:52Z):
  - the `anthropic` endpoint (`Anthropic | anthropic/claude-sonnet-5-20260630`, status 0) lists `tools`,
    `structured_outputs`, `response_format`, `reasoning` and `reasoning_effort`;
  - prompt `0.000002`, completion `0.00001` ($2 / $10 per M), unchanged;
  - model `reasoning`: `{"mandatory":false,"default_enabled":true,"supported_efforts":["max","xhigh","high","medium","low"],"default_effort":"high"}`,
    so `low` and `medium` are supported.
- **Retained responses**, outside the repository in `~/.cache/finder-sonnet-effort-gate/preflight/`:
  - `endpoints.json` (11,543 B, sha256 `80bdce61d06f2b73c1e17a4400dd33e7dab067b67e3ac0c1b1927e264203eb5d`);
  - `models.json` (777,720 B, sha256 `9a60065830e0a5a5bc6a5bdad8e89556fa85c0d8c30eb93ef298b62bed8581e8`);
  - `credits.json` (sha256 `1f8a2988b5640d68eecb9fe323a91f52631c28bc7f75933373326f7f9546f06e`) and `key.json`
    (sha256 `e3db0c3ccd08a9e995a2c0d0f32a57fcc4faad9b072c475278fdac2704dbe143`), both read 2026-10-07T19:48:00Z;
  - `describe.json`, `describe-low.json`, `describe-medium.json`.
- **T0:** key counter **$53.374463** (`53.374462781`) at **2026-10-07T19:48:06Z**, recorded by `sonnet-gate.mjs t0`
  as the first line of `gate-effort-runs.jsonl`.
  - Six seconds earlier, `/credits` read `total_credits` $60 and `total_usage` $53.374463, so **$6.63 remains**,
    more than the $4.00 budget.
  - `/key` read `usage_daily` $0: nothing else had spent on the key that UTC day.
  - The counter equals the predecessor's last settled reading ($53.374463, 2026-10-05T21:46:02Z), so nothing was
    spent between that series and this T0, the seal included.
- **Ceiling:** the counter must never exceed T0 + $4.00 = **$57.374463**.
- **Run artifacts** go to `~/.cache/finder-sonnet-effort-gate/runs/<run-id>/` (`--artifacts`), not committed.
  Each run's findings, verdict, steps, requests, retries and costs are in its JSONL record.

### Ledger

T = max(counter − T0, Σ settled run costs). Budget check before each run: T + P + $0.50 ≤ $4.00.

| Run             | Start (UTC) | T at start | P         | T + P + 0.50 | Counter before → after (settled) | Finder / judge telemetry          | Retries | Finder steps (provider, finish, out / reasoning)                                                                                                | Requested effort / sent                             | Effort flag | Outcome                                        | Settled cost              | T after   |
| --------------- | ----------- | ---------- | --------- | ------------ | -------------------------------- | --------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------- | ---------------------------------------------- | ------------------------- | --------- |
| `low-247-r1`    | 19:49:06    | $0.000000  | $0.20     | $0.700000    | $53.374463 → $53.432809          | $0.028610 / $0.029736 = $0.058346 | none    | 1 (Anthropic, `stop`, 1,224 / 441)                                                                                                              | `low` / `{"effort":"low"}` on 1 of 1 request        | none        | **valid**: 4 findings, verdict `failed`, 46 s  | $0.058346 (2nd reconcile) | $0.058346 |
| `medium-247-r1` | 19:56:50    | $0.058346  | $0.20     | $0.758346    | $53.432809 → $53.508583          | $0.051160 / $0.024614 = $0.075774 | none    | 1 (Anthropic, `stop`, 3,479 / 2,647)                                                                                                            | `medium` / `{"effort":"medium"}` on 1 of 1 request  | none        | **valid**: 3 findings, verdict `passed`, 61 s  | $0.075774 (2nd reconcile) | $0.134120 |
| `medium-269-r1` | 20:04:38    | $0.134120  | $0.45     | $1.084120    | $53.508583 → $53.771985          | $0.240660 / $0.022742 = $0.263402 | none    | 2 (Anthropic `tool-calls`, 2,056 / 1,935; Anthropic `stop`, 8,553 / 7,538)                                                                      | `medium` / `{"effort":"medium"}` on 2 of 2 requests | none        | **valid**: 4 findings, verdict `passed`, 139 s | $0.263402 (2nd reconcile) | $0.397522 |
| `low-269-r1`    | 20:13:56    | $0.397522  | $0.45     | $1.347522    | $53.771985 → $53.898091          | $0.103132 / $0.022974 = $0.126106 | none    | 1 (Anthropic, `stop`, 3,839 / 2,588)                                                                                                            | `low` / `{"effort":"low"}` on 1 of 1 request        | none        | **valid**: 4 findings, verdict `passed`, 61 s  | $0.126106 (2nd reconcile) | $0.523628 |
| `medium-247-r2` | 20:21:46    | $0.523628  | $0.151548 | $1.175176    | $53.898091 → $53.978049          | $0.042030 / $0.037928 = $0.079958 | none    | 1 (Anthropic, `stop`, 2,566 / 1,376)                                                                                                            | `medium` / `{"effort":"medium"}` on 1 of 1 request  | none        | **valid**: 6 findings, verdict `passed`, 62 s  | $0.079958 (2nd reconcile) | $0.603586 |
| `low-247-r2`    | 20:29:20    | $0.603586  | $0.116692 | $1.220278    | $53.978049 → $54.033661          | $0.029860 / $0.025752 = $0.055612 | none    | 1 (Anthropic, `stop`, 1,349 / 543)                                                                                                              | `low` / `{"effort":"low"}` on 1 of 1 request        | none        | **valid**: 4 findings, verdict `passed`, 38 s  | $0.055612 (2nd reconcile) | $0.659198 |
| `low-269-r2`    | 20:36:26    | $0.659198  | $0.252212 | $1.411410    | $54.033661 → $54.160839          | $0.104692 / $0.022486 = $0.127178 | none    | 1 (Anthropic, `stop`, 3,995 / 3,121)                                                                                                            | `low` / `{"effort":"low"}` on 1 of 1 request        | none        | **valid**: 4 findings, verdict `passed`, 62 s  | $0.127178 (2nd reconcile) | $0.786376 |
| `medium-269-r2` | 20:43:59    | $0.786376  | $0.526804 | $1.813180    | $54.160839 → $54.560493          | $0.369780 / $0.029874 = $0.399654 | none    | 4 (Anthropic `tool-calls`, 2,735 / 2,517; Anthropic `tool-calls`, 3,454 / 3,342; Anthropic `tool-calls`, 182 / 71; Anthropic `stop`, 1,019 / 0) | `medium` / `{"effort":"medium"}` on 4 of 4 requests | none        | **valid**: 3 findings, verdict `passed`, 111 s | $0.399654 (2nd reconcile) | $1.186030 |

**`low-247-r1` notes (the probe).** The probe passed. The endpoint accepted `reasoning.effort: "low"` with no
error. The finder answered in one step without a `getFileContext` call and wrote its final JSON
(`finish=stop`). Its reported reasoning count was 441 tokens, far below the 3,604.7 flag threshold. The child's
`resolved configuration:` line and its one `finder request:` line equal the sealed arm. The record's own
`counterAfter` (19:49:52Z) still read T0, the known counter lag. The first `reconcile` (19:50:02Z → 19:53:03Z)
saw the counter move $53.374463 → $53.432809 and recorded `unsettled`. The second (19:53:10Z → 19:56:10Z) read it
unmoved and settled the run at the delta, equal to telemetry.

**`medium-247-r1` notes.** One finder step without a `getFileContext` call, `finish=stop`, 2,647 reported reasoning
tokens against the 9,011.2 flag threshold. The child's configuration and its one finder request equal the sealed
`medium` arm. The first `reconcile` (19:58:01Z → 20:01:01Z) saw the counter move and recorded `unsettled`; the
second settled the run at the delta, equal to telemetry.

**`medium-269-r1` notes.** The predecessor's failure point did not recur at `medium`. Step 1 called
`getFileContext` for `src/lib/engines/types.ts` and `src/lib/engines/auto-params.ts` (`finish=tool-calls`).
Step 2, tool-less, wrote its final JSON with 8,553 output tokens, 7,538 of them reported reasoning, and ended
`finish=stop`, against a 16,384 cap and the 9,011.2 flag threshold. At `high`, the same step spent the full 16,384
and wrote nothing. Both finder requests carried the sealed `medium` settings. The first `reconcile`
(20:07:07Z → 20:10:07Z) saw the counter move and recorded `unsettled`; the second settled the run at the delta,
equal to telemetry.

**`low-269-r1` notes.** Unlike `medium-269-r1`, the finder made no `getFileContext` call: one step wrote its final
JSON (`finish=stop`) with 3,839 output tokens, 2,588 of them reported reasoning, against the 3,604.7 flag
threshold. The one finder request carried the sealed `low` settings. The first `reconcile` (20:15:10Z → 20:18:10Z)
saw the counter move and recorded `unsettled`; the second (20:18:11Z → 20:21:11Z) settled the run at the delta,
equal to telemetry. **Round 1 complete:** four runs, all valid, no retries, no effort flag; T $0.523628.

**`medium-247-r2` notes.** P was 2 × the arm's largest settled #247 cost ($0.075774). One finder step without a
`getFileContext` call, `finish=stop`, 1,376 reported reasoning tokens. The first `reconcile`
(20:22:49Z → 20:25:50Z) saw the counter move; the second (20:25:50Z → 20:28:50Z) settled at the delta, equal to
telemetry.

**`low-247-r2` notes.** P was 2 × the arm's largest settled #247 cost ($0.058346). One finder step without a
`getFileContext` call, `finish=stop`, 543 reported reasoning tokens. The first `reconcile` (20:29:58Z → 20:32:58Z)
saw the counter move; the second (20:32:59Z → 20:35:59Z) settled at the delta, equal to telemetry.

**`low-269-r2` notes.** P was 2 × the arm's largest settled #269 cost ($0.126106). One finder step without a
`getFileContext` call, `finish=stop`, 3,121 reported reasoning tokens: below the 3,604.7 threshold, and the
largest `low` step of the series. The first `reconcile` (20:37:28Z → 20:40:29Z) saw the counter move; the second
(20:40:29Z → 20:43:29Z) settled at the delta, equal to telemetry. **The `low` arm's four sealed runs are all
executed and valid.**

**`medium-269-r2` notes.** P was 2 × the arm's largest settled #269 cost ($0.263402). The finder used four of its
five steps: three `getFileContext` steps (`src/lib/engines/auto-params.ts:1-40` and
`src/lib/engines/auto-params.client.ts:1-40`; `scripts/s17/desktop-stats.ts:190-225`;
`scripts/s17/desktop-stats.ts:140-185`), then a tool-less step that wrote its final JSON (`finish=stop`). The
largest reported reasoning count was 3,342. Step 4 reported an explicit `reasoning=0`; under the sealed rule it is
recorded as `reasoningTokens: 0`, not as a missing count, and raises no flag. All four finder requests carried the
sealed `medium` settings. It is the most expensive run of the series, $0.399654, against $0.263402 for
`medium-269-r1`. The first `reconcile` (20:45:51Z → 20:48:51Z) saw the counter move; the second
(20:48:51Z → 20:51:51Z) settled at the delta, equal to telemetry.

### Series end (2026-10-07)

- **All eight sealed runs executed, in the sealed order, and all eight valid.** No retries, no effort flag, no
  measurement error, no budget skip, no owner stop.
- **Spend:** T = **$1.186030** of the $4.00 budget, the sum of the eight settled counter deltas. The last settled
  counter, $54.560493 (2026-10-07T20:51:51Z), equals T0 + T. The highest counter reading in the series is that
  same value, below the ceiling T0 + $4.00 = $57.374463. $2.813970 of the budget remains, $0.50 of it reserved
  for G5.
- **Per arm** (settled costs; information for Phase 4, not a projection):
  - `low`: #247 $0.058346, $0.055612; #269 $0.126106, $0.127178.
  - `medium`: #247 $0.075774, $0.079958; #269 $0.263402, $0.399654.
- **Largest reported reasoning per step:** `low` 3,121 (threshold 3,604.7); `medium` 7,538 (threshold 9,011.2). No
  step ended `finish=length`.
- **Phase 4** (blind hand-read, projections, verdict) works from the eight records in `gate-effort-runs.jsonl` and
  the run artifacts in `~/.cache/finder-sonnet-effort-gate/runs/`.

### Delegated blind classification and joined results (2026-10-07)

The owner instructed the agent to perform the pending classifications (“Zrob to”). The agent wrote an accepted/rejected decision and one-sentence reason for every row in `hand-read-247.md` and `hand-read-269.md` before opening `hand-read-key.json`. R247-13 was split before reveal: the short-PNG variant a is accepted as R247-13-PNG; JPEG variants b and c remain rejected as R247-13. This is delegated agent classification, not a claim that the owner personally classified each finding as the sealed protocol requires; the pre-registration and seal were not modified.

Coverage verified against the eight cached `review.json` files: all 32 published findings map exactly once across 26 rows, with no unclassified row or missing membership. The approved no-D2 decision is unchanged.

| Run             | Hand-read result from delegated classifications | Rejected rows                      |
| --------------- | ----------------------------------------------- | ---------------------------------- |
| `low-247-r1`    | FAIL                                            | R247-08, R247-13                   |
| `low-247-r2`    | FAIL                                            | R247-13                            |
| `medium-247-r1` | FAIL                                            | R247-03                            |
| `medium-247-r2` | FAIL                                            | R247-03, R247-07, R247-11, R247-14 |
| `low-269-r1`    | FAIL; D2 absent                                 | R269-06                            |
| `low-269-r2`    | FAIL; D2 absent                                 | none                               |
| `medium-269-r1` | FAIL; D2 absent                                 | none                               |
| `medium-269-r2` | FAIL; D2 absent                                 | R269-09                            |

The delegated results fail hand-read #247 for both arms as well as the already-established hand-read #269 failure from absent D2. The overall NOT ADMITTED outcome established by the approved D2 decision is unchanged; Phase 5 does not run. The projections and the owner’s decision follow in § Phase 4 — cost projection and § Verdict.

### Phase 4 — cost projection (§6, sealed formula)

Per arm, from the settled `reconcile` cost of each executed run in `gate-effort-runs.jsonl` (all eight valid, two
per arm and PR, no retries). **53 × m247 + 8 × m269 + 13 × $0.199620**; the impl-review term is $2.595060.

| Arm      | #247 settled costs   | m247      | #269 settled costs   | m269      | 53 × m247 | 8 × m269  | Projected / month | Gate ≤ $10.00 |
| -------- | -------------------- | --------- | -------------------- | --------- | --------- | --------- | ----------------- | ------------- |
| `low`    | $0.058346, $0.055612 | $0.056979 | $0.126106, $0.127178 | $0.126642 | $3.019887 | $1.013136 | **$6.628083**     | **PASS**      |
| `medium` | $0.075774, $0.079958 | $0.077866 | $0.263402, $0.399654 | $0.331528 | $4.126898 | $2.652224 | **$9.374182**     | **PASS**      |

Equivalently, 53 × m247 + 8 × m269 is $4.033023 (`low`) and $6.779122 (`medium`) against the $7.404940 limit.
Recomputed by a script that reads only the settled reconciliations and refuses an unsettled or missing run.

**Reported for information, not gates:**

- **Workload.** 53 / 8 / 13 are the predecessor's sealed historical workload (2026-09-05 to 2026-10-04), reused for
  comparison. They are not a measurement of demand after `ai-review` is re-enabled, and the size assignment at the
  38,146 B midpoint is an assumption, not a demonstrated cost bound.
- **Finder output tokens per run** (mean over the arm's four runs): `low` 2,602, of them 1,673 reasoning and 928
  answer; `medium` 6,011, of them 4,856 reasoning and 1,154 answer. Token volume does not show whether the provider
  applied the requested effort.
- **High-effort predecessor:** $13.902662/month projected, m247 $0.162874, and its #269 run invalid at the 16,384
  cap. At `medium` the #269 mean is $0.331528, with one run at $0.399654; at `low` both #269 runs stayed below
  $0.13.

### Verdict (owner, 2026-10-07)

**`NOT ADMITTED (low: hand-read #269; medium: hand-read #269)`**

Chosen by § Pre-registration §10: no arm passes all gates and neither is budget-incomplete, so both arms
conclusively fail. Gates in the sealed order:

| Gate           | `low`                                                                                    | `medium`                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Reliability    | **PASS**: 4 of 4 runs valid, each PR twice, no retries                                   | **PASS**: 4 of 4 runs valid, each PR twice, no retries                                   |
| Hand-read #247 | **Not established by the owner.** Delegated classification: both runs FAIL (information) | **Not established by the owner.** Delegated classification: both runs FAIL (information) |
| Hand-read #269 | **FAIL**: neither run published D2                                                       | **FAIL**: neither run published D2                                                       |
| Cost           | **PASS**: $6.628083/month                                                                | **PASS**: $9.374182/month                                                                |

- **Hand-read #269.** The owner approved, before classifying, that no #269 row matches D2 (`hand-read-269.md` §
  D2 match proposals). The only candidate, R269-10, holds one finding from one run and does not claim the leak on
  the missing-`urls.get` exit. Without D2 in every valid #269 run, the gate fails for both arms whatever the row
  classifications.
- **Hand-read #247.** Every row was classified by an agent the owner delegated to, blind to the arm, before
  `hand-read-key.json` was opened (§ Delegated blind classification and joined results). The sealed protocol
  requires the owner's own classification. The owner did not adopt the delegated decisions, so this gate is
  recorded as not established, not as a failure, and plan step 4.4 stays open. An owner-personal blind
  classification is no longer possible: the joined per-run results now attribute rejected rows to runs.
- **Winner rule:** not applied; no arm passes.
- **Consequence (plan Phase 4 §3):** production is unchanged and `ai-review` stays off (`false &&` in
  `.github/workflows/review.yml`). Plan Phase 5 does not run. The dark code stays unmerged on
  `feat/finder-sonnet-effort`.
- **Facts for a successor, not a recommendation.** Both efforts removed the predecessor's failure: no
  `finish=length` at either effort, and at most 7,538 reasoning tokens in a step (`medium-269-r1`), against 16,384
  output tokens spent with no JSON at `high`. Both arms are within the cost gate. What failed is detection of D2,
  in all four #269 runs. Spend: $1.186030 of the $4.00 budget; the G5 reserve was not used.
