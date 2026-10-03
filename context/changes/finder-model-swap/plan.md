# Finder model swap — pre-registered gate and measurement Implementation Plan

## Overview

Choose a replacement for the `z-ai/glm-4.6` finder by measuring three candidates against a gate that is
registered **before the first paid call**. The candidates, in order: `openai/gpt-6-luna` → `openai`,
`qwen/qwen3.8-flash` → `alibaba`, `minimax/minimax-m3` → `minimax`. The gate keeps the archived
`finder-serialization-outage` G1–G4 thresholds and data, and adds the owner's G3 hand-read threshold.
Production changes happen only for a candidate the owner admits (decision 4.4).

## Current State Analysis

- **The finder runs no admitted model.** `finder-serialization-outage` removed the outage's cause in code
  (Phases 1–3: no `response_format`, the format carried in the prompt, local parsing), but its gate admitted no
  `glm-4.6` endpoint (`context/archive/2026-09-24-finder-serialization-outage/gate.md`, Verdicts). This branch
  starts from that branch; `master` has neither.
- **Production request shape** (origin `code`, set by the predecessor's owner amendment A3, so a `user`
  decision): `reasoning: {enabled: false}` on every request via `extraBody`
  (`packages/code-reviewer/src/reviewer.ts:262-269`); unconditional `require_parameters: true` and
  `only`/`order` from `OPENROUTER_FINDER_PROVIDERS` (`src/config.ts:148-166`); no `response_format`
  (`reviewer.ts:288`); CI step budget 5 (`src/cli.ts:78`); 300 s timeout (`src/pipeline.ts:50`); SDK retries off.
- **The gate runner is glm-only.** `scripts/finder-gate.mjs` hard-codes `MODEL = "z-ai/glm-4.6"` and an
  `ENDPOINT_NAMES` table of the four glm endpoints (`:47-49`), runs its main body at import (no testable
  core), and can cut a series only by spend (`--max-spend`), not by attempt number.
- **The promptfoo adapter already measures A3 on both channels** — SDK and OpenRouter reasoning tokens plus
  reasoning-text length per request, and `stepProviders` (`evals/finder-provider.ts:86-118, 288-297`). But the
  predecessor turned the promptfoo export into its `gate-*-promptfoo.jsonl` rows by hand: no committed code
  checks provider names, cost completeness or the G3/G4 arithmetic for fixture rows.
- **`evals/promptfooconfig.yaml` has no entry for any candidate,** and its comment says OpenAI is excluded
  because of strict structured outputs (`:20-24, 50-53`). That reason died with `response_format`; the
  comment is now stale.
- **Production pointers to the model** (origin `code`): `DEFAULT_MODEL` (`src/config.ts:14`), pinned by a
  literal assertion (`src/config.test.ts:38`); `DEFAULT_FINDER_PROVIDERS = ["novita"]` (`src/config.ts:130`),
  pinned likewise (`config.test.ts:154`); the repository variable `OPENROUTER_REVIEW_MODEL`
  (`.github/workflows/review.yml:292`), which today reads `z-ai/glm-4.6` and outranks `DEFAULT_MODEL`
  (`config.ts:208-209`: override → `OPENROUTER_REVIEW_MODEL` → `OPENROUTER_MODEL` → `DEFAULT_MODEL`). The
  predecessor's impl-review F1 is why these used to move together. **Owner decision 2026-10-03 (plan-review
  F1, variant B):** the variable is deleted before G5 and not restored, so `DEFAULT_MODEL` is the single source
  of the finder model. The chain uses `||`, and `action.yml:25,86` maps an empty input to an empty env value,
  so an unset variable falls through to `DEFAULT_MODEL`; nothing in `.github/` sets the legacy `OPENROUTER_MODEL`.
- **Service tiers are opt-in** (owner correction, verified 2026-10-03): OpenRouter, Provider Routing ›
  Targeting Specific Provider Endpoints: _"service tier endpoints (e.g. `openai/fast`, `google-vertex/flex`)
  are **not** matched by base slugs — they require explicit opt-in via the `service_tier` parameter or a
  tier-suffixed slug."_ The finder sends neither (0 matches for `service_tier`/`serviceTier` in
  `packages/code-reviewer`). Pinning `openai` therefore reaches the base tier only.
- **Evidence about the candidates on this task: none.** `research.md` is a list of what is eligible and
  affordable to measure. Every cheap model measured so far failed live in a different way
  (`context/archive/2026-08-10-finder-tool-loop-evals/decision.md`).

## Definitions

