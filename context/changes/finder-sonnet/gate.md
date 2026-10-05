# finder-sonnet — pre-registered gate

> Plan: `context/changes/finder-sonnet/plan.md`. Phase 2 writes the inputs freeze and the pre-registration and
> seals the pre-registration before any paid call. Phases 3–5 measure and decide against it.
> Owner decisions it carries (all in `change.md` § Notes and `plan.md` § Definitions): the 2026-10-05 choice of
> `anthropic/claude-sonnet-5` as the finder, the $3.00 budget with a $0.50 G5 reserve (F7 triage), and the
> ≤ $10/month cost gate.
>
> Predecessor gate: `feat/finder-verification:context/archive/2026-10-03-finder-verification/gate.md`.

## Inputs freeze

Taken **2026-10-05** (Phase 2), after Phase 1's code landed (`33fdb79`, fixed in `624a936`) and before any paid
call of this change. Every input below was reproduced byte for byte from the recipe given with it.

The diffs, rules files, PR metadata and worktrees live in a local directory, `~/.cache/finder-sonnet-gate/`, and
are not committed; they can be rebuilt from the recipes. **Any mismatch at measurement time stops the
measurement** — the runner refuses before the paid call (`sonnet-gate.mjs run`, input check).

**Diff recipe** (the exclusions of `.github/workflows/review.yml` at this branch, as frozen in
`finder-verification`; no plan file is excluded separately because `**/*.md` already covers it):

```
git diff <base>...<head> -- . ':(exclude,glob)**/reviews/*.md' ':(exclude,glob)**/results/*.json' \
  ':(exclude,glob)**/ground-truth/*' ':(exclude,glob)**/*.md' ':(exclude,glob)**/*.jsonl'
```

**Rules recipe:** `git show <base>:.github/ai-review-rules.md` — the base branch's copy, as production stages it
(`review.yml`, "Stage trusted review rules from the base branch"). For both PRs it is byte-identical to
`git show <head>:.github/ai-review-rules.md`, the recipe `finder-verification` used, so the two recipes agree.

**PR metadata recipe:** `gh pr view <n> --json title,body > meta.json`, read 2026-10-05. Production passes the
title and body of the triggering event; these are the current ones.

**Source root:** a clean detached worktree at `<head>` (`git worktree add --detach`).

### #247 (the unseen case; the probe)

- **Base** `d097949bf217ecafb3333f63e757af67cc7daf07`; **head** `dec09f8d77b2f1ee45073c194d6cd8239a7d35c7`.
- **Diff:** 10,838 B, sha256 `21973af35cc39f60488935583a85baf894a6c1a9b51069d16de86e701b5dc2e1` — equal to the
  `finder-verification` freeze.
- **Rules:** 2,929 B, sha256 `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f`.
- **Metadata:** 2,059 B, sha256 `ec66879c3e33027ee2096677a4da060f5e68645c1fa3752ed376638cd9a24ff2`.
- **Source root:** `~/.cache/finder-sonnet-gate/wt-247`; `HEAD` = head, `git status --porcelain` empty.
- **Files (2):** `scripts/prod-fetch-results.py`, `scripts/prod-result-dimensions.py`.
- **Finder output exists: no.** Run `35909897958` at `dec09f8` failed with `AI_NoObjectGeneratedError` and
  produced no artifact (`finder-verification` `gate.md` § Inputs freeze). `finder-verification` never ran it
  (decision 4.4 stopped before MAIN), and `ai-review` has been off since `68151b0`.

### #269 (seen; the known defect D2)

- **Base** `3d0adc1b4910c31973c6ac98a7ce776fcb68d878`; **head** `fca2778742ec0bc02a84f42b23bf639fc32c7ad1`.
- **Diff:** 65,455 B, sha256 `1e4ec0882371989122f9e4254c93c4df1f51826a4f57dbfe04139175177e550f` — equal to the
  `finder-verification` freeze.
