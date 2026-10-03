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