| Term             | Decided meaning                                                                                                                                                                   | Origin                                                                                | On degenerate data                                                                                                                                                                                                                                                               | Verified by   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Candidate        | One model pinned to one endpoint slug through `OPENROUTER_FINDER_PROVIDERS`: `openai/gpt-6-luna`@`openai`, `qwen/qwen3.8-flash`@`alibaba`, `minimax/minimax-m3`@`minimax`.        | user (2026-10-02)                                                                     | `gpt-6-sol` is not a candidate; it returns only by a separate owner decision.                                                                                                                                                                                                    | 0.4, 2.5      |
| Attempt          | One production pass: one `review()` call (G1, G2) or one promptfoo row (G3/G4), wrapped in production's single transient retry (`withOneRetry`, `src/retry.ts`). No other re-run. | user (archived gate; retry rule 2026-10-03 at approval)                               | 429/5xx/timeout persisting after the one retry, `FinderOutputError` (never retried), refusal under `require_parameters` → a **failed** attempt, never a skipped one. Retries are recorded and counted in cost and latency.                                                       | 1.1, 2.1      |
| Provider match   | Every request of an attempt reports the expected provider name for the pinned slug.                                                                                               | user (archived gate)                                                                  | Missing or different name → the attempt is **invalidated** (cannot pass). On G2-01 it also stops the candidate's series pending the owner (see A3 probe).                                                                                                                        | 1.1           |
| A3 leak          | Any request with SDK reasoning tokens > 0, OpenRouter reasoning tokens > 0, or reasoning text length > 0.                                                                         | user (A3; 2026-10-02/03)                                                              | Checked on **every request of every gate**, not only on the probe. A leak fails the attempt.                                                                                                                                                                                     | 1.1           |
| A3 probe         | The candidate's G2 attempt 01, run alone before anything else for that candidate.                                                                                                 | user (2026-10-02)                                                                     | Leak, or refusal of the shape, or provider-name mismatch → the candidate stops; result "cannot honour the production shape (A3)" (or "provider name mismatch — owner decision"). Nothing more is spent on it. A 429 on the probe is a G2 failure → decisive stop (G2 needs 5/5). | 1.5, 2.1      |
| Decisive failure | The first gate a candidate fails, in measuring order G2 → G3/G4 → G1.                                                                                                             | user (2026-10-03)                                                                     | Ends the candidate's measurement. **Exception: G4 failing alone** (G3 PASS on the same 12 rows) → pause, report median and ratio, owner decides whether to spend on G1 (archived G-A1).                                                                                          | 2.4, 2.5      |
| Verdict labels   | `PASS`, `FAIL (Gx)`, `not measured (stopped after Gx FAIL)`, `not measured (budget)`, `cannot honour the production shape (A3)`, `paused (G4 only) — owner`.                      | user (2026-10-02/03)                                                                  | `not measured (budget)` never carries a verdict; `stopped after Gx FAIL` does (the candidate is FAIL).                                                                                                                                                                           | 2.5           |
| Spend            | Running total from the OpenRouter key's usage counter (`GET /api/v1/key`, `usage`), read before and after every series; per-request telemetry is the per-attempt figure.          | user (archived G-A2)                                                                  | Counter and telemetry disagree → the counter governs the budget; the gap is reported.                                                                                                                                                                                            | 2.3           |
| Budget           | $2.00 total, everything included (finder, finalization, repair, grader, judge, impl review and G5). Stop and ask once the total passes $1.60. $2.00 never exceeded.               | user (2026-10-02; G5 inside confirmed 2026-10-03, plan-review F3; G5 limit $0.50, F6) | A series that could cross $2.00 with its next attempt is cut before it (bound `A_max` per candidate × case, in `gate.md`). G5 runs only if 2.00 − T ≥ $0.50 (the G5 limit, F6); otherwise G5 is `not measured (budget)` and goes to the owner.                                   | 2.3, 2.4, 4.4 |
| Valid G1 attempt | `g1Pass: true`: valid object (≤ 1 repair), provider match, no A3 leak.                                                                                                            | user (archived gate)                                                                  | An explicit `findings: []` is valid and contributes nothing to N.                                                                                                                                                                                                                | 1.1           |
| Distinct finding | One row per (claimed defect, location) across a candidate's valid G1 attempts, carrying every contributing attempt ID.                                                            | user (2026-10-03)                                                                     | Same defect, different file → separate. Different claims at one location → separate. Contradictory wordings → **split, never merged**. Dedup is blind (no correctness judgement); uncertain decisions are marked.                                                                | 3.2           |
| N                | Number of rows in the owner-approved dedup table.                                                                                                                                 | user (2026-10-02/03)                                                                  | N = 0 → G3 FAIL. N < 40 → all N judged, limit floor(0.05 × N); N ≤ 19 → limit 0.                                                                                                                                                                                                 | 1.1, 3.1      |
| Sample           | min(40, N) rows drawn deterministically from the frozen table with a seed recorded before the draw.                                                                               | user (2026-10-02)                                                                     | No re-draw. The table's sha256 is written to `gate.md` before the seed.                                                                                                                                                                                                          | 1.1, 3.1      |
| Rejected         | The row does not identify a real defect in #269's diff (at `fca2778`); **unresolved counts as rejected**.                                                                         | user (2026-10-02)                                                                     | Every judgement carries a one-sentence reason; the owner approves every classification.                                                                                                                                                                                          | 3.3           |

## Desired End State

- `context/changes/finder-model-swap/gate.md` holds a Pre-registration written before any paid call, and a
  Results section with a verdict label for each of the three candidates, raw JSONL per series, and the spend
  ledger (counter and telemetry).