- **Rules:** 2,929 B, sha256 `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f`.
- **Metadata:** 1,701 B, sha256 `00b7b21bd2d48b73442796a257feafc21689a296584ba1989b6f406374da82e7`.
- **Source root:** `~/.cache/finder-sonnet-gate/wt-269`; `HEAD` = head, `git status --porcelain` empty.
- **Files (17):** as listed in the `finder-verification` freeze (nine binary PNGs, seven `scripts/s17/*` and
  `scripts/measure-hue-shares.py`, and `scripts/spikes/bread-spike.ts`).
- **D2 exists at the head:** `scripts/spikes/bread-spike.ts` in the worktree — `localInput` (`:167–196`) exits
  with `process.exit(1)` at `:189–195` when the upload response has no `urls.get`, before returning
  `uploadedFileId: file.id`, so `deleteUpload` (`:199–214`) never sees the file. Checked 2026-10-05 by reading the
  worktree; the diff touches `bread-spike.ts` (5 references).

### Run manifest

`context/changes/finder-sonnet/gate-manifest.json` is what `sonnet-gate.mjs run --manifest` checks before every
paid call: the global manifest (code hashes, `src` tree, wire-schema sha256, effective configuration — the output
of `sonnet-gate.mjs describe` at `624a936`), the per-PR inputs above, and the budget figures. Prettier-formatted
before hashing, so the pre-commit hook cannot change its bytes.

- sha256 `274984fa942fcd66515a7eee950b781817aa5c4f1a0b764913b906d053893512`.
- **Dry pre-flight, no network (2026-10-05):** `main(["run", …])` for `247-r1` and `269-r1` against this manifest,
  the real `git`, the package `.env` and a stub counter that throws, passed every pre-network check (run-id,
  T0, clean `src`, inputs, clean source root, code and effective configuration) and stopped at the first counter
  read. Nothing was spent.

## Pre-registration

### 1. Arm

- **Finder:** `anthropic/claude-sonnet-5`, pinned to OpenRouter's `anthropic` endpoint
  (`resolveFinderProviderRouting()`), **no `reasoning` field** (the endpoint default: adaptive thinking at
  effort `high`), the production `ToolLoopAgent` with strict `json_schema` output, tool-less final step and
  `withOneRetry`.
- **Judge:** production — `anthropic/claude-sonnet-5` (`DEFAULT_JUDGE_MODEL`; the repo variable
  `OPENROUTER_JUDGE_MODEL` names the same model), routing unchanged (`resolveProviderRouting()`).
- **No impl-review pass:** no plan file is passed, as for a PR without a resolved plan. Its cost enters the
  projection only through §6.
- **Entry point:** `npm run review` in `packages/code-reviewer` with `--diff-file`, `--out-dir`,
  `--source-root`, `--project-context-file`, and `PR_TITLE` / `PR_BODY` in the environment — the arguments
  `action.yml` passes — driven by `scripts/sonnet-gate.mjs run`.

### 2. Effective configuration

Resolved by `sonnet-gate.mjs describe` at `624a936` and pinned in `gate-manifest.json` § `global.effectiveConfig`:

- finder model `anthropic/claude-sonnet-5`; judge model `anthropic/claude-sonnet-5`;
- finder routing `{"only":["anthropic"],"order":["anthropic"],"allow_fallbacks":false,"require_parameters":true}`;
- judge routing `{"require_parameters":true}`;
- finder step limit **5** (`DEFAULT_FINDER_MAX_STEPS`; no `REVIEW_FINDER_MAX_STEPS` repo variable exists,
  `gh variable list` 2026-10-05);
- `REVIEW_FINDER_MAX_STEPS`, `REVIEW_FINDER_TIMEOUT_MS`, `REVIEW_JUDGE_TIMEOUT_MS`,
  `REVIEW_IMPL_REVIEW_TIMEOUT_MS`, `OPENROUTER_REQUIRE_PARAMETERS`: all unset.
