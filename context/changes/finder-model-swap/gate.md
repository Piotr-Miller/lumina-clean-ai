# Finder model swap — pre-registered gate

> Plan: `context/changes/finder-model-swap/plan.md` (Phase 0 writes this file, Phase 2 measures against it).
> Owner decisions it carries: `change.md` — 2026-10-02 (G3 hand-read threshold; candidates and budget) and
> 2026-10-03 (planning answers; plan-review triage F1–F7).
> Predecessor gate: `context/archive/2026-09-24-finder-serialization-outage/gate.md`.

## Pre-registration

Written **2026-10-03, before any paid call in this change.** No candidate has been measured. The Results
section, appended later, never edits this section. This section is sealed (sha256 below it) after the owner
approves it; a later protocol change goes into `## Amendments` after the seal (see "Amendments").

### 1. Candidates

Measured **in this order**, each pinned through `OPENROUTER_FINDER_PROVIDERS=<slug>` (`only: [slug]`, no
fallback). Expected `provider_name`, read 2026-10-03T08:23:31Z from the public
`GET https://openrouter.ai/api/v1/models/<id>/endpoints` (no paid call):

| #   | Model                | Slug      | Expected provider name | List price (USD/M, prompt / completion) |
| --- | -------------------- | --------- | ---------------------- | --------------------------------------- |
| 1   | `openai/gpt-6-luna`  | `openai`  | `OpenAI`               | 0.10 / 0.50                             |
| 2   | `qwen/qwen3.8-flash` | `alibaba` | `Alibaba`              | 0.15 / 0.47                             |
| 3   | `minimax/minimax-m3` | `minimax` | `Minimax`              | 0.30 / 1.20                             |

`openai/gpt-6-sol` is **not** measured; it returns only by a separate owner decision if all three fail.

**Service tiers.** OpenRouter, Provider Routing › Targeting Specific Provider Endpoints (fetched 2026-10-03):
_"service tier endpoints (e.g. `openai/fast`, `google-vertex/flex`) are **not** matched by base slugs — they
require explicit opt-in via the `service_tier` parameter or a tier-suffixed slug."_ The finder sends neither.
Note: the endpoints list reports `provider_name: OpenAI` for `openai`, `openai/flex` **and** `openai/fast`
alike, so the provider-name check cannot tell the tiers apart. **One-off report, not a gate rule** (owner,
2026-10-03): on G2-01 of `gpt-6-luna`, each request's `cost` ÷ tokens is compared with the base-tier prices
0.10 / 0.50 and the result is written to Results.

### 2. Production request shape under test

Unchanged from the predecessor (owner amendment A3): `reasoning: {enabled: false}` on every request;
`require_parameters: true`; `only`/`order` from `OPENROUTER_FINDER_PROVIDERS`; no `response_format`; step
budget 5; timeout 300 s; SDK retries off.

### 3. Inputs

Reproduced 2026-10-03 byte for byte, as the predecessor ran them:

- **#269 diff:** `git diff 3d0adc1...fca2778 -- . <review.yml EXCLUDES>` — 65,455 B, sha256
  `1e4ec0882371989122f9e4254c93c4df1f51826a4f57dbfe04139175177e550f`.