- `finder-gate.mjs` can measure any of the three candidates; its pure logic lives in a tested core module; a
  committed script turns a promptfoo export into checked G3/G4 rows; a committed script freezes a dedup table
  and draws the hand-read sample.
- Then exactly one of:
  - **No candidate admitted** → `change.md` records it; production is unchanged; we stay without a finder
    until a separate owner decision.
  - **One or more admitted** → the owner's 4.4 decision (from a comparison if > 1) names one; Phase 4 moves the
    two code pointers (`DEFAULT_MODEL`, `DEFAULT_FINDER_PROVIDERS`) together, the owner deletes the repository
    variable `OPENROUTER_REVIEW_MODEL` for good, Phase 4 adds T2, passes G5 on this change's own PR to
    `master` by PR.

### Key Discoveries:

- `finder-gate.mjs:47-49` — the glm-only `ENDPOINT_NAMES` and `MODEL`; the exact-match table is the design to keep.
- `evals/finder-provider.ts:288-297` — A3 telemetry for promptfoo rows exists; only the extraction is missing.
- `src/config.ts:160-166` — routing is `only`+`order` with fallbacks inside the list; pinning one slug pins one endpoint.
- `evals/promptfooconfig.yaml:20-24, 50-53` — stale exclusion rationale for OpenAI and Alibaba (`json_object`), both moot without `response_format`.
- Archived procedure to reuse: #269 input = `git diff 3d0adc1...fca2778` with the workflow's EXCLUDES (65,455 B,
  sha256 `1e4ec088…550f`), rules `git show 3d0adc1:.github/ai-review-rules.md` (2,929 B), worktree at `fca2778`
  (`probe-phase0.md:39-41`); promptfoo filter command (`plan.md:541` of the archive).

## What We're NOT Doing

- Measuring `openai/gpt-6-sol`, `claude-sonnet-5(.5)`, Gemini, or any model not in the list.
- Changing any threshold, the G4 denominator, or the hand-read rule after a result is seen (each needs a
  dated owner amendment placed **before** the measurement it affects).
- Re-running any attempt beyond production's single transient retry, or re-drawing a sample.
- Adding an `ignore` field or `service_tier` handling to the finder's routing (not needed: base slugs exclude tiers).
- Re-reading Novita / `glm-4.6` (its status is recorded in `change.md`; it is not a candidate here).
- Merging, deleting the repository variable, or running G5 for a candidate the owner has not admitted.
- Restoring `OPENROUTER_REVIEW_MODEL` after deleting it. It may come back later only as an emergency override,
  by a separate owner decision.
- Measuring the hardening cases or anything beyond the 12 archived fixture rows (diagnostic rows, if any, never count).

## Implementation Approach

Four phases, the first two free. Phase 0 writes the pre-registration and reproduces the inputs locally.
Phase 1 builds and tests the tooling with no network. Phase 2 spends money, one candidate at a time, cheapest
gate first, stopping each candidate at its first decisive failure. Phase 3 is the owner's hand-read for the
survivors and the 4.4 decision. Phase 4 is production and runs only if 4.4 admits a candidate; otherwise it is
replaced by a short close-out.

## Critical Implementation Details

- **Ordering of the pre-registration** (owner, 2026-10-03, plan-review F4). Before the price re-read and the
  first paid call, three proofs must exist: (1) a `## Pre-registration seal` section in `gate.md`, **after** the
  Pre-registration, holding the sha256 of the Pre-registration section's bytes (from its `## Pre-registration`
  heading up to, not including, the seal heading) and the UTC time the hash was taken; (2) that state committed;
  (3) that commit **pushed to `origin`**, with GitHub's push time (repository activity API) recorded in the
  ledger. The push time is server-side and survives the rebase at merge, unlike a branch SHA, which is why no SHA
  pointer is used. A later protocol change goes into a `## Amendments` section **after** the seal (owner, 2026-10-03, F7):
  each amendment dated, with its own sha256 and pushed to `origin` before the measurement it affects. The seal
  covers only the Pre-registration section, so amendments never break it. The Results section never edits the
  Pre-registration, and the seal is never recomputed.
- **Freeze order in the hand-read.** blind dedup → owner approves merges and splits → sha256 of the approved
  table into `gate.md` → seed into `gate.md` → draw. Any other order lets the table or the seed be chosen after
  seeing the draw.
- **The A3 probe uses the runner's attempt cut, not a separate series.** G2 is one series of 5 attempts: run
  attempt 01 alone (`--through 1`), inspect it, then continue with `--start 2 --append`. Running "a probe" as
  its own file would add a sixth G2 attempt.

## Phase 0: Pre-registration and inputs (no paid calls)

### Overview

Write the gate before anything is measured, and prove the inputs reproduce byte for byte.

### Changes Required:

#### 1. The gate's pre-registration

**File**: `context/changes/finder-model-swap/gate.md` (new)

**Intent**: Register the whole protocol in one place so the Results can be read against it.