- **Environment policy** (runner pre-flight and child CLI alike): inherited environment >
  `packages/code-reviewer/.env` > code defaults. `npm run review` loads `.env` with `--env-file-if-exists`, which
  never overrides an inherited variable; the runner resolves the configuration under that merge with the
  package's own resolvers and passes the merged environment to the child, so the CLI cannot resolve a
  configuration the pre-flight did not check.

### 3. Code under test

Taken at `624a936`; each equals `sha256sum` at that commit and the global manifest:

| File                      | sha256                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| `src/config.ts`           | `26766c748b032de03031fb4cdcea70f95e5749d0e0514d387ce3257380f76580` |
| `src/reviewer.ts`         | `6f2334c56280a250cb44908ef4133ff1e11037a827d08392540be60087afffc6` |
| `src/prompts.ts`          | `fac7dc20fb3ae79d232e92e29a7a4dbcb4b40c509bffa3aba76a944f7e5ed3fa` |
| `src/schemas.ts`          | `fabb3f0bcc682d1489e7fdef66bdc2771465e30d24a07d0eb7cdc20387f34ec5` |
| `scripts/sonnet-gate.mjs` | `e7dda3b345aaaa7ee4038af5f057fc039b493c9de9b35ca2d963f94fc91303bf` |

- **Finder wire schema** (`review_result`, as `./node_modules/.bin/tsx scripts/schema-dump.mjs` prints it from
  `packages/code-reviewer`): sha256 `a6e98d41add5055074b2a5556c512ddc9f5c6b5b1c3b0ad2eedb54cc43d095bf`. It
  carries `minLength`; the first run is the probe for it (§5).
- **`packages/code-reviewer/src` git tree:** `a6dd42ab3885ed6ce0208b9ddc486e949036a0b1`
  (`git rev-parse 624a936:packages/code-reviewer/src`). The runner refuses to start when that directory has
  uncommitted changes.
- **Run manifest:** `gate-manifest.json`, sha256
  `274984fa942fcd66515a7eee950b781817aa5c4f1a0b764913b906d053893512` (§ Inputs freeze).

### 4. Definitions

Restated from `plan.md` § Definitions; the plan's wording governs where the two differ.

- **Run** — one production pipeline pass (finder → judge) through the production CLI, **including** its single
  built-in retry per pass. No outer retry. A run that hit a retry is still one run; retry use and its cost are
  recorded separately. An interrupted run is failed, never re-run.
- **Valid run** — the run produced `review.json` with a successfully parsed finder output **and** judge output.
  Exhausted retries, a 4xx/5xx after the retry, `NoObjectGeneratedError` / `NoOutputGeneratedError` → invalid.
  An OpenRouter 401/402 or a runner crash is a **measurement error**, not a run result: stop, the owner decides.
- **Reliability gate** — **every** run valid; each PR is run **twice**. One invalid run → FAIL. A run not
  executed for budget → evaluation **incomplete**, never pass.
- **Published finding** — a finding in `review.json` `findings` (the finder's merged, deduplicated output; no
  verifier stage). `findings: []` → N = 0.
- **Hand-read acceptance (per run)** — the owner classifies **every** published finding of the run; **zero
  rejected**, and unresolved = rejected. **#247: N = 0 passes.** **#269: the run's published findings must
  include D2, confirmed to exist at the evaluated head; N ≥ 1 alone is insufficient.** Applied to every run.
- **D2** — `scripts/spikes/bread-spike.ts:178–214` (`localInput`): when the Files API accepts the upload but the
  response has no `urls.get`, the code exits before returning the uploaded file id, so `main`'s cleanup cannot
  delete the file and it stays in the Replicate account. Evidence `:189–195`. **Match:** a finding cites
  `bread-spike.ts` within `localInput`'s upload path or `main`'s cleanup **and** claims the uploaded file is not
  deleted (or leaks) on the missing-URL exit. The agent proposes matches; **the owner approves** each one.