- **Rules (G1 and G2):** `git show fca2778:.github/ai-review-rules.md` — 2,929 B, sha256
  `34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f` (byte-identical to `3d0adc1`'s copy).
- **#269 source root:** a detached worktree at `fca2778742ec0bc02a84f42b23bf639fc32c7ad1`.
- **G2 fixture:** `packages/code-reviewer/evals/fixtures/clean-change.diff` (sha256
  `8b326f6db0622096194e79a12dab7500c35eb6af5a7ba16f6f194f15607108cd`) and its tree
  `evals/fixtures/clean-change/`; last changed in `e8ebb66` (2026-08-12), before the archived run.

Kept in a local scratch directory, not committed. Any mismatch at measurement time stops the measurement.

### 4. Gates

Every gate is evaluated **per candidate**. Thresholds and data are the archived ones, **unchanged**, except
G3's hand-read clause, which is replaced by the owner's 2026-10-02 threshold.

- **G2 — no findings.** `clean-change` × 5, tool-enabled: **5/5** valid with `findings: []`. Any finding,
  `minor` or `nit` included, fails G2. Exact invocation, from `packages/code-reviewer` (owner, 2026-10-03, F2):
  `node scripts/finder-gate.mjs --model <id> --endpoint <slug> --case clean --n 5
--diff evals/fixtures/clean-change.diff --rules <scratch>/rules.md --source-root evals/fixtures/clean-change`
  (the archive did not record G2's rules or source root; this gate fixes them).
- **G3 — quality, fixtures.** The four archived cases × 3 repeats = **12 rows**, pinned, promptfoo `-j 1`,
  `--no-cache`, filter `^(Finds the material|React 16->19|Cross-hunk contract|Defect-free mechanical rename)`;
  grader `openrouter:google/gemini-3.1-pro-preview`. A run with ≠ 12 rows is a failed run, not a gate result.
  All 12 count; provider errors, timeouts and `FinderOutputError` fail their case. Required:
  `issue_recall` 3/3 on the JS loop; `issue_recall` 3/3 and `review_fails` 3/3 on React; 3/3 on each of
  `flaw_stale_closure`, `flaw_lost_cleanup`, `flaw_unsafe_html`; `no_false_alarms` 3/3 on the clean case.
  Cross-hunk (`tool_required`, `flaw_cross_hunk_contract`) is diagnostic, never a pass.
- **G4 — cost.** On the same 12 rows, median total finder cost per attempt (loop, finalization, repair; failed
  attempts included) **≤ $0.00301653** (3× the matched baseline median $0.00100551 of the 12
  `baseline-glm-4.6` rows in `context/archive/2026-08-10-finder-tool-loop-evals/results/2026-08-11-tool-loop-matrix.json`:
  0.00022508, 0.00022858, 0.00030208, 0.00075786, 0.00076114, 0.00096791, 0.00104311, 0.00106766, 0.00112339,
  0.00122489, 0.00146976, 0.00158216). A row with incomplete cost telemetry fails G4, never omitted. Median and
  max latency are reported.
- **G1 — reliability, #269.** #269 × 10 with the inputs of §3: **≥ 9/10 attempts** end with a valid object
  (≤ 1 repair). Every `FinderOutputError`, timeout and API error that persists after the production retry
  (below) — **a 429 included** — counts against it.
  The repair rate is reported, not gated.
- **G3 — hand-read** (owner, 2026-10-02), only for candidates that passed G1–G4 automated:
  - Frame: the distinct findings of the candidate's valid G1 attempts (§6). **N** = rows in the
    owner-approved dedup table.
  - Sample: min(40, N) rows. **Rejected** = does not identify a real defect in #269's diff at `fca2778`;
    **unresolved counts as rejected**. Every judgement carries a one-sentence reason; the agent may pre-sort,
    **the owner approves every classification**.
  - Threshold: at most **2 rejected of 40**; when N < 40, all N are judged and the limit is
    **floor(0.05 × N)** (N ≤ 19 → 0). **N = 0 fails G3.** No re-draw.
  - A practical acceptance gate, not a statistical proof that the false-finding rate is ≤ 5%.
- **G5 — live** (Phase 4, admitted candidate only): this change's own PR to `master` (§8).

**A3 on every request of every gate, both channels:** any request with SDK reasoning tokens above zero,
OpenRouter reasoning tokens above zero, or reasoning text longer than zero fails the attempt (or the promptfoo
row).

**Provider check on every request:** the reported provider name must equal §1's expected name. A missing or
different name **invalidates** the attempt or row (it cannot pass).

**Retries as in production** (owner, 2026-10-03, at approval; replaces the predecessor's "attempts are never
re-run"). One gate attempt is one production pass, including production's single transient retry: exactly
the behaviour of `withOneRetry`/`isRetryableError` in `packages/code-reviewer/src/retry.ts` (HTTP 429, 5xx or
timeout; one retry; the same header-aware delay). A failure that persists after that retry fails the attempt.
`FinderOutputError` is never retried (as in production). Every retry is recorded in the attempt's record and
counted in its cost and latency; the retry count is reported per gate as a signal, not gated. No other re-run
exists. This applies to G1, G2 and the promptfoo rows. This is stricter than nothing and no looser than
production; the predecessor's verdicts (z-ai, deepinfra) are not re-judged.

A failure after that retry, a `FinderOutputError` and a refusal under `require_parameters` are failed
attempts, never skipped ones.

### 5. Measuring order and stop rule

**This order is a deliberate change from the archived protocol** (which ran G1, G2, then promptfoo), decided
by the owner 2026-10-03. Per candidate:

1. **G2-01 alone — the A3 probe** (`--through 1`). An A3 leak or a refusal of the shape → the candidate ends:
   `cannot honour the production shape (A3)`. A provider-name mismatch → the candidate stops, `provider name
mismatch — owner decision`. A 429 that persists after the production retry, or any other failure on G2-01, is a G2 failure (G2 needs 5/5) →
   `FAIL (G2)`. Nothing more is spent on that candidate.
2. **G2-02..05** (`--start 2 --append`, the same invocation). < 5/5 → `FAIL (G2)`, stop.
3. **G3/G4 fixtures** (12 rows). G3 fail → `FAIL (G3)`, stop. **G4 failing alone** (G3 pass) →
   `paused (G4 only) — owner`: median and ratio reported; the owner decides whether to spend on G1 (archived
   G-A1).
4. **G1** (#269 × 10). < 9/10 → `FAIL (G1)`.
5. Passed G1–G4 automated → the hand-read (§6), then the owner's decision 4.4.

The verdict is a conjunction; the first decisive failure ends the candidate.

**Verdict labels** (each candidate gets exactly one): `PASS`, `FAIL (Gx)`, `not measured (stopped after Gx
FAIL)`, `not measured (budget)`, `cannot honour the production shape (A3)`, `paused (G4 only) — owner`.
`not measured (budget)` never carries a verdict; `stopped after Gx FAIL` does (the candidate is FAIL).

**If no candidate passes:** we stay without a finder until a separate owner decision; thresholds never change
automatically. **If more than one passes:** the owner chooses from a comparison (per passer: G1 k/10 and
repairs, G3 metrics, G4 median/max, median cost and latency per #269 attempt, endpoint count and last-1-day
uptime, observed 429s). No recommendation is binding; the hand-read still decides admission.

### 6. Hand-read: dedup, freeze, sample

- **Dedup merge rule:** same claimed defect and same location → one row; same defect in another file →
  separate rows; different claims at one location → separate rows; contradictory wordings → **split, never
  merged**. The agent dedups **blind** (no correctness judgement); each row carries its contributing attempt
  IDs and a one-sentence grouping reason; uncertain decisions are flagged.
- **The owner approves the dedup table** (merges and splits; 1:1 rows need no action). The owner approves
  merges and splits only, before any correctness judgement of the rows.
- **Freeze order:** approved table → `hand-read-sample.mjs freeze` → its sha256 written here → seed written
  here → `draw`. The seed is 32 bytes from `/dev/urandom` (hex), taken at the moment of drawing and written
  before the draw.
- **Sampling method:** rows ranked by `sha256(seed + ":" + rowId)` ascending; the first min(40, N) are the
  sample. `draw` refuses a table whose sha256 differs from the frozen one. No re-draw.

### 7. Budget

- **$2.00 in total**, everything included: finder, finalization, repair, grader, judge, impl review and G5.
  **Stop and ask the owner once the total passes $1.60.** $2.00 is never exceeded.
- **Spend** = the OpenRouter key's usage counter (`GET /api/v1/key`, `usage`), read before and after every
  series; T = counter − T0. Per-request telemetry gives per-attempt figures; if the two disagree, the counter
  governs and the gap is reported.
- **A_max** per candidate × case = 2 × the pessimistic per-attempt figure in `research.md`, floored at $0.02:

  | Candidate            | G2 (clean) | G1 (#269) |
  | -------------------- | ---------- | --------- |
  | `openai/gpt-6-luna`  | $0.02      | $0.036    |
  | `qwen/qwen3.8-flash` | $0.02      | $0.052    |
  | `minimax/minimax-m3` | $0.02      | $0.104    |

  Before each series, `--max-spend` = min(1.60 − T, 2.00 − T − A_max).

- **promptfoo** starts only if 2.00 − T ≥ 2 × its estimate (finder + grader, `research.md`): luna $0.070 →
  needs $0.140; qwen $0.071 → $0.142; minimax $0.081 → $0.162.
- **G5** counts toward the $2.00 (owner, 2026-10-03, F3); its limit is **$0.50** (F6): it runs only if
  2.00 − T ≥ $0.50, otherwise `not measured (budget)` → owner.
- A candidate not measured for lack of budget is `not measured (budget)`, never a verdict.

### 8. Production phase and G5

Only for a candidate the owner admits (decision 4.4). `DEFAULT_MODEL` and `DEFAULT_FINDER_PROVIDERS` change
together; **the owner deletes `vars.OPENROUTER_REVIEW_MODEL` immediately before G5 and does not restore it**
(F1), so `DEFAULT_MODEL` is the single source of the finder model.

**G5** = the first `AI Code Review` run on this change's own PR to `master`, opened as a draft (drafts are
not reviewed), after the owner marks it ready and adds the `ai-cr:review` label (F6). Pass: whole review
green, `finderTelemetry` present, every finder step logged with its provider, and `models.finder` in the run's
`review.json` equal to the admitted model. Later pushes to the non-draft PR start further paid reviews and are
added to the ledger. **A G5 that is `not measured (budget)` or not green blocks the merge until the owner
decides.**

### 9. Amendments

A protocol change after the seal goes into a `## Amendments` section placed **after** the seal: dated, with its
own sha256, committed and pushed to `origin` **before** the measurement it affects (F7). Amendments never
edit this section; the seal check covers this section only.

### 10. Seal procedure

After the owner's approval: the sha256 of this section's bytes, computed as
`sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum`, and the UTC time it
was taken go into `## Pre-registration seal` below, with the approval date. That state is committed and
pushed to `origin`; GitHub's push time (repository activity API) is recorded in the ledger before the price
re-read and T0. The seal is never recomputed.

_End of Pre-registration._

## Pre-registration seal

- **Approved by the owner:** 2026-10-03, with two edits made before this seal (§6: merges and splits approved
  before any correctness judgement; §4/§5: retries as in production).
- **sha256 of the Pre-registration section:** `f6dc0fb0c3048859d2fbcafb0ea8accd5a97b152f8050edf92cfdcf83240e34e`
- **Hashed at:** 2026-10-03T08:31:05Z
- **Command:** `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum`
- **Pushed:** commit `adffc68` to `origin/feat/finder-model-swap`; GitHub push time **2026-10-03T09:00:20Z**
  (`GET /repos/Piotr-Miller/lumina-clean-ai/activity?ref=refs/heads/feat/finder-model-swap`: `push`,
  `87ba5da` → `adffc68`). Recorded before any price re-read or paid call.

## Amendments

Protocol changes after the seal (§9): each dated, hashed over its own bytes (from its `###` heading to its
`_End of …_` line), committed and pushed to `origin` before the measurement it affects. The seal check covers
the Pre-registration section only; nothing here edits it.

### A1 — grader errors (2026-10-03)

Decided by the owner on 2026-10-03 in the triage of `reviews/impl-review-phase-1-7b49836.md` (F3 and F5),
before any paid call in this change. Applies to the promptfoo rows (G3/G4).

A grader error is not a candidate failure. Rows marked grader error keep everything the finder produced
(provider and A3 checks, FinderOutputError, cost for G4). Their stored finder output is re-graded once by the
same grader with no new finder call. If re-grading is not possible with the tooling, or fails again, the run is
a failed run (not a gate result) and measurement stops for an owner decision before any further spend. A
finder call is never re-run for a grader error.

A timeout-triggered retry is reported next to G4 and in the ledger as possibly under-costed telemetry; it does
not by itself fail G4.

**Tooling (Phase 1, commit `fix(finder-model-swap): resolve impl-review F1–F4 (p1)`): re-grading IS possible
without a finder call.**

- A grader error is a row whose finder succeeded (no `response.error`) and whose grading has no component
  results, was aborted, or carries a component tagged `metadata.graderError` — promptfoo 0.122.0's own mark
  for a grader transport or parse failure (`graderFail` in its source). `scripts/promptfoo-gate-rows.mjs`
  prints such rows as `GRADER-ERROR` and the run as a failed run; G4 and the provider/A3 results are still
  printed.
- `scripts/promptfoo-regrade-config.mjs` writes `evals/<slug>.regrade.json`: one test per grader-error row,
  the stored output as `providerOutput` (promptfoo then skips the provider — `echo`, never called), only the
  assertions whose grading errored, the matrix config's own `defaultTest` (the same grader). Run:
  `npx promptfoo eval -c evals/<slug>.regrade.json -j 1 --no-cache -o <regrade.json>`.
- `promptfoo-gate-rows.mjs --regrade <regrade.json>`: only the errored metrics come from the re-grade; a
  grader error again, a re-grade of a row that was not a grader error, a row re-graded twice, or a
  grader-error row left un-re-graded keeps the run a failed run. Merged rows carry `regraded: true` and
  `regradeOf: <original row id>`; both exports are kept in the scratch directory, the merged rows are the
  gate's JSONL, and the Results section names every re-graded row.
- Metrics graded from provider telemetry (`tool_calls`, `tool_required`) cannot be re-graded from a stored
  output (a `providerOutput` row carries no metadata) and are left out of a whole-grading re-grade
  (`notRegradable`); they are diagnostic, never required.
- The re-grade's grader spend counts toward the $2.00 (§7) and goes into the ledger.

_End of A1._

- **sha256 of A1:** `dc423199b14269d15267fb3522083378d9e8dc274973636b233667d12f5ebb9c`
- **Hashed at:** 2026-10-03T10:02:04Z
- **Command:** `sed -n '/^### A1 — grader errors (2026-10-03)$/,/^_End of A1\._$/p' gate.md | sha256sum`
- **Pushed:** commit `docs(finder-model-swap): amendment A1 — grader errors (p1)` to `origin/feat/finder-model-swap`;
  GitHub push time **2026-10-03T10:47:40Z**
  (`GET /repos/Piotr-Miller/lumina-clean-ai/activity?ref=refs/heads/feat/finder-model-swap`: `push`,
  `adffc68` → `2330494`). Recorded before any price re-read or paid call of Phase 2.

## Results

Phase 2 (plan.md), measured with `packages/code-reviewer/scripts/finder-gate.mjs` (G2, G1) and promptfoo
(G3/G4), each candidate pinned through `OPENROUTER_FINDER_PROVIDERS=<slug>`, under the sealed Pre-registration
and Amendment A1. Raw records, one JSONL line per attempt (plus its `started` marker) or row, are in this
folder: `gate-<slug>-clean.jsonl`, `gate-<slug>-promptfoo.jsonl`, `gate-<slug>-pr269.jsonl`. This section
never edits the Pre-registration; it is appended as the measurement proceeds.

### Pre-flight (2026-10-03, before any paid call)

- `origin/feat/finder-model-swap` = `02bd092` = local `HEAD`; the sealed commit `adffc68` and the A1 commit
  `2330494` are its ancestors.
- Pre-registration sha256 recomputed: `f6dc0fb0c3048859d2fbcafb0ea8accd5a97b152f8050edf92cfdcf83240e34e`
  (matches the seal). A1 sha256 recomputed: `dc423199b14269d15267fb3522083378d9e8dc274973636b233667d12f5ebb9c`
  (matches). GitHub push times in this file: seal 2026-10-03T09:00:20Z, A1 2026-10-03T10:47:40Z — both before
  the price re-read below.
- Inputs (§3) re-verified: `pr269.diff` 65,455 B sha256 `1e4ec088…550f`; `rules.md` 2,929 B sha256
  `34d5fcac…b48f`; worktree `HEAD` `fca2778742ec0bc02a84f42b23bf639fc32c7ad1`, clean; `clean-change.diff`
  sha256 `8b326f6d…08cd`, last changed in `e8ebb66`.

### Price re-read and T0 (2026-10-03T11:55:58Z)

`GET https://openrouter.ai/api/v1/models/<id>/endpoints` and `GET /api/v1/models`, unauthenticated, raw JSON in
the session scratch directory. No price changed against §1, every pinned endpoint lists `tools` and
`reasoning`, and no model has `reasoning.mandatory: true`, so no stop condition applies.

| Candidate            | Pinned endpoint (tag)     | `provider_name` | Prompt / completion (USD/M) | Cache read | `tools` / `reasoning` | `reasoning.mandatory`                    | Uptime 1 d |
| -------------------- | ------------------------- | --------------- | --------------------------- | ---------- | --------------------- | ---------------------------------------- | ---------- |
| `openai/gpt-6-luna`  | `openai`                  | `OpenAI`        | 0.10 / 0.50 (unchanged)     | 0.01       | yes / yes             | false (default on, efforts incl. `none`) | 99.99%     |
| `qwen/qwen3.8-flash` | `alibaba` (only endpoint) | `Alibaba`       | 0.15 / 0.47 (unchanged)     | 0.016      | yes / yes             | false (default on)                       | 99.86%     |
| `minimax/minimax-m3` | `minimax/fp8`             | `Minimax`       | 0.30 / 1.20 (unchanged)     | 0.06       | yes / yes             | false                                    | 99.54%     |

Note for the one-off report (§1): `openai/flex` (0.05 / 0.25) and `openai/fast` (0.20 / 1.00) also report
`provider_name: OpenAI`, as recorded at registration.

**T0 = $52.59943383** (`GET /api/v1/key`, `usage`, read 2026-10-03T11:55:58Z; `limit: null`). Budget
ceiling for this change: counter ≤ T0 + 2.00 = **$54.59943383**; stop-and-ask at T0 + 1.60 = $54.19943383.

### Ledger

Counter read before and after every series; T = counter − T0. `--max-spend` per series = min(1.60 − T,
2.00 − T − A_max) (§7). Telemetry = the series' own per-request cost sum.

| #   | Series                                       | Counter before          | Counter after            | Δ counter   | Telemetry                                                                    | T after                                                      | Note                                                                                                                                               |
| --- | -------------------------------------------- | ----------------------- | ------------------------ | ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | luna G2-01 (A3 probe), `--max-spend 1.60`    | 52.59943383 (11:55:58Z) | 52.59943383 (11:58:49Z)  | 0.00000000  | 0.00050248                                                                   | 0.00050248 (telemetry)                                       | counter not yet updated after the series (lag); T carried as max(counter, telemetry)                                                               |
| 2   | luna G2-02..05, `--max-spend 1.59`           | 52.59943383             | 52.59943383 (12:00:55Z)  | 0.00000000  | 0.00040657                                                                   | 0.00090905 (telemetry)                                       | counter still unchanged                                                                                                                            |
| 3   | luna promptfoo (12 rows, finder + grader)    | 52.59943383             | 52.601065505 (12:04:29Z) | 0.001631675 | 0.00330753 (finder rows only; grader 11,329 tokens, not priced in telemetry) | ≥ 0.00421658 (telemetry, grader excluded)                    | counter still lagging telemetry; promptfoo started with 2.00 − T ≥ 0.140 (§7)                                                                      |
| 4   | luna G1 (#269 × 10), `--max-spend 1.50`      | 52.601065505            | 52.72550066 (12:13:10Z)  | 0.124435155 | 0.05596225                                                                   | **0.12606683 (counter)**                                     | counter caught up: counter − finder telemetry so far ($0.06017883) = $0.06588800 ≈ the 12 grader calls (11,329 tokens on `gemini-3.1-pro-preview`) |
| 5   | qwen G2-01 (A3 probe), `--max-spend 1.47`    | 52.72550066             | 52.72550066 (12:38:23Z)  | 0.00000000  | 0.00152655                                                                   | 0.12759338 (counter + telemetry)                             | counter not yet updated                                                                                                                            |
| 6   | qwen G2-02..05, `--max-spend 1.47`           | 52.72550066             | 52.727027212 (13:31:01Z) | 0.001526552 | 0.00419268                                                                   | 0.13178606 (telemetry-carried; counter 0.12752338)           | counter lags the series by ≈ $0.0042                                                                                                               |
| 7   | qwen promptfoo (12 rows, finder + grader)    | 52.727027212            | 52.736070376 (13:47:58Z) | 0.009043164 | 0.00960474 (finder rows; grader 12727 tokens)                                | ≥ 0.1413908 (telemetry, grader excluded); counter 0.13663655 | started with 2.00 − T ≥ 0.142 (§7); G3 FAIL ends the candidate, no G1 spent                                                                        |
| 8   | minimax G2-01 (A3 probe), `--max-spend 1.45` | 52.736070376            | 52.754488626 (13:49:05Z) | 0.01841825  | 0.00295890                                                                   | 0.155054796 (counter)                                        | G2 FAIL on the probe ends the candidate; nothing more spent                                                                                        |
| —   | final re-read                                | —                       | 52.810547526 (13:51:04Z) | —           | —                                                                            | **0.211113696 (counter)**                                    | the counter trails the series by minutes; re-read again at commit time, see Spend                                                                  |

### Candidate 1 — `openai/gpt-6-luna` @ `openai`

**G2 (clean × 5, tool-enabled): PASS — 5/5 valid, `findings: []` on every attempt.** `gate-openai-clean.jsonl`
(2026-10-03T11:58:45Z–12:00:55Z): attempt 01 run alone as the A3 probe (`--through 1`), 02–05 as
`--start 2 --append`. Every attempt: 2 requests, both `provider: OpenAI`, `finishReason: stop`, 0 reasoning
tokens on both channels and 0 reasoning text chars on every request (A3 holds), 0 `getFileContext` calls,
0 repairs, 0 retries, cost complete. Costs $0.000502, $0.000114, $0.000126, $0.000055, $0.000112 (series
$0.000909); latency 3.6 s, 2.9 s, 2.7 s, 2.5 s, 2.9 s.

**One-off cost report (§1, not a gate rule), G2-01's two requests against the base-tier list price
0.10 / 0.50 per M:** request 1 — 1,726 in / 24 out, reported cost $0.000227675 vs $0.000184600 at list
(**1.233×**); request 2 — 2,071 in / 32 out, $0.000274800 vs $0.000223100 (**1.232×**). With the output
side at list price, the billed input would be ≈ 2,157 and 2,588 tokens, i.e. **≈ 1.25× the SDK's reported
input token count on both requests**. The pinned endpoint reported `OpenAI`; the name cannot tell the base
tier from `openai/flex` (0.5×) or `openai/fast` (2×), and neither of those ratios matches. The likeliest
reading is a native-vs-normalized token-count difference (OpenRouter bills native tokens; the SDK reports
the normalized count), not a tier change; the generation ids were not recorded, so it is not resolved here.
Reported to the owner; G4 uses the reported `cost` as is.

**G3 (12 fixture rows, pinned, `-j 1`, `--no-cache`, grader `google/gemini-3.1-pro-preview`): PASS.**
`gate-openai-promptfoo.jsonl` from the export of 2026-10-03T12:02:47Z–12:04:29Z (12 rows, 0 errors). Every
required metric 3/3: js-loop `issue_recall`; React `issue_recall`, `review_fails`, `flaw_stale_closure`,
`flaw_lost_cleanup`, `flaw_unsafe_html`; clean `no_false_alarms`. Diagnostic cross-hunk `tool_required` 3/3
and `flaw_cross_hunk_contract` 3/3 (1–2 `getFileContext` calls per row, the contract file delivered). Every
request of every row reported `OpenAI`; 0 reasoning tokens on both channels and 0 reasoning text on all 22
requests (A3 holds); 0 retries, 0 repairs, 0 finder errors, 0 grader errors (A1 not triggered).

**G4: PASS — median $0.00018176 (0.060× the ceiling $0.00301653), max $0.00080244** (a cross-hunk row with 3
steps); every row's cost complete. Latency median 3.4 s, max 6.8 s. Finder cost of the 12 rows $0.00330753.

**G1 (#269 × 10, inputs of §3): PASS — 10/10 attempts end with a valid object, 0 repairs.**
`gate-openai-pr269.jsonl` (2026-10-03T12:06:13Z–12:08:39Z). Every request of every attempt reported `OpenAI`
(42 requests in all); 0 reasoning tokens on both channels and 0 reasoning text on every request (A3 holds);
0 retries, no 429, no timeout, no `FinderOutputError`; every request priced. Requests per attempt 2–6
(`getFileContext` calls 0–6; attempts 03 and 10 made none). Cost per attempt: $0.012821, $0.004836,
$0.003113, $0.004779, $0.004788, $0.004411, $0.005650, $0.003993, $0.008430, $0.003141 — **median $0.0047835,
max $0.012821**, series $0.055962. Latency **median 13.0 s, max 24.0 s** (7.98–24.01 s). Findings per attempt
5, 1, 3, 5, 4, 3, 4, 3, 6, 4 (38 in all, majors on 7 of 10 attempts; no empty review). Hand-read material:
the `findings` of all ten attempts in the JSONL (dedup in Phase 3).

**Verdict (automated G1–G4): PASS** — G2 5/5, G3 every required metric 3/3, G4 median 0.060× ceiling, G1
10/10. The §5 hand-read (Phase 3) and the owner's decision 4.4 decide admission.

### Candidate 2 — `qwen/qwen3.8-flash` @ `alibaba`

**G2 (clean × 5, tool-enabled): PASS — 5/5 valid, `findings: []` on every attempt.** `gate-alibaba-clean.jsonl`
(2026-10-03T12:37:58Z–13:31:01Z; attempt 01 alone as the A3 probe, 02–05 as `--start 2 --append`). Every
attempt: 6 requests, all `provider: Alibaba`, 0 reasoning tokens on both channels and 0 reasoning text on all
30 requests (A3 holds), 0 repairs, 0 retries, cost complete. Costs $0.001527, $0.001494, $0.000695,
$0.001190, $0.000814 (series $0.005719); latency 23.7 s, 13.9 s, 13.0 s, 33.7 s, 14.4 s. **Signal, not a
gate:** every attempt made 5 `getFileContext` calls — the whole step budget — on a one-file rename, then
finalized with an empty, correct review.

**G3 (12 fixture rows, pinned, `-j 1`, `--no-cache`, grader `google/gemini-3.1-pro-preview`): FAIL.**
`gate-alibaba-promptfoo.jsonl` from the export of 2026-10-03T13:43:23Z–13:47:58Z (12 rows, 0 errors, 0
grader errors — A1 not triggered). React: `flaw_stale_closure` **1/3** and `issue_recall` **2/3** — repeats
testIdx 4 and 5 reported the XSS and the lost cleanup but not the empty dependency array (testIdx 4 reported a
possible `TypeError` on `filter` instead; testIdx 5 returned two findings only); `review_fails`,
`flaw_lost_cleanup`, `flaw_unsafe_html` 3/3. js-loop `issue_recall` 3/3; clean `no_false_alarms` 3/3;
diagnostic cross-hunk `tool_required` 3/3 and `flaw_cross_hunk_contract` 3/3 (5–6 `getFileContext` calls per
row; the three clean rows also made 5 calls each). Every request of every row reported `Alibaba`; 0 reasoning
on both channels on all 43 requests (A3 holds); 0 retries; 1 format repair (React testIdx 5, successful).

**G4: PASS — median $0.00068266 (0.226× the ceiling), max $0.00162549**; every row's cost complete. Latency
median 15.3 s, max 34.9 s. Finder cost of the 12 rows $0.00960474; grader 12,727 tokens.

**Verdict: `FAIL (G3)`** — the first decisive failure (§5 step 3); G1 is `not measured (stopped after G3
FAIL)` and nothing more was spent on this candidate. G4 passing does not change it (the G4-only pause applies
only when G3 passes).

### Candidate 3 — `minimax/minimax-m3` @ `minimax`

**G2-01 (the A3 probe, run alone): the shape is honoured, the gate is failed.** `gate-minimax-clean.jsonl`
(2026-10-03T13:48:40Z–13:49:05Z): `valid`, 2 requests, both `provider: Minimax` (so no provider mismatch),
0 reasoning tokens on both channels and 0 reasoning text (A3 holds), 0 `getFileContext` calls, 0 repairs, 0
retries, cost $0.002959 (complete), latency 24.7 s — and **2 findings on the defect-free rename**, both `nit`
on `src/lib/format-bytes.ts:4`: (documentation) the new JSDoc "stops short of documenting the function's other
load-bearing, invisible contracts"; (testing) "no test pins" the base-10 unit choice. §4: any finding, `minor`
or `nit` included, fails G2; §5 step 1: any failure on G2-01 is a G2 failure, G2 needs 5/5.

**Verdict: `FAIL (G2)`** — attempts 02–05 were not run (`unrecorded: 4` in the series summary), G3/G4 and G1
are `not measured (stopped after G2 FAIL)`; nothing more was spent on this candidate.

### Verdicts

Every candidate has exactly one label (§5). Measured in the registered order; each stopped at its first
decisive failure.

| #   | Candidate            | G2 (clean × 5, `[]`)               | G3 fixtures (12 rows)                                 | G4 (median ≤ $0.00301653)     | G1 (#269 × 10, ≥ 9/10)               | Verdict (Phase 2)                                                  |
| --- | -------------------- | ---------------------------------- | ----------------------------------------------------- | ----------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| 1   | `openai/gpt-6-luna`  | **PASS** 5/5                       | **PASS** every required metric 3/3                    | **PASS** $0.00018176 (0.060×) | **PASS** 10/10, 0 repairs            | **PASS (automated G1–G4)** → hand-read (§6, Phase 3), decision 4.4 |
| 2   | `qwen/qwen3.8-flash` | **PASS** 5/5                       | **FAIL** `flaw_stale_closure` 1/3, `issue_recall` 2/3 | PASS $0.00068266 (0.226×)     | not measured (stopped after G3 FAIL) | **FAIL (G3)**                                                      |
| 3   | `minimax/minimax-m3` | **FAIL** 0/1 — 2 nits on the probe | not measured (stopped after G2 FAIL)                  | not measured                  | not measured (stopped after G2 FAIL) | **FAIL (G2)**                                                      |

A3 held on every request of every attempt and row of all three candidates (both channels, and reasoning
text); the pinned provider name was reported on every request (`OpenAI` ×74, `Alibaba` ×73, `Minimax` ×2); no
attempt or row was invalidated; no 429, no timeout, no `FinderOutputError`; production's retry never fired
(0 retries in all series); no grader error, so Amendment A1's re-grade was not needed. No `paused (G4 only)`
and no $1.60 stop occurred, so the owner was not asked mid-measurement.

**Comparison (Phase 2 §3): not applicable** — exactly one candidate passed the automated G1–G4.

### Spend

Counter T0 = $52.59943383 (11:55:58Z). The key's usage counter trails each series by minutes (it read
unchanged right after the first two series and caught up later), so the ledger carries T as the larger of the
counter and the finder telemetry, and the counter — the authority (§7) — is re-read at the end. **Counter at
the final re-read: $52.810547526 (13:51:04Z, unchanged at 13:51:52Z) → T = $0.2111137.** Ceiling $54.59943383 (T0 + 2.00) was never
approached; the $1.60 stop was never reached.

Finder telemetry (per-request `cost`, every request priced): luna G2 $0.00090905 + promptfoo rows $0.00330753 +
G1 $0.05596225 = **$0.06017883**; qwen G2 $0.00571923 + promptfoo rows $0.00960474 = **$0.01532397**; minimax
G2-01 **$0.00295890**. Finder total **$0.07846170**. The grader (`google/gemini-3.1-pro-preview`, 24
`llm-rubric` calls, 24,056 tokens) is not priced in the telemetry; it is the difference between the counter
delta and the finder total — see the final row of the ledger. Where a counter delta covered finder requests
alone it matched the telemetry (row 4: $0.12443516 counter for G1 $0.05596225 plus the catch-up of the
earlier rows).