**Contract**: A `## Pre-registration` section, dated, containing:

- Candidates, order, slugs, expected provider names (`openai` → `OpenAI`, `alibaba` → `Alibaba`,
  `minimax` → `Minimax`, as reported in `provider_name` by `/api/v1/models/<id>/endpoints`), and the
  service-tier quote above with its fetch date.
- G1–G4 copied from the archived gate **unchanged** (thresholds, data, the G4 denominator and its 12 costs,
  the 3× ceiling $0.00301653), plus G3's hand-read threshold from the 2026-10-02 decision.
- Measuring order G2 → G3/G4 → G1 per candidate, **stated as a deliberate change from the archived order**
  (G1, G2, then promptfoo); the stop rule, the G4-only pause, and the verdict labels from Definitions.
- A3 on every request of every gate, both channels; the A3 probe = G2 attempt 01.
- Budget: $2.00 / $1.60 rules; `A_max` per candidate × case (2 × the pessimistic per-attempt figure in
  `research.md`, floored at $0.02); before each series, `--max-spend` = min(1.60 − T, 2.00 − T − A_max); a
  promptfoo run starts only if 2.00 − T ≥ 2 × its estimate (finder + grader); G5 is inside the $2.00
  (owner, 2026-10-03, F3) and its limit is $0.50 (owner, 2026-10-03, F6): it runs only if 2.00 − T ≥ $0.50,
  else `not measured (budget)` → owner. The limit covers the finder, the judge and the impl review, which runs
  because the PR's diff touches `plan.md` files (`review.yml:72-74`). A G5 that is `not measured (budget)` or not
  green **blocks the merge until the owner decides**.
- Amendments: a `## Amendments` section after the seal, each dated, with its own sha256, pushed before the
  measurement it affects (F7).