- **Per-run cost** — finder + judge cost, including retries per pass, reconciled against the settled key-counter
  delta around the run. Telemetry provides the pass breakdown; missing costs remain unresolved until
  reconciliation. A failed or interrupted run still incurs spend. An unsettled or unexplained delta blocks the
  next paid run, including G5.
- **Projected monthly cost** — size-assigned, §6 (amended by the owner on 2026-10-05, before the seal).
- **Window** — PRs created 2026-09-05 to 2026-10-04 (UTC).
- **Observed review run** — a run of the `ai-review` job in the window that reached the review step (not the
  docs-only skip, not a job-level skip); counted in §6.
- **Budget** — §8.
- **P** — §8.

### 5. Run order and probe

`247-r1` (probe) → `269-r1` → `247-r2` → `269-r2`, one at a time, each through `sonnet-gate.mjs run` with this
manifest and `--out context/changes/finder-sonnet/gate-sonnet-runs.jsonl`, each reconciled (`sonnet-gate.mjs
reconcile`, two counter reads ≥ 180 s apart) before the next paid call.

`247-r1` is the probe: a `minLength` 400, a missing final JSON (vercel/ai #21992) or "structured_outputs not
supported in your workspace" would appear there. Any of them makes the run invalid, so reliability FAILs; the
raw error text is reported first (the run's `stderr.log`).

### 6. Cost

**Window counts** (read 2026-10-05, free; all from the GitHub API):

```
gh pr list --state all --search "created:2026-09-05..2026-10-04" --limit 200 \
  --json number,createdAt,closedAt,headRefName                         # 62 PRs
gh api --paginate "repos/Piotr-Miller/lumina-clean-ai/actions/workflows/review.yml/runs?created=>=2026-09-05&per_page=100"
                                                                       # 103 runs to 2026-10-05T19:16Z
# run → PR: head_branch == PR headRefName and PR createdAt <= run created_at <= PR closedAt
#   (the runs' pull_requests field is empty; matching by head SHA misses 5 runs on pre-rebase heads)
gh api repos/Piotr-Miller/lumina-clean-ai/actions/runs/<id>/jobs      # per run: job and step conclusions
```

Of the 103 runs, **90** belong to the 62 window PRs (runs 2026-09-06T09:29Z – 2026-10-04T17:55Z). By the job
`ai-review` and its steps `AI review` and `Stage the plan from the Git object`:

| Class                                                                                               | Runs   |
| --------------------------------------------------------------------------------------------------- | ------ |
| **Observed review runs** — the `AI review` step ran (success 23, failure 37, cancelled mid-step 1)  | **61** |
| of which **with a resolved plan** — `Stage the plan…` ran and staged a plan (13/13 logs show bytes) | **13** |
| Docs-only skip — job ran, `AI review` skipped                                                       | 26     |
| Job-level skip — job `skipped` (2) or cancelled before any step (1)                                 | 3      |

- The 61 observed runs cover 40 of the 62 PRs. The one mid-step cancellation (run `36242478689`, `AI review`
  started 12:37:01Z, cancelled 12:37:39Z) counts as observed: the review step ran and may have spent.
- **The 42 / 72 discrepancy:** `research.md` §4 reports "42 runs on 26 PRs", where 26 is its own prediction of
  which PRs pass the docs-only skip and the run-count method is not recorded; its projection buckets (29 + 10 + 3
  reviews/month) also sum to 42. 72 does not appear in `research.md` as written. Neither applied this definition
  to the run history: by it, 40 PRs — not 26 — had a run reach the review step. **61 replaces both.**
- **Actual historical spend in the window (information only):** the 23 runs whose review succeeded logged
  `review cost:` lines summing to **$0.615247** (finder $0.056139 on `z-ai/glm-4.6`, judge $0.449430, and one
  impl-review, run `34159241204`, $0.109678). The 38 failed or cancelled runs logged no cost, so their spend is
  unknown.

**Per-run data:** `context/changes/finder-sonnet/gate-window-runs.tsv` (90 runs, one row each: run id, PR,
creation time, job and step conclusions, diff bytes, class, cost bucket), sha256
`45037f72e55b0ffafa4eade71a4b023b75b160f5f825502ff1d68c4bb0946efb`. The diff bytes are the `wc -c` line of each
observed run's "Compute PR diff" step log (`gh run view <id> --log`); all 61 observed runs have one.

**Formula — size-assigned** (owner decision 2026-10-05, taken in Phase 2 before the seal, replacing the single
mean; `plan.md` § Definitions): each observed run is priced at the measured mean per-run cost of the frozen PR
whose diff is nearer in bytes — **#247** (10,838 B) when the run's diff is **≤ 38,146 B** (the midpoint), **#269**
(65,455 B) when it is larger.

- **m247**, **m269** — the mean per-run cost (finder + judge, retries included) over that PR's executed runs,
  valid and invalid. A PR with no executed run leaves the projection **incomplete**, never passing.
- **Assignment** (from the TSV): **53** runs → m247 (329 B – 28,509 B); **8** runs → m269: `36274608130` 50,601 B,
  `36469048792` 65,455 B, `35533002936` 86,627 B, `34277863262` 89,623 B, `35524527921` 140,095 B,
  `34269279441` 326,305 B, `34267144885` 326,601 B, `34266753175` 326,616 B. The review truncates a diff at
  100 KB, so the four largest are priced as #269 rather than extrapolated.
- **Projected monthly cost = 53 × m247 + 8 × m269 + 13 × measured mean impl-review cost.** The impl-review mean
  is #132's **$0.199620**, averaged with G5's impl-review cost only if G5 actually runs one. Every plan-bearing run
  is assumed to pass code review — an explicit, conservative assumption. The in-window impl-review of $0.109678 is
  reported above and does not enter the mean.
- Impl-review term: 13 × $0.199620 = **$2.595060**.
- **Gate: ≤ $10.00/month**, which holds exactly when **53 × m247 + 8 × m269 ≤ $7.404940**.
- The single unweighted mean over all executed runs is reported **for information only**; it is not the gate.

### 7. Gates

1. **Reliability** — every run valid (§4).
2. **Hand-read** — per run, on both PRs (§4).
3. **Cost** — projected monthly cost ≤ $10.00 (§6).

`ADMITTED` only when all three pass. G5 (plan Phase 5) is a further condition for merge, not for admission; after
G5 the projection is recomputed and a breach replaces the verdict with `NOT ADMITTED (cost)`.

### 8. Budget and P

- **Budget: $3.00 in total**, covering all runs, retries and G5; **$0.50 is reserved for G5**.
- **Before each measurement run:** T + P(next run) + $0.50 ≤ $3.00. **Before G5:** T + $0.50 ≤ $3.00. Otherwise
  stop: `INCOMPLETE (budget)`; no automatic increase.
- **T** = max(key counter − T0, cumulative settled series spend), in USD since T0, G5 included. Each run's
  settled cost is its counter delta, so telemetry and counter are never added for the same run. Unresolved spend
  blocks further paid calls.
- **T0** is read once from `GET /api/v1/key` (`sonnet-gate.mjs t0`), with its time, in the Phase 3 pre-flight.
- **P** — first run on a PR: the research HIGH estimate, **#247 $0.33**, **#269 $0.73**. A later run: **2 × the
  largest reconciled cost** of that PR's earlier runs. P is an estimate, not a cap; production permits one retry
  separately for finder, judge and impl-review.
- Budget figures in `gate-manifest.json`: `total 3`, `reserve 0.5`, `firstRunEstimate {247: 0.33, 269: 0.73}`.

### 9. Stop rules

- **An invalid run** → stop after it; report its raw error text; the owner decides whether the series continues
  **as information**. Reliability has already FAILED and nothing later can change that.
- **A measurement error** (exit 3: OpenRouter 401/402, a CLI crash, a finder-model mismatch) → stop; fix by a
  dated, hashed amendment pushed before the next run. Not a run result.
- **Unsettled or unexplained spend** → no further paid call until `reconcile` settles it or the owner
  `resolve`s it.
- **Budget** → `INCOMPLETE (budget)`.
- **Phase 3 pre-flight**: a changed price (≠ $2 / $10 per M), a lost `tools` / `structured_outputs` /
  `response_format`, `reasoning.mandatory: true`, or a seal or input mismatch → stop and ask.

### 10. Verdict labels

Exactly one of: `ADMITTED`, `NOT ADMITTED (reliability)`, `NOT ADMITTED (hand-read <PR>)`,
`NOT ADMITTED (cost)`, `INCOMPLETE (budget)`. A run that ends in a measurement error is recorded as
`failed run — measurement error` and is not a verdict.

### 11. Amendments

A protocol change after the seal goes into a `## Amendments` section placed **after** the seal. Each amendment is
dated, carries its own sha256, and is committed and pushed to `origin` **before** the run it affects. Amendments
never edit this section; the seal check covers this section only. A code change after the seal changes a code
hash, so the runner refuses until an amendment re-pins the manifest.

### 12. Seal procedure

1. The owner confirms the four plan-chosen terms one by one (§ Pre-registration seal): P; the "observed review
   run" definition; the D2 match criterion; the stop rule after an invalid run.
2. The owner approves this section.
3. The sha256 of this section is recorded with its UTC time, computed as
   `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum`, after
   `npx prettier --check` passes on `gate.md` (the pre-commit hook must not change the hashed bytes). Then the
   state is committed and pushed.
4. GitHub's push time is recorded (repository activity API), and an annotated tag `finder-sonnet/seal` on the
   seal commit is pushed before any paid call.
5. The seal is never recomputed.

_End of Pre-registration._

## Pre-registration seal

**Sealed 2026-10-05.** The owner confirmed the four plan-chosen terms one by one and approved the section; the
hash below was then taken by §12 and is never recomputed. Nothing in this section is part of the hashed bytes.

### Plan-chosen terms (the owner confirms each one)

1. P (§8). — Confirmed: owner (date: 2026-10-05)
2. The "observed review run" definition and its count, 61, including the run cancelled mid-step (§4, §6). —
   Confirmed: owner (date: 2026-10-05)
3. The D2 match criterion (§4). — Confirmed: owner (date: 2026-10-05)
4. The stop rule after an invalid run (§9). — Confirmed: owner (date: 2026-10-05)

**Decided before the seal** (owner, 2026-10-05): the size-assigned cost formula, 53 × m247 + 8 × m269 (§6),
replacing the single mean of `plan.md`'s original Definitions row. The owner chose it over the single mean after
seeing that the single mean could not pass at the research estimates for these two inputs (break-even $0.121392
per run), and chose the linear byte midpoint (53 / 8) over the log midpoint (52 / 9).

### Approval and hash

- Owner approval: approved by the owner (date: 2026-10-05; edits made before the seal: the size-assigned cost
  formula above, and the four confirmations).
- sha256 of `## Pre-registration` … `_End of Pre-registration._` (218 lines):
  **`434ffe5f5f70959b6331b22e53042e7276abf118396885420a8b0ac8ad403b76`**, computed as
  `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum` after
  `npx prettier --check gate.md` passed.
- UTC time taken: **2026-10-05T21:08:58Z**.
- Seal commit, GitHub push time and tag: recorded in the next commit, after the push.

## Results

Not started. Phase 3 writes the pre-flight, T0 and the ledger here.