- **G2's exact invocation** (owner, 2026-10-03, F2), for every candidate, from `packages/code-reviewer`:
  `--case clean --n 5 --diff evals/fixtures/clean-change.diff --rules <scratch>/rules.md
--source-root evals/fixtures/clean-change`. The rules file is the same one G1 uses:
  `git show fca2778:.github/ai-review-rules.md`, 2,929 B, sha256 `34d5fcac…b48f` (full hash in `gate.md`;
  byte-identical to `3d0adc1`'s copy, verified 2026-10-03). The archive did not record G2's rules or source root;
  this gate fixes them. `--source-root` is the fixture's own tree, because the diff's path
  `src/lib/format-bytes.ts` exists only under it.
- The dedup merge rule, the freeze order, the sampling method (Phase 1 §4) and that the seed is chosen from
  `/dev/urandom` at the moment of drawing and written before the draw.
- The one-off cost report for `gpt-6-luna`: on G2-01's requests, `cost` ÷ tokens against the base-tier prices
  (0.10 / 0.50 per M); **a report, not a gate rule** (owner, 2026-10-03).

#### 2. Owner answers of 2026-10-03

**File**: `context/changes/finder-model-swap/change.md`

**Intent**: Record the three planning answers (stop at first decisive failure with its three clarifications;
the service-tier correction; owner-approved dedup table with the freeze order) as a dated section.

**Contract**: Section "Owner decisions (2026-10-03): planning answers".

#### 3. Inputs reproduced

**File**: none committed — a local scratch directory recorded in `gate.md`.

**Intent**: Reproduce #269's diff, rules and worktree exactly as the predecessor did, and check the fixtures.

**Contract**: diff 65,455 B with sha256 starting `1e4ec088` and ending `550f`; rules 2,929 B with sha256
`34d5fcacb550713a2bbf819b332191fc6626d52412168e0fe9b4ac3feb9cb48f`; worktree at `fca2778`;
`evals/fixtures/clean-change.diff` and `evals/fixtures/clean-change/` unchanged since the archived run (`git log`
on the paths). Any mismatch stops the phase.

#### 4. Seal and push

**File**: `gate.md` (`## Pre-registration seal`)

**Intent**: Make the pre-registration's timing verifiable from the merged record (Critical Implementation Details).

**Contract**: after the owner's approval (0.5), the seal section gets the approval date, the sha256 and the UTC
hash time; the state is committed and pushed to `origin`. Pushing a branch runs the push-triggered CI jobs, not
the PR-only `ai-review`, so it costs nothing on the OpenRouter key. Phase 2 reads the push time before T0.

### Success Criteria:

#### Automated Verification:

- The #269 diff reproduces: size 65,455 and the recorded sha256 prefix/suffix (`wc -c`, `sha256sum`)
- The rules reproduce at 2,929 bytes with sha256 `34d5fcac…b48f`, and the worktree's `HEAD` is `fca2778`
- `git log --oneline -- packages/code-reviewer/evals/fixtures/clean-change.diff packages/code-reviewer/evals/fixtures/clean-change` shows no commit after the archived run
- `gate.md` contains a `## Pre-registration` section (with G2's invocation) and no `## Results` section

#### Manual Verification:

- The owner reads the Pre-registration and approves it before Phase 2 (the approval date goes into the seal)
- After approval: the seal's sha256 matches the section's bytes, the commit is on `origin`, and GitHub's push
  time is recorded — all before any paid call

**Implementation Note**: Manual checks are acceptance. `/rune-implement` commits a phase once its automated
verification passes, then asks the human about these; a pending manual check is reported, not a blocker for
the next phase — **except here: Phase 2 must not start until 0.5 and 0.6 are done.**

---

## Phase 1: Gate tooling (no network)

### Overview

Make the runner model-agnostic and testable, and commit the two pieces the predecessor did by hand.

### Changes Required:

#### 1. Gate core

**File**: `packages/code-reviewer/scripts/finder-gate-core.mjs` (new), `scripts/finder-gate-core.test.mjs` (new)

**Intent**: Move the runner's pure logic out of the side-effecting script so it can be tested.

**Contract**: Exports `ENDPOINT_NAMES` (the four glm entries kept, plus `openai: "OpenAI"`,
`alibaba: "Alibaba"`, `minimax: "Minimax"`), `classify(error)`, `reasoningTokensOf(step)`, and
`evaluateAttempt({requests, outcome, expectedName})` → `{providerMismatch, invalidated, reasoningLeak, cost,
costComplete, g1Pass}`, and `runAttempt(fn, {sleep, random})` → `{result | error, retries: [{class, delayMs}]}`,
which wraps `fn` in `withOneRetry` from `src/retry.ts` (the production retry rule, owner 2026-10-03; no copy of
the classifier or the delay). Tests: provider mismatch and a missing provider invalidate; each of the three A3
channels alone makes a leak; a null cost makes the cost incomplete; a `FinderOutputError`, a persisting 429
(`APICallError-429`) and a timeout are failed, not skipped; an empty `findings` list with no other fault passes;
**429 → one retry → success** is a passing attempt with `retries.length === 1`; **429 twice** fails the attempt
with two calls made; a `FinderOutputError` is not retried (one call); the injected `sleep` receives the
production delay (no real wait).

#### 2. Runner

**File**: `packages/code-reviewer/scripts/finder-gate.mjs`

**Intent**: Measure any candidate, and allow the A3 probe as attempt 01 of the G2 series.

**Contract**: required `--model <id>` (no default; no glm fallback); `--through <k>` runs attempts
`start..k` only (k ≤ n) and leaves the rest unrecorded for a later `--start k+1 --append`; the record gains
`model`, `retries` (count and per-retry class and delay) and `retried`. Each attempt runs through
`runAttempt`; requests from both tries stay in `requests`, so cost, latency, provider and A3 checks cover the
retry too. Everything else (per-attempt records, `--max-spend`, refusal to re-run a recorded attempt) is
unchanged. The SUMMARY line reports the series' retry count. The header names this change, its `gate.md` and
the retry rule (replacing "Nothing is retried").

#### 3. promptfoo rows

**Files**: `packages/code-reviewer/evals/promptfooconfig.yaml`; `scripts/promptfoo-gate-rows.mjs` (new) with
`scripts/promptfoo-gate-rows.test.mjs`

**Intent**: Run the 12 archived rows per candidate, and turn the export into checked rows plus the G3/G4
verdicts.

**Contract**: three providers `candidate-gpt-6-luna`, `candidate-qwen3.8-flash`, `candidate-minimax-m3`
(`finder-provider.ts`, the model ids above); the stale OpenAI / Alibaba exclusion comment is rewritten to say
why it no longer applies. `finder-provider.ts` wraps `reviewer.review` in `withOneRetry` like the pipeline
(replacing its "Deliberately one pipeline attempt" comment; `FinderOutputError` is still not retried, so format
failures stay exposed) and reports `retries` in the row metadata; `finder-provider.test.ts` gets the same
429 → retry → success and 429 twice → error cases with an injected sleep. The script reads a promptfoo `-o` JSON export and `--expected-provider <name>`,
writes one JSONL line per row (`providerOk`, `costComplete`, `reasoningLeak`, `retries`, metrics, `finderCost`),
and prints the total retry count and:
row count (≠ 12 → "failed run, not a gate result"), each G3 required metric as k/3, the G4 median and max over
all 12 rows (a row with incomplete cost fails G4, never omitted), and any invalidated row. Tests on a synthetic
export: 11 rows → failed run; one mismatched provider → invalidated; one leak → failed row; one missing cost →
G4 FAIL; a G3 metric at 2/3 → G3 FAIL.

#### 4. Hand-read sample

**File**: `packages/code-reviewer/scripts/hand-read-sample.mjs` (new) with `hand-read-sample.test.mjs`

**Intent**: Freeze the approved dedup table and draw the sample reproducibly.

**Contract**: `freeze <table.json>` prints the sha256 of the canonical JSON; `draw <table.json> --sha <hex>
--seed <hex>` refuses when the sha differs, then ranks rows by `sha256(seed + ":" + rowId)` and takes the first
min(40, N), printing N and the limit floor(0.05 × N) (N = 0 → "G3 FAIL: no findings", no draw). Tests: same
inputs → same sample; a changed table → refusal; N = 25 → 25 rows, limit 1; N = 19 → limit 0; N = 0 → FAIL.

### Success Criteria:

#### Automated Verification:

- Package tests pass: `cd packages/code-reviewer && npm test`
- Package types: `npm run typecheck`; lint: `npm run lint`
- Repo format check passes: `npm run format:check` (from the repo root)
- `node scripts/finder-gate.mjs --endpoint openai --case x` without `--model` exits non-zero naming `--model`

#### Manual Verification:

- A reviewer reads the `--through` / `--append` path and agrees it cannot add a sixth G2 attempt or re-run one

---

## Phase 2: Measurement (paid)

### Overview

Measure the candidates in order. Each stops at its first decisive failure. The budget is checked before
every series.

### Changes Required:

#### 1. Price and counter read

**File**: `context/changes/finder-model-swap/gate.md` (Results)

**Intent**: Re-read prices immediately before the first call; record the counter.

**Contract**: The three endpoints' prices, `supported_parameters` (`tools`, `reasoning`) and
`reasoning.mandatory`, with a UTC timestamp. A price change, a lost parameter, or `mandatory: true` →
stop and ask the owner before any call. Before this read: `origin` carries the sealed commit, the seal's sha256
still matches the Pre-registration section's bytes (only that section; `## Amendments` is outside it), and GitHub's push time (earlier than this timestamp) is in the ledger;
otherwise stop. Counter value `T0`.

#### 2. Per candidate, in order luna → qwen → minimax

**Files**: `gate-<slug>-clean.jsonl`, `gate-<slug>-promptfoo.jsonl`, `gate-<slug>-pr269.jsonl` in the change folder

**Intent**: Run G2 (probe first), then G3/G4, then G1, applying the stop rules.

**Contract**:

1. Budget check (Definitions: Budget). Passed $1.60 → stop and ask.
2. G2-01 alone: `--model <id> --endpoint <slug>` + G2's registered invocation (`--case clean --n 5 --diff
evals/fixtures/clean-change.diff --rules <scratch>/rules.md --source-root evals/fixtures/clean-change`) +
   `--through 1`. A3 leak, refusal, or provider
   mismatch → candidate ends with the matching label. For luna, the one-off cost report.
3. G2-02..05: the same invocation with `--start 2 --append`. < 5/5 valid with `findings: []` → `FAIL (G2)`, stop.
4. promptfoo: `OPENROUTER_FINDER_PROVIDERS=<slug> npm run eval -- --env-file .env --no-cache --repeat 3 -j 1
--filter-providers candidate-<name> --filter-pattern "^(Finds the material|React 16->19|Cross-hunk contract|Defect-free mechanical rename)" -o <export>`,
   then `promptfoo-gate-rows.mjs`. G3 fail → `FAIL (G3)`, stop. G4 fail with G3 pass → `paused (G4 only)`, ask.
5. G1: `--case pr269 --n 10 --diff <scratch>/pr269.diff --rules <scratch>/rules.md --source-root <worktree at
fca2778>`. < 9/10 → `FAIL (G1)`.
6. Counter read after each series; the ledger row goes into `gate.md`.

#### 3. Comparison (only if more than one candidate passes G1–G4 automated)

**File**: `gate.md`

**Intent**: Give the owner what they asked for to choose among passers.

**Contract**: per passer: G1 k/10 and repairs, G3 metrics, G4 median/max, median cost and latency per #269
attempt, endpoint count and last-1-day uptime from the endpoints API, observed 429s. No recommendation is
binding; the hand-read still decides admission.

### Success Criteria:

#### Automated Verification:

- Every series that ran has one JSONL line per attempt run, and `not-run` attempts are listed in its summary
- Every promptfoo run produced exactly 12 rows or is recorded as a failed run
- The counter never exceeded `T0 + 2.00` (ledger in `gate.md`)

#### Manual Verification:

- The owner confirms each stop at $1.60 or a `paused (G4 only)` before more is spent
- The Results table gives every candidate exactly one verdict label from Definitions

---

## Phase 3: Hand-read and decision 4.4 (only for automated passers)

### Overview

The owner's G3 hand-read for each candidate that passed the automated G1–G4, then the admission decision.

### Changes Required:

#### 1. Blind dedup

**File**: `context/changes/finder-model-swap/hand-read-269.md` (new), with a machine copy `hand-read-<slug>.json`

**Intent**: One table per passer from its valid G1 attempts; no correctness judgement.

**Contract**: the merge rule from `gate.md`; each row: id, claimed defect, location, contributing attempt IDs,
one-sentence grouping reason, `uncertain` flag. Merges and splits are listed separately for approval.

#### 2. Owner approval and freeze

**File**: `gate.md`

**Intent**: Approval of merges and splits (1:1 rows need no action), then `freeze` → sha256, then seed, then `draw`.

**Contract**: approval date, sha256, seed, N, limit, and the sampled row ids, in that order of writing.

#### 3. Pre-sort and classification

**File**: `hand-read-269.md`

**Intent**: The agent pre-sorts each sampled row (real / rejected / unresolved) with a reason against
`fca2778`; the owner approves or changes every classification.

**Contract**: per row: agent proposal, reason, owner's classification, date. Rejected count ≤ limit → G3 PASS.

#### 4. Decision 4.4

**File**: `gate.md`, `change.md`

**Intent**: Record the admitted candidate (or none).

**Contract**: none admitted → `change.md` records "no finder until a separate owner decision"; Phase 4 is
replaced by close-out (record, `npm test`, no production change).

### Success Criteria:

#### Automated Verification:

- `hand-read-sample.mjs draw` reproduces the recorded sample from the recorded sha and seed

#### Manual Verification:

- The owner approved the merge table before the seed was written (dates in `gate.md`)
- The owner approved every classification in each sample
- The owner records decision 4.4

---

## Phase 4: Production (only after 4.4 admits a candidate)

### Overview

Move the finder to the admitted candidate, add T2, pass G5, and ship by PR.

### Changes Required:

#### 1. Production pointers

**Files**: `packages/code-reviewer/src/config.ts`, `src/config.test.ts`

**Intent**: Make `DEFAULT_MODEL` the single source of the finder model (owner, 2026-10-03, plan-review F1,
variant B) and move both code pointers together.

**Contract**: `DEFAULT_MODEL` = the admitted model and its literal assertion; `DEFAULT_FINDER_PROVIDERS` = the
admitted slug and its literal assertion. Comments rewritten so none describes the variable as the model's
source or tells the reader to change the default "only alongside the repository variable":

- `config.ts:6-13` (above `DEFAULT_MODEL`) — names this change; says the variable is deleted and
  `DEFAULT_MODEL` is what production runs; an override may return only by a separate owner decision.
- `config.test.ts:31-36` (above the literal `DEFAULT_MODEL` assertion) — same correction.
- `config.test.ts:154-157` (above the provider assertion) — drop "PROVISIONAL … until Phase 5 of
  `finder-serialization-outage`"; name this change's `gate.md` as the measurement behind the list (F5).
- The `resolveModels` doc comment (`config.ts:198-202`) still describes the chain truthfully and stays.

Checked 2026-10-03: `AGENTS.md`, `context/foundation/agent-env-setup.md` and `review.yml` do not describe
`OPENROUTER_REVIEW_MODEL` as the model's source (`AGENTS.md` names only `OPENROUTER_IMPL_REVIEW_MODEL`;
`review.yml:292` only passes it through; `action.yml:25` says "empty = package default chain", which stays true).
Re-check with `grep -rn OPENROUTER_REVIEW_MODEL` outside `context/archive/` at implementation time.

#### 1a. Repository variable deleted (owner, outward-facing)

**Intent**: The owner — not the agent — deletes `vars.OPENROUTER_REVIEW_MODEL` immediately before G5 and does
not restore it. From that moment every PR's finder runs that PR's own `DEFAULT_MODEL`: `master` keeps
`glm-4.6` (already non-functional), and this change's PR runs exactly the code and model that will merge.

**Contract**: the agent stops and asks; the owner deletes the variable; the agent confirms with
`gh variable list` that it is absent and records the time in `gate.md`.

#### 2. T2 — bounded stage-1 log

**File**: `packages/code-reviewer/src/pipeline.ts:533` (`observeFinderStep`, where `describeFinderStep` is
called) with tests in `pipeline.test.ts`

**Intent**: Log each gathering step's model text in CI with a fixed cap, the original length, an explicit
truncation marker, and escaped control characters (`follow-ups/review-fixes.md` T2 of the archive).

**Contract**: one log line per gathering step; an empty stage-1 text is distinguishable from a dropped one.

#### 3. G5 — live review of this change's own PR

**Intent**: This change's own PR from `feat/finder-model-swap` to `master` (owner, 2026-10-03, F6), reviewed by
the real workflow with the admitted model: whole review green, `finderTelemetry` present, every finder step
logged with its provider. Any PR of this branch into `master` carries the same diff and pays the same review,
so a separate scratch PR would pay for it twice.

**Contract**:

- The PR is opened **as a draft**. `review.yml:23-26` skips draft PRs, so pushes to the draft cost nothing on
  the OpenRouter key; `ready_for_review` is not in `review.yml:14`'s event types, so marking it ready does not
  start a review by itself.
- Preconditions — 1a done; 2.00 − T ≥ $0.50; otherwise G5 is `not measured (budget)` and the owner decides.
- G5 = the first review run after the owner marks the PR ready **and** adds the `ai-cr:review` label (the
  labelled event, `review.yml:26`); the workflow removes the label itself (`review.yml:45-51`).
- Every later push to the non-draft PR (a fix, or the rebase `strict` branch protection requires) starts another
  paid review; each such run's spend is read from the counter and added to the ledger, inside the $2.00. Before
  a push with 2.00 − T < $0.50, the owner decides first (the PR can go back to draft).
- A G5 that is `not measured (budget)` or not green blocks the merge until the owner decides.
- The run must show finder = the admitted model, read from `models.finder` in the run's `review.json` (`pipeline.ts:634`, uploaded
  as the `ai-review-output` artifact), not inferred from provider names; any other model fails G5. Spend is read from the counter and added to the ledger.

#### 4. Merge

**Intent**: The same PR as G5 (it also brings the predecessor's Phases 1–3). The owner merges, and only after G5
is green or the owner has decided on a G5 that is not.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run typecheck`, `npm run lint` in `packages/code-reviewer`; `npm run format:check` at the root
- CI on the PR: `ci`, `integration`, `e2e`, `code-reviewer` green

#### Manual Verification:

- The owner deletes `OPENROUTER_REVIEW_MODEL` before G5; its absence and the time are recorded in `gate.md`
- G5 run link, the logged finder model and its finder-step providers recorded in `gate.md` (or `not measured
(budget)` / not green with the owner's decision)
- The owner merges (blocked by a G5 that is not green or not measured until the owner decides)

---

## Testing Strategy

### Unit Tests:

- `finder-gate-core.test.mjs`, `promptfoo-gate-rows.test.mjs`, `hand-read-sample.test.mjs` as listed in
  Phase 1 — every degenerate case in Definitions (N = 0, N ≤ 19, 11 rows, one leak per channel, null cost,
  provider mismatch, 429) has a named test.

### Integration Tests:

- None automated: the gate itself is the integration test, and it is paid. G5 is the live check.

### Manual Testing Steps:

1. Owner approves the Pre-registration (0.5); the agent seals, commits and pushes it (0.6).
2. Owner confirms each budget stop and any G4-only pause.
3. Owner approves merge tables and every sampled classification; records 4.4.
4. Owner deletes `OPENROUTER_REVIEW_MODEL` immediately before G5 and does not restore it; merges.

## Performance Considerations

Latency is reported, not gated (archived: Novita #269 median 98.6 s). A timeout (300 s) is a G1/G2 failure.

## Migration Notes

None until Phase 4. Rollback of Phase 4 = revert the two code pointers; re-creating `OPENROUTER_REVIEW_MODEL`
as an emergency override is possible but needs a separate owner decision.

## References

- Research: `context/changes/finder-model-swap/research.md`
- Archived gate: `context/archive/2026-09-24-finder-serialization-outage/gate.md`, `hand-read-269.md`, `plan.md` (Phase 4)
- Prior model study: `context/archive/2026-08-10-finder-tool-loop-evals/decision.md`
- Lessons applied (32 of 37 apply to `plan`; the binding ones): "an offline eval proves capability exists…",
  "a guard metric that only exists on success…", "a check that cannot say what it found…", "writing a fact into
  its canonical home…", "a change's own cited evidence can be defective…"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 0: Pre-registration and inputs (no paid calls)

#### Automated

- [x] 0.1 The #269 diff reproduces: size 65,455 and the recorded sha256 prefix/suffix — 09ccd41
- [x] 0.2 The rules reproduce at 2,929 bytes and the worktree's HEAD is fca2778 — 09ccd41
- [x] 0.3 clean-change.diff unchanged since the archived run — 09ccd41
- [x] 0.4 gate.md has a Pre-registration section and no Results section — 09ccd41

#### Manual

- [x] 0.5 The owner approves the Pre-registration before Phase 2
- [x] 0.6 Seal sha256 matches, the commit is on origin and GitHub's push time is recorded before any paid call

### Phase 1: Gate tooling (no network)

#### Automated

- [x] 1.1 Package tests pass — 7b49836
- [x] 1.2 Package typecheck and lint pass — 7b49836
- [x] 1.3 Repo format check passes — 7b49836
- [x] 1.4 The runner refuses to start without --model — 7b49836

#### Manual

- [ ] 1.5 Reviewer agrees --through/--append cannot add or re-run a G2 attempt

### Phase 2: Measurement (paid)

#### Automated

- [x] 2.1 One JSONL line per attempt run; not-run attempts listed
- [x] 2.2 Every promptfoo run has exactly 12 rows or is recorded as failed
- [x] 2.3 The counter never exceeded T0 + 2.00

#### Manual

- [ ] 2.4 Owner confirms each $1.60 stop or G4-only pause
- [ ] 2.5 Every candidate has exactly one verdict label

### Phase 3: Hand-read and decision 4.4 (only for automated passers)

#### Automated

- [ ] 3.1 The recorded sample reproduces from the recorded sha and seed

#### Manual

- [ ] 3.2 Owner approved the merge table before the seed was written
- [ ] 3.3 Owner approved every sampled classification
- [ ] 3.4 Owner records decision 4.4

### Phase 4: Production (only after 4.4 admits a candidate)

#### Automated

- [ ] 4.1 Package test, typecheck, lint and root format check pass
- [ ] 4.2 PR CI checks green

#### Manual

- [ ] 4.3 Owner deletes OPENROUTER_REVIEW_MODEL before G5; absence recorded in gate.md
- [ ] 4.4 G5 run link, finder model and providers recorded in gate.md
- [ ] 4.5 Owner merges
